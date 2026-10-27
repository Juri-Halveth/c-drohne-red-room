"""Render the actual visual scene. A pilot is isolated from the final frame set."""
import bpy, argparse, json, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from render_contract import verify_build, start_attempt, complete_attempt

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('mode', choices=('pilot', 'final'), nargs='?', default='pilot')
parser.add_argument('--source-commit', required=True, help='Same frozen full commit used for build')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
binding = verify_build(ROOT, bpy.data.filepath, args.source_commit)
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
scene.frame_start, scene.frame_end = (300, 303) if args.mode == 'pilot' else (1, 600)
scene.frame_step = 1
folder, attempt = start_attempt(ROOT, args.mode, binding)
scene.render.filepath = str(folder / 'frames-final' / 'frame-')
scene.render.use_file_extension = True
scene.render.use_overwrite = False
print('VISUAL_V2_ATTEMPT', str(folder), flush=True)
started = time.monotonic()
bpy.ops.render.render(animation=True)
if verify_build(ROOT, bpy.data.filepath, args.source_commit) != binding:
    raise ValueError('Build binding changed during rendering')
receipt = {**attempt, 'engine': scene.render.engine, 'samples': scene.cycles.samples,
           'width': 1920, 'height': 1080, 'fps': 30,
           'frames': [scene.frame_start, scene.frame_end],
           'motionBlur': scene.render.use_motion_blur,
           'blenderVersion': bpy.app.version_string,
           'renderSeconds': time.monotonic() - started,
           'method': 'Actual mesh-scene camera frames, Cycles/OptiX; no imagegen film frames.'}
receipt = complete_attempt(folder, receipt)
print('VISUAL_V2_RENDER_DONE', json.dumps(receipt))
