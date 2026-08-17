"use server";

import { ActionError } from "@/server/action-error";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";

import { assertSuperadmin } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import {
  ACCESS_LEVELS,
  MIN_PASSWORD_LENGTH,
  isModuleKey,
  type AccessLevel,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { runAction } from "@/server/action-result";

export async function setModuleAccess(
  userId: string,
  module: string,
  level: string,
) {
  return runAction(async () => {
    const admin = await assertSuperadmin();
    if (!isModuleKey(module)) throw new ActionError("unknownModule", { module });
    if (!(ACCESS_LEVELS as readonly string[]).includes(level)) {
      throw new ActionError("unknownLevel", { level });
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new ActionError("userNotFound");

    await prisma.moduleAccess.upsert({
      where: { userId_module: { userId, module } },
      create: { userId, module, level },
      update: { level },
    });

    // Das Modul steht schon im Feld daneben und wird beim Anzeigen übersetzt –
    // im Detail würde es nur doppelt und in fester Sprache erscheinen.
    await logActivity(admin, "Zugriff geändert", {
      module,
      detail: `${target.displayName} → ${level}`,
    });
    revalidatePath("/zugriff");
  });
}

export async function createUser(
  username: string,
  password: string,
  displayName: string,
  isSuperadmin: boolean,
) {
  return runAction(async () => {
    const admin = await assertSuperadmin();

    const user = username.trim();
    const name = displayName.trim() || user;
    if (!user) throw new ActionError("usernameEmpty");
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ActionError("passwordTooShort", { min: MIN_PASSWORD_LENGTH });
    }

    const exists = await prisma.user.findUnique({ where: { username: user } });
    if (exists) throw new ActionError("userExists", { name: user });

    await prisma.user.create({
      data: {
        username: user,
        displayName: name,
        passwordHash: await hash(password, 12),
        isSuperadmin,
      },
    });

    await logActivity(admin, "Benutzer angelegt", { detail: `${name} (${user})` });
    revalidatePath("/zugriff");
  });
}

export async function deleteUser(userId: string) {
  return runAction(async () => {
    const admin = await assertSuperadmin();
    if (userId === admin.id) throw new ActionError("cannotDeleteSelf");

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new ActionError("userNotFound");

    if (target.isSuperadmin) {
      const count = await prisma.user.count({ where: { isSuperadmin: true } });
      if (count <= 1) throw new ActionError("lastSuperadmin");
    }

    await prisma.user.delete({ where: { id: userId } });
    await logActivity(admin, "Benutzer gelöscht", {
      detail: `${target.displayName} (${target.username})`,
    });
    revalidatePath("/zugriff");
  });
}

export async function resetPassword(userId: string, password: string) {
  return runAction(async () => {
    const admin = await assertSuperadmin();
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ActionError("passwordTooShort", { min: MIN_PASSWORD_LENGTH });
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new ActionError("userNotFound");

    await prisma.user.update({
      where: { id: userId },
      // Auch nach einem Zurücksetzen gilt wieder: der Besitzer setzt selbst neu.
      data: { passwordHash: await hash(password, 12), mustChangePassword: true },
    });
    // Bestehende Sessions beenden, damit ein zurückgesetztes Passwort wirkt.
    await prisma.session.deleteMany({ where: { userId } });

    await logActivity(admin, "Passwort zurückgesetzt", { detail: target.displayName });
    revalidatePath("/zugriff");
  });
}

/**
 * R4-Rang eines Mitglieds setzen oder zurücknehmen.
 *
 * Der Rang ändert nichts an den Schreibrechten – er öffnet nur den Blick auf
 * die Führungsdaten: Fixplätze und das Aktivitätsprotokoll auf der Übersicht.
 */
export async function toggleR4Rank(userId: string) {
  return runAction(async () => {
    const admin = await assertSuperadmin();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, isR4: true },
    });
    if (!user) throw new ActionError("accountNotFound");
    const next = !user.isR4;
    await prisma.user.update({ where: { id: userId }, data: { isR4: next } });

    await logActivity(admin, next ? "R4-Rang vergeben" : "R4-Rang entzogen", {
      module: "allianz",
      detail: user.displayName,
    });
    revalidatePath("/zugriff");
    revalidatePath("/uebersicht");
  });
}
