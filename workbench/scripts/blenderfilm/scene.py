"""SCÈNE BLENDER DU FILM — exécuté DANS Blender (module bpy ou `blender -b --python scene.py -- …`).

Construit un seul fichier de scène pour tout le film (un rendu continu, pas de clips recollés) à partir de plan.json :
  • DÉCOR : l'image peinte du décor, posée sur un relief tiré de sa carte de profondeur et PROJETÉE depuis une caméra de
    référence (elle reste identique de face, et donne une vraie parallaxe quand la caméra bouge) ;
  • ACTEURS : chaque pose de la planche = un maillage découpé sur l'alpha du dessin, à l'échelle métrique, en matière
    émissive (les couleurs du dessin à l'identique), avec un squelette racine / colonne / tête posé sur les repères
    mesurés ; la mâchoire s'ouvre sur la vraie bouche (cavité + dents), les paupières se ferment avec la peau mesurée ;
  • JEU : poses de chaque réplique (fondu de 4 images), tête vivante, hochements sur les syllabes, respiration, appui,
    clignements, entrées en scène, ombres de contact ;
  • CAMÉRA : un plan par réplique (deux personnages en bandeau, plan taille, gros plan), travelling avant / arrière /
    latéral, coupes par marqueurs de la ligne de temps.

  python3 scene.py --plan plan.json --out frames/ [--engine CYCLES|EEVEE] [--samples 10] [--frames 1-1500] [--still 1,200]
"""
import argparse, json, math, os, sys
import bpy
import numpy as np
from mathutils import Matrix, Vector

LENS = 35.0
SENSOR = 36.0
FEET_MARGIN = 0.07  # a full shot on a floor: the feet this share of the frame above its bottom edge


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--engine', default='CYCLES')
    ap.add_argument('--samples', type=int, default=10)
    ap.add_argument('--frames', default='')
    ap.add_argument('--still', default='')
    ap.add_argument('--scale', type=float, default=1.0, help='résolution relative (0.5 = aperçu rapide)')
    ap.add_argument('--blend', default='', help='enregistre aussi le .blend')
    ap.add_argument('--force', action='store_true', help='rendre malgré un défaut critique du preflight (déconseillé)')
    ap.add_argument('--decor', default='', help='une autre vue du même lieu (coupe du plan : les images --frames dans cette vue)')
    ap.add_argument('--sans-visage', action='store_true', help='ignorer les visages vivants (liveface.py) : dessins fixes')
    ap.add_argument('--sans-mocap', action='store_true', help='sans les clips de capture de mouvement CMU — comparaison A/B')
    ap.add_argument('--sans-suivi', action='store_true', help='caméra fixe sur les plans serrés (sans suivre le visage) — comparaison A/B')
    ap.add_argument('--sans-jeu', action='store_true', help='corps sans la couche de jeu pilotée par la voix — comparaison A/B')
    ap.add_argument('--decor-fixe', action='store_true', help='décor sans vie (foule, vent, eau immobiles) — comparaison A/B')
    ap.add_argument('--pas', type=int, default=1, help='aperçu : une image rendue sur N, les autres la répètent')
    return ap.parse_args(argv)


# ── small helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1) if b != a else (x >= a).astype(float)
    return t * t * (3 - 2 * t)


def load_rgba(path):
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    return img, px.reshape(h, w, 4)[::-1]  # top row first (image coordinates)


MOCAP = True  # --sans-mocap: no captured clips on the poses (A/B check)
JEU_CORPS = True  # --sans-jeu: bodies without the voice-driven acting layer (A/B check)
DECOR_FIXE = False  # --decor-fixe: the painted set stays still (A/B check of the decor life)
VISAGE = {}  # the film's living faces: <plan dir>/visage/<actor>/<pose>/f00001.png … (liveface.py)


def sequence_texture(mat, first, frames):
    """The pose card shows the face sequence of liveface.py (one image per film frame) instead of the still drawing."""
    seq = bpy.data.images.load(first, check_existing=False)
    seq.source = 'SEQUENCE'
    tex = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE')
    tex.image = seq
    u = tex.image_user
    u.frame_start, u.frame_offset, u.frame_duration = 1, 0, frames
    u.use_auto_refresh = True
    return seq


def emissive_material(name, img, alpha=True, fade=True):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Linear'
    tex.extension = 'CLIP' if alpha else 'EXTEND'
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(tex.outputs['Color'], em.inputs['Color'])
    if not alpha:
        nt.links.new(em.outputs[0], out.inputs['Surface'])
        return m, None
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    val = nt.nodes.new('ShaderNodeValue')
    val.name = 'fade'
    val.outputs[0].default_value = 1.0
    nt.links.new(tex.outputs['Alpha'], mul.inputs[0])
    nt.links.new(val.outputs[0], mul.inputs[1])
    nt.links.new(mul.outputs[0], mix.inputs['Fac'])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    for attr, v in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED')):
        try:
            setattr(m, attr, v)
        except Exception:
            pass
    return m, val


def flat_material(name, rgb, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*[srgb_to_linear(c / 255) for c in rgb], 1)
    if alpha >= 1:
        nt.links.new(em.outputs[0], out.inputs['Surface'])
    else:
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix = nt.nodes.new('ShaderNodeMixShader')
        mix.inputs['Fac'].default_value = alpha
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return m


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def mesh_object(name, verts, faces, uvs=None, mat=None, parent=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    if uvs is not None:
        uv = me.uv_layers.new(name='UV')
        loop_uv = np.array([uvs[me.loops[i].vertex_index] for i in range(len(me.loops))], np.float32).ravel()
        uv.data.foreach_set('uv', loop_uv)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    if parent:
        ob.parent = parent
    return ob


def key(obj, path, frame, value, index=-1):
    if index >= 0:
        getattr(obj, path)[index] = value
        obj.keyframe_insert(path, index=index, frame=frame)
    else:
        setattr(obj, path, value)
        obj.keyframe_insert(path, frame=frame)


# ── décor ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
SWAY = {4, 17, 72, 18, 86, 106, 114, 149, 66}      # ADE20K: tree, plant, palm, curtain, awning, canopy, tent, flag, flower
WATER = {21, 26, 60, 104, 113}                      # water, sea, river, fountain, waterfall


def decor_motion_map(dec):
    """The LIFE of a painted set: R, G = the painted crowd's sway field as a quadrature pair (crowd.py: each person
    separated by Mask R-CNN, its own phase, anchored at the feet), B = what the wind moves (trees, palms, awnings,
    umbrellas' canopies, flags, curtains), A = water. The decor shader shifts its picture inside these fields a few
    pixels, in time — the crowd sways and breathes person by person, the leaves and canopies stir, the water ripples.
    Without a person-by-person map, a crowd the scene parse sees as ONE blob stays still (it would slide as a block)."""
    seg_path = dec.get('seg')
    if not seg_path or not os.path.isfile(seg_path):
        return None
    import cv2
    import ground
    import crowd
    _, lab = load_rgba(seg_path)
    lab = np.rint(lab[..., 0] * 255).astype(int)
    person = lab == ground.PERSON
    ip = crowd.inst_path(dec['image'])
    note = ''
    if os.path.isfile(ip):
        inst = np.asarray(Image_open(ip))
        note = f'{int(inst.max())} personne(s) séparée(s)'
    else:
        n, cc = cv2.connectedComponents(person.astype(np.uint8), connectivity=8)
        areas = np.bincount(cc.ravel(), minlength=n)[1:]
        if len(areas) and areas.max() > 0.4 * max(1, person.sum()):
            inst = np.zeros(lab.shape, np.uint8)
            note = 'foule d\u2019un seul bloc : immobile (lancer crowd.py pour la séparer personne par personne)'
        else:
            inst = np.where(cc < 255, cc, 0).astype(np.uint8)
            note = f'{len(areas)} silhouette(s) isolée(s)'
    h, w = inst.shape
    C, S = crowd.sway_field(inst)
    cmax = float(max(np.abs(C).max(), np.abs(S).max(), 1e-6))
    rs = lambda m: cv2.GaussianBlur(cv2.resize(m.astype(np.float32), (w, h), interpolation=cv2.INTER_NEAREST), (0, 0), 1.5 * w / lab.shape[1])
    sway, water = rs(np.isin(lab, list(SWAY))), rs(np.isin(lab, list(WATER)))
    rgba = np.dstack([0.5 + 0.5 * C / cmax, 0.5 + 0.5 * S / cmax, sway, water]).astype(np.float32)
    img = bpy.data.images.new('decor-vie', w, h, alpha=True, float_buffer=True)
    img.alpha_mode = 'CHANNEL_PACKED'
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(rgba[::-1].ravel())
    return img, cmax, float(person.mean()), float(sway.mean()), float(water.mean()), note


def Image_open(path):
    from PIL import Image
    return Image.open(path)


SWAY_RATIO, BREATH_RATIO = 0.012, 0.005  # of the person's height, at the top of the head (≈ 2 cm and 0,9 cm on 1,70 m)


def decor_life_uv(nt, motion, cmax, W_tex, fps):
    """Shader nodes: the picture's UV shifted inside the life fields, in time (a driver on the frame number)."""
    N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord')
    mt = N.new('ShaderNodeTexImage')
    mt.image = motion
    mt.interpolation = 'Linear'
    mt.extension = 'EXTEND'
    L.new(tc.outputs['UV'], mt.inputs['Vector'])
    sep = N.new('ShaderNodeSeparateColor')
    L.new(mt.outputs['Color'], sep.inputs['Color'])
    uvs = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['UV'], uvs.inputs['Vector'])
    t = N.new('ShaderNodeValue')
    t.name = 'temps'
    d = t.outputs[0].driver_add('default_value').driver
    d.type = 'SCRIPTED'
    d.expression = f'frame / {float(fps)}'
    mw, mh = motion.size
    px = 1.0 / max(1, W_tex)  # one pixel of the picture, in UV

    def math_(op, a, b=0.0):
        m = N.new('ShaderNodeMath')
        m.operation = op
        for k, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                m.inputs[k].default_value = float(v)
            else:
                L.new(v, m.inputs[k])
        return m.outputs[0]

    def osc(freq, op):  # sin or cos of 2π·freq·t
        return math_(op, math_('MULTIPLY', t.outputs[0], 2 * math.pi * freq))

    def wave(freq, phase_sock, amp, mask_sock):
        # amp · mask · sin(2π (t·freq + phase))
        arg = math_('MULTIPLY', math_('ADD', math_('MULTIPLY', t.outputs[0], freq), phase_sock), 2 * math.pi)
        return math_('MULTIPLY', math_('MULTIPLY', math_('SINE', arg), amp), mask_sock)

    # The crowd: C, S decoded back to pixels of the map (each person's own phase is inside the pair).
    Cd = math_('MULTIPLY', math_('SUBTRACT', sep.outputs['Red'], 0.5), 2 * cmax)
    Sd = math_('MULTIPLY', math_('SUBTRACT', sep.outputs['Green'], 0.5), 2 * cmax)

    def quad(freq, ratio, size):
        v = math_('ADD', math_('MULTIPLY', Cd, osc(freq, 'SINE')), math_('MULTIPLY', Sd, osc(freq, 'COSINE')))
        return math_('MULTIPLY', v, ratio / max(1, size))

    dx = quad(0.45, SWAY_RATIO, mw)       # a slow sway of the upper body (feet still)
    dy = quad(0.95, BREATH_RATIO, mh)     # breathing: the body lengthens a little above the feet
    # The wind: the leaves and canopies stir along a travelling wave (higher in the picture moves first).
    dx = math_('ADD', dx, wave(0.8, math_('MULTIPLY', uvs.outputs['Y'], 3.0), 2.6 * px, sep.outputs['Blue']))
    # The water: small ripples travelling sideways.
    dy = math_('ADD', dy, wave(1.6, math_('MULTIPLY', uvs.outputs['X'], 9.0), 1.2 * px, mt.outputs['Alpha']))
    comb = N.new('ShaderNodeCombineXYZ')
    L.new(math_('ADD', uvs.outputs['X'], dx), comb.inputs['X'])
    L.new(math_('ADD', uvs.outputs['Y'], dy), comb.inputs['Y'])
    return comb.outputs['Vector']


def build_decor(dec, cam_ref):
    img, px = load_rgba(dec['image'])
    H, W = px.shape[:2]
    fit = dec['fit']
    mH = float(fit['mH'])
    Wm = mH * W / H
    x0 = -fit['cx'] * Wm
    ztop = fit['floor'] * mH
    NX, NZ = 260, max(60, int(260 * H / W * 1.6 / 1.7))
    # Depth (near = bright), smoothed, normalised on its own range.
    dpx = None
    if dec.get('depth') and os.path.isfile(dec['depth']):
        _, dp = load_rgba(dec['depth'])
        dpx = dp[..., 0]
    # The painted picture plus a MIRRORED margin around it (a camera closer than the reference one sees past its edges).
    EX, EZ = 0.35, 0.3
    gx = np.linspace(-EX, 1 + EX, NX + 1)
    gz = np.linspace(-EZ, 1 + EZ, NZ + 1)
    if dpx is not None:
        mir = lambda g: np.abs(((g + 1) % 2) - 1)  # mirror fold into [0, 1]
        ys = np.clip((mir(gz) * (dpx.shape[0] - 1)).astype(int), 0, dpx.shape[0] - 1)
        xs = np.clip((mir(gx) * (dpx.shape[1] - 1)).astype(int), 0, dpx.shape[1] - 1)
        d = dpx[np.ix_(ys, xs)]
        for _ in range(3):
            d = (d + np.roll(d, 1, 0) + np.roll(d, -1, 0) + np.roll(d, 1, 1) + np.roll(d, -1, 1)) / 5
        lo, hi = np.percentile(d, 2), np.percentile(d, 98)
        dn = np.clip((d - lo) / max(1e-6, hi - lo), 0, 1)
    else:
        dn = np.ones((NZ + 1, NX + 1))
    Yp, DEPTH = 0.35, 2.4
    C0 = np.array(cam_ref)
    verts, uvs = [], []
    for j in range(NZ + 1):
        for i in range(NX + 1):
            P0 = np.array([x0 + gx[i] * Wm, Yp, ztop - gz[j] * mH])
            y2 = Yp + (1 - dn[j, i]) * DEPTH
            k = (y2 - C0[1]) / (Yp - C0[1])
            verts.append(C0 + (P0 - C0) * k)
            uvs.append((gx[i], 1 - gz[j]))
    faces = [(j * (NX + 1) + i, j * (NX + 1) + i + 1, (j + 1) * (NX + 1) + i + 1, (j + 1) * (NX + 1) + i) for j in range(NZ) for i in range(NX)]
    # Sharp and soft (close-ups) versions of the picture, mixed per shot.
    # (Its strength is recalibrated once the cameras are known — calibrate_softness: faces stay readable.)
    from world import gauss_blur
    soft = bpy.data.images.new('decor-soft', W, H, alpha=False)
    big = gauss_blur(px[..., :3], 2.0)
    soft.pixels.foreach_set(np.dstack([big, np.ones((H, W))])[::-1].astype(np.float32).ravel())
    m = bpy.data.materials.new('decor')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    t1 = nt.nodes.new('ShaderNodeTexImage')
    t1.image = img
    t1.extension = 'MIRROR'
    t1.interpolation = 'Cubic'  # the painting is magnified ×3–4 in the close-ups: bicubic, not blocky bilinear
    t2 = nt.nodes.new('ShaderNodeTexImage')
    t2.image = soft
    t2.extension = 'MIRROR'
    t2.interpolation = 'Cubic'
    mx = nt.nodes.new('ShaderNodeMix')
    mx.data_type = 'RGBA'
    val = nt.nodes.new('ShaderNodeValue')
    val.name = 'soft'
    val.outputs[0].default_value = 0.0
    em = nt.nodes.new('ShaderNodeEmission')
    # Light of the set: a tint (time of day) and a strength that can breathe (fan, TV) — set by the living world.
    tint = nt.nodes.new('ShaderNodeMix')
    tint.data_type = 'RGBA'
    tint.blend_type = 'MULTIPLY'
    tint.inputs['Factor'].default_value = 1.0
    tint.inputs['B'].default_value = (1, 1, 1, 1)
    tint.name = 'tint'
    strength = nt.nodes.new('ShaderNodeValue')
    strength.name = 'strength'
    strength.outputs[0].default_value = 1.0
    life = None if DECOR_FIXE else decor_motion_map(dec)
    if life is not None:
        uv = decor_life_uv(nt, life[0], life[1], W, bpy.context.scene.render.fps)
        nt.links.new(uv, t1.inputs['Vector'])
        nt.links.new(uv, t2.inputs['Vector'])
        print(f'[décor vivant] foule peinte {life[2]:.0%} ({life[5]}) · vent {life[3]:.0%} · eau {life[4]:.0%} de l’image', flush=True)
    nt.links.new(val.outputs[0], mx.inputs['Factor'])
    nt.links.new(t1.outputs['Color'], mx.inputs['A'])
    nt.links.new(t2.outputs['Color'], mx.inputs['B'])
    nt.links.new(mx.outputs['Result'], tint.inputs['A'])
    nt.links.new(tint.outputs['Result'], em.inputs['Color'])
    nt.links.new(strength.outputs[0], em.inputs['Strength'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    ob = mesh_object('decor', verts, faces, uvs, m)
    grid = {'C0': C0.tolist(), 'Yp': Yp, 'DEPTH': DEPTH, 'x0': x0, 'Wm': Wm, 'ztop': ztop, 'mH': mH, 'EX': EX, 'EZ': EZ, 'dn': dn if dpx is not None else None,
            'tint': tint, 'strength': strength.outputs[0], 'px': px[..., :3], 'soft_img': soft, 'H_tex': H}
    return ob, val, {'x0': x0, 'x1': x0 + Wm, 'z0': ztop - mH, 'z1': ztop, 'grid': grid}


def shadow_material(name='shadow'):
    """A soft dark ellipse (contact shadow under the feet)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Location'].default_value = (-0.5, -0.36, 0)
    mp.inputs['Scale'].default_value = (2.0, 2.6, 1)
    gr = nt.nodes.new('ShaderNodeTexGradient')
    gr.gradient_type = 'QUADRATIC_SPHERE'
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = 0.55
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (0, 0, 0, 1)
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
    return m


# ── sol : sol peint, avant-scène 3D, pied du décor, ombres (ground.py) ──────────────────────────────────────────────────
def load_map(path):
    """A data map (mask, labels) as floats 0..1 = byte / 255, top row first — never colour-managed."""
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    out = px.reshape(h, w, 4)[::-1, :, 0].copy()
    bpy.data.images.remove(img)
    return out


def analyse_ground(dec, grid):
    """Painted floor (scene parse fused with the relief geometry) and the light of the painting (its painted people)."""
    import ground
    st = {}
    grid['walk'] = grid['fl'] = None
    if grid.get('dn') is not None and dec.get('floor') and os.path.isfile(dec['floor']):
        grid['walk'] = load_map(dec['floor'])
        grid['fl'], st = ground.floor_grid(grid, grid['walk'])
    if dec.get('seg') and os.path.isfile(dec['seg']):
        grid['light'] = ground.scene_light(grid['px'], np.round(load_map(dec['seg']) * 255).astype(np.uint8))
    else:
        grid['light'] = {'mode': 'frontale', 'sign': 0, 'strength': 0.0, 'figures': 0}
    grid['shadow_vec'] = ground.shadow_vector(grid['light']['sign'], grid['light']['strength'])
    L = grid['light']
    print(f"[sol] sol peint : {100 * st.get('fusion', 0):.1f} % du décor (segmentation {100 * st.get('semantique', 0):.1f} %, "
          f"surfaces tournées vers le haut {100 * st.get('geometrie', 0):.1f} %) ; lumière {L['mode']}"
          + (f" venant de la {'droite' if L['sign'] > 0 else 'gauche'} ({L['figures']} personnages peints concordants)" if L['mode'] == 'laterale' else
             f" ({L['figures']} personnage(s) peint(s) mesuré(s), pas assez concordants pour une lumière latérale)"), flush=True)


def forestage_material(kind, rgb, yp):
    """The 3D floor in front of the painting, in the painting's world: its colour (painted floor or kind brought to the
    painting's light), two scales of grain (no flat area — the style law), tiles or planks indoors, and the shade at the
    foot of the set (under a stall, under a sofa)."""
    import ground
    spec = ground.FLOOR_KINDS[kind]
    m = bpy.data.materials.new(f'sol-{kind}')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    N, L = nt.nodes, nt.links
    out = N.new('ShaderNodeOutputMaterial')
    tc = N.new('ShaderNodeTexCoord')
    base = N.new('ShaderNodeRGB')
    base.outputs[0].default_value = (*[srgb_to_linear(c) for c in rgb], 1)
    col = base.outputs[0]
    if spec['motif']:
        br = N.new('ShaderNodeTexBrick')
        br.offset = 0.0 if spec['motif'] == 'carreaux' else 0.5
        br.inputs['Scale'].default_value = 1.0
        br.inputs['Mortar Size'].default_value = 0.008 if spec['motif'] == 'carreaux' else 0.003
        br.inputs['Brick Width'].default_value = 0.45 if spec['motif'] == 'carreaux' else 1.1
        br.inputs['Row Height'].default_value = 0.45 if spec['motif'] == 'carreaux' else 0.13
        lin = [srgb_to_linear(c) for c in rgb]
        br.inputs['Color1'].default_value = (*[v * 1.03 for v in lin], 1)
        br.inputs['Color2'].default_value = (*[v * 0.95 for v in lin], 1)
        br.inputs['Mortar'].default_value = (*[v * 0.62 for v in lin], 1)
        L.new(tc.outputs['Object'], br.inputs['Vector'])
        col = br.outputs['Color']
    grain = []
    for scale, amp, detail in ((26.0, spec['fine'], 8.0), (2.4, spec['broad'], 3.0)):
        nz = N.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = scale
        nz.inputs['Detail'].default_value = detail
        L.new(tc.outputs['Object'], nz.inputs['Vector'])
        mr = N.new('ShaderNodeMapRange')
        mr.inputs['To Min'].default_value = 1 - amp
        mr.inputs['To Max'].default_value = 1 + amp
        mr.inputs['From Min'].default_value = 0.3
        mr.inputs['From Max'].default_value = 0.7
        L.new(nz.outputs['Fac'], mr.inputs['Value'])
        grain.append(mr.outputs[0])
    if kind in ('terre', 'sable', 'beton', 'bitume'):
        # Dust patches (lighter, drier) and small pebbles / grit (darker dots): the ground of a real place, not a stage.
        dz = N.new('ShaderNodeTexNoise')
        dz.inputs['Scale'].default_value = 5.5
        dz.inputs['Detail'].default_value = 4.0
        L.new(tc.outputs['Object'], dz.inputs['Vector'])
        dm = N.new('ShaderNodeMapRange')
        dm.inputs['From Min'].default_value = 0.52
        dm.inputs['From Max'].default_value = 0.68
        dm.inputs['To Min'].default_value = 1.0
        dm.inputs['To Max'].default_value = 1.16
        L.new(dz.outputs['Fac'], dm.inputs['Value'])
        grain.append(dm.outputs[0])
        vo = N.new('ShaderNodeTexVoronoi')
        vo.inputs['Scale'].default_value = 34.0
        L.new(tc.outputs['Object'], vo.inputs['Vector'])
        pm = N.new('ShaderNodeMapRange')
        pm.inputs['From Min'].default_value = 0.0
        pm.inputs['From Max'].default_value = 0.09
        pm.inputs['To Min'].default_value = 0.72
        pm.inputs['To Max'].default_value = 1.0
        L.new(vo.outputs['Distance'], pm.inputs['Value'])
        grain.append(pm.outputs[0])
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Object'], sep.inputs[0])
    shade = N.new('ShaderNodeMapRange')  # shade at the foot of the painted set (the stall, the sofa)
    shade.inputs['From Min'].default_value = yp - 0.45
    shade.inputs['From Max'].default_value = yp
    shade.inputs['To Min'].default_value = 1.0
    shade.inputs['To Max'].default_value = 0.58
    shade.interpolation_type = 'SMOOTHSTEP'
    L.new(sep.outputs['Y'], shade.inputs['Value'])
    acc = shade.outputs[0]
    for gsock in grain:
        mm = N.new('ShaderNodeMath')
        mm.operation = 'MULTIPLY'
        L.new(acc, mm.inputs[0])
        L.new(gsock, mm.inputs[1])
        acc = mm.outputs[0]
    f2 = mm
    mul = N.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    L.new(col, mul.inputs['A'])
    cmb = N.new('ShaderNodeCombineColor')
    for i in range(3):
        L.new(f2.outputs[0], cmb.inputs[i])
    L.new(cmb.outputs[0], mul.inputs['B'])
    tint = N.new('ShaderNodeMix')  # the light of the set (time of day), shared with the painting by the living world
    tint.data_type = 'RGBA'
    tint.blend_type = 'MULTIPLY'
    tint.name = 'tint'
    tint.inputs['Factor'].default_value = 1.0
    tint.inputs['B'].default_value = (1, 1, 1, 1)
    L.new(mul.outputs['Result'], tint.inputs['A'])
    em = N.new('ShaderNodeEmission')
    L.new(tint.outputs['Result'], em.inputs['Color'])
    L.new(em.outputs[0], out.inputs['Surface'])
    return m


def build_forestage(bounds, place, xs_feet):
    """The law of the walkable floor for the actors: when the painting does not show floor where they stand (nearly all
    the troupe's sets — the bottom of the picture is a stall, a sofa, a desk), the engine builds the floor in front of
    the painted set (« avant-scène »), and the foot of the set where the painting stops above the ground."""
    import ground
    g = bounds['grid']
    share = ground.feet_zone(g, xs_feet) if g.get('fl') is not None else 0.0
    if share >= 0.8:
        g['stage'] = None
        print(f'[sol] les pieds des acteurs sont sur le sol peint ({100 * share:.0f} % de la zone) : pas d’avant-scène', flush=True)
        return None
    kind = ground.floor_kind(place)
    rgb, src = ground.floor_colour(kind, g['px'], g.get('walk'))
    Wm = bounds['x1'] - bounds['x0']
    x0, x1 = bounds['x0'] - 0.6 * Wm, bounds['x1'] + 0.6 * Wm
    C0 = g['C0']
    y0, y1 = C0[1] + 0.25, g['Yp'] - 0.002
    fl_ob = mesh_object('avant-scene', [(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)], [(0, 1, 2, 3)], [(0, 0), (1, 0), (1, 1), (0, 1)],
                        forestage_material(kind, rgb, g['Yp']))
    fl_ob['shell'] = True  # the ground itself (things rest ON it)
    zb = bounds['z0']
    if zb > 0.0:
        # The painting stops above the ground at its own plane: its lowest rows continue down to the floor, in the shade
        # (the base of the produce piles, of the furniture) — the colours of the painting, not a black band.
        px = g['px']
        rows = max(4, int(px.shape[0] * 0.04))
        strip = px[-rows:][::-1]  # mirrored: the base of what is painted just above
        Hs = max(8, rows)
        grad = np.linspace(0.62, 0.30, Hs)[:, None, None]  # darker toward the ground (occlusion)
        tex = np.clip(strip[np.linspace(0, rows - 1, Hs).astype(int)] * grad, 0, 1)
        img = bpy.data.images.new('pied-du-decor', tex.shape[1], tex.shape[0], alpha=False)
        img.pixels.foreach_set(np.dstack([tex, np.ones(tex.shape[:2])])[::-1].astype(np.float32).ravel())
        mp, _ = emissive_material('pied-du-decor', img, alpha=False)
        yb = g['Yp'] - 0.004
        # UVs: the strip spans exactly the painting's width (x0 … x1 of the painting), mirrored beyond like the set.
        P0, P1 = bounds['x0'], bounds['x1']
        u = lambda x: (x - P0) / (P1 - P0)
        pd_ = mesh_object('pied-du-decor', [(x0, yb, 0), (x1, yb, 0), (x1, yb, zb + 0.006), (x0, yb, zb + 0.006)], [(0, 1, 2, 3)],
                          [(u(x0), 0), (u(x1), 0), (u(x1), 1), (u(x0), 1)], mp)
        pd_['shell'] = True
        mp.node_tree.nodes['Image Texture'].extension = 'MIRROR'
    g['stage'] = {'x0': x0, 'x1': x1, 'y0': y0, 'y1': y1, 'z_top': max(0.0, zb), 'kind': kind, 'rgb': rgb, 'source': src}
    print(f"[sol] avant-scène 3D « {kind} » devant le décor (le décor montre du sol sous {100 * share:.0f} % de la zone des pieds) ; "
          f"couleur {'du sol peint' if src == 'peint' else 'du type de lieu, à la lumière de la peinture'}"
          + (f' ; pied du décor sur {100 * zb:.0f} cm' if zb > 0 else ''), flush=True)
    return g['stage']


def shadow_group():
    """Geometry Nodes: lays any standing geometry on the floor along the light — computed in WORLD space, so a hop
    leaves the shadow on the ground (offset by the height of the jump) and a squash never lifts it."""
    ng = bpy.data.node_groups.get('ombre-portee')
    if ng:
        return ng
    ng = bpy.data.node_groups.new('ombre-portee', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    for nm in ('dx', 'dy', 'sol'):
        ng.interface.new_socket(nm, in_out='INPUT', socket_type='NodeSocketFloat')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes, ng.links
    gi, go = N.new('NodeGroupInput'), N.new('NodeGroupOutput')
    so = N.new('GeometryNodeSelfObject')
    oi = N.new('GeometryNodeObjectInfo')
    oi.transform_space = 'ORIGINAL'
    L.new(so.outputs[0], oi.inputs['Object'])
    pos = N.new('GeometryNodeInputPosition')
    tp = N.new('FunctionNodeTransformPoint')
    L.new(pos.outputs[0], tp.inputs[0])
    L.new(oi.outputs['Transform'], tp.inputs[1])
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tp.outputs[0], sep.inputs[0])
    sub = N.new('ShaderNodeMath')
    sub.operation = 'SUBTRACT'
    L.new(sep.outputs['Z'], sub.inputs[0])
    L.new(gi.outputs['sol'], sub.inputs[1])
    h = N.new('ShaderNodeMath')
    h.operation = 'MAXIMUM'
    L.new(sub.outputs[0], h.inputs[0])
    h.inputs[1].default_value = 0.0
    nx = N.new('ShaderNodeMath')
    nx.operation = 'MULTIPLY_ADD'
    L.new(h.outputs[0], nx.inputs[0])
    L.new(gi.outputs['dx'], nx.inputs[1])
    L.new(sep.outputs['X'], nx.inputs[2])
    ny = N.new('ShaderNodeMath')
    ny.operation = 'MULTIPLY_ADD'
    L.new(h.outputs[0], ny.inputs[0])
    L.new(gi.outputs['dy'], ny.inputs[1])
    L.new(sep.outputs['Y'], ny.inputs[2])
    nz = N.new('ShaderNodeMath')
    nz.operation = 'ADD'
    L.new(gi.outputs['sol'], nz.inputs[0])
    nz.inputs[1].default_value = 0.004
    cb = N.new('ShaderNodeCombineXYZ')
    for i, s in enumerate((nx, ny, nz)):
        L.new(s.outputs[0], cb.inputs[i])
    inv = N.new('FunctionNodeInvertMatrix')
    L.new(oi.outputs['Transform'], inv.inputs[0])
    tp2 = N.new('FunctionNodeTransformPoint')
    L.new(cb.outputs[0], tp2.inputs[0])
    L.new(inv.outputs[0], tp2.inputs[1])
    stn = N.new('GeometryNodeStoreNamedAttribute')
    stn.data_type = 'FLOAT'
    stn.domain = 'POINT'
    L.new(gi.outputs['Geometry'], stn.inputs['Geometry'])
    stn.inputs['Name'].default_value = 'hauteur'
    L.new(h.outputs[0], stn.inputs['Value'])
    sp = N.new('GeometryNodeSetPosition')
    L.new(stn.outputs[0], sp.inputs['Geometry'])
    L.new(tp2.outputs[0], sp.inputs['Position'])
    L.new(sp.outputs[0], go.inputs[0])
    return ng


def cast_shadow_material(name, px, height, light):
    """The shadow of a drawn figure: its own silhouette (alpha), softened (penumbra), darker at the feet and fading
    along its length; stronger under a lateral sun than under a frontal / diffuse light."""
    from world import gauss_blur
    a = px[..., 3]
    step = max(1, a.shape[0] // 256)
    small = np.ascontiguousarray(a[::step, ::step])
    soft = gauss_blur(small[..., None], max(1.5, small.shape[0] * 0.012))[..., 0]
    h, w = soft.shape
    img = bpy.data.images.new(f'ombre-{name}', w, h, alpha=True)
    rgba = np.zeros((h, w, 4), np.float32)
    rgba[..., 3] = soft
    img.pixels.foreach_set(rgba[::-1].ravel())
    img.colorspace_settings.name = 'Non-Color'
    m = bpy.data.materials.new(f'ombre-{name}')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    N, L = nt.nodes, nt.links
    out = N.new('ShaderNodeOutputMaterial')
    tex = N.new('ShaderNodeTexImage')
    tex.image = img
    tex.extension = 'CLIP'
    at = N.new('ShaderNodeAttribute')
    at.attribute_name = 'hauteur'
    fade = N.new('ShaderNodeMapRange')
    fade.inputs['From Min'].default_value = 0.0
    fade.inputs['From Max'].default_value = max(0.3, height)
    lateral = light.get('mode') == 'laterale'
    fade.inputs['To Min'].default_value = 0.62 if lateral else 0.46
    fade.inputs['To Max'].default_value = 0.18 if lateral else 0.06
    L.new(at.outputs['Fac'], fade.inputs['Value'])
    mul = N.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    L.new(tex.outputs['Alpha'], mul.inputs[0])
    L.new(fade.outputs[0], mul.inputs[1])
    tr = N.new('ShaderNodeBsdfTransparent')
    em = N.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (0.018, 0.013, 0.010, 1)
    mix = N.new('ShaderNodeMixShader')
    L.new(mul.outputs[0], mix.inputs['Fac'])
    L.new(tr.outputs[0], mix.inputs[1])
    L.new(em.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs['Surface'])
    for attr, v in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED')):
        try:
            setattr(m, attr, v)
        except Exception:
            pass
    return m


def attach_shadow(src, name, mat, vec, parent=None, armature=None):
    """A linked duplicate of `src` (same mesh, same shape keys, same armature deformation) laid on the floor."""
    sh = bpy.data.objects.new(name, src.data)
    bpy.context.scene.collection.objects.link(sh)
    sh.parent = parent if parent is not None else src.parent
    sh.matrix_parent_inverse = src.matrix_parent_inverse.copy()
    sh.location, sh.rotation_euler, sh.scale = src.location.copy(), src.rotation_euler.copy(), src.scale.copy()
    if sh.material_slots:
        sh.material_slots[0].link = 'OBJECT'
        sh.material_slots[0].material = mat
    else:
        sh.data.materials.append(mat)
    if armature is not None:
        am = sh.modifiers.new('rig', 'ARMATURE')
        am.object = armature
    mod = sh.modifiers.new('ombre', 'NODES')
    ng = shadow_group()
    mod.node_group = ng
    ids = {s.name: s.identifier for s in ng.interface.items_tree if getattr(s, 'in_out', '') == 'INPUT'}
    mod[ids['dx']], mod[ids['dy']], mod[ids['sol']] = float(vec[0]), float(vec[1]), 0.0
    sh['ombre_de'] = src.name
    sh['shell'] = True  # a shadow is light, not matter: never a collision
    return sh


def actor_shadows(actors, g, rig_dir, rig):
    """Every pose of every actor casts its own shadow (shown exactly when the pose is shown)."""
    vec = g.get('shadow_vec', (0.0, 0.42))
    n = 0
    for aid, A in actors.items():
        for kind, P in A['poses'].items():
            pose = next(p for p in rig['cast'][A['plan']['name']]['poses'] if p['kind'] == kind)
            _img, px = load_rgba(os.path.join(rig_dir, pose['png']))
            mat = cast_shadow_material(f'{aid}-{kind}', px, P.top_z, g.get('light', {}))
            sh = attach_shadow(P.ob, f'{aid}-ombre-{kind}', mat, vec, parent=P.arm, armature=P.arm)
            prev = None
            vis = getattr(P, 'vis', [])
            for f in range(1, len(vis) - 1):
                v = vis[f]
                if v != prev:
                    sh.hide_render = not v
                    sh.keyframe_insert('hide_render', frame=f)
                    prev = v
            P.shadow = sh
            n += 1
    print(f"[ombres] {n} ombre(s) portée(s) d'acteurs, direction au sol ({vec[0]:+.2f}, {vec[1]:+.2f}) m par mètre de hauteur", flush=True)


# ── acteurs ───────────────────────────────────────────────────────────────────────────────────────────────────────────
class Pose:
    pass


def build_pose(actor, pose, k, rig_dir, scale, mirror, root):
    """One pose of the sheet → mesh + armature + mouth + lids. Coordinates: metres, feet at the origin of `root`."""
    img, px = load_rgba(os.path.join(rig_dir, pose['png']))
    h, w = px.shape[:2]
    a = px[..., 3]
    b = pose.get('body') or {}
    f = pose.get('face') or {}
    # Feet anchor: between the ankles, on the lowest opaque row.
    rows = np.nonzero(a.max(1) > 0.3)[0]
    foot_y = rows[-1] if len(rows) else h - 1
    if b.get('anL') and b.get('anR'):
        ax = (b['anL'][0] + b['anR'][0]) / 2
    else:
        cols = np.nonzero(a[int(foot_y * 0.95):].max(0) > 0.3)[0]
        ax = cols.mean() if len(cols) else w / 2
    sx = -1 if mirror else 1
    P = lambda x, y: ((x - ax) * scale * sx, (foot_y - y) * scale)
    # Mesh on the alpha (cells of `cell` px, one cell of margin around the drawing).
    cell = max(3, int(round(h / 230)))
    nx, ny = w // cell + 1, h // cell + 1
    occ = np.zeros((ny, nx), bool)
    sub = a[: (ny - 1) * cell, : (nx - 1) * cell].reshape(ny - 1, cell, nx - 1, cell).max((1, 3)) > 0.02
    occ[:-1, :-1] = sub
    d = occ.copy()
    d[1:] |= occ[:-1]
    d[:-1] |= occ[1:]
    d[:, 1:] |= occ[:, :-1]
    d[:, :-1] |= occ[:, 1:]
    occ = d
    vid = -np.ones((ny + 1, nx + 1), int)
    verts, uvs, faces = [], [], []
    for j in range(ny):
        for i in range(nx):
            if not occ[j, i] or min(w, i * cell) == min(w, (i + 1) * cell) or min(h, j * cell) == min(h, (j + 1) * cell):
                continue  # outside the drawing, or a zero-width cell at its clipped border (a degenerate face)
            quad = []
            for (jj, ii) in ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i)):
                if vid[jj, ii] < 0:
                    x, y = min(w, ii * cell), min(h, jj * cell)
                    vid[jj, ii] = len(verts)
                    X, Z = P(x, y)
                    verts.append((X, 0.0, Z))
                    uvs.append((x / w, 1 - y / h))
                quad.append(vid[jj, ii])
            faces.append(quad if not mirror else quad[::-1])
    mat, fade = emissive_material(f"{actor['id']}-{k}", img)
    # A living face (liveface.py): the card plays the face sequence — lips, eyes — so the drawing is not bent below
    # its lip seam and no flat lid is laid on its eyes.
    seq_first = os.path.join(VISAGE['dir'], actor['id'], pose['kind'], 'f00001.png') if VISAGE.get('dir') else ''
    live = bool(seq_first) and os.path.isfile(seq_first)
    if live:
        sequence_texture(mat, seq_first, VISAGE['frames'])
    ob = mesh_object(f"{actor['id']}-pose{k}", verts, faces, uvs, mat)
    V = np.array(verts)
    vx = V[:, 0] / scale * sx + ax  # back to drawing pixels
    vy = foot_y - V[:, 2] / scale
    # Landmarks (pixels) with fallbacks from the silhouette.
    top_y = rows[0] if len(rows) else 0
    chin = f.get('chin') or [ax, top_y + (foot_y - top_y) * 0.14]
    sh = [(b['shL'][0] + b['shR'][0]) / 2, (b['shL'][1] + b['shR'][1]) / 2] if b.get('shL') else [ax, top_y + (foot_y - top_y) * 0.2]
    hip = [(b['hipL'][0] + b['hipR'][0]) / 2, (b['hipL'][1] + b['hipR'][1]) / 2] if b.get('hipL') else [ax, top_y + (foot_y - top_y) * 0.5]
    neck = [(chin[0] + sh[0]) / 2, (chin[1] * 0.55 + sh[1] * 0.45)]
    hx = (f['cheekL'][0] + f['cheekR'][0]) / 2 if f.get('cheekL') else chin[0]
    hhalf = max(abs(f['cheekL'][0] - hx), abs(f['cheekR'][0] - hx)) * 1.3 if f.get('cheekL') else (foot_y - top_y) * 0.07
    hhalf = max(hhalf, (chin[1] - top_y) * 0.55)
    band = max(6.0, (sh[1] - chin[1]) * 0.45)
    w_head = smoothstep(neck[1] + band * 0.6, neck[1] - band * 0.6, vy) * (1 - smoothstep(hhalf * 1.1, hhalf * 1.7, np.abs(vx - hx)))
    w_root = smoothstep(hip[1] - band, hip[1] + band, vy)
    w_spine = np.clip(1 - w_root - w_head, 0, 1)
    # Pointing arm (a gesture toward someone): forearm + hand on their own bone, aimed later at the partner (the line
    # eye → fingertip must meet the person pointed at — aim_points()). Never the head: it stays on its own bone.
    point, w_fore = None, None
    if pose.get('kind') in POINTING and b:
        # The pointing arm is UNFOLDED and held away from the body (forearm ≥ 70 % of the upper arm — not foreshortened —,
        # its horizontal reach away from the body ≥ half its length, the hand above the hip); the highest hand wins.
        best = None
        for sd in ('L', 'R'):
            s_, e_, r_ = b.get('sh' + sd), b.get('el' + sd), b.get('wr' + sd)
            if not (s_ and e_ and r_) or min((v[2] if len(v) > 2 else 1) for v in (s_, e_, r_)) <= 0.5 or r_[1] >= hip[1]:
                continue
            upper = math.hypot(e_[0] - s_[0], e_[1] - s_[1])
            fore = math.hypot(r_[0] - e_[0], r_[1] - e_[1])
            away = (r_[0] - e_[0]) * (1 if r_[0] >= hip[0] else -1)
            long_enough = fore >= 0.10 * (foot_y - top_y)  # an arm pointing across, not a hand turned toward the lens
            if long_enough and fore >= 0.7 * upper and away >= 0.5 * fore and (best is None or r_[1] < best[0]):
                best = (r_[1], e_[:2], r_[:2])
        if best:
            _, E, Wr = best
            Lf = math.hypot(Wr[0] - E[0], Wr[1] - E[1])
            T = (Wr[0] + 0.55 * (Wr[0] - E[0]), Wr[1] + 0.55 * (Wr[1] - E[1]))
            ddx, ddy = T[0] - E[0], T[1] - E[1]
            tt = ((vx - E[0]) * ddx + (vy - E[1]) * ddy) / max(ddx * ddx + ddy * ddy, 1e-6)
            qx, qy = E[0] + np.clip(tt, 0, 1) * ddx, E[1] + np.clip(tt, 0, 1) * ddy
            dist = np.hypot(vx - qx, vy - qy)
            rr = 0.42 * Lf
            w_fore = (1 - smoothstep(0.6 * rr, rr, dist)) * smoothstep(0.02, 0.15, tt) * (1 - smoothstep(1.05, 1.15, tt))
            if f.get('chin'):
                inside = ((vx - hx) / max(hhalf, 1)) ** 2 + ((vy - (top_y + chin[1]) / 2) / max((chin[1] - top_y) * 0.55, 1)) ** 2 < 1.0
                w_fore = np.where(inside, 0.0, w_fore)
            # The drawing is ONE layer (the hand may touch the chin): it is never bent — the gesture is measured only.
            point = {'E': P(*E), 'W': P(*Wr), 'T': P(*T), 'px': (E, Wr)}
            w_fore = None
    # Jaw: below the lip seam, around the mouth, down to under the chin.
    drawn_open = f.get('open', 0) >= 0.12
    if f.get('seam') and f.get('mouthWidth') and not live:
        mw = f['mouthWidth']
        mx_, my_ = f['seam']
        if drawn_open and f.get('bottom'):
            # A mouth drawn open (a shout, a laugh): its lower lip and chin go down a little — the drawn opening grows.
            my_ = (my_ + f['bottom'][1]) / 2
        axw = mw * 0.95
        below = smoothstep(my_ - 1.0, my_ + 1.0, vy)
        down = 1 - smoothstep(chin[1], chin[1] + (chin[1] - my_) * 0.8, vy)
        side = 1 - smoothstep(axw * 0.55, axw, np.abs(vx - mx_))
        w_jaw = below * down * side
        drop = mw * (0.2 if drawn_open else 0.34) * scale
    else:
        w_jaw, drop = None, 0
    ob.shape_key_add(name='Basis')
    if w_jaw is not None:
        kj = ob.shape_key_add(name='jaw')
        co = V.copy()
        co[:, 2] -= drop * w_jaw
        kj.data.foreach_set('co', co.ravel().astype(np.float32))
    # Armature (root → spine → head) on the measured joints.
    arm = bpy.data.armatures.new(f"{actor['id']}-rig{k}")
    ao = bpy.data.objects.new(f"{actor['id']}-rig{k}", arm)
    bpy.context.scene.collection.objects.link(ao)
    ao.parent = root
    bpy.context.view_layer.objects.active = ao
    ao.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name, p0, p1, parent=None):
        eb = arm.edit_bones.new(name)
        x0, z0 = P(*p0)
        x1, z1 = P(*p1)
        eb.head = (x0, 0, z0)
        eb.tail = (x1, 0, z1 if abs(z1 - z0) > 1e-3 else z0 + 0.05)
        eb.roll = 0
        if parent:
            eb.parent = arm.edit_bones[parent]
        return eb
    bone('root', (ax, foot_y), (ax, hip[1]))
    bone('spine', (hip[0], hip[1]), (neck[0], neck[1]), 'root')
    bone('head', (neck[0], neck[1]), (hx, top_y), 'spine')
    bpy.ops.object.mode_set(mode='OBJECT')
    for name, wv in (('root', w_root), ('spine', w_spine), ('head', w_head)):
        vg = ob.vertex_groups.new(name=name)
        for i, val in enumerate(wv):
            if val > 0.001:
                vg.add([i], float(val), 'REPLACE')
    ob.parent = ao
    mod = ob.modifiers.new('rig', 'ARMATURE')
    mod.object = ao
    # Mouth (cavity + teeth) and lids, children of the head bone (they follow every head move).
    extras = []
    def on_head(o, px_xy, dy=-0.003):
        # In the ACTOR's space, like the mesh (P is relative to the feet; the root may already stand off-centre — placed
        # in world space, a lid or a mouth floated beside the face by the actor's offset).
        X, Z = P(*px_xy)
        bpy.context.view_layer.update()
        mw_ = ao.matrix_world @ Matrix.Translation((X, dy, Z))
        o.parent = ao
        o.parent_type = 'BONE'
        o.parent_bone = 'head'
        bpy.context.view_layer.update()
        o.matrix_world = mw_
        o['visage_de'] = ob.name  # the preflight checks that the piece lies on its drawing
        extras.append(o)
        return o
    cav = None
    if w_jaw is not None and not drawn_open:
        rx = f['mouthWidth'] * 0.40 * scale
        n = 24
        vs = [(0, 0, 0)] + [(rx * math.cos(math.pi * t / n) * sx, 0, -math.sin(math.pi * t / n)) for t in range(n + 1)]
        fs = [(0, t + 1, t + 2) for t in range(n)]
        cav = mesh_object(f"{actor['id']}-mouth{k}", vs, fs, mat=flat_material(f"{actor['id']}-cav{k}", f.get('cavity', [58, 20, 18])))
        on_head(cav, f['seam'])
        cav.scale = (1, 1, 0.0001)
        tv = [(-rx * 0.62, 0, 0), (rx * 0.62, 0, 0), (rx * 0.5, 0, -0.32), (-rx * 0.5, 0, -0.32)]
        teeth = mesh_object(f"{actor['id']}-teeth{k}", tv, [(0, 1, 2, 3)], mat=flat_material(f"{actor['id']}-tee{k}", [238, 232, 222]))
        teeth.parent = cav
        teeth.location = (0, -0.0005, 0)
    lids = []
    for e, eye in enumerate([] if live else (f.get('eyes') or [])):
        rx, ry = eye['rx'] * 1.18 * scale, eye['ry'] * 1.25 * scale
        n = 24
        vs = [(rx * math.cos(2 * math.pi * t / n), 0, -ry + ry * math.sin(2 * math.pi * t / n)) for t in range(n)]
        lid = mesh_object(f"{actor['id']}-lid{k}{e}", vs + [(0, 0, -ry)], [(n, t, (t + 1) % n) for t in range(n)], mat=flat_material(f"{actor['id']}-lidm{k}{e}", eye.get('lid', [110, 70, 50])))
        on_head(lid, [eye['c'][0], eye['c'][1] - eye['ry'] * 1.25])
        lid.scale = (1, 1, 0.0001)
        lids.append(lid)
    p = Pose()
    p.ob, p.arm, p.fade, p.cav, p.lids, p.kind, p.drop = ob, ao, fade, cav, lids, pose['kind'], drop
    p.face_z = P(*(f.get('nose') or chin))[1] if f else (foot_y - top_y) * scale * 0.9
    p.face_x = P(*(f.get('nose') or chin))[0] if f else 0.0
    p.top_z = (foot_y - top_y) * scale
    p.point = point
    p.width = (np.ptp(V[:, 0]) if len(V) else 0.5)
    p.xmin, p.xmax = (float(V[:, 0].min()), float(V[:, 0].max())) if len(V) else (-0.25, 0.25)
    # Where the FEET are (the drawing's lowest 12 %): nothing is ever set down there (an object « through » a foot).
    low = V[V[:, 2] < 0.12 * p.top_z] if len(V) else V
    p.feet = (float(low[:, 0].min()), float(low[:, 0].max())) if len(low) else (-0.15, 0.15)
    return p


POINTING = ('accuse', 'pointe', 'montre', 'designe')
# The closest poses by INTENT, in order, when a pose cannot be played as drawn (the emotion is kept as far as possible).
SUBSTITUTES = {'accuse': ('haussement', 'choc', 'neutre'), 'pointe': ('haussement', 'neutre'), 'montre': ('haussement', 'neutre'),
               'designe': ('haussement', 'neutre')}


def aim_points(actors, plan):
    """Pointing law, as the VIEWER reads it: the extension of the forearm and the index (elbow → fingertip) must meet
    the person pointed at. A drawing is one layer — its arm is never bent to force it —, so a pointing pose whose DRAWN
    line misses the partner's face (more than 15 cm) is replaced, automatically, by the character's closest pose by
    intent (an accusation becomes indignation, then shock…) that obeys every law: it looks at the partner, it does not
    point elsewhere. Returns the substitutions made."""
    out = []
    for a in actors.values():
        others = [o for o in actors.values() if o is not a]
        if not others:
            continue
        o = min(others, key=lambda o_: abs(o_['plan']['x'] - a['plan']['x']))
        tr = plan['tracks'][a['plan']['id']]
        for kind, P in a['poses'].items():
            pt = getattr(P, 'point', None)
            if not pt:
                continue
            tx = o['plan']['x'] - a['plan']['x'] + o['poses']['neutre'].face_x
            tz = o['poses']['neutre'].face_z - 0.03
            E, T = pt['E'], pt['T']
            dx_, dz_ = T[0] - E[0], T[1] - E[1]
            L = math.hypot(dx_, dz_) or 1e-6
            ux, uz = dx_ / L, dz_ / L
            ahead = (tx - E[0]) * ux + (tz - E[1]) * uz > L
            perp = abs((tx - E[0]) * uz - (tz - E[1]) * ux)
            pt['theta'], pt['ecart'], pt['cible'] = 0.0, perp, o['plan']['id']
            if ahead and perp <= 0.15:
                continue
            n = sum(1 for _, k in tr['poses'] if k == kind)
            if n:
                want = 1 if o['plan']['x'] > a['plan']['x'] else -1
                cands = [c for c in SUBSTITUTES.get(kind, ('neutre',)) if c in a['poses'] and not getattr(a['poses'][c], 'point', None)]
                good = [c for c in cands if getattr(a['poses'][c], 'look', want) == want]
                repl = (good or cands or ['neutre'])[0]
                tr['poses'] = [[f, repl if k == kind else k] for f, k in tr['poses']]
                z_line = E[1] + (tx - E[0]) * uz / ux if abs(ux) > 1e-6 else E[1]
                where = 'au-dessus' if z_line > tz else 'au-dessous'  # height of the drawn line where the partner stands
                out.append((a['plan']['id'], kind, o['plan']['id'], perp, n))
                print(f"[geste] {a['plan']['id']} : pose « {kind} » remplacée automatiquement par « {repl} » ({n} passage(s)) — son doigt dessiné vise "
                      f"{perp * 100:.0f} cm {where} du visage de {o['plan']['id']} (il désignerait quelqu’un d’autre). "
                      f"Un dessin qui pointe vers {o['plan']['id']} rendrait ce geste possible.", flush=True)
    return out


def style_check(rig, plan, life, bounds):
    """Inputs of the style law for the conformity check: the troupe's signature and the set's (the painted kit or the
    baked 3D place, as the film shows it)."""
    import style as stylemod
    try:
        return {'ref': style_reference(rig, plan, life), 'decor': stylemod.signature(bounds['grid']['px'])}
    except Exception as e:
        print('[style] mesure impossible :', e, flush=True)
        return None


def style_reference(rig, plan, life=None):
    """The visual signature of the troupe (style.py), measured on the drawings of this film's people (actors, extras,
    crowd) — or of the whole troupe when they are too few."""
    import style as stylemod
    names = [a['name'] for a in plan.get('actors', [])] + [e['name'] for e in (life or {}).get('extras', [])] + list(((life or {}).get('crowd') or {}).get('names', []))
    names = [n for n in dict.fromkeys(names) if n in rig['cast']]
    if len(names) < 8:
        names = list(rig['cast'])
    cards = []
    for n in names:
        _img, px = load_rgba(os.path.join(rig['dir'], rig['cast'][n]['poses'][0]['png']))
        cards.append((px[..., :3], px[..., 3]))
    return stylemod.reference(cards)


def look(pose):
    """Where the drawing LOOKS (+1 right, −1 left): the irises when the eyes are open and clearly turned (what a viewer
    reads as the gaze), else the head (nose against the eyes). A head turned right with eyes looking left looks left."""
    f = pose.get('face') or {}
    eyes = [e for e in (f.get('eyes') or []) if e.get('iris') and e.get('rx')]
    if eyes:
        g = sum((e['iris'][0] - e['c'][0]) / e['rx'] for e in eyes) / len(eyes)
        openness = sum(e.get('ry', 0) / e['rx'] for e in eyes) / len(eyes)
        if abs(g) >= 0.15 and openness >= 0.4:
            return 1 if g > 0 else -1
    return facing(pose)


def facing(pose):
    f = pose.get('face') or {}
    eyes = f.get('eyes') or []
    if f.get('nose') and len(eyes) >= 1:
        cx = np.mean([e['c'][0] for e in eyes])
        return 1 if f['nose'][0] >= cx else -1
    return 1


# ── main ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
def main():
    A = args()
    plan = json.load(open(A.plan, encoding='utf-8'))
    rig = json.load(open(plan['rig'], encoding='utf-8'))
    rig_dir = rig['dir']
    life = plan.get('life') or {}
    vdir = os.path.join(os.path.dirname(os.path.abspath(A.plan)), 'visage')
    if not A.sans_visage and os.path.isdir(vdir):
        VISAGE.update({'dir': vdir, 'frames': plan['frames']})
    global DECOR_FIXE, JEU_CORPS, MOCAP
    DECOR_FIXE, JEU_CORPS, MOCAP = A.decor_fixe, not A.sans_jeu, not A.sans_mocap
    if A.decor:
        if A.decor not in rig['decors']:
            raise SystemExit(f'vue inconnue du kit : {A.decor}')
        plan['decor'] = A.decor
        if life:
            life['kit'] = A.decor
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import world as livingworld
    baked = None
    if plan.get('decor') not in rig['decors'] or (life and life.get('kit') is None and life.get('place')):
        # A place without a painted set: Blender bakes one (3D place, real light, depth) before the film is built.
        baked = livingworld.bake_template(life or {'place': plan.get('decor', 'lieu'), 'template': 'piece'}, os.path.join(os.path.dirname(os.path.abspath(A.out)), 'decors'),
                                          style_ref=style_reference(rig, plan, life))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    fps = plan['fps']
    sc.render.fps = fps
    sc.frame_start, sc.frame_end = 1, plan['frames']
    sc.render.resolution_x = int(plan['width'] * A.scale)
    sc.render.resolution_y = int(plan['height'] * A.scale)
    sc.render.resolution_percentage = 100
    eng = A.engine.upper()
    sc.render.engine = 'CYCLES' if eng == 'CYCLES' else ('BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE')
    if sc.render.engine == 'CYCLES':
        sc.cycles.samples = A.samples
        sc.cycles.use_adaptive_sampling = False
        sc.cycles.use_denoising = False
        sc.cycles.max_bounces = 0
        sc.cycles.transparent_max_bounces = 24
        sc.render.use_persistent_data = True
        try:
            sc.cycles.device = 'GPU' if bpy.context.preferences.addons['cycles'].preferences.has_active_device() else 'CPU'
        except Exception:
            pass
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0, 0, 0, 1)
    sc.world = world

    dec = baked or rig['decors'][plan['decor']]
    decor, soft, bounds = build_decor(dec, (0.0, -2.4, 1.0))
    analyse_ground(dec, bounds['grid'])
    actors = {}
    for i, ac in enumerate(plan['actors']):
        cast = rig['cast'][ac['name']]
        root = bpy.data.objects.new(f"{ac['id']}-root", None)
        sc.collection.objects.link(root)
        root.location = (ac['x'], -0.02 * i, 0)
        neutral = cast['poses'][0]
        ys = neutral['h']
        scale = ac['height'] / max(1, ys - 8)
        want = 1 if ac['x'] <= 0 else -1  # face the partner (left actor looks right)
        poses = {}
        for k, pose in enumerate(cast['poses']):
            # Each pose is turned so that its GAZE goes to the partner (eye contact; the listener looks at the speaker).
            mirror = ac['mirror'] if ac.get('mirror') is not None else (look(pose) != want)
            poses[pose['kind']] = build_pose(ac, pose, k, rig_dir, scale, mirror, root)
            poses[pose['kind']].look = look(pose) * (-1 if mirror else 1)
        # Contact shadow: a soft dark ellipse LYING on the floor under the feet (the cast shadow comes later).
        wsh = poses['neutre'].width * 0.9
        sh = mesh_object(f"{ac['id']}-shadow", [(-wsh / 2, -0.09, 0.002), (wsh / 2, -0.09, 0.002), (wsh / 2, 0.13, 0.002), (-wsh / 2, 0.13, 0.002)],
                         [(0, 1, 2, 3)], [(0, 0), (1, 0), (1, 1), (0, 1)])
        m = shadow_material(f"{ac['id']}-shm")
        sh.data.materials.append(m)
        sh.parent = root
        sh['shell'] = True
        actors[ac['id']] = {'root': root, 'poses': poses, 'plan': ac, 'shadow': sh}
        # Where the feet are over all poses (relative to the root): the physics control of the objects reads it.
        root['pieds'] = (min(getattr(P, 'feet', (-0.15, 0.15))[0] for P in poses.values()), max(getattr(P, 'feet', (-0.15, 0.15))[1] for P in poses.values()))

    calibrate_stage(actors, bounds, plan['width'] / plan['height'])
    gestures = aim_points(actors, plan)
    # The walkable-floor law for the actors: a 3D forestage when the painting shows no floor where they stand (a baked
    # 3D place already has its real floor in the picture).
    xs_ = [a['plan']['x'] for a in actors.values()]
    if baked is None:
        build_forestage(bounds, plan.get('decor') or (life or {}).get('place'), list(np.linspace(min(xs_) - 0.6, max(xs_) + 0.6, 15)))
    else:
        bounds['grid']['stage'] = None
    animate(plan, actors, fps)
    actor_shadows(actors, bounds['grid'], rig_dir, rig)
    world_ = None
    if life:
        heights = {}
        try:
            heights = {n: c['height'] for n, c in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'characters.json'), encoding='utf-8')).items()}
        except Exception:
            pass
        g = bounds['grid']
        # The stage of the two-shot (same maths as cameras()): where the living world must be to be SEEN.
        asp = plan['width'] / plan['height']
        # The stage = the REAL wide shot (same lens choice as cameras()): the living world is placed where it is seen.
        scx, scz, side, frame_h = two_frame(list(actors.values()), bounds, asp)
        C0_ = g['C0']
        stage = {'cx': scx, 'hw0': side / 2, 'd': -C0_[1], 'cz': scz, 'hh0': frame_h / 2, 'camx': C0_[0], 'camz': C0_[2]}
        world_ = livingworld.build_life(life, {'stage': stage,'fps': fps, 'nF': plan['frames'], 'grid': g, 'shots': plan['shots'], 'tint': g.get('tint'), 'decor_strength': g.get('strength'), 'rig': rig, 'heights': heights,
                                      'actors': actors, 'mesh_object': mesh_object, 'flat_material': flat_material, 'emissive_material': emissive_material,
                                      'load_rgba': load_rgba, 'key': key, 'shadow_material': shadow_material,
                                      'attach_shadow': attach_shadow, 'cast_shadow_material': cast_shadow_material})
    # The forestage takes the light of the set (time of day) like the painting.
    if bounds['grid'].get('tint') is not None:
        for m_ in bpy.data.materials:
            if m_.name.startswith('sol-') and m_.node_tree and m_.node_tree.nodes.get('tint'):
                m_.node_tree.nodes['tint'].inputs['B'].default_value = tuple(bounds['grid']['tint'].inputs['B'].default_value)
    shots_info = cameras(plan, actors, bounds, soft, fps)
    if JEU_CORPS and not A.sans_suivi:
        span = tuple(int(x) for x in A.frames.split('-')) if A.frames else None
        follow_faces(plan, actors, fps, span)
    # Depth of field calibrated on the real cameras: the background stays legible (faces, expressions).
    image_qa = calibrate_softness(shots_info, plan, bounds, world_.softs if life else [])
    sc.frame_set(1)
    # PREFLIGHT QA — mandatory: the scene is checked (geometry, materials, objects, collisions, scale, real time,
    # light, rigs and animation, narrative) before a single frame is rendered. A critical fault stops here.
    import preflight
    tl = plan.get('timeline') or []
    hook_f = 1 + int(((tl[0]['speak0'] if tl else 0) + 0.4) * fps)
    pb = (plan.get('story') or {}).get('punch')
    punch_f = 1 + int(tl[pb['beat']]['speak1'] * fps) if pb and tl and pb.get('beat', -1) < len(tl) else None
    qa_out = os.path.join(os.path.dirname(os.path.abspath(A.out)), 'preflight')
    res = preflight.run('scene', plan.get('title', ''), story=plan.get('story'), life=life, cast=plan.get('actors'), drawn=set(rig['cast']),
                        probe_frames=[f for f in (hook_f, punch_f) if f and f <= plan['frames']], out=qa_out,
                        cuts=[int(s_['start']) + 1 for s_ in plan.get('shots', [])],
                        cameras={'grid': bounds['grid'], 'shots': shots_info, 'captions': {'two': 0.865, 'close': 0.80}, 'height': plan['height']},
                        image=image_qa, style=style_check(rig, plan, life, bounds),
                        people=[{'nom': a['plan']['id'], 'root': a['root'].name, 'w': a['poses']['neutre'].width, 'h': a['poses']['neutre'].top_z,
                                 'fx': a['poses']['neutre'].face_x, 'fz': a['poses']['neutre'].face_z,
                                 'faces': {k_: [p_.face_x, p_.face_z] for k_, p_ in a['poses'].items()},
                                 'points': {k_: {'E': list(p_.point['E']), 'T': list(p_.point['T']), 'theta': p_.point.get('theta', 0.0)}
                                            for k_, p_ in a['poses'].items() if getattr(p_, 'point', None)}, 'looks': {k_: p_.look for k_, p_ in a['poses'].items()},
                                 'track': plan['tracks'][a['plan']['id']]['poses']} for a in actors.values()])
    print(f"[conformité] objectifs {res['taux_objectifs']} % · qualité {res['score']}/100 · {res['verdict']} · conforme dès la génération : "
          f"{'oui' if res['conforme_des_la_generation'] else 'non'} · {len(res['corrections'])} correction(s) → {qa_out}.html", flush=True)
    if not res['passed'] and not A.force:
        crit = [i['message'] + (f" ({i['objet']})" if i.get('objet') else '') for i in res['issues'] if i['severite'] == 'critique']
        raise SystemExit('[preflight] BLOQUÉ : ' + ' ; '.join(crit[:6]))
    if A.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(A.blend))
    os.makedirs(A.out, exist_ok=True)
    frames = []
    if A.still:
        frames = [int(x) for x in A.still.split(',') if x.strip()]
    elif A.frames:
        f0, f1 = [int(x) for x in A.frames.split('-')]
        frames = list(range(f0, f1 + 1))
    else:
        frames = list(range(1, plan['frames'] + 1))
    if 1 in frames:
        screen_faces(sc, actors, plan, os.path.join(os.path.dirname(os.path.abspath(A.plan)), 'ecran-visages.json'))
    if frames:
        screen_shots(sc, actors, plan, os.path.join(os.path.dirname(os.path.abspath(A.plan)), 'ecran-plans.json'), (min(frames), max(frames)))
        sc.frame_set(frames[0])
    import time
    t0 = time.time()
    step = max(1, A.pas) if not A.still else 1
    last = None
    for n, fr in enumerate(frames):
        path = os.path.join(A.out, f'f{fr:05d}.png')
        if os.path.isfile(path) and not A.still:
            last = path
            continue
        if step > 1 and (fr - frames[0]) % step and last:
            os.link(last, path)  # preview « on twos / threes »: the frame repeats the last one rendered
            continue
        sc.frame_set(fr)
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        last = path
        if n % 25 == 0:
            el = time.time() - t0
            print(f'[scene] image {fr} ({n + 1}/{len(frames)}) · {el / (n + 1):.2f} s/image', flush=True)
    print(f'[scene] OK {len(frames)} image(s) en {time.time() - t0:.0f} s', flush=True)


def screen_faces(sc, actors, plan, path, seconds=3.2):
    """Where each face is ON SCREEN during the first seconds (the hook text must never cover a face): one box per
    visible actor, in image shares (x0, y0, x1, y1, from the top-left), every other frame."""
    from bpy_extras.object_utils import world_to_camera_view
    out = {}
    for f in range(1, min(plan['frames'], int(seconds * plan['fps'])) + 1, 2):
        sc.frame_set(f)
        boxes = []
        for a in actors.values():
            if (a['plan'].get('enter') or 0) > f - 1:
                continue
            P = a['poses']['neutre']
            head = max(0.08, getattr(P, 'top_z', P.face_z + 0.15) - P.face_z)
            pts = [a['root'].matrix_world @ Vector((P.face_x + dx * head * 0.85, 0.0, P.face_z + dz)) for dx in (-1, 1)
                   for dz in (head, -0.75 * head)]
            uv = [world_to_camera_view(sc, sc.camera, q) for q in pts]
            if all(v.z > 0 for v in uv):
                xs, ys = [v.x for v in uv], [1 - v.y for v in uv]
                boxes.append([round(min(xs), 3), round(min(ys), 3), round(max(xs), 3), round(max(ys), 3)])
        out[f] = boxes
    json.dump(out, open(path, 'w'), indent=0)


def animate(plan, actors, fps):
    nF = plan['frames']
    for aid, A in actors.items():
        tr = plan['tracks'][aid]
        poses = A['poses']
        root = A['root']
        enter = A['plan'].get('enter') or 0
        # Entrance: from outside the frame, three small hops.
        if enter > 0:
            x1 = A['plan']['x']
            side = 1 if x1 >= 0 else -1
            key(root, 'location', 1, x1 + side * 2.5, 0)
            key(root, 'location', enter, x1 + side * 1.2, 0)
            key(root, 'location', enter + int(0.9 * fps), x1, 0)
            for h in range(3):
                f = enter + int(h * 0.3 * fps)
                key(root, 'location', f, 0.0, 2)
                key(root, 'location', f + int(0.15 * fps), 0.05, 2)
                key(root, 'location', f + int(0.3 * fps), 0.0, 2)
        # Pose visibility: crossfade of 4 frames between successive poses.
        seq = tr['poses']
        active = {}
        for i, (f, kind) in enumerate(seq):
            kind = kind if kind in poses else 'neutre'
            nxt = seq[i + 1][0] if i + 1 < len(seq) else nF + 1
            active.setdefault(kind, []).append((max(1, f + 1), nxt + 1))
        # Pose to pose like a cartoon: a clean SNAP on the frame (no dissolve — two half-transparent drawings let the
        # set and the extras show through the body), with a small squash-and-stretch bounce on the new pose.
        switches = []
        for kind, P in poses.items():
            spans = active.get(kind, [])
            vis = np.zeros(nF + 2)
            for (a, b) in spans:
                vis[a:b] = 1
            if enter > 0:
                vis[:enter] = 0
            P.fade.outputs[0].default_value = 1.0
            prev = None
            for f in range(1, nF + 1):
                v = vis[f]
                if v != prev:
                    P.ob.hide_render = not v
                    P.ob.keyframe_insert('hide_render', frame=f)
                    if v and f > 1:
                        switches.append(f)
                    prev = v
            P.vis = vis
        for f in sorted(set(switches)):
            if enter > 0 and f <= enter:
                continue
            # Anticipation (a small squash before), snap with stretch, settle (Disney's principles, 4 frames).
            for df, sz in ((-3, 1.0), (-1, 0.972), (0, 1.045), (2, 0.988), (4, 1.0)):
                if 1 <= f + df <= nF:
                    root.scale = (1.0 / sz ** 0.5, 1.0, sz)
                    root.keyframe_insert('scale', frame=f + df)
        jaw = np.array(tr['jaw'])
        turn = np.array(tr['turn'])
        nod = np.array(tr['nod'])
        blink = np.zeros(nF + 2)
        for b in tr['blinks']:
            for d, v in enumerate((0.6, 1.0, 1.0, 0.5)):
                if b + d < nF:
                    blink[b + d + 1] = v
        seed = sum(ord(c) for c in aid)
        # The body plays the voice (acting.py, tested): lean toward the partner with the head following, syllable bob,
        # visible breath, weight shifts, listening nods.
        import acting
        partner_nods = [plan['tracks'][o]['nod'] for o in plan['tracks'] if o != aid]
        clips = []
        if JEU_CORPS and MOCAP:
            import mocap
            try:
                clips = acting.mocap_spans(tr['poses'], nF, mocap.LIBRARY)
                for a_, b_, k_ in clips:
                    mocap.clip_curves(k_, fps, A['plan'].get('height') or 1.6)
            except Exception as e:  # noqa: BLE001 — no network for the first download: the procedural acting stays
                print(f'[mocap] clips indisponibles ({e.__class__.__name__}) : jeu procédural seul', flush=True)
                clips = []
        cv = acting.curves(jaw, partner_nods, A['plan']['x'], nF, fps, seed, on=JEU_CORPS,
                           scale=acting.shot_scale(plan['shots'], aid, nF, fps), clips=clips,
                           height_m=A['plan'].get('height') or 1.6)
        if clips:
            print(f"[mocap] {A['plan'].get('name', aid)} : {', '.join(f'{k_} {(b_ - a_) / fps:.1f} s' for a_, b_, k_ in clips)} (capture CMU)", flush=True)
        lift, squash = cv['lift'], cv['squash']
        head_rot, spine_rot, root_rot = cv['head'], cv['spine'], cv['root']
        breath, breath_amp, listen_nod, bobv = cv['breath'], cv['breath_amp'], cv['listen'], cv['bob']
        for kind, P in poses.items():
            ob = P.ob
            sk = ob.data.shape_keys.key_blocks.get('jaw') if ob.data.shape_keys else None
            pb = P.arm.pose.bones
            for b in pb:
                b.rotation_mode = 'XYZ'
            last_j = None
            for f in range(1, nF + 1):
                i = f - 1
                j = float(jaw[i]) if i < len(jaw) else 0.0
                if sk is not None and (last_j is None or abs(j - last_j) > 0.02 or (j == 0 and last_j != 0)):
                    sk.value = j
                    sk.keyframe_insert('value', frame=f)
                    if P.cav is not None:
                        P.cav.scale = (1, 1, max(0.0001, j * P.drop))
                        P.cav.keyframe_insert('scale', index=2, frame=f)
                    last_j = j
                if f % 2 == 1 or f == nF:
                    pb['head'].rotation_euler[2] = math.radians(3.2) * float(turn[i] if i < len(turn) else 0) + float(head_rot[i])
                    pb['head'].keyframe_insert('rotation_euler', index=2, frame=f)
                    nd = float(nod[i] if i < len(nod) else 0) + float(listen_nod[i])
                    pb['head'].location[1] = -0.024 * nd + float(bobv[i])
                    pb['head'].keyframe_insert('location', index=1, frame=f)
                    pb['spine'].scale[1] = (1 + breath_amp * float(breath[i])) * (1 - float(squash[i]))
                    pb['spine'].keyframe_insert('scale', index=1, frame=f)
                    pb['spine'].rotation_euler[2] = float(spine_rot[i])
                    pb['spine'].keyframe_insert('rotation_euler', index=2, frame=f)
                    pb['root'].rotation_euler[2] = float(root_rot[i])
                    pb['root'].keyframe_insert('rotation_euler', index=2, frame=f)
                    pb['root'].location[1] = float(lift[i])  # along the root bone (feet → hips): up
                    pb['root'].keyframe_insert('location', index=1, frame=f)
            for lid in P.lids:
                prev = None
                for f in range(1, nF + 1):
                    v = blink[f]
                    if v != prev:
                        lid.scale = (1, 1, max(0.0001, v))
                        lid.keyframe_insert('scale', index=2, frame=f)
                        prev = v
            # Face pieces render only while their pose is on AND they are open (a flattened piece would show as a line).
            jaw_on = np.concatenate([[0], (jaw > 0.04).astype(int), [0, 0]])[: nF + 2]
            blink_on = (blink > 0).astype(int)
            for o, on in ([(P.cav, jaw_on)] if P.cav is not None else []) + [(l, blink_on) for l in P.lids]:
                prev = None
                for f in range(1, nF + 1):
                    v = bool(P.vis[f]) and bool(on[f])
                    if v != prev:
                        for x in [o, *o.children]:
                            x.hide_render = not v
                            x.keyframe_insert('hide_render', frame=f)
                        prev = v


def max_two_width(bounds, asp, margin=0.04, lens=None):
    """The widest frame (at the actors' plane) a vertical shot can have while its view of the painted set — further back,
    at the set plane Yp — stays INSIDE the painting (no mirrored edge, no black band)."""
    g = bounds['grid']
    wm, hm = bounds['x1'] - bounds['x0'], bounds['z1'] - bounds['z0']
    if g.get('stage') and not lens:
        # A 3D forestage covers everything below the painting: the wide shot shows the feet on the floor (FEET_MARGIN of
        # the frame under them) and only the painting's TOP limits its height.
        mpl_ = (g['Yp'] - g['C0'][1]) / -g['C0'][1]
        z_feet = g['C0'][2] + (0.0 - g['C0'][2]) * mpl_
        hm = (bounds['z1'] - z_feet) / (1 - FEET_MARGIN)
    if lens:  # a camera that dollies (the parallax of the relief eats the margin)
        return max(0.6, min(wm, hm * asp) * (1 - margin) - g['Yp'] / (lens / SENSOR))
    # From the painting's own viewpoint the frame scales linearly to the painting plane: no parallax margin.
    mpl = (g['Yp'] - g['C0'][1]) / -g['C0'][1]
    return max(0.6, min(wm, hm * asp) * (1 - margin) / mpl)


def calibrate_stage(actors, bounds, asp, fmax=1.07):
    """Stage calibration (before anything is animated): neighbours are placed close enough for their two-shot to
    fit inside the painted set, like actors blocked on a real set — the left one stays left, the group stays centred."""
    order = sorted(actors.values(), key=lambda a: a['plan']['x'])
    if len(order) < 2:
        return
    w_max = max_two_width(bounds, asp) / fmax
    widths = [a['poses']['neutre'].width for a in order]
    gaps = [order[i + 1]['plan']['x'] - order[i]['plan']['x'] for i in range(len(order) - 1)]
    pairs = [(widths[i] + widths[i + 1]) / 2 for i in range(len(order) - 1)]
    # The bodies (≈ 80 % of the drawn width) should fit the wide shot…
    allowed = min(w_max - 0.8 * p - 0.08 for p in pairs)
    # …but a gesture never lands on the partner's face: the furthest reach of every pose of the left actor stops 8 cm
    # before the face of the right one (and the other way round). That wins over the width of the wide shot.
    touch = 0.0
    for i in range(len(order) - 1):
        A, B = order[i], order[i + 1]
        reach_a = max(p.xmax for p in A['poses'].values())
        reach_b = min(p.xmin for p in B['poses'].values())
        face_b = min(p.face_x for p in B['poses'].values())
        face_a = max(p.face_x for p in A['poses'].values())
        touch = max(touch, reach_a - face_b + 0.08, face_a - reach_b + 0.08)
    gap = max(touch, min(min(gaps), allowed))
    if abs(gap - min(gaps)) < 1e-3:
        return
    centre = sum(a['plan']['x'] for a in order) / len(order)
    for i, a in enumerate(order):
        x = centre + (i - (len(order) - 1) / 2) * gap
        a['plan']['x'] = round(x, 3)
        a['root'].location.x = x
        # Alternating depth: two close neighbours are never on the same plane (no z-fighting, a clear front / back).
        a['root'].location.y = -0.05 * (i % 2)
    print(f'[plateau] écart entre acteurs recalibré à {gap:.2f} m (plan large ≤ {w_max:.2f} m dans le décor, '
          f'geste le plus long sans toucher le visage du partenaire : {touch:.2f} m)', flush=True)


def two_shot(here, bounds, asp, fmax=1.07, lens=None):
    """Frame of a shot of several actors: as wide as needed but never wider than the painted set allows; heads in the
    frame with their headroom; the whole view of the set (up to the start of a push-in) inside the painting."""
    lens = lens or LENS
    k = lens / SENSOR
    yp = bounds['grid']['Yp']
    xs = [a['plan']['x'] for a in here]
    ws = [a['poses']['neutre'].width for a in here]
    xa = min(x - w / 2 for x, w in zip(xs, ws)) - 0.06
    xb = max(x + w / 2 for x, w in zip(xs, ws)) + 0.06
    top = max(a['poses']['neutre'].top_z for a in here)
    side = min(max(xb - xa, 0.8), max_two_width(bounds, asp, lens=lens) / fmax)
    frame_h = side / asp
    hw = (side * fmax + yp / k) / 2
    hh = (frame_h * fmax + yp / (k * asp)) / 2
    clamp = lambda v, lo, hi: (lo + hi) / 2 if lo > hi else min(max(v, lo), hi)
    cx = clamp((xa + xb) / 2, bounds['x0'] + hw, bounds['x1'] - hw)
    cz = clamp(top + 0.07 - frame_h / 2, bounds['z0'] + hh, bounds['z1'] - hh)
    return cx, cz, side, frame_h, side * k


def fit_view(g, cx, cz, d, tan_h, tan_v, spread=0.0, tol=0.004, faces=(), d_tight=None, cap_y=0.8):
    """Moves the camera until everything it sees — at the widest moment of its move — is INSIDE the painting, without
    ever pushing a face of the shot out of the frame (or under the captions) at any moment of the move: when a move
    would cut a face, the camera tightens instead (closer, same aim). Returns (cx, cz, tightening, overflow left)."""
    from framing import view_overflow, project
    th = tan_h + spread / max(d, 1e-3)
    d_tight = d if d_tight is None else d_tight

    def faces_ok(x, z, f):
        for dd in (d * f, d_tight * f):
            for p in faces:
                u, v, _ = project((x, -dd, z), th, tan_v, p)
                if u is None or not (0.06 <= u <= 0.94) or not (0.06 <= v <= cap_y - 0.05):
                    return False
        return True

    f = 1.0
    for _ in range(120):
        L, R, T, B = view_overflow(g, (cx, -d * f, cz), th, tan_v)
        if max(L, R, T, B) <= tol:
            return cx, cz, f, 0.0
        if (L > tol and R > tol) or (T > tol and B > tol):
            f *= 0.97
            continue
        ncx = cx + (L - R) + (0.003 if L > tol else -0.003 if R > tol else 0.0)
        ncz = cz + (B - T) + (0.003 if B > tol else -0.003 if T > tol else 0.0)
        if faces and not faces_ok(ncx, ncz, f) and f > 0.55:
            f *= 0.97  # tighten rather than cut a face
            continue
        cx, cz = ncx, ncz
    return cx, cz, f, round(max(view_overflow(g, (cx, -d * f, cz), th, tan_v)), 3)


def calibrate_softness(info, plan, bounds, softs):
    """Depth of field that keeps the background LEGIBLE: on every close-up the blur of the set and of the drawn
    extras, measured on screen, stays under a ceiling (generation rule « background_blur_px », for a 1024-px-high
    image) — faces and their expressions remain readable. Nearer extras are sharper than the set (like a lens
    focused on the actors). Returns the per-shot measures for the conformity report."""
    import rules as genrules
    from world import gauss_blur, blur_sigma
    g = bounds['grid']
    Hs = plan['height']
    T = float(genrules.get('background_blur_px')) * Hs / 1024
    close = [i for i in info if i['type'] != 'two']
    px_per_m = lambda D, i: Hs / (2 * D * i['tan_v'])
    yp, depth = g['Yp'], g['DEPTH']
    out = []

    def sigma_for(cap_over_m):
        sg = min(12.0, max(0.0, cap_over_m))  # bounded: a hidden or tiny card never asks for a giant kernel
        while sg > 0.3 and blur_sigma(sg) > cap_over_m * 1.0001:
            sg *= 0.97
        return sg

    # The set: its softness is set by the tightest close-up (largest magnification of the painting).
    mdec = {i['k']: px_per_m(i['d_min'] + yp, i) * g['mH'] / g['H_tex'] for i in close}
    sg_dec = sigma_for(T / max(mdec.values())) if mdec else 0.0
    big = gauss_blur(g['px'], sg_dec)
    H, W = big.shape[:2]
    g['soft_img'].pixels.foreach_set(np.dstack([big, np.ones((H, W))])[::-1].astype(np.float32).ravel())
    # The drawn extras: where each card stands during each close-up (it moves), and its texture size on screen.
    sc = bpy.context.scene
    cards = [c for c in softs if c.get('obj') is not None]
    from framing import project
    where = {}
    for i in close:
        sc.frame_set((i['start'] + i['end']) // 2 + 1)
        cam = sc.objects.get(i['camera'])
        cl = (*tuple(cam.matrix_world.translation), i.get('ox', 0.0), i.get('oz', 0.0)) if cam else (i['cx'], -i['d_min'], i['cz'])
        for c in cards:
            ob = c['obj']
            mw = ob.matrix_world
            sz = mw.to_scale().z
            x, y, D = project(cl, i['tan_h'], i['tan_v'], tuple(mw.translation))
            hidden = ob.hide_render or (ob.parent is not None and ob.parent.hide_render)
            seen = sz > 1e-3 and not hidden and x is not None and -0.3 <= x <= 1.3 and -0.3 <= y <= 1.6
            if seen:
                where[(i['k'], c['name'])] = (mw.translation.y, sz * c['m_per_px'])
    blur_card = {}
    for c in cards:
        caps = []
        for i in close:
            if (i['k'], c['name']) not in where:
                continue  # not in this shot
            y, mpp = where[(i['k'], c['name'])]
            D = i['d_min'] + y
            # Closer to the actors (the focus) = sharper; never blurrier than the set's ceiling.
            w = min(1.0, max(0.35, (1 - i['d_min'] / D) / (1 - i['d_min'] / (i['d_min'] + yp + 0.5 * depth))))
            caps.append(T * w / max(1e-6, px_per_m(D, i) * mpp))
        sg = sigma_for(min(caps)) if caps else 1.0
        c['sigma'] = sg
        soft = gauss_blur(c['px'], sg)
        c['img'].pixels.foreach_set(soft[::-1].astype(np.float32).ravel())
        for i in close:
            if (i['k'], c['name']) not in where:
                continue
            y, mpp = where[(i['k'], c['name'])]
            blur_card[(i['k'], c['name'])] = blur_sigma(sg) * px_per_m(i['d_min'] + y, i) * mpp
    for i in info:
        e = {'plan': i['k'], 'type': i['type'], 'cible_px': round(T, 2), 'hors_decor_m': i['hors_decor_m'], 'resserre': i['resserre']}
        if i['type'] != 'two':
            e['flou_decor_px'] = round(blur_sigma(sg_dec) * mdec[i['k']], 2)
            e['flou_figurants_px'] = round(max([v for (k, _), v in blur_card.items() if k == i['k']] or [0.0]), 2)
        else:
            e['flou_decor_px'] = e['flou_figurants_px'] = 0.0
        out.append(e)
    print(f'[netteté] flou du fond ≤ {T:.1f} px à l’écran (décor σ={sg_dec:.1f} px texture, {len(cards)} figurant(s) calibré(s))', flush=True)
    return out


def two_frame(here, bounds, asp, fmax=1.07):
    """Wide shot of several actors from the painting's viewpoint: as wide as needed, never wider than the painting can
    hold at the widest moment of the move (exact — no parallax from C0); heads in frame with their headroom.
    Returns (cx, cz, side, frame_h) at the actors' plane."""
    xs = [a['plan']['x'] for a in here]
    ws = [a['poses']['neutre'].width for a in here]
    xa = min(x - w / 2 for x, w in zip(xs, ws)) - 0.06
    xb = max(x + w / 2 for x, w in zip(xs, ws)) + 0.06
    top = max(a['poses']['neutre'].top_z for a in here)
    side = min(max(xb - xa, 0.8), max_two_width(bounds, asp) / fmax)
    frame_h = side / asp
    # The owner's two-shot keeps a SHARP SQUARE (side × side) and blurs the rest (finish.py): the heads get their
    # headroom under the top of that square, not under the top of the whole vertical picture (film 6: the heads touched
    # the top edge, or fell in the blur).
    cz = top + 0.07 - side / 2
    if bounds['grid'].get('stage'):
        # Full shot on a real floor: the feet FEET_MARGIN above the bottom of the frame (never cut at the ankles or the
        # calves), as long as the heads keep their headroom.
        cz = max(cz, frame_h * (0.5 - FEET_MARGIN))
    return (xa + xb) / 2, cz, side, frame_h


def choose_two_lens(here, bounds, asp, fmax=1.07):
    """In a vertical frame a painted set rarely holds two actors at 35 mm: the shortest focal length whose whole move
    stays inside the set WITHOUT tightening and keeps both faces in frame (a longer lens stands back, closer to the
    painting's own viewpoint: less parallax on the relief, flatter — right for drawn cards).
    Returns (lens, cx, cz, side, frame_h, distance)."""
    cand = None
    for L_ in (35, 50, 65, 85, 105):
        cx_, cz_, side_, fh_, d_ = two_shot(here, bounds, asp, fmax, lens=L_)
        tv_ = SENSOR / 2 / L_ / asp
        fc = [(a['plan']['x'] + a['poses']['neutre'].face_x, a['root'].location.y, a['poses']['neutre'].face_z) for a in here]
        *_, t_, o_ = fit_view(bounds['grid'], cx_, cz_, d_ * fmax, tv_ * asp, tv_, faces=fc, d_tight=d_ * 0.97, cap_y=0.865)
        cand = (L_, cx_, cz_, side_, fh_, d_)
        if t_ >= 0.98 and o_ <= 0.004:
            break
    return cand


def cameras(plan, actors, bounds, soft, fps):
    sc = bpy.context.scene
    W, H = plan['width'], plan['height']
    asp = W / H
    info = []
    lens_free = False  # (a fixed-lens production could set this; by default the two-shot lens is chosen by the fit)
    for k, s in enumerate(plan['shots']):
        cam = bpy.data.cameras.new(f'cam{k}')
        cam.lens = LENS
        cam.sensor_width = SENSOR
        cam.sensor_height = SENSOR
        co = bpy.data.objects.new(f'cam{k}', cam)
        sc.collection.objects.link(co)
        co.rotation_euler = (math.radians(90), 0, 0)
        here = [a for a in actors.values() if (a['plan'].get('enter') or 0) <= s['start'] + 2]
        tgt = actors.get(s['target']) or here[0]
        # The pose the target PLAYS in the middle of the shot (a bent laugh is framed lower than a standing pose).
        mid = (s['start'] + s['end']) // 2
        seq = plan['tracks'][next(k for k, v in actors.items() if v is tgt)]['poses']
        kind = 'neutre'
        for f, kd in seq:
            if f <= mid:
                kind = kd
        P = tgt['poses'].get(kind) or tgt['poses']['neutre']
        tx = tgt['plan']['x']
        fmax = 1.32 if s.get('move') == 'punch' else 1.07
        g = bounds['grid']
        C0 = g['C0']
        D0 = -C0[1]                        # the actors' plane (y = 0) seen from the painting's own viewpoint
        mpl = (g['Yp'] - C0[1]) / D0       # actors' plane → painting plane
        if s['type'] == 'two' and len(here) > 1:
            if len(here) > 2:
                # Three or more on stage: the shot frames the speaker and the nearest partner (the others are off-frame).
                near = sorted((a for a in here if a is not tgt), key=lambda a: abs(a['plan']['x'] - tgt['plan']['x']))[0]
                here = [tgt, near]
            cx, cz, side, frame_h = two_frame(here, bounds, asp, fmax)
            cam.sensor_fit = 'HORIZONTAL'
        else:
            frame_h = (0.62 if s['type'] == 'mcu' else 0.36) * P.top_z
            if s['type'] == 'cu':
                # A vertical close-up 0.36 × height wide held a 28 cm head in 32 cm: the end of a punch-in cut the cheek
                # (film 6, « Moi, j'ai pris »). The head never takes more than 62 % of the frame's width.
                head_w = 1.7 * max(0.08, P.top_z - P.face_z)
                frame_h = max(frame_h, head_w / 0.62 / asp)
            look = -1 if tx > 0 else 1
            # Centred on the FACE of the played pose (a bent laugh leans sideways), with room in the look direction.
            fx = tx + (P.face_x if s['type'] == 'cu' else P.face_x * 0.5)
            cx = fx + look * frame_h * asp * (0.04 if s['type'] == 'cu' else 0.1)
            cz = (P.top_z - 0.40 * frame_h) if s['type'] == 'mcu' else (P.face_z + 0.06 * frame_h)
            cam.sensor_fit = 'VERTICAL'
        mv = s.get('move', 'push')
        # Moves of a camera that stays at the painting's viewpoint: push / pull / punch are ZOOMS (focal length), drift
        # is a lens SHIFT — the painted set is then seen exactly as painted (no rubber-sheet stretching of the painted
        # people, whatever the framing), and the drawn cards stay frontal.
        if mv == 'punch':
            moves = [(s['start'] + 1, 1.32, 0), (min(s['end'], s['start'] + 1 + int(0.45 * fps)), 1.01, 0), (s['end'], 0.97, 0)]
        else:
            # Measured on the owner's channel: the CHARACTERS move, the camera barely (≤ 29 % of the picture moving);
            # a 7 % push on a close shot moved the whole picture (64 % before any acting). Close shots: 3 %.
            close = s['type'] != 'two'
            zp = 1.03 if close else 1.07
            m0, m1 = (zp, 1.0) if mv == 'push' else (1.0, zp - 0.01) if mv == 'pull' else (1.01, 1.01) if close else (1.02, 1.02)
            dr = 0.012 if close else 0.025
            dx0, dx1 = (-dr * frame_h, dr * frame_h) if mv == 'drift' else (0, 0)
            moves = [(s['start'] + 1, m0, dx0), (s['end'], m1, dx1)]
        fwide, ftight = max(m for _, m, _ in moves), min(m for _, m, _ in moves)
        drift = max(abs(x) for *_, x in moves)
        shown = here if s['type'] == 'two' and len(here) > 1 else [tgt]
        faces = [(a['plan']['x'] + (P.face_x if a is tgt else a['poses']['neutre'].face_x), a['root'].location.y,
                  (P.face_z if a is tgt else a['poses']['neutre'].face_z)) for a in shown]
        cap_y = 0.865 if s['type'] == 'two' else 0.80

        def faces_ok(x, z, fh):
            return all(0.06 <= 0.5 + (fx_ - x) / (fh * asp) <= 0.94 and 0.06 <= 0.5 - (fz_ - z) / fh <= cap_y - 0.05 for fx_, _y, fz_ in faces)

        # Exact fit (linear from C0): the widest view of the move stays inside the painting; a face is never pushed out
        # of frame to get there — the framing tightens instead.
        cx0, cz0 = cx, cz
        tight = 1.0
        for _ in range(80):
            fh = frame_h * tight
            hw, hh = fh * asp * fwide / 2 * mpl + drift * tight * mpl, fh * fwide / 2 * mpl
            zlo = -1e6 if g.get('stage') else bounds['z0']  # a 3D forestage covers what lies below the painting
            if 2 * hw > bounds['x1'] - bounds['x0'] - 0.01 or 2 * hh > bounds['z1'] - zlo - 0.01:
                tight *= 0.97
                continue
            pcx = min(max(C0[0] + (cx0 - C0[0]) * mpl, bounds['x0'] + hw + 0.005), bounds['x1'] - hw - 0.005)
            pcz = min(max(C0[2] + (cz0 - C0[2]) * mpl, zlo + hh + 0.005), bounds['z1'] - hh - 0.005)
            ncx, ncz = C0[0] + (pcx - C0[0]) / mpl, C0[2] + (pcz - C0[2]) / mpl
            if faces_ok(ncx, ncz, fh * ftight) or tight < 0.55:
                cx, cz = ncx, ncz
                break
            tight *= 0.97
        if abs(cx - cx0) > 0.01 or abs(cz - cz0) > 0.01 or tight < 0.999:
            print(f"[cadrage] plan {k + 1} ({s['type']}) : cadre décalé de {100 * (cx - cx0):+.0f}/{100 * (cz - cz0):+.0f} cm, "
                  f"resserré de {100 * (1 - tight):.0f} % pour rester dans la peinture", flush=True)
        frame_h *= tight
        lens = D0 * SENSOR / (frame_h * asp if cam.sensor_fit == 'HORIZONTAL' else frame_h)
        co.location = tuple(C0)
        for f, m_, dx in moves:
            fh_k = frame_h * m_
            cam.lens = lens / m_
            # Lens shift in units of the sensor-fit side of the frame (Blender): width for a horizontal fit, else height.
            unit = fh_k * asp if cam.sensor_fit == 'HORIZONTAL' else fh_k
            cam.shift_x = (cx + dx * tight - C0[0]) / unit
            cam.shift_y = (cz - C0[2]) / unit
            for path in ('lens', 'shift_x', 'shift_y'):
                cam.keyframe_insert(path, frame=f)
        import framing
        th_w, tv_w, ox_w, oz_w = framing.lens_view(lens / fwide, cam.shift_x, cam.shift_y, cam.sensor_fit, asp, SENSOR)
        over = round(max(framing.view_overflow(g, (C0[0], C0[1], C0[2], ox_w, oz_w), th_w, tv_w)), 3)
        tan_v = SENSOR / 2 / (lens / ftight) / (asp if cam.sensor_fit == 'HORIZONTAL' else 1.0)
        info.append({'k': k, 'type': s['type'], 'lens': lens, 'start': s['start'], 'end': s['end'], 'tan_v': tan_v, 'tan_h': tan_v * asp, 'target': s.get('target'),
                     'faces': faces, 'names': [a['plan']['id'] for a in shown], 'camera': co.name, 'd_min': D0, 'd_max': D0,
                     'ox': (cx - C0[0]) / D0, 'oz': (cz - C0[2]) / D0, 'cx': cx, 'cz': cz, 'resserre': round(1 - tight, 3), 'hors_decor_m': over})
        m = sc.timeline_markers.new(f'shot{k}', frame=s['start'] + 1)
        m.camera = co
        # Close-ups: the set softly out of focus (like a real lens, strength calibrated to keep faces readable), wide shots sharp.
        soft.outputs[0].default_value = 0.0 if s['type'] == 'two' else 1.0
        soft.outputs[0].keyframe_insert('default_value', frame=s['start'] + 1)
        if k:
            soft.outputs[0].keyframe_insert('default_value', frame=s['start'] + 1)
        if k == 0:
            sc.camera = co
    # Hard cuts: constant interpolation on the softness switch.
    try:
        ad = soft.id_data.animation_data
        act = ad.action if ad else None
        curves = []
        if act is not None:
            if hasattr(act, 'fcurves'):
                curves = list(act.fcurves)
            else:
                from bpy_extras import anim_utils
                cb = anim_utils.action_get_channelbag_for_slot(act, ad.action_slot)
                curves = list(cb.fcurves) if cb else []
        for fc in curves:
            if 'soft' in fc.data_path:
                for kp in fc.keyframe_points:
                    kp.interpolation = 'CONSTANT'
    except Exception as e:
        print('[scene] interpolation:', e)
    return info



def screen_shots(sc, actors, plan, path, span=None):
    """Where the faces are ON SCREEN in each two-shot (start, middle, end; after the acting and the camera moves), in
    image shares (x0, y0, x1, y1 from the top-left): finish.py places the sharp square of the owner's two-shot style
    on them — framed for the full vertical picture, the heads fell in the blurred band (film 6). Merged per run."""
    from bpy_extras.object_utils import world_to_camera_view
    nF = plan['frames']
    lo, hi = span or (1, nF)
    try:
        out = json.load(open(path))
    except (OSError, ValueError):
        out = {}
    for k, s in enumerate(plan['shots']):
        if s['type'] != 'two' or s['end'] < lo or s['start'] + 1 > hi:
            continue
        co = bpy.data.objects.get(f'cam{k}')
        if co is None:
            continue
        boxes = []
        for f in sorted({s['start'] + 1, (s['start'] + s['end']) // 2, s['end']}):
            sc.frame_set(f)
            for aid, A in actors.items():
                if (A['plan'].get('enter') or 0) > f - 1:
                    continue
                kind = 'neutre'
                for f0, kd in plan['tracks'][aid]['poses']:
                    if f0 + 1 <= f:
                        kind = kd
                P = A['poses'].get(kind) or A['poses']['neutre']
                pb = P.arm.pose.bones['head']
                D = P.arm.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted()
                head = max(0.08, getattr(P, 'top_z', P.face_z + 0.15) - P.face_z)
                uv = [world_to_camera_view(sc, co, D @ Vector((P.face_x + dx * head * 0.85, 0.0, P.face_z + dz)))
                      for dx in (-1, 1) for dz in (head, -0.75 * head)]
                if all(v.z > 0 for v in uv):
                    boxes.append([round(min(v.x for v in uv), 3), round(min(1 - v.y for v in uv), 3),
                                  round(max(v.x for v in uv), 3), round(max(1 - v.y for v in uv), 3)])
        out[str(k)] = boxes
    json.dump(out, open(path, 'w'), indent=0)


def follow_faces(plan, actors, fps, span=None, follow=1.0, dead=0.06):
    """THE OPERATOR FOLLOWS THE FACE. In a close-up the frame is ≈ 30 cm wide: the acting layer (a lean of ≈ 7 cm toward
    the partner, the weight shifts) took the face out of it (film 6, « Tu m'as fatiguée »). For every close shot the
    face's real position (head bone, after the acting) is compared on screen with where the drawing's face would be
    at rest; the lens shift takes up what goes beyond a DEAD ZONE (`dead` of the frame), smoothed over 0.4 s like a
    camera operator who does not chase every sway — the body moves against a still set, the face never leaves the
    shot (measured: following everything moved 88 % of the picture, the channel's videos ≤ 29 %)."""
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    nF = plan['frames']
    lo, hi = span or (1, nF)
    moved = 0
    for k, s in enumerate(plan['shots']):
        if s['type'] == 'two' or s['end'] < lo or s['start'] + 1 > hi:
            continue
        aid = s.get('target')
        A = actors.get(aid)
        co = bpy.data.objects.get(f'cam{k}')
        if A is None or co is None:
            continue
        cam = co.data
        seq = plan['tracks'][aid]['poses']
        frames = list(range(s['start'] + 1, s['end'] + 1, 2)) + [s['end']]
        sc.camera = co
        dus, dvs, base = [], [], []
        for f in frames:
            kind = 'neutre'
            for f0, kd in seq:
                if f0 + 1 <= f:
                    kind = kd
            P = A['poses'].get(kind) or A['poses']['neutre']
            sc.frame_set(f)
            pb = P.arm.pose.bones['head']
            rest = Vector((P.face_x, 0.0, P.face_z))
            M = P.arm.matrix_world
            now = M @ (pb.matrix @ pb.bone.matrix_local.inverted() @ rest)
            u1, u0 = world_to_camera_view(sc, co, now), world_to_camera_view(sc, co, M @ rest)
            # Screen motion per unit of lens shift, measured on this very camera at this frame.
            sx, sy = cam.shift_x, cam.shift_y
            cam.shift_x, cam.shift_y = sx + 0.01, sy + 0.01
            u2 = world_to_camera_view(sc, co, M @ rest)
            cam.shift_x, cam.shift_y = sx, sy
            gx, gy = (u2.x - u0.x) / 0.01, (u2.y - u0.y) / 0.01
            ex_ = lambda d: math.copysign(max(0.0, abs(d) - dead), d)
            dus.append(-follow * ex_(u1.x - u0.x) / gx if abs(gx) > 1e-6 else 0.0)
            dvs.append(-follow * ex_(u1.y - u0.y) / gy if abs(gy) > 1e-6 else 0.0)
            base.append((sx, sy))
        n = max(1, int(0.4 * fps / 2))
        sm = lambda a: np.convolve(np.pad(np.asarray(a, float), (n, n), mode='edge'), np.ones(2 * n + 1) / (2 * n + 1), mode='valid')
        dx, dy = sm(dus), sm(dvs)
        for f, (sx, sy), ex, ey in zip(frames, base, dx, dy):
            cam.shift_x, cam.shift_y = sx + float(ex), sy + float(ey)
            cam.keyframe_insert('shift_x', frame=f)
            cam.keyframe_insert('shift_y', frame=f)
        moved = max(moved, float(np.max(np.abs(dx))) if len(dx) else 0.0)
    sc.frame_set(lo)
    print(f'[caméra] suit les visages des plans serrés (reprise jusqu’à {moved:.3f} du cadre)', flush=True)


if __name__ == '__main__':
    main()
