import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import { formatThp } from "@/server/thp";

import { RankingTable } from "./ranking-table";

export async function generateMetadata() {
  const t = await getTranslations("ranking");
  return { title: t("title") };
}

/** Schlüssel der Stand-Zeitstempel – gesetzt von scripts/refresh-thp-ranking.ts. */
const KEYS = {
  fetchedAt: "thp.rangliste.abgerufen",
  capturedAt: "thp.rangliste.stand",
};

export default async function RanglistePage() {
  // Bewusst ohne Modul-Zugriff: hier lässt sich nichts ändern, also darf jeder
  // Angemeldete die Liste sehen.
  await requireUser();
  const t = await getTranslations("ranking");

  const [entries, settings] = await Promise.all([
    prisma.thpRankingEntry.findMany({ orderBy: { rank: "asc" } }),
    prisma.appSetting.findMany({ where: { key: { in: Object.values(KEYS) } } }),
  ]);

  // Der Name im Ranglisteneintrag ist ein Schnappschuss aus dem nächtlichen
  // Lauf. Benennt sich jemand um, stand hier bis zum nächsten Morgen weiter
  // der alte Name – gemeldet am Fall „Daddy Hell". Für alles, was zu einem
  // Kadereintrag gehört, gilt deshalb der Kadername; der Schnappschuss bleibt
  // nur die Rückfallebene für Einträge ohne Verknüpfung.
  const spielerIds = entries.map((e) => e.playerId).filter((id): id is string => id !== null);
  const kaderNamen = new Map(
    (
      await prisma.player.findMany({
        where: { id: { in: spielerIds } },
        select: { id: true, name: true },
      })
    ).map((p) => [p.id, p.name]),
  );

  const byKey = new Map(settings.map((s) => [s.key, s.value]));
  const stand = byKey.get(KEYS.capturedAt) || byKey.get(KEYS.fetchedAt) || null;

  const rows = entries.map((e) => ({
    rank: e.rank,
    name: (e.playerId ? kaderNamen.get(e.playerId) : null) ?? e.name,
    country: e.country,
    thp: e.thp === null ? null : formatThp(e.thp),
    power: e.power === null ? null : formatThp(e.power),
    serverRank: e.serverRank,
    stale: e.stale,
  }));

  const inTop200 = rows.filter((r) => r.serverRank !== null && r.serverRank <= 200).length;

  return (
    <div className="max-w-[1000px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{t("kicker")}</p>
          <h1 className="text-3xl text-sand">{t("heading")}</h1>
          <p className="mt-1 text-sm text-muted">{t("intro")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="panel px-4 py-2 text-right">
            <div className="font-display text-2xl leading-none">
              {inTop200}
              <span className="text-muted text-base"> / {rows.length}</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted">
              {t("inTop200")}
            </div>
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted">{t("empty")}</div>
      ) : (
        <RankingTable rows={rows} stand={stand} />
      )}
    </div>
  );
}
