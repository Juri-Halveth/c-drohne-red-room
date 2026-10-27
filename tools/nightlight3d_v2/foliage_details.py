import sys
"""Decorative, mesh-only Nachtlicht foliage. Blender 4.x/5.x; metres, Z up.

Usage from Blender's Python console or a build script::

    import importlib.util
    spec = importlib.util.spec_from_file_location('nl_foliage', MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    details = module.add_details(bpy.context.scene)

The wall is assumed to lie at X=3.8, with the road on its negative-X side.
Road litter assumes a road surface at Z=0. No other scene content is changed.
Returns a dedicated collection. Calling twice in the same scene reuses it;
remove that collection and its objects explicitly if a rebuild is wanted.
No files, rendering, operators, modifiers, image textures or external assets needed.
"""

import math
import random

import bpy
from mathutils import Vector


_COLLECTION = 'Nachtlicht_Foliage_Details'
_OWNER = 'nachtlicht_mesh_details_v1'


class _Batch:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.materials = []

    def triangle(self, a, b, c, material):
        self.faces.append((a, b, c))
        self.materials.append(material)

    def tube(self, points, radius, material, sides=5, taper=0.35):
        """Closed low-sided mesh tube; normals point outward."""
        points = [Vector(p) for p in points]
        start = len(self.vertices)
        for i, p in enumerate(points):
            tangent = points[min(i + 1, len(points) - 1)] - points[max(0, i - 1)]
            tangent.normalize()
            helper = Vector((0, 0, 1)) if abs(tangent.z) < 0.92 else Vector((1, 0, 0))
            u = tangent.cross(helper).normalized()
            v = tangent.cross(u).normalized()
            r = radius * (1 - (1 - taper) * i / (len(points) - 1))
            for j in range(sides):
                angle = math.tau * j / sides
                self.vertices.append(tuple(p + r * (u * math.cos(angle) + v * math.sin(angle))))
        for i in range(len(points) - 1):
            for j in range(sides):
                a = start + i * sides + j
                b = start + i * sides + (j + 1) % sides
                c = b + sides
                d = a + sides
                self.triangle(a, b, c, material)
                self.triangle(a, c, d, material)
        self.faces.extend((tuple(start + j for j in reversed(range(sides))),
                           tuple(start + (len(points) - 1) * sides + j for j in range(sides))))
        self.materials.extend((material, material))

    def build(self, collection, name, palette):
        mesh = bpy.data.meshes.new(name + '_Mesh')
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj['owner'] = _OWNER
        for material in palette:
            mesh.materials.append(material)
        for polygon, material in zip(mesh.polygons, self.materials):
            polygon.material_index = material
            polygon.use_smooth = True
        return obj


def _material(label, color, roughness, wet=False):
    material = bpy.data.materials.new('NL_Foliage_' + label)
    material.use_nodes = True
    material.diffuse_color = (*color, 1)
    material['owner'] = _OWNER
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = 0
    if 'Coat Weight' in shader.inputs:
        shader.inputs['Coat Weight'].default_value = 0.30 if wet else 0.11
        shader.inputs['Coat Roughness'].default_value = 0.20 if wet else 0.38
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 115
    noise.inputs['Detail'].default_value = 2
    coords = nodes.new('ShaderNodeTexCoord')
    links.new(coords.outputs['Object'], noise.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.13
    bump.inputs['Distance'].default_value = 0.0007
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return material


def _outline(kind, rng):
    """Counterclockwise outlines: palmate ivy, elliptical hedge, oak and lance."""
    if kind == 'ivy':
        # Five lobes, a basal notch and unequal shoulders; no rectangular cards.
        right = [(0, 1), (.19, .70), (.49, .76), (.34, .43),
                 (.62, .36), (.39, .10), (.15, .04), (0, .13)]
        outline = right + [(-u, v) for u, v in reversed(right[1:-1])]
        outline = list(reversed(outline))
    else:
        outline = [(0, 0)]
        for i in range(1, 13):
            t = i / 13
            width = math.sin(math.pi * t) ** (0.70 if kind == 'oak' else 0.88)
            if kind == 'oak':
                width *= .76 + .24 * math.cos(t * math.pi * 10)
            if kind == 'lance':
                width *= .63
            outline.append((.44 * width, t))
        outline.append((0, 1))
        for i in reversed(range(1, 13)):
            t = i / 13
            width = math.sin(math.pi * t) ** (0.70 if kind == 'oak' else 0.88)
            if kind == 'oak':
                width *= .76 + .24 * math.cos(t * math.pi * 10 + .22)
            if kind == 'lance':
                width *= .63
            outline.append((-.44 * width, t))
    # Both construction paths now travel counterclockwise toward +normal.
    asymmetry = rng.uniform(.87, 1.12)
    return [(u * (asymmetry if u > 0 else 1), v) for u, v in outline]


def _leaf(batch, veins, anchor, axis, normal, length, width, kind, material,
          rng, vein=False, ground=False):
    axis = Vector(axis).normalized()
    normal = Vector(normal).normalized()
    axis = (axis - normal * axis.dot(normal)).normalized()
    across = axis.cross(normal).normalized()
    anchor = Vector(anchor)
    outline = _outline(kind, rng)
    cup = rng.uniform(.035, .115)
    curl = rng.uniform(-.035, .10) if ground else rng.uniform(-.11, .08)
    twist = rng.uniform(-.12, .12)
    center_v = .43

    def surface(u, v):
        ridge = .018 * math.sin(math.pi * v) * max(0, 1 - abs(u) * 2)
        bend = cup * (u * 2) ** 2 + curl * v * v + twist * u * v + ridge
        if ground:
            # Conservative floor keeps the entire curled blade above Z=0.
            bend += abs(twist) * .8 + abs(min(curl, 0)) + .014
        return anchor + across * (u * width) + axis * (v * length) + normal * (bend * length)

    first = len(batch.vertices)
    batch.vertices.append(tuple(surface(0, center_v)))
    # Two concentric rings triangulate a curved, non-planar blade.
    for scale in (.52, 1.0):
        for u, v in outline:
            batch.vertices.append(tuple(surface(u * scale, center_v + (v - center_v) * scale)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        batch.triangle(first, first + 1 + i, first + 1 + j, material)
        a, b = first + 1 + i, first + 1 + j
        c, d = a + n, b + n
        batch.triangle(a, c, d, material)
        batch.triangle(a, d, b, material)
    if vein:
        offset = normal * .00065
        veins.tube([surface(0, v) + offset for v in (.04, .31, .61, .91)],
                   .00085 if ground else .00065, 0, sides=3)
        for sign in (-1, 1):
            for v, end_v in ((.28, .48), (.48, .70)):
                veins.tube([surface(0, v) + offset,
                            surface(sign * .17, (v + end_v) * .5) + offset,
                            surface(sign * .30, end_v) + offset], .00042, 0, sides=3)


def add_details(scene):
    """Add deterministic wall vegetation and road litter; return the collection.

    Six mesh objects, typically well below 120k vertices. Geometry occupies
    roughly X=3.15..4.05, Y=4..20, Z=0..2.5 for the wall planting; road
    litter stays inside X=-3..3, Y=-3..16. Seed is private to this module.
    Materials are procedural, opaque, nonmetallic and double-sided.
    """
    existing = scene.collection.children.get(_COLLECTION)
    if existing is not None:
        if existing.get('owner') != _OWNER:
            raise ValueError('Collection name is occupied by unrelated content: ' + _COLLECTION)
        return existing

    rng = random.Random(271027)
    collection = bpy.data.collections.new(_COLLECTION)
    collection['owner'] = _OWNER
    scene.collection.children.link(collection)
    green_specs = [('IvyDeep', (.014, .032, .010), .57),
                   ('IvyOlive', (.034, .055, .016), .61),
                   ('IvyCool', (.020, .048, .029), .53),
                   ('IvyOld', (.060, .052, .017), .68),
                   ('HedgeDeep', (.019, .039, .013), .62),
                   ('HedgeOlive', (.042, .060, .019), .58)]
    green = [_material(*spec) for spec in green_specs]
    autumn = [_material('WetOchre', (.19, .085, .018), .37, True),
              _material('WetRusset', (.105, .026, .009), .40, True),
              _material('WetUmber', (.041, .018, .008), .48, True),
              _material('WetOlive', (.071, .062, .015), .43, True)]
    bark = [_material('Bark', (.038, .024, .012), .83)]
    vein_palette = [_material('Veins', (.081, .092, .035), .69)]
    ivy, hedge, fallen, branches, veins, debris = [_Batch() for _ in range(6)]

    # Distinct colonies, interrupted growth and occasional tall exploratory tips.
    colonies = [(5.20, .75, 1.65), (6.70, .90, 2.30), (9.30, .68, 1.15),
                (12.15, 1.05, 2.40), (15.30, .78, 1.80), (18.65, .95, 2.20)]
    for center_y, spread, height in colonies:
        for tendril in range(5):
            phase = rng.uniform(0, math.tau)
            base_y = center_y + rng.uniform(-spread * .6, spread * .6)
            tip = height * rng.uniform(.52, 1)

            def stem_at(t):
                return Vector((3.70 - .035 * math.sin(phase + t * 8),
                               base_y + .25 * math.sin(phase + t * 5) + .16 * t,
                               .045 + tip * t))

            branches.tube([stem_at(i / 11) for i in range(12)],
                          rng.uniform(.005, .011), 0, sides=5, taper=.22)
            for j in range(29):
                t = (j + rng.random()) / 30
                p = stem_at(t)
                side = -1 if j % 2 else 1
                length = rng.uniform(.105, .215) * (1 - .30 * t)
                anchor = p + Vector((-rng.uniform(.035, .12), side * rng.uniform(.025, .09), 0))
                anchor.z = max(anchor.z, .14)
                branches.tube([p, (p + anchor) * .5, anchor], .0018, 0, sides=3)
                _leaf(ivy, veins, anchor, (rng.uniform(-.28, .15), side * rng.uniform(.35, .85),
                                         rng.uniform(.15, .80)),
                      (-1, rng.uniform(-.32, .32), rng.uniform(-.10, .45)),
                      length, length * rng.uniform(.88, 1.20), 'ivy',
                      rng.choices(range(4), weights=(47, 27, 20, 6))[0], rng, vein=(j % 7 == 0))

        # Low woody shrubs in irregular ellipsoidal clumps, never a green slab.
        for clump in range(3):
            root = Vector((rng.uniform(3.48, 3.65), center_y + rng.uniform(-spread, spread), .04))
            peak = rng.uniform(.35, .78)
            crown = root + Vector((-.07, rng.uniform(-.10, .10), peak))
            branches.tube([root, (root + crown) * .5, crown], .009, 0, sides=5)
            for twig in range(5):
                theta = rng.uniform(0, math.tau)
                end = crown + Vector((math.cos(theta) * .20, math.sin(theta) * .32,
                                      rng.uniform(-.15, .19)))
                mid = crown * .45 + root * .55
                branches.tube([mid, (mid + end) * .5, end], .0035, 0, sides=4)
                for j in range(7):
                    t = rng.uniform(.28, 1)
                    anchor = mid.lerp(end, t) + Vector((rng.uniform(-.075, .045),
                                                       rng.uniform(-.065, .065), rng.uniform(-.03, .04)))
                    _leaf(hedge, veins, anchor, (rng.uniform(-1, 1), rng.uniform(-1, 1), .6),
                          (rng.uniform(-1, -.20), rng.uniform(-.4, .4), rng.uniform(.3, 1)),
                          rng.uniform(.07, .135), rng.uniform(.065, .115), 'oval',
                          rng.choice((4, 4, 5)), rng)

    # Mostly edge/wind-trap piles with sparse solitary leaves in the carriageway.
    piles = [(2.50, 1.5), (2.40, 6.8), (2.45, 12.8), (-2.45, 9.8)]
    for i in range(205):
        if i < 158:
            x, y = rng.choice(piles)
            x = max(-2.78, min(2.70, rng.gauss(x, .22)))
            y = max(-2.65, min(15.55, rng.gauss(y, .72)))
        else:
            x, y = rng.uniform(-2.72, 2.70), rng.uniform(-2.6, 15.55)
        angle = rng.uniform(0, math.tau)
        axis = (math.cos(angle), math.sin(angle), 0)
        length = rng.uniform(.075, .19)
        kind = rng.choices(('oak', 'oval', 'lance'), weights=(40, 35, 25))[0]
        _leaf(fallen, veins, (x, y, rng.uniform(.003, .012)), axis, (0, 0, 1),
              length, length * rng.uniform(.60, .92), kind,
              rng.choices(range(4), weights=(25, 35, 32, 8))[0], rng,
              vein=(i % 3 == 0), ground=True)
    for i in range(32):
        x, y = rng.uniform(-2.7, 2.65), rng.uniform(-2.5, 15.5)
        angle = rng.uniform(0, math.tau)
        length = rng.uniform(.045, .23)
        debris.tube([(x, y, .007),
                     (x + math.cos(angle) * length * .5, y + math.sin(angle) * length * .5, .011),
                     (x + math.cos(angle) * length, y + math.sin(angle) * length, .008)],
                    rng.uniform(.0015, .0035), 0, sides=4, taper=.45)

    batches = [(ivy, 'NL_Ivy_Blades', green), (hedge, 'NL_Hedge_Blades', green),
               (fallen, 'NL_Wet_Autumn_Leaves', autumn), (branches, 'NL_Woody_Tendrils', bark),
               (veins, 'NL_Leaf_Veins', vein_palette), (debris, 'NL_Road_Twigs', bark)]
    vertices = sum(len(batch.vertices) for batch, _, _ in batches)
    if vertices >= 150000:
        raise RuntimeError('Foliage vertex budget exceeded: ' + str(vertices))
    for batch, name, palette in batches:
        batch.build(collection, name, palette)
    collection['seed'] = 271027
    collection['vertex_count'] = vertices
    collection['leaf_count'] = 6 * 5 * 29 + 6 * 3 * 5 * 7 + 205
    collection['road_surface_z'] = 0.0
    collection['purpose'] = 'Decorative mesh foliage; no operational side effects'
    return collection
