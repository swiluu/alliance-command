import { getTranslations } from "next-intl/server";

import { requireAccess } from "@/lib/access";
import { VS_TOP_N, VS_VIP_SLOTS } from "@/lib/vs";
import { getVsRanking } from "@/server/vs-service";
import { getZugAnnouncement } from "@/server/zug-announcement";
import { isoWeekOf, shiftWeek, weeksInIsoYear, type Week } from "@/lib/iso-week";

import { ZugAnnouncementView } from "./announcement-view";
import type { VsTopRow } from "./vs-top-image";

export async function generateMetadata() {
  const t = await getTranslations("zug");
  return { title: t("announcementTitle") };
}

export default async function ZugAnkuendigungPage({
  searchParams,
}: {
  searchParams: { kw?: string; jahr?: string };
}) {
  const { level } = await requireAccess("zug", "READ");

  // Angekündigt wird die kommende Woche – deshalb ist das die Voreinstellung.
  const jetzt = isoWeekOf();
  const jahr = Number(searchParams.jahr);
  const nr = Number(searchParams.kw);
  const year = Number.isFinite(jahr) && jahr > 2000 ? jahr : jetzt.year;
  const week: Week =
    Number.isFinite(nr) && nr >= 1 && nr <= weeksInIsoYear(year)
      ? { year, kw: nr }
      : shiftWeek(jetzt, 1);

  const announcement = await getZugAnnouncement(week);

  // Die VS-Rangliste, die für diese Zug-Woche gilt: die vier Wochen davor.
  // Dieselbe Regel wie bei den VIP-Sternen im Fahrplan – der Aushang soll
  // nicht etwas anderes behaupten als die Planung.
  let vsTop: VsTopRow[] = [];
  let vsFenster = "";
  try {
    const rang = await getVsRanking(shiftWeek(week, -1));
    const kws = rang.weeks.map((w) => w.kw);
    vsFenster =
      kws.length === 0
        ? ""
        : kws.length === 1
          ? `KW${kws[0]}`
          : `KW${kws[0]}–${kws[kws.length - 1]}`;
    vsTop = rang.rows.slice(0, VS_TOP_N).map((z) => ({
      rank: z.rank,
      name: z.name,
      average: Math.round(z.average),
      vipRank: z.vipRank,
      isR4: z.isR4,
    }));
  } catch {
    /* Ohne Auswertung bleibt der Aushang der Fahrplan. */
  }

  return (
    <ZugAnnouncementView
      announcement={announcement}
      currentWeek={jetzt}
      canEdit={level === "EDIT"}
      vsTop={vsTop}
      vsFenster={vsFenster}
      vipSlots={VS_VIP_SLOTS}
    />
  );
}
