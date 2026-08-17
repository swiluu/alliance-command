"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ActionScope, useOptimisticRows } from "@/components/action";
import { BAN_DURATION_WEEKS } from "@/lib/constants";
import { setRotationStatus } from "@/server/actions/event-actions";

export type AttendanceRow = {
  playerId: string;
  name: string;
  thpRaw: string | null;
  team: string | null;
  position: string | null;
  isSubstitute: boolean;
  fehlt: boolean;
};

/**
 * Anwesenheitskontrolle nach dem Event.
 *
 * "Fehlt (angemeldet)" liess sich bisher nur Zelle für Zelle in der
 * Rotations-Historie setzen – einer Tabelle mit 53 Spalten. Hier steht
 * stattdessen die Mannschaft dieser Woche untereinander, ein Tippen je Person.
 *
 * Geschrieben wird derselbe Status wie dort. Der Wochenabschluss lässt ihn
 * stehen und löst daraus die Zwei-Wochen-Sperre aus.
 */
export function AttendanceList({
  eventKey,
  week,
  rows: serverRows,
  canEdit,
}: {
  eventKey: string;
  week: number;
  rows: AttendanceRow[];
  canEdit: boolean;
}) {
  const t = useTranslations("attendance");
  const tt = useTranslations("teams");
  const { rows, mutate } = useOptimisticRows(serverRows);
  const [query, setQuery] = useState("");
  const [nurFehlende, setNurFehlende] = useState(false);

  const umschalten = (r: AttendanceRow) =>
    mutate(
      (cur) =>
        cur.map((x) => (x.playerId === r.playerId ? { ...x, fehlt: !x.fehlt } : x)),
      () =>
        setRotationStatus(
          eventKey,
          r.playerId,
          week,
          r.fehlt ? "" : "FEHLT_ANGEMELDET",
        ),
    );

  const gefiltert = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) => (!nurFehlende || r.fehlt) && (!q || r.name.toLowerCase().includes(q)),
    );
  }, [rows, query, nurFehlende]);

  const fehlen = rows.filter((r) => r.fehlt).length;

  // Aufgeteilt nach Team, damit man beim Durchgehen der Aufstellung folgen kann.
  const gruppen: { titel: string; eintraege: AttendanceRow[] }[] = [
    { titel: "Team A", eintraege: gefiltert.filter((r) => r.team === "A") },
    { titel: "Team B", eintraege: gefiltert.filter((r) => r.team === "B") },
    { titel: t("noTeam"), eintraege: gefiltert.filter((r) => !r.team) },
  ].filter((g) => g.eintraege.length > 0);

  return (
    <ActionScope>
      <div className="panel">
        <div className="panel-head flex-wrap gap-2">
          <div>
            <h2 className="text-lg">{t("heading", { week })}</h2>
            <p className="text-xs text-muted font-mono">
              {t("subline", { count: rows.length, missing: fehlen })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input w-44 py-2.5 text-[16px] sm:py-1.5 sm:text-sm"
              placeholder={t("searchName")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={tt("searchAria")}
            />
            <button
              type="button"
              className={`btn text-xs ${nurFehlende ? "btn-primary" : ""}`}
              onClick={() => setNurFehlende((v) => !v)}
              aria-pressed={nurFehlende}
            >
              {t("onlyMissing")}
            </button>
          </div>
        </div>

        <div className="p-3 space-y-4">
          {gruppen.map((g) => (
            <section key={g.titel}>
              <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">
                {g.titel}
                <span className="ml-2 font-mono">{g.eintraege.length}</span>
              </h3>
              <ul className="space-y-1">
                {g.eintraege.map((r) => (
                  <li
                    key={r.playerId}
                    className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                      r.fehlt
                        ? "border-danger/50 bg-danger/10"
                        : "border-line bg-panel-2/40"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/spieler/${r.playerId}`}
                        className="block truncate text-sm hover:text-sand"
                      >
                        {r.name}
                      </Link>
                      <div className="font-mono text-[11px] text-muted">
                        {r.position ?? (r.team ? t("noPosition") : t("notFielded"))}
                        {r.isSubstitute && ` · ${t("substitute")}`}
                        {r.thpRaw && ` · ${r.thpRaw}`}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => umschalten(r)}
                      aria-pressed={r.fehlt}
                      className={`shrink-0 rounded border px-3 py-2 text-xs md:py-1.5 ${
                        r.fehlt
                          ? "border-danger text-danger"
                          : "border-line text-muted hover:border-sand-dim hover:text-sand"
                      } ${canEdit ? "" : "cursor-not-allowed opacity-60"}`}
                    >
                      {r.fehlt ? t("wasMissing") : t("wasThere")}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {gefiltert.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">
              {nurFehlende ? t("nobodyMissing") : t("noHit")}
            </p>
          )}
        </div>

        <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
          {t("footnote", { ban: BAN_DURATION_WEEKS })}
        </p>
      </div>
    </ActionScope>
  );
}
