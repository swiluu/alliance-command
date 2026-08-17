import "server-only";

import { prisma } from "@/lib/db";
import { vsNameKey } from "@/lib/vs";

/**
 * Punkte aus einem Screenshot der VS-Rangliste lesen.
 *
 * Die Erkennung selbst läuft in einem eigenen Dienst auf diesem Rechner
 * (eigener Ordner, Port 3920) – lokal, ohne fremden Anbieter, ohne Kosten, und
 * kein Bild verlässt den Server. Hier passiert nur zweierlei: den Dienst
 * fragen und die erkannten Namen dem Kader zuordnen.
 *
 * Die Zuordnung nutzt denselben Schlüssel wie der Excel-Import. Das ist
 * wichtig, weil die Erkennung Sonderzeichen verschluckt: aus „Enderメ“ wird
 * „Ender“, aus „Mane 武“ wird „Mane“. Der Schlüssel wirft genau solche
 * Zierzeichen ohnehin weg, deshalb treffen diese Fälle trotzdem.
 *
 * Was hier nicht passiert: speichern. Das Ergebnis ist ein Vorschlag, den ein
 * Mensch prüft – eine falsch gelesene Ziffer wäre in der Wertung sonst nicht
 * mehr zu finden.
 */

type RohEintrag = {
  name: string;
  punkte: number;
  sicher: number;
  sicherName: number;
  sicherPunkte: number;
  kasten: { x: number; y: number; b: number; h: number };
};

type RohAntwort = {
  eintraege: RohEintrag[];
  roh: string[];
  breite: number;
  hoehe: number;
};

const DIENST = process.env.OCR_URL ?? "http://127.0.0.1:3920";
/** Erkennung dauert rund 17 s je Bild; das Limit lässt Luft für grosse Bilder. */
const ZEITLIMIT_MS = 120_000;

export type OcrTreffer = {
  /** Name, wie ihn die Erkennung gelesen hat. */
  gelesen: string;
  punkte: number;
  /** Zuversicht der Erkennung, 0–1 – der schwächere der beiden Teile. */
  sicher: number;
  /** Zuversicht für den Namen allein. */
  sicherName: number;
  /** Zuversicht für die Punktzahl allein – der gefährlichere Teil. */
  sicherPunkte: number;
  /** Zugeordneter Kadereintrag, falls gefunden. */
  playerId: string | null;
  playerName: string | null;
  /** Über einen gespeicherten Alias gefunden statt über den Namen selbst. */
  ueberAlias: boolean;
  /** Nur über die Anfangsbuchstaben erschlossen – bitte nachsehen. */
  geraten: boolean;
  /** Fläche im Bild, aus der diese Zeile stammt – für den Ausschnitt. */
  kasten: { x: number; y: number; b: number; h: number };
};

export type OcrErgebnis = {
  ok: boolean;
  fehler?: string;
  dauer?: number;
  treffer: OcrTreffer[];
  /** Alle erkannten Zeilen, ungefiltert – damit sichtbar wird, was der
   *  Deuter übersehen hat, statt dass man raten muss. */
  roh: string[];
  /** Masse des gelesenen Bildes – der Ausschnitt rechnet damit. */
  breite?: number;
  hoehe?: number;
};

/**
 * Die Erkenner wecken.
 *
 * Sie schalten sich nach zwanzig Minuten Ruhe ab, weil die Erkennung an einem
 * Tag der Woche gebraucht wird und sonst knapp vier Gigabyte für nichts
 * belegen würde. Das Wecken kostet rund sieben Sekunden – deshalb geschieht es
 * beim Öffnen der Erfassungsseite und nicht erst beim Hochladen: bis jemand
 * seine Screenshots ausgewählt hat, stehen sie längst wieder.
 *
 * Fehler bleiben ohne Folgen: klappt das Wecken nicht, lädt der erste Auftrag
 * die Modelle eben selbst nach.
 */
export async function weckeErkenner(): Promise<void> {
  try {
    await fetch(`${DIENST}/aufwecken`, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
  } catch {
    /* Beiwerk – niemals die Seite daran hindern. */
  }
}

/**
 * Lädt Kader und Aliasse einmal und liefert die Zuordnungsfunktion zurück.
 *
 * Einmal statt je Bild: bei siebzehn Screenshots wären es sonst siebzehn
 * Abfragen für dieselbe Liste.
 */
async function ladeZuordner(): Promise<(e: RohEintrag) => OcrTreffer> {
  const kader = await prisma.player.findMany({
    where: { leftAt: null },
    select: { id: true, name: true },
  });
  const aliasse = await prisma.playerAlias.findMany({ select: { key: true, playerId: true } });

  const nachName = new Map(kader.map((p) => [vsNameKey(p.name), p]));
  const nachAlias = new Map(aliasse.map((a) => [a.key, a.playerId]));
  const nameVon = new Map(kader.map((p) => [p.id, p.name]));

  /**
   * Zweiter Anlauf für Namen mit Zierzeichen am Ende.
   *
   * Die Erkennung macht aus „Viktoriaღ" ein „Viktoriam" – das Zeichen wird zu
   * einem Buchstaben statt zu nichts. Der Schlüssel des Kadernamens ist dann
   * ein Anfangsstück des gelesenen. Erlaubt sind bis zu zwei Zusatzzeichen,
   * und der Treffer muss eindeutig sein.
   *
   * Geprüft: im Kader gibt es dafür keine einzige Überschneidung. „SE KO" und
   * „SO KO" bleiben getrennt, weil keines Anfang des anderen ist. Trotzdem
   * wird ein solcher Treffer als geraten gekennzeichnet – er soll gesehen,
   * nicht geglaubt werden.
   */
  function ueberAnfang(schluessel: string) {
    if (schluessel.length < 5) return null;
    const kandidaten = kader.filter((p) => {
      const k = vsNameKey(p.name);
      return k.length >= 4 && schluessel.startsWith(k) && schluessel.length - k.length <= 2;
    });
    return kandidaten.length === 1 ? kandidaten[0] : null;
  }

  return (e) => {
    const schluessel = vsNameKey(e.name);
    const direkt = nachName.get(schluessel);
    const aliasId = direkt ? null : (nachAlias.get(schluessel) ?? null);
    const erraten = direkt || aliasId ? null : ueberAnfang(schluessel);

    return {
      gelesen: e.name,
      punkte: e.punkte,
      sicher: e.sicher,
      sicherName: e.sicherName,
      sicherPunkte: e.sicherPunkte,
      playerId: direkt?.id ?? aliasId ?? erraten?.id ?? null,
      playerName:
        direkt?.name ?? (aliasId ? (nameVon.get(aliasId) ?? null) : null) ?? erraten?.name ?? null,
      ueberAlias: !direkt && aliasId !== null,
      geraten: erraten !== null,
      kasten: e.kasten,
    };
  };
}

/**
 * Mehrere Bilder auf einmal lesen.
 *
 * Wichtig für die Dauer: der Dienst verteilt einen Stapel auf mehrere
 * Prozesse. Siebzehn Screenshots einzeln geschickt dauern rund fünf Minuten,
 * gemeinsam gut eine – die Modelle werden dabei nicht siebzehnmal geladen.
 */
export async function leseVsBilder(bilderBase64: string[]): Promise<OcrErgebnis[]> {
  if (bilderBase64.length === 0) return [];

  let antwort: { bilder: RohAntwort[] };
  try {
    const res = await fetch(`${DIENST}/erkennen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bilder: bilderBase64 }),
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const fehler = text.slice(0, 300) || `HTTP ${res.status}`;
      return bilderBase64.map(() => ({ ok: false, fehler, treffer: [], roh: [] }));
    }
    antwort = await res.json();
  } catch (e) {
    const fehler = e instanceof Error ? e.message : String(e);
    return bilderBase64.map(() => ({ ok: false, fehler, treffer: [], roh: [] }));
  }

  const zuordner = await ladeZuordner();
  return antwort.bilder.map((b) => ({
    ok: true,
    treffer: b.eintraege.map((e) => zuordner(e)),
    roh: b.roh ?? [],
    breite: b.breite,
    hoehe: b.hoehe,
  }));
}

/** Einzelbild – für Aufrufer, die nur eines schicken. */
export async function leseVsBild(bildBase64: string): Promise<OcrErgebnis> {
  const [erg] = await leseVsBilder([bildBase64]);
  return erg ?? { ok: false, fehler: "keine Antwort", treffer: [], roh: [] };
}

/**
 * Eine von Hand getroffene Zuordnung merken.
 *
 * Wer einmal entschieden hat, dass „Vlnz“ zu „Vιɳz 爻“ gehört, soll das nicht
 * jede Woche neu entscheiden müssen. Gespeichert wird der normalisierte
 * Schlüssel, nicht die Schreibweise – dieselbe Tabelle, die schon der
 * Excel-Import nutzt.
 */
export async function merkeZuordnung(gelesen: string, playerId: string): Promise<void> {
  const key = vsNameKey(gelesen);
  if (!key) return;
  await prisma.playerAlias.upsert({
    where: { key },
    create: { key, playerId },
    update: { playerId },
  });
}
