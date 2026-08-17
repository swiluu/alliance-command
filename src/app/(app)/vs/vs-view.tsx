"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { weekRangeLabel, type Week } from "@/lib/iso-week";
import { VS_TOP_N } from "@/lib/vs";
import type { VsRow } from "@/server/vs-service";

/**
 * Die Rangliste. Sie entscheidet nichts – die VIP-Felder im Wochenplan
 * bleiben Handarbeit. Sie zeigt nur, wer nach der Regel der Allianz dran
 * wäre: Schnitt über vier Wochen, R4 ausgenommen, die besten sieben.
 */
export function VsView({
  weeks,
  rows,
  available,
  window: fenster,
}: {
  weeks: Week[];
  rows: VsRow[];
  available: Week[];
  window: number;
}) {
  const t = useTranslations("vs");
  const f = useFormatter();
  const router = useRouter();
  const params = useSearchParams();
  const [alle, setAlle] = useState(false);

  const kompakt = (n: number) =>
    f.number(n, { notation: "compact", maximumFractionDigits: 1 });

  if (weeks.length === 0) {
    return (
      <div className="panel p-6 text-center">
        <p className="text-sm text-muted">{t("empty")}</p>
      </div>
    );
  }

  const vips = rows.filter((r) => r.vipRank !== null);
  const sichtbar = alle ? rows : rows.slice(0, VS_TOP_N);
  const ende = weeks[weeks.length - 1];

  // weekRangeLabel liefert "03.08-09.08.26" für eine einzelne Woche. Für das
  // Fenster gehören der Anfang der ersten und das Ende der letzten zusammen.
  const spanne = `${weekRangeLabel(weeks[0]).split("-")[0]}–${
    weekRangeLabel(ende).split("-")[1]
  }`;

  function waehleWoche(wert: string) {
    const next = new URLSearchParams(params.toString());
    if (wert) next.set("bis", wert);
    else next.delete("bis");
    router.push(`/vs${next.size > 0 ? `?${next}` : ""}`);
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head flex-wrap gap-3">
          <div>
            <h2 className="text-lg">{t("heading")}</h2>
            <p className="text-xs text-muted font-mono">
              {t("subline", { from: weeks[0].kw, to: ende.kw, range: spanne })}
            </p>
          </div>

          {available.length > weeks.length && (
            <label className="text-xs text-muted">
              <span className="mr-2">{t("upTo")}</span>
              <select
                className="input py-1 text-sm"
                value={`${ende.year}-${ende.kw}`}
                onChange={(e) => waehleWoche(e.target.value)}
              >
                {available.map((w) => (
                  <option key={`${w.year}-${w.kw}`} value={`${w.year}-${w.kw}`}>
                    {t("weekOption", { kw: w.kw, year: w.year })}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Der eigentliche Zweck der Seite: wer hat nach der Regel Anspruch. */}
        <div className="p-4 border-b border-line">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted mb-2">
            {t("vipHeading", { count: vips.length })}
          </p>
          {vips.length === 0 ? (
            <p className="text-sm text-muted">{t("vipNone")}</p>
          ) : (
            <ol className="flex flex-wrap gap-1.5">
              {vips.map((r) => (
                <li key={r.playerId ?? r.name} className="tag border-ok text-ok">
                  <span className="font-mono mr-1.5">{r.vipRank}</span>
                  {r.name}
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-xs text-muted">{t("vipHint")}</p>
        </div>

        {/* Handy: eine Karte je Spieler, die Wochenspalten wären zu schmal. */}
        <ul className="md:hidden p-3 space-y-1.5">
          {sichtbar.map((r) => (
            <li
              key={r.playerId ?? r.name}
              className={`rounded border px-3 py-2 ${
                r.vipRank !== null ? "border-ok bg-ok/5" : "border-line bg-panel-2/40"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium truncate">
                  <span className="font-mono text-xs text-muted mr-2">{r.rank}</span>
                  {r.name}
                </span>
                <span className="font-mono text-sm shrink-0">{kompakt(r.average)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {r.vipRank !== null && (
                  <span className="tag border-ok text-ok">
                    {t("vipSlot", { rank: r.vipRank })}
                  </span>
                )}
                {r.isR4 && <span className="tag border-sand-dim text-sand">{t("r4")}</span>}
                {r.former && <span className="tag border-line text-muted">{t("former")}</span>}
                {r.playerId === null && (
                  <span className="tag border-danger text-danger">{t("unassigned")}</span>
                )}
                {r.filled < fenster && (
                  <span className="tag border-line text-muted">
                    {t("filled", { filled: r.filled, window: fenster })}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="hidden md:block scroll-x">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">{t("colPlayer")}</th>
                {weeks.map((w) => (
                  <th key={`${w.year}-${w.kw}`} className="px-3 py-2 text-right">
                    {t("weekShort", { kw: w.kw })}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">{t("colAverage")}</th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((r) => (
                <tr
                  key={r.playerId ?? r.name}
                  className={`border-b border-line/60 hover:bg-panel-2/50 ${
                    r.vipRank !== null ? "bg-ok/5" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-muted">{r.rank}</td>
                  <td className="px-3 py-2">
                    {r.name}
                    {r.vipRank !== null && (
                      <span className="tag ml-2 border-ok text-ok">
                        {t("vipSlot", { rank: r.vipRank })}
                      </span>
                    )}
                    {r.isR4 && (
                      <span className="tag ml-2 border-sand-dim text-sand">{t("r4")}</span>
                    )}
                    {r.former && (
                      <span className="tag ml-2 border-line text-muted">{t("former")}</span>
                    )}
                    {r.playerId === null && (
                      <span className="tag ml-2 border-danger text-danger">
                        {t("unassigned")}
                      </span>
                    )}
                  </td>
                  {r.points.map((p, i) => (
                    <td
                      key={`${weeks[i].year}-${weeks[i].kw}`}
                      className={`px-3 py-2 text-right font-mono ${
                        p === null ? "text-danger" : "text-muted"
                      }`}
                    >
                      {p === null ? "–" : kompakt(p)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono">{kompakt(r.average)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length > VS_TOP_N && (
          <div className="p-3 border-t border-line text-center">
            <button type="button" className="btn text-sm" onClick={() => setAlle((v) => !v)}>
              {alle ? t("showTop", { count: VS_TOP_N }) : t("showAll", { count: rows.length })}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
