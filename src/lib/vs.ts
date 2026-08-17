/**
 * VS-Auswertung: Namensabgleich und die Kennzahlen der Rangliste.
 *
 * Die Wochenpunkte kommen aus einer Arbeitsmappe, die jemand aus dem Spiel
 * heraus pflegt. Dort stehen die Namen nackt ("Alphabull"), im Kader dagegen
 * so, wie sie im Spiel geführt werden ("Alphabull ツ"). Beides ist derselbe
 * Mensch. Ohne Normalisierung wäre jeder fünfte Name ein Fehltreffer.
 */

/** Wie viele Wochen in den Schnitt gehen. */
export const VS_WINDOW = 4;

/** Wie viele Plätze die Rangliste zeigt. */
export const VS_TOP_N = 20;

/**
 * Wie viele VIP-Plätze zu vergeben sind. Sieben, weil der Zug sieben Tage
 * hat und jeder Tag genau einen VIP trägt.
 */
export const VS_VIP_SLOTS = 7;

/**
 * Buchstaben, die aussehen wie lateinische, aber keine sind, und die auch
 * keine Unicode-Zerlegung hat. Griechisches Ξ steht für E, das lateinische
 * Epsilon ɛ ebenso. Alles Weitere (ツ, 爻, ღ, 武) fällt ohnehin weg, weil es
 * nicht in den ASCII-Bereich zerlegbar ist.
 */
const LOOKALIKES: Record<string, string> = {
  Ξ: "E",
  ξ: "e",
  ɛ: "e",
  ε: "e",
  ι: "i",
  ɳ: "n",
  Ι: "I",
  Α: "A",
  Β: "B",
  Ε: "E",
  Η: "H",
  Κ: "K",
  Μ: "M",
  Ν: "N",
  Ο: "O",
  Ρ: "P",
  Τ: "T",
  Υ: "Y",
  Χ: "X",
  ѕ: "s",
  м: "m",
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  х: "x",
};

/**
 * Vergleichsform eines Spielernamens: ohne Zierzeichen, ohne Leerzeichen,
 * kleingeschrieben. "l o o k e r", "looker" und "Looker ツ" ergeben denselben
 * Schlüssel.
 *
 * Bewusst hart: Leerzeichen fallen weg, weil manche ihren Namen im Spiel
 * gesperrt schreiben. Das Risiko, zwei verschiedene Leute zusammenzuwerfen,
 * ist damit theoretisch da – bei den 100 Namen der Allianz tritt es nicht auf,
 * und der Import meldet jede Mehrdeutigkeit, statt sie stillschweigend zu
 * entscheiden.
 */
export function vsNameKey(name: string): string {
  const ersetzt = Array.from(name)
    .map((c) => LOOKALIKES[c] ?? c)
    .join("");
  return (
    ersetzt
      .normalize("NFKD")
      // Kombinierende Akzente entfernen: aus "ï" wird "i", aus "ṣ" wird "s".
      .replace(/[\u0300-\u036f]/g, "")
      // Übrig bleibt, was sich vergleichen lässt. Zierzeichen ohne
      // lateinische Entsprechung verschwinden hier.
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()
  );
}

/**
 * Vier-Wochen-Schnitt, gerechnet wie in der Arbeitsmappe: die Summe der vier
 * Wochen geteilt durch vier. Eine Woche ohne Eintrag zählt als null.
 *
 * Das ist bewusst so übernommen und nicht "Schnitt über die vorhandenen
 * Wochen". Wer eine Woche aussetzt, verliert dadurch ein Viertel – so war die
 * Regel in der Allianz schon vorher. Damit der Verlust nicht unsichtbar
 * bleibt, wird die Zahl der belegten Wochen daneben ausgewiesen.
 */
export function vsAverage(points: (number | undefined)[], window = VS_WINDOW): number {
  const summe = points.reduce<number>((acc, p) => acc + (p ?? 0), 0);
  return summe / window;
}
