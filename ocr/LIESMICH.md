# Erkennungsdienst für VS-Screenshots

Liest Name und Punktzahl aus Screenshots der VS-Rangliste. Läuft als eigener
Dienst neben der Anwendung, weil die Erkennung Python braucht.

## Betrieb

Der laufende Dienst liegt unter `/home/ocr-dienst` und wird von pm2 gehalten:

    pm2 start /home/ocr-dienst/venv/bin/python --name ocr-dienst --interpreter none -- dienst.py

Er hört ausschliesslich auf `127.0.0.1:3920` und ist von aussen nicht
erreichbar. Bilder bleiben im Arbeitsspeicher und werden nur kurz als
temporäre Datei abgelegt, die sofort danach gelöscht wird.

Die Python-Umgebung (`venv`) ist mit `/root/lw_ocr/venv` verknüpft; dort liegen
PaddleOCR und seine Modelle, die ohnehin schon auf dem Rechner waren.

**Die Dateien hier sind die Fassung zum Nachschlagen und Wiederherstellen.**
Geändert wird unter `/home/ocr-dienst`; danach gehört die Änderung hierher
zurückkopiert. Der Dienst wird von Test- und Live-System gemeinsam genutzt.

## Stellschrauben

| Umgebungsvariable | Voreinstellung | Bedeutung |
|---|---|---|
| `OCR_PORT` | 3920 | Port |
| `OCR_ARBEITER` | 4 | warm gehaltene Erkenner |
| `OCR_MAX_KANTE` | 900 | längste Bildkante vor der Erkennung |
| `OCR_RUHE_MINUTEN` | 20 | nach so langer Ruhe schalten sich die Erkenner ab |

## Schlafen und Wecken

Gebraucht wird die Erkennung an einem Tag der Woche, beim Erfassen der
VS-Woche. Die Erkenner schalten sich deshalb nach zwanzig Minuten ohne Auftrag
ab und geben ihren Speicher frei – im Ruhezustand belegt der Dienst noch
24 MB statt 3,7 GB.

Geweckt werden sie über `GET /aufwecken`, das die Anwendung beim Öffnen der
Seite „Woche erfassen“ aufruft. Alle vier stehen dann nach wenigen Sekunden,
lange bevor jemand seine Screenshots ausgewählt hat. Klappt das Wecken nicht,
lädt der erste Auftrag die Modelle selbst nach – es dauert dann nur länger.

## Gemessenes

- Ein Bild: rund 8 Sekunden, siebzehn Bilder rund 56 – auch aus dem Schlaf
  heraus, sofern die Seite ein paar Sekunden vorher offen war.
- Vier Erkenner sind der günstigste Punkt: 85 s bei zwei, 70 s bei vier,
  71 s bei acht (gemessen vor dem Warmhalten).
- Die vier Erkenner belegen dauerhaft knapp vier Gigabyte.
- Verkleinern auf 900 Pixel kostet keine Genauigkeit: alle zwölf Namen und
  Punktzahlen der Prüfvorlage blieben richtig, auch bei halber Grösse.

## Warum kein Dauerprozess mit gemeinsamem Modell

Ein früherer Entwurf hielt ein Modell im Dienst selbst und rief es aus den
Fäden des HTTP-Servers auf. Etwa jeder vierte Aufruf scheiterte mit
`std::exception`, und der Speicher wuchs auf 2,5 GB. Die Ursache war nicht der
wiederholte Aufruf, sondern der Aufruf aus mehreren Fäden: sechs Durchläufe
hintereinander im selben Faden liefen fehlerfrei durch.

Deshalb jetzt eigene Prozesse, die ihre Aufträge streng nacheinander abarbeiten.
