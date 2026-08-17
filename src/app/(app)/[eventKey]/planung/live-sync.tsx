"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { planStand } from "@/server/actions/plan-sync-actions";

/**
 * Hält die Wochenplanung auf dem Stand der anderen.
 *
 * Geplant wird zu zweit. Bisher sah jeder nur seine eigenen Änderungen und
 * musste die Seite von Hand neu laden – mühsam und fehleranfällig, weil man
 * bis dahin auf einem veralteten Brett arbeitet.
 *
 * Der Abgleich fragt in kurzen Abständen nur nach einer Kurzform des Stands.
 * Weicht sie ab, lässt er die Seite ihre Daten neu holen; die Karte übernimmt
 * sie von selbst, sobald keine eigene Änderung unterwegs ist.
 *
 * Absichtlich kein dauerhafter Kanal: für zwei Leute an einem Brett wäre eine
 * offene Verbindung samt Weiterleitung mehr Aufwand und mehr Störquellen als
 * ein Abruf alle paar Sekunden.
 */

/** Wie oft nachgefragt wird, solange das Fenster im Vordergrund ist. */
const TAKT_MS = 4000;

export function LiveSync({
  eventKey,
  week,
  /** Während des Ziehens wird nicht neu geladen – das Brett würde wegrutschen. */
  paused,
}: {
  eventKey: string;
  week: number;
  paused: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("plan");
  const [fremdeAenderung, setFremdeAenderung] = useState(false);
  const stand = useRef<string | null>(null);
  const pausiert = useRef(paused);
  pausiert.current = paused;

  useEffect(() => {
    let gestoppt = false;
    let zeitgeber: ReturnType<typeof setTimeout>;

    const runde = async () => {
      // Im Hintergrund gar nicht fragen: ein Reiter, der seit Stunden offen
      // liegt, soll den Server nicht beschäftigen. Beim Zurückkehren gleicht
      // der Sichtbarkeitswechsel unten sofort ab.
      if (!gestoppt && !pausiert.current && document.visibilityState === "visible") {
        try {
          const neu = await planStand(eventKey, week);
          if (!gestoppt) {
            if (stand.current === null) {
              stand.current = neu;
            } else if (neu !== stand.current) {
              stand.current = neu;
              setFremdeAenderung(true);
              router.refresh();
            }
          }
        } catch {
          /* Ein misslungener Abruf ist kein Fehler wert – der nächste kommt. */
        }
      }
      if (!gestoppt) zeitgeber = setTimeout(runde, TAKT_MS);
    };

    const beiSichtbarkeit = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(zeitgeber);
        void runde();
      }
    };

    void runde();
    document.addEventListener("visibilitychange", beiSichtbarkeit);
    return () => {
      gestoppt = true;
      clearTimeout(zeitgeber);
      document.removeEventListener("visibilitychange", beiSichtbarkeit);
    };
  }, [eventKey, week, router]);

  // Der Hinweis verschwindet von selbst: er soll auffallen, aber nicht
  // weggeklickt werden müssen.
  useEffect(() => {
    if (!fremdeAenderung) return;
    const t = setTimeout(() => setFremdeAenderung(false), 3000);
    return () => clearTimeout(t);
  }, [fremdeAenderung]);

  return (
    <span
      className={`tag transition-opacity ${
        fremdeAenderung ? "border-ok/60 text-ok opacity-100" : "opacity-60"
      }`}
      title={t("liveTitle")}
      aria-live="polite"
    >
      {fremdeAenderung ? t("liveUpdated") : t("liveOn")}
    </span>
  );
}
