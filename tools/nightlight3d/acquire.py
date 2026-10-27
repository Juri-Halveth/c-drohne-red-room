"""Download declared CC0 model/texture data; verify bytes before saving.
No executable downloads, credential input, account use or model API calls.
"""
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urlsplit
import hashlib,json
root=Path(__file__).parent;target=root/'sources';target.mkdir(exist_ok=True)
entries=json.loads((root/'ASSETS.json').read_text(encoding='utf-8'))
for entry in entries:
    name=entry['path'];url=entry['source']
    if Path(name).name!=name or urlsplit(url).scheme!='https' or urlsplit(url).hostname not in {'www.innerscene.com','dl.polyhaven.org'}:raise ValueError('Asset contract rejected')
    with urlopen(Request(url,headers={'User-Agent':'HALVETH-local-3D-concept/1.0'}),timeout=90) as response:data=response.read(40*1024*1024+1)
    if len(data)>40*1024*1024 or hashlib.sha256(data).hexdigest()!=entry['sha256']:raise ValueError('Asset integrity mismatch: '+name)
    if name.endswith('.glb') and data[:4]!=b'glTF':raise ValueError('Model format mismatch')
    (target/name).write_bytes(data)
    print('Verified',name,len(data))
