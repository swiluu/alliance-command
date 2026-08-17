/**
 * Konstanten und Typen der Zug-Ankündigung. Bewusst getrennt vom Service:
 * die Ansicht ist eine Client-Komponente und darf nichts aus einer
 * `server-only`-Datei importieren.
 */

/** Textbausteine rund um die Liste – pflegbar, weil die Grussformel wechselt. */
export const ANNOUNCEMENT_KEYS = {
  greeting: "zug.ankuendigung.anrede",
  intro: "zug.ankuendigung.einleitung",
  signature: "zug.ankuendigung.gruss",
} as const;

export const ANNOUNCEMENT_DEFAULTS = {
  greeting: "Hallo zusammen,",
  intro: "Hier die Zugliste für die kommende Woche:",
  signature: "LG Bob",
};

export type AnnouncementPerson = { id: string; name: string };

export type AnnouncementRow = {
  dayIndex: number;
  weekday: string;
  driver: AnnouncementPerson | null;
  vip: AnnouncementPerson | null;
};

export type ZugAnnouncement = {
  week: { year: number; kw: number };
  range: string;
  rows: AnnouncementRow[];
  text: string;
  offen: number;
  texts: typeof ANNOUNCEMENT_DEFAULTS;
};
