import { requireAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { isoWeekOf, type Week } from "@/lib/iso-week";
import { listVsWeeks } from "@/server/vs-service";

import { VsAdmin } from "../vs-admin";
import { VsEntry } from "./vs-entry";

/** "2026-32" aus der Adresszeile in eine Woche zurückübersetzen. */
function parseKW(value: string | undefined): Week | undefined {
  const m = value?.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return undefined;
  return { year: Number(m[1]), kw: Number(m[2]) };
}

export default async function ErfassenPage({
  searchParams,
}: {
  searchParams: { kw?: string };
}) {
  await requireAccess("vs", "EDIT");

  // Voreingestellt ist die laufende Woche: dort wird eingetragen, und wer
  // eine ältere nachpflegen will, wählt sie oben aus.
  const week = parseKW(searchParams.kw) ?? isoWeekOf();

  /**
   * Wer aktuell zur Allianz gehört, sagt allein die Allianz-Verwaltung: nicht
   * ausgetreten und kein Externer. Externe sind Leute ausserhalb des Kaders –
   * sie fahren zwar den Zug mit, spielen VS aber nicht für uns.
   */
  const [kader, vorhanden, weeks, alleAktiven] = await Promise.all([
    prisma.player.findMany({
      where: { leftAt: null, isExternal: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.vsScore.findMany({
      where: { week: { year: week.year, kw: week.kw } },
      select: { rawName: true, points: true, playerId: true },
    }),
    listVsWeeks(),
    prisma.player.findMany({
      where: { leftAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  /**
   * Zusätzlich zum Kader steht in der Liste, wer in **dieser** Woche schon
   * Punkte hat – auch wenn er inzwischen ausgetreten oder als Externer
   * geführt ist. Erfasste Zahlen sind Historie und dürfen nicht verschwinden,
   * bloss weil jemand die Allianz verlassen hat.
   *
   * In der aktuellen Woche fällt das zusammen: dort hat nur Punkte, wer auch
   * im Kader steht.
   */
  const imKader = new Set(kader.map((p) => p.id));
  const zusatzIds = [
    ...new Set(
      vorhanden
        .map((v) => v.playerId)
        .filter((id): id is string => Boolean(id) && !imKader.has(id!)),
    ),
  ];
  const zusatz = zusatzIds.length
    ? await prisma.player.findMany({
        where: { id: { in: zusatzIds } },
        select: { id: true, name: true },
      })
    : [];

  const zeilen = [
    ...kader.map((p) => ({ ...p, inRoster: true })),
    ...zusatz.map((p) => ({ ...p, inRoster: false })),
  ].sort((a, b) => a.name.localeCompare(b.name, "de"));

  const werte: Record<string, number> = {};
  for (const v of vorhanden) if (v.playerId) werte[v.playerId] = v.points;

  // Zeilen ohne Kaderbezug – aus einem Excel-Import mit unbekanntem Namen.
  const fremd = vorhanden
    .filter((v) => !v.playerId)
    .map((v) => ({ rawName: v.rawName, points: v.points }));

  // Für die Zuordnung zählen die offenen Namen aller Wochen, nicht nur der
  // gerade gewählten – sonst müsste man sie einzeln durchgehen.
  const offen = await prisma.vsScore.findMany({
    where: { playerId: null },
    select: { rawName: true },
    distinct: ["rawName"],
    orderBy: { rawName: "asc" },
  });

  return (
    <div className="space-y-5">
      {/* Der Schlüssel hängt an der Woche und erzwingt beim Wechsel eine
          frische Komponente. Ohne ihn behielte React die Eingabefelder der
          zuvor gewählten Woche – die Überschrift zeigte die neue Woche, die
          Werte gehörten zur alten, und Speichern hätte die falsche Woche
          überschrieben. */}
      <VsEntry
        key={`${week.year}-${week.kw}`}
        week={week}
        players={zeilen}
        values={werte}
        foreign={fremd}
        available={weeks}
      />
      {/* Beim Zuordnen eines offenen Namens sollen alle Aktiven zur Wahl
          stehen, nicht nur der Kader – sonst liesse sich ein Name, der zu
          einem Externen gehört, nirgends unterbringen. */}
      <VsAdmin unresolved={offen.map((o) => o.rawName)} players={alleAktiven} weeks={weeks} />
    </div>
  );
}
