#!/bin/bash
#
# Lagert die jüngste Sicherung verschlüsselt in ein privates GitHub-Repository
# aus.
#
# Warum überhaupt: Datenbank und alle örtlichen Sicherungen liegen auf
# derselben Platte. Der RAID-Verbund fängt den Ausfall einer Platte ab, aber
# nicht ein versehentliches Löschen, eine kaputte Migration oder den Verlust
# des Servers. Dann wären beide zugleich weg.
#
# Verschlüsselt, weil die Datei den vollständigen Bestand enthält – samt
# Passwort-Hashes. Ein privates Repository allein wäre zu wenig.
#
# Läuft nächtlich per Cron, nach der örtlichen Sicherung um 03:20.
set -uo pipefail

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
KLON="$SICHERUNG_KLON"
KENNWORT="$SICHERUNG_KENNWORT"
PRAEFIX="${SICHERUNG_PRAEFIX:-sicherung}"
# So viele Nächte bleiben vollständig; älteres wird auf eine je Woche gedünnt.
TAGE_VOLL=30

log() { echo "[auslagern] $(date -Is) $*"; }

fehler() {
  log "FEHLER: $*"
  # In die Störungsliste der Superadmins schreiben – eine ausgebliebene
  # Auslagerung merkt man sonst erst, wenn man sie braucht.
  cd "$LIVE" && npx tsx -e "
    import { PrismaClient } from '@prisma/client';
    import { schreibeStoerung } from '@/lib/stoerung';
    const p = new PrismaClient();
    schreibeStoerung(p, { source: 'Auslagerung', fehler: new Error(process.argv[1]) })
      .finally(() => p.\$disconnect());
  " "$1" >/dev/null 2>&1
  exit 1
}

[ -r "$KENNWORT" ] || fehler "Kennwortdatei fehlt oder ist nicht lesbar: $KENNWORT"
[ -d "$KLON/.git" ] || fehler "Kein Arbeitsklon unter $KLON"

# Jüngste örtliche Sicherung nehmen. Gibt es keine, ist das ein Fehler wert:
# dann hat schon die nächtliche Sicherung nicht gearbeitet.
QUELLE=$(ls -t "$LIVE"/backups/"$PRAEFIX"-*.db 2>/dev/null | head -1)
[ -n "$QUELLE" ] || fehler "Keine örtliche Sicherung gefunden"

ZIEL="$PRAEFIX-$(date +%Y%m%d).db.gpg"

# Vor dem Verschlüsseln lesbar machen: eine Arbeitskopie bekommt Ansichten, in
# denen neben jeder Kennung der Name steht. Wer die Sicherung öffnet, um
# nachzusehen, wer wann eingeteilt war, soll nicht mit "cmsjgz…" dastehen.
#
# Nur auf der Kopie – die Datenbank im Betrieb bleibt unberührt, dort kennt
# Prisma diese Ansichten nicht.
LESBAR=$(mktemp /tmp/lesbar-XXXXXX.db)
cp "$QUELLE" "$LESBAR" || fehler "Arbeitskopie liess sich nicht anlegen"
if ! python3 "$LIVE/scripts/lesbar-machen.py" "$LESBAR" >/dev/null 2>&1; then
  rm -f "$LESBAR"
  fehler "Lesbare Ansichten liessen sich nicht anlegen"
fi

cd "$KLON" || fehler "Wechsel nach $KLON fehlgeschlagen"

# Erst holen: das Repository kann von anderswo verändert worden sein.
git pull -q --rebase origin HEAD 2>/dev/null

# GPG packt selbst, statt vorher durch gzip zu laufen. Das Ergebnis ist rund
# zehn Prozent grösser (321 statt 291 KB), spart beim Zurückspielen von Hand
# aber einen ganzen Schritt und ein zusätzliches Werkzeug: die entschlüsselte
# Datei ist sofort die Datenbank. Bei 30 KB Unterschied ist die einfachere
# Wiederherstellung mehr wert als der Platz.
if ! gpg --batch --yes --symmetric --cipher-algo AES256 \
      --compress-algo ZIP --compress-level 9 \
      --passphrase-file "$KENNWORT" --output "$ZIEL" "$LESBAR" 2>/dev/null; then
  rm -f "$LESBAR"
  fehler "Verschlüsselung fehlgeschlagen"
fi
rm -f "$LESBAR"

# Gegenprobe, und zwar eine echte: entschlüsseln, entpacken und die Datenbank
# tatsächlich öffnen. Eine Sicherung, die sich nicht zurückspielen lässt, ist
# schlimmer als keine – man verlässt sich auf sie. Damit ist jede Nacht eine
# Rückspielprobe gelaufen, nicht nur eine Vermutung.
PROBE=$(mktemp /tmp/probe-XXXXXX.db)
gpg --batch --quiet --decrypt --passphrase-file "$KENNWORT" \
  --output "$PROBE" --yes "$ZIEL" 2>/dev/null

GEPRUEFT=$(python3 - "$PROBE" <<'PYEOF'
import sqlite3, sys
try:
    c = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
    spieler = c.execute("select count(*) from Player").fetchone()[0]
    konten = c.execute("select count(*) from User").fetchone()[0]
    sichten = c.execute(
        "select count(*) from sqlite_master where type='view' and name like 'Lesbar_%'"
    ).fetchone()[0]
    # Eine der Ansichten wirklich lesen – eine kaputte fiele sonst nicht auf.
    c.execute("select playerId_Name from Lesbar_WeeklyAssignment limit 1").fetchone()
    # Ein leerer Bestand wäre ebenfalls verdächtig.
    print(f"{spieler}:{konten}:{sichten}" if spieler > 0 and konten > 0 and sichten > 0 else "leer")
except Exception as e:
    print(f"unlesbar ({e})")
PYEOF
)
rm -f "$PROBE"

case "$GEPRUEFT" in
  *:*:*) log "Rückspielprobe bestanden: $(echo "$GEPRUEFT" | cut -d: -f1) Spieler, $(echo "$GEPRUEFT" | cut -d: -f2) Konten, $(echo "$GEPRUEFT" | cut -d: -f3) Ansichten" ;;
  *)   rm -f "$ZIEL"; fehler "Rückspielprobe fehlgeschlagen: $GEPRUEFT" ;;
esac

# Ausdünnen: die letzten TAGE_VOLL Nächte bleiben, davor je Woche eine.
python3 - "$TAGE_VOLL" "$PRAEFIX" <<'PY'
import os, re, sys, datetime, subprocess

tage_voll = int(sys.argv[1])
praefix = sys.argv[2]
heute = datetime.date.today()
muster = re.compile(rf"^{re.escape(praefix)}-(\d{{8}})\.db(\.gz)?\.gpg$")

nach_woche = {}
loeschen = []
for name in sorted(os.listdir(".")):
    m = muster.match(name)
    if not m:
        continue
    tag = datetime.datetime.strptime(m.group(1), "%Y%m%d").date()
    if (heute - tag).days <= tage_voll:
        continue
    woche = tag.isocalendar()[:2]
    # Je Woche die jüngste behalten.
    if woche in nach_woche:
        loeschen.append(min(nach_woche[woche], name))
        nach_woche[woche] = max(nach_woche[woche], name)
    else:
        nach_woche[woche] = name

for name in loeschen:
    subprocess.run(["git", "rm", "-q", "--", name], check=False)
    print(f"  ausgedünnt: {name}")
PY

git add -A
if git diff --cached --quiet; then
  log "nichts Neues – Stand unverändert"
  exit 0
fi

git commit -q -m "Sicherung vom $(date +%d.%m.%Y)" || fehler "Commit fehlgeschlagen"
git push -q origin HEAD || fehler "Push nach GitHub fehlgeschlagen"

ANZAHL=$(ls "$PRAEFIX"-*.db*.gpg 2>/dev/null | wc -l)
GROESSE=$(du -sh . --exclude=.git | cut -f1)
log "✓ $ZIEL ausgelagert · $ANZAHL Sicherungen, $GROESSE"

# Lauf vermerken, damit die Übersicht ein Ausbleiben melden kann.
cd "$LIVE" && npx tsx -e "
  import { PrismaClient } from '@prisma/client';
  import { merkeLauf } from '@/lib/stoerung';
  const p = new PrismaClient();
  merkeLauf(p, 'auslagerung').finally(() => p.\$disconnect());
" >/dev/null 2>&1
