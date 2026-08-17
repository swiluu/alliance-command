"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import {
  ActionScope,
  ConfirmButton,
  useAction,
  useOptimisticRows,
} from "@/components/action";
import { PlayerLink } from "@/components/player-link";
import { MODULE_META, type EventKey } from "@/lib/constants";
import type { ActionResult } from "@/server/action-result";
import {
  addPlayer,
  deletePlayer,
  reactivatePlayer,
  renamePlayer,
  replacePlayer,
  setPlayerExternal,
  updatePlayerDetails,
} from "@/server/actions/player-actions";

export type RosterRow = {
  playerId: string;
  name: string;
  /** Ausgetreten – bleibt wegen der Historie im Bestand. */
  former: boolean;
  /** Spiel-Account gelöscht: der kommt nicht zurück. */
  accountGeloescht: boolean;
  /** Allianzmitglied ausserhalb des Kaders – fährt nur Zug. */
  external: boolean;
  /** Zug-Einträge (gefahren + VIP) – die einzige Spur, die Externe haben. */
  zugCount: number;
  allianceTag: string;
  notes: string | null;
  thpRaw: string | null;
  isR4Rotation: boolean;
  historyCount: number;
  assignmentCount: number;
  events: {
    eventKey: EventKey;
    registered: boolean;
    isFixplatz: boolean;
    isBanned: boolean;
  }[];
};

export function RosterTable({
  rows,
  canEdit,
  max,
}: {
  rows: RosterRow[];
  canEdit: boolean;
  max: number;
}) {
  const t = useTranslations("roster");
  const tt = useTranslations("teams");
  const [query, setQuery] = useState("");
  const { rows: local, mutate } = useOptimisticRows(rows);

  const saveDetails = (playerId: string, allianceTag: string, notes: string) =>
    mutate(
      (cur) =>
        cur.map((r) =>
          r.playerId === playerId ? { ...r, allianceTag, notes: notes || null } : r,
        ),
      () => updatePlayerDetails(playerId, allianceTag, notes),
    );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return local;
    return local.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.allianceTag.toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q),
    );
  }, [local, query]);

  const filtered = matches.filter((r) => !r.former && !r.external);
  const externals = matches.filter((r) => !r.former && r.external);
  const former = matches.filter((r) => r.former);

  const kaderCount = local.filter((r) => !r.former && !r.external).length;

  const toKader = (playerId: string) =>
    mutate(
      (cur) => cur.map((r) => (r.playerId === playerId ? { ...r, external: false } : r)),
      () => setPlayerExternal(playerId, false),
    );

  const reactivate = (playerId: string) =>
    mutate(
      (cur) => cur.map((r) => (r.playerId === playerId ? { ...r, former: false } : r)),
      () => reactivatePlayer(playerId),
    );

  return (
    <ActionScope>
      <div className="panel">
        <div className="panel-head flex-wrap">
          <div>
            <h2 className="text-lg">{t("heading")}</h2>
            <p className="text-xs text-muted font-mono">
              {t("ofMax", { count: kaderCount, max })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input w-52"
              placeholder={t("search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t("searchAria")}
            />
            {canEdit && (
              <AddPlayerButton disabled={kaderCount >= max} />
            )}
          </div>
        </div>

        {/* Handy: Karte pro Spieler – die Tabelle bräuchte sonst 900px. */}
        <ul className="md:hidden p-3 space-y-2">
          {filtered.map((r, i) => (
            <li key={r.playerId} className="rounded border border-line bg-panel-2/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    <span className="font-mono text-xs text-muted mr-2">{i + 1}</span>
                    <PlayerLink playerId={r.playerId} name={r.name} />
                  </div>
                  <div className="font-mono text-[11px] text-muted">
                    {r.thpRaw ?? tt("noThp")} · {r.allianceTag}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-1 shrink-0">
                  {r.isR4Rotation && (
                    <span className="tag border-sand-dim text-sand">R4</span>
                  )}
                  {r.events.map((e) => (
                    <span
                      key={e.eventKey}
                      className={`tag ${
                        e.isBanned
                          ? "border-danger/60 text-danger"
                          : e.registered
                            ? "border-ok/50 text-ok"
                            : ""
                      }`}
                    >
                      {MODULE_META[e.eventKey].icon}
                      {e.isFixplatz && " ⭐"}
                      {e.isBanned ? " 🔒" : e.registered ? " ✅" : " ❌"}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-1 font-mono text-[11px] text-muted">
                {t("counts", {
                  history: r.historyCount,
                  assignments: r.assignmentCount,
                  zug: r.zugCount,
                })}
              </div>
              {r.notes && <div className="mt-1 text-xs text-muted">{r.notes}</div>}

              {canEdit && (
                <div className="mt-2 flex gap-2">
                  <PromptButton
                    label={t("rename")}
                    title={t("renameTitle")}
                    hint={t("renameHint", { name: r.name })}
                    initial={r.name}
                    onSubmit={(v) => renamePlayer(r.playerId, v)}
                  />
                  <ReplaceButton row={r} />
                  <ConfirmButton
                    className="btn btn-danger px-3 py-2.5 text-xs"
                    label="✕"
                    title={t("removeTitle")}
                    message={
                      r.historyCount + r.assignmentCount > 0
                        ? t("removeWithData", {
                            name: r.name,
                            history: r.historyCount,
                            assignments: r.assignmentCount,
                            zug: r.zugCount,
                          })
                        : t("removePlain", { name: r.name })
                    }
                    confirmLabel={t("remove")}
                    onConfirm={() => deletePlayer(r.playerId)}
                  />
                </div>
              )}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="py-8 text-center text-sm text-muted">{t("noneFound")}</li>
          )}
        </ul>

        <div className="hidden md:block scroll-x">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">{t("colName")}</th>
                <th className="px-3 py-2 w-24">{t("colAlliance")}</th>
                <th className="px-3 py-2 w-56">{t("colStatus")}</th>
                <th className="px-3 py-2">{t("colNotes")}</th>
                <th className="px-3 py-2 w-28 text-right">{t("colRecords")}</th>
                {canEdit && <th className="px-3 py-2 w-32 text-right">{t("colActions")}</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <RosterRowView
                  key={r.playerId}
                  index={i + 1}
                  row={r}
                  canEdit={canEdit}
                  onSaveDetails={saveDetails}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted">
                    {t("noneFound")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {externals.length > 0 && (
        <section className="panel mt-5">
          <div className="panel-head">
            <div>
              <h2 className="text-lg">{t("externalsHeading")}</h2>
              <p className="text-xs text-muted">{t("externalsHint", { max })}</p>
            </div>
            <span className="tag">{externals.length}</span>
          </div>
          <ul className="p-3 space-y-1.5">
            {externals.map((r) => (
              <li
                key={r.playerId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-panel-2/30 px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <PlayerLink playerId={r.playerId} name={r.name} className="truncate" />
                  <span className="ml-2 font-mono text-[11px] text-muted">
                    {t("zugEntries", { count: r.zugCount })}
                  </span>
                </span>
                {canEdit && (
                  <span className="flex gap-2">
                    <PromptButton
                      label="✏️"
                      title={t("renameTitle")}
                      hint={t("renameHintZug", { name: r.name })}
                      initial={r.name}
                      onSubmit={(v) => renamePlayer(r.playerId, v)}
                    />
                    <button
                      type="button"
                      className="btn px-3 py-2 text-xs md:py-1"
                      onClick={() => toKader(r.playerId)}
                      title={t("toRosterTitle")}
                    >
                      {t("toRoster")}
                    </button>
                    <ConfirmButton
                      className="btn btn-danger px-3 py-2 text-xs md:py-1"
                      label="✕"
                      title={t("removeExternalTitle")}
                      message={t("removeExternalMessage", {
                        name: r.name,
                        count: r.zugCount,
                      })}
                      confirmLabel={t("remove")}
                      onConfirm={() => deletePlayer(r.playerId)}
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {former.length > 0 && (
        <section className="panel mt-5">
          <div className="panel-head">
            <div>
              <h2 className="text-lg">{t("formerHeading")}</h2>
              <p className="text-xs text-muted">{t("formerHint")}</p>
            </div>
            <span className="tag">{former.length}</span>
          </div>
          <ul className="p-3 space-y-1.5">
            {former.map((r) => (
              <li
                key={r.playerId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-panel-2/30 px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <PlayerLink playerId={r.playerId} name={r.name} className="truncate text-muted" />
                  {r.accountGeloescht && (
                    <span className="tag ml-2 border-danger/60 text-danger" title={t("accountGoneTitle")}>
                      {t("accountGone")}
                    </span>
                  )}
                  <span className="ml-2 font-mono text-[11px] text-muted">
                    {t("counts", {
                      history: r.historyCount,
                      assignments: r.assignmentCount,
                      zug: r.zugCount,
                    })}
                  </span>
                </span>
                {canEdit && (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className="btn px-3 py-2 text-xs md:py-1"
                      onClick={() => reactivate(r.playerId)}
                      title={t("reactivateTitle")}
                    >
                      {t("reactivate")}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-3 text-xs text-muted">{t("footnote")}</p>
    </ActionScope>
  );
}

function RosterRowView({
  index,
  row,
  canEdit,
  onSaveDetails,
}: {
  index: number;
  row: RosterRow;
  canEdit: boolean;
  onSaveDetails: (playerId: string, allianceTag: string, notes: string) => void;
}) {
  const t = useTranslations("roster");
  const tt = useTranslations("teams");
  const tm = useTranslations("modules");
  const [tag, setTag] = useState(row.allianceTag);
  const [notes, setNotes] = useState(row.notes ?? "");

  const dirty = tag !== row.allianceTag || notes !== (row.notes ?? "");

  function save() {
    if (dirty) onSaveDetails(row.playerId, tag, notes);
  }

  return (
    <tr className="border-b border-line/60 hover:bg-panel-2/50 align-top">
      <td className="px-3 py-2 font-mono text-muted">{index}</td>

      <td className="px-3 py-2">
        <PlayerLink playerId={row.playerId} name={row.name} className="font-medium" />
        {row.isR4Rotation && (
          <span className="tag ml-2 border-sand-dim text-sand" title={t("inR4")}>
            R4
          </span>
        )}
        <div className="font-mono text-[11px] text-muted">
          {row.thpRaw ?? tt("noThp")}
        </div>
      </td>

      <td className="px-3 py-2">
        {canEdit ? (
          <input
            className="input py-1 text-xs font-mono"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onBlur={save}
            aria-label={t("tagAria", { name: row.name })}
          />
        ) : (
          <span className="font-mono text-xs text-muted">{row.allianceTag}</span>
        )}
      </td>

      <td className="px-3 py-2">
        <ul className="flex flex-wrap gap-1">
          {row.events.map((e) => (
            <li
              key={e.eventKey}
              className={`tag ${
                e.isBanned
                  ? "border-danger/60 text-danger"
                  : e.registered
                    ? "border-ok/50 text-ok"
                    : ""
              }`}
              title={tm(e.eventKey)}
            >
              {MODULE_META[e.eventKey].icon}
              {e.isFixplatz && " ⭐"}
              {e.isBanned ? " 🔒" : e.registered ? " ✅" : " ❌"}
            </li>
          ))}
        </ul>
      </td>

      <td className="px-3 py-2">
        {canEdit ? (
          <input
            className="input py-1 text-xs"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={save}
            placeholder="—"
            aria-label={t("noteAria", { name: row.name })}
          />
        ) : (
          <span className="text-xs text-muted">{row.notes ?? "—"}</span>
        )}
      </td>

      <td className="px-3 py-2 text-right font-mono text-xs text-muted">
        <span title={t("historyTitle")}>{row.historyCount} H</span>
        {" · "}
        <span title={t("assignmentsTitle")}>{row.assignmentCount} Z</span>
      </td>

      {canEdit && (
        <td className="px-3 py-2">
          <div className="flex justify-end gap-1">
            <PromptButton
              label="✏️"
              title={t("renameTitle")}
              hint={t("renameHint", { name: row.name })}
              initial={row.name}
              onSubmit={(v) => renamePlayer(row.playerId, v)}
            />
            <ReplaceButton row={row} />
            <ConfirmButton
              className="btn btn-danger px-2 py-1 text-xs"
              label="✕"
              title={t("removeTitle")}
              message={t("removeRowMessage", {
                name: row.name,
                history: row.historyCount,
                assignments: row.assignmentCount,
                zug: row.zugCount,
              })}
              confirmLabel={t("remove")}
              onConfirm={() => deletePlayer(row.playerId)}
            />
          </div>
        </td>
      )}
    </tr>
  );
}

/**
 * Raus↔Rein. Bei einem echten Mitgliederwechsel soll der Nachfolger keine
 * Sperre und keine Historie des Vorgängers erben – deshalb die Wahl.
 */
function ReplaceButton({ row }: { row: RosterRow }) {
  const t = useTranslations("roster");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [reset, setReset] = useState(true);
  const { run, pending } = useAction();

  return (
    <>
      <button
        type="button"
        className="btn px-3 py-2.5 text-xs md:px-2 md:py-1"
        title={t("replaceTitle")}
        onClick={() => {
          setName("");
          setReset(true);
          setOpen(true);
        }}
      >
        🔄
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="panel my-auto w-full max-w-sm p-5">
            <h2 className="text-lg mb-2">{t("replaceTitle")}</h2>
            <p className="text-sm text-muted mb-3">
              {t.rich("replaceOut", {
                name: row.name,
                n: (chunks) => <span className="text-ink">{chunks}</span>,
              })}
            </p>

            <label className="block text-xs text-muted mb-1">{t("replaceIn")}</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />

            <fieldset className="mt-4 space-y-1">
              <legend className="text-xs text-muted mb-1">{t("inherits")}</legend>
              <label
                className={`flex gap-3 rounded border px-3 py-3 text-sm cursor-pointer md:py-2 ${
                  reset ? "border-sand bg-sand/15" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  checked={reset}
                  onChange={() => setReset(true)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#C9A24B] md:h-4 md:w-4"
                />
                <span>
                  {t("memberChange")}
                  <span className="block text-xs text-muted">{t("memberChangeHint")}</span>
                </span>
              </label>
              <label
                className={`flex gap-3 rounded border px-3 py-3 text-sm cursor-pointer md:py-2 ${
                  !reset ? "border-sand bg-sand/15" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  checked={!reset}
                  onChange={() => setReset(false)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#C9A24B] md:h-4 md:w-4"
                />
                <span>
                  {t("accountChange")}
                  <span className="block text-xs text-muted">{t("accountChangeHint")}</span>
                </span>
              </label>
            </fieldset>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !name.trim()}
                onClick={() => {
                  setOpen(false);
                  run(() => replacePlayer(row.playerId, name, reset));
                }}
              >
                {t("replace")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AddPlayerButton({ disabled }: { disabled: boolean }) {
  const t = useTranslations("roster");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("[R3]");
  const [notes, setNotes] = useState("");
  const { run, pending } = useAction();

  return (
    <>
      <button
        type="button"
        className="btn btn-primary text-xs"
        disabled={disabled}
        title={disabled ? t("addDisabled") : undefined}
        onClick={() => setOpen(true)}
      >
        {t("addPlayer")}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="panel my-auto w-full max-w-sm p-5">
            <h2 className="text-lg mb-3">{t("addHeading")}</h2>

            <label className="block text-xs text-muted mb-1">{t("name")}</label>
            <input
              className="input mb-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />

            <label className="block text-xs text-muted mb-1">{t("allianceTag")}</label>
            <input
              className="input mb-3"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />

            <label className="block text-xs text-muted mb-1">{t("note")}</label>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            {/* Der Schalter „extern (nur Zug)“ ist entfallen: die Kategorie
                gab es in Wirklichkeit nicht – die so geführten Einträge waren
                allesamt ehemalige Spieler aus dem Zug-Sheet. Neue Einträge
                entstehen deshalb immer als reguläre Kadermitglieder. */}
            <p className="mt-3 text-xs text-muted">{t("normalNote")}</p>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !name.trim()}
                onClick={() => {
                  setOpen(false);
                  run(async () => {
                    const r = await addPlayer(name, tag, notes, false);
                    if (r.ok) {
                      setName("");
                      setNotes("");
                    }
                    return r;
                  });
                }}
              >
                {t("add")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PromptButton({
  label,
  title,
  hint,
  initial,
  onSubmit,
}: {
  label: string;
  title: string;
  hint: string;
  initial: string;
  onSubmit: (value: string) => Promise<ActionResult<void>>;
}) {
  const t = useTranslations("roster");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial);
  const { run, pending } = useAction();

  return (
    <>
      <button
        type="button"
        className="btn px-3 py-2.5 text-xs md:px-2 md:py-1"
        onClick={() => {
          setValue(initial);
          setOpen(true);
        }}
        title={title}
      >
        {label}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="panel my-auto w-full max-w-sm p-5">
            <h2 className="text-lg mb-2">{title}</h2>
            <p className="text-sm text-muted mb-3">{hint}</p>
            <input
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !value.trim()}
                onClick={() => {
                  setOpen(false);
                  run(() => onSubmit(value));
                }}
              >
                {t("apply")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
