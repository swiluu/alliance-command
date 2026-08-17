#!/usr/bin/env python3
"""
Macht eine Sicherungskopie zum Nachschlagen brauchbar.

In den Tabellen stehen überall nur Kennungen wie `cmsjgzork0002q76m9r78ykra`.
Wer die Sicherung öffnet, um nachzusehen, wer wann eingeteilt war, kann damit
nichts anfangen. Dieses Programm legt zu jeder betroffenen Tabelle eine
**Ansicht** an, in der neben jeder Kennung der zugehörige Name steht.

Ansichten statt zusätzlicher Spalten: sie verdoppeln keine Daten und können
nicht veralten – sie schlagen den Namen beim Lesen nach. Die ursprünglichen
Tabellen bleiben unangetastet.

Angewendet wird das **nur auf die Kopie**, die ausgelagert wird, nie auf die
Datenbank im Betrieb: dort würde Prisma die Ansichten beim nächsten Abgleich
nicht kennen.

    lesbar-machen.py <pfad-zur-kopie.db>
"""
import sqlite3
import sys

# Welche Spalte worauf verweist und welcher Ausdruck den lesbaren Wert liefert.
VERWEISE = {
    "playerId": ("Player", "name"),
    "replacesPlayerId": ("Player", "name"),
    "plannedDriverId": ("Player", "name"),
    "actualDriverId": ("Player", "name"),
    "vipPlayerId": ("Player", "name"),
    "markedBy": None,  # steht schon als Name drin
    "userId": ("User", "username"),
}

# Wochenschlüssel bekommen statt eines Namens die Kalenderwoche.
WOCHEN = {"zugKWId": "ZugKW", "weekId": "VsWeek"}

VORSATZ = "Lesbar_"


def spalten(c, tabelle):
    return [r[1] for r in c.execute(f'pragma table_info("{tabelle}")')]


def main() -> int:
    if len(sys.argv) < 2:
        print("Pfad zur Datenbank fehlt", file=sys.stderr)
        return 2

    c = sqlite3.connect(sys.argv[1])
    tabellen = [
        r[0]
        for r in c.execute(
            "select name from sqlite_master where type='table' "
            "and name not like 'sqlite_%' and name not like '_prisma%'"
        )
    ]

    gebaut = 0
    for tabelle in tabellen:
        eigene = spalten(c, tabelle)
        auswahl = []
        verbindungen = []
        nummer = 0

        for spalte in eigene:
            auswahl.append(f't."{spalte}"')

            ziel = VERWEISE.get(spalte)
            woche = WOCHEN.get(spalte)
            if not ziel and not woche:
                continue
            # Auf sich selbst zu verweisen ergibt keine zusätzliche Auskunft.
            if ziel and ziel[0] == tabelle:
                continue

            nummer += 1
            kurz = f"v{nummer}"
            if ziel:
                zieltabelle, feld = ziel
                if zieltabelle not in tabellen:
                    nummer -= 1
                    continue
                # Der Name kommt direkt hinter die Kennung, nicht ans Zeilenende.
                auswahl.append(f'{kurz}."{feld}" as "{spalte}_Name"')
            else:
                zieltabelle = woche
                if zieltabelle not in tabellen:
                    nummer -= 1
                    continue
                # Ausdruck von Hand zusammensetzen statt zu ersetzen – ein
                # Suchen-und-Ersetzen im SQL-Text traf beim ersten Versuch auch
                # das Zeichenkettenliteral und machte aus "KW26/2026" ein
                # "2626/2026".
                auswahl.append(
                    f"('KW' || {kurz}.kw || '/' || {kurz}.year) as \"{spalte}_Woche\""
                )
            verbindungen.append(f'left join "{zieltabelle}" {kurz} on {kurz}."id" = t."{spalte}"')

        if not verbindungen:
            continue

        name = f"{VORSATZ}{tabelle}"
        c.execute(f'drop view if exists "{name}"')
        c.execute(
            f'create view "{name}" as select {", ".join(auswahl)} '
            f'from "{tabelle}" t {" ".join(verbindungen)}'
        )
        gebaut += 1

    c.commit()

    # Gegenprobe: jede Ansicht muss sich auch lesen lassen.
    for r in c.execute(f"select name from sqlite_master where type='view' and name like '{VORSATZ}%'"):
        c.execute(f'select * from "{r[0]}" limit 1').fetchone()

    print(f"{gebaut} Ansichten angelegt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
