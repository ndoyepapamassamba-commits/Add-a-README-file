# ENTITÉS VIVANTES DU DÉCOR (17/10/2026) — « l'animation de l'arrière-plan » : des poules dans la cour et sous les tables
# du maquis, qui picorent, marchent, s'arrêtent et repartent, chacune à son rythme (aucune boucle visible). Corps non
# humains de la troupe : découpe de la poule déjà reprise dans le style de la troupe (photo CC0 de l'USDA, détourage
# BiRefNet MIT, style LCM MIT : ~/.cache/massamba-assets/poule), animée en marionnette (pivot aux pattes).
#   prepare(d, img, acteurs) → <scène>/entites.json (trajets choisis sur le sol LIBRE, échelle de la perspective des acteurs)
#   etat(E, t) → pose de chaque entité à l'instant t ; dessine(can, poses, plus_loin_que=None) → incruste avec ombre de contact
import json, math, os
import numpy as np, cv2

ASSET = os.path.expanduser(os.environ.get('MASSAMBA_ASSETS', '~/.cache/massamba-assets')) + '/poule/asset.png'
PIVOT = (343, 482)        # pattes de la découpe (pixels de l'asset)
HAUTEUR_M = 0.35          # poule adulte ; la troupe est mise à l'échelle sur les acteurs debout (1,6 m)
_SPRITE = None


def _sprite():
    global _SPRITE
    if _SPRITE is None:
        im = cv2.imread(ASSET, cv2.IMREAD_UNCHANGED)
        if im is None: return None
        _SPRITE = (cv2.cvtColor(im[..., :3], cv2.COLOR_BGR2RGB).astype(np.float32), im[..., 3].astype(np.float32) / 255)
    return _SPRITE


def prepare(d, H, W, acteurs, n=2, graine=7):
    """trajets des entités sur le sol libre (hors des acteurs), échelle tirée des acteurs debout. acteurs : [(bbox, debout)]."""
    f = f'{d}/entites.json'
    if os.path.isfile(f): return json.load(open(f))
    if _sprite() is None: return []
    deb = [b for b, debout in acteurs if debout] or [b for b, _ in acteurs]
    if not deb: return []
    pieds = float(np.median([b[3] for b in deb])); haut_px = float(np.median([b[3] - b[1] for b in deb]))
    px_m = haut_px / 1.6; horizon = pieds - 2.2 * haut_px   # perspective simple : la taille décroît vers l'horizon
    occupe = np.zeros(W, bool)
    for b, _ in acteurs: occupe[max(0, int(b[0]) - 30):min(W, int(b[2]) + 30)] = True
    zones, x = [], 0
    while x < W:   # bandes horizontales libres d'acteurs
        if not occupe[x]:
            x0 = x
            while x < W and not occupe[x]: x += 1
            if x - x0 > 0.1 * W: zones.append((x0, x))
        x += 1
    rng = np.random.default_rng(graine); E = []
    zones = sorted(zones, key=lambda z: -(z[1] - z[0]))
    places = [(z, 'devant') for z in zones] + [(z, 'fond') for z in zones]   # puis au fond (plus petite, derrière les acteurs)
    for k, ((x0, x1), ou) in enumerate(places[:n]):
        y = min(H - 12.0, pieds + 0.03 * H) if ou == 'devant' else pieds - 0.14 * H   # au sol : devant la ligne des pieds, ou au fond
        ech = HAUTEUR_M * px_m * (y - horizon) / (pieds - horizon) / (PIVOT[1] - 18)
        E.append({'espece': 'poule', 'x0': float(x0 + 0.15 * (x1 - x0)), 'x1': float(x1 - 0.15 * (x1 - x0)), 'y': float(y),
                  'echelle': float(ech), 'graine': int(rng.integers(1, 10 ** 6))})
    json.dump(E, open(f, 'w'), indent=1)
    return E


def _programme(e, duree=120.0):
    """suite d'actions (marche, picore, regarde) tirée une fois pour toutes : chaque poule a son rythme, sans boucle."""
    rng = np.random.default_rng(e['graine']); t, x, sens, P = 0.0, rng.uniform(e['x0'], e['x1']), rng.choice([-1, 1]), []
    while t < duree:
        a = rng.choice(['marche', 'picore', 'regarde'], p=[0.4, 0.4, 0.2])
        if a == 'marche':
            d_ = rng.uniform(0.8, 2.2); v = rng.uniform(25, 45) * e['echelle'] * 3.0 * sens
            x1 = float(np.clip(x + v * d_, e['x0'], e['x1'])); P.append(('marche', t, t + d_, x, x1, sens)); x = x1
            if x in (e['x0'], e['x1']) or rng.random() < 0.3: sens = -sens
        elif a == 'picore':
            d_ = rng.uniform(0.9, 2.4); P.append(('picore', t, t + d_, x, x, sens))
        else:
            d_ = rng.uniform(0.6, 1.5); P.append(('regarde', t, t + d_, x, x, sens))
        t += d_
    return P


def etat(E, t):
    poses = []
    for e in E:
        if '_P' not in e: e['_P'] = _programme(e)
        a, t0, t1, xa, xb, sens = next((p for p in e['_P'] if p[1] <= t < p[2]), e['_P'][-1])
        u = (t - t0) / max(1e-3, t1 - t0); x = xa + (xb - xa) * (u * u * (3 - 2 * u)); dy = 0.0; ang = 0.0
        if a == 'marche':
            ph = 2 * math.pi * 4.2 * (t - t0); dy = -abs(math.sin(ph)) * 0.04; ang = 3.0 * math.sin(ph)   # sautillement
        elif a == 'picore':
            k = ((t - t0) * 2.6) % 1.0; ang = 26.0 * (math.sin(math.pi * min(1.0, k / 0.35)) if k < 0.35 else 0.0)   # coups de bec
        else:
            ang = -6.0 * math.sin(math.pi * u)   # relève la tête, regarde
        poses.append({'x': x, 'y': e['y'], 'echelle': e['echelle'], 'sens': sens, 'angle': ang, 'dy': dy})
    return poses


def dessine(can, poses, filtre=None):
    """incruste les entités (float32 RGB) avec une ombre de contact ; filtre(pose) → bool pour un ordre de profondeur."""
    sp = _sprite()
    if sp is None: return can
    rgb, al = sp; H, W = can.shape[:2]
    for p in poses:
        if filtre and not filtre(p): continue
        s = p['echelle']; h_ = (PIVOT[1] - 18) * s
        # ombre de contact (ellipse douce) multipliée sur le sol
        ow, oh = int(0.55 * 590 * s), max(2, int(0.12 * 590 * s)); cx, cy = int(p['x']), int(p['y'])
        if 0 < cx < W and 0 < cy < H:
            m = np.zeros((H, W), np.float32); cv2.ellipse(m, (cx, cy), (ow // 2, oh // 2), 0, 0, 360, 1.0, -1)
            m = cv2.GaussianBlur(m, (0, 0), max(1.0, oh / 2)); can *= (1 - 0.35 * m)[..., None]
        # marionnette : pivot aux pattes, inclinaison (bec vers le sol quand elle picore), sens de marche (miroir)
        a = math.radians(p['angle']) * (-1 if p['sens'] < 0 else 1)   # bec vers le sol, du côté où elle regarde (y vers le bas)
        sx = s * (1 if p['sens'] < 0 else -1)   # la découpe regarde à gauche ; sens > 0 = vers la droite → miroir
        Mx = np.float32([[sx * math.cos(a), -s * math.sin(a), 0], [sx * math.sin(a), s * math.cos(a), 0]])
        Mx[:, 2] = np.float32([p['x'], p['y'] + p['dy'] * h_]) - Mx[:, :2] @ np.float32(PIVOT)
        c_ = cv2.warpAffine(rgb, Mx, (W, H), flags=cv2.INTER_LINEAR, borderValue=0)
        a_ = cv2.warpAffine(al, Mx, (W, H), flags=cv2.INTER_LINEAR, borderValue=0)[..., None]
        can[:] = can * (1 - a_) + c_ * a_
    return can
