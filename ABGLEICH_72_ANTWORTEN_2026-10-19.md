# Abgleich der 72 Antworten mit der lokalen C-DROHNE-Seite

Stand: 19.10.2026. Eingangsdatei: `C_DROHNE_72_Antworten_2026-10-19.docx`, SHA-256 `BF7E53B7F12B6D4A83A0EBC564966D8C23141578ED5FF75570BBA5B0B88B22D0`. Die DOCX bleibt unverändert. Ihre 72 Antworten sind Projektvorschläge und teilweise eigene Prüfbeobachtungen; die Aussage, der konkrete Seitenquellcode liege nicht vor, gilt nur für den damaligen Dokumentkontext. Dieser Abgleich bindet den lokalen Stand `dist/` vor der hier beschriebenen Korrektur an Git-Commit `41df1d8`.

## Direkt am lokalen Quellstand prüfbar

| Fragen | Beobachtung vor Korrektur | Folge |
| --- | --- | --- |
| 1, 3, 9, 24 | Die Seite nennt Konzept, interaktive Illustration, synthetisch getestete Forschung und künftige Zusammenarbeit getrennt; der Einstieg formulierte „eine Idee, ein prüfbarer Prototyp“ ohne einen durchgehenden Reifegradüberblick. | Ebenen weiterhin direkt am jeweiligen Element binden; technische Eingaben im verlinkten Forschungszweig gesondert reproduzieren. |
| 4, 7, 57, 68 | Der Link „Ohne Szene weiterlesen“ führt bereits zum Inhalt. Die Garage ist kein Pflichtweg. | Nutzertest zu Verständnis und erster Bildschirmhöhe bleibt offen. |
| 8, 17, 63, 70 | Vier Schritte standen auf der Seite, aber ein einzelner Fall wurde nicht vom Eingang bis zur menschlichen Prüfung erzählt. | Ein ausdrücklich erfundenes Unwetterbeispiel wurde im Einstieg ergänzt. Ein ausführbarer Eingabe/Ausgabe-Vertrag bleibt offen. |
| 34, 39 | Das lokale `app.js` sagt beim Kinderwagen bereits, dass das Bild nichts über eine Person darin aussagt. | Beibehalten; kein Rückschluss auf Bildklassifikation oder reale Erfassung. |
| 55 | Die Seite hat keinen Tonpfad; „Dem Ruf folgen“ ist ein sichtbarer Button mit Text. | Ein hypothetischer Ton-/Untertiteltest ist für diesen Stand nicht anwendbar. |
| 59 | Beide Eingangswege führen in denselben Forschungsraum; der Text sagt dies am Einstieg. | Eine Verständlichkeitsprobe bleibt sinnvoll, die technische Wegwirkung ist aber bekannt. |
| 61 | Die Archivnotiz unterscheidet öffentliche Forschungscommits und lokale Website-Historie bereits. | Linkziele und Commit-Inhalte bei externer Verwendung frisch prüfen. |
| 65 | `@media(max-width:720px)` setzte die Hauptnavigation auf `display:none`. | Mobile Navigation bleibt jetzt sichtbar und bricht bei Bedarf in eine zweite Zeile um. Browserprüfung bei 320/375/719/720 CSS-Pixeln: alle fünf Links im Layout, keine horizontale Seitenausdehnung. |
| 72 | Der Haupttext ist statisches HTML; die Erzählbuttons und Prüfblätter brauchen JavaScript. | Ohne JavaScript erscheint nun ein direkter Link zur statischen Forschung; im lokalen Browser geprüft. GitHub-Ausfall lässt die lokalen Erklärtexte bestehen, aber keine lokale Kopie aller Forschungsbelege. |

## Weiter zu prüfen

Die übrigen DOCX-Antworten liefern Prüfentwürfe, keine durch diesen Seitenabgleich bestätigten Geräte-, Sicherheits-, Datenschutz- oder Wirkungsbefunde. Besonders Screenreader, 200/400-%-Zoom, Kontrast auf dem tatsächlichen Rendering, Lizenz je Artefakt, externe Reproduktion und technische Quellenfusion benötigen eigene Beobachtungen. Der Focus Kernel aus dem DOCX ist ein getrenntes Referenzmodul und wird durch die hier geänderte Website nicht integriert.
