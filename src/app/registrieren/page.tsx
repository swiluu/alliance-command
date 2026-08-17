import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/access";
import { JOIN_CODE_KEY } from "@/lib/constants";
import { KADER, prisma } from "@/lib/db";

import { RegisterForm } from "./register-form";
import { ALLIANZ_TAG } from "@/lib/allianz";

export async function generateMetadata() {
  const t = await getTranslations("register");
  return { title: t("title") };
}

export default async function RegistrierenPage() {
  const user = await getCurrentUser();
  if (user) redirect("/uebersicht");

  const t = await getTranslations("register");

  const [code, kader, konten] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: JOIN_CODE_KEY } }),
    prisma.player.findMany({
      where: KADER,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { playerId: { not: null } },
      select: { playerId: true },
    }),
  ]);

  // Wer schon ein Konto hat, steht nicht mehr zur Auswahl – ein Kadereintrag
  // gehört genau einem Konto.
  const vergeben = new Set(konten.map((k) => k.playerId));
  const frei = kader.filter((p) => !vergeben.has(p.id));

  return (
    <main className="min-h-screen grid place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-display text-4xl tracking-[0.2em] text-sand">{ALLIANZ_TAG}</div>
          <div className="font-display text-xl tracking-[0.35em] text-muted">COMMAND</div>
          <p className="mt-3 text-xs text-muted font-mono">{t("heading")}</p>
        </div>

        {!code?.value ? (
          <div className="panel p-5 text-center text-sm text-muted">
            {t("closed")}
          </div>
        ) : frei.length === 0 ? (
          <div className="panel p-5 text-center text-sm text-muted">
            {t("allTaken")}
          </div>
        ) : (
          <RegisterForm kader={frei} />
        )}

        <p className="mt-6 text-center text-xs text-muted">
          {t("haveAccount")}{" "}
          <Link href="/login" className="text-sand hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </div>
    </main>
  );
}
