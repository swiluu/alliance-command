"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ActionScope, ConfirmButton, useAction } from "@/components/action";
import type { Week } from "@/lib/iso-week";
import type { ImportReport } from "@/server/vs-import";
import { deleteVsWeek, linkVsName, uploadVsWorkbook } from "@/server/actions/vs-actions";

/**
 * Verwaltungsteil unter der Rangliste: Mappe einlesen, offene Namen zuordnen,
 * eine Woche wieder entfernen. Nur sichtbar, wer Schreibrecht auf den Zug hat.
 */
export function VsAdmin({
  unresolved,
  players,
  weeks,
}: {
  unresolved: string[];
  players: { id: string; name: string }[];
  weeks: Week[];
}) {
  return (
    <ActionScope>
      <div className="space-y-5">
        <ImportPanel />
        {unresolved.length > 0 && <UnresolvedPanel names={unresolved} players={players} />}
        {weeks.length > 0 && <WeeksPanel weeks={weeks} />}
      </div>
    </ActionScope>
  );
}

function ImportPanel() {
  const t = useTranslations("vs");
  const f = useFormatter();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const result = await uploadVsWorkbook(fd);
      if (!result.ok) setError(result.error);
      else {
        setReport(result.data);
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2 className="text-lg">{t("importHeading")}</h2>
          <p className="text-xs text-muted">{t("importSubline")}</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
          className="input w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-panel-2 file:px-3 file:py-1 file:text-sand"
        />
        {busy && <p className="text-sm text-muted">{t("importRunning")}</p>}

        {error && (
          <p className="rounded border border-danger-dim bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {report && (
          <div className="rounded border border-ok/40 bg-ok/5 px-3 py-2 text-sm">
            <p className="text-ok">{t("importDone", { count: report.weeks.length })}</p>
            <ul className="mt-2 space-y-0.5 font-mono text-xs text-muted">
              {report.weeks.map((w) => (
                <li key={`${w.week.year}-${w.week.kw}`}>
                  {t("importWeekLine", {
                    kw: w.week.kw,
                    year: w.week.year,
                    rows: w.rows,
                    blank: w.blank,
                  })}
                </li>
              ))}
            </ul>
            {report.unresolved.length > 0 && (
              <p className="mt-2 text-xs text-danger">
                {t("importUnresolved", {
                  count: report.unresolved.length,
                  names: f.list(report.unresolved, { type: "conjunction" }),
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UnresolvedPanel({
  names,
  players,
}: {
  names: string[];
  players: { id: string; name: string }[];
}) {
  const t = useTranslations("vs");

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2 className="text-lg">{t("linkHeading", { count: names.length })}</h2>
          <p className="text-xs text-muted">{t("linkSubline")}</p>
        </div>
      </div>
      <ul className="p-4 space-y-2">
        {names.map((name) => (
          <LinkRow key={name} rawName={name} players={players} />
        ))}
      </ul>
    </div>
  );
}

function LinkRow({
  rawName,
  players,
}: {
  rawName: string;
  players: { id: string; name: string }[];
}) {
  const t = useTranslations("vs");
  const { run, pending } = useAction();
  const [playerId, setPlayerId] = useState("");

  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-sm min-w-[10rem]">{rawName}</span>
      <span aria-hidden className="text-muted">
        →
      </span>
      <select
        className="input py-1 text-sm"
        value={playerId}
        onChange={(e) => setPlayerId(e.target.value)}
      >
        <option value="">{t("linkChoose")}</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn text-sm"
        disabled={!playerId || pending}
        onClick={() => run(() => linkVsName(rawName, playerId))}
      >
        {t("linkSave")}
      </button>
    </li>
  );
}

function WeeksPanel({ weeks }: { weeks: Week[] }) {
  const t = useTranslations("vs");

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2 className="text-lg">{t("weeksHeading", { count: weeks.length })}</h2>
          <p className="text-xs text-muted">{t("weeksSubline")}</p>
        </div>
      </div>
      <ul className="p-4 flex flex-wrap gap-1.5">
        {weeks.map((w) => (
          <li key={`${w.year}-${w.kw}`}>
            <ConfirmButton
              className="tag hover:border-danger hover:text-danger"
              label={t("weekOption", { kw: w.kw, year: w.year })}
              title={t("deleteTitle")}
              message={t("deleteMessage", { kw: w.kw, year: w.year })}
              confirmLabel={t("deleteConfirm")}
              onConfirm={() => deleteVsWeek(w.year, w.kw)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
