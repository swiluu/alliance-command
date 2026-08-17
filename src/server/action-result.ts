import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "@/lib/access";

import { ActionError } from "./action-error";
import { meldeFehler } from "./error-log";

/**
 * Next.js maskiert Fehler aus Server Actions in Produktion zu einem Digest –
 * die Meldung erreicht den Client nie. Erwartbare Fehler (fehlende Rechte,
 * ungültige Eingaben, verletzte Fachregeln) werden deshalb als Wert
 * zurückgegeben statt geworfen. Geworfen wird nur noch Unerwartetes.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    // Server-seitig bleibt der volle Fehler im Log – auch der erwartete.
    console.error("[action]", e);
    const t = await getTranslations("errors");

    // Erwartete Fälle tragen einen Bausteinschlüssel und werden hier
    // formuliert. Alles andere ist ein Programmfehler: der Text davon gehört
    // ins Log, nicht auf den Bildschirm.
    if (e instanceof ActionError) {
      return { ok: false, error: t(e.key as never, e.params as never) };
    }

    // Unerwartetes wird festgehalten, damit ein Superadmin es auf der
    // Übersicht sieht. Der Benutzer bekommt weiterhin nur den allgemeinen
    // Satz – ein Aufrufstapel gehört nicht auf den Bildschirm.
    const user = await getCurrentUser().catch(() => null);
    await meldeFehler({ fehler: e, userName: user?.displayName ?? null });

    return { ok: false, error: t("generic") };
  }
}
