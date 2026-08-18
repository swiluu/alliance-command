/**
 * Holt die THP-Werte von lastwarrank.com und legt die Rangliste der Allianz als
 * Tagesstand in der Datenbank ab.
 *
 *   npm run refresh:rangliste
 *
 * Läuft täglich per Cron. Die Seite /rangliste liest ausschliesslich diesen
 * Stand – bleibt die Quelle einmal stumm, zeigt sie eben den Vortag statt
 * einer Fehlermeldung.
 *
 * Grundlage ist unser Kader, nicht die Server-Rangliste: die liefert nur die
 * Top 200 des Servers, und darunter liegen aktuell einige Allianzmitglieder. Wer
 * dort nicht auftaucht, behält seinen zuletzt bekannten THP-Wert und wird als
 * solcher markiert.
 *
 * Nebeneffekt mit Absicht: die frischen THP-Werte landen auch am Spieler
 * selbst, damit Spielerliste und Wochenplanung nicht veralten. Ebenso
 * Umbenennungen – wer sich im Spiel umbenennt, heisst danach auch hier so.
 */
import { PrismaClient } from "@prisma/client";

import { merkeLauf, schreibeStoerung } from "@/lib/stoerung";

const prisma = new PrismaClient();

const SERVER_ID = process.env.THP_SERVER_ID || process.env.NEXT_PUBLIC_SERVER_ID || "";
// Ohne eigene Angabe die Schnittstelle der eingerichteten Instanz. Vorher
// stand hier ein localhost-Dienst – auf einem anderen Rechner lauscht dort
// nichts, und der Aufruf endete im nackten "fetch failed".
const BASIS = process.env.LWR_BASE_URL || "https://lastwarrank.com";
const API = process.env.THP_API_URL || `${BASIS}/api/rankings/players`;

export const RANKING_KEYS = {
  fetchedAt: "thp.rangliste.abgerufen",
  capturedAt: "thp.rangliste.stand",
};

type LwrRow = {
  public_id: number;
  name: string;
  alliance_abbr: string | null;
  country: string | null;
  thp: number | null;
  power: number | null;
  captured_at: string | null;
};

/** Holt die Rangliste seitenweise, bis die Quelle nichts mehr liefert. */
async function fetchRanking(): Promise<LwrRow[]> {
  const rows: LwrRow[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const url = `${API}?server_id=${SERVER_ID}&sort_by=thp&sort_dir=desc&limit=100&offset=${offset}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      // "fetch failed" allein sagt niemandem, wo es klemmt. Die Adresse
      // dazuschreiben und den Weg zur Einstellung nennen.
      throw new Error(
        `${API} nicht erreichbar (${e instanceof Error ? e.message : String(e)}). ` +
          `Adresse in der .env prüfen: LWR_BASE_URL bzw. THP_API_URL.`,
      );
    }
    if (!res.ok) throw new Error(`${API} antwortete mit ${res.status}`);

    const batch = ((await res.json()) as { rows?: LwrRow[] }).rows ?? [];
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows;
}

/** "202.59M" – gleiche Darstellung wie überall sonst im Dashboard. */
function formatThp(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return String(value);
}

async function main() {
  const ranking = await fetchRanking();
  if (ranking.length === 0) {
    throw new Error("Keine Zeilen erhalten – alter Stand bleibt unangetastet.");
  }

  // Serverrang ergibt sich aus der Position in der nach THP sortierten Liste.
  const byLwrId = new Map<number, { row: LwrRow; serverRank: number }>();
  ranking.forEach((row, i) => byLwrId.set(row.public_id, { row, serverRank: i + 1 }));

  const kader = await prisma.player.findMany({
    where: { leftAt: null, isExternal: false },
    select: { id: true, name: true, lwrId: true, thpValue: true },
  });

  const eintraege = kader
    .map((p) => {
      const treffer = p.lwrId === null ? undefined : byLwrId.get(p.lwrId);
      const frisch = treffer?.row.thp ?? null;
      const thp = frisch ?? p.thpValue ?? null;
      return {
        playerId: p.id,
        lwrId: p.lwrId,
        // Der Name aus der Quelle ist massgeblich, falls jemand umbenannt hat.
        name: treffer?.row.name ?? p.name,
        bisherName: p.name,
        country: treffer?.row.country ?? null,
        thp,
        power: treffer?.row.power ?? null,
        // Nur aussagekräftig, wenn der Wert von heute stammt – sonst stünde
        // ein Rang neben einem veralteten THP.
        serverRank: frisch === null ? null : (treffer?.serverRank ?? null),
        stale: frisch === null,
      };
    })
    // Niemand fällt raus – wer keinen Wert hat, steht am Ende der Liste.
    .sort((a, b) => (b.thp ?? -1) - (a.thp ?? -1));

  await prisma.$transaction([
    prisma.thpRankingEntry.deleteMany(),
    prisma.thpRankingEntry.createMany({
      // `bisherName` dient nur dem Vergleich beim Umbenennen und ist keine
      // Spalte der Tabelle – es muss hier raus.
      data: eintraege.map(({ bisherName, ...e }, i) => ({ ...e, rank: i + 1 })),
    }),
  ]);

  // Frische Werte auch am Spieler nachziehen – nur bei eindeutigem Treffer
  // über die lwrId, niemals über den Namen.
  let aktualisiert = 0;
  const jetzt = new Date();
  for (const e of eintraege) {
    if (e.stale || e.lwrId === null || e.thp === null) continue;
    await prisma.player.update({
      where: { id: e.playerId },
      data: { thpValue: e.thp, thpRaw: formatThp(e.thp), thpUpdated: jetzt },
    });
    aktualisiert++;
  }

  // Umbenennungen nachziehen. Die lwrId ist stabil, eine Namensänderung im
  // Spiel ändert sie nicht – der Treffer ist also eindeutig. Historie,
  // Zuteilungen und Zug-Einträge hängen an der Datensatz-ID, nicht am Namen,
  // es geht dabei nichts verloren.
  // Umbenennungen macht dieses Skript **nicht** mehr.
  //
  // Es kannte nur den Tagesstand der Serverrangliste. Der hinkt hinterher, und
  // damit machte es die Arbeit des stündlichen Namensabgleichs zunichte: als
  // ein Spieler zurück zu "Bob xD" wechselte, setzte der Abgleich den Namen
  // richtig – und dieses Skript beim nächsten Lauf wieder auf "Yarrrak Obama",
  // weil in seinem Tagesstand noch der alte stand.
  //
  // Namen kommen jetzt ausschliesslich aus scripts/namen-abgleich.ts. Der
  // fragt jedes Profil einzeln ab, stündlich, und ist damit die verlässlichere
  // Quelle. Hier bleiben die THP-Werte.
  const umbenennungen: string[] = [];

  const capturedAt = ranking[0]?.captured_at ?? null;
  for (const [key, value] of [
    [RANKING_KEYS.fetchedAt, jetzt.toISOString()],
    [RANKING_KEYS.capturedAt, capturedAt ?? ""],
  ] as [string, string][]) {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  const ohneWert = eintraege.filter((e) => e.thp === null).length;
  const veraltet = eintraege.filter((e) => e.stale && e.thp !== null).length;
  console.log(
    `✓ ${eintraege.length} von ${kader.length} Kadermitgliedern gelistet ` +
      `(${aktualisiert} THP aufgefrischt, ${veraltet} mit altem Wert, ` +
      `${ohneWert} ohne jeden Wert), Stand der Quelle: ${capturedAt ?? "unbekannt"}`,
  );
  if (umbenennungen.length > 0) {
    console.log(`  Umbenannt: ${umbenennungen.join(", ")}`);
  }

  await merkeLauf(prisma, "thp-abgleich");
}

main()
  .catch(async (e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    // Schlägt der Abgleich ganz fehl, veraltet die THP-Rangliste still.
    await schreibeStoerung(prisma, { source: "THP-Abgleich", fehler: e });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
