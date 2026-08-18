import { getTranslations } from "next-intl/server";

import { ALLIANZ_TAG } from "@/lib/allianz";
import { requireAccess } from "@/lib/access";
import { KADER, prisma } from "@/lib/db";
import {
  AKTIVE_SEASON,
  istSeasonKey,
  ladeSeason,
  SEASON_KEYS,
  type SeasonKey,
} from "@/lib/season-map";

import { SeasonKarte } from "./karte";
import { SeasonWahl } from "./season-wahl";

export async function generateMetadata() {
  const t = await getTranslations("season");
  return { title: `${t("heading")} · ${ALLIANZ_TAG} Command` };
}

/**
 * Season-Planung auf der Karte.
 *
 * Die Karte kommt als Datei (`src/data/seasons/`), die Planung aus der
 * Datenbank. Welche Season läuft, steht in den Einstellungen – die nächste
 * beginnt, ohne dass jemand Code anfasst.
 */
export default async function SeasonPage() {
  const { level } = await requireAccess("season", "READ");
  const t = await getTranslations("season");

  const einstellung = await prisma.appSetting.findUnique({ where: { key: AKTIVE_SEASON } });
  const seasonKey: SeasonKey =
    einstellung && istSeasonKey(einstellung.value) ? einstellung.value : "3";

  const [karte, zuteilungen, spieler] = await Promise.all([
    ladeSeason(seasonKey),
    prisma.seasonClaim.findMany({
      where: { seasonKey },
      select: {
        territoryId: true,
        seite: true,
        tag: true,
        playerId: true,
        schritt: true,
        notiz: true,
      },
    }),
    prisma.player.findMany({ where: KADER, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // ── Bilanz ───────────────────────────────────────────────────────────────
  // Was die geplanten Gebiete zusammen einbringen. Die Ressourcennamen
  // wechseln je Season, deshalb wird gezählt, was da ist, statt feste Felder
  // zu erwarten.
  const nachId = new Map(karte.gebiete.map((g) => [g.id, g]));
  const bilanz = new Map<
    string,
    { gebiete: number; typen: Map<string, number>; ertrag: Map<string, number> }
  >();
  for (const z of zuteilungen) {
    const g = nachId.get(z.territoryId);
    if (!g) continue;
    // z.seite kommt aus der Datenbank und ist dort eine Zeichenkette; die
    // Textbausteine wollen einen der drei bekannten Namen.
    const seite = z.seite === "ALLY" || z.seite === "ENEMY" ? z.seite : "OWN";
    const name = seite === "OWN" ? ALLIANZ_TAG : z.tag || t(`seite.${seite}`);
    const eintrag = bilanz.get(name) ?? { gebiete: 0, typen: new Map(), ertrag: new Map() };
    eintrag.gebiete += 1;
    // Nach Typ zählen und nicht nach Fläche: die Grenzen der Season lauten
    // "vier Städte, zehn Strongholds", nicht "so und so viele Rasterfelder".
    eintrag.typen.set(g.name, (eintrag.typen.get(g.name) ?? 0) + 1);
    for (const [k, v] of Object.entries(g.resources ?? {})) {
      if (v > 0) eintrag.ertrag.set(k, (eintrag.ertrag.get(k) ?? 0) + v);
    }
    bilanz.set(name, eintrag);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">{t("kicker", { season: seasonKey })}</div>
          <h1 className="font-display text-2xl text-sand">{t("heading")}</h1>
          <p className="text-xs text-muted">{t("intro")}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>
            {t("gebiete", { n: karte.gebiete.length })}
          </span>
          {level === "EDIT" && (
            <SeasonWahl aktuell={seasonKey} keys={[...SEASON_KEYS]} />
          )}
        </div>
      </header>

      {bilanz.size > 0 && (
        <section className="card p-3">
          <div className="kicker mb-2">{t("bilanz")}</div>
          <div className="flex flex-wrap gap-4 text-xs">
            {[...bilanz.entries()]
              .sort((a, b) => b[1].gebiete - a[1].gebiete)
              .map(([name, w]) => (
                <div key={name}>
                  <div className="font-display text-sand">{name}</div>
                  <div className="text-muted">{t("gebiete", { n: w.gebiete })}</div>
                  {[...w.typen.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([typ, n]) => (
                      <div key={typ} className="text-muted">
                        {n + "× " + typ}
                      </div>
                    ))}
                  {[...w.ertrag.entries()].map(([k, v]) => (
                    <div key={k} className="font-mono text-muted">
                      {k}: {v.toLocaleString("de-CH")}
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </section>
      )}

      <SeasonKarte
        seasonKey={seasonKey}
        gebiete={karte.gebiete}
        einheit={karte.einheit}
        ausdehnung={karte.ausdehnung}
        zuteilungen={zuteilungen}
        spieler={spieler}
        darfBearbeiten={level === "EDIT"}
      />
    </div>
  );
}
