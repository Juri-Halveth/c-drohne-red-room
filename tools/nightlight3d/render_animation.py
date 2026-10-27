import bpy,sys,json,hashlib,runpy
from pathlib import Path
R=Path(__file__).parent;s=bpy.context.scene
source_hashes={name:hashlib.sha256((R/file).read_bytes()).hexdigest() for name,file in [('build_scene.py','build_scene.py'),('render_animation.py',Path(__file__).name),('scene_check.py','scene_check.py')]}
runpy.run_path(str(R/'scene_check.py'),run_name='__main__')
s.render.engine='BLENDER_EEVEE';s.eevee.taa_render_samples=32;s.eevee.use_raytracing=True
s.render.resolution_percentage=100;s.render.use_motion_blur=True;s.render.motion_blur_shutter=.4
s.view_settings.exposure=-.45
bpy.data.materials['Night air'].node_tree.nodes.get('Volume Scatter').inputs['Density'].default_value=.003
for ob in s.objects:
    if ob.type=='LIGHT':
        if ob.name.startswith('Amber street lamp'):ob.data.energy=95
        elif ob.name.startswith('Window spill'):ob.data.energy=32
        elif ob.name=='Moon softbox':ob.data.energy=1800
        elif ob.name=='Camera-side fill':ob.data.energy=450
for o in s.objects:
    if o.name.startswith('ROTOR_'):o.driver_add('rotation_euler',2).driver.expression='frame*9.42477796076938'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['benchmark']
if args[0]=='animation':
    s.frame_start=1;s.frame_end=600;s.render.filepath=str(R/'frames-final'/'frame-')
else:s.frame_start=1;s.frame_end=4;s.render.filepath=str(R/'eevee-benchmark'/'frame-')
bpy.ops.render.render(animation=True)
receipt={'engine':s.render.engine,'samples':s.eevee.taa_render_samples,'width':s.render.resolution_x,'height':s.render.resolution_y,'fps':s.render.fps,'frames':[s.frame_start,s.frame_end],'motionBlur':s.render.use_motion_blur,'method':'Rendered 3D mesh animation. No AI still-image frames used.','blenderVersion':bpy.app.version_string,'sourceFilesSha256':source_hashes,'sceneSha256':hashlib.sha256((R/'NACHTLICHT_3D.blend').read_bytes()).hexdigest()}
(R/'RENDER_RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print('ANIMATION_FINISHED',json.dumps(receipt))
