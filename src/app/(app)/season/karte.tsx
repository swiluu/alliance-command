"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { rahmen, type Gebiet } from "@/lib/season-map";
import { loescheZuteilung, seasonStand, setzeZuteilung } from "@/server/actions/season-actions";

/**
 * Die Season-Karte als anklickbares Raster.
 *
 * Gezeichnet, nicht abfotografiert: jedes Gebiet ist ein Rechteck aus den
 * Season-Daten. Das bleibt beim Zoomen scharf, jedes Feld ist anklickbar, und
 * die Erträge lassen sich zusammenzählen, statt sie zu schätzen.
 *
 * SVG und nicht Canvas, weil ein Gebiet ein Element ist: Klick, Tastatur und
 * Titel bekommt man geschenkt, statt Trefferflächen selbst auszurechnen.
 */

export type Zuteilung = {
  territoryId: string;
  seite: string;
  tag: string | null;
  playerId: string | null;
  schritt: number | null;
  notiz: string | null;
};

/** Farben der Seiten. Zurückhaltend – die Karte soll lesbar bleiben. */
const SEITENFARBE: Record<string, string> = {
  OWN: "#4ea36b",
  ALLY: "#3f7fb5",
  ENEMY: "#b5503f",
};

/** Grundfarbe je Gebietstyp: je seltener der Typ, desto heller. */
function typFarben(gebiete: Gebiet[]) {
  const zahl = new Map<string, number>();
  for (const g of gebiete) zahl.set(g.name, (zahl.get(g.name) ?? 0) + 1);
  const nachHaeufigkeit = [...zahl.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const palette = [
    "#4a3a2a", "#5c4632", "#6d523a", "#7d5f45", "#8a6b50",
    "#96775c", "#a28468", "#ad9175", "#b89e82", "#c3ab90", "#cdb89e",
  ];
  const farben = new Map<string, string>();
  nachHaeufigkeit.forEach((n, i) => farben.set(n, palette[Math.min(palette.length - 1, i)]));
  return farben;
}

export function SeasonKarte({
  seasonKey,
  gebiete,
  einheit,
  ausdehnung,
  zuteilungen: anfang,
  spieler,
  darfBearbeiten,
}: {
  seasonKey: string;
  gebiete: Gebiet[];
  einheit: number;
  ausdehnung: { breite: number; hoehe: number };
  zuteilungen: Zuteilung[];
  spieler: { id: string; name: string }[];
  darfBearbeiten: boolean;
}) {
  const t = useTranslations("season");
  const router = useRouter();
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);

  const farben = useMemo(() => typFarben(gebiete), [gebiete]);
  const proGebiet = useMemo(
    () => new Map(anfang.map((z) => [z.territoryId, z])),
    [anfang],
  );

  // ── Abgleich mit den anderen Planern ────────────────────────────────────
  const stand = useRef<string | null>(null);
  const offen = useRef<boolean>(false);
  offen.current = gewaehlt !== null;
  useEffect(() => {
    let gestoppt = false;
    let zeitgeber: ReturnType<typeof setTimeout>;
    const runde = async () => {
      // Nicht abgleichen, solange jemand ein Feld offen hat: der Kasten würde
      // unter den Händen wegspringen.
      if (!gestoppt && !offen.current && document.visibilityState === "visible") {
        try {
          const neu = await seasonStand(seasonKey);
          if (!gestoppt) {
            if (stand.current === null) stand.current = neu;
            else if (neu !== stand.current) {
              stand.current = neu;
              router.refresh();
            }
          }
        } catch {
          /* Ein misslungener Abruf ist kein Fehler wert – der nächste kommt. */
        }
      }
      if (!gestoppt) zeitgeber = setTimeout(runde, 5000);
    };
    void runde();
    return () => {
      gestoppt = true;
      clearTimeout(zeitgeber);
    };
  }, [seasonKey, router]);

  const aktiv = gewaehlt ? gebiete.find((g) => g.id === gewaehlt) ?? null : null;
  const aktivZ = gewaehlt ? proGebiet.get(gewaehlt) ?? null : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="card overflow-auto p-2">
        <svg
          viewBox={"0 0 " + ausdehnung.breite + " " + ausdehnung.hoehe}
          className="h-auto w-full min-w-[520px]"
          role="img"
          aria-label={t("heading")}
        >
          {gebiete.map((g) => {
            const z = proGebiet.get(g.id);
            const r = rahmen(g);
            const c = g.coordinates;
            const fuellung = z ? SEITENFARBE[z.seite] ?? SEITENFARBE.OWN : farben.get(g.name);
            const gewaehltJetzt = g.id === gewaehlt;
            const strich = gewaehltJetzt ? einheit / 3 : einheit / 8;
            const gemein = {
              fill: fuellung,
              fillOpacity: z ? 0.9 : 1,
              stroke: gewaehltJetzt ? "#f0e6d8" : "#1b1713",
              strokeWidth: strich,
              className: darfBearbeiten ? "cursor-pointer" : undefined,
              onClick: () => setGewaehlt(gewaehltJetzt ? null : g.id),
            };
            const titel = (
              <title>
                {g.name + " · " + t("stufe", { n: g.level }) + (z?.tag ? " · " + z.tag : "")}
              </title>
            );
            // Beschriftung nur, wo Platz ist – sonst überlagert sie das Feld.
            const platz = Math.min(r.breite, r.hoehe);
            const zeigeText = platz >= einheit * 2 || g.isCapitol || z?.schritt != null;
            return (
              <g key={g.id}>
                {c.points ? (
                  <polygon points={c.points.map((pt) => pt.join(",")).join(" ")} {...gemein}>
                    {titel}
                  </polygon>
                ) : (
                  <rect x={c.x} y={c.y} width={c.width} height={c.height} {...gemein}>
                    {titel}
                  </rect>
                )}
                {zeigeText && (
                  <text
                    x={r.x + r.breite / 2}
                    y={r.y + r.hoehe / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={platz / 2.4}
                    fill="#f7f2ea"
                    pointerEvents="none"
                  >
                    {z?.schritt ?? g.level}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="card p-3">
        {!aktiv ? (
          <p className="text-xs text-muted">
            {darfBearbeiten ? t("keineZuteilung") : t("nurLesen")}
          </p>
        ) : (
          <Kasten
            key={aktiv.id}
            seasonKey={seasonKey}
            gebiet={aktiv}
            zuteilung={aktivZ}
            spieler={spieler}
            darfBearbeiten={darfBearbeiten}
            fertig={() => {
              setGewaehlt(null);
              router.refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}

function Kasten({
  seasonKey,
  gebiet,
  zuteilung,
  spieler,
  darfBearbeiten,
  fertig,
}: {
  seasonKey: string;
  gebiet: Gebiet;
  zuteilung: Zuteilung | null;
  spieler: { id: string; name: string }[];
  darfBearbeiten: boolean;
  fertig: () => void;
}) {
  const t = useTranslations("season");
  const [seite, setSeite] = useState(zuteilung?.seite ?? "OWN");
  const [tag, setTag] = useState(zuteilung?.tag ?? "");
  const [playerId, setPlayerId] = useState(zuteilung?.playerId ?? "");
  const [schritt, setSchritt] = useState(zuteilung?.schritt?.toString() ?? "");
  const [notiz, setNotiz] = useState(zuteilung?.notiz ?? "");
  const [laeuft, setLaeuft] = useState(false);

  const speichern = async () => {
    setLaeuft(true);
    await setzeZuteilung({
      seasonKey,
      territoryId: gebiet.id,
      seite,
      tag,
      playerId: playerId || null,
      schritt: schritt ? Number(schritt) : null,
      notiz,
    });
    setLaeuft(false);
    fertig();
  };

  const entfernen = async () => {
    setLaeuft(true);
    await loescheZuteilung(seasonKey, gebiet.id);
    setLaeuft(false);
    fertig();
  };

  const ertraege = Object.entries(gebiet.resources ?? {}).filter(([, v]) => v > 0);

  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="font-display text-base text-sand">{gebiet.name}</div>
        <div className="text-muted">
          {t("stufe", { n: gebiet.level }) + (gebiet.isCapitol ? " · " + t("capitol") : "")}
        </div>
      </div>

      {gebiet.buff && (
        <div className="tag">
          {t("buff", { item: gebiet.buff.item, prozent: gebiet.buff.percentage })}
        </div>
      )}

      {ertraege.length > 0 && (
        <ul className="text-muted">
          {ertraege.map(([k, v]) => (
            <li key={k}>{k + ": " + v.toLocaleString("de-CH")}</li>
          ))}
        </ul>
      )}

      {!darfBearbeiten ? (
        <p className="text-muted">{t("nurLesen")}</p>
      ) : (
        <div className="space-y-2 border-t border-line pt-2">
          <div className="flex gap-1">
            {(["OWN", "ALLY", "ENEMY"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={"btn flex-1 px-1 py-1 " + (seite === s ? "border-sand text-sand" : "")}
                onClick={() => setSeite(s)}
              >
                {t(`seite.${s}`)}
              </button>
            ))}
          </div>

          {seite !== "OWN" && (
            <input
              className="input w-full"
              placeholder={t("tag")}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              maxLength={8}
            />
          )}

          <select
            className="input w-full"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
          >
            <option value="">{t("keinSpieler")}</option>
            {spieler.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <input
            className="input w-full"
            type="number"
            min={1}
            placeholder={t("schritt")}
            value={schritt}
            onChange={(e) => setSchritt(e.target.value)}
          />

          <input
            className="input w-full"
            placeholder={t("notiz")}
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            maxLength={120}
          />

          <div className="flex gap-1">
            <button type="button" className="btn flex-1" disabled={laeuft} onClick={speichern}>
              {t("zuteilen")}
            </button>
            {zuteilung && (
              <button type="button" className="btn" disabled={laeuft} onClick={entfernen}>
                ×
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
