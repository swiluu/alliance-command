// `useTranslations` gilt hier für BanCard: die Komponente ist synchron,
// und darin arbeitet der Haken auch serverseitig. Die Seite selbst ist
// async und braucht deshalb `getTranslations`.
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { requireEventTab } from "@/lib/access";
import { BAN_AUTO_REASON, isEventKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getSeason } from "@/server/event-service";

export default async function BannsPage({ params }: { params: { eventKey: string } }) {
  const { eventKey } = params;
  if (!isEventKey(eventKey)) notFound();

  await requireEventTab(eventKey, "banns");
  const season = await getSeason(eventKey);
  const t = await getTranslations("bans");

  const bans = await prisma.banRecord.findMany({
    where: { eventKey },
    orderBy: [{ active: "desc" }, { bannedInWeek: "desc" }],
    include: { player: { select: { name: true } } },
  });

  const active = bans.filter((b) => b.active);
  const past = bans.filter((b) => !b.active);

  return (
    <div className="space-y-5">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="text-lg">{t("activeHeading")}</h2>
            <p className="text-xs text-muted font-mono">
              {t("activeSubline", { count: active.length, week: season.currentWeek })}
            </p>
          </div>
        </div>
        {active.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">{t("noneActive")}</p>
        ) : (
          <div className="p-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((b) => (
              <BanCard
                key={b.id}
                name={b.player.name}
                from={b.bannedInWeek}
                to={b.expiresWeek}
                reason={b.reason}
                currentWeek={season.currentWeek}
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="text-lg">{t("pastHeading")}</h2>
          <span className="tag">{past.length}</span>
        </div>
        {past.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">{t("nonePast")}</p>
        ) : (
          <div className="p-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {past.map((b) => (
              <BanCard
                key={b.id}
                name={b.player.name}
                from={b.bannedInWeek}
                to={b.expiresWeek}
                reason={b.reason}
                currentWeek={season.currentWeek}
                expired
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BanCard({
  name,
  from,
  to,
  reason,
  currentWeek,
  expired,
}: {
  name: string;
  from: number;
  to: number;
  reason: string;
  currentWeek: number;
  expired?: boolean;
}) {
  const t = useTranslations("bans");
  const span = Math.max(1, to - from);
  const done = Math.min(span, Math.max(0, currentWeek - from));
  const pct = expired ? 100 : Math.round((done / span) * 100);

  return (
    <article
      className={`rounded border p-3 ${
        expired ? "border-line bg-panel-2/30 opacity-60" : "border-danger/40 bg-danger/5"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium truncate" title={name}>
          {name}
        </h3>
        <span className={`tag ${expired ? "" : "border-danger/60 text-danger"}`}>
          {expired ? t("expired") : t("banned")}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted font-mono">{t("span", { from, to })}</p>
      {/* Der automatische Grund steht als fester Text in der Datenbank – nur
          er lässt sich übersetzen. Von Hand eingetragene Gründe bleiben so,
          wie jemand sie geschrieben hat. */}
      <p className="mt-1 text-xs text-muted">
        {reason === BAN_AUTO_REASON ? t("autoReason") : reason}
      </p>

      <div
        className="mt-3 h-1.5 rounded bg-panel-2 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("progressAria", { name })}
      >
        <div
          className={`h-full ${expired ? "bg-line" : "bg-danger"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </article>
  );
}
