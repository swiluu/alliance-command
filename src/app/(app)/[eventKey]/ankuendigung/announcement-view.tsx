"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { LineupImage, type ImageTeam } from "./lineup-image";

/**
 * Fertiger Text zum Kopieren in Chat oder Discord. Der Inhalt wird aus der
 * laufenden Woche abgeleitet und ändert sich mit jeder Team-Zuteilung – hier
 * gibt es nichts zu bearbeiten.
 */
export function AnnouncementView({
  text,
  week,
  sittingOut,
  banned,
  teams,
  eventName,
  eventKey,
}: {
  text: string;
  week: number;
  sittingOut: number;
  banned: number;
  teams: ImageTeam[];
  eventName: string;
  eventKey: string;
}) {
  const t = useTranslations("announcement");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ohne Clipboard-Rechte (z.B. http auf dem Handy) bleibt Auswählen übrig.
      const el = document.getElementById("announcement-text");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="panel max-w-2xl">
        <div className="panel-head flex-wrap">
          <div>
            <h2 className="text-lg">{t("heading")}</h2>
            <p className="text-xs text-muted font-mono">
              {t("subline", { week, sittingOut, banned })}
            </p>
          </div>
          <button type="button" className="btn btn-primary text-xs" onClick={copy}>
            {copied ? t("copied") : t("copy")}
          </button>
        </div>

        <pre
          id="announcement-text"
          className="p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words select-all"
        >
          {text}
        </pre>
      </div>

      <p className="max-w-2xl text-xs text-muted">
        {t("explain")}
        <br />
        {t("germanNote")}
      </p>

      <div>
        <h2 className="text-lg mb-1">{t("imageHeading")}</h2>
        <p className="text-xs text-muted mb-3">{t("imageHint")}</p>
        <div className="grid gap-4 xl:grid-cols-2">
          {teams.map((t) => (
            <LineupImage
              key={t.team}
              team={t}
              eventName={eventName}
              eventKey={eventKey}
              week={week}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
