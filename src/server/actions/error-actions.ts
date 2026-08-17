"use server";

import { revalidatePath } from "next/cache";

import { assertSuperadmin } from "@/lib/access";
import { prisma } from "@/lib/db";
import { ActionError } from "@/server/action-error";
import { runAction } from "@/server/action-result";

/**
 * Fehler abhaken.
 *
 * Gelöscht wird nichts: der Eintrag verschwindet nur aus der Meldung. Wer
 * später wissen will, ob etwas schon einmal vorkam, findet es noch – und ein
 * abgehakter Fehler, der wiederkehrt, taucht als neuer Eintrag wieder auf.
 *
 * Nur Superadmins, weil auch nur sie die Meldung sehen.
 */
export async function fehlerAbhaken(id: string) {
  return runAction(async () => {
    const user = await assertSuperadmin();

    const eintrag = await prisma.errorLog.findUnique({ where: { id } });
    if (!eintrag) throw new ActionError("entryNotFound");

    await prisma.errorLog.update({
      where: { id },
      data: { seenAt: new Date(), seenBy: user.displayName },
    });

    revalidatePath("/uebersicht");
  });
}

export async function alleFehlerAbhaken() {
  return runAction(async () => {
    const user = await assertSuperadmin();

    const { count } = await prisma.errorLog.updateMany({
      where: { seenAt: null },
      data: { seenAt: new Date(), seenBy: user.displayName },
    });

    revalidatePath("/uebersicht");
    return { count };
  });
}
