"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { PlayerLink } from "@/components/player-link";
import type { EventFairness, FairnessReport, ZugFairness } from "@/server/fairness";

type Tab = string;

/** Spalten, nach denen sich sortieren lässt. */
type EventSort = "name" | "einsaetze" | "ausgesetzt" | "gefehlt" | "abweichung";
type ZugSort = "name" | "gefahren" | "vip" | "zuletzt";

export function FairnessView({
  report,
  labels,
  mitZug,
}: {
  report: FairnessReport;
  labels: Record<string, string>;
  mitZug: boolean;
}) {
  const t = useTranslations("fairness");
  const tm = useTranslations("modules");
  const tabs: Tab[] = [...report.events.map((e) => e.eventKey), ...(mitZug ? ["zug"] : [])];
  const [tab, setTab] = useState<Tab>(tabs[0] ?? "zug");
  const [query, setQuery] = useState("");

  if (tabs.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="scroll-x flex gap-1.5">
          {tabs.map((reiter) => (
            <button
              key={reiter}
              type="button"
              onClick={() => setTab(reiter)}
              aria-pressed={tab === reiter}
              className={`whitespace-nowrap rounded border px-3 py-2 text-sm transition-colors ${
                tab === reiter
                  ? "border-sand bg-sand/15 text-sand font-medium"
                  : "border-line bg-panel-2 text-ink hover:border-sand-dim"
              }`}
            >
              {reiter === "zug" ? tm("zug") : (labels[reiter] ?? reiter)}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <input
          className="input w-44 py-2.5 text-[16px] sm:py-1.5 sm:text-sm"
          placeholder={t("searchName")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("searchAria")}
        />
      </div>

      {tab === "zug" ? (
        <ZugTable rows={report.zug} query={query} />
      ) : (
        <EventTable
          data={report.events.find((e) => e.eventKey === tab)!}
          label={labels[tab] ?? tab}
          query={query}
        />
      )}
    </div>
  );
}

function EventTable({
  data,
  label,
  query,
}: {
  data: FairnessReport["events"][number];
  label: string;
  query: string;
}) {
  // Voreinstellung: die wenigsten Einsätze zuerst. Das ist die Frage, mit der
  // man auf diese Seite kommt.
  const t = useTranslations("fairness");
  const [sort, setSort] = useState<EventSort>("einsaetze");
  const [auf, setAuf] = useState(true);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const gefiltert = q
      ? data.rows.filter((r) => r.name.toLowerCase().includes(q))
      : data.rows;

    const wert = (r: EventFairness) =>
      sort === "name" ? 0 : sort === "abweichung" ? r.abweichung : r[sort];

    // Wer nie angemeldet war, steht immer unten – egal nach welcher Spalte und
    // in welche Richtung sortiert wird. Null Einsätze sind zwar rechnerisch
    // die wenigsten, sagen aber nichts über Fairness aus, wenn die Person nie
    // zur Verfügung stand.
    const ohneDaten = (r: EventFairness) => r.quote === null;

    return [...gefiltert].sort((a, b) => {
      if (ohneDaten(a) !== ohneDaten(b)) return ohneDaten(a) ? 1 : -1;
      if (ohneDaten(a)) return a.name.localeCompare(b.name, "de");
      if (sort === "name") return a.name.localeCompare(b.name, "de") * (auf ? 1 : -1);
      const x = wert(a) ?? 0;
      const y = wert(b) ?? 0;
      return (x - y) * (auf ? 1 : -1) || a.name.localeCompare(b.name, "de");
    });
  }, [data.rows, query, sort, auf]);

  const umschalten = (s: EventSort) => {
    if (s === sort) setAuf((v) => !v);
    else {
      setSort(s);
      setAuf(s === "name");
    }
  };

  const kopf = (s: EventSort, text: string, rechts = true) => (
    <th
      className={`px-3 py-2 ${rechts ? "text-right" : "text-left"} cursor-pointer select-none hover:text-sand`}
      onClick={() => umschalten(s)}
      title={t("sortByColumn")}
    >
      {text}
      {sort === s && <span className="ml-1">{auf ? "▲" : "▼"}</span>}
    </th>
  );

  return (
    <div className="panel">
      <div className="panel-head flex-wrap gap-2">
        <div>
          <h2 className="text-lg">{label}</h2>
          <p className="text-xs text-muted font-mono">
            {t("average")}
            {data.schnitt === null
              ? "—"
              : t("averageValue", { percent: Math.round(data.schnitt * 100) })}
          </p>
        </div>
      </div>

      {/* Handy: eine Karte pro Spieler */}
      <ul className="md:hidden divide-y divide-line/60">
        {rows.map((r) => (
          <li key={r.playerId} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <PlayerLink playerId={r.playerId} name={r.name} className="block truncate" />
              <div className="font-mono text-[11px] text-muted">
                {t("cardLine", { played: r.einsaetze, satOut: r.ausgesetzt })}
                {r.gefehlt > 0 && t("cardMissed", { count: r.gefehlt })}
              </div>
            </div>
            <Vergleich wert={r.abweichung} verfuegbar={r.verfuegbar} />
          </li>
        ))}
      </ul>

      <div className="hidden md:block scroll-x">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted border-b border-line">
              {kopf("name", t("colName"), false)}
              {kopf("einsaetze", t("colAppearances"))}
              {kopf("ausgesetzt", t("colSatOut"))}
              {kopf("gefehlt", t("colMissed"))}
              <th className="px-3 py-2 text-right">{t("colPresent")}</th>
              {kopf("abweichung", t("colCompare"))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.playerId} className="border-b border-line/40 hover:bg-panel-2/40">
                <td className="px-3 py-1.5">
                  <PlayerLink playerId={r.playerId} name={r.name} />
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{r.einsaetze}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.ausgesetzt}</td>
                <td
                  className={`px-3 py-1.5 text-right font-mono ${
                    r.gefehlt > 0 ? "text-danger" : "text-muted"
                  }`}
                >
                  {r.gefehlt || "–"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-muted">
                  {r.verfuegbar === 0
                    ? "–"
                    : t("outOf", { played: r.einsaetze, available: r.verfuegbar })}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Vergleich wert={r.abweichung} verfuegbar={r.verfuegbar} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="px-3 py-8 text-center text-sm text-muted">{t("noHit")}</p>
      )}

      <Erklaerung schnitt={data.schnitt} />
    </div>
  );
}

/** Was die Spalten bedeuten – mit durchgerechnetem Beispiel. */
function Erklaerung({ schnitt }: { schnitt: number | null }) {
  const t = useTranslations("fairness");
  const prozent = schnitt === null ? 84 : Math.round(schnitt * 100);

  return (
    <details className="border-t border-line px-3 py-2 text-xs text-muted">
      <summary className="cursor-pointer select-none hover:text-sand">
        {t("explainSummary")}
      </summary>

      <table className="mt-3 w-full max-w-2xl">
        <tbody className="[&_td]:py-1 [&_td]:align-top">
          <tr>
            <td className="w-32 pr-3 text-ink">{t("colAppearances")}</td>
            <td>{t("explainAppearances")}</td>
          </tr>
          <tr>
            <td className="pr-3 text-ink">{t("colSatOut")}</td>
            <td>{t("explainSatOut")}</td>
          </tr>
          <tr>
            <td className="pr-3 text-ink">{t("colMissed")}</td>
            <td>{t("explainMissed")}</td>
          </tr>
          <tr>
            <td className="pr-3 text-ink">{t("colPresent")}</td>
            <td>{t("explainPresent")}</td>
          </tr>
          <tr>
            <td className="pr-3 text-ink">{t("colCompare")}</td>
            <td>{t("explainCompare")}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-3 max-w-2xl">
        <span className="text-ink">{t("exampleLabel")}</span>{" "}
        {t.rich("example", {
          percent: prozent,
          diff: 50 - prozent,
          word:
            50 - prozent <= -10
              ? t("lessOften")
              : 50 - prozent >= 10
                ? t("moreOften")
                : t("onAverage"),
          n: (chunks) => <span className="font-mono">{chunks}</span>,
        })}
      </p>

      <p className="mt-2 max-w-2xl">{t("explainMinus")}</p>
    </details>
  );
}

/**
 * Vergleich zum Schnitt – in Worten, mit der Zahl als Beleg dahinter.
 * Die blosse Punktzahl hat niemand verstanden, und das zu Recht: sie ist eine
 * Differenz zweier Prozentsätze und sagt für sich genommen nichts.
 */
function Vergleich({ wert, verfuegbar }: { wert: number | null; verfuegbar: number }) {
  const t = useTranslations("fairness");

  if (wert === null) {
    return (
      <span className="font-mono text-xs text-muted">
        {verfuegbar === 0
          ? t("neverRegistered")
          : t("onlyWeeks", { count: verfuegbar })}
      </span>
    );
  }
  const p = Math.round(wert);
  const [text, farbe] =
    p >= 10
      ? [t("moreOften"), "text-ok"]
      : p <= -10
        ? [t("lessOften"), "text-sand"]
        : [t("onAverage"), "text-muted"];

  return (
    <span className={`text-xs ${farbe}`}>
      {text}
      {Math.abs(p) >= 10 && (
        <span className="ml-1 font-mono opacity-70">
          {p > 0 ? "+" : ""}
          {p}
        </span>
      )}
    </span>
  );
}

function ZugTable({ rows, query }: { rows: ZugFairness[]; query: string }) {
  const t = useTranslations("fairness");
  const tm = useTranslations("modules");
  const [sort, setSort] = useState<ZugSort>("gefahren");
  const [auf, setAuf] = useState(false);

  const gefiltert = useMemo(() => {
    const q = query.trim().toLowerCase();
    const basis = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    const wert = (r: ZugFairness) =>
      sort === "zuletzt"
        ? r.zuletztGefahren
          ? r.zuletztGefahren.year * 100 + r.zuletztGefahren.kw
          : 0
        : sort === "name"
          ? 0
          : r[sort];
    return [...basis].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "de") * (auf ? 1 : -1);
      return ((wert(a) as number) - (wert(b) as number)) * (auf ? 1 : -1);
    });
  }, [rows, query, sort, auf]);

  const umschalten = (s: ZugSort) => {
    if (s === sort) setAuf((v) => !v);
    else {
      setSort(s);
      setAuf(s === "name");
    }
  };

  const kopf = (s: ZugSort, text: string, rechts = true) => (
    <th
      className={`px-3 py-2 ${rechts ? "text-right" : "text-left"} cursor-pointer select-none hover:text-sand`}
      onClick={() => umschalten(s)}
    >
      {text}
      {sort === s && <span className="ml-1">{auf ? "▲" : "▼"}</span>}
    </th>
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2 className="text-lg">{tm("zug")}</h2>
          <p className="text-xs text-muted font-mono">
            {t("zugSubline", {
              r4: rows.filter((r) => r.isR4Rotation).length,
              drove: rows.filter((r) => r.gefahren > 0).length,
            })}
          </p>
        </div>
      </div>

      <ul className="md:hidden divide-y divide-line/60">
        {gefiltert.map((r) => (
          <li key={r.playerId} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate">
                <PlayerLink playerId={r.playerId} name={r.name} />
                {r.isR4Rotation && <span className="ml-1 text-[10px] text-sand">R4</span>}
              </div>
              <div className="font-mono text-[11px] text-muted">
                {t("zugCardLine", { drove: r.gefahren, vip: r.vip })}
              </div>
            </div>
            <span className="shrink-0 font-mono text-xs text-muted">
              {r.zuletztGefahren
                ? t("zugWeekShort", { kw: r.zuletztGefahren.kw })
                : t("zugNever")}
            </span>
          </li>
        ))}
      </ul>

      <div className="hidden md:block scroll-x">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted border-b border-line">
              {kopf("name", t("colName"), false)}
              <th className="px-3 py-2 w-16 text-right">R4</th>
              {kopf("gefahren", t("zugColDrove"))}
              <th className="px-3 py-2 text-right">{t("zugColPlanned")}</th>
              {kopf("vip", t("zugColVip"))}
              {kopf("zuletzt", t("zugColLast"))}
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((r) => (
              <tr key={r.playerId} className="border-b border-line/40 hover:bg-panel-2/40">
                <td className="px-3 py-1.5">
                  <PlayerLink playerId={r.playerId} name={r.name} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  {r.isR4Rotation && <span className="tag border-sand-dim text-sand">R4</span>}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{r.gefahren}</td>
                <td className="px-3 py-1.5 text-right font-mono text-muted">{r.geplant}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.vip}</td>
                <td className="px-3 py-1.5 text-right font-mono text-muted">
                  {r.zuletztGefahren
                    ? t("zugWeekFull", {
                        kw: r.zuletztGefahren.kw,
                        year: r.zuletztGefahren.year,
                      })
                    : t("zugNever")}
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
        {t("zugFootnote")}
      </p>
    </div>
  );
}
