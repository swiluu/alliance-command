"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ActionScope, ConfirmButton, useAction, useOptimisticRows } from "@/components/action";
import { dauer, kuenftig, laeuft, vorbei, zeitraumText } from "@/lib/absence";
import {
  addAbsence,
  deleteAbsence,
  endAbsence,
} from "@/server/actions/absence-actions";

export type AbsenceRow = {
  id: string;
  playerId: string;
  name: string;
  from: string;
  until: string | null;
  note: string | null;
  createdBy: string | null;
};

/** Die Daten kommen als ISO-Zeichenkette über die Grenze. */
const zeitraum = (r: AbsenceRow) => ({
  from: new Date(r.from),
  until: r.until ? new Date(r.until) : null,
});

export function AbsenceView({
  rows: serverRows,
  kader,
  heuteIso,
  canEditAll,
  eigenerPlayerId,
  anzahl,
}: {
  rows: AbsenceRow[];
  kader: { id: string; name: string }[];
  heuteIso: string;
  /** Allianz-Verwaltung: darf für jeden melden. */
  canEditAll: boolean;
  /** Eigener Kadereintrag – jedes Mitglied darf sich selbst abmelden. */
  eigenerPlayerId: string | null;
  anzahl: { laufend: number; kuenftig: number; vorbei: number };
}) {
  const t = useTranslations("absence");
  const tc = useTranslations("common");
  const locale = useLocale();
  const darfBearbeiten = (playerId: string) =>
    canEditAll || playerId === eigenerPlayerId;
  const stichtag = new Date(heuteIso);
  const { rows, mutate } = useOptimisticRows(serverRows);
  const [zeigeVorbei, setZeigeVorbei] = useState(false);

  const gruppen = useMemo(() => {
    const mit = rows.map((r) => ({ r, z: zeitraum(r) }));
    return {
      laufend: mit
        .filter((x) => laeuft(x.z, stichtag))
        .sort((a, b) => a.z.from.getTime() - b.z.from.getTime()),
      kuenftig: mit
        .filter((x) => kuenftig(x.z, stichtag))
        .sort((a, b) => a.z.from.getTime() - b.z.from.getTime()),
      vorbei: mit
        .filter((x) => vorbei(x.z, stichtag))
        .sort((a, b) => (b.z.until?.getTime() ?? 0) - (a.z.until?.getTime() ?? 0)),
    };
  }, [rows, heuteIso]);

  const zurueck = (r: AbsenceRow) =>
    mutate(
      (cur) => cur.filter((x) => x.id !== r.id),
      () => endAbsence(r.id),
    );

  return (
    <ActionScope>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Zahl label={t("countRunning")} wert={gruppen.laufend.length} betont />
          <Zahl label={t("countUpcoming")} wert={gruppen.kuenftig.length} />
          <Zahl label={t("countPast")} wert={anzahl.vorbei} />
          <div className="flex-1" />
          {canEditAll || eigenerPlayerId ? (
            <MeldenButton
              kader={canEditAll ? kader : kader.filter((p) => p.id === eigenerPlayerId)}
              festerSpieler={canEditAll ? null : eigenerPlayerId}
            />
          ) : (
            /* Weder Rechte für andere noch ein eigener Kadereintrag: ohne
               Spieler gibt es niemanden abzumelden. Vorher stand hier nichts
               und es sah nach einem Fehler aus. */
            <p className="text-xs text-muted max-w-xs text-right">{t("noPlayerLink")}</p>
          )}
        </div>

        <Abschnitt
          titel={t("nowHeading")}
          leer={t("nowEmpty")}
          eintraege={gruppen.laufend}
          stichtag={stichtag}
          darfBearbeiten={darfBearbeiten}
          onZurueck={zurueck}
          ton="laufend"
        />

        {gruppen.kuenftig.length > 0 && (
          <Abschnitt
            titel={t("upcomingHeading")}
            leer=""
            eintraege={gruppen.kuenftig}
            stichtag={stichtag}
            darfBearbeiten={darfBearbeiten}
            onZurueck={zurueck}
            ton="kuenftig"
          />
        )}

        {gruppen.vorbei.length > 0 && (
          <div className="panel">
            <button
              type="button"
              className="panel-head w-full text-left hover:text-sand"
              onClick={() => setZeigeVorbei((v) => !v)}
              aria-expanded={zeigeVorbei}
            >
              <h2 className="text-lg">
                {t("pastHeading")}
                <span className="ml-2 font-mono text-xs text-muted">
                  {gruppen.vorbei.length}
                </span>
              </h2>
              <span className="text-muted">{zeigeVorbei ? "▲" : "▼"}</span>
            </button>
            {zeigeVorbei && (
              <ul className="divide-y divide-line/60">
                {gruppen.vorbei.map(({ r, z }) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                  >
                    <Link
                      href={`/spieler/${r.playerId}`}
                      className="min-w-0 flex-1 truncate text-muted hover:text-sand"
                    >
                      {r.name}
                    </Link>
                    <span className="font-mono text-xs text-muted">
                      {zeitraumText(z, locale)}
                    </span>
                    {canEditAll && (
                      <ConfirmButton
                        className="btn px-2 py-1 text-xs"
                        label="✕"
                        title={t("deleteTitle")}
                        message={t("deleteMessage", { name: r.name })}
                        confirmLabel={tc("delete")}
                        onConfirm={() => deleteAbsence(r.id)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </ActionScope>
  );
}

function Zahl({
  label,
  wert,
  betont,
}: {
  label: string;
  wert: number;
  betont?: boolean;
}) {
  return (
    <div className="panel px-4 py-2 text-right">
      <div
        className={`font-display text-2xl leading-none ${
          betont && wert > 0 ? "text-sand" : ""
        }`}
      >
        {wert}
      </div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted">{label}</div>
    </div>
  );
}

function Abschnitt({
  titel,
  leer,
  eintraege,
  stichtag,
  darfBearbeiten,
  onZurueck,
  ton,
}: {
  titel: string;
  leer: string;
  eintraege: { r: AbsenceRow; z: { from: Date; until: Date | null } }[];
  stichtag: Date;
  darfBearbeiten: (playerId: string) => boolean;
  onZurueck: (r: AbsenceRow) => void;
  ton: "laufend" | "kuenftig";
}) {
  const t = useTranslations("absence");
  const tc = useTranslations("common");
  const locale = useLocale();

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="text-lg">{titel}</h2>
        <span className="tag">{eintraege.length}</span>
      </div>

      {eintraege.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-muted">{leer}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {eintraege.map(({ r, z }) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
              <Link
                href={`/spieler/${r.playerId}`}
                className="min-w-0 flex-1 truncate hover:text-sand"
              >
                {r.name}
              </Link>

              <span className="font-mono text-xs text-muted">{zeitraumText(z, locale)}</span>
              <span
                className={`text-xs ${
                  ton === "laufend" && z.until === null ? "text-sand" : "text-muted"
                }`}
              >
                {(() => {
                  const d = dauer(z, stichtag);
                  return t(`dauer.${d.key}`, { days: d.days });
                })()}
              </span>

              {darfBearbeiten(r.playerId) && (
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    className="btn px-2 py-1 text-xs"
                    onClick={() => onZurueck(r)}
                    title={ton === "kuenftig" ? t("withdrawTitle") : t("isBackTitle")}
                  >
                    {ton === "kuenftig" ? t("withdraw") : t("isBack")}
                  </button>
                  <ConfirmButton
                    className="btn px-2 py-1 text-xs"
                    label="✕"
                    title={t("deleteTitle")}
                    message={t("deleteMessage", { name: r.name })}
                    confirmLabel={tc("delete")}
                    onConfirm={() => deleteAbsence(r.id)}
                  />
                </span>
              )}

              {r.note && (
                <p className="w-full text-xs text-muted">{r.note}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MeldenButton({
  kader,
  festerSpieler,
}: {
  kader: { id: string; name: string }[];
  /** Gesetzt für Mitglieder: sie melden ausschliesslich sich selbst. */
  festerSpieler: string | null;
}) {
  const t = useTranslations("absence");
  const tc = useTranslations("common");
  const [offen, setOffen] = useState(false);
  const [playerId, setPlayerId] = useState(festerSpieler ?? "");
  const [von, setVon] = useState(() => new Date().toISOString().slice(0, 10));
  const [bis, setBis] = useState("");
  const [note, setNote] = useState("");
  const { run, pending } = useAction();

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOffen(true)}>
        {festerSpieler ? t("reportSelf") : t("report")}
      </button>

      {offen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="panel my-auto w-full max-w-sm p-5">
            <h2 className="text-lg mb-3">{t("dialogHeading")}</h2>

            {festerSpieler ? (
              <p className="mb-3 text-sm">
                <span className="text-muted">{t("forWhom")}</span>
                {kader[0]?.name ?? t("you")}
              </p>
            ) : (
              <>
                <label className="block text-xs text-muted mb-1" htmlFor="abw-spieler">
                  {t("player")}
                </label>
                <select
                  id="abw-spieler"
                  className="input mb-3 py-2.5 text-[16px] sm:py-2 sm:text-sm"
                  value={playerId}
                  onChange={(e) => setPlayerId(e.target.value)}
                >
                  <option value="">{t("choose")}</option>
                  {kader.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted mb-1" htmlFor="abw-von">
                  {t("dateFrom")}
                </label>
                <input
                  id="abw-von"
                  type="date"
                  className="input py-2.5 text-[16px] sm:py-2 sm:text-sm"
                  value={von}
                  onChange={(e) => setVon(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1" htmlFor="abw-bis">
                  {t("dateUntil")} <span className="opacity-70">{t("dateUntilHint")}</span>
                </label>
                <input
                  id="abw-bis"
                  type="date"
                  className="input py-2.5 text-[16px] sm:py-2 sm:text-sm"
                  value={bis}
                  min={von}
                  onChange={(e) => setBis(e.target.value)}
                />
              </div>
            </div>

            <label className="block text-xs text-muted mb-1" htmlFor="abw-notiz">
              {t("note")}
            </label>
            <input
              id="abw-notiz"
              className="input py-2.5 text-[16px] sm:py-2 sm:text-sm"
              placeholder={t("notePlaceholder")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <p className="mt-3 text-xs text-muted">
              {t("dialogHint")}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setOffen(false)}>
                {tc("cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !playerId || !von}
                onClick={() => {
                  setOffen(false);
                  run(async () => {
                    const r = await addAbsence(playerId, von, bis || null, note);
                    if (r.ok) {
                      setPlayerId(festerSpieler ?? "");
                      setBis("");
                      setNote("");
                    }
                    return r;
                  });
                }}
              >
                {t("submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
