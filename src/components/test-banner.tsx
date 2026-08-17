"use client";

import { useTranslations } from "next-intl";

/**
 * Warnband des Testsystems.
 *
 * Erscheint ausschliesslich, wenn `NEXT_PUBLIC_ENVIRONMENT` auf "test" steht –
 * auf der Live-Seite ist die Variable nicht gesetzt und die Komponente
 * rendert nichts. Sie darf deshalb bedenkenlos in beiden Zweigen liegen.
 *
 * Zweck: Test- und Live-System sehen sonst identisch aus. Wer beide Tabs offen
 * hat, ändert sonst irgendwann versehentlich die echte Wochenplanung.
 */
export const IS_TEST = process.env.NEXT_PUBLIC_ENVIRONMENT === "test";

export function TestBanner() {
  const t = useTranslations("banner");

  if (!IS_TEST) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5
                 border-b border-sand-dim bg-sand px-3 py-1.5 text-center text-[11px]
                 font-medium uppercase tracking-[0.16em] text-[#0B0F0D]"
    >
      <span>Testsystem</span>
      <span className="font-mono normal-case tracking-normal opacity-80">
        {t("test")}
      </span>
    </div>
  );
}
