/**
 * Die Season-Karten als Daten.
 *
 * Eine Season-Karte ist ein Raster aus Gebieten – Strongholds, Städte, das eine
 * Capitol. Die Zahlen dazu liegen unter `src/data/seasons/` (Herkunft siehe
 * HERKUNFT.md dort); gezeichnet wird daraus, statt ein Bild zu hinterlegen.
 * Das hat drei Vorteile: es bleibt beim Zoomen scharf, jedes Feld ist
 * anklickbar, und Erträge lassen sich zusammenzählen statt schätzen.
 *
 * Die Ressourcenfelder wechseln je Season. Season 1 zählt `influence`,
 * Season 3 `mithril` und `spice`, Season 4 `copper` und `stone`. Deshalb wird
 * hier nichts fest benannt: `resources` bleibt eine offene Liste, und die
 * Oberfläche zeigt, was tatsächlich drinsteht.
 */

/**
 * Zwei Formen kommen vor: Rechtecke (Seasons 1 bis 6) und Polygone (Season 0,
 * die noch unregelmässige Gebiete hatte). Beides muss der Lader aushalten –
 * eine Karte, die beim Umschalten leer bleibt, wäre schlimmer als keine.
 */
export type Masse =
  | { x: number; y: number; width: number; height: number; points?: never }
  | { x: number; y: number; points: [number, number][]; width?: never; height?: never };

export type Gebiet = {
  id: string;
  name: string;
  level: number;
  isCapitol?: boolean;
  buff?: { item: string; percentage: number };
  coordinates: Masse;
  resources?: Record<string, number>;
};

export type SeasonKarte = {
  key: string;
  /** Kantenlänge eines Rasterfeldes in den Koordinaten der Rohdaten. */
  einheit: number;
  /** Ausdehnung der Karte in Rohkoordinaten – der Zeichenbereich. */
  ausdehnung: { breite: number; hoehe: number };
  gebiete: Gebiet[];
  /** Welche Ressourcen diese Season überhaupt kennt. */
  ressourcen: string[];
};

/** Welche Season-Karten mitgeliefert werden. */
export const SEASON_KEYS = ["0", "1", "2", "3", "4", "5", "6"] as const;
export type SeasonKey = (typeof SEASON_KEYS)[number];

export function istSeasonKey(wert: string): wert is SeasonKey {
  return (SEASON_KEYS as readonly string[]).includes(wert);
}

/**
 * Einmal geladene Karten bleiben liegen. Season 6 hat 2165 Gebiete; die Datei
 * bei jedem Seitenaufruf neu zu lesen und zu vermessen wäre Verschwendung.
 */
const geladen = new Map<string, SeasonKarte>();

export async function ladeSeason(key: SeasonKey): Promise<SeasonKarte> {
  const schon = geladen.get(key);
  if (schon) return schon;

  const gebiete = (await import(`@/data/seasons/season-${key}.json`))
    .default as Gebiet[];

  // Die Rastereinheit steht nirgends. Sie ist der grösste gemeinsame Teiler
  // aller Koordinaten – nicht etwa die kleinste Gebietsbreite: Season 3 mischt
  // 50, 75 und 100, da wäre jedes Mass ein Bruchteil des kleinsten Gebiets.
  let einheit = 0;
  for (const g of gebiete) {
    for (const wert of masszahlen(g)) einheit = ggT(einheit, Math.round(wert));
  }

  let breite = 0;
  let hoehe = 0;
  for (const g of gebiete) {
    const r = rahmen(g);
    breite = Math.max(breite, r.x + r.breite);
    hoehe = Math.max(hoehe, r.y + r.hoehe);
  }

  const ressourcen = [
    ...new Set(gebiete.flatMap((g) => Object.keys(g.resources ?? {}))),
  ].sort();

  const karte: SeasonKarte = {
    key,
    einheit: einheit || 1,
    ausdehnung: { breite, hoehe },
    gebiete,
    ressourcen,
  };
  geladen.set(key, karte);
  return karte;
}

function ggT(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : ggT(b, a % b);
}

function masszahlen(g: Gebiet): number[] {
  const c = g.coordinates;
  if (c.points) return [c.x, c.y, ...c.points.flat()];
  return [c.x, c.y, c.width, c.height];
}

/** Umschliessendes Rechteck – für Rechtecke trivial, für Polygone gerechnet. */
export function rahmen(g: Gebiet) {
  const c = g.coordinates;
  if (!c.points) return { x: c.x, y: c.y, breite: c.width, hoehe: c.height };
  const xs = c.points.map((p) => p[0]);
  const ys = c.points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, breite: Math.max(...xs) - x, hoehe: Math.max(...ys) - y };
}

/**
 * Fläche eines Gebiets in Rasterfeldern.
 *
 * Rechtecke sind Breite mal Höhe. Polygone werden mit der Gaussschen
 * Trapezformel gerechnet – ohne das zählte ein unregelmässiges Gebiet so viel
 * wie sein umschliessendes Rechteck, und die Bilanz wäre zu hoch.
 */
export function flaeche(g: Gebiet, einheit: number): number {
  const c = g.coordinates;
  if (!c.points) return (c.width / einheit) * (c.height / einheit);
  let doppelt = 0;
  for (let i = 0; i < c.points.length; i++) {
    const [x1, y1] = c.points[i];
    const [x2, y2] = c.points[(i + 1) % c.points.length];
    doppelt += x1 * y2 - x2 * y1;
  }
  return Math.abs(doppelt) / 2 / (einheit * einheit);
}

/**
 * Welche Season gerade geplant wird – Schlüssel in `AppSetting`.
 *
 * Steht bewusst nicht im Code: Season 4 löst Season 3 ab, indem jemand in der
 * Oberfläche umschaltet, nicht indem jemand eine Zeile ändert.
 */
export const AKTIVE_SEASON = "season.aktiv";

/** Wem ein Gebiet zugeteilt ist. */
export const SEITEN = ["OWN", "ALLY", "ENEMY"] as const;
export type Seite = (typeof SEITEN)[number];

export function istSeite(wert: string): wert is Seite {
  return (SEITEN as readonly string[]).includes(wert);
}
