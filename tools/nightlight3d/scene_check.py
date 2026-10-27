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
figure_meshes=[o for o in figure.children_recursive if o.type=='MESH']
foot_min=min((o.matrix_world@Vector(c)).z for o in figure_meshes for c in o.bound_box)
road=bpy.data.objects['ROAD | physical surface']
road_top=max((road.matrix_world@Vector(c)).z for c in road.bound_box)
foot_gap=foot_min-road_top
assert 0<=foot_gap<=.004,('Figure has no ground contact',foot_gap)
images=[{'name':i.name,'source':i.source,'width':i.size[0],'height':i.size[1]} for i in bpy.data.images if i.type=='IMAGE']
assert not any('night-street' in x['name'] or 'exec-' in x['name'] for x in images)
body=next(o for o in s.objects if 'anatomical body' in o.name)
group=body.vertex_groups['HEAD'].index
head_vertices=[v for v in body.data.vertices if any(g.group==group and g.weight>.99 for g in v.groups)]
assert head_vertices
index=max(head_vertices,key=lambda v:abs(v.co.x)).index
head_points=[]
for f in [1,360]:
    s.frame_set(f);bpy.context.view_layer.update();evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    head_points.append(list(evaluated.matrix_world@evaluated.data.vertices[index].co))
deformation=(Vector(head_points[1])-Vector(head_points[0])).length
assert deformation>.001
result={'scope':'Authored synthetic geometry at seven sampled frames; numeric scene consistency only, not visual acceptance or real flight physics.','meshCount':sum(o.type=='MESH' for o in s.objects),'samples':rows,'materialImages':images,'aiKeyframesUsedAsFilmFrames':False,'droneCentersInsideFrame':True,'pathInsideAuthoredStreetAndAboveGround':True,'footGroundGapMetres':foot_gap,'headMeshDeformation':{'vertexIndex':index,'worldPositionsAt1And360':head_points,'distanceMetres':deformation},'human':'CC0 clothed mesh with authored head deformation. No gait, speech or autonomy.'}
(R/'SCENE_CHECK.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print('SCENE_CHECK_PASS',len(rows))
