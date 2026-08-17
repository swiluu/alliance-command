/**
 * Rechnen mit Abwesenheits-Zeiträumen.
 *
 * Gerechnet wird tageweise, nicht sekundengenau: "bis Freitag" heisst
 * einschliesslich Freitag. Alle Daten liegen auf Mitternacht UTC, damit ein
 * Eintrag nicht je nach Sommerzeit einen Tag springt.
 */

const TAG = 86400000;

/** Mitternacht UTC des angegebenen Tages. */
export function tag(d: Date | string): Date {
  const x = typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d;
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

/** Heutiger Tag, gemessen in Europa/Berlin – dort lebt die Allianz. */
export function heute(now = new Date()): Date {
  const berlin = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  return new Date(Date.UTC(berlin.getFullYear(), berlin.getMonth(), berlin.getDate()));
}

export const tageZwischen = (a: Date, b: Date) =>
  Math.round((tag(b).getTime() - tag(a).getTime()) / TAG);

export type Zeitraum = { from: Date; until: Date | null };

export function laeuft(z: Zeitraum, stichtag = heute()) {
  const start = tag(z.from);
  if (start > stichtag) return false;
  return z.until === null || tag(z.until) >= stichtag;
}

export function kuenftig(z: Zeitraum, stichtag = heute()) {
  return tag(z.from) > stichtag;
}

export function vorbei(z: Zeitraum, stichtag = heute()) {
  return z.until !== null && tag(z.until) < stichtag;
}

/**
 * Dauer als Bausteinschlüssel statt als fertiger Satz – die Beschriftung
 * entsteht erst beim Anzeigen, unter `absence.dauer`. Die Tageszahl kommt als
 * Parameter mit, weil beide Sprachen sie an anderer Stelle brauchen.
 */
export type Dauer = {
  key: "tomorrow" | "inDays" | "sinceToday" | "sinceDays" | "over" | "lastDay" | "daysLeft";
  days: number;
};

export function dauer(z: Zeitraum, stichtag = heute()): Dauer {
  if (kuenftig(z, stichtag)) {
    const bis = tageZwischen(stichtag, z.from);
    return bis === 1 ? { key: "tomorrow", days: 1 } : { key: "inDays", days: bis };
  }
  if (z.until === null) {
    const seit = tageZwischen(z.from, stichtag);
    return seit === 0 ? { key: "sinceToday", days: 0 } : { key: "sinceDays", days: seit };
  }
  const rest = tageZwischen(stichtag, z.until);
  if (rest < 0) return { key: "over", days: 0 };
  if (rest === 0) return { key: "lastDay", days: 0 };
  return { key: "daysLeft", days: rest };
}

/** "12.08." bzw. "12.08.–19.08.", in der Schreibweise der jeweiligen Sprache. */
export function zeitraumText(z: Zeitraum, locale = "de"): string {
  const fmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
  const von = fmt.format(tag(z.from));
  return z.until === null ? von : `${von}–${fmt.format(tag(z.until))}`;
}
