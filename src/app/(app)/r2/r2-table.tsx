"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ActionScope, useOptimisticRows } from "@/components/action";
import { TACTICAL_EVENTS } from "@/lib/constants";
import { togglePlayerR2 } from "@/server/actions/player-actions";

export type R2Row = {
  playerId: string;
  name: string;
  isR2: boolean;
  /** Beginn des laufenden Zeitraums, falls markiert. */
  since: string | null;
  markedBy: string | null;
  thpRaw: string | null;
  /** Events, in denen der Spieler auf "nimmt teil" steht. */
  registeredIn: string[];
};

/** Ein abgeschlossener Zeitraum – so war es einmal. */
export type R2History = {
  id: string;
  name: string;
  /** Kalenderwoche, in der die Markierung abgenommen wurde. */
  year: number;
  kw: number;
  markedBy: string | null;
  liftedBy: string | null;
};

/**
 * Markierung der im Spiel auf R2 Zurückgestuften.
 *
 * Als Namensraster und nicht als Tabelle: nach einem vergessenen Schild sind
 * das mehrere auf einmal, und die klickt man hintereinander weg. Wer markiert
 * ist, steht zusätzlich oben gesammelt – dort sieht man auf einen Blick, wer
 * trotz R2 noch angemeldet ist und beim Aussortieren dran wäre.
 *
 * Die Markierung sperrt nichts. Anmelden bleibt möglich, damit die
 * Anmeldungen beim wöchentlichen Gegenprüfen vollständig bleiben.
 */
/** Fasst die Historie zu Wochen zusammen, neueste zuerst. */
function gruppiereNachWoche(history: R2History[]) {
  const map = new Map<number, { year: number; kw: number; eintraege: R2History[] }>();
  for (const h of history) {
    const schluessel = h.year * 100 + h.kw;
    const vorhanden = map.get(schluessel);
    if (vorhanden) vorhanden.eintraege.push(h);
    else map.set(schluessel, { year: h.year, kw: h.kw, eintraege: [h] });
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, w]) => ({
      ...w,
      eintraege: [...w.eintraege].sort((a, b) => a.name.localeCompare(b.name, "de")),
    }));
}

export function R2Table({
  rows,
  history,
  canEdit,
}: {
  rows: R2Row[];
  history: R2History[];
  canEdit: boolean;
}) {
  const t = useTranslations("r2");
  const nachWoche = useMemo(() => gruppiereNachWoche(history), [history]);
  const tm = useTranslations("modules");
  const f = useFormatter();

  /** Kurzes Datum mit Uhrzeit. Als Optionen statt als benanntes Format: ein
   *  benanntes müsste in der next-intl-Konfiguration stehen, sonst fällt die
   *  Ausgabe auf die Rohform des Datums zurück. */
  const zeit = (iso: string) =>
    f.dateTime(new Date(iso), {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const [suche, setSuche] = useState("");
  const { rows: local, mutate } = useOptimisticRows(rows);

  const umschalten = (r: R2Row) =>
    mutate(
      (cur) => cur.map((x) => (x.playerId === r.playerId ? { ...x, isR2: !x.isR2 } : x)),
      () => togglePlayerR2(r.playerId),
    );

  const markiert = useMemo(() => local.filter((r) => r.isR2), [local]);
  const angemeldet = markiert.filter((r) => r.registeredIn.length > 0);

  const sichtbar = suche.trim()
    ? local.filter((r) => r.name.toLowerCase().includes(suche.trim().toLowerCase()))
    : local;

  return (
    <ActionScope>
      <div className="space-y-5">
        <header>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{t("kicker")}</p>
          <h1 className="text-3xl text-sand">{tm("r2")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">{t("intro")}</p>
        </header>

        <div className="panel">
          <div className="panel-head flex-wrap gap-3">
            <div>
              <h2 className="text-lg">{t("markedHeading", { count: markiert.length })}</h2>
              <p className="text-xs text-muted font-mono">
                {markiert.length === 0
                  ? t("noneMarked")
                  : t("markedSubline", { registered: angemeldet.length })}
              </p>
            </div>
          </div>

          {markiert.length > 0 && (
            <ul className="divide-y divide-line/60">
              {markiert.map((r) => (
                <li key={r.playerId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="tag border-danger text-danger font-mono">R2</span>
                  <span className="font-medium">{r.name}</span>
                  <span className="font-mono text-xs text-muted">
                    {r.since
                      ? t("sinceWhen", { date: zeit(r.since) })
                      : (r.thpRaw ?? "–")}
                  </span>
                  <div className="flex-1" />
                  {r.registeredIn.length > 0 && (
                    <span className="tag border-sand-dim text-sand">
                      {t("stillRegistered", {
                        events: r.registeredIn
                          .map((e) => tm(e as (typeof TACTICAL_EVENTS)[number]))
                          .join(", "),
                      })}
                    </span>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      className="btn text-xs"
                      onClick={() => umschalten(r)}
                      title={t("remove", { name: r.name })}
                    >
                      {t("removeShort")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <div className="panel-head flex-wrap gap-3">
            <div>
              <h2 className="text-lg">{t("pickHeading")}</h2>
              <p className="text-xs text-muted">{t("pickHint")}</p>
            </div>
            <input
              type="search"
              className="input w-full sm:w-56 py-1 text-sm"
              placeholder={t("search")}
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
          </div>

          <div className="p-3">
            {sichtbar.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{t("noMatch")}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {sichtbar.map((r) => (
                  <li key={r.playerId}>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => umschalten(r)}
                      aria-pressed={r.isR2}
                      className={`tag py-1.5 ${
                        r.isR2
                          ? "border-danger text-danger"
                          : "hover:border-sand-dim hover:text-sand"
                      }`}
                      title={r.isR2 ? t("remove", { name: r.name }) : t("mark", { name: r.name })}
                    >
                      {r.name}
                      {r.isR2 && <span className="ml-1.5 font-mono">R2</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Vergangenheit: wen hat es wann getroffen. Ohne das liesse sich nach
          einem Aufheben nicht mehr nachvollziehen, dass es überhaupt war. */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2 className="text-lg">{t("historyHeading")}</h2>
            <p className="text-xs text-muted">{t("historyHint")}</p>
          </div>
        </div>

        {history.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">{t("historyEmpty")}</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {nachWoche.map((w) => (
              <li key={`${w.year}-${w.kw}`} className="px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-sand">
                    {t("weekLabel", { kw: w.kw, year: w.year })}
                  </span>
                  <span className="tag">{w.eintraege.length}</span>
                </div>

                <ul className="mt-1.5 space-y-1">
                  {w.eintraege.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium">{h.name}</span>
                      {(h.markedBy || h.liftedBy) && (
                        <span className="text-[11px] text-muted">
                          {t("byWhom", {
                            marked: h.markedBy ?? "–",
                            lifted: h.liftedBy ?? "–",
                          })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ActionScope>
  );
}
