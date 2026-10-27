"""Build the visual revision from verified CC0 data, without intermediate films."""
import bpy, argparse, json, runpy, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from render_contract import BUILD_SCHEMA, frozen_inputs, scene_binding, write_receipt

STAGES = ('base_scene.py', 'upgrade_scene.py', 'professional_architecture.py',
          'art_direction.py', 'cinematic_lighting.py')

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-commit', required=True, help='Full Git commit frozen before build')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
binding = frozen_inputs(ROOT, args.source_commit)

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
scene.render.use_persistent_data = True
scene.cycles.adaptive_threshold = .03
scene.render.resolution_percentage = 100
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, 600
scene.frame_set(300)
bpy.context.view_layer.update()
bottom = min((o.matrix_world @ Vector(c)).z for o in parts for c in o.bound_box)
assert abs(bottom - .034) < .001
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'NACHTLICHT_FINAL.blend'), compress=True)
saved_scene = scene_binding(ROOT, bpy.data.filepath)
if frozen_inputs(ROOT, args.source_commit) != binding:
    raise ValueError('Build inputs changed during preparation')
receipt = {**binding, **saved_scene, 'schema': BUILD_SCHEMA, 'engine': scene.render.engine,
           'blenderVersion': bpy.app.version_string, 'floorContactMinimumZ': bottom,
           'groundStoneTopRange': [.023, .031], 'assetCount': len(binding['assetFilesSha256']),
           'sceneObjects': len(scene.objects),
           'scope': 'Authored mesh animation; CC0 artist architecture and trees, HDR lighting, procedural road/foliage. No generated-image film frames.'}
write_receipt(ROOT / 'BUILD_RECEIPT.json', receipt)
print('VISUAL_V2_BUILD_PASS', json.dumps(receipt))
