"""Check declared framing/ground invariants; does not render or save the scene."""
import bpy
import hashlib
import json
import sys
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

scene = bpy.context.scene
root = next(o for o in scene.objects if o.name.startswith('DRONE_ROOT'))
figure = next(o for o in scene.objects if o.name.startswith('PERSON |'))
parts = [o for o in root.children_recursive if o.type == 'MESH']
figure_parts = [o for o in figure.children_recursive if o.type == 'MESH']
rows = []
out_of_frame = []
for frame in range(1, 601):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    projected = [world_to_camera_view(scene, scene.camera, obj.matrix_world @ Vector(c))
                 for obj in parts for c in obj.bound_box]
    inside = all(0 <= p.x <= 1 and 0 <= p.y <= 1 and p.z > 0 for p in projected)
    if not inside:
        out_of_frame.append(frame)
    if frame in {1, 90, 180, 270, 360, 450, 600}:
        rows.append({'frame': frame, 'drone': list(root.location),
                     'camera': list(scene.camera.location),
                     'meshBoundsInsideFrame': inside,
                     'projectedRange': [min(p.x for p in projected), max(p.x for p in projected),
                                        min(p.y for p in projected), max(p.y for p in projected)]})
bottom = min((o.matrix_world @ Vector(c)).z for o in figure_parts for c in o.bound_box)
assert not out_of_frame, ('Drone leaves frame at integer samples', out_of_frame)
assert .031 <= bottom <= .035, ('Figure/stone ground gap', bottom)
assert scene.render.engine == 'CYCLES'
assert len({tuple(r['drone']) for r in rows}) > 3
assert len({tuple(r['camera']) for r in rows}) > 3
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
result = {'schema': 'NIGHTLIGHT_VISUAL_V2_GEOMETRY_CHECK',
          'sceneSha256': hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),
          'frameSamples': 600, 'droneMeshParts': len(parts),
          'droneBoundsInsideFrameAtAllIntegerSamples': True,
          'footMinimumZ': bottom, 'stoneTopRange': [.023, .031], 'samples': rows,
          'scope': 'Projected authored mesh bounding boxes at integer frames and figure/stone height. Not subframe coverage, general collision testing, flight physics or artistic acceptance.'}
if args:
    Path(args[0]).write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print('VISUAL_V2_GEOMETRY_CHECK_PASS', json.dumps(result))
