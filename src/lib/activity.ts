import { prisma } from "./db";
import type { SessionUser } from "./access";

/**
 * Jede schreibende Aktion landet hier. `userName` wird denormalisiert
 * mitgeschrieben, damit der Feed auch nach dem Löschen eines Users lesbar bleibt.
 */
export async function logActivity(
  user: Pick<SessionUser, "id" | "displayName">,
  action: string,
  opts: { module?: string; detail?: string } = {},
) {
  await prisma.activityLog.create({
    data: {
      userId: user.id,
      userName: user.displayName,
      action,
      module: opts.module ?? null,
      detail: opts.detail ?? null,
    },
  });
}

export async function recentActivity(limit = 25) {
  return prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
