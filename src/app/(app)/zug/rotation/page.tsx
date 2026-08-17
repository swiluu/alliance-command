import { requireAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { isoWeekOf } from "@/lib/iso-week";
import { getRotationQueue } from "@/server/zug-service";

import { RotationList } from "./rotation-list";

export default async function RotationPage() {
  const { level } = await requireAccess("zug", "READ");

  const [queue, players] = await Promise.all([
    getRotationQueue(),
    prisma.player.findMany({
      where: { leftAt: null, isExternal: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, zug: { select: { isR4Rotation: true } } },
    }),
  ]);

  return (
    <RotationList
      queue={queue}
      candidates={players
        .filter((p) => !p.zug?.isR4Rotation)
        .map((p) => ({ id: p.id, name: p.name }))}
      currentKW={isoWeekOf().kw}
      canEdit={level === "EDIT"}
    />
  );
}
