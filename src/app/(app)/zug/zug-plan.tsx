"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ActionScope, useOptimisticRows } from "@/components/action";
import { shiftWeek, weeksInIsoYear, type Week } from "@/lib/iso-week";
import { setZugCell } from "@/server/actions/zug-actions";
import type { Conflict } from "@/server/zug-service";

type Day = {
  dayIndex: number;
  weekday: string;
  plannedDriverId: string | null;
  actualDriverId: string | null;
  vipPlayerId: string | null;
};

/** Adresse einer Woche im Zug-Plan – das Jahr fährt immer mit. */
const zugHref = (w: Week) => `/zug?jahr=${w.year}&kw=${w.kw}`;

const WEEKDAYS = { Mo: 1, Di: 1, Mi: 1, Do: 1, Fr: 1, Sa: 1, So: 1 } as const;
type Weekday = keyof typeof WEEKDAYS;

type Field = "plannedDriverId" | "actualDriverId" | "vipPlayerId";

/** Ein wählbarer Name. `note` ist ein Bausteinschlüssel: "former", "notR4". */
type Option = { id: string; name: string; note?: "former" | "notR4" };

/** Spieler-Kennung → Platz 1–7 im Vier-Wochen-Schnitt der VS-Auswertung. */
type VipMap = Map<string, number>;

const beschriftung = (o: Option, note?: string) =>
  o.note ? `${o.name} (${note ?? o.note})` : o.name;

/**
 * Auswahlliste für das VIP-Feld: die Berechtigten zuerst, mit ihrem Platz.
 *
 * Die sieben Plätze sind der Zweck der ganzen VS-Auswertung. Wer den Zug
 * plant, musste sie bisher in einem anderen Reiter nachschlagen und im Kopf
 * behalten – jetzt stehen sie oben in der Liste.
 *
 * Gesperrt wird niemand: die übrigen bleiben darunter wählbar, falls ein
 * Berechtigter ausfällt oder ihr bewusst anders entscheidet.
 */
function vipSortiert(optionen: Option[], vip?: VipMap): Option[] {
  if (!vip || vip.size === 0) return optionen;
  const platz = (o: Option) => vip.get(o.id) ?? Infinity;
  return [...optionen].sort((a, b) => {
    const d = platz(a) - platz(b);
    return d !== 0 ? d : a.name.localeCompare(b.name, "de");
  });
}

/**
 * Der KW-Plan wird überwiegend am Handy gepflegt. Deshalb bis `md` eine Karte
 * pro Tag mit voller Breite statt einer Tabelle, durch die man seitwärts
 * scrollen müsste; ab `md` die kompakte Tabelle.
 */
export function ZugPlan({
  week,
  currentWeek,
  days,
  players,
  vipBerechtigt,
  vipFenster,
  archived,
  r4Players,
  initialConflicts,
  canEdit,
}: {
  week: Week;
  currentWeek: Week;
  days: Day[];
  players: Option[];
  /** Wer diese Woche VIP-berechtigt ist, samt Platz. Leer, wenn die
   *  VS-Auswertung keine Daten hat. */
  vipBerechtigt?: VipMap;
  /** Auf welchen Wochen die VIP-Berechtigung beruht, etwa "KW30–KW33". */
  vipFenster?: string | null;
  /** Ausgetretene, die in dieser KW noch eingetragen sind. */
  archived: Option[];
  r4Players: Option[];
  initialConflicts: Conflict[];
  canEdit: boolean;
}) {
  const t = useTranslations("zug");
  const tw = useTranslations("zug.weekday");
  const tws = useTranslations("zug.weekdayShort");
  // Die Kürzel stehen so in der Datenbank; übersetzt wird erst beim Anzeigen.
  const tag = (k: string) => (k in WEEKDAYS ? tw(k as Weekday) : k);
  const kurz = (k: string) => (k in WEEKDAYS ? tws(k as Weekday) : k);
  const router = useRouter();
  const [conflicts, setConflicts] = useState(initialConflicts);

  // Nach einem Wechsel der KW liefert der Server frische Treffer nach.
  useEffect(() => setConflicts(initialConflicts), [initialConflicts]);

  const { rows: local, mutate } = useOptimisticRows(days);

  const setCell = (dayIndex: number, field: Field, playerId: string | null) =>
    mutate(
      (cur) => cur.map((d) => (d.dayIndex === dayIndex ? { ...d, [field]: playerId } : d)),
      async () => {
        const result = await setZugCell(week, dayIndex, field, playerId);
        if (result.ok) setConflicts(result.data);
        return result;
      },
    );

  /**
   * Auswahlliste für ein Feld. Wer dort schon eingetragen ist, aber nicht mehr
   * in die Liste gehört – ausgetreten, oder kein R4 mehr –, wird hinten
   * angehängt und beschriftet. Sonst sähe das Feld leer aus und der Eintrag
   * verschwände beim nächsten Speichern still.
   */
  const optionsFor = (value: string | null, basis: Option[]): Option[] => {
    if (!value || basis.some((p) => p.id === value)) return basis;
    const p = archived.find((x) => x.id === value) ?? players.find((x) => x.id === value);
    return p ? [...basis, { ...p, note: p.note ?? ("notR4" as const) }] : basis;
  };

  const byDay = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const c of conflicts) {
      const list = m.get(c.dayIndex) ?? [];
      list.push(
        t(`conflict.${c.key}`, { ...c.params, name: c.params.name || t("someDriver") }),
      );
      m.set(c.dayIndex, list);
    }
    return m;
  }, [conflicts, t]);

  return (
    <ActionScope>
      <div className="panel">
        <div className="panel-head flex-wrap gap-3">
          <div>
            <h2 className="text-lg">{t("planHeading")}</h2>
            <p className="text-xs text-muted font-mono">
              {t("planSubline", { kw: week.kw, year: week.year })}
              {week.kw === currentWeek.kw && week.year === currentWeek.year
                ? t("running")
                : ""}
            </p>
          </div>

          {/* Volle Breite auf dem Handy, damit die Ziele gross genug sind. */}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              className="btn flex-1 sm:flex-none py-2.5 sm:py-2"
              onClick={() => router.push(zugHref(shiftWeek(week, -1)))}
              aria-label={t("prevWeek", { kw: shiftWeek(week, -1).kw })}
            >
              ← {t("weekShort", { kw: shiftWeek(week, -1).kw })}
            </button>
            <label className="sr-only" htmlFor="kw-select">
              {t("chooseWeek")}
            </label>
            <select
              id="kw-select"
              className="input w-24 py-2.5 text-base sm:py-1 sm:text-sm"
              value={week.kw}
              onChange={(e) =>
                router.push(zugHref({ year: week.year, kw: Number(e.target.value) }))
              }
            >
              {Array.from({ length: weeksInIsoYear(week.year) }, (_, i) => i + 1).map(
                (w) => (
                  <option key={w} value={w}>
                    {t("weekShort", { kw: w })}
                  </option>
                ),
              )}
            </select>
            <button
              type="button"
              className="btn flex-1 sm:flex-none py-2.5 sm:py-2"
              onClick={() => router.push(zugHref(shiftWeek(week, 1)))}
              aria-label={t("nextWeek", { kw: shiftWeek(week, 1).kw })}
            >
              {t("weekShort", { kw: shiftWeek(week, 1).kw })} →
            </button>
          </div>
        </div>

        {conflicts.length > 0 && (
          <div className="mx-3 mt-3 rounded border border-danger/50 bg-danger/10 px-3 py-2 text-xs text-danger">
            <strong>{t("conflictCount", { count: conflicts.length })}</strong>
            {t("conflictHint")}
          </div>
        )}

        {/* ── Handy: eine Karte pro Tag ─────────────────────── */}
        <div className="md:hidden p-3 space-y-3">
          {local.map((d) => {
            const msgs = byDay.get(d.dayIndex) ?? [];
            return (
              <section
                key={d.dayIndex}
                className={`rounded border p-3 ${
                  msgs.length ? "border-danger/50 bg-danger/5" : "border-line bg-panel-2/40"
                }`}
                aria-label={tag(d.weekday)}
              >
                <h3 className="text-sm text-sand mb-2">{tag(d.weekday)}</h3>

                <div className="space-y-2">
                  <MobileField label={t("plannedDriverMobile")}>
                    <PlayerSelect
                      value={d.plannedDriverId}
                      players={optionsFor(d.plannedDriverId, r4Players)}
                      canEdit={canEdit}
                      big
                      conflict={msgs.join(" ")}
                      onChange={(v) => setCell(d.dayIndex, "plannedDriverId", v)}
                    />
                    {msgs.length > 0 && (
                      <p className="mt-1 text-[11px] text-danger">{msgs.join(" ")}</p>
                    )}
                  </MobileField>

                  <MobileField label={t("actualDriverMobile")}>
                    <PlayerSelect
                      value={d.actualDriverId}
                      players={optionsFor(d.actualDriverId, players)}
                      canEdit={canEdit}
                      big
                      onChange={(v) => setCell(d.dayIndex, "actualDriverId", v)}
                    />
                  </MobileField>

                  <MobileField label={vipFenster ? `${t("vip")} · ★ ${vipFenster}` : t("vip")}>
                    <PlayerSelect
                      value={d.vipPlayerId}
                      players={vipSortiert(optionsFor(d.vipPlayerId, players), vipBerechtigt)}
                      vip={vipBerechtigt}
                      canEdit={canEdit}
                      big
                      onChange={(v) => setCell(d.dayIndex, "vipPlayerId", v)}
                    />
                  </MobileField>
                </div>

                {msgs.length > 0 && (
                  <p className="mt-2 text-xs text-danger">{msgs.join(" ")}</p>
                )}
              </section>
            );
          })}
        </div>

        {/* ── Ab Tablet: kompakte Tabelle ───────────────────── */}
        <div className="hidden md:block p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="px-3 py-2 w-24">{t("colDay")}</th>
                <th className="px-3 py-2">
                  {t("plannedDriver")}{" "}
                  <span className="text-muted font-normal">(R4)</span>
                </th>
                <th className="px-3 py-2">{t("actualDriver")}</th>
                <th className="px-3 py-2">
                  {t("vip")}
                  {/* Ohne diese Angabe bleibt offen, welche Wochen hinter den
                      Sternen stehen – und ob die frisch erfasste dabei ist. */}
                  {vipFenster && (
                    <span className="ml-1.5 font-mono text-[10px] font-normal text-muted">
                      ★ {vipFenster}
                    </span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {local.map((d) => {
                const msgs = byDay.get(d.dayIndex) ?? [];
                return (
                  <tr key={d.dayIndex} className="border-b border-line/60">
                    <th scope="row" className="px-3 py-2 text-left font-normal text-muted">
                      {kurz(d.weekday)}
                    </th>
                    <td className="px-3 py-2">
                      <PlayerSelect
                        value={d.plannedDriverId}
                        players={optionsFor(d.plannedDriverId, r4Players)}
                        canEdit={canEdit}
                        conflict={msgs.join(" ")}
                        onChange={(v) => setCell(d.dayIndex, "plannedDriverId", v)}
                      />
                      {msgs.length > 0 && (
                        <p className="mt-1 text-[11px] text-danger">{msgs.join(" ")}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <PlayerSelect
                        value={d.actualDriverId}
                        players={optionsFor(d.actualDriverId, players)}
                        canEdit={canEdit}
                        onChange={(v) => setCell(d.dayIndex, "actualDriverId", v)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <PlayerSelect
                        value={d.vipPlayerId}
                        players={vipSortiert(optionsFor(d.vipPlayerId, players), vipBerechtigt)}
                        vip={vipBerechtigt}
                        canEdit={canEdit}
                        onChange={(v) => setCell(d.dayIndex, "vipPlayerId", v)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ActionScope>
  );
}

function MobileField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-muted mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function PlayerSelect({
  value,
  players,
  canEdit,
  conflict,
  big,
  vip,
  onChange,
}: {
  value: string | null;
  players: Option[];
  canEdit: boolean;
  /** Nur beim VIP-Feld gesetzt: Kennung → Platz 1–7 im VS-Schnitt. */
  vip?: VipMap;
  conflict?: string;
  /** Grössere Variante fürs Handy: 16px Schrift verhindert das Zoomen in iOS. */
  big?: boolean;
  onChange: (playerId: string | null) => void;
}) {
  const t = useTranslations("zug");
  const note = (o: Option) => (o.note ? t(o.note) : undefined);

  if (!canEdit) {
    const treffer = players.find((p) => p.id === value);
    return (
      <span
        className={`inline-block ${big ? "text-base" : "text-sm"} ${conflict ? "text-danger" : ""}`}
        title={conflict}
      >
        {treffer ? beschriftung(treffer, note(treffer)) : "—"}
      </span>
    );
  }

  return (
    <select
      className={`input w-full ${big ? "py-2.5 text-base" : "py-1"} ${
        conflict ? "border-danger text-danger" : ""
      }`}
      value={value ?? ""}
      title={conflict}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">—</option>
      {players.map((p) => {
        const platz = vip?.get(p.id);
        return (
          <option key={p.id} value={p.id}>
            {/* Der Platz steht vorn, damit die Berechtigten schon beim
                Aufklappen ins Auge fallen – sie stehen ohnehin oben. */}
            {platz ? `★ ${platz}. ` : ""}
            {beschriftung(p, note(p))}
          </option>
        );
      })}
    </select>
  );
}
