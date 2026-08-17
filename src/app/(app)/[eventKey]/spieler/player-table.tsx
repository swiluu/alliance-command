"use client";

import { useLocale, useTranslations } from "next-intl";

import { dauer, zeitraumText } from "@/lib/absence";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ActionScope, useOptimisticRows } from "@/components/action";
import type { PlayerRow } from "@/server/event-service";
import {
  toggleFixplatz,
  toggleRegistration,
} from "@/server/actions/event-actions";

/**
 * Event-Sicht auf den Spieler-Stamm: hier wird nur gepflegt, was pro Event
 * unterschiedlich ist. Spieler anlegen, löschen, umbenennen oder ersetzen
 * wirkt über alle Module hinweg und liegt deshalb in der Allianz-Verwaltung.
 */
export function PlayerTable({
  eventKey,
  rows,
  canEdit,
  canManageRoster,
}: {
  eventKey: string;
  rows: PlayerRow[];
  canEdit: boolean;
  canManageRoster: boolean;
}) {
  const t = useTranslations("players");
  const tt = useTranslations("teams");
  const tm = useTranslations("modules");
  const [query, setQuery] = useState("");
  const [onlyRegistered, setOnlyRegistered] = useState(false);

  // Anmeldung, Fixplatz und Jäger-Build schalten sofort um; gespeichert wird
  // im Hintergrund. Bei 100 Zeilen wartet sonst jeder Klick auf den Server.
  const { rows: local, mutate } = useOptimisticRows(rows);

  const toggleReg = (r: PlayerRow) =>
    mutate(
      (cur) =>
        cur.map((x) =>
          x.playerId === r.playerId ? { ...x, registered: !x.registered } : x,
        ),
      () => toggleRegistration(eventKey, r.playerId),
    );

  const toggleFix = (r: PlayerRow) =>
    mutate(
      (cur) =>
        cur.map((x) =>
          x.playerId === r.playerId ? { ...x, isFixplatz: !x.isFixplatz } : x,
        ),
      () => toggleFixplatz(eventKey, r.playerId),
    );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return local.filter((r) => {
      if (onlyRegistered && !r.registered) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.allianceTag.toLowerCase().includes(q);
    });
  }, [local, query, onlyRegistered]);

  const teil = local.filter((r) => r.registered).length;
  const gesperrt = local.filter((r) => r.isBanned).length;

  return (
    <ActionScope>
      <div className="panel">
        <div className="panel-head flex-wrap">
          <div>
            <h2 className="text-lg">{t("heading")}</h2>
            <p className="text-xs text-muted font-mono">
              {t("subline", { count: local.length, registered: teil, banned: gesperrt })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input w-44"
              placeholder={tt("search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={tt("searchAria")}
            />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={onlyRegistered}
                onChange={(e) => setOnlyRegistered(e.target.checked)}
                className="h-5 w-5 shrink-0 accent-[#C9A24B] md:h-4 md:w-4"
              />
              {t("onlyRegistered")}
            </label>
            {canManageRoster && (
              <Link href="/allianz" className="btn text-xs">
                {t("roster")}
              </Link>
            )}
          </div>
        </div>

        {/* Handy: eine Karte pro Spieler – die Tabelle bräuchte sonst 720px. */}
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
                    {r.thpRaw ?? tt("noThp")} · {r.allianceTag}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {r.isR2 && (
                    <span className="tag border-danger text-danger" title={t("r2Title")}>
                      R2
                    </span>
                  )}
                  {r.abwesend && <AbwesendChip abwesend={r.abwesend} />}
                  {r.isBanned ? (
                    <span className="tag border-danger/60 text-danger">
                      {t("bannedUntil", { week: r.bannedUntil ?? "?" })}
                    </span>
                  ) : (
                    <span className="tag">{t("free")}</span>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={!canEdit || r.isBanned}
                onClick={() => toggleReg(r)}
                className={`mt-2 w-full rounded border py-2.5 text-sm transition-colors ${
                  r.registered
                    ? "border-ok/50 bg-ok/10 text-ok"
                    : "border-danger-dim bg-danger/10 text-danger"
                } ${!canEdit || r.isBanned ? "opacity-60" : ""}`}
              >
                {r.registered ? t("takingPart") : t("notTakingPart")}
              </button>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleFix(r)}
                  className={`tag py-1.5 px-2 ${r.isFixplatz ? "border-ok/50 text-ok" : ""}`}
                >
                  {r.isFixplatz ? t("fixOn") : t("fixOff")}
                </button>
                {r.notes && <span className="text-[11px] text-muted">{r.notes}</span>}
              </div>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="py-8 text-center text-muted text-sm">{t("noneFound")}</li>
          )}
        </ul>

        <div className="hidden md:block scroll-x">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">{t("colName")}</th>
                <th className="px-3 py-2 w-24">{t("colAlliance")}</th>
                <th className="px-3 py-2 w-40">{t("colRegistration")}</th>
                <th className="px-3 py-2 w-36">{t("colBanned")}</th>
                <th className="px-3 py-2 w-24">{t("colFix")}</th>
                <th className="px-3 py-2">{t("colNotes")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <PlayerRowView
                  key={r.playerId}
                  index={i + 1}
                  row={r}
                  canEdit={canEdit}
                  onToggleRegistration={() => toggleReg(r)}
                  onToggleFixplatz={() => toggleFix(r)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted">
                    {t("noneFound")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        {t("footnote")}{" "}
        {canManageRoster ? (
          <Link href="/allianz" className="text-sand hover:underline">
            {tm("allianz")}
          </Link>
        ) : (
          <span className="text-ink">{tm("allianz")}</span>
        )}
        .
      </p>
    </ActionScope>
  );
}

function PlayerRowView({
  index,
  row,
  canEdit,
  onToggleRegistration,
  onToggleFixplatz,
}: {
  index: number;
  row: PlayerRow;
  canEdit: boolean;
  onToggleRegistration: () => void;
  onToggleFixplatz: () => void;
}) {
  const t = useTranslations("players");
  const tt = useTranslations("teams");

  return (
    <tr className="border-b border-line/60 hover:bg-panel-2/50">
      <td className="px-3 py-2 font-mono text-muted">{index}</td>
      <td className="px-3 py-2">
        <div className="font-medium leading-tight">
          {row.name}
          {row.isR2 && (
            <span className="tag ml-2 border-danger text-danger" title={t("r2Title")}>
              R2
            </span>
          )}
          {row.abwesend && (
            <span className="ml-2 inline-block">
              <AbwesendChip abwesend={row.abwesend} />
            </span>
          )}
        </div>
        <div className="font-mono text-[11px] text-muted">{row.thpRaw ?? tt("noThp")}</div>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-muted">{row.allianceTag}</td>

      <td className="px-3 py-2">
        <button
          type="button"
          disabled={!canEdit || row.isBanned}
          onClick={onToggleRegistration}
          title={row.isBanned ? t("bannedCannotChange") : t("toggleRegistration")}
          className={`w-full text-left px-2 py-1 rounded border text-xs transition-colors ${
            row.registered
              ? "border-ok/50 bg-ok/10 text-ok"
              : "border-danger-dim bg-danger/10 text-danger"
          } ${!canEdit || row.isBanned ? "opacity-60 cursor-not-allowed" : "hover:brightness-125"}`}
        >
          {row.registered ? t("takingPart") : t("notTakingPart")}
        </button>
      </td>

      <td className="px-3 py-2">
        {row.isBanned ? (
          <span className="tag border-danger/60 text-danger" title={row.banReason ?? ""}>
            {t("bannedUntil", { week: row.bannedUntil ?? "?" })}
          </span>
        ) : (
          <span className="tag">{t("free")}</span>
        )}
      </td>

      <td className="px-3 py-2">
        {canEdit ? (
          <button
            type="button"
            className={`tag ${row.isFixplatz ? "border-ok/50 text-ok" : ""} hover:border-sand-dim`}
            title={row.isFixplatz ? t("fixRemove") : t("fixGrant")}
            onClick={onToggleFixplatz}
          >
            {row.isFixplatz ? t("yes") : "–"}
          </button>
        ) : (
          <span className={`tag ${row.isFixplatz ? "border-ok/50 text-ok" : ""}`}>
            {row.isFixplatz ? t("yes") : "–"}
          </span>
        )}
      </td>

      <td className="px-3 py-2">
        <span className="text-xs text-muted">{row.notes ?? "—"}</span>
      </td>
    </tr>
  );
}

/**
 * Kennzeichen für eine laufende oder angekündigte Abwesenheit.
 *
 * Steht in der Spielerliste, weil hier über Teilnahme entschieden wird – und
 * nicht erst in der Wochenplanung, wo die Entscheidung längst gefallen ist.
 *
 * Es sperrt bewusst nichts: wer nur halb weg ist oder früher zurückkommt,
 * kann trotzdem teilnehmen. Das Kennzeichen erinnert, es entscheidet nicht.
 */
function AbwesendChip({
  abwesend,
}: {
  abwesend: { from: string; until: string | null; note: string | null };
}) {
  const t = useTranslations("players");
  const ta = useTranslations("absence");
  const locale = useLocale();

  const zeitraum = zeitraumText(
    {
      from: new Date(abwesend.from),
      until: abwesend.until ? new Date(abwesend.until) : null,
    },
    locale,
  );
  const d = dauer({
    from: new Date(abwesend.from),
    until: abwesend.until ? new Date(abwesend.until) : null,
  });

  return (
    <span
      className="tag border-sand-dim text-sand"
      title={`${t("awayTitle", { span: zeitraum })}${abwesend.note ? ` · ${abwesend.note}` : ""}`}
    >
      <span aria-hidden>🌴</span>
      {ta(`dauer.${d.key}`, { days: d.days })}
    </span>
  );
}
