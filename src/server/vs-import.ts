import "server-only";

import * as XLSX from "xlsx";

import { prisma } from "@/lib/db";
import { isoWeekOf, type Week } from "@/lib/iso-week";
import { ActionError } from "@/server/action-error";
import { loadNameResolver } from "@/server/vs-names";

/**
 * Einlesen der VS-Arbeitsmappe.
 *
 * Aufbau eines Wochenblatts:
 *   Zeile 1   A: "KW 25"   B: "Datum: 22.06.2026 - 28.06.2026"
 *   Zeile 2   Überschriften: #, Name, VS Punkte
 *   ab Zeile 3  die Spieler
 *
 * Die Kalenderwoche kommt aus dem **Datum**, nicht aus der Beschriftung. In
 * der Vorlage waren alle Blätter um genau eine Woche versetzt beschriftet
 * ("KW 25" über dem 22.06.2026, was KW 26 ist). Das Datum stimmte dagegen
 * durchgehend. Wird der Versatz irgendwann korrigiert, ändert sich hier
 * nichts – ein Import bleibt in beiden Fällen richtig.
 *
 * Blätter ohne Datumszeile werden übergangen. Das trifft die beiden
 * Auswertungsblätter und die Hilfsliste, die wir nicht brauchen: den Schnitt
 * rechnen wir selbst.
 */

export type ImportedWeek = {
  week: Week;
  starts: Date;
  /** Übernommene Zeilen mit Punktzahl. */
  rows: number;
  /** Zeilen ohne Punktzahl – im Spiel nichts erzielt oder nicht erfasst. */
  blank: number;
  /** Namen, die zu keinem Kadereintrag passen. */
  unresolved: string[];
};

export type ImportReport = {
  weeks: ImportedWeek[];
  /** Übergangene Blätter, mit Grund. */
  skipped: string[];
  /** Alle offenen Namen der Mappe, jeder einmal. */
  unresolved: string[];
};

type SheetRows = (string | number | undefined)[][];

/** "Datum: 22.06.2026 - 28.06.2026" → 22.06.2026 als UTC-Datum. */
function ersterTag(zelle: unknown): Date | null {
  if (zelle instanceof Date) return zelle;
  if (typeof zelle !== "string") return null;
  const m = zelle.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const [, tag, monat, jahr] = m;
  return new Date(Date.UTC(Number(jahr), Number(monat) - 1, Number(tag)));
}

/** Spaltenindex anhand der Überschrift, unabhängig von der Position. */
function spalte(kopf: SheetRows[number], ...begriffe: string[]): number {
  return kopf.findIndex((z) => {
    const text = String(z ?? "").toLowerCase();
    return begriffe.some((b) => text.includes(b));
  });
}

function zahl(wert: unknown): number | null {
  if (typeof wert === "number") return Number.isFinite(wert) ? wert : null;
  if (typeof wert !== "string") return null;
  // Punkte kommen gelegentlich als Text mit Tausendertrennern.
  const bereinigt = wert.replace(/['\s.]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(bereinigt)) return null;
  return Number(bereinigt);
}

/**
 * Liest die Mappe und schreibt jede gefundene Woche. Eine Woche, die es
 * schon gibt, wird ersetzt: die Datei ist die Quelle, nicht der Bestand.
 */
export async function importVsWorkbook(buffer: ArrayBuffer): Promise<ImportReport> {
  const mappe = XLSX.read(buffer, { type: "array", cellDates: true });
  const resolver = await loadNameResolver();

  const weeks: ImportedWeek[] = [];
  const skipped: string[] = [];
  const offen = new Set<string>();

  for (const blattName of mappe.SheetNames) {
    const blatt = mappe.Sheets[blattName];
    if (!blatt) continue;

    const zeilen = XLSX.utils.sheet_to_json<SheetRows[number]>(blatt, {
      header: 1,
      raw: true,
      blankrows: true,
    }) as SheetRows;

    const kopfzeile = zeilen[0] ?? [];
    const montag = kopfzeile.map(ersterTag).find((d): d is Date => d !== null);
    if (!montag) {
      skipped.push(blattName);
      continue;
    }

    const ueberschriften = zeilen[1] ?? [];
    const nameSpalte = spalte(ueberschriften, "name");
    const punkteSpalte = spalte(ueberschriften, "punkte", "points");
    if (nameSpalte < 0 || punkteSpalte < 0) {
      skipped.push(blattName);
      continue;
    }

    const week = isoWeekOf(montag);
    const eintraege: { rawName: string; playerId: string | null; points: number }[] = [];
    const unresolved: string[] = [];
    let blank = 0;

    for (const zeile of zeilen.slice(2)) {
      const rawName = String(zeile?.[nameSpalte] ?? "").trim();
      if (!rawName) continue;

      const punkte = zahl(zeile?.[punkteSpalte]);
      if (punkte === null) {
        blank += 1;
        continue;
      }

      const playerId = resolver.resolve(rawName);
      if (!playerId) {
        unresolved.push(rawName);
        offen.add(rawName);
      }
      eintraege.push({ rawName, playerId, points: punkte });
    }

    if (eintraege.length === 0) {
      skipped.push(blattName);
      continue;
    }

    // Doppelte Namen innerhalb eines Blatts würden am eindeutigen Schlüssel
    // scheitern. Lieber hier melden als mit einem Datenbankfehler abbrechen.
    const gesehen = new Set<string>();
    for (const e of eintraege) {
      if (gesehen.has(e.rawName)) {
        throw new ActionError("vsDuplicateName", { sheet: blattName, name: e.rawName });
      }
      gesehen.add(e.rawName);
    }

    await prisma.$transaction(async (tx) => {
      const vorhanden = await tx.vsWeek.findUnique({ where: { year_kw: week } });
      if (vorhanden) {
        await tx.vsScore.deleteMany({ where: { weekId: vorhanden.id } });
        await tx.vsWeek.update({
          where: { id: vorhanden.id },
          data: { starts: montag, importedAt: new Date() },
        });
        await tx.vsScore.createMany({
          data: eintraege.map((e) => ({ ...e, weekId: vorhanden.id })),
        });
        return;
      }
      const neu = await tx.vsWeek.create({ data: { ...week, starts: montag } });
      await tx.vsScore.createMany({
        data: eintraege.map((e) => ({ ...e, weekId: neu.id })),
      });
    });

    weeks.push({ week, starts: montag, rows: eintraege.length, blank, unresolved });
  }

  if (weeks.length === 0) throw new ActionError("vsNoWeeks");

  weeks.sort((a, b) => a.week.year - b.week.year || a.week.kw - b.week.kw);
  return { weeks, skipped, unresolved: [...offen].sort() };
}
