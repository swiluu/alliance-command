#!/bin/bash
# Nächtliche Sicherung der Datenbank. Läuft per Cron um 03:20 – vor dem
# lastwarrank-Scrape (04:47), damit die beiden sich nicht in die Quere kommen.
# Auf das eigene Projekt wechseln, nicht auf einen festen Pfad: die Skripte
# liegen in beiden Systemen, und dev muss gegen dev laufen. Vorher stand hier
# der Live-Pfad – ein Aufruf aus dem Testsystem veränderte damit still die
# Live-Daten.
cd "$(dirname "$(readlink -f "$0")")/.." || exit 1
/usr/bin/npm run backup
