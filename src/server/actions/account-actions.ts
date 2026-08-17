"use server";

import { ActionError } from "@/server/action-error";
import { compare, hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { getCurrentUser } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { SESSION_COOKIE } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { runAction } from "@/server/action-result";

/**
 * Eigenes Passwort ändern. Bewusst nur für das eigene Konto – ein Superadmin
 * kann Passwörter zurücksetzen, aber nie eines für jemanden festlegen, das
 * derjenige dann behält: nach jedem Zurücksetzen greift wieder die Pflicht,
 * es selbst neu zu setzen.
 */
export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  return runAction(async () => {
    const session = await getCurrentUser();
    if (!session) throw new ActionError("notSignedIn");

    const user = await prisma.user.findUnique({ where: { id: session.id } });
    if (!user) throw new ActionError("accountNotFound");

    const ok = await compare(currentPassword, user.passwordHash);
    if (!ok) throw new ActionError("wrongCurrentPassword");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new ActionError("newPasswordTooShort", { min: MIN_PASSWORD_LENGTH });
    }
    if (newPassword === currentPassword) {
      throw new ActionError("passwordUnchanged");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hash(newPassword, 12),
        mustChangePassword: false,
      },
    });

    // Andere Sitzungen desselben Kontos beenden – die laufende bleibt, damit
    // man nicht mitten im Wechsel rausfliegt.
    const current = cookies().get(SESSION_COOKIE)?.value;
    await prisma.session.deleteMany({
      where: { userId: user.id, ...(current ? { NOT: { sessionToken: current } } : {}) },
    });

    await logActivity(
      { id: user.id, displayName: user.displayName },
      "Passwort geändert",
    );
    revalidatePath("/", "layout");
  });
}
