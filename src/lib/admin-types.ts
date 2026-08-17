import type { AccessLevel } from "./constants";

/**
 * Eine Zeile der Zugriffsmatrix. Liegt bewusst nicht in der "use server"-Datei –
 * dort sind nur async Funktionen als Exporte erlaubt.
 */
export type AccessMatrixRow = {
  userId: string;
  username: string;
  displayName: string;
  isSuperadmin: boolean;
  /** Selbst angelegtes Mitgliedskonto – nur für die gilt der R4-Rang. */
  isMember: boolean;
  /** R4-Rang: sieht zusätzlich Fixplätze und das Protokoll. */
  isR4: boolean;
  /** Erstpasswort noch nicht vom Besitzer ersetzt. */
  mustChangePassword: boolean;
  levels: Record<string, AccessLevel>;
};
