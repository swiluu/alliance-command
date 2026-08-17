"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/access";
import { prisma } from "@/lib/db";

/**
 * Sprache umschalten.
 *
 * Das Cookie wird immer gesetzt – auch für Angemeldete. Sonst fiele die
 * Anmeldeseite nach dem Abmelden auf die Browsersprache zurück, obwohl die
 * Person ihre Wahl längst getroffen hat.
 *
 * Bewusst ohne `runAction`: hier gibt es nichts zu melden, was nicht schon
 * daran sichtbar wäre, dass die Seite die Sprache wechselt.
 */
export async function setLocale(wert: string) {
  if (!isLocale(wert)) return;

  cookies().set(LOCALE_COOKIE, wert, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const user = await getCurrentUser();
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { locale: wert } });
  }

  revalidatePath("/", "layout");
}
