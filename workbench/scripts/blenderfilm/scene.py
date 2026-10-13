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
    soft = bpy.data.images.new('decor-soft', W, H, alpha=False)
    small = px[::4, ::4, :3]
    for _ in range(4):
        small = (small + np.roll(small, 1, 0) + np.roll(small, -1, 0) + np.roll(small, 1, 1) + np.roll(small, -1, 1)) / 5
    big = np.repeat(np.repeat(small, 4, 0), 4, 1)[:H, :W]
    big = np.pad(big, ((0, H - big.shape[0]), (0, W - big.shape[1]), (0, 0)), mode='edge')
    # Smooth the 4×4 steps away (separable box blur at full size): a lens blur, not mosaic.
    for _ in range(2):
        acc = big.copy()
        for d in (1, 2, 3):
            acc += np.roll(big, d, 0) + np.roll(big, -d, 0)
        big = acc / 7
        acc = big.copy()
        for d in (1, 2, 3):
            acc += np.roll(big, d, 1) + np.roll(big, -d, 1)
        big = acc / 7
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
    t2 = nt.nodes.new('ShaderNodeTexImage')
    t2.image = soft
    t2.extension = 'MIRROR'
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
    nt.links.new(val.outputs[0], mx.inputs['Factor'])
    nt.links.new(t1.outputs['Color'], mx.inputs['A'])
    nt.links.new(t2.outputs['Color'], mx.inputs['B'])
    nt.links.new(mx.outputs['Result'], tint.inputs['A'])
    nt.links.new(tint.outputs['Result'], em.inputs['Color'])
    nt.links.new(strength.outputs[0], em.inputs['Strength'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    ob = mesh_object('decor', verts, faces, uvs, m)
    grid = {'C0': C0.tolist(), 'Yp': Yp, 'DEPTH': DEPTH, 'x0': x0, 'Wm': Wm, 'ztop': ztop, 'mH': mH, 'EX': EX, 'EZ': EZ, 'dn': dn if dpx is not None else None,
            'tint': tint, 'strength': strength.outputs[0]}
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
    # Jaw: below the lip seam, around the mouth, down to under the chin.
    drawn_open = f.get('open', 0) >= 0.12
    if f.get('seam') and f.get('mouthWidth'):
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
        X, Z = P(*px_xy)
        o.location = (X, dy, Z)
        bpy.context.view_layer.update()
        mw_ = o.matrix_world.copy()
        o.parent = ao
        o.parent_type = 'BONE'
        o.parent_bone = 'head'
        bpy.context.view_layer.update()
        o.matrix_world = mw_
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
    for e, eye in enumerate(f.get('eyes') or []):
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
    p.width = (np.ptp(V[:, 0]) if len(V) else 0.5)
    return p


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
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import world as livingworld
    baked = None
    if plan.get('decor') not in rig['decors'] or (life and life.get('kit') is None and life.get('place')):
        # A place without a painted set: Blender bakes one (3D place, real light, depth) before the film is built.
        baked = livingworld.bake_template(life or {'place': plan.get('decor', 'lieu'), 'template': 'piece'}, os.path.join(os.path.dirname(os.path.abspath(A.out)), 'decors'))
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
            mirror = ac['mirror'] if ac.get('mirror') is not None else (facing(pose) != want)
            poses[pose['kind']] = build_pose(ac, pose, k, rig_dir, scale, mirror, root)
        # Contact shadow (a soft dark ellipse just behind the feet).
        wsh = poses['neutre'].width * 0.9
        sh = mesh_object(f"{ac['id']}-shadow", [(-wsh / 2, 0, -0.04), (wsh / 2, 0, -0.04), (wsh / 2, 0, 0.07), (-wsh / 2, 0, 0.07)], [(0, 1, 2, 3)], [(0, 0), (1, 0), (1, 1), (0, 1)])
        m = shadow_material(f"{ac['id']}-shm")
        sh.data.materials.append(m)
        sh.parent = root
        sh.location = (0, 0.03, 0)
        actors[ac['id']] = {'root': root, 'poses': poses, 'plan': ac, 'shadow': sh}

    animate(plan, actors, fps)
    if life:
        heights = {}
        try:
            heights = {n: c['height'] for n, c in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'characters.json'), encoding='utf-8')).items()}
        except Exception:
            pass
        g = bounds['grid']
        # The stage of the two-shot (same maths as cameras()): where the living world must be to be SEEN.
        xs = [a['plan']['x'] for a in actors.values()]
        ws = [a['poses']['neutre'].width for a in actors.values()]
        xa = min(x - w / 2 for x, w in zip(xs, ws)) - 0.12
        xb = max(x + w / 2 for x, w in zip(xs, ws)) + 0.12
        top = max(a['poses']['neutre'].top_z for a in actors.values()) + 0.1
        side = max(xb - xa, top + 0.08)
        asp = plan['width'] / plan['height']
        stage = {'cx': (xa + xb) / 2, 'hw0': side / 2, 'd': side * LENS / SENSOR, 'cz': max(side, top + 0.08) / 2 - 0.05, 'hh0': side / asp / 2}
        livingworld.build_life(life, {'stage': stage,'fps': fps, 'nF': plan['frames'], 'grid': g, 'shots': plan['shots'], 'tint': g.get('tint'), 'decor_strength': g.get('strength'), 'rig': rig, 'heights': heights,
                                      'actors': actors, 'mesh_object': mesh_object, 'flat_material': flat_material, 'emissive_material': emissive_material,
                                      'load_rgba': load_rgba, 'key': key, 'shadow_material': shadow_material})
    cameras(plan, actors, bounds, soft, fps)
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
                        cuts=[int(s_['start']) + 1 for s_ in plan.get('shots', [])])
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
    import time
    t0 = time.time()
    for n, fr in enumerate(frames):
        path = os.path.join(A.out, f'f{fr:05d}.png')
        if os.path.isfile(path) and not A.still:
            continue
        sc.frame_set(fr)
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        if n % 25 == 0:
            el = time.time() - t0
            print(f'[scene] image {fr} ({n + 1}/{len(frames)}) · {el / (n + 1):.2f} s/image', flush=True)
    print(f'[scene] OK {len(frames)} image(s) en {time.time() - t0:.0f} s', flush=True)


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
        tt = np.arange(nF + 1) / fps
        seed = sum(ord(c) for c in aid)
        breath = np.sin(tt * 2 * math.pi / 3.6 + seed % 7)
        sway = np.sin(tt * 2 * math.pi / 5.3 + seed % 5)
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
                    pb['head'].rotation_euler[2] = math.radians(3.2) * float(turn[i] if i < len(turn) else 0)
                    pb['head'].keyframe_insert('rotation_euler', index=2, frame=f)
                    pb['head'].location[1] = -0.012 * float(nod[i] if i < len(nod) else 0)
                    pb['head'].keyframe_insert('location', index=1, frame=f)
                if f % 3 == 1 or f == nF:
                    pb['spine'].scale[1] = 1 + 0.010 * float(breath[i])
                    pb['spine'].keyframe_insert('scale', index=1, frame=f)
                    pb['root'].rotation_euler[2] = math.radians(0.7) * float(sway[i])
                    pb['root'].keyframe_insert('rotation_euler', index=2, frame=f)
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


def cameras(plan, actors, bounds, soft, fps):
    sc = bpy.context.scene
    W, H = plan['width'], plan['height']
    asp = W / H
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
        if s['type'] == 'two' and len(here) > 1:
            xs = [a['plan']['x'] for a in here]
            ws = [a['poses']['neutre'].width for a in here]
            xa = min(x - w / 2 for x, w in zip(xs, ws)) - 0.12
            xb = max(x + w / 2 for x, w in zip(xs, ws)) + 0.12
            top = max(a['poses']['neutre'].top_z for a in here) + 0.1
            side = max(xb - xa, top + 0.08)
            cx, cz = (xa + xb) / 2, max(side, top + 0.08) / 2 - 0.05
            cam.sensor_fit = 'HORIZONTAL'
            frame_h = side / asp
            dist = side * LENS / SENSOR
        else:
            frame_h = (0.62 if s['type'] == 'mcu' else 0.36) * P.top_z
            look = -1 if tx > 0 else 1
            # Centred on the FACE of the played pose (a bent laugh leans sideways), with room in the look direction.
            fx = tx + (P.face_x if s['type'] == 'cu' else P.face_x * 0.5)
            cx = fx + look * frame_h * asp * (0.04 if s['type'] == 'cu' else 0.1)
            cz = (P.top_z - 0.40 * frame_h) if s['type'] == 'mcu' else (P.face_z + 0.06 * frame_h)
            cam.sensor_fit = 'VERTICAL'
            dist = frame_h * LENS / SENSOR
            # Keep the frame inside the painted set.
            half_w = frame_h * asp / 2
            cx = min(max(cx, bounds['x0'] + half_w + 0.02), bounds['x1'] - half_w - 0.02)
            cz = min(max(cz, bounds['z0'] + frame_h / 2 + 0.02), bounds['z1'] - frame_h / 2 - 0.02)
        mv = s.get('move', 'push')
        if mv == 'punch':
            # Snap zoom (the hook, the punchline): fast push-in over half a second, then a slow creep.
            keys = [(s['start'] + 1, dist * 1.32, 0), (min(s['end'], s['start'] + 1 + int(0.45 * fps)), dist * 1.01, 0), (s['end'], dist * 0.97, 0)]
        else:
            d0, d1 = (dist * 1.07, dist) if mv == 'push' else (dist, dist * 1.06) if mv == 'pull' else (dist * 1.02, dist * 1.02)
            dx0, dx1 = (-0.025 * frame_h, 0.025 * frame_h) if mv == 'drift' else (0, 0)
            keys = [(s['start'] + 1, d0, dx0), (s['end'], d1, dx1)]
        for f, d, dx in keys:
            co.location = (cx + dx, -d, cz)
            co.keyframe_insert('location', frame=f)
        m = sc.timeline_markers.new(f'shot{k}', frame=s['start'] + 1)
        m.camera = co
        # Close-ups: the set softly out of focus (like a real lens), wide shots sharp.
        soft.outputs[0].default_value = 0.0 if s['type'] == 'two' else (0.55 if s['type'] == 'mcu' else 0.8)
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


if __name__ == '__main__':
    main()
