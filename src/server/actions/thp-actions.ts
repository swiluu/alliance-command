"use server";

import { ActionError } from "@/server/action-error";
import { revalidatePath } from "next/cache";

import { assertAccess } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { runAction } from "@/server/action-result";
import {
  asciiKey,
  fetchLwrRows,
  formatThp,
  looseKey,
  parseThpPaste,
  searchLwr,
  type LwrRow,
} from "@/server/thp";

/**
 * THP und Namen pflegen. Beides sind Stammdaten des Spielers, deshalb hängt
 * die Berechtigung am Modul "allianz" und nicht an einem Event.
 */

function pickMatch(name: string, candidates: LwrRow[]): LwrRow | undefined {
  return (
    candidates.find((r) => r.name === name) ??
    candidates.find((r) => looseKey(r.name) === looseKey(name)) ??
    candidates.find((r) => asciiKey(r.name) === asciiKey(name)) ??
    (candidates.length === 1 && asciiKey(candidates[0].name).includes(asciiKey(name))
      ? candidates[0]
      : undefined)
  );
}

/**
 * Gleicht Namen, Allianz-Tag und THP mit lastwarrank.com ab. Die Namen im
 * Dashboard sollen exakt so lauten wie dort, sonst bleibt für einen Teil der
 * Spieler kein THP-Wert übrig.
 */
export async function syncFromLastwarrank() {
  return runAction(async () => {
    const user = await assertAccess("allianz", "EDIT");

    const rows = await fetchLwrRows();
    if (!rows) {
      throw new ActionError("noThpEndpoint");
    }

    const byId = new Map(rows.map((r) => [r.public_id, r]));
    const byName = new Map(rows.map((r) => [r.name, r]));
    const byLoose = new Map<string, LwrRow>();
    const byAscii = new Map<string, LwrRow>();
    for (const r of rows) {
      if (!byLoose.has(looseKey(r.name))) byLoose.set(looseKey(r.name), r);
      const a = asciiKey(r.name);
      if (a && !byAscii.has(a)) byAscii.set(a, r);
    }

    const players = await prisma.player.findMany({ where: { isExternal: false } });
    const names = new Set(players.map((p) => p.name));
    const now = new Date();

    let renamed = 0;
    let updated = 0;
    const unmatched: string[] = [];

    for (const player of players) {
      let hit =
        (player.lwrId !== null ? byId.get(player.lwrId) : undefined) ??
        byName.get(player.name) ??
        byLoose.get(looseKey(player.name)) ??
        byAscii.get(asciiKey(player.name));

      // Nicht in den Top 200? Dann gezielt nachschlagen.
      if (!hit) hit = pickMatch(player.name, await searchLwr(player.name));

      if (!hit) {
        unmatched.push(player.name);
        continue;
      }
      // Kein Rename auf einen Namen, den ein anderer Datensatz schon trägt.
      if (hit.name !== player.name && names.has(hit.name)) {
        unmatched.push(player.name);
        continue;
      }

      await prisma.player.update({
        where: { id: player.id },
        data: {
          name: hit.name,
          lwrId: hit.public_id,
          allianceTag: hit.alliance_abbr ? `[${hit.alliance_abbr}]` : player.allianceTag,
          thpRaw: hit.thp === null ? null : formatThp(hit.thp),
          thpValue: hit.thp,
          thpUpdated: hit.thp === null ? null : now,
        },
      });

      if (hit.name !== player.name) {
        names.delete(player.name);
        names.add(hit.name);
        renamed++;
      }
      updated++;
    }

    await logActivity(user, "lastwarrank abgeglichen", {
      module: "allianz",
      detail: `${updated} Spieler aktualisiert, ${renamed} umbenannt`,
    });
    revalidatePath("/uebersicht");
    revalidatePath("/allianz");
    for (const key of ["wuestensturm", "schluchtsturm"]) {
      revalidatePath(`/${key}`, "layout");
    }

    return { updated, renamed, unmatched };
  });
}

/** Fallback ohne Endpunkt: CSV bzw. Copy&Paste aus der Website. */
export async function importThpFromText(text: string) {
  return runAction(async () => {
    const user = await assertAccess("allianz", "EDIT");

    const { entries, skipped } = parseThpPaste(text);
    if (entries.length === 0) {
      throw new ActionError("noUsableRows");
    }

    const players = await prisma.player.findMany({ select: { id: true, name: true } });
    const byName = new Map(players.map((p) => [p.name, p.id]));
    const byAscii = new Map<string, string>();
    for (const p of players) {
      const a = asciiKey(p.name);
      if (a && !byAscii.has(a)) byAscii.set(a, p.id);
    }

    const unknown: string[] = [];
    let matched = 0;
    const now = new Date();

    for (const e of entries) {
      const id = byName.get(e.name) ?? byAscii.get(asciiKey(e.name));
      if (!id) {
        unknown.push(e.name);
        continue;
      }
      await prisma.player.update({
        where: { id },
        data: { thpRaw: e.raw, thpValue: e.value, thpUpdated: now },
      });
      matched++;
    }

    await logActivity(user, "THP importiert (Paste)", {
      module: "allianz",
      detail: `${matched} Spieler aktualisiert`,
    });
    revalidatePath("/uebersicht");
    revalidatePath("/allianz");

    return { updated: matched, renamed: 0, unmatched: [...unknown, ...skipped] };
  });
}
