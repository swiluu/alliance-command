"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { ActionScope, useOptimisticRows } from "@/components/action";
import { setTeamAssignment } from "@/server/actions/event-actions";
import type { PoolPlayer } from "@/server/event-service";

type Row = PoolPlayer & { team: "A" | "B" | null };
type Choice = "A" | "B" | null;

// "Team A" und "Team B" heissen in beiden Sprachen gleich; erklärungsbedürftig
// ist nur, was der Knopf bewirkt – das steht unter `teams.choose*`.
const CHOICES: {
  value: Choice;
  label: string;
  cls: string;
  title: "chooseA" | "chooseB" | "chooseNone";
}[] = [
  { value: "A", label: "Team A", cls: "border-ok/60 bg-ok/15 text-ok", title: "chooseA" },
  { value: "B", label: "Team B", cls: "border-sand/60 bg-sand/15 text-sand", title: "chooseB" },
  { value: null, label: "–", cls: "border-line bg-panel-2 text-muted", title: "chooseNone" },
];

/**
 * Schritt 1 der Wochenplanung: wer spielt in welchem Team, wer setzt aus.
 * Die Liste ist nach Priorität sortiert, damit oben steht, wer am ehesten
 * dran ist. Die Positionen innerhalb des Teams werden danach in der
 * Wochenplanung verteilt.
 */
export function TeamAssignment({
  eventKey,
  week,
  rows,
  canEdit,
  slotsPerTeam,
}: {
  eventKey: string;
  week: number;
  rows: Row[];
  canEdit: boolean;
  slotsPerTeam: number;
}) {
  const t = useTranslations("teams");
  const [query, setQuery] = useState("");

  /**
   * Die Zuteilung wird sofort lokal gesetzt und erst danach gespeichert –
   * beim Durchgehen von 70 Spielern soll kein Klick auf den Server warten.
   */
  const { rows: local, mutate } = useOptimisticRows(rows);

  const choose = useCallback(
    (playerId: string, team: Choice) =>
      mutate(
        (current) => current.map((r) => (r.playerId === playerId ? { ...r, team } : r)),
        () => setTeamAssignment(eventKey, playerId, team),
      ),
    [eventKey, mutate],
  );

  const counts = useMemo(() => {
    let a = 0;
    let b = 0;
    let out = 0;
    for (const r of local) {
      if (r.team === "A") a++;
      else if (r.team === "B") b++;
      else out++;
    }
    return { a, b, out };
  }, [local]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return local;
    return local.filter((r) => r.name.toLowerCase().includes(q));
  }, [local, query]);

  return (
    <ActionScope>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Counter label="Team A" value={counts.a} max={slotsPerTeam} tone="ok" />
        <Counter label="Team B" value={counts.b} max={slotsPerTeam} tone="sand" />
        <div className="panel px-3 py-2 font-mono text-sm">
          <span className="text-muted">{t("sittingOut")}</span> {counts.out}
        </div>
        <div className="flex-1" />
        <Link href={`/${eventKey}/planung`} className="btn text-xs">
          {t("toPlanning")}
        </Link>
      </div>

      <div className="panel">
        <div className="panel-head flex-wrap">
          <div>
            <h2 className="text-lg">{t("heading", { week })}</h2>
            <p className="text-xs text-muted font-mono">
              {t("subline", { count: local.length })}
            </p>
          </div>
          <input
            className="input w-44"
            placeholder={t("search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("searchAria")}
          />
        </div>

        {/* Handy: eine Karte pro Spieler statt seitlich scrollender Tabelle. */}
        <ul className="md:hidden p-3 space-y-2">
          {filtered.map((r, i) => (
            <li key={r.playerId} className="rounded border border-line bg-panel-2/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium leading-tight truncate">
                    <span className="font-mono text-xs text-muted mr-2">{i + 1}</span>
                    {r.name}
                  </div>
                  <div className="font-mono text-[11px] text-muted">
                    {r.thpRaw ?? t("noThp")}
                  </div>
                </div>
                <span className={`tag shrink-0 ${r.tag.cls}`}>{r.tag.icon}</span>
              </div>

              <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-muted">
                <span>
                  {t("lastPlayed")}:{" "}
                  {r.lastWeek === 0 ? t("never") : t("week", { week: r.lastWeek })}
                </span>
                <span>
                  {t("lastSkipped")}:{" "}
                  {r.lastSkippedWeek === 0
                    ? t("never")
                    : t("week", { week: r.lastSkippedWeek })}
                </span>
              </div>

              <div className="mt-2 flex gap-1.5" role="group" aria-label={t("assignAria", { name: r.name })}>
                {CHOICES.map((c) => {
                  const active = r.team === c.value;
                  return (
                    <button
                      key={c.label}
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={active}
                      onClick={() => choose(r.playerId, c.value)}
                      className={`flex-1 rounded border py-2.5 text-sm transition-colors ${
                        active ? c.cls : "border-line text-muted"
                      } ${!canEdit ? "opacity-60" : ""}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="py-8 text-center text-muted text-sm">{t("empty")}</li>
          )}
        </ul>

        <div className="hidden md:block scroll-x">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">{t("colPlayer")}</th>
                <th className="px-3 py-2 w-56">{t("colPriority")}</th>
                <th className="px-3 py-2 w-32">{t("lastPlayed")}</th>
                <th className="px-3 py-2 w-40">{t("lastSkipped")}</th>
                <th className="px-3 py-2 w-60">{t("colAssignment")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <TeamRow key={r.playerId} index={i + 1} row={r} canEdit={canEdit} onChoose={choose} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        {t.rich("footnote", {
          b: (chunks) => <span className="text-ink">{chunks}</span>,
        })}
      </p>
    </ActionScope>
  );
}

function Counter({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "ok" | "sand";
}) {
  const full = value >= max;
  const over = value > max;
  return (
    <div
      className={`panel px-3 py-2 font-mono text-sm border ${
        over
          ? "border-danger text-danger"
          : full
            ? "border-ok/60 text-ok"
            : tone === "ok"
              ? "border-ok/30"
              : "border-sand-dim/60"
      }`}
    >
      <span className="text-muted">{label}:</span> {value} / {max}
    </div>
  );
}

function TeamRow({
  index,
  row,
  canEdit,
  onChoose,
}: {
  index: number;
  row: Row;
  canEdit: boolean;
  onChoose: (playerId: string, team: Choice) => void;
}) {
  const t = useTranslations("teams");
  const tp = useTranslations("priority");

  return (
    <tr className="border-b border-line/60 hover:bg-panel-2/50">
      <td className="px-3 py-2 font-mono text-muted">{index}</td>

      <td className="px-3 py-2">
        <div className="font-medium leading-tight">
          {row.name}
        </div>
        <div className="font-mono text-[11px] text-muted">{row.thpRaw ?? t("noThp")}</div>
      </td>

      <td className="px-3 py-2">
        <span className={`tag ${row.tag.cls}`}>
          {row.tag.icon} {tp(row.tag.key)}
        </span>
      </td>

      <td className="px-3 py-2 font-mono text-xs text-muted">
        {row.lastWeek === 0 ? t("never") : t("week", { week: row.lastWeek })}
      </td>

      <td
        className="px-3 py-2 font-mono text-xs text-muted"
        title={`${t("lastSkipped")}: ${
          row.lastSkippedWeek === 0 ? t("never") : t("week", { week: row.lastSkippedWeek })
        }`}
      >
        {row.lastSkippedWeek === 0 ? t("never") : t("week", { week: row.lastSkippedWeek })}
      </td>

      <td className="px-3 py-2">
        <div className="flex gap-1" role="group" aria-label={t("assignAria", { name: row.name })}>
          {CHOICES.map((c) => {
            const active = row.team === c.value;
            return (
              <button
                key={c.label}
                type="button"
                disabled={!canEdit}
                aria-pressed={active}
                title={t(c.title)}
                onClick={() => onChoose(row.playerId, c.value)}
                className={`flex-1 rounded border px-2 py-1 text-xs transition-colors ${
                  active ? c.cls : "border-line text-muted hover:border-sand-dim"
                } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </td>
    </tr>
  );
}
