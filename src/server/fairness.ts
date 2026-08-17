import "server-only";

import { TACTICAL_EVENTS, type EventKey } from "@/lib/constants";
import { KADER, prisma } from "@/lib/db";
import { weekOrder } from "@/lib/iso-week";

/**
 * Auswertung, wer wie oft dran war.
 *
 * Beantwortet die Frage, die bei jeder Team-Zuteilung aufkommt: warum bin ich
 * diese Woche draussen? Die Zahlen liegen längst in der Rotations-Historie und
 * im Zug-Plan, sie waren nur nirgends zusammengefasst.
 *
 * Die Quote rechnet bewusst nur über die Wochen, in denen jemand überhaupt zur
 * Verfügung stand: Einsätze geteilt durch Einsätze plus Ausgesetzte. Wochen
 * ohne Anmeldung ("nicht dabei") bleiben aussen vor – sonst sähe jeder, der
 * mal pausiert hat, unfair behandelt aus.
 */

/** Unter so vielen Wochen wird kein Vergleich gezeigt. */
export const MIN_WOCHEN = 3;

export type EventFairness = {
  playerId: string;
  name: string;
  thpRaw: string | null;
  /** Gespielt oder auf der Bank – beides ist ein Einsatz. */
  einsaetze: number;
  /** Angemeldet, aber nicht eingeteilt. */
  ausgesetzt: number;
  /** Angemeldet und nicht erschienen. */
  gefehlt: number;
  /** Wochen ohne Anmeldung. */
  nichtDabei: number;
  /** Wochen, in denen der Spieler zur Verfügung stand (Einsätze + Ausgesetzt). */
  verfuegbar: number;
  /** Anteil der Einsätze an den verfügbaren Wochen, null wenn nie verfügbar. */
  quote: number | null;
  /**
   * Abweichung von der Quote der Allianz, in Prozentpunkten. Bleibt leer,
   * solange zu wenige Wochen vorliegen – bei einer einzigen Woche kämen
   * zwangsläufig 0 % oder 100 % heraus und damit ein Ausschlag, der nichts
   * bedeutet.
   */
  abweichung: number | null;
};

export type ZugFairness = {
  playerId: string;
  name: string;
  gefahren: number;
  geplant: number;
  vip: number;
  zuletztGefahren: { year: number; kw: number } | null;
  isR4Rotation: boolean;
};

export type FairnessReport = {
  events: { eventKey: EventKey; rows: EventFairness[]; schnitt: number | null }[];
  zug: ZugFairness[];
};

/** Auswertung eines taktischen Events. */
async function eventFairness(eventKey: EventKey) {
  const [kader, historie] = await Promise.all([
    prisma.player.findMany({
      where: KADER,
      select: { id: true, name: true, thpRaw: true },
      orderBy: { name: "asc" },
    }),
    prisma.rotationHistory.groupBy({
      by: ["playerId", "status"],
      where: { eventKey },
      _count: true,
    }),
  ]);

  const zahlen = new Map<string, Record<string, number>>();
  for (const h of historie) {
    const eintrag = zahlen.get(h.playerId) ?? {};
    eintrag[h.status] = h._count;
    zahlen.set(h.playerId, eintrag);
  }

  const roh = kader.map((p) => {
    const z = zahlen.get(p.id) ?? {};
    const einsaetze = (z.GESPIELT ?? 0) + (z.BANK ?? 0);
    const ausgesetzt = z.AUSGESETZT ?? 0;
    const verfuegbar = einsaetze + ausgesetzt;
    return {
      playerId: p.id,
      name: p.name,
      thpRaw: p.thpRaw,
      einsaetze,
      ausgesetzt,
      gefehlt: z.FEHLT_ANGEMELDET ?? 0,
      nichtDabei: z.NICHT_DABEI ?? 0,
      verfuegbar,
      quote: verfuegbar > 0 ? einsaetze / verfuegbar : null,
      abweichung: null as number | null,
    };
  });

  // Der Schnitt zählt Einsätze und Aussetzer der ganzen Allianz zusammen,
  // statt die Einzelquoten zu mitteln – sonst zöge ein Spieler mit zwei
  // Wochen Historie den Wert genauso stark wie einer mit dreissig.
  const summeEinsaetze = roh.reduce((s, r) => s + r.einsaetze, 0);
  const summeVerfuegbar = roh.reduce((s, r) => s + r.einsaetze + r.ausgesetzt, 0);
  const schnitt = summeVerfuegbar > 0 ? summeEinsaetze / summeVerfuegbar : null;

  const rows = roh.map((r) => ({
    ...r,
    abweichung:
      r.quote === null || schnitt === null || r.verfuegbar < MIN_WOCHEN
        ? null
        : (r.quote - schnitt) * 100,
  }));

  return { eventKey, rows, schnitt };
}

/** Auswertung des Zug-Plans. */
async function zugFairness(): Promise<ZugFairness[]> {
  const [kader, tage] = await Promise.all([
    prisma.player.findMany({
      where: KADER,
      select: { id: true, name: true, zug: { select: { isR4Rotation: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.zugDay.findMany({
      select: {
        plannedDriverId: true,
        actualDriverId: true,
        vipPlayerId: true,
        kw: { select: { year: true, kw: true } },
      },
    }),
  ]);

  const gefahren = new Map<string, number>();
  const geplant = new Map<string, number>();
  const vip = new Map<string, number>();
  const zuletzt = new Map<string, { year: number; kw: number }>();

  const zaehle = (m: Map<string, number>, id: string | null) => {
    if (id) m.set(id, (m.get(id) ?? 0) + 1);
  };

  for (const t of tage) {
    zaehle(geplant, t.plannedDriverId);
    zaehle(vip, t.vipPlayerId);
    if (t.actualDriverId) {
      zaehle(gefahren, t.actualDriverId);
      const bisher = zuletzt.get(t.actualDriverId);
      if (!bisher || weekOrder(t.kw) > weekOrder(bisher)) {
        zuletzt.set(t.actualDriverId, t.kw);
      }
    }
  }

  return kader.map((p) => ({
    playerId: p.id,
    name: p.name,
    gefahren: gefahren.get(p.id) ?? 0,
    geplant: geplant.get(p.id) ?? 0,
    vip: vip.get(p.id) ?? 0,
    zuletztGefahren: zuletzt.get(p.id) ?? null,
    isR4Rotation: p.zug?.isR4Rotation ?? false,
  }));
}

export async function getFairnessReport(
  events: EventKey[],
  mitZug: boolean,
): Promise<FairnessReport> {
  const [eventRows, zug] = await Promise.all([
    Promise.all(TACTICAL_EVENTS.filter((e) => events.includes(e)).map(eventFairness)),
    mitZug ? zugFairness() : Promise.resolve([]),
  ]);

  return { events: eventRows, zug };
}
