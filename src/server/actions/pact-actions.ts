"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { ActionError } from "@/server/action-error";
import { runAction } from "@/server/action-result";

/**
 * Die Bündnisliste pflegt der R4-Rang – und Superadmins.
 *
 * Bewusst nicht an ein Modul gehängt: die Liste steht auf der Übersicht, die
 * jedes angemeldete Konto sieht. Ein eigenes Modul mit eigener Matrixspalte
 * wäre für zwei Schalter je Bündnis zu viel Verwaltung; wer R4 ist, darf
 * ohnehin schon die Führungsdaten sehen.
 */
async function assertR4() {
  const user = await requireUser();
  if (!user.isSuperadmin && !user.isR4) throw new ActionError("pactOnlyR4");
  return user;
}

/**
 * Servernummer prüfen. Pflicht: Allianzkürzel sind nicht serverübergreifend
 * eindeutig, und ein Bündnis ohne Server liesse sich nicht zuordnen.
 */
function servernummer(wert: string): number {
  const clean = wert.trim().replace(/^#/, "");
  if (!clean) throw new ActionError("pactServerRequired");
  const zahl = Number(clean);
  if (!Number.isInteger(zahl) || zahl <= 0) throw new ActionError("pactBadServer", { wert });
  return zahl;
}

/** Kürzel vereinheitlichen: ohne Klammern, ohne Rand-Leerzeichen. */
function kuerzel(wert: string) {
  const clean = wert.trim().replace(/^\[|\]$/g, "").trim();
  if (!clean) throw new ActionError("pactTagEmpty");
  if (clean.length > 16) throw new ActionError("pactTagTooLong", { max: 16 });
  return clean;
}

export async function addPact(tag: string, name: string, server: string) {
  return runAction(async () => {
    const user = await assertR4();
    const clean = kuerzel(tag);
    const serverId = servernummer(server);

    const schonDa = await prisma.pact.findUnique({ where: { tag: clean } });
    if (schonDa) throw new ActionError("pactExists", { tag: clean });

    await prisma.pact.create({
      data: { tag: clean, name: name.trim() || null, serverId },
    });

    await logActivity(user, "Bündnis angelegt", { detail: `${clean} (#${serverId})` });
    revalidatePath("/uebersicht");
    return { tag: clean };
  });
}

/**
 * Schaltet eine der beiden Erlaubnisse um.
 *
 * Getrennt und nicht als Stufe: beides, eines von beiden oder nichts sind
 * gleichwertige Zustände, in denen keiner den anderen einschliesst.
 */
export async function togglePactPermission(pactId: string, feld: "zugLoot" | "baseHits") {
  return runAction(async () => {
    const user = await assertR4();

    const pact = await prisma.pact.findUnique({ where: { id: pactId } });
    if (!pact) throw new ActionError("pactNotFound");

    const next = !pact[feld];
    await prisma.pact.update({ where: { id: pactId }, data: { [feld]: next } });

    await logActivity(user, next ? "Bündnis-Erlaubnis erteilt" : "Bündnis-Erlaubnis entzogen", {
      detail: `${pact.tag} · ${feld === "zugLoot" ? "Zug plündern" : "Base Hits"}`,
    });
    revalidatePath("/uebersicht");
  });
}

/** Kürzel, Name und Bemerkung ändern. */
export async function updatePact(
  pactId: string,
  tag: string,
  name: string,
  note: string,
  server: string,
) {
  return runAction(async () => {
    const user = await assertR4();

    const pact = await prisma.pact.findUnique({ where: { id: pactId } });
    if (!pact) throw new ActionError("pactNotFound");

    const clean = kuerzel(tag);
    const serverId = servernummer(server);
    if (clean !== pact.tag) {
      const belegt = await prisma.pact.findUnique({ where: { tag: clean } });
      if (belegt) throw new ActionError("pactExists", { tag: clean });
    }

    await prisma.pact.update({
      where: { id: pactId },
      data: { tag: clean, name: name.trim() || null, note: note.trim() || null, serverId },
    });

    await logActivity(user, "Bündnis geändert", { detail: clean });
    revalidatePath("/uebersicht");
  });
}

export async function deletePact(pactId: string) {
  return runAction(async () => {
    const user = await assertR4();

    const pact = await prisma.pact.findUnique({ where: { id: pactId } });
    if (!pact) throw new ActionError("pactNotFound");

    await prisma.pact.delete({ where: { id: pactId } });

    await logActivity(user, "Bündnis entfernt", { detail: pact.tag });
    revalidatePath("/uebersicht");
  });
}
