import type { EventKey } from "./constants";

/**
 * Eine Positionsgruppe auf der Battle-Map. `key` ist stabil und wird in
 * WeeklyAssignment.positionKey referenziert – Labels dürfen sich ändern,
 * Keys nicht.
 */
export type PositionGroup = {
  key: string;
  label: string;
  labelEn?: string;
  icon: string;
  slots: number;
  /** Ab wann die Position im Event überhaupt betretbar ist (Schluchtsturm). */
  unlockDelayMinutes: number;
  /** Wie viele der zugeteilten Spieler einen Jäger-Build stellen müssen. */
  requiredHunterCount?: number;
  /** Ersatzbank – 10 Slots, treten nach 15 Minuten bei. */
  isSubstitute?: boolean;
  /**
   * Nimmt eine eigene Zeile über die volle Breite ein, statt sich eine Zeile
   * mit der nächsten Gruppe zu teilen. Die Slots stehen dann zweispaltig.
   */
  fullWidth?: boolean;
};

export type EventLayout = {
  eventKey: EventKey;
  displayName: string;
  /**
   * Name auf Englisch. Die Events heissen im Spiel anders als ihre deutsche
   * Übersetzung vermuten liesse – "Schluchtsturm" ist "Canyon Battlefield",
   * nicht "Canyon Storm". Deshalb hier hinterlegt statt übersetzt geraten,
   * wie schon bei den Positionsnamen (labelEn).
   */
  displayNameEn: string;
  totalWeeks: number;
  groups: PositionGroup[];
};

const SUBSTITUTE_GROUP: PositionGroup = {
  key: "ersatz",
  label: "Ersatz",
  labelEn: "Substitute",
  icon: "🔄",
  slots: 10,
  unlockDelayMinutes: 15,
  isSubstitute: true,
};

export const WUESTENSTURM_LAYOUT: EventLayout = {
  eventKey: "wuestensturm",
  displayName: "Wüstensturm",
  displayNameEn: "Desert Storm",
  totalWeeks: 53,
  groups: [
    // Jäger stehen allein in der ersten Zeile, darunter paaren sich
    // Lazarett 1+2, 3+4, Techzentrum+Info und Ölraffinerie 1+2.
    { key: "jaeger", label: "Jäger", labelEn: "Hunter", icon: "🎯", slots: 4, unlockDelayMinutes: 0, fullWidth: true },
    { key: "lazarett_1", label: "Lazarett 1", labelEn: "Hospital 1", icon: "🏥", slots: 2, unlockDelayMinutes: 0 },
    { key: "lazarett_2", label: "Lazarett 2", labelEn: "Hospital 2", icon: "🏥", slots: 2, unlockDelayMinutes: 0 },
    { key: "lazarett_3", label: "Lazarett 3", labelEn: "Hospital 3", icon: "🏥", slots: 2, unlockDelayMinutes: 0 },
    { key: "lazarett_4", label: "Lazarett 4", labelEn: "Hospital 4", icon: "🏥", slots: 2, unlockDelayMinutes: 0 },
    { key: "techzentrum", label: "Techzentrum", labelEn: "Tech Center", icon: "⚙", slots: 2, unlockDelayMinutes: 0 },
    { key: "info_zentrum", label: "Info Zentrum", labelEn: "Info Center", icon: "ℹ", slots: 2, unlockDelayMinutes: 0 },
    { key: "oelraffinerie_1", label: "Ölraffinerie 1", labelEn: "Oil Refinery 1", icon: "🛢", slots: 2, unlockDelayMinutes: 0 },
    { key: "oelraffinerie_2", label: "Ölraffinerie 2", labelEn: "Oil Refinery 2", icon: "🛢", slots: 2, unlockDelayMinutes: 0 },
    SUBSTITUTE_GROUP,
  ],
};

export const SCHLUCHTSTURM_LAYOUT: EventLayout = {
  eventKey: "schluchtsturm",
  displayName: "Schluchtsturm",
  displayNameEn: "Canyon Battlefield",
  totalWeeks: 53,
  groups: [
    { key: "probenlager_1", label: "Probenlager 1", labelEn: "Sample Storage 1", icon: "🏥", slots: 2, unlockDelayMinutes: 0 },
    { key: "probenlager_2", label: "Probenlager 2", labelEn: "Sample Storage 2", icon: "🏥", slots: 2, unlockDelayMinutes: 0 },
    { key: "probenlager_3", label: "Probenlager 3", labelEn: "Sample Storage 3", icon: "🏥", slots: 2, unlockDelayMinutes: 0 },
    { key: "probenlager_4", label: "Probenlager 4", labelEn: "Sample Storage 4", icon: "🏥", slots: 2, unlockDelayMinutes: 0 },
    { key: "daten_zentrum_1", label: "Daten Zentrum 1", labelEn: "Data Center 1", icon: "🏥", slots: 2, unlockDelayMinutes: 0 },
    { key: "daten_zentrum_2", label: "Daten Zentrum 2", labelEn: "Data Center 2", icon: "🏥", slots: 2, unlockDelayMinutes: 0 },
    { key: "energie_turm", label: "Energie Turm", labelEn: "Energy Tower", icon: "🛢", slots: 2, unlockDelayMinutes: 0 },
    { key: "serum_fabrik_1", label: "Serum Fabrik 1", labelEn: "Serum Factory 1", icon: "⚙", slots: 1, unlockDelayMinutes: 5, requiredHunterCount: 1 },
    { key: "serum_fabrik_2", label: "Serum Fabrik 2", labelEn: "Serum Factory 2", icon: "⚙", slots: 1, unlockDelayMinutes: 5, requiredHunterCount: 1 },
    { key: "verteidigungssystem_1", label: "Verteidigungssystem 1", labelEn: "Defense System 1", icon: "⚙", slots: 1, unlockDelayMinutes: 8, requiredHunterCount: 1 },
    { key: "verteidigungssystem_2", label: "Verteidigungssystem 2", labelEn: "Defense System 2", icon: "⚙", slots: 1, unlockDelayMinutes: 8, requiredHunterCount: 1 },
    { key: "hochsicherheitslabor", label: "Hochsicherheitslabor", labelEn: "High-Security Laboratory", icon: "🛢", slots: 2, unlockDelayMinutes: 12, requiredHunterCount: 2 },
    SUBSTITUTE_GROUP,
  ],
};

export const EVENT_LAYOUTS: Record<EventKey, EventLayout> = {
  wuestensturm: WUESTENSTURM_LAYOUT,
  schluchtsturm: SCHLUCHTSTURM_LAYOUT,
};

/** Hauptpositionen ohne Ersatzbank. */
export function mainGroups(groups: PositionGroup[]) {
  return groups.filter((g) => !g.isSubstitute);
}

export function substituteGroup(groups: PositionGroup[]) {
  return groups.find((g) => g.isSubstitute);
}

/** Slots pro Team inkl. Ersatz (Wüstensturm wie Schluchtsturm: 30). */
export function slotsPerTeam(groups: PositionGroup[]) {
  return groups.reduce((sum, g) => sum + g.slots, 0);
}

/**
 * Battle-Map-Reihenfolge: früheste Freischaltung zuerst, damit der
 * Koordinator die zeitkritischen Positionen sofort sieht. Innerhalb einer
 * Freischaltstufe bleibt die Layout-Reihenfolge erhalten.
 */
export function groupsByUnlock(groups: PositionGroup[]) {
  return mainGroups(groups)
    .map((g, i) => ({ g, i }))
    .sort((a, b) =>
      a.g.unlockDelayMinutes === b.g.unlockDelayMinutes
        ? a.i - b.i
        : a.g.unlockDelayMinutes - b.g.unlockDelayMinutes,
    )
    .map((x) => x.g);
}

/**
 * Beschriftung für die Ankündigung – bewusst immer deutsch.
 *
 * Die Ankündigung wird ins Spiel kopiert und dort von beiden Sprachgruppen
 * gelesen; im Spiel lässt sie sich mit einem Tipp übersetzen. Sie richtet sich
 * deshalb nicht nach der Sprache dessen, der sie erzeugt – sonst sähe die
 * Allianz je nach Ersteller mal die eine, mal die andere Fassung.
 */
export function unlockBadgeDe(minutes: number): string {
  return minutes === 0 ? "Sofort" : `ab ${minutes} Min`;
}

export function unlockBadge(minutes: number): { key: "unlockNow" | "unlockAfter"; minutes: number } {
  return minutes === 0
    ? { key: "unlockNow", minutes: 0 }
    : { key: "unlockAfter", minutes };
}

/** Zeigt das Event überhaupt gestaffelte Freischaltzeiten? */
export function hasStaggeredUnlocks(groups: PositionGroup[]) {
  return mainGroups(groups).some((g) => g.unlockDelayMinutes > 0);
}

/** Braucht das Event überhaupt die Jäger-Markierung? */
export function needsHunterFlag(groups: PositionGroup[]) {
  return groups.some((g) => (g.requiredHunterCount ?? 0) > 0);
}

export function parseLayout(json: string): PositionGroup[] {
  return JSON.parse(json) as PositionGroup[];
}
