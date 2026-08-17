import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { getAccessMap, requireUser, siehtFuehrungsdaten } from "@/lib/access";
import { dauer, zeitraumText } from "@/lib/absence";
import {
  MODULE_META,
  ROTATION_META,
  TACTICAL_EVENTS,
  type EventKey,
  type RotationStatus,
} from "@/lib/constants";
import { DIAGRAMM_TITEL, getLwrProfil } from "@/server/lwr-profile";
import { getPlayerProfile } from "@/server/player-profile";
import { getVsRanking } from "@/server/vs-service";

export async function generateMetadata() {
  const t = await getTranslations("profile");
  return { title: t("title") };
}

export default async function SpielerProfilPage({
  params,
}: {
  params: { playerId: string };
}) {
  const user = await requireUser();
  const access = await getAccessMap(user);

  const events = TACTICAL_EVENTS.filter((e) => access[e] !== "NONE") as EventKey[];

  // Der Zug ist dem R4-Rang vorbehalten. Die eigene Fahrtenbilanz ist davon
  // ausgenommen: wie oft man selbst gefahren ist und wie oft als VIP, darf
  // jeder auf seinem eigenen Profil sehen. Fremde Profile bleiben zu.
  const zugZugriff = access.zug !== "NONE";
  const eigenesProfil = user.playerId !== null && user.playerId === params.playerId;

  const profile = await getPlayerProfile(
    params.playerId,
    events,
    zugZugriff || eigenesProfil,
    siehtFuehrungsdaten(user),
  );
  if (!profile) notFound();

  const t = await getTranslations("profile");
  const ta = await getTranslations("absence");
  const tr = await getTranslations("rotation");
  const tm = await getTranslations("modules");
  const locale = await getLocale();
  const f = await getFormatter();

  // Beiwerk aus dem eigenen lastwarrank: Wochenverlauf und Spielstand. Bewusst
  // erst hier und nicht im Profil-Dienst – fällt die Quelle aus, fehlt nur
  // dieser eine Abschnitt.
  const [vsRanking, lwr] = await Promise.all([
    getVsRanking().catch(() => null),
    getLwrProfil(profile.lwrId),
  ]);
  const vs = vsRanking?.rows.find((r) => r.playerId === params.playerId) ?? null;

  return (
    <div className="max-w-[900px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {/* Das Bild kommt aus dem Spielerprofil der Quelle. Fehlt es oder
              fällt die Quelle aus, treten die Initialen an seine Stelle. */}
          <Avatar src={lwr?.photoUrl ?? null} name={profile.name} size={64} />
          <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{t("kicker")}</p>
          <h1 className="text-3xl text-sand break-words">{profile.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-mono">{profile.allianceTag}</span>
            {/* Vor allen anderen Kennzeichen: R2 bedeutet, dass dieser Spieler
                an beiden Events nicht teilnehmen darf. */}
            {profile.r2 && (
              <span className="tag border-danger text-danger" title={t("r2Title")}>
                R2
              </span>
            )}
            {profile.zug?.isR4Rotation && (
              <span className="tag border-sand-dim text-sand">R4</span>
            )}
            {profile.former && <span className="tag">{t("left")}</span>}
            {profile.accountGeloescht && (
              <span className="tag border-danger/60 text-danger" title={t("accountGoneTitle")}>
                {t("accountGone")}
              </span>
            )}
            {profile.external && <span className="tag">{t("external")}</span>}
          </p>
          </div>
        </div>

        <div className="panel px-4 py-2 text-right">
          <div className="font-display text-2xl leading-none">
            {profile.thpRaw ?? "—"}
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted">
            THP
            {profile.kaderRang !== null && t("rosterRank", { rank: profile.kaderRang })}
          </div>
          {/* Der Serverrang wurde bisher geholt und nie angezeigt. */}
          {profile.serverRang !== null && (
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted">
              {t("serverRank", { rank: profile.serverRang })}
            </div>
          )}
        </div>
      </header>

      {profile.r2 && (
        <p className="panel border-danger px-4 py-3 text-sm text-danger">
          <span aria-hidden className="mr-1">
            🛡
          </span>
          {t("r2Since", {
            date: f.dateTime(new Date(profile.r2.seit), {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            }),
          })}
          {profile.r2.markiertVon && (
            <span className="text-muted"> · {t("r2By", { name: profile.r2.markiertVon })}</span>
          )}
        </p>
      )}

      {profile.abwesend && (
        <p className="panel border-sand-dim px-4 py-3 text-sm text-sand">
          <span aria-hidden className="mr-1">
            🌴
          </span>
          {t("awayFrom", {
            span: zeitraumText(
              {
                from: new Date(profile.abwesend.from),
                until: profile.abwesend.until ? new Date(profile.abwesend.until) : null,
              },
              locale,
            ),
          })}{" "}
          <span className="text-muted">
            ·{" "}
            {(() => {
              const d = dauer({
                from: new Date(profile.abwesend.from),
                until: profile.abwesend.until ? new Date(profile.abwesend.until) : null,
              });
              return ta(`dauer.${d.key}`, { days: d.days });
            })()}
            {profile.abwesend.note && ` · ${profile.abwesend.note}`}
          </span>
        </p>
      )}

      {/* Frühere Namen: wer sich umbenennt, ist in älteren Ranglisten und
          Screenshots sonst nicht wiederzufinden. */}
      {profile.frühereNamen.length > 0 && (
        <p className="panel px-4 py-3 text-sm">
          <span aria-hidden className="mr-1">
            ✎
          </span>
          <span className="text-muted">{t("formerNames")}</span>{" "}
          {profile.frühereNamen.map((n, i) => (
            <span key={`${n.am}-${i}`}>
              {i > 0 && <span className="text-muted"> · </span>}
              <span
                title={t("renamedOn", {
                  date: f.dateTime(new Date(n.am), {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }),
                  quelle: n.quelle,
                })}
              >
                {n.vorher}
              </span>
            </span>
          ))}
        </p>
      )}

      {profile.notes && (
        <p className="panel px-4 py-3 text-sm text-muted">{profile.notes}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {profile.events.map((e) => (
          <section key={e.eventKey} className="panel">
            <div className="panel-head flex-wrap gap-2">
              <h2 className="text-lg">
                <span aria-hidden className="mr-1">
                  {MODULE_META[e.eventKey].icon}
                </span>
                {tm(e.eventKey)}
              </h2>
              <Link
                href={MODULE_META[e.eventKey].href}
                className="tag hover:border-sand-dim"
              >
                {t("toModule")}
              </Link>
            </div>

            <div className="p-3 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <span className={`tag ${e.angemeldet ? "border-ok/50 text-ok" : ""}`}>
                  {e.angemeldet ? t("registered") : t("deregistered")}
                </span>
                {e.isFixplatz && (
                  <span className="tag border-sand text-sand">{t("fixSeat")}</span>
                )}
                {e.gesperrtBis !== null && (
                  <span className="tag border-danger text-danger">
                    {t("bannedUntil", { week: e.gesperrtBis })}
                  </span>
                )}
              </div>

              <p className="text-sm">
                <span className="text-muted">{t("weekPrefix", { week: e.currentWeek })}</span>
                {e.aktuellePosition ? (
                  <>
                    {e.aktuellePosition.team
                      ? `Team ${e.aktuellePosition.team}`
                      : t("noTeam")}
                    {" · "}
                    <span className="text-sand">{e.aktuellePosition.label}</span>
                    {e.aktuellePosition.isSubstitute && t("substitute")}
                  </>
                ) : e.angemeldet ? (
                  <span className="text-muted">{t("registeredNotFielded")}</span>
                ) : (
                  <span className="text-muted">{t("notInSquad")}</span>
                )}
              </p>

              <dl className="grid grid-cols-4 gap-2 text-center">
                <Zahl label={t("appearances")} wert={e.einsaetze} />
                <Zahl label={t("satOut")} wert={e.ausgesetzt} />
                <Zahl label={t("missed")} wert={e.gefehlt} warnen={e.gefehlt > 0} />
                <Zahl
                  label={t("present")}
                  text={e.verfuegbar === 0 ? "–" : `${e.einsaetze}/${e.verfuegbar}`}
                />
              </dl>

              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">
                  {t("recentWeeks")}
                </div>
                <div className="flex flex-wrap gap-0.5">
                  {e.verlauf.map((w) => {
                    const meta = w.status
                      ? ROTATION_META[w.status as RotationStatus]
                      : undefined;
                    return (
                      <span
                        key={w.week}
                        title={t("weekStatus", {
                          week: w.week,
                          status: w.status ? tr(w.status as RotationStatus) : "—",
                        })}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-sm text-[9px] font-mono ${
                          meta?.cls ?? "bg-panel-2/40 text-muted"
                        }`}
                      >
                        {w.week}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        ))}

        {vs && (
          <section className="panel">
            <div className="panel-head flex-wrap gap-2">
              <h2 className="text-lg">
                <span aria-hidden className="mr-1">
                  {MODULE_META.vs.icon}
                </span>
                {tm("vs")}
              </h2>
              <Link href="/vs" className="tag hover:border-sand-dim">
                {t("toModule")}
              </Link>
            </div>
            <div className="p-3 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <span className="tag">{t("vsRank", { rank: vs.rank })}</span>
                {/* Die sieben VIP-Plätze sind der Grund, warum die Liste
                    überhaupt geführt wird – das gehört hervorgehoben. */}
                {vs.vipRank !== null && (
                  <span className="tag border-sand text-sand">
                    {t("vsVip", { rank: vs.vipRank })}
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-center">
                <Zahl label={t("vsAverage")} text={f.number(Math.round(vs.average))} />
                <Zahl label={t("vsWeeks")} text={`${vs.filled}/4`} />
              </dl>
              <div className="flex gap-1">
                {vs.points.map((punkte, i) => (
                  <span
                    key={i}
                    title={
                      punkte === null
                        ? t("vsNoWeek")
                        : f.number(punkte)
                    }
                    className={`h-1.5 flex-1 rounded-sm ${
                      punkte === null ? "bg-line" : "bg-sand/70"
                    }`}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {profile.zug && (
          <section className="panel">
            <div className="panel-head flex-wrap gap-2">
              <h2 className="text-lg">
                <span aria-hidden className="mr-1">
                  {MODULE_META.zug.icon}
                </span>
                {tm("zug")}
              </h2>
              {/* Ohne Zugriff auf das Modul führte der Verweis nur auf die
                  Seite „kein Zugriff" – dann lieber keinen anbieten. */}
              {zugZugriff && (
                <Link href="/zug" className="tag hover:border-sand-dim">
                  {t("toModule")}
                </Link>
              )}
            </div>
            <div className="p-3 space-y-3">
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Zahl label={t("zugDrove")} wert={profile.zug.gefahren} />
                <Zahl label={t("zugPlanned")} wert={profile.zug.geplant} />
                <Zahl label={t("zugVip")} wert={profile.zug.vip} />
              </dl>
              <p className="text-sm text-muted">
                {t("zugLast")}
                {profile.zug.zuletztGefahren
                  ? t("zugLastValue", {
                      kw: profile.zug.zuletztGefahren.kw,
                      year: profile.zug.zuletztGefahren.year,
                    })
                  : t("zugNever")}
                {profile.zug.geplant > profile.zug.gefahren && (
                  <>
                    {" · "}
                    {t("zugHandedOver", {
                      count: profile.zug.geplant - profile.zug.gefahren,
                    })}
                  </>
                )}
              </p>
            </div>
          </section>
        )}
      </div>


      {lwr && (
        <section className="panel">
          <div className="panel-head flex-wrap gap-2">
            <h2 className="text-lg">
              <span aria-hidden className="mr-1">
                📈
              </span>
              {t("lwrHeading")}
            </h2>
            <a
              href={`https://lastwarrank.com/player/${lwr.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tag hover:border-sand-dim"
            >
              {t("lwrOpen")}
            </a>
          </div>

          <div className="p-3 space-y-4">
            <div className="flex flex-wrap gap-1.5 text-xs">
              {lwr.allianceRank !== null && (
                <span
                  className={`tag ${lwr.allianceRank === 2 ? "border-danger text-danger" : ""}`}
                >
                  {t("lwrIngameRank", { rank: lwr.allianceRank })}
                </span>
              )}
              {lwr.baseLevel !== null && <span className="tag">{t("lwrHq", { lv: lwr.baseLevel })}</span>}
              {lwr.careerTitle && (
                <span className="tag">
                  {lwr.careerTitle}
                  {lwr.careerLv !== null && ` · Lv ${lwr.careerLv}`}
                </span>
              )}
              {lwr.bestGlobal && (
                <span className="tag">
                  {t("lwrBestGlobal", { rank: f.number(lwr.bestGlobal.rank) })}
                </span>
              )}
              {/* Ein abweichender Ursprungsserver heisst: zugewandert. */}
              {lwr.originServerId !== null && lwr.originServerId !== lwr.serverId && (
                <span className="tag">
                  {t("lwrMigrated", { from: lwr.originServerId })}
                </span>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {lwr.charts
                .filter((c) => c.points.length > 1)
                .map((c) => (
                  <div key={c.title}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
                        {DIAGRAMM_TITEL[c.title] ?? c.title}
                      </span>
                      {c.growth4w !== null && (
                        <span
                          className={`font-mono text-xs ${
                            c.growth4w >= 0 ? "text-ok" : "text-danger"
                          }`}
                          title={t("lwrGrowthTitle")}
                        >
                          {c.growth4w >= 0 ? "+" : ""}
                          {c.growth4w.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <Kurve punkte={c.points.map((pt) => pt.value)} />
                    <div className="flex justify-between text-[11px] text-muted">
                      <span>{c.points[0].week_start}</span>
                      <span className="font-mono text-ink">
                        {c.currentValue === null ? "—" : f.number(c.currentValue)}
                      </span>
                    </div>
                    {c.serverRank !== null && (
                      <p className="text-[11px] text-muted">
                        {t("lwrServerRank", { rank: f.number(c.serverRank) })}
                      </p>
                    )}
                  </div>
                ))}
            </div>

            {lwr.lastSeenAt && (
              <p className="text-[11px] text-muted">
                {t("lwrSeen", {
                  date: f.dateTime(new Date(lwr.lastSeenAt), {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }),
                })}
              </p>
            )}
          </div>
        </section>
      )}

      {profile.events.length === 0 && !profile.zug && (
        <div className="panel p-8 text-center text-sm text-muted">
          {t("noModules")}
        </div>
      )}
    </div>
  );
}

function Zahl({
  label,
  wert,
  text,
  warnen,
}: {
  label: string;
  wert?: number;
  text?: string;
  warnen?: boolean;
}) {
  return (
    <div className="rounded border border-line bg-panel-2/40 px-2 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-muted">{label}</dt>
      <dd
        className={`font-display text-xl leading-none ${warnen ? "text-danger" : ""}`}
      >
        {text ?? wert ?? 0}
      </dd>
    </div>
  );
}

/**
 * Wochenverlauf als Linie. Bewusst ohne Diagramm-Bibliothek – es geht um die
 * Richtung, nicht um ablesbare Werte; die genaue Zahl steht daneben.
 */
function Kurve({ punkte }: { punkte: number[] }) {
  if (punkte.length < 2) return null;
  const min = Math.min(...punkte);
  const max = Math.max(...punkte);
  const spanne = max - min || 1;
  const d = punkte
    .map((w, i) => {
      const x = (i / (punkte.length - 1)) * 100;
      const y = 24 - ((w - min) / spanne) * 22 - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="my-1 h-8 w-full" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2" className="text-sand" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
