#!/bin/bash
#
# Richtet Alliance Command auf einem frischen Rechner ein.
#
#   git clone <repo> && cd <repo> && ./scripts/einrichten.sh
#
# Fragt alles ab, was von Allianz zu Allianz verschieden ist, schreibt die
# `.env`, installiert die Abhängigkeiten, legt die Datenbank an und baut die
# Anwendung. Am Ende steht ein lauffähiges System mit einem Superadmin-Konto.
#
# Wiederholbar: eine vorhandene `.env` wird gelesen und ihre Werte als
# Vorschlag angeboten, nichts wird ungefragt überschrieben. Ein zweiter Aufruf
# ist damit auch das Werkzeug zum Ändern der Einstellungen.
#
# Nicht interaktiv (etwa für eine automatische Einrichtung): alle Werte als
# Umgebungsvariablen setzen und `--ohne-fragen` anhängen.
set -uo pipefail

cd "$(dirname "$(readlink -f "$0")")/.." || exit 1
PROJEKT=$(pwd)
OHNE_FRAGEN=false
[[ "${1:-}" == "--ohne-fragen" ]] && OHNE_FRAGEN=true

rot=$'\e[31m'; gruen=$'\e[32m'; gelb=$'\e[33m'; grau=$'\e[90m'; fett=$'\e[1m'; aus=$'\e[0m'
titel() { printf '\n%s%s%s\n' "$fett" "$1" "$aus"; }
ok()    { printf '  %s✓%s %s\n' "$gruen" "$aus" "$1"; }
warn()  { printf '  %s!%s %s\n' "$gelb" "$aus" "$1"; }
fehler(){ printf '  %s✗%s %s\n' "$rot" "$aus" "$1"; exit 1; }
hinweis(){ printf '    %s%s%s\n' "$grau" "$1" "$aus"; }

# ── Voraussetzungen ────────────────────────────────────────────────────────
titel "Voraussetzungen"

command -v node >/dev/null || fehler "Node.js fehlt. Nötig ist Version 18 oder neuer."
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 18 ] || fehler "Node.js $NODE_MAJOR ist zu alt – nötig ist 18 oder neuer."
ok "Node.js $(node -v)"

command -v npm >/dev/null || fehler "npm fehlt."
ok "npm $(npm -v)"

if command -v openssl >/dev/null; then
  ok "openssl vorhanden – Schlüssel werden erzeugt"
else
  warn "openssl fehlt – Schlüssel müssen von Hand eingetragen werden"
fi

# ── Bisherige Einstellungen einlesen ───────────────────────────────────────
# Nur die Namen, die wir kennen, und ohne die Datei auszuführen: eine .env mit
# Befehlen darin soll nichts starten.
if [ -f .env ]; then
  while IFS='=' read -r schluessel wert; do
    case "$schluessel" in
      DATABASE_URL|NEXTAUTH_URL|NEXTAUTH_SECRET|SEED_ADMIN_USER|SEED_ADMIN_PASSWORD|\
      SEED_ADMIN_NAME|THP_API_URL|THP_SERVER_ID|LWR_BASE_URL|LWR_ALLIANCE_ID|\
      DISCORD_ABSENCE_WEBHOOK|OCR_URL|NEXT_PUBLIC_ALLIANZ_TAG|NEXT_PUBLIC_ALLIANZ_NAME|\
      NEXT_PUBLIC_SERVER_ID|NEXT_PUBLIC_ENVIRONMENT)
        wert="${wert%\"}"; wert="${wert#\"}"
        printf -v "ALT_$schluessel" '%s' "$wert"
        ;;
    esac
  done < <(grep -E '^[A-Z_]+=' .env)
  ok "Vorhandene .env gelesen – ihre Werte stehen als Vorschlag bereit"
fi

frage() {
  # frage VARIABLE "Text" "Vorgabe" [geheim]
  local name="$1" text="$2" vorgabe="$3" geheim="${4:-}"
  local alt_name="ALT_$name"
  local bisher="${!alt_name:-}"
  local schon="${!name:-}"
  [ -n "$bisher" ] && vorgabe="$bisher"

  if [ -n "$schon" ]; then printf -v "$name" '%s' "$schon"; return; fi
  if $OHNE_FRAGEN; then printf -v "$name" '%s' "$vorgabe"; return; fi

  local anzeige="$vorgabe"
  [ -n "$geheim" ] && [ -n "$vorgabe" ] && anzeige="········"
  local eingabe
  if [ -n "$anzeige" ]; then
    read -r -p "  $text [$anzeige]: " eingabe
  else
    read -r -p "  $text: " eingabe
  fi
  printf -v "$name" '%s' "${eingabe:-$vorgabe}"
}

# ── Allianz ────────────────────────────────────────────────────────────────
titel "Allianz"
hinweis "Diese Angaben stehen im Schriftzug, in den Aushangbildern und in jedem"
hinweis "Oberflächentext. Ohne sie zeigt die Anwendung 'ALLY · Server #0000'."
frage NEXT_PUBLIC_ALLIANZ_TAG  "Kürzel im Spiel (z. B. CoVs)"                 ""
frage NEXT_PUBLIC_ALLIANZ_NAME "Ausgeschriebener Name"                        ""
frage NEXT_PUBLIC_SERVER_ID    "Servernummer"                                 ""

[ -n "$NEXT_PUBLIC_ALLIANZ_TAG" ] || fehler "Ohne Kürzel fehlt der Anwendung ihr Name."
[[ "$NEXT_PUBLIC_SERVER_ID" =~ ^[0-9]+$ ]] || fehler "Die Servernummer muss eine Zahl sein."
# Der ausgeschriebene Name ist entbehrlich – dann steht überall das Kürzel.
[ -n "$NEXT_PUBLIC_ALLIANZ_NAME" ] || NEXT_PUBLIC_ALLIANZ_NAME="$NEXT_PUBLIC_ALLIANZ_TAG"

titel "Datenquelle lastwarrank"
hinweis "Liefert Namen, THP, Wochenverlauf und den Allianzvergleich."
hinweis "Ohne diese Angaben läuft alles weiter – die betroffenen Abschnitte bleiben leer."
frage LWR_BASE_URL    "Adresse der lastwarrank-Instanz"                        "https://lastwarrank.com"
frage LWR_ALLIANCE_ID "Allianz-Kennung (die lange Zeichenfolge aus der Adresse der Allianzseite)" ""
frage THP_API_URL     "Adresse der Spieler-Rangliste (leer lassen, wenn unbekannt)" ""

# ── Anwendung ──────────────────────────────────────────────────────────────
titel "Anwendung"
frage NEXTAUTH_URL "Adresse, unter der die Anwendung erreichbar ist" "http://localhost:3000"

if [ -z "${ALT_NEXTAUTH_SECRET:-}" ]; then
  if command -v openssl >/dev/null; then
    NEXTAUTH_SECRET=$(openssl rand -base64 32)
    ok "Sitzungsschlüssel erzeugt"
  else
    frage NEXTAUTH_SECRET "Sitzungsschlüssel (mindestens 32 Zeichen)" ""
  fi
else
  NEXTAUTH_SECRET="$ALT_NEXTAUTH_SECRET"
  ok "Sitzungsschlüssel aus der bisherigen .env übernommen"
fi

DATABASE_URL="${ALT_DATABASE_URL:-file:./dev.db}"

titel "Erstes Konto"
hinweis "Superadmin: sieht und darf alles, richtet die übrigen Konten ein."
frage SEED_ADMIN_USER     "Anmeldename"    "admin"
frage SEED_ADMIN_NAME     "Anzeigename"    "Allianz-Admin"
if [ -z "${ALT_SEED_ADMIN_PASSWORD:-}" ] && command -v openssl >/dev/null && ! $OHNE_FRAGEN; then
  VORSCHLAG=$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)
  frage SEED_ADMIN_PASSWORD "Passwort" "$VORSCHLAG" geheim
else
  frage SEED_ADMIN_PASSWORD "Passwort" "${ALT_SEED_ADMIN_PASSWORD:-}" geheim
fi
[ -n "$SEED_ADMIN_PASSWORD" ] || fehler "Ohne Passwort gibt es kein Konto."

titel "Optional"
frage DISCORD_ABSENCE_WEBHOOK "Discord-Webhook für Abwesenheiten (leer = keine Meldungen)" "${ALT_DISCORD_ABSENCE_WEBHOOK:-}"
frage OCR_URL "Adresse des Erkennungsdienstes für Screenshots (leer = keine Erkennung)" "${ALT_OCR_URL:-http://127.0.0.1:3920}"

# ── .env schreiben ─────────────────────────────────────────────────────────
titel "Einstellungen sichern"
if [ -f .env ]; then
  SICHERUNG=".env.vor-einrichtung-$(date +%Y%m%d-%H%M%S)"
  cp .env "$SICHERUNG"
  ok "Bisherige .env gesichert als $SICHERUNG"
fi

umask 077
{
  echo "# Erzeugt von scripts/einrichten.sh am $(date -Is)"
  echo "# Diese Datei enthält Zugangsdaten und gehört nicht ins Repository."
  echo
  echo "DATABASE_URL=\"$DATABASE_URL\""
  echo "NEXTAUTH_URL=\"$NEXTAUTH_URL\""
  echo "NEXTAUTH_SECRET=\"$NEXTAUTH_SECRET\""
  echo
  echo "# Erstes Konto – wird nur beim Seed verwendet."
  echo "SEED_ADMIN_USER=\"$SEED_ADMIN_USER\""
  echo "SEED_ADMIN_PASSWORD=\"$SEED_ADMIN_PASSWORD\""
  echo "SEED_ADMIN_NAME=\"$SEED_ADMIN_NAME\""
  echo
  echo "# Allianz"
  echo "NEXT_PUBLIC_ALLIANZ_TAG=\"$NEXT_PUBLIC_ALLIANZ_TAG\""
  echo "NEXT_PUBLIC_ALLIANZ_NAME=\"$NEXT_PUBLIC_ALLIANZ_NAME\""
  echo "NEXT_PUBLIC_SERVER_ID=\"$NEXT_PUBLIC_SERVER_ID\""
  echo "THP_SERVER_ID=\"$NEXT_PUBLIC_SERVER_ID\""
  echo
  echo "# Datenquelle"
  echo "LWR_BASE_URL=\"$LWR_BASE_URL\""
  echo "LWR_ALLIANCE_ID=\"$LWR_ALLIANCE_ID\""
  [ -n "$THP_API_URL" ] && echo "THP_API_URL=\"$THP_API_URL\""
  echo
  echo "# Optional"
  [ -n "$DISCORD_ABSENCE_WEBHOOK" ] && echo "DISCORD_ABSENCE_WEBHOOK=\"$DISCORD_ABSENCE_WEBHOOK\""
  [ -n "$OCR_URL" ] && echo "OCR_URL=\"$OCR_URL\""
} > .env
chmod 600 .env
ok ".env geschrieben (nur für den eigenen Benutzer lesbar)"

# ── Installieren, Datenbank, Bau ───────────────────────────────────────────
titel "Abhängigkeiten"
if [ -f package-lock.json ]; then
  npm ci --silent || npm install --silent || fehler "npm-Installation fehlgeschlagen"
else
  npm install --silent || fehler "npm-Installation fehlgeschlagen"
fi
ok "$(ls node_modules 2>/dev/null | wc -l) Pakete vorhanden"

titel "Datenbank"
npx prisma generate >/dev/null 2>&1 || fehler "prisma generate fehlgeschlagen"
ok "Prisma-Client erzeugt"

NEU=false
[ -f prisma/dev.db ] || NEU=true
npx prisma db push --skip-generate >/dev/null 2>&1 || fehler "Schema liess sich nicht übernehmen"
ok "Schema übernommen$($NEU && echo ' (neue Datenbank angelegt)')"

npm run db:seed >/dev/null 2>&1 && ok "Grunddaten und Superadmin angelegt" \
  || warn "Seed übersprungen – vermutlich schon vorhanden"

titel "Bau"
npm run build >/dev/null 2>&1 || fehler "Der Bau ist fehlgeschlagen – Ausgabe mit 'npm run build' ansehen"
ok "Anwendung gebaut"

# ── Abschluss ──────────────────────────────────────────────────────────────
titel "Fertig"
cat <<ENDE
  Starten:      npm run start
  Adresse:      $NEXTAUTH_URL
  Anmelden:     $SEED_ADMIN_USER

  Nächste Schritte:
    · Spieler anlegen oder über die Allianz-Verwaltung einlesen
    · Unter Zugriffsverwaltung die weiteren Konten einrichten
    · Für nächtliche Läufe die Einträge aus der README in den Cron übernehmen

  Einstellungen später ändern: dieses Skript erneut aufrufen.
ENDE
[ -z "$LWR_ALLIANCE_ID" ] && warn "Ohne Allianz-Kennung bleiben Serverstellung und Mitgliederabgleich leer."
exit 0
