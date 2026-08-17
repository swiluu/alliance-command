// Zentrale Wertelisten. SQLite hat keine Enums, deshalb leben die
// erlaubten Werte hier und werden überall als Typ verwendet.

export const MODULES = [
  "wuestensturm",
  "schluchtsturm",
  "zug",
  "vs",
  "r2",
  "allianz",
  "backup",
] as const;
export type ModuleKey = (typeof MODULES)[number];

export const TACTICAL_EVENTS = ["wuestensturm", "schluchtsturm"] as const;
export type EventKey = (typeof TACTICAL_EVENTS)[number];

export function isEventKey(v: string): v is EventKey {
  return (TACTICAL_EVENTS as readonly string[]).includes(v);
}

export function isModuleKey(v: string): v is ModuleKey {
  return (MODULES as readonly string[]).includes(v);
}

export const ACCESS_LEVELS = ["NONE", "READ", "EDIT"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** NONE → READ → EDIT → NONE */
export function nextAccessLevel(level: AccessLevel): AccessLevel {
  const i = ACCESS_LEVELS.indexOf(level);
  return ACCESS_LEVELS[(i + 1) % ACCESS_LEVELS.length];
}

// Beschriftungen stehen im Textbaustein-Namensraum `modules`; hier bleibt,
// was in beiden Sprachen gleich ist.
export const MODULE_META: Record<
  ModuleKey,
  { href: string; comingSoon?: boolean; icon: string }
> = {
  wuestensturm: { href: "/wuestensturm", icon: "🏜" },
  schluchtsturm: { href: "/schluchtsturm", icon: "🏔" },
  zug: { href: "/zug", icon: "🚂" },
  // Wochenpunkte aus dem VS-Duell. Eigenes Modul und nicht ein Reiter im Zug:
  // die Zahlen sind eine Leistungsübersicht der ganzen Allianz und werden
  // wöchentlich gepflegt – der VIP-Anspruch ist nur eine Folge daraus.
  vs: { href: "/vs", icon: "📊" },
  // Wer im Spiel das Schild vergisst, wird auf R2 zurückgestuft und darf an
  // den beiden Events nicht teilnehmen. Eigenes Modul, weil die Markierung
  // spielweit gilt und keinem der beiden Events allein gehört.
  r2: { href: "/r2", icon: "🛡" },
  // Der Spieler-Stamm gehört keinem Event – wer ihn ändert, ändert alle Module.
  allianz: { href: "/allianz", icon: "👥" },
  // Sicherungen enthalten den kompletten Datenbestand inklusive Passwort-Hashes –
  // deshalb ein eigenes Modul mit eigener Zugriffsstufe.
  backup: { href: "/backup", icon: "🗄" },
};

// ── Anmeldung ───────────────────────────────────────────────
// Bewusst nur zwei Zustände. Der Ersatz-Begriff im Original-Sheet
// ("100% Ersatz") war ein Anmeldestatus; hier sind Ersatzspieler
// ausschliesslich ein taktisches Slot-Konzept auf der Battle-Map.
export const REG_TEIL = "TEIL";
export const REG_NICHT_TEIL = "NICHT_TEIL";
export type RegistrationValue = typeof REG_TEIL | typeof REG_NICHT_TEIL;

// ── Rotations-Historie ──────────────────────────────────────
export const ROTATION_STATUSES = [
  "GESPIELT",
  "BANK",
  "FEHLT_ANGEMELDET",
  "NICHT_DABEI",
  "AUSGESETZT",
] as const;
export type RotationStatus = (typeof ROTATION_STATUSES)[number];

// Die Beschriftung steht im Textbaustein-Namensraum `rotation`, unter dem
// Status als Schlüssel – hier bleiben nur Kürzel und Farbe.
export const ROTATION_META: Record<RotationStatus, { short: string; cls: string }> = {
  GESPIELT: { short: "G", cls: "bg-ok text-black" },
  BANK: { short: "B", cls: "bg-sand text-black" },
  FEHLT_ANGEMELDET: { short: "F", cls: "bg-danger text-white" },
  AUSGESETZT: { short: "A", cls: "bg-ok-deep text-white" },
  NICHT_DABEI: { short: "–", cls: "bg-panel-2 text-muted" },
};

/** Bann-Dauer in Wochen bei unentschuldigtem Fehlen trotz Anmeldung. */
export const BAN_DURATION_WEEKS = 2;
export const BAN_AUTO_REASON = "Nicht erschienen (Nehme teil)";

/** Mindestlänge für selbst gesetzte Passwörter. */
export const MIN_PASSWORD_LENGTH = 8;

export const MAX_PLAYERS = 100;
export const MAX_FIXPLATZ = 20;
export const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/**
 * Schlüssel des Beitrittscodes in den Einstellungen. Liegt hier und nicht bei
 * der Aktion: eine "use server"-Datei darf ausschliesslich asynchrone
 * Funktionen exportieren.
 */
export const JOIN_CODE_KEY = "konto.beitrittscode";
