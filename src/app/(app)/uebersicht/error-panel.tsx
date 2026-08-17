"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { ActionScope, useAction } from "@/components/action";
import { fehlerAbhaken, alleFehlerAbhaken } from "@/server/actions/error-actions";

export type ErrorRow = {
  id: string;
  createdAt: string;
  source: string | null;
  message: string;
  detail: string | null;
  userName: string | null;
};

/**
 * Störungsmeldung für Superadmins.
 *
 * Steht ganz oben auf der Übersicht und nur dann, wenn es etwas zu melden
 * gibt – eine Dauerkachel „keine Fehler" würde man nach einer Woche nicht mehr
 * wahrnehmen, und genau darauf käme es an.
 *
 * Gezeigt wird, was hier steht: unerwartete Fehler. Fehlende Rechte oder
 * ungültige Eingaben stehen bewusst nicht drin – die hat der Benutzer schon
 * auf dem Bildschirm gelesen.
 */
export type OverdueRow = { job: string; label: string; zeit: string; zuletzt: string | null };

export function ErrorPanel({
  rows,
  total,
  overdue,
}: {
  rows: ErrorRow[];
  total: number;
  overdue: OverdueRow[];
}) {
  const t = useTranslations("fehler");
  const f = useFormatter();
  const { run, pending } = useAction();
  const [offen, setOffen] = useState<string | null>(null);

  if (rows.length === 0 && overdue.length === 0) return null;

  const zeit = (iso: string) =>
    f.dateTime(new Date(iso), {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <ActionScope>
      <section className="panel border-danger/50">
        <div className="panel-head flex-wrap gap-2">
          <div>
            <h2 className="text-lg text-danger">
              <span aria-hidden className="mr-1">
                ⚠
              </span>
              {t("heading", { count: total + overdue.length })}
            </h2>
            <p className="text-xs text-muted">{t("subline")}</p>
          </div>
          <button
            type="button"
            className="btn text-xs"
            disabled={pending}
            onClick={() => run(() => alleFehlerAbhaken())}
          >
            {t("dismissAll")}
          </button>
        </div>

        {/* Ausgebliebene Läufe zuerst: ein Skript, das gar nicht startet,
            meldet sich nie selbst – das ist der gefährlichere Fall. */}
        {overdue.length > 0 && (
          <ul className="divide-y divide-line/60 border-b border-line">
            {overdue.map((o) => (
              <li key={o.job} className="flex flex-wrap items-baseline gap-x-2 px-3 py-2.5">
                <span className="tag border-danger/50 text-danger">{o.label}</span>
                <span className="flex-1 min-w-[12rem] text-sm">
                  {t("overdue", { zeit: o.zeit })}
                </span>
                <span className="text-[11px] text-muted">
                  {o.zuletzt ? t("lastRun", { date: zeit(o.zuletzt) }) : t("neverRun")}
                </span>
              </li>
            ))}
          </ul>
        )}

        <ul className="divide-y divide-line/60">
          {rows.map((r) => (
            <li key={r.id} className="px-3 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-[11px] text-muted">{zeit(r.createdAt)}</span>
                {r.source && (
                  <span className="tag border-danger/50 text-danger">{r.source}</span>
                )}
                <span className="flex-1 min-w-[12rem] text-sm">{r.message}</span>
                {r.userName && (
                  <span className="text-[11px] text-muted">{t("byWhom", { name: r.userName })}</span>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                {r.detail && (
                  <button
                    type="button"
                    className="text-[11px] text-muted hover:text-sand"
                    onClick={() => setOffen(offen === r.id ? null : r.id)}
                    aria-expanded={offen === r.id}
                  >
                    {offen === r.id ? t("hideDetail") : t("showDetail")}
                  </button>
                )}
                <button
                  type="button"
                  className="text-[11px] text-muted hover:text-ok"
                  disabled={pending}
                  onClick={() => run(() => fehlerAbhaken(r.id))}
                >
                  {t("dismiss")}
                </button>
              </div>

              {offen === r.id && r.detail && (
                <pre className="mt-2 max-h-64 overflow-auto rounded border border-line bg-panel-2/60 p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                  {r.detail}
                </pre>
              )}
            </li>
          ))}
        </ul>

        {total > rows.length && (
          <p className="border-t border-line px-3 py-2 text-xs text-muted">
            {t("more", { count: total - rows.length })}
          </p>
        )}
      </section>
    </ActionScope>
  );
}
