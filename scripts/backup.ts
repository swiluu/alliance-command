/**
 * Sicherung der Datenbank.
 *
 *   npm run backup                    → sicherung-<zeit>-nacht.db
 *   npx tsx scripts/backup.ts anlass  → sicherung-<zeit>-anlass.db
 *
 * Läuft per Cron. Bewusst eigenständig statt über src/server/backup-service.ts:
 * das Modul ist `server-only` und lässt sich ausserhalb von Next nicht laden.
 * Format, Ordner und Aufbewahrung sind identisch gehalten, damit die Dateien
 * in der Backup-Übersicht der Anwendung auftauchen.
 */
import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { merkeLauf, schreibeStoerung } from "@/lib/stoerung";

const prisma = new PrismaClient();

const BACKUP_DIR = path.join(process.cwd(), "backups");
/** Wie viele Sicherungen aufbewahrt werden – muss zu KEEP_BACKUPS passen. */
const KEEP = 40;
const MUSTER = /^sicherung-\d{8}-\d{6}(-[a-z0-9-]+)?\.db$/;

function zeitstempel(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

async function main() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });

  // Der Anlass steht im Dateinamen, damit in der Übersicht erkennbar bleibt,
  // warum eine Sicherung entstanden ist. Erlaubt sind nur Zeichen, die das
  // Muster oben durchlässt – sonst taucht die Datei dort nicht mehr auf.
  const anlass = (process.argv[2] ?? "nacht").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const name = `sicherung-${zeitstempel()}-${anlass || "nacht"}.db`;
  const ziel = path.join(BACKUP_DIR, name);

  // VACUUM INTO statt Dateikopie: nur so ist die Kopie garantiert in sich
  // stimmig, auch wenn währenddessen geschrieben wird.
  await fs.rm(ziel, { force: true });
  await prisma.$executeRawUnsafe(`VACUUM INTO '${ziel.replace(/'/g, "''")}'`);

  const { size } = await fs.stat(ziel);

  // Aufräumen: alles über KEEP hinaus, älteste zuerst.
  const dateien = await fs.readdir(BACKUP_DIR);
  const mitZeit = await Promise.all(
    dateien
      .filter((f) => MUSTER.test(f))
      .map(async (f) => ({
        f,
        t: (await fs.stat(path.join(BACKUP_DIR, f))).mtime.getTime(),
      })),
  );
  mitZeit.sort((a, b) => b.t - a.t);

  let geloescht = 0;
  for (const alt of mitZeit.slice(KEEP)) {
    await fs.rm(path.join(BACKUP_DIR, alt.f), { force: true });
    geloescht++;
  }

  await merkeLauf(prisma, "sicherung");

  console.log(
    `✓ ${name} (${(size / 1024 / 1024).toFixed(1)} MB) · ` +
      `${Math.min(mitZeit.length, KEEP)} Sicherungen vorhanden` +
      (geloescht ? `, ${geloescht} alte entfernt` : ""),
  );
}

main()
  .catch(async (e) => {
    console.error("✗ Sicherung fehlgeschlagen:", e instanceof Error ? e.message : e);
    // Eine ausgefallene Sicherung merkt man sonst erst, wenn man sie braucht.
    await schreibeStoerung(prisma, { source: "Sicherung", fehler: e });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
