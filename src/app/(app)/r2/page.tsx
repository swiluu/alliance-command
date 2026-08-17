import { getTranslations } from "next-intl/server";

import { requireAccess } from "@/lib/access";
import { KADER, prisma } from "@/lib/db";
import { isoWeekOf } from "@/lib/iso-week";
import { ALLIANZ_TAG } from "@/lib/allianz";

import { R2Table } from "./r2-table";

export async function generateMetadata() {
  const t = await getTranslations("r2");
  return { title: `${t("heading")} · ${ALLIANZ_TAG} Command` };
}

/** Wie viele abgeschlossene Zeiträume die Vergangenheit zeigt. */
const HISTORIE = 60;

/**
 * R2-Status des Kaders an einer Stelle.
 *
 * Eigenes Modul und nicht je Event: der Rang gilt im Spiel für beides. Was
 * hier markiert wird, erscheint in Wüstensturm und Schluchtsturm gleichzeitig.
 */
export default async function R2Page() {
  const { level } = await requireAccess("r2", "READ");

  const [players, vergangen] = await Promise.all([
    prisma.player.findMany({
      where: KADER,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        thpRaw: true,
        registrations: { select: { eventKey: true, status: true } },
        r2Records: {
          where: { until: null },
          take: 1,
          select: { since: true, markedBy: true },
        },
      },
    }),
    // Abgeschlossene Zeiträume, neueste zuerst. Auch von Spielern, die
    // inzwischen ausgetreten sind – die Vergangenheit gehört ihnen trotzdem.
    prisma.r2Record.findMany({
      where: { until: { not: null } },
      orderBy: { until: "desc" },
      take: HISTORIE,
      select: {
        id: true,
        since: true,
        until: true,
        markedBy: true,
        liftedBy: true,
        player: { select: { name: true } },
      },
    }),
  ]);

  const rows = players.map((p) => ({
    playerId: p.id,
    name: p.name,
    isR2: p.r2Records.length > 0,
    since: p.r2Records[0]?.since.toISOString() ?? null,
    markedBy: p.r2Records[0]?.markedBy ?? null,
    thpRaw: p.thpRaw,
    // Angemeldet trotz R2 – das sind die Fälle, die beim Gegenprüfen auffallen
    // müssen, weil sie später von Hand aussortiert werden.
    registeredIn: p.registrations.filter((r) => r.status === "TEIL").map((r) => r.eventKey),
  }));

  // Nach Kalenderwoche gebündelt, und zwar nach der Woche des Aufhebens:
  // gefragt ist "wer war in KW33 R2", nicht "von wann bis wann lief der
  // Eintrag". Wird die Markierung in KW33 abgenommen, steht der Spieler
  // unter KW33.
  const history = vergangen.map((r) => {
    const woche = isoWeekOf(r.until!);
    return {
      id: r.id,
      name: r.player.name,
      year: woche.year,
      kw: woche.kw,
      markedBy: r.markedBy,
      liftedBy: r.liftedBy,
    };
  });

  return <R2Table rows={rows} history={history} canEdit={level === "EDIT"} />;
}
