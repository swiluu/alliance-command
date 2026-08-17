import "server-only";

import { prisma } from "@/lib/db";
import { ALLIANZ_TAG, SERVER_ID } from "@/lib/allianz";
import { getServerstellung } from "@/server/lwr-allianz";
import { listVsWeeks } from "@/server/vs-service";

/**
 * Drei Namen für die Woche.
 *
 * Alles, was im Dashboard steckt, dient bisher der Leitung: wer wird
 * eingeteilt, wer fehlt, wer ist gesperrt. Die neunzig Leute ohne
 * Führungsaufgabe kommen darin nur als Zeile vor.
 *
 * Das hier ist der Gegenentwurf und rechnet sich aus dem, was ohnehin erfasst
 * wird – niemand muss etwas pflegen:
 *
 *   - die meisten VS-Punkte der zuletzt erfassten Woche
 *   - der grösste Zuwachs bei Hero Power über vier Wochen
 *   - die meisten dazugewonnenen Abschüsse
 *
 * Bewusst keine Steigerung der VS-Punkte: die hängen davon ab, was jemand in
 * der Woche gerade macht, und schwanken entsprechend. Ein Sprung dort ist
 * kein Verdienst, sondern Zufall. Abschüsse wachsen nur durch Kämpfen.
 */

export type Auszeichnung = {
  art: "vs" | "wachstum" | "kaempfe";
  name: string;
  /** Die grosse Zahl. */
  wert: string;
  /**
   * Bausteine für den Erklärungssatz.
   *
   * Bewusst kein fertiger Satz: der müsste hier auf Deutsch entstehen und
   * stünde dann auch in der englischen Oberfläche. Übersetzt wird in der
   * Ansicht, hier kommen nur die Zahlen.
   */
  werte: { woche?: number; vorher?: string; nachher?: string; prozent?: number };
};

const SERVER = SERVER_ID;

/** "136889660" → "137 Mio". Gleiche Einheit überall, damit sich die drei
 *  Auszeichnungen vergleichen lassen. */
const mio = (n: number) => `${Math.round(n / 1e6)} Mio`;

export async function getWocheDerAllianz(): Promise<Auszeichnung[]> {
  const ergebnis: Auszeichnung[] = [];

  // ── Meiste VS-Punkte der zuletzt erfassten Woche ──────────────────────
  try {
    const [letzte] = await listVsWeeks();
    if (letzte) {
      const woche = await prisma.vsWeek.findFirst({
        where: { year: letzte.year, kw: letzte.kw },
        select: { id: true },
      });
      if (woche) {
        const beste = await prisma.vsScore.findFirst({
          where: { weekId: woche.id, playerId: { not: null } },
          orderBy: { points: "desc" },
          select: { points: true, player: { select: { name: true } } },
        });
        if (beste?.player) {
          ergebnis.push({
            art: "vs",
            name: beste.player.name,
            // Gruppiert mit Leerzeichen, wie in der Erfassung – jedes
            // landesübliche Trennzeichen sähe hier anders aus als dort.
            wert: mio(beste.points),
            werte: { woche: letzte.kw },
          });
        }
      }
    }
  } catch {
    /* Eine fehlende Auszeichnung ist kein Fehler wert. */
  }

  // ── Zuwachs bei Hero Power und Abschüssen ─────────────────────────────
  // Beides aus den Aufsteigern der Allianz bei lastwarrank: dort wird über
  // vier Wochen gerechnet, und wir müssten es sonst selbst mitschreiben.
  const kader = await prisma.player.findMany({
    where: { leftAt: null },
    select: { name: true },
  });
  const stellung = await getServerstellung(SERVER, ALLIANZ_TAG, kader.map((p) => p.name)).catch(
    () => null,
  );

  try {
    const thp = stellung?.aufsteiger.find((a) => /hero/i.test(a.title));
    const spitze = thp?.rows[0];
    if (spitze) {
      ergebnis.push({
        art: "wachstum",
        name: spitze.name,
        // Dieselbe Einheit und dasselbe Dezimalzeichen wie in den
        // Erklärungen darunter – gemischte Schreibweisen lesen sich wie
        // verschiedene Grössen.
        wert: `+${(spitze.delta / 1e6).toFixed(1)} Mio`,
        werte: {
          vorher: mio(spitze.start_value),
          nachher: mio(spitze.end_value),
          prozent: Math.round(spitze.delta_pct),
        },
      });
    }
  } catch {
    /* siehe oben */
  }

  // ── Meiste Abschüsse dazugewonnen ─────────────────────────────────────
  //
  // Aus denselben Aufsteigern wie die Hero Power, nur die andere Kennzahl.
  // Hero Power lässt sich erfarmen und kaufen, Abschüsse nicht – dafür muss
  // gekämpft werden.
  try {
    const kills = stellung?.aufsteiger.find((a) => /kill/i.test(a.title));
    // Niemand bekommt zwei Auszeichnungen: sonst stünde derselbe Name zweimal
    // da und zwei andere gar nicht. Der Nächstplatzierte rückt nach.
    const schon = new Set(ergebnis.map((e) => e.name.toLowerCase()));
    const spitze = kills?.rows.find((r) => !schon.has(r.name.toLowerCase()));
    if (spitze) {
      ergebnis.push({
        art: "kaempfe",
        name: spitze.name,
        wert: `+${(spitze.delta / 1e6).toFixed(1)} Mio`,
        werte: {
          vorher: mio(spitze.start_value),
          nachher: mio(spitze.end_value),
          prozent: Math.round(spitze.delta_pct),
        },
      });
    }
  } catch {
    /* siehe oben */
  }

  return ergebnis;
}
