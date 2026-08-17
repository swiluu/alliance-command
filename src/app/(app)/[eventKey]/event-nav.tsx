"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Reihenfolge des wöchentlichen Ablaufs: erst melden sich die Spieler an,
// dann Teams, dann Positionen, dann die Ankündigung. Danach die Nachschau.
// Die Beschriftung steht unter `event.tabs`, hier nur die Reihenfolge.
const TABS = [
  "spieler",
  "teams",
  "planung",
  "ankuendigung",
  "anwesenheit",
  "historie",
  "banns",
  "fixplatz",
] as const;

/** Alle Reiter in der Reihenfolge des Wochenablaufs. */
export const ALLE_TABS: readonly string[] = TABS;

export function EventNav({
  eventKey,
  erlaubt,
}: {
  eventKey: string;
  /** Reiter, die dieser Nutzer sehen darf – der Rest erscheint gar nicht. */
  erlaubt: readonly string[];
}) {
  const t = useTranslations("event.tabs");
  const pathname = usePathname();
  const sichtbar = TABS.filter((slug) => erlaubt.includes(slug));

  // Bei einem einzigen Reiter wäre die Leiste nur Zierde.
  if (sichtbar.length <= 1) return null;

  return (
    <div className="scroll-x border-b border-line">
      <ul className="flex gap-1 min-w-max">
        {sichtbar.map((slug) => {
          const href = `/${eventKey}/${slug}`;
          const active = pathname === href;
          return (
            <li key={slug}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-block px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                  active
                    ? "border-sand text-sand"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t(slug)}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
