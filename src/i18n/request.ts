import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

import { getCurrentUser } from "@/lib/access";

import { mitAllianz } from "./allianz-texte";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  localeFromAcceptLanguage,
  type Locale,
} from "./config";

/**
 * Rangfolge, absichtlich in dieser Reihenfolge:
 *
 *   1. das angemeldete Konto – die einmal getroffene, bewusste Wahl
 *   2. das Cookie – für Anmelde- und Registrierungsseite, wo es kein Konto gibt
 *   3. die Browsersprache – die erste Annahme beim allerersten Besuch
 *   4. Deutsch
 */
export async function resolveLocale(): Promise<Locale> {
  const user = await getCurrentUser();
  if (user) return user.locale;

  const cookie = cookies().get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;

  return localeFromAcceptLanguage(headers().get("accept-language")) ?? DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: mitAllianz((await import(`./messages/${locale}.json`)).default),
    // Der Server steht in der Schweiz und die Allianz plant nach Serverzeit;
    // ein Datum darf nicht davon abhängen, wo der Browser gerade steht.
    timeZone: "Europe/Zurich",
  };
});
