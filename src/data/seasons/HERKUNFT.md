# Kartendaten der Seasons

Die Dateien `season-*.json` beschreiben die Season-Karten von Last War: Survival —
je Gebiet Kennung, Name, Stufe, Rasterkoordinaten, Buff und Ressourcenertrag.

**Herkunft:** erhoben von [Cpt Hedgehog's Battle HQ](https://cpt-hedge.com/maps),
übernommen mit dem Hinweis des Betreibers dieser Installation, dass die Daten frei
verwendbar sind. Wer dieses Repository weitergibt oder öffentlich betreibt, sollte
das für sich selbst klären.

Nicht enthalten und bewusst nicht übernommen: Bilder, Gestaltung und Programmcode
der genannten Seite. Die Karte in diesem Dashboard wird aus den Zahlen gezeichnet.

## Aufbau

```json
{
  "id": "1",
  "name": "Stronghold",
  "level": 1,
  "isCapitol": false,
  "buff": { "item": "iron", "percentage": 1 },
  "coordinates": { "x": 0, "y": 0, "width": 75, "height": 75 },
  "resources": { "mithril": 100, "spice": 0 }
}
```

Die Ressourcenfelder wechseln je Season — Season 1 zählt `influence`, Season 3
`mithril` und `spice`, Season 4 `copper` und `stone`. Der Code liest sie deshalb
als offene Liste und zeigt an, was da ist, statt feste Namen zu erwarten.

Koordinaten sind Rastereinheiten, nicht Pixel: `width` und `height` geben an, über
wie viele Felder sich ein Gebiet erstreckt. Die kleinste vorkommende Breite ist die
Kantenlänge eines einzelnen Feldes.
