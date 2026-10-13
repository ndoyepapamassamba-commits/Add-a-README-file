"""
CONFORMITÉ 3D — la preuve que la génération a atteint ses objectifs de qualité DÈS LA PREMIÈRE EXÉCUTION.

Ce module n'est pas un correcteur : le moteur génère juste du premier coup (règles de génération, placement contraint,
coque scellée, tailles réelles…), et ce rapport le DÉMONTRE en mesurant dix dimensions sur la scène réelle :

  taux d'atteinte des objectifs · qualité obtenue · réalisme · cohérence des personnages · cohérence des
  environnements · cohérence narrative · fluidité des animations · stabilité technique · performances · immersion

Chaque dimension a un objectif chiffré ; le rapport dit lesquels sont atteints, et si la scène est « conforme dès la
génération » (aucune correction, aucun défaut critique). Les constats techniques (géométrie, matériaux, objets cachés,
collisions, échelle, temps réel, éclairage, rigs, récit) sont les PREUVES de ces mesures.

Les corrections automatiques restent possibles pour la sécurité (une scène défectueuse n'est jamais rendue), mais elles
sont EXCEPTIONNELLES et tracées pour l'audit. Chaque défaut rencontré passe par l'analyse de cause racine (rules.py) :
la règle de génération responsable est durcie, pour que le même défaut ne réapparaisse pas.

Usage autonome : python3 preflight.py --blend scene.blend [--story story.json] [--life life.json] --out rapport
"""
import html
import json
import re
import statistics
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SEV_COST = {'critique': 25, 'majeur': 8, 'mineur': 2, 'info': 0}
CATEGORIES = [
    ('geometrie', 'Géométrie'), ('materiaux', 'Matériaux et textures'), ('objets', 'Objets'), ('collisions', 'Collisions'),
    ('echelle', 'Échelle'), ('temps_reel', 'Performances temps réel'), ('eclairage', 'Éclairage'),
    ('rigs', 'Rigs, armatures, animations'), ('narratif', 'Cohérence narrative'),
]
# Real-time budgets (orders of magnitude used by game pipelines for one scene on screen).
BUDGETS = {
    'pc': {'triangles': 2_000_000, 'objets': 1500, 'materiaux': 200, 'lumieres': 16, 'textures_mo': 1024},
    'mobile': {'triangles': 300_000, 'objets': 300, 'materiaux': 48, 'lumieres': 4, 'textures_mo': 256},
}
# Plausible sizes of furniture by name token (metres): (axis or 'top', min, max). 'top' = height of the top surface.
SIZE_RULES = [
    (('woodbed', 'metalbed'), 'xy', 1.6, 2.4),
    (('woodward',), 'z', 1.6, 2.4),
    (('chairseat',), 'top', 0.38, 0.52),
    (('woodtable',), 'top', 0.35, 0.8),
    (('wooddesk',), 'top', 0.68, 0.8),
    (('woodnight',), 'top', 0.4, 0.75),
    (('fabricsofa',), 'top', 0.38, 0.55),
    (('plasterceiling',), 'bottom', 2.3, 5.0),
]
GROUNDED = ('woodbed', 'metalbed', 'woodward', 'woodnight', 'woodtable', 'wooddesk', 'fabricsofa', 'woodshelf', 'metalcabinet',
            'potterra', 'metalfanbase', 'chairleg', 'woodleg', 'metalleg', 'woodtleg', 'woodtv')
# Assemblies declared by the generator (asm-<name>) that stand on the floor: checked as ONE object (a bed on its legs).
GROUNDED_ASM = ('lit', 'armoire', 'tablenuit', 'table', 'canape', 'etagere', 'chaise', 'ventilateur', 'plante', 'tv', 'classeur', 'bureau', 'banc', 'perfusion')
SHELL = ('plaster', 'planks', 'floor', 'ground', 'sky', 'back', 'wall', 'ceiling', 'road', 'sidewalk', 'path', 'decor')
# Behaviours of animals that need an object of the set.
NEEDS = [('lit', ('lit',), ('woodbed', 'metalbed')), ('arbre', ('arbre', 'manguier'), ('trunk', 'woodmango', 'palm')),
         ('table', ('table',), ('woodtable', 'wooddesk', 'table')), ('chaise', ('chaise',), ('chair',))]


DIMENSIONS = [
    ('qualite', 'Qualité obtenue', 85), ('realisme', 'Réalisme', 80), ('personnages', 'Cohérence des personnages', 100),
    ('environnement', 'Cohérence des environnements', 90), ('recit', 'Cohérence narrative', 95), ('fluidite', 'Fluidité des animations', 95),
    ('stabilite', 'Stabilité technique', 95), ('performances', 'Performances globales', 90), ('immersion', 'Immersion', 70),
]
# Objects of a place (world.json ids) and the names the set builder gives them: the place must hold what it promises.
OBJ_TOKENS = {
    'lit': ('woodbed', 'metalbed'), 'armoire': ('woodward',), 'telephone': ('phone',), 'table': ('woodtable', 'wooddesk', 'table'),
    'chaise': ('chair', 'fabricchair'), 'tele': ('tv', 'screentv'), 'ordinateur': ('mon', 'screen'), 'tableau': ('board',),
    'perfusion': ('metalivpole',), 'papiers': ('paper',), 'vitrine': ('glassfront', 'glowshop'), 'caddie': ('cart',),
    'banc': ('bench',), 'ballon': ('ball',), 'valise': ('case', 'fabricsuitcase'), 'tapis': ('case',), 'marteau': ('sign',),
}


class Report:
    def __init__(self, kind, subject):
        self.kind, self.subject = kind, subject
        self.issues, self.fixes, self.stats = [], [], {}
        self.m = {}
        self.t0 = time.time()

    def tally(self, key, ok, n=1):
        """One measured test of a dimension (ok or not)."""
        v = self.m.setdefault(key, [0, 0])
        v[0] += n if ok else 0
        v[1] += n

    def add(self, cat, sev, msg, objet=None, valeur=None):
        self.issues.append({'categorie': cat, 'severite': sev, 'message': msg, **({'objet': objet} if objet else {}), **({'valeur': valeur} if valeur is not None else {})})

    def fix(self, msg):
        self.fixes.append(msg)

    def ratio(self, key):
        v = self.m.get(key)
        return None if not v or not v[1] else 100.0 * v[0] / v[1]

    def dimensions(self):
        """The ten measured dimensions (0–100, None when they do not apply to this kind of generation)."""
        sev = lambda cats, s_: sum(1 for i in self.issues if i['categorie'] in cats and i['severite'] == s_)
        tech = ('geometrie', 'materiaux', 'objets', 'rigs', 'collisions')
        stab = max(0.0, 100.0 - 25 * sev(tech, 'critique') - 8 * sev(tech, 'majeur') - 1 * sev(tech, 'mineur'))
        d = {
            'stabilite': stab,
            'personnages': self.ratio('personnages'),
            'environnement': self.ratio('environnement'),
            'recit': self.ratio('recit'),
            'fluidite': self.ratio('fluidite'),
            'performances': self.m.get('_perf'),
            'immersion': self.m.get('_immersion'),
        }
        real = [x for x in (self.ratio('tailles'), self.ratio('pose_au_sol'), self.ratio('materiaux_riches'), self.ratio('exposition'), self.ratio('lumiere_concue')) if x is not None]
        d['realisme'] = sum(real) / len(real) if real else None
        vals = [v for v in d.values() if v is not None]
        q = sum(vals) / len(vals) if vals else 0.0
        q -= 10 * sum(1 for i in self.issues if i['severite'] == 'critique')
        d['qualite'] = max(0.0, q)
        return {k: (None if v is None else round(v, 1)) for k, v in d.items()}

    def result(self, causes=None):
        dims = self.dimensions()
        crit = [i for i in self.issues if i['severite'] == 'critique']
        first_pass = not self.fixes and not crit and not any(i['severite'] == 'majeur' for i in self.issues)
        objectives = [{'objectif': 'Conforme dès la génération (aucune correction, aucun défaut majeur)', 'cible': 'oui',
                       'mesure': 'oui' if first_pass else 'non', 'atteint': first_pass}]
        for key, label, target in DIMENSIONS:
            v = dims.get(key)
            if v is None:
                continue
            objectives.append({'objectif': label, 'cible': f'≥ {target}', 'mesure': v, 'atteint': v >= target})
        met = sum(1 for o in objectives if o['atteint'])
        rate = round(100.0 * met / len(objectives), 1)
        verdict = 'bloqué' if crit else ('excellence' if met == len(objectives) else ('objectifs atteints' if rate >= 80 else 'objectifs partiellement atteints'))
        per = {}
        for c, _ in CATEGORIES:
            its = [i for i in self.issues if i['categorie'] == c]
            per[c] = {'ok': not any(i['severite'] in ('critique', 'majeur') for i in its), 'n': len(its)}
        return {'kind': self.kind, 'subject': self.subject, 'taux_objectifs': rate, 'objectifs': objectives, 'dimensions': dims,
                'conforme_des_la_generation': first_pass, 'score': round(dims['qualite']), 'verdict': verdict, 'passed': not crit,
                'categories': per, 'issues': self.issues, 'corrections': self.fixes, 'fixes': self.fixes,
                'causes_racines': causes or [], 'mesures': {k: v for k, v in self.m.items() if not k.startswith('_')},
                'stats': self.stats, 'duration_s': round(time.time() - self.t0, 2)}


def _is_shell(ob):
    return bool(ob.get('shell')) or ob.name.lower().startswith(SHELL)


def _tok(ob, toks):
    n = ob.name.lower()
    return any(n.startswith(t) for t in toks)


def _base(name):
    """The base name of a generated piece (« woodbed.001 » → « woodbed »): rules match it exactly, never by prefix."""
    return re.sub(r'\.\d+$', '', name.lower())


def _union_bbox(obs):
    los, his = zip(*[_world_bbox(o) for o in obs])
    return [min(l[i] for l in los) for i in range(3)], [max(h[i] for h in his) for i in range(3)]


def _inside(point, tree):
    """Is the point inside the closed surface of `tree`? (parity of the crossings of a ray going up)"""
    from mathutils import Vector
    o, d, n = Vector(point), Vector((0.0001, 0.0002, 1.0)).normalized(), 0
    for _ in range(64):
        loc, _nrm, _i, _dist = tree.ray_cast(o, d, 1000.0)
        if loc is None:
            break
        n += 1
        o = loc + d * 1e-4
    return n % 2 == 1


def _world_bbox(ob):
    from mathutils import Vector
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    return lo, hi


def _animated(ob, path):
    ad = ob.animation_data
    return bool(ad and ad.action and any(fc.data_path == path for fc in _fcurves(ad.action)))


def _fcurves(action):
    """F-curves of an action (Blender ≤ 4.3 `action.fcurves`, 4.4+ layered actions: layers → strips → channelbags)."""
    out = list(getattr(action, 'fcurves', []) or [])
    for layer in getattr(action, 'layers', []) or []:
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []) or []:
                out.extend(bag.fcurves)
    return out


# ---------------------------------------------------------------------------------------------------------------------
def check_geometry(R, objs, autofix=True):
    import bmesh
    for ob in objs:
        if ob.type != 'MESH':
            continue
        me = ob.data
        if len(me.vertices) == 0:
            R.add('objets', 'mineur', 'maillage vide', ob.name)
            continue
        co = [c for v in me.vertices for c in v.co]
        if any(not math.isfinite(c) for c in co):
            R.add('geometrie', 'critique', 'coordonnées invalides (NaN / infini)', ob.name)
            continue
        # Rigged / shape-keyed meshes are only checked, never rewritten (their deformation data must stay intact).
        fixable = autofix and me.shape_keys is None and not any(m.type == 'ARMATURE' for m in ob.modifiers)
        bm = bmesh.new()
        bm.from_mesh(me)
        zero = sum(1 for f in bm.faces if f.calc_area() < 1e-12)
        loose = [v for v in bm.verts if not v.link_edges]
        multi = sum(1 for e in bm.edges if len(e.link_faces) > 2)
        if zero:
            R.add('geometrie', 'mineur', f'{zero} face(s) d’aire nulle', ob.name, zero)
        if multi:
            R.add('geometrie', 'majeur', f'{multi} arête(s) partagée(s) par plus de deux faces (non-manifold)', ob.name, multi)
        if loose:
            if fixable:
                bmesh.ops.delete(bm, geom=loose, context='VERTS')
                bm.to_mesh(me)
                R.fix(f'{ob.name} : {len(loose)} sommet(s) isolé(s) retiré(s)')
            else:
                R.add('geometrie', 'mineur', f'{len(loose)} sommet(s) isolé(s)', ob.name, len(loose))
        # Closed solids: the normals must point outwards (signed volume > 0).
        closed = len(bm.faces) >= 4 and all(len(e.link_faces) == 2 for e in bm.edges)
        if closed:
            vol = bm.calc_volume(signed=True)
            if vol < -1e-9:
                if fixable:
                    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
                    bm.to_mesh(me)
                    R.fix(f'{ob.name} : normales retournées vers l’extérieur')
                else:
                    R.add('geometrie', 'majeur', 'normales tournées vers l’intérieur', ob.name)
        bm.free()


def check_materials(R, objs, autofix=True):
    import bpy
    fallback = None
    for ob in objs:
        if ob.type not in ('MESH', 'CURVE', 'FONT', 'SURFACE'):
            continue
        slots = ob.material_slots
        if ob.type == 'MESH' and len(ob.data.polygons) and not any(s.material for s in slots):
            if autofix:
                if fallback is None:
                    fallback = bpy.data.materials.new('preflight-fallback')
                    fallback.diffuse_color = (0.6, 0.6, 0.6, 1)
                ob.data.materials.append(fallback)
                R.add('materiaux', 'mineur', 'aucun matériau : matériau neutre assigné', ob.name)
            else:
                R.add('materiaux', 'majeur', 'aucun matériau', ob.name)
        empty = [i for i, s in enumerate(slots) if s.material is None]
        if empty and any(s.material for s in slots):
            R.add('materiaux', 'mineur', f'{len(empty)} slot(s) de matériau vide(s)', ob.name)
    seen = set()
    for m in bpy.data.materials:
        if m.users == 0 or not m.node_tree or m.name in seen:
            continue
        seen.add(m.name)
        nt = m.node_tree
        # Realism: a material is « rich » when it is more than a flat colour (texture, procedural variation, light).
        kinds = {n.type for n in nt.nodes}
        R.tally('materiaux_riches', bool(kinds & {'TEX_IMAGE', 'TEX_NOISE', 'TEX_WAVE', 'TEX_BRICK', 'TEX_VORONOI', 'TEX_CHECKER', 'EMISSION', 'BUMP'}) or len(nt.nodes) > 4)
        outs = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL']
        if not outs or not any(o.inputs['Surface'].is_linked for o in outs):
            R.add('materiaux', 'majeur', 'matériau sans sortie de surface reliée', m.name)
        for n in nt.nodes:
            if n.type == 'TEX_IMAGE':
                img = n.image
                if img is None:
                    R.add('materiaux', 'critique', 'nœud de texture sans image (rendu rose)', m.name)
                    continue
                if img.source == 'FILE' and not img.packed_file:
                    path = bpy.path.abspath(img.filepath)
                    if not os.path.isfile(path):
                        R.add('materiaux', 'critique', f'texture introuvable : {os.path.basename(path)}', m.name)
                        continue
                if img.size[0] == 0 or img.size[1] == 0:
                    R.add('materiaux', 'critique', f'texture illisible : {img.name}', m.name)
    for img in bpy.data.images:
        if img.users == 0 and img.name not in ('Render Result', 'Viewer Node'):
            R.add('objets', 'info', 'image orpheline (non utilisée)', img.name)


def check_objects(R, scene, objs, frames):
    import bpy
    names = {o.name for o in scene.objects}
    orphans = [o.name for o in bpy.data.objects if o.name not in names]
    if orphans:
        R.add('objets', 'mineur', f'{len(orphans)} objet(s) hors de la scène (non reliés)', ', '.join(orphans[:6]), len(orphans))
    orphan_meshes = [m.name for m in bpy.data.meshes if m.users == 0]
    if orphan_meshes:
        R.add('objets', 'info', f'{len(orphan_meshes)} maillage(s) orphelin(s)', ', '.join(orphan_meshes[:6]), len(orphan_meshes))
    for ob in objs:
        if ob.type not in ('MESH', 'CURVE', 'FONT'):
            continue
        if ob.hide_render and not _animated(ob, 'hide_render'):
            R.add('objets', 'info', 'objet caché au rendu', ob.name)
        if ob.parent is None and ob.type == 'MESH' and not _is_shell(ob) and len(ob.data.vertices):
            lo, hi = _world_bbox(ob)
            if hi[2] < -0.05:
                R.add('objets', 'majeur', 'objet entièrement sous le sol', ob.name, round(hi[2], 3))
    # Parent loops are impossible in Blender; a parent outside the scene is not.
    for ob in objs:
        if ob.parent is not None and ob.parent.name not in names:
            R.add('objets', 'majeur', 'parent absent de la scène', ob.name)


def _top(ob):
    while ob.parent is not None:
        ob = ob.parent
    return ob


def _moves(ob):
    """True when the object or one of its ancestors is animated (its place changes over time)."""
    while ob is not None:
        ad = ob.animation_data
        if ad and ad.action and any(fc.data_path in ('location', 'rotation_euler', 'scale') for fc in _fcurves(ad.action)):
            return True
        ob = ob.parent
    return False


def check_collisions(R, objs, autofix=True, frames=None):
    """Solids that interpenetrate. Pieces of one assembly (the body, head and legs of one hen) are one object; static
    furniture is tested once (major), moving things at several instants of the film (minor, with the instant)."""
    from mathutils.bvhtree import BVHTree
    import bpy
    scene = bpy.context.scene
    solids = []
    for ob in objs:
        if ob.type != 'MESH' or _is_shell(ob) or ob.hide_render or not len(ob.data.polygons):
            continue
        lo, hi = _world_bbox(ob)
        if min(hi[i] - lo[i] for i in range(3)) < 0.015:  # cards, papers, hands of a clock: no volume to collide
            continue
        solids.append(ob)
        if _base(ob.name) in GROUNDED and ob.parent is None:
            R.tally('pose_au_sol', -0.03 <= lo[2] <= 0.03)
            if lo[2] > 0.03:
                R.add('collisions', 'majeur', f'meuble qui flotte ({lo[2]:.2f} m au-dessus du sol)', ob.name, round(lo[2], 3))
            elif lo[2] < -0.03:
                R.add('collisions', 'majeur', f'meuble qui traverse le sol ({lo[2]:.2f} m)', ob.name, round(lo[2], 3))
    for em in objs:
        if em.type == 'EMPTY' and em.get('assembly') is not None:
            kind = re.sub(r'[\d.\-]+$', '', str(em['assembly']))
            meshes = [c for c in em.children_recursive if c.type == 'MESH' and len(c.data.polygons)]
            if kind in GROUNDED_ASM and meshes and em.parent is None:
                lo, _ = _union_bbox(meshes)
                ok = -0.03 <= lo[2] <= 0.03
                R.tally('pose_au_sol', ok)
                if lo[2] > 0.03:
                    R.add('collisions', 'majeur', f'{kind} qui flotte ({lo[2]:.2f} m au-dessus du sol)', em.name, round(lo[2], 3))
                elif lo[2] < -0.03:
                    R.add('collisions', 'majeur', f'{kind} qui traverse le sol ({lo[2]:.2f} m)', em.name, round(lo[2], 3))
    top = {ob.name: _top(ob).name for ob in solids}
    moving = {ob.name for ob in solids if _moves(ob)}
    f_keep = scene.frame_current
    samples = [f_keep] if not moving else sorted(set([f_keep] + list(frames or [])))
    found = {}
    for f in samples:
        if f != scene.frame_current:
            scene.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        boxes = {ob.name: _world_bbox(ob) for ob in solids}
        trees = {}

        def tree(ob):
            if ob.name not in trees:
                ev = ob.evaluated_get(dg)
                me = ev.to_mesh()
                mw = ob.matrix_world
                trees[ob.name] = BVHTree.FromPolygons([mw @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons], all_triangles=False, epsilon=0.0)
                ev.to_mesh_clear()
            return trees[ob.name]
        for i in range(len(solids)):
            a = solids[i]
            alo, ahi = boxes[a.name]
            for j in range(i + 1, len(solids)):
                b = solids[j]
                if top[a.name] == top[b.name]:
                    continue
                dyn = a.name in moving or b.name in moving
                if f != f_keep and not dyn:
                    continue
                key = tuple(sorted((top[a.name], top[b.name])))
                if key in found:
                    continue
                blo, bhi = boxes[b.name]
                inter = [min(ahi[k], bhi[k]) - max(alo[k], blo[k]) for k in range(3)]
                if min(inter) <= 0.004:  # touching is fine (a pillow on a mattress)
                    continue
                vi = inter[0] * inter[1] * inter[2]
                small = min((ahi[0] - alo[0]) * (ahi[1] - alo[1]) * (ahi[2] - alo[2]), (bhi[0] - blo[0]) * (bhi[1] - blo[1]) * (bhi[2] - blo[2]))
                if small <= 0 or vi / small < 0.25:
                    continue
                a_in_b = all(alo[k] >= blo[k] - 1e-3 and ahi[k] <= bhi[k] + 1e-3 for k in range(3))
                b_in_a = all(blo[k] >= alo[k] - 1e-3 and bhi[k] <= ahi[k] + 1e-3 for k in range(3))
                if (a_in_b or b_in_a) and not dyn:
                    inner, outer = (a, b) if a_in_b else (b, a)
                    ilo, ihi = boxes[inner.name]
                    centre = [(ilo[k] + ihi[k]) / 2 for k in range(3)]
                    if not tree(a).overlap(tree(b)) and _inside(centre, tree(outer)):
                        # Entirely enclosed in another solid: never seen, wasted (a hidden object).
                        found[key] = (f, dyn, 1.0, 'cache', inner.name, outer.name)
                        continue
                if tree(a).overlap(tree(b)):
                    found[key] = (f, dyn, vi / small, 'collision', a.name, b.name)
    if f_keep != scene.frame_current:
        scene.frame_set(f_keep)
    for (f, dyn, r, what, a, b) in list(found.values())[:30]:
        if what == 'cache':
            R.add('objets', 'mineur', f'objet caché : entièrement enfermé dans {b}', a)
        elif dyn:
            R.add('collisions', 'mineur', f'{a} et {b} se chevauchent à l’image {f} ({r:.0%})', a)
        else:
            R.add('collisions', 'majeur', f'{a} et {b} s’interpénètrent ({r:.0%} du plus petit)', a)
    R.stats['collisions'] = {'solides': len(solids), 'mobiles': len(moving), 'instants': len(samples), 'chevauchements': sum(1 for v in found.values() if v[3] == 'collision'),
                             'caches': sum(1 for v in found.values() if v[3] == 'cache')}


def check_scale(R, objs, cast=None):
    for ob in objs:
        if ob.type not in ('MESH', 'EMPTY', 'ARMATURE'):
            continue
        s = ob.scale
        if s.x * s.y * s.z < 0 and not _animated(ob, 'scale'):
            R.add('echelle', 'majeur', 'échelle miroir (négative) : normales et exports inversés', ob.name)
        if ob.type != 'MESH':
            continue
        lo, hi = _world_bbox(ob)
        ext = [hi[i] - lo[i] for i in range(3)]
        for toks, axis, mn, mx in SIZE_RULES:
            if _base(ob.name) not in toks:
                continue
            v = {'xy': max(ext[0], ext[1]), 'z': ext[2], 'top': hi[2], 'bottom': lo[2]}[axis]
            R.tally('tailles', mn <= v <= mx)
            if not mn <= v <= mx:
                R.add('echelle', 'majeur', f'taille irréaliste : {v:.2f} m (attendu {mn}–{mx} m)', ob.name, round(v, 3))
    try:
        bible = json.load(open(os.path.join(HERE, 'characters.json'), encoding='utf-8'))
    except Exception:
        bible = {}
    for c in cast or []:
        h = c.get('height')
        if h is not None and not 0.8 <= h <= 2.1:
            R.add('echelle', 'majeur', f'taille de personnage irréaliste : {h} m', c.get('name'))
        ref = bible.get(c.get('name'), {})
        # Character coherence: the actor has exactly the height and voice of their sheet.
        if ref.get('height') is not None and h is not None:
            ok = abs(ref['height'] - h) <= 0.03
            R.tally('personnages', ok)
            if not ok:
                R.add('narratif', 'majeur', f'taille {h} m ≠ fiche {ref["height"]} m', c.get('name'))
        if ref.get('voice') and c.get('voice'):
            ok = ref['voice'] == c['voice']
            R.tally('personnages', ok)
            if not ok:
                R.add('narratif', 'majeur', f'voix {c["voice"]} ≠ fiche {ref["voice"]}', c.get('name'))


def check_realtime(R, scene, objs):
    import bpy
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for ob in objs:
        if ob.type != 'MESH' or ob.hide_render:
            continue
        me = ob.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        ob.evaluated_get(dg).to_mesh_clear()
    mats = {s.material.name for ob in objs for s in getattr(ob, 'material_slots', []) if s.material}
    lights = sum(1 for ob in objs if ob.type == 'LIGHT')
    tex = sum(img.size[0] * img.size[1] * 4 for img in bpy.data.images if img.users and img.size[0]) / 2 ** 20
    st = {'triangles': tris, 'objets': len(objs), 'materiaux': len(mats), 'lumieres': lights, 'textures_mo': round(tex, 1)}
    R.stats['temps_reel'] = st
    # Global performance: the share of the PC budget kept, on the most loaded resource (100 = within every budget).
    load = max(st[k] / BUDGETS['pc'][k] for k in st)
    R.m['_perf'] = 100.0 if load <= 1 else max(0.0, 100.0 / load)
    for target, sev in (('pc', 'majeur'), ('mobile', 'info')):
        over = [k for k, v in st.items() if v > BUDGETS[target][k]]
        R.stats[f'budget_{target}'] = 'respecté' if not over else 'dépassé : ' + ', '.join(over)
        for k in over:
            R.add('temps_reel', sev, f'budget temps réel {target.upper()} dépassé : {k} = {st[k]} (max {BUDGETS[target][k]})', valeur=st[k])


def check_lighting(R, scene, objs, life=None, autofix=True):
    import bpy
    lights = [ob for ob in objs if ob.type == 'LIGHT']
    emissive = 0
    for m in bpy.data.materials:
        if m.users and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED' and n.inputs['Emission Strength'].default_value > 0.01:
                    emissive += 1
                elif n.type == 'EMISSION':
                    emissive += 1
    world = scene.world
    if not lights and not emissive and not world:
        R.add('eclairage', 'critique', 'aucune source de lumière : image noire')
    # Designed light: a key light (sun / lamp / area) or an emissive design (painted cards, lit windows).
    R.tally('lumiere_concue', bool(lights) or emissive > 0)
    for ob in lights:
        e = ob.data.energy
        if not math.isfinite(e) or e < 0:
            R.add('eclairage', 'critique', 'énergie de lumière invalide', ob.name)
        elif ob.data.type == 'SUN' and e > 50:
            R.add('eclairage', 'majeur', f'soleil surexposé ({e} W/m²)', ob.name, e)
        elif ob.data.type in ('POINT', 'SPOT', 'AREA') and e > 20000:
            R.add('eclairage', 'majeur', f'lampe surexposée ({e} W)', ob.name, e)
    # A sealed shell: no rounded joint between walls, floor and ceiling (light leaks through bevelled seams).
    for ob in objs:
        if ob.type == 'MESH' and _is_shell(ob):
            bev = [m for m in ob.modifiers if m.type == 'BEVEL']
            if bev:
                if autofix:
                    for m in bev:
                        ob.modifiers.remove(m)
                    R.fix(f'{ob.name} : chanfrein retiré de la coque (fuite de lumière évitée)')
                else:
                    R.add('eclairage', 'majeur', 'coque chanfreinée : fuite de lumière aux jointures', ob.name)
    # Interior: the walls must close against the ceiling and the floor (gap = light leak).
    ceil = [ob for ob in objs if ob.type == 'MESH' and ob.name.lower().startswith(('plasterceiling', 'ceiling'))]
    walls = [ob for ob in objs if ob.type == 'MESH' and ob.name.lower().startswith(('plasterback', 'plasterwall', 'wall', 'back'))]
    if ceil and walls:
        clo, _ = _world_bbox(ceil[0])
        for w in walls:
            _, whi = _world_bbox(w)
            if whi[2] >= clo[2] - 0.15 and whi[2] < clo[2] - 0.002:
                R.add('eclairage', 'majeur', f'jour de {1000 * (clo[2] - whi[2]):.0f} mm entre le mur et le plafond (fuite de lumière)', w.name)
    if life:
        g = life.get('grade')
        night = g in ('soir', 'nuit')
        for ob in lights:
            if ob.data.type == 'SUN' and g == 'nuit' and ob.data.energy > 3:
                R.add('eclairage', 'majeur', 'soleil fort dans une scène de nuit', ob.name)
        if night and not any(ob.data.type in ('POINT', 'SPOT', 'AREA') for ob in lights) and not emissive and not life.get('kit'):
            R.add('eclairage', 'mineur', 'scène du soir sans lampe allumée')
    R.stats['lumieres'] = len(lights)
    R.stats['surfaces_emissives'] = emissive


def probe_exposure(R, scene, frame=None, size=160):
    """A tiny render of the frame: measured exposure (mean, clipped highlights, crushed shadows)."""
    import bpy
    import numpy as np
    import tempfile
    rs = scene.render
    keep = (rs.resolution_x, rs.resolution_y, rs.resolution_percentage, rs.filepath, scene.frame_current)
    samples = None
    try:
        if scene.render.engine == 'CYCLES':
            samples = scene.cycles.samples
            scene.cycles.samples = min(samples, 8)
        ar = rs.resolution_y / max(1, rs.resolution_x)
        rs.resolution_x, rs.resolution_y, rs.resolution_percentage = size, max(16, int(size * ar)), 100
        if frame is not None:
            scene.frame_set(frame)
        tmp = os.path.join(tempfile.gettempdir(), f'preflight-{os.getpid()}.png')
        rs.filepath = tmp
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(tmp)
        a = np.empty(im.size[0] * im.size[1] * 4, np.float32)
        im.pixels.foreach_get(a)
        bpy.data.images.remove(im)
        os.remove(tmp)
        rgb = a.reshape(-1, 4)[:, :3]
        lum = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        mean, clip, crush = float(lum.mean()), float((lum > 0.985).mean()), float((lum < 0.02).mean())
        R.stats.setdefault('exposition', []).append({'image': frame, 'moyenne': round(mean, 3), 'ecretage': round(clip, 4), 'noirs': round(crush, 4)})
        import rules
        rl = rules.load()
        R.tally('exposition', rl['exposure_min'] * 0.6 <= mean <= min(0.95, rl['exposure_max'] * 1.15) and clip <= 0.12)
        if mean < 0.08:
            R.add('eclairage', 'majeur', f'image trop sombre (luminance moyenne {mean:.2f})', valeur=round(mean, 3))
        elif mean > 0.88:
            R.add('eclairage', 'majeur', f'image surexposée (luminance moyenne {mean:.2f})', valeur=round(mean, 3))
        if clip > 0.12:
            R.add('eclairage', 'mineur', f'{clip:.0%} de pixels brûlés', valeur=round(clip, 3))
        if crush > 0.3:
            R.add('eclairage', 'mineur', f'{crush:.0%} de pixels bouchés', valeur=round(crush, 3))
    except Exception as e:  # a probe that cannot run is reported, never silent
        R.add('eclairage', 'info', f'mesure d’exposition impossible : {e}')
    finally:
        rs.resolution_x, rs.resolution_y, rs.resolution_percentage, rs.filepath, f0 = keep
        scene.frame_set(f0)
        if samples is not None:
            scene.cycles.samples = samples


def check_rigs(R, scene, objs):
    import bpy
    f0, f1 = scene.frame_start, scene.frame_end
    arms = [ob for ob in objs if ob.type == 'ARMATURE']
    for arm in arms:
        if not arm.data.bones:
            R.add('rigs', 'critique', 'armature sans os', arm.name)
    for ob in objs:
        if ob.type != 'MESH':
            continue
        for md in ob.modifiers:
            if md.type != 'ARMATURE':
                continue
            if md.object is None:
                R.add('rigs', 'critique', 'modificateur d’armature sans armature', ob.name)
                continue
            bones = {b.name for b in md.object.data.bones}
            groups = {g.index: g.name for g in ob.vertex_groups}
            stray = [n for n in groups.values() if n not in bones]
            if stray:
                R.add('rigs', 'mineur', f'groupes de sommets sans os : {", ".join(stray[:4])}', ob.name)
            if not groups:
                R.add('rigs', 'majeur', 'maillage rigué sans groupe de sommets', ob.name)
                continue
            bone_idx = {i for i, n in groups.items() if n in bones}
            unweighted, off = 0, 0
            for v in ob.data.vertices:
                w = sum(g.weight for g in v.groups if g.group in bone_idx)
                if w <= 1e-6:
                    unweighted += 1
                elif abs(w - 1.0) > 0.05:
                    off += 1
            n = max(1, len(ob.data.vertices))
            if unweighted / n > 0.02:
                R.add('rigs', 'majeur', f'{unweighted / n:.0%} des sommets sans poids (ils ne suivent pas le squelette)', ob.name)
            if off / n > 0.05:
                R.add('rigs', 'mineur', f'{off / n:.0%} des sommets à poids non normalisés', ob.name)
    keys, bad, outside = 0, 0, 0
    for act in bpy.data.actions:
        if not act.users:
            continue
        for fc in _fcurves(act):
            for kp in fc.keyframe_points:
                keys += 1
                if not (math.isfinite(kp.co[0]) and math.isfinite(kp.co[1])):
                    bad += 1
                elif kp.co[0] < f0 - 10 or kp.co[0] > f1 + 10:
                    outside += 1
    for sk in bpy.data.shape_keys:
        for kb in sk.key_blocks:
            if not -0.01 <= kb.value <= 1.01 and kb.slider_max <= 1.0:
                R.add('rigs', 'mineur', f'clé de forme hors plage ({kb.value:.2f})', f'{sk.user.name}:{kb.name}')
    if bad:
        R.add('rigs', 'critique', f'{bad} clé(s) d’animation invalide(s) (NaN)')
    if outside:
        R.add('rigs', 'mineur', f'{outside} clé(s) hors de la plage d’images {f0}–{f1}', valeur=outside)
    R.stats['animation'] = {'armatures': len(arms), 'cles': keys, 'images': [f0, f1]}


def check_narrative(R, story=None, life=None, objs=(), characters=None, drawn=None):
    """Characters, places, objects and actions agree with each other and with the bible — each agreement is a measured
    test of the character / environment / narrative coherence."""
    if characters is None:
        try:
            characters = json.load(open(os.path.join(HERE, 'characters.json'), encoding='utf-8'))
        except Exception:
            characters = {}
    names = {o.name.lower() for o in objs}
    if story:
        cast = story.get('cast', [])
        ids = {c.get('id') for c in cast}
        for c in cast:
            known = not characters or c.get('name') in characters
            R.tally('personnages', known)
            if not known:
                R.add('narratif', 'critique', 'personnage absent de la bible des personnages', c.get('name'))
            elif drawn is not None:
                ok = c.get('name') in drawn
                R.tally('personnages', ok)
                if not ok:
                    R.add('narratif', 'critique', 'personnage non dessiné pour Blender (aucune planche)', c.get('name'))
        for i, b in enumerate(story.get('beats', [])):
            ok = b.get('who') in ids
            R.tally('recit', ok)
            if not ok:
                R.add('narratif', 'critique', f'réplique {i + 1} : locuteur hors distribution ({b.get("who")})')
            for r in (b.get('react') or {}):
                ok = r in ids
                R.tally('recit', ok)
                if not ok:
                    R.add('narratif', 'majeur', f'réplique {i + 1} : réaction d’un personnage absent ({r})')
            ok = bool((b.get('text') or '').strip())
            R.tally('recit', ok)
            if not ok:
                R.add('narratif', 'majeur', f'réplique {i + 1} vide')
        p = story.get('punch')
        if p is not None:
            ok = 0 <= p.get('beat', -1) < len(story.get('beats', []))
            R.tally('recit', ok)
            if not ok:
                R.add('narratif', 'majeur', 'la chute pointe hors des répliques')
        ok = bool((story.get('hook') or '').strip())
        R.tally('recit', ok)
        if not ok:
            R.add('narratif', 'mineur', 'pas d’accroche à l’écran (les 2 premières secondes)')
        text = ' '.join(b.get('text', '') for b in story.get('beats', [])).lower()
        if life:
            ok = not (life.get('grade') == 'jour' and any(w in text for w in (' cette nuit ', 'bonne nuit', 'il fait nuit')))
            R.tally('recit', ok)
            if not ok:
                R.add('narratif', 'mineur', 'le texte parle de la nuit mais la scène est en plein jour')
        nom = (life or {}).get('nom')
        if nom and characters:
            away = [c.get('name') for c in cast if characters.get(c.get('name'), {}).get('lieux') and nom not in characters[c.get('name')]['lieux']]
            if away:
                R.add('narratif', 'info', f'hors de leurs lieux habituels ({nom}) : {", ".join(away)}')
    if life:
        objets = set(life.get('objets') or [])
        kit = life.get('kit')
        for a in life.get('animals', []):
            beh = (a.get('behavior') or '').lower()
            for word, need, toks in NEEDS:
                if word in beh:
                    ok = bool(kit) or bool(objets & set(need)) or any(n.startswith(toks) for n in names)
                    R.tally('environnement', ok)
                    if not ok:
                        R.add('narratif', 'majeur', f'{a.get("species")} « {beh} » : il n’y a pas de {word} dans le décor')
        for e in life.get('extras', []):
            ok = not characters or e.get('name') in characters
            R.tally('environnement', ok)
            if not ok:
                R.add('narratif', 'majeur', 'figurant absent de la bible', e.get('name'))
            ref = characters.get(e.get('name'), {}) if characters else {}
            role = (e.get('role') or '').lower()
            if ref and 'femmes' in role:
                R.tally('environnement', ref.get('genre') == 'femme')
            if ref and 'enfants' in role:
                R.tally('environnement', ref.get('genre') in ('garçon', 'fille'))
        # A set BUILT by the engine must hold the objects its place promises (a painted set holds them in the painting).
        if not kit and objs:
            for o in sorted(objets):
                toks = OBJ_TOKENS.get(o)
                if not toks:
                    continue
                ok = any(n.startswith(toks) for n in names)
                R.tally('environnement', ok)
                if not ok:
                    R.add('narratif', 'mineur', f'objet du lieu absent du décor construit : {o}')
        # Props named by the lines are in the scene (life plan → objects prop-<kind>-<i>).
        for i, pr in enumerate(life.get('props', [])):
            if any(n.startswith('prop-') for n in names):
                R.tally('recit', any(n.startswith(f"prop-{pr.get('kind')}") for n in names))


def check_fluidity(R, scene, cuts=()):
    """Animation smoothness measured on the curves themselves (before any render): per animated channel, the frames
    where the acceleration jumps far above its own regime (a jerk) — camera cuts and snaps of a pose excluded."""
    f0, f1 = scene.frame_start, scene.frame_end
    if f1 <= f0:
        return
    cut = set()
    for c in cuts or ():
        cut.update((c - 1, c, c + 1))
    total, jerky, channels = 0, 0, 0
    for ob in scene.objects:
        ad = ob.animation_data
        if not ad or not ad.action:
            continue
        for fc in _fcurves(ad.action):
            if fc.data_path not in ('location', 'rotation_euler') or len(fc.keyframe_points) < 3:
                continue
            if all(k.interpolation == 'CONSTANT' for k in fc.keyframe_points):
                continue  # a deliberate step (hold), not a motion
            vals = [fc.evaluate(f) for f in range(f0, f1 + 1)]
            acc = [vals[i + 1] - 2 * vals[i] + vals[i - 1] for i in range(1, len(vals) - 1)]
            mags = sorted(abs(a) for a in acc)
            if not mags or mags[-1] < 1e-6:
                continue
            base = mags[int(0.9 * (len(mags) - 1))] or statistics.mean(mags) or 1e-6
            lim = max(base * 8.0, 1e-4)
            channels += 1
            for i, a in enumerate(acc):
                f = f0 + 1 + i
                if f in cut:
                    continue
                total += 1
                if abs(a) > lim:
                    jerky += 1
    if total:
        R.m['fluidite'] = [total - jerky, total]
        R.stats['fluidite'] = {'canaux': channels, 'images_testees': total, 'a_coups': jerky}
        if jerky / total > 0.02:
            R.add('rigs', 'mineur', f'{jerky} à-coup(s) d’animation sur {total} images testées', valeur=jerky)


def measure_immersion(R, life, objs, kind):
    """How alive the place is: population, animals, ambience, effects, objects of the action, depth layers, practical
    lights — each component 0..1, the dimension is their mean."""
    comps = []
    names = [o.name.lower() for o in objs]
    if life and kind != 'decor':
        comps.append(('population', min(1.0, (len(life.get('extras', [])) + len(life.get('animals', []))) / 3.0)))
        comps.append(('ambiance sonore', min(1.0, len(life.get('sons', [])) / 2.0)))
        comps.append(('effets', min(1.0, len(life.get('fx', [])) / 2.0)))
        comps.append(('objets de l’action', 1.0 if life.get('props') else 0.5))
        layers = sum([any(n.startswith('decor') or n.startswith('plaster') or n.startswith('ground') for n in names),
                      bool(life.get('extras') or life.get('animals')), bool(life.get('props'))])
        comps.append(('profondeur (plans)', layers / 3.0))
    else:
        furn = sum(1 for o in objs if o.type == 'MESH' and not _is_shell(o))
        comps.append(('richesse du décor', min(1.0, furn / 60.0)))
        comps.append(('lumières pratiques', min(1.0, sum(1 for o in objs if o.type == 'LIGHT' and o.data.type in ('POINT', 'SPOT')) / 1.0 + (0.5 if any(n.startswith('glow') for n in names) else 0))))
        comps.append(('ouverture sur le dehors', 1.0 if any(n.startswith(('sky', 'woodmango', 'skyline')) for n in names) or (life or {}).get('exterieur') else 0.4))
        comps.append(('matières', (R.ratio('materiaux_riches') or 0) / 100.0))
    R.m['_immersion'] = 100.0 * sum(v for _, v in comps) / len(comps) if comps else None
    R.stats['immersion'] = {k: round(v, 2) for k, v in comps}


# ---------------------------------------------------------------------------------------------------------------------
def run(kind='scene', subject='', story=None, life=None, cast=None, drawn=None, probe_frames=(), autofix=True, out=None, render_checks=True, cuts=()):
    """Measure the CURRENT Blender scene against its objectives. Returns the report (JSON + HTML written when `out`)."""
    import bpy
    import rules
    scene = bpy.context.scene
    objs = list(scene.objects)
    R = Report(kind, subject or os.path.basename(bpy.data.filepath) or kind)
    check_geometry(R, objs, autofix)
    check_materials(R, objs, autofix)
    check_objects(R, scene, objs, (scene.frame_start, scene.frame_end))
    f0, f1 = scene.frame_start, scene.frame_end
    check_collisions(R, objs, autofix, frames=[int(f0 + (f1 - f0) * k / 5) for k in range(6)] if f1 > f0 else None)
    check_scale(R, objs, cast or (story or {}).get('cast'))
    check_realtime(R, scene, objs)
    check_lighting(R, scene, objs, life, autofix)
    if render_checks:
        for f in probe_frames:
            probe_exposure(R, scene, f)
    check_rigs(R, scene, objs)
    check_fluidity(R, scene, cuts)
    check_narrative(R, story, life, objs, drawn=drawn)
    measure_immersion(R, life, objs, kind)
    # Every defect met is traced back to its root cause; the generation rule responsible is hardened (prevention).
    causes = rules.learn(R.issues, R.fixes, subject=R.subject) if kind != 'test' else []
    res = R.result(causes)
    res['regles_de_generation'] = rules.load()
    if out:
        write(res, out)
    return res


def write(res, out):
    os.makedirs(os.path.dirname(os.path.abspath(out)) or '.', exist_ok=True)
    with open(out + '.json', 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    with open(out + '.html', 'w', encoding='utf-8') as f:
        f.write(to_html(res))


def to_html(res):
    e = html.escape
    tone = {'excellence': '#1f9d55', 'objectifs atteints': '#2f855a', 'objectifs partiellement atteints': '#c27c0e', 'bloqué': '#c92a2a'}.get(res['verdict'], '#5c7080')
    sev_col = {'critique': '#c92a2a', 'majeur': '#d9480f', 'mineur': '#c27c0e', 'info': '#5c7080'}
    cards = []
    for key, label, target in DIMENSIONS:
        v = res['dimensions'].get(key)
        if v is None:
            cards.append(f"<div class='dim na'><div class='lab'>{e(label)}</div><div class='val'>—</div><div class='tg'>sans objet ici</div></div>")
            continue
        ok = v >= target
        cards.append(f"<div class='dim'><div class='lab'>{e(label)}</div><div class='val' style='color:{'#1f9d55' if ok else '#d9480f'}'>{v:g}</div>"
                     f"<div class='bar'><i style='width:{min(100, v)}%;background:{'#1f9d55' if ok else '#d9480f'}'></i><b style='left:{target}%'></b></div>"
                     f"<div class='tg'>objectif ≥ {target} · {'atteint' if ok else 'non atteint'}</div></div>")
    objs = ''.join(f"<tr><td>{e(o['objectif'])}</td><td>{e(str(o['cible']))}</td><td>{e(str(o['mesure']))}</td>"
                   f"<td style='color:{'#1f9d55' if o['atteint'] else '#d9480f'}'>{'atteint' if o['atteint'] else 'non atteint'}</td></tr>" for o in res['objectifs'])
    proofs = ''.join(f"<tr><td><span class='sev' style='background:{sev_col[i['severite']]}'>{e(i['severite'])}</span></td><td>{e(dict(CATEGORIES)[i['categorie']])}</td>"
                     f"<td>{e(i.get('objet', ''))}</td><td>{e(i['message'])}</td></tr>" for i in sorted(res['issues'], key=lambda i: list(SEV_COST).index(i['severite'])))
    causes = ''.join(f"<tr><td>{e(c['cause'])}</td><td>{e(c['prevention'])}</td><td>{e(json.dumps(c['regle'], ensure_ascii=False))}</td><td>{c['occurrences']}</td></tr>" for c in res['causes_racines'])
    fixes = ''.join(f'<li>{e(x)}</li>' for x in res['corrections'])
    first = res['conforme_des_la_generation']
    meas = e(json.dumps({'mesures': res['mesures'], **res['stats']}, ensure_ascii=False, indent=1))
    return f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conformité 3D</title><style>
:root{{--bg:#f7f7f5;--fg:#1b1f23;--muted:#5c6670;--card:#fff;--line:#e3e3df}}
@media (prefers-color-scheme:dark){{:root{{--bg:#16181b;--fg:#e8e8e6;--muted:#9aa3ab;--card:#1f2226;--line:#2e3237}}}}
body{{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}}
main{{max-width:1000px;margin:auto}} .card{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0;overflow-x:auto}}
.big{{font-size:46px;font-weight:700;color:{tone};line-height:1}} .verdict{{font-size:18px;color:{tone};font-weight:600}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}}
.dim{{border:1px solid var(--line);border-radius:10px;padding:10px}} .dim.na{{opacity:.55}} .lab{{font-size:13px;color:var(--muted)}}
.val{{font-size:26px;font-weight:700}} .tg{{font-size:12px;color:var(--muted)}}
.bar{{position:relative;height:6px;background:var(--line);border-radius:3px;margin:4px 0}} .bar i{{position:absolute;left:0;top:0;bottom:0;border-radius:3px}}
.bar b{{position:absolute;top:-3px;width:2px;height:12px;background:var(--fg)}}
table{{border-collapse:collapse;width:100%}} td,th{{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}}
.sev{{color:#fff;border-radius:6px;padding:1px 6px;font-size:12px}} pre{{white-space:pre-wrap;color:var(--muted);font-size:12px}}
details summary{{cursor:pointer;font-weight:600}}
</style></head><body><main>
<h1>Conformité 3D — {e(res['kind'])} · {e(res['subject'])}</h1>
<div class="card"><div class="big">{res['taux_objectifs']:g} %</div><div class="verdict">des objectifs atteints · {e(res['verdict'])}</div>
<div style="margin-top:6px">Conforme dès la génération : <b style="color:{'#1f9d55' if first else '#d9480f'}">{'oui' if first else 'non'}</b>
 · qualité obtenue {res['dimensions']['qualite']:g}/100 · {len(res['corrections'])} correction(s) · {res['duration_s']} s de mesure</div></div>
<div class="card"><h2>Dimensions mesurées</h2><div class="grid">{''.join(cards)}</div></div>
<div class="card"><h2>Objectifs</h2><table><tr><th>Objectif</th><th>Cible</th><th>Mesure</th><th>État</th></tr>{objs}</table></div>
<div class="card"><h2>Causes racines et prévention</h2>{'<table><tr><th>Cause racine</th><th>Prévention appliquée à la génération</th><th>Règle</th><th>Occurrences</th></tr>' + causes + '</table>' if causes else '<p>Aucun défaut de génération : aucune règle à durcir.</p>'}</div>
<div class="card"><h2>Preuves (constats techniques)</h2><table><tr><th>Sévérité</th><th>Domaine</th><th>Objet</th><th>Détail</th></tr>{proofs or '<tr><td colspan=4>aucun</td></tr>'}</table></div>
<div class="card"><details{' open' if res['corrections'] else ''}><summary>Corrections (audit — exceptionnelles, 0 attendu) : {len(res['corrections'])}</summary><ul>{fixes or '<li>aucune</li>'}</ul></details></div>
<div class="card"><details><summary>Mesures détaillées</summary><pre>{meas}</pre></details></div>
</main></body></html>"""


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--blend', required=True)
    ap.add_argument('--story')
    ap.add_argument('--life')
    ap.add_argument('--out', required=True)
    ap.add_argument('--probe', type=int, nargs='*', default=[])
    ap.add_argument('--no-fix', action='store_true')
    a = ap.parse_args()
    import bpy
    bpy.ops.wm.open_mainfile(filepath=a.blend)
    story = json.load(open(a.story, encoding='utf-8')) if a.story else None
    life = json.load(open(a.life, encoding='utf-8')) if a.life else None
    res = run('scene', os.path.basename(a.blend), story=story, life=life, probe_frames=a.probe, autofix=not a.no_fix, out=a.out)
    print(json.dumps({k: res[k] for k in ('taux_objectifs', 'conforme_des_la_generation', 'score', 'verdict', 'passed')}, ensure_ascii=False))
    sys.exit(0 if res['passed'] else 3)


if __name__ == '__main__':
    main()
