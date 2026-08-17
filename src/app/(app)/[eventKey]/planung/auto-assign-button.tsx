"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAction } from "@/components/action";
import {
  applyAutoAssign,
  previewAutoAssign,
} from "@/server/actions/auto-assign-actions";
import type { AutoAssignPlan } from "@/server/auto-assign";

/**
 * Automatische Positionsverteilung, nachdem Team A und Team B stehen.
 *
 * Zeigt immer erst einen Vorschlag. Übernommen wird nur auf ausdrücklichen
 * Klick – die Aufstellung ist zu wichtig, um sie blind zu überschreiben.
 */
export function AutoAssignButton({ eventKey }: { eventKey: string }) {
  const t = useTranslations("auto");
  const tc = useTranslations("common");
  const [plan, setPlan] = useState<AutoAssignPlan | null>(null);
  const { run, pending } = useAction();

  const laden = () =>
    run(async () => {
      const r = await previewAutoAssign(eventKey);
      if (r.ok) setPlan(r.data);
      return r;
    });

  const uebernehmen = () =>
    run(async () => {
      const r = await applyAutoAssign(eventKey);
      if (r.ok) setPlan(null);
      return r;
    });

  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={laden}
        title={t("buttonTitle")}
      >
        {t("button")}
      </button>

      {plan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
        >
          {/*
            Feste Höhe statt max-h-full: in einem zentrierten Container richtet
            sich eine Prozentangabe nach dem Inhalt, nicht nach dem Fenster –
            der Kasten wüchse also über den Bildschirm hinaus und liesse sich
            nicht scrollen. dvh statt vh, damit die Leisten mobiler Browser
            mitgerechnet werden.
          */}
          <div className="panel flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col sm:max-h-[calc(100dvh-3rem)]">
            <div className="panel-head flex-wrap gap-2">
              <div>
                <h2 className="text-lg">{t("heading", { week: plan.week })}</h2>
                <p className="text-xs text-muted">{t("intro")}</p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-4">
              {plan.warnings.length > 0 && (
                <ul className="rounded border border-sand-dim/60 bg-sand/10 px-3 py-2 text-xs text-sand space-y-1">
                  {plan.warnings.map((w, i) => (
                    <li key={i}>{t(`warn.${w.key}`, w.params)}</li>
                  ))}
                </ul>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {plan.teams.map((team) => (
                  <section key={team.team}>
                    <h3 className="mb-2 text-sm text-sand">
                      Team {team.team}
                      <span className="ml-2 font-mono text-[11px] text-muted">
                        {t("memberCount", { count: team.memberCount })}
                      </span>
                    </h3>
                    <ul className="space-y-0.5 text-xs">
                      {team.slots.map((s) => (
                        <li
                          key={`${s.positionKey}:${s.slotIndex}`}
                          className={`flex items-baseline gap-2 rounded px-2 py-1 ${
                            s.playerId ? "bg-panel-2/40" : "bg-panel-2/10 text-muted"
                          }`}
                        >
                          <span className="w-40 shrink-0 truncate text-muted">
                            {s.positionLabel}
                            <span className="ml-1 font-mono opacity-60">
                              {s.slotIndex + 1}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {s.playerName ?? "—"}
                            {s.isHunter && (
                              <span
                                className="ml-1 text-sand"
                                title={t("hunterTitle")}
                              >
                                🎯
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-muted">
                            {s.thpRaw ?? ""}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {team.swaps.length > 0 && (
                      <>
                        <h4 className="mt-2 mb-1 text-[11px] uppercase tracking-wider text-muted">
                          {t("swapsHeading")}
                        </h4>
                        <ul className="space-y-0.5 text-xs">
                          {team.swaps.map((w) => (
                            <li
                              key={w.inPlayerId}
                              className="flex items-baseline gap-2 rounded bg-panel-2/40 px-2 py-1"
                            >
                              <span className="min-w-0 flex-1 truncate text-ok">
                                {w.inName}
                              </span>
                              <span className="shrink-0 text-muted">{t("swapFor")}</span>
                              <span className="min-w-0 flex-1 truncate">{w.outName}</span>
                              <span
                                className="shrink-0 font-mono text-[10px] text-muted"
                                title={t("swapCountTitle", {
                                  name: w.outName,
                                  count: w.outPastCount,
                                })}
                              >
                                {w.outPositionLabel} · {w.outPastCount}×
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {team.bench.length > team.swaps.length && (
                      <p className="mt-1 text-xs text-muted">
                        {t("noPartner", {
                          names: team.bench
                            .filter(
                              (b) => !team.swaps.some((w) => w.inPlayerId === b.playerId),
                            )
                            .map((b) => b.playerName)
                            .join(", "),
                        })}
                      </p>
                    )}
                  </section>
                ))}
              </div>

              <details className="text-xs text-muted">
                <summary className="cursor-pointer">{t("showOrder")}</summary>
                <ol className="mt-2 space-y-0.5 pl-4">
                  {plan.order.map((o) => (
                    <li key={o.positionKey}>
                      {o.label}
                      <span className="ml-2 font-mono opacity-70">
                        {o.medianRank === null
                          ? t("noExperience")
                          : t("strength", {
                              rank: o.medianRank.toFixed(2),
                              samples: o.samples,
                            })}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-line p-3">
              <button type="button" className="btn" onClick={() => setPlan(null)}>
                {tc("cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending}
                onClick={uebernehmen}
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
