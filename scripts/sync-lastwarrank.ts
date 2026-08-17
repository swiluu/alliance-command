/**
 * Gleicht Spielernamen, Allianz-Tag und THP mit lastwarrank.com ab.
 *
 *   npm run sync:lwr -- --dry-run     # nur anzeigen, nichts schreiben
 *   npm run sync:lwr                  # übernehmen
 *
 * Die Namen im Dashboard sollen exakt so lauten wie auf lastwarrank.com,
 * damit für jeden Spieler ein THP-Wert angezeigt werden kann.
 *
 * Abgleich in dieser Reihenfolge:
 *   1. `lwrId` (public_id) – sobald einmal gesetzt, ist der Treffer eindeutig
 *      und übersteht auch spätere Namensänderungen im Spiel
 *   2. exakter Name
 *   3. Gross-/Kleinschreibung und Leerzeichen
 *   4. Zierzeichen und Akzente ("TaïTaï" ↔ "TaiTai", "Flame ツ" ↔ "Flame")
 *   5. ALIASES – von Hand gepflegt für Fälle, die keine Heuristik trifft
 */
import { PrismaClient } from "@prisma/client";
import { ALLIANZ_TAG } from "@/lib/allianz";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SERVER_ID = process.env.THP_SERVER_ID ?? "1580";
const API =
  process.env.THP_API_URL ?? "http://localhost:3777/api/rankings/players";

/**
 * Namen, die sich algorithmisch nicht zuordnen lassen – links wie der Spieler
 * bisher im Dashboard hiess, rechts wie er auf lastwarrank.com steht.
 * Nach dem ersten Lauf ist die Zuordnung über `lwrId` festgeschrieben; ein
 * Eintrag hier wird dann nicht mehr gebraucht.
 */
const ALIASES: Record<string, string> = {
  "Ender x": "Enderメ",
  Mane994: "Mane 武",
  Vinz: "Vιɳz 爻",
  "0 Willhelm Klink": "O Wilhelm Klink",
  "NoMercy Bloodfey": "NoMɛrcyღBloodfɛy",
  NERO: "NER0o",
  Susi: "Susl 爻",
  "Mira ヅ": "ᴹⁱʳᵃツ",
  MEYMoshpitHEM: "MΞYMoshpitHΞM",
};

type LwrRow = {
  public_id: number;
  name: string;
  alliance_abbr: string | null;
  thp: number | null;
};

const looseKey = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const asciiKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** 208400868 → "208.40M" */
function formatThp(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return String(value);
}

/** Holt alle Seiten – die API deckelt bei 100 Zeilen pro Aufruf. */
async function fetchAll(): Promise<LwrRow[]> {
  const rows: LwrRow[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const url = `${API}?server_id=${SERVER_ID}&sort_by=thp&sort_dir=desc&limit=100&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`lastwarrank antwortet mit ${res.status} (${url})`);

    const page = (await res.json()) as { rows?: LwrRow[] };
    const batch = page.rows ?? [];
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows;
}

/**
 * Die Rangliste endet bei den Top 200 des Servers – wer darunter liegt, taucht
 * dort nicht auf. Für diese Spieler fragen wir gezielt per Namenssuche nach.
 */
async function searchByName(name: string): Promise<LwrRow[]> {
  const url = `${API}?server_id=${SERVER_ID}&search=${encodeURIComponent(name)}&limit=10`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const page = (await res.json()) as { rows?: LwrRow[] };
  return page.rows ?? [];
}

/** Findet in einer Trefferliste die Zeile, die zum Namen passt. */
function pickMatch(name: string, candidates: LwrRow[]): LwrRow | undefined {
  return (
    candidates.find((r) => r.name === name) ??
    candidates.find((r) => looseKey(r.name) === looseKey(name)) ??
    candidates.find((r) => asciiKey(r.name) === asciiKey(name)) ??
    // Genau ein Treffer, der den gesuchten Namen enthält – z.B. "bighan" in
    // "Bighan1" oder "Corpse" in "Corpse ツ".
    (candidates.length === 1 &&
    asciiKey(candidates[0].name).includes(asciiKey(name))
      ? candidates[0]
      : undefined)
  );
}

async function main() {
  console.log(`Quelle: ${API} · Server ${SERVER_ID}${DRY_RUN ? " · DRY RUN" : ""}\n`);

  const rows = await fetchAll();
  console.log(
    `${rows.length} Spieler geladen, davon ${rows.filter((r) => r.alliance_abbr === ALLIANZ_TAG).length} in ${ALLIANZ_TAG}.\n`,
  );

  const byId = new Map<number, LwrRow>();
  const byName = new Map<string, LwrRow>();
  const byLoose = new Map<string, LwrRow>();
  const byAscii = new Map<string, LwrRow>();
  for (const r of rows) {
    byId.set(r.public_id, r);
    byName.set(r.name, r);
    if (!byLoose.has(looseKey(r.name))) byLoose.set(looseKey(r.name), r);
    const a = asciiKey(r.name);
    if (a && !byAscii.has(a)) byAscii.set(a, r);
  }

  const players = await prisma.player.findMany({ orderBy: { name: "asc" } });

  const renamed: string[] = [];
  const thpOnly: string[] = [];
  const unmatched: string[] = [];
  const conflicts: string[] = [];
  const now = new Date();

  for (const player of players) {
    const alias = ALIASES[player.name];
    let hit =
      (player.lwrId !== null ? byId.get(player.lwrId) : undefined) ??
      byName.get(player.name) ??
      byLoose.get(looseKey(player.name)) ??
      byAscii.get(asciiKey(player.name)) ??
      (alias ? byName.get(alias) : undefined);

    // Nicht in den Top 200? Dann gezielt nachschlagen.
    if (!hit) hit = pickMatch(alias ?? player.name, await searchByName(alias ?? player.name));

    if (!hit) {
      unmatched.push(player.name);
      continue;
    }

    // Ein anderer Datensatz darf den Zielnamen nicht schon belegen.
    if (hit.name !== player.name) {
      const clash = players.find((p) => p.name === hit.name && p.id !== player.id);
      if (clash) {
        conflicts.push(`${player.name} → ${hit.name} (Name bereits vergeben)`);
        continue;
      }
    }

    const data = {
      name: hit.name,
      lwrId: hit.public_id,
      allianceTag: hit.alliance_abbr ? `[${hit.alliance_abbr}]` : player.allianceTag,
      thpRaw: hit.thp === null ? null : formatThp(hit.thp),
      thpValue: hit.thp,
      thpUpdated: hit.thp === null ? null : now,
    };

    if (!DRY_RUN) {
      await prisma.player.update({ where: { id: player.id }, data });
      // Umbenennungen auch am verknüpften Konto nachziehen – sonst zeigte die
      // Zugriffsverwaltung dauerhaft den Namen von vor dem Wechsel.
      if (hit.name !== player.name) {
        await prisma.user.updateMany({
          where: { playerId: player.id },
          data: { displayName: hit.name },
        });
      }
    }

    if (hit.name !== player.name) {
      renamed.push(`${player.name}  →  ${hit.name}   ${data.thpRaw ?? "–"}`);
    } else {
      thpOnly.push(`${player.name}   ${data.thpRaw ?? "–"}`);
    }
  }

  console.log(`── Umbenannt (${renamed.length}) ─────────────────────────`);
  renamed.forEach((r) => console.log("  " + r));

  console.log(`\n── Nur THP aktualisiert: ${thpOnly.length} Spieler`);

  if (conflicts.length) {
    console.log(`\n⚠ Namenskonflikte (${conflicts.length}) – übersprungen:`);
    conflicts.forEach((c) => console.log("  " + c));
  }

  if (unmatched.length) {
    console.log(
      `\n⚠ Ohne Treffer (${unmatched.length}) – Name und THP unverändert:`,
    );
    console.log("  " + unmatched.join(", "));
    console.log(
      "  Diese Spieler stehen nicht in der Rangliste von lastwarrank.com.\n" +
        "  Passenden Namen in ALIASES (oben in dieser Datei) eintragen und erneut laufen lassen.",
    );
  }

  if (DRY_RUN) console.log("\nDRY RUN – es wurde nichts geschrieben.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
