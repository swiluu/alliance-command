/**
 * Prioritäts-Logik, 1:1 aus dem Apps Script (`updatePrioritaetBatch`).
 * Niedrigster Wert = höchste Priorität.
 */
export const PRIORITY = {
  FIXPLATZ: -1,
  NEU: 0,
  LANGE_NICHT: 2,
  NORMAL: 3,
  ZULETZT: 4,
  GESPERRT: 999,
} as const;

export type PriorityTag = {
  score: number;
  /** Schlüssel im Textbaustein-Namensraum `priority` – die Beschriftung
   *  entsteht erst beim Anzeigen, in der Sprache des Betrachters. */
  key: "fixplatz" | "neu" | "langeNicht" | "normal" | "zuletzt" | "gesperrt";
  icon: string;
  /** Tailwind-Klassen für den Pool-Chip */
  cls: string;
};

const TAGS: Record<number, Omit<PriorityTag, "score">> = {
  [PRIORITY.FIXPLATZ]: {
    key: "fixplatz",
    icon: "⭐⭐",
    cls: "border-ok/60 text-ok",
  },
  [PRIORITY.NEU]: {
    key: "neu",
    icon: "⭐",
    cls: "border-sand/60 text-sand",
  },
  [PRIORITY.LANGE_NICHT]: {
    key: "langeNicht",
    icon: "✅",
    cls: "border-ok/40 text-ok",
  },
  [PRIORITY.NORMAL]: {
    key: "normal",
    icon: "➖",
    cls: "border-line text-muted",
  },
  [PRIORITY.ZULETZT]: {
    key: "zuletzt",
    icon: "⏸",
    cls: "border-sand-dim/50 text-sand-dim",
  },
  [PRIORITY.GESPERRT]: {
    key: "gesperrt",
    icon: "🚫",
    cls: "border-danger/60 text-danger",
  },
};

export function priorityTag(score: number): PriorityTag {
  return { score, ...(TAGS[score] ?? TAGS[PRIORITY.NORMAL]) };
}

/**
 * Status, die als Teilnahme zählen. "Ausgesetzt" gehört bewusst NICHT dazu –
 * genau wie im Original-Sheet.
 */
export const PARTICIPATION_STATUSES = ["GESPIELT", "BANK"] as const;

/** Status für "musste aussetzen" – angemeldet, aber nicht eingeteilt. */
export const SKIP_STATUS = "AUSGESETZT";

export function computePriority(args: {
  currentWeek: number;
  lastWeek: number;
  isFixplatz: boolean;
  isBanned: boolean;
}): number {
  if (args.isBanned) return PRIORITY.GESPERRT;
  if (args.isFixplatz) return PRIORITY.FIXPLATZ;
  if (args.lastWeek === 0) return PRIORITY.NEU;

  const diff = args.currentWeek - args.lastWeek;
  if (diff >= 3) return PRIORITY.LANGE_NICHT;
  if (diff === 2) return PRIORITY.NORMAL;
  return PRIORITY.ZULETZT;
}
