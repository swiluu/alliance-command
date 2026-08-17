import { useTranslations } from "next-intl";
import Link from "next/link";

import { isModuleKey } from "@/lib/constants";

export default function NoAccessPage({
  searchParams,
}: {
  searchParams: { modul?: string };
}) {
  const t = useTranslations("noAccess");
  const tc = useTranslations("common");
  const tm = useTranslations("modules");

  const key = searchParams.modul;
  const label = key && isModuleKey(key) ? tm(key) : tm("unknown");

  return (
    <div className="max-w-lg mx-auto mt-16 panel p-6 text-center">
      <div className="text-4xl mb-3" aria-hidden>
        🔒
      </div>
      <h1 className="text-xl mb-2">{t("heading")}</h1>
      <p className="text-sm text-muted">
        {t.rich("body", {
          module: label,
          name: (chunks) => <span className="text-ink">{chunks}</span>,
        })}
      </p>
      <Link href="/uebersicht" className="btn mt-5 inline-flex">
        {tc("toOverview")}
      </Link>
    </div>
  );
}
