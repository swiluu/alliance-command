import { getTranslations } from "next-intl/server";

import { requireAccess, siehtFuehrungsdaten } from "@/lib/access";
import { MAX_PLAYERS, TACTICAL_EVENTS } from "@/lib/constants";
import { prisma } from "@/lib/db";

import { RosterTable } from "./roster-table";

export async function generateMetadata() {
  const t = await getTranslations("roster");
  return { title: t("title") };
}

export default async function AllianzPage() {
  const { user, level } = await requireAccess("allianz", "READ");
  // Notizen sind Führungsdaten: dort stehen Bemerkungen über Leute, die
  // nicht für die ganze Allianz gedacht sind. Serverseitig entfernt, nicht
  // nur ausgeblendet – sonst stünden sie trotzdem in den Seitendaten.
  const zeigtNotizen = siehtFuehrungsdaten(user);
  const t = await getTranslations("roster");
  const te = await getTranslations("event");
  const tm = await getTranslations("modules");

  const players = await prisma.player.findMany({
    orderBy: [{ leftAt: "asc" }, { isExternal: "asc" }, { name: "asc" }],
    include: {
      eventStates: true,
      registrations: true,
      zug: true,
      _count: {
        select: {
          rotations: true,
          assignments: true,
          plannedDays: true,
          actualDays: true,
          vipDays: true,
        },
      },
    },
  });

  const rows = players.map((p) => ({
    playerId: p.id,
    name: p.name,
    former: p.leftAt !== null,
    accountGeloescht: p.accountDeletedAt !== null,
    external: p.isExternal,
    allianceTag: p.allianceTag,
    notes: zeigtNotizen ? p.notes : null,
    thpRaw: p.thpRaw,
    isR4Rotation: p.zug?.isR4Rotation ?? false,
    historyCount: p._count.rotations,
    assignmentCount: p._count.assignments,
    zugCount: p._count.plannedDays + p._count.actualDays + p._count.vipDays,
    // Woran der Spieler gerade hängt – macht sichtbar, was ein Löschen kostet.
    events: TACTICAL_EVENTS.map((eventKey) => {
      const st = p.eventStates.find((s) => s.eventKey === eventKey);
      const reg = p.registrations.find((r) => r.eventKey === eventKey);
      return {
        eventKey,
        registered: reg?.status === "TEIL",
        isFixplatz: st?.isFixplatz ?? false,
        isBanned: st?.isBanned ?? false,
      };
    }),
  }));

  return (
    <div className="max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{t("kicker")}</p>
          <h1 className="text-3xl text-sand">{tm("allianz")}</h1>
          <p className="mt-1 text-sm text-muted">{t("intro")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="panel px-4 py-2 text-right">
            <div className="font-display text-2xl leading-none">
              {rows.filter((r) => !r.former && !r.external).length}
              <span className="text-muted text-base"> / {MAX_PLAYERS}</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted">
              {t("players")}
            </div>
          </div>
          {level === "READ" && (
            <span className="tag border-sand-dim text-sand">{te("readOnly")}</span>
          )}
        </div>
      </header>

      <RosterTable rows={rows} canEdit={level === "EDIT"} max={MAX_PLAYERS} />
    </div>
  );
}
