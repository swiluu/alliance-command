import "server-only";

import { WEEKDAYS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { isoWeekOf, shiftWeek, weekOrder, type Week } from "@/lib/iso-week";

/** Die laufende Kalenderwoche samt Jahr. */
export const currentWeek = (): Week => isoWeekOf();

/** Holt eine KW und legt sie samt der 7 Tage an, falls sie noch fehlt. */
export async function getOrCreateKW(week: Week) {
  const existing = await prisma.zugKW.findUnique({
    where: { year_kw: week },
    include: { days: { orderBy: { dayIndex: "asc" } } },
  });
  if (existing && existing.days.length === WEEKDAYS.length) return existing;

  if (!existing) {
    await prisma.zugKW.create({
      data: {
        ...week,
        days: { create: WEEKDAYS.map((weekday, dayIndex) => ({ weekday, dayIndex })) },
      },
    });
  } else {
    // Lückenhafte KW auffüllen (z.B. nach unvollständigem Import).
    const have = new Set(existing.days.map((d) => d.dayIndex));
    const missing = WEEKDAYS.map((weekday, dayIndex) => ({ weekday, dayIndex })).filter(
      (d) => !have.has(d.dayIndex),
    );
    if (missing.length) {
      await prisma.zugDay.createMany({
        data: missing.map((m) => ({ ...m, zugKWId: existing.id })),
      });
    }
  }

  return prisma.zugKW.findUniqueOrThrow({
    where: { year_kw: week },
    include: { days: { orderBy: { dayIndex: "asc" } } },
  });
}

/**
 * Konflikt als Bausteinschlüssel statt als fertiger Satz – gemeldet wird im
 * Server, gelesen im Browser, und zwar in der Sprache des Betrachters.
 */
export type Conflict = {
  dayIndex: number;
  key: "sameWeek" | "tooSoon";
  params: Record<string, string | number>;
};

/**
 * Duplikat-Prüfung, serverseitig bei jedem Schreibvorgang und bei jedem Read.
 *
 * Gezählt wird, wer **tatsächlich gefahren** ist. Steht für einen Tag noch
 * kein Ist-Fahrer, gilt der geplante als Vorschau. Das ist der Unterschied,
 * auf den es ankommt: springt für einen geplanten R4 jemand anderes ein, hat
 * der Geplante nicht gefahren – seine Serie beginnt von vorn, und er darf
 * regulär wieder zweimal ran.
 *
 * Angezeigt wird die Warnung beim **geplanten** Zugführer: dort wird die
 * Rotation gemacht, und dort lässt sie sich beheben.
 *
 * Der Rhythmus läuft in **Vierwochen-Zyklen**: zweimal fahren, dann pausieren.
 * Zwei Fahrten gelten als Doppel, wenn zwischen ihnen höchstens eine Woche
 * liegt – "KW 30 und 31" ebenso wie "KW 30 und 32". Die nächste Fahrt darf
 * frühestens vier Wochen nach der **ersten** des Doppels kommen.
 *
 * Gemessen wird bewusst ab der ersten Fahrt, nicht ab der zweiten: sonst
 * bekäme ein Doppel mit Lücke (30 und 32) dieselbe Pause wie eines ohne
 * (30 und 31) und dürfte insgesamt häufiger fahren. So ist jeder gleich oft
 * dran – 30+31 wieder ab 34, 28+30 wieder ab 32.
 *
 * Gemeldet wird also die dritte Fahrt, die zu früh kommt. Genau dort lässt sie
 * sich beheben; die beiden Fahrten davor waren ja in Ordnung.
 *
 * Zusätzlich: derselbe Zugführer mehrfach innerhalb einer KW.
 *
 * Ergebnis blockiert nichts – der Koordinator sieht den Konflikt nur markiert.
 */
export async function findConflicts(week: Week): Promise<Conflict[]> {
  // Drei Wochen zurück: weiter kann ein Doppel nicht zurückliegen, das die
  // angezeigte Woche noch blockiert (Doppel mit einer Woche Abstand, danach
  // eine Woche Pause). Über den Jahreswechsel hinweg gerechnet.
  const fenster = [-3, -2, -1, 0].map((d) => shiftWeek(week, d));
  const weeks = await prisma.zugKW.findMany({
    where: { OR: fenster.map((w) => ({ year: w.year, kw: w.kw })) },
    include: {
      days: {
        orderBy: { dayIndex: "asc" },
        include: {
          plannedDriver: { select: { id: true, name: true } },
          actualDriver: { select: { id: true, name: true } },
        },
      },
    },
  });

  const target = weeks.find((w) => w.year === week.year && w.kw === week.kw);
  if (!target) return [];

  /** Wer an diesem Tag zählt: der Ist-Fahrer, sonst der geplante als Vorschau. */
  const fahrerVon = (d: { actualDriverId: string | null; plannedDriverId: string | null }) =>
    d.actualDriverId ?? d.plannedDriverId;

  const namen = new Map<string, string>();
  for (const w of weeks) {
    for (const d of w.days) {
      if (d.plannedDriver) namen.set(d.plannedDriver.id, d.plannedDriver.name);
      if (d.actualDriver) namen.set(d.actualDriver.id, d.actualDriver.name);
    }
  }

  // Über die laufende Nummer indiziert, damit der Jahreswechsel nicht auffällt.
  const fahrerProWoche = new Map<number, Set<string>>();
  for (const w of weeks) {
    fahrerProWoche.set(
      weekOrder(w),
      new Set(w.days.map(fahrerVon).filter((v): v is string => Boolean(v))),
    );
  }
  const faehrt = (w: Week, id: string) => fahrerProWoche.get(weekOrder(w))?.has(id) ?? false;

  const conflicts: Conflict[] = [];

  // 1. Derselbe Zugführer mehrfach in derselben KW
  const byPlayer = new Map<string, { dayIndex: number; weekday: string }[]>();
  for (const d of target.days) {
    const id = fahrerVon(d);
    if (!id) continue;
    const list = byPlayer.get(id) ?? [];
    list.push({ dayIndex: d.dayIndex, weekday: d.weekday });
    byPlayer.set(id, list);
  }
  for (const [id, days] of Array.from(byPlayer.entries())) {
    if (days.length < 2) continue;
    for (const d of days) {
      const others = days.filter((x) => x.dayIndex !== d.dayIndex).map((x) => x.weekday);
      conflicts.push({
        dayIndex: d.dayIndex,
        key: "sameWeek",
        params: { name: namen.get(id) ?? "", kw: week.kw, days: others.join(", ") },
      });
    }
  }

  // 2. Dritte Fahrt zu früh nach einem Doppel
  const vorwochen = [-3, -2, -1].map((d) => shiftWeek(week, d));

  for (const d of target.days) {
    const id = fahrerVon(d);
    if (!id) continue;

    const gefahren = vorwochen.filter((w) => faehrt(w, id));

    // Das jüngste Doppel suchen, dessen Zyklus die angezeigte Woche noch
    // sperrt: die erste Fahrt liegt höchstens drei Wochen zurück.
    // Abstände über die laufende Nummer messen – die zählt über das Jahresende
    // hinweg korrekt weiter, weil das Fenster aus shiftWeek stammt.
    const abstand = (w: Week) => vorwochen.length - vorwochen.indexOf(w);
    let doppel: { erste: Week; zweite: Week } | null = null;
    for (const zweite of [...gefahren].reverse()) {
      const erste = [...gefahren]
        .reverse()
        .find(
          (w) =>
            abstand(w) > abstand(zweite) &&
            abstand(w) - abstand(zweite) <= 2 &&
            abstand(w) <= 3,
        );
      if (erste !== undefined) {
        doppel = { erste, zweite };
        break;
      }
    }

    if (doppel) {
      conflicts.push({
        dayIndex: d.dayIndex,
        key: "tooSoon",
        params: {
          name: namen.get(id) ?? "",
          first: doppel.erste.kw,
          second: doppel.zweite.kw,
          next: shiftWeek(doppel.erste, 4).kw,
        },
      });
    }
  }

  return conflicts;
}

export type CounterRow = {
  playerId: string;
  name: string;
  driverCount: number;
  vipCount: number;
  lastDrivenKW: number | null;
  isR4Rotation: boolean;
};

/**
 * Zähler pro Spieler. Zukünftig geplante KWs zählen nicht mit – gezählt wird
 * nur, wer tatsächlich gefahren ist, bis einschliesslich der laufenden KW.
 */
export async function getCounters(upTo: Week = isoWeekOf()): Promise<CounterRow[]> {
  const [players, days] = await Promise.all([
    prisma.player.findMany({
      // Externe fahren nicht mehr mit – sie gehören nicht in die Zähler.
      where: { leftAt: null, isExternal: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, zug: { select: { isR4Rotation: true } } },
    }),
    prisma.zugDay.findMany({
      // Alles bis einschliesslich der laufenden Woche – frühere Jahre komplett.
      where: {
        kw: {
          OR: [{ year: { lt: upTo.year } }, { year: upTo.year, kw: { lte: upTo.kw } }],
        },
      },
      select: {
        actualDriverId: true,
        vipPlayerId: true,
        kw: { select: { year: true, kw: true } },
      },
    }),
  ]);

  const driver = new Map<string, number>();
  const vip = new Map<string, number>();
  const last = new Map<string, number>();

  for (const d of days) {
    if (d.actualDriverId) {
      driver.set(d.actualDriverId, (driver.get(d.actualDriverId) ?? 0) + 1);
      const cur = last.get(d.actualDriverId) ?? 0;
      if (weekOrder(d.kw) > cur) last.set(d.actualDriverId, weekOrder(d.kw));
    }
    if (d.vipPlayerId) vip.set(d.vipPlayerId, (vip.get(d.vipPlayerId) ?? 0) + 1);
  }

  return players.map((p) => ({
    playerId: p.id,
    name: p.name,
    driverCount: driver.get(p.id) ?? 0,
    vipCount: vip.get(p.id) ?? 0,
    lastDrivenKW: last.get(p.id) ?? null,
    isR4Rotation: p.zug?.isR4Rotation ?? false,
  }));
}

/** Geordnete R4-Warteschlange: wer oben steht, ist als Nächstes Zugführer. */
export async function getRotationQueue() {
  const queue = await prisma.r4RotationQueue.findMany({
    orderBy: { position: "asc" },
    include: { player: { select: { id: true, name: true } } },
  });

  const counters = await getCounters();
  const byId = new Map(counters.map((c) => [c.playerId, c]));

  return queue.map((q) => ({
    id: q.id,
    playerId: q.playerId,
    name: q.player.name,
    position: q.position,
    lastDrivenKW: byId.get(q.playerId)?.lastDrivenKW ?? null,
    driverCount: byId.get(q.playerId)?.driverCount ?? 0,
  }));
}
