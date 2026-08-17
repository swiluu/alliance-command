import "server-only";

import { WEEKDAYS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { weekRangeLabel, type Week } from "@/lib/iso-week";
import {
  ANNOUNCEMENT_DEFAULTS,
  ANNOUNCEMENT_KEYS,
  type AnnouncementRow,
  type ZugAnnouncement,
} from "@/lib/zug-announcement-types";

type PlayerRef = { id: string; name: string } | null;

/** Namen werden unverändert übernommen, so wie sie im Spiel stehen. */
const person = (p: PlayerRef) => (p ? { id: p.id, name: p.name } : null);

/**
 * Baut die fertige Zugliste für eine KW.
 *
 * Angekündigt wird der **geplante** Zugführer – die Liste geht raus, bevor
 * gefahren wird. Steht ausnahmsweise nur ein tatsächlicher Fahrer drin, wird
 * der genommen, damit eine nachträglich gepostete Liste trotzdem stimmt.
 */
export async function getZugAnnouncement(week: Week): Promise<ZugAnnouncement> {
  const select = { id: true, name: true };

  const [kwRecord, settings] = await Promise.all([
    prisma.zugKW.findUnique({
      where: { year_kw: week },
      include: {
        days: {
          orderBy: { dayIndex: "asc" },
          include: {
            plannedDriver: { select },
            actualDriver: { select },
            vipPlayer: { select },
          },
        },
      },
    }),
    prisma.appSetting.findMany({
      where: { key: { in: Object.values(ANNOUNCEMENT_KEYS) } },
    }),
  ]);

  const byKey = new Map(settings.map((s) => [s.key, s.value]));
  const texts = {
    greeting: byKey.get(ANNOUNCEMENT_KEYS.greeting) ?? ANNOUNCEMENT_DEFAULTS.greeting,
    intro: byKey.get(ANNOUNCEMENT_KEYS.intro) ?? ANNOUNCEMENT_DEFAULTS.intro,
    signature: byKey.get(ANNOUNCEMENT_KEYS.signature) ?? ANNOUNCEMENT_DEFAULTS.signature,
  };

  const rows: AnnouncementRow[] = WEEKDAYS.map((weekday, dayIndex) => {
    const day = kwRecord?.days.find((d) => d.dayIndex === dayIndex);
    return {
      dayIndex,
      weekday,
      driver: person(day?.plannedDriver ?? day?.actualDriver ?? null),
      vip: person(day?.vipPlayer ?? null),
    };
  });

  const range = weekRangeLabel(week);
  const zeilen = rows.map((r) => {
    const fahrer = r.driver?.name ?? "offen";
    return r.vip ? `${r.weekday}: ${fahrer}-VIP ${r.vip.name}` : `${r.weekday}: ${fahrer}`;
  });

  const text = [
    texts.greeting,
    "",
    texts.intro,
    "",
    `Zugliste ${range}`,
    "",
    ...zeilen,
    "",
    texts.signature,
  ].join("\n");

  return {
    week,
    range,
    rows,
    text,
    offen: rows.filter((r) => !r.driver).length,
    texts,
  };
}
