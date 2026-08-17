import "server-only";

import { heute, tag } from "@/lib/absence";
import { REG_TEIL, type EventKey } from "@/lib/constants";
import { KADER, prisma } from "@/lib/db";
import { EVENT_LAYOUTS, parseLayout, type PositionGroup } from "@/lib/event-layouts";
import {
  computePriority,
  PARTICIPATION_STATUSES,
  SKIP_STATUS,
  priorityTag,
} from "@/lib/priority";

export type PoolPlayer = {
  playerId: string;
  name: string;
  allianceTag: string;
  thpRaw: string | null;
  /** Zahlenwert zum Sortieren – "211.05M" liesse sich nur raten. */
  thpValue: number | null;
  isFixplatz: boolean;
  isBanned: boolean;
  isHunterBuild: boolean;
  lastWeek: number;
  /** Höchste Woche mit Status "Ausgesetzt"; 0 = noch nie ausgesetzt. */
  lastSkippedWeek: number;
  score: number;
  tag: ReturnType<typeof priorityTag>;
};

export type AssignmentRow = {
  id: string;
  playerId: string;
  playerName: string;
  thpRaw: string | null;
  /** Zahlenwert zum Sortieren – unabhängig davon, ob der Spieler im Pool steht. */
  thpValue: number | null;
  team: "A" | "B" | null;
  positionKey: string | null;
  slotIndex: number | null;
  isSubstitute: boolean;
  /** Nur für Ersatz-Slots: wen dieser Spieler ersetzt (Raus↔Rein). */
  replacesPlayerId: string | null;
  replacesName: string | null;
  isHunterBuild: boolean;
};

/** Aktuelle Woche des Events; legt die Season beim ersten Zugriff an. */
export async function getSeason(eventKey: EventKey) {
  const season = await prisma.season.findUnique({ where: { eventKey } });
  if (season) return season;
  return prisma.season.create({ data: { eventKey, currentWeek: 1 } });
}

/** Positionslayout aus der DB, mit dem Code-Layout als Fallback. */
export async function getLayout(eventKey: EventKey): Promise<{
  displayName: string;
  totalWeeks: number;
  groups: PositionGroup[];
}> {
  const cfg = await prisma.eventConfig.findUnique({ where: { eventKey } });
  const fallback = EVENT_LAYOUTS[eventKey];
  if (!cfg) {
    return {
      displayName: fallback.displayName,
      totalWeeks: fallback.totalWeeks,
      groups: fallback.groups,
    };
  }
  return {
    displayName: cfg.displayName,
    totalWeeks: cfg.totalWeeks,
    groups: parseLayout(cfg.positionLayout),
  };
}

/**
 * Lässt abgelaufene Banns fallen: sobald `currentWeek > expiresWeek`, ist der
 * Spieler wieder frei. Läuft bei jedem Read, ein Cronjob ist dafür nicht nötig.
 */
export async function syncExpiredBans(eventKey: EventKey, currentWeek: number) {
  const expired = await prisma.banRecord.findMany({
    where: { eventKey, active: true, expiresWeek: { lt: currentWeek } },
  });
  if (expired.length === 0) return;

  await prisma.$transaction([
    prisma.banRecord.updateMany({
      where: { id: { in: expired.map((b) => b.id) } },
      data: { active: false },
    }),
    prisma.playerEventState.updateMany({
      where: { eventKey, playerId: { in: expired.map((b) => b.playerId) } },
      data: { isBanned: false, bannedSince: null, bannedUntil: null, banReason: null },
    }),
  ]);
}

/** Legt fehlende Zustandszeilen an, damit jeder Spieler in jedem Event auftaucht. */
export async function ensurePlayerStates(eventKey: EventKey) {
  const [players, states, regs] = await Promise.all([
    prisma.player.findMany({ where: KADER, select: { id: true } }),
    prisma.playerEventState.findMany({ where: { eventKey }, select: { playerId: true } }),
    prisma.registrationStatus.findMany({ where: { eventKey }, select: { playerId: true } }),
  ]);

  const haveState = new Set(states.map((s) => s.playerId));
  const haveReg = new Set(regs.map((r) => r.playerId));

  const missingStates = players.filter((p) => !haveState.has(p.id));
  const missingRegs = players.filter((p) => !haveReg.has(p.id));

  // Bewusst upsert statt createMany: SQLite kennt kein `skipDuplicates`, und
  // zwei gleichzeitige Seitenaufrufe würden sich sonst am Unique-Index
  // gegenseitig abschiessen. Der Normalfall ist eine leere Liste.
  for (const p of missingStates) {
    await prisma.playerEventState.upsert({
      where: { playerId_eventKey: { playerId: p.id, eventKey } },
      create: { playerId: p.id, eventKey },
      update: {},
    });
  }
  for (const p of missingRegs) {
    await prisma.registrationStatus.upsert({
      where: { playerId_eventKey: { playerId: p.id, eventKey } },
      create: { playerId: p.id, eventKey },
      update: {},
    });
  }
}

export type PlayerRow = {
  playerId: string;
  name: string;
  allianceTag: string;
  notes: string | null;
  registered: boolean;
  isBanned: boolean;
  bannedUntil: number | null;
  banReason: string | null;
  isFixplatz: boolean;
  isHunterBuild: boolean;
  /** Im Spiel auf R2 zurückgestuft – darf nicht teilnehmen, siehe Player. */
  isR2: boolean;
  /**
   * Laufende oder angekündigte Abwesenheit.
   *
   * Gehört genau hierher: die Entscheidung über Teilnahme fällt in dieser
   * Liste, und wer im Urlaub ist, soll nicht erst beim Aufstellen auffallen.
   */
  abwesend: { from: string; until: string | null; note: string | null } | null;
  thpRaw: string | null;
};

/** Spielerliste eines Events inkl. Anmelde-, Bann- und R2-Status. */
export async function getPlayerRows(
  eventKey: EventKey,
  /** Notizen sind Führungsdaten – ohne R4-Rang werden sie gar nicht erst
   *  mitgeschickt. Standardmässig aus, damit ein vergessener Aufruf nichts
   *  ausplaudert. */
  zeigtNotizen = false,
): Promise<PlayerRow[]> {
  const players = await prisma.player.findMany({
    where: KADER,
    orderBy: { name: "asc" },
    include: {
      eventStates: { where: { eventKey } },
      registrations: { where: { eventKey } },
      // Ein offener Eintrag heisst: ist gerade R2.
      r2Records: { where: { until: null }, take: 1, select: { id: true } },
      // Laufende und angekündigte Abwesenheiten, älteste zuerst – die erste
      // noch nicht abgelaufene ist die massgebliche.
      absences: { orderBy: { from: "asc" } },
    },
  });

  const stichtag = heute();

  return players.map((p) => {
    const st = p.eventStates[0];
    const reg = p.registrations[0];
    const offen = p.absences.find((a) => a.until === null || tag(a.until) >= stichtag);
    return {
      playerId: p.id,
      name: p.name,
      allianceTag: p.allianceTag,
      notes: zeigtNotizen ? p.notes : null,
      registered: reg?.status === REG_TEIL,
      isBanned: st?.isBanned ?? false,
      bannedUntil: st?.bannedUntil ?? null,
      banReason: st?.banReason ?? null,
      isFixplatz: st?.isFixplatz ?? false,
      isHunterBuild: st?.isHunterBuild ?? false,
      isR2: p.r2Records.length > 0,
      abwesend: offen
        ? {
            from: offen.from.toISOString(),
            until: offen.until ? offen.until.toISOString() : null,
            note: offen.note,
          }
        : null,
      thpRaw: p.thpRaw,
    };
  });
}

/**
 * Spielerpool der Wochenplanung: angemeldet, nicht gebannt, sortiert nach
 * Priorität. Bereits zugeteilte Spieler filtert die UI heraus.
 */
export async function getPool(eventKey: EventKey, currentWeek: number): Promise<PoolPlayer[]> {
  // Für die Priorität zählt nur die höchste Woche mit echter Teilnahme.
  // Das direkt in SQL aggregieren, statt die ganze Historie zu laden – sie
  // wächst mit jeder Woche um rund 100 Zeilen pro Event.
  const [players, lastWeeks, lastSkips] = await Promise.all([
    prisma.player.findMany({
      where: KADER,
      include: {
        eventStates: { where: { eventKey } },
        registrations: { where: { eventKey } },
      },
    }),
    prisma.rotationHistory.groupBy({
      by: ["playerId"],
      where: { eventKey, status: { in: [...PARTICIPATION_STATUSES] } },
      _max: { week: true },
    }),
    // Wann zuletzt ausgesetzt – rein informativ für die Team-Zuteilung, damit
    // der Koordinator das Aussetzen fair verteilen kann. Zählt bewusst NICHT
    // in die Priorität.
    prisma.rotationHistory.groupBy({
      by: ["playerId"],
      where: { eventKey, status: SKIP_STATUS },
      _max: { week: true },
    }),
  ]);

  const lastWeekById = new Map(lastWeeks.map((r) => [r.playerId, r._max?.week ?? 0]));
  const lastSkipById = new Map(lastSkips.map((r) => [r.playerId, r._max?.week ?? 0]));

  const pool = players
    .filter((p) => p.registrations[0]?.status === REG_TEIL)
    .filter((p) => !p.eventStates[0]?.isBanned)
    .map((p) => {
      const st = p.eventStates[0];
      const lastWeek = lastWeekById.get(p.id) ?? 0;
      const lastSkippedWeek = lastSkipById.get(p.id) ?? 0;
      const score = computePriority({
        currentWeek,
        lastWeek,
        isFixplatz: st?.isFixplatz ?? false,
        isBanned: false,
      });
      return {
        playerId: p.id,
        name: p.name,
        allianceTag: p.allianceTag,
        thpRaw: p.thpRaw,
        thpValue: p.thpValue,
        isFixplatz: st?.isFixplatz ?? false,
        isBanned: false,
        isHunterBuild: st?.isHunterBuild ?? false,
        lastWeek,
        lastSkippedWeek,
        score,
        tag: priorityTag(score),
      };
    });

  pool.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, "de"));
  return pool;
}

export async function getAssignments(
  eventKey: EventKey,
  week: number,
): Promise<AssignmentRow[]> {
  const rows = await prisma.weeklyAssignment.findMany({
    where: { eventKey, week },
    include: {
      player: { include: { eventStates: { where: { eventKey } } } },
      replaces: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    playerId: r.playerId,
    playerName: r.player.name,
    thpRaw: r.player.thpRaw,
    thpValue: r.player.thpValue,
    team: (r.team as "A" | "B" | null) ?? null,
    positionKey: r.positionKey,
    slotIndex: r.slotIndex,
    isSubstitute: r.isSubstitute,
    replacesPlayerId: r.replacesPlayerId,
    replacesName: r.replaces?.name ?? null,
    isHunterBuild: r.player.eventStates[0]?.isHunterBuild ?? false,
  }));
}

export async function getStats(eventKey: EventKey, slotsTotal: number) {
  const [teil, gesamt, gesperrt] = await Promise.all([
    prisma.registrationStatus.count({
      where: { eventKey, status: REG_TEIL, player: KADER },
    }),
    prisma.player.count({ where: KADER }),
    prisma.playerEventState.count({
      where: { eventKey, isBanned: true, player: KADER },
    }),
  ]);
  return {
    teil,
    nichtTeil: gesamt - teil,
    gesperrt,
    gesamt,
    ueberschuss: teil - slotsTotal,
  };
}
