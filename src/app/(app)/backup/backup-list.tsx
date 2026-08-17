"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { ActionScope, ConfirmButton, useAction } from "@/components/action";
import { createBackupNow, deleteBackup } from "@/server/actions/backup-actions";

type Row = { name: string; size: number; createdAt: string; reason: string };

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BackupList({
  files,
  stats,
  canEdit,
}: {
  files: Row[];
  stats: { count: number; totalSize: number; dbSize: number };
  canEdit: boolean;
}) {
  const t = useTranslations("backup");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { run, pending } = useAction();
  const [result, setResult] = useState<string | null>(null);

  return (
    <ActionScope>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        <Stat label={t("statCount")} value={String(stats.count)} />
        <Stat label={t("statSize")} value={formatSize(stats.totalSize)} />
        <Stat label={t("statDb")} value={formatSize(stats.dbSize)} />
      </div>

      <div className="panel">
        <div className="panel-head flex-wrap">
          <div>
            <h2 className="text-lg">{t("listHeading")}</h2>
            <p className="text-xs text-muted">{t("listHint")}</p>
          </div>
          {canEdit && (
            <button
              type="button"
              className="btn btn-primary text-xs"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await createBackupNow();
                  if (r.ok) setResult(t("created", { name: r.data.name }));
                  return r;
                })
              }
            >
              {t("now")}
            </button>
          )}
        </div>

        {result && (
          <p className="mx-3 mt-3 rounded border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">
            {result}
          </p>
        )}

        {/* Handy: Karte pro Sicherung. */}
        <ul className="md:hidden p-3 space-y-2">
          {files.map((f) => (
            <li key={f.name} className="rounded border border-line bg-panel-2/40 p-3">
              <Link
                href={`/backup/${encodeURIComponent(f.name)}`}
                className="block font-mono text-xs break-all hover:text-sand"
              >
                {f.name}
              </Link>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                <span>{formatDate(f.createdAt, locale)}</span>
                <span>{formatSize(f.size)}</span>
                <span>{f.reason}</span>
              </div>
              {canEdit && (
                <div className="mt-2 flex gap-2">
                  <ConfirmButton
                    className="btn btn-danger flex-1 py-2.5 text-xs"
                    label="✕"
                    title={t("deleteTitle")}
                    message={t("deleteMessage", { name: f.name })}
                    confirmLabel={tc("delete")}
                    onConfirm={() => deleteBackup(f.name)}
                  />
                </div>
              )}
            </li>
          ))}
          {files.length === 0 && (
            <li className="py-8 text-center text-sm text-muted">{t("none")}</li>
          )}
        </ul>

        <div className="hidden md:block scroll-x">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="px-3 py-2">{t("colFile")}</th>
                <th className="px-3 py-2 w-40">{t("colCreated")}</th>
                <th className="px-3 py-2 w-56">{t("colReason")}</th>
                <th className="px-3 py-2 w-24 text-right">{t("colSize")}</th>
                {canEdit && <th className="px-3 py-2 w-32 text-right">{t("colActions")}</th>}
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.name} className="border-b border-line/60 hover:bg-panel-2/50">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={`/backup/${encodeURIComponent(f.name)}`}
                      className="hover:text-sand underline decoration-line underline-offset-2"
                      title={t("peekTitle")}
                    >
                      {f.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">
                    {formatDate(f.createdAt, locale)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">{f.reason}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted">
                    {formatSize(f.size)}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <ConfirmButton
                          className="btn btn-danger px-2 py-1 text-xs"
                          label="✕"
                          title={t("deleteTitle")}
                          message={t("deleteMessage", { name: f.name })}
                          confirmLabel={tc("delete")}
                          onConfirm={() => deleteBackup(f.name)}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {files.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted">
                    {t("noneLong")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 panel p-4 text-xs text-muted space-y-2">
        <p>
          <span className="text-ink">{t("peekLabel")}</span>
          {t("peekBody")}
        </p>
        <p>
          <span className="text-ink">{t("restoreLabel")}</span>
          {t.rich("restoreBody", {
            c: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </p>
        <p>
          <span className="text-danger">{t("warnLabel")}</span>
          {t.rich("warnBody", {
            b: (chunks) => <span className="text-ink">{chunks}</span>,
          })}
        </p>
      </div>
    </ActionScope>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-3 py-2">
      <div className="font-display text-2xl leading-none">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
