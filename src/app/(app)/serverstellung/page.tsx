import { getFormatter, getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/access";
import { ALLIANZ_TAG, SERVER_ID } from "@/lib/allianz";
import { KADER, prisma } from "@/lib/db";
import { getServerstellung } from "@/server/lwr-allianz";

export async function generateMetadata() {
  const t = await getTranslations("stellung");
  return { title: t("title") };
}

const SERVER = SERVER_ID;
const TAG = ALLIANZ_TAG;

/**
 * Wo die Allianz im Serververgleich steht.
 *
 * Bewusst ohne Modul-Zugriff: hier lässt sich nichts ändern, und gerade die
 * Mitglieder ohne Führungsaufgabe sollen sehen, wofür sie spielen. Die interne
 * Rangliste zeigt, wer im Kader vorn liegt – nicht, dass dieser Kader die
 * stärkste Allianz des Servers stellt.
 */
export default async function StellungPage() {
  await requireUser();
  const t = await getTranslations("stellung");
  const f = await getFormatter();

  const kader = await prisma.player.findMany({ where: KADER, select: { name: true } });
  const stellung = await getServerstellung(SERVER, TAG, kader.map((p) => p.name));

  if (!stellung || stellung.allianzen.length === 0) {
    return (
      <div className="max-w-[900px] mx-auto space-y-5">
      <header>
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{t("kicker")}</p>
        <h1 className="text-3xl text-sand">{t("heading")}</h1>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      </header>
        <p className="panel p-8 text-center text-sm text-muted">{t("unavailable")}</p>
      </div>
    );
  }

  const spitzenwert = stellung.allianzen[0]?.wert || 1;
  const eigene = stellung.platz !== null ? stellung.allianzen[stellung.platz - 1] : null;

  return (
    <div className="max-w-[900px] mx-auto space-y-5">
      <header>
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{t("kicker")}</p>
        <h1 className="text-3xl text-sand">{t("heading")}</h1>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      </header>

      {/* Die eine Zahl, um die es geht. */}
      {stellung.platz !== null && (
        <section className="panel p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="font-display text-5xl leading-none text-sand">
                {t("rankValue", { rank: stellung.platz })}
              </div>
              <p className="mt-1 text-sm text-muted">
                {t("rankLine", { count: stellung.allianzen.length, server: SERVER })}
              </p>
            </div>
            {stellung.abstand !== null && (
              <div className="text-right">
                <div
                  className={`font-display text-3xl leading-none ${
                    stellung.abstand >= 0 ? "text-ok" : "text-danger"
                  }`}
                >
                  {stellung.abstand >= 0 ? "+" : ""}
                  {stellung.abstand.toFixed(0)} %
                </div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
                  {stellung.abstand >= 0 ? t("leadOver") : t("behind")}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Alle Allianzen des Servers, mit Balken statt nackter Zahlen. */}
      <section className="panel">
        <div className="panel-head">
          <h2 className="text-lg">{t("tableHeading")}</h2>
          {stellung.mitglieder.anzahl !== null && (
            <span className="tag">
              {t("members", {
                count: stellung.mitglieder.anzahl,
                max: stellung.mitglieder.maximum ?? 100,
              })}
            </span>
          )}
        </div>
        <ul className="divide-y divide-line/50">
          {stellung.allianzen.map((a, i) => {
            const eigen = a.tag?.toLowerCase() === TAG.toLowerCase();
            return (
              <li key={a.id || a.name} className={`px-3 py-2 ${eigen ? "bg-sand/10" : ""}`}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs text-muted">{i + 1}.</span>{" "}
                    <span className={eigen ? "text-sand" : ""}>{a.name}</span>
                    {a.tag && <span className="ml-1.5 font-mono text-[11px] text-muted">[{a.tag}]</span>}
                  </span>
                  <span className="shrink-0 font-mono text-xs">
                    {(a.wert / 1e9).toFixed(1)} {t("billion")}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-sm bg-panel-2">
                  <div
                    className={`h-full rounded-sm ${eigen ? "bg-sand" : "bg-line"}`}
                    style={{ width: `${Math.max(2, (a.wert / spitzenwert) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Wie viel der Serverspitze uns gehört. */}
      {stellung.spitze.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="text-lg">{t("topHeading")}</h2>
            <p className="text-xs text-muted">{t("topHint")}</p>
          </div>
          <div className="grid gap-3 p-3 sm:grid-cols-3">
            {stellung.spitze.map((s) => (
              <div key={s.titel} className="rounded border border-line p-3">
                <div className="font-display text-2xl text-sand">
                  {s.unsere}
                  <span className="text-base text-muted"> / {s.von}</span>
                </div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted">{s.titel}</div>
                {s.namen.length > 0 && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                    {s.namen.join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Verlauf: wächst der Vorsprung oder schmilzt er? */}
      {stellung.kennzahlen.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="text-lg">{t("trendHeading")}</h2>
          </div>
          <div className="grid gap-4 p-3 sm:grid-cols-2">
            {stellung.kennzahlen
              .filter((k) => k.points.length > 1)
              .map((k) => (
                <div key={k.title}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
                      {k.title}
                    </span>
                    {k.growth4w !== null && (
                      <span
                        className={`font-mono text-xs ${k.growth4w >= 0 ? "text-ok" : "text-danger"}`}
                      >
                        {k.growth4w >= 0 ? "+" : ""}
                        {k.growth4w.toFixed(1)} %
                      </span>
                    )}
                  </div>
                  <Kurve punkte={k.points.map((p) => p.value)} />
                  <div className="flex justify-between text-[11px] text-muted">
                    <span>{k.points[0].week_start}</span>
                    <span className="font-mono text-ink">
                      {k.currentValue === null ? "—" : f.number(k.currentValue)}
                    </span>
                  </div>
                  {k.serverRank !== null && (
                    <p className="text-[11px] text-muted">
                      {t("serverRank", { rank: k.serverRank })}
                    </p>
                  )}
                </div>
              ))}
          </div>
        </section>
      )}

      {stellung.stand && (
        <p className="text-[11px] text-muted">
          {t("asOf", {
            date: f.dateTime(new Date(stellung.stand), {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            }),
          })}
        </p>
      )}
    </div>
  );
}

/** Wochenverlauf als Linie – gleiche Machart wie auf dem Spielerprofil. */
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
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        className="text-sand"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
