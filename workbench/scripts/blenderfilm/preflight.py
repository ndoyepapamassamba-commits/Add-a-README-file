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
    ('rigs', 'Rigs, armatures, animations'), ('narratif', 'Cohérence narrative'), ('cameras', 'Caméras et mouvements'),
    ('image', 'Image et netteté'), ('physique', 'Physique et lois humaines'),
    ('atelier', 'Style et physique des objets et animaux'),
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
GROUNDED_ASM = ('lit', 'armoire', 'tablenuit', 'table', 'canape', 'etagere', 'chaise', 'ventilateur', 'plante', 'tv', 'classeur', 'bureau', 'banc', 'perfusion', 'voiture')
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
# Only SET DRESSING is required in a built set; hand props (phone, case, notes, ball…) come with the actor who uses them.
OBJ_TOKENS = {
    'lit': ('woodbed', 'metalbed'), 'armoire': ('woodward',), 'table': ('woodtable', 'wooddesk', 'table'),
    'chaise': ('chair', 'fabricchair'), 'tele': ('tv', 'screentv'), 'ordinateur': ('mon', 'screen'), 'tableau': ('board',),
    'perfusion': ('metalivpole',), 'vitrine': ('glassfront', 'glowshop'), 'caddie': ('cart',), 'banc': ('bench',),
    'portail': ('metalgate',),
}


def _gn_source(ob):
    """A model kept out of the scene ON PURPOSE: the source of a Geometry Nodes scatter (instanced, never drawn itself)."""
    return any(c.name.startswith('gnsrc-') for c in ob.users_collection)


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
        tech = ('geometrie', 'materiaux', 'objets', 'rigs', 'collisions', 'cameras')
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
        real = [x for x in (self.ratio('tailles'), self.ratio('pose_au_sol'), self.ratio('materiaux_riches'), self.ratio('exposition'), self.ratio('lumiere_concue'),
                            self.ratio('lisibilite_fond'), self.ratio('physique'), self.ratio('style')) if x is not None]
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
    orphans = [o.name for o in bpy.data.objects if o.name not in names and not _gn_source(o)]
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
                    found[key] = (f, dyn, vi / small, 'collision', a.name, b.name, top[a.name], top[b.name])
    if f_keep != scene.frame_current:
        scene.frame_set(f_keep)
    for v in list(found.values())[:30]:
        f, dyn, r, what, a, b = v[:6]
        # Named by their assemblies (« poule-0 », « asm-lit »), the part in brackets: the root cause is found by WHAT
        # collides, not by the name of one of its pieces.
        ta, tb = (v[6], v[7]) if len(v) > 7 else (a, b)
        la = ta if ta == a else f'{ta} ({a})'
        lb = tb if tb == b else f'{tb} ({b})'
        if what == 'cache':
            R.add('objets', 'mineur', f'objet caché : entièrement enfermé dans {b}', a)
        elif dyn:
            R.add('collisions', 'mineur', f'{la} et {lb} se chevauchent à l’image {f} ({r:.0%})', ta)
        else:
            R.add('collisions', 'majeur', f'{la} et {lb} s’interpénètrent ({r:.0%} du plus petit)', ta)
    R.stats['collisions'] = {'solides': len(solids), 'mobiles': len(moving), 'instants': len(samples), 'chevauchements': sum(1 for v in found.values() if v[3] == 'collision'),
                             'caches': sum(1 for v in found.values() if v[3] == 'cache')}


def check_face_parts(R, objs, tol=0.02):
    """The pieces added on a drawn face (blink lids, mouth cavity) must lie ON that drawing: a piece placed in the
    wrong space floats beside the face (a dark oval in mid-air at every blink)."""
    by = {ob.name: ob for ob in objs}
    for ob in objs:
        host = by.get(ob.get('visage_de', '')) if hasattr(ob, 'get') else None
        if host is None:
            continue
        lo, hi = _world_bbox(host)
        p = ob.matrix_world.translation
        off = max(lo[0] - p.x, p.x - hi[0], lo[2] - p.z, p.z - hi[2], 0.0)
        if off > tol:
            R.add('rigs', 'critique', f'pièce du visage hors de son dessin ({off:.2f} m) : elle flotte à côté du visage', ob.name, round(off, 3))


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
        if ob.name.startswith('paintbody-'):
            # A car body: a real car is 3.6–5.4 m long.
            ln = max(ext[0], ext[1])
            R.tally('tailles', 3.6 <= ln <= 5.4)
            if not 3.6 <= ln <= 5.4:
                R.add('echelle', 'majeur', f'voiture irréaliste : {ln:.2f} m de long (attendu 3,6–5,4 m)', ob.name, round(ln, 2))
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
    tris, per, instances = 0, {}, 0
    # Every drawn thing, Geometry Nodes instances included (a scattered forest counts tree by tree).
    for inst in dg.object_instances:
        ob = inst.object
        if ob.type != 'MESH' or (not inst.is_instance and ob.original.hide_render):
            continue
        key = ob.name
        if key not in per:
            me = ob.to_mesh()
            me.calc_loop_triangles()
            per[key] = len(me.loop_triangles)
            ob.to_mesh_clear()
        tris += per[key]
        instances += 1 if inst.is_instance else 0
    R.m['_instances'] = instances
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


def check_casting(R, life, characters=None, world=None):
    """Every extra and every member of the crowd belongs to the place (its sheet's « lieux »), and what its DRAWING
    shows (a selfie, a hair-dryer, a pot…) is possible there and fits what it does (walk, chat, work)."""
    if not life:
        return
    import casting
    if characters is None:
        try:
            characters = json.load(open(os.path.join(HERE, 'characters.json'), encoding='utf-8'))
        except Exception:
            return
    hab = set(life.get('habitues') or [])
    if not hab:
        try:
            world = world or json.load(open(os.path.join(HERE, 'world.json'), encoding='utf-8'))
            place = next((p for p in world.get('places', []) if p.get('id') == life.get('place')), None)
            hab = casting.place_names(place) if place else set()
        except Exception:
            hab = set()
    if not hab and life.get('nom'):
        hab = {life['nom']}
    people = [(e.get('name'), e.get('behavior'), e.get('role', '')) for e in life.get('extras', [])]
    people += [(n, 'foule', 'foule') for n in (life.get('crowd') or {}).get('names', [])]
    for name, beh, role in people:
        sheet = characters.get(name)
        if sheet is None:
            continue
        ok, why = casting.verdict(sheet, hab, beh, name)
        R.tally('personnages', ok)
        if not ok:
            R.add('narratif', 'majeur', f"figurant incohérent ({role or beh}) à « {life.get('nom', '')} » : {why}", name)
    R.stats['casting'] = {'figurants': len(people), 'lieu': sorted(hab)}


def check_cameras(R, scene, cam):
    """Every camera, at EVERY frame of its move, all around its frame (72 rays, every 5°, corners included):
    the view stays inside the painted set; the faces of the shot stay in frame and above the captions; the camera
    stays level, frontal (the drawings are cards: no orbit), on one side of the line of action (180° rule), at a
    readable speed; its clip planes hold the scene; two cuts in a row are never the same framing (jump cut)."""
    import framing
    g, shots = cam['grid'], cam['shots']
    cap = cam.get('captions') or {}
    frames_total = frames_bad = frames_fast = 0
    worst = {}
    prev = None
    side = None
    for i, sh in enumerate(shots):
        ob = scene.objects.get(sh.get('camera') or f"cam{sh['k']}")
        if ob is None:
            R.add('cameras', 'critique', f"plan {sh['k'] + 1} : caméra introuvable")
            continue
        end = shots[i + 1]['start'] if i + 1 < len(shots) else sh['end']
        frames = list(range(sh['start'] + 1, max(sh['start'] + 2, end + 1)))
        curves = {}
        ad = ob.animation_data
        if ad and ad.action:
            for fc in _fcurves(ad.action):
                if fc.data_path in ('location', 'rotation_euler'):
                    curves[(fc.data_path, fc.array_index)] = fc
        val = lambda path, j, f, base: curves[(path, j)].evaluate(f) if (path, j) in curves else base[j]
        dcurves = _curves(ob.data)
        cap_y = cap.get('two' if sh['type'] == 'two' else 'close', 0.8)
        over_max, face_bad, last, fast = 0.0, [], None, 0
        rot_bad = False
        for f in frames:
            loc, th, tv = _cam_at(scene, ob, f, None, dcurves)
            rot = tuple(val('rotation_euler', j, f, ob.rotation_euler) for j in range(3))
            # Level and frontal: pitch 90° (looking +y), no roll, no yaw.
            if abs(rot[0] - math.pi / 2) > 1e-3 or abs(rot[1]) > 1e-3 or abs(rot[2]) > 1e-3:
                rot_bad = True
            L, Rr, T, B = framing.view_overflow(g, loc, th, tv)
            over = max(L, Rr, T, B)
            over_max = max(over_max, over)
            frames_total += 1
            if over > 0.006:
                frames_bad += 1
            for (fx, fy, fz), nm in zip(sh.get('faces', []), sh.get('names', [])):
                x, y, D = framing.project(loc, th, tv, (fx, fy, fz))
                if x is None or not (0.04 <= x <= 0.96) or not (0.03 <= y <= cap_y - 0.03):
                    face_bad.append((f, nm, None if x is None else round(x, 2), None if y is None else round(y, 2)))
            # Speed of the FRAME (what the viewer sees move): centre and size at the actors' plane, dolly, zoom and shift.
            dist = max(1e-3, -loc[1])
            fr = (loc[0] + dist * loc[3], loc[2] + dist * loc[4], 2 * dist * th, 2 * dist * tv)
            if last is not None:
                step = max(abs(fr[0] - last[0]) / fr[2], abs(fr[1] - last[1]) / fr[3], abs(fr[3] - last[3]) / fr[3])
                if step > 0.05:
                    fast += 1
            last = fr
            s_ = 'devant' if loc[1] < 0 else 'derrière'
            side = side or s_
            if s_ != side:
                R.add('image', 'majeur', f"plan {sh['k'] + 1} : la caméra passe de l’autre côté de l’axe de l’action (règle des 180°)", ob.name)
                side = s_
        frames_fast += fast
        R.tally('fluidite', fast == 0, len(frames))
        R.tally('environnement', over_max <= 0.006)
        if over_max > 0.006:
            R.add('image', 'majeur', f"plan {sh['k'] + 1} : la caméra voit au-delà du décor peint (bord en miroir) de {over_max * 100:.1f} cm", ob.name, round(over_max, 3))
        R.tally('recit', not face_bad)
        if face_bad:
            f, nm, x, y = face_bad[0]
            R.add('image', 'majeur', f"plan {sh['k'] + 1} : visage de {nm} hors cadre ou sous les sous-titres ({len(face_bad)} image(s), ex. image {f})", ob.name)
        if rot_bad:
            R.add('cameras', 'majeur', f"plan {sh['k'] + 1} : caméra inclinée ou en orbite (les dessins sont des cartes : cadrage frontal et horizon droit exigés)", ob.name)
        if fast:
            R.add('cameras', 'mineur', f"plan {sh['k'] + 1} : mouvement trop rapide sur {fast} image(s) (> 5 % du cadre par image)", ob.name)
        # Clip planes: the nearest actor and the farthest painted relief are inside the lens range.
        dmin = min((fy - val('location', 1, f, ob.location) for f in frames[:1] for (_, fy, _) in sh.get('faces', [])), default=1.0)
        far = g['Yp'] + g['DEPTH'] + 0.5 - min(val('location', 1, f, ob.location) for f in (frames[0], frames[-1]))
        if ob.data.clip_start >= dmin - 0.02 or ob.data.clip_end <= far:
            R.add('cameras', 'majeur', f"plan {sh['k'] + 1} : plans de coupe de la caméra trop serrés (acteurs ou décor coupés)", ob.name)
        # Jump cut: same subject, same size, same place after a cut.
        if prev is not None:
            size = lambda x: x['d_min'] * x['tan_v']  # frame height at the actors' plane (dolly or zoom alike)
            same = (prev['type'] == sh['type'] and prev.get('target') == sh.get('target') and abs(size(prev) - size(sh)) / max(size(sh), 1e-6) < 0.15
                    and abs(prev['cx'] - sh['cx']) < 0.1 * 2 * sh['d_min'] * sh['tan_h'])
            R.tally('recit', not same)
            if same:
                R.add('image', 'mineur', f"plans {prev['k'] + 1}→{sh['k'] + 1} : même cadrage sur le même personnage après la coupe (faux raccord)", ob.name)
        prev = sh
        worst[sh['k']] = round(over_max, 4)
    # The painting must keep its shapes (painted people undistorted): rubber-sheet deformation of the relief, per shot,
    # at the two ends of its move.
    mesh = framing.decor_vertices(g)
    deform = []
    if mesh is not None:
        for sh in shots:
            ob = scene.objects.get(sh.get('camera') or f"cam{sh['k']}")
            if ob is None:
                continue
            cc = _curves(ob)
            end = sh['end']
            worst_s, worst_p = 0.0, 1.0
            for f in (sh['start'] + 1, end):
                loc, th_, tv_ = _cam_at(scene, ob, f, cc)
                share, p95, n = framing.decor_distortion(g, loc, th_, tv_, mesh)
                worst_s, worst_p = max(worst_s, share), max(worst_p, p95)
            deform.append((sh['k'], worst_s, worst_p))
            ok = worst_s <= 0.05
            R.tally('environnement', ok)
            if not ok:
                R.add('image', 'majeur', f"plan {sh['k'] + 1} : la peinture du décor est déformée sur {worst_s:.0%} de l’image (personnes peintes étirées, jusqu’à ×{worst_p:.2f})", ob.name)
    R.stats['cameras'] = {'deformation_decor': {'plans_deformes': sum(1 for _, s_, _ in deform if s_ > 0.05), 'max_part': round(max((s_ for _, s_, _ in deform), default=0.0), 3),
                                                'p95_max': round(max((p_ for *_, p_ in deform), default=1.0), 2)},
                          'plans': len(shots), 'images_verifiees': frames_total, 'images_hors_decor': frames_bad, 'images_trop_rapides': frames_fast,
                          'rayons_par_image': 72, 'depassement_max_m': max(worst.values()) if worst else 0.0}


def check_image(R, image):
    """Background legibility: on every close-up, the blur of the set and of the extras on screen stays under the
    ceiling of the generation rule — faces and their expressions remain readable."""
    worst = 0.0
    for e in image:
        b = max(e.get('flou_decor_px', 0.0), e.get('flou_figurants_px', 0.0))
        worst = max(worst, b)
        ok = b <= e['cible_px'] * 1.02
        R.tally('lisibilite_fond', ok)
        if not ok:
            R.add('image', 'majeur', f"plan {e['plan'] + 1} : arrière-plan trop flou ({b:.1f} px > {e['cible_px']:.1f} px) — visages et expressions illisibles")
    R.stats['nettete'] = {'plans': len(image), 'flou_max_px': round(worst, 2), 'plafond_px': image[0]['cible_px'] if image else None}


def check_enclosure(R, scene, life):
    """360° sweep from the set's camera: rays every 10° all around and from the floor to the ceiling. In the field a
    camera can explore (±60° around the view, ±35° up/down) a room must be closed (no hole to the void) and an
    outdoor place must have ground under the horizon everywhere. Behind the camera, an open « fourth wall » is normal
    for a film set; it is reported (to be closed before a 360° export, game engines)."""
    from mathutils import Vector
    camo = scene.camera
    if camo is None:
        return
    dg = bpy_ctx().evaluated_depsgraph_get()
    o = camo.matrix_world.translation.copy()
    outdoor = bool((life or {}).get('exterieur'))
    front_holes, back_holes, n_front, n_back = [], 0, 0, 0
    for yaw in range(0, 360, 10):
        for el in (-60, -35, -15, 0, 15, 35, 60):
            a, e = math.radians(yaw), math.radians(el)
            d = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
            hit = scene.ray_cast(dg, o, d, distance=500.0)[0]
            front = (yaw <= 60 or yaw >= 300) and abs(el) <= 35
            need = (not outdoor) or el < 0
            if front:
                n_front += 1
                if need and not hit:
                    front_holes.append((yaw if yaw <= 180 else yaw - 360, el))
            else:
                n_back += 1
                if need and not hit:
                    back_holes += 1
    ok = not front_holes
    R.tally('environnement', ok)
    if not ok:
        R.add('objets', 'majeur', f"décor ouvert sur le vide dans le champ de la caméra ({len(front_holes)} direction(s), ex. {front_holes[0][0]}°, {front_holes[0][1]}°)")
    if back_holes:
        R.add('objets', 'info', f"4e mur ouvert derrière la caméra ({back_holes} direction(s) sur {n_back}) : normal pour un plateau de tournage, à fermer avant un export 360°")
    R.stats['balayage_360'] = {'directions': n_front + n_back, 'champ_ferme': ok, 'trous_champ': len(front_holes), 'ouvert_derriere': back_holes, 'exterieur': outdoor}


def check_style(R, st):
    """The set belongs to the characters' world: its visual signature (saturation, contrast, shadow depth, warmth,
    detail, flat areas — style.py) lies in the band of the troupe's own drawings, feature by feature."""
    import style as stylemod
    cmp_ = stylemod.compare(st['decor'], st['ref'])
    labels = {'saturation': 'saturation', 'saturation_p90': 'couleurs vives', 'contraste': 'contraste', 'profondeur': 'profondeur des ombres',
              'chaleur': 'chaleur', 'detail': 'richesse de détail', 'aplats': 'aplats (surfaces sans matière)'}
    for k, (v, lo, hi, ok) in cmp_.items():
        R.tally('style', ok)
        if not ok:
            sev = 'majeur' if k in ('detail', 'aplats') else 'mineur'
            R.add('image', sev, f"décor hors du style des personnages — {labels[k]} : {v:.3f} (troupe : {lo:.3f}–{hi:.3f}) : deux mondes à l’image")
    R.stats['style'] = {'decor': {k: round(v, 3) for k, v in st['decor'].items()}, 'troupe_dessins': st['ref'].get('_n'),
                        'hors_plage': [k for k, v in cmp_.items() if not v[3]]}


def _cam_at(scene, ob, f, cc=None, dc=None):
    """The view of a camera at frame f, its move included (location, focal length — zooms —, lens shift): the camera
    tuple (x, y, z, ox, oz) for framing.* and its half-extents (tan_h, tan_v)."""
    import framing
    cc = _curves(ob) if cc is None else cc
    dc = _curves(ob.data) if dc is None else dc
    ev = lambda c, path, i, base: c[(path, i)].evaluate(f) if (path, i) in c else base
    loc = [ev(cc, 'location', i, ob.location[i]) for i in range(3)]
    asp = scene.render.resolution_x / max(1, scene.render.resolution_y)
    th, tv, ox, oz = framing.lens_view(ev(dc, 'lens', 0, ob.data.lens), ev(dc, 'shift_x', 0, ob.data.shift_x), ev(dc, 'shift_y', 0, ob.data.shift_y),
                                       ob.data.sensor_fit, asp, ob.data.sensor_width)
    return (loc[0], loc[1], loc[2], ox, oz), th, tv


def _curves(ob):
    out = {}
    ad = ob.animation_data
    if ad and ad.action:
        for fc in _fcurves(ad.action):
            out[(fc.data_path, fc.array_index)] = fc
    return out


def _card(root, name):
    """The drawn card of an extra (never its contact shadow, which hangs from the same root)."""
    if root is None:
        return None
    cards = [c for c in root.children if c.type == 'MESH' and c.name.split('.')[0] == f'figurant-{name}']
    return max(cards, key=lambda c: c.dimensions.z, default=None)


LIVING = ('prop-', 'poule-', 'coq-', 'chevre-', 'chien-', 'chat-', 'canard-', 'pigeon-', 'vache-', 'antilope-', 'singe-', 'oiseau-',
          'margouillat-', 'papillon-', 'luciole-')
AIRBORNE = ('oiseau-', 'papillon-', 'luciole-', 'margouillat-')


def check_atelier(R, scene, objs):
    """Every animal and every object of the scene must be in the troupe's style and obey physics:
      • STYLE   — built by the workshop (atelier.py: real shape, troupe material) or forged from a real free photo redrawn
                  in the troupe's style (asset-forge.py); a raw primitive with a flat colour is a major fault;
      • SIZE    — its real size (a hen ~0.4 m, a crate ~0.3 m: atelier.REAL_SIZE / the forge's measured height);
      • SUPPORT — what stands on the ground touches it (no floating, nothing sunk);
      • FEET    — no object set down on an actor's feet (an object « through » a foot)."""
    import bpy
    try:
        import atelier as AT
        real = AT.REAL_SIZE
    except Exception:
        real = {}
    scene.frame_set(scene.frame_start)
    roots = [o for o in objs if o.type == 'EMPTY' and o.parent is None and o.name.lower().startswith(LIVING)]
    feet = [(o, tuple(o['pieds'])) for o in objs if o.get('pieds') is not None]
    for r in roots:
        meshes = [c for c in r.children_recursive if c.type == 'MESH' and len(c.data.polygons) and not c.get('shell') and not c.hide_render]
        if not meshes:
            continue
        styled = bool(r.get('atelier')) and all(c.get('atelier') or any(m and m.get('atelier') for m in c.data.materials) or c.name.startswith('carte-') for c in meshes)
        R.tally('style', styled)
        if not styled:
            R.add('atelier', 'majeur', 'objet ou animal hors style (primitive, couleur plate) : il doit venir de l’atelier ou de la forge', r.name)
        lo, hi = _union_bbox(meshes)
        h = hi[2] - max(0.0, lo[2])
        kind = re.sub(r'^(prop-)?([a-zé]+).*$', r'\2', r.name.lower())
        rng = real.get(kind)
        if r.get('hauteur') and not rng:
            rng = (0.75 * float(r['hauteur']), 1.3 * float(r['hauteur']))
        if rng and not r.name.lower().startswith(AIRBORNE):
            ok = rng[0] * 0.7 <= h <= rng[1] * 1.4
            R.tally('tailles', ok)
            if not ok:
                R.add('atelier', 'majeur', f'{kind} à une taille irréelle ({h:.2f} m, attendu {rng[0]:.2f}–{rng[1]:.2f} m)', r.name, round(h, 3))
        if not r.name.lower().startswith(AIRBORNE):
            ok = -0.03 <= lo[2] <= 0.03
            R.tally('physique', ok)
            if lo[2] > 0.03:
                R.add('atelier', 'majeur', f'{kind} qui flotte ({lo[2]:.2f} m au-dessus du sol)', r.name, round(lo[2], 3))
            elif lo[2] < -0.03:
                R.add('atelier', 'majeur', f'{kind} enfoncé dans le sol ({lo[2]:.2f} m)', r.name, round(lo[2], 3))
        if r.get('emprise_x') is not None:
            a, b = tuple(r['emprise_x'])
            for o, (fa, fb) in feet:
                x = o.matrix_world.translation.x
                hit = min(b, x + fb) - max(a, x + fa) > 0.0 and abs(o.matrix_world.translation.y - r.matrix_world.translation.y) < 0.6
                R.tally('physique', not hit)
                if hit:
                    R.add('atelier', 'majeur', f'{kind} posé sur les pieds de {o.name.replace("-root", "")} (un pied le traverserait)', r.name)


def check_plausibility(R, scene, life, actors, cam=None):
    """Physics and human laws on every person of the scene (plausibility.py): two bodies never in the same place;
    people who talk stand at conversation distance (Hall's personal zone) and never cover each other on screen; an
    extra keeps the social distance from the actors' conversation; a jump lasts what gravity allows; nobody walks
    faster than a human."""
    import plausibility as P
    import framing
    fps = scene.render.fps or 30
    f0, f1 = scene.frame_start, scene.frame_end
    people = []
    for a in actors:
        ob = scene.objects.get(a['root'])
        if ob is not None:
            people.append({'nom': a['nom'], 'ob': ob, 'w': a['w'], 'h': a['h'], 'kind': 'acteur', 'group': 'dialogue', 'act': '', 'fx': a.get('fx', 0.0), 'fz': a.get('fz', 0.85 * a['h']),
                           'looks': a.get('looks') or {}, 'track': a.get('track') or [], 'faces': a.get('faces') or {}, 'points': a.get('points') or {}})
    for e in (life or {}).get('extras', []):
        ob = scene.objects.get(f"figurant-root-{e['name']}")
        card = _card(ob, e['name'])
        if ob is not None and card is not None:
            people.append({'nom': e['name'], 'ob': ob, 'w': card.dimensions.x, 'h': card.dimensions.z, 'fdx': card.get('face_dx', 0.0), 'fzc': card.get('face_z'),
                           'kind': 'passant' if e['behavior'] == 'passe' else 'figurant',
                           # people who talk = the « discute » extras of one slot (derived here, not taken from the generator)
                           'group': f"{e.get('role')}-discute" if e['behavior'] == 'discute' else None, 'act': e.get('activite', '')})
    for n in ((life or {}).get('crowd') or {}).get('names', []):
        ob = scene.objects.get(f'foule-root-{n}')
        card = _card(ob, n)
        if ob is not None and card is not None:
            people.append({'nom': n, 'ob': ob, 'w': card.dimensions.x, 'h': card.dimensions.z, 'kind': 'foule', 'group': None, 'act': ''})
    if len(people) < 2:
        return
    for p in people:
        p['c'] = _curves(p['ob'])
    C0 = (cam or {}).get('grid', {}).get('C0') or (0.0, -2.4, 1.0)

    def st(p, f):
        ob, c = p['ob'], p['c']
        ev = lambda path, i, base: c[(path, i)].evaluate(f) if (path, i) in c else base
        loc = [ev('location', i, ob.location[i]) for i in range(3)]
        sc = [ev('scale', i, ob.scale[i]) for i in range(3)]
        hidden = ev('hide_render', 0, 1.0 if ob.hide_render else 0.0) > 0.5
        sol = ev('["sol"]', 0, None) if ('["sol"]', 0) in c else None
        s = abs(sc[1]) if p['kind'] != 'acteur' else 1.0
        w = p['w'] * (abs(sc[0]) if p['kind'] != 'acteur' else 1.0)
        # Where the person really is in the story: an extra pulled toward the lens by the painted relief (same place
        # and size on screen, scale s) stands, for the laws, at its unpulled place C0 + (P − C0) / s.
        sv = max(s, 1e-3)
        return {'x': loc[0], 'y': loc[1], 'z': loc[2], 's': s, 'w': w, 'h': p['h'] * (abs(sc[2]) if p['kind'] != 'acteur' else 1.0),
                'xv': C0[0] + (loc[0] - C0[0]) / sv, 'yv': C0[1] + (loc[1] - C0[1]) / sv, 'wv': w / sv,
                'on': not hidden and s > 1e-3, 'sol': sol}

    talkers = lambda a, b: a['group'] is not None and a['group'] == b['group']
    pairs = [(i, j) for i in range(len(people)) for j in range(i + 1, len(people))]
    # 1. Bodies never in the same place (every 3 frames, whole film).
    hit = {}
    for f in range(f0, f1 + 1, 3):
        S = [st(p, f) for p in people]
        for i, j in pairs:
            a, b = S[i], S[j]
            if a['on'] and b['on'] and (i, j) not in hit and abs(a['yv'] - b['yv']) < P.BODY_DEPTH and P.gap1d(P.core(a['xv'], a['wv']), P.core(b['xv'], b['wv'])) < 0:
                hit[(i, j)] = f
    for i, j in pairs:
        R.tally('physique', (i, j) not in hit)
    for (i, j), f in list(hit.items())[:12]:
        R.add('physique', 'majeur', f"{people[i]['nom']} et {people[j]['nom']} occupent le même endroit à l’image {f} (deux corps ne s’interpénètrent pas)", people[i]['nom'])
    # 2. Proxemics (Hall): who talks stands in the personal zone; an extra keeps the social distance from the actors.
    S1 = [st(p, f0) for p in people]
    acts = [k for k, p in enumerate(people) if p['kind'] == 'acteur']
    for i, j in pairs:
        a, b = people[i], people[j]
        if talkers(a, b) and S1[i]['on'] and S1[j]['on']:
            d = math.hypot(S1[i]['xv'] - S1[j]['xv'], S1[i]['yv'] - S1[j]['yv'])
            ok = P.HALL['intime'] <= d <= P.HALL['personnelle'] + 0.02
            R.tally('physique', ok)
            if not ok:
                R.add('physique', 'mineur', f"{a['nom']} et {b['nom']} se parlent à {d:.2f} m (zone {P.zone(d)}) : une conversation se tient à 0,45–1,2 m (proxémie de Hall)", a['nom'])
    for k, p in enumerate(people):
        if p['kind'] != 'figurant' or not S1[k]['on']:
            continue
        d = min((math.hypot(S1[k]['xv'] - S1[a]['xv'], S1[k]['yv'] - S1[a]['yv']) for a in acts), default=9.0)
        ok = d >= P.HALL['personnelle']
        R.tally('physique', ok)
        if not ok:
            R.add('physique', 'mineur', f"{p['nom']} se tient à {d:.2f} m des acteurs, dans la zone personnelle de leur conversation (distance sociale ≥ 1,2 m)", p['nom'])
    # 3. On screen, shot by shot: people who talk never cover each other; nobody covers anybody on the same plane.
    if cam:
        worst, split, eyeline = {}, {}, {}
        shots = cam['shots']
        for n, sh in enumerate(shots):
            ob = scene.objects.get(sh.get('camera') or f"cam{sh['k']}")
            if ob is None:
                continue
            cc = _curves(ob)
            end = shots[n + 1]['start'] if n + 1 < len(shots) else sh['end']
            for f in sorted({sh['start'] + 1, (sh['start'] + end) // 2 + 1, max(sh['start'] + 1, end)}):
                camloc, th_, tv_ = _cam_at(scene, ob, f, cc)
                S = [st(p, f) for p in people]
                boxes = []
                for q in S:
                    b = P.screen_box(framing.project, camloc, th_, tv_, q['x'], q['y'], q['w'], q['h'], q['z']) if q['on'] else None
                    boxes.append(b if b and b[2] > 0 and b[0] < 1 and b[3] > 0 and b[1] < 1 else None)
                # A background conversation is seen whole or hidden whole (never one face visible, the other behind an actor).
                if sh['type'] == 'two':
                    for i, j in pairs:
                        a, b = people[i], people[j]
                        if not talkers(a, b) or a['kind'] == 'acteur' or boxes[i] is None or boxes[j] is None:
                            continue
                        hid = []
                        for k_ in (i, j):
                            occ = [(boxes[m][0], boxes[m][2]) for m in acts if boxes[m] is not None and S[m]['yv'] < S[k_]['yv']]
                            hid.append(P.hidden_share((boxes[k_][0], boxes[k_][2]), occ))
                        if abs(hid[0] - hid[1]) > 0.5:
                            split.setdefault((i, j), (sh['k'], f))
                    # Faces: a background face is never glued to an actor's face (merger) nor in the speakers' eyeline.
                    pr = lambda pt: framing.project(camloc, th_, tv_, pt)
                    asp_ = th_ / tv_
                    af, rr, bodies = [], [], []
                    for m in acts:
                        if boxes[m] is None:
                            continue
                        # the face of the pose PLAYED at this frame (each pose is turned toward the partner on its own)
                        kind = 'neutre'
                        for f0_, k_p in people[m].get('track', []):
                            if f0_ < f:
                                kind = k_p
                        fxz = people[m].get('faces', {}).get(kind) or [people[m].get('fx', 0.0), people[m].get('fz', 0.85 * people[m]['h'])]
                        hx, hz = S[m]['x'] + fxz[0], fxz[1]
                        u_, v_, _ = pr((hx, S[m]['y'], hz))
                        u2, _v2, _ = pr((hx + P.HEAD, S[m]['y'], hz))
                        af.append((u_ * asp_, v_))
                        rr.append(abs(u2 - u_) * asp_)
                        bodies.append((boxes[m][0] * asp_, pr((hx, S[m]['y'], hz - 0.2))[1], boxes[m][2] * asp_, boxes[m][3]))
                    af.sort()
                    ref = [boxes[m][3] - boxes[m][1] for m in acts if boxes[m] is not None]
                    for k_, q in enumerate(people):
                        if q['kind'] != 'figurant' or boxes[k_] is None or not af:
                            continue
                        sc_x = q['ob'].scale.x if ('scale', 0) not in q['c'] else q['c'][('scale', 0)].evaluate(f)
                        fzw = (q['fzc'] * S[k_]['h'] / max(q['h'], 1e-6)) if q.get('fzc') is not None else 0.88 * S[k_]['h']
                        fx_, fy_, _d = pr((S[k_]['x'] + q.get('fdx', 0.0) * sc_x, S[k_]['y'], S[k_]['z'] + fzw))
                        if fx_ is None or not (0 <= fx_ <= 1 and 0 <= fy_ <= 1):
                            continue
                        size = ((boxes[k_][3] - boxes[k_][1]) / max(1e-6, S[k_]['h'] / max(S[k_]['s'], 1e-3))) / max(1e-6, max(ref) / max(people[m]['h'] for m in acts))
                        law = P.face_conflict((fx_ * asp_, fy_), af, max(rr), size <= P.BACKGROUND, size, bodies, (0.0, 0.0, asp_, 1.0))
                        if os.environ.get('MASSAMBA_DEBUG_EYE') and f == int(os.environ['MASSAMBA_DEBUG_EYE']):
                            print('[eye]', json.dumps({'nom': q['nom'], 'face': [fx_ * asp_, fy_], 'actors': af, 'r': max(rr), 'bodies': bodies, 'size': size, 'law': law, 'asp': asp_}), flush=True)
                        if law:
                            eyeline.setdefault(k_, (sh['k'], f, size, law))
                for i, j in pairs:
                    if boxes[i] is None or boxes[j] is None:
                        continue
                    a, b = people[i], people[j]
                    both_actors = a['kind'] == b['kind'] == 'acteur'
                    same_plane = abs(S[i]['yv'] - S[j]['yv']) < P.SAME_PLANE
                    standing = a['kind'] in ('acteur', 'figurant') or b['kind'] in ('acteur', 'figurant')
                    # Two walkers crossing each other is life; a body sliding over someone who stands at the same
                    # depth is a superposition.
                    if not (talkers(a, b) or both_actors or (same_plane and standing)):
                        continue
                    ov = P.box_overlap(boxes[i], boxes[j])
                    lim = 0.05 if (talkers(a, b) or both_actors) else 0.15
                    key = (i, j)
                    if ov > lim and ov > worst.get(key, (0,))[0]:
                        worst[key] = (ov, sh['k'], f, talkers(a, b) or both_actors)
        checked = [(i, j) for i, j in pairs if talkers(people[i], people[j]) or people[i]['kind'] == people[j]['kind'] == 'acteur']
        for key in checked:
            R.tally('personnages', key not in worst)
        for i, j in pairs:
            if talkers(people[i], people[j]) and people[i]['kind'] != 'acteur':
                R.tally('personnages', (i, j) not in split)
        for k_, p in enumerate(people):
            if p['kind'] == 'figurant':
                R.tally('personnages', k_ not in eyeline)
        for k_, (k, f, size, law) in eyeline.items():
            what = ('a le visage collé à celui d’un acteur (deux têtes qui se confondent)' if law == 'fusion'
                    else 'se tient dans la ligne de regard des interlocuteurs')
            R.add('image', 'majeur' if law == 'fusion' else 'mineur', f"plan {k + 1} : {people[k_]['nom']} {what} ({size:.0%} de leur taille, image {f})", people[k_]['nom'])
        for (i, j), (k, f) in split.items():
            R.add('physique', 'mineur', f"plan {k + 1} : la conversation de {people[i]['nom']} et {people[j]['nom']} est coupée par un acteur (l’un visible, l’autre caché, image {f})", people[i]['nom'])
        for (i, j), (ov, k, f, talk) in worst.items():
            what = 'interlocuteurs superposés à l’écran' if talk else 'superposés au même plan'
            R.add('physique', 'majeur', f"plan {k + 1} : {people[i]['nom']} et {people[j]['nom']} {what} ({ov:.0%} de la silhouette, image {f})", people[i]['nom'])
    # 4. Gravity: a lift off the ground lasts no longer than the flight of a jump of that height.
    floats = []
    for p in people:
        if ('["sol"]', 0) not in p['c']:
            continue
        run, top, s_ = 0, 0.0, 1.0
        for f in range(f0, f1 + 2):
            q = st(p, f) if f <= f1 else None
            lift = (q['z'] - q['sol']) if q and q['on'] and q['sol'] is not None else 0.0
            if lift > 0.004:
                run += 1
                top = max(top, lift)
                s_ = q['s'] or 1.0
            elif run:
                h = top / max(s_, 1e-3)
                if run / fps > P.airtime(h) * 1.25 + 2.0 / fps:
                    floats.append((p['nom'], f - run, run / fps, h))
                run, top = 0, 0.0
        R.tally('physique', not any(x[0] == p['nom'] for x in floats))
    for nom, f, T, h in floats[:8]:
        R.add('physique', 'majeur', f"{nom} reste {T:.2f} s en l’air pour un saut de {h * 100:.0f} cm (gravité : {P.airtime(h):.2f} s)", nom)
    # 5. Human speed (walkers), normalised by the depth pull of the painted relief.
    fast = []
    win = max(1, int(0.5 * fps))
    for p in people:
        if p['kind'] not in ('passant', 'foule'):
            continue
        vmax = P.RUN_MAX if re.search(r'court|dribble|course', p['act'] or '') else P.WALK_MAX
        prev, top = None, 0.0
        for f in range(f0, f1 + 1, win):
            q = st(p, f)
            if prev is not None and q['on'] and prev['on']:
                dist = math.hypot(q['xv'] - prev['xv'], q['yv'] - prev['yv'])
                if dist < 3.0:  # (a walker re-entering on the other side, off-screen, is not a move)
                    top = max(top, dist / (win / fps))
            prev = q
        R.tally('physique', top <= vmax)
        if top > vmax:
            fast.append((p['nom'], top, vmax))
    for nom, v, vmax in fast[:8]:
        R.add('physique', 'mineur', f"{nom} se déplace à {v:.1f} m/s (humain : ≤ {vmax:.1f} m/s)", nom)
    # 6. Eye contact: in every shot, each actor on stage looks toward the one they talk with (gaze of the pose played).
    if cam and len(acts) >= 2:
        wrong = []
        for sh in cam['shots']:
            for f in sorted({sh['start'] + 1, (sh['start'] + sh['end']) // 2 + 1}):
                S = [st(p, f) for p in people]
                for m in acts:
                    p = people[m]
                    if not p['looks'] or not S[m]['on']:
                        continue
                    kind = 'neutre'
                    for f0_, k_ in p['track']:
                        if f0_ < f:
                            kind = k_
                    lk = p['looks'].get(kind, p['looks'].get('neutre', 0))
                    others = [S[o]['xv'] for o in acts if o != m and S[o]['on']]
                    if not others or not lk:
                        continue
                    near = min(others, key=lambda x: abs(x - S[m]['xv']))
                    want = 1 if near > S[m]['xv'] else -1
                    ok = lk == want
                    R.tally('personnages', ok)
                    if not ok:
                        wrong.append((p['nom'], kind, sh['k'], f))
        for nom, kind, k, f in wrong[:8]:
            R.add('physique', 'majeur', f"plan {k + 1} : {nom} ne regarde pas son interlocuteur (pose « {kind} », image {f})", nom)
        # 7. Pointing law (as the viewer reads it): the line elbow → fingertip of a pointing pose meets the partner's face
        #    (≤ 15 cm away).
        bad_point, n_point = [], 0
        for m in acts:
            p = people[m]
            for kind, pt in (p.get('points') or {}).items():
                frames_k = [f0_ for f0_, k_ in p['track'] if k_ == kind]
                if not frames_k:
                    continue
                f = frames_k[0] + 1
                S = [st(q, f) for q in people]
                th = pt.get('theta', 0.0)
                E, T = pt['E'], pt['T']
                vx_, vz_ = T[0] - E[0], T[1] - E[1]
                tip = (E[0] + vx_ * math.cos(th) + vz_ * math.sin(th), E[1] - vx_ * math.sin(th) + vz_ * math.cos(th))
                eye = (E[0], E[1])  # the line starts at the elbow: the forearm and the index
                others = [o for o in acts if o != m]
                if not others:
                    continue
                o = min(others, key=lambda o_: abs(S[o_]['xv'] - S[m]['xv']))
                okind = 'neutre'
                for f0_, k_ in people[o]['track']:
                    if f0_ < f:
                        okind = k_
                ofz = people[o]['faces'].get(okind) or [people[o].get('fx', 0.0), people[o].get('fz', 1.4)]
                tgt = (S[o]['xv'] - S[m]['xv'] + ofz[0], ofz[1])
                dx_, dz_ = tip[0] - eye[0], tip[1] - eye[1]
                L = math.hypot(dx_, dz_) or 1e-6
                ux, uz = dx_ / L, dz_ / L
                ahead = (tgt[0] - eye[0]) * ux + (tgt[1] - eye[1]) * uz > L
                perp = abs((tgt[0] - eye[0]) * uz - (tgt[1] - eye[1]) * ux)
                ok = ahead and perp <= 0.15
                n_point += 1
                R.tally('personnages', ok)
                if not ok:
                    bad_point.append((p['nom'], kind, people[o]['nom'], perp, f))
        for nom, kind, onom, perp, f in bad_point[:6]:
            R.add('physique', 'majeur', f"{nom} pointe du doigt (pose « {kind} ») mais le prolongement de son bras passe à {perp * 100:.0f} cm du visage de {onom} : il semble désigner quelqu’un d’autre (image {f})", nom)
        R.stats['gestes'] = {'pointages': n_point, 'mal_vises': len(bad_point)}
        R.stats['regards'] = {'verifies': sum(1 for _ in cam['shots']) * 2 * len(acts), 'detournes': len(wrong)}
    R.stats['physique'] = {'personnes': len(people), 'paires': len(pairs), 'corps_superposes': len(hit), 'sauts_irrealistes': len(floats), 'vitesses_excessives': len(fast)}


def bpy_ctx():
    import bpy
    return bpy.context


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
        comps.append(('population', min(1.0, (len(life.get('extras', [])) + len(life.get('animals', [])) + int((life.get('crowd') or {}).get('n', 0))) / 3.0)))
        comps.append(('ambiance sonore', min(1.0, len(life.get('sons', [])) / 2.0)))
        comps.append(('effets', min(1.0, len(life.get('fx', [])) / 2.0)))
        comps.append(('objets de l’action', 1.0 if life.get('props') else 0.5))
        layers = sum([any(n.startswith('decor') or n.startswith('plaster') or n.startswith('ground') for n in names),
                      bool(life.get('extras') or life.get('animals')), bool(life.get('props'))])
        comps.append(('profondeur (plans)', layers / 3.0))
    else:
        furn = sum(1 for o in objs if o.type == 'MESH' and not _is_shell(o)) + R.m.get('_instances', 0) / 10.0
        comps.append(('richesse du décor', min(1.0, furn / 60.0)))
        outdoor = bool((life or {}).get('exterieur'))
        comps.append(('lumière vivante', 1.0 if outdoor else min(1.0, sum(1 for o in objs if o.type == 'LIGHT' and o.data.type in ('POINT', 'SPOT')) / 1.0 + (0.5 if any(n.startswith('glow') for n in names) else 0))))
        comps.append(('profondeur de champ', 1.0 if outdoor or any(n.startswith(('sky', 'woodmango', 'skyline')) for n in names) else 0.4))
        comps.append(('matières', (R.ratio('materiaux_riches') or 0) / 100.0))
    R.m['_immersion'] = 100.0 * sum(v for _, v in comps) / len(comps) if comps else None
    R.stats['immersion'] = {k: round(v, 2) for k, v in comps}


# ---------------------------------------------------------------------------------------------------------------------
def run(kind='scene', subject='', story=None, life=None, cast=None, drawn=None, probe_frames=(), autofix=True, out=None, render_checks=True, cuts=(),
        cameras=None, image=None, people=None, style=None):
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
    check_face_parts(R, objs)
    check_fluidity(R, scene, cuts)
    check_narrative(R, story, life, objs, drawn=drawn)
    check_casting(R, life)
    if cameras:
        check_cameras(R, scene, cameras)
    if people is not None or life:
        check_plausibility(R, scene, life, people or [], cameras)
    if style:
        check_style(R, style)
    check_atelier(R, scene, objs)
    if image:
        check_image(R, image)
    if kind == 'decor':
        check_enclosure(R, scene, life)
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
