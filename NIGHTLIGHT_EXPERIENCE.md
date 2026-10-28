# Nachtlicht: interaktiver Perspektivkorridor

Stand 28.10.2026. Die Seite `dist/nachtlicht.html` ersetzt den beanstandeten 20-Sekunden-Film durch eine steuerbare, lokal gebündelte Browser-3D-Szene. Anlass war die gestalterische Prüfung: Der Film zeigte zwar eine Drohne, Straße und Figur, erklärte aber weder den Zweck der Beobachtung noch die Herkunft der Meldungen. Die MP4 und ihr Poster sind aus dem aktuellen `dist/` entfernt. Ihre frühere Herstellung ist in `NIGHTLIGHT_3D.md` als historische technische Spur dokumentiert.

## Ein Fall, vier Blickwinkel

Der gezeigte Fall ist ausdrücklich erfunden: Nach einem Unwetter gibt es eine Meldung über einen möglicherweise versperrten Hilfsweg. Die orange Kreisfläche ist eine **Fragestelle** und kein nachgewiesenes Hindernis. Das Szenenmodell enthält einen Ortssatz; die vier Ansichten verändern nur Kamera, Schwerpunkt und Erklärung.

| Ansicht | Kamera (x, y, z) | Blickziel (x, y, z) | Gezeigte Frage |
| --- | --- | --- | --- |
| 01 Am Hilfsweg | (10, 8.2, 14) | (0, 0.7, -1) | Was ist derzeit überhaupt bekannt? |
| 02 Blick der Drohne | (2.1, 3.35, 3.2) | (0, 0.15, -1.35) | Welchen Ausschnitt zeigt eine modellierte Kamera? |
| 03 Herkunft | (0.1, 17, 9) | (0, 0, -1.5) | Welche Meldungen sind voneinander abhängig? |
| 04 Menschliche Prüfung | (-9, 8.8, 13) | (0, 0.8, -1.4) | Welche frische Prüfung fehlt vor einer Handlung? |

Koordinaten sind entworfene Szenenmeter in einem rechtshändigen 3D-Modell mit Y nach oben. Die perspektivische Kamera hat 46° vertikales Sichtfeld. Die Namen und Positionen aller Ortsanker stehen einmalig in `src/nightlight-scene-data.js`; die vier Kameras referenzieren diese Anker. A, B und C sind **Meldungen**, keine drei Drohnen oder drei unabhängig beobachtende Personen.

| Marker | Modellkoordinate | Bedeutung im festen Textfall |
| --- | --- | --- |
| C-DROHNE | (2.1, 3.45, 3.2) | Synthetisches 3D-Modell; keine verbundene Hardware |
| ? | (0, 0.08, -1.35) | Mögliche Stelle, aktueller Zustand offen |
| A | (-3.9, 0.25, 1.7) | Meldung mit deklariertem Ursprung um 10:02 |
| B | (4.3, 0.25, 2.2) | Weitergabe von A um 10:04; keine neue Beobachtung |
| C | (3.9, 0.25, -5.8) | Anderer deklarierter Ursprung, Aussage „frei“, aber Vortag |
| Prüfung | (-5.2, 0.25, -5.3) | Platzhalter für eine zuständige Person und frische Information |

Die gestrichelte Verbindung A → B zeigt eine **deklarierte Weitergabe**. Sie ist kein automatisch verifizierter Provenienznachweis. C wird nicht als aktuell gezählt. Der Status bleibt `LAGE OFFEN`, und die letzte Ansicht benennt die nächste zulässige Frage: Wer kann eine frische, unabhängige Information prüfen? Die ausführbare Berechnung und Varianten stehen getrennt im [Falllabor](dist/index.html) mit den festen [Testdaten](dist/case-fixtures.json).

## Implementierung

- `src/nightlight-scene-data.js`: einmaliger Quellzustand mit Anker-IDs, Koordinaten, vier Kameras und Erläuterungen.
- `src/nightlight-experience.js`: Three.js-Szene, modellierte Drohne, Straßenraum, Ortsmarker, Kameraübergänge und UI-Anbindung.
- `dist/nightlight-experience.js`: mit esbuild lokal gebündeltes Browser-Skript; keine CDN- oder API-Abhängigkeit.
- `dist/nightlight-experience.css` und `dist/nachtlicht.html`: responsive Darstellung, lesbare Textspur, Tastaturknöpfe und ein schematischer Fallback ohne WebGL. Bei abgeschaltetem JavaScript bleibt der Fall als Text lesbar.

Zum Reproduzieren: `npm ci --ignore-scripts`, dann `npm run build:nightlight`. Die durch `esbuild` erzeugte Browserdatei gehört zum statischen Paket. Der Build verwendet die in `package-lock.json` gebundenen Versionen; die Three.js-Lizenz steht in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) und in der [veröffentlichten Lizenzansicht](dist/third-party.html).

## Prüfgrenze

`nightlight-corridor.test.mjs` prüft eindeutige Anker, vier verschiedene Kamerapositionen, endliche Projektionen und stabile Objekt-IDs über die vier Ansichten. Der lokal markierte persönliche HALVETH-Perspektivkorridor wurde zusätzlich auf einer normalisierten Kopie der deklarativen Anker angewandt; das Ergebnis bedeutet nur Konsistenz mit **diesem synthetischen Quellzustand**. Die Browserprüfung kontrolliert Perspektivwahl, Status, mobile Breite, Textfallback und WebGL-Fallback. Keine dieser Prüfungen misst reale Flugphysik, Sensorik, Straßenzustand, Quellenidentität oder eine unabhängige Person.

Die Seite liest keine Kamera, kein Mikrofon und keinen Standort von Besuchern. Sie lädt keine externen Skripte oder Laufzeitdaten. Auf Geräten ohne WebGL bleibt der schematische Lageplan mit Textbedienung erhalten; bei `prefers-reduced-motion` werden Kamerawechsel sofort gesetzt und Rotoren nicht animiert.
