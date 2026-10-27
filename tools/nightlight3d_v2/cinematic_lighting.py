import sys
import bpy,math,json
from pathlib import Path
R=Path(__file__).parent;s=bpy.context.scene
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU';s.cycles.samples=96;s.cycles.adaptive_threshold=.025
for o in s.objects:
    if o.name.startswith('NEW | irregular shallow puddle'):o.hide_render=True
    if o.type=='LIGHT':
        if o.name.startswith('ARCH | practical warm'):o.data.energy=1250;o.data.color=(1,.42,.12);o.data.shadow_soft_size=.10
        elif o.name.startswith('ART | warm light'):o.data.energy=100
        elif o.name=='NEW | cool sky opening':o.data.energy=180;o.data.color=(.22,.37,1)
        elif o.name=='NEW | soft drone rim':o.data.energy=180
for m in bpy.data.materials:
    if m.name.startswith('NEW | subtle night air'):
        next(n for n in m.node_tree.nodes if n.type=='VOLUME_SCATTER').inputs['Density'].default_value=.0038
s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.035
s.camera.data.dof.aperture_fstop=1.8
s.camera.data.lens=42
s.view_settings.exposure=-1.1;s.view_settings.look='AgX - Medium High Contrast'
s.frame_set(300);s.render.resolution_percentage=75;s.render.filepath=str(R/'CINEMATIC_LIGHTING_PREVIEW.png')
bpy.ops.wm.save_as_mainfile(filepath=str(R/'NACHTLICHT_CINEMATIC.blend'),compress=True)

if '--build-only' not in sys.argv:bpy.ops.render.render(write_still=True)
print('CINEMATIC_LIGHTING_DONE',json.dumps({'device':'OPTIX','samples':s.cycles.samples,'actual3DScene':True}))
