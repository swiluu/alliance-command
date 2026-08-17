"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

export type VsTopRow = {
  rank: number;
  name: string;
  /** Vier-Wochen-Schnitt, bereits gerundet. */
  average: number;
  /** 1–7 für die VIP-Plätze, sonst null. */
  vipRank: number | null;
  isR4: boolean;
};

/**
 * Bild der VS-Rangliste für den Zug-Aushang.
 *
 * Die sieben VIP-Plätze werden aus dem Vier-Wochen-Schnitt bestimmt, und wer
 * sie hat, fährt VIP. Bisher stand im Aushang nur der Fahrplan – wer wissen
 * wollte, warum gerade diese sieben, musste die Auswertung aufrufen. Mit dem
 * Bild steht die Begründung daneben.
 *
 * Gezeichnet mit denselben Massen, Farben und Schriften wie die
 * Aufstellungsbilder der Events: die Aushänge sollen erkennbar zusammen-
 * gehören.
 */

const W = 1080;
const PAD = 40;
const HEAD_H = 236;
const ROW_H = 52;
const FOOT_H = 70;

const C = {
  bg: "#0B0F0D",
  card: "#161C15",
  cardAlt: "#1B211A",
  line: "#2E3A2A",
  sand: "#C9A24B",
  ink: "#F2F4EF",
  muted: "#9AA396",
  ok: "#7FA86A",
};

const FONT_DISPLAY = '"Rajdhani", system-ui, sans-serif';
const FONT_BODY = '"IBM Plex Sans", system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';

/** "152396181" → "152 396 181" – wie in der Erfassung, in beiden Sprachen gleich. */
const gruppiert = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s + "…";
}

export function draw(
  canvas: HTMLCanvasElement,
  rows: VsTopRow[],
  fenster: string,
  vipSlots: number,
) {
  const H = HEAD_H + rows.length * ROW_H + FOOT_H;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.textBaseline = "middle";
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = C.sand;
  ctx.fillRect(0, 0, W, 6);

  // ── Kopf ──────────────────────────────────────────────────
  ctx.font = `600 34px ${FONT_BODY}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = "left";
  ctx.fillText("VS-AUSWERTUNG", PAD, PAD + 34);

  ctx.font = `700 84px ${FONT_DISPLAY}`;
  ctx.fillStyle = C.sand;
  ctx.fillText(`TOP ${rows.length}`, PAD, PAD + 104);

  ctx.font = `400 27px ${FONT_BODY}`;
  ctx.fillStyle = C.muted;
  ctx.fillText("Vier-Wochen-Schnitt / Four-week average", PAD, PAD + 158);

  ctx.font = `500 34px ${FONT_MONO}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = "right";
  ctx.fillText(fenster, W - PAD, PAD + 104);

  // ── Zeilen ────────────────────────────────────────────────
  let y = HEAD_H;
  for (const [i, r] of rows.entries()) {
    const vip = r.vipRank !== null;

    ctx.fillStyle = vip ? C.cardAlt : i % 2 === 0 ? C.card : C.bg;
    ctx.fillRect(PAD, y, W - PAD * 2, ROW_H);

    // Die VIP-Plätze bekommen einen Balken an der Kante – das trägt auch,
    // wenn das Bild in einem Chat klein dargestellt wird.
    if (vip) {
      ctx.fillStyle = C.sand;
      ctx.fillRect(PAD, y, 6, ROW_H);
    }

    const mitte = y + ROW_H / 2;

    ctx.font = `500 28px ${FONT_MONO}`;
    ctx.fillStyle = vip ? C.sand : C.muted;
    ctx.textAlign = "right";
    ctx.fillText(String(r.rank), PAD + 62, mitte);

    ctx.font = `${vip ? 600 : 400} 30px ${FONT_BODY}`;
    ctx.fillStyle = vip ? C.ink : C.muted;
    ctx.textAlign = "left";
    ctx.fillText(fit(ctx, r.name, 480), PAD + 86, mitte);

    // R4 fahren nicht als VIP – das steht dabei, sonst wirkt die Liste falsch.
    if (r.isR4) {
      ctx.font = `500 22px ${FONT_MONO}`;
      ctx.fillStyle = C.muted;
      ctx.fillText("R4", PAD + 600, mitte);
    } else if (vip) {
      ctx.font = `600 24px ${FONT_MONO}`;
      ctx.fillStyle = C.sand;
      ctx.fillText(`VIP ${r.vipRank}`, PAD + 600, mitte);
    }

    ctx.font = `500 30px ${FONT_MONO}`;
    ctx.fillStyle = vip ? C.ink : C.muted;
    ctx.textAlign = "right";
    ctx.fillText(gruppiert(r.average), W - PAD - 16, mitte);

    y += ROW_H;
  }

  // ── Fuss ──────────────────────────────────────────────────
  ctx.fillStyle = C.line;
  ctx.fillRect(PAD, y + 8, W - PAD * 2, 2);

  ctx.font = `400 26px ${FONT_BODY}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = "left";
  ctx.fillText(
    `Die ersten ${vipSlots} ohne R4 fahren VIP / Top ${vipSlots} excluding R4 ride VIP`,
    PAD,
    y + 44,
  );
}

export function VsTopImage({
  rows,
  fenster,
  vipSlots,
  week,
}: {
  rows: VsTopRow[];
  fenster: string;
  vipSlots: number;
  week: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const t = useTranslations("announcement");
  const tz = useTranslations("zug");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        // Erst zeichnen, wenn die Schriften stehen – sonst weicht das Bild
        // von der Anwendung ab.
        await document.fonts.ready;
      } catch {
        /* ältere Browser: direkt zeichnen */
      }
      if (cancelled || !canvasRef.current) return;
      draw(canvasRef.current, rows, fenster, vipSlots);
      setReady(true);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [rows, fenster, vipSlots]);

  const download = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vs-top${rows.length}-kw${week}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [rows.length, week]);

  if (rows.length === 0) return null;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3 className="text-base">
            <span className="text-sand">{tz("vsTopHeading", { count: rows.length })}</span>
            <span className="ml-2 font-mono text-xs text-muted">{fenster}</span>
          </h3>
          <p className="text-xs text-muted">{t("imageWidth")}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary text-xs"
          onClick={download}
          disabled={!ready}
        >
          ⬇ PNG
        </button>
      </div>
      <div className="p-3">
        <canvas ref={canvasRef} className="w-full rounded border border-line" />
      </div>
    </div>
  );
}
