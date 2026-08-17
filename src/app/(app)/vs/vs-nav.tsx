"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Erfassen und Einlesen stehen nur, wer schreiben darf. Wer nur liest,
 * bekommt keinen Reiter angeboten, den ihm der Server danach verweigert.
 */
const TABS = [
  { href: "/vs", key: "tabRanking", edit: false },
  { href: "/vs/erfassen", key: "tabEntry", edit: true },
] as const;

export function VsNav({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations("vs");
  const pathname = usePathname();

  return (
    <div className="scroll-x border-b border-line">
      <ul className="flex gap-1 min-w-max">
        {TABS.filter((tab) => canEdit || !tab.edit).map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`inline-block px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                  active
                    ? "border-sand text-sand"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
