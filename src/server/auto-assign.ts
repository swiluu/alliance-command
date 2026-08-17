import "server-only";

import type { EventKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { mainGroups, substituteGroup, type PositionGroup } from "@/lib/event-layouts";
import { getLayout } from "@/server/event-service";

/**
 * Automatische Positionsverteilung, nachdem Team A und Team B stehen.
 *
 * Die Rangfolge der Positionen wird **aus der eigenen Historie gelernt**, nicht
 * fest verdrahtet: für jede vergangene Woche wird der Kader eines Teams nach
 * THP sortiert und jeder besetzten Position die relative Stärke des Spielers
 * zugeordnet (0 = stärkster im Team, 1 = schwächster). Der Median über alle
 * Wochen ergibt, wie stark eine Position üblicherweise besetzt wird.
 *
 * Für Wüstensturm kommt dabei heraus: Jäger zuerst, dann Ölraffinerien,
 * Techzentrum und Info, zuletzt die Lazarette. Ändert ihr eure Gewohnheit,
 * ändert sich die Reihenfolge von selbst mit – ohne dass jemand Code anfasst.
 */

export type PlannedSlot = {
  positionKey: string;
  positionLabel: string;
  slotIndex: number;
  playerId: string | null;
  playerName: string | null;
  thpRaw: string | null;
  /**
   * Diese Position verlangt einen Jäger-Marsch. Wer hier steht, stellt einen –
   * das ist eine Ansage an den Spieler, keine Bedingung für die Auswahl.
   */
  isHunter: boolean;
};

/** Ein Wechsel: wer kommt für wen. */
export type PlannedSwap = {
  inPlayerId: string;
  inName: string;
  outPlayerId: string;
  outName: string;
  outPositionLabel: string;
  /** Wie oft dieser Spieler bisher ausgewechselt wurde – Grundlage der Fairness. */
  outPastCount: number;
};

export type PlannedTeam = {
  team: "A" | "B";
  slots: PlannedSlot[];
  bench: { playerId: string; playerName: string; thpRaw: string | null }[];
  swaps: PlannedSwap[];
  /** Spieler, für die weder Position noch Ersatzbank Platz bot. */
  overflow: { playerId: string; playerName: string }[];
  memberCount: number;
};

/**
 * Warnung als Bausteinschlüssel statt als fertiger Satz.
 *
 * Der Vorschlag entsteht im Server, gelesen wird er im Browser – und zwar in
 * der Sprache dessen, der ihn anfordert. Ein fertig formulierter deutscher
 * Satz wäre hier eine Sackgasse.
 */
export type PlanWarning = {
  key:
    | "noHistory"
    | "noThp"
    | "tooFewMidTier"
    | "overflow"
    | "emptySlots"
    | "benchNoPartnerSlots"
    | "benchNoPartnerFilled";
  params?: Record<string, string | number>;
};

export type AutoAssignPlan = {
  week: number;
  teams: PlannedTeam[];
  /** Reihenfolge der Positionen von "stärkste Besetzung" nach unten. */
  order: { positionKey: string; label: string; medianRank: number | null; samples: number }[];
  warnings: PlanWarning[];
};

/**
 * Wechselregeln, die die Allianz vorgegeben hat und die deshalb Vorrang vor
 * den gelernten Quoten haben.
 *
 * Wüstensturm: die vier Lazarette gehen komplett raus, dazu genau einer aus
 * Techzentrum und einer aus dem Info-Zentrum. Jäger und Ölraffinerien bleiben
 * immer stehen. Das sind bei 30 Mann 8 + 1 + 1 = 10 – genau die Bankgrösse.
 *
 * `midTier` löst die zweite Vorgabe: auf der Bank müssen mindestens zwei
 * mittelstarke Leute sitzen, die sonst nach Öl oder Tech gehen würden. Sonst
 * bestünde die Bank nur aus den Schwächsten, und ein Wechsel ins Techzentrum
 * wäre eine Verschlechterung. Diese beiden sind dann auch die Partner für
 * Tech und Info.
 *
 * Für Schluchtsturm ist nichts vorgegeben – dort greifen die aus der Historie
 * gelernten Quoten.
 */
const SWAP_RULES: Partial<
  Record<
    EventKey,
    {
      /**
       * Feste Rangfolge der Positionen, stärkste zuerst. Ist sie gesetzt,
       * ersetzt sie das, was die Automatik aus der Historie lernen würde.
       */
      order?: string[];
      /**
       * Wer ausgewechselt wird, in dieser Reihenfolge abgearbeitet.
       * `take: "all"` nimmt alle besetzten Plätze der Gruppe, eine Zahl
       * nimmt entsprechend viele je Position.
       */
      swaps: { positions: string[]; take: "all" | number }[];
      /**
       * Mittelstarke, die schon vor dem Besetzen für die Bank zurückgelegt
       * werden, damit sie die Positionen mit `take: 1` auf Augenhöhe wechseln
       * können.
       */
      midTier?: { positions: string[]; count: number };
    }
  >
> = {
  // Die vier Lazarette gehen komplett raus, dazu je einer aus Techzentrum und
  // Info-Zentrum. Jäger und Ölraffinerien bleiben stehen. Bei 30 Mann sind das
  // 8 + 1 + 1 = 10 und damit genau die Bankgrösse.
  wuestensturm: {
    swaps: [
      { positions: ["lazarett_1", "lazarett_2", "lazarett_3", "lazarett_4"], take: "all" },
      { positions: ["techzentrum"], take: 1 },
      { positions: ["info_zentrum"], take: 1 },
    ],
    midTier: { positions: ["oelraffinerie_1", "oelraffinerie_2", "techzentrum"], count: 2 },
  },

  // Rangfolge von der Allianz vorgegeben. Sie weicht von der gelernten ab:
  // aus der Historie käme Probenlager 1 noch vor die Datenzentren, gewollt
  // ist aber Datenzentrum vor Probenlager.
  //
  // Ausgewechselt werden zuerst alle Probenlager, danach je einer aus den
  // beiden Datenzentren. Alles darüber bleibt stehen. Auch das sind 8 + 1 + 1.
  schluchtsturm: {
    order: [
      "hochsicherheitslabor",
      "energie_turm",
      "verteidigungssystem_1",
      "verteidigungssystem_2",
      "serum_fabrik_1",
      "serum_fabrik_2",
      "daten_zentrum_1",
      "daten_zentrum_2",
      "probenlager_1",
      "probenlager_2",
      "probenlager_3",
      "probenlager_4",
    ],
    swaps: [
      {
        positions: ["probenlager_1", "probenlager_2", "probenlager_3", "probenlager_4"],
        take: "all",
      },
      { positions: ["daten_zentrum_1"], take: 1 },
      { positions: ["daten_zentrum_2"], take: 1 },
    ],
  },
};

type Member = {
  playerId: string;
  name: string;
  thpValue: number | null;
  thpRaw: string | null;
  isFixplatz: boolean;
};

/**
 * Zufall mit fester Saat.
 *
 * "Zufällig" heisst hier nicht "bei jedem Klick anders": Vorschau und
 * Übernahme müssen dasselbe Ergebnis liefern, und ein zweimal geöffneter
 * Vorschlag darf nicht plötzlich andere Paare zeigen. Die Saat hängt an Event,
 * Woche und Team – über die Wochen hinweg mischt es also durch, innerhalb
 * einer Woche bleibt es stabil.
 */
function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], rnd: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Median einer Zahlenreihe; leere Reihe ergibt null. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Lernt aus vergangenen Wochen, wie stark jede Position besetzt wurde.
 *
 * Bewusst relativ zum jeweiligen Team-Kader statt absolut: der Kader wechselt,
 * THP-Werte wachsen, aber "die Position bekommt den Stärksten" bleibt richtig.
 */
export async function learnPositionOrder(eventKey: EventKey, exceptWeek?: number) {
  const rows = await prisma.weeklyAssignment.findMany({
    where: {
      eventKey,
      positionKey: { not: null },
      isSubstitute: false,
      team: { not: null },
      ...(exceptWeek === undefined ? {} : { week: { not: exceptWeek } }),
    },
    select: {
      week: true,
      team: true,
      positionKey: true,
      player: { select: { thpValue: true } },
    },
  });

  // Je Woche und Team: alle Zugeteilten nach THP sortieren und die relative
  // Stärke bestimmen.
  const buckets = new Map<string, { positionKey: string; thp: number }[]>();
  for (const r of rows) {
    if (!r.positionKey || r.player.thpValue === null) continue;
    const key = `${r.week}|${r.team}`;
    const list = buckets.get(key) ?? [];
    list.push({ positionKey: r.positionKey, thp: r.player.thpValue });
    buckets.set(key, list);
  }

  const proPosition = new Map<string, number[]>();
  for (const list of Array.from(buckets.values())) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => b.thp - a.thp);
    sorted.forEach((entry, i) => {
      const relative = i / (sorted.length - 1); // 0 = stärkster im Team
      const werte = proPosition.get(entry.positionKey) ?? [];
      werte.push(relative);
      proPosition.set(entry.positionKey, werte);
    });
  }

  return new Map(
    Array.from(proPosition.entries()).map(([key, werte]) => [
      key,
      { medianRank: median(werte) as number, samples: werte.length },
    ]),
  );
}

/**
 * Lernt, welcher Anteil einer Position üblicherweise ausgewechselt wird.
 *
 * Bei Wüstensturm kommt heraus: Lazarette 70–80 %, Techzentrum 40 %,
 * Info-Zentrum 35 %, Ölraffinerien und Jäger praktisch nie. Genau das ergibt
 * "alle vier Lazarette, dazu je einer aus Info und Tech" – ohne dass die Regel
 * irgendwo als Text hinterlegt wäre.
 */
export async function learnSubstitutionRates(eventKey: EventKey, exceptWeek?: number) {
  const [haupt, subs] = await Promise.all([
    prisma.weeklyAssignment.findMany({
      where: {
        eventKey,
        isSubstitute: false,
        positionKey: { not: null },
        team: { not: null },
        ...(exceptWeek === undefined ? {} : { week: { not: exceptWeek } }),
      },
      select: { playerId: true, week: true, positionKey: true },
    }),
    prisma.weeklyAssignment.findMany({
      where: {
        eventKey,
        isSubstitute: true,
        replacesPlayerId: { not: null },
        ...(exceptWeek === undefined ? {} : { week: { not: exceptWeek } }),
      },
      select: { replacesPlayerId: true, week: true },
    }),
  ]);

  const positionVon = new Map(haupt.map((a) => [`${a.week}|${a.playerId}`, a.positionKey as string]));
  const besetzt = new Map<string, number>();
  const ersetzt = new Map<string, number>();

  for (const a of haupt) {
    const k = a.positionKey as string;
    besetzt.set(k, (besetzt.get(k) ?? 0) + 1);
  }
  for (const s of subs) {
    const k = positionVon.get(`${s.week}|${s.replacesPlayerId}`);
    if (k) ersetzt.set(k, (ersetzt.get(k) ?? 0) + 1);
  }

  return new Map(
    Array.from(besetzt.entries()).map(([key, n]) => [
      key,
      { rate: (ersetzt.get(key) ?? 0) / n, samples: n },
    ]),
  );
}

/**
 * Verteilt `anzahl` Wechsel auf die Positionen, proportional zu ihrer
 * Auswechselquote (Verfahren des grössten Rests). Keine Position bekommt
 * mehr Wechsel, als sie besetzte Plätze hat.
 */
function verteileWechsel(
  gewichte: { key: string; gewicht: number; maximum: number }[],
  anzahl: number,
): Map<string, number> {
  const ergebnis = new Map<string, number>();
  const summe = gewichte.reduce((s, g) => s + g.gewicht, 0);
  if (summe <= 0 || anzahl <= 0) return ergebnis;

  const roh = gewichte.map((g) => ({ ...g, ideal: (g.gewicht / summe) * anzahl }));
  let vergeben = 0;
  for (const r of roh) {
    const n = Math.min(Math.floor(r.ideal), r.maximum);
    ergebnis.set(r.key, n);
    vergeben += n;
  }

  // Rest nach der Grösse des abgeschnittenen Anteils vergeben.
  const rest = [...roh].sort(
    (a, b) => (b.ideal % 1) - (a.ideal % 1) || b.gewicht - a.gewicht,
  );
  let runde = 0;
  while (vergeben < anzahl && runde < 100) {
    let vergabeInRunde = false;
    for (const r of rest) {
      if (vergeben >= anzahl) break;
      const jetzt = ergebnis.get(r.key) ?? 0;
      if (jetzt >= r.maximum) continue;
      ergebnis.set(r.key, jetzt + 1);
      vergeben++;
      vergabeInRunde = true;
    }
    if (!vergabeInRunde) break;
    runde++;
  }

  return ergebnis;
}

/**
 * Positionen in der Reihenfolge, in der sie besetzt werden sollen.
 * Ohne Historie bleibt die Layout-Reihenfolge – die ist dort bereits von
 * wichtig nach unwichtig sortiert.
 */
function orderGroups(
  groups: PositionGroup[],
  gelernt: Map<string, { medianRank: number; samples: number }>,
  vorgabe?: string[],
) {
  if (vorgabe) {
    // Feste Rangfolge der Allianz. Was dort nicht steht, hängt hinten dran,
    // damit eine neue Position nicht stillschweigend verschwindet.
    const rang = new Map(vorgabe.map((k, i) => [k, i]));
    return mainGroups(groups)
      .map((g, i) => ({ g, i, stat: gelernt.get(g.key) }))
      .sort(
        (a, b) =>
          (rang.get(a.g.key) ?? Number.MAX_SAFE_INTEGER) -
            (rang.get(b.g.key) ?? Number.MAX_SAFE_INTEGER) || a.i - b.i,
      );
  }

  return mainGroups(groups)
    .map((g, i) => ({ g, i, stat: gelernt.get(g.key) }))
    .sort((a, b) => {
      if (a.stat && b.stat) return a.stat.medianRank - b.stat.medianRank || a.i - b.i;
      // Positionen ohne Erfahrungswert hinten anstellen, aber untereinander
      // in Layout-Reihenfolge.
      if (a.stat) return -1;
      if (b.stat) return 1;
      return a.i - b.i;
    });
}

/**
 * Erstellt den Vorschlag, ohne etwas zu speichern.
 *
 * Grundlage sind die Spieler, die in der Team-Zuteilung bereits Team A oder
 * Team B bekommen haben. Wer dort auf "–" steht, setzt aus und bleibt aussen
 * vor – daran ändert die Automatik nichts.
 */
export async function planAutoAssignment(
  eventKey: EventKey,
  week: number,
): Promise<AutoAssignPlan> {
  const [layout, gelernt, quoten, zuteilungen, wechselHistorie] = await Promise.all([
    getLayout(eventKey),
    // Die laufende Woche darf sich nicht selbst als Vorbild nehmen.
    learnPositionOrder(eventKey, week),
    learnSubstitutionRates(eventKey, week),
    prisma.weeklyAssignment.findMany({
      where: { eventKey, week, team: { not: null } },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            thpValue: true,
            thpRaw: true,
            eventStates: { where: { eventKey }, select: { isFixplatz: true } },
          },
        },
      },
    }),
    // Wer wurde in der Vergangenheit schon wie oft ausgewechselt? Grundlage
    // dafür, dass bei Tech und Info nicht immer dieselben weichen.
    prisma.weeklyAssignment.findMany({
      where: {
        eventKey,
        isSubstitute: true,
        replacesPlayerId: { not: null },
        week: { not: week },
      },
      select: { replacesPlayerId: true, week: true },
    }),
  ]);

  const wechselZahl = new Map<string, { count: number; lastWeek: number }>();
  for (const w of wechselHistorie) {
    if (!w.replacesPlayerId) continue;
    const bisher = wechselZahl.get(w.replacesPlayerId) ?? { count: 0, lastWeek: 0 };
    wechselZahl.set(w.replacesPlayerId, {
      count: bisher.count + 1,
      lastWeek: Math.max(bisher.lastWeek, w.week),
    });
  }

  const warnings: PlanWarning[] = [];
  const reihenfolge = orderGroups(layout.groups, gelernt, SWAP_RULES[eventKey]?.order);
  const bank = substituteGroup(layout.groups);

  const order = reihenfolge.map(({ g, stat }) => ({
    positionKey: g.key,
    label: g.label,
    medianRank: stat?.medianRank ?? null,
    samples: stat?.samples ?? 0,
  }));

  if (order.every((o) => o.samples === 0)) {
    warnings.push({ key: "noHistory" });
  }

  const teams: PlannedTeam[] = [];

  for (const team of ["A", "B"] as const) {
    const mitglieder: Member[] = zuteilungen
      .filter((a) => a.team === team)
      .map((a) => ({
        playerId: a.player.id,
        name: a.player.name,
        thpValue: a.player.thpValue,
        thpRaw: a.player.thpRaw,
        isFixplatz: a.player.eventStates[0]?.isFixplatz ?? false,
      }))
      // Stärkster zuerst; wer keinen THP-Wert hat, landet hinten.
      .sort(
        (a, b) =>
          (b.thpValue ?? -1) - (a.thpValue ?? -1) || a.name.localeCompare(b.name, "de"),
      );

    const ohneThp = mitglieder.filter((m) => m.thpValue === null);
    if (ohneThp.length > 0) {
      warnings.push({
        key: "noThp",
        params: { team, names: ohneThp.map((m) => m.name).join(", ") },
      });
    }

    const verfuegbar = [...mitglieder];
    const regeln = SWAP_RULES[eventKey];

    // Zwei Mittelstarke von vornherein für die Bank zurücklegen. Sie sollen
    // später Tech und Info wechseln, und dafür müssen sie stark genug sein –
    // eine Bank aus lauter Schwächsten macht jeden Wechsel dorthin zur
    // Verschlechterung.
    //
    // Wichtig ist der Zeitpunkt: das Zurücklegen passiert VOR dem Besetzen.
    // Sonst müsste ihr Platz von unten nachbesetzt werden und im Techzentrum
    // stünde plötzlich der Schwächste des Kaders. So rücken stattdessen alle
    // darunter geschlossen eine Stufe auf.
    const reserve: Member[] = [];
    if (regeln?.midTier) {
      // Welche Plätze in der Reihenfolge gehören zu Öl und Tech?
      let ab = 0;
      let bis = 0;
      let gefunden = false;
      for (const { g } of reihenfolge) {
        const gehoert = regeln.midTier.positions.includes(g.key);
        if (gehoert && !gefunden) {
          ab = bis;
          gefunden = true;
        }
        bis += g.slots;
        if (gefunden && !gehoert) break;
      }

      const kandidaten = verfuegbar
        .slice(ab, bis)
        .map((m) => {
          const h = wechselZahl.get(m.playerId);
          return { m, count: h?.count ?? 0, lastWeek: h?.lastWeek ?? 0 };
        })
        // Die Schwächsten dieses Blocks zuerst, damit die stärkeren Öl-Plätze
        // besetzt bleiben; bei gleicher Stärke der, den es seltener traf.
        .reverse()
        .sort((a, b) => a.count - b.count || a.lastWeek - b.lastWeek);

      for (const k of kandidaten.slice(0, regeln.midTier.count)) {
        const i = verfuegbar.indexOf(k.m);
        if (i >= 0) reserve.push(verfuegbar.splice(i, 1)[0]);
      }

      if (reserve.length < regeln.midTier.count) {
        warnings.push({
          key: "tooFewMidTier",
          params: { team, have: reserve.length, want: regeln.midTier.count },
        });
      }
    }

    const slots: PlannedSlot[] = [];

    const nimm = (pruefung?: (m: Member) => boolean): Member | null => {
      const i = pruefung ? verfuegbar.findIndex(pruefung) : 0;
      if (i < 0 || verfuegbar.length === 0) return null;
      return verfuegbar.splice(i, 1)[0];
    };

    for (const { g } of reihenfolge) {
      // Die Jäger-Pflicht schränkt die Auswahl nicht ein: wer auf so einer
      // Position landet, stellt eben einen Jäger. Sie hängt an der Position,
      // nicht am Spieler.
      const brauchtJaeger = g.requiredHunterCount ?? 0;
      for (let slot = 0; slot < g.slots; slot++) {
        const gewaehlt = nimm();

        slots.push({
          positionKey: g.key,
          positionLabel: g.label,
          slotIndex: slot,
          playerId: gewaehlt?.playerId ?? null,
          playerName: gewaehlt?.name ?? null,
          thpRaw: gewaehlt?.thpRaw ?? null,
          isHunter: slot < brauchtJaeger,
        });
      }
    }

    const bankPlaetze = bank?.slots ?? 0;
    // Die Zurückgelegten sitzen vorn auf der Bank – sie sind die Partner für
    // Tech und Info.
    verfuegbar.unshift(...reserve);
    const bench = verfuegbar.slice(0, bankPlaetze).map((m) => ({
      playerId: m.playerId,
      playerName: m.name,
      thpRaw: m.thpRaw,
    }));
    const overflow = verfuegbar.slice(bankPlaetze).map((m) => ({
      playerId: m.playerId,
      playerName: m.name,
    }));

    if (overflow.length > 0) {
      warnings.push({
        key: "overflow",
        params: {
          team,
          count: overflow.length,
          names: overflow.map((o) => o.playerName).join(", "),
        },
      });
    }
    const fehlend = slots.filter((s) => !s.playerId).length;
    if (fehlend > 0) {
      warnings.push({ key: "emptySlots", params: { team, count: fehlend } });
    }
    // ── Wer wird für wen eingewechselt? ─────────────────────────
    //
    // Ausgewechselt wird von den schwächsten Positionen aufwärts – genau so,
    // wie es die Historie zeigt: bei Wüstensturm alle vier Lazarette, dazu je
    // einer aus Info und Techzentrum.
    //
    // Muss eine Position nur teilweise weichen (Info und Tech stellen zwei
    // Spieler, aber nur einer geht), entscheidet die Fairness: wer bisher am
    // seltensten ausgewechselt wurde, ist dran. Bei Gleichstand der, dessen
    // letzte Auswechslung länger her ist, danach der Zufall.
    const rnd = seededRandom(`${eventKey}|${week}|${team}`);

    // Kandidaten je Position. Innerhalb einer Position steht vorn, wer bisher
    // am seltensten weichen musste – so trifft es bei Info und Techzentrum
    // nicht Woche für Woche denselben.
    const kandidaten = new Map<string, { slot: PlannedSlot; count: number }[]>();
    for (const { g } of [...reihenfolge].reverse()) {
      const besetzte = slots.filter((s) => s.positionKey === g.key && s.playerId);
      if (besetzte.length === 0) continue;

      kandidaten.set(
        g.key,
        besetzte
          .map((slot) => {
            const h = wechselZahl.get(slot.playerId as string);
            return {
              slot,
              count: h?.count ?? 0,
              lastWeek: h?.lastWeek ?? 0,
              wurf: rnd(),
            };
          })
          .sort((a, b) => a.count - b.count || a.lastWeek - b.lastWeek || a.wurf - b.wurf)
          .map(({ slot, count }) => ({ slot, count })),
      );
    }

    // Wie viele Wechsel entfallen auf welche Position? Proportional zur
    // gelernten Auswechselquote. Ohne Erfahrungswerte greift ersatzweise die
    // Stärke-Reihenfolge – die schwächste Position zuerst.
    let verteilung: Map<string, number>;

    if (regeln) {
      // Vorgabe der Allianz: feste Zahlen, der Rest auf die genannten
      // Positionen. Nichts davon wird geraten.
      verteilung = new Map();
      let offen = bench.length;

      // Innerhalb einer Gruppe zählt die Rangfolge: reicht die Bank nicht für
      // alle, weicht zuerst die schwächste Position. Ein Ersatzspieler von der
      // Bank ersetzt so den, der ihm am nächsten steht.
      const rang = new Map(reihenfolge.map(({ g }, i) => [g.key, i]));

      // Die Gruppen der Reihe nach abarbeiten – wer zuerst steht, wird zuerst
      // ausgewechselt, wenn die Bank nicht für alle reicht.
      for (const gruppe of regeln.swaps) {
        const positionen = [...gruppe.positions].sort(
          (a, b) => (rang.get(b) ?? 0) - (rang.get(a) ?? 0),
        );
        for (const key of positionen) {
          if (offen <= 0) break;
          const vorhanden = kandidaten.get(key)?.length ?? 0;
          const gewuenscht = gruppe.take === "all" ? vorhanden : gruppe.take;
          const moeglich = Math.min(gewuenscht, vorhanden, offen);
          verteilung.set(key, moeglich);
          offen -= moeglich;
        }
      }
      if (offen > 0) {
        warnings.push({ key: "benchNoPartnerSlots", params: { team, count: offen } });
      }
    } else {
      const gewichte = Array.from(kandidaten.entries())
        .filter(([key]) => !(regeln as { never?: string[] } | undefined)?.never?.includes(key))
        .map(([key, liste], i) => {
          const q = quoten.get(key);
          return {
            key,
            // Ersatzgewicht fällt mit dem Rang, damit ohne Historie wenigstens
            // von unten nach oben gewechselt wird.
            gewicht: q ? q.rate * liste.length : 1 / (i + 1),
            maximum: liste.length,
          };
        });
      verteilung = verteileWechsel(gewichte, bench.length);
    }

    // Die Ausgewechselten trennen: was fest vorgegeben ist (Tech, Info) bekommt
    // gezielt die zurückgelegten Mittelstarken, alles andere wird gemischt.
    const festeRaus: { slot: PlannedSlot; count: number }[] = [];
    const uebrigeRaus: { slot: PlannedSlot; count: number }[] = [];

    for (const [key, liste] of Array.from(kandidaten.entries())) {
      const n = verteilung.get(key) ?? 0;
      // Positionen, von denen nur einzelne weichen, bekommen die zurück-
      // gelegten Mittelstarken – aber nur, wenn welche zurückgelegt wurden.
      const einzeln = regeln?.swaps.some(
        (gr) => gr.take !== "all" && gr.positions.includes(key),
      );
      const ziel = regeln?.midTier && einzeln ? festeRaus : uebrigeRaus;
      ziel.push(...liste.slice(0, n));
    }

    const reserveIds = new Set(reserve.map((r) => r.playerId));
    const bankMittel = bench.filter((b) => reserveIds.has(b.playerId));
    const bankRest = bench.filter((b) => !reserveIds.has(b.playerId));

    const swaps: PlannedSwap[] = [];

    // Tech und Info: der Mittelstarke von der Bank kommt für den Mittelstarken
    // auf dem Platz – ein Wechsel auf Augenhöhe.
    festeRaus.forEach((r, i) => {
      const rein = bankMittel[i] ?? bankRest.shift();
      if (!rein) return;
      swaps.push({
        inPlayerId: rein.playerId,
        inName: rein.playerName,
        outPlayerId: r.slot.playerId as string,
        outName: r.slot.playerName as string,
        outPositionLabel: r.slot.positionLabel,
        outPastCount: r.count,
      });
    });

    // Der Rest gemischt: sonst ginge immer der Schwächste für den Stärksten
    // von der Bank, Woche für Woche dasselbe Bild.
    const uebrigeBank = bankRest.filter((b) => !swaps.some((w) => w.inPlayerId === b.playerId));
    const gemischt = shuffle(uebrigeRaus, rnd);
    const gemischteBank = shuffle(uebrigeBank, rnd);

    gemischt.forEach((r, i) => {
      const rein = gemischteBank[i];
      if (!rein) return;
      swaps.push({
        inPlayerId: rein.playerId,
        inName: rein.playerName,
        outPlayerId: r.slot.playerId as string,
        outName: r.slot.playerName as string,
        outPositionLabel: r.slot.positionLabel,
        outPastCount: r.count,
      });
    });

    const raus = [...festeRaus, ...uebrigeRaus];

    if (bench.length > raus.length) {
      warnings.push({
        key: "benchNoPartnerFilled",
        params: { team, count: bench.length - raus.length },
      });
    }

    teams.push({ team, slots, bench, swaps, overflow, memberCount: mitglieder.length });
  }

  return { week, teams, order, warnings };
}
