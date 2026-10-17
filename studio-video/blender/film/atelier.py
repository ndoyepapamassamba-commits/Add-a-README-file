"""
ATELIER — les objets et les animaux de la scène, avec une FORME, une COULEUR et une PHYSIQUE réelles.

Ce qui remplace les primitives (un cube, des boules rouges) :
  • des dimensions réelles (une tomate fait 7 cm, une caisse de marché 42 × 32 × 22 cm, une poule 40 cm au peigne) ;
  • des formes construites comme les vraies : une tomate légèrement aplatie, côtelée, avec son calice vert en étoile et
    son pédoncule ; une caisse en lattes ajourées avec ses montants ; une poule avec corps en goutte, queue en éventail,
    ailes, camail doré, crête dentelée, barbillons, bec, yeux, pattes écailleuses et doigts ;
  • une matière « troupe » sans lumière de scène (rendu émissif comme le décor peint) : volume éclairé par le haut,
    bord plus clair, reflet pour ce qui brille (tomate, émail), variations de couleur et grain (jamais d'aplat) ;
  • la loi de la PHYSIQUE : ce qui est versé (des tomates dans une caisse) tombe sous la gravité et se pose par une
    vraie simulation de corps rigides (Bullet, le moteur physique de Blender) dans une scène d'atelier séparée — rien
    ne flotte, rien ne s'interpénètre ; un tas « en pyramide » est posé au contact exact (sphères tangentes).

Tout est construit par le code (aucun modèle tiers : pas de licence à respecter, style maîtrisé).
"""
import math
import random

# Real sizes (m) — the physics check (preflight) compares what is built with them.
REAL_SIZE = {
    'tomate': (0.055, 0.085), 'caisse': (0.35, 0.50), 'poule': (0.33, 0.48), 'oignon': (0.05, 0.09),
    'bassine': (0.35, 0.60), 'ballon': (0.21, 0.23),
}
HEN_COATS = {
    # « poule bicyclette » (the free-range hens of West African yards and markets): body, neck hackles, tail, wings
    'rousse': {'corps': (168, 74, 36), 'camail': (222, 150, 62), 'queue': (28, 36, 32), 'aile': (128, 52, 26)},
    'noire-cuivree': {'corps': (40, 34, 30), 'camail': (196, 120, 48), 'queue': (18, 26, 24), 'aile': (60, 44, 34)},
    'blanche': {'corps': (238, 232, 220), 'camail': (246, 238, 214), 'queue': (230, 224, 210), 'aile': (226, 218, 204)},
    'perdrix': {'corps': (150, 102, 58), 'camail': (206, 160, 86), 'queue': (44, 40, 34), 'aile': (120, 84, 50)},
}


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


class Atelier:
    def __init__(self, bpy, light=None, seed=11, tint=(1.0, 1.0, 1.0)):
        self.bpy = bpy
        self.light = light or {'mode': 'frontale', 'sign': 0}
        self.tint = tint  # the light of the set (time of day), the same as on the painting
        self.rnd = random.Random(seed)
        self._mats = {}

    # ── matière ─────────────────────────────────────────────────────────────────────────────────────────────────────
    def matiere(self, rgb, gloss=0.0, grain=0.08, var=0.07, scale=60.0, motif=None, rgb2=None, name=None, ref=None, zr=None):
        """Emissive « troupe » material: key light from above (and from the side of the set's light), soft wrap, a
        lighter rim, optional gloss highlight, colour variation and fine grain; `motif` = 'plumes' (scalloped feathers),
        'bois' (grain along x), 'ecailles' (scaled legs); rgb2 = second colour mixed by a gradient along z (object)."""
        key = (rgb, gloss, grain, var, scale, motif, rgb2, ref.name if ref is not None else None, zr)
        if key in self._mats:
            return self._mats[key]
        bpy = self.bpy
        m = bpy.data.materials.new(name or f'atelier-{motif or "uni"}-{rgb}')
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        N, L = nt.nodes, nt.links
        out = N.new('ShaderNodeOutputMaterial')
        geo = N.new('ShaderNodeNewGeometry')
        tc = N.new('ShaderNodeTexCoord')
        # Base colour (+ optional second colour along the object's height).
        c1 = N.new('ShaderNodeRGB')
        c1.outputs[0].default_value = (*[lin(min(255, v * t)) for v, t in zip(rgb, self.tint)], 1)
        col = c1.outputs[0]
        if rgb2 is not None:
            c2 = N.new('ShaderNodeRGB')
            c2.outputs[0].default_value = (*[lin(min(255, v * t)) for v, t in zip(rgb2, self.tint)], 1)
            sz = N.new('ShaderNodeSeparateXYZ')
            mx = N.new('ShaderNodeMix')
            mx.data_type = 'RGBA'
            if ref is not None and zr is not None:
                # In the space of the whole animal: rgb2 BELOW the line (belly, legs), rgb above — continuous over every
                # piece (no striped legs).
                tr = N.new('ShaderNodeTexCoord')
                tr.object = ref
                L.new(tr.outputs['Object'], sz.inputs[0])
                fr = N.new('ShaderNodeMapRange')
                fr.interpolation_type = 'SMOOTHSTEP'
                fr.inputs['From Min'].default_value, fr.inputs['From Max'].default_value = zr
                fr.inputs['To Min'].default_value, fr.inputs['To Max'].default_value = 1.0, 0.0
                L.new(sz.outputs['Z'], fr.inputs['Value'])
                L.new(fr.outputs[0], mx.inputs['Factor'])
            else:
                L.new(tc.outputs['Generated'], sz.inputs[0])
                L.new(sz.outputs['Z'], mx.inputs['Factor'])
            L.new(c1.outputs[0], mx.inputs['A'])
            L.new(c2.outputs[0], mx.inputs['B'])
            col = mx.outputs['Result']
        # Variation + grain (never a flat area).
        facs = []
        for sc, amp in ((scale / 12.0, var), (scale, grain)):
            nz = N.new('ShaderNodeTexNoise')
            nz.inputs['Scale'].default_value = sc
            nz.inputs['Detail'].default_value = 6.0
            L.new(tc.outputs['Object'], nz.inputs['Vector'])
            mr = N.new('ShaderNodeMapRange')
            mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = 0.3, 0.7
            mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = 1 - amp, 1 + amp
            L.new(nz.outputs['Fac'], mr.inputs['Value'])
            facs.append(mr.outputs[0])
        if motif in ('plumes', 'ecailles'):
            vo = N.new('ShaderNodeTexVoronoi')
            vo.feature = 'DISTANCE_TO_EDGE'
            vo.inputs['Scale'].default_value = 55.0 if motif == 'plumes' else 260.0
            L.new(tc.outputs['Object'], vo.inputs['Vector'])
            mr = N.new('ShaderNodeMapRange')
            mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = 0.0, 0.16
            mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = (0.88, 1.03) if motif == 'plumes' else (0.72, 1.04)
            L.new(vo.outputs['Distance'], mr.inputs['Value'])
            facs.append(mr.outputs[0])
        if motif == 'poil':
            mp = N.new('ShaderNodeMapping')
            mp.inputs['Scale'].default_value = (60.0, 260.0, 260.0)  # strands along the body (x)
            L.new(tc.outputs['Object'], mp.inputs['Vector'])
            nz = N.new('ShaderNodeTexNoise')
            nz.inputs['Detail'].default_value = 3.0
            L.new(mp.outputs['Vector'], nz.inputs['Vector'])
            mr = N.new('ShaderNodeMapRange')
            mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = 0.3, 0.7
            mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = 0.88, 1.08
            L.new(nz.outputs['Fac'], mr.inputs['Value'])
            facs.append(mr.outputs[0])
        if motif == 'taches':  # patches (piebald cattle, a black-and-white cat, a football)
            vo = N.new('ShaderNodeTexVoronoi')
            vo.inputs['Scale'].default_value = scale / 10.0
            L.new(tc.outputs['Object'], vo.inputs['Vector'])
            rr = N.new('ShaderNodeMath')
            rr.operation = 'GREATER_THAN'
            rr.inputs[1].default_value = 0.6
            sepc = N.new('ShaderNodeSeparateColor')
            L.new(vo.outputs['Color'], sepc.inputs[0])
            L.new(sepc.outputs[0], rr.inputs[0])
            mr = N.new('ShaderNodeMapRange')
            mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = 1.0, 0.16
            L.new(rr.outputs[0], mr.inputs['Value'])
            facs.append(mr.outputs[0])
        if motif == 'bois':
            mp = N.new('ShaderNodeMapping')
            mp.inputs['Scale'].default_value = (1.0, 18.0, 18.0)
            L.new(tc.outputs['Object'], mp.inputs['Vector'])
            wv = N.new('ShaderNodeTexWave')
            wv.inputs['Scale'].default_value = 5.0
            wv.inputs['Distortion'].default_value = 2.5
            L.new(mp.outputs['Vector'], wv.inputs['Vector'])
            mr = N.new('ShaderNodeMapRange')
            mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = 0.80, 1.08
            L.new(wv.outputs['Fac'], mr.inputs['Value'])
            facs.append(mr.outputs[0])
        # Light without lamps: the normal against the key direction (above, toward the camera, from the set's side).
        sgn = float(self.light.get('sign', 0)) * (0.55 if self.light.get('mode') == 'laterale' else 0.0)
        kd = N.new('ShaderNodeCombineXYZ')
        kd.inputs[0].default_value, kd.inputs[1].default_value, kd.inputs[2].default_value = sgn, -0.55, 0.85
        kn = N.new('ShaderNodeVectorMath')
        kn.operation = 'NORMALIZE'
        L.new(kd.outputs[0], kn.inputs[0])
        dot = N.new('ShaderNodeVectorMath')
        dot.operation = 'DOT_PRODUCT'
        L.new(geo.outputs['Normal'], dot.inputs[0])
        L.new(kn.outputs[0], dot.inputs[1])
        wrap = N.new('ShaderNodeMapRange')  # half-Lambert wrap: soft cartoon volume
        wrap.inputs['From Min'].default_value, wrap.inputs['From Max'].default_value = -1.0, 1.0
        wrap.inputs['To Min'].default_value, wrap.inputs['To Max'].default_value = 0.42, 1.12
        L.new(dot.outputs['Value'], wrap.inputs['Value'])
        lw = N.new('ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.25
        rim = N.new('ShaderNodeMath')
        rim.operation = 'MULTIPLY_ADD'
        rim.inputs[1].default_value = 0.22
        rim.inputs[2].default_value = 1.0
        L.new(lw.outputs['Fresnel'], rim.inputs[0])
        acc = wrap.outputs['Result']
        for fsock in facs + [rim.outputs[0]]:
            mm = N.new('ShaderNodeMath')
            mm.operation = 'MULTIPLY'
            L.new(acc, mm.inputs[0])
            L.new(fsock, mm.inputs[1])
            acc = mm.outputs[0]
        mul = N.new('ShaderNodeVectorMath')
        mul.operation = 'SCALE'
        L.new(col, mul.inputs[0])
        L.new(acc, mul.inputs['Scale'])
        colour = mul.outputs[0]
        if gloss > 0:
            # Specular highlight (Blinn): half vector between the view and the key direction.
            inc = N.new('ShaderNodeVectorMath')
            inc.operation = 'ADD'
            L.new(geo.outputs['Incoming'], inc.inputs[0])
            L.new(kn.outputs[0], inc.inputs[1])
            hn = N.new('ShaderNodeVectorMath')
            hn.operation = 'NORMALIZE'
            L.new(inc.outputs[0], hn.inputs[0])
            nh = N.new('ShaderNodeVectorMath')
            nh.operation = 'DOT_PRODUCT'
            L.new(geo.outputs['Normal'], nh.inputs[0])
            L.new(hn.outputs[0], nh.inputs[1])
            cl = N.new('ShaderNodeMath')
            cl.operation = 'MAXIMUM'
            cl.inputs[1].default_value = 0.0
            L.new(nh.outputs['Value'], cl.inputs[0])
            pw = N.new('ShaderNodeMath')
            pw.operation = 'POWER'
            pw.inputs[1].default_value = 60.0
            L.new(cl.outputs[0], pw.inputs[0])
            gm = N.new('ShaderNodeMath')
            gm.operation = 'MULTIPLY'
            gm.inputs[1].default_value = gloss
            L.new(pw.outputs[0], gm.inputs[0])
            add = N.new('ShaderNodeVectorMath')
            add.operation = 'ADD'
            L.new(colour, add.inputs[0])
            gv = N.new('ShaderNodeCombineXYZ')
            for i in range(3):
                L.new(gm.outputs[0], gv.inputs[i])
            L.new(gv.outputs[0], add.inputs[1])
            colour = add.outputs[0]
        em = N.new('ShaderNodeEmission')
        L.new(colour, em.inputs['Color'])
        L.new(em.outputs[0], out.inputs['Surface'])
        m['atelier'] = True  # built in the troupe's style (the style control checks it)
        m['rgb'] = list(rgb)
        self._mats[key] = m
        return m

    # ── géométrie ───────────────────────────────────────────────────────────────────────────────────────────────────
    def _obj(self, name, me, mat, parent, smooth=True, subsurf=0):
        bpy = self.bpy
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob['atelier'] = True
        if mat is not None:
            me.materials.append(mat)
        if smooth:
            for p in me.polygons:
                p.use_smooth = True
        if subsurf:
            md = ob.modifiers.new('lisse', 'SUBSURF')
            md.levels = md.render_levels = subsurf
        ob.parent = parent
        return ob

    def ellipsoid(self, name, loc, radii, mat, parent, seg=20, deform=None, subsurf=1):
        """A UV ellipsoid; `deform(x, y, z) → (x, y, z)` shapes it (applied on the unit sphere before scaling)."""
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(8, seg // 2), radius=1.0)
        for v in bm.verts:
            x, y, z = v.co
            if deform:
                x, y, z = deform(x, y, z)
            v.co = (loc[0] + x * radii[0], loc[1] + y * radii[1], loc[2] + z * radii[2])
        me = self.bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        return self._obj(name, me, mat, parent, subsurf=subsurf)

    def tube(self, name, p0, p1, r0, r1, mat, parent, seg=10, subsurf=0):
        """A tapered tube from p0 to p1 (legs, toes, stems)."""
        import bmesh
        from mathutils import Vector
        a, b = Vector(p0), Vector(p1)
        d = b - a
        L = d.length
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=L)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        for v in bm.verts:
            v.co = a + q @ (v.co + Vector((0, 0, L / 2)))
        me = self.bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        return self._obj(name, me, mat, parent, subsurf=subsurf)

    def eye(self, name, center, r, parent, iris=(120, 78, 36), side=1, look=(1.0, 0.0, 0.0)):
        """A cartoon eye (the troupe's style): white, coloured iris, black pupil, a light speck — readable at a glance."""
        cx, cy, cz = center
        white = self.matiere((246, 244, 238), gloss=0.5, grain=0.0, var=0.0)
        self.ellipsoid(f'{name}-blanc', center, (r * 0.8, r * 0.55, r), white, parent, seg=14, subsurf=0)
        lx, ly, lz = look
        off = (cx + lx * r * 0.45, cy + side * r * 0.42, cz + lz * r * 0.2)
        self.ellipsoid(f'{name}-iris', off, (r * 0.45, r * 0.25, r * 0.62), self.matiere(iris, gloss=0.6, grain=0.0, var=0.04), parent, seg=12, subsurf=0)
        pup = (off[0] + lx * r * 0.12, off[1] + side * r * 0.12, off[2])
        self.ellipsoid(f'{name}-pupille', pup, (r * 0.26, r * 0.16, r * 0.36), self.matiere((14, 12, 12), gloss=1.0, grain=0.0, var=0.0), parent, seg=10, subsurf=0)
        self.ellipsoid(f'{name}-reflet', (pup[0] + r * 0.05, pup[1] + side * r * 0.1, pup[2] + r * 0.22), (r * 0.1, r * 0.06, r * 0.1),
                       self.matiere((255, 255, 255), grain=0.0, var=0.0), parent, seg=8, subsurf=0)

    def box(self, name, center, size, mat, parent, bevel=0.004):
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = (center[0] + v.co[0] * size[0], center[1] + v.co[1] * size[1], center[2] + v.co[2] * size[2])
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect='EDGES')
        me = self.bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        return self._obj(name, me, mat, parent, smooth=False)

    def leaf(self, name, base, direction, length, width, mat, parent, curl=0.25):
        """A thin pointed blade (a sepal, a tail feather, a comb point): a curved, tapered strip with thickness."""
        import bmesh
        from mathutils import Vector
        d = Vector(direction).normalized()
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        side.normalize()
        up = side.cross(d).normalized()
        bm = bmesh.new()
        n = 6
        rows = []
        for k in range(n + 1):
            t = k / n
            w = width * math.sin(math.pi * min(1.0, 0.15 + 0.85 * t)) * (1 - t) ** 0.4 if t < 1 else 0.0
            c = Vector(base) + d * (length * t) + up * (curl * length * t * t)
            th = 0.12 * width * (1 - t)
            rows.append([bm.verts.new(c - side * w / 2 + up * th), bm.verts.new(c + side * w / 2 + up * th),
                         bm.verts.new(c + side * w / 2 - up * th), bm.verts.new(c - side * w / 2 - up * th)])
        for r0, r1 in zip(rows, rows[1:]):
            for i in range(4):
                bm.faces.new((r0[i], r0[(i + 1) % 4], r1[(i + 1) % 4], r1[i]))
        me = self.bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        return self._obj(name, me, mat, parent)

    def empty(self, name, parent=None, loc=(0, 0, 0)):
        ob = self.bpy.data.objects.new(name, None)
        self.bpy.context.scene.collection.objects.link(ob)
        ob.parent = parent
        ob.location = loc
        return ob

    # ── objets ──────────────────────────────────────────────────────────────────────────────────────────────────────
    def tomate(self, name, loc, parent, r=None):
        """A tomato: 6–8 cm, slightly flattened, faintly ribbed, a dimple under its green star-shaped calyx and stalk;
        red to orange-red, glossy."""
        r = r or self.rnd.uniform(0.032, 0.040)
        rgb = self.rnd.choice([(212, 36, 26), (226, 52, 28), (198, 30, 28), (232, 84, 34), (218, 44, 30)])
        ribs, ph = self.rnd.choice((5, 6)), self.rnd.uniform(0, 6.28)

        def shape(x, y, z):
            a = math.atan2(y, x)
            k = 1 + 0.035 * math.cos(ribs * a + ph) * (1 - abs(z))
            z2 = z * 0.84 - (0.18 * math.exp(-((x * x + y * y) / 0.05)) if z > 0 else 0)  # flattened, dimple on top
            return x * k, y * k, z2
        root = self.empty(name, parent, loc)
        self.ellipsoid(f'{name}-chair', (0, 0, 0), (r, r, r), self.matiere(rgb, gloss=0.55, grain=0.04, var=0.05, scale=90), root, seg=24, deform=shape)
        green = self.matiere((58, 120, 40), grain=0.08, var=0.08)
        top = 0.84 * r - 0.18 * r
        for s in range(5):
            a = s * 2 * math.pi / 5 + ph
            self.leaf(f'{name}-sepale{s}', (0, 0, top + 0.002), (math.cos(a), math.sin(a), -0.25), r * 0.75, r * 0.32, green, root, curl=-0.35)
        self.tube(f'{name}-tige', (0, 0, top), (0.002, 0.001, top + r * 0.45), r * 0.09, r * 0.06, green, root, seg=6)
        root['rayon'] = r
        return root

    def caisse(self, name, loc, parent, size=(0.42, 0.32, 0.22)):
        """A market crate: four corner posts, side slats with gaps, a slatted bottom — wood whose planks differ."""
        root = self.empty(name, parent, loc)
        sx, sy, sz = size
        woods = [(190, 142, 92), (176, 128, 80), (202, 156, 104), (168, 120, 74)]
        mat = lambda: self.matiere(self.rnd.choice(woods), grain=0.06, var=0.08, motif='bois')
        t, post = 0.012, 0.028
        for ix in (-1, 1):
            for iy in (-1, 1):
                self.box(f'{name}-montant', (ix * (sx / 2 - post / 2), iy * (sy / 2 - post / 2), sz / 2), (post, post, sz), mat(), root)
        n_sl, gap = 3, 0.018
        h = (sz - (n_sl - 1) * gap) / n_sl
        for k in range(n_sl):
            zc = h / 2 + k * (h + gap)
            for iy in (-1, 1):
                self.box(f'{name}-latte', (0, iy * (sy / 2 - t / 2), zc), (sx - 2 * post, t, h), mat(), root)
            for ix in (-1, 1):
                self.box(f'{name}-latte', (ix * (sx / 2 - t / 2), 0, zc), (t, sy - 2 * post, h), mat(), root)
        for k in range(4):
            self.box(f'{name}-fond', (0, -sy / 2 + (k + 0.5) * sy / 4, t / 2 + 0.004), (sx - 2 * post, sy / 4 - 0.01, t), mat(), root)
        root['interieur'] = (sx - 2 * t, sy - 2 * t, sz)
        return root

    # ── physique : verser, laisser tomber, poser ─────────────────────────────────────────────────────────────────────
    def verser(self, items, container_dims, settle_frames=120, floor_z=0.0):
        """Pours `items` (roots with a 'rayon') into an open box (inner dims sx, sy, height) by a REAL rigid-body
        simulation (Bullet) in a separate workshop scene: they fall under gravity (9.81 m/s²), collide, roll and come to
        rest. Their resting positions (relative to the container) are written back. Returns the final local positions."""
        bpy = self.bpy
        sx, sy, sz = container_dims
        main = bpy.context.scene
        sc = bpy.data.scenes.new('atelier-physique')
        made = []

        def add(ob, kind, shape, mass=0.1, friction=0.8, bounce=0.15):
            sc.collection.objects.link(ob)
            with bpy.context.temp_override(scene=sc, view_layer=sc.view_layers[0], object=ob, active_object=ob, selected_objects=[ob],
                                           selected_editable_objects=[ob]):
                bpy.ops.rigidbody.object_add(type=kind)
            ob.rigid_body.collision_shape = shape
            ob.rigid_body.mass = mass
            ob.rigid_body.friction = friction
            ob.rigid_body.restitution = bounce
            made.append(ob)

        try:
            with bpy.context.temp_override(scene=sc, view_layer=sc.view_layers[0]):
                bpy.ops.rigidbody.world_add()
            sc.rigidbody_world.point_cache.frame_start = 1
            sc.rigidbody_world.point_cache.frame_end = settle_frames
            sc.rigidbody_world.substeps_per_frame = 20
            sc.rigidbody_world.solver_iterations = 20
            # The container as passive walls and floor.
            walls = []
            fz = floor_z
            wh = sz + 0.012  # the walls of the crate (+ a finger): what is poured above the rim rolls off and is not kept
            for c, s_ in (((0, 0, fz - 0.01), (sx + 0.1, sy + 0.1, 0.02)), ((sx / 2 + 0.01, 0, wh / 2), (0.02, sy + 0.04, wh)),
                          ((-sx / 2 - 0.01, 0, wh / 2), (0.02, sy + 0.04, wh)), ((0, sy / 2 + 0.01, wh / 2), (sx + 0.04, 0.02, wh)),
                          ((0, -sy / 2 - 0.01, wh / 2), (sx + 0.04, 0.02, wh))):
                # (collision boxes are centred on the OBJECT origin: the wall is placed by its location, not in its mesh;
                # the walls go higher than the crate while pouring, like the vendor's hands keeping them in)
                me = bpy.data.meshes.new('mur')
                import bmesh
                bm = bmesh.new()
                bmesh.ops.create_cube(bm, size=1.0)
                bmesh.ops.scale(bm, vec=s_, verts=bm.verts)
                bm.to_mesh(me)
                bm.free()
                w = bpy.data.objects.new('mur', me)
                w.location = c
                add(w, 'PASSIVE', 'BOX', friction=0.9)
                walls.append(w)
            # Balls dropped from above the crate at random places (the vendor pours them).
            balls = []
            for k, it in enumerate(items):
                r = float(it.get('rayon', 0.035))
                me = bpy.data.meshes.new('bille')
                import bmesh
                bm = bmesh.new()
                bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=r)
                bm.to_mesh(me)
                bm.free()
                b = bpy.data.objects.new('bille', me)
                # Poured in thin layers inside the crate's outline (the vendor fills it, she does not throw them).
                b.location = (self.rnd.uniform(-sx / 2 + r, sx / 2 - r), self.rnd.uniform(-sy / 2 + r, sy / 2 - r), floor_z + r + 0.01 + 0.02 * k)
                add(b, 'ACTIVE', 'SPHERE', mass=0.09, friction=0.7, bounce=0.12)
                balls.append(b)
            for f in range(1, settle_frames + 1):
                sc.frame_set(f)
            out = []
            for it, b in zip(items, balls):
                p = b.matrix_world.translation.copy()
                it.rotation_euler = (0.0, 0.0, b.matrix_world.to_euler().z)  # a fruit settles stalk up, turned anyhow
                # What rolled off or did not come to rest inside the crate is not kept (it would lie on the floor).
                inside = abs(p.x) <= sx / 2 and abs(p.y) <= sy / 2 and floor_z <= p.z <= sz + 0.05
                out.append((p.x, p.y, p.z) if inside else None)
            return out
        finally:
            for ob in made:
                me = ob.data
                bpy.data.objects.remove(ob, do_unlink=True)
                if me is not None and me.users == 0:
                    bpy.data.meshes.remove(me)
            bpy.data.scenes.remove(sc)
            bpy.context.window_manager  # (keep the main scene current)
            if bpy.context.scene is not main:
                try:
                    bpy.context.window.scene = main
                except Exception:
                    pass

    def pyramide(self, name, loc, parent, r=0.036):
        """A market heap: three tomatoes touching on the ground (equilateral triangle of side 2r) and one on top,
        resting exactly on the three (tangent spheres: centre at height r + 2r·√(2/3))."""
        root = self.empty(name, parent, loc)
        d = 2 * r / math.sqrt(3)
        for k in range(3):
            a = math.radians(90 + 120 * k)
            self.tomate(f'{name}-b{k}', (d * math.cos(a), d * math.sin(a), r * 0.84), root, r=r)
        self.tomate(f'{name}-h', (0, 0, r * 0.84 + 2 * r * math.sqrt(2 / 3)), root, r=r)
        return root

    def caisse_de_tomates(self, name, loc, parent, n=44, tas=True):
        """« pyramide de tomates »: a crate filled by pouring tomatoes (physics), a pyramid heap beside it (when there
        is room for it)."""
        root = self.empty(name, parent, loc)
        crate = self.caisse(f'{name}-caisse', (0, 0, 0), root)
        inner = crate['interieur']
        toms = [self.tomate(f'{name}-t{k}', (0, 0, 0.3 + 0.08 * k), crate) for k in range(n)]
        try:
            pos = self.verser(toms, inner, floor_z=0.022)  # on the slatted bottom of the crate
            kept = 0
            for t, p_ in zip(toms, pos):
                if p_ is None:
                    for ob in list(t.children_recursive) + [t]:
                        me = ob.data
                        self.bpy.data.objects.remove(ob, do_unlink=True)
                        if me is not None and me.users == 0:
                            self.bpy.data.meshes.remove(me)
                    continue
                x, y, z = p_
                t.location = (x, y, z - t['rayon'] * 0.16)  # the flattened fruit sits a little lower than its sphere
                kept += 1
            print(f'[atelier] caisse remplie par gravité : {kept} tomates posées (simulation Bullet, 9,81 m/s²)', flush=True)
        except Exception as e:  # never leave them floating: an analytic heap if the simulation is unavailable
            print('[atelier] simulation indisponible, tas analytique :', e, flush=True)
            sx, sy, sz = inner
            k = 0
            for layer in range(3):
                for ix in range(4 - layer):
                    for iy in range(3 - layer):
                        if k < n:
                            r = toms[k]['rayon']
                            toms[k].location = (-sx / 2 + r + 0.005 + ix * 2 * r + layer * r, -sy / 2 + r + 0.005 + iy * 2 * r + layer * r, 0.018 + r + layer * 1.63 * r)
                            k += 1
        if tas:
            self.pyramide(f'{name}-tas', (0.33, -0.04, 0.0), root)
        root['emprise'] = (0.42 + (0.40 if tas else 0.0), 0.32)  # footprint on the floor (x, y)
        return root

    # ── animaux ─────────────────────────────────────────────────────────────────────────────────────────────────────
    def poule(self, name, parent=None, robe=None):
        """A West African free-range hen (« poule bicyclette »), ~40 cm to the comb, facing +x. Returns (root, body,
        head) like the old blob hen (the animation pecks with `body` and turns `head`)."""
        coat = HEN_COATS[robe or self.rnd.choice(list(HEN_COATS))]
        root = self.empty(name, parent)
        body = self.empty(f'{name}-corps', root, (0, 0, 0.0))
        plum = lambda rgb, rgb2=None: self.matiere(rgb, grain=0.025, var=0.08, scale=50, motif='plumes', rgb2=rgb2)

        def egg(x, y, z):  # a teardrop: full chest in front (+x), narrowing and rising toward the tail
            k = 1 - 0.22 * max(0.0, -x)
            return x, y * k, z * k + 0.18 * max(0.0, -x) ** 2
        self.ellipsoid(f'{name}-tronc', (0.0, 0, 0.20), (0.15, 0.10, 0.105), plum(coat['corps'], coat['camail']), body, seg=28, deform=egg)
        # Wings folded along the flanks.
        for s in (-1, 1):
            # A folded wing: lies along the flank (inside the body's curve), widest at the shoulder, tip toward the tail.
            self.ellipsoid(f'{name}-aile', (-0.035, s * 0.075, 0.222), (0.105, 0.032, 0.055), plum(coat['aile'], coat['corps']), body, seg=22,
                           deform=lambda x, y, z, s=s: (x, y - s * 0.35 * z * z, z * (1 - 0.35 * max(0.0, -x)) + 0.22 * max(0.0, -x) ** 2))
        # Tail: a fan of curved feathers, rising and arching back.
        tail = plum(coat['queue'])
        for k in range(9):
            a = math.radians(-40 + 10 * k)
            self.leaf(f'{name}-queue{k}', (-0.115, 0.03 * math.sin(a), 0.27), (-0.45, math.sin(a) * 0.5, 0.9), 0.095 + 0.01 * (k % 2), 0.045, tail, body, curl=-0.25)
        # Neck with golden hackles, then the head.
        self.ellipsoid(f'{name}-cou', (0.10, 0, 0.30), (0.055, 0.05, 0.075), plum(coat['camail']), body, seg=18)
        head = self.empty(f'{name}-tete', body, (0.13, 0, 0.36))
        self.ellipsoid(f'{name}-crane', (0, 0, 0), (0.038, 0.032, 0.034), plum(coat['camail']), head, seg=18)
        red = self.matiere((206, 34, 30), gloss=0.15, grain=0.06, var=0.06)
        for k in range(5):  # serrated single comb
            self.leaf(f'{name}-crete{k}', (-0.018 + 0.009 * k, 0, 0.027), (0.05 * (k - 2), 0, 1.0), 0.016 + 0.005 * (k in (1, 2, 3)), 0.013, red, head, curl=0.0)
        for s in (-1, 1):  # wattles
            self.ellipsoid(f'{name}-barbillon', (0.028, s * 0.007, -0.030), (0.008, 0.005, 0.011), red, head, seg=12)
        beak = self.matiere((232, 176, 70), gloss=0.2, grain=0.04)
        self.leaf(f'{name}-bec', (0.033, 0, -0.004), (1.0, 0, -0.35), 0.028, 0.016, beak, head, curl=-0.2)
        for s in (-1, 1):  # eyes: white, orange iris, black pupil, a highlight
            self.eye(f'{name}-oeil', (0.016, s * 0.026, 0.008), 0.011, head, iris=(236, 140, 36), side=s)
        # Legs: feathered thighs, yellow scaled shanks, three toes forward and one back (they stay on the ground).
        leg = self.matiere((226, 178, 66), grain=0.05, motif='ecailles')
        for s in (-1, 1):
            self.ellipsoid(f'{name}-cuisse', (0.01, s * 0.05, 0.12), (0.05, 0.035, 0.05), plum(coat['corps']), body, seg=14)
            self.tube(f'{name}-patte', (0.015, s * 0.045, 0.085), (0.02, s * 0.045, 0.012), 0.008, 0.007, leg, root)
            for a in (-0.45, 0.0, 0.45):
                self.tube(f'{name}-doigt', (0.02, s * 0.045, 0.006), (0.02 + 0.045 * math.cos(a), s * 0.045 + 0.045 * math.sin(a), 0.004), 0.005, 0.003, leg, root, seg=6)
            self.tube(f'{name}-ergot', (0.02, s * 0.045, 0.006), (-0.012, s * 0.045, 0.004), 0.004, 0.003, leg, root, seg=6)
        root['hauteur'] = 0.40
        return root, body, head


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# The rest of the living world: every animal and every object goes through here (the style control checks it).
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
QUADS = {
    # real sizes (m): body half-extents, leg length, head half-extents, snout, ears, horns, tail; coats seen in West Africa
    'chevre': {'corps': (0.27, 0.12, 0.13), 'patte': 0.33, 'tete': (0.075, 0.055, 0.06), 'museau': 0.07, 'oreilles': ('plates', 0.10, 0.035),
               'cornes': ('arriere', 0.13), 'barbe': True, 'queue': ('dressee', 0.07), 'cou': 0.17,
               'robes': [((236, 230, 218), None), ((112, 74, 46), (30, 24, 20)), ((52, 40, 34), (224, 216, 204))]},
    'chien': {'corps': (0.27, 0.10, 0.12), 'patte': 0.36, 'tete': (0.07, 0.055, 0.06), 'museau': 0.09, 'oreilles': ('dressees', 0.07, 0.04),
              'cornes': None, 'barbe': False, 'queue': ('recourbee', 0.20), 'cou': 0.14,
              'robes': [((198, 150, 92), None), ((174, 112, 58), None), ((40, 34, 30), (230, 222, 208))]},
    'chat': {'corps': (0.17, 0.065, 0.075), 'patte': 0.15, 'tete': (0.055, 0.05, 0.047), 'museau': 0.02, 'oreilles': ('dressees', 0.045, 0.035),
             'cornes': None, 'barbe': False, 'queue': ('longue', 0.26), 'cou': 0.05,
             'robes': [((214, 140, 62), None), ((120, 116, 110), None), ((38, 34, 32), (238, 232, 222))]},
    'vache': {'corps': (0.72, 0.27, 0.32), 'patte': 0.72, 'tete': (0.17, 0.10, 0.11), 'museau': 0.16, 'oreilles': ('plates', 0.16, 0.06),
              'cornes': ('lyre', 0.32), 'barbe': False, 'queue': ('pendante', 0.55), 'cou': 0.30, 'bosse': True,
              'robes': [((236, 232, 224), None), ((150, 98, 58), None), ((52, 42, 36), (238, 232, 222))]},
    'antilope': {'corps': (0.42, 0.14, 0.16), 'patte': 0.58, 'tete': (0.10, 0.055, 0.065), 'museau': 0.09, 'oreilles': ('dressees', 0.10, 0.045),
                 'cornes': ('lyre', 0.30), 'barbe': False, 'queue': ('dressee', 0.12), 'cou': 0.30,
                 'robes': [((190, 128, 70), (244, 236, 222))]},
}


def _atelier_extend():
    """Builders added to Atelier (kept apart for readability)."""

    def revolve(self, name, profile, mat, parent, loc=(0, 0, 0), seg=40, subsurf=1):
        """A lathe: `profile` = [(radius, z)] from bottom to top, turned around z (bottles, pots, plates, cakes)."""
        import bmesh
        bm = bmesh.new()
        rings = []
        for r, z in profile:
            ring = [bm.verts.new((loc[0] + max(r, 1e-4) * math.cos(2 * math.pi * k / seg), loc[1] + max(r, 1e-4) * math.sin(2 * math.pi * k / seg), loc[2] + z)) for k in range(seg)]
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for k in range(seg):
                bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
        if profile[0][0] > 1e-3:
            bm.faces.new(list(reversed(rings[0])))
        if profile[-1][0] > 1e-3:
            bm.faces.new(rings[-1])
        me = self.bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        return self._obj(name, me, mat, parent, subsurf=subsurf)

    def quadrupede(self, name, espece, parent=None, robe=None):
        """A four-legged animal with real proportions, facing +x, hooves / paws on the ground. Returns (root, body, head)
        (the animation lowers `head` to graze and turns it)."""
        q = QUADS[espece]
        c1, c2 = robe or self.rnd.choice(q['robes'])
        root = self.empty(name, parent)
        root['atelier'] = espece
        body = self.empty(f'{name}-corps', root)
        bx, by, bz = q['corps']
        L = q['patte']
        zc = L + bz * 0.55
        belly = (zc - bz * 0.55, zc - bz * 0.2)  # the belly line: below it the second colour (belly, legs)
        if c2 is not None and espece in ('vache', 'chat'):
            coat = self.matiere(c1, grain=0.04, var=0.07, scale=50, motif='taches')
        else:
            coat = self.matiere(c1, grain=0.04, var=0.07, scale=50, motif='poil', rgb2=c2, ref=root if c2 is not None else None, zr=belly if c2 is not None else None)
        n_ = 2.7  # a superellipsoid: a body with flanks and a back, not a balloon

        def trunk(x, y, z):
            k = (abs(x) ** n_ + abs(y) ** n_ + abs(z) ** n_) ** (1 / n_) or 1.0
            x, y, z = x / k, y / k, z / k
            return x, y * (1 - 0.12 * max(0.0, -x)), z - 0.12 * x * x * (1 if z < 0 else 0.3)
        self.ellipsoid(f'{name}-tronc', (0, 0, zc), (bx, by, bz), coat, body, seg=32, deform=trunk)
        if q.get('bosse'):  # the zebu's hump over the withers, its dewlap under the neck
            self.ellipsoid(f'{name}-bosse', (bx * 0.55, 0, zc + bz * 0.78), (bx * 0.16, by * 0.42, bz * 0.30), coat, body, seg=18)
            self.ellipsoid(f'{name}-fanon', (bx * 0.85, 0, zc - bz * 0.5), (bx * 0.14, by * 0.18, bz * 0.36), coat, body, seg=14)
        hoof = self.matiere((48, 40, 34), grain=0.05, var=0.05, gloss=0.2)
        for sx in (-1, 1):
            for sy in (-1, 1):
                x0 = sx * bx * 0.62
                top = (x0, sy * by * 0.55, zc - bz * 0.3)
                knee = (x0 + 0.02 * sx, sy * by * 0.55, L * 0.45)
                foot = (x0, sy * by * 0.55, 0.012)
                r0 = max(0.012, bx * 0.09)
                # Thigh into the body, a rounded joint, the cannon down to the hoof (one continuous limb).
                self.tube(f'{name}-cuisse', (top[0], top[1], top[2] + bz * 0.25), knee, r0 * 1.7, r0 * 0.95, coat, body, seg=16)
                self.ellipsoid(f'{name}-genou', knee, (r0 * 1.0, r0 * 1.0, r0 * 1.1), coat, body, seg=12, subsurf=0)
                self.tube(f'{name}-patte', knee, foot, r0 * 0.95, r0 * 0.78, coat, body, seg=16)
                self.ellipsoid(f'{name}-sabot', (foot[0] + 0.01, foot[1], 0.012), (r0 * 1.1, r0 * 0.95, 0.012), hoof if espece not in ('chien', 'chat') else coat, body, seg=12)
        # Neck and head.
        neck0 = (bx * 0.85, 0, zc + bz * 0.35)
        neck1 = (bx * 0.85 + q['cou'] * 0.55, 0, zc + bz * 0.35 + q['cou'] * 0.85)
        self.tube(f'{name}-cou', neck0, neck1, by * 0.6, by * 0.45, coat, body, seg=18)
        head = self.empty(f'{name}-tete', body, neck1)
        hx, hy, hz = q['tete']
        self.ellipsoid(f'{name}-crane', (hx * 0.4, 0, 0), (hx, hy, hz), coat, head, seg=22)
        sn = q['museau']
        if sn > 0.03:
            self.ellipsoid(f'{name}-museau', (hx * 0.9 + sn * 0.45, 0, -hz * 0.35), (sn * 0.6, hy * 0.62, hz * 0.55), coat, head, seg=18)
        nose = self.matiere((36, 28, 26), gloss=0.5, grain=0.03, var=0.03)
        self.ellipsoid(f'{name}-truffe', (hx * 0.9 + sn * 1.0, 0, -hz * 0.3), (0.012 + sn * 0.08, hy * 0.35, hz * 0.22), nose, head, seg=12)
        iris = {'chevre': (196, 150, 60), 'chat': (150, 180, 60), 'chien': (110, 70, 34)}.get(espece, (80, 52, 30))
        for s in (-1, 1):
            self.eye(f'{name}-oeil', (hx * 0.72, s * hy * 0.74, hz * 0.28), hz * 0.30, head, iris=iris, side=s, look=(0.6, 0.0, 0.0))
            kind, el, ew = q['oreilles']
            d = (-0.2, s * 1.0, 0.15) if kind == 'plates' else (-0.15, s * 0.35, 1.0)
            self.leaf(f'{name}-oreille', (hx * 0.1, s * hy * 0.7, hz * 0.6), d, el, ew, coat, head, curl=0.1)
        if q.get('cornes'):
            hk, hl = q['cornes']
            horn = self.matiere((92, 82, 70), grain=0.08, var=0.06, motif='ecailles')
            for s in (-1, 1):
                d = (-0.75, s * 0.25, 0.6) if hk == 'arriere' else (-0.2, s * 0.55, 0.8)
                self.leaf(f'{name}-corne', (hx * 0.25, s * hy * 0.35, hz * 0.85), d, hl, hl * 0.18, horn, head, curl=0.35 if hk == 'arriere' else 0.15)
        if q.get('barbe'):
            self.leaf(f'{name}-barbiche', (hx * 0.9 + sn * 0.7, 0, -hz * 0.8), (0.1, 0, -1.0), 0.05, 0.025, self.matiere(c1, grain=0.04, motif='poil'), head, curl=0.1)
        tk, tl = q['queue']
        td = {'dressee': (-0.5, 0, 0.85), 'recourbee': (-0.2, 0, 1.0), 'longue': (-0.85, 0, 0.5), 'pendante': (-0.15, 0, -1.0)}[tk]
        self.leaf(f'{name}-queue', (-bx * 0.95, 0, zc + bz * 0.4), td, tl, max(0.012, tl * 0.14), coat, body,
                  curl=0.6 if tk == 'recourbee' else (0.3 if tk == 'longue' else 0.05))
        root['hauteur'] = round(zc + bz + q['cou'] * 0.85 + hz, 3)
        return root, body, head

    def oiseau_vol(self, name, parent=None, rgb=None):
        """A small flying bird (weaver, swallow): body, head, beak, two wings on their own pivots (they flap)."""
        rgb = rgb or self.rnd.choice([(232, 196, 40), (40, 42, 52), (150, 110, 70)])
        root = self.empty(name, parent)
        root['atelier'] = 'oiseau'
        m = self.matiere(rgb, grain=0.03, var=0.06, motif='plumes')
        self.ellipsoid(f'{name}-corps', (0, 0, 0), (0.055, 0.022, 0.024), m, root, seg=16)
        self.ellipsoid(f'{name}-tete', (0.05, 0, 0.012), (0.018, 0.016, 0.016), m, root, seg=12)
        self.leaf(f'{name}-bec', (0.066, 0, 0.01), (1, 0, -0.1), 0.014, 0.008, self.matiere((60, 50, 40), grain=0.02), root, curl=0)
        self.leaf(f'{name}-queue', (-0.05, 0, 0.004), (-1, 0, 0.1), 0.05, 0.03, m, root, curl=0)
        wl = self.empty(f'{name}-aile-g', root, (0.005, 0.012, 0.012))
        wr = self.empty(f'{name}-aile-d', root, (0.005, -0.012, 0.012))
        self.leaf(f'{name}-ag', (0, 0, 0), (-0.25, 1, 0.05), 0.12, 0.05, m, wl, curl=0.05)
        self.leaf(f'{name}-ad', (0, 0, 0), (-0.25, -1, 0.05), 0.12, 0.05, m, wr, curl=0.05)
        return root, wl, wr

    def canard(self, name, parent=None):
        """A Muscovy duck (the duck of West African yards): black and white, red caruncles, flat bill, webbed feet."""
        root = self.empty(name, parent)
        root['atelier'] = 'canard'
        body = self.empty(f'{name}-corps', root)
        pl = self.matiere((30, 32, 34), grain=0.03, var=0.08, motif='plumes', rgb2=(236, 232, 224))
        self.ellipsoid(f'{name}-tronc', (0, 0, 0.17), (0.20, 0.12, 0.10), pl, body, seg=26, deform=lambda x, y, z: (x, y, z + 0.12 * max(0.0, -x) ** 2))
        self.ellipsoid(f'{name}-cou', (0.15, 0, 0.27), (0.045, 0.042, 0.075), self.matiere((236, 232, 224), grain=0.03, motif='plumes'), body, seg=16)
        head = self.empty(f'{name}-tete', body, (0.17, 0, 0.34))
        self.ellipsoid(f'{name}-crane', (0, 0, 0), (0.05, 0.038, 0.04), self.matiere((236, 232, 224), grain=0.03, motif='plumes'), head, seg=16)
        self.ellipsoid(f'{name}-caroncule', (0.03, 0, 0.0), (0.03, 0.04, 0.025), self.matiere((200, 46, 40), grain=0.08), head, seg=12)
        self.ellipsoid(f'{name}-bec', (0.075, 0, -0.012), (0.035, 0.018, 0.008), self.matiere((214, 170, 120), gloss=0.2), head, seg=12)
        for s in (-1, 1):
            self.eye(f'{name}-oeil', (0.022, s * 0.034, 0.012), 0.009, head, iris=(150, 110, 40), side=s)
            foot = self.matiere((214, 140, 60), grain=0.04, motif='ecailles')
            self.tube(f'{name}-patte', (0.01, s * 0.05, 0.08), (0.02, s * 0.05, 0.01), 0.009, 0.008, foot, root)
            self.leaf(f'{name}-palme', (0.02, s * 0.05, 0.004), (1, 0, 0), 0.05, 0.045, foot, root, curl=0)
        return root, body, head

    def pigeon(self, name, parent=None):
        root = self.empty(name, parent)
        root['atelier'] = 'pigeon'
        body = self.empty(f'{name}-corps', root)
        g = self.matiere((128, 134, 146), grain=0.03, var=0.07, motif='plumes')
        self.ellipsoid(f'{name}-tronc', (0, 0, 0.1), (0.11, 0.06, 0.06), g, body, seg=22, deform=lambda x, y, z: (x, y, z + 0.1 * max(0.0, -x) ** 2))
        self.ellipsoid(f'{name}-cou', (0.07, 0, 0.15), (0.035, 0.032, 0.04), self.matiere((96, 120, 110), gloss=0.4, grain=0.03, rgb2=(120, 90, 140)), body, seg=14)
        head = self.empty(f'{name}-tete', body, (0.09, 0, 0.19))
        self.ellipsoid(f'{name}-crane', (0, 0, 0), (0.025, 0.022, 0.022), g, head, seg=14)
        self.leaf(f'{name}-bec', (0.024, 0, -0.003), (1, 0, -0.2), 0.016, 0.008, self.matiere((60, 56, 54)), head, curl=0)
        self.leaf(f'{name}-queue', (-0.1, 0, 0.11), (-1, 0, 0.15), 0.065, 0.06, self.matiere((70, 74, 82), motif='plumes'), body, curl=0)
        for s in (-1, 1):
            self.eye(f'{name}-oeil', (0.012, s * 0.016, 0.006), 0.007, head, iris=(230, 120, 40), side=s)
        red = self.matiere((206, 70, 70), grain=0.04, motif='ecailles')
        for s in (-1, 1):
            self.tube(f'{name}-patte', (0.0, s * 0.025, 0.05), (0.005, s * 0.025, 0.006), 0.005, 0.004, red, root, seg=6)
        return root, body, head

    def margouillat(self, name, parent=None):
        """The agama lizard of the walls: blue-grey body, orange head, long ringed tail, splayed legs."""
        root = self.empty(name, parent)
        root['atelier'] = 'margouillat'
        body = self.empty(f'{name}-corps', root)
        blue = self.matiere((58, 76, 112), grain=0.06, var=0.08, motif='ecailles')
        self.ellipsoid(f'{name}-tronc', (0, 0, 0), (0.08, 0.026, 0.02), blue, body, seg=18)
        self.ellipsoid(f'{name}-tete', (0.085, 0, 0.004), (0.034, 0.022, 0.017), self.matiere((236, 120, 34), grain=0.05, motif='ecailles'), body, seg=16)
        self.leaf(f'{name}-queue', (-0.075, 0, 0), (-1, 0, 0), 0.17, 0.03, blue, body, curl=0.05)
        for sx in (-1, 1):
            for sy in (-1, 1):
                self.tube(f'{name}-patte', (sx * 0.045, sy * 0.02, 0), (sx * 0.06, sy * 0.06, -0.008), 0.006, 0.004, blue, body, seg=6)
        return root, body, None

    def singe(self, name, parent=None):
        """A vervet monkey, sitting: olive-grey fur, black face and hands, white brow band, long tail."""
        root = self.empty(name, parent)
        root['atelier'] = 'singe'
        body = self.empty(f'{name}-corps', root)
        fur = self.matiere((132, 128, 104), grain=0.04, var=0.08, motif='poil', rgb2=(214, 206, 186))
        black = self.matiere((36, 32, 30), grain=0.04, var=0.05)
        self.ellipsoid(f'{name}-tronc', (0, 0, 0.26), (0.11, 0.10, 0.17), fur, body, seg=22)
        for s in (-1, 1):
            self.ellipsoid(f'{name}-cuisse', (0.06, s * 0.07, 0.09), (0.09, 0.045, 0.06), fur, body, seg=14)
            self.tube(f'{name}-bras', (0.04, s * 0.09, 0.36), (0.12, s * 0.07, 0.12), 0.025, 0.02, fur, body)
            self.ellipsoid(f'{name}-main', (0.13, s * 0.07, 0.1), (0.02, 0.015, 0.02), black, body, seg=10)
        head = self.empty(f'{name}-tete', body, (0.03, 0, 0.49))
        self.ellipsoid(f'{name}-crane', (0, 0, 0), (0.07, 0.065, 0.065), fur, head, seg=18)
        self.ellipsoid(f'{name}-visage', (0.05, 0, -0.01), (0.03, 0.045, 0.045), black, head, seg=14)
        self.ellipsoid(f'{name}-museau', (0.072, 0, -0.03), (0.022, 0.03, 0.02), self.matiere((70, 56, 50), grain=0.03), head, seg=12)
        for s in (-1, 1):
            self.eye(f'{name}-oeil', (0.07, s * 0.018, 0.006), 0.011, head, iris=(150, 96, 40), side=s)
        self.ellipsoid(f'{name}-sourcil', (0.05, 0, 0.032), (0.02, 0.05, 0.01), self.matiere((236, 232, 222)), head, seg=12)
        self.leaf(f'{name}-queue', (-0.1, 0, 0.12), (-0.9, 0, -0.2), 0.5, 0.03, fur, body, curl=0.3)
        return root, body, head

    def papillon(self, name, parent=None, glow=False):
        root = self.empty(name, parent)
        root['atelier'] = 'luciole' if glow else 'papillon'
        if glow:
            m = self.matiere((255, 246, 150), grain=0.0, var=0.0, gloss=1.0)
            self.ellipsoid(f'{name}-lueur', (0, 0, 0), (0.012, 0.012, 0.012), m, root, seg=10, subsurf=0)
            return root, None, None
        c = self.rnd.choice([(250, 160, 40), (60, 150, 240), (240, 80, 150), (250, 236, 110)])
        wing = self.matiere(c, grain=0.04, var=0.12, motif='taches', scale=300)
        self.ellipsoid(f'{name}-corps', (0, 0, 0), (0.022, 0.005, 0.005), self.matiere((40, 30, 30)), root, seg=10)
        wl = self.empty(f'{name}-aile-g', root)
        wr = self.empty(f'{name}-aile-d', root)
        for w, s in ((wl, 1), (wr, -1)):
            self.leaf(f'{name}-ailea', (0.004, 0, 0), (0.35, s, 0.05), 0.045, 0.04, wing, w, curl=0)
            self.leaf(f'{name}-ailep', (-0.004, 0, 0), (-0.45, s, 0.0), 0.035, 0.03, wing, w, curl=0)
        return root, wl, wr

    # ── objets ──
    def assiette(self, name, parent=None, plat='poulet'):
        """An enamel plate (white, blue rim) with roasted chicken legs (or attiéké and fish)."""
        root = self.empty(name, parent)
        root['atelier'] = 'assiette'
        self.revolve(f'{name}-assiette', [(0.0, 0.0), (0.09, 0.002), (0.12, 0.012), (0.135, 0.022), (0.13, 0.024), (0.11, 0.014), (0.0, 0.008)],
                     self.matiere((244, 242, 236), gloss=0.5, grain=0.02, var=0.03, rgb2=(70, 110, 190)), root)
        if plat == 'poulet':
            meat = self.matiere((176, 98, 40), gloss=0.45, grain=0.06, var=0.10)
            bone = self.matiere((236, 226, 204), grain=0.03)
            for dx, dy, a in ((-0.03, 0.02, 0.0), (0.04, -0.02, 2.2), (0.0, 0.05, 4.0)):
                c = (dx, dy, 0.035)
                d = (math.cos(a), math.sin(a), 0.0)
                self.ellipsoid(f'{name}-pilon', c, (0.045, 0.03, 0.026), meat, root, seg=16,
                               deform=lambda x, y, z: (x, y * (1 - 0.35 * max(0.0, x)), z * (1 - 0.35 * max(0.0, x))))
                self.tube(f'{name}-os', (c[0] + 0.03 * d[0], c[1] + 0.03 * d[1], 0.033), (c[0] + 0.07 * d[0], c[1] + 0.07 * d[1], 0.03), 0.008, 0.009, bone, root, seg=8)
        else:
            self.ellipsoid(f'{name}-attieke', (0, 0, 0.03), (0.09, 0.09, 0.03), self.matiere((240, 232, 200), grain=0.12, var=0.05, scale=300), root, seg=20)
            self.ellipsoid(f'{name}-poisson', (0.03, 0.02, 0.05), (0.06, 0.022, 0.018), self.matiere((196, 120, 60), gloss=0.4, grain=0.06, motif='ecailles'), root, seg=16)
        return root

    def ballon(self, name, parent=None):
        root = self.empty(name, parent)
        root['atelier'] = 'ballon'
        self.ellipsoid(f'{name}-cuir', (0, 0, 0.11), (0.11, 0.11, 0.11), self.matiere((242, 240, 234), gloss=0.35, grain=0.02, var=0.02, motif='taches', scale=220), root, seg=32)
        return root

    def orange(self, name, parent=None):
        root = self.empty(name, parent)
        root['atelier'] = 'orange'
        self.ellipsoid(f'{name}-peau', (0, 0, 0.038), (0.04, 0.04, 0.037), self.matiere((246, 146, 24), gloss=0.35, grain=0.10, var=0.06, scale=500), root, seg=24)
        self.leaf(f'{name}-feuille', (0, 0, 0.074), (0.8, 0.2, 0.3), 0.04, 0.018, self.matiere((60, 120, 44), grain=0.06), root, curl=0.2)
        return root

    def bouteilles(self, name, parent=None, n=2):
        root = self.empty(name, parent)
        root['atelier'] = 'bouteilles'
        glass = self.matiere((44, 112, 62), gloss=0.9, grain=0.02, var=0.06)
        label = self.matiere((236, 196, 70), grain=0.05, var=0.05)
        for k in range(n):
            x = (k - (n - 1) / 2) * 0.075
            prof = [(0.0, 0.0), (0.03, 0.002), (0.032, 0.02), (0.032, 0.16), (0.026, 0.19), (0.012, 0.225), (0.011, 0.27), (0.013, 0.275), (0.0, 0.278)]
            self.revolve(f'{name}-verre{k}', prof, glass, root, loc=(x, 0, 0), seg=28)
            self.revolve(f'{name}-etiquette{k}', [(0.0331, 0.06), (0.0331, 0.12)], label, root, loc=(x, 0, 0), seg=28, subsurf=0)
            self.revolve(f'{name}-capsule{k}', [(0.0, 0.274), (0.0145, 0.274), (0.0145, 0.284), (0.0, 0.286)], self.matiere((200, 40, 36), gloss=0.5), root, loc=(x, 0, 0), seg=16, subsurf=0)
        return root

    def valise(self, name, parent=None):
        root = self.empty(name, parent)
        root['atelier'] = 'valise'
        shell = self.matiere((178, 42, 50), gloss=0.35, grain=0.03, var=0.05)
        self.box(f'{name}-coque', (0, 0, 0.29), (0.40, 0.20, 0.52), shell, root, bevel=0.035)
        dark = self.matiere((40, 36, 36), grain=0.03)
        self.box(f'{name}-fermeture', (0, 0, 0.29), (0.405, 0.012, 0.525), dark, root, bevel=0.004)
        self.tube(f'{name}-poignee', (-0.06, 0, 0.56), (0.06, 0, 0.56), 0.012, 0.012, dark, root)
        for sx in (-1, 1):
            self.ellipsoid(f'{name}-roue', (sx * 0.15, 0.06, 0.025), (0.025, 0.012, 0.025), dark, root, seg=12)
        return root

    def billets(self, name, parent=None):
        root = self.empty(name, parent)
        root['atelier'] = 'billets'
        for j, c in enumerate([(132, 178, 132), (126, 156, 196), (214, 186, 130)]):
            self.box(f'{name}-liasse{j}', (0.01 * j, 0.004 * j, 0.004 + 0.009 * j), (0.15, 0.075, 0.008), self.matiere(c, grain=0.12, var=0.05, scale=600), root, bevel=0.001)
        self.box(f'{name}-bande', (0.02, 0.008, 0.016), (0.03, 0.078, 0.03), self.matiere((236, 230, 214)), root, bevel=0.001)
        return root

    def gateau(self, name, parent=None):
        root = self.empty(name, parent)
        root['atelier'] = 'gateau'
        cream = self.matiere((250, 238, 240), gloss=0.3, grain=0.04, var=0.04)
        pink = self.matiere((240, 152, 182), gloss=0.3, grain=0.04, var=0.05)
        self.revolve(f'{name}-etage1', [(0.0, 0.0), (0.14, 0.0), (0.142, 0.11), (0.13, 0.12), (0.0, 0.12)], cream, root)
        self.revolve(f'{name}-etage2', [(0.0, 0.12), (0.1, 0.12), (0.102, 0.19), (0.092, 0.198), (0.0, 0.198)], pink, root)
        for k in range(14):  # cream drips along the rim
            a = 2 * math.pi * k / 14
            self.ellipsoid(f'{name}-coulure', (0.142 * math.cos(a), 0.142 * math.sin(a), 0.105), (0.012, 0.012, 0.022), cream, root, seg=10)
        flame = self.matiere((255, 210, 80), grain=0.0, var=0.0, gloss=1.0)
        for j in range(3):
            x = -0.04 + 0.04 * j
            self.tube(f'{name}-bougie', (x, 0, 0.198), (x, 0, 0.255), 0.006, 0.006, self.matiere((80, 160, 230), grain=0.03), root, seg=8)
            self.ellipsoid(f'{name}-flamme', (x, 0, 0.268), (0.006, 0.006, 0.013), flame, root, seg=10, subsurf=0)
        return root

    def papiers(self, name, parent=None):
        root = self.empty(name, parent)
        root['atelier'] = 'papiers'
        for j in range(4):
            ob = self.box(f'{name}-feuille{j}', (0.006 * j, 0.004 * j, 0.002 + 0.0022 * j), (0.21, 0.297, 0.0015), self.matiere((246, 244, 238), grain=0.10, var=0.02, scale=900), root, bevel=0.0)
            ob.rotation_euler = (0, 0, math.radians(-4 + 3 * j))
        return root

    def marmite(self, name, parent=None):
        root = self.empty(name, parent)
        root['atelier'] = 'marmite'
        alu = self.matiere((176, 176, 172), gloss=0.6, grain=0.05, var=0.08, rgb2=(70, 66, 62))
        self.revolve(f'{name}-cuve', [(0.0, 0.0), (0.14, 0.0), (0.165, 0.04), (0.17, 0.20), (0.175, 0.215), (0.163, 0.22), (0.16, 0.05), (0.0, 0.015)], alu, root)
        self.revolve(f'{name}-couvercle', [(0.0, 0.25), (0.17, 0.222), (0.168, 0.218), (0.0, 0.245)], alu, root)
        self.ellipsoid(f'{name}-bouton', (0, 0, 0.258), (0.022, 0.022, 0.014), self.matiere((40, 38, 36), gloss=0.3), root, seg=12)
        for s in (-1, 1):
            self.tube(f'{name}-anse', (s * 0.17, 0, 0.18), (s * 0.215, 0, 0.185), 0.012, 0.012, alu, root)
        return root

    def etal_au_sol(self, name, parent=None, width=0.26, n=None):
        """The vendor's display on the ground: a jute sack laid flat (it follows the floor) with pyramid heaps of
        tomatoes in a row — what fits in `width` metres."""
        root = self.empty(name, parent)
        root['atelier'] = 'etal-au-sol'
        r = 0.034
        n = n or max(1, int((width - 0.04) // (4.4 * r)))
        w = max(4.4 * r * n + 0.04, 0.12)
        jute = self.matiere((176, 146, 98), grain=0.14, var=0.06, scale=700)
        sack = self.box(f'{name}-sac', (0, 0, 0.004), (w, 0.20, 0.008), jute, root, bevel=0.003)
        sack['atelier'] = True
        for k in range(n):
            x = -w / 2 + 0.02 + 2.2 * r + k * 4.4 * r
            self.pyramide(f'{name}-tas{k}', (x, 0.0, 0.008), root, r=r)
        root['emprise'] = (w, 0.20)
        return root

    for f in (etal_au_sol, revolve, quadrupede, oiseau_vol, canard, pigeon, margouillat, singe, papillon, assiette, ballon, orange, bouteilles, valise,
              billets, gateau, papiers, marmite):
        setattr(Atelier, f.__name__, f)


_atelier_extend()
