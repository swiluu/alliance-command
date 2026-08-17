import { notFound } from "next/navigation";

import { requireEventTab } from "@/lib/access";
import { isEventKey } from "@/lib/constants";
import { KADER, prisma } from "@/lib/db";
import { getAssignments, getLayout, getSeason } from "@/server/event-service";

import { HistoryHeatmap } from "./history-heatmap";
import { WeekArchive } from "./week-archive";

export default async function HistoriePage({
  params,
  searchParams,
}: {
  params: { eventKey: string };
  searchParams: { woche?: string };
}) {
  const { eventKey } = params;
  if (!isEventKey(eventKey)) notFound();

  const { level } = await requireEventTab(eventKey, "historie");
  const season = await getSeason(eventKey);
  const layout = await getLayout(eventKey);

  const [players, history] = await Promise.all([
    // Nur der aktive Kader. Ausgetretene standen hier bisher weiter drin,
    // meist mit leeren Zeilen – die Tabelle wuchs mit jedem Abgang, ohne dass
    // die Zeilen etwas hergaben.
    //
    // Ihre Einträge bleiben in der Datenbank: wer zurückkommt, erscheint
    // sofort wieder mit vollständiger Historie. Verborgen, nicht gelöscht.
    prisma.player.findMany({
      where: KADER,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.rotationHistory.findMany({
      where: { eventKey },
      select: { playerId: true, week: true, status: true },
    }),
  ]);

  // Archiv-Woche: Standard ist die zuletzt abgeschlossene Woche.
  const requested = Number(searchParams.woche);
  const archiveWeek =
    Number.isFinite(requested) && requested >= 1 && requested <= layout.totalWeeks
      ? requested
      : Math.max(1, season.currentWeek - 1);
  const archive = await getAssignments(eventKey, archiveWeek);

  return (
    <div className="space-y-5">
      <HistoryHeatmap
        eventKey={eventKey}
          players={players}
        history={history}
        currentWeek={season.currentWeek}
        totalWeeks={layout.totalWeeks}
        canEdit={level === "EDIT"}
      />
      <WeekArchive
        eventKey={eventKey}
        week={archiveWeek}
        currentWeek={season.currentWeek}
        totalWeeks={layout.totalWeeks}
        groups={layout.groups}
        assignments={archive}
      />
    </div>
  );
}
