"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import {
  leseVsScreenshot,
  merkeOcrZuordnung,
  weckeTexterkennung,
} from "@/server/actions/vs-actions";

type Player = { id: string; name: string; inRoster: boolean };

type Treffer = {
  gelesen: string;
  punkte: number;
  sicher: number;
  sicherName: number;
  sicherPunkte: number;
  playerId: string | null;
  playerName: string | null;
  ueberAlias: boolean;
  geraten: boolean;
  kasten: { x: number; y: number; b: number; h: number };
  /** Aus welchem der hochgeladenen Bilder diese Zeile stammt. */
  bild: number;
};

/** Ein hochgeladenes Bild, im Browser behalten – nur für die Ausschnitte. */
type Quelle = { url: string; breite: number; hoehe: number };

/**
 * Punkte aus Screenshots der Rangliste übernehmen.
 *
 * Grundsatz: der Knopf füllt nur die Eingabefelder. Gespeichert wird wie
 * bisher erst mit „Woche speichern“, und zwar von Hand. Eine Erkennung, die
 * still in die Datenbank schreibt, wäre bei einer falsch gelesenen Ziffer
 * nicht mehr zu finden – die Zahl sähe plausibel aus und stünde vier Wochen
 * lang im Schnitt.
 *
 * Deshalb steht zwischen Bild und Feldern immer diese Prüfliste: erkannter
 * Name, zugeordneter Spieler, Punktzahl. Was nicht zugeordnet werden konnte,
 * ist rot und bekommt eine Auswahlliste; die Wahl lässt sich merken, dann
 * sitzt sie beim nächsten Mal von selbst.
 */
export function VsScan({
  players,
  onUebernehmen,
}: {
  players: Player[];
  /** Übergibt die geprüften Werte an das Formular – dort landen sie in den Feldern. */
  onUebernehmen: (werte: { playerId: string; punkte: number }[]) => void;
}) {
  const t = useTranslations("vs");
  const eingabe = useRef<HTMLInputElement>(null);

  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [roh, setRoh] = useState<string[]>([]);
  const [rohOffen, setRohOffen] = useState(false);
  const [bilder, setBilder] = useState(0);
  const [quellen, setQuellen] = useState<Quelle[]>([]);
  const [offenerAusschnitt, setOffenerAusschnitt] = useState<number | null>(null);
  const [fensterOffen, setFensterOffen] = useState(false);

  const kader = players.filter((p) => p.inRoster);

  // Beim Öffnen der Seite die Erkennung vorwärmen. Sie schläft ausserhalb der
  // Erfassungstage, und das Wecken dauert rund sieben Sekunden – die soll
  // niemand nach dem Hochladen absitzen.
  useEffect(() => {
    void weckeTexterkennung();
  }, []);

  async function dateienLesen(dateien: FileList | File[] | null) {
    if (!dateien || dateien.length === 0) return;
    setLaeuft(true);
    setFehler(null);

    // Nacheinander: der Erkennungsdienst arbeitet ein Bild nach dem anderen ab,
    // und so bleibt die Reihenfolge der Rangliste erhalten.
    const gesammelt: Treffer[] = [...treffer];
    const rohZeilen: string[] = [...roh];
    const neueQuellen: Quelle[] = [...quellen];
    let gelesen = 0;

    // Alle Bilder in einem Zug: der Dienst verteilt sie auf mehrere Prozesse.
    // Nacheinander geschickt wäre jedes Bild sein eigener Ladevorgang.
    const liste = Array.from(dateien);
    const fd = new FormData();
    for (const datei of liste) fd.append("bild", datei);

    const antwort = await leseVsScreenshot(fd);
    if (!antwort.ok) {
      setFehler(antwort.error ?? t("scanFailed"));
      setLaeuft(false);
      if (eingabe.current) eingabe.current.value = "";
      return;
    }

    antwort.data.forEach((ergebnis, nr) => {
      gelesen++;
      rohZeilen.push(...ergebnis.roh);

      // Das Bild bleibt im Browser, damit sich der Ausschnitt zu jeder Zeile
      // zeigen lässt. Es wandert dafür nicht noch einmal über die Leitung.
      const bildNr = neueQuellen.length;
      neueQuellen.push({
        url: URL.createObjectURL(liste[nr]),
        breite: ergebnis.breite ?? 0,
        hoehe: ergebnis.hoehe ?? 0,
      });

      for (const roher of ergebnis.treffer) {
        const neu = { ...roher, bild: bildNr };
        // Derselbe Spieler in zwei Bildern: der erste Fund gilt. Ranglisten
        // überlappen sich beim Abfotografieren fast immer um ein paar Zeilen.
        const schonDa = gesammelt.some(
          (v) =>
            (neu.playerId && v.playerId === neu.playerId) ||
            (!neu.playerId && v.gelesen === neu.gelesen),
        );
        if (!schonDa) gesammelt.push(neu);
      }
    });

    setTreffer(gesammelt);
    setRoh(rohZeilen);
    setQuellen(neueQuellen);
    setBilder((b) => b + gelesen);
    setLaeuft(false);
    if (eingabe.current) eingabe.current.value = "";
  }

  function setzeZuordnung(index: number, playerId: string) {
    setTreffer((cur) =>
      cur.map((tr, i) =>
        i === index
          ? {
              ...tr,
              playerId: playerId || null,
              playerName: players.find((p) => p.id === playerId)?.name ?? null,
              ueberAlias: false,
              geraten: false,
            }
          : tr,
      ),
    );
  }

  function setzePunkte(index: number, roh: string) {
    const zahl = Number(roh.replace(/\D/g, ""));
    setTreffer((cur) => cur.map((tr, i) => (i === index ? { ...tr, punkte: zahl } : tr)));
  }

  const zugeordnet = treffer.filter((tr) => tr.playerId);
  const offen = treffer.length - zugeordnet.length;

  return (
    <section className="panel">
      <div className="panel-head flex-wrap gap-2">
        <div>
          <h2 className="text-lg">
            <span aria-hidden className="mr-1">
              📷
            </span>
            {t("scanHeading")}
          </h2>
          <p className="text-xs text-muted">{t("scanHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          {treffer.length > 0 && (
            <button
              type="button"
              className="tag hover:border-sand-dim hover:text-sand"
              onClick={() => {
                quellen.forEach((q) => URL.revokeObjectURL(q.url));
                setQuellen([]);
                setTreffer([]);
                setRoh([]);
                setBilder(0);
                setFehler(null);
                setOffenerAusschnitt(null);
              }}
            >
              {t("scanReset")}
            </button>
          )}
          <button
            type="button"
            className="btn text-sm"
            disabled={laeuft}
            onClick={() => setFensterOffen(true)}
          >
            {t("scanPaste")}
          </button>
          <label className={`btn text-sm ${laeuft ? "opacity-60" : "cursor-pointer"}`}>
            <input
              ref={eingabe}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={laeuft}
              onChange={(e) => dateienLesen(e.target.files)}
            />
            {laeuft ? t("scanRunning") : t("scanPick")}
          </label>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {laeuft && <p className="text-sm text-muted">{t("scanRunningHint")}</p>}

        {fehler && (
          <p className="rounded border border-danger/60 bg-danger/10 px-3 py-2 text-sm text-danger">
            {fehler}
          </p>
        )}

        {treffer.length > 0 && (
          <>
            <p className="text-xs text-muted">
              {t("scanSummary", { bilder, gefunden: treffer.length, offen })}
            </p>

            <ul className="divide-y divide-line/60 rounded border border-line">
              {treffer.map((tr, i) => (
                <li
                  key={`${tr.gelesen}-${i}`}
                  className={`px-3 py-2 ${tr.playerId ? "" : "bg-danger/5"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="w-32 shrink-0 truncate font-mono text-[11px] text-muted"
                    title={t("scanRead", { name: tr.gelesen })}
                  >
                    {tr.gelesen}
                  </span>

                  <select
                    className="input min-w-0 flex-1 py-1 text-sm"
                    value={tr.playerId ?? ""}
                    onChange={(e) => setzeZuordnung(i, e.target.value)}
                  >
                    <option value="">{t("scanUnmatched")}</option>
                    {kader.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>

                  <input
                    className="input w-36 py-1 text-right font-mono text-sm"
                    inputMode="numeric"
                    value={String(tr.punkte).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
                    onChange={(e) => setzePunkte(i, e.target.value)}
                  />

                  {/* Merken nur anbieten, wenn die Zuordnung von Hand kam und
                      der gelesene Name vom Kadernamen abweicht. */}
                  {tr.playerId && !tr.ueberAlias && tr.playerName !== tr.gelesen && (
                    <button
                      type="button"
                      className="tag hover:border-sand-dim hover:text-sand"
                      title={t("scanRememberTitle", {
                        gelesen: tr.gelesen,
                        name: tr.playerName ?? "",
                      })}
                      onClick={() => merkeOcrZuordnung(tr.gelesen, tr.playerId!)}
                    >
                      {t("scanRemember")}
                    </button>
                  )}
                  {tr.ueberAlias && <span className="tag">{t("scanViaAlias")}</span>}
                  {tr.geraten && (
                    <span className="tag border-sand text-sand" title={t("scanGuessedTitle")}>
                      {t("scanGuessed")}
                    </span>
                  )}
                  {/* Die Zahl zuerst und in Rot: eine falsch gelesene
                      Punktzahl sieht plausibel aus und wäre später nicht mehr
                      auffindbar. Ein wackliger Name fällt dagegen schon in der
                      Auswahlliste daneben auf. Abgerundet, damit unter der
                      Schwelle nie "90 %" steht. */}
                  {tr.sicherPunkte < 0.9 && (
                    <span
                      className="tag border-danger text-danger"
                      title={t("scanLowPointsTitle")}
                    >
                      {t("scanLowPoints", { prozent: Math.floor(tr.sicherPunkte * 100) })}
                    </span>
                  )}
                  {tr.sicherPunkte >= 0.9 && tr.sicherName < 0.9 && (
                    <span className="tag" title={t("scanLowNameTitle")}>
                      {t("scanLowName", { prozent: Math.floor(tr.sicherName * 100) })}
                    </span>
                  )}

                  {/* Zu jeder Zeile abrufbar, nicht nur zu den unsicheren:
                      manchmal will man auch eine sichere gegenprüfen. */}
                  {quellen[tr.bild] && (
                    <button
                      type="button"
                      className="tag hover:border-sand-dim hover:text-sand"
                      aria-expanded={offenerAusschnitt === i}
                      title={t("scanCropTitle")}
                      onClick={() => setOffenerAusschnitt(offenerAusschnitt === i ? null : i)}
                    >
                      🔍
                    </button>
                  )}
                  </div>

                  {/* Bei unsicherer Zahl von selbst offen – dort ist das
                      Nachsehen keine Kür, sondern der Zweck der Warnung. */}
                  {quellen[tr.bild] &&
                    (offenerAusschnitt === i || tr.sicherPunkte < 0.9) && (
                      <div className="mt-2">
                        <Ausschnitt quelle={quellen[tr.bild]} kasten={tr.kasten} />
                      </div>
                    )}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="text-[11px] text-muted hover:text-sand"
                onClick={() => setRohOffen((v) => !v)}
              >
                {rohOffen ? t("scanRawHide") : t("scanRawShow", { count: roh.length })}
              </button>

              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={zugeordnet.length === 0}
                onClick={() =>
                  onUebernehmen(
                    zugeordnet.map((tr) => ({ playerId: tr.playerId!, punkte: tr.punkte })),
                  )
                }
              >
                {t("scanApply", { count: zugeordnet.length })}
              </button>
            </div>

            {rohOffen && (
              <pre className="max-h-64 overflow-auto rounded border border-line bg-panel-2/60 p-2 text-[11px] leading-relaxed whitespace-pre-wrap">
                {roh.join("\n")}
              </pre>
            )}
          </>
        )}
      </div>

      {fensterOffen && (
        <EinfuegeFenster
          onSchliessen={() => setFensterOffen(false)}
          onBilder={(dateien) => {
            setFensterOffen(false);
            dateienLesen(dateien);
          }}
        />
      )}
    </section>
  );
}

/**
 * Der Bildausschnitt zu einer erkannten Zeile.
 *
 * Zeigt genau den Streifen, aus dem Name und Zahl gelesen wurden – wer eine
 * unsichere Zahl prüfen will, soll nicht im Originalbild danach suchen müssen.
 *
 * Zugeschnitten wird mit dem Hintergrundbild statt mit einer Leinwand: das
 * Bild liegt im Browser bereits vor, und so bleibt es bei reinem Rechnen mit
 * Zahlen, ohne es ein zweites Mal zu zeichnen oder zu übertragen.
 */
function Ausschnitt({
  quelle,
  kasten,
  breite = 340,
}: {
  quelle: Quelle;
  kasten: { x: number; y: number; b: number; h: number };
  breite?: number;
}) {
  if (!quelle.breite || !kasten.b) return null;
  const massstab = breite / kasten.b;

  return (
    <div
      className="overflow-hidden rounded border border-line bg-panel-2"
      style={{
        width: breite,
        height: Math.round(kasten.h * massstab),
        backgroundImage: `url(${quelle.url})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${quelle.breite * massstab}px ${quelle.hoehe * massstab}px`,
        backgroundPosition: `-${kasten.x * massstab}px -${kasten.y * massstab}px`,
      }}
    />
  );
}

/**
 * Fenster zum Einfügen aus der Zwischenablage.
 *
 * Am Rechner ist das der kürzeste Weg: Screenshot machen, Strg+V, fertig –
 * ohne Umweg über Speichern und Dateiauswahl. Das Fenster hört auf das
 * Einfügen im ganzen Dokument, nicht nur auf einem Feld: Browser liefern das
 * Ereignis je nach Fokus an unterschiedliche Stellen, und ein leeres
 * Textfeld, in das man erst klicken muss, wäre eine Stolperstelle.
 *
 * Ziehen und Ablegen geht ebenso – manche kopieren die Datei statt das Bild.
 */
function EinfuegeFenster({
  onSchliessen,
  onBilder,
}: {
  onSchliessen: () => void;
  onBilder: (dateien: FileList | File[]) => void;
}) {
  const t = useTranslations("vs");
  const [gesammelt, setGesammelt] = useState<File[]>([]);
  const [vorschau, setVorschau] = useState<string[]>([]);

  function nimmDateien(dateien: File[]) {
    const bilder = dateien.filter((d) => d.type.startsWith("image/"));
    if (bilder.length === 0) return;
    setGesammelt((cur) => [...cur, ...bilder]);
    setVorschau((cur) => [...cur, ...bilder.map((b) => URL.createObjectURL(b))]);
  }

  useEffect(() => {
    function beimEinfuegen(e: ClipboardEvent) {
      const teile = Array.from(e.clipboardData?.items ?? []);
      const dateien = teile
        .filter((x) => x.kind === "file")
        .map((x) => x.getAsFile())
        .filter((x): x is File => x !== null);
      if (dateien.length === 0) return;
      e.preventDefault();
      nimmDateien(dateien);
    }
    function beiTaste(e: KeyboardEvent) {
      if (e.key === "Escape") onSchliessen();
    }
    document.addEventListener("paste", beimEinfuegen);
    document.addEventListener("keydown", beiTaste);
    return () => {
      document.removeEventListener("paste", beimEinfuegen);
      document.removeEventListener("keydown", beiTaste);
    };
  }, [onSchliessen]);

  // Vorschaubilder wieder freigeben, sonst hält der Browser sie bis zum
  // Verlassen der Seite fest.
  useEffect(() => () => vorschau.forEach((u) => URL.revokeObjectURL(u)), [vorschau]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4"
      onClick={onSchliessen}
    >
      <div
        className="panel my-auto w-full max-w-lg p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          nimmDateien(Array.from(e.dataTransfer.files));
        }}
      >
        <div>
          <h3 className="text-lg">{t("pasteHeading")}</h3>
          <p className="mt-1 text-xs text-muted">{t("pasteHint")}</p>
        </div>

        <div className="grid min-h-[9rem] place-items-center rounded border border-dashed border-line bg-panel-2/40 p-4">
          {gesammelt.length === 0 ? (
            <p className="text-center text-sm text-muted">
              <span aria-hidden className="mb-1 block text-2xl">
                📋
              </span>
              {t("pasteEmpty")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {vorschau.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={u}
                  src={u}
                  alt={t("pasteThumb", { nr: i + 1 })}
                  className="h-20 w-20 rounded border border-line object-cover"
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {gesammelt.length > 0 && (
            <button
              type="button"
              className="mr-auto text-xs text-muted hover:text-danger"
              onClick={() => {
                vorschau.forEach((u) => URL.revokeObjectURL(u));
                setGesammelt([]);
                setVorschau([]);
              }}
            >
              {t("pasteClear")}
            </button>
          )}
          <button type="button" className="btn text-sm" onClick={onSchliessen}>
            {t("pasteCancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={gesammelt.length === 0}
            onClick={() => onBilder(gesammelt)}
          >
            {t("pasteRead", { count: gesammelt.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
