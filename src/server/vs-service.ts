import "server-only";

import { prisma } from "@/lib/db";
import { isoWeekOf, weekOrder, type Week } from "@/lib/iso-week";
import { VS_VIP_SLOTS, VS_WINDOW, vsNameKey } from "@/lib/vs";

/**
 * Die Auswertung: Vier-Wochen-Schnitt, Rangliste, VIP-Anrecht.
 *
 * Die Regel der Allianz lautet – Wochenpunkte festhalten, über die letzten
 * vier Wochen mitteln, die besten zwanzig anzeigen. Die sieben Besten ohne
 * R4-Rang haben Anspruch auf die VIP-Plätze im Zug.
 *
 * Gesetzt wird hier nichts. Die VIP-Felder im Wochenplan bleiben Handarbeit;
 * diese Seite sagt nur, wer nach der Regel dran wäre.
 */

export type VsRow = {
  /** Kadereintrag, falls der Name zugeordnet werden konnte. */
  playerId: string | null;
  /** Anzeigename: der Kadername, sonst die Schreibweise aus der Datei. */
  name: string;
  /** Punkte je Woche des Fensters, in derselben Reihenfolge wie `weeks`. */
  points: (number | null)[];
  /** Summe der vier Wochen geteilt durch vier. */
  average: number;
  /** Wie viele der vier Wochen tatsächlich belegt sind. */
  filled: number;
  isR4: boolean;
  /** Ausgetreten – zählt in der Liste mit, fährt aber nicht mehr. */
  former: boolean;
  /** Platz in der Gesamtliste, 1 = bester. */
  rank: number;
  /** 1..7 für die VIP-Plätze, sonst null. */
  vipRank: number | null;
};

export type VsRanking = {
  /** Die Wochen des Fensters, älteste zuerst. Bis zu vier. */
  weeks: Week[];
  rows: VsRow[];
  /** Alle vorhandenen Wochen, neueste zuerst – für die Auswahl. */
  available: Week[];
};

/**
 * Alle Wochen mit Daten, neueste zuerst.
 *
 * Wochen ohne eine einzige Punktzeile bleiben aussen vor. Eine solche Hülle
 * entsteht, sobald jemand die Erfassung einer Woche öffnet und leer
 * speichert – und sie wäre gefährlich: im Fenster zählte sie voll mit und
 * schnitte jedem Spieler ein Viertel vom Schnitt ab.
 */
export async function listVsWeeks(): Promise<Week[]> {
  const rows = await prisma.vsWeek.findMany({
    where: { scores: { some: {} } },
    select: { year: true, kw: true },
    orderBy: [{ year: "desc" }, { kw: "desc" }],
  });
  return rows;
}

/**
 * Rangliste für ein Fenster von vier Wochen, das bei `endWeek` endet.
 * Ohne Angabe zählt die neueste eingelesene Woche als Ende.
 *
 * Das Fenster nimmt die vier **eingelesenen** Wochen bis dorthin, nicht die
 * vier Kalenderwochen. Fehlt eine Woche im Bestand, weil sie nie erfasst
 * wurde, würde sie sonst für alle als Null zählen und die ganze Liste
 * verzerren.
 */
export async function getVsRanking(endWeek?: Week): Promise<VsRanking> {
  const available = await listVsWeeks();
  if (available.length === 0) return { weeks: [], rows: [], available };

  /**
   * Ohne ausdrückliche Wahl endet das Fenster mit der letzten **abgeschlossenen**
   * Woche. Die laufende ist fast immer erst halb erfasst; zählte sie mit,
   * spränge die Rangliste bei jedem eingetragenen Wert. Wer sie trotzdem sehen
   * will, wählt sie oben aus – deshalb steht sie weiterhin in `available`.
   */
  const laufend = weekOrder(isoWeekOf());
  const ende = endWeek
    ? // Die jüngste erfasste Woche, die nicht nach der gewünschten liegt.
      // Genaue Übereinstimmung zu verlangen wäre zu streng: der Zug fragt
      // nach der Woche vor der geplanten, und die kann noch unerfasst sein –
      // dann gilt die letzte davor, statt auf den Kalender zurückzufallen.
      (available.find((w) => weekOrder(w) <= weekOrder(endWeek)) ?? available[0])
    : (available.find((w) => weekOrder(w) < laufend) ?? available[0]);

  const fenster = available
    .filter((w) => weekOrder(w) <= weekOrder(ende))
    .slice(0, VS_WINDOW)
    .reverse();

  const [scores, r4, players] = await Promise.all([
    prisma.vsScore.findMany({
      where: { week: { OR: fenster.map((w) => ({ year: w.year, kw: w.kw })) } },
      select: {
        rawName: true,
        playerId: true,
        points: true,
        week: { select: { year: true, kw: true } },
      },
    }),
    prisma.zugPlayer.findMany({
      where: { isR4Rotation: true },
      select: { playerId: true },
    }),
    prisma.player.findMany({ select: { id: true, name: true, leftAt: true } }),
  ]);

  const r4Ids = new Set(r4.map((z) => z.playerId));
  const spieler = new Map(players.map((p) => [p.id, p]));
  const spalte = new Map(fenster.map((w, i) => [weekOrder(w), i]));

  // Zusammengefasst wird über den Kadereintrag. Wer sich nicht zuordnen
  // liess, wird über seinen normalisierten Namen gebündelt – sonst stünde
  // derselbe Unbekannte für jede Woche einmal in der Liste.
  const gruppen = new Map<string, VsRow>();
  for (const s of scores) {
    const key = s.playerId ?? `raw:${vsNameKey(s.rawName)}`;
    const eintrag = spieler.get(s.playerId ?? "");
    let row = gruppen.get(key);
    if (!row) {
      row = {
        playerId: s.playerId,
        name: eintrag?.name ?? s.rawName,
        points: fenster.map(() => null),
        average: 0,
        filled: 0,
        isR4: s.playerId ? r4Ids.has(s.playerId) : false,
        former: Boolean(eintrag?.leftAt),
        rank: 0,
        vipRank: null,
      };
      gruppen.set(key, row);
    }
    const i = spalte.get(weekOrder(s.week));
    if (i !== undefined) row.points[i] = s.points;
  }

  const rows = [...gruppen.values()];
  for (const row of rows) {
    const vorhanden = row.points.filter((p): p is number => p !== null);
    row.filled = vorhanden.length;
    // Geteilt wird immer durch die Fensterbreite, auch wenn Wochen fehlen –
    // so rechnet die Arbeitsmappe, und so ist die Regel in der Allianz.
    row.average = vorhanden.reduce((a, b) => a + b, 0) / VS_WINDOW;
  }

  rows.sort((a, b) => b.average - a.average || a.name.localeCompare(b.name));

  let vip = 0;
  rows.forEach((row, i) => {
    row.rank = i + 1;
    // R4 fahren den Zug in ihrer eigenen Rotation und sind vom VIP-Anspruch
    // ausgenommen. Ausgetretene ebenfalls – sie sind nicht mehr da.
    const anspruch = !row.isR4 && !row.former && row.playerId !== null;
    if (anspruch && vip < VS_VIP_SLOTS) {
      vip += 1;
      row.vipRank = vip;
    }
  });

  return { weeks: fenster, rows, available };
}
