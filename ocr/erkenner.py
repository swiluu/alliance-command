# -*- coding: utf-8 -*-
"""
Dauerhafter Erkenner: lädt die Modelle einmal und wartet dann auf Aufträge.

Liest je eine Zeile JSON von der Standardeingabe (eine Liste von Bildpfaden)
und schreibt je eine Zeile JSON zurück, eingeleitet vom Kennwort unten.

Warum dauerhaft: Prozessstart samt Modellen kostet rund sieben Sekunden, die
Erkennung eines Bildes knapp fünf. Wer je Auftrag einen Prozess startet, zahlt
das Laden bei jedem einzelnen Bild – bei einem Bild ist es der grösste Posten
der Wartezeit.

Warum ein Faden: genau daran lag der frühere Absturz. Wiederholte Aufrufe im
selben Faden laufen fehlerfrei; über mehrere Fäden verteilt fiel jeder vierte
aus. Dieses Programm arbeitet die Aufträge streng nacheinander ab, und der
Aufrufer hält je Erkenner nur einen Auftrag gleichzeitig.

Das Kennwort vor der Antwort ist nötig, weil die Bibliothek gelegentlich selbst
etwas ausgibt. Ohne es liesse sich ihre Ausgabe nicht von unserer trennen.
"""
import json
import os
import sys

os.environ["DISABLE_MODEL_SOURCE_CHECK"] = "True"

from paddleocr import PaddleOCR

KENNWORT = "@@OCR@@"


def main() -> int:
    ocr = PaddleOCR(
        lang="en",
        use_textline_orientation=False,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
    )
    # Erst melden, wenn die Modelle stehen – der Aufrufer wartet darauf.
    sys.stdout.write(f"{KENNWORT}{json.dumps({'bereit': True})}\n")
    sys.stdout.flush()

    for zeile in sys.stdin:
        zeile = zeile.strip()
        if not zeile:
            continue
        try:
            pfade = json.loads(zeile)
        except Exception:
            continue

        alle = []
        for pfad in pfade:
            texte, polys, scores = [], [], []
            try:
                for r in ocr.predict(pfad):
                    texte += list(r.get("rec_texts", []))
                    polys += [
                        [[float(p[0]), float(p[1])] for p in k] for k in r.get("rec_polys", [])
                    ]
                    scores += [float(s) for s in r.get("rec_scores", [])]
                alle.append({"texte": texte, "polys": polys, "scores": scores})
            except Exception as e:  # noqa: BLE001 – native Fehler
                # Ein misslungenes Bild darf den Erkenner nicht beenden.
                alle.append({"fehler": str(e), "texte": [], "polys": [], "scores": []})

        sys.stdout.write(f"{KENNWORT}{json.dumps(alle)}\n")
        sys.stdout.flush()

    return 0


if __name__ == "__main__":
    sys.exit(main())
