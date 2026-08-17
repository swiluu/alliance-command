#!/bin/bash
# Täglicher Namensabgleich über die Spielerprofile (Cron 04:00).
#
# Unabhängig vom Tagesstand der Rangliste: fragt jedes Profil einzeln über
# seine lastwarrank-ID ab. Findet damit auch Umbenennungen von Spielern
# ausserhalb der Top 200 und ist nicht darauf angewiesen, dass die Quelle
# ihren Tagesstand schon veröffentlicht hat.
# Auf das eigene Projekt wechseln, nicht auf einen festen Pfad: die Skripte
# liegen in beiden Systemen, und dev muss gegen dev laufen. Vorher stand hier
# der Live-Pfad – ein Aufruf aus dem Testsystem veränderte damit still die
# Live-Daten.
cd "$(dirname "$(readlink -f "$0")")/.." || exit 1
/usr/bin/npm run abgleich:namen
