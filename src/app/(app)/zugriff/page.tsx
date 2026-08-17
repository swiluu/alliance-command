import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { requireUser, stufenAus } from "@/lib/access";
import { JOIN_CODE_KEY } from "@/lib/constants";
import { prisma } from "@/lib/db";

import { AccessMatrix } from "./access-matrix";
import { JoinCodePanel } from "./join-code-panel";

export async function generateMetadata() {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

export default async function ZugriffPage() {
  const me = await requireUser();
  if (!me.isSuperadmin) redirect("/kein-zugriff?modul=zugriff");

  const t = await getTranslations("admin");
  const locale = await getLocale();

  const [users, codeEintrag] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ isSuperadmin: "desc" }, { displayName: "asc" }],
      include: { moduleAccess: true },
    }),
    prisma.appSetting.findUnique({ where: { key: JOIN_CODE_KEY } }),
  ]);

  const mitglieder = users
    .filter((u) => u.isMember)
    .map((u) => ({
      name: u.displayName,
      username: u.username,
      seit: u.createdAt.toLocaleDateString(locale),
    }));

  const rows = users.map((u) => {
    // Dieselbe Rechnung wie die Wächter. Die Matrix zeigt damit, was wirklich
    // gilt – Grundrecht aus der Rolle und Matrix-Zeile zusammengenommen.
    const levels = stufenAus(u, u.moduleAccess);

    return {
      userId: u.id,
      username: u.username,
      displayName: u.displayName,
      isSuperadmin: u.isSuperadmin,
      isMember: u.isMember,
      isR4: u.isR4,
      mustChangePassword: u.mustChangePassword,
      levels,
    };
  });

  return (
    <div className="max-w-[1200px] mx-auto">
      <header className="mb-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{t("kicker")}</p>
        <h1 className="text-3xl text-sand">{t("heading")}</h1>
      </header>
      <JoinCodePanel code={codeEintrag?.value ?? null} mitglieder={mitglieder} />

      <AccessMatrix rows={rows} currentUserId={me.id} />
    </div>
  );
}
