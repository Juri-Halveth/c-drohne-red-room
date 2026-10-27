import sys
"""Visual rebuild of the actual Nachtlicht scene; no generated-image backplates."""
import bpy, math, random, json, sys, runpy
from pathlib import Path
from mathutils import Vector
R=Path(__file__).parent; S=R/'sources'; scene=bpy.context.scene
rng=random.Random(2701431)

def material(name,color,rough=.5,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m
def box(name,loc,size,mat,bevel=.015):
    x,y,z=[v/2 for v in size]
    verts=[(-x,-y,-z),(-x,-y,z),(-x,y,-z),(-x,y,z),(x,-y,-z),(x,-y,z),(x,y,-z),(x,y,z)]
    faces=[(2,6,4,0),(5,7,3,1),(4,5,1,0),(3,7,6,2),(1,3,2,0),(6,7,5,4)]
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.location=loc;o.data.materials.append(mat)
    if bevel:
        b=o.modifiers.new('Soft physical edges','BEVEL');b.width=bevel;b.segments=3;o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return o
def mesh(name,verts,faces,mat):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.data.materials.append(mat);return o
def lamp(name,loc,target,power,color,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
def surface(name,prefix,scale,wet=False):
    m=material(name,(.2,.2,.2));n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
    c=n.new('ShaderNodeTexCoord');v=n.new('ShaderNodeVectorMath');v.operation='SCALE';v.inputs[3].default_value=scale;l.new(c.outputs['Object'],v.inputs[0])
    for channel,socket in [('diff','Base Color'),('rough','Roughness'),('nor_gl',None)]:
        choices=list(S.glob(prefix+'*'+channel+'*4k*'))
        if not choices and channel=='diff':choices=list(S.glob(prefix+'*diffuse*4k*'))
        t=n.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(choices[0]),check_existing=True);t.projection='BOX';t.projection_blend=.12;l.new(v.outputs[0],t.inputs['Vector'])
        if channel=='diff':l.new(t.outputs['Color'],p.inputs[socket])
        elif channel=='rough':
            t.image.colorspace_settings.name='Non-Color';a=n.new('ShaderNodeMapRange');a.inputs['To Min'].default_value=.10 if wet else .42;a.inputs['To Max'].default_value=.3 if wet else .85;l.new(t.outputs['Color'],a.inputs[0]);l.new(a.outputs[0],p.inputs[socket])
        else:
            t.image.colorspace_settings.name='Non-Color';a=n.new('ShaderNodeNormalMap');a.inputs['Strength'].default_value=.65;l.new(t.outputs['Color'],a.inputs['Color']);l.new(a.outputs[0],p.inputs['Normal'])
    if wet:p.inputs['Coat Weight'].default_value=.75;p.inputs['Coat Roughness'].default_value=.045
    return m

brick=surface('NEW | scanned masonry 4K','brick_wall_001',.42)
stone=surface('NEW | scanned wet cobbles 4K','cobblestone_floor_08',.6,True)
wood=material('NEW | painted deep blue joinery',(.025,.047,.052),.29)
metal=material('NEW | weathered cast iron',(.025,.032,.034),.3,.76)
trim=material('NEW | aged limestone',(.32,.29,.24),.67)
roof=material('NEW | wet slate',(.025,.035,.044),.26,.1)
glass=material('NEW | real shop glazing',(.75,.86,.9),.075);p=glass.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=.95;p.inputs['IOR'].default_value=1.46
warm=material('NEW | warm window interior',(.36,.18,.065),.75)
for m in [wood,trim,roof,metal]:
    n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');t=n.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=36;t.inputs['Detail'].default_value=3;b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.2;b.inputs['Distance'].default_value=.004;l.new(t.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])

# Replace the conspicuously flat ground with one coherent mesh of irregular stones.
for ob in list(scene.objects):
    if ob.name.startswith(('ROAD |','Hedge volume','Glass fragment')):ob.hide_render=True
    if ob.type=='MESH':
        for slot in ob.material_slots:
            if slot.material and slot.material.name.startswith('Weathered masonry'):slot.material=brick
            elif slot.material and slot.material.name.startswith('Wet scan'):slot.material=stone
verts=[];faces=[];mi=[]
for row in range(138):
    y=-7+row*.255
    for col in range(39):
        x=-3.7+col*.191+(row%2)*.0955
        if x>3.76:continue
        w=.169+rng.random()*.009;h=.23+rng.random()*.01;z=.023+rng.random()*.008;a=len(verts)
        verts.extend([(x+dx*w/2,y+dy*h/2,zz) for dx,dy,zz in [(-1,-1,-.035),(-1,-1,z),(-1,1,-.035),(-1,1,z),(1,-1,-.035),(1,-1,z),(1,1,-.035),(1,1,z)]])
        faces.extend([tuple(a+j for j in f) for f in [(2,6,4,0),(5,7,3,1),(4,5,1,0),(3,7,6,2),(1,3,2,0),(6,7,5,4)]])
o=mesh('NEW | individually raised cobblestone geometry',verts,faces,stone);b=o.modifiers.new('Rounded worn stone edges','BEVEL');b.width=.012;b.segments=2;o.modifiers.new('Stone normals','WEIGHTED_NORMAL')
water=material('NEW | shallow rainwater',(.025,.032,.038),.045);p=water.node_tree.nodes.get('Principled BSDF');p.inputs['Coat Weight'].default_value=1;p.inputs['Coat Roughness'].default_value=.025;p.inputs['IOR'].default_value=1.333
n=water.node_tree.nodes;l=water.node_tree.links;t=n.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=11;b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.07;b.inputs['Distance'].default_value=.002;l.new(t.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
for i in range(19):
    x=rng.uniform(-3.4,3.4);y=rng.uniform(-5,22);rx=rng.uniform(.16,.55);ry=rng.uniform(.4,1.3)
    vs=[(x+math.cos(j*math.tau/40)*rx*(1+.09*math.sin(j*1.8)),y+math.sin(j*math.tau/40)*ry,.028) for j in range(40)]
    mesh('NEW | irregular shallow puddle',vs,[tuple(range(40))],water)

# Profiled gutters, roof silhouettes and richer window surrounds break the box corridor.
for side in [-1,1]:
    for i,height in enumerate([9.6,10.5,8.8,11.2,9.3,10,10.8,9.1]):
        y=i*5.4;near=side*4.68;far=side*7.4;ridge=side*6.04
        vs=[(near,y-2.7,height),(near,y+2.7,height),(ridge,y+2.7,height+1.85),(ridge,y-2.7,height+1.85),(far,y-2.7,height),(far,y+2.7,height)]
        mesh('NEW | pitched slate roof',vs,[(0,1,2,3),(3,2,5,4)],roof)
        box('NEW | rain gutter',(side*4.68,y,height-.05),(.14,5.45,.13),metal,.025)
        box('NEW | chimney',(side*6.2,y+.9,height+1.9),(.55,.63,1.55),brick,.025)
        box('NEW | chimney crown',(side*6.2,y+.9,height+2.68),(.68,.75,.1),trim,.025)
        for floor in [1.5,4.5,7.2]:
            for dy in [-1.45,1.35]:
                for z in [floor-.98,floor+.99]:
                    box('NEW | carved sill lip',(side*4.78,y+dy,z),(.32,1.56,.055),trim,.014)
                for yy in [y+dy-.72,y+dy+.72]:
                    box('NEW | narrow blue shutter',(side*4.77,yy,floor),(.08,.14,1.8),wood,.012)
        for yy in [y-2.45,y+2.45]:
            for z in [.6,1.05,1.5,1.95,2.4]:box('NEW | masonry corner quoin',(side*4.78,yy,z),(.22,.32,.29),trim,.015)

# The close storefront is hollow, lit and glazed instead of a window on a solid cube.
for ob in list(scene.objects):
    if (ob.name.startswith(('Building | masonry','Brick ground floor')) and ob.location.x<0 and abs(ob.location.y)<.01):ob.hide_render=True
    if ob.name.startswith(('Shop panel','Shop glass','Shop lower inset','Shop canopy','Canopy iron')):ob.hide_render=True
box('NEW | shop upper masonry',(-6.05,0,6.4),(2.2,5.25,6.7),brick,.03)
box('NEW | shop rear wall',(-7.2,0,1.5),(.18,5.2,3),warm,.01)
box('NEW | shop floor',(-6.0,0,.04),(2.4,5.25,.07),wood,.01)
for y in [-2.54,-.88,.88,2.54]:box('NEW | fluted shop pilaster',(-4.73,y,1.5),(.26,.15,3),wood,.025)
for z,w,h in [(.2,.25,.2),(.85,.19,.1),(2.75,.25,.2),(3.02,.38,.1),(3.16,.46,.12)]:box('NEW | layered shop cornice',(-4.71,0,z),(w,5.3,h),wood,.017)
for y in [-1.7,0,1.7]:
    box('NEW | shop lower door inset',(-4.73,y,.45),(.12,1.49,.55),wood,.02)
    box('NEW | shop glazing',(-4.77,y,1.8),(.018,1.46,1.7),glass,.003)
    for yy in [y-.74,y+.74]:box('NEW | glass vertical rebate',(-4.68,yy,1.8),(.06,.035,1.7),metal,.006)
    for zz in [1.1,2.12,2.65]:box('NEW | glazing bar',(-4.68,y,zz),(.065,1.48,.032),wood,.004)
    box('NEW | interior shelf',(-6.7,y,.95),(.45,1.32,.08),wood,.01)
    for k in range(8):box('NEW | books inside shop',(-6.65,y-.5+k*.13,1.13),(.17,.08,.28+rng.random()*.08),warm,.006)
    lamp('NEW | lit shop interior',(-6.5,y,2.4),(-4,y,1.0),38,(1,.59,.28),.55)

# Genuine distant masonry and a bent continuation, with sky above the roofs.
for ob in scene.objects:
    if ob.name.startswith(('Distant closing facade','Distant tower')):ob.hide_render=True
for i in range(5):
    x=-10+i*4.8;h=7.5+rng.random()*4
    box('NEW | staggered distant building',(x,34+rng.random()*3,h/2),(4.55,4,h),brick,.04)
    for z in [2,5,8]:
        if z>h-1:continue
        for xx in [x-1.1,x+1.1]:box('NEW | distant lit window',(xx,31.91,z),(.65,.04,1.2),warm,.015)

# A photographed HDR sky supplies real dynamic-range lighting. It is not a film frame.
world=scene.world;world.use_nodes=True;n=world.node_tree.nodes;n.clear();l=world.node_tree.links
env=n.new('ShaderNodeTexEnvironment');env.image=bpy.data.images.load(str(S/'modern_evening_street_4k.hdr'))
bg=n.new('ShaderNodeBackground');bg.inputs['Strength'].default_value=.11;out=n.new('ShaderNodeOutputWorld');l.new(env.outputs['Color'],bg.inputs[0]);l.new(bg.outputs[0],out.inputs[0])
for ob in list(scene.objects):
    if ob.type=='LIGHT':
        if ob.name.startswith('Amber street lamp'):ob.data.energy=80;ob.data.shadow_soft_size=.12;ob.data.use_shadow=True
        elif ob.name.startswith('Window spill'):ob.data.energy=20
        elif ob.name=='Moon softbox':ob.hide_render=True
        elif ob.name=='Camera-side fill':ob.hide_render=True
    if ob.name.startswith('Atmosphere volume'):ob.hide_render=True
lamp('NEW | cool sky opening',(-2,8,13),(0,7,0),800,(.42,.58,1),8)
lamp('NEW | soft drone rim',(4,8,6),(0,6,2.8),75,(.42,.6,1),4)
volume=material('NEW | subtle night air',(.2,.2,.2));n=volume.node_tree.nodes;n.clear();a=n.new('ShaderNodeVolumeScatter');a.inputs['Density'].default_value=.0014;a.inputs['Anisotropy'].default_value=.25;o=n.new('ShaderNodeOutputMaterial');volume.node_tree.links.new(a.outputs[0],o.inputs['Volume']);box('NEW | night air volume',(0,14,7),(24,70,20),volume,0)

if (R/'foliage_details.py').exists():runpy.run_path(str(R/'foliage_details.py'))['add_details'](scene)
person=next(o for o in scene.objects if o.name.startswith('PERSON |'))
person.location.x=2.35;person.location.y=9.5
root=next(o for o in scene.objects if o.name.startswith('DRONE_ROOT'))
camera=scene.camera;look=bpy.data.objects['CAMERA_LOOK']
for o in [root,camera,look]:o.animation_data_clear()
for f,drone,cam,aim in [(1,(.5,6.2,2.85),(1.6,-4.2,1.5),(-.5,9,3)),(300,(.15,5.25,2.65),(1.4,-3.7,1.6),(-.5,8,2.9)),(600,(.55,6.5,2.9),(1.15,-3.2,1.65),(-.4,8.5,3))]:
    root.location=drone;root.rotation_euler=(.015,-.025,.05);root.keyframe_insert('location',frame=f);root.keyframe_insert('rotation_euler',frame=f)
    camera.location=cam;camera.keyframe_insert('location',frame=f);look.location=aim;look.keyframe_insert('location',frame=f)
camera.data.lens=29;camera.data.dof.use_dof=True;camera.data.dof.focus_object=root;camera.data.dof.aperture_fstop=6.3
for ob in scene.objects:
    if ob.name.startswith('ROTOR_'):
        ob.driver_add('rotation_euler',2).driver.expression='frame*10.4'
scene.frame_set(300)
scene.render.engine='CYCLES';scene.cycles.device='GPU';scene.cycles.samples=64;scene.cycles.use_denoising=True;scene.cycles.adaptive_threshold=.03
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for device in prefs.devices:device.use=device.type=='OPTIX'
scene.cycles.max_bounces=8;scene.cycles.diffuse_bounces=4;scene.cycles.glossy_bounces=4;scene.cycles.transmission_bounces=6;scene.cycles.volume_bounces=2
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.25
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=67
scene.render.use_motion_blur=True;scene.render.motion_blur_shutter=.4
scene.render.filepath=str(R/'ACTUAL_3D_PREVIEW.png');scene.render.image_settings.file_format='PNG'
bpy.ops.wm.save_as_mainfile(filepath=str(R/'NACHTLICHT_VISUAL_REBUILD.blend'),compress=True)

if '--build-only' not in sys.argv:bpy.ops.render.render(write_still=True)
print('VISUAL_PREVIEW_DONE',json.dumps({'sceneObjects':len(scene.objects),'engine':scene.render.engine,'samples':64,'reference':'Actual scene camera, not an imagegen proposal'}))
