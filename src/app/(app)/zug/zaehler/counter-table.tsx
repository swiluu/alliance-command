"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type { CounterRow } from "@/server/zug-service";

type SortKey = "name" | "driverCount" | "vipCount" | "lastDrivenKW";

type Spalte = "colPlayer" | "colDriverCount" | "colVipCount" | "colLastDriven";

const COLUMNS: { key: SortKey; label: Spalte; align?: string }[] = [
  { key: "name", label: "colPlayer" },
  { key: "driverCount", label: "colDriverCount", align: "text-right" },
  { key: "vipCount", label: "colVipCount", align: "text-right" },
  { key: "lastDrivenKW", label: "colLastDriven", align: "text-right" },
];

export function CounterTable({
  rows,
  currentKW,
}: {
  rows: CounterRow[];
  currentKW: number;
}) {
  // Standard: wenigste Einsätze zuerst – macht sichtbar, wer fair dran wäre.
  const t = useTranslations("zug");
  const [sort, setSort] = useState<SortKey>("driverCount");
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "de") * dir;
      if (sort === "lastDrivenKW") {
        // "nie gefahren" sortiert bei aufsteigend nach vorn.
        const av = a.lastDrivenKW ?? -1;
        const bv = b.lastDrivenKW ?? -1;
        return (av - bv) * dir || a.name.localeCompare(b.name, "de");
      }
      return (a[sort] - b[sort]) * dir || a.name.localeCompare(b.name, "de");
    });
  }, [rows, sort, asc]);

  function toggle(key: SortKey) {
    if (key === sort) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(key === "name" ? true : true);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2 className="text-lg">{t("counterHeading")}</h2>
          <p className="text-xs text-muted font-mono">
            {t("counterSubline", { kw: currentKW })}
          </p>
        </div>
      </div>

      {/* Handy: Sortierung als Knopfreihe statt Tabellenkopf. */}
      <div className="md:hidden border-b border-line px-3 py-2">
        <span className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">
          {t("sortBy")}
        </span>
        <div className="flex flex-wrap gap-1">
          {COLUMNS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => toggle(c.key)}
              className={`tag py-1.5 px-2 ${
                sort === c.key ? "border-sand text-sand" : "hover:border-sand-dim"
              }`}
            >
              {t(c.label)}
              {sort === c.key && <span aria-hidden> {asc ? "▲" : "▼"}</span>}
            </button>
          ))}
        </div>
      </div>

      <ul className="md:hidden p-3 space-y-1.5">
        {sorted.map((r, i) => (
          <li
            key={r.playerId}
            className="rounded border border-line bg-panel-2/40 px-3 py-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium truncate">
                <span className="font-mono text-xs text-muted mr-2">{i + 1}</span>
                {r.name}
              </span>
              {r.isR4Rotation && (
                <span className="tag shrink-0 border-sand-dim text-sand">R4</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-xs text-muted">
              <span>{t("cardDriver", { count: r.driverCount })}</span>
              <span>{t("cardVip", { count: r.vipCount })}</span>
              <span>
                {t("cardLast", {
                  value:
                    r.lastDrivenKW === null
                      ? t("never")
                      : t("weekShort", { kw: r.lastDrivenKW }),
                })}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
              <th className="px-3 py-2 w-10">#</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className={`px-3 py-2 ${c.align ?? ""}`}>
                  <button
                    type="button"
                    className="hover:text-sand"
                    onClick={() => toggle(c.key)}
                    aria-sort={sort === c.key ? (asc ? "ascending" : "descending") : "none"}
                  >
                    {t(c.label)}
                    {sort === c.key && <span aria-hidden> {asc ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.playerId} className="border-b border-line/60 hover:bg-panel-2/50">
                <td className="px-3 py-2 font-mono text-muted">{i + 1}</td>
                <td className="px-3 py-2">
                  {r.name}
                  {r.isR4Rotation && (
                    <span className="tag ml-2 border-sand-dim text-sand">R4</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono">{r.driverCount}</td>
                <td className="px-3 py-2 text-right font-mono">{r.vipCount}</td>
                <td className="px-3 py-2 text-right font-mono text-muted">
                  {r.lastDrivenKW === null
                    ? t("never")
                    : t("weekShort", { kw: r.lastDrivenKW })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
