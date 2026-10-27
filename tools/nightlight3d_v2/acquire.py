"""Acquire the exact declared data files; Blender must load them with autoexec disabled."""
import hashlib, json
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
TARGET = (ROOT / 'sources').resolve()
TARGET.mkdir(exist_ok=True)
for entry in json.loads((ROOT / 'ASSETS.json').read_text(encoding='utf-8')):
    name = PurePosixPath(entry['path'])
    url = urlsplit(entry['source'])
    target = (TARGET / entry['path']).resolve()
    if (name.is_absolute() or '..' in name.parts or '\\' in entry['path']
            or not target.is_relative_to(TARGET) or url.scheme != 'https'
            or url.hostname not in {'www.innerscene.com', 'dl.polyhaven.org'}
            or not 0 < entry['bytes'] <= 128 * 1024 * 1024):
        raise ValueError('Rejected asset contract')
    if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == entry['sha256']:
        continue
    with urlopen(entry['source'], timeout=90) as response:
        data = response.read(entry['bytes'] + 1)
    if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
        raise ValueError('Asset bytes differ: ' + entry['path'])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    print('Verified', entry['path'], len(data))
