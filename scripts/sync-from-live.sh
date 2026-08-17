#!/bin/bash
#
# Holt die Live-Datenbank ins Testsystem.
#
#   ./scripts/sync-from-live.sh
#
# Einbahnstrasse: liest von Live, schreibt nur ins Testsystem. Der umgekehrte
# Weg existiert bewusst nicht – Testdaten dürfen nie auf der Live-Seite landen.
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

[ -f "$LIVE/prisma/dev.db" ] || { echo "✗ Live-Datenbank nicht gefunden"; exit 1; }

# Vorher sichern, falls im Testsystem etwas drin ist, das man noch braucht.
if [ -f "$DEV/prisma/dev.db" ]; then
  mkdir -p "$DEV/backups"
  SICHERUNG="$DEV/backups/test-vor-abgleich-$(date +%Y%m%d-%H%M%S).db"
  cp "$DEV/prisma/dev.db" "$SICHERUNG"
  echo "  Bisheriger Teststand gesichert: $(basename "$SICHERUNG")"
fi

# VACUUM INTO statt cp: liefert eine in sich stimmige Kopie, auch wenn die
# Live-Seite gerade schreibt.
cd "$LIVE"
npx --yes prisma db execute --url "file:$LIVE/prisma/dev.db" \
  --stdin <<< "VACUUM INTO '$DEV/prisma/dev.db.neu';" 2>/dev/null \
  || cp "$LIVE/prisma/dev.db" "$DEV/prisma/dev.db.neu"

mv "$DEV/prisma/dev.db.neu" "$DEV/prisma/dev.db"
rm -f "$DEV/prisma/dev.db-journal" "$DEV/prisma/dev.db-wal" "$DEV/prisma/dev.db-shm"

cd "$DEV"
npx prisma db push --skip-generate --accept-data-loss >/dev/null 2>&1 && \
  echo "  Schema des Testsystems angeglichen"

/usr/local/bin/pm2 restart "$PM2_DEV" >/dev/null 2>&1 || /usr/bin/pm2 restart "$PM2_DEV" >/dev/null 2>&1 || true
echo "✓ Testsystem hat jetzt die Live-Daten ($(du -h "$DEV/prisma/dev.db" | cut -f1))"
