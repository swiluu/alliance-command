"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/zug", key: "plan" },
  { href: "/zug/ankuendigung", key: "announcement" },
  { href: "/zug/rotation", key: "rotation" },
  { href: "/zug/zaehler", key: "counter" },
] as const;

export function ZugNav() {
  const t = useTranslations("zug.tabs");
  const pathname = usePathname();

  return (
    <div className="scroll-x border-b border-line">
      <ul className="flex gap-1 min-w-max">
        {TABS.map((tab) => {
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
