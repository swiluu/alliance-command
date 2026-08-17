import { notFound } from "next/navigation";

import { requireEventTab } from "@/lib/access";
import { REG_TEIL, isEventKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  groupsByUnlock,
  slotsPerTeam,
  substituteGroup,
  unlockBadgeDe,
} from "@/lib/event-layouts";
import {
  getAssignments,
  getLayout,
  getSeason,
  syncExpiredBans,
} from "@/server/event-service";

import { AnnouncementView } from "./announcement-view";
import type { ImageTeam } from "./lineup-image";

/** "noch 2 Wochen" – bis einschliesslich der Ablaufwoche. */
function remainingWeeks(expiresWeek: number, currentWeek: number): string {
  const weeks = Math.max(1, expiresWeek - currentWeek + 1);
  return weeks === 1 ? "noch 1 Woche" : `noch ${weeks} Wochen`;
}

export default async function AnkuendigungPage({
  params,
}: {
  params: { eventKey: string };
}) {
  const { eventKey } = params;
  if (!isEventKey(eventKey)) notFound();

  await requireEventTab(eventKey, "ankuendigung");

  const season = await getSeason(eventKey);
  await syncExpiredBans(eventKey, season.currentWeek);
  const layout = await getLayout(eventKey);

  const [registered, assignments, bans, bannedStates] = await Promise.all([
    prisma.registrationStatus.findMany({
      where: { eventKey, status: REG_TEIL },
      include: { player: { select: { id: true, name: true } } },
    }),
    prisma.weeklyAssignment.findMany({
      where: { eventKey, week: season.currentWeek },
      select: { playerId: true },
    }),
    prisma.banRecord.findMany({
      where: { eventKey, active: true },
      include: { player: { select: { name: true } } },
      orderBy: [{ expiresWeek: "asc" }, { playerId: "asc" }],
    }),
    prisma.playerEventState.findMany({
      where: { eventKey, isBanned: true },
      select: { playerId: true },
    }),
  ]);

  // Aussetzen muss, wer angemeldet ist, aber keinem Team zugeteilt wurde.
  // Gesperrte bleiben aussen vor: sie stehen unten mit Grund und Restdauer,
  // und beim Wochenabschluss zählen sie als "kein Kader", nicht als
  // "Ausgesetzt". Sonst stünde derselbe Name zweimal in der Ankündigung.
  const assigned = new Set(assignments.map((a) => a.playerId));
  const banned = new Set(bannedStates.map((s) => s.playerId));
  const sittingOut = registered
    .filter((r) => !assigned.has(r.playerId) && !banned.has(r.playerId))
    .map((r) => r.player.name)
    .sort((a, b) => a.localeCompare(b, "de"));

  const banList = bans.map(
    (b) => `${b.player.name} - ${remainingWeeks(b.expiresWeek, season.currentWeek)}`,
  );

  const text = [
    `${layout.displayName} Einteilung Gruppe A+B`,
    "",
    "Aussetzen muss:",
    ...(sittingOut.length ? sittingOut : ["keiner"]),
    // Stehende Regel, unabhängig von der Aufstellung dieser Woche: R1 und R2
    // spielen grundsätzlich nicht mit. Gehört in die Ankündigung, weil sie im
    // Spiel gelesen wird und dort sonst niemand danach fragt.
    "R2 & R1 -> keine Teilnahme",
    "",
    "aktuell Gebannt:",
    ...(banList.length ? banList : ["keiner"]),
  ].join("\n");

  // ── Bilddaten je Team ─────────────────────────────────────
  const lineup = await getAssignments(eventKey, season.currentWeek);
  const bySlot = new Map(
    lineup
      .filter((a) => a.team && a.positionKey && a.slotIndex !== null)
      .map((a) => [`${a.team}:${a.positionKey}:${a.slotIndex}`, a]),
  );
  const perTeam = slotsPerTeam(layout.groups);
  const ordered = [...groupsByUnlock(layout.groups)];
  const sub = substituteGroup(layout.groups);
  if (sub) ordered.push(sub);

  const teams: ImageTeam[] = (["A", "B"] as const).map((team) => ({
    team,
    filled: lineup.filter((a) => a.team === team).length,
    total: perTeam,
    // Die Jäger-Pflicht hängt an der Position: wer dort steht, stellt einen.
    hunterTracking: true,
    groups: ordered.map((g) => ({
      label: g.label,
      labelEn: g.labelEn ?? null,
      icon: g.icon,
      // Freischaltzeit nur zeigen, wo sie wirklich variiert (Schluchtsturm).
      unlockLabel: g.unlockDelayMinutes > 0 ? unlockBadgeDe(g.unlockDelayMinutes) : null,
      requiredHunters: g.requiredHunterCount ?? 0,
      isSubstitute: g.isSubstitute ?? false,
      fullWidth: g.fullWidth ?? false,
      slots: Array.from({ length: g.slots }, (_, i) => {
        const a = bySlot.get(`${team}:${g.key}:${i}`);
        return {
          name: a?.playerName ?? null,
          thp: a?.thpRaw ?? null,
          hunter: i < (g.requiredHunterCount ?? 0),
          replaces: a?.replacesName ?? null,
        };
      }),
    })),
  }));

  return (
    <AnnouncementView
      text={text}
      week={season.currentWeek}
      sittingOut={sittingOut.length}
      banned={banList.length}
      teams={teams}
      eventName={layout.displayName}
      eventKey={eventKey}
    />
  );
}
