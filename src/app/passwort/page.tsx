import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { requireUser } from "@/lib/access";

import { PasswordForm } from "./password-form";
import { ALLIANZ_TAG } from "@/lib/allianz";

export async function generateMetadata() {
  const t = await getTranslations("password");
  return { title: t("title") };
}

/**
 * Liegt bewusst ausserhalb der App-Shell: die leitet hierher um, solange das
 * Erstpasswort gilt. Läge die Seite darin, würde die Weiterleitung kreisen.
 */
export default async function PasswortPage() {
  const user = await requireUser();
  const forced = user.mustChangePassword;
  const t = await getTranslations("password");

  return (
    <main className="min-h-screen grid place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="font-display text-3xl tracking-[0.2em] text-sand">{ALLIANZ_TAG}</div>
          <div className="font-display text-lg tracking-[0.35em] text-muted">COMMAND</div>
        </div>

        {forced && (
          <div className="mb-4 rounded border border-sand-dim bg-sand/10 px-3 py-2 text-sm text-sand">
            <strong>{t("forcedTitle")}</strong>
            <p className="mt-1 text-xs text-sand/80">{t("forcedBody")}</p>
          </div>
        )}

        <PasswordForm forced={forced} displayName={user.displayName} />

        {!forced && (
          <p className="mt-6 text-center text-xs text-muted">
            <Link href="/uebersicht" className="hover:text-sand">
              {t("backToOverview")}
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
