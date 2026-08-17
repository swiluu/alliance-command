"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { ALLIANZ_ZEILE } from "@/lib/allianz";

export type ImageSlot = {
  name: string | null;
  thp: string | null;
  hunter: boolean;
  /** Nur Ersatzbank: wen dieser Spieler ablöst (Raus↔Rein). */
  replaces?: string | null;
};
export type ImageGroup = {
  label: string;
  /** Englische Bezeichnung wie im Original-Sheet ("Jäger / Hunter"). */
  labelEn: string | null;
  icon: string;
  unlockLabel: string | null;
  requiredHunters: number;
  isSubstitute: boolean;
  /** Eigene Zeile über die volle Breite, Slots zweispaltig. */
  fullWidth: boolean;
  slots: ImageSlot[];
};
export type ImageTeam = {
  team: "A" | "B";
  groups: ImageGroup[];
  filled: number;
  total: number;
  /** Wird die Jäger-Markierung im Event gepflegt? Steuert Warnfarbe und Legende. */
  hunterTracking: boolean;
};

// ── Bildmasse ───────────────────────────────────────────────
// Feste Breite von 1080px: das ist auf jedem Handy scharf und passt in die
// Bildgrösse, die Last War für Ankündigungen akzeptiert.
const W = 1080;
const PAD = 40;
const GAP = 16;
const HEAD_H = 236;
const CARD_HEAD = 52;
// Karten mit Freischaltzeit oder Jäger-Pflicht bekommen eine zweite Kopfzeile,
// damit der Positionsname nie abgeschnitten wird.
const CARD_HEAD_BADGE = 88;
const ROW_H = 46;
const CARD_PAD = 14;
// Zusätzliche Kopfzeile über der Ersatzbank für "Raus / Out" und "Rein / In".
const SUB_HEADER = 64;
const FOOT_H = 56;

const C = {
  bg: "#0B0F0D",
  card: "#161C15",
  cardAlt: "#1B211A",
  line: "#2E3A2A",
  sand: "#C9A24B",
  ink: "#F2F4EF",
  muted: "#9AA396",
  ok: "#7FA86A",
  danger: "#D45A42",
};

const FONT_DISPLAY = '"Rajdhani", system-ui, sans-serif';
const FONT_BODY = '"IBM Plex Sans", system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';

function badgeText(g: ImageGroup) {
  return [g.unlockLabel, g.requiredHunters > 0 ? `${g.requiredHunters}× Jäger` : null]
    .filter(Boolean)
    .join(" · ");
}

function headHeight(g: ImageGroup) {
  const base = badgeText(g) ? CARD_HEAD_BADGE : CARD_HEAD;
  return g.isSubstitute ? base + SUB_HEADER : base;
}

/** Volle Breite: eigene Zeile im Raster. */
function isWide(g: ImageGroup) {
  return g.isSubstitute || g.fullWidth;
}

/** Zweispaltige Slots – nur für breite Karten ausser der Ersatzbank. */
function slotColumns(g: ImageGroup) {
  return g.fullWidth && !g.isSubstitute ? 2 : 1;
}

function cardHeight(g: ImageGroup) {
  const rows = Math.ceil(g.slots.length / slotColumns(g));
  return headHeight(g) + rows * ROW_H + CARD_PAD;
}

/** Zeilenweises Layout: Ersatz über die volle Breite, alles andere zweispaltig. */
function layout(groups: ImageGroup[]) {
  const rows: ImageGroup[][] = [];
  let pair: ImageGroup[] = [];

  for (const g of groups) {
    if (isWide(g)) {
      if (pair.length) {
        rows.push(pair);
        pair = [];
      }
      rows.push([g]);
      continue;
    }
    pair.push(g);
    if (pair.length === 2) {
      rows.push(pair);
      pair = [];
    }
  }
  if (pair.length) rows.push(pair);
  return rows;
}

export function totalHeight(groups: ImageGroup[]) {
  const rows = layout(groups);
  const body = rows.reduce(
    (sum, row) => sum + Math.max(...row.map(cardHeight)) + GAP,
    0,
  );
  return PAD + HEAD_H + body + FOOT_H + PAD;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Kleiner Punkt als Jäger-Marke – gezeichnet statt Emoji, damit er überall ankommt. */
function hunterDot(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = C.sand;
  ctx.fill();
}

/** Kürzt zu lange Namen, damit sie nie in die THP-Spalte laufen. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s + "…";
}

export function draw(
  canvas: HTMLCanvasElement,
  team: ImageTeam,
  eventName: string,
  week: number,
) {
  const H = totalHeight(team.groups);
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.textBaseline = "middle";
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // ── Kopf ──────────────────────────────────────────────────
  ctx.fillStyle = C.sand;
  ctx.fillRect(0, 0, W, 6);

  ctx.font = `600 34px ${FONT_BODY}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = "left";
  ctx.fillText(eventName.toUpperCase(), PAD, PAD + 34);

  ctx.font = `700 84px ${FONT_DISPLAY}`;
  ctx.fillStyle = C.sand;
  ctx.fillText(`TEAM ${team.team}`, PAD, PAD + 104);

  ctx.font = `400 27px ${FONT_BODY}`;
  ctx.fillStyle = C.muted;
  ctx.fillText("Taktische Aufstellung / Tactical Lineup", PAD, PAD + 170);

  ctx.font = `500 34px ${FONT_MONO}`;
  ctx.fillStyle = team.filled >= team.total ? C.ok : C.muted;
  ctx.textAlign = "right";
  ctx.fillText(`${team.filled} / ${team.total}`, W - PAD, PAD + 104);

  ctx.font = `400 30px ${FONT_BODY}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(`Woche ${week}`, W - PAD, PAD + 40);

  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, PAD + HEAD_H - 26);
  ctx.lineTo(W - PAD, PAD + HEAD_H - 26);
  ctx.stroke();

  // ── Positionskarten ───────────────────────────────────────
  const rows = layout(team.groups);
  let y = PAD + HEAD_H;

  for (const row of rows) {
    const h = Math.max(...row.map(cardHeight));
    const cols = row.length === 1 && isWide(row[0]) ? 1 : 2;
    const cw = cols === 1 ? W - 2 * PAD : (W - 2 * PAD - GAP) / 2;

    row.forEach((g, i) => {
      const x = PAD + i * (cw + GAP);
      drawCard(ctx, g, x, y, cw, h, team.hunterTracking);
    });

    y += h + GAP;
  }

  // ── Fuss ──────────────────────────────────────────────────
  ctx.font = `400 26px ${FONT_BODY}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = "left";
  ctx.fillText("Allianz " + ALLIANZ_ZEILE, PAD, H - PAD - 10);
  if (team.hunterTracking) {
    ctx.textAlign = "right";
    ctx.fillText("= Jäger-Build", W - PAD, H - PAD - 10);
    hunterDot(ctx, W - PAD - ctx.measureText("= Jäger-Build").width - 14, H - PAD - 10);
  }
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  g: ImageGroup,
  x: number,
  y: number,
  w: number,
  h: number,
  hunterTracking: boolean,
) {
  const hunters = g.slots.filter((s) => s.name && s.hunter).length;
  // Nur warnen, wenn die Jäger-Markierung im Event überhaupt gepflegt wird –
  // sonst wäre jede Karte mit Jäger-Pflicht dauerhaft rot.
  const short = hunterTracking && g.requiredHunters > 0 && hunters < g.requiredHunters;

  ctx.fillStyle = g.isSubstitute ? C.cardAlt : C.card;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = short ? C.danger : C.line;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Kopfzeile der Karte
  ctx.textAlign = "left";
  ctx.font = `600 32px ${FONT_BODY}`;
  ctx.fillStyle = C.ink;
  const badge = badgeText(g);
  ctx.font = `600 32px ${FONT_BODY}`;
  ctx.fillText(g.label, x + 14, y + 30);

  // Englische Bezeichnung dahinter, wie im Original-Sheet ("Jäger / Hunter").
  if (g.labelEn) {
    const labelW = ctx.measureText(g.label).width;
    ctx.font = `400 26px ${FONT_BODY}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(fit(ctx, ` / ${g.labelEn}`, w - 28 - labelW), x + 14 + labelW, y + 30);
    ctx.fillStyle = C.ink;
  }

  if (badge) {
    ctx.font = `500 26px ${FONT_MONO}`;
    ctx.fillStyle = short ? C.danger : C.sand;
    ctx.fillText(badge, x + 14, y + 64);
  }

  // Ersatzbank: Spaltenköpfe, damit unmissverständlich ist, wer weichen muss
  // und wer dafür reinkommt. Genau das führt sonst regelmässig zu Rückfragen.
  if (g.isSubstitute) {
    const headY = y + (badge ? CARD_HEAD_BADGE : CARD_HEAD) + 10;
    const half = (w - 28) / 2;

    ctx.font = `600 26px ${FONT_BODY}`;
    ctx.fillStyle = C.danger;
    ctx.fillText("RAUS / OUT", x + 14, headY);
    ctx.fillStyle = C.ok;
    ctx.fillText("REIN / IN", x + 14 + half + 40, headY);

    ctx.font = `400 22px ${FONT_BODY}`;
    ctx.fillStyle = C.muted;
    ctx.fillText("spielt die ersten 15 Min", x + 14, headY + 26);
    ctx.fillText("kommt nach 15 Min rein", x + 14 + half + 40, headY + 26);
  }

  const headH = headHeight(g);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 14, y + headH - 12);
  ctx.lineTo(x + w - 14, y + headH - 12);
  ctx.stroke();

  // Slots
  const cols = slotColumns(g);
  const COL_GAP = 44;
  const colW = (w - 28 - (cols - 1) * COL_GAP) / cols;

  if (cols === 2) {
    const midX = x + 14 + colW + COL_GAP / 2;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX, y + headH - 4);
    ctx.lineTo(midX, y + h - 8);
    ctx.stroke();
  }

  g.slots.forEach((slot, i) => {
    const col = cols === 2 ? i % 2 : 0;
    const rowIdx = cols === 2 ? Math.floor(i / 2) : i;
    const sx = x + 14 + col * (colW + COL_GAP);
    const sy = y + headH + rowIdx * ROW_H + ROW_H / 2 - 4;

    if (!slot.name) {
      ctx.textAlign = "left";
      ctx.font = `400 30px ${FONT_BODY}`;
      ctx.fillStyle = C.muted;
      ctx.fillText("—", sx, sy);
      return;
    }

    // Ersatzbank zeigt die Rotation "Raus → Rein" statt der THP – das ist die
    // Information, die im Kampf gebraucht wird.
    if (g.isSubstitute) {
      const half = (w - 28) / 2;
      const inX = x + 14 + half + 40;
      ctx.textAlign = "left";

      // Links wer rausgeht, rechts wer reinkommt – immer an derselben Stelle.
      ctx.font = `400 30px ${FONT_BODY}`;
      ctx.fillStyle = slot.replaces ? C.muted : C.line;
      ctx.fillText(fit(ctx, slot.replaces ?? "—", half - 10), sx, sy);

      ctx.font = `400 26px ${FONT_BODY}`;
      ctx.fillStyle = C.sand;
      ctx.fillText("→", x + 14 + half + 4, sy);

      ctx.font = `500 32px ${FONT_BODY}`;
      ctx.fillStyle = C.ink;
      ctx.fillText(fit(ctx, slot.name, x + w - 14 - inX), inX, sy);
      return;
    }

    ctx.textAlign = "right";
    ctx.font = `400 24px ${FONT_MONO}`;
    ctx.fillStyle = C.muted;
    const thp = slot.thp ?? "";
    if (thp) ctx.fillText(thp, sx + colW, sy);
    const thpW = thp ? ctx.measureText(thp).width + 14 : 0;

    ctx.textAlign = "left";
    ctx.font = `500 32px ${FONT_BODY}`;
    ctx.fillStyle = C.ink;
    const nameX = slot.hunter ? sx + 20 : sx;
    if (slot.hunter) hunterDot(ctx, sx + 6, sy);
    ctx.fillText(fit(ctx, slot.name, colW - thpW - (slot.hunter ? 20 : 0)), nameX, sy);
  });
}

export function LineupImage({
  team,
  eventName,
  eventKey,
  week,
}: {
  team: ImageTeam;
  eventName: string;
  eventKey: string;
  week: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Erst zeichnen, wenn die Schriften geladen sind – sonst rendert das
    // Canvas mit dem Fallback und das Bild sieht anders aus als die App.
    const run = async () => {
      try {
        await document.fonts.ready;
      } catch {
        /* ältere Browser: direkt zeichnen */
      }
      if (cancelled || !canvasRef.current) return;
      draw(canvasRef.current, team, eventName, week);
      setReady(true);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [team, eventName, week]);

  const download = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${eventKey}-kw${week}-team-${team.team.toLowerCase()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [eventKey, week, team.team]);

  const t = useTranslations("announcement");

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3 className="text-base">
            <span className="text-sand">Team {team.team}</span>
            <span className="ml-2 text-xs text-muted font-mono">
              {team.filled} / {team.total}
            </span>
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
        <canvas
          ref={canvasRef}
          className="w-full h-auto rounded border border-line"
          aria-label={t("imageAria", { team: team.team })}
        />
      </div>
    </div>
  );
}
