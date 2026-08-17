import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LocaleSwitch } from "@/components/locale-switch";
import { getCurrentUser } from "@/lib/access";
import { JOIN_CODE_KEY } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { ALLIANZ_TAG } from "@/lib/allianz";

/**
 * Einstiegsseite für alle, die noch nicht angemeldet sind. Wer eine Sitzung
 * hat, wird direkt durchgereicht – für den ist die Seite nur ein Umweg.
 */
export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/uebersicht");

  const t = await getTranslations("landing");
  const tb = await getTranslations("brand");
  const code = await prisma.appSetting.findUnique({ where: { key: JOIN_CODE_KEY } });

  return (
    <main className="min-h-screen grid place-items-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="font-display text-4xl tracking-[0.2em] text-sand">{ALLIANZ_TAG}</div>
        <div className="font-display text-xl tracking-[0.35em] text-muted">COMMAND</div>
        <p className="mt-3 text-xs text-muted font-mono">{tb("server")}</p>

        <div className="mt-8 space-y-2">
          <Link href="/login" className="btn btn-primary block w-full py-2.5">
            {t("signIn")}
          </Link>

          {code?.value && (
            <Link href="/registrieren" className="btn block w-full py-2.5">
              {t("createAccount")}
            </Link>
          )}
        </div>

        {code?.value && <p className="mt-6 text-xs text-muted">{t("hint")}</p>}

        {/* Ganz bewusst schon hier: wer kein Deutsch kann, soll die Sprache
            umstellen können, bevor er sich durch die Anmeldung rätselt. */}
        <div className="mt-8 flex justify-center">
          <LocaleSwitch />
        </div>
      </div>
    </main>
  );
}
