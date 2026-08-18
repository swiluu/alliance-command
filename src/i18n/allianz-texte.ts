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

export function mitAllianz<T>(nachrichten: T): T {
  const tag = String(ALLIANZ_TAG);
  // Ohne Eintrag in der `.env` ist die Nummer 0. Dann bleibt der Platzhalter
  // stehen: "Server #0000" sagt "nicht eingerichtet", "Server #0" sähe aus wie
  // ein echter Wert.
  const server = SERVER_ID > 0 ? String(SERVER_ID) : VORGABE_SERVER;
  if (tag === VORGABE_TAG && server === VORGABE_SERVER) return nachrichten;

  // Nur Werte ersetzen, niemals Schlüssel. Das ist keine Feinheit: der
  // Schlüssel `seite.ALLY` enthält den Platzhalter als Namen: eine Ersetzung
  // über den ganzen Text machte daraus `seite.aRES`, und die Beschriftung
  // verschwand aus der Oberfläche.
  const ersetze = (wert: unknown): unknown => {
    if (typeof wert === "string") {
      return wert.split(VORGABE_TAG).join(tag).split(VORGABE_SERVER).join(server);
    }
    if (Array.isArray(wert)) return wert.map(ersetze);
    if (wert && typeof wert === "object") {
      return Object.fromEntries(
        Object.entries(wert as Record<string, unknown>).map(([k, v]) => [k, ersetze(v)]),
      );
    }
    return wert;
  };

  return ersetze(nachrichten) as T;
}
