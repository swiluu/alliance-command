import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { dauer, heute } from "@/lib/absence";

import {
  getAccessLevel,
  getAccessMap,
  hasAtLeast,
  requireUser,
  siehtFuehrungsdaten,
} from "@/lib/access";
import { recentActivity } from "@/lib/activity";
import { MAX_PLAYERS, TACTICAL_EVENTS, isModuleKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { slotsPerTeam } from "@/lib/event-layouts";
import {
  ensurePlayerStates,
  getLayout,
  getPlayerRows,
  getSeason,
  getStats,
  syncExpiredBans,
} from "@/server/event-service";

import { getAllianceChanges } from "@/server/alliance-watch";
import { anzahlOffeneFehler, offeneFehler, ueberfaelligeLaeufe } from "@/server/error-log";

import { AllianceAlert } from "./alliance-alert";
import { ErrorPanel } from "./error-panel";
import { getWocheDerAllianz } from "@/server/woche-der-allianz";
import { ALLIANZ_TAG } from "@/lib/allianz";

import { PactPanel } from "./pact-panel";
import { WochePanel } from "./woche-panel";
import { ThpPanel } from "./thp-panel";

export async function generateMetadata() {
  const t = await getTranslations("overview");
  return { title: `${t("heading")} · ${ALLIANZ_TAG} Command` };
}

export default async function UebersichtPage() {
  const user = await requireUser();
  const access = await getAccessMap(user);
  const t = await getTranslations("overview");
  const ta = await getTranslations("absence");
  const tm = await getTranslations("modules");
  const tAct = await getTranslations("activity");
  const locale = await getLocale();

  // Störungen gehen nur Superadmins etwas an – sie sind die einzigen, die
  // etwas daran ändern können.
  const [fehler, fehlerGesamt, ueberfaellig] = user.isSuperadmin
    ? await Promise.all([offeneFehler(8), anzahlOffeneFehler(), ueberfaelligeLaeufe()])
    : [[], 0, []];

  // Bündnisse sieht jedes angemeldete Konto – wer im Feld steht, muss wissen,
  // wen er angreifen darf.
  const pacts = await prisma.pact.findMany({
    // Nach Servernummer aufsteigend – so stehen Bündnisse desselben Servers
    // beieinander, und der eigene (#1580) taucht dort auf, wo man ihn sucht.
    orderBy: [{ serverId: "asc" }, { tag: "asc" }],
  });

  const events = await Promise.all(
    TACTICAL_EVENTS.map(async (eventKey) => {
      const level = access[eventKey];
      if (level === "NONE") return { eventKey, level, visible: false as const };

      await ensurePlayerStates(eventKey);
      const season = await getSeason(eventKey);
      await syncExpiredBans(eventKey, season.currentWeek);

      const layout = await getLayout(eventKey);
      const slotsTotal = slotsPerTeam(layout.groups) * 2;
      const [stats, rows] = await Promise.all([
        getStats(eventKey, slotsTotal),
        getPlayerRows(eventKey),
      ]);

      return {
        eventKey,
        level,
        visible: true as const,
        displayName: layout.displayName,
        currentWeek: season.currentWeek,
        slotsTotal,
        stats,
        fixplatz: rows.filter((r) => r.isFixplatz).map((r) => r.name),
      };
    }),
  );

  const allianzLevel = await getAccessLevel(user, "allianz");
  // Nur prüfen, wer den Kader auch pflegen darf – sonst ist die Meldung
  // für den Betrachter folgenlos.
  const changes = hasAtLeast(allianzLevel, "READ")
    ? await getAllianceChanges()
    : { available: false, joined: [], left: [], ausgetreten: [] };

  // Fixplätze und Protokoll sind Führungsdaten – ein einfaches Mitglied sieht
  // sie nicht, der R4-Rang schon.
  const fuehrung = siehtFuehrungsdaten(user);

  const kaderGroesse = await prisma.player.count({
    where: { leftAt: null, isExternal: false },
  });

  // Wer heute als abwesend gemeldet ist – die häufigste Rückfrage, wenn
  // jemand auffällig still ist.
  const stichtag = heute();
  const abwesend = await prisma.absence.findMany({
    where: {
      from: { lte: stichtag },
      OR: [{ until: null }, { until: { gte: stichtag } }],
      player: { leftAt: null },
    },
    orderBy: { from: "asc" },
    include: { player: { select: { id: true, name: true } } },
  });

  const [wocheDerAllianz, [top5, activity]] = await Promise.all([
    // Beiwerk: fällt eine Quelle aus, bleibt die Übersicht vollständig.
    getWocheDerAllianz().catch(() => []),
    Promise.all([
    prisma.player.findMany({
      where: { thpValue: { not: null }, isExternal: false },
      orderBy: { thpValue: "desc" },
      take: 5,
      select: { id: true, name: true, thpRaw: true },
    }),
    fuehrung ? recentActivity(20) : Promise.resolve([]),
    ]),
  ]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <header>
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{t("kicker")}</p>
        <h1 className="text-3xl text-sand">{t("heading")}</h1>
      </header>

      <ErrorPanel
        rows={fehler.map((f) => ({
          id: f.id,
          createdAt: f.createdAt.toISOString(),
          source: f.source,
          message: f.message,
          detail: f.detail,
          userName: f.userName,
        }))}
        total={fehlerGesamt}
        overdue={ueberfaellig}
      />

      {abwesend.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="text-lg">
              <span aria-hidden className="mr-1">
                🌴
              </span>
              {t("awayNow")}
            </h2>
            <Link href="/abwesenheit" className="tag hover:border-sand-dim">
              {t("seeAll")}
            </Link>
          </div>
          <ul className="flex flex-wrap gap-2 p-3">
            {abwesend.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/spieler/${a.player.id}`}
                  className="tag border-sand-dim text-sand hover:border-sand"
                  title={a.note ?? undefined}
                >
                  {a.player.name}
                  <span className="ml-1 font-mono opacity-70">
                    {(() => {
                      const d = dauer({ from: a.from, until: a.until }, stichtag);
                      return ta(`dauer.${d.key}`, { days: d.days });
                    })()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AllianceAlert
        changes={changes}
        canManage={hasAtLeast(allianzLevel, "EDIT")}
        freiePlaetze={MAX_PLAYERS - kaderGroesse}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {events.map((e) =>
          e.visible ? (
            <section key={e.eventKey} className="panel">
              <div className="panel-head">
                <div>
                  <h2 className="text-lg">
                    <Link href={`/${e.eventKey}/spieler`} className="hover:text-sand">
                      {tm(e.eventKey)}
                    </Link>
                  </h2>
                  <p className="text-xs text-muted font-mono">
                    {t("weekSlots", { week: e.currentWeek, slots: e.slotsTotal })}
                  </p>
                </div>
                <span className="tag">{e.level === "EDIT" ? "Edit" : "Read"}</span>
              </div>

              <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label={t("statTakingPart")} value={e.stats.teil} tone="ok" />
                <Stat label={t("statNotTakingPart")} value={e.stats.nichtTeil} />
                <Stat label={t("statBanned")} value={e.stats.gesperrt} tone="danger" />
                <Stat
                  label={t("statSurplus", { slots: e.slotsTotal })}
                  value={e.stats.ueberschuss > 0 ? `+${e.stats.ueberschuss}` : e.stats.ueberschuss}
                  tone={e.stats.ueberschuss >= 0 ? "ok" : "sand"}
                />
              </div>

              {fuehrung && (
              <div className="px-3 pb-3">
                <h3 className="text-[11px] uppercase tracking-wider text-muted mb-1.5">
                  {t("fixSeats", { count: e.fixplatz.length })}
                </h3>
                {e.fixplatz.length === 0 ? (
                  <p className="text-xs text-muted">{t("noFixSeats")}</p>
                ) : (
                  <ul className="flex flex-wrap gap-1">
                    {e.fixplatz.map((n) => (
                      <li key={n} className="tag border-ok/40 text-ok">
                        ⭐ {n}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              )}
            </section>
          ) : (
            <section key={e.eventKey} className="panel p-6 text-center text-sm text-muted">
              <h2 className="text-lg text-ink mb-1">{tm(e.eventKey)}</h2>
              {t("noAccess")}
            </section>
          ),
        )}
      </div>

      {/* Wer die Woche getragen hat – vor den Zahlen der Leitung, weil es
          alle angeht und nicht nur die neun R4. */}
      <WochePanel zeilen={wocheDerAllianz} />

      {/* Rechte Spalte: erst die Bündnisse, darunter das Protokoll. Wer kein
          R4 ist, sieht das Protokoll nicht – für ihn steht dort nur die
          Bündnisliste. Zweispaltig deshalb immer, nicht nur für die Leitung. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ThpPanel top5={top5} canImport={hasAtLeast(allianzLevel, "EDIT")} />

        <div className="space-y-4">
          <PactPanel
            rows={pacts.map((p) => ({
              id: p.id,
              serverId: p.serverId,
              tag: p.tag,
              name: p.name,
              zugLoot: p.zugLoot,
              baseHits: p.baseHits,
              note: p.note,
            }))}
            canEdit={user.isSuperadmin || user.isR4}
          />

        {fuehrung && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="text-lg">{t("activity")}</h2>
            <span className="tag">{activity.length}</span>
          </div>
          <ul className="p-2 space-y-1 max-h-[420px] overflow-y-auto">
            {activity.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded border border-line bg-panel-2/50 px-2 py-1.5 text-sm"
              >
                <time
                  className="font-mono text-[11px] text-muted shrink-0"
                  dateTime={a.createdAt.toISOString()}
                >
                  {a.createdAt.toLocaleString(locale, {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                {a.module && isModuleKey(a.module) && (
                  <span className="tag shrink-0">{tm(a.module)}</span>
                )}
                {/* Die Aktion steht als deutscher Text in der Datenbank; hier
                    wird sie beim Anzeigen übersetzt. Was nicht in der Liste
                    steht – ältere Einträge –, bleibt wie aufgezeichnet. */}
                <span>{tAct.has(a.action as never) ? tAct(a.action as never) : a.action}</span>
                {a.detail && <span className="text-muted">— {a.detail}</span>}
                <span className="text-[11px] text-muted ml-auto">{a.userName}</span>
              </li>
            ))}
            {activity.length === 0 && (
              <li className="py-8 text-center text-sm text-muted">{t("noActivity")}</li>
            )}
          </ul>
        </section>
        )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "danger" | "sand";
}) {
  const cls =
    tone === "ok"
      ? "text-ok"
      : tone === "danger"
        ? "text-danger"
        : tone === "sand"
          ? "text-sand"
          : "text-ink";
  return (
    <div className="rounded border border-line bg-panel-2/50 px-3 py-2">
      <div className={`stat-value ${cls}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
