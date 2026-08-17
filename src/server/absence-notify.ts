import "server-only";

import { zeitraumText } from "@/lib/absence";
import { ALLIANZ_TAG } from "@/lib/allianz";

import { DISCORD_FARBE, sendeDiscord } from "./discord";

/** Name der Umgebungsvariable mit dem Webhook für Abwesenheiten. */
const WEBHOOK = "DISCORD_ABSENCE_WEBHOOK";

/**
 * Meldet eine Abwesenheit nach Discord.
 *
 * Der Text unterscheidet zwei Fälle, weil sie unterschiedlich viel wert sind:
 * hat sich jemand **selbst** abgemeldet, ist das eine verlässliche Auskunft.
 * Hat ein R4 ihn eingetragen, weil er es im Spiel gesagt hat, steht das
 * ausdrücklich dabei – dann weiss der Kanal, woher die Angabe stammt.
 *
 * Deutsch, weil die Meldung im Allianz-Discord landet und dort dieselbe
 * Sprache gilt wie in den Ankündigungen im Spiel.
 */
export async function meldeAbwesenheit(opts: {
  spieler: string;
  von: Date;
  bis: Date | null;
  notiz: string | null;
  /** Anzeigename dessen, der den Eintrag gemacht hat. */
  durch: string;
  /** Hat sich die Person selbst abgemeldet? */
  selbst: boolean;
}) {
  const { spieler, von, bis, notiz, durch, selbst } = opts;

  await sendeDiscord(WEBHOOK, {
    title: `🌴 ${spieler} ist abwesend`,
    description: selbst
      ? `**${spieler}** hat sich selbst abgemeldet.`
      : `**${spieler}** wurde von **${durch}** abgemeldet.`,
    color: DISCORD_FARBE.sand,
    fields: [
      {
        name: "Zeitraum",
        value: zeitraumText({ from: von, until: bis }, "de"),
        inline: true,
      },
      {
        name: "Rückkehr",
        value: bis ? datumKurz(bis) : "offen",
        inline: true,
      },
      ...(notiz ? [{ name: "Notiz", value: notiz.slice(0, 1000) }] : []),
    ],
    footer: `${ALLIANZ_TAG} Command · Abwesenheit`,
  });
}

/** Meldung, wenn jemand früher zurück ist als angekündigt. */
export async function meldeRueckkehr(opts: { spieler: string; durch: string }) {
  await sendeDiscord(WEBHOOK, {
    title: `✅ ${opts.spieler} ist zurück`,
    description: `Die Abwesenheit von **${opts.spieler}** wurde beendet – eingetragen von **${opts.durch}**.`,
    color: DISCORD_FARBE.ok,
    footer: `${ALLIANZ_TAG} Command · Abwesenheit`,
  });
}

function datumKurz(d: Date) {
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
