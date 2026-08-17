"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { MIN_PASSWORD_LENGTH as MIN_LENGTH } from "@/lib/constants";
import { changeOwnPassword } from "@/server/actions/account-actions";

export function PasswordForm({
  forced,
  displayName,
}: {
  forced: boolean;
  displayName: string;
}) {
  const t = useTranslations("password");
  const tc = useTranslations("common");
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = repeat.length > 0 && next !== repeat;
  const ready = current.length > 0 && next.length >= MIN_LENGTH && next === repeat;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const result = await changeOwnPassword(current, next);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    startTransition(() => {
      router.replace("/uebersicht");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="panel p-5 space-y-4">
      <div>
        <h1 className="text-lg">{t("heading")}</h1>
        <p className="text-xs text-muted">{t("signedInAs", { name: displayName })}</p>
      </div>

      <div>
        <label htmlFor="current" className="block text-xs uppercase tracking-wider text-muted mb-1">
          {t("current")}
        </label>
        <input
          id="current"
          type="password"
          autoComplete="current-password"
          className="input"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div>
        <label htmlFor="next" className="block text-xs uppercase tracking-wider text-muted mb-1">
          {t("new")}
        </label>
        <input
          id="next"
          type="password"
          autoComplete="new-password"
          className={`input ${tooShort ? "border-danger" : ""}`}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
        <p className={`mt-1 text-xs ${tooShort ? "text-danger" : "text-muted"}`}>
          {t("minLength", { min: MIN_LENGTH })}
        </p>
      </div>

      <div>
        <label htmlFor="repeat" className="block text-xs uppercase tracking-wider text-muted mb-1">
          {t("repeat")}
        </label>
        <input
          id="repeat"
          type="password"
          autoComplete="new-password"
          className={`input ${mismatch ? "border-danger" : ""}`}
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          required
        />
        {mismatch && (
          <p className="mt-1 text-xs text-danger">{t("mismatch")}</p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded border border-danger-dim bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {done ? (
        <p className="rounded border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">
          {t("done")}
        </p>
      ) : (
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={!ready || busy || pending}
        >
          {busy ? tc("saving") : forced ? t("submitForced") : t("submit")}
        </button>
      )}

      <p className="text-xs text-muted">
        {t("otherSessions")}
      </p>
    </form>
  );
}
