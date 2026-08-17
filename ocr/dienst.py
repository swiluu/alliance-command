# -*- coding: utf-8 -*-
"""
Erkennungsdienst für VS-Ranglisten-Screenshots.

Nimmt ein Bild entgegen, lässt es erkennen und gibt Name und Punktzahl je
Zeile zurück. Die Erkennung selbst läuft in einem eigens gestarteten Prozess
(siehe erkenner.py) – die Bibliothek verträgt keine Wiederverwendung.

Hört nur auf 127.0.0.1 – erreichbar allein für Dienste auf diesem Rechner,
nicht aus dem Netz. Die Bilder bleiben im Arbeitsspeicher und werden nirgends
abgelegt.
"""
import base64
import io
import subprocess
import tempfile
import traceback
import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ["DISABLE_MODEL_SOURCE_CHECK"] = "True"
from PIL import Image

PORT = int(os.environ.get("OCR_PORT", "3920"))
# Ein Stapel aus siebzehn Handy-Screenshots kommt auf gut zwanzig Megabyte.
MAX_BYTES = 80 * 1024 * 1024

HIER = os.path.dirname(os.path.abspath(__file__))
ERKENNER = os.path.join(HIER, "erkenner.py")
PYTHON = os.path.join(HIER, "venv", "bin", "python")
# Vier Sekunden Laden plus Erkennung; grosszügig bemessen, damit ein grosses
# Bild nicht am Zeitlimit scheitert.
ZEITLIMIT_S = 180
# Jeder Erkenner belegt kurzzeitig rund ein Gigabyte. Zwei gleichzeitig sind
# genug: mehr würde bei mehreren hochgeladenen Bildern nur Speicher fressen,
# ohne dass es spürbar schneller würde.
# Wie viele Erkenner höchstens gleichzeitig laufen. Der Rechner hat acht
# Kerne; vier lassen genug Luft für die übrigen Dienste und belegen kurzzeitig
# rund vier Gigabyte.
ARBEITER = int(os.environ.get("OCR_ARBEITER", "4"))

# Jeder Erkenner bekommt genau einen Faden. Gemessen macht das für ein
# einzelnes Bild keinen Unterschied (5,8 s mit einem Faden, 6,1 s mit acht) –
# aber es hält die Prozesse davon ab, sich gegenseitig die Kerne wegzunehmen.
# Erst so wird aus vier Prozessen auch vierfache Geschwindigkeit.
# Längste Bildkante, auf die vor der Erkennung verkleinert wird.
#
# Das Aufspüren der Textstellen kostet die meiste Zeit und wächst mit der
# Bildfläche. Gemessen an einer Rangliste: 7,7 s in voller Grösse, 5,3 s bei
# siebzig Prozent, 4,0 s bei der Hälfte – und dabei blieben alle zwölf
# Punktzahlen richtig. Handy-Screenshots sind meist doppelt so gross wie
# nötig; Ziffern von dieser Grösse bleiben auch verkleinert eindeutig.
#
# Vergrössert wird nie: kleinere Bilder bleiben, wie sie sind.
MAX_KANTE = int(os.environ.get("OCR_MAX_KANTE", "900"))

UMGEBUNG = {
    **os.environ,
    "OMP_NUM_THREADS": "1",
    "MKL_NUM_THREADS": "1",
    "OPENBLAS_NUM_THREADS": "1",
}


KENNWORT = "@@OCR@@"


def zeilen_bilden(texte, kaesten, zuversicht):
    """
    Textstücke zu Zeilen bündeln.

    Die Erkennung liefert einzelne Schnipsel mit Koordinaten, keine Zeilen.
    Zwei Stücke gehören zusammen, wenn sich ihre senkrechte Ausdehnung
    überlappt – das ist unabhängig von Auflösung und Zeilenabstand und deshalb
    robuster als feste Pixelabstände.
    """
    stuecke = []
    for text, kasten, sicher in zip(texte, kaesten, zuversicht):
        ys = [p[1] for p in kasten]
        xs = [p[0] for p in kasten]
        stuecke.append(
            {
                "text": text.strip(),
                "oben": min(ys),
                "unten": max(ys),
                "links": min(xs),
                "rechts": max(xs),
                "mitte": (min(ys) + max(ys)) / 2,
                "hoehe": max(ys) - min(ys),
                "sicher": float(sicher),
            }
        )
    stuecke.sort(key=lambda s: s["mitte"])

    zeilen = []
    for s in stuecke:
        passend = None
        for z in zeilen:
            if abs(z["mitte"] - s["mitte"]) <= max(s["hoehe"], z["hoehe"]) * 0.6:
                passend = z
                break
        if passend:
            passend["stuecke"].append(s)
            passend["mitte"] = sum(x["mitte"] for x in passend["stuecke"]) / len(passend["stuecke"])
            passend["hoehe"] = max(passend["hoehe"], s["hoehe"])
        else:
            zeilen.append({"mitte": s["mitte"], "hoehe": s["hoehe"], "stuecke": [s]})

    for z in zeilen:
        z["stuecke"].sort(key=lambda s: s["links"])
    return zeilen


def verkleinern(bild):
    """Auf MAX_KANTE herunterrechnen, nie hinauf."""
    lang = max(bild.width, bild.height)
    if lang <= MAX_KANTE:
        return bild
    faktor = MAX_KANTE / lang
    return bild.resize((round(bild.width * faktor), round(bild.height * faktor)), Image.LANCZOS)


class Erkenner:
    """
    Ein warm gehaltener Erkennerprozess.

    Er lädt die Modelle beim Start und bleibt dann stehen. Das spart bei jedem
    Auftrag rund sieben Sekunden – bei einem einzelnen Bild war das der grösste
    Posten der Wartezeit.

    Die Sperre stellt sicher, dass immer nur ein Auftrag in ihm läuft: die
    Bibliothek verträgt keine Aufrufe aus mehreren Fäden, und genau daran
    scheiterte ein früherer Entwurf.
    """

    def __init__(self, nr: int):
        self.nr = nr
        self.sperre = threading.Lock()
        self.prozess = None

    def _starten(self):
        self.prozess = subprocess.Popen(
            [PYTHON, ERKENNER],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            env=UMGEBUNG,
            text=True,
            bufsize=1,
        )
        # Auf die Bereitmeldung warten, sonst liefe der erste Auftrag ins Leere.
        while True:
            zeile = self.prozess.stdout.readline()
            if not zeile:
                raise RuntimeError(f"Erkenner {self.nr} startete nicht")
            if zeile.startswith(KENNWORT):
                break
        print(f"Erkenner {self.nr} bereit", flush=True)

    def lebt(self) -> bool:
        return self.prozess is not None and self.prozess.poll() is None

    def auftrag(self, pfade):
        with self.sperre:
            if not self.lebt():
                self._starten()
            try:
                self.prozess.stdin.write(json.dumps(pfade) + "\n")
                self.prozess.stdin.flush()
                while True:
                    zeile = self.prozess.stdout.readline()
                    if not zeile:
                        raise RuntimeError("Erkenner antwortet nicht mehr")
                    if zeile.startswith(KENNWORT):
                        return json.loads(zeile[len(KENNWORT):])
            except Exception:
                # Kaputten Prozess wegräumen; der nächste Auftrag startet neu.
                try:
                    self.prozess.kill()
                except Exception:
                    pass
                self.prozess = None
                raise


    def beenden(self):
        """Prozess sauber schliessen und den Speicher freigeben."""
        with self.sperre:
            if not self.lebt():
                self.prozess = None
                return False
            try:
                self.prozess.stdin.close()
                self.prozess.wait(timeout=10)
            except Exception:
                try:
                    self.prozess.kill()
                except Exception:
                    pass
            self.prozess = None
            return True


ERKENNERPOOL = [Erkenner(i) for i in range(ARBEITER)]

# Nach wie vielen Minuten ohne Auftrag die Erkenner abgeschaltet werden.
#
# Gebraucht wird die Erkennung an einem Tag der Woche, beim Erfassen der
# VS-Woche. Die übrige Zeit hielten vier warme Erkenner knapp vier Gigabyte
# belegt, ohne dass jemand sie braucht. Sie fahren deshalb von selbst herunter
# und werden geweckt, sobald die Erfassungsseite geöffnet wird – bis jemand
# seine Bilder ausgewählt hat, stehen sie längst wieder.
RUHE_MINUTEN = int(os.environ.get("OCR_RUHE_MINUTEN", "20"))

_letzte_nutzung = time.time()
_nutzung_sperre = threading.Lock()


def benutzt():
    global _letzte_nutzung
    with _nutzung_sperre:
        _letzte_nutzung = time.time()


def aufwecken():
    """
    Alle Erkenner hochfahren, falls sie schlafen.

    Gleichzeitig, nicht nacheinander: jeder braucht rund sieben Sekunden, und
    hintereinander wären es fast dreissig – länger, als jemand zum Aussuchen
    seiner Screenshots braucht. Nebeneinander stehen alle vier nach sieben.
    """
    benutzt()

    def starte(e):
        if e.lebt():
            return
        try:
            e.auftrag([])
        except Exception as fehler:  # noqa: BLE001
            print(f"Erkenner {e.nr} konnte nicht starten: {fehler}", flush=True)

    faeden = [threading.Thread(target=starte, args=(e,), daemon=True) for e in ERKENNERPOOL]
    for f in faeden:
        f.start()
    for f in faeden:
        f.join()


def schlafwaechter():
    """Schaltet die Erkenner ab, wenn lange nichts kam."""
    while True:
        time.sleep(60)
        with _nutzung_sperre:
            ruhe = time.time() - _letzte_nutzung
        if ruhe < RUHE_MINUTEN * 60:
            continue
        beendet = sum(1 for e in ERKENNERPOOL if e.beenden())
        if beendet:
            print(f"{beendet} Erkenner nach {RUHE_MINUTEN} Minuten Ruhe abgeschaltet", flush=True)


def erkenne_stapel(bilder):
    """
    Mehrere Bilder erkennen, verteilt auf die warm gehaltenen Erkenner.

    Gemessen an siebzehn Ranglisten: zwei Erkenner 85 s, vier 70 s, acht 71 s.
    Der Engpass liegt danach nicht mehr bei den Kernen.
    """
    benutzt()
    pfade = []
    try:
        for bild in bilder:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                pfad = f.name
            bild.save(pfad, "PNG")
            pfade.append(pfad)

        anzahl = max(1, min(len(ERKENNERPOOL), len(pfade)))
        haufen = [pfade[i::anzahl] for i in range(anzahl)]
        zuordnung = [list(range(i, len(pfade), anzahl)) for i in range(anzahl)]

        ergebnisse = [None] * len(pfade)
        fehler = []

        def arbeite(nr):
            if not haufen[nr]:
                return
            try:
                for ziel, wert in zip(zuordnung[nr], ERKENNERPOOL[nr].auftrag(haufen[nr])):
                    ergebnisse[ziel] = wert
            except Exception as e:  # noqa: BLE001
                fehler.append(str(e))

        faeden = [threading.Thread(target=arbeite, args=(i,)) for i in range(anzahl)]
        for f in faeden:
            f.start()
        for f in faeden:
            f.join()

        if fehler:
            raise RuntimeError(fehler[0])
        if any(e is None for e in ergebnisse):
            raise RuntimeError("Ein Teil des Stapels blieb ohne Ergebnis")
        return ergebnisse
    finally:
        for pfad in pfade:
            try:
                os.unlink(pfad)
            except OSError:
                pass


ZAHL_ROH = re.compile(r"^[\d][\d.,\s']*$")
# Die Allianzzeile steht unter jedem Namen und ist für alle gleich. Sie darf
# nicht als Name durchgehen – erkannt am Tag in eckigen Klammern oder am
# ausgeschriebenen Allianznamen.
ALLIANZZEILE = re.compile(r"^\s*\[[^\]]{1,10}\]|concilium|venatoris", re.I)
# Ab wie vielen Ziffern eine Zahl als Punktzahl gilt. Ränge sind ein- bis
# dreistellig, Punktzahlen im zweistelligen Millionenbereich.
MIN_ZIFFERN = 6


def nur_ziffern(text: str) -> str:
    return re.sub(r"\D", "", text)


def haeufige_texte(zeilen, mindestanteil=0.34):
    """
    Textstücke finden, die auf vielen Zeilen wiederkehren.

    In einer Rangliste steht unter jedem Namen dieselbe Allianzzeile. Sie darf
    nicht als Name durchgehen – nur lässt sie sich nicht zuverlässig an ihrem
    Wortlaut erkennen: beim Verkleinern zerfällt „[TAG] Ausgeschriebener Allianzname“
    in Bruchstücke wie „enatoris“, und eine feste Wortliste greift dann nicht
    mehr.

    Deshalb der Umweg über die Häufigkeit: was auf mindestens jeder dritten
    Zeile steht, ist Beiwerk und kein Spielername. Das gilt unabhängig davon,
    wie die Allianz heisst und in welche Stücke sie zerfällt.
    """
    from collections import Counter

    zaehler = Counter()
    for z in zeilen:
        # Je Zeile nur einmal zählen, sonst schlägt eine doppelte Nennung
        # innerhalb derselben Zeile durch.
        for text in {st["text"].strip().lower() for st in z["stuecke"] if len(st["text"].strip()) >= 4}:
            zaehler[text] += 1

    grenze = max(3, int(len(zeilen) * mindestanteil))
    return {t for t, n in zaehler.items() if n >= grenze}


def eintraege_bilden(zeilen):
    """
    Aus den erkannten Zeilen Name-und-Punkte-Paare bilden.

    Nicht zeilenweise, sondern über die Punktzahl: in der Rangliste steht sie
    rechts, mittig zum zweizeiligen Block aus Name und Allianz. Zu jeder
    gefundenen Punktzahl wird der nächstgelegene brauchbare Name gesucht – der
    senkrecht am nächsten liegt und links davon steht.

    Der Weg über die Punktzahl ist verlässlicher als über die Zeile: ob die
    Zahl auf Höhe des Namens oder der Allianzzeile erkannt wird, hängt vom
    Bildausschnitt ab, ihre Nachbarschaft zum Namen dagegen nicht.
    """
    beiwerk = haeufige_texte(zeilen)

    punkte_kandidaten = []
    namens_kandidaten = []

    for z in zeilen:
        for st in z["stuecke"]:
            text = st["text"].strip()
            if not text:
                continue
            roh = text.replace(" ", "")
            ziffern = nur_ziffern(roh)

            if ZAHL_ROH.match(roh) and len(ziffern) >= MIN_ZIFFERN:
                punkte_kandidaten.append({**st, "wert": int(ziffern)})
                continue
            # Rangziffer, Medaille, Allianzzeile: alles kein Name.
            if len(ziffern) == len(roh) and len(roh) <= 3:
                continue
            if ALLIANZZEILE.search(text) or text.lower() in beiwerk:
                continue
            if len(text) < 2:
                continue
            namens_kandidaten.append(st)

    eintraege = []
    vergeben = set()
    for p in sorted(punkte_kandidaten, key=lambda x: x["mitte"]):
        bester, abstand_bester = None, None
        for i, n in enumerate(namens_kandidaten):
            if i in vergeben or n["links"] >= p["links"]:
                continue
            abstand = abs(n["mitte"] - p["mitte"])
            # Weiter als anderthalb Zeilenhöhen weg gehört nicht mehr zusammen.
            if abstand > max(p["hoehe"], n["hoehe"]) * 2.5:
                continue
            # Bei nahezu gleichem Abstand den höher stehenden nehmen: in der
            # Rangliste steht der Name über der Allianzzeile.
            if (
                abstand_bester is None
                or abstand < abstand_bester - 1
                or (abs(abstand - abstand_bester) <= 1 and n["oben"] < namens_kandidaten[bester]["oben"])
            ):
                bester, abstand_bester = i, abstand
        if bester is None:
            continue
        vergeben.add(bester)
        n = namens_kandidaten[bester]
        # Getrennt ausweisen: ein unsicher gelesener Name fällt in der
        # Prüfliste sofort auf, eine unsicher gelesene Zahl dagegen nicht –
        # sie sieht plausibel aus und landet im Vier-Wochen-Schnitt.
        # Umrissene Fläche über Name und Zahl, mit etwas Luft. Damit lässt
        # sich später genau der Bildausschnitt zeigen, aus dem diese Zeile
        # stammt – wer eine unsichere Zahl prüfen will, soll nicht im
        # Originalbild suchen müssen.
        luft = max(n["hoehe"], p["hoehe"]) * 0.8
        links = max(0.0, min(n["links"], p["links"]) - luft)
        oben = max(0.0, min(n["oben"], p["oben"]) - luft)
        rechts = max(n["rechts"], p["rechts"]) + luft
        unten = max(n["unten"], p["unten"]) + luft

        eintraege.append(
            {
                "name": n["text"].strip(),
                "punkte": p["wert"],
                "sicher": round(min(n["sicher"], p["sicher"]), 3),
                "sicherName": round(n["sicher"], 3),
                "sicherPunkte": round(p["sicher"], 3),
                "kasten": {
                    "x": round(links, 1),
                    "y": round(oben, 1),
                    "b": round(rechts - links, 1),
                    "h": round(unten - oben, 1),
                },
            }
        )

    return eintraege


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Kein Zugriffsprotokoll – die Nutzlast enthält Bilder.

    def _json(self, code, nutzlast):
        koerper = json.dumps(nutzlast).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(koerper)))
        self.end_headers()
        self.wfile.write(koerper)

    def do_GET(self):
        if self.path == "/gesund":
            return self._json(200, {"bereit": True})
        if self.path == "/aufwecken":
            # Im Hintergrund, damit die Seite nicht auf das Laden wartet.
            threading.Thread(target=aufwecken, daemon=True).start()
            wach = sum(1 for e in ERKENNERPOOL if e.lebt())
            return self._json(200, {"wach": wach, "gesamt": len(ERKENNERPOOL)})
        self._json(404, {"fehler": "unbekannt"})

    def do_POST(self):
        if self.path != "/erkennen":
            return self._json(404, {"fehler": "unbekannt"})

        laenge = int(self.headers.get("Content-Length") or 0)
        if laenge <= 0 or laenge > MAX_BYTES:
            return self._json(413, {"fehler": "Bild fehlt oder ist zu gross"})

        try:
            daten = json.loads(self.rfile.read(laenge))
            # Ein einzelnes Bild bleibt weiterhin erlaubt.
            rohbilder = daten.get("bilder") or [daten["bild"]]
            bilder = []
            for roh in rohbilder:
                if "," in roh[:64]:
                    roh = roh.split(",", 1)[1]
                bilder.append(Image.open(io.BytesIO(base64.b64decode(roh))).convert("RGB"))
        except Exception as e:
            return self._json(400, {"fehler": f"Bild nicht lesbar: {e}"})

        if not bilder:
            return self._json(400, {"fehler": "kein Bild übergeben"})

        try:
            t0 = time.time()
            # Vor der Erkennung verkleinern. Die zurückgegebenen Koordinaten
            # beziehen sich damit auf das kleinere Bild – deshalb werden auch
            # dessen Masse gemeldet. Der Browser schneidet aus der Originaldatei
            # zu, rechnet aber mit diesen Massen, und weil beides derselbe
            # gleichmässige Massstab ist, trifft der Ausschnitt trotzdem.
            kleine = [verkleinern(b) for b in bilder]
            rohergebnisse = erkenne_stapel(kleine)

            antworten = []
            for bild, roh_erg in zip(kleine, rohergebnisse):
                zeilen = zeilen_bilden(roh_erg["texte"], roh_erg["polys"], roh_erg["scores"])
                zeilen.sort(key=lambda z: z["mitte"])
                antworten.append(
                    {
                        "breite": bild.width,
                        "hoehe": bild.height,
                        "zeilen": len(zeilen),
                        "eintraege": eintraege_bilden(zeilen),
                        "roh": [" ".join(st["text"] for st in z["stuecke"]) for z in zeilen],
                    }
                )

            gesamt = round(time.time() - t0, 2)
            # Einzelbild-Antwort unverändert lassen, damit ältere Aufrufer
            # weiter funktionieren.
            if "bilder" not in daten:
                return self._json(200, {"dauer": gesamt, **antworten[0]})
            return self._json(200, {"dauer": gesamt, "bilder": antworten})
        except Exception as e:
            traceback.print_exc()
            return self._json(500, {"fehler": f"Erkennung fehlgeschlagen: {e}"})


if __name__ == "__main__":
    # Bewusst kein Vorwärmen beim Start: der Dienst läuft rund um die Uhr, die
    # Erkennung wird an einem Tag der Woche gebraucht. Geweckt wird über
    # /aufwecken, sobald jemand die Erfassungsseite öffnet.
    threading.Thread(target=schlafwaechter, daemon=True).start()
    print(
        f"bereit – Port {PORT}, {len(ERKENNERPOOL)} Erkenner auf Abruf, "
        f"Ruhe nach {RUHE_MINUTEN} min",
        flush=True,
    )
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
