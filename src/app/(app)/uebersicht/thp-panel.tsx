"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ActionScope, useAction } from "@/components/action";
import { importThpFromText, syncFromLastwarrank } from "@/server/actions/thp-actions";

export function ThpPanel({
  top5,
  canImport,
}: {
  top5: { id: string; name: string; thpRaw: string | null }[];
  canImport: boolean;
}) {
  const t = useTranslations("thp");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const { run, pending } = useAction();

  return (
    <ActionScope>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="text-lg">{t("heading")}</h2>
            <p className="text-xs text-muted">{t("source")}</p>
          </div>
          {canImport && (
            <div className="flex gap-1">
              <button
                type="button"
                className="btn text-xs"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await syncFromLastwarrank();
                    if (r.ok) {
                      setResult(
                        t("synced", { updated: r.data.updated }) +
                          (r.data.renamed ? t("renamed", { count: r.data.renamed }) : "") +
                          (r.data.unmatched.length
                            ? t("unmatched", { names: r.data.unmatched.join(", ") })
                            : ""),
                      );
                    }
                    return r;
                  })
                }
              >
                {t("sync")}
              </button>
              <button type="button" className="btn text-xs" onClick={() => setOpen(true)}>
                {t("paste")}
              </button>
            </div>
          )}
        </div>

        {result && (
          <p className="mx-3 mt-3 rounded border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">
            {result}
          </p>
        )}

        <ol className="p-3 space-y-1">
          {top5.map((p, i) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded border border-line bg-panel-2/50 px-2 py-1.5 text-sm"
            >
              <span className="font-display text-lg text-sand w-6">{i + 1}</span>
              <span className="flex-1 truncate">{p.name}</span>
              <span className="font-mono text-xs text-muted">{p.thpRaw}</span>
            </li>
          ))}
          {top5.length === 0 && (
            <li className="py-6 text-center text-sm text-muted">{t("none")}</li>
          )}
        </ol>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="panel my-auto w-full max-w-lg p-5">
            <h2 className="text-lg mb-1">{t("importHeading")}</h2>
            <p className="text-sm text-muted mb-3">
              {t("importHint")} <code className="font-mono">Enderメ;202.59M</code>
            </p>
            <textarea
              className="input font-mono text-xs h-48"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Enderメ;202.59M\nTom1388;201.83M"}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !text.trim()}
                onClick={() => {
                  setOpen(false);
                  run(async () => {
                    const r = await importThpFromText(text);
                    if (r.ok) {
                      setResult(
                        t("imported", { updated: r.data.updated }) +
                          (r.data.unmatched.length
                            ? t("unmatchedCount", { count: r.data.unmatched.length })
                            : ""),
                      );
                      setText("");
                    }
                    return r;
                  });
                }}
              >
                {t("importSubmit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ActionScope>
  );
}
