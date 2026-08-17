import { notFound } from "next/navigation";

import { requireEventTab } from "@/lib/access";
import { isEventKey } from "@/lib/constants";
import { hasStaggeredUnlocks, slotsPerTeam } from "@/lib/event-layouts";
import {
  ensurePlayerStates,
  getAssignments,
  getLayout,
  getPool,
  getSeason,
} from "@/server/event-service";

import { BattleMap } from "./battle-map";

export default async function PlanungPage({ params }: { params: { eventKey: string } }) {
  const { eventKey } = params;
  if (!isEventKey(eventKey)) notFound();

  const { level } = await requireEventTab(eventKey, "planung");
  await ensurePlayerStates(eventKey);

  const season = await getSeason(eventKey);
  const [layout, pool, assignments] = await Promise.all([
    getLayout(eventKey),
    getPool(eventKey, season.currentWeek),
    getAssignments(eventKey, season.currentWeek),
  ]);

  return (
    <BattleMap
      eventKey={eventKey}
      week={season.currentWeek}
      groups={layout.groups}
      pool={pool}
      assignments={assignments}
      canEdit={level === "EDIT"}
      slotsPerTeam={slotsPerTeam(layout.groups)}
      showUnlocks={hasStaggeredUnlocks(layout.groups)}
    />
  );
}
