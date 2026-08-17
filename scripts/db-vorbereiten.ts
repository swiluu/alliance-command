/**
 * Bereitet eine bestehende Datenbank auf `prisma db push` vor.
 *
 *   npx tsx scripts/db-vorbereiten.ts          # nur berichten
 *   npx tsx scripts/db-vorbereiten.ts --tun    # tatsächlich ändern
 *
 * Hintergrund: SQLite kann eine Pflichtspalte ohne Vorgabewert nicht zu einer
 * gefüllten Tabelle hinzufügen. Prisma erkennt das, verweigert den Abgleich
 * und bietet als einzigen Ausweg `--force-reset` an – was die ganze Datenbank
 * leert. Auf der Live-Seite wäre das der Verlust des gesamten Bestands.
 *
 * Deshalb werden solche Spalten hier vorab mit einem sinnvollen Wert
 * nachgetragen. Danach sieht Prisma nur noch eine vorhandene Spalte und der
 * Abgleich läuft glatt durch.
 *
 * Das Skript ist mehrfach ausführbar: was schon da ist, bleibt unberührt.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TUN = process.argv.includes("--tun");

/**
 * Pflichtspalten, die zu einer bereits gefüllten Tabelle dazukommen.
 *
 * `wert` ist das, was die vorhandenen Zeilen bekommen. Bei `ZugKW.year` ist
 * das 2026: die 53 Wochen der Live-Seite stammen alle aus dieser Saison, und
 * im Testsystem tragen dieselben Wochen denselben Jahrgang.
 */
const NACHZUTRAGEN: {
  tabelle: string;
  spalte: string;
  typ: string;
  wert: string;
  warum: string;
}[] = [
  {
    tabelle: "ZugKW",
    spalte: "year",
    typ: "INTEGER",
    wert: "2026",
    warum: "Kalenderwochen brauchen das Jahr, sonst überlagern sie sich am Jahreswechsel.",
  },
];

async function spalten(tabelle: string): Promise<string[]> {
  const zeilen = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `PRAGMA table_info(${tabelle})`,
  );
  return zeilen.map((z) => z.name);
}

async function tabelleExistiert(name: string): Promise<boolean> {
  const treffer = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    name,
  );
  return treffer.length > 0;
}

async function main() {
  console.log(TUN ? "Modus: ändern\n" : "Modus: nur berichten (mit --tun ausführen)\n");
  let offen = 0;

  for (const eintrag of NACHZUTRAGEN) {
    const { tabelle, spalte, typ, wert, warum } = eintrag;

    if (!(await tabelleExistiert(tabelle))) {
      console.log(`  ${tabelle}.${spalte}: Tabelle gibt es noch nicht – Prisma legt sie neu an.`);
      continue;
    }

    const vorhanden = await spalten(tabelle);
    if (vorhanden.includes(spalte)) {
      console.log(`  ${tabelle}.${spalte}: bereits vorhanden, nichts zu tun.`);
      continue;
    }

    const [{ anzahl }] = await prisma.$queryRawUnsafe<{ anzahl: number }[]>(
      `SELECT COUNT(*) AS anzahl FROM ${tabelle}`,
    );
    const zeilen = Number(anzahl);

    if (zeilen === 0) {
      console.log(`  ${tabelle}.${spalte}: Tabelle ist leer – Prisma kommt allein zurecht.`);
      continue;
    }

    offen += 1;
    console.log(`  ${tabelle}.${spalte}: fehlt, ${zeilen} Zeilen betroffen → Vorgabe ${wert}`);
    console.log(`      ${warum}`);

    if (TUN) {
      // Mit DEFAULT lässt SQLite die Pflichtspalte zu; die vorhandenen Zeilen
      // bekommen den Wert sofort. Prisma räumt den Vorgabewert beim nächsten
      // Abgleich selbst wieder weg – dann ist die Tabelle gefüllt und der
      // Umbau gefahrlos.
      await prisma.$executeRawUnsafe(
        `ALTER TABLE ${tabelle} ADD COLUMN ${spalte} ${typ} NOT NULL DEFAULT ${wert}`,
      );
      console.log(`      ergänzt.`);
    }
  }

  if (offen === 0) {
    console.log("\nNichts vorzubereiten – `prisma db push` kann laufen.");
  } else if (TUN) {
    console.log(`\n${offen} Spalte(n) nachgetragen. Jetzt "prisma db push" ausführen.`);
  } else {
    console.log(
      `\n${offen} Spalte(n) müssen nachgetragen werden.\n` +
        "Ohne das verweigert `prisma db push` den Abgleich und schlägt --force-reset vor,\n" +
        "was den gesamten Bestand löschen würde. Mit --tun ausführen.",
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
