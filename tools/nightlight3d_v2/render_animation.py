"""Render the actual visual scene. A pilot is isolated from the final frame set."""
import bpy, hashlib, json, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCES = ('base_scene.py', 'upgrade_scene.py', 'professional_architecture.py',
           'art_direction.py', 'cinematic_lighting.py', 'foliage_details.py',
           'prepare_scene.py', 'render_animation.py', 'ASSETS.json')
scene = bpy.context.scene
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == 'OPTIX'
if not any(d.type == 'OPTIX' for d in prefs.devices):
    raise RuntimeError('This production profile requires an available OptiX device')
scene.render.engine = 'CYCLES'
scene.cycles.device = 'GPU'
scene.cycles.samples = 64
scene.cycles.adaptive_threshold = .03
scene.cycles.use_denoising = True
scene.render.use_persistent_data = True
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.render.resolution_percentage = 100
scene.render.fps = 30
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
mode = args[0] if args else 'pilot'
if mode not in {'pilot', 'final'}:
    raise ValueError('Choose pilot or final')
scene.frame_start, scene.frame_end = (300, 303) if mode == 'pilot' else (1, 600)
folder = ROOT / ('pilot-frames' if mode == 'pilot' else 'frames-final')
folder.mkdir(exist_ok=True)
scene.render.filepath = str(folder / 'frame-')
hashes = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in SOURCES}
repo = ROOT.parents[1]
commit = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
for name, digest in hashes.items():
    raw = subprocess.check_output(['git', '-C', str(repo), 'show', commit + ':tools/nightlight3d_v2/' + name])
    if hashlib.sha256(raw).hexdigest() != digest:
        raise ValueError('Render source is not frozen in the source commit: ' + name)
started = time.monotonic()
bpy.ops.render.render(animation=True)
receipt = {'engine': scene.render.engine, 'samples': scene.cycles.samples,
           'width': 1920, 'height': 1080, 'fps': 30,
           'frames': [scene.frame_start, scene.frame_end],
           'motionBlur': scene.render.use_motion_blur,
           'blenderVersion': bpy.app.version_string, 'sourceFilesSha256': hashes,
           'sourceCommit': commit, 'renderSeconds': time.monotonic() - started,
           'sceneSha256': hashlib.sha256((ROOT / 'NACHTLICHT_FINAL.blend').read_bytes()).hexdigest(),
           'method': 'Actual mesh-scene camera frames, Cycles/OptiX; no imagegen film frames.'}
(ROOT / ('PILOT_RECEIPT.json' if mode == 'pilot' else 'RENDER_RECEIPT.json')).write_text(
    json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
print('VISUAL_V2_RENDER_DONE', json.dumps(receipt))
