import "server-only";

/**
 * Serverstellung der Allianz.
 *
 * Beantwortet die Frage, die im Dashboard bisher nirgends vorkam: wo stehen
 * wir eigentlich? Die interne Rangliste zeigt, wer im Kader vorn liegt – nicht
 * aber, dass dieser Kader die stärkste Allianz des Servers stellt.
 *
 * Die Daten kommen aus dem eigenen lastwarrank, über dessen JSON-Schnittstelle
 * und nicht aus dessen HTML. Fällt die Quelle aus, bleibt die Seite bedienbar
 * und sagt das offen – sie ist Beiwerk, kein Betriebsmittel.
 */

const BASIS = process.env.LWR_BASE_URL ?? "https://lastwarrank.com";
const ZEITLIMIT_MS = 8000;
/** Die Quelle wird täglich aufgefrischt; öfter zu fragen bringt nichts. */
const FRISCHE_S = 3600;

export type AllianzZeile = {
  id: string;
  name: string;
  tag: string | null;
  /** Gesamtmacht in absoluten Zahlen. */
  wert: number;
};

export type Diagramm = {
  title: string;
  currentValue: number | null;
  serverRank: number | null;
  growth4w: number | null;
  points: { week_start: string; value: number }[];
};

export type Aufsteiger = {
  title: string;
  rows: {
    name: string;
    start_value: number;
    end_value: number;
    delta: number;
    delta_pct: number;
  }[];
};

export type Serverstellung = {
  /** Alle Allianzen des Servers nach Macht, stärkste zuerst. */
  allianzen: AllianzZeile[];
  /** Platz der eigenen Allianz, 1 = stärkste. */
  platz: number | null;
  /** Vorsprung auf die nächste bzw. Rückstand auf die vorige, in Prozent. */
  abstand: number | null;
  /** Wie viele der Server-Top-10 aus dem eigenen Kader kommen, je Kennzahl. */
  spitze: { titel: string; unsere: number; von: number; namen: string[] }[];
  /** Kennzahlen der eigenen Allianz samt Verlauf. */
  kennzahlen: Diagramm[];
  aufsteiger: Aufsteiger[];
  mitglieder: { anzahl: number | null; maximum: number | null };
  stand: string | null;
};

async function hole<T>(pfad: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASIS}${pfad}`, {
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
      headers: { "User-Agent": "alliance-command/serverstellung" },
      next: { revalidate: FRISCHE_S },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const zahl = (v: unknown) => Number(String(v ?? "").replace(/\D/g, "")) || 0;

export async function getServerstellung(
  serverId: number,
  allianzTag: string,
  /** Namen des eigenen Kaders – für die Frage, wie viele der Spitze uns gehören. */
  kaderNamen: string[],
): Promise<Serverstellung | null> {
  type ServerAntwort = {
    lastUpdate: string | null;
    sections: { title: string; rows: Record<string, unknown>[] }[];
  };
  const server = await hole<ServerAntwort>(`/api/server/${serverId}`);
  if (!server) return null;

  const machtAbschnitt = server.sections.find((s) => /Alliance Power/i.test(s.title));
  const allianzen: AllianzZeile[] = (machtAbschnitt?.rows ?? []).map((r) => ({
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    tag: (r.tag as string) ?? null,
    wert: zahl(r.value),
  }));

  const eigenerIndex = allianzen.findIndex(
    (a) => a.tag?.toLowerCase() === allianzTag.toLowerCase(),
  );
  const platz = eigenerIndex >= 0 ? eigenerIndex + 1 : null;

  // Auf Platz eins zählt der Vorsprung nach unten, sonst der Rückstand nach oben.
  let abstand: number | null = null;
  if (eigenerIndex === 0 && allianzen[1]?.wert) {
    abstand = (allianzen[0].wert / allianzen[1].wert - 1) * 100;
  } else if (eigenerIndex > 0) {
    abstand = -(1 - allianzen[eigenerIndex].wert / allianzen[eigenerIndex - 1].wert) * 100;
  }

  // Wie viele der Server-Top-10 gehören uns? Über die Kadernamen und nicht
  // über das Allianzkürzel der Quelle: das ist in diesen Zeilen leer.
  const kader = new Set(kaderNamen.map((n) => n.toLowerCase()));
  const spitze = server.sections
    .filter((s) => !/Alliance/i.test(s.title))
    .map((s) => {
      const zehn = s.rows.slice(0, 10);
      const unsere = zehn.filter((r) => kader.has(String(r.name ?? "").toLowerCase()));
      return {
        titel: s.title,
        unsere: unsere.length,
        von: zehn.length,
        namen: unsere.slice(0, 5).map((r) => String(r.name)),
      };
    })
    .filter((s) => s.von > 0);

  type AllianzAntwort = {
    memberCount: number | null;
    maxMembers: number | null;
    lastSeenAt: string | null;
    charts: Diagramm[];
    movers: Aufsteiger[];
  };
  const eigene =
    eigenerIndex >= 0 && allianzen[eigenerIndex].id
      ? await hole<AllianzAntwort>(`/api/alliance/${allianzen[eigenerIndex].id}`)
      : null;

  return {
    allianzen,
    platz,
    abstand,
    spitze,
    kennzahlen: eigene?.charts ?? [],
    aufsteiger: eigene?.movers ?? [],
    mitglieder: { anzahl: eigene?.memberCount ?? null, maximum: eigene?.maxMembers ?? null },
    stand: eigene?.lastSeenAt ?? server.lastUpdate,
  };
}
