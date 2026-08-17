"use server";

import { ActionError } from "@/server/action-error";
import { revalidatePath } from "next/cache";

import { assertAccess } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import type { Week } from "@/lib/iso-week";
import { ANNOUNCEMENT_KEYS } from "@/lib/zug-announcement-types";
import { runAction } from "@/server/action-result";
import { findConflicts, getOrCreateKW } from "@/server/zug-service";

type Field = "plannedDriverId" | "actualDriverId" | "vipPlayerId";

const FIELD_LABEL: Record<Field, string> = {
  plannedDriverId: "Geplanter Zugführer",
  actualDriverId: "Tatsächlicher Zugführer",
  vipPlayerId: "VIP",
};

/**
 * Setzt eine Zelle im KW-Plan. Nach jeder Änderung läuft die Duplikat-Prüfung
 * serverseitig – sie blockiert nicht, die Treffer werden an den Client
 * zurückgegeben und dort beim geplanten Zugführer markiert.
 */
export async function setZugCell(
  week: Week,
  dayIndex: number,
  field: Field,
  playerId: string | null,
) {
  return runAction(async () => {
    const user = await assertAccess("zug", "EDIT");
    const kwRecord = await getOrCreateKW(week);
    const day = kwRecord.days.find((d) => d.dayIndex === dayIndex);
    if (!day) throw new ActionError("dayNotFound", { day: dayIndex, kw: week.kw });

    if (playerId) {
      const exists = await prisma.player.findUnique({ where: { id: playerId } });
      if (!exists) throw new ActionError("playerNotFound");
    }

    await prisma.zugDay.update({
      where: { id: day.id },
      data: { [field]: playerId },
    });

    const player = playerId
      ? await prisma.player.findUnique({ where: { id: playerId }, select: { name: true } })
      : null;

    await logActivity(user, `${FIELD_LABEL[field]} gesetzt`, {
      module: "zug",
      detail: `KW ${week.kw}/${week.year} · ${day.weekday} → ${player?.name ?? "leer"}`,
    });

    revalidatePath("/zug", "layout");
    revalidatePath("/uebersicht");

    // Prüfung läuft immer, nicht nur bei actualDriverId – so bleibt die
    // Markierung auch nach einer Planänderung aktuell.
    return findConflicts(week);
  });
}

export async function toggleR4Rotation(playerId: string) {
  return runAction(async () => {
    const user = await assertAccess("zug", "EDIT");

    const current = await prisma.zugPlayer.findUnique({ where: { playerId } });
    const next = !current?.isR4Rotation;

    await prisma.zugPlayer.upsert({
      where: { playerId },
      create: { playerId, isR4Rotation: next },
      update: { isR4Rotation: next },
    });

    if (next) {
      const max = await prisma.r4RotationQueue.aggregate({ _max: { position: true } });
      await prisma.r4RotationQueue.upsert({
        where: { playerId },
        create: { playerId, position: (max._max.position ?? 0) + 1 },
        update: {},
      });
    } else {
      await prisma.r4RotationQueue.deleteMany({ where: { playerId } });
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    await logActivity(user, next ? "In R4-Rotation aufgenommen" : "Aus R4-Rotation entfernt", {
      module: "zug",
      detail: player?.name,
    });
    revalidatePath("/zug", "layout");
  });
}

/** Neue Reihenfolge der Warteschlange (Drag-Sortierung). */
export async function reorderRotation(playerIds: string[]) {
  return runAction(async () => {
    const user = await assertAccess("zug", "EDIT");

    await prisma.$transaction(
      playerIds.map((playerId, i) =>
        // updateMany statt update: wer gerade erst aufgenommen wurde, ist
        // vielleicht noch nicht in der Warteschlange – das darf das Sortieren
        // der übrigen nicht abbrechen.
        prisma.r4RotationQueue.updateMany({
          where: { playerId },
          data: { position: i + 1 },
        }),
      ),
    );

    await logActivity(user, "R4-Rotation umsortiert", {
      module: "zug",
      detail: `${playerIds.length} Einträge`,
    });
    revalidatePath("/zug", "layout");
  });
}

/** Ersten Eintrag ans Ende schieben – der Nächste rückt auf. */
export async function advanceRotation() {
  return runAction(async () => {
    const user = await assertAccess("zug", "EDIT");

    const queue = await prisma.r4RotationQueue.findMany({
      orderBy: { position: "asc" },
      include: { player: { select: { name: true } } },
    });
    if (queue.length < 2) return;

    const [first, ...rest] = queue;
    await prisma.$transaction([
      ...rest.map((q, i) =>
        prisma.r4RotationQueue.update({ where: { id: q.id }, data: { position: i + 1 } }),
      ),
      prisma.r4RotationQueue.update({
        where: { id: first.id },
        data: { position: rest.length + 1 },
      }),
    ]);

    await logActivity(user, "Rotation weitergeschoben", {
      module: "zug",
      detail: `${first.player.name} ans Ende`,
    });
    revalidatePath("/zug", "layout");
  });
}

/** Einen der Textbausteine der Zugliste speichern. */
export async function setAnnouncementText(key: string, value: string) {
  return runAction(async () => {
    const user = await assertAccess("zug", "EDIT");

    const erlaubt = Object.values(ANNOUNCEMENT_KEYS) as string[];
    if (!erlaubt.includes(key)) throw new ActionError("unknownTextBlock");

    const clean = value.trim().slice(0, 300);
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: clean },
      update: { value: clean },
    });

    await logActivity(user, "Zugliste-Text geändert", { module: "zug", detail: clean });
    revalidatePath("/zug/ankuendigung");
  });
}
