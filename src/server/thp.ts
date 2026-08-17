import "server-only";
import { SERVER_ID } from "@/lib/allianz";

/**
 * Anbindung an lastwarrank.com. Primär über den konfigurierten Endpunkt
 * (`THP_API_URL`), der Namen, Allianz-Tag und THP je Spieler liefert; ohne
 * Endpunkt bleibt der manuelle CSV/Paste-Import in der Übersicht.
 */
export type LwrRow = {
  public_id: number;
  name: string;
  alliance_abbr: string | null;
  thp: number | null;
};

export type ThpEntry = { name: string; raw: string; value: number };

/** "202.59M" → 202590000 · "1.2B" → 1200000000 · "845K" → 845000 */
export function parseThp(input: string): number | null {
  const s = input.trim().replace(/\s+/g, "").replace(/,/g, ".");
  const m = /^([0-9]*\.?[0-9]+)\s*([kmb])?$/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2]?.toLowerCase();
  const factor = unit === "b" ? 1e9 : unit === "m" ? 1e6 : unit === "k" ? 1e3 : 1;
  return n * factor;
}

/** 208400868 → "208.40M" */
export function formatThp(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return String(value);
}

/**
 * Zeilen aus einem CSV- oder Copy&Paste-Block lesen.
 * Akzeptiert "Name;THP", "Name,THP" und "Name<TAB>THP".
 */
export function parseThpPaste(text: string): { entries: ThpEntry[]; skipped: string[] } {
  const entries: ThpEntry[] = [];
  const skipped: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Von rechts trennen – Spielernamen dürfen Kommas enthalten.
    const match = /^(.*)[\t;,]\s*([^\t;,]+)$/.exec(trimmed);
    if (!match) {
      skipped.push(trimmed);
      continue;
    }
    const name = match[1].trim();
    const raw = match[2].trim();
    const value = parseThp(raw);
    if (!name || value === null) {
      skipped.push(trimmed);
      continue;
    }
    entries.push({ name, raw, value });
  }

  return { entries, skipped };
}

function apiBase() {
  return process.env.THP_API_URL ?? "";
}

function serverId() {
  return String(SERVER_ID);
}

/** Rangliste des Servers. `null` = kein Endpunkt konfiguriert oder nicht erreichbar. */
export async function fetchLwrRows(): Promise<LwrRow[] | null> {
  const base = apiBase();
  if (!base) return null;

  const rows: LwrRow[] = [];
  try {
    // Die API deckelt bei 100 Zeilen pro Aufruf.
    for (let offset = 0; offset < 2000; offset += 100) {
      const url = `${base}?server_id=${serverId()}&sort_by=thp&sort_dir=desc&limit=100&offset=${offset}`;
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) return rows.length ? rows : null;

      const page = (await res.json()) as { rows?: LwrRow[] };
      const batch = page.rows ?? [];
      rows.push(...batch);
      if (batch.length < 100) break;
    }
  } catch {
    return rows.length ? rows : null;
  }
  return rows;
}

/**
 * Gezielte Namenssuche. Die Rangliste endet bei den Top 200 des Servers –
 * wer darunter liegt, ist nur so auffindbar.
 */
export async function searchLwr(name: string): Promise<LwrRow[]> {
  const base = apiBase();
  if (!base) return [];
  try {
    const url = `${base}?server_id=${serverId()}&search=${encodeURIComponent(name)}&limit=10`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const page = (await res.json()) as { rows?: LwrRow[] };
    return page.rows ?? [];
  } catch {
    return [];
  }
}

export const looseKey = (s: string) => s.toLowerCase().replace(/\s+/g, "");
export const asciiKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
