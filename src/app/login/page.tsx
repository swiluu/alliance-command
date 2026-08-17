import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LocaleSwitch } from "@/components/locale-switch";
import { TestBanner } from "@/components/test-banner";
import { getCurrentUser } from "@/lib/access";
import { JOIN_CODE_KEY } from "@/lib/constants";
import { prisma } from "@/lib/db";

import { LoginForm } from "./login-form";
import { ALLIANZ_TAG } from "@/lib/allianz";

export async function generateMetadata() {
  const t = await getTranslations("login");
  return { title: t("title") };
}

export default async function LoginPage() {
  // Der Verweis erscheint nur, solange die Selbstregistrierung offen ist.
  const code = await prisma.appSetting.findUnique({ where: { key: JOIN_CODE_KEY } });
  const beitrittMoeglich = Boolean(code?.value);

  const user = await getCurrentUser();
  if (user) redirect("/uebersicht");

  const t = await getTranslations("login");
  const tb = await getTranslations("brand");

  return (
    <>
      <TestBanner />
      <main className="min-h-screen grid place-items-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="font-display text-4xl tracking-[0.2em] text-sand">{ALLIANZ_TAG}</div>
            <div className="font-display text-xl tracking-[0.35em] text-muted">COMMAND</div>
            <p className="mt-3 text-xs text-muted font-mono">{tb("server")}</p>
          </div>
          <LoginForm />
          {beitrittMoeglich ? (
            <p className="mt-6 text-center text-xs text-muted">
              {t("noAccountYet")}{" "}
              <Link href="/registrieren" className="text-sand hover:underline">
                {t("createWithCode")}
              </Link>
            </p>
          ) : (
            <p className="mt-6 text-center text-xs text-muted">{t("adminGrants")}</p>
          )}

          <div className="mt-8 flex justify-center">
            <LocaleSwitch />
          </div>
        </div>
      </main>
    </>
  );
}
