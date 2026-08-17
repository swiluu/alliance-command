"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

import { ActionScope, useAction } from "@/components/action";
import { adoptFromRoster } from "@/server/actions/player-actions";
import type { AllianceChanges } from "@/server/alliance-watch";

/**
 * Meldet Abweichungen zwischen Kader und Allianz-Mitgliederliste. Erscheint nur,
 * wenn es tatsächlich etwas zu tun gibt – sonst wäre es Dauerrauschen.
 */
export function AllianceAlert({
  changes,
  canManage,
  freiePlaetze,
}: {
  changes: AllianceChanges;
  canManage: boolean;
  /** Wie viele Kaderplätze noch frei sind – bei null lässt sich niemand aufnehmen. */
  freiePlaetze: number;
}) {
  const t = useTranslations("alert");

  if (!changes.available) return null;
  if (
    changes.joined.length === 0 &&
    changes.left.length === 0 &&
    changes.ausgetreten.length === 0
  ) {
    return null;
  }

  return (
    <ActionScope>
      <section
      className="panel border-sand-dim"
      aria-label={t("aria")}
    >
      <div className="panel-head flex-wrap border-sand-dim/40">
        <div>
          <h2 className="text-lg text-sand">
            <span aria-hidden className="mr-1">
              ⚠
            </span>
            {t("heading")}
          </h2>
          <p className="text-xs text-muted">
            {t("subline", {
              joined: changes.joined.length,
              left: changes.left.length + changes.ausgetreten.length,
            })}
          </p>
        </div>
        {canManage && (
          <Link href="/allianz" className="btn btn-primary text-xs">
            {t("toRoster")}
          </Link>
        )}
      </div>

      <div className="grid gap-4 p-3 sm:grid-cols-2">
        {changes.joined.length > 0 && (
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-ok mb-1.5">
              {t("joinedHeading")}
            </h3>
            <ul className="space-y-1">
              {changes.joined.map((p) => (
                <li
                  key={p.lwrId}
                  className="flex items-center justify-between gap-2 rounded border border-ok/40 bg-ok/5 px-2 py-1.5 text-sm"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs text-muted">{p.thp ?? "–"}</span>
                    {canManage && (
                      <AufnehmenButton spieler={p} freiePlaetze={freiePlaetze} />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Ohne Rang in der Mitgliederliste: die Person ist raus, steht dort
            aber noch. Auf lastwarrank sieht man es an "99/100" und einem
            Strich statt R1–R5. */}
        {changes.ausgetreten.length > 0 && (
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-danger mb-1.5">
              {t("goneHeading")}
            </h3>
            <p className="mb-1.5 text-[11px] text-muted">{t("goneHint")}</p>
            <ul className="space-y-1">
              {changes.ausgetreten.map((p) => (
                <li
                  key={p.lwrId}
                  className="flex items-center justify-between gap-2 rounded border border-danger/40 bg-danger/5 px-2 py-1.5 text-sm"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="tag shrink-0 border-danger/50 text-danger">
                    {t("noRank")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {changes.left.length > 0 && (
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-danger mb-1.5">
              {t("leftHeading")}
            </h3>
            <ul className="space-y-1">
              {changes.left.map((p) => (
                <li
                  key={p.name}
                  className="flex items-center justify-between gap-2 rounded border border-danger/40 bg-danger/5 px-2 py-1.5 text-sm"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="tag shrink-0 border-danger/50 text-danger">
                    {p.alliance}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {canManage && freiePlaetze <= 0 && changes.joined.length > 0 && (
        <p className="px-3 pb-1 text-xs text-sand">{t("full")}</p>
      )}

      <p className="px-3 pb-3 text-xs text-muted">{t("explain")}</p>
      </section>
    </ActionScope>
  );
}

/**
 * Übernimmt einen Neuzugang mit Name, THP und der stabilen lastwarrank-ID –
 * ohne dass jemand den Namen abschreiben muss.
 */
function AufnehmenButton({
  spieler,
  freiePlaetze,
}: {
  spieler: { name: string; thp: string | null; lwrId: number };
  freiePlaetze: number;
}) {
  const t = useTranslations("alert");
  const { run, pending } = useAction();
  const voll = freiePlaetze <= 0;

  return (
    <button
      type="button"
      className={`btn px-2 py-1 text-xs ${voll ? "cursor-not-allowed opacity-50" : ""}`}
      disabled={pending || voll}
      title={voll ? t("adoptFullTitle") : t("adoptTitle", { name: spieler.name })}
      onClick={() => run(() => adoptFromRoster(spieler.lwrId, spieler.name, spieler.thp))}
    >
      {t("adopt")}
    </button>
  );
}
