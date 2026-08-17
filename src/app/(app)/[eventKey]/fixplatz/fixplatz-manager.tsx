"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ActionScope, useOptimisticRows } from "@/components/action";
import { toggleFixplatz } from "@/server/actions/event-actions";
import type { PlayerRow } from "@/server/event-service";

export function FixplatzManager({
  eventKey,
  rows,
  canEdit,
  max,
}: {
  eventKey: string;
  rows: PlayerRow[];
  canEdit: boolean;
  max: number;
}) {
  const t = useTranslations("fix");
  const tt = useTranslations("teams");
  const [query, setQuery] = useState("");
  const { rows: local, mutate } = useOptimisticRows(rows);

  const toggle = (playerId: string) =>
    mutate(
      (cur) =>
        cur.map((r) => (r.playerId === playerId ? { ...r, isFixplatz: !r.isFixplatz } : r)),
      () => toggleFixplatz(eventKey, playerId),
    );

  const fix = local.filter((r) => r.isFixplatz);
  const rest = useMemo(() => {
    const q = query.trim().toLowerCase();
    return local
      .filter((r) => !r.isFixplatz)
      .filter((r) => (q ? r.name.toLowerCase().includes(q) : true));
  }, [local, query]);

  return (
    <ActionScope>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="text-lg">{t("heading")}</h2>
              <p className="text-xs text-muted font-mono">
                {t("granted", { count: fix.length, max })}
              </p>
            </div>
            <span className="tag border-ok/50 text-ok">{t("priority")}</span>
          </div>
          <div className="p-3">
            {fix.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{t("none")}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {fix.map((r) => (
                  <li key={r.playerId}>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggle(r.playerId)}
                      className={`tag border-ok/50 text-ok py-1 px-2 ${
                        canEdit ? "hover:border-danger hover:text-danger" : "cursor-default"
                      }`}
                      title={canEdit ? t("remove") : undefined}
                    >
                      ⭐ {r.name}
                      {canEdit && <span className="ml-1">✕</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-muted">{t("explain")}</p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="text-lg">{t("addHeading")}</h2>
            <input
              className="input w-44"
              placeholder={tt("search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={tt("searchAria")}
            />
          </div>
          <ul className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
            {rest.map((r) => (
              <li key={r.playerId}>
                <button
                  type="button"
                  disabled={!canEdit || fix.length >= max}
                  onClick={() => toggle(r.playerId)}
                  className="w-full flex items-center justify-between gap-2 rounded border border-line bg-panel-2 px-2 py-1.5 text-sm text-left hover:border-sand-dim disabled:opacity-40 disabled:hover:border-line"
                >
                  <span className="truncate">{r.name}</span>
                  <span className="tag shrink-0">{t("add")}</span>
                </button>
              </li>
            ))}
            {rest.length === 0 && (
              <li className="py-6 text-center text-sm text-muted">{t("noHits")}</li>
            )}
          </ul>
        </section>
      </div>
    </ActionScope>
  );
}
