"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ActionScope, ConfirmButton, useAction, useOptimisticRows } from "@/components/action";
import { SERVER_ID } from "@/lib/allianz";
import {
  addPact,
  deletePact,
  togglePactPermission,
  updatePact,
} from "@/server/actions/pact-actions";

export type PactRow = {
  id: string;
  /** Server der Allianz – Pflicht, siehe Pact im Schema. */
  serverId: number;
  tag: string;
  name: string | null;
  zugLoot: boolean;
  baseHits: boolean;
  note: string | null;
};

/**
 * Bündnisse auf der Übersicht.
 *
 * Bewusst schmal: die Liste wächst mit jedem Bündnis, und als Tabelle über die
 * ganze Breite verdrängte sie alles andere. Es ist eine Frage mit zwei
 * Antworten – deren Zug plündern, deren Basen angreifen. Dafür genügen zwei
 * Spalten mit Zeichen, und die Beschriftung steht einmal im Kopf statt in
 * jeder Zeile.
 *
 * Steht an der Stelle, an der die Leitung das Protokoll sieht. Wer kein R4
 * ist, sieht das Protokoll nicht – für ihn tritt diese Liste an dessen Stelle.
 */
export function PactPanel({ rows, canEdit }: { rows: PactRow[]; canEdit: boolean }) {
  const t = useTranslations("pact");
  const { rows: local, mutate } = useOptimisticRows(rows);
  const [neuOffen, setNeuOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<PactRow | null>(null);

  const umschalten = (r: PactRow, feld: "zugLoot" | "baseHits") =>
    mutate(
      (cur) => cur.map((x) => (x.id === r.id ? { ...x, [feld]: !x[feld] } : x)),
      () => togglePactPermission(r.id, feld),
    );

  return (
    <ActionScope>
      <section className="panel">
        <div className="panel-head">
          <h2 className="text-lg">
            <span aria-hidden className="mr-1">
              🤝
            </span>
            {t("heading")}
          </h2>
          <div className="flex items-center gap-2">
            <span className="tag">{local.length}</span>
            {canEdit && (
              <button
                type="button"
                className="tag hover:border-sand-dim hover:text-sand"
                title={t("addHeading")}
                onClick={() => setNeuOffen(true)}
              >
                ＋
              </button>
            )}
          </div>
        </div>

        {local.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            {canEdit ? t("emptyCanEdit") : t("empty")}
          </p>
        ) : (
          <>
            {/* Was die beiden Spalten bedeuten, steht einmal hier – sonst
                rätselt man bei jedem Häkchen, worauf es sich bezieht. */}
            <p className="border-b border-line px-3 py-1.5 text-[11px] text-muted">
              {t("legend")}
            </p>

            <div className="flex items-end gap-2 border-b border-line px-3 py-1.5 text-[10px] uppercase leading-tight tracking-wider text-muted">
              <span className="flex-1">{t("colAlliance")}</span>
              <span className="w-16 text-center">{t("zugLoot")}</span>
              <span className="w-16 text-center">{t("baseHits")}</span>
              {canEdit && <span className="w-6" />}
            </div>

            <ul className="max-h-[420px] divide-y divide-line/50 overflow-y-auto">
              {local.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono text-[11px] text-muted">#{r.serverId} </span>
                    <span className="font-mono text-sm text-sand">[{r.tag}]</span>
                    {r.name && <span className="ml-1.5 text-xs text-muted">{r.name}</span>}
                    {r.note && (
                      <span className="ml-1.5 text-[11px] text-muted" title={r.note}>
                        · {r.note}
                      </span>
                    )}
                  </span>

                  <Zeichen
                    an={r.zugLoot}
                    label={t("zugLoot")}
                    canEdit={canEdit}
                    onToggle={() => umschalten(r, "zugLoot")}
                  />
                  <Zeichen
                    an={r.baseHits}
                    label={t("baseHits")}
                    canEdit={canEdit}
                    onToggle={() => umschalten(r, "baseHits")}
                  />

                  {canEdit && (
                    <button
                      type="button"
                      className="w-6 shrink-0 text-center text-xs text-muted hover:text-sand"
                      title={t("edit")}
                      onClick={() => setBearbeiten(r)}
                    >
                      ✎
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {neuOffen && <Dialog onClose={() => setNeuOffen(false)} />}
        {bearbeiten && <Dialog row={bearbeiten} onClose={() => setBearbeiten(null)} />}
      </section>
    </ActionScope>
  );
}

/**
 * Ein Häkchen oder ein Kreuz. Für Lesende ein Zeichen, für den R4-Rang ein
 * Knopf – gleiche Bedeutung, gleiche Stelle, damit niemand zwei Darstellungen
 * auseinanderhalten muss. Der Sinn steht zusätzlich als Text da, weil ein
 * Zeichen allein für ein Vorleseprogramm nichts hergibt.
 */
function Zeichen({
  an,
  label,
  canEdit,
  onToggle,
}: {
  an: boolean;
  label: string;
  canEdit: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("pact");
  const titel = `${label}: ${an ? t("allowed") : t("forbidden")}`;
  const inhalt = (
    <>
      <span aria-hidden>{an ? "☑️" : "❌"}</span>
      <span className="sr-only">{titel}</span>
    </>
  );

  if (!canEdit) {
    return (
      <span className="w-16 shrink-0 text-center" title={titel}>
        {inhalt}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={an}
      title={`${titel} – ${t("clickToToggle")}`}
      className="w-16 shrink-0 rounded py-0.5 text-center hover:bg-panel-2"
    >
      {inhalt}
    </button>
  );
}

/**
 * Anlegen und Bearbeiten teilen sich einen Dialog – die Felder sind dieselben.
 * Das Entfernen sitzt mit darin, damit die Liste selbst schmal bleibt.
 */
function Dialog({ row, onClose }: { row?: PactRow; onClose: () => void }) {
  const t = useTranslations("pact");
  const { run, pending } = useAction();
  const [server, setServer] = useState(row?.serverId?.toString() ?? "");
  const [tag, setTag] = useState(row?.tag ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [note, setNote] = useState(row?.note ?? "");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4">
      <div className="panel my-auto w-full max-w-sm p-5 space-y-3">
        <h3 className="text-lg">{row ? t("editHeading") : t("addHeading")}</h3>
        {!row && <p className="text-xs text-muted">{t("addHint")}</p>}

        <label className="block text-xs text-muted">
          {t("server")}
          <input
            className="input mt-1 w-full"
            inputMode="numeric"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            placeholder={String(SERVER_ID)}
          />
        </label>
        <label className="block text-xs text-muted">
          {t("tag")}
          <input
            className="input mt-1 w-full"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            autoFocus={!row}
          />
        </label>
        <label className="block text-xs text-muted">
          {t("name")}
          <input
            className="input mt-1 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-xs text-muted">
          {t("note")}
          <input
            className="input mt-1 w-full"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {row && (
            <ConfirmButton
              className="mr-auto text-xs text-muted hover:text-danger"
              label={t("remove")}
              title={t("removeTitle")}
              message={t("removeMessage", { tag: row.tag })}
              confirmLabel={t("remove")}
              onConfirm={() => deletePact(row.id)}
            />
          )}
          <button type="button" className="btn text-sm" onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={pending || !tag.trim() || !server.trim()}
            onClick={() => {
              run(() =>
                row ? updatePact(row.id, tag, name, note, server) : addPact(tag, name, server),
              );
              onClose();
            }}
          >
            {row ? t("save") : t("add")}
          </button>
        </div>
      </div>
    </div>
  );
}
