/**
 * Zweisprachigkeit: Deutsch und Englisch.
 *
 * Bewusst ohne Sprach-Präfix in der Adresse. `/wuestensturm/planung` bleibt,
 * was es ist – Verweise, Lesezeichen und alles, was jemand im Spielchat
 * weitergibt, funktionieren in beiden Sprachen. Die Sprache hängt am Konto,
 * für Abgemeldete am Cookie.
 *
 * Nicht übersetzt werden zwei Dinge, und zwar mit Absicht:
 *   – Positionsnamen (Lazarett, Techzentrum …). Die Allianz benutzt sie als
 *     gemeinsames Vokabular, in beiden Sprachgruppen.
 *   – Die Ankündigungstexte. Die werden ins Spiel kopiert, und dort kann sie
 *     jeder mit einem Tipp selbst übersetzen lassen.
 */

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "de";

/** Merkt die Wahl für Abgemeldete – Anmeldeseite und Registrierung. */
export const LOCALE_COOKIE = "covs.locale";

/** Jede Sprache in ihrer eigenen Sprache benannt, sonst hilft es niemandem. */
export const LOCALE_LABEL: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Erste Annahme aus dem Browser: "en-GB,en;q=0.9,de;q=0.8" → "en".
 * Nur ein Vorschlag – sobald jemand umschaltet, zählt seine Wahl.
 */
export function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;

  const gewichtet = header
    .split(",")
    .map((teil) => {
      const [tag, ...rest] = teil.trim().split(";");
      const q = rest.find((r) => r.trim().startsWith("q="));
      return {
        sprache: tag.trim().slice(0, 2).toLowerCase(),
        q: q ? Number(q.trim().slice(2)) || 0 : 1,
      };
    })
    .sort((a, b) => b.q - a.q);

  for (const { sprache } of gewichtet) {
    if (isLocale(sprache)) return sprache;
  }
  return null;
}
