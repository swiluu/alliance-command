/**
 * Wer diese Anwendung betreibt.
 *
 * Kürzel, Servernummer und Allianzkennung stehen sonst verstreut im Code –
 * im Schriftzug, im Aushangbild, im Abgleich mit lastwarrank. Hier stehen sie
 * einmal, und nur hier.
 *
 * Die Werte kommen aus der `.env` und werden beim Einrichten abgefragt
 * (`scripts/einrichten.sh`). `NEXT_PUBLIC_` deshalb, weil Schriftzug und
 * Anmeldeseite sie auch im Browser brauchen.
 *
 * Die Vorgaben unten sind erkennbare Platzhalter. Steht in der Oberfläche
 * "ALLY · Server #0000", dann wurde die `.env` nicht ausgefüllt.
 */

/** Kürzel wie im Spiel, etwa "CoVs". Steht im Schriftzug und in allen Texten. */
export const ALLIANZ_TAG = process.env.NEXT_PUBLIC_ALLIANZ_TAG || "ALLY";

/** Ausgeschriebener Name, etwa "Concilium Venatoris". Für Beschreibungen. */
export const ALLIANZ_NAME = process.env.NEXT_PUBLIC_ALLIANZ_NAME || "Allianz";

/** Servernummer im Spiel. */
export const SERVER_ID = Number(
  process.env.NEXT_PUBLIC_SERVER_ID || process.env.THP_SERVER_ID || 0,
);

/**
 * Kennung der Allianz bei lastwarrank – die lange Zeichenfolge aus der Adresse
 * der Allianzseite. Ohne sie bleiben Serverstellung und Mitgliederabgleich
 * leer; alles andere läuft weiter.
 */
export const LWR_ALLIANCE_ID = process.env.LWR_ALLIANCE_ID || "";

/** "CoVs · Server #1580" – für Fusszeilen und Beschreibungen. */
export const ALLIANZ_ZEILE = `${ALLIANZ_TAG} · Server #${SERVER_ID}`;
