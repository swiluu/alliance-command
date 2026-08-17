import { getTranslations } from "next-intl/server";

import { requireAccess } from "@/lib/access";

import { ZugNav } from "./zug-nav";

export async function generateMetadata() {
  const t = await getTranslations("zug");
  return { title: t("title") };
}

export default async function ZugLayout({ children }: { children: React.ReactNode }) {
  const { level } = await requireAccess("zug", "READ");
  const t = await getTranslations("zug");
  const te = await getTranslations("event");
  const tm = await getTranslations("modules");

  return (
    <div className="max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{t("kicker")}</p>
          <h1 className="text-3xl text-sand">{tm("zug")}</h1>
        </div>
        {level === "READ" && (
          <span className="tag border-sand-dim text-sand">{te("readOnly")}</span>
        )}
      </header>

      <ZugNav />
      <div className="mt-5">{children}</div>
    </div>
  );
}
