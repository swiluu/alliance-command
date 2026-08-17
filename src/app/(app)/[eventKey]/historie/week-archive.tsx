"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { groupsByUnlock, substituteGroup, type PositionGroup } from "@/lib/event-layouts";
import type { AssignmentRow } from "@/server/event-service";

/**
 * Schreibgeschützter Blick auf vergangene Battle-Maps. Die Snapshots liegen
 * nicht in eigenen Tabellen, sondern ergeben sich aus WeeklyAssignment.week.
 */
export function WeekArchive({
  eventKey,
  week,
  currentWeek,
  totalWeeks,
  groups,
  assignments,
}: {
  eventKey: string;
  week: number;
  currentWeek: number;
  totalWeeks: number;
  groups: PositionGroup[];
  assignments: AssignmentRow[];
}) {
  const t = useTranslations("archive");
  const router = useRouter();

  const bySlot = new Map<string, AssignmentRow>();
  for (const a of assignments) {
    if (a.team && a.positionKey && a.slotIndex !== null) {
      bySlot.set(`${a.team}:${a.positionKey}:${a.slotIndex}`, a);
    }
  }
  const bench = assignments.filter((a) => a.team === null);
  const main = groupsByUnlock(groups);
  const sub = substituteGroup(groups);

  return (
    <div className="panel">
      <div className="panel-head flex-wrap">
        <div>
          <h2 className="text-lg">{t("heading")}</h2>
          <p className="text-xs text-muted font-mono">
            {t("subline", { count: assignments.length, week })}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          {t("week")}
          <select
            className="input w-24 py-1"
            value={week}
            onChange={(e) => router.push(`/${eventKey}/historie?woche=${e.target.value}`)}
          >
            {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                {w}
                {w === currentWeek ? t("current") : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {assignments.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">{t("empty", { week })}</p>
      ) : (
        <div className="p-3 grid gap-4 xl:grid-cols-2">
          {(["A", "B"] as const).map((team) => (
            <section key={team} className="rounded border border-line">
              <h3 className="px-3 py-2 border-b border-line text-sand text-sm">
                Team {team}
              </h3>
              <div className="p-2 space-y-1">
                {main.map((g) => (
                  <div key={g.key} className="flex items-start gap-2 text-xs">
                    <span className="w-44 shrink-0 text-muted truncate" title={g.label}>
                      {g.icon} {g.label}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {Array.from({ length: g.slots }, (_, i) => {
                        const a = bySlot.get(`${team}:${g.key}:${i}`);
                        return (
                          <span
                            key={i}
                            className={`tag ${a ? "border-ok/40 text-ink" : "opacity-50"}`}
                          >
                            {a?.playerName ?? "—"}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                ))}
                {sub && (
                  <div className="flex items-start gap-2 text-xs pt-1 border-t border-line/60">
                    <span className="w-44 shrink-0 text-muted">
                      {sub.icon} {sub.label}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {Array.from({ length: sub.slots }, (_, i) => {
                        const a = bySlot.get(`${team}:${sub.key}:${i}`);
                        return (
                          <span key={i} className={`tag ${a ? "" : "opacity-50"}`}>
                            {a?.playerName ?? "—"}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                )}
              </div>
            </section>
          ))}

          {bench.length > 0 && (
            <div className="xl:col-span-2 text-xs">
              <span className="text-muted mr-2">{t("bench")}</span>
              {bench.map((b) => (
                <span key={b.id} className="tag mr-1">
                  {b.playerName}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
