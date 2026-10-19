"""Build the static, fully readable 72-question audit from the numbered source and local replies."""
from pathlib import Path
from html import escape
import re

root = Path(__file__).resolve().parent
source = (root / 'FRAGENRAUM_KRITISCHE_GEGENPROBEN_2026-10-19.md').read_text(encoding='utf-8')
questions = {}
for line in source.splitlines():
    match = re.match(r'^(\d{1,2})\. (.+)$', line)
    if match:
        questions[int(match.group(1))] = match.group(2)

answers = {}
for line in (root / 'audit72.tsv').read_text(encoding='utf-8').splitlines():
    if not line.strip():
        continue
    parts = line.split('|')
    if len(parts) != 4:
        raise ValueError(f'Expected four fields: {line[:60]}')
    index = int(parts[0])
    if index in answers:
        raise ValueError(f'Duplicate answer {index}')
    if parts[1] not in {'SEITE', 'TEILWEISE', 'OFFEN'} or not parts[2].strip() or not parts[3].strip():
        raise ValueError(f'Invalid answer status or empty field at {index}')
    answers[index] = parts[1:]

expected = set(range(1, 73))
if set(questions) != expected or set(answers) != expected:
    raise ValueError(f'Coverage mismatch: questions={sorted(expected-set(questions))}, answers={sorted(expected-set(answers))}')

groups = [
    ('Öffentlichkeit und erster Besuch', 1, 8),
    ('Technik und Softwarestand', 9, 16),
    ('Krisenhilfe und Fachstellen', 17, 24),
    ('Förderung, Wert und Rechte', 25, 32),
    ('Kinder, Jugendliche und Eltern', 33, 40),
    ('Datenschutz und Macht', 41, 48),
    ('Barrierefreiheit', 49, 56),
    ('Erzählung und Belege', 57, 64),
    ('Gestaltung und Orientierung', 65, 72),
]

nav = ''.join(f'<a href="#gruppe-{i}">{i:02d} {escape(name)}</a>' for i, (name, _, _) in enumerate(groups, 1))
sections = []
for group_index, (name, start, end) in enumerate(groups, 1):
    cards = []
    for index in range(start, end + 1):
        status, observation, next_step = answers[index]
        cards.append(f'''<article class="audit-card" id="frage-{index}" data-status="{escape(status)}">
          <div class="audit-meta"><span>FRAGE {index:02d} / 72</span><span class="audit-state">{escape(status)}</span></div>
          <h3>{escape(questions[index])}</h3>
          <div class="audit-answer"><p><b>Aktueller Befund</b>{escape(observation)}</p><p><b>Gegenprobe / nächster Schritt</b>{escape(next_step)}</p></div>
        </article>''')
    sections.append(f'''<section class="audit-group" id="gruppe-{group_index}" aria-labelledby="gruppe-titel-{group_index}"><div class="audit-group-head"><span>{group_index:02d} / 09 · {start:02d}–{end:02d}</span><h2 id="gruppe-titel-{group_index}">{escape(name)}</h2></div><div class="audit-cards">{''.join(cards)}</div></section>''')

html = f'''<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#090a11"><title>72 Gegenproben · C-DROHNE</title><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="audit.css"><link rel="stylesheet" href="accessibility.css"><script src="audit.js" defer></script></head>
<body class="audit-page"><a class="skip" href="#audit-main">Zum Prüfraum springen</a><header class="topbar"><a class="brand" href="index.html#top"><span class="brand-icon">◇</span> HALVETH <span class="brand-slash">/</span> C-DROHNE</a><nav aria-label="Hauptnavigation"><a href="index.html#falllabor">Falllabor</a><a href="leseraum.html">Leseraum</a><a href="index.html#simulation">Simulation</a><a href="index.html#git-spur">Git &amp; Code</a><a href="index.html#angebot">Zusammenarbeit</a></nav><span class="top-status"><i></i> 72 / 72 ERFASST</span></header>
<main id="audit-main" tabindex="-1"><section class="audit-hero shell"><p class="eyebrow cyan">RED ROOM / KRITISCHE GEGENPROBEN</p><h1>72 Fragen.<br><em>Jede Spur sichtbar.</em></h1><p class="audit-lead">Dies ist der gespeicherte Zwischenstand der 72 Ausgangsfragen. Die damaligen Einstufungen wurden vor dem neuen Fall-, Korrektur- und Messlabor erstellt. „SEITE“ heißt: damals auf der Website adressiert. „TEILWEISE“ heißt: ein Teil war sichtbar. „OFFEN“ heißt: die entscheidende Beobachtung oder Umsetzung fehlte. Keiner dieser Stände belegt eine Wirkung im Feld.</p><div class="audit-stats"><span><strong>72 / 72</strong> nummeriert</span><span><strong>{sum(v[0]=='SEITE' for v in answers.values())}</strong> damaliger Stand: Seite</span><span><strong>{sum(v[0]=='TEILWEISE' for v in answers.values())}</strong> damaliger Stand: teilweise</span><span><strong>{sum(v[0]=='OFFEN' for v in answers.values())}</strong> damaliger Stand: offen</span></div><p class="audit-provenance">Die 72 Ausgangsfragen und das zugeschickte Antwortdokument bleiben unverändert. <a href="index.html#falllabor">Im aktuellen Falllabor</a> laufen die neu eingebauten Gegenproben; dieser Fragenraum ist ihr archivierter Ausgangspunkt.</p><a class="audit-back" href="index.html#falllabor">← Zur laufenden Fallprobe</a></section>
<div class="audit-controls shell"><label for="audit-search">Frage oder Befund suchen</label><input id="audit-search" type="search" placeholder="z. B. Datenschutz, Kinderwagen, Zoom"><div class="audit-filters" role="group" aria-label="Status filtern"><button type="button" data-filter="ALLE" aria-pressed="true">Alle</button><button type="button" data-filter="SEITE" aria-pressed="false">Seite</button><button type="button" data-filter="TEILWEISE" aria-pressed="false">Teilweise</button><button type="button" data-filter="OFFEN" aria-pressed="false">Offen</button></div><p id="audit-count" role="status" aria-live="polite">72 Fragen sichtbar.</p><nav class="audit-jump" aria-label="Themengruppen">{nav}</nav></div>
<div class="shell audit-body">{''.join(sections)}</div><section class="audit-end shell"><p class="eyebrow red">DER NÄCHSTE ZUG</p><h2>Eine Gegenprobe<br><em>nach der anderen.</em></h2><p>Für ein Fachgespräch sind besonders der reproduzierbare Textfall, die offenen Datenpfade, ein Vergleich gegen eine einfache Checkliste und die Rechte an künftigen Ergebnissen entscheidend. Die Seite nennt für jede Frage den kleinsten nächsten Test.</p><a href="index.html#angebot">Zum abgegrenzten Arbeitsangebot →</a></section></main><footer class="footer"><div class="shell"><strong>C-DROHNE <span>//</span> RED ROOM</strong><p>72 Fragen · lokal und quellengebunden</p><a href="#audit-main">Nach oben ↑</a></div></footer></body></html>'''
(root / 'dist' / 'audit-72.html').write_text(html, encoding='utf-8')

markdown = ['# C-DROHNE – vollständiger Audit von 72 Gegenproben', '', 'Stand: 19.10.2026. „SEITE“ bezeichnet eine Erklärung/Funktion dieser lokalen Website, nicht einen Feldnachweis. „TEILWEISE“ und „OFFEN“ führen einen konkreten Reopen-Test. Die Ausgangsfragen bleiben in `FRAGENRAUM_KRITISCHE_GEGENPROBEN_2026-10-19.md` erhalten.', '']
for name, start, end in groups:
    markdown += [f'## {name} ({start}–{end})', '']
    for index in range(start, end + 1):
        status, observation, next_step = answers[index]
        markdown += [f'### {index}. {questions[index]}', '', f'**{status} – Befund:** {observation}', '', f'**Gegenprobe / nächster Schritt:** {next_step}', '']
(root / 'AUDIT_72_2026-10-19.md').write_text('\n'.join(markdown), encoding='utf-8')
print(f'Built 72/72: {sum(v[0]=="SEITE" for v in answers.values())} SEITE, {sum(v[0]=="TEILWEISE" for v in answers.values())} TEILWEISE, {sum(v[0]=="OFFEN" for v in answers.values())} OFFEN')
