import sys
import bpy,math,json,random
from pathlib import Path
from mathutils import Matrix,Vector
R=Path(__file__).parent;S=R/'sources';scene=bpy.context.scene

# Keep the drone, road, low garden wall, foliage and human; replace the box architecture.
prefixes=('Building |','Brick ground','Facade horizontal','Recessed glass','Stone window','Window jamb','Window central','Curtain inside','Drainpipe','Wall lamp','Lantern iron','Lantern frame','Lamp bracket','Shop ','Canopy ','Distant ','NEW | pitched','NEW | rain gutter','NEW | chimney','NEW | carved','NEW | narrow blue','NEW | masonry corner','NEW | shop','NEW | fluted','NEW | layered','NEW | glass vertical','NEW | glazing','NEW | interior shelf','NEW | books','NEW | staggered','NEW | distant lit','NEW | lit shop','Amber street lamp','Window spill')
for o in scene.objects:
    if o.name.startswith(prefixes):o.hide_render=True
    if o.name.startswith('NEW | irregular shallow puddle'):o.location.z=.008
with bpy.data.libraries.load(str(S/'factory_2k.blend'),link=False) as (src,dst):
    dst.objects=[n for n in src.objects if n.startswith(('wall_','window_','door_','cornice','crown_','dado_','base_'))]
catalog={o.name:o for o in dst.objects if o}
for im in bpy.data.images:
    if im.name.startswith('modular_factory_facade'):
        filename=im.filepath.replace('\\','/').rsplit('/',1)[-1];p=S/'textures'/filename
        if not p.exists():raise FileNotFoundError(p)
        im.filepath=str(p);im.reload()

templates={}
def template(wall,part):
    key=(wall,part)
    if key in templates:return templates[key]
    ref=catalog[wall];o=catalog[part]
    corners=[ref.matrix_world@Vector(c) for c in ref.bound_box]
    # Whole part pair shares this origin; actual window/door inset stays authored.
    minimum=min(v.x for v in corners);bottom=min(v.z for v in corners)
    data=o.data.copy();data.transform(Matrix.Translation((-minimum,-ref.location.y,-bottom))@o.matrix_world)
    templates[key]=data;return data
def piece(wall,parts,x,y,z,angle,label):
    transform=Matrix.Translation((x,y,z))@Matrix.Rotation(angle,4,'Z')
    for part in [wall]+parts:
        o=bpy.data.objects.new('ARCH | '+label+' | '+part,template(wall,part));scene.collection.objects.link(o);o.matrix_world=transform
    return o
def trim(name,x,y,z,angle):
    # Trim pieces have their own base z in the source kit; normalize independently.
    return piece(name,[],x,y,z,angle,'detailed cornice')
for side in [-1,1]:
    count=11 if side<0 else 4
    for col in range(count):
        y=-6+col*3
        x=side*(4.35 if side<0 else 5.0)
        angle=math.pi/2 if side<0 else -math.pi/2
        start=y if side<0 else y+3
        for floor in range(3 if side<0 else 2):
            if floor==0 and col in [1,5,9]:
                variant='door_recessed_large_01';parts=[variant];wall='wall_'+variant
            else:
                variant='window_tall_large_01' if (col+floor)%3 else 'window_tall_large_03'
                wall='wall_'+variant;parts=[variant]
            piece(wall,parts,x,start,.12+floor*3,angle,'facade')
            if floor<2:trim('cornice03_standard_standard_01',x,start,.12+(floor+1)*3-.06,angle)
        trim('crown_standard_standard_01',x,start,9.12 if side<0 else 6.12,angle)
        trim('base_standard_standard_01',x,start,.12,angle)

# Distant return facade leaves a right-hand street opening, rather than a flat end wall.
for col in range(3):
    for floor in range(3):
        wall='wall_window_centered_large_01'
        piece(wall,['window_centered_large_01'],-6+col*3,29,.12+floor*3,0,'return facade')

# Replace featureless glowing cubes with shaded glazing, actual lamp cages and bulbs.
def mat(name,color,rough=.4,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
iron=mat('ARCH | cast iron',(.019,.025,.027),.37,.72)
glass=mat('ARCH | lantern frosted glass',(.45,.32,.17),.2);p=glass.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=.65;p.inputs['IOR'].default_value=1.46
bulb=mat('ARCH | warm small bulb',(1,.63,.23),.3);p=bulb.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(1,.53,.16,1);p.inputs['Emission Strength'].default_value=9
def cube(name,loc,scale,m):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);a=o.modifiers.new('Rounded cast edges','BEVEL');a.width=.008;a.segments=3;return o
def rod(a,b,r=.012):
    v=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=v.length,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.name='ARCH | lantern cage';o.rotation_euler=v.to_track_quat('Z','Y').to_euler();o.data.materials.append(iron)
for side,ys in [(-1,[-2.7,3.3,9.3,15.3,21.3]),(1,[-2.7,3.3])]:
    for y in ys:
        x=side*(3.98 if side<0 else 4.62)
        rod((x+side*.38,y,3.4),(x,y,3.55),.022)
        for z in [3.01,3.54]:cube('ARCH | lantern cap',(x,y,z),(.3,.3,.055),iron)
        for dx in [-.12,.12]:
            for dy in [-.12,.12]:rod((x+dx,y+dy,3.03),(x+dx,y+dy,3.52))
        for axis in [0,1]:
            for sign in [-1,1]:
                loc=[x,y,3.27];loc[axis]+=sign*.12;size=[.225,.225,.44];size[axis]=.004;cube('ARCH | glass lamp panel',loc,size,glass)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.045,location=(x,y,3.27));bpy.context.object.data.materials.append(bulb)
        d=bpy.data.lights.new('ARCH | practical warm streetlight','POINT');d.energy=80;d.color=(1,.55,.22);d.shadow_soft_size=.045;o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);o.location=(x-side*.10,y,3.28)

# A sky visible to the camera; photographed HDR lighting remains in reflection paths.
n=scene.world.node_tree.nodes;l=scene.world.node_tree.links;out=next(o for o in n if o.type=='OUTPUT_WORLD');hdr=next(o for o in n if o.type=='BACKGROUND')
sky=n.new('ShaderNodeBackground');sky.inputs[0].default_value=(.025,.045,.09,1);sky.inputs[1].default_value=.3
path=n.new('ShaderNodeLightPath');mix=n.new('ShaderNodeMixShader');l.new(path.outputs['Is Camera Ray'],mix.inputs[0]);l.new(hdr.outputs[0],mix.inputs[1]);l.new(sky.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],out.inputs['Surface'])

# Three-quarter composition: detailed architecture on the left, garden breathing room right.
camera=scene.camera;look=bpy.data.objects['CAMERA_LOOK'];camera.animation_data_clear();look.animation_data_clear()
for f,cam,aim in [(1,(1.7,-4.0,1.55),(-1,7,2.9)),(300,(1.55,-3.5,1.6),(-1,7.6,2.9)),(600,(1.4,-3.0,1.65),(-.8,8,2.9))]:
    camera.location=cam;camera.keyframe_insert('location',frame=f);look.location=aim;look.keyframe_insert('location',frame=f)
camera.data.lens=31;camera.data.dof.aperture_fstop=5.6
scene.frame_set(300);scene.render.resolution_percentage=67;scene.cycles.samples=64;scene.view_settings.exposure=.25
scene.render.filepath=str(R/'ARCHITECTURE_PREVIEW.png')
bpy.ops.wm.save_as_mainfile(filepath=str(R/'NACHTLICHT_ARCHITECTURE.blend'),compress=True)

if '--build-only' not in sys.argv:bpy.ops.render.render(write_still=True)
print('ARCHITECTURE_PREVIEW_DONE')
