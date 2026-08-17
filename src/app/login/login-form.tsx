"use client";

import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function LoginForm() {
  const t = useTranslations("login");
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError(t("wrong"));
      return;
    }
    startTransition(() => {
      router.replace("/uebersicht");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="panel p-5 space-y-4">
      <div>
        <label htmlFor="username" className="block text-xs uppercase tracking-wider text-muted mb-1">
          {t("username")}
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs uppercase tracking-wider text-muted mb-1">
          {t("password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger border border-danger-dim bg-danger/10 rounded px-3 py-2">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? `${t("submit")} …` : t("submit")}
      </button>
    </form>
  );
}
