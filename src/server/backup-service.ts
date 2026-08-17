import "server-only";

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";

/**
 * Sicherungen der SQLite-Datei.
 *
 * Gesichert wird mit `VACUUM INTO` statt mit einem Dateikopie – nur so ist die
 * Kopie garantiert konsistent, auch wenn währenddessen geschrieben wird. Eine
 * Sicherung ist eine vollwertige Datenbank: zum Zurückspielen genügt es, sie
 * über `prisma/dev.db` zu legen.
 */

export const BACKUP_DIR = path.join(process.cwd(), "backups");

/** Wie viele Sicherungen aufbewahrt werden – ältere fallen automatisch weg. */
export const KEEP_BACKUPS = 40;

// Der Zusatz ist frei, damit auch die nächtliche Sicherung ("-nacht")
// erkannt und mit aufgeräumt wird. Vorher passte nur "-event-kwNN" – alles
// andere wäre unsichtbar geblieben und hätte sich unbegrenzt angesammelt.
const FILE_PATTERN = /^sicherung-\d{8}-\d{6}(-[a-z0-9-]+)?\.db$/;

export type BackupFile = {
  name: string;
  size: number;
  createdAt: Date;
  /** Woraus die Sicherung entstanden ist, aus dem Dateinamen gelesen. */
  reason: string;
};

function timestamp(d = new Date()) {
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/** Absoluter Pfad der laufenden SQLite-Datei aus DATABASE_URL. */
function databaseFile(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const raw = url.replace(/^file:/, "");
  // Relative Angaben in DATABASE_URL beziehen sich auf das prisma-Verzeichnis.
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), "prisma", raw);
}

/** Verhindert, dass über den Dateinamen aus dem Backup-Ordner ausgebrochen wird. */
export function resolveBackup(name: string): string | null {
  if (!FILE_PATTERN.test(name)) return null;
  const full = path.join(BACKUP_DIR, name);
  if (path.dirname(full) !== BACKUP_DIR) return null;
  return full;
}

export async function listBackups(): Promise<BackupFile[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(BACKUP_DIR);
  } catch {
    return [];
  }

  const files: BackupFile[] = [];
  for (const name of entries) {
    if (!FILE_PATTERN.test(name)) continue;
    try {
      const stat = await fs.stat(path.join(BACKUP_DIR, name));
      const abschluss = /-([a-z]+)-kw(\d+)\.db$/.exec(name);
      files.push({
        name,
        size: stat.size,
        createdAt: stat.mtime,
        reason: abschluss
          ? `Stand vor Abschluss ${abschluss[1]} KW ${abschluss[2]}`
          : /-nacht\.db$/.test(name)
            ? "Nächtlich"
            : "Manuell",
      });
    } catch {
      // Datei ist verschwunden, während wir gelesen haben – überspringen.
    }
  }

  files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return files;
}

/**
 * Legt eine Sicherung an. `context` landet im Dateinamen, damit später
 * erkennbar ist, wozu sie gehört (z.B. "wuestensturm-kw32").
 *
 * Wirft nicht: ein fehlgeschlagenes Backup darf den Wochenabschluss nicht
 * blockieren. Der Aufrufer bekommt `null` und kann das melden.
 */
export async function createBackup(context?: string): Promise<string | null> {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    const suffix = context ? `-${context}` : "";
    const name = `sicherung-${timestamp()}${suffix}.db`;
    const target = path.join(BACKUP_DIR, name);

    // Ziel muss frei sein – VACUUM INTO überschreibt nicht.
    await fs.rm(target, { force: true });
    await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

    await pruneBackups();
    return name;
  } catch (e) {
    console.error("[backup] konnte nicht angelegt werden:", e);
    return null;
  }
}

/** Hält den Ordner klein: älteste Sicherungen über KEEP_BACKUPS hinaus löschen. */
async function pruneBackups() {
  const files = await listBackups();
  for (const f of files.slice(KEEP_BACKUPS)) {
    await fs.rm(path.join(BACKUP_DIR, f.name), { force: true });
  }
}

export async function deleteBackup(name: string): Promise<boolean> {
  const full = resolveBackup(name);
  if (!full) return false;
  await fs.rm(full, { force: true });
  return true;
}

export function openBackup(name: string) {
  const full = resolveBackup(name);
  if (!full) return null;
  return createReadStream(full);
}

export async function backupStats() {
  const files = await listBackups();
  return {
    count: files.length,
    totalSize: files.reduce((s, f) => s + f.size, 0),
    newest: files[0]?.createdAt ?? null,
    dbSize: await fs
      .stat(databaseFile())
      .then((s) => s.size)
      .catch(() => 0),
  };
}

// ── Hineinschauen, ohne zurückzuspielen ─────────────────────

export type BackupContents = {
  seasons: { eventKey: string; currentWeek: number }[];
  players: number;
  users: number;
  events: {
    eventKey: string;
    registered: number;
    banned: number;
    historyWeeks: number[];
    weeks: {
      week: number;
      teamA: number;
      teamB: number;
      lineup: { team: string; positionKey: string | null; slot: number | null; player: string; replaces: string | null }[];
    }[];
  }[];
};

/**
 * Liest eine Sicherung mit einer eigenen, nur lesenden Verbindung aus. Die
 * laufende Datenbank wird dabei nicht angefasst – deshalb braucht es zum
 * Nachschauen kein Zurückspielen.
 */
export async function readBackup(name: string): Promise<BackupContents | null> {
  const file = resolveBackup(name);
  if (!file) return null;

  // Direkt eingebunden statt über den geteilten Client, damit die Verbindung
  // wirklich nur auf diese Datei zeigt und danach wieder zu ist.
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });

  try {
    const [seasons, players, users] = await Promise.all([
      db.season.findMany({ orderBy: { eventKey: "asc" } }),
      db.player.count(),
      db.user.count(),
    ]);

    const events = [];
    for (const season of seasons) {
      const eventKey = season.eventKey;
      const [registered, banned, weeksRaw, assignments] = await Promise.all([
        db.registrationStatus.count({ where: { eventKey, status: "TEIL" } }),
        db.playerEventState.count({ where: { eventKey, isBanned: true } }),
        db.rotationHistory.groupBy({ by: ["week"], where: { eventKey }, orderBy: { week: "asc" } }),
        db.weeklyAssignment.findMany({
          where: { eventKey },
          include: { player: { select: { name: true } }, replaces: { select: { name: true } } },
          orderBy: [{ week: "desc" }, { team: "asc" }, { positionKey: "asc" }, { slotIndex: "asc" }],
        }),
      ]);

      const byWeek = new Map<number, typeof assignments>();
      for (const a of assignments) {
        const list = byWeek.get(a.week) ?? [];
        list.push(a);
        byWeek.set(a.week, list);
      }

      events.push({
        eventKey,
        registered,
        banned,
        historyWeeks: weeksRaw.map((w) => w.week),
        weeks: Array.from(byWeek.entries())
          .sort((a, b) => b[0] - a[0])
          .map(([week, rows]) => ({
            week,
            teamA: rows.filter((r) => r.team === "A").length,
            teamB: rows.filter((r) => r.team === "B").length,
            lineup: rows.map((r) => ({
              team: r.team ?? "–",
              positionKey: r.positionKey,
              slot: r.slotIndex,
              player: r.player.name,
              replaces: r.replaces?.name ?? null,
            })),
          })),
      });
    }

    return { seasons, players, users, events };
  } catch (e) {
    console.error("[backup] konnte nicht gelesen werden:", e);
    return null;
  } finally {
    await db.$disconnect();
  }
}
