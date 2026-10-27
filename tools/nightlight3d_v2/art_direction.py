import sys
import bpy,math,json,random
from pathlib import Path
from mathutils import Vector,Matrix
R=Path(__file__).parent;S=R/'sources';s=bpy.context.scene
with bpy.data.libraries.load(str(S/'tree_small_02_2k.blend'),link=False) as (src,dst):dst.objects=['tree_small_02_LOD0']
tree=dst.objects[0]
for im in bpy.data.images:
    if im.name.startswith('tree_small_02'):
        name=im.filepath.replace('\\','/').rsplit('/',1)[-1];im.filepath=str(S/'textures'/name);im.reload()
for i,(x,y,scale) in enumerate([(5.1,5.8,1.22),(5.5,12,1.6),(5.7,20,1.3)]):
    o=bpy.data.objects.new('ART | detailed broadleaf tree',tree.data);s.collection.objects.link(o);o.location=(x,y,.12);o.scale=(scale,scale,scale);o.rotation_euler.z=i*1.9
for o in s.objects:
    if o.name.startswith(('Bench ','Timber bench')):o.hide_render=True
    if o.name.startswith('PERSON |'):o.location.x=3.0;o.location.y=12
    if o.name.startswith('ARCH | lantern') and o.type=='MESH':
        for slot in o.material_slots:
            if slot.material and slot.material.name=='ARCH | lantern frosted glass':slot.material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.32

# Break up the sky with restrained three-dimensional angular cloud shading.
n=s.world.node_tree.nodes;l=s.world.node_tree.links;sky=[o for o in n if o.type=='BACKGROUND'][-1]
c=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=4;noise.inputs['Detail'].default_value=4;noise.inputs['Roughness'].default_value=.7;l.new(c.outputs['Normal'],noise.inputs[0]);r=n.new('ShaderNodeValToRGB');r.color_ramp.elements[0].position=.3;r.color_ramp.elements[0].color=(.004,.008,.018,1);r.color_ramp.elements[1].position=.7;r.color_ramp.elements[1].color=(.055,.09,.15,1);l.new(noise.outputs['Fac'],r.inputs[0]);l.new(r.outputs[0],sky.inputs[0]);sky.inputs[1].default_value=.5

# Small, warm pools of light on real masonry create variation instead of a uniform wash.
for y in [2,8,14,20]:
    d=bpy.data.lights.new('ART | warm light from open window','AREA');d.energy=18;d.color=(1,.49,.2);d.size=.9;o=bpy.data.objects.new(d.name,d);s.collection.objects.link(o);o.location=(-4.1,y,4.7);o.rotation_euler=(Vector((-.7,y+1,0))-o.location).to_track_quat('-Z','Y').to_euler()

# Artistically closer view: the moving model becomes the subject, architecture stays legible.
camera=s.camera;look=bpy.data.objects['CAMERA_LOOK'];camera.animation_data_clear();look.animation_data_clear()
for f,pos,aim in [(1,(1.3,-1.8,1.45),(-.1,6,2.1)),(300,(1.15,-1.25,1.5),(-.1,5.9,2.1)),(600,(1.0,-.8,1.55),(.05,6.1,2.15))]:
    camera.location=pos;camera.keyframe_insert('location',frame=f);look.location=aim;look.keyframe_insert('location',frame=f)
camera.data.lens=36;camera.data.dof.aperture_fstop=3.5
s.view_settings.exposure=.1;s.frame_set(300);s.render.resolution_percentage=67;s.cycles.samples=96
s.render.filepath=str(R/'ART_DIRECTION_PREVIEW.png')
bpy.ops.wm.save_as_mainfile(filepath=str(R/'NACHTLICHT_ART_DIRECTION.blend'),compress=True)

if '--build-only' not in sys.argv:bpy.ops.render.render(write_still=True)
print('ART_DIRECTION_PREVIEW_DONE')
