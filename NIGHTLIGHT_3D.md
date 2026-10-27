# Nachtlicht: räumlicher Neuaufbau

## Visuelle Überarbeitung

Die erste räumliche Fassung wurde wegen ihrer zu einfachen Geometrie und Lichtgestaltung gestalterisch zurückgewiesen. Der neue Cycles-Aufbau mit detaillierter Fassade, Bäumen, räumlichem Pflaster und überarbeiteter Kamera ist in [NIGHTLIGHT_VISUAL_V2.md](NIGHTLIGHT_VISUAL_V2.md) beschrieben. Die dort gebundenen Renderquellen und Medienbelege werden getrennt vom folgenden historischen EEVEE-Herstellungspfad geführt.

## Erste 3D-Fassung

Die Nachtlicht-Seite verwendet eine neue 20-Sekunden-Animation aus einer modellierten 3D-Szene. Die bisherige Canvas-Fassung mit gezeichneten Figuren, Drohnensymbol und Dreieckslichtkegel ist nicht mehr der aktive Player oder dessen Fehlerfallback. Historische Dateien bleiben als ältere Quellen erhalten.

Die Drohne besitzt Gehäuse, Arme, Motoren, vier Schutzringe und Rotoren, Landebeine, Kameragelenk und Lichtquelle. Die Umgebung besteht aus 3D-Oberflächen und Körpern. Flugbahn, Kamera, Gelenk und Rotoren werden im Raum animiert. Eine bekleidete Figuren-Mesh erhält eine kleine Kopfbewegung über ein zusätzliches Bone; sie läuft und spricht nicht. Die vorbereiteten KI-Bilder wurden als Look-Referenzen betrachtet, aber nicht als Filmframes oder Hintergrund-Billboards eingebaut.

Die veröffentlichte Fassung wird mit Blender 5.2.3/EEVEE aus 600 einzelnen 3D-Frames in 1920×1080 bei 30 fps berechnet und als H.264-MP4 ausgeliefert. Ein Cycles/OptiX-Vergleichslauf wurde lokal durchgeführt; der endgültige Clip benutzt EEVEE. Die Seite funktioniert ohne externe Runtime-Dienste. Bei reduzierter Bewegung startet der Film nicht automatisch; bei einem Medienfehler erscheint ein Einzelbild aus demselben Render.

## Quellen und Lizenzen

- Bekleidete Figur: [Innerscene, One hand on hip](https://www.innerscene.com/tools/library/3d-parts/one-hand-on-hip-3d-person-standing-7d13068a), vom Anbieter als CC0 aus MakeHuman-Assets ausgewiesen. Die Quelle liefert eine statische Figur; die kleine Kopfbewegung ist eine eigene Ergänzung.
- Pflaster: [Cobblestone Floor 08, Rob Tuytel / Poly Haven](https://polyhaven.com/a/cobblestone_floor_08).
- Mauerwerk: [Brick Wall 001, Dimitrios Savva und Rob Tuytel / Poly Haven](https://polyhaven.com/a/brick_wall_001).
- Poly-Haven-Texturen: [CC0](https://polyhaven.com/license). Die einmalige lokale Asset-Recherche nutzte die öffentliche API; Powered by Poly Haven. Im öffentlichen Player wird die API nicht verwendet.

Die sieben externen Model-/Texturdateien sind mit Downloadquelle, Lizenzquelle und SHA-256 in `tools/nightlight3d/ASSETS.json` gebunden. Eigene Modellierung, Szene, Animation, Integration und Rendercode: Juri / HALVETH. Die Drittassets werden nicht als exklusive eigene Erfindung ausgegeben.

## Lokal reproduzieren

Benötigt: Python 3, Blender 5.2 mit EEVEE, FFmpeg/ffprobe. Die GPU und aktuelle Treiber beeinflussen Renderzeit und Pixel; bitgleiche Render sind nicht garantiert.

1. `python tools/nightlight3d/acquire.py` lädt nur die sieben deklarierten Datenassets und prüft jeden Hash vor dem Speichern.
2. `blender -b --disable-autoexec --python-exit-code 1 --python tools/nightlight3d/build_scene.py -- preview` baut die Szene und schreibt eine lokale `.blend`-Datei.
3. `blender -b --disable-autoexec --python-exit-code 1 tools/nightlight3d/NACHTLICHT_3D.blend --python tools/nightlight3d/scene_check.py` prüft sieben deklarierte Zeitpunkte auf Bewegungs-/Projektionskonsistenz.
4. `blender -b --disable-autoexec --python-exit-code 1 tools/nightlight3d/NACHTLICHT_3D.blend --python tools/nightlight3d/render_animation.py -- animation` rendert 600 echte 3D-Frames.
5. `python tools/nightlight3d/encode.py` prüft die Framefolge und erzeugt Film, Poster und `NIGHTLIGHT_3D_RENDER.json`. Danach `node manifest.cjs build` und `npm run verify:manifest`.

## Gebundener Render und Exportprüfung

Der Medienbeleg führt die tatsächlich gerenderten Quellbytes und den zugehörigen Git-Commit getrennt vom späteren Stand des Exportwerkzeugs. Für die hier veröffentlichte Framefolge ist der Renderquellstand `746c962c94fcef57e70880cc7318ad513ae19e02` gebunden. Die spätere Korrektur des direkten `build_scene.py -- animation`-Aufrufs vereinheitlicht lediglich den Einstieg: Er verwendet jetzt denselben geprüften Renderpfad wie Schritt 4. Eine lokale Blender-Gegenprüfung hat diesen Aufruf bis zur Übergabe an den Finalrenderer ausgeführt.

Wer eine bereits gerenderte lokale Framefolge exportiert, kann den nachweislich passenden Renderquellstand mit `--render-source-commit <40-stelliger-Commit>` angeben. Der Encoder vergleicht alle drei Quellhashes mit diesen Git-Blobs. Ohne diese Option vergleicht er die aktuellen Dateien. Ein Benchmark mit vier Frames, eine fehlende oder unpassende Renderquittung und eine unvollständige Framefolge werden vor dem Ersetzen veröffentlichter Medien zurückgewiesen. Der Encoder bereitet das neue Medienpaket zuerst separat vor und prüft die dekodierte Länge und Auflösung.

Die Modellprüfung erfasst sieben Zeitpunkte sowie die tatsächliche Verschiebung eines ausgewerteten Kopf-Mesh-Punktes und den Abstand der Füße zur Straße. Diese Stichproben sind keine lückenlose Kollisionsprüfung. Die Export-Gegenproben lassen sich mit `python -m unittest discover -s tools/nightlight3d -p "test_*.py"` ausführen; sie laufen auch in der GitHub-Prüfung.

## Aussagegrenze

Dies ist eine vorgegebene 3D-Konzeptanimation. Kollisionsfreie Stichproben im gebundenen Szenenmodell sind keine reale Flugfreigabe oder validierte Flugphysik. Kopfbewegung ist keine eigenständige Figur, Blickentscheidung oder Erkennungsleistung. Technische Render-/Buildprüfungen ersetzen keine gestalterische Abnahme. Das getrennte Falllabor bleibt die ausführbare Software-Arbeitsprobe für synthetische Meldungen und Quellen.
