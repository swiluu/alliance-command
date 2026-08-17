"use client";

import { useTranslations } from "next-intl";

import { VsTopImage, type VsTopRow } from "./vs-top-image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ActionScope, useAction } from "@/components/action";
import { shiftWeek, weeksInIsoYear, type Week } from "@/lib/iso-week";
import { ANNOUNCEMENT_KEYS, type ZugAnnouncement } from "@/lib/zug-announcement-types";
import { setAnnouncementText } from "@/server/actions/zug-actions";

/**
 * Fertige Zugliste zum Kopieren. Der Text entsteht aus dem KW-Plan; angezeigt
 * wird der geplante Zugführer je Tag mit seinem Kurznamen.
 */
export function ZugAnnouncementView({
  announcement,
  currentWeek,
  canEdit,
  vsTop,
  vsFenster,
  vipSlots,
}: {
  announcement: ZugAnnouncement;
  currentWeek: Week;
  canEdit: boolean;
  /** VS-Rangliste für diese Woche – als Bild neben dem Fahrplan. */
  vsTop: VsTopRow[];
  vsFenster: string;
  vipSlots: number;
}) {
  const router = useRouter();
  const { week, range, rows, offen } = announcement;

  // Die Textbausteine wirken sofort auf die Vorschau, gespeichert wird im
  // Hintergrund – sonst müsste man nach jedem Buchstaben warten.
  const [texts, setTexts] = useState(announcement.texts);
  const t = useTranslations("zug");
  const ta = useTranslations("announcement");
  const [copied, setCopied] = useState(false);

  useEffect(() => setTexts(announcement.texts), [announcement]);

  const text = useMemo(
    () =>
      [
        texts.greeting,
        "",
        texts.intro,
        "",
        `Zugliste ${range}`,
        "",
        ...rows.map((r) => {
          const fahrer = r.driver?.name ?? "offen";
          return r.vip
            ? `${r.weekday}: ${fahrer}-VIP ${r.vip.name}`
            : `${r.weekday}: ${fahrer}`;
        }),
        "",
        texts.signature,
      ].join("\n"),
    [texts, rows, range],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ohne Clipboard-Rechte (http auf dem Handy) bleibt Markieren übrig.
      const el = document.getElementById("zug-announcement-text");
      if (!el) return;
      const auswahl = document.createRange();
      auswahl.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(auswahl);
    }
  }

  return (
    <ActionScope>
      <div className="space-y-5">
        {/* Nebeneinander, sobald der Platz reicht: der Text wird kopiert, das
            Bild heruntergeladen – beides gehört in denselben Handgriff. Unter
            der Schwelle stapeln sie sich, sonst wäre keines mehr lesbar. */}
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="panel">
          <div className="panel-head flex-wrap gap-2">
            <div>
              <h2 className="text-lg">{t("listHeading")}</h2>
              <p className="text-xs text-muted font-mono">
                {t("listSubline", { kw: week.kw, year: week.year, range })}
                {offen > 0 && t("openDays", { count: offen })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="kw-ank">
                {t("chooseWeek")}
              </label>
              <select
                id="kw-ank"
                className="input w-24 py-2.5 text-base sm:py-1 sm:text-sm"
                value={week.kw}
                onChange={(e) =>
                  router.push(
                    `/zug/ankuendigung?jahr=${week.year}&kw=${e.target.value}`,
                  )
                }
              >
                {Array.from(
                  { length: weeksInIsoYear(week.year) },
                  (_, i) => i + 1,
                ).map((w) => (
                  <option key={w} value={w}>
                    {t("weekShort", { kw: w })}
                    {w === currentWeek.kw && week.year === currentWeek.year
                      ? t("currentSuffix")
                      : ""}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-primary text-xs" onClick={copy}>
                {copied ? ta("copied") : ta("copy")}
              </button>
            </div>
          </div>

          <pre
            id="zug-announcement-text"
            className="p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words select-all"
          >
            {text}
          </pre>

            {offen > 0 && (
              <p className="m-3 mt-0 rounded border border-sand-dim/60 bg-sand/10 px-3 py-2 text-xs text-sand">
                {t("openHint", { count: offen })}
              </p>
            )}
          </div>

          {/* Die Rangliste gehört zum Aushang: sie begründet, warum gerade
              diese sieben VIP fahren. Sonst müsste man dafür die Auswertung
              aufrufen. */}
          <VsTopImage
            rows={vsTop}
            fenster={vsFenster}
            vipSlots={vipSlots}
            week={week.kw}
          />
        </div>

        {canEdit && (
          <div className="panel max-w-2xl">
            <div className="panel-head">
              <div>
                <h2 className="text-lg">{t("blocksHeading")}</h2>
                <p className="text-xs text-muted">{t("blocksHint")}</p>
              </div>
            </div>
            <div className="p-3 space-y-3">
              <TextRow
                label={t("greeting")}
                settingKey={ANNOUNCEMENT_KEYS.greeting}
                value={texts.greeting}
                onChange={(v) => setTexts((t) => ({ ...t, greeting: v }))}
              />
              <TextRow
                label={t("intro")}
                settingKey={ANNOUNCEMENT_KEYS.intro}
                value={texts.intro}
                onChange={(v) => setTexts((t) => ({ ...t, intro: v }))}
              />
              <TextRow
                label={t("signature")}
                settingKey={ANNOUNCEMENT_KEYS.signature}
                value={texts.signature}
                onChange={(v) => setTexts((t) => ({ ...t, signature: v }))}
              />
            </div>
          </div>
        )}
      </div>
    </ActionScope>
  );
}

function TextRow({
  label,
  settingKey,
  value,
  onChange,
}: {
  label: string;
  settingKey: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { run } = useAction();

  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1">{label}</span>
      <input
        className="input py-2.5 text-base sm:py-1.5 sm:text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => run(() => setAnnouncementText(settingKey, e.target.value))}
      />
    </label>
  );
}
