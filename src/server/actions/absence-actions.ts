"use server";

import { ActionError } from "@/server/action-error";
import { revalidatePath } from "next/cache";

import { getAccessLevel, hasAtLeast, requireUser } from "@/lib/access";
import { heute, tag } from "@/lib/absence";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { meldeAbwesenheit, meldeRueckkehr } from "@/server/absence-notify";
import { runAction } from "@/server/action-result";

/**
 * Wer darf für diesen Spieler melden?
 *
 * Jeder für sich selbst – das ist der Sinn der Sache: Spieler melden sich ab,
 * statt dass jemand es für sie einträgt.
 *
 * Dazu die Allianz-Verwaltung und der R4-Rang für alle anderen. Der Grund ist
 * die Praxis: nicht jeder meldet sich im Dashboard ab, viele sagen es ihrem R4
 * im Spiel oder im Chat. Ohne diesen Weg bliebe die Abwesenheit dort
 * unsichtbar, und die Wochenplanung stellte jemanden auf, der gar nicht da ist.
 */
async function darfMelden(playerId: string) {
  const user = await requireUser();
  if (user.playerId === playerId) return user;
  if (user.isR4) return user;

  const level = await getAccessLevel(user, "allianz");
  if (!hasAtLeast(level, "EDIT")) {
    throw new ActionError("selfOnly");
  }
  return user;
}

function revalidateAll() {
  revalidatePath("/abwesenheit");
  revalidatePath("/uebersicht");
  revalidatePath("/spieler", "layout");
}

/** "2026-08-12" → Mitternacht UTC. Leere Angabe ergibt null. */
function datum(wert: string | null | undefined): Date | null {
  if (!wert) return null;
  const d = new Date(`${wert}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new ActionError("invalidDate", { value: wert });
  return d;
}

export async function addAbsence(
  playerId: string,
  von: string,
  bis: string | null,
  note: string,
) {
  return runAction(async () => {
    const user = await darfMelden(playerId);

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { name: true },
    });
    if (!player) throw new ActionError("playerNotFound");

    const from = datum(von) ?? heute();
    const until = datum(bis);
    if (until && until < from) {
      throw new ActionError("endBeforeStart");
    }

    // Doppelte Meldungen für denselben Zeitraum bringen niemandem etwas und
    // machen die Liste unlesbar.
    const ueberschneidung = await prisma.absence.findFirst({
      where: {
        playerId,
        AND: [
          { OR: [{ until: null }, { until: { gte: from } }] },
          until ? { from: { lte: until } } : {},
        ],
      },
    });
    if (ueberschneidung) {
      throw new ActionError("absenceOverlap", { name: player.name });
    }

    await prisma.absence.create({
      data: {
        playerId,
        from,
        until,
        note: note.trim() || null,
        createdBy: user.displayName,
      },
    });

    await logActivity(user, "Abwesenheit gemeldet", {
      module: "allianz",
      detail: `${player.name} ${until ? `bis ${bis}` : "bis auf Weiteres"}`,
    });

    // Nach dem Schreiben und ohne Rückwirkung: die Abmeldung steht bereits,
    // eine stumme Meldung wäre ärgerlich, aber kein Grund zum Abbruch.
    await meldeAbwesenheit({
      spieler: player.name,
      von: from,
      bis: until,
      notiz: note.trim() || null,
      durch: user.displayName,
      selbst: user.playerId === playerId,
    });

    revalidateAll();
  });
}

/** Vorzeitig beenden: der Spieler ist zurück. */
export async function endAbsence(id: string) {
  return runAction(async () => {
    const vorab = await prisma.absence.findUnique({
      where: { id },
      select: { playerId: true },
    });
    if (!vorab) throw new ActionError("entryNotFound");
    const user = await darfMelden(vorab.playerId);

    const eintrag = await prisma.absence.findUnique({
      where: { id },
      include: { player: { select: { name: true } } },
    });
    if (!eintrag) throw new ActionError("entryNotFound");

    const bis = heute();
    // Beginnt die Abwesenheit erst in der Zukunft, ist "zurück" sinnlos –
    // dann gehört der Eintrag gelöscht, nicht verkürzt.
    if (tag(eintrag.from) > bis) {
      await prisma.absence.delete({ where: { id } });
    } else {
      await prisma.absence.update({ where: { id }, data: { until: bis } });
    }

    await logActivity(user, "Abwesenheit beendet", {
      module: "allianz",
      detail: eintrag.player.name,
    });

    await meldeRueckkehr({ spieler: eintrag.player.name, durch: user.displayName });

    revalidateAll();
  });
}

export async function deleteAbsence(id: string) {
  return runAction(async () => {
    const vorab = await prisma.absence.findUnique({
      where: { id },
      select: { playerId: true },
    });
    if (!vorab) return;
    const user = await darfMelden(vorab.playerId);

    const eintrag = await prisma.absence.findUnique({
      where: { id },
      include: { player: { select: { name: true } } },
    });
    if (!eintrag) return;

    await prisma.absence.delete({ where: { id } });
    await logActivity(user, "Abwesenheit gelöscht", {
      module: "allianz",
      detail: eintrag.player.name,
    });
    revalidateAll();
  });
}
