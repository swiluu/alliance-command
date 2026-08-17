import { notFound } from "next/navigation";

import { requireEventTab } from "@/lib/access";
import { REG_TEIL, isEventKey } from "@/lib/constants";
import { KADER, prisma } from "@/lib/db";
import { ensurePlayerStates, getLayout, getSeason } from "@/server/event-service";

import { AttendanceList } from "./attendance-list";

export default async function AnwesenheitPage({
  params,
}: {
  params: { eventKey: string };
}) {
  const { eventKey } = params;
  if (!isEventKey(eventKey)) notFound();

  const { level } = await requireEventTab(eventKey, "anwesenheit");
  await ensurePlayerStates(eventKey);

  const season = await getSeason(eventKey);
  const week = season.currentWeek;
  const layout = await getLayout(eventKey);

  const [kader, zuteilungen, historie] = await Promise.all([
    prisma.player.findMany({
      where: KADER,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        thpRaw: true,
        registrations: { where: { eventKey }, select: { status: true } },
        eventStates: { where: { eventKey }, select: { isBanned: true } },
      },
    }),
    prisma.weeklyAssignment.findMany({ where: { eventKey, week } }),
    prisma.rotationHistory.findMany({ where: { eventKey, week } }),
  ]);

  const zuteilungVon = new Map(zuteilungen.map((a) => [a.playerId, a]));
  const statusVon = new Map(historie.map((h) => [h.playerId, h.status]));
  const gruppeVon = new Map(layout.groups.map((g) => [g.key, g.label]));

  // Gefragt sind nur die, die diese Woche antreten sollten. Wer abgemeldet
  // oder gesperrt ist, kann nicht fehlen.
  const rows = kader
    .filter(
      (p) =>
        p.registrations[0]?.status === REG_TEIL && !p.eventStates[0]?.isBanned,
    )
    .map((p) => {
      const a = zuteilungVon.get(p.id);
      return {
        playerId: p.id,
        name: p.name,
        thpRaw: p.thpRaw,
        team: a?.team ?? null,
        position: a?.positionKey ? (gruppeVon.get(a.positionKey) ?? null) : null,
        isSubstitute: a?.isSubstitute ?? false,
        fehlt: statusVon.get(p.id) === "FEHLT_ANGEMELDET",
      };
    });

  return (
    <AttendanceList
      eventKey={eventKey}
      week={week}
      rows={rows}
      canEdit={level === "EDIT"}
    />
  );
}
