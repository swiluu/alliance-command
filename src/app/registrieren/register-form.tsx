"use client";

import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { registerMember } from "@/server/actions/registration-actions";

/**
 * Selbstregistrierung für Allianzmitglieder.
 *
 * Belegt wird die Zugehörigkeit durch den Beitrittscode aus der
 * Allianz-Ankündigung im Spiel – dorthin kommt nur, wer in der Allianz ist.
 */
export function RegisterForm({ kader }: { kader: { id: string; name: string }[] }) {
  const t = useTranslations("register");
  const tc = useTranslations("common");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const zuKurz = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const ungleich = wiederholung.length > 0 && password !== wiederholung;
  const bereit =
    code.trim() && playerId && username.trim().length >= 3 && !zuKurz && !ungleich && password;

  async function absenden() {
    setFehler(null);
    setLaeuft(true);

    const r = await registerMember(code, playerId, username, password);
    if (!r.ok) {
      setFehler(r.error);
      setLaeuft(false);
      return;
    }

    // Direkt anmelden – niemand soll sein frisch gesetztes Passwort gleich
    // noch einmal eintippen müssen.
    const login = await signIn("credentials", {
      username: username.trim(),
      password,
      redirect: false,
    });
    if (login?.error) {
      router.push("/login");
      return;
    }
    router.push("/uebersicht");
    router.refresh();
  }

  return (
    <div className="panel p-5 space-y-3">
      <div>
        <label className="block text-xs text-muted mb-1" htmlFor="reg-code">
          {t("code")}
        </label>
        <input
          id="reg-code"
          className="input py-2.5 text-[16px] font-mono tracking-widest sm:py-2"
          placeholder={t("codePlaceholder")}
          value={code}
          autoCapitalize="characters"
          onChange={(e) => setCode(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs text-muted mb-1" htmlFor="reg-spieler">
          {t("player")}
        </label>
        <select
          id="reg-spieler"
          className="input py-2.5 text-[16px] sm:py-2"
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
      </div>

      <div>
        <label className="block text-xs text-muted mb-1" htmlFor="reg-user">
          {t("username")}
        </label>
        <input
          id="reg-user"
          className="input py-2.5 text-[16px] sm:py-2"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs text-muted mb-1" htmlFor="reg-pw">
          {t("password")}{" "}
          <span className="opacity-70">{t("passwordHint", { min: MIN_PASSWORD_LENGTH })}</span>
        </label>
        <input
          id="reg-pw"
          type="password"
          className="input py-2.5 text-[16px] sm:py-2"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs text-muted mb-1" htmlFor="reg-pw2">
          {t("repeat")}
        </label>
        <input
          id="reg-pw2"
          type="password"
          className="input py-2.5 text-[16px] sm:py-2"
          autoComplete="new-password"
          value={wiederholung}
          onChange={(e) => setWiederholung(e.target.value)}
        />
        {ungleich && (
          <p className="mt-1 text-xs text-danger">{t("mismatch")}</p>
        )}
      </div>

      {fehler && (
        <p className="rounded border border-danger/50 bg-danger/10 px-3 py-2 text-xs text-danger">
          {fehler}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary w-full py-2.5"
        disabled={!bereit || laeuft}
        onClick={absenden}
      >
        {laeuft ? tc("loading") : t("submit")}
      </button>

      <p className="text-xs text-muted">
        {t("scope")}
      </p>
    </div>
  );
}
