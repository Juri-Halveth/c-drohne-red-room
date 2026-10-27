"""Small, Blender-free build/attempt contract for the visual revision.

Freeze these sources in Git BEFORE preparation, then pass the same full commit
to preparation and rendering via --source-commit. No implicit HEAD fallback.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import uuid


SOURCE_NAMES = ('base_scene.py', 'upgrade_scene.py', 'professional_architecture.py',
                'art_direction.py', 'cinematic_lighting.py', 'foliage_details.py',
                'prepare_scene.py', 'render_animation.py', 'ASSETS.json',
                'render_contract.py', 'encode.py')
BUILD_SCHEMA = 'NIGHTLIGHT_3D_VISUAL_BUILD_V3'
ATTEMPT_SCHEMA = 'NIGHTLIGHT_3D_RENDER_ATTEMPT_V1'


def file_hash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_receipt(path, receipt):
    Path(path).write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')


def frozen_inputs(root, commit):
    """Check source bytes against an explicit commit, and data against its manifest."""
    root = Path(root).resolve()
    if not isinstance(commit, str) or not re.fullmatch(r'[0-9a-fA-F]{40}', commit):
        raise ValueError('--source-commit requires a full 40-hex frozen source commit')
    commit = commit.lower()
    hashes = {}
    for name in SOURCE_NAMES:
        hashes[name] = file_hash(root / name)
        raw = subprocess.check_output([
            'git', '--no-optional-locks', '-C', str(root.parents[1]), 'show',
            commit + ':tools/nightlight3d_v2/' + name,
        ])
        if hashlib.sha256(raw).hexdigest() != hashes[name]:
            raise ValueError('Source is not frozen in source commit: ' + name)
    assets = {}
    asset_root = (root / 'sources').resolve()
    for asset in json.loads((root / 'ASSETS.json').read_text(encoding='utf-8')):
        name = asset['path']
        path = (asset_root / name).resolve()
        if not path.is_relative_to(asset_root) or name in assets:
            raise ValueError('Invalid or duplicate asset path: ' + name)
        digest = file_hash(path)
        if path.stat().st_size != asset['bytes'] or digest != asset['sha256']:
            raise ValueError('Asset changed: ' + name)
        assets[name] = digest
    return {'sourceCommit': commit, 'sourceFilesSha256': hashes,
            'assetFilesSha256': assets}


def scene_binding(root, loaded_path):
    expected = (Path(root) / 'NACHTLICHT_FINAL.blend').resolve()
    if not loaded_path or Path(loaded_path).resolve() != expected:
        raise ValueError('Loaded Blender filepath does not match expected saved scene')
    return {'scenePath': str(expected), 'sceneSha256': file_hash(expected)}


def verify_build(root, loaded_path, commit):
    """Call before changing render settings or invoking the renderer."""
    root = Path(root)
    build = json.loads((root / 'BUILD_RECEIPT.json').read_text(encoding='utf-8'))
    if build.get('schema') != BUILD_SCHEMA:
        raise ValueError('Build receipt lacks current source/scene binding; rebuild required')
    binding = {**frozen_inputs(root, commit), **scene_binding(root, loaded_path)}
    for key, expected in binding.items():
        if build.get(key) != expected:
            raise ValueError('Stale build or different saved scene: ' + key)
    return binding


def start_attempt(root, mode, binding):
    if mode not in {'pilot', 'final'}:
        raise ValueError('Choose pilot or final')
    # Never reuse an earlier folder or success receipt, even for the same inputs.
    folder = Path(root) / 'render' / 'attempts' / (mode + '-' + uuid.uuid4().hex)
    folder.mkdir(parents=True, exist_ok=False)
    (folder / 'frames-final').mkdir()
    receipt = {**binding, 'schema': ATTEMPT_SCHEMA, 'attemptId': folder.name,
               'status': 'RENDERING', 'mode': mode,
               'frames': [300, 303] if mode == 'pilot' else [1, 600]}
    write_receipt(folder / 'RENDER_RECEIPT.json', receipt)
    return folder, receipt


def complete_attempt(folder, receipt):
    folder = Path(folder)
    first, last = receipt['frames']
    names = [f'frame-{i:04d}.png' for i in range(first, last + 1)]
    frames = folder / 'frames-final'
    if sorted(path.name for path in frames.iterdir()) != names:
        raise ValueError('Attempt does not contain exactly the completed frame sequence')
    hashes = [file_hash(frames / name) for name in names]
    completed = {**receipt, 'status': 'COMPLETED', 'orderedFrameSha256': hashes}
    write_receipt(folder / 'RENDER_RECEIPT.json', completed)
    return completed
