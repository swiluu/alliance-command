import { notFound } from "next/navigation";

import { requireEventTab } from "@/lib/access";
import { MAX_FIXPLATZ, isEventKey } from "@/lib/constants";
import { ensurePlayerStates, getPlayerRows } from "@/server/event-service";

import { FixplatzManager } from "./fixplatz-manager";

export default async function FixplatzPage({ params }: { params: { eventKey: string } }) {
  const { eventKey } = params;
  if (!isEventKey(eventKey)) notFound();

  const { level } = await requireEventTab(eventKey, "fixplatz");
  await ensurePlayerStates(eventKey);
  const rows = await getPlayerRows(eventKey);

  return (
    <FixplatzManager
      eventKey={eventKey}
      rows={rows}
      canEdit={level === "EDIT"}
      max={MAX_FIXPLATZ}
    />
  );
}
