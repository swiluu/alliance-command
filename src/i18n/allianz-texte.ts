import { ALLIANZ_TAG, SERVER_ID } from "@/lib/allianz";

/**
 * Setzt Kürzel und Servernummer in die Oberflächentexte ein.
 *
 * Rund fünfzig Texte nennen die Allianz beim Namen – "Neu in ALLY", "Zug ·
 * ALLY Command", "Server #0000 · Allianz ALLY". Sie alle auf ICU-Platzhalter
 * umzustellen hiesse, in beiden Sprachdateien fünfzig Zeichenketten und an
 * jeder Aufrufstelle die Werte durchzureichen; ein einziger vergessener
 * Platzhalter bricht dann die Übersetzung.
 *
 * Stattdessen tragen die Sprachdateien die Platzhalter `ALLY` und `0000` im
 * Klartext, und beim Laden werden sie ersetzt. Die Texte bleiben damit lesbar
 * und übersetzbar.
 *
 * Wichtig beim Übersetzen: `ALLY` und `0000` sind reserviert. Sie dürfen in
 * den Sprachdateien nur dort stehen, wo die betreibende Allianz gemeint ist.
 *
 * Läuft einmal je Anfrage über die geladenen Nachrichten.
 */

/** Die Platzhalter, wie sie in den Sprachdateien stehen. */
const VORGABE_TAG = "ALLY";
const VORGABE_SERVER = "0000";

/** Für den Einbau in eine JSON-Zeichenkette entschärfen. */
function fuerJson(wert: string): string {
  return JSON.stringify(wert).slice(1, -1);
}

export function mitAllianz<T>(nachrichten: T): T {
  const tag = String(ALLIANZ_TAG);
  // Ohne Eintrag in der `.env` ist die Nummer 0. Dann bleibt der Platzhalter
  // stehen: "Server #0000" sagt "nicht eingerichtet", "Server #0" sähe aus wie
  // ein echter Wert.
  const server = SERVER_ID > 0 ? String(SERVER_ID) : VORGABE_SERVER;
  if (tag === VORGABE_TAG && server === VORGABE_SERVER) return nachrichten;

  const ersetzt = JSON.stringify(nachrichten)
    .split(VORGABE_TAG)
    .join(fuerJson(tag))
    .split(VORGABE_SERVER)
    .join(fuerJson(server));

  return JSON.parse(ersetzt) as T;
}
