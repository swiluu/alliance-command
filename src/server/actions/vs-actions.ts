"use server";

import { revalidatePath } from "next/cache";

import { assertAccess } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { isoWeekMonday } from "@/lib/iso-week";
import { vsNameKey } from "@/lib/vs";
import { ActionError } from "@/server/action-error";
import { runAction } from "@/server/action-result";
import { importVsWorkbook, type ImportReport } from "@/server/vs-import";
import { leseVsBilder, merkeZuordnung, weckeErkenner, type OcrErgebnis } from "@/server/vs-ocr";

/** 8 MB. Die Arbeitsmappe liegt bei gut 130 KB – das ist reichlich Luft. */
const MAX_UPLOAD = 8 * 1024 * 1024;

/**
 * Nimmt die VS-Arbeitsmappe entgegen und schreibt alle enthaltenen Wochen.
 *
 * Die Datei wird nicht abgelegt, nur gelesen. Was zählt, sind die Punkte;
 * eine Kopie der Mappe auf dem Server wäre ein zweiter Stand, der irgendwann
 * vom ersten abweicht.
 */
export async function uploadVsWorkbook(formData: FormData) {
  return runAction<ImportReport>(async () => {
    const user = await assertAccess("vs", "EDIT");

    const datei = formData.get("file");
    if (!(datei instanceof File) || datei.size === 0) throw new ActionError("vsNoFile");
    if (datei.size > MAX_UPLOAD) throw new ActionError("vsTooLarge");

    const report = await importVsWorkbook(await datei.arrayBuffer());

    const wochen = report.weeks.map((w) => `KW ${w.week.kw}/${w.week.year}`).join(", ");
    await logActivity(user, "VS-Punkte eingelesen", {
      module: "vs",
      detail: `${report.weeks.length} Wochen (${wochen})`,
    });

    revalidatePath("/vs", "layout");
    return report;
  });
}

/**
 * Verbindet eine Schreibweise aus der Datei dauerhaft mit einem Kadereintrag.
 *
 * Gedacht für die Fälle, die keine Normalisierung fängt – "Ranger994" gegen
 * "Ranger 武". Bereits eingelesene Zeilen mit demselben Namen werden gleich
 * mitgezogen, sonst müsste man die Mappe nur wegen eines Namens neu einlesen.
 */
export async function linkVsName(rawName: string, playerId: string) {
  return runAction(async () => {
    const user = await assertAccess("vs", "EDIT");

    const key = vsNameKey(rawName);
    if (!key) throw new ActionError("vsEmptyName");

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { name: true },
    });
    if (!player) throw new ActionError("playerNotFound");

    await prisma.playerAlias.upsert({
      where: { key },
      create: { key, playerId },
      update: { playerId },
    });

    // Alle offenen Zeilen, die auf denselben Schlüssel fallen, nachziehen.
    const offen = await prisma.vsScore.findMany({
      where: { playerId: null },
      select: { id: true, rawName: true },
    });
    const treffer = offen.filter((s) => vsNameKey(s.rawName) === key).map((s) => s.id);
    if (treffer.length > 0) {
      await prisma.vsScore.updateMany({ where: { id: { in: treffer } }, data: { playerId } });
    }

    await logActivity(user, "VS-Name zugeordnet", {
      module: "vs",
      detail: `${rawName} → ${player.name} (${treffer.length} Zeilen)`,
    });

    revalidatePath("/vs", "layout");
    return { linked: treffer.length };
  });
}

/**
 * Speichert eine von Hand erfasste Woche.
 *
 * Die übergebene Liste ist der neue Stand der Woche, nicht ein Zusatz: was
 * fehlt, wird entfernt. Anders liesse sich ein versehentlich eingetragener
 * Wert nie wieder loswerden – man müsste ihn auf null setzen, und null ist
 * eine Aussage ("hat nichts erreicht"), kein Löschen.
 *
 * Zeilen ohne Kaderbezug (aus einem Import mit unbekanntem Namen) bleiben
 * unangetastet. Sie stehen in keinem Feld des Formulars und dürfen deshalb
 * auch nicht daran hängen.
 */
export async function saveVsWeek(
  week: { year: number; kw: number },
  entries: { playerId: string; points: number }[],
) {
  return runAction(async () => {
    const user = await assertAccess("vs", "EDIT");

    if (!Number.isInteger(week.kw) || week.kw < 1 || week.kw > 53) {
      throw new ActionError("vsBadWeek", { kw: week.kw });
    }
    for (const e of entries) {
      if (!Number.isFinite(e.points) || e.points < 0) {
        throw new ActionError("vsBadPoints");
      }
    }

    const ids = entries.map((e) => e.playerId);
    const players = await prisma.player.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const namen = new Map(players.map((p) => [p.id, p.name]));
    const unbekannt = ids.find((id) => !namen.has(id));
    if (unbekannt) throw new ActionError("playerNotFound");

    await prisma.$transaction(async (tx) => {
      const woche =
        (await tx.vsWeek.findUnique({ where: { year_kw: week } })) ??
        (await tx.vsWeek.create({
          data: { ...week, starts: isoWeekMonday(week) },
        }));

      // Nur die zugeordneten Zeilen ersetzen – offene Namen aus einem Import
      // gehören nicht dem Formular und bleiben stehen.
      await tx.vsScore.deleteMany({
        where: { weekId: woche.id, NOT: { playerId: null } },
      });
      if (entries.length > 0) {
        await tx.vsScore.createMany({
          data: entries.map((e) => ({
            weekId: woche.id,
            playerId: e.playerId,
            rawName: namen.get(e.playerId)!,
            points: e.points,
          })),
        });
      }
      // Bleibt nach dem Speichern keine einzige Zeile übrig, verschwindet die
      // Woche ganz. Eine leere Hülle stünde sonst weiter im Bestand und
      // zählte in der Auswertung als volle Woche mit – jeder Schnitt fiele
      // um ein Viertel.
      const rest = await tx.vsScore.count({ where: { weekId: woche.id } });
      if (rest === 0) {
        await tx.vsWeek.delete({ where: { id: woche.id } });
        return;
      }
      await tx.vsWeek.update({
        where: { id: woche.id },
        data: { importedAt: new Date() },
      });
    });

    await logActivity(user, "VS-Woche erfasst", {
      module: "vs",
      detail: `KW ${week.kw}/${week.year} · ${entries.length} Spieler`,
    });

    revalidatePath("/vs", "layout");
    return { saved: entries.length };
  });
}

/** Entfernt eine eingelesene Woche samt Punkten. */
export async function deleteVsWeek(year: number, kw: number) {
  return runAction(async () => {
    const user = await assertAccess("vs", "EDIT");

    const woche = await prisma.vsWeek.findUnique({ where: { year_kw: { year, kw } } });
    if (!woche) throw new ActionError("vsWeekNotFound", { kw, year });

    await prisma.vsWeek.delete({ where: { id: woche.id } });

    await logActivity(user, "VS-Woche gelöscht", {
      module: "vs",
      detail: `KW ${kw}/${year}`,
    });

    revalidatePath("/vs", "layout");
  });
}

/** 10 MB. Ein Handy-Screenshot liegt bei rund einem Megabyte. */
const MAX_BILD = 10 * 1024 * 1024;

/**
 * Einen Screenshot der VS-Rangliste auslesen.
 *
 * Liefert nur einen Vorschlag zurück – geschrieben wird nichts. Das Speichern
 * bleibt bei `saveVsWeek`, nachdem ein Mensch die Zuordnung geprüft hat. Eine
 * falsch gelesene Ziffer wäre in der Wertung sonst nicht mehr auffindbar.
 */
export async function leseVsScreenshot(formData: FormData) {
  return runAction<OcrErgebnis[]>(async () => {
    await assertAccess("vs", "EDIT");

    const dateien = formData.getAll("bild").filter((d): d is File => d instanceof File && d.size > 0);
    if (dateien.length === 0) throw new ActionError("vsNoFile");
    if (dateien.some((d) => d.size > MAX_BILD)) throw new ActionError("vsTooLarge");

    // Alle zusammen an den Dienst: der verteilt sie auf mehrere Prozesse und
    // lädt die Modelle einmal statt je Bild. Siebzehn Screenshots einzeln
    // gerechnet dauern rund fünf Minuten, gemeinsam gut eine.
    const inhalte = await Promise.all(
      dateien.map(async (d) => Buffer.from(await d.arrayBuffer()).toString("base64")),
    );
    const ergebnisse = await leseVsBilder(inhalte);
    const fehlgeschlagen = ergebnisse.find((e) => !e.ok);
    if (fehlgeschlagen) throw new ActionError("ocrFailed", { grund: fehlgeschlagen.fehler ?? "" });
    return ergebnisse;
  });
}

/**
 * Eine von Hand getroffene Zuordnung dauerhaft merken.
 *
 * Damit sitzt beim nächsten Screenshot, was diesmal noch Handarbeit war.
 */
export async function merkeOcrZuordnung(gelesen: string, playerId: string) {
  return runAction(async () => {
    const user = await assertAccess("vs", "EDIT");
    const spieler = await prisma.player.findUnique({
      where: { id: playerId },
      select: { name: true },
    });
    if (!spieler) throw new ActionError("playerNotFound");

    await merkeZuordnung(gelesen, playerId);
    await logActivity(user, "Namenszuordnung gemerkt", {
      module: "vs",
      detail: `„${gelesen}" → ${spieler.name}`,
    });
  });
}

/**
 * Die Texterkennung vorwärmen, sobald die Erfassungsseite offen ist.
 *
 * Ohne Rückmeldung und ohne Folgen bei Fehlschlag – es geht allein darum, die
 * Wartezeit vom Hochladen weg nach vorn zu verlegen.
 */
export async function weckeTexterkennung() {
  return runAction(async () => {
    await assertAccess("vs", "EDIT");
    await weckeErkenner();
  });
}
