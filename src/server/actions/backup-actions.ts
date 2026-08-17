"use server";

import { ActionError } from "@/server/action-error";
import { revalidatePath } from "next/cache";

import { assertAccess } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { runAction } from "@/server/action-result";
import {
  createBackup,
  deleteBackup as removeBackup,
  listBackups,
} from "@/server/backup-service";

export async function createBackupNow() {
  return runAction(async () => {
    const user = await assertAccess("backup", "EDIT");

    const name = await createBackup();
    if (!name) throw new ActionError("backupFailed");

    await logActivity(user, "Sicherung angelegt", { module: "backup", detail: name });
    revalidatePath("/backup");
    return { name, total: (await listBackups()).length };
  });
}

export async function deleteBackup(name: string) {
  return runAction(async () => {
    const user = await assertAccess("backup", "EDIT");

    const ok = await removeBackup(name);
    if (!ok) throw new ActionError("unknownBackup");

    await logActivity(user, "Sicherung gelöscht", { module: "backup", detail: name });
    revalidatePath("/backup");
  });
}
