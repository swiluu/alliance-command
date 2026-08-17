import { notFound } from "next/navigation";

import { getAccessLevel, hasAtLeast, requireEventTab, siehtFuehrungsdaten } from "@/lib/access";
import { isEventKey } from "@/lib/constants";
import { ensurePlayerStates, getPlayerRows } from "@/server/event-service";

import { PlayerTable } from "./player-table";

export default async function SpielerPage({ params }: { params: { eventKey: string } }) {
  const { eventKey } = params;
  if (!isEventKey(eventKey)) notFound();

  const { user, level } = await requireEventTab(eventKey, "spieler");
  await ensurePlayerStates(eventKey);
  const [rows, allianzLevel] = await Promise.all([
    getPlayerRows(eventKey, siehtFuehrungsdaten(user)),
    getAccessLevel(user, "allianz"),
  ]);

  return (
    <PlayerTable
      eventKey={eventKey}
      rows={rows}
      canEdit={level === "EDIT"}
      canManageRoster={hasAtLeast(allianzLevel, "READ")}
    />
  );
}
