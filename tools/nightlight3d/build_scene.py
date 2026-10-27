"""NACHTLICHT: authored mesh scene, no billboard humans or image-film frames.
Run: blender -b --disable-autoexec --python build_scene.py -- preview|animation
"""
import bpy,math,random,json,sys
from pathlib import Path
from mathutils import Vector
R=Path(__file__).parent;S=R/'sources';O=R/'render';O.mkdir(exist_ok=True)
random.seed(127)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=48
scene.eevee.use_raytracing=True;scene.eevee.use_fast_gi=True
scene.eevee.shadow_pool_size='1024'
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.fps=30;scene.frame_start=1;scene.frame_end=600
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.world.color=(.045,.065,.11)
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.19,.32,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.12

def mat(name,color,metal=0,rough=.4,emission=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m
graphite=mat('Graphite | powder-coated housing',(.045,.065,.075),.72,.29)
metal=mat('Brushed aluminium',(.25,.29,.31),.9,.25)
rubber=mat('Rubber seals',(.014,.019,.023),.05,.7)
glass=mat('Lens optical glass',(.025,.055,.075),.85,.12)
white=mat('Lamp diffuser',(1,.85,.62),.1,.25,12)
red=mat('Port indicator',(.8,.035,.025),.2,.3,5)
green=mat('Starboard indicator',(.05,.65,.32),.2,.3,4)
black=mat('Street ironwork',(.025,.038,.045),.75,.35)
wood=mat('Painted midnight-blue joinery',(.025,.065,.085),.14,.32)
trim=mat('Sandstone window trim',(.31,.27,.22),0,.6)
warm=mat('Warm lamp glass',(1,.52,.18),0,.3,4)
window=mat('Window reflection',(.04,.075,.1),.8,.12)

def pbr(name,asset,scale,wet=False):
    m=mat(name,(.2,.2,.2));n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
    coord=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs[3].default_value=scale
    l.new(coord.outputs['Object'],mapping.inputs[0])
    for kind in ['Diffuse','Rough']:
        t=n.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(S/(asset+'_'+kind+'.jpg')),check_existing=True)
        t.projection='BOX';t.projection_blend=.18;l.new(mapping.outputs[0],t.inputs['Vector'])
        if kind=='Diffuse':l.new(t.outputs['Color'],p.inputs['Base Color'])
        else:
            t.image.colorspace_settings.name='Non-Color';v=n.new('ShaderNodeMapRange');v.inputs['To Min'].default_value=.09 if wet else .45;v.inputs['To Max'].default_value=.3 if wet else .85;l.new(t.outputs['Color'],v.inputs['Value']);l.new(v.outputs[0],p.inputs['Roughness'])
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=38;noise.inputs['Detail'].default_value=4;l.new(mapping.outputs[0],noise.inputs['Vector'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.32;bump.inputs['Distance'].default_value=.035;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],p.inputs['Normal'])
    if wet:p.inputs['Coat Weight'].default_value=.4;p.inputs['Coat Roughness'].default_value=.12
    return m
ground=pbr('Wet scan | Poly Haven cobblestone', 'cobblestone_floor_08',.5,True)
brick=pbr('Weathered masonry | Poly Haven', 'brick_wall_001',.33)

def finish(o,name,material,parent=None):
    o.name=name
    if material:o.data.materials.append(material)
    if parent:o.parent=parent
    return o
def box(name,loc,size,material,bevel=.02,parent=None):
    # Construct local mesh directly: avoids context/depsgraph rebuild per cube.
    mesh=bpy.data.meshes.new(name)
    verts=[(x*size[0]/2,y*size[1]/2,z*size[2]/2) for x,y,z in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
    faces=[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)]
    mesh.from_pydata(verts,[],[tuple(reversed(f)) for f in faces])
    mesh.update();o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);o.location=loc
    if bevel:b=o.modifiers.new('Machined edge radius','BEVEL');b.width=bevel;b.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return finish(o,name,material,parent)
def ball(name,loc,scale,material,parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=loc);o=bpy.context.object;o.scale=scale
    for p in o.data.polygons:p.use_smooth=True
    return finish(o,name,material,parent)
def cyl(name,loc,radius,depth,material,parent=None,rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=radius,depth=depth,location=loc);o=bpy.context.object
    if rotation:o.rotation_euler=rotation
    b=o.modifiers.new('Edge radius','BEVEL');b.width=min(radius*.15,.015);b.segments=2;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return finish(o,name,material,parent)
def rod(name,a,b,radius,material,parent=None):
    middle=(Vector(a)+Vector(b))/2;v=Vector(b)-Vector(a)
    o=cyl(name,middle,radius,v.length,material,parent);o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return o
def ring(name,loc,major,minor,material,parent=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=40,minor_segments=8,location=loc)
    return finish(bpy.context.object,name,material,parent)
def light(name,kind,loc,color,energy,size=.5,target=None):
    d=bpy.data.lights.new(name,kind);d.energy=energy;d.color=color
    d.use_shadow=kind=='SPOT' or name=='Moon softbox'
    if kind=='AREA':d.shape='DISK';d.size=size
    elif kind=='POINT':d.shadow_soft_size=size
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc
    if target:o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o

# Real depth: road, pavements, rows of facades, recesses and ironwork.
box('ROAD | physical surface',(0,12,-.13),(10,60,.25),ground,.015)
for side in [-1,1]:
    box('Raised pavement',(side*4.6,12,-.01),(1.2,60,.24),ground,.035)
    for y in range(-10,42):box('Individual curb stone',(side*3.97,y,.055),(.2,.94,.3),trim,.025)
    for i in range(8):
        y=i*5.4
        height=[9.6,10.5,8.8,11.2,9.3,10,10.8,9.1][i]
        facade=brick if i%3==0 else mat('Stone facade'+str(side)+str(i),[(.2,.22,.23),(.25,.235,.205),(.16,.19,.21)][i%3],0,.78)
        box('Building | masonry',(side*6.05,y,height/2),(2.2,5.25,height),facade,.045)
        if i%3:box('Brick ground floor',(side*4.98,y,1.5),(.15,5.23,3),brick,.02)
        for z in [3.15,6.1,height-.2]:box('Facade horizontal stone course',(side*4.83,y,z),(.16,5.25,.1),trim,.018)
        for floor in [1.5,4.5,7.2]:
            for dy in [-1.45,1.35]:
                x=side*4.925
                box('Recessed glass',(x,y+dy,floor),(.035,1.18,1.75),window,.005)
                for z in [floor-.93,floor+.93]:box('Stone window lintel',(x-side*.07,y+dy,z),(.18,1.45,.12),trim,.02)
                for yy in [y+dy-.65,y+dy+.65]:box('Window jamb',(x-side*.07,yy,floor),(.16,.11,1.8),trim,.02)
                box('Window central mullion',(x-side*.07,y+dy,floor),(.1,.04,1.75),wood,.005)
                if (i+int(floor)+int(dy*10))%4==0:
                    inside=mat('Occupied window'+str(side)+str(i)+str(floor)+str(dy),(.42,.22,.08),0,.7,.35)
                    box('Curtain inside window',(x+side*.025,y+dy,floor),(.02,1.12,1.6),inside,.002)
        box('Drainpipe',(side*4.82,y+2.43,4.7),(.09,.09,9.4),black,.02)
        if i<5:
            lx=side*4.43;ly=y+.3
            rod('Lamp bracket',(side*4.9,ly,3.6),(lx,ly,3.6),.035,black)
            box('Wall lamp',(lx,ly,3.35),(.24,.24,.46),warm,.025)
            for zz in [3.1,3.6]:box('Lantern iron cap',(lx,ly,zz),(.32,.32,.05),black,.02)
            for xx in [lx-.12,lx+.12]:
                for yy in [ly-.12,ly+.12]:rod('Lantern frame',(xx,yy,3.1),(xx,yy,3.6),.014,black)
            light('Amber street lamp','POINT',(lx-side*.1,ly,3.2),(1,.53,.22),150,.28)
            light('Window spill','AREA',(side*4.6,ly,3),(1,.52,.24),55,2,(0,ly,1.5))

# A shopfront with layered panels and glass, all mesh surfaces.
for y in [-1.4,.25,1.9]:
    box('Shop panel',(-4.89,y,1.15),(.14,1.55,2.25),wood,.025)
    box('Shop glass',(-4.78,y,1.7),(.025,1.25,1.15),window,.005)
    box('Shop lower inset',(-4.78,y,.5),(.05,1.2,.58),graphite,.01)
box('Shop canopy',(-4.25,.1,3),(1.5,5.2,.2),wood,.025)
for yy in [-2.5,2.6]:rod('Canopy iron support',(-4.85,yy,2.1),(-3.7,yy,2.9),.025,black)
# Three-dimensional street props and a terminus instead of a bare flat horizon.
for x,y in [(-3.4,4),(3.4,14),(-3.4,19)]:
    cyl('Street bollard',(x,y,.58),.07,.95,black)
    ball('Bollard cap',(x,y,1.06),(.075,.075,.05),metal)
for yy in [3.4,15.3]:
    box('Timber bench seat',(-3.25,yy,.62),(.55,1.7,.1),wood,.02)
    for dx in [-.2,.2]:
        for dy in [-.65,.65]:rod('Bench leg',(-3.25+dx,yy+dy,.14),(-3.25+dx,yy+dy,.6),.035,black)
    box('Bench back',(-3.52,yy,.94),(.08,1.7,.6),wood,.03)
box('Distant closing facade',(0,40,6),(10,2,12),brick,.05)
box('Distant tower',(-1,40,10.5),(2.8,2.8,11),brick,.08)
for i in range(16):
    y=-1.7+random.random()*3.5;x=-3.8+random.random()*1.25
    shard=box('Glass fragment',(x,y,.13),(.025+random.random()*.13,.02+random.random()*.08,.006),glass,.002);shard.rotation_euler[2]=random.random()*math.tau
for y in range(5,19):
    box('Low wall',(3.8,y,.62),(.4,.96,1.15),brick,.025)
    cyl('Iron fence bar',(3.8,y,.13+1.65),.025,1.2,black)
    if y%2==0:ball('Hedge volume',(4.7,y,1.8),(.65,.85,.7),mat('Leaves'+str(y),(.025,.065+random.random()*.03,.035),0,.8))

# A fully modelled unarmed quadcopter: body, arms, guards, propellers, optics.
root=bpy.data.objects.new('DRONE_ROOT | animated spatial transform',None);scene.collection.objects.link(root)
body=box('Drone housing',(0,0,0),(.44,.34,.16),graphite,.065,root)
box('Battery cover',(0,.01,.09),(.26,.22,.035),rubber,.018,root)
for x in [-.16,.16]:
    for y in [-.1,.1]:cyl('Housing fastener',(x,y,.085),.009,.006,metal,root)
for side in [-1,1]:
    for front in [-1,1]:
        x=side*.39;y=front*.32
        rod('Carbon arm',(side*.13,front*.08,0),(x,y,.01),.035,graphite,root)
        cyl('Motor',(x,y,.065),.058,.12,metal,root)
        guard=ring('Propeller safety guard',(x,y,.14),.17,.013,graphite,root)
        for a in [0,math.pi/2,math.pi,3*math.pi/2]:rod('Guard strut',(x,y,.11),(x+.16*math.cos(a),y+.16*math.sin(a),.14),.006,metal,root)
        rotor=bpy.data.objects.new('ROTOR_'+str(side)+'_'+str(front),None);scene.collection.objects.link(rotor);rotor.parent=root;rotor.location=(x,y,.15)
        for a in [0,math.pi]:
            blade=box('Curved prop blade',(.075*math.cos(a),.075*math.sin(a),0),(.16,.025,.005),rubber,.01,rotor);blade.rotation_euler[2]=a
        rotor.rotation_euler[2]=0;rotor.keyframe_insert('rotation_euler',frame=1,index=2);rotor.rotation_euler[2]=math.tau*90*side;rotor.keyframe_insert('rotation_euler',frame=600,index=2)
        ball('Navigation light',(x+side*.07,y,.055),(.013,.013,.013),red if side<0 else green,root)
        rod('Landing leg',(side*.15,front*.12,-.06),(side*.23,front*.2,-.27),.014,metal,root)
        ball('Rubber foot',(side*.23,front*.2,-.27),(.028,.04,.015),rubber,root)
gimbal=bpy.data.objects.new('GIMBAL | downward inspection light',None);scene.collection.objects.link(gimbal);gimbal.parent=root;gimbal.location=(0,-.09,-.15)
ball('Gimbal joint',(0,0,0),(.09,.085,.08),metal,gimbal)
cyl('Camera lens',(0,-.067,0),.045,.04,glass,gimbal,(math.pi/2,0,0))
cyl('Light diffuser',(0,.01,-.06),.055,.035,white,gimbal)
spot=light('Inspection spotlight | genuine 3D light','SPOT',(0,0,0),(1,.91,.75),1600,.1)
spot.parent=gimbal;spot.location=(0,0,-.095);spot.rotation_euler=(0,0,0);spot.data.spot_size=math.radians(48);spot.data.spot_blend=.65

# Asset is an actual textured clothed mesh, not an image plane.
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(S/'standing-one-hand-hip.glb'))
figure_objects=list(set(bpy.data.objects)-before)
figure=bpy.data.objects.new('PERSON | static CC0 clothed mesh',None);scene.collection.objects.link(figure)
for o in figure_objects:
    if o.parent not in figure_objects:o.parent=figure
figure.location=(1.25,10,.13);figure.rotation_euler[2]=math.radians(105)
scene.view_layers[0].update()
mesh_parts=[o for o in figure_objects if o.type=='MESH']
foot_min=min((o.matrix_world@Vector(c)).z for o in mesh_parts for c in o.bound_box)
road=bpy.data.objects['ROAD | physical surface']
road_top=max((road.matrix_world@Vector(c)).z for c in road.bound_box)
figure.location.z+=road_top+.002-foot_min
# Minimal local head rig: actual mesh deformation, not rotating a flat portrait.
bpy.context.view_layer.update()
arm=bpy.data.armatures.new('Head turn rig');rig=bpy.data.objects.new('FIGURE_HEAD_RIG',arm);scene.collection.objects.link(rig);rig.parent=figure
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
bone=arm.edit_bones.new('HEAD');bone.head=(0,0,1.44);bone.tail=(0,0,1.7)
bpy.ops.object.mode_set(mode='OBJECT')
rig.pose.bones['HEAD'].rotation_mode='XYZ'
for ob in figure_objects:
    if ob.type!='MESH':continue
    group=ob.vertex_groups.new(name='HEAD');to_figure=figure.matrix_world.inverted()@ob.matrix_world
    for vert in ob.data.vertices:
        z=(to_figure@vert.co).z;weight=max(0,min(1,(z-1.40)/.15))
        if weight:group.add([vert.index],weight,'REPLACE')
    modifier=ob.modifiers.new('Subtle neck and head rotation','ARMATURE');modifier.object=rig
for f,angle in [(1,-.08),(180,.06),(360,-.12),(600,.04)]:
    rig.pose.bones['HEAD'].rotation_euler[1]=angle;rig.pose.bones['HEAD'].keyframe_insert('rotation_euler',frame=f)

# Moon fill and restrained haze. Lighting changes with the drone's position.
light('Moon softbox','AREA',(-2,6,13),(.34,.49,1),900,12,(0,4,0))
light('Camera-side fill','AREA',(2,-5,7),(.46,.59,.9),150,7,(0,3,2))
volume=bpy.data.materials.new('Night air');volume.use_nodes=True;n=volume.node_tree.nodes;n.clear();out=n.new('ShaderNodeOutputMaterial');v=n.new('ShaderNodeVolumeScatter');v.inputs['Density'].default_value=.012;v.inputs['Anisotropy'].default_value=.2;volume.node_tree.links.new(v.outputs[0],out.inputs['Volume'])
box('Atmosphere volume',(0,12,6),(19,56,14),volume,0)

camdata=bpy.data.cameras.new('CINEMA_CAMERA');camera=bpy.data.objects.new('CINEMA_CAMERA',camdata);scene.collection.objects.link(camera);scene.camera=camera;camdata.lens=37
target=bpy.data.objects.new('CAMERA_LOOK',None);scene.collection.objects.link(target)
track=camera.constraints.new('TRACK_TO');track.target=target;track.track_axis='TRACK_NEGATIVE_Z';track.up_axis='UP_Y'
camdata.lens=45
camdata.dof.use_dof=True;camdata.dof.focus_object=root;camdata.dof.aperture_fstop=3.2

for frame,pos,rot,cam,look in [
    (1,(-.5,8,3.1),(0,0,-.15),(3.25,-6,2.4),(0,5,2.4)),
    (180,(.1,4.4,2.7),(.04,-.03,.2),(2.8,-4.3,2.1),(.1,4.8,2.2)),
    (360,(-.6,3.2,2.55),(0,.04,.65),(1.2,-1.7,2.7),(-.5,3.5,2.2)),
    (600,(.5,6,3.2),(-.03,0,.1),(3.1,-3.7,2.3),(.6,5.8,2.4))]:
    root.location=pos;root.rotation_euler=rot;root.keyframe_insert('location',frame=frame);root.keyframe_insert('rotation_euler',frame=frame)
    camera.location=cam;camera.keyframe_insert('location',frame=frame);target.location=look;target.keyframe_insert('location',frame=frame)
for frame,angle in [(1,-.25),(180,.05),(360,-.4),(600,.1)]:
    gimbal.rotation_euler[1]=angle;gimbal.keyframe_insert('rotation_euler',frame=frame,index=1)

# Tiny glints, no labels, target rings or drawn spotlight triangles.
tree=bpy.data.node_groups.new('Nightlight compositing','CompositorNodeTree')
tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
scene.compositing_node_group=tree;n=tree.nodes
rl=n.new('CompositorNodeRLayers');gl=n.new('CompositorNodeGlare')
gl.inputs['Type'].default_value='Fog Glow';gl.inputs['Quality'].default_value='High'
gl.inputs['Threshold'].default_value=2;gl.inputs['Strength'].default_value=.12;gl.inputs['Size'].default_value=.25
out=n.new('NodeGroupOutput');tree.links.new(rl.outputs['Image'],gl.inputs['Image']);tree.links.new(gl.outputs['Image'],out.inputs['Image'])
scene.frame_set(270)
bpy.ops.wm.save_as_mainfile(filepath=str(R/'NACHTLICHT_3D.blend'),compress=True)
receipt={'scene':'NACHTLICHT_3D_V1','blender':bpy.app.version_string,'meshObjects':sum(o.type=='MESH' for o in scene.objects),'sceneObjects':len(scene.objects),'animatedSpatialObjects':['DRONE_ROOT','GIMBAL','CINEMA_CAMERA','CAMERA_LOOK','four rotor objects','HEAD bone'],'person':'CC0 clothed mesh with a small authored head turn; no walking, speech or autonomous behavior.','projection':'Perspective camera; metre-scaled synthetic authored scene. No flight physics or sensor/recognition validation.'}
(R/'SCENE_RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if args and args[0]=='animation':
    # Use the same checked final profile, output directory and receipt as step 4.
    import runpy
    runpy.run_path(str(R/'render_animation.py'),run_name='__main__')
else:
    scene.render.resolution_percentage=67
    scene.render.filepath=str(R/'PREVIEW_3D.png');bpy.ops.render.render(write_still=True)
print('NACHTLICHT_3D_DONE',json.dumps(receipt))
