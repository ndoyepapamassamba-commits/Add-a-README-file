"""
SOL — où l'on peut poser les pieds, et les ombres qui s'y posent.

Un décor peint n'a pas toujours de sol : au marché, le bas de la peinture n'est que tomates, oignons et paniers ; au
salon, le canapé et la table basse. Poser un personnage « sur » ces pixels le fait tenir sur la marchandise. La loi :

  • ce que VOIT le spectateur sous des pieds visibles doit être un sol — sol peint (reconnu comme sol ET orienté comme
    un sol) ou avant-scène 3D construite par le moteur devant le décor quand la peinture n'en a pas ;
  • un figurant derrière un étal n'est jamais avancé jusqu'à l'étal : l'étal cache ses jambes (occlusion naturelle,
    comme les vendeuses peintes), à condition que sa tête reste visible ;
  • tout ce qui se tient sur le sol y porte une ombre de contact et une ombre portée dans la direction de la lumière
    du décor (mesurée sur les personnages peints : leur côté éclairé dit d'où vient le soleil).

Le sol peint est la FUSION de deux mesures : la segmentation de scène (UperNet ConvNeXt-small ADE20K, OpenMMLab,
licence MIT — classes sol, route, terre, sable, herbe, tapis…) et la géométrie du relief (la surface doit être tournée
vers le haut). Ni l'une ni l'autre seule ne suffit : la géométrie prend le dessus d'un tas de fruits ou d'une table pour
un sol, la segmentation peut appeler « sol » un mur peint en perspective.
"""
import math

import numpy as np

# ADE20K (150 classes) — what can be walked on.
WALKABLE = {3: 'floor', 6: 'road', 9: 'grass', 11: 'sidewalk', 13: 'earth', 28: 'rug', 29: 'field', 46: 'sand', 52: 'path',
            54: 'runway', 91: 'dirt track', 94: 'land', 101: 'stage'}
PERSON = 12
FOOT_MARGIN = 0.08   # m — a relief nearer than the feet by more than this hides them
UP = 0.45            # |normal.z| above which a relief cell faces up (a floor seen in perspective, not a wall)


def mirror_sample(img, gx, gz):
    """Sample a picture-space map (H×W) on the decor grid coordinates, mirrored outside the painting like the relief."""
    img = np.asarray(img)
    mir = lambda g: np.abs(((g + 1) % 2) - 1)
    ys = np.clip((mir(gz) * (img.shape[0] - 1)).astype(int), 0, img.shape[0] - 1)
    xs = np.clip((mir(gx) * (img.shape[1] - 1)).astype(int), 0, img.shape[1] - 1)
    return img[np.ix_(ys, xs)]


def relief_points(g):
    """3D points of the relief on the full grid (same maths as scene.build_decor)."""
    dn = np.asarray(g['dn'])
    NZ, NX = dn.shape[0] - 1, dn.shape[1] - 1
    gx = np.linspace(-g['EX'], 1 + g['EX'], NX + 1)
    gz = np.linspace(-g['EZ'], 1 + g['EZ'], NZ + 1)
    GX, GZ = np.meshgrid(gx, gz)
    C0 = np.array(g['C0'], dtype=float)
    P0 = np.stack([g['x0'] + GX * g['Wm'], np.full_like(GX, g['Yp']), g['ztop'] - GZ * g['mH']], -1)
    k = ((g['Yp'] + (1 - dn) * g['DEPTH']) - C0[1]) / (g['Yp'] - C0[1])
    return C0 + (P0 - C0) * k[..., None]


def floor_grid(g, walk):
    """Fused painted floor on the decor grid: walkable by the scene parser AND facing up in the relief AND below the
    painting's eye line. `walk` = the parser's walkable mask (picture space, any size; >0.5 = walkable)."""
    dn = np.asarray(g['dn'])
    NZ, NX = dn.shape[0] - 1, dn.shape[1] - 1
    gx = np.linspace(-g['EX'], 1 + g['EX'], NX + 1)
    gz = np.linspace(-g['EZ'], 1 + g['EZ'], NZ + 1)
    sem = mirror_sample(np.asarray(walk, dtype=float), gx, gz) > 0.5
    V = relief_points(g)
    du = np.gradient(V, axis=1)
    dv = np.gradient(V, axis=0)
    n = np.cross(du, dv)
    n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-12
    up = np.abs(n[..., 2]) > UP
    low = V[..., 2] < g['C0'][2]
    return sem & up & low, {'semantique': float(sem.mean()), 'geometrie': float(up.mean()), 'fusion': float((sem & up & low).mean())}


def cell(g, x, y, z):
    """Grid cell (j, i) of the painting point seen from the painting's viewpoint C0 through (x, y, z), and the painting
    coordinates (u, v) — 0..1 inside the painting."""
    C0 = g['C0']
    k = (g['Yp'] - C0[1]) / (y - C0[1])
    xp, zp = C0[0] + (x - C0[0]) * k, C0[2] + (z - C0[2]) * k
    u = (xp - g['x0']) / g['Wm']
    v = (g['ztop'] - zp) / g['mH']
    dn = np.asarray(g['dn'])
    NX, NZ = dn.shape[1] - 1, dn.shape[0] - 1
    i = int(round((u + g['EX']) / (1 + 2 * g['EX']) * NX))
    j = int(round((v + g['EZ']) / (1 + 2 * g['EZ']) * NZ))
    return max(0, min(NZ, j)), max(0, min(NX, i)), u, v


def relief_y(g, j, i):
    return g['Yp'] + (1 - float(np.asarray(g['dn'])[j, i])) * g['DEPTH']


def stance(g, x, y, height, stage=None, margin=FOOT_MARGIN):
    """Where the feet of someone standing at (x, y) are, as the spectator sees them:
      'avant-scene' — on the 3D floor the engine built in front of the painting;
      'sol-peint'   — on painted floor (fused mask) at the right depth;
      'cache'       — hidden behind something painted nearer (a stall, a sofa): natural occlusion;
      'vide'        — seen over something that is not a floor (standing on the produce, on a table…).
    Also whether the HEAD is visible (not swallowed by the painted relief)."""
    j, i, u, v = cell(g, x, y, 0.0)
    jh, ih, _, _ = cell(g, x, y, 0.93 * height)
    head = relief_y(g, jh, ih) >= y - margin
    ys = relief_y(g, j, i)
    if stage and y <= stage['y1'] and (stage['x0'] <= x <= stage['x1']):
        return {'pieds': 'avant-scene', 'tete': head, 'u': u, 'v': v}
    if ys < y - margin:
        return {'pieds': 'cache', 'tete': head, 'u': u, 'v': v}
    fl = g.get('fl')
    on_floor = fl is not None and bool(np.asarray(fl)[j, i]) and 0 <= u <= 1 and 0 <= v <= 1
    return {'pieds': 'sol-peint' if on_floor else 'vide', 'tete': head, 'u': u, 'v': v}


def legal(st, animal=False):
    """The stance law: feet on a floor, or hidden behind something with the head in view (a person). An animal must be
    seen on a floor (a hen hidden behind a stall is nothing; a hen on the tomatoes is wrong)."""
    if animal:
        return st['pieds'] in ('avant-scene', 'sol-peint')
    return st['pieds'] in ('avant-scene', 'sol-peint') or (st['pieds'] == 'cache' and st['tete'])


def feet_zone(g, xs, y=0.0):
    """Share of the actors' feet zone (screen points of (x, y, 0) for x in xs) that the painting shows as floor —
    when it is not (nearly) all floor, the engine builds the 3D forestage (« avant-scène »)."""
    fl = g.get('fl')
    if fl is None:
        return 0.0
    ok = 0
    for x in xs:
        j, i, u, v = cell(g, x, y, 0.0)
        ok += bool(np.asarray(fl)[j, i]) and 0 <= u <= 1 and 0 <= v <= 1
    return ok / max(1, len(xs))


# ── lumière et ombres ───────────────────────────────────────────────────────────────────────────────────────────────
def light_direction(rgb, labels, min_px=600):
    """Where the light of the painting comes from, measured on its painted PEOPLE (ADE20K 'person'): each figure (a
    connected blob) is cut into its left and right thirds row by row; the lit third faces the sun. Returns (sign,
    strength, figures): sign +1 = light from the right of the picture, -1 = from the left; strength 0..1 = how
    lateral and how consistent across figures (0 = frontal or overcast light: soft shadows straight behind)."""
    import cv2
    rgb = np.asarray(rgb, dtype=float)
    if rgb.max() > 1.5:
        rgb = rgb / 255.0
    lab = np.asarray(labels)
    H, W = lab.shape
    small = cv2.resize(rgb[..., :3].astype(np.float32), (W, H), interpolation=cv2.INTER_AREA)
    lum = small @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    person = (lab == PERSON).astype(np.uint8)
    n, comp, stats, _ = cv2.connectedComponentsWithStats(person, 8)
    diffs, weights = [], []
    for k in range(1, n):
        x, y, w, h, area = stats[k]
        if area < min_px * (H * W) / (512 * 248) or w < 6:
            continue
        m = comp[y:y + h, x:x + w] == k
        L = lum[y:y + h, x:x + w]
        d_rows = []
        for r in range(h):
            cols = np.nonzero(m[r])[0]
            if len(cols) < 6:
                continue
            third = max(2, len(cols) // 3)
            d_rows.append(float(L[r, cols[-third:]].mean() - L[r, cols[:third]].mean()))
        if len(d_rows) >= 5:
            diffs.append(float(np.median(d_rows)))
            weights.append(float(area))
    if not diffs:
        return 0, 0.0, 0
    d = float(np.average(diffs, weights=weights))
    agree = float(np.average(np.sign(diffs) == np.sign(d), weights=weights))
    strength = min(1.0, abs(d) / 0.06) * max(0.0, 2 * agree - 1)
    return (1 if d > 0 else -1), round(strength, 3), len(diffs)


def shadow_vector(sign, strength, elevation_deg=55.0, back=0.6):
    """Ground direction of a cast shadow per metre of height: away from the light, a little toward the back of the set
    (a sun in front of the painted people, high in the tropical sky). Returns (dx, dy) per metre of height."""
    L = 1.0 / math.tan(math.radians(elevation_deg))
    side = -sign * strength
    nb = math.hypot(side, back) or 1.0
    return L * side / nb, L * back / nb


def shadow_quad(x0, x1, z0, z1, y, vec):
    """A drawn card's silhouette (its quad x0..x1 × z0..z1 standing at depth y) laid on the floor along the light
    vector: the planar projection of a standing figure — feet stay at the feet, the head lands `height × vec` away."""
    dx, dy = vec
    pts = []
    for x, z in ((x0, z0), (x1, z0), (x1, z1), (x0, z1)):
        h = max(0.0, z)
        pts.append((x + h * dx, y + h * dy, 0.003 + 0.0005 * h))
    return pts


def scene_light(rgb, labels, min_figures=3, min_strength=0.3):
    """The light of a painted set, decided only on evidence: lateral when at least `min_figures` painted people agree on
    the lit side, else frontal (a studio key light from the camera side — soft shadows straight behind)."""
    sign, strength, n = light_direction(rgb, labels)
    if n >= min_figures and strength >= min_strength:
        return {'mode': 'laterale', 'sign': sign, 'strength': strength, 'figures': n}
    return {'mode': 'frontale', 'sign': 0, 'strength': 0.0, 'figures': n}


# Floor of the forestage per kind of place: base colour (sRGB 0..255), two noise amplitudes (fine, broad), pattern.
FLOOR_KINDS = {
    'terre': {'rgb': (196, 128, 82), 'fine': 0.16, 'broad': 0.12, 'motif': None},        # beaten laterite (market, yard)
    'sable': {'rgb': (232, 204, 156), 'fine': 0.10, 'broad': 0.08, 'motif': None},
    'beton': {'rgb': (166, 158, 148), 'fine': 0.08, 'broad': 0.07, 'motif': None},
    'bitume': {'rgb': (78, 76, 80), 'fine': 0.10, 'broad': 0.05, 'motif': None},
    'carrelage': {'rgb': (206, 196, 180), 'fine': 0.05, 'broad': 0.04, 'motif': 'carreaux'},
    'parquet': {'rgb': (150, 100, 62), 'fine': 0.07, 'broad': 0.05, 'motif': 'lames'},
}
_KIND_BY_PLACE = (
    (r'plage|mer|sable', 'sable'),
    (r'taxi|route|rue|douane|gare|parking|ville|plateau', 'bitume'),
    (r'tribunal', 'parquet'),
    (r'salon|hopital|clinique|bureau|banque|coiffure|chambre|maison|ecole|classe|aeroport|centre', 'carrelage'),
    (r'maquis|garage|atelier', 'beton'),
    (r'marche|village|cour|parc|nature|brousse', 'terre'),
)


def floor_kind(place):
    import re
    import unicodedata
    p = ''.join(c for c in unicodedata.normalize('NFD', str(place or '').lower()) if unicodedata.category(c) != 'Mn')
    for pat, kind in _KIND_BY_PLACE:
        if re.search(pat, p):
            return kind
    return 'terre'


def floor_colour(kind, rgb, walk=None):
    """The forestage colour: the painted floor's own colour when the painting shows some (median of its walkable
    pixels), else the kind's colour brought to the painting's light level (the luminance of its lower third)."""
    rgb = np.asarray(rgb, dtype=float)
    if rgb.max() > 1.5:
        rgb = rgb / 255.0
    if walk is not None:
        w = np.asarray(walk, dtype=float)
        if w.shape != rgb.shape[:2]:
            yy = (np.arange(rgb.shape[0]) * w.shape[0] / rgb.shape[0]).astype(int)
            xx = (np.arange(rgb.shape[1]) * w.shape[1] / rgb.shape[1]).astype(int)
            w = w[np.ix_(yy, xx)]
        sel = w > 0.5
        if sel.mean() > 0.01:
            return tuple(float(v) for v in np.median(rgb[sel][:, :3], axis=0)), 'peint'
    base = np.array(FLOOR_KINDS[kind]['rgb'], dtype=float) / 255
    lum = lambda c: float(np.asarray(c)[..., :3] @ np.array([0.2126, 0.7152, 0.0722]))
    # The level of the painting's LIGHT (its lit half, not the shade under the stalls): a sunny market gives a bright
    # ground, a night maquis a dark one. The troupe's art is warm and saturated: the kind keeps its colour.
    L = rgb[..., :3].reshape(-1, 3) @ np.array([0.2126, 0.7152, 0.0722])
    target = 0.82 * float(np.percentile(L, 60))
    k = min(1.3, max(0.85, target / max(1e-3, lum(base))))
    return tuple(float(min(1.0, v * k)) for v in base), 'type'


def horizon_fit(labels, walk, eye=1.6, feet=0.95, min_blob=0.0004):
    """The metric scale of a real photo used as a set (the engine's `fit`), from the HORIZON of a level camera held at
    eye height: on the ground plane, one pixel at row y measures eye / (y - y_horizon) metres — whatever the lens. The
    horizon is read from the painted people (standing adults' heads line up on the horizon of an eye-level photo, the
    classic perspective rule) — separate figures, or the head line of a dense crowd —, else from the far end of the
    walkable floor (a lower bound of the horizon). The actors stand at row `feet` (share of the height).
    Returns {'mH', 'floor', 'cx', 'horizon', 'methode'}."""
    lab = np.asarray(labels)
    H, W = lab.shape[:2]
    person = lab == PERSON
    tops = []
    if person.any():
        try:
            import cv2
            n, cc, st, _ = cv2.connectedComponentsWithStats(person.astype(np.uint8), 8)
            for k in range(1, n):
                x, y, w, h, area = st[k]
                # a whole standing figure (taller than wide, not cut by the top of the frame)
                if area >= min_blob * H * W and h > 1.4 * w and y > 0:
                    tops.append(y)
        except ImportError:
            pass
    # A dense crowd parses as one blob (no separate figures): its HEAD LINE — the top of the people, column by column —
    # lies on the horizon all the same (every standing adult's head is at eye level, near or far).
    cols = np.nonzero(person.any(0))[0] if person.any() else np.array([], int)
    if len(tops) >= 2:
        y_h, how = float(np.median(tops)) + 0.02 * H, f'têtes de {len(tops)} passants'  # heads ~10 cm above the eye
    elif person.mean() >= 0.03 and len(cols) >= 0.2 * W:
        y_h, how = float(np.median(person[:, cols].argmax(0))) + 0.02 * H, 'ligne des têtes de la foule'
    else:
        wk = np.asarray(walk) > 0
        rows = np.nonzero(wk.mean(1) > 0.05)[0]
        y_h, how = (float(rows.min()) if len(rows) else 0.45 * H), 'bout du sol praticable'
    y_f = feet * H
    y_h = min(y_h, y_f - 0.15 * H)  # at least 15 % of the height between horizon and feet
    mH = float(np.clip(eye * H / max(1.0, y_f - y_h), 2.0, 8.0))
    return {'mH': round(mH, 2), 'floor': round(feet, 3), 'cx': 0.5, 'horizon': round(y_h / H, 3), 'methode': how}
