"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

export type RankingRow = {
  rank: number;
  name: string;
  country: string | null;
  /** null, wenn für den Spieler nirgends ein Wert vorliegt. */
  thp: string | null;
  power: string | null;
  /** Rang auf dem Server – null, wenn ausserhalb der Top 200 der Quelle. */
  serverRank: number | null;
  /** THP stammt aus dem zuletzt bekannten Wert. */
  stale: boolean;
};

/** "2026-08-08T08:22:24+02:00" → "08.08.2026, 08:22" bzw. die englische Form. */
function standLabel(iso: string | null, locale: string, unbekannt: string): string {
  if (!iso) return unbekannt;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return unbekannt;
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

export function RankingTable({
  rows,
  stand,
}: {
  rows: RankingRow[];
  stand: string | null;
}) {
  const t = useTranslations("ranking");
  const locale = useLocale();
  const [query, setQuery] = useState("");

  const gefiltert = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  return (
    <div className="panel">
      <div className="panel-head flex-wrap gap-2">
        <div>
          <h2 className="text-lg">{t("players", { count: rows.length })}</h2>
          <p className="text-xs text-muted font-mono">
            {t("asOf", { date: standLabel(stand, locale, t("unknown")) })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-44 py-2.5 text-[16px] sm:py-1.5 sm:text-sm"
            placeholder={t("search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("searchAria")}
          />
        </div>
      </div>

      {/* Handy: eine Zeile pro Spieler, ohne Tabellengerüst */}
      <ul className="md:hidden divide-y divide-line/60">
        {gefiltert.map((r) => (
          <li key={r.rank} className="flex items-center gap-3 px-3 py-2.5">
            <RankBadge rank={r.rank} />
            <div className="min-w-0 flex-1">
              <div className="truncate">{r.name}</div>
              <div className="font-mono text-[11px] text-muted">
                {r.serverRank
                  ? t("serverRankShort", { rank: r.serverRank })
                  : t("outsideTop200")}
                {r.country && ` · ${r.country}`}
              </div>
            </div>
            <div className="shrink-0 text-right font-mono text-sm">
              {r.thp ?? <span className="text-muted">{t("noValue")}</span>}
              {r.thp && r.stale && <span title={t("staleTitle")}> *</span>}
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden md:block scroll-x">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
              <th className="px-3 py-2 w-16">{t("colRank")}</th>
              <th className="px-3 py-2">{t("colName")}</th>
              <th className="px-3 py-2 w-16">{t("colCountry")}</th>
              <th className="px-3 py-2 w-28 text-right">{t("colThp")}</th>
              <th className="px-3 py-2 w-28 text-right">{t("colPower")}</th>
              <th className="px-3 py-2 w-28 text-right">{t("colServerRank")}</th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((r) => (
              <tr key={r.rank} className="border-b border-line/40 hover:bg-panel-2/40">
                <td className="px-3 py-1.5">
                  <RankBadge rank={r.rank} />
                </td>
                <td className="px-3 py-1.5">{r.name}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-muted">
                  {r.country ?? "–"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {r.thp ?? <span className="text-muted">{t("noValue")}</span>}
                  {r.thp && r.stale && (
                    <span className="text-muted" title={t("staleTitle")}>
                      {" *"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-muted">
                  {r.power ?? "–"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-muted">
                  {r.serverRank ?? "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {gefiltert.length === 0 && (
        <p className="px-3 py-8 text-center text-sm text-muted">{t("noHit")}</p>
      )}

      <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
        {t.rich("footnote", {
          c: (chunks) => <span className="font-mono">{chunks}</span>,
        })}
      </p>
    </div>
  );
}

/** Die ersten drei Plätze bekommen etwas Gewicht, der Rest bleibt ruhig. */
function RankBadge({ rank }: { rank: number }) {
  const top = rank <= 3;
  return (
    <span
      className={`inline-flex h-6 w-8 items-center justify-center rounded font-mono text-xs ${
        top ? "bg-sand/20 text-sand" : "text-muted"
      }`}
    >
      {rank}
    </span>
  );
}
