"""
BIBLIOTHÈQUE PROCÉDURALE — des lieux entiers générés à la demande, chacun en variantes (graine), conformes dès la
génération (la scène où jouent les acteurs reste dégagée, rien ne se superpose, tout est posé au sol, à l'échelle).

  gn_scatter()      Geometry Nodes construits par script : dispersion d'instances (arbres, herbes, rochers, fleurs,
                    palmiers…) sur une surface, rotation/échelle aléatoires, ZONE DÉGAGÉE devant la caméra (les acteurs).
  build_ville()     le Plateau : place piétonne, boulevard et woro-woro, rangée d'immeubles à fenêtres, tours de verre.
  build_maison()    une villa du quartier : façade à étage, toit, balcon, grilles, mur d'enceinte et portail,
                    bougainvillier, terrasse avec chaises plastique.
  build_nature()    brousse / savane : terrain ondulé (collines au loin, sol plat devant), acacias, herbes hautes,
                    rochers dispersés par Geometry Nodes.
  build_imaginaire() monde imaginaire : îles flottantes, champignons géants lumineux, cristaux, deux lunes, ciel violet.

Les variantes : la graine `life['variant']` change l'agencement, les hauteurs, les couleurs et la végétation — un
nombre illimité de versions du même lieu, toujours cohérentes avec lui.
"""
import colorsys
import math

# The stage (where the actors play, in front of the camera) stays clear of any scattered instance.
STAGE_CLEAR = {'x': 3.2, 'y': 6.0}


def vary(rgb, rnd, hue=0.04, sat=0.12, val=0.1):
    """A variant of a colour (same family): small shifts of hue, saturation, value."""
    h, s, v = colorsys.rgb_to_hsv(*[c / 255 for c in rgb])
    h = (h + rnd.uniform(-hue, hue)) % 1.0
    s = min(1.0, max(0.0, s * (1 + rnd.uniform(-sat, sat))))
    v = min(1.0, max(0.0, v * (1 + rnd.uniform(-val, val))))
    return tuple(int(255 * c) for c in colorsys.hsv_to_rgb(h, s, v))


def gn_scatter(bpy, name, surface, sources, density, seed, smin=0.8, smax=1.2, clear=STAGE_CLEAR, rotate=True):
    """Geometry Nodes scatter: points distributed on `surface`, one of `sources` instanced on each (random pick,
    random yaw, random scale), never inside the clear stage zone. The sources live in a collection out of the scene."""
    col = bpy.data.collections.new(f'gnsrc-{name}')
    for o in sources:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        col.objects.link(o)
        o.location = (0, 0, 0)
        if o.parent is not None:
            o.parent = None
    ng = bpy.data.node_groups.new(f'scatter-{name}', 'GeometryNodeTree')
    ng.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes, ng.links
    gi, go = N.new('NodeGroupInput'), N.new('NodeGroupOutput')
    dist = N.new('GeometryNodeDistributePointsOnFaces')
    dist.inputs['Density'].default_value = density
    dist.inputs['Seed'].default_value = seed
    L.new(gi.outputs[0], dist.inputs['Mesh'])
    if clear:
        # Selection = NOT (|x| < clear.x AND y < clear.y): the stage in front of the camera stays empty.
        pos = N.new('GeometryNodeInputPosition')
        sep = N.new('ShaderNodeSeparateXYZ')
        L.new(pos.outputs[0], sep.inputs[0])
        ab = N.new('ShaderNodeMath')
        ab.operation = 'ABSOLUTE'
        L.new(sep.outputs['X'], ab.inputs[0])
        cx = N.new('FunctionNodeCompare')
        cx.data_type = 'FLOAT'
        cx.operation = 'LESS_THAN'
        L.new(ab.outputs[0], cx.inputs['A'])
        cx.inputs['B'].default_value = clear['x']
        cy = N.new('FunctionNodeCompare')
        cy.data_type = 'FLOAT'
        cy.operation = 'LESS_THAN'
        L.new(sep.outputs['Y'], cy.inputs['A'])
        cy.inputs['B'].default_value = clear['y']
        both = N.new('FunctionNodeBooleanMath')
        both.operation = 'AND'
        L.new(cx.outputs[0], both.inputs[0])
        L.new(cy.outputs[0], both.inputs[1])
        neg = N.new('FunctionNodeBooleanMath')
        neg.operation = 'NOT'
        L.new(both.outputs[0], neg.inputs[0])
        L.new(neg.outputs[0], dist.inputs['Selection'])
    ci = N.new('GeometryNodeCollectionInfo')
    ci.inputs['Collection'].default_value = col
    ci.inputs['Separate Children'].default_value = True
    ci.inputs['Reset Children'].default_value = True
    inst = N.new('GeometryNodeInstanceOnPoints')
    inst.inputs['Pick Instance'].default_value = True
    L.new(dist.outputs['Points'], inst.inputs['Points'])
    L.new(ci.outputs[0], inst.inputs['Instance'])
    pick = N.new('FunctionNodeRandomValue')
    pick.data_type = 'INT'
    pick.inputs[4].default_value = 0          # Min (INT)
    pick.inputs[5].default_value = max(0, len(sources) - 1)  # Max (INT)
    pick.inputs['Seed'].default_value = seed + 1
    L.new(pick.outputs[2], inst.inputs['Instance Index'])
    sc = N.new('FunctionNodeRandomValue')
    sc.data_type = 'FLOAT'
    sc.inputs[2].default_value = smin
    sc.inputs[3].default_value = smax
    sc.inputs['Seed'].default_value = seed + 2
    L.new(sc.outputs[1], inst.inputs['Scale'])
    if rotate:
        yaw = N.new('FunctionNodeRandomValue')
        yaw.data_type = 'FLOAT'
        yaw.inputs[2].default_value = 0.0
        yaw.inputs[3].default_value = 6.2832
        yaw.inputs['Seed'].default_value = seed + 3
        comb = N.new('ShaderNodeCombineXYZ')
        L.new(yaw.outputs[1], comb.inputs['Z'])
        L.new(comb.outputs[0], inst.inputs['Rotation'])
    join = N.new('GeometryNodeJoinGeometry')
    L.new(gi.outputs[0], join.inputs[0])
    L.new(inst.outputs[0], join.inputs[0])
    L.new(join.outputs[0], go.inputs[0])
    md = surface.modifiers.new(f'gn-{name}', 'NODES')
    md.node_group = ng
    return md


def _src(bpy, K, name, parts):
    """A source object for scattering: parts built at the origin, joined into ONE mesh object (one instance)."""
    objs = [p for p in parts if p is not None]
    for o in objs:
        o.parent = None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = f'src-{name}'
    # The meshes of the joined parts are left without user: removed now (no orphan data in the file).
    for me in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(me)
    return ob


def terrain(bpy, K, name, size_x, y0, y1, res, height_fn, rgb):
    """A ground mesh whose height is height_fn(x, y): flat where the actors play, rolling further away."""
    nx, ny = res
    vs, fs = [], []
    for j in range(ny + 1):
        y = y0 + (y1 - y0) * j / ny
        for i in range(nx + 1):
            x = -size_x / 2 + size_x * i / nx
            vs.append((x, y, height_fn(x, y)))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            fs.append((a, a + 1, a + nx + 2, a + nx + 1))
    ob = K['obj'](name, vs, fs, K['mat'](name, rgb, 0.95))
    for p in ob.data.polygons:
        p.use_smooth = True
    ob['shell'] = True
    return ob


# ── LA VILLE (le Plateau) ───────────────────────────────────────────────────────────────────────────────────────────
def build_ville(bpy, K, rnd, life):
    box, cyl, sphere, G = K['box'], K['cyl'], K['sphere'], K['G']
    box('ground', -40, 40, -5, 120, -0.1, 0, (150, 150, 152), 0.9)
    # Pedestrian plaza in front (the stage), kerb, the boulevard crossing, the far sidewalk.
    box('tilesplaza', -40, 40, -5, 4.5, 0, 0.12, vary((168, 160, 148), rnd), 0.85)
    box('road', -40, 40, 4.5, 12.0, 0, 0.004, (70, 72, 78), 0.75)
    for k in range(-12, 13):
        box(f'zebra{k}', k * 3.0, k * 3.0 + 1.6, 8.15, 8.35, 0.004, 0.008, (235, 235, 230), 0.6)
    box('sidewalk', -40, 40, 12.0, 15.0, 0, 0.12, (190, 184, 172), 0.85)
    # The row of buildings facing the camera (heights, widths, colours vary with the seed), never overlapping.
    x = -36.0
    k = 0
    pal = life.get('palette') or ['#cfd8dc', '#546e7a', '#ff7043']
    while x < 36:
        w = rnd.uniform(6.0, 11.0)
        h = rnd.choice([rnd.uniform(9, 16), rnd.uniform(16, 32), rnd.uniform(28, 48)])
        base = vary(tuple(int(pal[k % len(pal)][i:i + 2], 16) for i in (1, 3, 5)), rnd, 0.06, 0.3, 0.15)
        with G(f'immeuble{k}'):
            box(f'facade{k}', x, x + w - 0.6, 15.5, 22.0, 0, h, base, 0.6)
            box(f'roofedge{k}', x - 0.1, x + w - 0.5, 15.4, 22.1, h, h + 0.4, tuple(int(c * 0.8) for c in base), 0.6)
            if h < 18:
                box(f'awning{k}', x + 0.4, x + w - 1.0, 14.8, 15.5, 3.1, 3.25, rnd.choice([(220, 60, 50), (40, 120, 200), (240, 170, 40), (60, 160, 90)]), 0.7)
        x += w
        k += 1
    # Glass towers further back (the skyline of the Plateau).
    for t in range(9):
        tx = -48 + t * 12 + rnd.uniform(-2, 2)
        th = rnd.uniform(40, 90)
        ty = 45 + rnd.uniform(0, 25)
        with G(f'tour{t}'):
            box(f'glasstower{t}', tx, tx + rnd.uniform(7, 11), ty, ty + rnd.uniform(8, 14), 0, th, vary((120, 160, 190), rnd, 0.03, 0.2, 0.15), 0.08)
    # Street lamps and palms along the plaza edge, woro-woro taxis (green) and cars in the street.
    # Street lamps on the far sidewalk (never between the camera and the actors).
    for xx in (-16.0, -6.0, 6.0, 16.0):
        with G(f'lampadaire{xx}'):
            cyl(f'metallamp{xx}', (xx, 13.4, 3.0), 0.08, 6.0, (55, 58, 62), 0.4)
            box(f'metalarm{xx}', xx - 0.05, xx + 0.05, 12.4, 13.4, 5.95, 6.05, (55, 58, 62), 0.4)
            sphere(f'glowlamp{xx}', (xx, 12.4, 5.85), 0.18, (255, 240, 210), 0.3)
    # Real cars in both lanes (woro-woro, taxis, saloons, 4x4), spaced along the boulevard, never overlapping.
    import vehicles
    kinds = ['woro', 'taxi', 'berline', '4x4', 'woro', 'berline']
    x = -22.0 + rnd.uniform(0, 4)
    k = 0
    while x < 22 and k < 6:
        lane_y, heading = (6.4, 0.0) if k % 2 == 0 else (10.0, 180.0)
        kind = kinds[(k + int(life.get('variant', 0))) % len(kinds)]
        col = rnd.choice([(200, 30, 35), (235, 235, 235), (30, 60, 140), (20, 20, 24), (170, 175, 180)])
        vehicles.car(bpy, K, f'v{k}', (x, lane_y, 0), color=col, kind=kind, heading=heading, rnd=rnd)
        x += rnd.uniform(7.5, 11.0)
        k += 1
    # Palm trees scattered by Geometry Nodes on the far sidewalk strip.
    strip = box('sidewalkstrip', -38, 38, 12.6, 14.4, 0.12, 0.13, (190, 184, 172), 0.85)
    palm = _palm(bpy, K, 'v')
    gn_scatter(bpy, 'palmiers', strip, [palm], density=0.06, seed=int(life.get('variant', 0)) + 11, smin=0.85, smax=1.2, clear=None)


def _frond(bpy, K, name, length, droop, yaw, pitch, rgb):
    """A palm frond: a curved, drooping rachis with folded leaflets tapering to the tip (one mesh)."""
    segs, verts, faces = 14, [], []
    for i in range(segs + 1):
        t = i / segs
        # Arc of the rachis: up and out, then drooping under its own weight.
        x = length * t
        z = length * (0.35 * t - droop * t * t)
        half = 0.42 * math.sin(math.pi * min(1.0, t * 1.15)) * (1 - 0.6 * t)  # leaflet span
        fold = 0.12 * half  # the V fold of the leaflets
        verts += [(x, -half, z - fold), (x, 0.0, z + 0.02), (x, half, z - fold)]
    for i in range(segs):
        a = i * 3
        faces += [(a, a + 3, a + 4, a + 1), (a + 1, a + 4, a + 5, a + 2)]
    ob = K['obj'](name, verts, faces, K['mat'](name, rgb, 0.7))
    sol = ob.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.01
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.rotation_euler = (0, -pitch, yaw)
    return ob


def _palm(bpy, K, tag):
    """A coconut palm: ringed trunk leaning slightly, a crown of drooping fronds, a cluster of coconuts."""
    parts = []
    lean = 0.25
    for k in range(10):
        z = 0.5 * k
        c = K['cyl'](f'woodpalmring{tag}{k}', (lean * (z / 5.0) ** 2, 0, z + 0.25), 0.17 - 0.006 * k, 0.48, (128 - 2 * k, 96 - k, 62), 0.9)
        parts.append(c)
    top = (lean, 0, 5.05)
    for k in range(9):
        f = _frond(bpy, K, f'palmfrond{tag}{k}', 2.3 + 0.25 * (k % 3), 0.75 + 0.1 * (k % 2), k * 2 * math.pi / 9 + 0.2, math.radians(-10 + 8 * (k % 3)),
                   (62 + 6 * (k % 3), 128 + 8 * (k % 2), 52))
        f.location = top
        parts.append(f)
    for k in range(4):
        parts.append(K['sphere'](f'coconut{tag}{k}', (lean + 0.14 * math.cos(k * 1.6), 0.14 * math.sin(k * 1.6), 4.85), 0.1, (110, 80, 40), 0.6))
    for o in parts:
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return _src(bpy, K, f'palm{tag}', parts)


# ── LA MAISON (une villa du quartier) ───────────────────────────────────────────────────────────────────────────────
def build_maison(bpy, K, rnd, life):
    box, cyl, sphere, cone, G = K['box'], K['cyl'], K['sphere'], K['cone'], K['G']
    pal = life.get('palette') or ['#ffe0b2', '#a1887f', '#e91e63']
    wall = vary(tuple(int(pal[0][i:i + 2], 16) for i in (1, 3, 5)), rnd, 0.05, 0.25, 0.08)
    box('ground', -40, 40, -5, 80, -0.1, 0, (176, 150, 118), 0.95)
    box('tilesterrace', -6, 6, -5, 5.0, 0, 0.03, vary((196, 150, 118), rnd), 0.7)
    # The villa (two storeys), set back behind its courtyard.
    W, Y0, Y1 = rnd.uniform(9, 12), 7.5, 13.0
    with G('villa'):
        box('plastervilla', -W / 2, W / 2, Y0, Y1, 0, 6.4, wall, 0.85)
        box('plasterbalcony', -2.4, 2.4, Y0 - 1.2, Y0, 3.1, 3.3, wall, 0.85)
        for k in range(9):
            box(f'metalrail{k}', -2.35 + k * 0.58, -2.31 + k * 0.58, Y0 - 1.18, Y0 - 1.14, 3.3, 4.2, (40, 40, 45), 0.35)
        box('metalrailtop', -2.4, 2.4, Y0 - 1.2, Y0 - 1.1, 4.2, 4.26, (40, 40, 45), 0.35)
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=1.0, radius2=0.0, depth=1.0, location=(0, (Y0 + Y1) / 2, 6.4 + 1.1))
        roof = bpy.context.active_object
        roof.name = 'roofvilla'
        roof.rotation_euler = (0, 0, math.radians(45))
        roof.scale = ((W / 2 + 0.6) * 1.414, (Y1 - Y0) / 2 * 1.414 + 0.8, 2.2)
        roof.data.materials.append(K['mat']('roofvilla', vary((170, 70, 50), rnd), 0.8))
        K['reg'](roof)
        box('wooddoor', -0.7, 0.7, Y0 - 0.06, Y0, 0, 2.3, (110, 70, 40), 0.45)
        for k, xx in enumerate((-W / 2 + 1.2, W / 2 - 2.6)):
            for lvl, z0 in enumerate((1.0, 4.0)):
                box(f'glasswin{k}{lvl}', xx, xx + 1.4, Y0 - 0.04, Y0, z0, z0 + 1.4, (120, 150, 170), 0.1)
                for b in range(5):
                    box(f'metalgrill{k}{lvl}{b}', xx + 0.1 + b * 0.3, xx + 0.13 + b * 0.3, Y0 - 0.1, Y0 - 0.06, z0, z0 + 1.4, (40, 40, 45), 0.35)
    # The perimeter wall with its wrought-iron gate, the bougainvillea pouring over it.
    enclosure = vary(tuple(int(c * 0.82) for c in wall), rnd, 0.02, 0.1, 0.05)
    with G('cloture'):
        box('plasterwallL', -14, -1.6, 5.0, 5.3, 0, 1.9, enclosure, 0.85)
        box('plasterwallR', 1.6, 14, 5.0, 5.3, 0, 1.9, enclosure, 0.85)
        for k in range(13):
            box(f'metalgate{k}', -1.55 + k * 0.25, -1.51 + k * 0.25, 5.1, 5.2, 0, 1.8, (35, 35, 40), 0.35)
        box('metalgatetop', -1.6, 1.6, 5.08, 5.22, 1.8, 1.88, (35, 35, 40), 0.35)
    flowers = [K['lowsphere'](f'bouga{k}', (0, 0, 0), rnd.uniform(0.18, 0.3), vary((230, 60, 140), rnd, 0.03, 0.1, 0.1), 0.85) for k in range(3)]
    top = box('walltopL', -14, -1.8, 5.0, 5.3, 1.9, 1.95, enclosure, 0.85)
    gn_scatter(bpy, 'bougainvillier', top, flowers, density=9.0, seed=int(life.get('variant', 0)) + 5, smin=0.7, smax=1.3, clear=None)
    # Terrace: plastic chairs and a small table; a palm in the courtyard; potted plants.
    for k, xx in enumerate((-3.6, -2.4)):
        with G(f'chaise{k}'):
            box(f'chairseat{k}', xx - 0.22, xx + 0.22, 3.2, 3.62, 0.42, 0.46, (240, 240, 240), 0.35)
            box(f'chairback{k}', xx - 0.22, xx + 0.22, 3.6, 3.65, 0.46, 0.9, (240, 240, 240), 0.35)
            for lx in (xx - 0.2, xx + 0.17):
                for ly in (3.22, 3.6):
                    box(f'chairleg{k}{lx}{ly}', lx, lx + 0.03, ly, ly + 0.03, 0.0, 0.42, (235, 235, 235), 0.35)
    palm = _palm(bpy, K, 'm')
    palm.location = (4.2, 3.6, 0)


# ── LA NATURE (brousse, savane) ─────────────────────────────────────────────────────────────────────────────────────
def build_nature(bpy, K, rnd, life):
    v = int(life.get('variant', 0))
    ph = rnd.uniform(0, 6.28)

    def h(x, y):
        far = min(1.0, max(0.0, (y - 7.0) / 25.0))
        return far * (2.2 * math.sin(x * 0.11 + ph) + 1.6 * math.sin(y * 0.09 + ph * 0.7) + 0.9 * math.sin((x + y) * 0.23)) + far * far * 6.0
    ground = terrain(bpy, K, 'groundsavane', 120, -5, 90, (90, 70), h, vary((176, 150, 80), rnd, 0.02, 0.15, 0.1))
    # Distant hills (bluer, the air in between).
    hills = terrain(bpy, K, 'groundhills', 260, 90, 160, (60, 20), lambda x, y: 10 + 8 * math.sin(x * 0.03 + ph) + 5 * math.sin(x * 0.07), (110, 140, 120))
    hills['shell'] = True
    acacia = []
    for k in range(2):
        parts = [K['cyl'](f'woodacacia{k}', (0, 0, 1.6), 0.14, 3.2, (95, 70, 45), 0.9)]
        crown = K['sphere'](f'acaciacrown{k}', (0, 0, 3.4), 1.0, vary((80, 130, 50), rnd), 0.85)
        crown.scale = (2.2 + k * 0.4, 2.0, 0.45)
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action='DESELECT')
        crown.select_set(True)
        bpy.context.view_layer.objects.active = crown
        bpy.ops.object.transform_apply(scale=True)
        parts.append(crown)
        acacia.append(_src(bpy, K, f'acacia{k}', parts))
    gn_scatter(bpy, 'acacias', ground, acacia, density=0.004, seed=v + 21, smin=0.8, smax=1.4, clear={'x': 6.0, 'y': 14.0})
    grass = []
    for k in range(3):
        blades = [K['cone'](f'grass{k}{j}', (0.12 * math.cos(j * 2.1), 0.12 * math.sin(j * 2.1), 0.35), 0.04, 0.0, 0.7 + 0.1 * j, vary((200, 170, 80), rnd, 0.03, 0.2, 0.15), 0.9) for j in range(4)]
        grass.append(_src(bpy, K, f'grass{k}', blades))
    gn_scatter(bpy, 'herbes', ground, grass, density=0.35, seed=v + 31, smin=0.6, smax=1.3)
    rocks = []
    for k in range(2):
        r = K['sphere'](f'rock{k}', (0, 0, 0.15), 0.3, vary((150, 130, 110), rnd), 0.9)
        r.scale = (1.3, 1.0, 0.6)
        rocks.append(r)
    gn_scatter(bpy, 'rochers', ground, rocks, density=0.02, seed=v + 41, smin=0.5, smax=1.6)


# ── LE MONDE IMAGINAIRE ─────────────────────────────────────────────────────────────────────────────────────────────
def build_imaginaire(bpy, K, rnd, life):
    box, cyl, sphere, cone, G = K['box'], K['cyl'], K['sphere'], K['cone'], K['G']
    v = int(life.get('variant', 0))
    ground = terrain(bpy, K, 'grounddream', 120, -5, 80, (80, 60), lambda x, y: max(0.0, (y - 8) / 20.0) * 2.5 * math.sin(x * 0.15 + v), vary((150, 235, 190), rnd, 0.05, 0.15, 0.05))
    # Floating islands: grassy tops, rocky undersides, at different heights and distances.
    for k in range(6):
        ix, iy, iz = rnd.uniform(-30, 30), rnd.uniform(25, 70), rnd.uniform(8, 22)
        if abs(ix) < 6:
            ix += 12 * (1 if ix >= 0 else -1)
        r = rnd.uniform(3, 7)
        with G(f'ile{k}'):
            under = cone(f'rockisland{k}', (ix, iy, iz - r * 0.6), r, 0.3, r * 1.2, vary((130, 100, 140), rnd), 0.9)
            under.rotation_euler = (math.radians(180), 0, 0)
            top = cyl(f'grassisland{k}', (ix, iy, iz + 0.05), r, 0.3, vary((110, 210, 140), rnd), 0.9)
    # Giant glowing mushrooms and crystals, scattered by Geometry Nodes (the stage in front stays free).
    shrooms = []
    for k in range(2):
        stem = cyl(f'stem{k}', (0, 0, 1.2), 0.25, 2.4, (240, 230, 210), 0.7)
        cap = sphere(f'glowcap{k}', (0, 0, 2.4), 1.1, vary((255, 80, 190) if k == 0 else (70, 200, 255), rnd), 0.4)
        cap.scale = (1.0, 1.0, 0.5)
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action='DESELECT')
        cap.select_set(True)
        bpy.context.view_layer.objects.active = cap
        bpy.ops.object.transform_apply(scale=True)
        shrooms.append(_src(bpy, K, f'shroom{k}', [stem, cap]))
    gn_scatter(bpy, 'champignons', ground, shrooms, density=0.01, seed=v + 51, smin=0.7, smax=2.2, clear={'x': 5.0, 'y': 10.0})
    crystals = []
    for k in range(2):
        c = K['lowsphere'](f'glowcrystal{k}', (0, 0, 0.6), 0.35, (120, 255, 240) if k == 0 else (255, 170, 90), 0.2)
        c.scale = (0.6, 0.6, 2.2)
        crystals.append(c)
    gn_scatter(bpy, 'cristaux', ground, crystals, density=0.02, seed=v + 61, smin=0.5, smax=1.6)
    flowers = [K['lowsphere'](f'glowflower{k}', (0, 0, 0.25), 0.07, c, 0.3) for k, c in enumerate([(255, 230, 80), (255, 110, 210), (90, 230, 255)])]
    gn_scatter(bpy, 'fleurs', ground, flowers, density=0.35, seed=v + 71, smin=0.6, smax=1.4)
    # Two moons in the violet sky.
    for k, (mx, mz, r) in enumerate(((-18, 32, 4.0), (14, 40, 2.4))):
        sphere(f'glowmoon{k}', (mx, 120, mz), r, (255, 245, 220) if k == 0 else (200, 220, 255), 0.3)
