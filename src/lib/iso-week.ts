/**
 * Rechnen mit ISO-Kalenderwochen.
 *
 * Der Zug-Plan läuft auf echten Kalenderwochen, und die Nummer allein genügt
 * nicht: KW 1 gibt es in jedem Jahr. Ohne Jahreszahl würden sich die Wochen am
 * Jahreswechsel überlagern und die Historie vermischen.
 *
 * Alle Rechnungen laufen über den Montag der Woche. Das erspart Sonderfälle:
 * ein Jahr hat 52 oder 53 Wochen, und das ISO-Jahr weicht am Jahreswechsel um
 * ein paar Tage vom Kalenderjahr ab – Datumsarithmetik kennt beides schon.
 */

export type Week = { year: number; kw: number };

/** ISO-Woche und ISO-Jahr eines Datums. */
export function isoWeekOf(date = new Date()): Week {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Der Donnerstag derselben Woche bestimmt Jahr und Nummer.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const jahresanfang = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil(((d.getTime() - jahresanfang.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), kw };
}

/**
 * Montag einer ISO-Woche. Der 4. Januar liegt per Definition immer in KW 1,
 * von dort aus lässt sich jeder Wochenanfang zurückrechnen.
 */
export function isoWeekMonday({ year, kw }: Week): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const wochentag = jan4.getUTCDay() || 7;
  const montag = new Date(jan4);
  montag.setUTCDate(jan4.getUTCDate() - wochentag + 1 + (kw - 1) * 7);
  return montag;
}

/** Verschiebt eine Woche um `delta` Wochen – über den Jahreswechsel hinweg. */
export function shiftWeek(week: Week, delta: number): Week {
  const montag = isoWeekMonday(week);
  montag.setUTCDate(montag.getUTCDate() + delta * 7);
  return isoWeekOf(montag);
}

/** 52 oder 53 – je nachdem, wie das Jahr fällt. */
export function weeksInIsoYear(year: number): number {
  // Der 28. Dezember liegt immer in der letzten Woche des ISO-Jahres.
  return isoWeekOf(new Date(Date.UTC(year, 11, 28))).kw;
}

export const sameWeek = (a: Week, b: Week) => a.year === b.year && a.kw === b.kw;

/** Für Vergleiche und Sortierung: 2026 KW 5 → 202605. */
export const weekOrder = ({ year, kw }: Week) => year * 100 + kw;

const dd = (n: number) => String(n).padStart(2, "0");

/** "03.08-09.08.26" – Montag bis Sonntag, so wie es in der Allianz steht. */
export function weekRangeLabel(week: Week): string {
  const mo = isoWeekMonday(week);
  const so = new Date(mo);
  so.setUTCDate(mo.getUTCDate() + 6);
  return (
    `${dd(mo.getUTCDate())}.${dd(mo.getUTCMonth() + 1)}` +
    `-${dd(so.getUTCDate())}.${dd(so.getUTCMonth() + 1)}.${String(so.getUTCFullYear()).slice(2)}`
  );
}
