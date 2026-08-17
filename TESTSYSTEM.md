# Testsystem

Zweite, vollständig eigenständige Kopie des Dashboards zum Ausprobieren.
Nichts, was dort passiert, kann die Live-Seite verändern.

Der Aufbau ist eine Empfehlung, keine Pflicht: wer nur eine Installation
betreibt, braucht weder `promote-to-live.sh` noch `sync-from-live.sh`. Sobald
aber mehr als eine Person mitplant, lohnt sich die Trennung – auf einer
einzigen Installation probiert man an echten Daten.

|                | Live          | Test          |
| -------------- | ------------- | ------------- |
| Ordner         | `$LIVE`       | `$DEV`        |
| pm2-Prozess    | `$PM2_LIVE`   | `$PM2_DEV`    |
| Adresse        | `$LIVE_URL`   | eigene        |
| Git-Zweig      | `main`        | `dev`         |
| Datenbank      | eigene Datei  | eigene Datei (Kopie) |
| Anmeldung      | eigene Sitzungen | eigene Sitzungen |

Die Werte stehen in `scripts/betrieb.conf`:

```bash
cp scripts/betrieb.conf.example scripts/betrieb.conf
# danach ausfüllen
```

Das Testsystem trägt oben ein sandfarbenes Warnband. Fehlt es, bist du auf
der Live-Seite. Gesteuert wird es über `NEXT_PUBLIC_ENVIRONMENT` in der `.env`
des Testsystems.

## Einrichten

Beide Installationen sind gewöhnliche Klone des Repositorys, jede mit eigener
`.env` und eigener Datenbank:

```bash
git clone <repo> /home/alliance-command   # Live
cd /home/alliance-command && ./scripts/einrichten.sh
git checkout -b main

git clone <repo> /home/alliance-dev       # Test
cd /home/alliance-dev && ./scripts/einrichten.sh
git checkout -b dev
```

Beim Testsystem einen anderen Port und `NEXT_PUBLIC_ENVIRONMENT=test` in die
`.env` eintragen, dann beide unter pm2 nehmen.

## Neue Idee ausprobieren

Im Test-Ordner arbeiten, dann:

```bash
npm run build && pm2 restart "$PM2_DEV"
```

## Live-Daten ins Testsystem holen

```bash
./scripts/sync-from-live.sh
```

Kopiert die Live-Datenbank herüber und gleicht das Schema an. Der bisherige
Teststand landet vorher in `backups/`. **Den umgekehrten Weg gibt es nicht** –
Testdaten dürfen nie auf der Live-Seite landen.

## Getestete Änderung auf die Live-Seite bringen

```bash
./scripts/promote-to-live.sh "Was geändert wurde"
```

Schreibt die Änderungen im Testsystem fest, holt sie auf die Live-Seite,
**sichert die Datenbank**, gleicht das Schema an, baut und startet neu.
Schlägt der Bau fehl, wird der alte Stand wiederhergestellt und neu gebaut –
die Live-Seite bleibt dann unverändert.

Voraussetzung: auf der Live-Seite darf nichts Uncommittetes liegen. Wird
direkt im Live-Ordner gearbeitet, bricht das Skript ab, statt die Änderungen
zu überschreiben.

## Wenn Live und Test auseinanderlaufen

Wurde ausnahmsweise direkt auf der Live-Seite etwas geändert und
festgeschrieben, holt sich das Testsystem den Stand so zurück:

```bash
git fetch live main
git rebase FETCH_HEAD
```

## Sicherung ausserhalb des Servers

Beide Zweige gehören zusätzlich auf ein privates GitHub-Repository:

```bash
git push origin dev     # aus dem Testsystem
git push origin main    # aus der Live-Installation
```

Datenbank, `.env`, `scripts/betrieb.conf` und die Sicherungen sind über
`.gitignore` ausgeschlossen und gehören dort auch nicht hin. Für die
verschlüsselte Auslagerung der Datenbank siehe den Abschnitt „Backups“ in der
README.
