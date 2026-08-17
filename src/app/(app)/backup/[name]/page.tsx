import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAccess } from "@/lib/access";
import { isModuleKey } from "@/lib/constants";
import { EVENT_LAYOUTS } from "@/lib/event-layouts";
import { isEventKey } from "@/lib/constants";
import { readBackup, resolveBackup } from "@/server/backup-service";

export async function generateMetadata() {
  const t = await getTranslations("backup");
  return { title: t("detailTitle") };
}

/** Positions-Key → Klartext, anhand des Layouts im Code. */
function positionLabel(eventKey: string, key: string | null, bank: string) {
  if (!key) return bank;
  if (!isEventKey(eventKey)) return key;
  return EVENT_LAYOUTS[eventKey].groups.find((g) => g.key === key)?.label ?? key;
}

export default async function BackupDetailPage({
  params,
  searchParams,
}: {
  params: { name: string };
  searchParams: { event?: string; woche?: string };
}) {
  await requireAccess("backup", "READ");

  const name = decodeURIComponent(params.name);
  if (!resolveBackup(name)) notFound();

  const data = await readBackup(name);
  if (!data) notFound();

  const t = await getTranslations("backup");
  const tm = await getTranslations("modules");
  const modul = (k: string) => (isModuleKey(k) ? tm(k) : k);

  const selectedEvent =
    data.events.find((e) => e.eventKey === searchParams.event) ?? data.events[0];
  const selectedWeek = selectedEvent
    ? (selectedEvent.weeks.find((w) => String(w.week) === searchParams.woche) ??
      selectedEvent.weeks[0])
    : undefined;

  return (
    <div className="max-w-[1100px] mx-auto">
      <header className="mb-5">
        <Link href="/backup" className="text-xs text-muted hover:text-sand">
          {t("allBackups")}
        </Link>
        <h1 className="text-2xl text-sand mt-1 font-mono break-all">{name}</h1>
        <p className="mt-1 text-sm text-muted">{t("readOnlyNote")}</p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <Stat label={t("detailPlayers")} value={String(data.players)} />
        <Stat label={t("detailUsers")} value={String(data.users)} />
        {data.seasons.map((s) => (
          <Stat
            key={s.eventKey}
            label={modul(s.eventKey)}
            value={`KW ${s.currentWeek}`}
          />
        ))}
      </div>

      <div className="panel mb-5">
        <div className="panel-head">
          <h2 className="text-lg">{t("perEvent")}</h2>
        </div>
        <div className="scroll-x">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="px-3 py-2">{t("colEvent")}</th>
                <th className="px-3 py-2 w-28 text-right">{t("colRegistered")}</th>
                <th className="px-3 py-2 w-24 text-right">{t("colBanned")}</th>
                <th className="px-3 py-2">{t("colHistoryWeeks")}</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.eventKey} className="border-b border-line/60">
                  <td className="px-3 py-2">
                    {modul(e.eventKey)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{e.registered}</td>
                  <td className="px-3 py-2 text-right font-mono">{e.banned}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">
                    {e.historyWeeks.length
                      ? t("weeksList", { weeks: e.historyWeeks.join(", ") })
                      : t("noWeeks")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedEvent && selectedWeek && (
        <div className="panel">
          <div className="panel-head flex-wrap">
            <div>
              <h2 className="text-lg">{t("lineupHeading")}</h2>
              <p className="text-xs text-muted font-mono">
                {t("lineupSubline", {
                  week: selectedWeek.week,
                  a: selectedWeek.teamA,
                  b: selectedWeek.teamB,
                })}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {data.events.map((e) => (
                <Link
                  key={e.eventKey}
                  href={`/backup/${encodeURIComponent(name)}?event=${e.eventKey}`}
                  className={`tag ${
                    e.eventKey === selectedEvent.eventKey ? "border-sand text-sand" : ""
                  }`}
                >
                  {modul(e.eventKey)}
                </Link>
              ))}
              {selectedEvent.weeks.map((w) => (
                <Link
                  key={w.week}
                  href={`/backup/${encodeURIComponent(name)}?event=${selectedEvent.eventKey}&woche=${w.week}`}
                  className={`tag ${w.week === selectedWeek.week ? "border-sand text-sand" : ""}`}
                >
                  KW {w.week}
                </Link>
              ))}
            </div>
          </div>

          <div className="p-3 grid gap-4 xl:grid-cols-2">
            {(["A", "B"] as const).map((team) => (
              <section key={team} className="rounded border border-line">
                <h3 className="px-3 py-2 border-b border-line text-sand text-sm">
                  Team {team}
                </h3>
                <ul className="p-2 space-y-0.5 text-xs">
                  {selectedWeek.lineup
                    .filter((l) => l.team === team)
                    .map((l, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="w-44 shrink-0 text-muted truncate">
                          {positionLabel(selectedEvent.eventKey, l.positionKey, t("bench"))}
                          {l.slot !== null && ` #${l.slot + 1}`}
                        </span>
                        <span className="truncate">
                          {l.player}
                          {l.replaces && (
                            <span className="text-muted">{t("replaces", { name: l.replaces })}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  {selectedWeek.lineup.filter((l) => l.team === team).length === 0 && (
                    <li className="py-4 text-center text-muted">{t("noAssignments")}</li>
                  )}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}

      {selectedEvent && selectedEvent.weeks.length === 0 && (
        <p className="panel p-6 text-center text-sm text-muted">
          {t("noLineups")}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-3 py-2">
      <div className="font-display text-2xl leading-none">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
