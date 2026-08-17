import "server-only";

import { meldeFehler } from "./error-log";

/**
 * Benachrichtigungen an Discord.
 *
 * Zwei Regeln, die hier alles bestimmen:
 *
 *  1. **Der Webhook ist ein Geheimnis.** Wer ihn kennt, kann in den Kanal
 *     schreiben. Er steht deshalb ausschliesslich in der `.env` und nie im
 *     Repository. Fehlt er, wird schlicht nichts verschickt – so läuft das
 *     Testsystem ohne Zutun stumm, statt in den echten Kanal zu posten.
 *
 *  2. **Eine Meldung darf nie eine Aktion scheitern lassen.** Wer sich
 *     abmeldet, hat sich abgemeldet – auch wenn Discord gerade klemmt. Alle
 *     Fehler landen deshalb im Server-Log und nicht beim Benutzer.
 */

/** Farben der Einbettung, als Dezimalzahl wie Discord sie erwartet. */
export const DISCORD_FARBE = {
  /** Sand – dieselbe Farbe wie die Überschriften im Dashboard. */
  sand: 0xc9a24b,
  ok: 0x6f9e5a,
  danger: 0xc25b5b,
} as const;

export type DiscordFeld = { name: string; value: string; inline?: boolean };

export type DiscordEinbettung = {
  title: string;
  description?: string;
  color?: number;
  fields?: DiscordFeld[];
  footer?: string;
  timestamp?: Date;
};

/**
 * Schickt eine Einbettung an den Webhook.
 *
 * Bewusst ohne Warten auf den Aufrufer: die Antwort interessiert niemanden,
 * und die Aktion soll nicht auf Discord warten. Ein Zeitlimit gibt es
 * trotzdem, sonst hinge die Anfrage im schlechtesten Fall minutenlang.
 */
export async function sendeDiscord(
  webhookEnv: string,
  einbettung: DiscordEinbettung,
): Promise<void> {
  const url = process.env[webhookEnv];
  if (!url) return; // Nicht eingerichtet – dann eben still.

  const body = {
    // Kein `content`: die Einbettung trägt alles. Eine zusätzliche Textzeile
    // würde in der Übersicht doppelt erscheinen.
    embeds: [
      {
        title: einbettung.title,
        description: einbettung.description,
        color: einbettung.color ?? DISCORD_FARBE.sand,
        fields: einbettung.fields,
        footer: einbettung.footer ? { text: einbettung.footer } : undefined,
        timestamp: (einbettung.timestamp ?? new Date()).toISOString(),
      },
    ],
    // Niemanden anpingen, auch wenn im Text einmal ein @ steht.
    allowed_mentions: { parse: [] as string[] },
  };

  try {
    const antwort = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!antwort.ok) {
      const text = (await antwort.text()).slice(0, 300);
      console.error("[discord]", antwort.status, text);
      await meldeFehler({
        source: "Discord",
        fehler: new Error(`Webhook antwortete mit ${antwort.status}: ${text}`),
      });
    }
  } catch (e) {
    console.error("[discord]", e instanceof Error ? e.message : e);
    await meldeFehler({ source: "Discord", fehler: e });
  }
}
