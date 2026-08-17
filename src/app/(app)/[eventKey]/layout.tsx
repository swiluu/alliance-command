import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MITGLIED_TABS, requireAccess } from "@/lib/access";
import { isEventKey, type EventKey } from "@/lib/constants";
import { getLayout, getSeason, syncExpiredBans } from "@/server/event-service";
import { ALLIANZ_TAG } from "@/lib/allianz";

import { ALLE_TABS, EventNav } from "./event-nav";

export async function generateMetadata({ params }: { params: { eventKey: string } }) {
  if (!isEventKey(params.eventKey)) return { title: `${ALLIANZ_TAG} Command` };
  // Der Name kommt aus den Übersetzungen und nicht aus dem Layout: die Events
  // heissen im Spiel auf Englisch anders, als eine Übersetzung des deutschen
  // Namens vermuten liesse ("Canyon Battlefield", nicht "Canyon Storm").
  const tm = await getTranslations("modules");
  return { title: `${tm(params.eventKey)} · ${ALLIANZ_TAG} Command` };
}

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { eventKey: string };
}) {
  const { eventKey } = params;
  if (!isEventKey(eventKey)) notFound();

  const { user, level } = await requireAccess(eventKey, "READ");
  // Einfache Mitglieder sehen nur die Wochenplanung – alles andere taucht erst
  // gar nicht in der Leiste auf. Der R4-Rang sieht das ganze Event.
  const erlaubteReiter = user.isMember && !user.isR4 ? MITGLIED_TABS : ALLE_TABS;
  const season = await getSeason(eventKey);
  // Abgelaufene Banns fallen bei jedem Read, kein Cronjob nötig.
  await syncExpiredBans(eventKey, season.currentWeek);
  const layout = await getLayout(eventKey);
  const tm = await getTranslations("modules");
  const t = await getTranslations("event");

  return (
    <div className="max-w-[1600px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
            {t("kicker")}
          </p>
          <h1 className="text-3xl text-sand">{tm(params.eventKey as EventKey)}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="panel px-4 py-2 text-right">
            <div className="font-display text-2xl leading-none">
              {season.currentWeek}
              <span className="text-muted text-base"> / {layout.totalWeeks}</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted">
              {t("currentWeek")}
            </div>
          </div>
          {level === "READ" && (
            <span className="tag border-sand-dim text-sand">{t("readOnly")}</span>
          )}
        </div>
      </header>

      <EventNav eventKey={eventKey} erlaubt={erlaubteReiter} />

      <div className="mt-5">{children}</div>

      <footer className="mt-10 text-xs text-muted">
        <Link href="/uebersicht" className="hover:text-sand">
          {t("backToOverview")}
        </Link>
      </footer>
    </div>
  );
}
