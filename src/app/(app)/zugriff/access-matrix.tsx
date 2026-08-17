"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  ActionScope,
  ConfirmButton,
  useAction,
  useOptimisticRows,
} from "@/components/action";
import {
  MIN_PASSWORD_LENGTH,
  MODULES,
  nextAccessLevel,
  type AccessLevel,
} from "@/lib/constants";
import type { AccessMatrixRow } from "@/lib/admin-types";
import {
  createUser,
  deleteUser,
  resetPassword,
  setModuleAccess,
  toggleR4Rank,
} from "@/server/actions/admin-actions";

// Die Beschriftung steht im Namensraum `access`; hier bleiben Zeichen und Farbe.
const CELL: Record<AccessLevel, { text: string; cls: string; key: "none" | "read" | "edit" }> = {
  NONE: { text: "·", cls: "text-muted border-line", key: "none" },
  READ: { text: "R", cls: "text-sand border-sand-dim bg-sand/10", key: "read" },
  EDIT: { text: "E", cls: "text-ok border-ok/50 bg-ok/10", key: "edit" },
};

export function AccessMatrix({
  rows,
  currentUserId,
}: {
  rows: AccessMatrixRow[];
  currentUserId: string;
}) {
  // Die Matrix wird durchgeklickt – jede Zelle rotiert die Stufe. Sofort
  // umstellen, im Hintergrund speichern.
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const ta = useTranslations("access");
  const tm = useTranslations("modules");
  const { rows: local, mutate } = useOptimisticRows(rows);

  const r4Umschalten = (userId: string) =>
    mutate(
      (cur) => cur.map((x) => (x.userId === userId ? { ...x, isR4: !x.isR4 } : x)),
      () => toggleR4Rank(userId),
    );

  const rotate = (userId: string, module: string, next: AccessLevel) =>
    mutate(
      (cur) =>
        cur.map((r) =>
          r.userId === userId ? { ...r, levels: { ...r.levels, [module]: next } } : r,
        ),
      () => setModuleAccess(userId, module, next),
    );

  return (
    <ActionScope>
      <div className="panel">
        <div className="panel-head flex-wrap">
          <div>
            <h2 className="text-lg">{t("matrixHeading")}</h2>
            <p className="text-xs text-muted">{t("matrixHint")}</p>
          </div>
          <CreateUserButton />
        </div>

        {/* Handy: Karte pro Benutzer, Module als antippbare Reihe. */}
        <ul className="md:hidden p-3 space-y-2">
          {local.map((r) => (
            <li key={r.userId} className="rounded border border-line bg-panel-2/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.displayName}</div>
                  <div className="font-mono text-[11px] text-muted">{r.username}</div>
                </div>
                <div className="flex flex-wrap justify-end gap-1 shrink-0">
                  {r.isSuperadmin && (
                    <span className="tag border-sand-dim text-sand">{t("superadmin")}</span>
                  )}
                  {!r.isSuperadmin && <RangKnopf row={r} onToggle={r4Umschalten} />}
                  {r.mustChangePassword && (
                    <span className="tag border-danger/60 text-danger">
                      {t("initialPassword")}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2 space-y-1">
                {MODULES.map((m) => {
                  const level = r.levels[m] ?? "NONE";
                  const meta = CELL[level];
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={r.isSuperadmin}
                      onClick={() => rotate(r.userId, m, nextAccessLevel(level))}
                      className={`w-full flex items-center justify-between gap-2 rounded border px-3 py-2.5 text-sm ${meta.cls} ${
                        r.isSuperadmin ? "opacity-40" : ""
                      }`}
                    >
                      <span className="text-ink">{tm(m)}</span>
                      <span className="font-mono text-xs">{ta(meta.key)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 flex gap-2">
                <ResetPasswordButton userId={r.userId} name={r.displayName} />
                <ConfirmButton
                  className="btn btn-danger px-3 py-2.5 text-xs"
                  label={t("deleteUserLabel")}
                  title={t("deleteUser")}
                  message={t("deleteUserMessage", {
                    name: r.displayName,
                    username: r.username,
                  })}
                  confirmLabel={tc("delete")}
                  disabled={r.userId === currentUserId}
                  onConfirm={() => deleteUser(r.userId)}
                />
              </div>
            </li>
          ))}
        </ul>

        <div className="hidden md:block scroll-x">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="px-3 py-2">{t("colUser")}</th>
                {MODULES.map((m) => (
                  <th key={m} className="px-3 py-2 text-center w-24">
                    {tm(m)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right w-44">{t("colAccount")}</th>
              </tr>
            </thead>
            <tbody>
              {local.map((r) => (
                <tr key={r.userId} className="border-b border-line/60">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.displayName}</div>
                    <div className="text-xs text-muted font-mono">{r.username}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.isSuperadmin && (
                        <span className="tag border-sand-dim text-sand">
                          {t("superadmin")}
                        </span>
                      )}
                      {!r.isSuperadmin && <RangKnopf row={r} onToggle={r4Umschalten} />}
                      {r.mustChangePassword && (
                        <span
                          className="tag border-danger/60 text-danger"
                          title={t("initialPasswordTitle")}
                        >
                          {t("initialPassword")}
                        </span>
                      )}
                    </div>
                  </td>

                  {MODULES.map((m) => {
                    const level = r.levels[m] ?? "NONE";
                    const meta = CELL[level];
                    return (
                      <td key={m} className="px-3 py-2 text-center">
                        <button
                          type="button"
                          disabled={r.isSuperadmin}
                          title={
                            r.isSuperadmin
                              ? t("superadminAlways")
                              : t("cellTitle", { module: tm(m), level: ta(meta.key) })
                          }
                          onClick={() => rotate(r.userId, m, nextAccessLevel(level))}
                          className={`h-8 w-8 rounded border font-mono ${meta.cls} ${
                            r.isSuperadmin ? "opacity-40 cursor-not-allowed" : "hover:brightness-125"
                          }`}
                        >
                          {meta.text}
                        </button>
                      </td>
                    );
                  })}

                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <ResetPasswordButton userId={r.userId} name={r.displayName} />
                      <ConfirmButton
                        className="btn btn-danger px-2 py-1 text-xs"
                        label="✕"
                        title={t("deleteUser")}
                        message={t("deleteUserMessage", {
                          name: r.displayName,
                          username: r.username,
                        })}
                        confirmLabel={tc("delete")}
                        disabled={r.userId === currentUserId}
                        onConfirm={() => deleteUser(r.userId)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ActionScope>
  );
}

function CreateUserButton() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [superadmin, setSuperadmin] = useState(false);
  const { run, pending } = useAction();

  return (
    <>
      <button type="button" className="btn btn-primary text-xs" onClick={() => setOpen(true)}>
        {t("createUser")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="panel my-auto w-full max-w-sm p-5">
            <h2 className="text-lg mb-3">{t("createHeading")}</h2>

            <label className="block text-xs text-muted mb-1">{t("username")}</label>
            <input className="input mb-3" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />

            <label className="block text-xs text-muted mb-1">{t("displayName")}</label>
            <input className="input mb-3" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />

            <label className="block text-xs text-muted mb-1">{t("initialPasswordLabel")}</label>
            <input
              className="input"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("minChars", { min: MIN_PASSWORD_LENGTH })}
            />

            <label className="mt-3 flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={superadmin}
                onChange={(e) => setSuperadmin(e.target.checked)}
                className="h-5 w-5 shrink-0 accent-[#C9A24B] md:h-4 md:w-4"
              />
              {t("superadminCheck")}
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !username.trim() || password.length < MIN_PASSWORD_LENGTH}
                onClick={() => {
                  setOpen(false);
                  run(async () => {
                    await createUser(username, password, displayName, superadmin);
                    setUsername("");
                    setDisplayName("");
                    setPassword("");
                    setSuperadmin(false);
                  });
                }}
              >
                {t("create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const { run, pending } = useAction();

  return (
    <>
      <button
        type="button"
        className="btn px-2 py-1 text-xs"
        onClick={() => {
          setPassword("");
          setOpen(true);
        }}
        title={t("resetPassword")}
      >
        🔑
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="panel my-auto w-full max-w-sm p-5">
            <h2 className="text-lg mb-1">{t("resetPassword")}</h2>
            <p className="text-sm text-muted mb-3">
              {t.rich("resetBody", {
                name,
                n: (chunks) => <span className="text-ink">{chunks}</span>,
              })}
            </p>
            <input
              className="input"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("minChars", { min: MIN_PASSWORD_LENGTH })}
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || password.length < MIN_PASSWORD_LENGTH}
                onClick={() => {
                  setOpen(false);
                  run(() => resetPassword(userId, password));
                }}
              >
                {t("set")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Rang in der Allianz, umschaltbar für jedes Konto ausser Superadmins.
 *
 * Wirksam ist er bei Konten aus der Selbstregistrierung: "Mitglied" sieht nur
 * die Wochenplanung, "R4" zusätzlich Fixplätze und das Protokoll. Bei von Hand
 * angelegten Konten bleibt er eine Angabe zur Person – die sehen Führungsdaten
 * ohnehin, ihre Rechte stehen in der Matrix daneben. Geschrieben wird in
 * keinem Fall etwas.
 */
function RangKnopf({
  row,
  onToggle,
}: {
  row: { userId: string; isR4: boolean; displayName: string };
  onToggle: (userId: string) => void;
}) {
  const t = useTranslations("admin");

  return (
    <button
      type="button"
      onClick={() => onToggle(row.userId)}
      className={`tag transition-colors ${
        row.isR4
          ? "border-sand text-sand hover:border-sand-dim"
          : "hover:border-sand-dim hover:text-sand"
      }`}
      title={
        row.isR4
          ? t("r4RevokeTitle", { name: row.displayName })
          : t("r4GrantTitle", { name: row.displayName })
      }
    >
      {row.isR4 ? "R4" : t("member")}
    </button>
  );
}

