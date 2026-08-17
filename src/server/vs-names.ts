import "server-only";

import { prisma } from "@/lib/db";
import { vsNameKey } from "@/lib/vs";

/**
 * Nachschlagewerk, das einen Fremdnamen auf einen Kadereintrag zurückführt.
 *
 * Zwei Wege, in dieser Reihenfolge:
 *  1. die normalisierte Schreibweise des Kadernamens – deckt Zierzeichen,
 *     gesperrte Schreibweise und Akzente ab und braucht keine Pflege;
 *  2. die Aliastabelle – für alles, was sich damit nicht fassen lässt, etwa
 *     "Mane994" gegen "Mane 武".
 *
 * Ausgetretene Spieler bleiben drin. Ihre Punkte aus vergangenen Wochen
 * gehören zur Historie; sie später nicht mehr zuordnen zu können, wäre ein
 * Verlust ohne Gegenwert.
 */
export type NameResolver = {
  resolve: (rawName: string) => string | null;
  /** Namen, für die es mehr als einen Kandidaten gäbe. */
  ambiguous: Set<string>;
};

export async function loadNameResolver(): Promise<NameResolver> {
  const [players, aliases] = await Promise.all([
    prisma.player.findMany({ select: { id: true, name: true } }),
    prisma.playerAlias.findMany({ select: { key: true, playerId: true } }),
  ]);

  const byKey = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const p of players) {
    const key = vsNameKey(p.name);
    if (!key) continue;
    if (byKey.has(key) && byKey.get(key) !== p.id) {
      // Zwei Kadereinträge fallen auf denselben Schlüssel. Hier zu raten wäre
      // falsch – die Zeile bleibt offen und wird im Bericht gemeldet.
      ambiguous.add(key);
      continue;
    }
    byKey.set(key, p.id);
  }

  // Ein gesetzter Alias schlägt die Namensgleichheit: er wurde von Hand
  // eingetragen und weiss deshalb mehr als die Normalisierung.
  const byAlias = new Map(aliases.map((a) => [a.key, a.playerId]));

  return {
    resolve(rawName: string) {
      const key = vsNameKey(rawName);
      if (!key) return null;
      const alias = byAlias.get(key);
      if (alias) return alias;
      if (ambiguous.has(key)) return null;
      return byKey.get(key) ?? null;
    },
    ambiguous,
  };
}
