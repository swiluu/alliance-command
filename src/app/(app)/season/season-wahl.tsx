"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setzeAktiveSeason } from "@/server/actions/season-actions";

/**
 * Umschalter für die laufende Season.
 *
 * Die Wahl gilt für alle, nicht nur für den, der sie trifft – sie steht in den
 * Einstellungen. Season 4 löst Season 3 ab, ohne dass jemand Code anfasst; die
 * Zuteilungen der alten Season bleiben erhalten und tauchen beim
 * Zurückschalten wieder auf.
 */
export function SeasonWahl({ aktuell, keys }: { aktuell: string; keys: string[] }) {
  const t = useTranslations("season");
  const router = useRouter();
  const [laeuft, starte] = useTransition();

  return (
    <label className="flex items-center gap-1">
      <span className="sr-only">{t("seasonWahl")}</span>
      <select
        className="input py-1"
        value={aktuell}
        disabled={laeuft}
        onChange={(e) => {
          const wert = e.target.value;
          starte(async () => {
            await setzeAktiveSeason(wert);
            router.refresh();
          });
        }}
      >
        {keys.map((k) => (
          <option key={k} value={k}>
            {t("kicker", { season: k })}
          </option>
        ))}
      </select>
    </label>
  );
}
