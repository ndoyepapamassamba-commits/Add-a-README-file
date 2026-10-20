# GESTES DESSINÉS — ANIMATION POSE À POSE (17/10/2026). Consignes : « Je compte sur l'animation. L'animation. » ;
# « je n'ai pas toute la troupe qui dispose de ces poses-là, donc tu dois généraliser ».
# Constat sur la v27 (8 images du plan de l'enfant, regardées une à une) : tête et bouche vivent, mais les bras restent
# pendants et identiques — la marionnette déforme le dessin, elle ne peut pas inventer un bras levé ni des mains sur les
# joues. Les studios animent POSE À POSE : des poses clés DESSINÉES, puis les intervalles. Ici :
#   · NIVEAU A — le personnage a une planche de poses (troupe_poses.py découpe et mesure n'importe quelle planche sur fond
#     vert : 33 points du corps par pose) : pendant sa réplique il prend la pose dessinée de son jeu (accuse/malice → doigt
#     pointé, choc/panique → mains aux joues, innocent/marchande/frime → haussement, rire → plié de rire), recalée sur
#     l'acteur du décor (pieds plantés au même endroit, même taille, échelle prise sur la pose neutre de la même planche),
#     couleurs ramenées à la lumière de la scène (Reinhard, Lab) ; la bouche continue de parler (mâchoire du moteur) ; à
#     la chute d'un autre, il se fige en CHOC dessiné.
#   · INTERVALLES : flux optique (DIS, OpenCV) dans les deux sens entre la pose rendue par le moteur et la pose d'arrivée,
#     ease-in-out, puis un petit rebond d'arrivée amorti (le poids du corps) : un geste, pas un fondu enchaîné.
#   · NIVEAU B — sans planche, ou personnage assis : la marionnette articulée (rig2d + gestes CMU) joue seule, comme avant.
#   · NIVEAU C (greffe en cours) : une planche des 5 poses fabriquée une fois pour un nouveau personnage (modèle d'image
#     libre), jugée par JEV (identité), puis découpée par troupe_poses.py → il passe au niveau A sans autre changement.
import json, math, os
import numpy as np, cv2

_ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.realpath(os.path.expanduser(os.environ.get('POSES_DIR', os.path.join(_ICI, '..', '..', 'workbench', '.private', 'troupe', 'poses'))))
ACTIF = os.environ.get('POSES_DESSINEES', '1') == '1'
CARTE = {'accuse': 'accuse', 'malice': 'accuse', 'choc': 'choc', 'panique': 'choc', 'innocent': 'haussement',
         'marchande': 'haussement', 'frime': 'haussement', 'rire': 'rire'}   # soupcon, camera : la pose de base suffit
ENTREE, SORTIE, CHOC_TENU = 0.24, 0.32, 1.5   # secondes : arrivée du geste, retour, choc tenu après la chute d'un autre


def _mid(P, a, b): return (P[a, :2] + P[b, :2]) / 2
PAIRES = [(1, 4), (2, 5), (3, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16), (17, 18), (19, 20), (21, 22), (23, 24),
          (25, 26), (27, 28), (29, 30), (31, 32)]
_JEV_CACHE = os.path.expanduser('~/.cache/massamba-models/poses-jev.json')


def texte_sur_costume(slug, bgra):
    """JEV dit une fois par personnage si son costume porte un texte, un numéro ou un logo : dans ce cas sa pose n'est
    jamais retournée en miroir (le « 10 » du maillot deviendrait « 01 »). Sans réponse de JEV : pas de miroir."""
    try: C = json.load(open(_JEV_CACHE))
    except Exception: C = {}
    if slug in C: return C[slug] > 0.5
    try:
        import uuid, jev_api
        a_ = bgra[..., 3:4].astype(np.float32) / 255; im = (bgra[..., :3] * a_ + 255 * (1 - a_)).astype(np.uint8)
        i = f'perso-{uuid.uuid4().hex[:8]}'
        r = jev_api.demande({'personnage': i}, {'texte': {'type': 'noul', 'instructions':
            'Does the character in `personnage` wear clothing with readable text, numbers, letters or a logo (something that '
            'would look wrong if the picture were mirrored left to right)?'}}, {i: {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(im)}},
            outil='poses_dessinees')
        C[slug] = round(float(r['texte']['noul']), 3); os.makedirs(os.path.dirname(_JEV_CACHE), exist_ok=True); json.dump(C, open(_JEV_CACHE, 'w'), indent=1)
        print(f'{slug} : texte sur le costume (JEV) {C[slug]}', flush=True); return C[slug] > 0.5
    except Exception as e:
        print(f'{slug} : JEV indisponible pour le miroir ({e}) — pas de miroir', flush=True); return True


def _miroir(V):
    bg = V['bgra'][:, ::-1].copy(); w = bg.shape[1]; P = V['pts'].copy(); P[:, 0] = w - P[:, 0]
    for a, b in PAIRES: P[[a, b]] = P[[b, a]]
    return dict(bgra=bg, pts=P)


def _sens(P):
    """+1 si la pose montre vers la droite de l'image, −1 vers la gauche, 0 sinon : poignet LEVÉ le plus écarté des
    épaules (un bras qui pend à l'écart du corps ne montre rien)."""
    ep = abs(P[11, 0] - P[12, 0]) + 1e-3; m = _mid(P, 11, 12); tl = float(np.linalg.norm(m - _mid(P, 23, 24))) + 1e-3
    meilleur, score = 0, 0.0
    for i in (15, 16):
        dx = P[i, 0] - m[0]; leve = float(np.clip(1 - (P[i, 1] - m[1]) / (0.8 * tl), 0, 1)); v = abs(dx) * leve
        if v > score: score, meilleur = v, int(np.sign(dx))
    return meilleur if score > 0.55 * ep else 0


def _hauteur(al):
    ys = np.nonzero(al.max(1) > 0.5)[0]; return (int(ys.min()), int(ys.max())) if len(ys) else None
def _doux(x): x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)


def bibliotheque(slug):
    """poses dessinées d'un personnage : {nom: {bgra, pts (33 × [x, y, visibilité] en pixels de la pose)}}."""
    f = os.path.join(RACINE, slug, 'poses.json')
    if not ACTIF or not os.path.isfile(f): return {}
    out = {}
    for p in json.load(open(f))['poses']:
        nom = p.get('nom_propose'); fi = os.path.join(RACINE, slug, p['fichier'])
        if not nom or nom in out or not os.path.isfile(fi): continue
        im = cv2.imread(fi, cv2.IMREAD_UNCHANGED)
        if im is None or im.ndim != 3 or im.shape[2] != 4: continue
        h, w = im.shape[:2]; b = p['body']
        out[nom] = dict(bgra=im, pts=np.array([[b[str(k)][0] * w, b[str(k)][1] * h, b[str(k)][2]] for k in range(33)], np.float32))
    return out


def _transfert(rgb, al, ref, ref_al):
    """couleurs de la pose (dessinée en studio) ramenées à la lumière de la scène : moyenne et écart-type Lab mesurés sur
    l'acteur du décor (Reinhard et al. 2001) ; luminosité à 70 %, teinte à 45 % (le costume garde ses couleurs)."""
    m1, m2 = al > 0.5, ref_al > 0.5
    if m1.sum() < 200 or m2.sum() < 200: return rgb
    a = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    b = cv2.cvtColor(np.clip(ref, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    mu1, sd1 = a[m1].mean(0), a[m1].std(0) + 1e-3; mu2, sd2 = b[m2].mean(0), b[m2].std(0) + 1e-3
    t = (a - mu1) / sd1 * sd2 + mu2; k = np.array([0.7, 0.45, 0.45], np.float32)
    return cv2.cvtColor(np.clip(a + k * (t - a), 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32)


def variantes(slug, pts_acteur, img, al_acteur, lmk=None, bouche=None):
    """les poses dessinées du personnage recalées dans l'image de la scène : {nom: {rgb, al, box, pts, lib, sens}} ;
    « nom~ » = la même pose retournée en miroir (seulement si le costume n'a ni texte ni logo, d'après JEV)."""
    B = bibliotheque(slug)
    if 'neutre' not in B: return {}
    Q = np.asarray(pts_acteur, np.float32); H, W = img.shape[:2]
    hq = _hauteur(al_acteur); hn = _hauteur(B['neutre']['bgra'][..., 3].astype(np.float32) / 255)
    if hq is None or hn is None: return {}
    entier = hq[1] < H - 3 and hq[0] > 2   # silhouette entière dans l'image : échelle tête-pieds ; sinon épaules-hanches
    s = (hq[1] - hq[0]) / max(1, hn[1] - hn[0]) if entier else \
        float(np.linalg.norm(_mid(Q, 11, 12) - _mid(Q, 23, 24))) / max(1.0, float(np.linalg.norm(_mid(B['neutre']['pts'], 11, 12) - _mid(B['neutre']['pts'], 23, 24))))
    ys, xs = np.nonzero(al_acteur > 0.5)
    if len(xs) < 200: return {}
    rx0, ry0, rx1, ry1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    ref, ref_al = img[ry0:ry1, rx0:rx1].astype(np.float32), al_acteur[ry0:ry1, rx0:rx1]
    miroir_ok = None; out = {}
    poses = [(n, V) for n, V in B.items() if n != 'neutre']
    for nom, V in list(poses):
        if _sens(V['pts']) != 0:
            if miroir_ok is None: miroir_ok = not texte_sur_costume(slug, B['neutre']['bgra'])
            if miroir_ok: poses.append((nom + '~', _miroir(V)))
    for nom, V in poses:
        P = V['pts']; hp = _hauteur(V['bgra'][..., 3].astype(np.float32) / 255)
        if hp is None: continue
        ax = _mid(Q, 23, 24)[0] - s * _mid(P, 23, 24)[0]
        ay = (hq[1] - s * hp[1]) if entier else (_mid(Q, 23, 24)[1] - s * _mid(P, 23, 24)[1])   # pieds au sol
        M = np.float32([[s, 0, ax], [0, s, ay]])
        h, w = V['bgra'].shape[:2]; C = np.float32([[0, 0], [w, 0], [0, h], [w, h]]) * s + M[:, 2]
        x0, y0 = [max(0, int(v) - 2) for v in C.min(0)]; x1, y1 = [int(v) + 2 for v in C.max(0)]; x1, y1 = min(W, x1), min(H, y1)
        if x1 - x0 < 20 or y1 - y0 < 20: continue
        Mb = M.copy(); Mb[:, 2] -= (x0, y0); fl = cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC
        bg = V['bgra'].astype(np.float32); a_ = bg[..., 3] / 255; pre = bg[..., 2::-1] * a_[..., None]   # RGB prémultiplié
        al = np.clip(cv2.warpAffine(a_, Mb, (x1 - x0, y1 - y0), flags=fl, borderValue=0), 0, 1)
        rgb = cv2.warpAffine(pre, Mb, (x1 - x0, y1 - y0), flags=fl, borderValue=0) / np.maximum(al[..., None], 1e-4)
        rgb = _transfert(rgb, al, ref, ref_al)
        Ps = P[:, :2] * s + M[:, 2]; lib = None
        if lmk is not None and bouche is not None:   # bouche qui parle : même moteur de mâchoire que les acteurs du décor
            full = img.copy(); sub = full[y0:y1, x0:x1].astype(np.float32)
            full[y0:y1, x0:x1] = np.clip(sub * (1 - al[..., None]) + rgb * al[..., None], 0, 255).astype(np.uint8)
            hd = float(np.linalg.norm(Ps[7] - Ps[8])) * 1.7 + 12; nz = Ps[0]
            try:
                L0 = lmk(full, [nz[0] - hd, nz[1] - 1.1 * hd, nz[0] + hd, nz[1] + 0.9 * hd])
                if L0 is not None:
                    fb = [float(L0[:, 0].min()), float(L0[:, 1].min()), float(L0[:, 0].max()), float(L0[:, 1].max())]
                    lib = bouche(full, {'visage': {'box': fb}}, L0)
            except Exception as e:
                print(f'{slug}/{nom} : bouche non préparée ({e})', flush=True)
        out[nom] = dict(rgb=rgb, al=al, box=(x0, y0, x1, y1), pts=Ps, lib=lib, sens=_sens(P))
    return out


def calendrier(nom, lignes, chutes, sk, dispo, positions=None):
    """[(début, fin, pose)] : la pose du jeu de chacune de ses répliques — le doigt pointé vers la personne à qui il parle
    (pose retournée en miroir si le costume le permet, sinon haussement) — et le choc tenu après la chute d'un autre."""
    I = []; L_sk = sorted((L for L in lignes if L.get('sketch') == sk), key=lambda L: L['t0'])
    for k, L in enumerate(L_sk):
        if L['qui'] != nom: continue
        p = CARTE.get(L.get('jeu'))
        if p is None: continue
        if p == 'accuse' and positions and nom in positions:
            autres = [x['qui'] for x in L_sk[:k][::-1] + L_sk[k + 1:] if x['qui'] != nom and x['qui'] in positions]
            if autres:
                vise = int(np.sign(positions[autres[0]] - positions[nom]))
                sens = dispo.get('accuse', {}).get('sens', 0) if isinstance(dispo, dict) else 0
                if vise and sens and vise != sens: p = 'accuse~' if 'accuse~' in dispo else 'haussement'
        if p in dispo: I.append([L['t0'] - 0.06, L['t0'] + L['dur'] + 0.12, p])
    for C in chutes:
        if C.get('sketch') == sk and C['qui'] != nom and 'choc' in dispo:
            a = C['t0'] + C['dur'] * 0.7; I.append([a, a + CHOC_TENU, 'choc'])
    I.sort(key=lambda x: x[0]); F = []
    for a, b, p in I:
        if F and F[-1][2] == p and a - F[-1][1] < 0.45: F[-1][1] = max(F[-1][1], b); continue
        if F and a < F[-1][1] + SORTIE + ENTREE: F[-1][1] = max(F[-1][0], a - SORTIE - ENTREE)   # la pose suivante prend le relais
        F.append([a, b, p])
    return [tuple(x) for x in F if x[1] > x[0]]


def poids(cal, t):
    """(pose, poids 0 → 1, instant d'arrivée) à l'instant t."""
    for a, b, p in cal:
        if a - ENTREE <= t <= b + SORTIE:
            return p, min(_doux((t - (a - ENTREE)) / ENTREE), 1 - _doux((t - b) / SORTIE)), a
    return None, 0.0, None


def rend(V, jj, dx, dy, t, arrivee):
    """la pose dessinée vivante à l'instant t : bouche (mâchoire), rebond d'arrivée amorti, souffle, pas du corps."""
    rgb, al, (x0, y0, x1, y1) = V['rgb'], V['al'], V['box']; lib = V['lib']
    if lib is not None and jj > 1e-3:
        x = jj * 4; i0 = int(min(3, math.floor(x))); fa = x - i0
        roi = lib[(i0, 0)] * (1 - fa) + lib[(i0 + 1, 0)] * fa; rx0, ry0, rx1, ry1 = lib['roi']
        ax0, ay0, ax1, ay1 = max(rx0, x0), max(ry0, y0), min(rx1, x1), min(ry1, y1)
        if ax1 > ax0 and ay1 > ay0:
            rgb = rgb.copy(); rgb[ay0 - y0:ay1 - y0, ax0 - x0:ax1 - x0] = roi[ay0 - ry0:ay1 - ry0, ax0 - rx0:ax1 - rx0]
    u = max(0.0, t - arrivee)   # rebond d'arrivée : ressort amorti (ζ ≈ 0,35), 2,5 % de la hauteur, puis le souffle
    sy = 1 + 0.025 * math.exp(-u / 0.14) * math.sin(2 * math.pi * u / 0.28) + 0.006 * math.sin(2 * math.pi * 0.27 * t)
    hy = (y1 - y0) * 0.97   # les pieds restent au sol
    M = np.float32([[1, 0, dx], [0, sy, hy * (1 - sy) + dy]]); m = int(abs(dx) + abs(dy)) + 6
    X0, Y0 = max(0, x0 - m), max(0, y0 - m); W_, H_ = (x1 - x0) + 2 * m, (y1 - y0) + 2 * m
    M[:, 2] += (x0 - X0, y0 - Y0)
    al2 = cv2.warpAffine(al, M, (W_, H_), flags=cv2.INTER_LINEAR, borderValue=0)
    rgb2 = cv2.warpAffine(rgb * al[..., None], M, (W_, H_), flags=cv2.INTER_LINEAR, borderValue=0) / np.maximum(al2[..., None], 1e-4)
    return (X0, Y0, X0 + W_, Y0 + H_), rgb2, al2


_DIS = None
def _flux(a, b):
    global _DIS
    if _DIS is None: _DIS = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    return _DIS.calc(a, b, None)


def intervalle(A, B, w):
    """A, B = (boîte, rgb, alpha) ; w ∈ [0, 1] → l'image intermédiaire : chaque pose est déplacée vers l'autre le long du
    flux optique (prémultiplié, deux sens), puis mêlées — le bras TRAVERSE l'espace au lieu d'apparaître en fondu."""
    if w <= 1e-3: return A
    if w >= 1 - 1e-3: return B
    X0, Y0 = min(A[0][0], B[0][0]), min(A[0][1], B[0][1]); X1, Y1 = max(A[0][2], B[0][2]), max(A[0][3], B[0][3])
    def toile(R):
        (x0, y0, x1, y1), rgb, al = R; P = np.zeros((Y1 - Y0, X1 - X0, 3), np.float32); L = np.zeros((Y1 - Y0, X1 - X0), np.float32)
        P[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = rgb.astype(np.float32) * al[..., None]; L[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = al; return P, L
    pa, la = toile(A); pb, lb = toile(B); H, W = la.shape
    g = lambda p, l: cv2.resize(np.clip(0.6 * cv2.cvtColor(np.clip(p, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY) + 0.4 * 255 * l, 0, 255).astype(np.uint8), None, fx=0.5, fy=0.5)
    ga, gb = g(pa, la), g(pb, lb)
    fab = cv2.resize(_flux(ga, gb), (W, H)) * 2; fba = cv2.resize(_flux(gb, ga), (W, H)) * 2
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    ma = (xs - w * fab[..., 0], ys - w * fab[..., 1]); mb = (xs - (1 - w) * fba[..., 0], ys - (1 - w) * fba[..., 1])
    ia = cv2.remap(pa, *ma, cv2.INTER_LINEAR, borderValue=0); ial = cv2.remap(la, *ma, cv2.INTER_LINEAR, borderValue=0)
    ib = cv2.remap(pb, *mb, cv2.INTER_LINEAR, borderValue=0); ibl = cv2.remap(lb, *mb, cv2.INTER_LINEAR, borderValue=0)
    pre = (1 - w) * ia + w * ib; al = np.clip((1 - w) * ial + w * ibl, 0, 1)
    return (X0, Y0, X1, Y1), pre / np.maximum(al[..., None], 1e-4), al
