# Alliance Command

Web-Dashboard für eine Allianz in **Last War: Survival**. Tritt an die Stelle
der üblichen Google-Sheets-Verwaltung und bildet die beiden taktischen Events
**Wüstensturm** und **Schluchtsturm** ab.

Welche Allianz und welcher Server – das wird beim Einrichten abgefragt und
steht danach in der `.env`. Im Code ist nichts davon fest eingetragen.

Die beiden taktischen Events teilen sich Datenmodell, Server-Logik und
Komponenten – getrennt werden sie ausschliesslich über das Feld `eventKey`.
Ein drittes taktisches Event ist damit Konfiguration, keine Implementierung.

Dazu gekommen sind Zug, VS-Auswertung, R2-Markierung, Bündnisse, Abwesenheit,
Spielerprofile und der Blick nach draussen: wo die Allianz auf ihrem Server
steht. Zweisprachig, deutsch und englisch, ohne Sprachpräfix in der Adresse.

---

## Stack

| | |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript, `src/`-Struktur |
| Styling | Tailwind CSS |
| Datenbank | Prisma ORM + SQLite (`prisma/dev.db`, keine externe DB nötig) |
| Auth | NextAuth.js, Credentials-Provider, Sessions in der Datenbank |
| Drag & Drop | `@dnd-kit` (funktioniert auch auf Touch, plus Tap-Fallback) |

Passwörter werden mit `bcryptjs` gehasht – die reine JS-Implementierung von
bcrypt, damit das Self-Hosting ohne native Build-Tools auskommt.

---

## Setup

```bash
git clone https://github.com/swiluu/alliance-command.git
cd alliance-command
./scripts/einrichten.sh
```

Das Skript fragt Allianz, Server, Datenquelle und das erste Konto ab, schreibt die `.env`,
installiert die Abhängigkeiten, legt die Datenbank an und baut die Anwendung. Danach:

```bash
npm run start
```

Ein erneuter Aufruf ist auch das Werkzeug zum **Ändern** der Einstellungen: die vorhandene
`.env` wird gelesen, ihre Werte stehen als Vorschlag bereit, und vor dem Überschreiben legt
das Skript eine Sicherung an. Für eine automatische Einrichtung alle Werte als
Umgebungsvariablen setzen und `--ohne-fragen` anhängen.

Von Hand geht es weiterhin:

```bash
npm install
cp .env.example .env      # danach .env ausfüllen, siehe unten
npx prisma db push        # Schema in die SQLite-Datei schreiben
npm run db:seed           # Superadmin + Event-Konfigurationen anlegen
npm run dev               # http://localhost:3000
```

### `.env`

| Variable | Bedeutung |
|---|---|
| `DATABASE_URL` | Pfad zur SQLite-Datei, relativ zu `prisma/` – Standard `file:./dev.db` |
| `NEXTAUTH_URL` | Basis-URL der Anwendung, ohne abschliessenden Slash |
| `NEXTAUTH_SECRET` | Zufälliger Wert, z.B. `openssl rand -base64 32` |
| `SEED_ADMIN_USER` | Benutzername des initialen Superadmins |
| `SEED_ADMIN_PASSWORD` | Passwort des initialen Superadmins (min. 8 Zeichen) |
| `SEED_ADMIN_NAME` | Anzeigename des initialen Superadmins |
| `NEXT_PUBLIC_ALLIANZ_TAG` | Kürzel im Spiel, z.B. `CoVs` – steht im Schriftzug, in den Bildern und in allen Oberflächentexten |
| `NEXT_PUBLIC_ALLIANZ_NAME` | Ausgeschriebener Name, z.B. `Concilium Venatoris` |
| `NEXT_PUBLIC_SERVER_ID` | Servernummer, z.B. `1580` |
| `LWR_BASE_URL` | Adresse der lastwarrank-Instanz, Standard `https://lastwarrank.com` |
| `LWR_ALLIANCE_ID` | Allianz-Kennung bei lastwarrank – ohne sie bleiben Serverstellung und Mitgliederabgleich leer |
| `THP_API_URL` | Optionaler Endpunkt für Hero-Power-Werte. Leer lassen → Paste-Import |
| `THP_SERVER_ID` | Server-ID für den THP-Abruf (setzt `einrichten.sh` auf dieselbe Nummer) |
| `DISCORD_ABSENCE_WEBHOOK` | Optional – Meldungen bei Abwesenheiten |
| `OCR_URL` | Optional – Erkennungsdienst für VS-Screenshots |

Die Allianz steht an genau einer Stelle im Code (`src/lib/allianz.ts`); die Oberflächentexte
bekommen Kürzel und Servernummer beim Laden der Sprachdateien eingesetzt
(`src/i18n/allianz-texte.ts`). In den Sprachdateien stehen dafür die Platzhalter `ALLY`
und `0000` – wer übersetzt, lässt beide unangetastet. Ohne Eintrag in der `.env` zeigt die
Oberfläche `ALLY · Server #0000`; dann wurde das Einrichten übersprungen.

`prisma/dev.db` steht in `.gitignore` und gehört nicht ins Repository.

---

## Erste Schritte

1. Mit dem Superadmin aus `.env` anmelden.
2. **Zugriffsverwaltung** öffnen und Konten für die Koordinatoren anlegen.
   In der Matrix Nutzer × Modul rotiert ein Klick die Stufe
   `kein Zugriff → nur lesen → bearbeiten`. Wer den Spieler-Stamm pflegen soll,
   braucht **Allianz-Verwaltung = bearbeiten** – Event-Rechte reichen dafür
   bewusst nicht.
3. Beim Anlegen vergibst du ein Startpasswort. **Der Besitzer muss es beim
   ersten Login selbst ersetzen** – bis dahin kommt er auf keine Seite ausser
   `/passwort`. Damit kennt niemand ausser ihm das laufende Passwort. In der
   Zugriffsmatrix markiert ein rotes `Erstpasswort`, wer den Wechsel noch vor
   sich hat. Ein Zurücksetzen durch einen Superadmin setzt die Pflicht erneut.
4. Optional die Altdaten importieren (siehe unten).
5. In **Wüstensturm → Wochenplanung** die Aufstellung bauen und am Ende der
   Woche „Woche abschliessen“ auslösen.

### Wöchentlicher Ablauf

1. Spieler melden sich in der **Spielerliste** an bzw. ab.
   Gesperrte Spieler können ihren Status nicht ändern – serverseitig erzwungen.
2. In der **Team-Zuteilung** steht jeder Angemeldete nach Priorität sortiert
   mit drei Knöpfen: `Team A`, `Team B` oder `–`. „–“ heisst aussetzen.
3. Der Koordinator verteilt in der **Wochenplanung** die Positionen innerhalb
   des Teams – Team A links, Team B rechts, jeweils mit dem eigenen Kader
   (20 Hauptpositionen + 10 Ersatz je Team).
4. Nach dem Event wird in der **Rotations-Historie** eingetragen, wer trotz
   Anmeldung gefehlt hat („Fehlt (angemeldet)“).
5. **Woche abschliessen** schreibt die Aufstellung in die Historie, zählt die
   Woche hoch, vergibt automatisch 2-Wochen-Sperren für alle Fehlenden, leert
   die Aufstellung und setzt alle Anmeldungen zurück.

Abgelaufene Sperren fallen automatisch, sobald die aktuelle Woche über der
Ablaufwoche liegt – geprüft bei jedem Seitenaufruf, kein Cronjob nötig.

---

## Test- und Live-System

Zwei getrennte Installationen mit **eigenen Datenbanken**:

| | Testsystem | Live |
|---|---|---|
| Ordner | `$DEV` | `$LIVE` |
| Adresse | eigene Test-Adresse | `$LIVE_URL` |
| Zweig | `dev` | `main` |
| pm2 | `$PM2_DEV` | `$PM2_LIVE` |

Wo das jeweils liegt, steht in `scripts/betrieb.conf` (Vorlage:
`scripts/betrieb.conf.example`). Die Datei ist von der Versionsverwaltung
ausgenommen – Pfade und Prozessnamen gehören zum Server, nicht ins Repository.

Übernommen wird ausschliesslich **Code**, nie Daten:

```bash
./scripts/promote-to-live.sh "Beschreibung der Änderung"
```

Das Skript schreibt im Testsystem fest, holt den Zweig auf Live, **sichert die
Datenbank**, trägt fehlende Pflichtspalten nach, gleicht das Schema ab, baut und
startet neu. Scheitert der Bau oder der Abgleich, bleibt Live auf dem alten
Stand. Was im Testsystem an Daten entsteht, bleibt dort – `.env`, `prisma/*.db`
und `backups/` sind über `.gitignore` ausgeschlossen.

Zwei Fallstricke, beide behoben, aber merkenswert:

- `prisma db push` **verweigert** eine Pflichtspalte ohne Vorgabewert, sobald
  die Tabelle Zeilen hat, und bietet nur `--force-reset` an – das löscht alles.
  Dafür gibt es `scripts/db-vorbereiten.ts`.
- `DATABASE_URL` ist relativ (`file:./dev.db`) und gilt ab dem `prisma`-Ordner.
  Ein Aufruf, der von woanders aus auflöst, legt still eine leere Datenbank an.
  Für Sicherungen deshalb `scripts/backup.ts` benutzen.

---

## Zugriffsrechte

Drei Quellen, die zusammenwirken:

**Die Rolle** gibt jedem selbst registrierten Konto ein garantiertes Leserecht
auf Wüstensturm, Schluchtsturm, VS-Auswertung und Allianz-Verwaltung. Das
erspart es, für hundert Konten Zeilen zu pflegen.

**Der Rang** entscheidet über die Leitungsteile. Ohne R4 bleibt es in den
Events bei der Wochenplanung; mit R4 kommen alle Reiter dazu, dazu Fixplätze,
Aktivitätsprotokoll, lesender Zugriff auf den Zug und Bearbeiten der
R2-Markierung. Zug und R2-Markierung hängen **allein** am Rang – eine Stufe in
der Matrix ersetzt ihn nicht.

**Die Matrix** kann darüber hinaus mehr geben, aber nichts wegnehmen: das
Grundrecht aus der Rolle ist eine Untergrenze.

Gerechnet wird das an genau einer Stelle (`stufenAus()` in `src/lib/access.ts`).
Wächter und Zugriffsverwaltung fragen dieselbe Funktion – vorher rechnete die
Anzeige mit einer eigenen Kopie der Regeln und zeigte Stufen an, die nicht
galten.

Notizen am Spieler sind Führungsdaten und werden **serverseitig** entfernt, wenn
der Betrachter keinen R4-Rang hat; blosses Ausblenden hätte sie in den
Seitendaten stehen lassen.

---

## Module

| Modul | Inhalt |
|---|---|
| **Übersicht** | Beide Events nebeneinander, Fixplätze, THP-Top-5, Bündnisse, „Woche der Allianz“, gemeinsamer Aktivitäts-Feed, Warnung bei Abweichungen zur Mitgliederliste |
| **Mein Profil** | Der eigene Spieler in einem Klick – dieselbe Seite wie jedes Spielerprofil |
| **Serverstellung** | Wo die eigene Allianz im Vergleich der Allianzen des Servers steht, Anteil an der Serverspitze, Verlauf über vierzehn Wochen |
| **Wüstensturm** | Team-Zuteilung, Wochenplanung (Battle-Map), Ankündigung, Spielerliste, Rotations-Historie, Bann-Tracker, Fixplätze |
| **Schluchtsturm** | Dasselbe, mit eigenem Positionslayout inkl. Freischaltzeiten und Jäger-Pflicht |
| **Zug** | KW-Plan (geplanter/tatsächlicher Zugführer, VIP mit Anrecht aus der VS-Auswertung), R4-Rotationsliste, Zähler, Aushang mit Fahrplan und VS-Top-20-Bild |
| **VS-Auswertung** | Wochenpunkte aus dem VS-Duell, Vier-Wochen-Schnitt, Top 20 und VIP-Anrecht; Erfassung von Hand, per Excel-Import oder **aus Screenshots** |
| **R2-Markierung** | Wer im Spiel das Schild vergisst, wird auf R2 zurückgestuft und darf an den Events nicht teilnehmen. Markierung samt Verlauf nach Kalenderwoche, gilt für beide Events |
| **Allianz-Verwaltung** | Spieler-Stamm: anlegen, austragen, umbenennen, ersetzen, Allianz-Tag und Notizen – gilt modulübergreifend |
| **Backups** | Sicherungen der Datenbank: automatisch vor jedem Wochenabschluss, dazu Nur-Lesen-Ansicht |

Auf der Übersicht stehen zusätzlich die **Bündnisse** – befreundete Allianzen
mit Servernummer und je zwei Erlaubnissen (Zug plündern, Base Hits). Sie sieht
jedes angemeldete Konto; pflegen darf sie der R4-Rang. Für Superadmins
erscheint dort ausserdem die **Störungsmeldung**, sobald etwas Unerwartetes
passiert ist.

### Spielerprofil

Jeder Name im Dashboard führt dorthin – in der Allianz-Verwaltung, in der
Fairness, in der Abwesenheit und über „Mein Profil“ in der Seitenleiste. Die
Verweise tragen eine dezente punktierte Unterstreichung: am Handy gibt es kein
Darüberfahren, und ohne sichtbares Merkmal findet sie niemand.

Auf einen Blick: THP mit Kader- und Serverrang, Profilbild, laufende
Abwesenheit, R2-Markierung, je Event Anmeldung, Position der Woche, Einsätze
und ein Streifen der letzten sechzehn Wochen, dazu VS-Schnitt mit Platz und
VIP-Anrecht sowie die eigene Zug-Bilanz.

Darunter der **Wochenverlauf aus lastwarrank**: Gesamtmacht, Hero Power und
Abschüsse als Linie, mit Vier-Wochen-Veränderung, in-game Rang, HQ-Stufe,
Laufbahn, bestem Weltrang und einem Hinweis auf einen Serverwechsel.

Zwei Regeln dabei:

- **Notizen und Sperrgründe** werden serverseitig entfernt, wenn jemand keine
  Führungsdaten sehen darf – nicht nur ausgeblendet. Sonst stünden sie
  trotzdem in den Seitendaten.
- Der **Zug-Abschnitt** ist dem R4-Rang vorbehalten, mit einer Ausnahme: die
  eigene Fahrtenbilanz sieht jeder auf seinem eigenen Profil.

### Namenshistorie

Wer sich im Spiel umbenennt, ist in Ranglisten und Screenshots von vorgestern
nicht wiederzufinden. Jede Umbenennung landet deshalb in einer eigenen Tabelle
und steht auf dem Profil („Früher: …“, mit Datum und Urheber im Tooltip).

Erkannt wird sie vom **stündlichen** Namensabgleich, der jedes Profil einzeln
abfragt. Zwei Fallen stecken darin, beide beobachtet und behoben:

- Die **Mitgliederliste der Allianz** hinkt hinterher. Sie ist billiger – ein
  Abruf statt hundert –, aber als ein Spieler zurück zu seinem alten Namen
  wechselte, führte sein Profil den neuen bereits und die Liste stundenlang
  noch den alten. Widerspricht die Liste dem Kader, entscheidet deshalb immer
  das Profil.
- Die **THP-Auffrischung** benannte früher ebenfalls um, nach dem Tagesstand
  der Serverrangliste. Damit machte sie die Arbeit des Abgleichs jede Nacht
  zunichte. Namen kommen jetzt aus genau einer Quelle.

**Gelöschte Spiel-Accounts** führt die Quelle als „Kommandant“ plus Kennung.
Der Name im Kader bleibt der letzte echte – sonst wäre die Spur weg, wer das
war –, und die Löschung wird als eigenes Kennzeichen festgehalten. Sie ist
endgültig, anders als ein Allianzwechsel.

### Punkte aus Screenshots

Statt hundert Zahlen abzutippen: Screenshots der VS-Rangliste hochladen oder
mit Strg+V einfügen. Erkannt wird lokal auf demselben Rechner – kein fremder
Anbieter, keine Kosten, kein Bild verlässt den Server.

Der Dienst läuft als eigener Prozess (pm2, Port 3920, nur `127.0.0.1`); die Quelldateien samt Beschreibung liegen hier unter `ocr/`.

**Geschrieben wird nichts ohne Prüfung.** Zwischen Bild und Datenbank steht
eine Liste mit gelesenem Namen, zugeordnetem Spieler und Punktzahl, alles
änderbar. Der Knopf füllt nur die Eingabefelder; gespeichert wird wie bisher
von Hand.

| | |
|---|---|
| Zuordnung | Über denselben Namensschlüssel wie der Excel-Import. Die Erkennung verschluckt Zierzeichen: aus „Enderメ“ wird „Ender“ – der Schlüssel wirft sie ohnehin weg. Nicht Zugeordnetes bekommt eine Auswahlliste, und die Wahl lässt sich als Alias merken |
| Unsicherheit | Getrennt für Name und Zahl. Ein unsicher gelesener Name fällt in der Liste auf; eine unsicher gelesene **Zahl** nicht – sie sieht plausibel aus und wandert in den Vier-Wochen-Schnitt. Deshalb rot, mit Aufforderung zum Vergleich |
| Bildausschnitt | Bei unsicherer Zahl klappt der Streifen aus dem Originalbild von selbst auf, sonst über die Lupe. Zugeschnitten im Browser aus der bereits geladenen Datei – kein zusätzlicher Byte über die Leitung |
| Dauer | Ein Bild rund 8 s, siebzehn rund 56 s |

Zum Aufbau: die Erkenner laufen als eigene Prozesse und schlafen nach zwanzig
Minuten Ruhe ein; geweckt werden sie beim Öffnen der Erfassungsseite. Ein
früherer Entwurf hielt ein Modell im Dienst selbst und rief es aus den Fäden
des HTTP-Servers – etwa jeder vierte Aufruf scheiterte. Nicht der wiederholte
Aufruf war das Problem, sondern der Aufruf aus mehreren Fäden.

### Serverstellung und Woche der Allianz

Zwei Ansichten für alle, nicht für die Leitung. Sie beantworten nicht, was zu
tun ist, sondern wofür.

**Serverstellung** zeigt den Vergleich aller Allianzen des Servers mit Balken,
den Abstand nach oben oder unten, wie viele der zehn Bestplatzierten aus dem
eigenen Kader kommen, und den Verlauf über vierzehn Wochen.

**Woche der Allianz** nennt drei Namen auf der Übersicht: meiste VS-Punkte,
meiste aufgebaute Hero Power, meiste dazugewonnene Abschüsse. Jede
Auszeichnung sagt in einem Satz, was womit verglichen wird, samt Werten davor
und danach – „Zuwachs“ und „Steigerung“ klingen sonst gleich und meinen
Verschiedenes. Niemand bekommt zwei Auszeichnungen; der Nächstplatzierte
rückt nach.

Bewusst **nicht** dabei: die VS-Steigerung zur Vorwoche. Die Punkte hängen
davon ab, was jemand in der Woche gerade macht – ein Sprung dort wäre eine
Verlosung mit Urkunde.


### Prioritäts-Logik

Übernommen aus dem Apps Script. Niedrigster Wert = höchste Priorität:

| Score | Bedeutung |
|---:|---|
| `-1` | ⭐⭐ Fixplatz – immer dabei, ausser gesperrt |
| `0` | ⭐ Vorrang – noch nie gespielt |
| `2` | ✅ Vorrang – lange nicht gespielt (`diff ≥ 3`) |
| `3` | ➖ Normal (`diff = 2`) |
| `4` | ⏸ Zuletzt gespielt – hinten anstellen (`diff = 1`) |
| `999` | 🚫 Gesperrt – nicht einteilbar |

`diff` ist der Abstand zur letzten Teilnahme. **„Ausgesetzt“ zählt dabei nicht
als Teilnahme** – genau wie im Original.

### Team-Zuteilung

Schritt 1 der Wochenplanung und ein eigener Reiter. Alle Spieler mit „Nehme
teil“ stehen dort nach Priorität sortiert, mit THP unter dem Namen, und
bekommen genau einen Eintrag:

| Wahl | Bedeutung |
|---|---|
| `Team A` / `Team B` | spielt mit, Position folgt in der Wochenplanung |
| `–` | setzt aus – landet beim Wochenabschluss als **Ausgesetzt** in der Rotations-Historie |

Zwei Spalten helfen beim fairen Verteilen: **Zuletzt gespielt** (die Woche, aus
der sich die Priorität ergibt) und **Zuletzt ausgesetzt** – wer dort `Noch nie`
stehen hat, war noch nie dran. Beide zeigen `KW nn` oder `Noch nie`.
„Zuletzt ausgesetzt“ ist rein informativ und geht bewusst **nicht** in die
Priorität ein.

„Ausgesetzt“ zählt nicht als Teilnahme: wer aussetzt, rückt in der Priorität
also weiter nach vorn. Ein Teamwechsel gibt eine bereits vergebene Position
wieder frei, weil Positionen immer zu genau einem Team gehören.

### Ankündigung

Eigener Reiter mit dem fertigen Text zum Kopieren in Chat oder Discord:

```
Wüstensturm Einteilung Gruppe A+B

Aussetzen muss:
BabaWood
bLueDog

aktuell Gebannt:
4lmir - noch 2 Wochen
```

Ist eine der Listen leer, steht dort `keiner`. Gesperrte Spieler erscheinen nur
unter „aktuell Gebannt“ und nicht zusätzlich bei „Aussetzen muss“ – sie zählen
beim Wochenabschluss als „kein Kader“, nicht als „Ausgesetzt“.

Darunter liegt je Team ein **PNG der Aufstellung** (1080 px breit) zum
Herunterladen und Hochladen in die Last-War-Ankündigung. Gezeichnet wird es im
Browser auf ein Canvas – dadurch greift die Schrift-Ersetzung des Systems, und
Namen wie `Enderメ` oder `TaïTaï` erscheinen korrekt statt als Kästchen.
Bewusst ohne Emoji: nicht jedes Gerät hat eine Emoji-Schrift. Der Jäger-Build
ist deshalb ein gezeichneter Punkt, Freischaltzeit und Jäger-Pflicht stehen als
Text unter dem Positionsnamen.

### Battle-Map

Die taktische Aufstellung ist eine echte Positionskarte, keine Tabelle. Jede
Positionsgruppe ist eine Karte mit ihren Slots. Der noch nicht platzierte Kader
eines Teams steht als hohe Spalte daneben – bei Team A links, bei Team B rechts,
jeweils an der Aussenkante. Er bleibt beim Scrollen stehen, damit die offenen
Spieler während des Zuteilens sichtbar bleiben. Standardmässig stehen zwei
Karten nebeneinander; eine Gruppe mit `fullWidth: true` in
`src/lib/event-layouts.ts` bekommt eine eigene Zeile und stellt ihre Slots
zweispaltig. Bei Wüstensturm gilt das für die Jäger – darunter paaren sich
Lazarett 1+2, 3+4, Techzentrum+Info und Ölraffinerie 1+2. Nach einer Änderung
am Layout `npm run db:seed` laufen lassen, damit sie in `EventConfig` landet. Team A steht links, Team B
rechts – jedes Team mit dem eigenen Kader über den Positionen. Unter jedem
Namen steht der THP-Wert.

- **Maus:** Spieler aus dem Team-Kader auf eine Position ziehen. Ist der Slot
  besetzt, rutscht der bisherige Spieler in den Team-Kader zurück – er verliert
  nur die Position, nicht sein Team.
- **Position freigeben:** das ✕ am rechten Rand eines besetzten Slots. Der
  Spieler rutscht in den Team-Kader daneben und bleibt im Team – ganz aus dem
  Team nimmt ihn nur die Team-Zuteilung („–“).
- **Touch ohne Drag & Drop:** Spieler antippen (wird vorgemerkt), dann die
  Zielposition antippen. Ein besetzter Slot merkt den Spieler beim ersten
  Antippen vor, damit sich Positionen tauschen lassen.
- Wird ein gezogener Spieler neben dem Raster losgelassen, passiert nichts und
  die Karte springt zurück – zum Freigeben das ✕ nutzen.
- Jede Zuteilung wird sofort gespeichert, es gibt keinen Speichern-Knopf.
- **Die Änderung ist sofort sichtbar.** Spielerliste, Team-Zuteilung und
  Battle-Map stellen lokal um und schicken erst danach zum Server; der
  Seiten-Refresh läuft im Hintergrund und erst, wenn alle offenen Änderungen
  durch sind. Schlägt eine Aktion fehl, springt der Stand auf die Serverdaten
  zurück und der Grund erscheint oben. Ohne das wartet jeder Klick auf
  Roundtrip **und** Neuaufbau der Seite – rund eine halbe Sekunde, in der
  nichts passiert. Der Mechanismus steckt in `useOptimisticRows`
  (`src/components/action.tsx`) und wird von allen drei Ansichten geteilt.

Die Ersatzbank ist als Wechsel-Tabelle aufgebaut – die Spalte „Rotation“ aus dem
Original-Sheet:

| Raus / Out | | Rein / In |
|---|---|---|
| spielt die ersten 15 Min | → | kommt nach 15 Min rein |

Links wird ausgewählt, wer weichen muss, rechts steht der Ersatzspieler. Raus und
Rein müssen im selben Team stehen, und ein Hauptspieler wird höchstens einmal
abgelöst; beides prüft der Server. Dieselbe Darstellung nutzt das
Ankündigungsbild, damit niemand raten muss, wer spielt.

Positionsnamen stehen zweisprachig wie im Sheet („Lazarett 1 / Hospital 1“) –
die englische Bezeichnung kommt aus `labelEn` in `src/lib/event-layouts.ts`.

Für Schluchtsturm zeigt jede Positionsgruppe zusätzlich ihre Freischaltzeit
(`Sofort` / `ab 5 Min` / `ab 8 Min` / `ab 12 Min`), sortiert nach Öffnungszeit.
Positionen mit Jäger-Pflicht markieren rot, solange zu wenige Spieler mit
Jäger-Build zugeteilt sind (Markierung in der Spielerliste, Spalte „Jäger“).

---

## Datenimport

### Warnung bei Mitgliederwechseln

Die Übersicht vergleicht den Spieler-Stamm stündlich mit der Allianzliste auf
lastwarrank.com und meldet, wenn etwas auseinanderläuft:

- **Neu in der Allianz, fehlt im Kader** – steht dort in der Allianz, bei uns nicht.
- **Im Kader, aber nicht mehr in der Allianz** – über die `lwrId` eindeutig
  wiedergefunden, aber unter einem anderen Allianz-Tag.

Der Kasten erscheint nur, wenn es wirklich etwas zu tun gibt, und nur für Konten
mit Zugriff auf die Allianz-Verwaltung. Ist lastwarrank nicht erreichbar (4 s
Zeitlimit), bleibt er weg statt eine falsche Meldung zu zeigen.

Grenze der Datenquelle: die Rangliste umfasst die Top 200 des Servers. „Neu“ ist
dadurch verlässlich; als „weg“ wird bewusst nur gemeldet, wer positiv in einer
anderen Allianz auftaucht – wer gar nicht in der Liste steht, könnte einfach
unter Rang 200 liegen.

### Namen und THP von lastwarrank.com

```bash
npm run sync:lwr -- --dry-run    # nur anzeigen
npm run sync:lwr                 # übernehmen
```

Gleicht Name, Allianz-Tag und THP mit lastwarrank.com ab. Die Namen im
Dashboard sollen exakt so lauten wie dort – sonst bleibt für einen Teil der
Spieler kein THP-Wert übrig.

Der Abgleich läuft in dieser Reihenfolge: `lwrId` → exakter Name →
Gross-/Kleinschreibung → Zierzeichen und Akzente (`TaïTaï` ↔ `TaiTai`,
`Flame ツ` ↔ `Flame`) → `ALIASES` von Hand. Wer nicht in den Top 200 des
Servers steht, wird zusätzlich per Namenssuche nachgeschlagen.

Beim ersten Treffer wird `Player.lwrId` gesetzt; ab dann ist die Zuordnung
eindeutig und übersteht auch spätere Namensänderungen im Spiel.

Dasselbe steckt hinter **⟳ Sync** in der Übersicht (Modul Allianz-Verwaltung,
Stufe bearbeiten). **✎ Paste** bleibt als Fallback ohne Endpunkt: eine Zeile
pro Spieler, `Name;THP` (Semikolon, Komma oder Tab), z.B. `Enderメ;208.40M`.

---

### Schnittstellen von lastwarrank

Die Daten kommen über JSON-Schnittstellen der eigenen Seite, nicht aus deren
HTML. Das ist der Grund: lastwarrank ist selbst ein Parser einer fremden
Seite – ein zweiter Parser darüber wäre doppelt so oft kaputt.

| Adresse | Wofür |
|---|---|
| `/api/player/<id>` | Profil, Wochenverlauf, in-game Rang – für Spielerprofil und Namensabgleich |
| `/api/alliance/<id>` | Mitgliederliste, Kennzahlen, Aufsteiger – für Serverstellung und „Woche der Allianz“ |
| `/api/server/<id>` | Ranglisten des Servers – für den Allianzvergleich |

Fällt eine davon aus, fehlt genau der betroffene Abschnitt. Keine dieser
Angaben ist Betriebsmittel; das Dashboard bleibt vollständig bedienbar.

Aus der Mitgliederliste stammt auch ein Signal, das sonst durchrutschte: wer
die Allianz verlässt, steht dort noch eine Weile **ohne Rang**. Auf
lastwarrank sieht man es an „99/100“ und einem Strich statt R1–R5. Die
Übersicht führt solche Fälle als eigenen Abschnitt auf.

## Architektur-Notizen

**Ein Event = ein `eventKey`.** `Player` ist ein gemeinsamer Stamm;
`PlayerEventState`, `RegistrationStatus`, `WeeklyAssignment`,
`RotationHistory`, `BanRecord` und `Season` hängen jeweils an `(playerId,
eventKey)`. Ein Spieler kann für Wüstensturm angemeldet und gleichzeitig für
Schluchtsturm gesperrt sein. Das Positionslayout liegt als JSON in
`EventConfig.positionLayout`; die Vorlage dazu steht in
`src/lib/event-layouts.ts` und wird bei jedem `db:seed` neu geschrieben.

**Ausgetretene Spieler werden nicht gelöscht.** `Player.leftAt` markiert sie
nur. Ein echtes `DELETE` würde über die Kaskaden alle Zuteilungen, Historie-
Einträge, Sperren und Zug-Einsätze mitreissen – vergangene Wochenplanungen
zeigten danach Lücken statt der Leute, die damals gespielt haben. Wer keinerlei
Spuren hat, wird weiterhin wirklich gelöscht; da gibt es nichts zu bewahren.

Ausgetretene verschwinden aus allen aktiven Listen (Spielerliste, Pool,
Team-Zuteilung, Zug, THP-Abgleich) und aus der laufenden Woche, bleiben aber im
Archiv, in der Rotations-Historie (mit ⏻ markiert) und unter „Ehemalige“ in der
Allianz-Verwaltung, von wo sie sich mit Historie reaktivieren lassen. Legt man
jemanden mit demselben Namen neu an, bekommt er seinen alten Datensatz zurück.

Beim **Ersetzen** entscheidet die Wahl im Dialog, was fachlich passiert:
*Mitgliederwechsel* trägt den Vorgänger aus und legt den Nachfolger neu an –
das Archiv zeigt weiterhin den richtigen Namen. *Account-Wechsel* benennt den
Datensatz um, weil es derselbe Mensch ist; nur dort ist es korrekt, dass auch
vergangene Wochen den neuen Namen zeigen.

**Der Spieler-Stamm hängt an einem eigenen Modul.** `Player` ist
modulübergreifend – wer einen Spieler löscht, löscht seine Rotations-Historie in
Wüstensturm *und* Schluchtsturm sowie seine Zug-Einträge. Diese Aktionen liegen
deshalb in `src/server/actions/player-actions.ts` unter dem Modul `allianz`,
nicht bei den Event-Rechten. In der Event-Spielerliste steht nur noch, was pro
Event verschieden ist: Anmeldung, Fixplatz, Sperre und Jäger-Build.

**Zugriffsschutz läuft serverseitig.** `requireAccess()` schützt Seiten,
`assertAccess()` jede schreibende Server Action. Ausgeblendete Buttons sind
nur Komfort – die Prüfung hängt nicht daran. Superadmins haben implizit `EDIT`
auf allen Modulen.

**Sessions liegen in der Datenbank.** NextAuth v4 erlaubt zusammen mit einem
Credentials-Provider keine `database`-Strategie – die Prüfung schlägt bei jedem
Request zu. Deshalb sind in `src/lib/auth.ts` `jwt.encode`/`jwt.decode` zum
Session-Store umgebaut: im Cookie steht ein undurchsichtiger Token, der in der
Tabelle `Session` nachgeschlagen wird. Sessions sind damit serverseitig
einsehbar und widerrufbar – beim Zurücksetzen eines Passworts werden alle
Sitzungen des Kontos gelöscht.

**Server Actions geben Fehler zurück, statt sie zu werfen.** Next.js maskiert
geworfene Fehler in Produktion zu einem Digest ohne Meldung. Erwartbare Fehler
laufen deshalb über `ActionResult` (`src/server/action-result.ts`), damit der
Grund tatsächlich in der Oberfläche ankommt.

**Häufige Klicks warten nicht auf den Server.** Anmeldung, Fixplatz,
Jäger-Build, Team-Zuteilung, Battle-Map, Rotations-Paarungen, Historie-Zellen,
KW-Plan, R4-Rotation, Zugriffsmatrix und die Stammdatenfelder stellen sofort um
und speichern im Hintergrund – über `useOptimisticRows`
(`src/components/action.tsx`). Schlägt etwas fehl, springt die Ansicht auf die
Serverdaten zurück und der Grund steht oben. Der Seiten-Refresh kommt gebündelt,
erst wenn alle offenen Änderungen durch sind.

Bewusst *nicht* optimistisch sind einmalige Aktionen mit Bestätigungsdialog –
Spieler oder Benutzer anlegen und löschen, Passwort zurücksetzen, Woche
abschliessen, Sicherung erstellen, lastwarrank-Abgleich. Dort will man die
Rückmeldung abwarten, dass es wirklich geklappt hat.

**Die Priorität wird in SQL aggregiert.** Für die letzte Teilnahme zählt nur die
höchste Woche mit „Gespielt“ oder „Bank“ – `getPool` holt sie per `groupBy`,
statt die ganze Rotations-Historie zu laden. Die wächst pro Event und Woche um
rund 100 Zeilen; die Abfrage bleibt dadurch konstant.

**Der Zug-Plan rechnet mit echten ISO-Kalenderwochen**, unabhängig vom
Wochenzähler der Events. Die Duplikat-Prüfung läuft bei jedem Schreibvorgang
und jedem Read serverseitig und blockiert nie – Konflikte werden inline
markiert und bleiben stehen, bis der Koordinator sie behebt oder bewusst
stehen lässt.

---

## Skripte

| Befehl | Wirkung |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` / `npm run start` | Produktions-Build und -Server |
| `npm run db:push` | Schema in die SQLite-Datei übernehmen |
| `npm run db:seed` | Superadmin und Event-Konfigurationen anlegen |
| `npm run db:studio` | Prisma Studio |
| `npm run sync:lwr` | Namen, Allianz-Tag und THP von lastwarrank.com abgleichen |
| `npm run abgleich:namen` | Umbenennungen über die Spielerprofile nachziehen (`-- --probe` meldet nur, `NAMEN_EINZELN=25` senkt die Zahl der Einzelabrufe) |
| `npm run refresh:rangliste` | THP-Rangliste als Tagesstand ablegen |
| `npm run backup [anlass]` | Sicherung anlegen; der Anlass landet im Dateinamen |
| `npx tsx scripts/db-vorbereiten.ts` | Pflichtspalten vor einem Schema-Abgleich nachtragen (`--tun` führt aus) |
| `scripts/sicherung-auslagern.sh` | Jüngste Sicherung verschlüsselt nach GitHub schieben |
| `scripts/lesbar-machen.py <db>` | Einer Sicherungskopie lesbare Ansichten hinzufügen |

Die Wrapper unter `scripts/*.sh` wechseln in **ihr eigenes** Projekt, nicht in
einen festen Pfad. Vorher stand dort der Live-Pfad – ein Aufruf aus dem
Testsystem veränderte damit still die Live-Daten.

### Nächtliche Läufe

| Zeit | Was |
|---|---|
| 03:20 | Sicherung |
| 03:40 | Sicherung verschlüsselt nach GitHub auslagern |
| **stündlich** | Namensabgleich über die Spielerprofile |
| 05:40 | THP-Rangliste (**ohne** Umbenennungen – siehe unten) |

Jeder erfolgreiche Lauf vermerkt seinen Zeitpunkt. Bleibt einer länger als zwei
Tage aus, meldet die Übersicht das – ein Skript, das gar nicht mehr startet,
kann sich sonst nicht bemerkbar machen.

---

## Backups

Vor **jedem Wochenabschluss** legt das System automatisch eine Sicherung an –
bewusst *vor* dem Abschluss, denn genau das ist der Stand, auf den man zurück
will, wenn eine Woche versehentlich abgeschlossen wurde. Zusätzlich gibt es
„Jetzt sichern“ von Hand.

Gesichert wird mit `VACUUM INTO`, nicht per Dateikopie – nur so ist die Kopie
auch dann konsistent, wenn parallel geschrieben wird. Jede Datei unter
`backups/` ist eine vollwertige Datenbank; die letzten 40 bleiben liegen.

| | |
|---|---|
| **Reinschauen** | Auf den Dateinamen klicken. Öffnet die Sicherung mit einer eigenen, nur lesenden Verbindung und zeigt Woche, Spieler, Anmeldungen, Sperren und die gespeicherten Aufstellungen. Die laufende Datenbank wird dabei nicht angefasst – **kein Zurückspielen nötig**. |
| **Zurückspielen** | Server stoppen, Datei aus `backups/` über `prisma/dev.db` kopieren, Server starten. Kein Import nötig. |

Der Zugriff hängt am eigenen Modul `backup`. Eine Sicherung enthält den
kompletten Datenbestand **inklusive Passwort-Hashes** – **herunterladen lässt
sie sich deshalb nicht**, weder über die Oberfläche noch über eine Adresse. Die
Dateien bleiben auf dem Server; zum Zurückspielen braucht es Serverzugriff.
*Nur lesen* sieht Liste und Inhalt, kann aber weder löschen noch sichern.

`backups/` steht in `.gitignore`.

### Kopie ausserhalb des Servers

Datenbank und alle örtlichen Sicherungen liegen auf derselben Platte. Der
RAID-Verbund fängt den Ausfall **einer** Platte ab, aber nicht ein
versehentliches Löschen, eine kaputte Migration oder den Verlust des Servers –
dann wären beide zugleich weg.

Jede Nacht um 03:40 wandert deshalb die jüngste Sicherung in ein **eigenes,
privates GitHub-Repository**, verschlüsselt mit GPG (AES-256). Rund 0,3 MB je
Nacht. Verschlüsselt, weil die Datei den vollständigen Bestand samt
Passwort-Hashes enthält – ein privates Repository allein wäre zu wenig.

**Jede Nacht wird auch zurückgespielt**, nicht nur geschrieben: entschlüsseln,
Datenbank öffnen, Spieler und Konten zählen, eine der Ansichten lesen. Schlägt
das fehl, wird die Datei verworfen und eine Störung gemeldet. Eine Sicherung,
die man nie zurückgespielt hat, ist nur eine Vermutung.

Die letzten 30 Nächte bleiben vollständig, davor je Kalenderwoche eine.

Die ausgelagerte Kopie enthält zusätzlich **18 Ansichten** mit dem Vorsatz
`Lesbar_`, in denen neben jeder Kennung der Name steht – `Lesbar_ZugDay` zeigt
die Fahrer im Klartext, `Lesbar_VsScore` die Woche als „KW26/2026“. Angelegt
werden sie nur auf der Kopie; die Datenbank im Betrieb bleibt unberührt, dort
kennt Prisma sie nicht.

Zurückspielen von Hand:

    gpg --output wiederhergestellt.db --decrypt sicherung-JJJJMMTT.db.gpg

Das Kennwort liegt **nicht** im Repository und darf nicht nur auf dem Server
stehen – sonst ist es im Katastrophenfall mit dem weg, was es schützen sollte.

## Passwörter

Jeder ändert sein Passwort selbst über **Passwort** unten in der Seitenleiste
(`/passwort`, mit Abfrage des aktuellen Passworts, mindestens 8 Zeichen).
Andere offene Sitzungen desselben Kontos werden dabei beendet, die laufende
bleibt.

`User.mustChangePassword` erzwingt den Wechsel. Gesetzt wird das Flag beim
Anlegen eines Kontos und bei jedem Zurücksetzen durch einen Superadmin – also
immer dann, wenn jemand anderes das Passwort kennt. Solange es steht, leitet die
App-Shell jeden Seitenaufruf auf `/passwort` um; die Seite liegt bewusst
ausserhalb der Shell, sonst würde die Weiterleitung kreisen.

Vergessene Passwörter setzt der Superadmin in der Zugriffsverwaltung zurück (🔑)
– der Besitzer muss danach wieder selbst neu setzen. Einen Self-Service-Reset
per E-Mail gibt es nicht.

**Schutz gegen Durchprobieren.** Nach acht Fehlversuchen ist das Konto 15
Minuten gesperrt; eine erfolgreiche Anmeldung setzt den Zähler zurück, und jede
Sperre erscheint als Störung auf der Übersicht. Gesperrt wird das *Konto*, nicht
die Herkunft – wer ein bestimmtes Konto angreift, wechselt sonst die Adresse.
Die Sperre bleibt kurz, weil eine lange sich missbrauchen liesse, um jemandem
den Zugang zu nehmen. Bei unbekanntem Benutzernamen wird gegen einen
Leerlauf-Hash gerechnet, damit die Antwortzeit nicht verrät, welche Namen es
gibt.

Zweite Schicht im Webserver: fünf Anmeldeversuche pro Minute je Adresse. Da die
Seite hinter Cloudflare steht, muss nginx dafür die **echte** Besucheradresse
kennen (`snippets/cloudflare-real-ip.conf`) – sonst zählte es Cloudflare-Knoten
und träfe alle Besucher desselben Knotens statt des Angreifers.

## Bewusst nicht enthalten

PDF/CSV-Export und ein Passwort-Reset per E-Mail.

**Mitglieder melden sich nicht selbst an.** Die Anmeldung zu den Events trägt
die Leitung ein – bewusst so entschieden, nicht vergessen.

**Die automatische Zuteilung bleibt die Reissleine.** Sie existiert und lernt
die Positionsreihenfolge aus den bisherigen Wochen, wird aber nur benutzt, wenn
das Aufstellen von Hand einmal vergessen wurde.

**Ankündigungen laufen im Spiel**, nicht über Discord. Das Dashboard erzeugt
Text und Bilder zum Weitergeben; verschickt werden sie von Hand.

**Kein automatischer R2-Abgleich.** Die Mitgliederliste führt zwar den in-game
Rang, hinkt aber Stunden hinterher – ein R2 fällt im Spiel sofort auf, dem
Skript erst später. Markiert wird deshalb von Hand.

Benachrichtigungen gibt es inzwischen für Abwesenheiten: eine Meldung nach
Discord, sobald sich jemand abmeldet oder ein R4 es für ihn einträgt. Der
Webhook steht ausschliesslich in der `.env` (`DISCORD_ABSENCE_WEBHOOK`) und nie
im Repository – fehlt er, wird schlicht nichts verschickt, wodurch eine
Umgebung ohne Eintrag von selbst stumm bleibt. Eine fehlgeschlagene Meldung
lässt nie eine Abmeldung scheitern.
