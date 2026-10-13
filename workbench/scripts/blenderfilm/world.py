"""MONDE VIVANT — ce qui vit autour des acteurs, dans le film Blender :
  • FIGURANTS : des personnages de la troupe qui FRÉQUENTENT le lieu (d'après leur fiche : « lieux », « activité »),
    posés sur le sol peint en perspective, qui passent, attendent, discutent, font la queue, travaillent, regardent —
    et réagissent à la chute ;
  • ANIMAUX (construits en 3D) : poules qui picorent, chèvre qui broute, oiseaux qui traversent le ciel, pigeons, chat
    qui dort, chien qui trotte, margouillat qui fait ses pompes sur le mur, canards ;
  • OBJETS de l'action : ceux que les répliques citent (poulet, ballon, bouteilles, valise, tomates, billets, gâteau…)
    sont posés dès la première image près du personnage qui en parle, et s'animent quand il en parle ;
  • AMBIANCE : poussière dans la lumière, rayons, vapeur, feuilles qui tombent, guirlandes lumineuses, ventilateur,
    variante de lumière (jour, dorée, soir, nuit) ;
  • LIEUX SANS DÉCOR PEINT (centre commercial, parc, chambre, tout lieu nouveau) : un décor 3D construit sur un gabarit
    (pièce, hall, rue, parc) aux couleurs du lieu.

Deux parties : plan_life() (pur Python, appelé par plan.py) choisit tout de façon déterministe ; build_life() (dans
Blender, appelé par scene.py) le construit et l'anime. Catalogue des lieux : world.json (écrit depuis l'app).
"""
import json, math, os, random, re, unicodedata
import rules as genrules  # generation rules (hardened by the root-cause analysis of the conformity check)
import casting  # who may stand in the background of a place, doing what its drawing shows
import plausibility  # physics and human laws (proxemics, gravity, walking speeds, bodies never overlapping)

HERE = os.path.dirname(os.path.abspath(__file__))


def fold(t):
    t = unicodedata.normalize('NFD', t or '')
    return ''.join(c for c in t if unicodedata.category(c) != 'Mn').lower().replace('’', ' ').replace("'", ' ')


def load_catalogue():
    world = json.load(open(os.path.join(HERE, 'world.json'), encoding='utf-8'))
    chars = json.load(open(os.path.join(HERE, 'characters.json'), encoding='utf-8'))
    return world, chars


def place_of(text, world):
    t = fold(text)
    by_id = {p['id']: p for p in world['places']}
    for pid in world['priority']:
        p = by_id[pid]
        if re.search(p['match'], t):
            return p
    return None


def place_for(story, world, decors):
    """The place of the story: explicit `place`, else its décor / title / lines; a kit décor wins when it exists."""
    text = ' '.join([story.get('place', ''), story.get('decor', ''), story.get('title', '')])
    p = place_of(text, world)
    if p is None:
        p = place_of(' '.join(b['text'] for b in story.get('beats', [])), world)
    if p is None:
        out = bool(re.search(r'\b(dehors|exterieur|terrain|stade|chantier|route|foret|riviere)\b', fold(text)))
        p = {'id': 'nouveau', 'nom': story.get('place') or story.get('decor') or 'Nouveau lieu', 'exterieur': out, 'template': 'rue' if out else 'piece',
             'palette': ['#e0a96d', '#6d9dc5', '#c44536'] if out else ['#efe1c6', '#8a5a44', '#3d8b8b'], 'habitues': ['Taxi', 'Marché'] if out else ['Salon', 'Bureau'],
             'heure': 'jour', 'objets': [], 'pnj': [{'role': 'passants', 'comportement': 'passe', 'n': [1, 2]}], 'animaux': [], 'fx': ['poussiere'], 'sons': ['foule'], 'vie': ''}
    p = dict(p)
    kit = story.get('decor') if story.get('decor') in decors else (p.get('kit') if p.get('kit') in decors else None)
    p['use_kit'] = kit
    return p


# ── PLAN (pur Python) ────────────────────────────────────────────────────────────────────────────────────────────────
def plan_life(story, timeline, cast_names, rig, fps, nF, seed=None):
    """Everything that lives around the actors, decided once for the whole film (deterministic: same story → same world)."""
    world, chars = load_catalogue()
    decors = rig.get('decors', {})
    place = place_for(story, world, decors)
    rnd = random.Random(seed if seed is not None else sum(ord(c) for c in story.get('title', 'film')))
    drawn = set(rig['cast'].keys())
    busy = set(cast_names)
    hab = set(place.get('habitues', [])) | {place.get('nom', '')}
    RULES = genrules.load()
    regulars = [n for n, c in chars.items() if n in drawn and n not in busy and hab & set(c.get('lieux', []))]
    # Only the regulars of the place appear in its background (generation rule — a character never wanders into a
    # place its sheet does not list).
    others = [] if RULES.get('casting_regulars_only', True) else [n for n in drawn if n not in busy and n not in regulars]
    rnd.shuffle(regulars)
    rnd.shuffle(others)
    pool = regulars + others
    drawn_ok = lambda n, beh: (not RULES.get('casting_drawn_action', True)) or casting.verdict(chars.get(n, {}), hab, beh, n)[0]
    life = {'place': place['id'], 'nom': place['nom'], 'kit': place['use_kit'], 'template': place['template'], 'palette': place.get('palette', []),
            'exterieur': bool(place.get('exterieur')), 'grade': story.get('grade') or ('naturel' if place['use_kit'] else place.get('heure', 'jour')),
            'extras': [], 'animals': [], 'props': [], 'fx': list(place.get('fx', [])), 'sons': list(place.get('sons', [])),
            'objets': [o['id'] for o in place.get('objets', [])], 'habitues': sorted(hab)}
    punch_t = None
    if story.get('punch') and timeline:
        seg = timeline[story['punch']['beat']]
        punch_t = seg['speak1']
    total = nF / fps
    # Extras: the place's slots, filled by its regulars (the sheet's activity becomes their action).
    side = 1
    def fits(name, role):
        c = chars.get(name, {})
        g, age = c.get('genre', ''), c.get('age', 35)
        r = fold(role)
        if re.search(r'enfant|eleve|ecolier', r):
            return g in ('garçon', 'fille')
        if re.search(r'femme|vendeuse|cliente|coiffeuse|serveuse|cuisiniere|voisine|baigneuse', r):
            return g == 'femme'
        if re.search(r'ancien|vieux|doyen', r):
            return age >= 55
        if re.search(r'pecheur|apprenti|vigile|serveur|joggeur', r):
            return g == 'homme'
        return g not in ('garçon', 'fille') or re.search(r'passant|promeneur|voyageur|baigneur|famille', r) is not None

    for slot in place.get('pnj', []):
        lo, hi = slot['n']
        k = rnd.randint(lo, hi)
        beh = slot['comportement']
        if beh == 'foule':
            # Autonomous walkers that avoid each other — drawn by the troupe's own artist (same style as the actors:
            # a painted world never gets flat 3D mannequins), the characters not already on stage.
            names = [n for n in reversed(pool) if drawn_ok(n, 'foule')][:min(k, 8)]
            for n in names:
                pool.remove(n)
            if names:
                life['crowd'] = {'n': len(names), 'names': names, 'seed': rnd.randint(0, 10 ** 6), 'role': slot['role']}
            continue
        group = []
        generic = re.search(r'passant|promeneur|voyageur|client|baigneur|invite|public|patient|collegue|badaud|membre|temoin|joggeur|danseur', fold(slot['role'])) is not None
        # The candidates whose drawing fits the place and the behaviour; the ones whose drawing shows the job first.
        cands = lambda: sorted((n for n in pool if (generic or n in regulars) and fits(n, slot['role']) and drawn_ok(n, beh)),
                               key=lambda n: -casting.role_match(chars.get(n, {}), slot['role']))
        for _ in range(k):
            pick = next(iter(cands()), None)
            if pick is None:
                break
            pool.remove(pick)
            group.append(pick)
        if not group:
            continue
        if beh == 'discute' and len(group) == 1:
            pick = next(iter(cands()), None)
            if pick:
                pool.remove(pick)
                group.append(pick)
        if beh == 'passe':
            for n in group:
                d = rnd.choice([-1, 1])
                passes = []
                t = rnd.uniform(0.5, 6.0)
                while t < total - 2:
                    dur = rnd.uniform(5.5, 8.5)
                    passes.append([round(t, 2), round(min(total, t + dur), 2), d])
                    d = -d
                    t += dur + rnd.uniform(4.0, 12.0)
                life['extras'].append({'name': n, 'behavior': 'passe', 'depth': round(rnd.uniform(1.0, 1.8), 2), 'passes': passes, 'role': slot['role'],
                                       'activite': chars.get(n, {}).get('activite', '')})
        else:
            base_u = side * rnd.uniform(0.5, 0.78)
            side = -side
            depth = round(rnd.uniform(0.9, 1.6), 2)
            for j, n in enumerate(group):
                du = (j - (len(group) - 1) / 2) * (0.16 if beh in ('discute', 'file') else 0.22)
                life['extras'].append({'name': n, 'behavior': beh, 'u': round(base_u + du, 3), 'depth': round(depth + (0.12 * j if beh == 'file' else 0), 2), 'role': slot['role'],
                                       'face': (1 if j % 2 == 0 else -1) if beh == 'discute' else rnd.choice([-1, 1]), 'phase': round(rnd.uniform(0, 6.28), 2),
                                       'activite': chars.get(n, {}).get('activite', '')})
    # Animals of the species of the place.
    for ai, a in enumerate(place.get('animaux', [])):
        # The signature animal of the place (first, or very likely) is always there; the others by chance.
        if not (ai == 0 or a['p'] >= 0.85) and rnd.random() > a['p']:
            continue
        for _ in range(rnd.randint(*a['n'])):
            # Each animal its own spot: never two bodies in the same place (checked again by the preflight).
            su, sd = RULES['animal_spacing_u'], RULES['animal_spacing_depth']
            for _try in range(40):
                u, dep = round(rnd.choice([-1, 1]) * rnd.uniform(0.35, 0.95), 3), round(rnd.uniform(0.45, 1.3), 2)
                if all(abs(u - o['u']) > su or abs(dep - o['depth']) > sd for o in life['animals']):
                    break
            life['animals'].append({'species': a['espece'], 'behavior': a['comportement'], 'u': u, 'depth': dep,
                                    'phase': round(rnd.uniform(0, 6.28), 2), 'dir': rnd.choice([-1, 1]), 'speed': round(rnd.uniform(0.7, 1.3), 2)})
    # Props the lines mention, set from the first frame next to the actor who first speaks of them (no object popping in).
    seen = set()
    for i, b in enumerate(story.get('beats', [])):
        t = fold(b['text'])
        for o in place.get('objets', []) + EXTRA_PROPS:
            if o['id'] in seen:
                continue
            if any(re.search(r'\b' + re.escape(fold(m)), t) for m in o['mots']):
                seen.add(o['id'])
                when = timeline[i]['speak0'] if i < len(timeline) else 0
                life['props'].append({'kind': o['id'], 'near': b['who'], 'beat': i, 'at': round(when, 2), 'nom': o['nom']})
    life['punch'] = round(punch_t, 2) if punch_t is not None else None
    return life


# Objects any place can hold when a line names them.
EXTRA_PROPS = [
    {'id': 'orange', 'nom': 'orange', 'mots': ['orange']},
    {'id': 'ballon', 'nom': 'ballon', 'mots': ['ballon']},
    {'id': 'poulet', 'nom': 'plat de poulet', 'mots': ['poulet']},
    {'id': 'gateau', 'nom': 'gâteau', 'mots': ['gâteau', 'anniversaire']},
    {'id': 'bouteilles', 'nom': 'bouteilles', 'mots': ['bouteille']},
    {'id': 'valise', 'nom': 'valise', 'mots': ['valise']},
    {'id': 'tomates', 'nom': 'tomates', 'mots': ['tomate']},
    {'id': 'papiers', 'nom': 'papiers', 'mots': ['bulletin', 'facture', 'papier', 'dossier']},
    {'id': 'assiette', 'nom': 'assiette', 'mots': ['garba', 'attiéké', 'alloco', 'poisson']},
]


# ── CONSTRUCTION (dans Blender) ─────────────────────────────────────────────────────────────────────────────────────
def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


GRADES = {'naturel': (1.0, 1.0, 1.0), 'jour': (1.02, 1.0, 0.97), 'doree': (1.08, 0.96, 0.82), 'soir': (0.9, 0.82, 0.86), 'nuit': (0.55, 0.62, 0.9)}


def blur_radii(sigma):
    """Three box passes of radius r or r + 1 (variance r(r+1)/3 each) whose variances add up to sigma²."""
    v = lambda r: r * (r + 1) / 3
    lo = 0
    while 3 * v(lo + 1) <= sigma * sigma:
        lo += 1
    up = max(0, min(3, int(round((sigma * sigma - 3 * v(lo)) / (v(lo + 1) - v(lo))))))
    return [lo + 1] * up + [lo] * (3 - up)


def blur_sigma(sigma):
    """The blur actually obtained for a requested sigma (what the conformity report measures)."""
    return 0.0 if sigma <= 0.3 else math.sqrt(sum(r * (r + 1) / 3 for r in blur_radii(sigma)))


def gauss_blur(px, sigma):
    """Gaussian blur of an image (H×W×C float array) at FULL resolution — three box passes per axis (cumulative
    sums), the classic fast approximation. With an alpha channel the colour is premultiplied (no dark fringe)."""
    import numpy as np
    if sigma <= 0.3:
        return px.copy()
    sigma = min(sigma, 0.05 * max(px.shape[:2]))  # never a kernel larger than the picture itself
    a = px.astype(np.float32)
    alpha = a.shape[2] == 4
    if alpha:
        a = np.concatenate([a[..., :3] * a[..., 3:4], a[..., 3:4]], 2)
    radii = blur_radii(sigma)
    for axis in (0, 1):
        for r in radii:
            if r == 0:
                continue
            pad = [(0, 0)] * 3
            pad[axis] = (r + 1, r)
            c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis, dtype=np.float64)
            n = a.shape[axis]
            hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
            lo = np.take(c, np.arange(0, n), axis=axis)
            a = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    if alpha:
        a = np.concatenate([a[..., :3] / np.maximum(a[..., 3:4], 1e-4), a[..., 3:4]], 2)
    return a


def build_life(life, ctx):
    """ctx: bpy, helpers (mesh_object, flat_material, emissive_material, load_rgba, key), decor grid (ray placement),
    rig, fps, nF, actors (id → root / x), tint node of the décor."""
    import bpy
    import numpy as np
    W = World(life, ctx)
    W.grade()
    W.extras()
    W.crowd()
    W.animals()
    W.props()
    W.fx()
    return W


class World:
    def __init__(self, life, ctx):
        import bpy
        self.bpy = bpy
        self.life = life
        self.c = ctx
        self.fps = ctx['fps']
        self.nF = ctx['nF']
        self.g = ctx['grid']
        self.rnd = random.Random(7)
        self.softs = []  # soft versions of the drawn cards (recalibrated against the cameras)
        self.spots = []  # where the ground animals really stand at the first frame (spacing rule)
        # A baked set is already lit for its hour: no second grade on top of it.
        self.tint = GRADES['naturel'] if life.get('kit') is None else GRADES.get(life.get('grade', 'naturel'), (1, 1, 1))
        self.punch = int(round(life['punch'] * self.fps)) + 1 if life.get('punch') is not None else None
        self.objs = []

    # Placement in the STAGE seen by the two-shot (the widest shot of the film): s = -1 / +1 are its left / right
    # edges at that depth, so what lives around the actors is in the picture, not somewhere in an 11 m wide set.
    def ground(self, s, depth):
        """A point on the floor at `depth` behind the actors, at the screen place s (−1 left edge … +1 right edge) of
        the wide shot — whose camera may be off-axis (it stands at the painting's viewpoint, framed by lens shift)."""
        st = self.c['stage']
        k = (st['d'] + depth) / st['d']
        camx = st.get('camx', st['cx'])
        return camx + (st['cx'] - camx + s * st['hw0']) * k, depth, 0.0, None

    def ground_u(self, x, depth):
        """Inverse of ground(): the screen place s of a floor point."""
        st = self.c['stage']
        k = (st['d'] + depth) / st['d']
        camx = st.get('camx', st['cx'])
        return ((x - camx) / k - (st['cx'] - camx)) / st['hw0']

    def sky(self, s, q, depth):
        """A point high in the two-shot frame: q = 0 centre line, 1 = top edge."""
        st = self.c['stage']
        k = (st['d'] + depth) / st['d']
        camx, camz = st.get('camx', st['cx']), st.get('camz', st['cz'])
        return camx + (st['cx'] - camx + s * st['hw0']) * k, depth, camz + (st['cz'] - camz + q * st['hh0']) * k

    def relief_depth(self, x_plane, z_plane):
        g = self.g
        gx = (x_plane - g['x0']) / g['Wm']
        gz = (g['ztop'] - z_plane) / g['mH']
        dn = g['dn']
        if dn is None:
            return g['Yp'] + g['DEPTH']
        NX, NZ = dn.shape[1] - 1, dn.shape[0] - 1
        i = int(round((gx + g['EX']) / (1 + 2 * g['EX']) * NX))
        j = int(round((gz + g['EZ']) / (1 + 2 * g['EZ']) * NZ))
        i, j = max(0, min(NX, i)), max(0, min(NZ, j))
        return g['Yp'] + (1 - float(dn[j, i])) * g['DEPTH']

    def visible(self, x, y, z, margin=0.08):
        """Pull a point toward the camera along its ray when the painted relief there is nearer (a sofa, a wall):
        returns (point, scale) — same place and size on screen, never swallowed by the set."""
        g = self.g
        C0 = g['C0']
        k = (g['Yp'] - C0[1]) / (y - C0[1])
        xp, zp = C0[0] + (x - C0[0]) * k, C0[2] + (z - C0[2]) * k
        ys = self.relief_depth(xp, zp)
        if ys - margin >= y:
            return (x, y, z), 1.0
        y2 = max(g['Yp'] + 0.02, ys - margin)
        s = (y2 - C0[1]) / (y - C0[1])
        return (C0[0] + (x - C0[0]) * s, y2, C0[2] + (z - C0[2]) * s), s

    def tinted(self, rgb, f=1.0):
        return tuple(max(0, min(255, int(c * t * f))) for c, t in zip(rgb, self.tint))

    def grade(self):
        node = self.c.get('tint')
        if node is not None:
            node.inputs['B'].default_value = (*[v for v in self.tint], 1)
        # Ceiling fan / TV: the light of the room breathes a little (a fan's shadow, a screen).
        strength = self.c.get('decor_strength')
        if strength is not None and ('ventilateur' in self.life['fx'] or 'ecran' in self.life['fx']):
            for f in range(1, self.nF + 1, 3):
                t = f / self.fps
                v = 1.0 + (0.018 * math.sin(t * 2 * math.pi * 1.4) if 'ventilateur' in self.life['fx'] else 0)
                if 'ecran' in self.life['fx']:
                    v += 0.022 * math.sin(t * 7.3) * math.sin(t * 2.1)
                strength.default_value = v
                strength.keyframe_insert('default_value', frame=f)

    # ── figurants ────────────────────────────────────────────────────────────────────────────────────────────────
    def card_material(self, name, img, px):
        """Emissive card of a drawing, a touch darker and tinted (it stays behind the actors), with a SOFT version mixed
        in on the close-ups exactly like the painted set (same lens, same depth of field)."""
        import numpy as np
        bpy = self.bpy
        h, w = px.shape[:2]
        # A first soft version; its strength is recalibrated once the cameras are known (scene.calibrate_softness:
        # faces and expressions in the background stay readable — the blur on screen is capped by a generation rule).
        soft_img = bpy.data.images.new(f'soft-{name}', w, h, alpha=True)
        soft_img.pixels.foreach_set(gauss_blur(px, 2.0)[::-1].astype(np.float32).ravel())
        self.softs.append({'name': name, 'img': soft_img, 'px': px, 'sigma': 2.0})
        m = bpy.data.materials.new(f'x-{name}')
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        t1 = nt.nodes.new('ShaderNodeTexImage')
        t1.image = img
        t1.extension = 'CLIP'
        t2 = nt.nodes.new('ShaderNodeTexImage')
        t2.image = soft_img
        t2.extension = 'CLIP'
        sv = nt.nodes.new('ShaderNodeValue')
        sv.name = 'soft'
        mc = nt.nodes.new('ShaderNodeMix')
        mc.data_type = 'RGBA'
        ma = nt.nodes.new('ShaderNodeMix')
        ma.data_type = 'FLOAT'
        tint = nt.nodes.new('ShaderNodeMix')
        tint.data_type = 'RGBA'
        tint.blend_type = 'MULTIPLY'
        tint.inputs['Factor'].default_value = 1.0
        tint.inputs['B'].default_value = (*[0.88 * v for v in self.tint], 1)
        em = nt.nodes.new('ShaderNodeEmission')
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(sv.outputs[0], mc.inputs['Factor'])
        nt.links.new(sv.outputs[0], ma.inputs['Factor'])
        nt.links.new(t1.outputs['Color'], mc.inputs['A'])
        nt.links.new(t2.outputs['Color'], mc.inputs['B'])
        nt.links.new(t1.outputs['Alpha'], ma.inputs['A'])
        nt.links.new(t2.outputs['Alpha'], ma.inputs['B'])
        nt.links.new(mc.outputs['Result'], tint.inputs['A'])
        nt.links.new(tint.outputs['Result'], em.inputs['Color'])
        nt.links.new(ma.outputs['Result'], mix.inputs['Fac'])
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
        for attr, v in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED')):
            try:
                setattr(m, attr, v)
            except Exception:
                pass
        # Same softness as the set, shot by shot (hard cuts).
        for s in self.c.get('shots', []):
            sv.outputs[0].default_value = 0.0 if s['type'] == 'two' else 1.0
            sv.outputs[0].keyframe_insert('default_value', frame=s['start'] + 1)
        try:
            ad = m.node_tree.animation_data
            act = ad.action if ad else None
            curves = list(act.fcurves) if act is not None and hasattr(act, 'fcurves') else []
            if act is not None and not curves:
                from bpy_extras import anim_utils
                cb = anim_utils.action_get_channelbag_for_slot(act, ad.action_slot)
                curves = list(cb.fcurves) if cb else []
            for fc in curves:
                for kp in fc.keyframe_points:
                    kp.interpolation = 'CONSTANT'
        except Exception:
            pass
        return m

    def cutout(self, name, height):
        """A troupe drawing as a flat emissive card (neutral pose), feet at the origin, with a soft version for close-ups."""
        bpy = self.bpy
        import numpy as np
        rig = self.c['rig']
        pose = rig['cast'][name]['poses'][0]
        img, px = self.c['load_rgba'](os.path.join(rig['dir'], pose['png']))
        h, w = px.shape[:2]
        a = px[..., 3]
        ys = np.nonzero(a.max(1) > 0.5)[0]
        foot = ys.max() if len(ys) else h - 1
        top = ys.min() if len(ys) else 0
        s = height / max(1, foot - top)
        x0, x1 = -w / 2 * s, w / 2 * s
        z0, z1 = -(h - 1 - foot) * s, (foot + 1) * s
        m = self.card_material(name, img, px)
        ob = self.c['mesh_object'](f'figurant-{name}', [(x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1)], [(0, 1, 2, 3)], [(0, 0), (1, 0), (1, 1), (0, 1)], m)
        self.softs[-1].update({'obj': ob, 'm_per_px': s})
        # Where the drawn FACE is on the card (rig landmarks): the laws of the eyeline use the face, not the card centre.
        f = pose.get('face') or {}
        eyes = f.get('eyes') or []
        if f.get('nose') or eyes:
            fx_p = f['nose'][0] if f.get('nose') else sum(e['c'][0] for e in eyes) / len(eyes)
            fy_p = sum(e['c'][1] for e in eyes) / len(eyes) if eyes else f['nose'][1]
            ob['face_dx'] = (fx_p - w / 2) * s
            ob['face_z'] = (foot - fy_p) * s
        return ob

    def shadow(self, parent, width):
        ob = self.c['mesh_object'](f'{parent.name}-sh', [(-width / 2, 0.02, -0.02), (width / 2, 0.02, -0.02), (width / 2, 0.02, 0.05), (-width / 2, 0.02, 0.05)], [(0, 1, 2, 3)], [(0, 0), (1, 0), (1, 1), (0, 1)], self.c['shadow_material']())
        ob.parent = parent
        return ob

    def place_people(self, cards):
        """Laws before animation (plausibility.py): the extras stand outside the personal zone of the actors'
        conversation (Hall's social distance), a talking group at conversation distance facing each other, nobody on
        top of anybody on the same plane; each passer-by walks its own lane (never through someone)."""
        min_depth = genrules.get('extras_min_depth')
        st = self.c['stage']
        # Where an extra may stand: the frame of the wide shot and beyond it (off-frame in the wide shot, seen in the
        # close-ups) — the laws choose.
        x_range = lambda y: (self.ground(-1.6, y)[0], self.ground(1.6, y)[0])
        fixed = [{'x': a['plan']['x'], 'y': a['root'].location.y, 'w': a['poses']['neutre'].width, 'fx': a['plan']['x'] + a['poses']['neutre'].face_x,
                  'fz': a['poses']['neutre'].face_z, 'faces': [(p_.face_x, p_.face_z) for p_ in a['poses'].values()]}
                 for a in self.c.get('actors', {}).values()]
        people, gid = [], None
        for i, e in enumerate(self.life['extras']):
            if e['behavior'] == 'passe' or e['name'] not in cards:
                continue
            # A conversation group = the consecutive « discute » extras of one slot (same role).
            gkey = f"{e['role']}-{e['behavior']}"
            gid = gkey if e['behavior'] in ('discute', 'file') else f'{gkey}-{i}'
            e['groupe'] = gid
            people.append({'id': i, 'w': cards[e['name']].dimensions.x, 'x': self.ground(e['u'], e['depth'])[0], 'y': e['depth'],
                           'group': gid, 'talk': e['behavior'] == 'discute', 'fdx': abs(cards[e['name']].get('face_dx', 0.0)),
                           'fz': cards[e['name']].get('face_z', 0.88 * cards[e['name']].dimensions.z)})
        # Screen x in the wide shots, over their whole moves: push / pull (distance × 0.97–1.32), drift (± 2.5 % of the
        # frame height sideways), and the small re-centring of the framing fit (± 5 cm).
        # (the camera zooms — frame × 0.97–1.32 — and shifts sideways; it does not move)
        camx, camz = st.get('camx', st['cx']), st.get('camz', st['cz'])
        views = [{'camx': camx, 'camz': camz, 'cx': st['cx'] + dxc, 'cz': st['cz'], 'd': st['d'], 'half': st['hw0'] * kd / st['d'], 'hh': st['hh0'] * kd}
                 for kd in (0.97, 1.0, 1.07, 1.32) for dxc in (-0.05 - 0.05 * st['hh0'], 0.0, 0.05 + 0.05 * st['hh0'])]
        pos = plausibility.layout(people, fixed, x_range, min_depth, proj=views)
        statics = []
        for i, (x, y, face) in pos.items():
            e = self.life['extras'][i]
            e['u'], e['depth'] = round(self.ground_u(x, y), 3), round(y, 2)
            if face is not None:
                e['face'] = face
            statics.append(y)
        # Depth bands: who stands (front), who passes (middle, a full « plane » away from who stands — a passer-by goes
        # visibly behind, never slides across someone at the same depth), the crowd (back, one body behind the passers).
        lanes = []
        for e in self.life['extras']:
            if e['behavior'] == 'passe':
                front = max(statics, default=min_depth - plausibility.SAME_PLANE) + plausibility.SAME_PLANE + 0.05
                e['depth'] = plausibility.lane(max(e['depth'], front), lanes, lo=front)
                lanes.append(e['depth'])
                # A human pace: 0.9–1.3 m/s (a running child 1.4–2.0), the crossing lasts what the distance requires.
                run = re.search(r'court|dribble|course', fold(e.get('activite', '')))
                v = (1.4 + 0.6 * ((e.get('phase', 0) * 7.3) % 1)) if run else (0.9 + 0.4 * ((len(e['name']) * 0.37) % 1))
                hw = st['hw0'] * (st['d'] + e['depth']) / st['d']
                dist = 2 * 1.45 * hw
                e['vitesse'] = round(v, 2)
                e['passes'] = [[t0, round(t0 + dist / v, 2), d] for t0, _t1, d in e['passes']]
        self.bands = {'debout': max(statics, default=min_depth), 'passants': max(lanes, default=min_depth)}

    def extras(self):
        key = self.c['key']
        cast = self.c['rig']['cast']
        cards = {}
        for e in self.life['extras']:
            if e['name'] in cast and e['name'] not in cards:
                cards[e['name']] = self.cutout(e['name'], self.c['heights'].get(e['name'], 1.7))
        self.place_people(cards)
        fps = self.fps
        hop_h = 0.05  # a little jump of joy at the punchline: 5 cm, so 0.20 s in the air (gravity)
        hop_f = plausibility.airtime(hop_h) * fps
        for e in self.life['extras']:
            name = e['name']
            if name not in cast:
                continue
            height = self.c['heights'].get(name, 1.7)
            card = cards[name]
            root = self.bpy.data.objects.new(f'figurant-root-{name}', None)
            self.bpy.context.scene.collection.objects.link(root)
            card.parent = root
            self.shadow(root, height * 0.35)
            ph = e.get('phase', 0)
            if e['behavior'] == 'passe':
                # Crossing the set behind the actors, then gone; back the other way later.
                root.hide_render = True
                key(root, 'hide_render', 1, True)
                for t0, t1, d in e['passes']:
                    f0, f1 = int(t0 * self.fps) + 1, int(t1 * self.fps) + 1
                    ua, ub = (-1.45, 1.45) if d > 0 else (1.45, -1.45)
                    key(root, 'hide_render', f0 - 1, True)
                    key(root, 'hide_render', f0, False)
                    for f in range(f0, f1 + 1, 2):
                        q = (f - f0) / max(1, f1 - f0)
                        u = ua + (ub - ua) * q
                        x, y, z, _ = self.ground(u, e['depth'])
                        (px, py, pz), s = self.visible(x, y, z + 0.0)
                        step = abs(math.sin((f / self.fps) * math.pi * 1.9 + ph))
                        # Feet stay on the ground: the walk bobs the body (stretch from the feet), it never lifts off.
                        root.location = (px, py, pz)
                        root['sol'] = pz
                        root.keyframe_insert('["sol"]', frame=f)
                        root.scale = (s * (1 if d > 0 else -1) * (-1 if self.facing(name) < 0 else 1), s, s * (1 + 0.012 * step))
                        root.rotation_euler = (0, math.radians(2.2) * math.sin((f / self.fps) * math.pi * 1.9 + ph), 0)
                        root.keyframe_insert('location', frame=f)
                        root.keyframe_insert('scale', frame=f)
                        root.keyframe_insert('rotation_euler', frame=f)
                    key(root, 'hide_render', f1, True)
            else:
                x, y, z, _ = self.ground(e['u'], e['depth'])
                (px, py, pz), s = self.visible(x, y, z)
                face = e.get('face', 1) * (-1 if self.facing(name) < 0 else 1)
                root.location = (px, py, pz)
                root.scale = (s * face, s, s)
                root['sol'] = pz
                root.keyframe_insert('["sol"]', frame=1)
                frames = set(range(1, self.nF + 1, 3))
                if self.punch:
                    frames |= set(range(max(1, self.punch - 1), min(self.nF, self.punch + int(hop_f) + 3) + 1))
                for f in sorted(frames):
                    t = f / self.fps
                    breath = 1 + 0.009 * math.sin(t * 1.6 + ph)
                    sway = math.radians(1.2) * math.sin(t * 0.7 + ph)
                    if e['behavior'] == 'discute':
                        # Talking in turn: the speaker bobs and leans in.
                        talk = max(0.0, math.sin(t * 0.9 + ph))
                        sway += math.radians(2.5) * talk * math.sin(t * 6 + ph)
                        breath += 0.012 * talk * abs(math.sin(t * 7 + ph))
                    elif e['behavior'] == 'travaille':
                        breath += 0.015 * abs(math.sin(t * 2.6 + ph))
                        sway += math.radians(3) * math.sin(t * 2.6 + ph)
                    hop = 0.0
                    if self.punch and e['behavior'] in ('regarde', 'discute', 'attend', 'file', 'travaille'):
                        hop = plausibility.hop((f - self.punch) / fps, hop_h)  # the extras jump at the punchline — a real parabola
                    root.scale = (s * face, s, s * breath)
                    root.rotation_euler = (0, sway, 0)
                    root.location = (px, py, pz + hop * s)
                    root.keyframe_insert('scale', frame=f)
                    root.keyframe_insert('rotation_euler', frame=f)
                    root.keyframe_insert('location', frame=f)
            self.objs.append(root)

    def facing(self, name):
        """+1 when the drawing looks to the right of the picture (nose right of the face centre), else -1."""
        p = self.c['rig']['cast'][name]['poses'][0]
        f = p.get('face') or {}
        if f.get('nose') and f.get('cheekL') and f.get('cheekR'):
            return 1 if f['nose'][0] > (f['cheekL'][0] + f['cheekR'][0]) / 2 else -1
        return 1

    # ── animaux (3D, construits) ─────────────────────────────────────────────────────────────────────────────────
    def mat(self, rgb, name=None):
        """Toon shading without lights (no noise at 10 samples): lit from above, darker on the turned-away sides,
        a soft rim — enough volume for a hen or a cake to read next to the painted drawings."""
        key = (rgb, name)
        cache = self.__dict__.setdefault('_mats', {})
        if key in cache:
            return cache[key]
        bpy = self.bpy
        r, g, b = [(c / 255) ** 2.2 for c in self.tinted(rgb)]
        m = bpy.data.materials.new(name or f'toon{rgb}')
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        top = nt.nodes.new('ShaderNodeMapRange')
        top.inputs['From Min'].default_value = -1.0
        top.inputs['From Max'].default_value = 1.0
        top.inputs['To Min'].default_value = 0.62
        top.inputs['To Max'].default_value = 1.12
        lw = nt.nodes.new('ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.35
        rim = nt.nodes.new('ShaderNodeMath')
        rim.operation = 'MULTIPLY_ADD'
        rim.inputs[1].default_value = -0.28
        rim.inputs[2].default_value = 1.0
        shade = nt.nodes.new('ShaderNodeMath')
        shade.operation = 'MULTIPLY'
        col = nt.nodes.new('ShaderNodeRGB')
        col.outputs[0].default_value = (r, g, b, 1)
        mul = nt.nodes.new('ShaderNodeMix')
        mul.data_type = 'RGBA'
        mul.blend_type = 'MULTIPLY'
        mul.inputs['Factor'].default_value = 1.0
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(geo.outputs['Normal'], sep.inputs[0])
        nt.links.new(sep.outputs['Z'], top.inputs['Value'])
        nt.links.new(lw.outputs['Facing'], rim.inputs[0])
        nt.links.new(top.outputs['Result'], shade.inputs[0])
        nt.links.new(rim.outputs[0], shade.inputs[1])
        nt.links.new(col.outputs[0], mul.inputs['A'])
        comb = nt.nodes.new('ShaderNodeCombineXYZ')
        for k in ('X', 'Y', 'Z'):
            nt.links.new(shade.outputs[0], comb.inputs[k])
        nt.links.new(comb.outputs[0], mul.inputs['B'])
        nt.links.new(mul.outputs['Result'], em.inputs['Color'])
        nt.links.new(em.outputs[0], out.inputs['Surface'])
        cache[key] = m
        return m

    def blob(self, name, loc, scale, rgb, parent, seg=12):
        bpy = self.bpy
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(6, seg // 2), location=loc)
        ob = bpy.context.active_object
        ob.name = name
        ob.scale = scale
        ob.data.materials.append(self.mat(rgb))
        ob.parent = parent
        return ob

    def cone(self, name, loc, r, depth, rgb, parent, rot=(0, 0, 0)):
        bpy = self.bpy
        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=r, depth=depth, location=loc, rotation=rot)
        ob = bpy.context.active_object
        ob.name = name
        ob.data.materials.append(self.mat(rgb))
        ob.parent = parent
        return ob

    def cyl(self, name, loc, r, depth, rgb, parent, rot=(0, 0, 0)):
        bpy = self.bpy
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=r, depth=depth, location=loc, rotation=rot)
        ob = bpy.context.active_object
        ob.name = name
        ob.data.materials.append(self.mat(rgb))
        ob.parent = parent
        return ob

    def empty(self, name):
        ob = self.bpy.data.objects.new(name, None)
        self.bpy.context.scene.collection.objects.link(ob)
        return ob

    def make_poule(self, i, white=False):
        root = self.empty(f'poule-{i}')
        body = self.empty(f'poule-{i}-body')
        body.parent = root
        c = (245, 240, 230) if white else self.rnd.choice([(150, 75, 35), (190, 110, 50), (90, 55, 30)])
        self.blob('pb', (0, 0, 0.17), (0.13, 0.1, 0.1), c, body)
        self.cone('pt', (-0.12, 0, 0.24), 0.06, 0.12, c, body, rot=(0, math.radians(-40), 0))
        head = self.empty(f'poule-{i}-head')
        head.parent = body
        head.location = (0.1, 0, 0.27)
        self.blob('ph', (0.0, 0, 0.0), (0.055, 0.05, 0.06), c, head)
        self.cone('pk', (0.06, 0, -0.005), 0.018, 0.04, (240, 170, 40), head, rot=(0, math.radians(90), 0))
        self.blob('pc', (0.0, 0, 0.055), (0.025, 0.012, 0.03), (210, 30, 30), head)
        self.blob('pe', (0.03, 0.035, 0.01), (0.008, 0.004, 0.008), (10, 10, 10), head, seg=6)
        for dy in (-0.035, 0.035):
            self.cyl('pl', (0.01, dy, 0.04), 0.008, 0.09, (240, 170, 40), root)
        return root, body, head

    def make_chevre(self, i):
        root = self.empty(f'chevre-{i}')
        body = self.empty(f'chevre-{i}-body')
        body.parent = root
        c = self.rnd.choice([(235, 230, 220), (120, 80, 50), (60, 45, 35)])
        self.blob('cb', (0, 0, 0.42), (0.3, 0.14, 0.15), c, body)
        for dx in (-0.2, 0.2):
            for dy in (-0.08, 0.08):
                self.cyl('cl', (dx, dy, 0.17), 0.025, 0.34, c, root)
        head = self.empty(f'chevre-{i}-head')
        head.parent = body
        head.location = (0.3, 0, 0.55)
        self.blob('ch', (0.05, 0, 0), (0.1, 0.065, 0.07), c, head)
        self.cone('cho', (0.0, 0.03, 0.08), 0.015, 0.12, (90, 80, 70), head, rot=(0, math.radians(-30), 0))
        self.cone('cho2', (0.0, -0.03, 0.08), 0.015, 0.12, (90, 80, 70), head, rot=(0, math.radians(-30), 0))
        self.blob('cbe', (0.1, 0, -0.07), (0.02, 0.015, 0.04), (200, 195, 185), head, seg=6)
        return root, body, head

    def make_chat(self, i):
        root = self.empty(f'chat-{i}')
        body = self.empty(f'chat-{i}-body')
        body.parent = root
        c = self.rnd.choice([(200, 120, 50), (60, 60, 60), (150, 140, 130)])
        self.blob('kb', (0, 0, 0.07), (0.17, 0.13, 0.08), c, body)
        head = self.empty(f'chat-{i}-head')
        head.parent = body
        head.location = (0.15, 0, 0.1)
        self.blob('kh', (0, 0, 0), (0.07, 0.065, 0.06), c, head)
        self.cone('ke1', (0, 0.035, 0.06), 0.025, 0.05, c, head)
        self.cone('ke2', (0, -0.035, 0.06), 0.025, 0.05, c, head)
        tail = self.cyl('kt', (-0.17, 0, 0.05), 0.015, 0.22, c, body, rot=(0, math.radians(70), 0))
        return root, body, head

    def make_chien(self, i):
        root, body, head = self.make_chevre(i)
        for ob in list(root.children_recursive):
            if ob.name.startswith('cho') or ob.name.startswith('cbe'):
                ob.hide_render = True
        return root, body, head

    def make_oiseau(self, i):
        root = self.empty(f'oiseau-{i}')
        c = (35, 35, 40)
        self.blob('ob', (0, 0, 0), (0.06, 0.02, 0.02), c, root, seg=8)
        wl = self.c['mesh_object'](f'ow1-{i}', [(0, 0, 0), (-0.04, 0.16, 0.02), (0.05, 0.02, 0)], [(0, 1, 2)], None, self.mat(c))
        wr = self.c['mesh_object'](f'ow2-{i}', [(0, 0, 0), (-0.04, -0.16, 0.02), (0.05, -0.02, 0)], [(0, 1, 2)], None, self.mat(c))
        wl.parent = root
        wr.parent = root
        return root, wl, wr

    def make_margouillat(self, i):
        root = self.empty(f'margouillat-{i}')
        body = self.empty(f'margouillat-{i}-body')
        body.parent = root
        self.blob('lb', (0, 0, 0), (0.08, 0.025, 0.02), (60, 70, 80), body, seg=8)
        self.blob('lh', (0.08, 0, 0.0), (0.035, 0.022, 0.018), (240, 120, 30), body, seg=8)
        self.cone('lt', (-0.12, 0, 0), 0.015, 0.12, (60, 70, 80), body, rot=(0, math.radians(-90), 0))
        return root, body, None

    def free_u(self, a, depth):
        """The animal's starting point, moved sideways until it stands clear of the animals already placed — measured
        where it REALLY stands (after the pull toward the camera on the painted relief, which can bring a far animal
        onto a near one). Generation rule « animal_min_dist », hardened by the root-cause analysis."""
        md = genrules.get('animal_min_dist')
        u0, u = a['u'], a['u']
        for k in range(40):
            u = u0 + 0.05 * ((k + 1) // 2) * (1 if k % 2 else -1)
            x, y, z, _ = self.ground(u, depth)
            (px, py, _pz), _s = self.visible(x, y, z)
            if all(math.hypot(px - qx, py - qy) >= md for qx, qy in self.spots):
                break
        self.spots.append((px, py))
        a['u'] = round(u, 3)
        return a['u']

    def animals(self):
        key = self.c['key']
        for i, a in enumerate(self.life['animals']):
            sp, ph, sp_k = a['species'], a.get('phase', 0), a.get('speed', 1.0)
            if sp in ('poule', 'pigeon', 'canard'):
                self.free_u(a, a['depth'])
                root, body, head = self.make_poule(i, white=(sp == 'canard'))
                if sp == 'pigeon':
                    for ob in root.children_recursive:
                        if ob.type == 'MESH' and ob.data.materials:
                            ob.data.materials[0] = self.mat((130, 135, 145))
                    root.scale = (0.7, 0.7, 0.7)
                x, y, z, _ = self.ground(a['u'], a['depth'])
                u = a['u']
                fled = False
                for f in range(1, self.nF + 1, 2):
                    t = f / self.fps
                    # Pecks every 1–2 s, little steps in between; flees off-set (fast) after the punchline.
                    peck = max(0.0, math.sin(t * 2.6 * sp_k + ph)) ** 6
                    u += 0.002 * a['dir'] * (1 if math.sin(t * 0.5 + ph) > 0 else -0.6)
                    if self.punch and f >= self.punch and sp == 'poule':
                        u += 0.05 * a['dir']
                        fled = True
                    x, y, z, _ = self.ground(u, a['depth'])
                    (px, py, pz), s = self.visible(x, y, z)
                    root.location = (px, py, pz + (0.03 * abs(math.sin(t * 18)) if fled else 0))
                    sc = 0.7 if sp == 'pigeon' else 1.0
                    root.scale = (sc * s, sc * s, sc * s)
                    root.rotation_euler = (0, 0, 0 if a['dir'] > 0 else math.pi)
                    body.rotation_euler = (0, math.radians(35) * peck, 0)
                    head.rotation_euler = (0, math.radians(25) * peck, 0)
                    for ob, path in ((root, 'location'), (root, 'scale'), (root, 'rotation_euler'), (body, 'rotation_euler'), (head, 'rotation_euler')):
                        ob.keyframe_insert(path, frame=f)
            elif sp in ('chevre', 'chien'):
                root, body, head = self.make_chevre(i) if sp == 'chevre' else self.make_chien(i)
                u = self.free_u(a, a['depth'] + 0.3)
                for f in range(1, self.nF + 1, 2):
                    t = f / self.fps
                    if sp == 'chien':
                        u += 0.004 * a['dir']
                        if u > 1.3 or u < -1.3:
                            a['dir'] = -a['dir']
                    x, y, z, _ = self.ground(u, a['depth'] + 0.3)
                    (px, py, pz), s = self.visible(x, y, z)
                    graze = (math.sin(t * 0.8 + ph) + 1) / 2 if sp == 'chevre' else 0.15
                    bob = 0.02 * abs(math.sin(t * 9)) if sp == 'chien' else 0
                    root.location = (px, py, pz + bob * s)
                    root.scale = (s, s, s)
                    root.rotation_euler = (0, 0, 0 if a['dir'] > 0 else math.pi)
                    head.rotation_euler = (0, math.radians(55) * graze, 0)
                    if self.punch and sp == 'chevre' and 0 <= f - self.punch < self.fps:
                        head.rotation_euler = (0, math.radians(-20), 0)  # the goat looks up at the punchline
                    for ob, path in ((root, 'location'), (root, 'scale'), (root, 'rotation_euler'), (head, 'rotation_euler')):
                        ob.keyframe_insert(path, frame=f)
            elif sp == 'chat':
                root, body, head = self.make_chat(i)
                self.free_u(a, a['depth'])
                x, y, z, _ = self.ground(a['u'], a['depth'])
                (px, py, pz), s = self.visible(x, y, z)
                root.location = (px, py, pz)
                for f in range(1, self.nF + 1, 3):
                    t = f / self.fps
                    root.scale = (s, s, s * (1 + 0.04 * math.sin(t * 1.3 + ph)))
                    head.rotation_euler = (0, 0, math.radians(18) * math.sin(t * 0.35 + ph))
                    if self.punch and 0 <= f - self.punch < self.fps:
                        head.rotation_euler = (math.radians(-15), 0, 0)
                    root.keyframe_insert('scale', frame=f)
                    head.keyframe_insert('rotation_euler', frame=f)
            elif sp == 'oiseau':
                if not self.life.get('exterieur'):
                    continue
                root, wl, wr = self.make_oiseau(i)
                period = self.rnd.uniform(9, 16) / sp_k
                v = self.rnd.uniform(0.05, 0.22)
                depth = self.rnd.uniform(1.6, 2.3)
                for f in range(1, self.nF + 1, 2):
                    t = f / self.fps + ph * 3
                    q = (t % period) / period
                    u = -1.3 + 2.6 * q if a['dir'] > 0 else 1.3 - 2.6 * q
                    root.location = self.sky(u * 1.2, 0.62 + v * 1.4 + 0.03 * math.sin(t * 1.7), depth)
                    root.rotation_euler = (0, 0, 0 if a['dir'] > 0 else math.pi)
                    flap = math.sin(t * 14)
                    wl.rotation_euler = (math.radians(35) * flap, 0, 0)
                    wr.rotation_euler = (math.radians(-35) * flap, 0, 0)
                    root.hide_render = q > 0.98
                    root.keyframe_insert('location', frame=f)
                    root.keyframe_insert('rotation_euler', frame=f)
                    root.keyframe_insert('hide_render', frame=f)
                    wl.keyframe_insert('rotation_euler', frame=f)
                    wr.keyframe_insert('rotation_euler', frame=f)
            elif sp in ('singe', 'antilope', 'vache', 'papillon', 'luciole'):
                self.wild(i, a)
            elif sp == 'margouillat':
                root, body, _ = self.make_margouillat(i)
                # On the wall: high in the picture, ON the painted relief (facing the camera), doing push-ups.
                g = self.g
                C0 = g['C0']
                x, y, z = self.sky(a['u'] * 0.9, 0.15 + 0.25 * (ph % 1), 1.0)
                # Onto the painted wall behind that point (along the reference ray), facing the camera.
                k0 = (g['Yp'] - C0[1]) / (y - C0[1])
                xp, zp = C0[0] + (x - C0[0]) * k0, C0[2] + (z - C0[2]) * k0
                ys = self.relief_depth(xp, zp) - 0.03
                k = (ys - C0[1]) / (g['Yp'] - C0[1])
                root.location = (C0[0] + (xp - C0[0]) * k, ys, C0[2] + (zp - C0[2]) * k)
                root.rotation_euler = (math.radians(90), 0, math.radians(90) * a['dir'])
                for f in range(1, self.nF + 1, 2):
                    t = f / self.fps
                    cyc = (t + ph) % 4.0
                    push = abs(math.sin(cyc * math.pi * 2.5)) if cyc < 1.2 else 0.0
                    body.location = (0, 0, 0.012 * push)
                    body.keyframe_insert('location', frame=f)

    # ── foule autonome ─────────────────────────────────────────────────────────────────────────────────────────────
    def crowd(self):
        """Autonomous crowd of DRAWN characters (the troupe's cards — the same art as the actors): each walker crosses
        the place at its own pace, avoids the others (separation steering), sometimes stops a moment with someone it
        meets, hops at the punchline; the flow never ends (they come back in off-screen)."""
        cr = self.life.get('crowd')
        if not cr or not cr.get('names'):
            return
        rng = random.Random(cr['seed'])
        dt = 1.0 / self.fps
        hop_h = 0.04
        hop_f = plausibility.airtime(hop_h) * self.fps
        ag = []
        for name in cr['names']:
            if name not in self.c['rig']['cast']:
                continue
            height = self.c['heights'].get(name, 1.7)
            card = self.cutout(name, height)
            root = self.bpy.data.objects.new(f'foule-root-{name}', None)
            self.bpy.context.scene.collection.objects.link(root)
            card.parent = root
            self.shadow(root, height * 0.35)
            lo = max(2.1, getattr(self, 'bands', {}).get('passants', 0) + plausibility.BODY_DEPTH + 0.1)
            depth = rng.uniform(lo, lo + 1.2)
            x0, _, _, _ = self.ground(-1.7, depth)
            x1, _, _, _ = self.ground(1.7, depth)
            ag.append({'root': root, 'name': name, 'x': rng.uniform(x0, x1), 'y': depth, 'ymin': lo - 0.05, 'ymax': lo + 1.3, 'dir': rng.choice([-1, 1]), 'speed': rng.uniform(0.9, 1.3),
                       'stop': 0.0, 'phase': rng.uniform(0, 6.28), 'lo': x0 - 0.7, 'hi': x1 + 0.7})
            self.objs.append(root)
        for f in range(1, self.nF + 1):
            for a in ag:
                if a['stop'] > 0:
                    a['stop'] -= dt
                    continue
                vx, vy = a['dir'] * a['speed'], 0.0
                for b in ag:
                    if b is a:
                        continue
                    dx, dy = a['x'] - b['x'], a['y'] - b['y']
                    d2 = dx * dx + dy * dy
                    if 1e-6 < d2 < 0.7 * 0.7:
                        d = math.sqrt(d2)
                        push = (0.7 - d) / 0.7 * 1.8
                        vx += dx / d * push
                        vy += dy / d * push
                        if a['dir'] != b['dir'] and rng.random() < 0.003:
                            a['stop'] = rng.uniform(1.2, 2.5)  # they know each other: a word in passing
                a['x'] += vx * dt
                a['y'] = min(a['ymax'], max(a['ymin'], a['y'] + vy * dt * 0.5))
                if a['x'] > a['hi']:
                    a['x'] = a['lo']
                elif a['x'] < a['lo']:
                    a['x'] = a['hi']
            in_hop = self.punch is not None and -1 <= f - self.punch <= hop_f + 2
            if f % 2 == 1 or f == self.nF or in_hop:
                for a in ag:
                    root = a['root']
                    (px, py, pz), s = self.visible(a['x'], a['y'], 0.0)
                    walking = a['stop'] <= 0
                    t = f * dt
                    step = abs(math.sin(t * math.pi * 1.9 * a['speed'] + a['phase'])) if walking else 0.0
                    # A real jump at the punchline (parabola, g = 9.81 m/s²); walking never lifts the feet off the ground.
                    hop = plausibility.hop((f - self.punch) / self.fps, hop_h) if self.punch is not None else 0.0
                    root.location = (px, py, pz + hop * s)
                    root['sol'] = pz
                    flip = (1 if a['dir'] > 0 else -1) * (-1 if self.facing(a['name']) < 0 else 1)
                    root.scale = (s * flip, s, s * (1 + 0.012 * step))
                    root.rotation_euler = (0, math.radians(2.2) * math.sin(t * math.pi * 1.9 + a['phase']) if walking else 0, 0)
                    for path in ('location', 'scale', 'rotation_euler', '["sol"]'):
                        root.keyframe_insert(path, frame=f)

    # ── faune sauvage et autres espèces ────────────────────────────────────────────────────────────────────────────
    def make_singe(self, i):
        root = self.empty(f'singe-{i}')
        body = self.empty(f'singe-{i}-body')
        body.parent = root
        c = (110, 80, 55)
        self.blob('mb', (0, 0, 0.32), (0.13, 0.11, 0.17), c, body)
        head = self.empty(f'singe-{i}-head')
        head.parent = body
        head.location = (0.05, 0, 0.55)
        self.blob('mh', (0, 0, 0), (0.09, 0.09, 0.085), c, head)
        self.blob('mf', (0.06, 0, -0.01), (0.04, 0.06, 0.05), (210, 170, 140), head, seg=8)
        for dy in (-0.09, 0.09):
            self.blob('me', (0, dy, 0.02), (0.02, 0.025, 0.03), (210, 170, 140), head, seg=6)
            self.cyl('ma', (0.02, dy * 1.4, 0.25), 0.025, 0.36, c, body, rot=(0, math.radians(-15), 0))
            self.cyl('mlg', (0.0, dy, 0.1), 0.03, 0.22, c, body)
        self.cyl('mt', (-0.18, 0, 0.35), 0.015, 0.45, c, body, rot=(0, math.radians(-40), 0))
        return root, body, head

    def make_antilope(self, i):
        root, body, head = self.make_chevre(i)
        root.name = f'antilope-{i}'
        for ob in root.children_recursive:
            if ob.type == 'MESH' and ob.data.materials:
                ob.data.materials[0] = self.mat((190, 130, 70))
        body.scale = (1.25, 1.0, 1.15)
        return root, body, head

    def make_vache(self, i):
        root, body, head = self.make_chevre(i)
        root.name = f'vache-{i}'
        for ob in root.children_recursive:
            if ob.type == 'MESH' and ob.data.materials:
                ob.data.materials[0] = self.mat(self.rnd.choice([(240, 235, 228), (130, 80, 45), (60, 45, 35)]))
        root.scale = (2.1, 2.1, 2.1)
        return root, body, head

    def make_papillon(self, i, glow=False):
        root = self.empty(f'{"luciole" if glow else "papillon"}-{i}')
        c = self.rnd.choice([(250, 160, 40), (60, 150, 240), (240, 80, 150), (250, 240, 120)]) if not glow else (255, 250, 150)
        if glow:
            self.blob('lg', (0, 0, 0), (0.015, 0.015, 0.015), c, root, seg=6)
            return root, None, None
        self.blob('pb', (0, 0, 0), (0.025, 0.006, 0.006), (40, 30, 30), root, seg=6)
        wl = self.empty(f'papillon-{i}-wl')
        wl.parent = root
        wr = self.empty(f'papillon-{i}-wr')
        wr.parent = root
        self.blob('pwl', (0, 0.035, 0), (0.03, 0.035, 0.003), c, wl, seg=8)
        self.blob('pwr', (0, -0.035, 0), (0.03, 0.035, 0.003), c, wr, seg=8)
        return root, wl, wr

    def wild(self, i, a):
        """Behaviours of the species added to the living world (wild animals, insects, cattle)."""
        sp, ph = a['species'], a.get('phase', 0)
        if sp == 'singe':
            root, body, head = self.make_singe(i)
            u = self.free_u(a, a['depth'])
            for f in range(1, self.nF + 1, 2):
                t = f / self.fps
                cyc = (t + ph * 2) % 5.0
                hop = abs(math.sin(cyc * math.pi * 1.6)) * 0.12 if cyc < 1.2 else 0.0  # little hops, then sits scratching
                if self.punch and 0 <= f - self.punch < self.fps:
                    hop = 0.35 * abs(math.sin((f - self.punch) / self.fps * math.pi))  # jumps with the punchline
                u += 0.003 * a['dir'] if cyc < 1.2 else 0.0
                x, y, z, _ = self.ground(u, a['depth'] + 0.3)
                (px, py, pz), s = self.visible(x, y, z)
                root.location = (px, py, pz + hop * s)
                root.scale = (s, s, s)
                head.rotation_euler = (0, 0, math.radians(25) * math.sin(t * 1.3 + ph))
                for ob, path in ((root, 'location'), (root, 'scale'), (head, 'rotation_euler')):
                    ob.keyframe_insert(path, frame=f)
        elif sp in ('antilope', 'vache'):
            root, body, head = self.make_antilope(i) if sp == 'antilope' else self.make_vache(i)
            u = self.free_u(a, a['depth'] + 1.2)
            fled = 0.0
            for f in range(1, self.nF + 1, 2):
                t = f / self.fps
                graze = (math.sin(t * 0.6 + ph) + 1) / 2
                if sp == 'antilope' and self.punch and f >= self.punch:
                    fled = min(3.0, fled + 0.05)  # bounds away after the punchline
                x, y, z, _ = self.ground(u + fled * a['dir'], a['depth'] + 1.2)
                (px, py, pz), s = self.visible(x, y, z)
                jump = 0.15 * abs(math.sin(t * 7)) if fled > 0 else 0.0
                root.location = (px, py, pz + jump)
                sc = s * (2.1 if sp == 'vache' else 1.0)
                root.scale = (sc, sc, sc)
                root.rotation_euler = (0, 0, 0 if a['dir'] > 0 else math.pi)
                head.rotation_euler = (0, math.radians(60) * graze * (0 if fled else 1), 0)
                for ob, path in ((root, 'location'), (root, 'scale'), (root, 'rotation_euler'), (head, 'rotation_euler')):
                    ob.keyframe_insert(path, frame=f)
        elif sp in ('papillon', 'luciole'):
            glow = sp == 'luciole'
            root, wl, wr = self.make_papillon(i, glow)
            for f in range(1, self.nF + 1, 2):
                t = f / self.fps + ph * 4
                u = a['u'] + 0.25 * math.sin(t * 0.7) + 0.08 * math.sin(t * 2.3)
                q = 0.05 + 0.25 * (0.5 + 0.5 * math.sin(t * 0.9 + ph)) if not glow else -0.35 + 0.3 * (0.5 + 0.5 * math.sin(t * 0.5 + ph))
                root.location = self.sky(u, q, a['depth'] + 0.4)
                root.keyframe_insert('location', frame=f)
                if glow:
                    on = 0.5 + 0.5 * math.sin(t * 3.1 + ph * 5)
                    root.scale = (on, on, on)
                    root.keyframe_insert('scale', frame=f)
                else:
                    flap = math.sin(t * 30)
                    wl.rotation_euler = (math.radians(55) * flap, 0, 0)
                    wr.rotation_euler = (math.radians(-55) * flap, 0, 0)
                    wl.keyframe_insert('rotation_euler', frame=f)
                    wr.keyframe_insert('rotation_euler', frame=f)

    # ── objets de l'action ─────────────────────────────────────────────────────────────────────────────────────────
    def prop_mesh(self, kind, i):
        root = self.empty(f'prop-{kind}-{i}')
        if kind in ('poulet', 'assiette'):
            self.cyl('plate', (0, 0, 0.008), 0.13, 0.016, (245, 245, 240), root)
            if kind == 'poulet':
                for dx, dy, r in ((-0.03, 0.02, 0.0), (0.04, -0.02, 0.6), (0.0, 0.05, -0.5)):
                    leg = self.blob('leg', (dx, dy, 0.04), (0.05, 0.03, 0.03), (165, 95, 40), root, seg=10)
                    leg.rotation_euler = (0, 0, r)
            else:
                self.blob('food', (0, 0, 0.03), (0.09, 0.09, 0.03), (240, 230, 200), root, seg=10)
                self.blob('fish', (0.03, 0.02, 0.05), (0.05, 0.025, 0.02), (200, 120, 60), root, seg=8)
            return root, 0.0
        if kind == 'ballon':
            self.blob('ball', (0, 0, 0.11), (0.11, 0.11, 0.11), (240, 120, 30), root, seg=16)
            return root, 0.0
        if kind == 'orange':
            self.blob('or', (0, 0, 0.04), (0.04, 0.04, 0.04), (250, 150, 20), root, seg=12)
            return root, 0.0
        if kind == 'bouteilles':
            for dx in (-0.04, 0.04):
                self.cyl('b', (dx, 0, 0.11), 0.03, 0.22, (40, 120, 60), root)
                self.cyl('bn', (dx, 0, 0.25), 0.012, 0.07, (40, 120, 60), root)
            return root, 0.0
        if kind == 'valise':
            bpy = self.bpy
            bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.25))
            ob = bpy.context.active_object
            ob.scale = (0.4, 0.18, 0.5)
            ob.data.materials.append(self.mat((180, 40, 50)))
            ob.parent = root
            return root, 0.0
        if kind == 'tomates':
            self.cyl('basket', (0, 0, 0.06), 0.16, 0.12, (170, 120, 60), root)
            for j in range(9):
                ang = j * 2.1
                r = 0.08 if j < 6 else 0.03
                self.blob('t', (r * math.cos(ang), r * math.sin(ang), 0.14 + (0.05 if j >= 6 else 0)), (0.045, 0.045, 0.04), (215, 40, 30), root, seg=10)
            return root, 0.0
        if kind == 'billets':
            for j in range(3):
                bpy = self.bpy
                bpy.ops.mesh.primitive_cube_add(size=1, location=(0.01 * j, 0, 0.01 + 0.012 * j))
                ob = bpy.context.active_object
                ob.scale = (0.15, 0.07, 0.01)
                ob.data.materials.append(self.mat((120, 170, 120)))
                ob.parent = root
            return root, 0.0
        if kind == 'gateau':
            self.cyl('g1', (0, 0, 0.06), 0.14, 0.12, (250, 235, 240), root)
            self.cyl('g2', (0, 0, 0.15), 0.1, 0.07, (240, 150, 180), root)
            for j in range(3):
                self.cyl('cand', (-0.04 + 0.04 * j, 0, 0.22), 0.006, 0.06, (80, 160, 230), root)
                self.blob('flame', (-0.04 + 0.04 * j, 0, 0.26), (0.008, 0.008, 0.016), (255, 200, 60), root, seg=6)
            return root, 0.0
        if kind == 'papiers':
            for j in range(4):
                bpy = self.bpy
                bpy.ops.mesh.primitive_cube_add(size=1, location=(0.005 * j, 0, 0.005 + 0.01 * j))
                ob = bpy.context.active_object
                ob.scale = (0.21, 0.15, 0.008)
                ob.data.materials.append(self.mat((245, 245, 240)))
                ob.parent = root
            return root, 0.0
        if kind == 'marmite':
            self.cyl('pot', (0, 0, 0.12), 0.16, 0.24, (35, 35, 35), root)
            self.cyl('lid', (0, 0, 0.25), 0.15, 0.02, (60, 60, 60), root)
            return root, 0.0
        return None, 0.0

    def props(self):
        actors = self.c['actors']
        taken = []
        for i, p in enumerate(self.life['props']):
            ob, _ = self.prop_mesh(p['kind'], i)
            if ob is None:
                continue
            ac = actors.get(p['near'])
            ax = ac['plan']['x'] if ac else 0.0
            side = 1 if ax <= 0 else -1
            # Props line up on the floor next to their actor, never on top of each other (whoever they belong to):
            # the next free spot outward, alternating a little in depth.
            x, y, k = ax + side * 0.36, 0.16, 0
            sp = genrules.get('prop_spacing')
            while any(abs(x - tx) < sp and abs(y - ty) < 0.2 for tx, ty in taken) and k < 16:
                k += 1
                x += side * 0.24
                y = 0.16 + 0.07 * (k % 2)
            taken.append((x, y))
            ob.location = (x, y, 0.0)
            # When the line names it: a little life (the ball bounces, the rest jumps a little).
            f0 = int(p['at'] * self.fps) + 1
            for f in range(max(1, f0 - 2), min(self.nF, f0 + int(0.8 * self.fps)) + 1):
                q = (f - f0) / (0.8 * self.fps)
                h = (0.25 if p['kind'] == 'ballon' else 0.03) * abs(math.sin(q * math.pi * (3 if p['kind'] == 'ballon' else 1))) * (1 - max(0, q)) if q >= 0 else 0
                ob.location.z = h
                ob.keyframe_insert('location', index=2, frame=f)

    # ── ambiance ─────────────────────────────────────────────────────────────────────────────────────────────────────
    def sprite(self, name, rgb, alpha, size):
        """A soft round sprite (radial gradient alpha), emissive."""
        bpy = self.bpy
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Location'].default_value = (-0.5, -0.5, 0)
        mp.inputs['Scale'].default_value = (2, 2, 1)
        gr = nt.nodes.new('ShaderNodeTexGradient')
        gr.gradient_type = 'QUADRATIC_SPHERE'
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        mul.inputs[1].default_value = alpha
        mul.name = 'alpha'
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (*[(c / 255) ** 2.2 for c in self.tinted(rgb)], 1)
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
        nt.links.new(mp.outputs['Vector'], gr.inputs['Vector'])
        nt.links.new(gr.outputs['Fac'], mul.inputs[0])
        nt.links.new(mul.outputs[0], mix.inputs['Fac'])
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
        for attr, v in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED')):
            try:
                setattr(m, attr, v)
            except Exception:
                pass
        s = size / 2
        ob = self.c['mesh_object'](name, [(-s, 0, -s), (s, 0, -s), (s, 0, s), (-s, 0, s)], [(0, 1, 2, 3)], [(0, 0), (1, 0), (1, 1), (0, 1)], m)
        return ob, mul

    def fx(self):
        fx = self.life['fx']
        g = self.g
        if 'poussiere' in fx:
            # Dust in the light: tiny warm motes drifting slowly between the camera and the set.
            for i in range(36):
                ob, _ = self.sprite(f'dust-{i}', (255, 230, 170), 0.55, 0.012)
                x0, y0, z0 = self.rnd.uniform(-1.4, 1.4), self.rnd.uniform(-0.9, 1.2), self.rnd.uniform(0.2, 2.0)
                ph = self.rnd.uniform(0, 6.28)
                for f in range(1, self.nF + 1, 6):
                    t = f / self.fps
                    ob.location = (x0 + 0.08 * math.sin(t * 0.21 + ph), y0, z0 + 0.06 * math.sin(t * 0.17 + ph * 2) - 0.004 * t % 0.4)
                    ob.keyframe_insert('location', frame=f)
        if 'rayons' in fx:
            # Light shafts: long soft diagonal planes, breathing slowly.
            for i in range(3):
                ob, mul = self.sprite(f'ray-{i}', (255, 240, 200), 0.09, 1.0)
                ob.scale = (0.35, 1, 3.2)
                ob.rotation_euler = (0, math.radians(-28 + 8 * i), 0)
                ob.location = (-0.9 + 0.9 * i + self.rnd.uniform(-0.2, 0.2), 1.6, 1.6)
                for f in range(1, self.nF + 1, 12):
                    mul.inputs[1].default_value = 0.07 + 0.03 * math.sin(f / self.fps * 0.4 + i)
                    mul.inputs[1].keyframe_insert('default_value', frame=f)
        if 'vapeur' in fx:
            # Steam rising from the pots / grills: puffs that rise, widen and fade, looping.
            srcs = [(-0.9 + 0.6 * k, 1.3, 0.75) for k in range(3)]
            for si, (sx, sy, sz) in enumerate(srcs):
                for j in range(5):
                    ob, mul = self.sprite(f'steam-{si}-{j}', (245, 245, 245), 0.32, 0.22)
                    period = 3.2
                    off = j * period / 5
                    for f in range(1, self.nF + 1, 3):
                        q = ((f / self.fps + off) % period) / period
                        ob.location = (sx + 0.05 * math.sin(q * 6 + si), sy, sz + 0.6 * q)
                        ob.scale = (0.6 + 1.4 * q, 1, 0.6 + 1.4 * q)
                        mul.inputs[1].default_value = 0.3 * math.sin(q * math.pi)
                        ob.keyframe_insert('location', frame=f)
                        ob.keyframe_insert('scale', frame=f)
                        mul.inputs[1].keyframe_insert('default_value', frame=f)
        if 'feuilles' in fx and self.life.get('exterieur'):
            for i in range(10):
                c = self.rnd.choice([(90, 140, 50), (200, 150, 50), (150, 90, 40)])
                ob, _ = self.sprite(f'leaf-{i}', c, 0.95, 0.05)
                ob.scale = (1, 1, 0.45)
                x0, y0 = self.rnd.uniform(-1.3, 1.3), self.rnd.uniform(-0.3, 1.5)
                period = self.rnd.uniform(6, 11)
                ph = self.rnd.uniform(0, period)
                for f in range(1, self.nF + 1, 3):
                    q = ((f / self.fps + ph) % period) / period
                    ob.location = (x0 + 0.25 * math.sin(q * 9), y0, 2.6 - 2.7 * q)
                    ob.rotation_euler = (0, q * 12, 0)
                    ob.keyframe_insert('location', frame=f)
                    ob.keyframe_insert('rotation_euler', frame=f)
        if 'bokeh' in fx:
            # String lights in the back of the set, twinkling.
            for i in range(14):
                c = self.rnd.choice([(255, 210, 120), (255, 160, 90), (255, 235, 180), (120, 200, 255)])
                ob, mul = self.sprite(f'bulb-{i}', c, 0.9, 0.07)
                x, y, z = self.sky(-1.3 + 2.6 * i / 13, 0.72 + 0.06 * math.sin(i * 0.9), 1.8)
                (px, py, pz), sc = self.visible(x, y, z, margin=0.05)
                ob.location = (px, py, pz)
                ob.scale = (sc, 1, sc)
                ph = self.rnd.uniform(0, 6.28)
                for f in range(1, self.nF + 1, 6):
                    mul.inputs[1].default_value = 0.65 + 0.3 * math.sin(f / self.fps * 2.2 + ph)
                    mul.inputs[1].keyframe_insert('default_value', frame=f)


# ── DÉCORS 3D POUR LES LIEUX SANS DÉCOR PEINT ───────────────────────────────────────────────────────────────────────
# A MATTE PAINTING baked by Blender: the place is built in 3D (template room / hall / street / park, colours of the
# place), lit for real (physical sky + sun outdoors, ceiling light + window indoors, light bounces, denoised), rendered
# ONCE from the reference camera, its depth measured by ray casting — then it goes through exactly the same chain as
# the owner's painted sets (projected relief, soft close-ups, extras standing on its floor). Cached per place.
REF = {'C0': (0.0, -2.4, 1.0), 'Yp': 0.35}
# Names of the architectural shell (walls, floor, ceiling, ground, sky): sealed, never bevelled.
SHELL_PREFIXES = ('plaster', 'planks', 'floor', 'ground', 'sky', 'back', 'wall', 'ceiling', 'road', 'sidewalk', 'path')


def build_set(life, mat, lights=True):
    """The 3D place. `mat(name, rgb, rough)` makes a material. Returns nothing (objects in the scene)."""
    import bpy
    pal = [hex_rgb(c) for c in (life.get('palette') or ['#efe1c6', '#8a5a44', '#3d8b8b'])]
    rnd = random.Random(sum(ord(c) for c in life.get('place', 'x')) + int(life.get('variant', 0)) * 7919)
    RULES = genrules.load()

    GROUPS = []

    def reg(ob):
        if GROUPS:
            GROUPS[-1][1].append(ob)
        return ob

    class G:
        """An assembly: the parts created inside become children of one empty « asm-<name> » (bed = frame + legs +
        mattress + duvet + pillows). The generator declares what belongs together; the conformity check reads it."""
        def __init__(self, name):
            self.name = name

        def __enter__(self):
            GROUPS.append((self.name, []))
            return self

        def __exit__(self, *exc):
            name, parts = GROUPS.pop()
            em = bpy.data.objects.new(f'asm-{name}', None)
            bpy.context.scene.collection.objects.link(em)
            em['assembly'] = name
            for o in parts:
                if o.parent is None:
                    o.parent = em
            if GROUPS:
                GROUPS[-1][1].append(em)
            return False

    def obj(name, verts, faces, m):
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], faces)
        me.update()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(m)
        return reg(ob)

    def box(name, x0, x1, y0, y1, z0, z1, rgb, rough=0.7):
        if RULES.get('box_sorted_bounds', True):
            x0, x1 = min(x0, x1), max(x0, x1)
            y0, y1 = min(y0, y1), max(y0, y1)
            z0, z1 = min(z0, z1), max(z0, z1)
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        ob = obj(name, v, f, mat(name, rgb, rough))
        small = min(abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
        shell = name.startswith(SHELL_PREFIXES) or max(abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)) >= 2.5
        ob['shell'] = bool(shell)
        if small >= 0.03 and (not shell or RULES['shell_bevel']):
            bev = ob.modifiers.new('bevel', 'BEVEL')
            bev.width = min(0.035, small * 0.3)
            bev.segments = 3
            try:
                bev.harden_normals = True
            except Exception:
                pass
            for poly in ob.data.polygons:
                poly.use_smooth = True
        return ob

    def sphere(name, loc, r, rgb, rough=0.8):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=r, location=loc)
        ob = bpy.context.active_object
        ob.name = name
        ob.data.materials.append(mat(name, rgb, rough))
        bpy.ops.object.shade_smooth()
        return reg(ob)

    def lowsphere(name, loc, r, rgb, rough=0.8):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=loc)
        ob = bpy.context.active_object
        ob.name = name
        ob.data.materials.append(mat(name, rgb, rough))
        bpy.ops.object.shade_smooth()
        return reg(ob)

    def cyl(name, loc, r, h, rgb, rough=0.7):
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=r, depth=h, location=loc)
        ob = bpy.context.active_object
        ob.name = name
        ob.data.materials.append(mat(name, rgb, rough))
        bpy.ops.object.shade_smooth()
        return reg(ob)

    def puffy(name, x0, x1, y0, y1, z0, z1, rgb, rough=0.85, wrinkle=0.012):
        """A soft object (pillow, duvet, cushion): rounded and slightly wrinkled, like stuffed fabric."""
        ob = box(name, x0, x1, y0, y1, z0, z1, rgb, rough)
        ss = ob.modifiers.new('soft', 'SUBSURF')
        ss.levels = 2
        ss.render_levels = 3
        if wrinkle > 0:
            tex = bpy.data.textures.new(name + '-wr', 'CLOUDS')
            tex.noise_scale = 0.18
            dp = ob.modifiers.new('wrinkle', 'DISPLACE')
            dp.texture = tex
            dp.texture_coords = 'GLOBAL'
            dp.strength = wrinkle
            dp.mid_level = 0.5
        for poly in ob.data.polygons:
            poly.use_smooth = True
        return ob

    def curtain(name, x0, x1, y, z0, z1, rgb, folds=7, depth=0.05):
        """A pleated curtain: a sheet with soft vertical folds that widen towards the hem."""
        nx, nz = 48, 12
        vs, fs = [], []
        for j in range(nz + 1):
            z = z1 - (z1 - z0) * j / nz
            for i in range(nx + 1):
                u = i / nx
                amp = depth * (0.55 + 0.45 * j / nz)
                vs.append((x0 + (x1 - x0) * u, y - amp * (0.5 + 0.5 * math.sin(u * folds * 2 * math.pi)), z))
        for j in range(nz):
            for i in range(nx):
                a = j * (nx + 1) + i
                fs.append((a, a + 1, a + nx + 2, a + nx + 1))
        ob = obj(name, vs, fs, mat(name, rgb, 0.9))
        sol = ob.modifiers.new('thick', 'SOLIDIFY')
        sol.thickness = 0.008
        for poly in ob.data.polygons:
            poly.use_smooth = True
        return ob

    def cone(name, loc, r1, r2, h, rgb, rough=0.8):
        bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=r1, radius2=r2, depth=h, location=loc)
        ob = bpy.context.active_object
        ob.name = name
        ob.data.materials.append(mat(name, rgb, rough))
        bpy.ops.object.shade_smooth()
        return reg(ob)

    def torus(name, loc, R, r, rgb, rot=(0, 0, 0), rough=0.4):
        bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=40, minor_segments=10, location=loc, rotation=rot)
        ob = bpy.context.active_object
        ob.name = name
        ob.data.materials.append(mat(name, rgb, rough))
        bpy.ops.object.shade_smooth()
        return reg(ob)

    def light(name, kind, loc, energy, color=(1.0, 0.85, 0.65), size=0.1, rot=None):
        if not lights:
            return None
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        if kind in ('POINT', 'SPOT'):
            ld.shadow_soft_size = size
        elif kind == 'AREA':
            ld.size = size
        elif kind == 'SUN':
            ld.angle = math.radians(size)
        lo = bpy.data.objects.new(name, ld)
        bpy.context.scene.collection.objects.link(lo)
        lo.location = loc
        if rot:
            lo.rotation_euler = rot
        return reg(lo)

    def text(body, loc, size, rgb):
        cu = bpy.data.curves.new('t', 'FONT')
        cu.body = body
        cu.size = size
        cu.align_x = 'CENTER'
        cu.extrude = 0.01
        ob = bpy.data.objects.new('t', cu)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = loc
        ob.rotation_euler = (math.radians(90), 0, 0)
        ob.data.materials.append(mat('t', rgb, 0.4))
        reg(ob)

    tpl = life.get('template', 'piece')
    wall, floor, accent = pal[0], pal[1], pal[2]
    grade = life.get('grade', 'jour')
    sc = bpy.context.scene
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    sc.world = world
    bg = world.node_tree.nodes['Background']
    if tpl == 'hall':
        wall = tuple(int(c * 0.35 + 238 * 0.65) for c in wall)
    K = {'box': box, 'sphere': sphere, 'cyl': cyl, 'text': text, 'puffy': puffy, 'curtain': curtain, 'cone': cone, 'torus': torus, 'light': light,
         'plan': FloorPlan(RULES['furniture_clearance']), 'G': G, 'obj': obj, 'mat': mat, 'lowsphere': lowsphere, 'reg': reg}
    if tpl == 'piece':
        D, Hh, Wd = 3.4, 2.9, 6.0
        # Back wall in four pieces around a REAL window opening: the daylight enters and lands on the floor.
        WX0, WX1, WZ0, WZ1 = -1.5, -0.4, 1.0, 2.15
        box('plasterback-l', -Wd / 2, WX0, D, D + 0.15, 0, Hh, wall)
        box('plasterback-r', WX1, Wd / 2, D, D + 0.15, 0, Hh, wall)
        box('plasterback-b', WX0, WX1, D, D + 0.15, 0, WZ0, wall)
        box('plasterback-t', WX0, WX1, D, D + 0.15, WZ1, Hh, wall)
        box('plasterwallL', -Wd / 2 - 0.1, -Wd / 2, -3, D, 0, Hh, tuple(int(c * 0.92) for c in wall))
        box('plasterwallR', Wd / 2, Wd / 2 + 0.1, -3, D, 0, Hh, tuple(int(c * 0.95) for c in wall))
        box('plasterceiling', -Wd / 2, Wd / 2, -3, D, Hh, Hh + 0.1, (240, 236, 228))
        box('planks', -Wd / 2, Wd / 2, -3, D, -0.1, 0, floor, 0.4)
        # Outside the window: the sky of the hour, a mango tree and the neighbour's wall (depth through the window).
        skyb = box('sky', -4.0, 3.0, D + 3.2, D + 3.3, -1.0, 5.0, (150, 195, 235), 1.0)
        skyb.visible_shadow = False  # the sky lights, it never blocks the sun
        box('plasterneighbour', -3.5, 2.5, D + 2.2, D + 2.4, 0, 1.6, (215, 190, 150))
        with G('manguier'):
            cyl('woodmango', (-1.3, D + 1.6, 1.2), 0.12, 2.4, (95, 70, 45))
            for j in range(7):
                sphere(f'mangoleaf{j}', (-1.3 + rnd.uniform(-0.8, 0.8), D + 1.6 + rnd.uniform(-0.3, 0.3), 2.3 + rnd.uniform(-0.2, 0.6)), rnd.uniform(0.45, 0.7), rnd.choice([(55, 120, 50), (70, 140, 55), (45, 105, 45)]), 0.85)
        box('skirting', -Wd / 2, Wd / 2, D - 0.03, D, 0, 0.12, tuple(int(c * 0.6) for c in accent))
        objs = set(life.get('objets') or [])
        furnish_room(life, objs, K, rnd, D, Hh, Wd, wall, floor, accent, (WX0, WX1, WZ0, WZ1))
        if lights:
            night = grade in ('soir', 'nuit')
            bg.inputs[0].default_value = (0.42, 0.5, 0.62, 1) if night else (0.62, 0.7, 0.8, 1)
            bg.inputs[1].default_value = 0.25 if night else 0.45
            # Key: the sun through the window (low and orange in the evening), a beam on the floor towards the camera.
            elev = {'jour': 48, 'doree': 22, 'soir': 14, 'nuit': 8}.get(grade, 40)
            light('sun', 'SUN', (0, 0, 0), 4.2 if not night else 2.6, (1.0, 0.9, 0.75) if not night else (1.0, 0.62, 0.36), 2.0,
                  (-math.radians(90 - elev), 0, math.radians(-18)))
            # Fill: soft sky bounce from the ceiling, warmer in the evening.
            light('fill', 'AREA', (0.4, 0.6, Hh - 0.05), 420 if not night else 260, (0.92, 0.95, 1.0) if not night else (1.0, 0.8, 0.6), 3.5)
        return
    if tpl == 'hall':
        D, Hh, Wd = 7.0, 4.6, 12.0
        box('plasterback', -Wd / 2, Wd / 2, D, D + 0.1, 0, Hh, wall)
        box('plasterwallL', -Wd / 2 - 0.1, -Wd / 2, -3, D, 0, Hh, tuple(int(c * 0.92) for c in wall))
        box('plasterwallR', Wd / 2, Wd / 2 + 0.1, -3, D, 0, Hh, tuple(int(c * 0.95) for c in wall))
        box('plasterceiling', -Wd / 2, Wd / 2, -3, D, Hh, Hh + 0.1, (240, 236, 228))
        box('floor', -Wd / 2, Wd / 2, -3, D, -0.1, 0, (214, 206, 196), 0.14)
        step = 0.6
        for k in range(int(Wd / step)):
            box(f'seam{k}', -Wd / 2 + step * k, -Wd / 2 + step * k + 0.008, -3, D, 0, 0.001, (170, 162, 152))
        for k in range(int((D + 3) / step)):
            box(f'seamy{k}', -Wd / 2, Wd / 2, -3 + step * k, -3 + step * k + 0.008, 0, 0.001, (170, 162, 152))
        box('skirting', -Wd / 2, Wd / 2, D - 0.03, D, 0, 0.12, tuple(int(c * 0.6) for c in accent))
        objs = set(life.get('objets') or [])
        furnish_hall(life, objs, box, sphere, cyl, text, rnd, D, Hh, Wd, G)
        if lights:
            bg.inputs[0].default_value = (0.55, 0.5, 0.45, 1)
            bg.inputs[1].default_value = 0.35
            ld = bpy.data.lights.new('ceil', 'AREA')
            ld.size = 2.5
            ld.energy = 2600
            ld.color = (1.0, 0.86, 0.68) if grade in ('soir', 'nuit') else (1.0, 0.95, 0.85)
            lo = bpy.data.objects.new('ceil', ld)
            sc.collection.objects.link(lo)
            lo.location = (0, 1.2, Hh - 0.05)
            sun = bpy.data.lights.new('sun', 'SUN')
            sun.energy = 3.0
            sun.angle = math.radians(4)
            so = bpy.data.objects.new('sun', sun)
            sc.collection.objects.link(so)
            so.rotation_euler = (math.radians(55), 0, math.radians(200))
        return
    # Outdoors: physical sky, sun, ground; street façades or a park.
    elev = {'jour': 55, 'doree': 14, 'soir': 6, 'nuit': -4, 'naturel': 45}.get(grade, 45)
    if lights:
        sky = world.node_tree.nodes.new('ShaderNodeTexSky')
        try:
            sky.sky_type = 'MULTIPLE_SCATTERING'
        except Exception:
            pass
        try:
            sky.sun_elevation = math.radians(max(elev, 2))
            sky.sun_rotation = math.radians(220)
        except Exception:
            pass
        world.node_tree.links.new(sky.outputs[0], bg.inputs[0])
        bg.inputs[1].default_value = 0.6 if elev > 0 else 0.08
        sun = bpy.data.lights.new('sun', 'SUN')
        sun.energy = 4.5 if elev > 10 else 2.0
        sun.angle = math.radians(2)
        sun.color = (1.0, 0.93, 0.8) if elev > 10 else (1.0, 0.7, 0.45)
        so = bpy.data.objects.new('sun', sun)
        sc.collection.objects.link(so)
        so.rotation_euler = (math.radians(90 - max(elev, 2)), 0, math.radians(220))
    if tpl in ('ville', 'maison', 'nature', 'imaginaire'):
        # The procedural library: whole places generated on demand, in variants (life['variant']).
        import procedural
        if tpl == 'imaginaire' and lights:
            # A violet dream sky lit by two moons and glowing life; a low pink sun.
            for l in list(world.node_tree.links):
                if l.to_node == bg:
                    world.node_tree.links.remove(l)
            bg.inputs[0].default_value = (0.32, 0.18, 0.55, 1)
            bg.inputs[1].default_value = 0.9
            sun.energy, sun.color = 1.6, (1.0, 0.6, 0.85)
        getattr(procedural, f'build_{tpl}')(bpy, K, rnd, life)
        return
    ground = (86, 150, 60) if tpl == 'parc' else (176, 150, 118)
    box('ground', -30, 30, -5, 40, -0.1, 0, ground, 0.95)
    if tpl == 'rue':
        box('road', -30, 30, -5, 2.4, 0, 0.004, (85, 85, 90), 0.8)
        box('sidewalk', -30, 30, 2.4, 6, 0, 0.12, (195, 185, 170), 0.85)
        x = -14
        k = 0
        while x < 14:
            w = rnd.uniform(2.2, 3.4)
            h = rnd.uniform(3.2, 7.0)
            col = hex_rgb(rnd.choice(life.get('palette') or ['#e0a96d']))
            col = tuple(int(c * rnd.uniform(0.85, 1.05)) for c in col)
            box(f'fac{k}', x, x + w - 0.08, 4.0, 6.0, 0, h, col, 0.9)
            for r in range(int(h // 1.5)):
                for c in range(int(w // 1.0)):
                    box(f'win{k}-{r}-{c}', x + 0.3 + c * 1.0, x + 0.8 + c * 1.0, 3.97, 4.0, 1.1 + r * 1.5, 1.85 + r * 1.5, (70, 95, 115), 0.15)
            box(f'awn{k}', x, x + w - 0.08, 3.4, 4.0, 2.3, 2.42, rnd.choice([(220, 60, 50), (40, 120, 200), (240, 170, 40), (60, 160, 90)]), 0.7)
            text(rnd.choice(['BOUTIQUE', 'MAQUIS', 'PRESSING', 'ALIMENTATION', 'COIFFURE', 'CABINE']), (x + w / 2, 3.96, 2.55), 0.22, (40, 40, 40))
            x += w
            k += 1
        for xx in (-6.5, -0.5, 5.5):
            cyl(f'pole{xx}', (xx, 3.2, 3.0), 0.07, 6.0, (90, 90, 90), 0.5)
        for xx in (-9, 9):
            cyl(f'palm{xx}', (xx, 3.6, 2.6), 0.16, 5.2, (130, 95, 60), 0.9)
            for k in range(7):
                ang = k * 2 * math.pi / 7
                leaf = box(f'pl{xx}{k}', 0, 1.8, -0.12, 0.12, -0.02, 0.02, (60, 140, 60), 0.8)
                leaf.location = (xx, 3.6, 5.2)
                leaf.rotation_euler = (0, math.radians(25), ang)
        import vehicles
        vehicles.car(bpy, K, 'taxi', (-3.1, 1.75, 0), kind='taxi', heading=0)
    else:
        box('path', -1.5, 1.5, -5, 40, 0, 0.01, (214, 176, 120), 0.95)
        for k in range(16):
            xx = rnd.uniform(-14, 14)
            yy = rnd.uniform(4, 16)
            if abs(xx) < 2.2:
                xx += 4 * (1 if xx >= 0 else -1)
            h = rnd.uniform(2.2, 3.4)
            with G(f'arbre{k}'):
                cyl(f'trunk{k}', (xx, yy, h / 2), 0.17, h, (105, 75, 50), 0.9)
                for j in range(6):
                    sphere(f'leaf{k}{j}', (xx + rnd.uniform(-0.7, 0.7), yy + rnd.uniform(-0.5, 0.5), h + rnd.uniform(0, 1.2)), rnd.uniform(0.7, 1.1), rnd.choice([(70, 140, 60), (90, 160, 70), (60, 125, 55)]), 0.85)
        for xx in (-3.2, 2.0):
            box(f'bench{xx}', xx, xx + 1.4, 3.0, 3.4, 0.4, 0.48, (140, 90, 50), 0.6)
            box(f'benchb{xx}', xx, xx + 1.4, 3.35, 3.42, 0.48, 0.95, (140, 90, 50), 0.6)
        for k in range(10):
            sphere(f'bush{k}', (rnd.uniform(-12, 12), rnd.uniform(3.2, 5), 0.25), rnd.uniform(0.35, 0.6), (75, 145, 65), 0.9)
        furnish_park(life, set(life.get('objets') or []), box, sphere, cyl, rnd, G)


class FloorPlan:
    """The floor of a room as the generator sees it BEFORE placing anything: every piece reserves its footprint (plus a
    clearance taken from the generation rules), and the free pieces (plant, fan…) take the first free spot of their
    candidates. Nothing can be generated on top of something else: conformity by construction, not by correction."""
    def __init__(self, clearance=0.05):
        self.c, self.taken = clearance, []

    def free(self, x0, x1, y0, y1):
        c = self.c
        return all(x1 + c <= a0 or x0 - c >= a1 or y1 + c <= b0 or y0 - c >= b1 for a0, a1, b0, b1 in self.taken)

    def reserve(self, x0, x1, y0, y1):
        self.taken.append((x0, x1, y0, y1))
        return (x0, x1, y0, y1)

    def spot(self, candidates, hw, hd):
        """First candidate centre (x, y) whose footprint (half width hw, half depth hd) is free; reserved."""
        for x, y in candidates:
            if self.free(x - hw, x + hw, y - hd, y + hd):
                self.reserve(x - hw, x + hw, y - hd, y + hd)
                return x, y
        return None

def furnish_room(life, objs, K, rnd, D, Hh, Wd, wall, floor, accent, win):
    """An interior of the quartier, furnished from the objects of its place, built like a set of an animated feature:
    rounded solid furniture, stuffed fabrics, pleated curtains, wood with grain, a window grille, practical lamps that
    really light — a bedroom has its bed and mosquito net, an office its desks, a classroom its blackboard, a ward its
    bed and drip, a living room its sofa and TV."""
    box, sphere, cyl, text, puffy, curtain, cone, torus, light, G = (K[k] for k in ('box', 'sphere', 'cyl', 'text', 'puffy', 'curtain', 'cone', 'torus', 'light', 'G'))
    WX0, WX1, WZ0, WZ1 = win
    night = life.get('grade') in ('soir', 'nuit')
    wood = (140, 92, 56)
    plan = K['plan']
    big = {'lit': [(0.21, 2.39, D - 2.18, D - 0.01), (-0.3, 0.15, D - 0.5, D - 0.05)], 'ordinateur': [(-0.1, 1.2, D - 1.4, D - 0.2), (1.55, 2.85, D - 1.4, D - 0.2), (-2.9, -2.1, D - 0.52, D - 0.05)],
           'tableau': [(-2.3 + k * 1.6, -1.1 + k * 1.6, D - 2.95 + r * 0.9, D - 2.2 + r * 0.9) for r in range(2) for k in range(3)],
           'salon': [(0.1, 2.7, D - 0.9, D - 0.1), (-0.82, 0.32, D - 1.77, D - 1.13)]}
    kind = 'lit' if ('lit' in objs or 'perfusion' in objs) else ('ordinateur' if 'ordinateur' in objs else ('tableau' if 'tableau' in objs else 'salon'))
    for fp in big[kind]:
        plan.reserve(*fp)
    if 'armoire' in objs:
        plan.reserve(-2.98, -2.02, D - 0.66, D - 0.02)
        plan.reserve(-1.97, -1.53, D - 1.9, D - 1.45)
    elif 'ordinateur' not in objs:
        plan.reserve(-2.9, -2.2, D - 0.4, D - 0.05)
    if 'tele' in objs and 'lit' not in objs:
        plan.reserve(-2.0, -1.0, D - 0.55, D - 0.1)
    # Window: painted wooden frame, a wrought-iron grille (every house of the quartier has one), sill, pleated curtains.
    with G('fenetre'):
        for nm, xa, xb, za, zb in (('woodframe-l', WX0 - 0.07, WX0, WZ0 - 0.07, WZ1 + 0.07), ('woodframe-r', WX1, WX1 + 0.07, WZ0 - 0.07, WZ1 + 0.07),
                                   ('woodframe-t', WX0, WX1, WZ1, WZ1 + 0.07), ('woodframe-b', WX0 - 0.1, WX1 + 0.1, WZ0 - 0.07, WZ0)):
            box(nm, xa, xb, D - 0.06, D + 0.02, za, zb, (245, 243, 238), 0.45)
        for k in range(1, 5):
            xx = WX0 + (WX1 - WX0) * k / 5
            box(f'metalbar{k}', xx - 0.008, xx + 0.008, D + 0.04, D + 0.06, WZ0, WZ1, (40, 40, 45), 0.35)
        for k in range(1, 3):
            zz = WZ0 + (WZ1 - WZ0) * k / 3
            box(f'metalbarh{k}', WX0, WX1, D + 0.04, D + 0.06, zz - 0.008, zz + 0.008, (40, 40, 45), 0.35)
        K['torus']('metalcurl', ((WX0 + WX1) / 2, D + 0.05, (WZ0 + WZ1) / 2), 0.16, 0.008, (40, 40, 45), (math.radians(90), 0, 0))
        curtain('fabriccurt-l', WX0 - 0.42, WX0 + 0.02, D - 0.1, 0.62, 2.45, accent, folds=5)
        curtain('fabriccurt-r', WX1 - 0.02, WX1 + 0.42, D - 0.1, 0.62, 2.45, accent, folds=5)
        cyl('metalrod', ((WX0 + WX1) / 2, D - 0.12, 2.5), 0.012, WX1 - WX0 + 1.0, (60, 50, 40)).rotation_euler = (0, math.radians(90), 0)
    # Wall clock, calendar, a family photo frame — the small truths of a lived-in room.
    with G('horloge'):
        c = cyl('clockface', (1.3, D - 0.03, 2.35), 0.17, 0.03, (248, 245, 238), 0.3)
        c.rotation_euler = (math.radians(90), 0, 0)
        torus('woodclockrim', (1.3, D - 0.035, 2.35), 0.175, 0.022, wood, (math.radians(90), 0, 0))
        box('hand1', 1.295, 1.305, D - 0.06, D - 0.055, 2.35, 2.47, (30, 30, 30), 0.4)
        box('hand2', 1.3, 1.39, D - 0.06, D - 0.055, 2.345, 2.355, (30, 30, 30), 0.4)
    with G('calendrier'):
        box('paper-cal', 2.2, 2.62, D - 0.02, D - 0.01, 1.45, 2.0, (248, 248, 245), 0.8)
        box('cal-head', 2.2, 2.62, D - 0.025, D - 0.015, 1.86, 2.0, (200, 40, 40), 0.6)
    # Pendant lamp (fabric shade); lit in the evening.
    with G('suspension'):
        cyl('cord', (0.3, 1.6, Hh - 0.25), 0.005, 0.5, (40, 40, 40), 0.5)
        cone('fabricshade', (0.3, 1.6, Hh - 0.56), 0.24, 0.1, 0.2, (240, 220, 180), 0.9)
        sphere('glowbulb', (0.3, 1.6, Hh - 0.62), 0.045, (255, 235, 200), 0.3)
        if night:
            light('pendant', 'POINT', (0.3, 1.6, Hh - 0.66), 60, (1.0, 0.78, 0.5), 0.08)
    # Rug: wax print, slightly puffy with a fringe.
    with G('tapis'):
        box('waxrug', -1.5, 1.5, D - 2.45, D - 1.05, 0.0, 0.012, accent, 0.95)
        for side, (ya, yb) in enumerate(((D - 2.52, D - 2.45), (D - 1.05, D - 0.98))):
            for k in range(24):
                xx = -1.48 + k * 0.128
                box(f'fringe{side}-{k}', xx, xx + 0.012, ya, yb, 0.0, 0.004, (235, 225, 200), 0.9)
    if 'lit' in objs or 'perfusion' in objs:
        hosp = 'perfusion' in objs
        x0 = 0.25
        with G('lit'):
            if hosp:
                box('metalbed', x0, x0 + 2.1, D - 2.1, D - 0.1, 0.35, 0.45, (232, 235, 240), 0.3)
                for lx in (x0 + 0.05, x0 + 2.0):
                    for ly in (D - 2.05, D - 0.2):
                        cyl(f'metalleg{lx}{ly}', (lx, ly, 0.18), 0.02, 0.36, (200, 205, 210), 0.3)
                box('metalhead', x0, x0 + 2.1, D - 0.14, D - 0.1, 0.45, 0.95, (232, 235, 240), 0.3)
            else:
                box('woodbed', x0, x0 + 2.1, D - 2.15, D - 0.05, 0.12, 0.34, wood, 0.45)
                for lx in (x0 + 0.03, x0 + 1.99):
                    box(f'woodleg{lx}', lx, lx + 0.08, D - 2.13, D - 2.05, 0.0, 0.12, wood, 0.45)
                box('woodhead', x0 - 0.04, x0 + 2.14, D - 0.13, D - 0.03, 0.12, 1.1, tuple(int(c * 0.86) for c in wood), 0.45)
                box('woodheadtop', x0 - 0.08, x0 + 2.18, D - 0.15, D - 0.01, 1.08, 1.15, tuple(int(c * 0.8) for c in wood), 0.45)
            puffy('fabricmattress', x0 + 0.03, x0 + 2.07, D - 2.12, D - 0.14, 0.34 if not hosp else 0.45, 0.56 if not hosp else 0.62, (248, 247, 242), 0.9, wrinkle=0.003)
            top = 0.56 if not hosp else 0.62
            puffy('waxduvet' if not hosp else 'fabricduvet', x0 - 0.02, x0 + 2.12, D - 2.18, D - 0.85, top - 0.08, top + 0.06, accent if not hosp else (120, 160, 210), 0.95, wrinkle=0.02)
            for k, xx in enumerate((x0 + 0.15, x0 + 1.1)):
                puffy(f'fabricpillow{k}', xx, xx + 0.85, D - 0.62, D - 0.2, top - 0.02, top + 0.16, (252, 250, 244), 0.95, wrinkle=0.008)
        if hosp:
            with G('perfusion'):
                cyl('metalivpole', (x0 - 0.35, D - 0.9, 0.95), 0.015, 1.9, (200, 200, 205), 0.25)
                puffy('glassivbag', x0 - 0.45, x0 - 0.25, D - 0.94, D - 0.86, 1.55, 1.85, (225, 235, 245), 0.1, wrinkle=0)
            with G('moniteur'):
                box('metalmonitor', x0 + 2.3, x0 + 2.75, D - 0.32, D - 0.1, 1.15, 1.48, (60, 60, 65), 0.4)
                box('screenmon', x0 + 2.33, x0 + 2.72, D - 0.33, D - 0.32, 1.18, 1.45, (40, 200, 120), 0.2)
        else:
            # Mosquito net gathered in a knot above the bed (by day), nightstand, lamp that really lights, slippers.
            with G('moustiquaire'):
                # Tied up by day: a slim twisted bundle of tulle under its ring, knotted at the bottom.
                torus('metalnetring', (x0 + 1.05, D - 0.9, Hh - 0.2), 0.09, 0.006, (200, 200, 200))
                cone('netbundle', (x0 + 1.05, D - 0.9, Hh - 0.6), 0.09, 0.025, 0.8, (250, 250, 252), 0.9)
                sphere('netknot', (x0 + 1.05, D - 0.9, Hh - 1.02), 0.05, (250, 250, 252), 0.9)
                cyl('cordnet', (x0 + 1.05, D - 0.9, Hh - 0.1), 0.003, 0.2, (220, 220, 220), 0.6)
            with G('tablenuit'):
                box('woodnight', x0 - 0.55, x0 - 0.1, D - 0.5, D - 0.05, 0.0, 0.55, wood, 0.45)
                box('wooddrawer', x0 - 0.52, x0 - 0.13, D - 0.52, D - 0.5, 0.3, 0.48, tuple(int(c * 0.85) for c in wood), 0.45)
                cyl('lampbase', (x0 - 0.32, D - 0.28, 0.66), 0.05, 0.22, (205, 170, 110), 0.3)
                cone('fabriclamp', (x0 - 0.32, D - 0.28, 0.88), 0.15, 0.09, 0.2, (250, 228, 190), 0.9)
                light('bedlamp', 'POINT', (x0 - 0.32, D - 0.28, 0.86), 25 if night else 8, (1.0, 0.75, 0.45), 0.05)
            box('phone', x0 + 1.5, x0 + 1.62, D - 1.3, D - 1.08, top + 0.06, top + 0.075, (25, 25, 30), 0.2)
            for k, xx in enumerate((x0 + 0.6, x0 + 0.82)):
                puffy(f'fabricslipper{k}', xx, xx + 0.13, D - 2.55, D - 2.28, 0.0, 0.05, (210, 60, 50), 0.7, wrinkle=0)
            with G('affiche'):
                box('poster', x0 + 0.55, x0 + 1.55, D - 0.02, D - 0.01, 1.45, 2.1, (230, 120, 60), 0.6)
                text('CAN', (x0 + 1.05, D - 0.025, 1.82), 0.2, (255, 255, 255))
    elif 'ordinateur' in objs:
        for k, xx in enumerate((-0.1, 1.55)):
            with G(f'bureau{k}'):
                box(f'wooddesk{k}', xx, xx + 1.3, D - 0.9, D - 0.2, 0.72, 0.77, (225, 215, 195), 0.4)
                for lx in (xx + 0.04, xx + 1.22):
                    box(f'metalleg{k}{lx}', lx, lx + 0.04, D - 0.88, D - 0.22, 0.0, 0.72, (80, 80, 85), 0.4)
                box(f'mon{k}', xx + 0.35, xx + 0.95, D - 0.42, D - 0.38, 0.85, 1.22, (35, 35, 40), 0.3)
                box(f'screen{k}', xx + 0.38, xx + 0.92, D - 0.43, D - 0.42, 0.88, 1.19, (200, 220, 255), 0.2)
                box(f'stand{k}', xx + 0.62, xx + 0.68, D - 0.42, D - 0.36, 0.77, 0.86, (35, 35, 40), 0.3)
                box(f'paper{k}', xx + 0.05, xx + 0.3, D - 0.75, D - 0.55, 0.77, 0.8, (250, 250, 250), 0.9)
                puffy(f'fabricchair{k}', xx + 0.4, xx + 0.9, D - 1.35, D - 0.95, 0.42, 0.52, (40, 50, 70), 0.8, wrinkle=0)
                box(f'fabricchairback{k}', xx + 0.42, xx + 0.88, D - 1.4, D - 1.33, 0.52, 1.0, (40, 50, 70), 0.8)
        with G('classeur'):
            box('metalcabinet', -2.9, -2.1, D - 0.5, D - 0.05, 0.0, 1.3, (150, 155, 160), 0.35)
            for r in range(3):
                box(f'metaldrawer{r}', -2.85, -2.15, D - 0.52, D - 0.5, 0.1 + r * 0.4, 0.45 + r * 0.4, (170, 175, 180), 0.35)
    elif 'tableau' in objs:
        with G('tableau'):
            box('board', -1.2, 1.8, D - 0.04, D - 0.01, 1.0, 2.15, (40, 85, 60), 0.85)
            box('woodboardframe', -1.25, 1.85, D - 0.05, D - 0.04, 0.95, 2.2, wood, 0.5)
            text('2 + 2 = ?', (0.3, D - 0.045, 1.65), 0.22, (240, 240, 230))
        for r in range(2):
            for k in range(3):
                xx = -2.3 + k * 1.6
                yy = D - 2.6 + r * 0.9
                with G(f'banc{r}{k}'):
                    box(f'woodbench{r}{k}', xx, xx + 1.2, yy, yy + 0.4, 0.68, 0.73, wood, 0.6)
                    box(f'woodseat{r}{k}', xx, xx + 1.2, yy - 0.35, yy - 0.15, 0.4, 0.45, wood, 0.6)
    else:
        # Living room: stuffed sofa with wax cushions, coffee table with lace and tea glasses, TV.
        with G('canape'):
            puffy('fabricsofa', 0.2, 2.6, D - 0.9, D - 0.15, 0.12, 0.48, accent, 0.95, wrinkle=0.006)
            puffy('fabricsofaback', 0.2, 2.6, D - 0.35, D - 0.1, 0.45, 0.98, tuple(int(c * 0.9) for c in accent), 0.95, wrinkle=0.006)
            for xx in (0.1, 2.5):
                puffy(f'fabricarm{xx}', xx, xx + 0.2, D - 0.9, D - 0.1, 0.12, 0.72, tuple(int(c * 0.85) for c in accent), 0.95, wrinkle=0.004)
            for k, xx in enumerate((0.45, 1.85)):
                puffy(f'waxcushion{k}', xx, xx + 0.42, D - 0.42, D - 0.22, 0.48, 0.86, (200, 120, 40), 0.95, wrinkle=0.01)
        with G('table'):
            box('woodtable', -0.8, 0.3, D - 1.75, D - 1.15, 0.4, 0.46, wood, 0.4)
            for lx in (-0.76, 0.22):
                box(f'woodtleg{lx}', lx, lx + 0.04, D - 1.7, D - 1.2, 0.0, 0.4, wood, 0.4)
            box('fabriclace', -0.82, 0.32, D - 1.77, D - 1.13, 0.46, 0.465, (248, 244, 236), 0.9)
            for k in range(3):
                cyl(f'glasstea{k}', (-0.5 + k * 0.18, D - 1.45, 0.51), 0.025, 0.09, (230, 200, 150), 0.05)
        with G('cadres'):
            for k, xx in enumerate((0.6, 1.3, 2.0)):
                box(f'woodphoto{k}', xx, xx + 0.5, D - 0.04, D - 0.01, 1.35 + 0.12 * (k % 2), 1.95 + 0.12 * (k % 2), (110, 75, 45), 0.5)
                box(f'photo{k}', xx + 0.05, xx + 0.45, D - 0.05, D - 0.04, 1.4 + 0.12 * (k % 2), 1.9 + 0.12 * (k % 2), rnd.choice([(205, 175, 140), (150, 180, 205), (215, 195, 165)]), 0.3)
    if 'armoire' in objs:
        with G('armoire'):
            box('woodward', -2.95, -2.05, D - 0.62, D - 0.05, 0.05, 2.05, wood, 0.45)
            for fx in (-2.93, -2.11):
                for fy in (D - 0.6, D - 0.11):
                    box(f'woodwardfoot{fx}{fy}', fx, fx + 0.04, fy, fy + 0.04, 0.0, 0.05, tuple(int(c * 0.7) for c in wood), 0.45)
            box('woodwardtop', -2.98, -2.02, D - 0.65, D - 0.02, 2.05, 2.12, tuple(int(c * 0.8) for c in wood), 0.45)
            box('woodwardline', -2.505, -2.495, D - 0.63, D - 0.62, 0.1, 2.0, tuple(int(c * 0.6) for c in wood), 0.5)
            for xx in (-2.56, -2.44):
                box(f'metalknob{xx}', xx - 0.015, xx + 0.015, D - 0.66, D - 0.62, 1.0, 1.1, (200, 170, 90), 0.2)
            puffy('fabricsuitcase', -2.9, -2.3, D - 0.55, D - 0.2, 2.12, 2.4, (170, 50, 40), 0.5, wrinkle=0)
        # The monobloc chair with a folded pagne on it.
        cx = -1.75
        with G('chaise'):
            box('chairseat', cx - 0.22, cx + 0.22, D - 1.9, D - 1.48, 0.42, 0.46, (240, 240, 240), 0.35)
            box('chairback', cx - 0.22, cx + 0.22, D - 1.5, D - 1.45, 0.46, 0.9, (240, 240, 240), 0.35)
            for lx in (cx - 0.2, cx + 0.17):
                for ly in (D - 1.88, D - 1.5):
                    box(f'chairleg{lx}{ly}', lx, lx + 0.03, ly, ly + 0.03, 0.0, 0.42, (235, 235, 235), 0.35)
            puffy('waxpagne', cx - 0.2, cx + 0.2, D - 1.85, D - 1.55, 0.46, 0.52, (40, 110, 170), 0.95, wrinkle=0.01)
    elif 'ordinateur' not in objs:
        with G('etagere'):
            box('woodshelf', -2.9, -2.2, D - 0.4, D - 0.05, 0, 1.8, (115, 75, 45), 0.5)
            for r in range(3):
                box(f'woodboard{r}', -2.9, -2.2, D - 0.4, D - 0.05, 0.33 + r * 0.55, 0.36 + r * 0.55, (125, 82, 50), 0.5)
                for k in range(4):
                    h = rnd.uniform(0.18, 0.3)
                    box(f'book{r}{k}', -2.85 + k * 0.15, -2.73 + k * 0.15, D - 0.35, D - 0.12, 0.36 + r * 0.55, 0.36 + r * 0.55 + h, rnd.choice([(170, 50, 40), (40, 90, 160), (220, 170, 50), (60, 130, 80)]), 0.6)
    if 'tele' in objs and 'lit' not in objs:
        with G('tv'):
            box('woodtv', -2.0, -1.0, D - 0.55, D - 0.1, 0.0, 0.5, wood, 0.5)
            box('tv', -1.9, -1.1, D - 0.45, D - 0.15, 0.5, 1.05, (40, 40, 44), 0.4)
            box('screentv', -1.85, -1.15, D - 0.46, D - 0.45, 0.55, 1.0, (160, 200, 255), 0.2)
    # Standing fan (the sound of every room of the quartier) and a plant in a terracotta pot.
    fx_, fy_ = plan.spot([(2.7, D - 0.7), (2.7, D - 1.6), (-2.6, D - 1.6), (2.7, D - 2.4)], 0.22, 0.22) or (2.7, D - 0.7)
    with G('ventilateur'):
        cyl('metalfanbase', (fx_, fy_, 0.02), 0.18, 0.04, (230, 230, 230), 0.35)
        cyl('metalfanpole', (fx_, fy_, 0.6), 0.02, 1.15, (230, 230, 230), 0.35)
        sphere('fanmotor', (fx_, fy_ + 0.06, 1.2), 0.08, (235, 235, 235), 0.35)
        torus('metalfancage', (fx_, fy_ - 0.05, 1.2), 0.2, 0.008, (215, 215, 220), (math.radians(90), 0, 0))
        for k in range(3):
            bl = box(f'fanblade{k}', -0.02, 0.17, -0.004, 0.004, -0.04, 0.04, (90, 160, 210), 0.4)
            bl.location = (fx_, fy_ - 0.04, 1.2)
            bl.rotation_euler = (0, math.radians(120 * k + 20), 0)
    px, py = plan.spot([(-1.75, D - 0.5), (-2.0, D - 0.9), (2.65, D - 0.35), (-2.7, D - 1.5), (2.6, D - 2.3)], 0.2, 0.2) or (-2.0, D - 0.9)
    with G('plante'):
        cyl('potterra', (px, py, 0.2), 0.16, 0.4, (180, 90, 50), 0.6)
        for k in range(6):
            sphere(f'leafp{k}', (px + rnd.uniform(-0.15, 0.15), py + rnd.uniform(-0.1, 0.1), 0.55 + 0.11 * k), 0.18 - 0.02 * k, rnd.choice([(55, 125, 55), (70, 140, 60)]), 0.8)


def furnish_hall(life, objs, box, sphere, cyl, text, rnd, D, Hh, Wd, G=None):
    """A public hall (mall, airport, court): lit shop fronts with goods, glossy floor, ceiling light panels, signs."""
    import contextlib
    G = G or (lambda name: contextlib.nullcontext())
    place = life.get('place', '')
    if place == 'aeroport' or 'tapis' in objs:
        names = ['DÉPARTS', 'ARRIVÉES', 'DOUANE', 'CHANGE', 'AIR CI', 'BAGAGES']
    elif place == 'tribunal' or 'marteau' in objs:
        names = ['SALLE 1', 'GREFFE', 'SALLE 2', 'ARCHIVES', 'SALLE 3', 'ACCUEIL']
    else:
        names = ['MODE', 'BIJOUX', 'TÉLÉPHONES', 'PHARMACIE', 'CAFÉ', 'CHAUSSURES', 'PROMO', 'PRESSING']
    n = len(names)
    shopw = (Wd - 0.6) / n
    for k in range(n):
        x0 = -Wd / 2 + 0.3 + k * shopw
        col = rnd.choice([(220, 60, 50), (40, 120, 200), (240, 170, 40), (60, 160, 90), (150, 70, 160)])
        with G(f'boutique{k}'):
            box(f'glowshop{k}', x0 + 0.05, x0 + shopw - 0.05, D - 0.02, D, 0.0, 2.7, (255, 240, 220), 0.3)
            box(f'glassfront{k}', x0 + 0.05, x0 + shopw - 0.05, D - 0.5, D - 0.48, 0.05, 2.6, (210, 230, 240), 0.05)
            box(f'post{k}', x0, x0 + 0.06, D - 0.55, D, 0.0, 3.2, (90, 92, 100), 0.3)
            box(f'sign{k}', x0, x0 + shopw, D - 0.6, D - 0.5, 2.75, 3.15, col, 0.45)
            text(names[k], (x0 + shopw / 2, D - 0.61, 2.86), 0.19, (255, 255, 255))
            # Goods on shelves behind the glass, or mannequins for fashion.
            if names[k] in ('MODE', 'CHAUSSURES', 'PROMO'):
                for j in range(2):
                    mx = x0 + shopw * (0.3 + 0.4 * j)
                    cyl(f'manq{k}{j}', (mx, D - 0.25, 0.75), 0.13, 1.1, rnd.choice([(230, 80, 60), (60, 120, 200), (240, 190, 60)]), 0.8)
                    sphere(f'manh{k}{j}', (mx, D - 0.25, 1.45), 0.12, (230, 220, 210), 0.4)
            else:
                for r in range(3):
                    box(f'shelf{k}{r}', x0 + 0.15, x0 + shopw - 0.15, D - 0.3, D - 0.05, 0.4 + r * 0.6, 0.43 + r * 0.6, (240, 240, 240), 0.3)
                    for j in range(int((shopw - 0.3) / 0.18)):
                        box(f'good{k}{r}{j}', x0 + 0.18 + j * 0.18, x0 + 0.31 + j * 0.18, D - 0.25, D - 0.1, 0.43 + r * 0.6, 0.43 + r * 0.6 + rnd.uniform(0.12, 0.25),
                            rnd.choice([(220, 60, 50), (40, 120, 200), (240, 170, 40), (60, 160, 90), (250, 250, 250)]), 0.5)
    # Ceiling light panels.
    for i in range(5):
        for j in range(3):
            box(f'glowpanel{i}{j}', -Wd / 2 + 1.2 + i * 2.3, -Wd / 2 + 2.2 + i * 2.3, -1 + j * 2.4, -0.4 + j * 2.4, Hh - 0.03, Hh, (255, 250, 240), 0.3)
    for k in range(5):
        xx = -Wd / 2 + 1.0 + k * 2.5
        cyl(f'pillar{k}', (xx, D - 1.6, Hh / 2), 0.22, Hh, (240, 238, 232), 0.3)
    for xx in (-3.2, 1.8):
        with G(f'banc{xx}'):
            box(f'bench{xx}', xx, xx + 1.4, D - 2.6, D - 2.2, 0.38, 0.46, (90, 90, 100), 0.4)
            cyl(f'planter{xx}', (xx + 1.9, D - 2.4, 0.3), 0.3, 0.6, (200, 195, 185))
            for k in range(4):
                sphere(f'bush{xx}{k}', (xx + 1.9 + rnd.uniform(-0.2, 0.2), D - 2.4, 0.8 + 0.15 * k), 0.32 - 0.05 * k, (70, 140, 70))
    if 'caddie' in objs:
        box('cart', 3.4, 4.1, D - 2.0, D - 1.5, 0.35, 0.85, (190, 195, 200), 0.25)
    if 'valise' in objs or 'tapis' in objs:
        for k, xx in enumerate((-4.5, -4.0, 3.6)):
            box(f'case{k}', xx, xx + 0.45, D - 2.3, D - 2.05, 0.0, 0.65, rnd.choice([(170, 50, 40), (40, 90, 160), (60, 60, 70)]), 0.4)


def furnish_park(life, objs, box, sphere, cyl, rnd, G=None):
    """A park that breathes: flower beds, lamp posts, a fountain, a hazy skyline far away."""
    import contextlib
    G = G or (lambda name: contextlib.nullcontext())
    for k in range(9):
        cx, cy = rnd.uniform(-11, 11), rnd.uniform(3.4, 6.5)
        if abs(cx) < 2.4:
            cx += 4 * (1 if cx >= 0 else -1)
        col = rnd.choice([(230, 60, 80), (250, 200, 40), (240, 120, 40), (200, 90, 200), (255, 255, 255)])
        with G(f'massif{k}'):
            for j in range(7):
                sphere(f'flower{k}{j}', (cx + rnd.uniform(-0.5, 0.5), cy + rnd.uniform(-0.3, 0.3), 0.18), rnd.uniform(0.07, 0.11), col, 0.6)
    for xx in (-5.5, 4.5):
        with G(f'lampadaire{xx}'):
            cyl(f'lamppost{xx}', (xx, 3.8, 1.6), 0.05, 3.2, (50, 55, 60), 0.4)
            sphere(f'glowbulb{xx}', (xx, 3.8, 3.3), 0.16, (255, 235, 190), 0.3)
    with G('fontaine'):
        cyl('fountain', (0.0, 9.0, 0.25), 1.4, 0.5, (210, 205, 195), 0.5)
        cyl('glasswater', (0.0, 9.0, 0.46), 1.25, 0.06, (120, 170, 210), 0.05)
        cyl('fountainmid', (0.0, 9.0, 0.9), 0.18, 1.2, (210, 205, 195), 0.5)
    for k in range(14):
        xx = -26 + k * 4 + rnd.uniform(-0.6, 0.6)
        h = rnd.uniform(5, 14)
        box(f'skyline{k}', xx, xx + rnd.uniform(2.2, 3.6), 32, 34, 0, h, (176, 190, 205), 0.9)
    if 'ballon' in objs:
        sphere('ball', (2.6, 2.4, 0.12), 0.12, (240, 240, 240), 0.5)



def bake_material_factory(life):
    """The physically based materials of a built place (wood, plaster, fabric, wax, paint, glass, lights…), by name."""
    import bpy
    cache = {}

    def mat(name, rgb, rough=0.7):
        # One material per (kind, colour, roughness): a city of twelve cars needs a few dozen materials, not hundreds
        # (real-time budget — game engines draw one call per material).
        kind = re.sub(r'\d+$', '', name.split('-')[0])
        key = (kind, tuple(int(c) for c in rgb), round(rough, 2))
        if key not in cache:
            cache[key] = _make(name, rgb, rough)
            if not (name in ('win',) or name.startswith(('glow', 'screen', 'sky', 'tint', 'glass', 'net'))):
                surface_detail(cache[key], rough)
        return cache[key]

    def surface_detail(m, rough):
        """The MATTER of the troupe's style on every surface (measured gap — style.py: the drawings have almost no flat
        area): colour variation at two scales, a fine relief, grime in the recesses (ambient occlusion), varying gloss."""
        nt = m.node_tree
        b = nt.nodes.get('Principled BSDF')
        if b is None:
            return
        tc = nt.nodes.new('ShaderNodeTexCoord')
        big = nt.nodes.new('ShaderNodeTexNoise')
        big.inputs['Scale'].default_value = 3.5
        big.inputs['Detail'].default_value = 6.0
        fine = nt.nodes.new('ShaderNodeTexNoise')
        fine.inputs['Scale'].default_value = 45.0
        fine.inputs['Detail'].default_value = 3.0
        for n_ in (big, fine):
            nt.links.new(tc.outputs['Object'], n_.inputs['Vector'])

        def remap(src, lo, hi):
            mr = nt.nodes.new('ShaderNodeMapRange')
            mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = lo, hi
            nt.links.new(src, mr.inputs['Value'])
            return mr.outputs['Result']

        def mul(a, b_):
            mm = nt.nodes.new('ShaderNodeMath')
            mm.operation = 'MULTIPLY'
            nt.links.new(a, mm.inputs[0])
            nt.links.new(b_, mm.inputs[1])
            return mm.outputs[0]

        ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
        ao.samples = 4
        ao.inputs['Distance'].default_value = 0.3
        shade = mul(mul(remap(big.outputs['Fac'], 0.82, 1.12), remap(fine.outputs['Fac'], 0.94, 1.06)), remap(ao.outputs['AO'], 0.72, 1.0))
        cc = nt.nodes.new('ShaderNodeCombineColor')
        for i in range(3):
            nt.links.new(shade, cc.inputs[i])
        mx = nt.nodes.new('ShaderNodeMix')
        mx.data_type = 'RGBA'
        mx.blend_type = 'MULTIPLY'
        mx.inputs['Factor'].default_value = 1.0
        base = b.inputs['Base Color']
        if base.is_linked:
            nt.links.new(base.links[0].from_socket, mx.inputs['A'])
        else:
            mx.inputs['A'].default_value = base.default_value
        nt.links.new(cc.outputs['Color'], mx.inputs['B'])
        nt.links.new(mx.outputs['Result'], base)
        if not b.inputs['Normal'].is_linked:
            bump = nt.nodes.new('ShaderNodeBump')
            bump.inputs['Strength'].default_value = 0.18
            bump.inputs['Distance'].default_value = 0.02
            nt.links.new(fine.outputs['Fac'], bump.inputs['Height'])
            nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
        if not b.inputs['Roughness'].is_linked:
            r0 = b.inputs['Roughness'].default_value
            nt.links.new(remap(big.outputs['Fac'], max(0.05, r0 - 0.12), min(1.0, r0 + 0.12)), b.inputs['Roughness'])

    def _make(name, rgb, rough):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes.get('Principled BSDF')
        lin = [(c / 255) ** 2.2 for c in rgb]
        b.inputs['Base Color'].default_value = (*lin, 1)
        b.inputs['Roughness'].default_value = rough
        if name in ('win',) or name.startswith('glow') or name.startswith('screen'):
            warm = (1.0, 0.8, 0.55, 1) if life.get('grade') in ('soir', 'nuit') else (1.0, 0.97, 0.9, 1)
            mx_ = max(lin) or 1.0
            own = (*[c / mx_ for c in lin], 1)
            b.inputs['Emission Color'].default_value = (0.75, 0.88, 1.0, 1) if name.startswith('screen') else (own if name.startswith('glow') else warm)
            b.inputs['Emission Strength'].default_value = 6.0 if name == 'win' else (3.5 if name.startswith('glow') else 2.2)
            return m
        if name.startswith('wax'):
            # Wax print: bold ring motifs (the classic « œil » wax) in the colour, its deep shade and gold.
            tc = nt.nodes.new('ShaderNodeTexCoord')
            mp = nt.nodes.new('ShaderNodeMapping')
            mp.inputs['Scale'].default_value = (3.0, 3.0, 3.0)
            nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
            wave = nt.nodes.new('ShaderNodeTexWave')
            wave.wave_type = 'RINGS'
            wave.inputs['Scale'].default_value = 2.2
            wave.inputs['Distortion'].default_value = 1.5
            nt.links.new(mp.outputs['Vector'], wave.inputs['Vector'])
            vor = nt.nodes.new('ShaderNodeTexVoronoi')
            vor.inputs['Scale'].default_value = 5.0
            nt.links.new(mp.outputs['Vector'], vor.inputs['Vector'])
            ramp = nt.nodes.new('ShaderNodeValToRGB')
            ramp.color_ramp.interpolation = 'CONSTANT'
            e = ramp.color_ramp.elements
            e[0].color = (*[v * 0.22 for v in lin], 1)
            e[1].position = 0.38
            e[1].color = (0.8, 0.52, 0.06, 1)
            e3 = e.new(0.62)
            e3.color = (*lin, 1)
            mixf = nt.nodes.new('ShaderNodeMath')
            mixf.operation = 'MULTIPLY'
            nt.links.new(wave.outputs['Fac'], mixf.inputs[0])
            nt.links.new(vor.outputs['Distance'], mixf.inputs[1])
            sq = nt.nodes.new('ShaderNodeMath')
            sq.operation = 'POWER'
            sq.inputs[1].default_value = 0.5
            nt.links.new(mixf.outputs['Value'], sq.inputs[0])
            nt.links.new(sq.outputs['Value'], ramp.inputs['Fac'])
            nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
            try:
                b.inputs['Sheen Weight'].default_value = 0.5
            except Exception:
                pass
            return m
        if name.startswith('facade') or name.startswith('tiles'):
            tc = nt.nodes.new('ShaderNodeTexCoord')
            br = nt.nodes.new('ShaderNodeTexBrick')
            if name.startswith('facade'):
                # A facade is vertical: the brick pattern (X/Y) is laid on its X/Z plane.
                mp = nt.nodes.new('ShaderNodeMapping')
                mp.inputs['Rotation'].default_value = (math.radians(-90), 0, 0)
                nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
                nt.links.new(mp.outputs['Vector'], br.inputs['Vector'])
            else:
                nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
            if name.startswith('facade'):
                # Windows (glass, some lit at dusk) in a grid, the wall between them in the facade colour.
                br.offset = 0.0
                br.inputs['Scale'].default_value = 1.0
                br.inputs['Brick Width'].default_value = 2.4
                br.inputs['Row Height'].default_value = 3.0
                br.inputs['Mortar Size'].default_value = 0.55
                br.inputs['Mortar Smooth'].default_value = 0.0
                g = life.get('grade', 'jour')
                glass = (0.12, 0.16, 0.22, 1) if g == 'jour' else (0.9, 0.62, 0.32, 1)
                br.inputs['Color1'].default_value = glass
                br.inputs['Color2'].default_value = (glass[0] * 0.8, glass[1] * 0.85, glass[2] * 0.9, 1)
                br.inputs['Mortar'].default_value = (*lin, 1)
                nt.links.new(br.outputs['Color'], b.inputs['Base Color'])
                inv = nt.nodes.new('ShaderNodeMath')
                inv.operation = 'SUBTRACT'
                inv.inputs[0].default_value = 1.0
                nt.links.new(br.outputs['Fac'], inv.inputs[1])
                rr = nt.nodes.new('ShaderNodeMapRange')
                rr.inputs['To Min'].default_value = rough
                rr.inputs['To Max'].default_value = 0.08
                nt.links.new(inv.outputs[0], rr.inputs['Value'])
                nt.links.new(rr.outputs['Result'], b.inputs['Roughness'])
                if g in ('soir', 'nuit'):
                    nt.links.new(br.outputs['Color'], b.inputs['Emission Color'])
                    em = nt.nodes.new('ShaderNodeMath')
                    em.operation = 'MULTIPLY'
                    em.inputs[1].default_value = 1.5
                    nt.links.new(inv.outputs[0], em.inputs[0])
                    nt.links.new(em.outputs[0], b.inputs['Emission Strength'])
            else:
                br.offset = 0.0
                br.inputs['Scale'].default_value = 1.0
                br.inputs['Brick Width'].default_value = 0.6
                br.inputs['Row Height'].default_value = 0.6
                br.inputs['Mortar Size'].default_value = 0.012
                br.inputs['Color1'].default_value = (*lin, 1)
                br.inputs['Color2'].default_value = (*[v * 0.88 for v in lin], 1)
                br.inputs['Mortar'].default_value = (*[v * 0.55 for v in lin], 1)
                nt.links.new(br.outputs['Color'], b.inputs['Base Color'])
                bump = nt.nodes.new('ShaderNodeBump')
                bump.inputs['Strength'].default_value = 0.2
                nt.links.new(br.outputs['Fac'], bump.inputs['Height'])
                nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
            return m
        if name.startswith('paint'):
            # Car paint: coloured base with a fine metallic flake under a glossy clear coat.
            b.inputs['Metallic'].default_value = 0.35
            b.inputs['Roughness'].default_value = 0.3
            for k, v in (('Coat Weight', 1.0), ('Coat Roughness', 0.03)):
                try:
                    b.inputs[k].default_value = v
                except Exception:
                    pass
            return m
        if name.startswith('tint'):
            # Tinted car glass: dark and mirror-like (no see-through into an empty body).
            b.inputs['Roughness'].default_value = 0.03
            for k, v in (('Coat Weight', 1.0), ('Coat Roughness', 0.0), ('Specular IOR Level', 0.7)):
                try:
                    b.inputs[k].default_value = v
                except Exception:
                    pass
            return m
        if name.startswith('sky'):
            # The sky seen through the window: bright, warm at dusk, deep blue at night.
            g = life.get('grade', 'jour')
            col = {'soir': (1.0, 0.62, 0.38), 'nuit': (0.12, 0.16, 0.32), 'doree': (1.0, 0.78, 0.5)}.get(g, (0.62, 0.8, 1.0))
            b.inputs['Base Color'].default_value = (*col, 1)
            b.inputs['Emission Color'].default_value = (*col, 1)
            b.inputs['Emission Strength'].default_value = 2.2 if g != 'nuit' else 0.6
            return m
        if name.startswith('net'):
            # Tulle: a fine woven grid, mostly see-through (a mosquito net reads as a net, not as a cloth).
            tc = nt.nodes.new('ShaderNodeTexCoord')
            chk = nt.nodes.new('ShaderNodeTexChecker')
            chk.inputs['Scale'].default_value = 260.0
            chk.inputs['Color1'].default_value = (0.55, 0.55, 0.55, 1)
            chk.inputs['Color2'].default_value = (0.12, 0.12, 0.12, 1)
            nt.links.new(tc.outputs['UV'], chk.inputs['Vector'])
            nt.links.new(chk.outputs['Fac'], b.inputs['Alpha'])
            b.inputs['Roughness'].default_value = 0.9
            return m
        if name.startswith('metal'):
            b.inputs['Metallic'].default_value = 0.85
            b.inputs['Roughness'].default_value = min(rough, 0.4)
            return m
        if name.startswith('wood') or name == 'planks':
            # Wood: long grain streaks (stretched noise) between two tones; planks on the floor with their joints.
            tc = nt.nodes.new('ShaderNodeTexCoord')
            mp = nt.nodes.new('ShaderNodeMapping')
            mp.inputs['Scale'].default_value = (0.6, 18.0, 18.0) if name != 'planks' else (0.8, 2.0, 30.0)
            nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
            nz = nt.nodes.new('ShaderNodeTexNoise')
            nz.inputs['Scale'].default_value = 2.0
            nz.inputs['Detail'].default_value = 8.0
            nz.inputs['Distortion'].default_value = 1.5
            nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
            ramp = nt.nodes.new('ShaderNodeValToRGB')
            ramp.color_ramp.elements[0].position = 0.35
            ramp.color_ramp.elements[0].color = (*[v * 0.62 for v in lin], 1)
            ramp.color_ramp.elements[1].position = 0.7
            ramp.color_ramp.elements[1].color = (*[min(1.0, v * 1.15) for v in lin], 1)
            nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
            out = ramp.outputs['Color']
            if name == 'planks':
                br = nt.nodes.new('ShaderNodeTexBrick')
                br.inputs['Scale'].default_value = 1.0
                br.inputs['Brick Width'].default_value = 1.4
                br.inputs['Row Height'].default_value = 0.16
                br.inputs['Mortar Size'].default_value = 0.004
                br.inputs['Color1'].default_value = (1, 1, 1, 1)
                br.inputs['Color2'].default_value = (0.82, 0.82, 0.82, 1)
                br.inputs['Mortar'].default_value = (0.35, 0.35, 0.35, 1)
                nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
                mx = nt.nodes.new('ShaderNodeMix')
                mx.data_type = 'RGBA'
                mx.blend_type = 'MULTIPLY'
                mx.inputs['Factor'].default_value = 1.0
                nt.links.new(out, mx.inputs['A'])
                nt.links.new(br.outputs['Color'], mx.inputs['B'])
                out = mx.outputs['Result']
                bump = nt.nodes.new('ShaderNodeBump')
                bump.inputs['Strength'].default_value = 0.25
                nt.links.new(br.outputs['Fac'], bump.inputs['Height'])
                nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
            nt.links.new(out, b.inputs['Base Color'])
            b.inputs['Roughness'].default_value = rough
            return m
        if name.startswith('fabric') or name.startswith('wax'):
            try:
                b.inputs['Sheen Weight'].default_value = 0.6
                b.inputs['Sheen Roughness'].default_value = 0.5
            except Exception:
                pass
        if name.startswith('glass'):
            b.inputs['Roughness'].default_value = 0.04
            try:
                b.inputs['Transmission Weight'].default_value = 0.85
            except Exception:
                pass
            return m
        # Micro-variation of colour and roughness: plaster, wood, fabric are never one flat colour.
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 3.5
        nz.inputs['Detail'].default_value = 6.0
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['To Min'].default_value = 0.9
        mr.inputs['To Max'].default_value = 1.08
        nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs['A'].default_value = (*lin, 1)
        cmb = nt.nodes.new('ShaderNodeCombineColor')
        for k in ('Red', 'Green', 'Blue'):
            nt.links.new(mr.outputs['Result'], cmb.inputs[k])
        nt.links.new(cmb.outputs['Color'], mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
        rr = nt.nodes.new('ShaderNodeMapRange')
        rr.inputs['To Min'].default_value = max(0.02, rough - 0.08)
        rr.inputs['To Max'].default_value = min(1.0, rough + 0.08)
        nt.links.new(nz.outputs['Fac'], rr.inputs['Value'])
        nt.links.new(rr.outputs['Result'], b.inputs['Roughness'])
        if name.startswith('plaster') or name.startswith('fabric'):
            fine = nt.nodes.new('ShaderNodeTexNoise')
            fine.inputs['Scale'].default_value = 60.0 if name.startswith('plaster') else 140.0
            fine.inputs['Detail'].default_value = 4.0
            nt.links.new(tc.outputs['Object'], fine.inputs['Vector'])
            bump = nt.nodes.new('ShaderNodeBump')
            bump.inputs['Strength'].default_value = 0.08 if name.startswith('plaster') else 0.15
            nt.links.new(fine.outputs['Fac'], bump.inputs['Height'])
            nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
        return m
    return mat


def meter_exposure(sc, target=0.46, size=160):
    """Spot meter: render the frame small and fast, read its mean luminance, set the exposure (stops) so that the full
    render lands on `target`. Bounded to ±3 stops; never touches a scene already metered."""
    import bpy
    import numpy as np
    import tempfile
    rs = sc.render
    keep = (rs.resolution_x, rs.resolution_y, rs.resolution_percentage, rs.filepath, sc.cycles.samples)
    ar = rs.resolution_y / max(1, rs.resolution_x)
    rs.resolution_x, rs.resolution_y, rs.resolution_percentage = size, max(16, int(size * ar)), 100
    sc.cycles.samples = 8
    tmp = os.path.join(tempfile.gettempdir(), f'meter-{os.getpid()}.png')
    rs.filepath = tmp
    try:
        # A few readings, like a camera's metering loop: the display curve (AgX) compresses the highlights, so one
        # reading under-corrects a sun-burnt place; we converge on the target before the bake.
        for _ in range(4):
            bpy.ops.render.render(write_still=True)
            im = bpy.data.images.load(tmp)
            a = np.empty(im.size[0] * im.size[1] * 4, np.float32)
            im.pixels.foreach_get(a)
            bpy.data.images.remove(im)
            os.remove(tmp)
            lum = float((a.reshape(-1, 4)[:, :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32)).mean())
            if abs(lum - target) <= 0.05:
                break
            stops = max(-3.0, min(3.0, math.log2(max(1e-3, target) / max(1e-3, lum)) * 1.6))
            sc.view_settings.exposure = max(-6.0, min(6.0, sc.view_settings.exposure + stops))
        print(f'[cellule] luminance {lum:.2f} → exposition {sc.view_settings.exposure:+.2f} IL', flush=True)
    finally:
        rs.resolution_x, rs.resolution_y, rs.resolution_percentage, rs.filepath, sc.cycles.samples = keep


def bake_template(life, out_dir, samples=48, size=(2048, 1024), style_ref=None):
    """Render the 3D place ONCE as a painted set + its depth map. Returns a décor entry like the kit's."""
    import bpy
    import numpy as np
    os.makedirs(out_dir, exist_ok=True)
    key = 'v12-' + re.sub(r'[^a-z0-9]+', '-', fold(f"{life.get('place')}-{life.get('template')}-{life.get('grade')}-v{int(life.get('variant', 0))}-{'-'.join(life.get('palette', []))}-{'-'.join(sorted(life.get('objets') or []))}"))[:150]
    img_path = os.path.join(out_dir, f'baked-{key}.png')
    dep_path = os.path.join(out_dir, f'baked-{key}.depth.png')
    fit = {'mH': 2.8, 'floor': 0.86, 'cx': 0.5}
    if os.path.isfile(img_path) and os.path.isfile(dep_path):
        return {'image': img_path, 'depth': dep_path, 'fit': fit, 'baked': True, 'preflight': os.path.join(out_dir, f'baked-{key}.preflight.json')}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene

    mat = bake_material_factory(life)

    build_set(life, mat, lights=True)
    W, H = size
    mH = fit['mH']
    Wm = mH * W / H
    x0 = -fit['cx'] * Wm
    ztop = fit['floor'] * mH
    C0, Yp = REF['C0'], REF['Yp']
    d0 = Yp - C0[1]
    cam = bpy.data.cameras.new('bake')
    cam.sensor_fit = 'HORIZONTAL'
    cam.sensor_width = 36
    cam.lens = 36 * d0 / Wm
    cam.shift_x = ((x0 + Wm / 2) - C0[0]) / Wm
    cam.shift_y = ((ztop - mH / 2) - C0[2]) / Wm
    co = bpy.data.objects.new('bake', cam)
    sc.collection.objects.link(co)
    co.location = C0
    co.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = co
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.max_bounces = 4
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [e.identifier for e in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    for look in ('AgX - Punchy', 'AgX - Medium High Contrast', 'Punchy'):
        try:
            sc.view_settings.look = look
            break
        except Exception:
            continue
    sc.render.image_settings.file_format = 'PNG'
    # Light meter (like a camera's): a tiny test render measures the light of the place and sets the exposure BEFORE
    # the bake, so a wide sunny place is not burnt and a dim room not murky — right at the first render.
    meter_exposure(sc, target=0.46)
    # PREFLIGHT QA of the built place before it is baked: a set with a critical fault is never used.
    import preflight
    qa = preflight.run('decor', life.get('nom') or life.get('place', ''), life=life, probe_frames=[1], out=os.path.join(out_dir, f'baked-{key}.preflight'))
    print(f"[conformité décor] objectifs {qa['taux_objectifs']} % · qualité {qa['score']}/100 · {qa['verdict']} · "
          f"conforme dès la génération : {'oui' if qa['conforme_des_la_generation'] else 'non'}", flush=True)
    if not qa['passed']:
        raise RuntimeError('décor bloqué par le preflight : ' + '; '.join(i['message'] for i in qa['issues'] if i['severite'] == 'critique'))
    sc.render.filepath = img_path
    bpy.ops.render.render(write_still=True)
    # The painted-set grade: the owner's sets are warm and saturated (Pixar-like), a raw render is not.
    im = bpy.data.images.load(img_path)
    a = np.empty(im.size[0] * im.size[1] * 4, np.float32)
    im.pixels.foreach_get(a)
    a = a.reshape(-1, 4)
    rgb = a[:, :3]
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    warm = {'doree': (1.08, 1.0, 0.86), 'soir': (1.04, 0.94, 0.9), 'nuit': (0.85, 0.9, 1.08)}.get(life.get('grade', 'jour'), (1.03, 1.0, 0.95))
    rgb = lum[:, None] + (rgb - lum[:, None]) * 1.32
    rgb = rgb * np.array(warm, np.float32)
    rgb = 0.5 + (rgb - 0.5) * 1.08
    a[:, :3] = np.clip(rgb, 0, 1)
    # Then the MEASURED grade: toward the visual signature of the troupe's own drawings (style.py), bounded.
    style_rep = None
    if style_ref:
        import style as stylemod
        Wi, Hi = im.size
        img_rgb = a[:, :3].reshape(Hi, Wi, 3)
        before = stylemod.signature(img_rgb)
        graded, gains = stylemod.grade(img_rgb, before, style_ref)
        a[:, :3] = graded.reshape(-1, 3).astype(np.float32)
        after = stylemod.signature(graded)
        cmp_ = stylemod.compare(after, style_ref)
        style_rep = {'avant': before, 'apres': after, 'reglages': gains, 'hors_plage': [k for k, v in cmp_.items() if not v[3]]}
        print(f"[style] décor étalonné vers la troupe ({gains}) — hors plage : {style_rep['hors_plage'] or 'aucun critère'}", flush=True)
    im.pixels.foreach_set(a.ravel())
    im.filepath_raw = img_path
    im.file_format = 'PNG'
    im.save()
    # Depth by ray casting from the reference camera (near = bright, like the depth maps of the painted sets).
    dg = bpy.context.evaluated_depsgraph_get()
    DW, DH = 512, int(512 * H / W)
    from mathutils import Vector
    o = Vector(C0)
    dep = np.zeros((DH, DW), np.float32)
    for j in range(DH):
        z = ztop - (j + 0.5) / DH * mH
        for i in range(DW):
            x = x0 + (i + 0.5) / DW * Wm
            d = (Vector((x, Yp, z)) - o).normalized()
            hit, loc, *_ = sc.ray_cast(dg, o, d, distance=200.0)
            dep[j, i] = (1.0 / (1.0 + 0.35 * max(0.0, loc.y - Yp))) if hit else 0.0
    img = bpy.data.images.new('depth', DW, DH, alpha=False)
    px = np.dstack([dep, dep, dep, np.ones_like(dep)])[::-1].astype(np.float32).ravel()
    img.pixels.foreach_set(px)
    img.filepath_raw = dep_path
    img.file_format = 'PNG'
    img.save()
    return {'image': img_path, 'depth': dep_path, 'fit': fit, 'baked': True, 'preflight': os.path.join(out_dir, f'baked-{key}.preflight.json'), 'style': style_rep}
