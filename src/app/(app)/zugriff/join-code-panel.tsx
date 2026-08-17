"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ActionScope, ConfirmButton, useAction } from "@/components/action";
import { clearJoinCode, rotateJoinCode } from "@/server/actions/registration-actions";

/**
 * Beitrittscode für die Selbstregistrierung.
 *
 * Er ist der einzige Beleg dafür, dass jemand in der Allianz ist: er steht in der
 * Allianz-Ankündigung im Spiel, und dorthin kommt nur, wer Mitglied ist.
 * Deshalb gehört er gewechselt, sobald jemand die Allianz verlässt.
 */
export function JoinCodePanel({
  code,
  mitglieder,
}: {
  code: string | null;
  mitglieder: { name: string; username: string; seit: string }[];
}) {
  const t = useTranslations("join");
  const { run, pending } = useAction();
  const [kopiert, setKopiert] = useState(false);

  async function kopieren() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      /* ohne Clipboard-Recht bleibt Markieren */
    }
  }

  return (
    <ActionScope>
      <section className="panel">
        <div className="panel-head flex-wrap gap-2">
          <div>
            <h2 className="text-lg">{t("heading")}</h2>
            <p className="text-xs text-muted">{t("hint")}</p>
          </div>
        </div>

        <div className="p-3 space-y-3">
          {code ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="select-all rounded border border-sand-dim bg-sand/10 px-3 py-2 font-mono text-lg tracking-[0.3em] text-sand">
                {code}
              </code>
              <button type="button" className="btn text-xs" onClick={kopieren}>
                {kopiert ? t("copied") : t("copy")}
              </button>
              <button
                type="button"
                className="btn text-xs"
                disabled={pending}
                onClick={() => run(() => rotateJoinCode())}
                title={t("rotateTitle")}
              >
                {t("rotate")}
              </button>
              <ConfirmButton
                className="btn btn-danger text-xs"
                label={t("disable")}
                title={t("disableTitle")}
                message={t("disableMessage")}
                confirmLabel={t("disable")}
                onConfirm={() => clearJoinCode()}
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">{t("off")}</span>
              <button
                type="button"
                className="btn btn-primary text-xs"
                disabled={pending}
                onClick={() => run(() => rotateJoinCode())}
              >
                {t("generate")}
              </button>
            </div>
          )}

          {code && (
            <p className="text-xs text-muted">{t("codeHint")}</p>
          )}

          <div>
            <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">
              {t("selfCreated")}
              <span className="ml-2 font-mono">{mitglieder.length}</span>
            </h3>
            {mitglieder.length === 0 ? (
              <p className="text-xs text-muted">{t("nobodyYet")}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {mitglieder.map((m) => (
                  <li key={m.username} className="tag" title={t("since", { date: m.seit })}>
                    {m.name}
                    <span className="ml-1 font-mono opacity-70">{m.username}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </ActionScope>
  );
}
