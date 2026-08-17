#!/bin/bash
#
# Übernimmt den getesteten Stand aus dem Testsystem auf die Live-Seite.
#
#   ./scripts/promote-to-live.sh "Beschreibung der Änderung"
#
# Ablauf: im Testsystem committen → Live holt den Zweig → baut → startet neu.
# Bricht der Bau ab, bleibt die Live-Seite auf dem alten Stand.
set -euo pipefail

# Betriebseinstellungen: Pfade, Prozessnamen, Adressen. Siehe
# scripts/betrieb.conf.example – ohne diese Datei weiss das Skript nicht,
# welche Installation es anfassen soll.
EIGEN=$(dirname "$(readlink -f "$0")")
if [ -f "$EIGEN/betrieb.conf" ]; then
  # shellcheck disable=SC1091
  . "$EIGEN/betrieb.conf"
else
  echo "✗ $EIGEN/betrieb.conf fehlt."
  echo "  Vorlage kopieren und ausfüllen:"
  echo "    cp $EIGEN/betrieb.conf.example $EIGEN/betrieb.conf"
  exit 1
fi
NACHRICHT="${1:-Änderungen aus dem Testsystem}"

cd "$DEV"
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -q -m "$NACHRICHT"
  echo "  Im Testsystem festgeschrieben: $(git log --oneline -1)"
else
  echo "  Nichts Neues im Testsystem – übernehme den vorhandenen Stand."
fi

cd "$LIVE"
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Auf der Live-Seite liegen uncommittete Änderungen."
  echo "  Erst klären, sonst gingen sie verloren:"
  git status --short | sed 's/^/    /'
  exit 1
fi

VORHER=$(git rev-parse --short HEAD)
git fetch -q "$DEV" dev
git merge -q --ff-only FETCH_HEAD 2>/dev/null || {
  echo "✗ Kein glatter Vorlauf möglich – Live und Test sind auseinandergelaufen."
  echo "  Stand Live: $VORHER"
  exit 1
}
echo "  Live geholt: $VORHER → $(git rev-parse --short HEAD)"

npm ci --silent >/dev/null 2>&1 || npm install --silent >/dev/null 2>&1
npx prisma generate >/dev/null 2>&1

# ── Datenbank ──────────────────────────────────────────────────
# Erst sichern. Alles ab hier fasst die Live-Daten an, und eine Sicherung
# unmittelbar davor ist die einzige, die im Ernstfall wirklich passt.
#
# Über scripts/backup.ts und nicht über "prisma db execute": DATABASE_URL ist
# relativ ("file:./dev.db") und gilt ab dem prisma-Ordner. Ein direkter Aufruf
# löst gegen das Arbeitsverzeichnis auf, legt dort eine leere Datenbank an und
# sichert die – eine Sicherung, die im Ernstfall nichts enthält.
if ! SICHERUNG=$(npx tsx scripts/backup.ts vor-uebernahme 2>&1); then
  echo "✗ Sicherung fehlgeschlagen – Übernahme abgebrochen, Live unverändert auf $VORHER."
  echo "$SICHERUNG" | sed 's/^/    /'
  git reset -q --hard "$VORHER"
  exit 1
fi
echo "  Gesichert: ${SICHERUNG#✓ }"

# Pflichtspalten nachtragen, die SQLite sonst nicht annimmt. Ohne diesen
# Schritt verweigert der Abgleich und schlägt --force-reset vor – was den
# gesamten Bestand löschen würde.
npx tsx scripts/db-vorbereiten.ts --tun | sed 's/^/  /'

# Der Abgleich darf nicht stillschweigend scheitern: sonst liefe Live auf
# neuem Code mit alter Datenbank, und das fällt erst den Benutzern auf.
if ! npx prisma db push --skip-generate >/tmp/dbpush.log 2>&1; then
  echo "✗ Datenbank-Abgleich fehlgeschlagen – Live bleibt auf $VORHER."
  sed 's/^/    /' /tmp/dbpush.log | tail -20
  echo "    Die Sicherung liegt unter $SICHERUNG."
  git reset -q --hard "$VORHER"
  npm run build >/dev/null 2>&1 || true
  exit 1
fi
echo "  Datenbank abgeglichen."

# Kein "| grep" hier: mit pipefail beendet grep die Pipe vorzeitig, npm bekommt
# SIGPIPE und die Pipeline gälte als gescheitert, obwohl der Bau lief. Der
# Rückgabewert von next build ist die verlässliche Auskunft.
PROTOKOLL=$(mktemp)
if ! npm run build >"$PROTOKOLL" 2>&1; then
  echo "✗ Bau fehlgeschlagen – Live läuft unverändert weiter auf $VORHER."
  echo "  Letzte Zeilen:"
  tail -20 "$PROTOKOLL" | sed 's/^/    /'
  git reset -q --hard "$VORHER"
  npm run build >/dev/null 2>&1 || true   # alten Stand wieder bauen
  exit 1
fi
rm -f "$PROTOKOLL"

/usr/local/bin/pm2 restart "$PM2_LIVE" >/dev/null 2>&1 || /usr/bin/pm2 restart "$PM2_LIVE" >/dev/null 2>&1
sleep 6
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$LIVE_URL/login" || echo 000)
echo "✓ Live aktualisiert auf $(git rev-parse --short HEAD) – Anmeldeseite antwortet mit $CODE"
