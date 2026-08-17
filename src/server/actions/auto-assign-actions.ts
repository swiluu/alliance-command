"use server";

import { ActionError } from "@/server/action-error";
import { revalidatePath } from "next/cache";

import { assertAccess } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { isEventKey, type EventKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { runAction } from "@/server/action-result";
import { planAutoAssignment } from "@/server/auto-assign";
import { getSeason } from "@/server/event-service";

function revalidateEvent(eventKey: EventKey) {
  revalidatePath(`/${eventKey}`, "layout");
  revalidatePath("/uebersicht");
}

function assertEvent(eventKey: string): asserts eventKey is EventKey {
  if (!isEventKey(eventKey)) throw new ActionError("unknownEvent", { event: eventKey });
}

/** Vorschlag berechnen, ohne etwas zu speichern. */
export async function previewAutoAssign(eventKey: string) {
  return runAction(async () => {
    assertEvent(eventKey);
    await assertAccess(eventKey, "EDIT");
    const season = await getSeason(eventKey);
    return planAutoAssignment(eventKey, season.currentWeek);
  });
}

/**
 * Vorschlag übernehmen.
 *
 * Setzt ausschliesslich Position und Slot bereits zugeteilter Spieler um. Die
 * Team-Zuteilung selbst bleibt unangetastet: wer in Team A steht, bleibt in
 * Team A, und wer aussetzt, wird nicht heimlich eingewechselt.
 */
export async function applyAutoAssign(eventKey: string) {
  return runAction(async () => {
    assertEvent(eventKey);
    const user = await assertAccess(eventKey, "EDIT");
    const season = await getSeason(eventKey);
    const week = season.currentWeek;

    const plan = await planAutoAssignment(eventKey, week);

    await prisma.$transaction(async (tx) => {
      // Erst alle Positionen der Woche leeren, sonst kollidiert die
      // Eindeutigkeit von (Event, Woche, Team, Position, Slot) mit dem alten
      // Stand, während das Neue geschrieben wird.
      await tx.weeklyAssignment.updateMany({
        where: { eventKey, week, team: { not: null } },
        data: {
          positionKey: null,
          slotIndex: null,
          isSubstitute: false,
          replacesPlayerId: null,
        },
      });

      for (const team of plan.teams) {
        for (const slot of team.slots) {
          if (!slot.playerId) continue;
          await tx.weeklyAssignment.updateMany({
            where: { eventKey, week, playerId: slot.playerId },
            data: {
              positionKey: slot.positionKey,
              slotIndex: slot.slotIndex,
              isSubstitute: false,
            },
          });
        }
        const partner = new Map(team.swaps.map((w) => [w.inPlayerId, w.outPlayerId]));
        for (const [i, b] of team.bench.entries()) {
          await tx.weeklyAssignment.updateMany({
            where: { eventKey, week, playerId: b.playerId },
            data: {
              positionKey: "ersatz",
              slotIndex: i,
              isSubstitute: true,
              replacesPlayerId: partner.get(b.playerId) ?? null,
            },
          });
        }
      }
    });

    const besetzt = plan.teams.reduce(
      (n, t) => n + t.slots.filter((s) => s.playerId).length,
      0,
    );
    const bank = plan.teams.reduce((n, t) => n + t.bench.length, 0);
    const wechsel = plan.teams.reduce((n, t) => n + t.swaps.length, 0);

    await logActivity(user, "Automatisch zugeteilt", {
      module: eventKey,
      detail:
        `Woche ${week}: ${besetzt} Positionen, ${bank} auf der Ersatzbank, ` +
        `${wechsel} Wechsel-Paarungen`,
    });

    revalidateEvent(eventKey);
    return plan;
  });
}
