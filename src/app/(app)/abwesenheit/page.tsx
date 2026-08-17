import { getTranslations } from "next-intl/server";

import { getAccessLevel, hasAtLeast, requireUser } from "@/lib/access";
import { heute, kuenftig, laeuft, vorbei } from "@/lib/absence";
import { KADER, prisma } from "@/lib/db";
import { ALLIANZ_TAG } from "@/lib/allianz";

import { AbsenceView } from "./absence-view";

export async function generateMetadata() {
  const t = await getTranslations("absence");
  return { title: `${t("heading")} · ${ALLIANZ_TAG} Command` };
}

export default async function AbwesenheitPage() {
  const user = await requireUser();
  const allianzLevel = await getAccessLevel(user, "allianz");
  const t = await getTranslations("absence");

  const [eintraege, kader] = await Promise.all([
    prisma.absence.findMany({
      orderBy: { from: "desc" },
      include: { player: { select: { id: true, name: true } } },
    }),
    prisma.player.findMany({
      where: KADER,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const stichtag = heute();
  const rows = eintraege.map((a) => ({
    id: a.id,
    playerId: a.player.id,
    name: a.player.name,
    from: a.from.toISOString(),
    until: a.until ? a.until.toISOString() : null,
    note: a.note,
    createdBy: a.createdBy,
  }));

  const zeitraum = (a: (typeof eintraege)[number]) => ({ from: a.from, until: a.until });

  return (
    <div className="max-w-[900px] mx-auto">
      <header className="mb-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{t("kicker")}</p>
        <h1 className="text-3xl text-sand">{t("heading")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>
      </header>

      <AbsenceView
        rows={rows}
        kader={kader}
        heuteIso={stichtag.toISOString()}
        canEditAll={hasAtLeast(allianzLevel, "EDIT") || user.isR4}
        eigenerPlayerId={user.playerId}
        anzahl={{
          laufend: eintraege.filter((a) => laeuft(zeitraum(a), stichtag)).length,
          kuenftig: eintraege.filter((a) => kuenftig(zeitraum(a), stichtag)).length,
          vorbei: eintraege.filter((a) => vorbei(zeitraum(a), stichtag)).length,
        }}
      />
    </div>
  );
}
