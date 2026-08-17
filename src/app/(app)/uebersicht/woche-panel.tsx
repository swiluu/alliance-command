import { getTranslations } from "next-intl/server";
import Link from "next/link";

import type { Auszeichnung } from "@/server/woche-der-allianz";

/**
 * Drei Namen für die Woche, auf der Übersicht.
 *
 * Sichtbar für alle, nicht nur für die Leitung: das ist der Punkt. Alles
 * andere im Dashboard beantwortet, was zu tun ist – das hier beantwortet, wer
 * es getan hat.
 *
 * Rechnet sich aus vorhandenen Daten, niemand pflegt etwas. Gibt es einmal
 * nichts zu zeigen, verschwindet der Abschnitt, statt leer dazustehen.
 */
const SYMBOL: Record<Auszeichnung["art"], string> = {
  vs: "🏅",
  wachstum: "📈",
  kaempfe: "⚔️",
};

export async function WochePanel({ zeilen }: { zeilen: Auszeichnung[] }) {
  const t = await getTranslations("woche");
  if (zeilen.length === 0) return null;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="text-lg">
            <span aria-hidden className="mr-1">
              ⭐
            </span>
            {t("heading")}
          </h2>
          <p className="text-xs text-muted">{t("hint")}</p>
        </div>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-3">
        {zeilen.map((z) => (
          <div key={z.art} className="rounded border border-line p-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted">
              <span aria-hidden className="mr-1">
                {SYMBOL[z.art]}
              </span>
              {t(`art.${z.art}`)}
            </div>
            <div className="mt-1 truncate text-lg text-sand" title={z.name}>
              {z.name}
            </div>
            <div className="font-mono text-xl">{z.wert}</div>
            {/* Was hier womit verglichen wird – ohne diesen Satz sind
                "Zuwachs" und "Steigerung" nicht auseinanderzuhalten. */}
            {/* Der Satz entsteht erst hier, damit er in beiden Sprachen
                stimmt – im Dienst wäre er auf Deutsch festgeschrieben. */}
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              {z.art === "vs"
                ? t("explainVs", { woche: z.werte.woche ?? 0 })
                : t(z.art === "wachstum" ? "explainPower" : "explainKills", {
                    vorher: z.werte.vorher ?? "",
                    nachher: z.werte.nachher ?? "",
                    prozent: z.werte.prozent ?? 0,
                  })}
            </p>
          </div>
        ))}
      </div>

      <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
        {t.rich("source", {
          vs: (c) => (
            <Link href="/vs" className="underline decoration-line decoration-dotted underline-offset-2 hover:text-sand">
              {c}
            </Link>
          ),
          stellung: (c) => (
            <Link href="/serverstellung" className="underline decoration-line decoration-dotted underline-offset-2 hover:text-sand">
              {c}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}
