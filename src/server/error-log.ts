import "server-only";

import { prisma } from "@/lib/db";
import { UEBERFAELLIG_STUNDEN, laufSchluessel, schreibeStoerung } from "@/lib/stoerung";

/**
 * Unerwartete Fehler festhalten, damit ein Superadmin sie auf der Übersicht
 * sieht statt im Server-Protokoll, das niemand liest.
 *
 * Zwei Regeln:
 *
 *  1. **Nur Unerwartetes.** Fehlende Rechte, ungültige Eingaben und verletzte
 *     Fachregeln sind Antworten, keine Fehler – der Benutzer hat sie schon
 *     gelesen. Stünden sie hier, wäre die Liste nach einem Tag unlesbar und
 *     die echten Fehler darin nicht mehr zu finden.
 *
 *  2. **Das Festhalten darf nie selbst etwas kaputt machen.** Es läuft im
 *     Fehlerpfad; schlägt es fehl, bleibt es beim Protokolleintrag.
 */

export async function meldeFehler(opts: {
  /** Modul, Aktion oder Skript – wo es passiert ist. */
  source?: string;
  fehler: unknown;
  /** Wer es ausgelöst hat, falls bekannt. */
  userName?: string | null;
}): Promise<void> {
  await schreibeStoerung(prisma, opts);
}

/** Die offenen Fehler, neueste zuerst. */
export async function offeneFehler(limit = 20) {
  return prisma.errorLog.findMany({
    where: { seenAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function anzahlOffeneFehler() {
  return prisma.errorLog.count({ where: { seenAt: null } });
}

/**
 * Nächtliche Läufe, die sich melden sollen – Name und Anzeigetext.
 *
 * Ohne diese Prüfung wäre Schweigen die gefährlichste Meldung: ein Skript,
 * das gar nicht mehr startet, kann keinen Fehler schreiben. Genau das ist
 * hier schon vorgekommen, als ein Lauf tagelang ausfiel und es niemandem
 * auffiel.
 */
export const LAEUFE = [
  { job: "sicherung", label: "Sicherung", zeit: "03:20" },
  { job: "namen-abgleich", label: "Namensabgleich", zeit: "04:00" },
  { job: "thp-abgleich", label: "THP-Abgleich", zeit: "05:40" },
  { job: "auslagerung", label: "Sicherung nach GitHub", zeit: "03:40" },
] as const;

export type UeberfaelligerLauf = {
  job: string;
  label: string;
  zeit: string;
  /** Letzter erfolgreicher Lauf, falls je einer vermerkt wurde. */
  zuletzt: string | null;
};

/**
 * Läufe, deren letzter Erfolg zu lange her ist – oder die noch nie einen
 * vermerkt haben.
 */
export async function ueberfaelligeLaeufe(): Promise<UeberfaelligerLauf[]> {
  const eintraege = await prisma.appSetting.findMany({
    where: { key: { in: LAEUFE.map((l) => laufSchluessel(l.job)) } },
  });
  const nach = new Map(eintraege.map((e) => [e.key, e.value]));
  const grenze = Date.now() - UEBERFAELLIG_STUNDEN * 3600 * 1000;

  return LAEUFE.flatMap((l) => {
    const wert = nach.get(laufSchluessel(l.job));
    const zeitpunkt = wert ? Date.parse(wert) : NaN;
    // Noch nie gelaufen zählt erst, wenn der Vermerk überhaupt eingeführt
    // wurde – sonst meldete die Übersicht am Tag der Einführung drei
    // Störungen, die keine sind. Deshalb: nur melden, was einmal lief und
    // dann ausblieb.
    if (Number.isNaN(zeitpunkt)) return [];
    if (zeitpunkt >= grenze) return [];
    return [{ job: l.job, label: l.label, zeit: l.zeit, zuletzt: wert ?? null }];
  });
}
