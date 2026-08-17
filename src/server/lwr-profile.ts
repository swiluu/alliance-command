import "server-only";

/**
 * Wochenverlauf und Spielstand aus dem eigenen lastwarrank.
 *
 * Die Seite dort hält je Spieler eine Wochenhistorie für Power, Hero Power und
 * Kills, dazu Serverrang, Weltrang und den Rang in der Allianz. Diese Angaben
 * gibt es hier nirgends – die Anwendung kennt nur den heutigen THP-Wert.
 *
 * Geholt wird über deren JSON-Schnittstelle `/api/player/<id>` und bewusst
 * nicht über deren HTML: lastwarrank ist selbst ein Parser einer fremden
 * Seite, und ein zweiter Parser darüber wäre doppelt so oft kaputt.
 *
 * Grundsatz: Diese Daten sind Beiwerk. Ist die Quelle langsam, weg oder
 * fehlerhaft, bleibt das Spielerprofil vollständig bedienbar und zeigt an
 * dieser Stelle einfach nichts.
 */

const BASIS = process.env.LWR_BASE_URL ?? "http://localhost:3777";
/** Kurz gehalten: das Profil soll nicht auf eine hängende Quelle warten. */
const ZEITLIMIT_MS = 4000;
/** Die Quelle veröffentlicht täglich – öfter zu fragen bringt nichts. */
const FRISCHE_S = 3600;

export type LwrPunkt = { week_start: string; value: number };

export type LwrDiagramm = {
  title: string;
  currentValue: number | null;
  serverRank: number | null;
  globalRank: number | null;
  growth4w: number | null;
  points: LwrPunkt[];
};

export type LwrProfil = {
  id: string;
  name: string;
  /** Profilbild aus dem Bildernetz des Spiels; nicht jeder hat eines. */
  photoUrl: string | null;
  country: string | null;
  baseLevel: number | null;
  careerTitle: string | null;
  careerLv: number | null;
  serverId: number | null;
  originServerId: number | null;
  /** Rang in der Allianz, 1–5. Eine 2 heisst: im Spiel auf R2 herabgestuft. */
  allianceRank: number | null;
  alliance: { id: string; abbr: string | null; name: string } | null;
  lastSeenAt: string | null;
  bestGlobal: { title: string; rank: number } | null;
  charts: LwrDiagramm[];
};

export async function getLwrProfil(lwrId: number | null): Promise<LwrProfil | null> {
  if (lwrId === null) return null;

  try {
    const res = await fetch(`${BASIS}/api/player/${lwrId}`, {
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
      headers: { "User-Agent": "alliance-command/profil" },
      next: { revalidate: FRISCHE_S },
    });
    if (!res.ok) return null;
    return (await res.json()) as LwrProfil;
  } catch {
    // Absichtlich stumm: ein Ausfall der Nebenquelle ist keine Störung des
    // Dashboards und soll die Fehlerliste der Superadmins nicht fluten.
    return null;
  }
}

/** Deutsche Beschriftung für die Diagrammtitel der Quelle. */
export const DIAGRAMM_TITEL: Record<string, string> = {
  "Total Power": "Gesamtmacht",
  "Total Hero Power": "Hero Power",
  "Army Kills": "Abschüsse",
};
