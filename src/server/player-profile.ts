import "server-only";

import { heute, tag } from "@/lib/absence";
import { REG_TEIL, TACTICAL_EVENTS, type EventKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { weekOrder } from "@/lib/iso-week";
import { getLayout } from "@/server/event-service";

/**
 * Alles über einen Spieler auf einmal.
 *
 * Bisher lag das über fünf Seiten verteilt: THP in der Rangliste, Einsätze in
 * der Fairness, die Wochen in der Historie, Fahrten im Zug, Notizen in der
 * Allianz-Verwaltung. Für die Frage "warum bin ich diese Woche draussen"
 * musste man alle fünf öffnen.
 */

export type ProfileWeek = { week: number; status: string | null };

export type ProfileEvent = {
  eventKey: EventKey;
  displayName: string;
  currentWeek: number;
  angemeldet: boolean;
  isFixplatz: boolean;
  gesperrtBis: number | null;
  banGrund: string | null;
  einsaetze: number;
  ausgesetzt: number;
  gefehlt: number;
  verfuegbar: number;
  /** Die letzten Wochen als Streifen, älteste zuerst. */
  verlauf: ProfileWeek[];
  /** Position in der laufenden Woche, falls eingeteilt. */
  aktuellePosition: { team: string | null; label: string; isSubstitute: boolean } | null;
};

export type PlayerProfile = {
  playerId: string;
  name: string;
  allianceTag: string;
  /** Profil-ID bei lastwarrank, für den Wochenverlauf. */
  lwrId: number | null;
  notes: string | null;
  thpRaw: string | null;
  thpUpdated: Date | null;
  serverRang: number | null;
  kaderRang: number | null;
  former: boolean;
  /** Spiel-Account gelöscht – der Spieler kommt nicht zurück. */
  accountGeloescht: boolean;
  external: boolean;
  /** Laufende oder angekündigte Abwesenheit, sonst null. */
  abwesend: { from: string; until: string | null; note: string | null } | null;
  /**
   * R2-Markierung. Wer im Spiel auf R2 steht, darf an Wüsten- und
   * Schluchtsturm nicht teilnehmen – das gehört neben den Anmeldestatus,
   * sonst liest man „nehme teil" und übersieht die Sperre.
   */
  r2: { seit: string; markiertVon: string | null } | null;
  /** Wie oft dieser Spieler schon einmal R2 war, abgeschlossene Zeiträume. */
  r2Frueher: number;
  /**
   * Frühere Namen, neueste Änderung zuerst.
   *
   * Wer im Spiel den Namen wechselt, ist in Ranglisten und Screenshots von
   * vorgestern nicht mehr wiederzufinden. Hier steht, wer er vorher war.
   */
  frühereNamen: { vorher: string; nachher: string; quelle: string; am: string }[];
  events: ProfileEvent[];
  zug: {
    isR4Rotation: boolean;
    gefahren: number;
    geplant: number;
    vip: number;
    zuletztGefahren: { year: number; kw: number } | null;
  } | null;
};

/** Wie viele Wochen der Verlaufsstreifen zurückreicht. */
const VERLAUF_WOCHEN = 16;

export async function getPlayerProfile(
  playerId: string,
  events: EventKey[],
  mitZug: boolean,
  /**
   * Führungsdaten mitliefern – Notizen und Sperrgründe. Für alle anderen
   * bleiben die Felder leer, und zwar hier und nicht erst in der Ansicht:
   * sonst stünden sie trotzdem in den Seitendaten, die der Browser bekommt.
   */
  mitFuehrungsdaten: boolean,
): Promise<PlayerProfile | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: {
      eventStates: true,
      registrations: true,
      zug: true,
      rotations: true,
      bans: { where: { active: true } },
      absences: { orderBy: { from: "asc" } },
      r2Records: { orderBy: { since: "desc" } },
      nameChanges: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!player) return null;

  const [rangEintrag, seasons, layouts, assignments, zugTage] = await Promise.all([
    prisma.thpRankingEntry.findFirst({ where: { playerId }, select: { rank: true, serverRank: true } }),
    prisma.season.findMany(),
    Promise.all(TACTICAL_EVENTS.map((e) => getLayout(e))),
    prisma.weeklyAssignment.findMany({ where: { playerId } }),
    mitZug
      ? prisma.zugDay.findMany({
          where: {
            OR: [
              { plannedDriverId: playerId },
              { actualDriverId: playerId },
              { vipPlayerId: playerId },
            ],
          },
          select: {
            plannedDriverId: true,
            actualDriverId: true,
            vipPlayerId: true,
            kw: { select: { year: true, kw: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const layoutVon = new Map(TACTICAL_EVENTS.map((e, i) => [e, layouts[i]]));
  const seasonVon = new Map(seasons.map((s) => [s.eventKey, s.currentWeek]));

  const profileEvents: ProfileEvent[] = TACTICAL_EVENTS.filter((e) =>
    events.includes(e),
  ).map((eventKey) => {
    const state = player.eventStates.find((s) => s.eventKey === eventKey);
    const reg = player.registrations.find((r) => r.eventKey === eventKey);
    const ban = player.bans.find((b) => b.eventKey === eventKey);
    const historie = player.rotations.filter((r) => r.eventKey === eventKey);
    const currentWeek = seasonVon.get(eventKey) ?? 1;

    const statusVon = new Map(historie.map((h) => [h.week, h.status]));
    const zaehle = (s: string) => historie.filter((h) => h.status === s).length;
    const einsaetze = zaehle("GESPIELT") + zaehle("BANK");
    const ausgesetzt = zaehle("AUSGESETZT");

    // Der Streifen endet mit der laufenden Woche und reicht so weit zurück,
    // wie die Saison hergibt.
    const ab = Math.max(1, currentWeek - VERLAUF_WOCHEN + 1);
    const verlauf: ProfileWeek[] = [];
    for (let w = ab; w <= currentWeek; w++) {
      verlauf.push({ week: w, status: statusVon.get(w) ?? null });
    }

    const zuteilung = assignments.find(
      (a) => a.eventKey === eventKey && a.week === currentWeek,
    );
    const gruppe = zuteilung?.positionKey
      ? layoutVon.get(eventKey)?.groups.find((g) => g.key === zuteilung.positionKey)
      : undefined;

    return {
      eventKey,
      displayName: layoutVon.get(eventKey)?.displayName ?? eventKey,
      currentWeek,
      angemeldet: reg?.status === REG_TEIL,
      isFixplatz: state?.isFixplatz ?? false,
      gesperrtBis: state?.isBanned ? (state.bannedUntil ?? null) : null,
      banGrund:
        mitFuehrungsdaten && state?.isBanned ? (state.banReason ?? null) : null,
      einsaetze,
      ausgesetzt,
      gefehlt: zaehle("FEHLT_ANGEMELDET"),
      verfuegbar: einsaetze + ausgesetzt,
      verlauf,
      aktuellePosition: zuteilung
        ? {
            team: zuteilung.team,
            label: gruppe?.label ?? (zuteilung.team ? "noch ohne Position" : "–"),
            isSubstitute: zuteilung.isSubstitute,
          }
        : null,
    };
  });

  let zug: PlayerProfile["zug"] = null;
  if (mitZug) {
    let zuletzt: { year: number; kw: number } | null = null;
    let gefahren = 0;
    let geplant = 0;
    let vip = 0;
    for (const t of zugTage) {
      if (t.plannedDriverId === playerId) geplant++;
      if (t.vipPlayerId === playerId) vip++;
      if (t.actualDriverId === playerId) {
        gefahren++;
        if (!zuletzt || weekOrder(t.kw) > weekOrder(zuletzt)) zuletzt = t.kw;
      }
    }
    zug = {
      isR4Rotation: player.zug?.isR4Rotation ?? false,
      gefahren,
      geplant,
      vip,
      zuletztGefahren: zuletzt,
    };
  }

  // Die nächste Abwesenheit, die noch nicht vorbei ist – laufend oder
  // angekündigt.
  const stichtag = heute();
  const offen = player.absences.find(
    (a) => a.until === null || tag(a.until) >= stichtag,
  );

  return {
    playerId: player.id,
    name: player.name,
    allianceTag: player.allianceTag,
    lwrId: player.lwrId,
    r2: (() => {
      const laufend = player.r2Records.find((r) => r.until === null);
      return laufend
        ? { seit: laufend.since.toISOString(), markiertVon: laufend.markedBy }
        : null;
    })(),
    r2Frueher: player.r2Records.filter((r) => r.until !== null).length,
    frühereNamen: player.nameChanges.map((n) => ({
      vorher: n.vorher,
      nachher: n.nachher,
      quelle: n.quelle,
      am: n.createdAt.toISOString(),
    })),
    notes: mitFuehrungsdaten ? player.notes : null,
    thpRaw: player.thpRaw,
    thpUpdated: player.thpUpdated,
    serverRang: rangEintrag?.serverRank ?? null,
    kaderRang: rangEintrag?.rank ?? null,
    former: player.leftAt !== null,
    accountGeloescht: player.accountDeletedAt !== null,
    external: player.isExternal,
    abwesend: offen
      ? {
          from: offen.from.toISOString(),
          until: offen.until ? offen.until.toISOString() : null,
          note: offen.note,
        }
      : null,
    events: profileEvents,
    zug,
  };
}
