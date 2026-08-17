"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ActionScope, useOptimisticRows } from "@/components/action";
import {
  BAN_DURATION_WEEKS,
  ROTATION_META,
  ROTATION_STATUSES,
  type RotationStatus,
} from "@/lib/constants";
import { setRotationStatus } from "@/server/actions/event-actions";

type Cell = { playerId: string; week: number; status: string };

export function HistoryHeatmap({
  eventKey,
  players,
  history,
  currentWeek,
  totalWeeks,
  canEdit,
}: {
  eventKey: string;
  /** Nur der aktive Kader – Ausgetretene werden hier nicht mehr gezeigt. */
  players: { id: string; name: string }[];
  history: Cell[];
  currentWeek: number;
  totalWeeks: number;
  canEdit: boolean;
}) {
  const t = useTranslations("history");
  const tr = useTranslations("rotation");
  const [editing, setEditing] = useState<{
    playerId: string;
    playerName: string;
    week: number;
    status: string;
  } | null>(null);

  // Die Heatmap ist gross – ein Neuaufbau der ganzen Seite pro Zelle ist zu
  // langsam. Zelle sofort umfärben, im Hintergrund speichern.
  const { rows: cells, mutate } = useOptimisticRows(history);

  const setCell = (playerId: string, week: number, status: string) =>
    mutate(
      (cur) => {
        const rest = cur.filter((c) => !(c.playerId === playerId && c.week === week));
        return status ? [...rest, { playerId, week, status }] : rest;
      },
      () => setRotationStatus(eventKey, playerId, week, status),
    );

  const map = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of cells) m.set(`${h.playerId}:${h.week}`, h.status);
    return m;
  }, [cells]);

  const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);

  return (
    <ActionScope>
      <div className="panel">
        <div className="panel-head flex-wrap">
          <div>
            <h2 className="text-lg">{t("heading")}</h2>
            <p className="text-xs text-muted font-mono">
              {t("subline", {
                players: players.length,
                weeks: totalWeeks,
                current: currentWeek,
              })}
            </p>
          </div>
          <Legend />
        </div>

        <div className="scroll-x max-h-[70vh] overflow-y-auto">
          <table className="text-xs border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 bg-panel border-b border-r border-line px-3 py-2 text-left font-normal text-muted min-w-[160px]">
                  {t("colPlayer")}
                </th>
                {weeks.map((w) => (
                  <th
                    key={w}
                    className={`sticky top-0 z-10 bg-panel border-b border-line px-1 py-2 font-mono font-normal w-8 ${
                      w === currentWeek ? "text-sand" : "text-muted"
                    }`}
                    title={t("weekTitle", { week: w })}
                  >
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-panel group-hover:bg-panel-2 border-b border-r border-line px-3 py-1 text-left font-normal truncate max-w-[160px]"
                    title={p.name}
                  >
                    {p.name}
                  </th>
                  {weeks.map((w) => {
                    const status = map.get(`${p.id}:${w}`);
                    const meta = status
                      ? ROTATION_META[status as RotationStatus]
                      : undefined;
                    return (
                      <td key={w} className="border-b border-line/40 p-0">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() =>
                            setEditing({
                              playerId: p.id,
                              playerName: p.name,
                              week: w,
                              status: status ?? "",
                            })
                          }
                          title={t("cellTitle", {
                            name: p.name,
                            week: w,
                            status: status ? tr(status as RotationStatus) : t("noSquad"),
                          })}
                          className={`block w-8 h-7 md:h-6 ${
                            meta?.cls ?? "bg-panel-2/40 text-muted"
                          } ${canEdit ? "hover:outline hover:outline-1 hover:outline-sand" : "cursor-default"}`}
                        >
                          <span className="sr-only">
                            {t("cellTitle", {
                              name: p.name,
                              week: w,
                              status: status ? tr(status as RotationStatus) : t("noSquad"),
                            })}
                          </span>
                          <span aria-hidden className="text-[9px] font-mono opacity-80">
                            {meta?.short ?? ""}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <CellDialog
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={(status) => setCell(editing.playerId, editing.week, status)}
        />
      )}
    </ActionScope>
  );
}

function Legend() {
  const t = useTranslations("history");
  const tr = useTranslations("rotation");

  return (
    <ul className="flex flex-wrap gap-2">
      {ROTATION_STATUSES.map((s) => (
        <li key={s} className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className={`inline-block h-3 w-3 rounded-sm ${ROTATION_META[s].cls}`} />
          {tr(s)}
        </li>
      ))}
      <li className="flex items-center gap-1.5 text-[11px] text-muted">
        <span className="inline-block h-3 w-3 rounded-sm bg-panel-2/40 border border-line" />
        {t("noSquad")}
      </li>
    </ul>
  );
}

function CellDialog({
  editing,
  onClose,
  onSave,
}: {
  editing: { playerId: string; playerName: string; week: number; status: string };
  onClose: () => void;
  onSave: (status: string) => void;
}) {
  const t = useTranslations("history");
  const tc = useTranslations("common");
  const tr = useTranslations("rotation");
  const [value, setValue] = useState(editing.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="panel my-auto w-full max-w-sm p-5">
        <h2 className="text-lg mb-1">{editing.playerName}</h2>
        <p className="text-xs text-muted mb-4 font-mono">{t("weekLabel", { week: editing.week })}</p>

        <div className="space-y-1">
          {["", ...ROTATION_STATUSES].map((s) => {
            const meta = s ? ROTATION_META[s as RotationStatus] : null;
            return (
              <label
                key={s || "none"}
                className={`flex items-center gap-3 rounded border px-3 py-3 text-sm cursor-pointer md:py-2 ${
                  value === s
                    ? "border-sand bg-sand/15 text-sand"
                    : "border-line hover:border-sand-dim"
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={value === s}
                  onChange={() => setValue(s)}
                  className="h-5 w-5 shrink-0 accent-[#C9A24B] md:h-4 md:w-4"
                />
                <span
                  className={`inline-block h-4 w-4 shrink-0 rounded-sm md:h-3 md:w-3 ${
                    meta?.cls ?? "bg-panel-2 border border-line"
                  }`}
                />
                {s ? tr(s as RotationStatus) : t("noSquad")}
              </label>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-muted">
          {t("banHint", { ban: BAN_DURATION_WEEKS })}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            {tc("cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose();
              onSave(value);
            }}
          >
            {tc("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
