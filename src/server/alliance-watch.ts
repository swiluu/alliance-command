import "server-only";

import { prisma } from "@/lib/db";
import { ALLIANZ_TAG, LWR_ALLIANCE_ID, SERVER_ID } from "@/lib/allianz";
import { asciiKey, formatThp, looseKey, type LwrRow } from "@/server/thp";

/**
 * Gleicht den Spieler-Stamm mit der Allianz-Mitgliederliste auf lastwarrank.com ab
 * und meldet Abweichungen auf der Übersicht.
 *
 * Grenze der Datenquelle: die Rangliste liefert die Top 200 des Servers. Wer
 * darunter liegt, taucht dort nicht auf.
 *   - **Neu**: verlässlich – wer in der Liste in der Allianz steht und bei uns
 *     fehlt, ist neu.
 *   - **Weg**: nur wer positiv in einer *anderen* Allianz auftaucht. Wen wir in
 *     der Liste gar nicht finden, melden wir bewusst nicht – das wäre bei jedem
 *     Spieler ausserhalb der Top 200 ein Fehlalarm.
 */

const ALLIANCE = ALLIANZ_TAG;
const ALLIANZ_ID = LWR_ALLIANCE_ID;
const LWR_BASIS = process.env.LWR_BASE_URL ?? "http://localhost:3777";

/**
 * Wer die Allianz verlassen hat, steht in der Mitgliederliste noch eine Weile
 * drin – aber **ohne Rang**. Das ist auf lastwarrank an "99/100" und einem
 * Strich statt R1–R5 zu sehen.
 *
 * Genau diese Abgänge fand die Prüfung unten bisher nicht: sie erkennt nur,
 * wer in einer *anderen* Allianz in den Server-Top-200 auftaucht. Wer einfach
 * rangslos stehen bleibt, rutschte durch.
 */
async function holeRanglose(): Promise<Set<number> | null> {
  try {
    const res = await fetch(`${LWR_BASIS}/api/alliance/${ALLIANZ_ID}`, {
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const daten = (await res.json()) as {
      members?: { public_id: number; alliance_rank: number | null }[];
    };
    if (!daten.members?.length) return null;
    return new Set(
      daten.members.filter((m) => m.alliance_rank === null).map((m) => m.public_id),
    );
  } catch {
    return null;
  }
}

export type AllianceChanges = {
  /** Konnte lastwarrank überhaupt gefragt werden? */
  available: boolean;
  joined: { name: string; thp: string | null; lwrId: number }[];
  left: { name: string; alliance: string }[];
  /** In der Mitgliederliste ohne Rang – hat die Allianz verlassen. */
  ausgetreten: { name: string; lwrId: number }[];
};

/** Wie beim Sync, aber gecacht und mit Zeitlimit – die Übersicht darf nicht hängen. */
async function fetchRoster(): Promise<LwrRow[] | null> {
  const base = process.env.THP_API_URL;
  if (!base) return null;
  const serverId = String(SERVER_ID);

  const rows: LwrRow[] = [];
  try {
    for (let offset = 0; offset < 2000; offset += 100) {
      const url = `${base}?server_id=${serverId}&sort_by=thp&sort_dir=desc&limit=100&offset=${offset}`;
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(4000),
        // Stündlich reicht – die Mitgliederliste ändert sich nicht im Minutentakt.
        next: { revalidate: 3600 },
      });
      if (!res.ok) return rows.length ? rows : null;

      const page = (await res.json()) as { rows?: LwrRow[] };
      const batch = page.rows ?? [];
      rows.push(...batch);
      if (batch.length < 100) break;
    }
  } catch {
    return rows.length ? rows : null;
  }
  return rows;
}

export async function getAllianceChanges(): Promise<AllianceChanges> {
  const [rows, ranglos] = await Promise.all([fetchRoster(), holeRanglose()]);
  if (!rows) return { available: false, joined: [], left: [], ausgetreten: [] };

  // Externe sind keine Allianzmitglieder – sie dürfen den Abgleich nicht als
  // "fehlt in der Allianz" verunreinigen.
  const players = await prisma.player.findMany({
    where: { isExternal: false },
    select: { id: true, name: true, lwrId: true, leftAt: true },
  });

  // Ohne Rang in der Mitgliederliste und bei uns noch aktiv: ausgetreten.
  const ausgetreten = ranglos
    ? players
        .filter((p) => p.leftAt === null && p.lwrId !== null && ranglos.has(p.lwrId))
        .map((p) => ({ name: p.name, lwrId: p.lwrId as number }))
        .sort((a, b) => a.name.localeCompare(b.name, "de"))
    : [];

  const knownIds = new Set(players.map((p) => p.lwrId).filter((v): v is number => v !== null));
  const knownLoose = new Set(players.map((p) => looseKey(p.name)));
  const knownAscii = new Set(players.map((p) => asciiKey(p.name)).filter(Boolean));

  // Neu in der Allianz: steht in der Liste, aber in keinem unserer Datensätze.
  const joined = rows
    .filter((r) => r.alliance_abbr === ALLIANCE)
    .filter(
      (r) =>
        !knownIds.has(r.public_id) &&
        !knownLoose.has(looseKey(r.name)) &&
        !knownAscii.has(asciiKey(r.name)),
    )
    .sort((a, b) => (b.thp ?? 0) - (a.thp ?? 0))
    .map((r) => ({
      name: r.name,
      thp: r.thp === null ? null : formatThp(r.thp),
      lwrId: r.public_id,
    }));

  // Nicht mehr in der Allianz: eindeutig über die lwrId wiedergefunden, aber unter
  // einem anderen Allianz-Tag.
  //
  // Wer bereits als ausgetreten eingetragen ist, gehört hier nicht mehr hin:
  // der Abgang ist bekannt und vermerkt, die Meldung wäre nur noch eine
  // Erinnerung an etwas Erledigtes. Solche Einträge bleiben allein wegen der
  // Historie im Bestand.
  const byId = new Map(rows.map((r) => [r.public_id, r]));
  const left = players
    .filter((p) => p.lwrId !== null && p.leftAt === null)
    .map((p) => ({ player: p, row: byId.get(p.lwrId as number) }))
    .filter(
      (x): x is { player: (typeof players)[number]; row: LwrRow } =>
        Boolean(x.row) && x.row!.alliance_abbr !== ALLIANCE,
    )
    .map((x) => ({
      name: x.player.name,
      alliance: x.row.alliance_abbr ?? "ohne Allianz",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return { available: true, joined, left, ausgetreten };
}
