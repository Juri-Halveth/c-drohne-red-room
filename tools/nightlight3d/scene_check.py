import bpy,json,math,hashlib
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
R=Path(__file__).parent;s=bpy.context.scene
root=next(o for o in s.objects if o.name.startswith('DRONE_ROOT'))
rig=bpy.data.objects['FIGURE_HEAD_RIG'];figure=next(o for o in s.objects if o.name.startswith('PERSON |'))
rows=[]
for frame in [1,90,180,270,360,450,600]:
    s.frame_set(frame);bpy.context.view_layer.update()
    p=world_to_camera_view(s,s.camera,root.matrix_world.translation)
    q=world_to_camera_view(s,s.camera,figure.matrix_world@Vector((0,0,.85)))
    rows.append({'frame':frame,'dronePosition':list(root.location),'droneYaw':root.rotation_euler.z,'gimbalAngle':next(o for o in s.objects if o.name.startswith('GIMBAL')).rotation_euler.y,'cameraPosition':list(s.camera.location),'headAngle':rig.pose.bones['HEAD'].rotation_euler.y,'droneScreenCenter':[p.x,p.y,p.z],'personScreenCenter':[q.x,q.y,q.z]})
assert len({tuple(r['dronePosition']) for r in rows})>3
assert len({tuple(r['cameraPosition']) for r in rows})>3
assert len({r['gimbalAngle'] for r in rows})>3
assert len({r['headAngle'] for r in rows})>3
assert all(0<p['droneScreenCenter'][0]<1 and 0<p['droneScreenCenter'][1]<1 and p['droneScreenCenter'][2]>0 for p in rows)
assert all(abs(r['dronePosition'][0])+.65<3.97 and r['dronePosition'][2]-.3>0.13 for r in rows)
images=[{'name':i.name,'source':i.source,'width':i.size[0],'height':i.size[1]} for i in bpy.data.images if i.type=='IMAGE']
assert not any('night-street' in x['name'] or 'exec-' in x['name'] for x in images)
result={'scope':'Authored synthetic geometry at seven sampled frames; numeric scene consistency only, not visual acceptance or real flight physics.','meshCount':sum(o.type=='MESH' for o in s.objects),'samples':rows,'materialImages':images,'aiKeyframesUsedAsFilmFrames':False,'droneCentersInsideFrame':True,'pathInsideAuthoredStreetAndAboveGround':True,'human':'CC0 clothed mesh with authored head deformation. No gait, speech or autonomy.'}
(R/'SCENE_CHECK.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print('SCENE_CHECK_PASS',len(rows))
