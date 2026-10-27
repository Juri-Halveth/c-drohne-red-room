"""Build the visual revision from verified CC0 data, without intermediate films."""
import bpy, hashlib, json, runpy, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
STAGES = ('base_scene.py', 'upgrade_scene.py', 'professional_architecture.py',
          'art_direction.py', 'cinematic_lighting.py')

for asset in json.loads((ROOT / 'ASSETS.json').read_text(encoding='utf-8')):
    path = (ROOT / 'sources' / asset['path']).resolve()
    if not path.is_relative_to((ROOT / 'sources').resolve()):
        raise ValueError('Asset path outside sources')
    data = path.read_bytes()
    if len(data) != asset['bytes'] or hashlib.sha256(data).hexdigest() != asset['sha256']:
        raise ValueError('Asset changed: ' + asset['path'])

sys.argv = ['blender', '--', '--build-only']
for stage in STAGES:
    runpy.run_path(str(ROOT / stage), run_name='__main__')

scene = bpy.context.scene
for obj in scene.objects:
    if obj.name in {'NL_Wet_Autumn_Leaves', 'NL_Road_Twigs'}:
        obj.location.z += .034
person = next(o for o in scene.objects if o.name.startswith('PERSON |'))
bpy.context.view_layer.update()
parts = [o for o in person.children_recursive if o.type == 'MESH']
bottom = min((o.matrix_world @ Vector(c)).z for o in parts for c in o.bound_box)
person.location.z += .034 - bottom
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.cycles.use_persistent_data = True
scene.cycles.adaptive_threshold = .03
scene.render.resolution_percentage = 100
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, 600
scene.frame_set(300)
bpy.context.view_layer.update()
bottom = min((o.matrix_world @ Vector(c)).z for o in parts for c in o.bound_box)
assert abs(bottom - .034) < .001
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'NACHTLICHT_FINAL.blend'), compress=True)
receipt = {'schema': 'NIGHTLIGHT_3D_VISUAL_BUILD_V2', 'engine': scene.render.engine,
           'blenderVersion': bpy.app.version_string, 'floorContactMinimumZ': bottom,
           'groundStoneTopRange': [.023, .031], 'assetCount': 52,
           'sceneObjects': len(scene.objects),
           'scope': 'Authored mesh animation; CC0 artist architecture and trees, HDR lighting, procedural road/foliage. No generated-image film frames.'}
(ROOT / 'BUILD_RECEIPT.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
print('VISUAL_V2_BUILD_PASS', json.dumps(receipt))
