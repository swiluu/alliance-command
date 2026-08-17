#!/bin/bash
# Täglicher Abgleich der THP-Rangliste. Läuft nach dem lastwarrank-Scrape
# (04:47) und dessen Neustart (05:03), damit der Stand frisch ist.
# Auf das eigene Projekt wechseln, nicht auf einen festen Pfad: die Skripte
# liegen in beiden Systemen, und dev muss gegen dev laufen. Vorher stand hier
# der Live-Pfad – ein Aufruf aus dem Testsystem veränderte damit still die
# Live-Daten.
cd "$(dirname "$(readlink -f "$0")")/.." || exit 1
/usr/bin/npm run refresh:rangliste
