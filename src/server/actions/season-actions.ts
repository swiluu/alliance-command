"use server";

import { revalidatePath } from "next/cache";

import { requireAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { AKTIVE_SEASON, istSeasonKey, istSeite } from "@/lib/season-map";

/**
 * Zuteilungen auf der Season-Karte.
 *
 * Die Karte selbst ist unveränderlich – veränderlich ist nur, wer welches
 * Gebiet nimmt. Deshalb schreibt hier alles auf dieselbe Tabelle, und ein
 * Gebiet ohne Eintrag gilt als unverplant.
 */

export async function setzeAktiveSeason(key: string) {
  await requireAccess("season", "EDIT");
  if (!istSeasonKey(key)) return;
  await prisma.appSetting.upsert({
    where: { key: AKTIVE_SEASON },
    create: { key: AKTIVE_SEASON, value: key },
    update: { value: key },
  });
  revalidatePath("/season");
}

export async function setzeZuteilung(eingabe: {
  seasonKey: string;
  territoryId: string;
  seite: string;
  tag?: string | null;
  playerId?: string | null;
  schritt?: number | null;
  notiz?: string | null;
}) {
  const { user } = await requireAccess("season", "EDIT");
  if (!istSeasonKey(eingabe.seasonKey)) return;
  const seite = istSeite(eingabe.seite) ? eingabe.seite : "OWN";

  const werte = {
    seite,
    tag: eingabe.tag?.trim() || null,
    playerId: eingabe.playerId || null,
    schritt: eingabe.schritt ?? null,
    notiz: eingabe.notiz?.trim() || null,
    updatedBy: user.displayName,
  };

  await prisma.seasonClaim.upsert({
    where: {
      seasonKey_territoryId: {
        seasonKey: eingabe.seasonKey,
        territoryId: eingabe.territoryId,
      },
    },
    create: { seasonKey: eingabe.seasonKey, territoryId: eingabe.territoryId, ...werte },
    update: werte,
  });
  revalidatePath("/season");
}

export async function loescheZuteilung(seasonKey: string, territoryId: string) {
  await requireAccess("season", "EDIT");
  await prisma.seasonClaim.deleteMany({ where: { seasonKey, territoryId } });
  revalidatePath("/season");
}

/** Alles einer Season auf einmal räumen – vor dem Start der nächsten. */
export async function raeumeSeason(seasonKey: string) {
  await requireAccess("season", "EDIT");
  await prisma.seasonClaim.deleteMany({ where: { seasonKey } });
  revalidatePath("/season");
}

/**
 * Kurzform des Planungsstands – wie bei der Wochenplanung. Ändert sie sich,
 * holt die Karte ihre Daten nach, und beide Planer sehen dasselbe Brett.
 */
export async function seasonStand(seasonKey: string): Promise<string> {
  await requireAccess("season", "READ");
  const zeilen = await prisma.seasonClaim.findMany({
    where: { seasonKey },
    orderBy: { territoryId: "asc" },
    select: { territoryId: true, seite: true, tag: true, playerId: true, schritt: true, notiz: true },
  });
  return zeilen
    .map((z) => `${z.territoryId}:${z.seite}:${z.tag ?? ""}:${z.playerId ?? ""}:${z.schritt ?? ""}:${z.notiz ?? ""}`)
    .join("|");
}
