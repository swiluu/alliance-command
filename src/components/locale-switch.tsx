"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";

import { LOCALES, LOCALE_LABEL, type Locale } from "@/i18n/config";
import { setLocale } from "@/server/actions/locale-actions";

/**
 * Sprachumschalter.
 *
 * Zwei Sprachen, also zwei Knöpfe nebeneinander statt einer Auswahlliste –
 * man sieht auf einen Blick, was es gibt und was gerade gilt. Die Beschriftung
 * steht jeweils in der eigenen Sprache, sonst hilft sie dem nicht, der sie
 * sucht.
 */
export function LocaleSwitch({ className = "" }: { className?: string }) {
  const aktuell = useLocale() as Locale;
  const [laeuft, starte] = useTransition();

  return (
    <div
      className={`inline-flex overflow-hidden rounded border border-line ${className}`}
      role="group"
      aria-label="Sprache / Language"
    >
      {LOCALES.map((l) => {
        const gewaehlt = l === aktuell;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={gewaehlt}
            disabled={laeuft || gewaehlt}
            className={`px-2 py-1 text-[11px] uppercase tracking-wider transition-colors ${
              gewaehlt
                ? "bg-sand/20 text-sand font-medium"
                : "text-muted hover:text-sand disabled:opacity-50"
            }`}
            title={LOCALE_LABEL[l]}
            onClick={() => starte(() => void setLocale(l))}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
