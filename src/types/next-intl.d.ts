import type de from "../i18n/messages/de.json";

/**
 * Deutsch ist die Leitfassung: TypeScript prüft jeden Schlüssel gegen sie.
 * Ein Tippfehler in `t("login.usernme")` fällt damit beim Bauen auf und nicht
 * erst, wenn jemand vor einer leeren Beschriftung sitzt.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface IntlMessages extends Message {}
}

type Message = typeof de;

export {};
