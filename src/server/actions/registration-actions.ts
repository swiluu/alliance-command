"use server";

import { ActionError } from "@/server/action-error";
import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { assertSuperadmin } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { JOIN_CODE_KEY, MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { KADER, prisma } from "@/lib/db";
import { runAction } from "@/server/action-result";

/**
 * Beitrittscode: das einzige Geheimnis, das Mitgliedschaft belegt. Er steht in
 * der Allianz-Ankündigung im Spiel – dort kommt nur hin, wer in der Allianz ist.
 *
 * Bewusst gut lesbar gehalten: er wird abgetippt, oft vom Handy. Deshalb keine
 * Zeichen, die sich verwechseln lassen (0/O, 1/l/I).
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function neuerCode(laenge = 8) {
  const bytes = randomBytes(laenge);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function rotateJoinCode() {
  return runAction(async () => {
    const user = await assertSuperadmin();
    const code = neuerCode();

    await prisma.appSetting.upsert({
      where: { key: JOIN_CODE_KEY },
      create: { key: JOIN_CODE_KEY, value: code },
      update: { value: code },
    });

    await logActivity(user, "Beitrittscode gewechselt", { module: "allianz" });
    revalidatePath("/zugriff");
    return code;
  });
}

/** Schaltet die Selbstregistrierung ganz ab, indem der Code entfernt wird. */
export async function clearJoinCode() {
  return runAction(async () => {
    const user = await assertSuperadmin();
    await prisma.appSetting.deleteMany({ where: { key: JOIN_CODE_KEY } });
    await logActivity(user, "Selbstregistrierung abgeschaltet", { module: "allianz" });
    revalidatePath("/zugriff");
  });
}

/**
 * Konto anlegen. Läuft ohne Anmeldung – deshalb ist hier jede Prüfung Pflicht.
 *
 * Belegt wird die Zugehörigkeit durch den Code aus der Allianz-Ankündigung.
 * Zusätzlich lässt sich jeder Kadereintrag nur ein einziges Mal beanspruchen,
 * und das neue Konto darf ausschliesslich lesen.
 */
export async function registerMember(
  code: string,
  playerId: string,
  username: string,
  password: string,
) {
  return runAction(async () => {
    const eintrag = await prisma.appSetting.findUnique({ where: { key: JOIN_CODE_KEY } });
    if (!eintrag?.value) {
      throw new ActionError("registrationOff");
    }
    // Gross-/Kleinschreibung und Leerzeichen verzeihen – der Code wird
    // abgetippt, nicht kopiert.
    if (code.trim().toUpperCase().replace(/\s+/g, "") !== eintrag.value) {
      throw new ActionError("wrongJoinCode");
    }

    const name = username.trim();
    if (name.length < 3) throw new ActionError("usernameTooShort", { min: 3 });
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ActionError("passwordTooShort", { min: MIN_PASSWORD_LENGTH });
    }

    const player = await prisma.player.findFirst({
      where: { id: playerId, ...KADER },
      select: { id: true, name: true },
    });
    if (!player) throw new ActionError("notInRoster");

    const [belegt, nameWeg] = await Promise.all([
      prisma.user.findUnique({ where: { playerId } }),
      prisma.user.findUnique({ where: { username: name } }),
    ]);
    if (belegt) throw new ActionError("accountExistsFor", { name: player.name });
    if (nameWeg) throw new ActionError("usernameTaken");

    await prisma.user.create({
      data: {
        username: name,
        displayName: player.name,
        passwordHash: await bcrypt.hash(password, 12),
        isMember: true,
        playerId: player.id,
        // Das Passwort hat sich die Person selbst gesetzt – niemand sonst
        // kennt es, also gibt es nichts zu wechseln.
        mustChangePassword: false,
      },
    });

    await prisma.activityLog.create({
      data: {
        userName: player.name,
        module: "allianz",
        action: "Konto selbst angelegt",
        detail: `Benutzername ${name}`,
      },
    });

    revalidatePath("/zugriff");
  });
}
