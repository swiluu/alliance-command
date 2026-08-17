"use server";

import { ActionError } from "@/server/action-error";
import { revalidatePath } from "next/cache";

import { assertAccess } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import {
  BAN_AUTO_REASON,
  BAN_DURATION_WEEKS,
  MAX_FIXPLATZ,
  REG_NICHT_TEIL,
  REG_TEIL,
  ROTATION_STATUSES,
  isEventKey,
  type EventKey,
  type RotationStatus,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { runAction } from "@/server/action-result";
import { createBackup } from "@/server/backup-service";
import { getLayout, getSeason, syncExpiredBans } from "@/server/event-service";

function assertEvent(eventKey: string): asserts eventKey is EventKey {
  if (!isEventKey(eventKey)) throw new ActionError("unknownEvent", { event: eventKey });
}

function revalidateEvent(eventKey: EventKey) {
  revalidatePath(`/${eventKey}`, "layout");
  revalidatePath("/uebersicht");
}

// ── Anmeldung & Event-Status ────────────────────────────────
// Stammdaten (anlegen, löschen, umbenennen, ersetzen, Notizen) liegen
// bewusst NICHT hier, sondern in player-actions.ts unter dem Modul
// "allianz" – sie wirken über alle Module hinweg.

export async function toggleRegistration(eventKey: string, playerId: string) {
  return runAction(async () => {
    assertEvent(eventKey);
    const user = await assertAccess(eventKey, "EDIT");

    const state = await prisma.playerEventState.findUnique({
      where: { playerId_eventKey: { playerId, eventKey } },
    });
    // Serverseitig erzwungen: gesperrte Spieler ändern ihren Status nicht.
    if (state?.isBanned) {
      throw new ActionError("bannedCannotRegister");
    }

    const current = await prisma.registrationStatus.findUnique({
      where: { playerId_eventKey: { playerId, eventKey } },
    });
    const next = current?.status === REG_TEIL ? REG_NICHT_TEIL : REG_TEIL;

    await prisma.registrationStatus.upsert({
      where: { playerId_eventKey: { playerId, eventKey } },
      create: { playerId, eventKey, status: next },
      update: { status: next },
    });

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    await logActivity(user, next === REG_TEIL ? "Angemeldet" : "Abgemeldet", {
      module: eventKey,
      detail: player?.name,
    });
    revalidateEvent(eventKey);
  });
}

export async function toggleFixplatz(eventKey: string, playerId: string) {
  return runAction(async () => {
    assertEvent(eventKey);
    const user = await assertAccess(eventKey, "EDIT");

    const state = await prisma.playerEventState.findUnique({
      where: { playerId_eventKey: { playerId, eventKey } },
    });
    const next = !state?.isFixplatz;

    if (next) {
      const count = await prisma.playerEventState.count({
        where: { eventKey, isFixplatz: true },
      });
      if (count >= MAX_FIXPLATZ) throw new ActionError("maxFixSeats", { max: MAX_FIXPLATZ });
    }

    await prisma.playerEventState.upsert({
      where: { playerId_eventKey: { playerId, eventKey } },
      create: { playerId, eventKey, isFixplatz: next },
      update: { isFixplatz: next },
    });

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    await logActivity(user, next ? "Fixplatz gesetzt" : "Fixplatz entfernt", {
      module: eventKey,
      detail: player?.name,
    });
    revalidateEvent(eventKey);
  });
}

export async function toggleHunterBuild(eventKey: string, playerId: string) {
  return runAction(async () => {
    assertEvent(eventKey);
    const user = await assertAccess(eventKey, "EDIT");

    const state = await prisma.playerEventState.findUnique({
      where: { playerId_eventKey: { playerId, eventKey } },
    });
    const next = !state?.isHunterBuild;

    await prisma.playerEventState.upsert({
      where: { playerId_eventKey: { playerId, eventKey } },
      create: { playerId, eventKey, isHunterBuild: next },
      update: { isHunterBuild: next },
    });

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    await logActivity(user, next ? "Jäger-Build markiert" : "Jäger-Build entfernt", {
      module: eventKey,
      detail: player?.name,
    });
    revalidateEvent(eventKey);
  });
}

// ── Battle-Map ──────────────────────────────────────────────

/**
 * Setzt einen Spieler auf einen Slot. War der Slot besetzt, wandert der
 * bisherige Spieler zurück in den Pool; ein bereits woanders eingeteilter
 * Spieler wird von dort entfernt (ein Spieler steht nur einmal im Kader).
 */
export async function assignToSlot(
  eventKey: string,
  playerId: string,
  team: "A" | "B",
  positionKey: string,
  slotIndex: number,
) {
  return runAction(async () => {
    assertEvent(eventKey);
    const user = await assertAccess(eventKey, "EDIT");

    const season = await getSeason(eventKey);
    const layout = await getLayout(eventKey);
    const group = layout.groups.find((g) => g.key === positionKey);
    if (!group) throw new ActionError("unknownPosition", { position: positionKey });
    if (slotIndex < 0 || slotIndex >= group.slots) {
      throw new ActionError("slotMissing", { slot: slotIndex + 1, group: group.label });
    }

    const state = await prisma.playerEventState.findUnique({
      where: { playerId_eventKey: { playerId, eventKey } },
    });
    if (state?.isBanned) throw new ActionError("bannedNotAssignable");

    const reg = await prisma.registrationStatus.findUnique({
      where: { playerId_eventKey: { playerId, eventKey } },
    });
    if (reg?.status !== REG_TEIL) {
      throw new ActionError("onlyRegistered");
    }

    await prisma.$transaction([
      // Der bisherige Slot-Inhaber verliert nur die Position, nicht sein Team –
      // er landet im Team-Kader und nicht versehentlich bei den Aussetzern.
      prisma.weeklyAssignment.updateMany({
        where: { eventKey, week: season.currentWeek, team, positionKey, slotIndex },
        data: { positionKey: null, slotIndex: null, isSubstitute: false },
      }),
      // Bisherige Zuteilung des Spielers lösen (er kann aus dem anderen Team kommen)
      prisma.weeklyAssignment.deleteMany({
        where: { eventKey, week: season.currentWeek, playerId },
      }),
      prisma.weeklyAssignment.create({
        data: {
          playerId,
          eventKey,
          week: season.currentWeek,
          team,
          positionKey,
          slotIndex,
          isSubstitute: group.isSubstitute ?? false,
        },
      }),
    ]);

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    await logActivity(user, "Aufstellung geändert", {
      module: eventKey,
      detail: `${player?.name} → Team ${team} · ${group.label} #${slotIndex + 1}`,
    });
    revalidateEvent(eventKey);
  });
}

/**
 * Position freigeben. Der Spieler bleibt in seinem Team und rutscht in den
 * Team-Kader zurück – aus dem Kader nimmt ihn nur die Team-Zuteilung ("–").
 */
export async function clearSlot(
  eventKey: string,
  team: "A" | "B",
  positionKey: string,
  slotIndex: number,
) {
  return runAction(async () => {
    assertEvent(eventKey);
    const user = await assertAccess(eventKey, "EDIT");
    const season = await getSeason(eventKey);

    const existing = await prisma.weeklyAssignment.findFirst({
      where: { eventKey, week: season.currentWeek, team, positionKey, slotIndex },
      include: { player: true },
    });
    if (!existing) return;

    await prisma.weeklyAssignment.update({
      where: { id: existing.id },
      data: { positionKey: null, slotIndex: null, isSubstitute: false },
    });
    await logActivity(user, "Position freigegeben", {
      module: eventKey,
      detail: `${existing.player.name} von Team ${team} · ${positionKey} #${slotIndex + 1}`,
    });
    revalidateEvent(eventKey);
  });
}

/**
 * Team-Zuteilung: Team A, Team B oder `null` = aussetzen.
 *
 * "Aussetzen" heisst schlicht keine Zuteilung – beim Wochenabschluss landet der
 * Spieler dadurch als "Ausgesetzt" in der Rotations-Historie und zählt nicht
 * als Teilnahme. Ein Teamwechsel gibt die bisherige Position frei, weil
 * Positionen immer zu genau einem Team gehören.
 */
export async function setTeamAssignment(
  eventKey: string,
  playerId: string,
  team: "A" | "B" | null,
) {
  return runAction(async () => {
    assertEvent(eventKey);
    const user = await assertAccess(eventKey, "EDIT");
    const season = await getSeason(eventKey);
    const week = season.currentWeek;

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new ActionError("playerNotFound");

    if (team === null) {
      await prisma.weeklyAssignment.deleteMany({ where: { eventKey, week, playerId } });
      await logActivity(user, "Setzt aus", { module: eventKey, detail: player.name });
      revalidateEvent(eventKey);
      return;
    }

    const state = await prisma.playerEventState.findUnique({
      where: { playerId_eventKey: { playerId, eventKey } },
    });
    if (state?.isBanned) throw new ActionError("bannedNotAssignable");

    const reg = await prisma.registrationStatus.findUnique({
      where: { playerId_eventKey: { playerId, eventKey } },
    });
    if (reg?.status !== REG_TEIL) {
      throw new ActionError("onlyRegistered");
    }

    const existing = await prisma.weeklyAssignment.findFirst({
      where: { eventKey, week, playerId },
    });
    // Nur abbrechen, wenn wirklich nichts zu tun ist. Steht der Spieler schon
    // im selben Team, aber auf einer Position, muss die Position frei werden –
    // sonst behauptet die Oberfläche einen Stand, den der Server nicht hat.
    if (existing?.team === team && existing.positionKey === null) return;

    await prisma.$transaction([
      prisma.weeklyAssignment.deleteMany({ where: { eventKey, week, playerId } }),
      prisma.weeklyAssignment.create({
        data: { playerId, eventKey, week, team, positionKey: null, slotIndex: null },
      }),
    ]);

    await logActivity(user, `Team ${team} zugeteilt`, {
      module: eventKey,
      detail: player.name,
    });
    revalidateEvent(eventKey);
  });
}

// ── Rotations-Historie ──────────────────────────────────────

export async function setRotationStatus(
  eventKey: string,
  playerId: string,
  week: number,
  status: string,
) {
  return runAction(async () => {
    assertEvent(eventKey);
    const user = await assertAccess(eventKey, "EDIT");

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new ActionError("playerNotFound");

    if (status === "") {
      await prisma.rotationHistory.deleteMany({ where: { playerId, eventKey, week } });
    } else {
      if (!(ROTATION_STATUSES as readonly string[]).includes(status)) {
        throw new ActionError("unknownStatus", { status });
      }
      await prisma.rotationHistory.upsert({
        where: { playerId_eventKey_week: { playerId, eventKey, week } },
        create: { playerId, eventKey, week, status },
        update: { status },
      });
    }

    await logActivity(user, "Historie geändert", {
      module: eventKey,
      detail: `${player.name} · Woche ${week} → ${status || "kein Kader"}`,
    });
    revalidateEvent(eventKey);
  });
}

// ── Woche abschliessen ──────────────────────────────────────

/**
 * Ablauf exakt nach Abschnitt 5.5: Aufstellung in die Historie schreiben,
 * Woche hochzählen, Banns vergeben, Aufstellung und Anmeldungen zurücksetzen.
 */
export async function closeWeek(eventKey: string) {
  return runAction(async () => {
    assertEvent(eventKey);
    const user = await assertAccess(eventKey, "EDIT");

    const season = await getSeason(eventKey);
    const week = season.currentWeek;
    const layout = await getLayout(eventKey);
    if (week >= layout.totalWeeks) {
      throw new ActionError("seasonEnds", { week: layout.totalWeeks });
    }

    const [players, assignments, regs, states, existingHistory] = await Promise.all([
      prisma.player.findMany({ where: { isExternal: false }, select: { id: true } }),
      prisma.weeklyAssignment.findMany({ where: { eventKey, week } }),
      prisma.registrationStatus.findMany({ where: { eventKey } }),
      prisma.playerEventState.findMany({ where: { eventKey } }),
      prisma.rotationHistory.findMany({ where: { eventKey, week } }),
    ]);

    const assignedTeam = new Map(assignments.map((a) => [a.playerId, a.team]));
    const regMap = new Map(regs.map((r) => [r.playerId, r.status]));
    const bannedSet = new Set(states.filter((s) => s.isBanned).map((s) => s.playerId));
    // Manuell gesetztes "Fehlt (angemeldet)" bleibt stehen und löst den Bann aus.
    const missing = existingHistory
      .filter((h) => h.status === "FEHLT_ANGEMELDET")
      .map((h) => h.playerId);
    const missingSet = new Set(missing);

    const rows: { playerId: string; status: RotationStatus }[] = [];
    for (const p of players) {
      if (missingSet.has(p.id)) continue; // bleibt unverändert
      if (bannedSet.has(p.id)) continue; // gesperrt = kein Kader, kein Eintrag

      if (assignedTeam.has(p.id)) {
        const team = assignedTeam.get(p.id);
        rows.push({ playerId: p.id, status: team ? "GESPIELT" : "BANK" });
      } else if (regMap.get(p.id) === REG_TEIL) {
        rows.push({ playerId: p.id, status: "AUSGESETZT" });
      } else {
        rows.push({ playerId: p.id, status: "NICHT_DABEI" });
      }
    }

    const nextWeek = week + 1;
    const expiresWeek = week + BAN_DURATION_WEEKS;

    // Sicherung VOR dem Abschluss: das ist der Punkt, auf den man zurück will,
    // falls die Woche versehentlich abgeschlossen wurde. Der Stand danach ist
    // ohnehin der laufende. Schlägt sie fehl, läuft der Abschluss trotzdem.
    const backup = await createBackup(`${eventKey}-kw${week}`);

    await prisma.$transaction([
      // 1. Historie schreiben
      ...rows.map((r) =>
        prisma.rotationHistory.upsert({
          where: { playerId_eventKey_week: { playerId: r.playerId, eventKey, week } },
          create: { playerId: r.playerId, eventKey, week, status: r.status },
          update: { status: r.status },
        }),
      ),
      // 2. Woche hochzählen
      prisma.season.update({ where: { eventKey }, data: { currentWeek: nextWeek } }),
      // 3. Banns für "Fehlt (angemeldet)"
      ...missing.flatMap((playerId) => [
        prisma.banRecord.create({
          data: {
            playerId,
            eventKey,
            bannedInWeek: week,
            expiresWeek,
            reason: BAN_AUTO_REASON,
            active: true,
          },
        }),
        // upsert statt update: fehlt die Zustandszeile, würde ein update den
        // gesamten Wochenabschluss abbrechen.
        prisma.playerEventState.upsert({
          where: { playerId_eventKey: { playerId, eventKey } },
          create: {
            playerId,
            eventKey,
            isBanned: true,
            bannedSince: week,
            bannedUntil: expiresWeek,
            banReason: BAN_AUTO_REASON,
          },
          update: {
            isBanned: true,
            bannedSince: week,
            bannedUntil: expiresWeek,
            banReason: BAN_AUTO_REASON,
          },
        }),
      ]),
      // 4. Aufstellung der neuen Woche leeren
      prisma.weeklyAssignment.deleteMany({ where: { eventKey, week: nextWeek } }),
      // 5. Anmeldungen zurücksetzen
      prisma.registrationStatus.updateMany({
        where: { eventKey },
        data: { status: REG_NICHT_TEIL },
      }),
    ]);

    // 6. Abgelaufene Banns fallen lassen (Prioritäten sind abgeleitet und
    //    berechnen sich beim nächsten Read von selbst neu).
    await syncExpiredBans(eventKey, nextWeek);

    await logActivity(user, "Woche abgeschlossen", {
      module: eventKey,
      detail:
        `Woche ${week} → ${nextWeek}` +
        (missing.length ? ` · ${missing.length} Bann(e) vergeben` : "") +
        (backup ? ` · Sicherung ${backup}` : " · Sicherung fehlgeschlagen"),
    });
    revalidateEvent(eventKey);
    revalidatePath("/backup");
  });
}

/**
 * Raus↔Rein: legt fest, welchen Spieler ein Ersatzspieler ablöst.
 * Im Original-Sheet ist das die Spalte "Rotation" neben der Ersatzbank.
 *
 * `replacesPlayerId = null` löst die Paarung wieder.
 */
export async function setSubstitutePair(
  eventKey: string,
  substitutePlayerId: string,
  replacesPlayerId: string | null,
) {
  return runAction(async () => {
    assertEvent(eventKey);
    const user = await assertAccess(eventKey, "EDIT");
    const season = await getSeason(eventKey);
    const week = season.currentWeek;

    const sub = await prisma.weeklyAssignment.findFirst({
      where: { eventKey, week, playerId: substitutePlayerId, isSubstitute: true },
      include: { player: { select: { name: true } } },
    });
    if (!sub) throw new ActionError("notOnBench");

    let replacedName: string | null = null;
    if (replacesPlayerId) {
      const target = await prisma.weeklyAssignment.findFirst({
        where: { eventKey, week, playerId: replacesPlayerId },
        include: { player: { select: { name: true } } },
      });
      if (!target) throw new ActionError("replacedNotAssigned");
      if (target.isSubstitute) {
        throw new ActionError("subCannotReplaceSub");
      }
      if (target.team !== sub.team) {
        throw new ActionError("sameTeamRequired");
      }
      replacedName = target.player.name;

      // Jeder Hauptspieler wird höchstens einmal abgelöst.
      await prisma.weeklyAssignment.updateMany({
        where: {
          eventKey,
          week,
          isSubstitute: true,
          replacesPlayerId,
          NOT: { id: sub.id },
        },
        data: { replacesPlayerId: null },
      });
    }

    await prisma.weeklyAssignment.update({
      where: { id: sub.id },
      data: { replacesPlayerId },
    });

    await logActivity(user, replacesPlayerId ? "Rotation gesetzt" : "Rotation gelöst", {
      module: eventKey,
      detail: replacedName
        ? `Raus: ${replacedName} · Rein: ${sub.player.name}`
        : sub.player.name,
    });
    revalidateEvent(eventKey);
  });
}
