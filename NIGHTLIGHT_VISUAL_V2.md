# Nachtlicht · überarbeitete 3D-Szene

**Prüfstand:** Dieser Gestaltungsversuch wurde nach einer kurzen Bewegungsprobe zurückgewiesen. Sein vollständiger Render wurde bei 111 von 600 Bildern gestoppt; er ist kein fertiger oder veröffentlichter Ersatzfilm. Die folgende Beschreibung dokumentiert den Aufbau und die Werkzeuge. Den aktuellen Stand führt [VISUAL_QUALITY_STATUS.md](VISUAL_QUALITY_STATUS.md).

Diese Fassung überarbeitet die sichtbar zu einfache erste 3D-Szene. Die Änderung betrifft Geometrie, Materialien, Licht und Kamera; eine größere Bilddatei allein hätte diese Unterschiede nicht behoben. Die Filmframes entstehen aus einer bewegten Blender-Szene. Die zuvor gezeigten KI-Bilder bleiben Gestaltungsreferenzen.

## Was sich gestalterisch ändert

- Fassaden aus detaillierten modularen 3D-Bauteilen mit zurückgesetzten Fenstern, Türen und Gesimsen.
- Räumliches Pflaster mit einzelnen erhöhten Steinen, nassen Oberflächen und berechneten Reflexionen.
- Metall- und Glaslaternen, warme Lichtinseln, kühler Himmel und leichter räumlicher Dunst.
- Dreidimensionale Bäume, zusätzliche modellierte Blätter und Zweige an Wand und Boden.
- Näher geführte Kamera mit Tiefenschärfe und zurückhaltender Fahrt. Drohne, Rotoren, Kameragelenk und Bodenlicht behalten ihre räumliche Animation.

Die Szene zeigt einen erfundenen nächtlichen Industriehof. Sie ist keine Aufnahme einer wirklichen Straße. Die zusätzliche Detailarbeit ist keine Zusage eines bestimmten Spiele- oder Kinofilmniveaus. Die gestalterische Beurteilung bleibt von Dateiprüfung und erfolgreicher Wiedergabe getrennt.

## Quellen

Die 52 deklarierten externen Model-, Textur- und Lichtdateien sind mit Quelle, Bytezahl, Lizenzquelle und SHA-256 in [ASSETS.json](tools/nightlight3d_v2/ASSETS.json) inventarisiert. Die lokal geladenen Daten umfassen etwa 532 MB; sie gehören nicht zum Website-Download.

| Bestandteil | Quelle | Verwendung |
| --- | --- | --- |
| Modulare Fabrikfassade | [James Ray Cock / Poly Haven](https://polyhaven.com/a/modular_factory_facade) | Räumliche Gebäudebauteile und zugehörige Materialien |
| Kleiner Laubbaum | [Rico Cilliers / Poly Haven](https://polyhaven.com/a/tree_small_02) | Detaillierte Baumgeometrie und Texturen |
| Abendliches Straßen-HDRI | [Grzegorz Wronkowski / Poly Haven](https://polyhaven.com/a/modern_evening_street) | Umgebungslicht und Reflexionen; der direkt sichtbare Himmel ist separat aufgebaut |
| Pflaster und Mauertexturen | [Cobblestone Floor 08](https://polyhaven.com/a/cobblestone_floor_08), [Brick Wall 001](https://polyhaven.com/a/brick_wall_001) / Poly Haven | Materialbasis aus der ersten Fassung |
| Bekleidete Figur | [Innerscene / MakeHuman](https://www.innerscene.com/tools/library/3d-parts/one-hand-on-hip-3d-person-standing-7d13068a) | Statische Mesh-Figur mit ergänzter kleiner Kopfbewegung |

Die Anbieter weisen diese Datenassets als CC0 aus; siehe [Poly Havens Lizenzseite](https://polyhaven.com/license) und die jeweiligen Quellen im Manifest. Drittmodelle, Fototexturen und Lichtaufnahmen werden nicht als eigene Erfindungen ausgegeben. Szenenaufbau, ergänzende Modellierung, Animation und Website-Integration: Juri / HALVETH.

## Nachbauen

Benötigt werden Python 3, Blender 5.2 mit verfügbarem OptiX-Gerät sowie FFmpeg und ffprobe. Der Produktionslauf nutzt Cycles mit 64 Samples, Denoising und Bewegungsunschärfe. Hardware, Treiber und Renderer können die Pixel und Laufzeit verändern; bitgleiche Neuberechnung wird nicht garantiert.

```powershell
python -B tools/nightlight3d_v2/acquire.py
blender -b --disable-autoexec --python-exit-code 1 --python tools/nightlight3d_v2/prepare_scene.py -- --source-commit <vollstaendiger-eigener-Quellcommit>
```

Die Renderquellen einschließlich Assetmanifest, Exportwrapper und Vertragshelfer werden **vor dem Aufbau** in einem eigenen Git-Commit festgehalten. `prepare_scene.py` vergleicht diese Bytes und die Datenassets gegen diesen Stand. Das fertige lokale Szenenprojekt ist `tools/nightlight3d_v2/NACHTLICHT_FINAL.blend`. Der Buildbeleg bindet Quellstand, Assetbytes, exakten Szenenpfad und Digest. Der Renderer prüft vor seinem Lauf die tatsächlich geladene Datei gegen diese Bindung. Die Quellenliste steht in `render_contract.py`.

`check_scene.py` öffnet denselben gespeicherten Szenenstand für eine zusätzliche numerische Prüfung: Die projizierten Bounding-Boxen der 57 Drohnen-Meshteile bleiben an allen 600 ganzzahligen Framepositionen im Bild. Die Figurenhöhe wird gegen die deklarierte Oberkante des Pflasters geprüft. Das ist eine begrenzte Geometrieprüfung; Schatten, Verdeckungen, Zwischenzeiten und allgemeine Kollisionen benötigen eigene Prüfungen.

```powershell
blender -b --disable-autoexec --python-exit-code 1 tools/nightlight3d_v2/NACHTLICHT_FINAL.blend --python tools/nightlight3d_v2/check_scene.py
```

```powershell
blender -b --disable-autoexec --python-exit-code 1 tools/nightlight3d_v2/NACHTLICHT_FINAL.blend --python tools/nightlight3d_v2/render_animation.py -- final --source-commit <derselbe-eigene-Quellcommit>
python -B tools/nightlight3d_v2/encode.py --render-root <ausgegebenes-final-attempt-Verzeichnis> --render-source-commit <derselbe-eigene-Quellcommit>
node manifest.cjs build
npm run verify:manifest
```

`564dc14403e89d883d6088684241d5f7e0361f16` bindet ausschließlich den historischen, nach 111 Frames gestoppten Lauf. Die nachfolgende Korrektur der Build- und Versuchstrennung benötigt einen neuen eingefrorenen Quellstand; sie hat noch keinen vollständigen Film erzeugt. Der finale Lauf erwartet 600 vollständige PNG-Frames für 20 Sekunden bei 1920 × 1080 und 30 fps. Ein kurzer Pilot oder eine fehlende Renderquittung genügt dem Exportwerkzeug nicht.

Der Encoder prüft die vollständigen PNG-Daten, bindet ihre Hashes, kontrolliert den exportierten MP4 und bereitet Film, Poster und Medienbeleg vor dem Ersetzen gemeinsam vor. Für diese Fassung gelten CRF 18, maximal 10 Mbit/s und eine Dateigrenze von 40 MiB. Das erhält mehr Oberflächendetail als das engere Profil der ersten Fassung. Die Grenze garantiert allein keine visuelle Qualität.

## Getrennte Nachweise

Der lokale Aufbau erzeugt `BUILD_RECEIPT.json`. Jeder Renderlauf erhält unter `render/attempts/` ein eigenes Verzeichnis mit eigenen Frames und eigener `RENDER_RECEIPT.json`. Erst der vollständige Lauf erhält `COMPLETED` und die geordnete Liste sämtlicher Framehashes. Der Encoder benötigt genau dieses Versuchsverzeichnis und vergleicht die gegenwärtigen Frames mit der abgeschlossenen Folge, bevor er Medien ersetzt. Ein abgebrochener Lauf kann keine frühere Erfolgsquittung übernehmen. Der veröffentlichbare Exportbeleg heißt `NIGHTLIGHT_3D_RENDER_V2.json`. Quellcommit, Szenendigest, Framefolge und ausgelieferte Medienbytes bleiben getrennt gebunden. Ein Belegeintrag ersetzt weder ein eigenständiges Audit noch die gestalterische Abnahme.

Die Animation verwendet eine vorgegebene Flugbahn. Reale Flugphysik, autonome Beobachtung, Erkennung und Einsatzfähigkeit werden daraus nicht abgeleitet. Die ausführbare Software-Arbeitsprobe der Website bleibt das getrennte Falllabor mit synthetischen Meldungen. Die [erste 3D-Fassung](NIGHTLIGHT_3D.md#erste-3d-fassung) bleibt als historischer Herstellungspfad dokumentiert.
