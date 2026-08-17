import { requireAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getVsRanking } from "@/server/vs-service";
import { isoWeekOf, shiftWeek, weeksInIsoYear, type Week } from "@/lib/iso-week";
import { findConflicts, getOrCreateKW } from "@/server/zug-service";

import { ZugPlan } from "./zug-plan";

export default async function ZugPage({
  searchParams,
}: {
  searchParams: { kw?: string; jahr?: string };
}) {
  const { level } = await requireAccess("zug", "READ");

  // Ohne Angabe die laufende Woche. Das Jahr ist optional, damit alte
  // Lesezeichen ohne Jahr weiter funktionieren.
  const jetzt = isoWeekOf();
  const jahr = Number(searchParams.jahr);
  const nr = Number(searchParams.kw);
  const year = Number.isFinite(jahr) && jahr > 2000 ? jahr : jetzt.year;
  const week: Week =
    Number.isFinite(nr) && nr >= 1 && nr <= weeksInIsoYear(year)
      ? { year, kw: nr }
      : jetzt;

  const [kwRecord, players] = await Promise.all([
    getOrCreateKW(week),
    prisma.player.findMany({
      // Nur der aktive Kader ist wählbar. Externe sind ehemalige Mitglieder –
      // sie fahren nie wieder mit, sollen aber in ihren alten Wochen stehen
      // bleiben.
      where: { leftAt: null, isExternal: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, zug: { select: { isR4Rotation: true } } },
    }),
  ]);

  // Wer in dieser Woche eingetragen ist, aber nicht mehr zum Kader gehört,
  // muss trotzdem mit Namen erscheinen – sonst sähe eine vergangene Woche so
  // aus, als wäre dort nie jemand gefahren. Kommt die Person zurück, rutscht
  // sie von selbst wieder in die normale Liste.
  const referenced = new Set(
    kwRecord.days
      .flatMap((d) => [d.plannedDriverId, d.actualDriverId, d.vipPlayerId])
      .filter((id): id is string => Boolean(id)),
  );
  for (const p of players) referenced.delete(p.id);

  const former = referenced.size
    ? await prisma.player.findMany({
        where: { id: { in: Array.from(referenced) } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, zug: { select: { isR4Rotation: true } } },
      })
    : [];

  // `note` ist ein Bausteinschlüssel, kein fertiger Text – siehe zug-plan.tsx.
  const option = (p: (typeof players)[number], note?: "former" | "notR4") => ({
    id: p.id,
    name: p.name,
    note,
  });

  const conflicts = await findConflicts(week);


  // Vier-Wochen-Schnitt der VS-Auswertung: die ersten sieben ohne R4-Rang
  // sind VIP-berechtigt. Fällt die Auswertung aus, bleibt der Hinweis leer –
  // der Zug muss auch ohne sie planbar sein.
  // Wer VIP fahren darf, richtet sich nach den vier VS-Wochen **vor** der
  // Woche, die hier geplant wird – nicht nach dem Kalender. Für KW34 sind das
  // KW30 bis KW33, für KW33 die Wochen 29 bis 32. Die laufende Woche zählt
  // nie mit: sie ist beim Planen noch nicht gefahren.
  const vipBerechtigt = new Map<string, number>();
  let vipFenster: string | null = null;
  try {
    const rang = await getVsRanking(shiftWeek(week, -1));
    const kws = rang.weeks.map((w) => w.kw);
    vipFenster =
      kws.length === 0
        ? null
        : kws.length === 1
          ? `KW${kws[0]}`
          : `KW${kws[0]}–${kws[kws.length - 1]}`;
    for (const zeile of rang.rows) {
      if (zeile.vipRank !== null && zeile.playerId) {
        vipBerechtigt.set(zeile.playerId, zeile.vipRank);
      }
    }
  } catch {
    /* Beiwerk – niemals die Zug-Planung daran hindern. */
  }

  return (
    <ZugPlan
      week={week}
      currentWeek={jetzt}
      days={kwRecord.days.map((d) => ({
        dayIndex: d.dayIndex,
        weekday: d.weekday,
        plannedDriverId: d.plannedDriverId,
        actualDriverId: d.actualDriverId,
        vipPlayerId: d.vipPlayerId,
      }))}
      players={players.map((p) => option(p))}
      // Die sieben VIP-Plätze sind der einzige Zweck der VS-Auswertung –
      // trotzdem war beim Planen bisher nicht zu sehen, wer sie hat. Wer den
      // Zug macht, musste die Rangliste daneben offen halten.
      vipBerechtigt={vipBerechtigt}
      vipFenster={vipFenster}
      // Ehemalige bleiben nur dort wählbar, wo sie schon eingetragen sind –
      // für neue Einträge stehen sie nicht mehr zur Verfügung.
      archived={former.map((p) => option(p, "former"))}
      // Zugführer wird nur aus dem aktiven R4-Kreis geplant.
      r4Players={players.filter((p) => p.zug?.isR4Rotation).map((p) => option(p))}
      initialConflicts={conflicts}
      canEdit={level === "EDIT"}
    />
  );
}
