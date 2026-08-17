import type { PrismaClient } from "@prisma/client";

/**
 * Störungen festhalten – aus der Anwendung wie aus den nächtlichen Skripten.
 *
 * Bewusst ohne `server-only` und ohne den Client der Anwendung: die Skripte
 * laufen ausserhalb von Next und bringen ihren eigenen mit. Sonst müsste die
 * Schreiblogik zweimal existieren und liefe irgendwann auseinander.
 *
 * Was hier hineingehört, ist eng gefasst: Dinge, die zu Problemen führen.
 * Fehlende Rechte und ungültige Eingaben sind keine Störung – das sind
 * Antworten, und der Benutzer hat sie schon gelesen.
 */

const MAX_MELDUNG = 300;
const MAX_DETAIL = 4000;

/** Schlüssel, unter dem ein Skript seinen letzten erfolgreichen Lauf merkt. */
export const laufSchluessel = (job: string) => `job.${job}.zuletzt`;

/**
 * Wie lange ein täglicher Lauf ausbleiben darf, bevor er als überfällig gilt.
 * Zwei Tage: ein einzelner Ausfall kann eine Kleinigkeit sein, zwei
 * hintereinander sind es nie.
 */
export const UEBERFAELLIG_STUNDEN = 48;

export async function schreibeStoerung(
  prisma: Pick<PrismaClient, "errorLog">,
  opts: { source?: string; fehler: unknown; userName?: string | null },
): Promise<void> {
  const { source, fehler, userName } = opts;

  const message =
    fehler instanceof Error
      ? fehler.message || fehler.name
      : typeof fehler === "string"
        ? fehler
        : JSON.stringify(fehler);

  const detail = fehler instanceof Error ? (fehler.stack ?? null) : null;

  try {
    await prisma.errorLog.create({
      data: {
        source: source ?? null,
        message: (message || "Unbekannter Fehler").slice(0, MAX_MELDUNG),
        detail: detail?.slice(0, MAX_DETAIL) ?? null,
        userName: userName ?? null,
      },
    });
  } catch (e) {
    // Läuft bereits im Fehlerpfad. Mehr als das Protokoll geht hier nicht.
    console.error("[stoerung] konnte nicht geschrieben werden:", e);
  }
}

/**
 * Einen erfolgreichen Lauf vermerken.
 *
 * Erst dadurch lässt sich Schweigen erkennen: ein Skript, das gar nicht mehr
 * startet, kann sich selbst nicht melden. Fehlt der Vermerk zu lange, fällt
 * das auf der Übersicht auf.
 */
export async function merkeLauf(
  prisma: Pick<PrismaClient, "appSetting">,
  job: string,
): Promise<void> {
  const key = laufSchluessel(job);
  const value = new Date().toISOString();
  try {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  } catch (e) {
    console.error("[stoerung] Laufvermerk fehlgeschlagen:", e);
  }
}
