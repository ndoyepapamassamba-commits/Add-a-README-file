#!/usr/bin/env python3
"""DÉCOUPE DES PLANCHES (portage Python du découpeur de l'app, server/jev/studio/actor/sheet.ts) — chaque planche fond
vert (un personnage en 5 poses : neutre, accuse, choc, haussement, rire) devient 5 découpes PNG à alpha doux (fond vert
dé-mélangé, débordement vert retiré) + un rig mesuré par pose : bouche (coins, couture des lèvres, menton), yeux
(ellipses, iris), squelette (épaules, hanches, chevilles, nez) — repris des points mesurés du manifeste du kit troupe.

  python3 scripts/blenderfilm/cutout.py --troupe .private/troupe --out ~/massamba-blender/troupe [--only MODOU,KOFFI]

Rien n'est envoyé ailleurs ; les découpes de VOS dessins restent dans le dossier de sortie (jamais dans le dépôt).
"""
import argparse, json, os
import numpy as np
from PIL import Image
from scipy import ndimage

# Ordre des 70 points de visage du manifeste (FACE_IDX de server/jev/studio/actor/face2d.ts).
FACE_IDX = [0, 1, 7, 13, 14, 17, 33, 61, 78, 80, 81, 82, 87, 88, 95, 133, 144, 145, 152, 153, 154, 155, 157, 158, 159, 160, 161, 163, 173, 178, 191, 234, 246, 249, 263, 291, 308, 310, 311, 312, 317, 318, 324, 362, 373, 374, 380, 381, 382, 384, 385, 386, 387, 388, 390, 398, 402, 415, 454, 466, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477]
EYE_A = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
EYE_B = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
POSE_ORDER = ['neutre', 'accuse', 'choc', 'haussement', 'rire']


def is_green(r, g, b):
    return (g > 90) & (g > r * 1.28) & (g > b * 1.28)


def key_out(rgb):
    """Matte doux + dé-mélange du fond + retrait du débordement vert (identique à keyOut() de l'app)."""
    r, g, b = [rgb[..., k].astype(np.float32) for k in range(3)]
    green = is_green(r, g, b) & (g - np.maximum(r, b) > 60)
    kr = float(np.median(r[green])) if green.any() else 30.0
    kg = float(np.median(g[green])) if green.any() else 230.0
    kb = float(np.median(b[green])) if green.any() else 30.0
    kE = max(60.0, kg - max(kr, kb))
    e = g - np.maximum(r, b)
    t = np.clip((e / kE - 0.25) / 0.55, 0, 1)
    a = 1 - t * t * (3 - 2 * t)
    a[is_green(r, g, b) & (e > kE * 0.8)] = 0
    a[a <= 0.02] = 0
    safe = np.maximum(a, 1e-3)
    edge = (a > 0) & (a < 0.999)
    R = np.where(edge, (r - (1 - a) * kr) / safe, r)
    G = np.where(edge, (g - (1 - a) * kg) / safe, g)
    B = np.where(edge, (b - (1 - a) * kb) / safe, b)
    lim = np.maximum(R, B)
    spill = (G > lim) & ((a < 0.999) | (e > kE * 0.18))
    G = np.where(spill, lim + (G - lim) * 0.15, G)
    # The rim of the figure (3 px inside its outline) keeps no screen green: its green excess is pulled back further,
    # and the outline itself is eroded by one pixel (no lime halo on a dark set).
    solid = a > 0.5
    inner = ndimage.binary_erosion(solid, iterations=3)
    rim = solid & ~inner
    lim2 = np.maximum(R, B)
    G = np.where(rim & (G > lim2), lim2 + (G - lim2) * 0.12, G)
    G = np.where((a < 0.97) & (G > lim2), lim2, G)
    a = np.minimum(a, ndimage.minimum_filter(a, size=3))
    out = np.dstack([np.clip(R, 0, 255), np.clip(G, 0, 255), np.clip(B, 0, 255), a * 255]).round().astype(np.uint8)
    out[a == 0, :3] = 0
    return out


def pose_boxes(mask, k=4):
    h, w = mask.shape
    gh, gw = (h + k - 1) // k, (w + k - 1) // k
    grid = np.zeros((gh, gw), bool)
    ys, xs = np.nonzero(mask)
    grid[ys // k, xs // k] = True
    lab, n = ndimage.label(grid)
    if not n:
        return []
    sizes = ndimage.sum(grid, lab, range(1, n + 1))
    sl = ndimage.find_objects(lab)
    total = sizes.sum()
    big, small = [], []
    for i, s in enumerate(sl):
        box = [s[1].start, s[0].start, s[1].stop - 1, s[0].stop - 1]
        if sizes[i] >= total * 0.04 and box[3] - box[1] >= gh * 0.25:
            big.append(box)
        elif sizes[i] >= 3:
            small.append(box)
    for c in small:
        best, score = None, -1e9
        for b in big:
            ov = min(b[2], c[2]) - max(b[0], c[0])
            sc = ov if ov >= 0 else -min(abs(b[0] - c[2]), abs(c[0] - b[2])) * 4
            if sc > score:
                best, score = b, sc
        if best is not None and score > -gw * 0.05 * 4:
            best[0], best[1], best[2], best[3] = min(best[0], c[0]), min(best[1], c[1]), max(best[2], c[2]), max(best[3], c[3])
    big.sort(key=lambda b: b[0])
    return [(max(0, b[0] * k - k), max(0, b[1] * k - k), min(w, (b[2] + 2) * k), min(h, (b[3] + 2) * k)) for b in big]


def column_boxes(mask, n=5):
    h, w = mask.shape
    prof = mask.sum(0).astype(np.float64)
    cuts = [0]
    for k in range(1, n):
        t = round(w * k / n)
        r = round(w / n / 2.6)
        lo, hi = max(1, t - r), min(w - 1, t + r)
        cuts.append(lo + int(np.argmin(prof[lo:hi])))
    cuts.append(w)
    out = []
    for k in range(n):
        sub = mask[:, cuts[k]:cuts[k + 1]]
        ys, xs = np.nonzero(sub)
        if len(xs):
            out.append((cuts[k] + xs.min(), ys.min(), cuts[k] + xs.max() + 1, ys.max() + 1))
    return out


def sheet_boxes(mask):
    h, w = mask.shape
    b = pose_boxes(mask)
    if len(b) >= 5 or w / h < 1.3:
        return b
    c = column_boxes(mask, 5)
    return c if len(c) == 5 else b


def _tight(mask, x0, x1, y0, y1):
    ys, xs = np.nonzero(mask[y0:y1, x0:x1])
    if not len(xs):
        return None
    return (x0 + int(xs.min()), y0 + int(ys.min()), x0 + int(xs.max()) + 1, y0 + int(ys.max()) + 1)


def _smooth(a, r):
    k = np.ones(2 * r + 1)
    s = np.convolve(a, k, 'same')
    n = np.convolve(np.ones_like(a), k, 'same')
    return s / n


def gallery_boxes(mask):
    """Les figures d'une GALERIE (portage de galleryBoxes de l'app) : rangées séparées par les bandes vides, puis chaque
    rangée coupée aux creux de son profil de colonnes (là où seul un bras traverse), dans l'ordre de lecture."""
    h, w = mask.shape
    rowP = mask.sum(1)
    bands, start = [], -1
    for y in range(h + 1):
        full = y < h and rowP[y] > w * 0.004
        if full and start < 0:
            start = y
        if not full and start >= 0:
            if y - start > h * 0.12:
                bands.append([start, y])
            elif bands and start - bands[-1][1] < h * 0.02:
                bands[-1][1] = y
            start = -1
    out = []
    for ya, yb in bands:
        col = mask[ya:yb].sum(0).astype(np.float64)
        c = _smooth(col, max(1, round(w * 0.004)))
        gap = max(4, round((yb - ya) * 0.12))
        cuts = [0]
        for x in range(gap, w - gap):
            win = c[x - gap:x + gap + 1]
            if win.min() < c[x] or np.any(win[:gap] == c[x]):
                continue
            peakL = c[max(0, x - gap * 3):x].max()
            peakR = c[x + 1:min(w, x + gap * 3 + 1)].max()
            if c[x] < 0.45 * min(peakL, peakR):
                cuts.append(x)
        cuts.append(w)
        row = [b for b in (_tight(mask, cuts[k], cuts[k + 1], ya, yb) for k in range(len(cuts) - 1)) if b]
        ws = sorted(b[2] - b[0] for b in row)
        medW = ws[len(ws) // 2] if ws else 0
        split = []
        for b in row:
            bw = b[2] - b[0]
            if len(row) < 3 or bw < medW * 1.65:
                split.append(b)
                continue
            lo, hi = b[0] + round(bw * 0.3), b[0] + round(bw * 0.7)
            at = lo + int(np.argmin(c[lo:hi]))
            split += [p for p in (_tight(mask, b[0], at, ya, yb), _tight(mask, at, b[2], ya, yb)) if p]
        hs = sorted(b[3] - b[1] for b in split)
        med = hs[len(hs) // 2] if hs else 0
        out += [b for b in split if b[3] - b[1] > med * 0.45 and b[2] - b[0] > 6]
    return out


def reading_order(boxes, h):
    rows = []
    for b in sorted(boxes, key=lambda b: (b[1] + b[3]) / 2):
        cy = (b[1] + b[3]) / 2
        row = next((r for r in rows if abs((r[0][1] + r[0][3]) / 2 - cy) < h * 0.2), None)
        if row is not None:
            row.append(b)
        else:
            rows.append([b])
    return [b for r in rows for b in sorted(r, key=lambda b: b[0])]


def isolate_figure(rgba):
    """Les morceaux d'une pose VOISINE qui traversent la découpe (une main qui pointe) deviennent transparents."""
    solid = rgba[..., 3] >= 128
    lab, n = ndimage.label(solid, structure=np.ones((3, 3)))
    if n < 2:
        return rgba
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    big = sizes.max()
    h, w = solid.shape
    edge_ids = set(np.unique(np.concatenate([lab[:, 0], lab[:, w - 1]]))) - {0}
    for i in range(1, n + 1):
        if sizes[i - 1] < big and i in edge_ids and sizes[i - 1] < big * 0.15:
            rgba[lab == i, 3] = 0
    return rgba


BONES = [(0, 11), (0, 12), (11, 12), (11, 23), (12, 24), (23, 24), (11, 13), (13, 15), (12, 14), (14, 16), (23, 25), (25, 27), (24, 26), (26, 28)]
# Pieds et mains : estimés moins sûrement sur un dessin — servent seulement à attribuer au VOISIN sa chaussure, sa main.
EXTREMITIES = [(27, 29), (29, 31), (27, 31), (28, 30), (30, 32), (28, 32), (15, 17), (15, 19), (15, 21), (16, 18), (16, 20), (16, 22)]


def _seed_lines(seed, pts, dx, dy, val, vis=0.3, bones=BONES):
    h, w = seed.shape
    P = lambda i: (pts[3 * i] - dx, pts[3 * i + 1] - dy, pts[3 * i + 2])
    for a, b in bones:
        xa, ya, va = P(a)
        xb, yb, vb = P(b)
        if va < vis or vb < vis:
            continue
        n = int(max(abs(xb - xa), abs(yb - ya))) + 1
        for t in np.linspace(0, 1, n + 1):
            x, y = int(round(xa + (xb - xa) * t)), int(round(ya + (yb - ya) * t))
            if 0 <= x < w and 0 <= y < h:
                seed[max(0, y - 1):y + 2, max(0, x - 1):x + 2] = val


def split_by_skeletons(rgba, own, others, dx, dy):
    """GALERIE : chaque pixel de la découpe revient au squelette le plus proche EN SUIVANT la silhouette (distance
    géodésique) — le ballon et la main du voisin collés au sac partent avec le voisin, le corps reste entier."""
    from collections import deque
    solid = rgba[..., 3] >= 64
    h, w = solid.shape
    seed = np.zeros((h, w), np.int8)
    for o in others:
        _seed_lines(seed, o, dx, dy, 2, bones=BONES + EXTREMITIES)
    _seed_lines(seed, own, dx, dy, 1)
    seed[~solid] = 0
    if not (seed == 2).any() or not (seed == 1).any():
        return rgba
    owner = seed.ravel().astype(np.int8).copy()
    flat = solid.ravel()
    q = deque(np.flatnonzero(owner))
    while q:
        i = q.popleft()
        y, x = divmod(i, w)
        o = owner[i]
        for j in (i - 1 if x > 0 else -1, i + 1 if x < w - 1 else -1, i - w if y > 0 else -1, i + w if y < h - 1 else -1):
            if j >= 0 and flat[j] and owner[j] == 0:
                owner[j] = o
                q.append(j)
    gone = owner.reshape(h, w) == 2
    rgba[gone, 3] = 0
    rgba[gone, :3] = 0
    return rgba


def drop_neighbours(rgba, nose=None, wrists=(), r=4):
    """GALERIE : les figures se touchent (un ballon contre un sac, une chaussure contre un pied). Ce qui ne tient à la
    figure que par un pont fin (moins de 2r px) et touche le bord gauche/droit de la découpe vient du voisin : retiré.
    Le corps (composante qui porte le nez) et les objets tenus (près des poignets mesurés) restent."""
    solid = rgba[..., 3] >= 128
    h, w = solid.shape
    er = ndimage.binary_erosion(solid, iterations=r)
    lab, n = ndimage.label(er, structure=np.ones((3, 3)))
    if not n:
        return rgba
    sizes = ndimage.sum(er, lab, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    if nose is not None:
        nx, ny = int(round(nose[0])), int(round(nose[1]))
        if 0 <= ny < h and 0 <= nx < w and lab[ny, nx]:
            main = int(lab[ny, nx])
    core = ndimage.binary_dilation(lab == main, iterations=r + 2) & solid
    rest = solid & ~core
    lab2, n2 = ndimage.label(rest, structure=np.ones((3, 3)))
    if not n2:
        return rgba
    band = max(2, w // 40)
    edge_ids = set(np.unique(np.concatenate([lab2[:, :band].ravel(), lab2[:, w - band:].ravel()]))) - {0}
    held = set()
    for wx, wy in wrists:
        x0, x1, y0, y1 = max(0, int(wx - 14)), min(w, int(wx + 15)), max(0, int(wy - 14)), min(h, int(wy + 15))
        held |= set(np.unique(lab2[y0:y1, x0:x1])) - {0}
    total = solid.sum()
    sizes2 = ndimage.sum(rest, lab2, range(1, n2 + 1))
    for i in edge_ids - held:
        if sizes2[i - 1] < total * 0.15:
            rgba[lab2 == i, 3] = 0
    rgba[rgba[..., 3] == 0, :3] = 0
    return rgba


def face_of(pts, dx, dy):
    at = {}
    for i, k in enumerate(FACE_IDX):
        if 2 * i + 1 < len(pts):
            at[k] = (pts[2 * i] - dx, pts[2 * i + 1] - dy)
    need = [61, 291, 13, 14, 0, 17, 152, 1]
    if not all(k in at for k in need):
        return None

    def ellipse(ids, iris):
        p = np.array([at[k] for k in ids if k in at])
        if len(p) < 6:
            return None
        c = p.mean(0)
        rx = (p[:, 0].max() - p[:, 0].min()) / 2
        ry = (p[:, 1].max() - p[:, 1].min()) / 2
        ir = [at[k] for k in iris if k in at]
        return {'c': [float(c[0]), float(c[1])], 'rx': float(rx), 'ry': float(ry), 'top': float(p[:, 1].min()), 'iris': [float(v) for v in np.mean(ir, 0)] if ir else None}

    L, R, it, ib = at[61], at[291], at[13], at[14]
    mw = float(np.hypot(R[0] - L[0], R[1] - L[1]))
    return {
        'mouthL': list(L), 'mouthR': list(R), 'seam': [(it[0] + ib[0]) / 2, (it[1] + ib[1]) / 2], 'top': list(at[0]), 'bottom': list(at[17]),
        'chin': list(at[152]), 'nose': list(at[1]), 'cheekL': list(at.get(234, L)), 'cheekR': list(at.get(454, R)),
        'mouthWidth': mw, 'open': max(0.0, ib[1] - it[1]) / max(1.0, mw),
        'eyes': [e for e in (ellipse(EYE_A, [468, 469, 470, 471, 472]), ellipse(EYE_B, [473, 474, 475, 476, 477])) if e],
    }


def body_of(pts, dx, dy):
    if not pts or len(pts) < 99:
        return None
    p = lambda i: [pts[3 * i] - dx, pts[3 * i + 1] - dy, pts[3 * i + 2]]
    return {'nose': p(0), 'shL': p(11), 'shR': p(12), 'elL': p(13), 'elR': p(14), 'wrL': p(15), 'wrR': p(16), 'hipL': p(23), 'hipR': p(24), 'knL': p(25), 'knR': p(26), 'anL': p(27), 'anR': p(28)}


def sample(img, x, y, r=3):
    h, w = img.shape[:2]
    x0, x1, y0, y1 = max(0, int(x - r)), min(w, int(x + r + 1)), max(0, int(y - r)), min(h, int(y + r + 1))
    patch = img[y0:y1, x0:x1]
    m = patch[..., 3] > 200
    return [int(v) for v in (patch[m][:, :3].mean(0) if m.any() else [80, 50, 40])]


def cut_sheet(path, faces, bodies, out_dir, slug, gallery=False):
    """Une planche (un personnage, 5 poses) ou une GALERIE (un personnage par figure, pose neutre, ordre de lecture)."""
    im = np.array(Image.open(path).convert('RGB'))
    mask = ~is_green(im[..., 0].astype(np.float32), im[..., 1].astype(np.float32), im[..., 2].astype(np.float32))
    mask = ndimage.binary_opening(mask, iterations=1)
    if gallery:
        a, b = gallery_boxes(mask), reading_order(pose_boxes(mask), mask.shape[0])
        boxes = a if len(a) >= len(b) else b
    else:
        boxes = sheet_boxes(mask)
    poses = []
    H, W = mask.shape
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        f = next((fc for fc in faces if fc.get('pts') and len(fc['pts']) > 3 and x0 <= fc['pts'][2] < x1 and y0 <= fc['pts'][3] < y1), None)
        b = next((bd for bd in bodies if bd.get('pts') and len(bd['pts']) > 38 and x0 <= (bd['pts'][33] + bd['pts'][36]) / 2 < x1 and y0 <= (bd['pts'][34] + bd['pts'][37]) / 2 < y1), None)
        if gallery and b:
            # The split runs on a WIDER window that also holds the neighbours' bodies (their shoe, their clipboard
            # crossing the cut then go back to them), and the figure's box is cut out of it afterwards.
            m = (x1 - x0) // 2
            ex0, ex1, ey0, ey1 = max(0, x0 - m), min(W, x1 + m), max(0, y0 - 20), min(H, y1 + 20)
            wide = key_out(im[ey0:ey1, ex0:ex1])
            others = [bd['pts'] for bd in bodies if bd is not b and bd.get('pts') and len(bd['pts']) >= 99]
            wide = split_by_skeletons(wide, b['pts'], others, ex0, ey0)
            part = np.ascontiguousarray(wide[y0 - ey0:y1 - ey0, x0 - ex0:x1 - ex0])
        else:
            part = key_out(im[y0:y1, x0:x1])
        part = isolate_figure(part)
        if gallery:
            wr = [(b['pts'][3 * j] - x0, b['pts'][3 * j + 1] - y0) for j in (15, 16) if b and b['pts'][3 * j + 2] > 0.3] if b else []
            part = drop_neighbours(part, (f['pts'][2] - x0, f['pts'][3] - y0) if f else None, wr)
        ys, xs = np.nonzero(part[..., 3] > 8)
        if not len(xs):
            continue
        # Tight crop on the figure (a few pixels of margin), coordinates kept for the landmarks.
        tx0, ty0, tx1, ty1 = max(0, xs.min() - 4), max(0, ys.min() - 4), min(part.shape[1], xs.max() + 5), min(part.shape[0], ys.max() + 5)
        part = part[ty0:ty1, tx0:tx1]
        ox, oy = x0 + tx0, y0 + ty0
        face = face_of(f['pts'], ox, oy) if f else None
        if face:
            # Skin of the lids (just above each eye) and the inside of the drawn mouth: measured on the art.
            for e in face['eyes']:
                e['lid'] = sample(part, e['c'][0], e['top'] - max(2, e['ry'] * 0.9), 2)
            face['cavity'] = [58, 20, 18]
        name = f'{slug}-{i}.png'
        Image.fromarray(part, 'RGBA').save(os.path.join(out_dir, name))
        poses.append({'kind': 'neutre' if gallery else POSE_ORDER[i % 5], 'box': [int(ox), int(oy), int(ox + part.shape[1]), int(oy + part.shape[0])], 'png': name, 'w': int(part.shape[1]), 'h': int(part.shape[0]), 'face': face, 'body': body_of(b['pts'], ox, oy) if b else None})
    return poses


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--troupe', required=True, help='dossier du kit troupe (manifest.json + planches + hd/)')
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', default='', help='noms séparés par des virgules (défaut : toute la troupe)')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    man = json.load(open(os.path.join(a.troupe, 'manifest.json'), encoding='utf-8'))
    only = {x.strip().upper() for x in a.only.split(',') if x.strip()}
    cast = {}
    for p in man['planches']:
        if only and p['name'].upper() not in only:
            continue
        slug = p['file'].rsplit('.', 1)[0]
        poses = cut_sheet(os.path.join(a.troupe, p['file']), p.get('faces', []), p.get('bodies', []), a.out, slug)
        cast[p['name']] = {'slug': slug, 'poses': poses}
        rig = sum(1 for x in poses if x['face'])
        print(f"[cutout] {p['name']}: {len(poses)} poses, {rig} visages mesurés", flush=True)
    # Les GALERIES : un personnage par figure (pose neutre). Un personnage qui a déjà sa planche (5 poses) la garde ;
    # un nom déjà vu dans une galerie précédente garde sa première figure.
    # (GRAND-PÈRE NDIAYE ≠ BAYE NDIAYE, TANTIE AWA SARR ≠ TANTIE AWA : personnages distincts de l'univers.)
    alias = {}
    for gi, g in enumerate(man.get('galeries', [])):
        slug = g['file'].rsplit('.', 1)[0]
        figs = cut_sheet(os.path.join(a.troupe, g['file']), g.get('faces', []), g.get('bodies', []), a.out, slug, gallery=True)
        names = g.get('names', [])
        if len(figs) != len(names):
            print(f"[cutout] {g['file']}: {len(figs)} figures pour {len(names)} noms — noms appariés dans l'ordre de lecture", flush=True)
        added = 0
        for fig, name in zip(figs, names):
            key = alias.get(name.upper(), name.upper())
            if key in cast or (only and key not in only):
                os.remove(os.path.join(a.out, fig['png']))
                continue
            cast[key] = {'slug': f"{slug}-{len(cast)}", 'poses': [fig], 'source': g['file']}
            added += 1
        rig = sum(1 for f in figs if f['face'])
        print(f"[cutout] {g['file']}: {len(figs)} figures, {rig} visages mesurés, {added} nouveaux personnages", flush=True)
    print(f"[cutout] troupe : {len(cast)} personnages", flush=True)
    decors = {d['name']: {'image': os.path.abspath(os.path.join(a.troupe, d['hd'])), 'depth': os.path.abspath(os.path.join(a.troupe, d['depth'])), 'fit': d['fit'],
                          # scene parse (ADE20K labels) and walkable mask — the « sol praticable » law (ground.py)
                          **{k: os.path.abspath(os.path.join(a.troupe, d[k])) for k in ('seg', 'floor') if d.get(k)}}
              for d in man.get('decors', []) if d.get('hd')}
    json.dump({'cast': cast, 'decors': decors, 'dir': os.path.abspath(a.out)}, open(os.path.join(a.out, 'rig.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
    print(f"[cutout] rig → {os.path.join(a.out, 'rig.json')}")


if __name__ == '__main__':
    main()
