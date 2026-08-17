"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { ActionScope, useAction } from "@/components/action";
import { weekRangeLabel, type Week } from "@/lib/iso-week";
import { saveVsWeek } from "@/server/actions/vs-actions";

import { VsScan } from "./vs-scan";

/** `inRoster: false` – hat in dieser Woche Punkte, steht aber nicht mehr im Kader. */
type Player = { id: string; name: string; inRoster: boolean };

type Filter = "alle" | "offen" | "erfasst";

/** Nur Ziffern behalten – Tausendertrenner, Leerzeichen und Punkte fliegen raus. */
const nurZiffern = (s: string) => s.replace(/\D/g, "");

/** "88301697" → "88 301 697". Bewusst mit Leerzeichen statt landesüblichem
 *  Trenner: das Zeichen muss in beiden Sprachen gleich sein, weil derselbe
 *  Text wieder eingelesen wird. */
const gruppiert = (s: string) => nurZiffern(s).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export function VsEntry(props: {
  week: Week;
  players: Player[];
  values: Record<string, number>;
  foreign: { rawName: string; points: number }[];
  available: Week[];
}) {
  return (
    <ActionScope>
      <EntryForm {...props} />
    </ActionScope>
  );
}

/**
 * Wocheneingabe: ein Feld je Kadermitglied, getippt von der Liste ab.
 *
 * Alles hier dient dem einen Zweck, hundert Zahlen ohne Fehler und ohne
 * Suchen einzugeben – der Filter "offen" zeigt die Lücken, die Suche findet
 * einen einzelnen Namen, Enter springt weiter, und die Fusszeile bleibt beim
 * Blättern stehen.
 *
 * Ein leeres Feld heisst "keine Punkte erfasst". Das ist nicht dasselbe wie
 * eine Null, auch wenn es im Schnitt gleich zählt: in der Rangliste steht
 * dafür ein Strich, und die Zahl der belegten Wochen sinkt.
 */
function EntryForm({
  week,
  players,
  values,
  foreign,
  available,
}: {
  week: Week;
  players: Player[];
  values: Record<string, number>;
  foreign: { rawName: string; points: number }[];
  available: Week[];
}) {
  const t = useTranslations("vs");
  const f = useFormatter();
  const router = useRouter();
  const params = useSearchParams();
  const { run, pending } = useAction();

  const [felder, setFelder] = useState<Record<string, string>>(() =>
    Object.fromEntries(players.map((p) => [p.id, gruppiert(values[p.id]?.toString() ?? "")])),
  );
  const [suche, setSuche] = useState("");
  const [filter, setFilter] = useState<Filter>("alle");

  const belegt = (id: string) => (felder[id] ?? "").trim() !== "";
  const gefuellt = players.filter((p) => belegt(p.id)).length;
  const imKader = players.filter((p) => p.inRoster).length;
  const offeneAnzahl = players.length - gefuellt;

  const sichtbar = players.filter((p) => {
    if (filter === "offen" && belegt(p.id)) return false;
    if (filter === "erfasst" && !belegt(p.id)) return false;
    if (suche && !p.name.toLowerCase().includes(suche.toLowerCase())) return false;
    return true;
  });

  const geaendert = players.some(
    (p) => nurZiffern(felder[p.id] ?? "") !== (values[p.id]?.toString() ?? ""),
  );

  function waehleWoche(wert: string) {
    if (geaendert && !window.confirm(t("entryDiscard"))) return;
    const next = new URLSearchParams(params.toString());
    next.set("kw", wert);
    router.push(`/vs/erfassen?${next}`);
  }

  /**
   * Erkannte Werte in die Felder schreiben.
   *
   * Nur in die Felder, nicht in die Datenbank – gespeichert wird weiter mit
   * dem Knopf unten. Schon getippte Zahlen werden dabei überschrieben: wer
   * einen Screenshot einliest, will dessen Stand.
   */
  function uebernehmen(werte: { playerId: string; punkte: number }[]) {
    setFelder((cur) => {
      const neu = { ...cur };
      for (const w of werte) neu[w.playerId] = gruppiert(String(w.punkte));
      return neu;
    });
  }

  function speichern() {
    const eintraege = players
      .map((p) => ({ playerId: p.id, raw: nurZiffern(felder[p.id] ?? "") }))
      .filter((e) => e.raw !== "")
      .map((e) => ({ playerId: e.playerId, points: Number(e.raw) }));

    run(() => saveVsWeek(week, eintraege));
  }

  /** Enter springt ins nächste sichtbare Feld – Tippen ohne Mausgriff. */
  function weiter(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const naechstes = sichtbar[index + 1];
    if (!naechstes) return;
    document.getElementById(`vs-${naechstes.id}`)?.focus();
  }

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "alle", label: t("filterAll"), count: players.length },
    { key: "offen", label: t("filterOpen"), count: offeneAnzahl },
    { key: "erfasst", label: t("filterDone"), count: gefuellt },
  ];

  return (
    <div className="space-y-4">
      {/* Screenshot-Übernahme steht bewusst über der Liste: sie füllt die
          Felder darunter, und in dieser Reihenfolge liest man es auch. */}
      <VsScan players={players} onUebernehmen={uebernehmen} />

      <div className="panel">
      <div className="panel-head flex-wrap gap-3">
        <div>
          <h2 className="text-lg">{t("entryHeading")}</h2>
          <p className="text-xs text-muted font-mono">
            {t("entrySubline", { kw: week.kw, year: week.year, range: weekRangeLabel(week) })}
          </p>
        </div>

        <label className="text-xs text-muted">
          <span className="mr-2">{t("entryWeek")}</span>
          <select
            className="input py-1 text-sm"
            value={`${week.year}-${week.kw}`}
            onChange={(e) => waehleWoche(e.target.value)}
          >
            {[
              ...new Set([
                `${week.year}-${week.kw}`,
                ...available.map((w) => `${w.year}-${w.kw}`),
              ]),
            ].map((wert) => {
              const [j, k] = wert.split("-");
              return (
                <option key={wert} value={wert}>
                  {t("weekOption", { kw: Number(k), year: Number(j) })}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <div className="p-4 space-y-4">
        {foreign.length > 0 && (
          <p className="rounded border border-danger-dim bg-danger/10 px-3 py-2 text-xs text-danger">
            {t("entryForeign", {
              count: foreign.length,
              names: f.list(foreign.map((x) => x.rawName), { type: "conjunction" }),
            })}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              aria-pressed={filter === c.key}
              className={`tag py-1.5 ${
                filter === c.key ? "border-sand text-sand" : "hover:border-sand-dim"
              }`}
            >
              {c.label}
              <span className="ml-1.5 font-mono opacity-70">{c.count}</span>
            </button>
          ))}
          <input
            type="search"
            className="input py-1 text-sm flex-1 min-w-[9rem]"
            placeholder={t("searchPlaceholder")}
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
        </div>

        {sichtbar.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t("entryNoMatch")}</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
            {sichtbar.map((p, i) => (
              <li
                key={p.id}
                className={`flex items-center gap-2 rounded px-2 py-1 ${
                  belegt(p.id) ? "" : "bg-panel-2/40"
                }`}
              >
                <label
                  className="flex-1 min-w-0 truncate text-sm"
                  htmlFor={`vs-${p.id}`}
                  title={p.inRoster ? p.name : `${p.name} – ${t("entryNotInRoster")}`}
                >
                  {p.name}
                  {!p.inRoster && (
                    <span className="tag ml-2 border-line text-muted">
                      {t("entryNotInRoster")}
                    </span>
                  )}
                </label>
                <input
                  id={`vs-${p.id}`}
                  inputMode="numeric"
                  autoComplete="off"
                  className={`input w-36 py-1 text-right font-mono text-sm ${
                    belegt(p.id) ? "border-ok/40" : ""
                  }`}
                  value={felder[p.id] ?? ""}
                  onKeyDown={(e) => weiter(e, i)}
                  onChange={(e) =>
                    setFelder((cur) => ({ ...cur, [p.id]: gruppiert(e.target.value) }))
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Bleibt beim Blättern stehen: bei hundert Feldern soll niemand ans
          Ende scrollen müssen, um den Stand zu sehen oder zu speichern. */}
      <div className="sticky bottom-0 border-t border-line bg-panel/95 backdrop-blur px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[8rem]">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted font-mono">
                {t("entryFilled", { filled: gefuellt, total: imKader })}
              </span>
              {geaendert && <span className="text-sand">{t("entryUnsaved")}</span>}
            </div>
            <div
              className="mt-1 h-1.5 rounded bg-panel-2 overflow-hidden"
              role="progressbar"
              aria-valuenow={gefuellt}
              aria-valuemin={0}
              aria-valuemax={imKader}
            >
              <div
                className="h-full bg-ok transition-[width]"
                style={{ width: `${imKader ? Math.min(100, (gefuellt / imKader) * 100) : 0}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={speichern}
          >
            {pending ? t("entrySaving") : t("entrySave", { kw: week.kw })}
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}
