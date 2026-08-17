import { notFound } from "next/navigation";

import { requireEventTab } from "@/lib/access";
import { isEventKey } from "@/lib/constants";
import { slotsPerTeam } from "@/lib/event-layouts";
import {
  ensurePlayerStates,
  getAssignments,
  getLayout,
  getPool,
  getSeason,
} from "@/server/event-service";

import { TeamAssignment } from "./team-assignment";

export default async function TeamsPage({ params }: { params: { eventKey: string } }) {
  const { eventKey } = params;
  if (!isEventKey(eventKey)) notFound();

  const { level } = await requireEventTab(eventKey, "teams");
  await ensurePlayerStates(eventKey);

  const season = await getSeason(eventKey);
  const [layout, pool, assignments] = await Promise.all([
    getLayout(eventKey),
    getPool(eventKey, season.currentWeek),
    getAssignments(eventKey, season.currentWeek),
  ]);

  const teamOf = new Map(assignments.map((a) => [a.playerId, a.team]));

  return (
    <TeamAssignment
      eventKey={eventKey}
      week={season.currentWeek}
      rows={pool.map((p) => ({ ...p, team: teamOf.get(p.playerId) ?? null }))}
      canEdit={level === "EDIT"}
      slotsPerTeam={slotsPerTeam(layout.groups)}
    />
  );
}
