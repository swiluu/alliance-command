"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import type { ActionResult } from "@/server/action-result";

/** Server Actions liefern ein Ergebnis; `void` erlaubt rein lokale Callbacks. */
type ActionFn = () => Promise<ActionResult<unknown> | void>;

type Runner = {
  run: (fn: ActionFn) => void;
  pending: boolean;
};

const ErrorCtx = createContext<(msg: string | null) => void>(() => {});

/**
 * Führt eine Server Action aus und hält Fehler fest. Server Actions sind die
 * einzige Schreibschnittstelle; ihre Berechtigungsprüfung läuft serverseitig,
 * hier geht es nur um Ladezustand und Fehleranzeige.
 */
export function useAction(): Runner {
  const [refreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const setError = useContext(ErrorCtx);
  const router = useRouter();

  const run = useCallback(
    (fn: ActionFn) => {
      setError(null);
      setBusy(true);
      void (async () => {
        try {
          const result = await fn();
          // Erwartbare Fehler kommen als Wert zurück – Next maskiert geworfene
          // Fehler in Produktion zu einem Digest ohne Meldung.
          if (result && result.ok === false) {
            setError(result.error);
            return;
          }
          startTransition(() => router.refresh());
        } catch (e) {
          setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
        } finally {
          setBusy(false);
        }
      })();
    },
    [router, setError],
  );

  return { run, pending: busy || refreshing };
}

/**
 * Optimistische Liste: die Änderung ist sofort sichtbar, das Speichern läuft
 * im Hintergrund. Ein Roundtrip plus Neuaufbau der Seite dauert ein paar
 * hundert Millisekunden – zu lang, um bei jedem Klick darauf zu warten.
 *
 * - Schlägt die Aktion fehl, springt die Liste auf die Serverdaten zurück und
 *   der Grund landet in der umgebenden ActionScope.
 * - Der Refresh kommt erst, wenn alle offenen Änderungen durch sind. Wer
 *   schnell zehn Zeilen umstellt, löst einen Refresh aus, nicht zehn.
 * - Serverdaten werden nur übernommen, solange nichts unterwegs ist – sonst
 *   würde eine verspätete Antwort eine neuere Änderung überschreiben.
 */
export function useOptimisticRows<T>(serverRows: T[]) {
  const setError = useContext(ErrorCtx);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [rows, setRows] = useState(serverRows);
  const inFlight = useRef(0);

  useEffect(() => {
    if (inFlight.current === 0) setRows(serverRows);
  }, [serverRows]);

  const mutate = useCallback(
    (
      optimistic: (current: T[]) => T[],
      action: () => Promise<ActionResult<unknown>>,
    ) => {
      setError(null);
      setRows(optimistic);
      inFlight.current += 1;

      void (async () => {
        try {
          const result = await action();
          if (result && result.ok === false) {
            setError(result.error);
            setRows(serverRows);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
          setRows(serverRows);
        } finally {
          inFlight.current -= 1;
          if (inFlight.current === 0) startTransition(() => router.refresh());
        }
      })();
    },
    [serverRows, router, setError],
  );

  return { rows, mutate };
}

/** Umschliesst einen Bereich und zeigt Fehler aus useAction() oben an. */
export function ActionScope({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <ErrorCtx.Provider value={setError}>
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-3 rounded border border-danger-dim bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-danger/70 hover:text-danger"
            aria-label="Fehler ausblenden"
          >
            ✕
          </button>
        </div>
      )}
      {children}
    </ErrorCtx.Provider>
  );
}

/** Button mit Bestätigungsdialog für alles, was Daten verändert oder löscht. */
export function ConfirmButton({
  label,
  title,
  message,
  onConfirm,
  className = "btn",
  confirmLabel = "Bestätigen",
  disabled,
}: {
  label: React.ReactNode;
  title: string;
  message: string;
  onConfirm: ActionFn;
  className?: string;
  confirmLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useAction();

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="panel my-auto w-full max-w-md p-5">
            <h2 className="text-lg mb-2">{title}</h2>
            <p className="text-sm text-muted whitespace-pre-line">{message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  run(onConfirm);
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
