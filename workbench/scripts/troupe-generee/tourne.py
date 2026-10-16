# TOURNAGE D'UNE VIDÉO À PARTIR DE SCÈNES GÉNÉRÉES PRÉPARÉES (16/10/2026)
# Chaque acteur reste dans SA scène (pixels d'origine du générateur : même style, même lumière, même échelle que le
# décor). Il joue sur place : visage LivePortrait (bouche sur les phonèmes, clignements), haut du corps plié autour du
# bassin (respiration, poids, ponctuation de la parole, recul de choc, secousse de rire), immobilité juste avant la chute.
# Grammaire de montage mesurée (vos TikTok, Afrikatoon, Ladjagaï) : plan d'ensemble à l'ouverture, une coupe par
# changement de locuteur, recadrage serré sur la chute, gros plan de réaction tenu, cartes émoji + titre entre sketchs.
# python3 tourne.py montage.json sortie_dir
import json, math, os, sys, zlib, numpy as np, cv2
FPS, CW, CH = 30, 576, 460
cfg = json.load(open(sys.argv[1])); OUT = sys.argv[2]; os.makedirs(f'{OUT}/clip', exist_ok=True)
ONLY = sys.argv[3] if len(sys.argv) > 3 else None  # essai : un seul sketch
T = json.load(open(cfg['timeline'])); total = T['total']; NF = int(math.ceil(total * FPS))
H_ = json.load(open(cfg['histoire']))
# ── GREFFE DU VISAGE : LivePortrait (MIT) redessine toute la tête (entraîné sur de vrais visages, il « humanise » les
# proportions Pixar : crâne plus gros, cheveux changés — vu sur Modou le 16/10). On ne prend donc que la BOUCHE et les
# PAUPIÈRES, alignées point par point sur l'original (Face Landmarker, Apache-2.0 ; similitude par moindres carrés
# robustes) ; tout le reste de la tête reste l'image d'origine.
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
_FL = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path='/root/.cache/massamba-models/face_landmarker.task'), num_faces=1, min_face_detection_confidence=0.2))
def lmk(rgb, box):
    x0, y0, x1, y1 = [int(v) for v in box]; x0, y0 = max(0, x0), max(0, y0)
    c = np.ascontiguousarray(rgb[y0:y1, x0:x1]); r = _FL.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=c))
    if not r.face_landmarks: return None
    h, w = c.shape[:2]; return np.array([[p.x * w + x0, p.y * h + y0] for p in r.face_landmarks[0]], np.float32)
STABLE = [33, 133, 362, 263, 1, 4, 168, 6, 197, 234, 454, 10, 152, 127, 356, 70, 300]   # yeux, nez, arête, contour
MOUTH = [61, 291, 0, 17, 13, 14, 78, 308, 81, 311, 178, 402, 152]
EYE_L, EYE_R = [33, 133, 159, 145, 160, 144, 158, 153], [362, 263, 386, 374, 385, 380, 387, 373]
def greffe_visage(img, vd, a):
    meta = json.load(open(f'{vd}/etats.json')); cad = json.load(open(f'{vd}/cadre.json')); ox, oy = cad['origine']
    v = a['visage']; bx = v['box']; mx = 0.8 * (bx[2] - bx[0]); box = [bx[0] - mx, bx[1] - mx, bx[2] + mx, bx[3] + mx]
    L0 = lmk(img, box)
    if L0 is None: return {}
    base = cv2.cvtColor(cv2.imread(f"{vd}/{meta['fichiers']['0_0']}", cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGB)
    full0 = img.copy(); full0[oy:oy + base.shape[0], ox:ox + base.shape[1]] = base
    L1 = lmk(full0, box)
    if L1 is None: return {}
    M, _ = cv2.estimateAffinePartial2D(L1[STABLE], L0[STABLE], method=cv2.LMEDS)
    # masque des zones greffées : bouche (et menton qui descend) + paupières, bords très doux
    msk = np.zeros(img.shape[:2], np.float32)
    mp_ = L0[MOUTH]; c = mp_.mean(0); ax = np.ptp(mp_[:, 0]) * 0.75; ay = np.ptp(mp_[:, 1]) * 0.9 + 0.12 * (bx[3] - bx[1])
    cv2.ellipse(msk, (int(c[0]), int(c[1] + 0.15 * ay)), (int(ax), int(ay)), 0, 0, 360, 1, -1)
    for E in (EYE_L, EYE_R):
        e = L0[E]; ce = e.mean(0); cv2.ellipse(msk, (int(ce[0]), int(ce[1])), (int(np.ptp(e[:, 0]) * 0.85), int(np.ptp(e[:, 1]) * 1.6 + 4)), 0, 0, 360, 1, -1)
    msk = cv2.GaussianBlur(msk, (0, 0), max(2, 0.03 * (bx[2] - bx[0])))[..., None]
    ys_, xs_ = np.nonzero(msk[..., 0] > 0.01); R = (int(xs_.min()), int(ys_.min()), int(xs_.max()) + 1, int(ys_.max()) + 1)
    lib = {'roi': R}
    for k, fn in meta['fichiers'].items():
        li = cv2.cvtColor(cv2.imread(f'{vd}/{fn}', cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGB)
        full = img.copy(); full[oy:oy + li.shape[0], ox:ox + li.shape[1]] = li
        al = cv2.warpAffine(full, M, (img.shape[1], img.shape[0]), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        g = img.astype(np.float32) * (1 - msk) + al.astype(np.float32) * msk
        lib[tuple(int(x) for x in k.split('_'))] = g[R[1]:R[3], R[0]:R[2]]
    return lib
# ── MÂCHOIRE PARAMÉTRIQUE (méthode des déformeurs de Live2D / Inochi2D, BSD-2, réécrite) : quand LivePortrait ne
# trouve pas le visage (barbe de Baye) ou n'ouvre pas la bouche (lunettes noires de Koffi), la lèvre inférieure et le
# menton descendent par un champ de déplacement doux, et l'intérieur de la bouche (dents du haut, langue) est peint
# dans l'ouverture. 5 états d'ouverture, mêmes clés que la bibliothèque LivePortrait.
def bouche_param(img, a, L0=None):
    v = a['visage']; bx = v['box']; fh = bx[3] - bx[1]; fw = bx[2] - bx[0]
    if L0 is not None:
        cl, cr = L0[61], L0[291]; mc = (L0[13] + L0[14]) / 2; chin = float(L0[152][1])
    else:
        mc = np.array(v['seam'], np.float32); hw0 = 0.5 * v['mouthWidth'] * 1.25
        cl, cr = mc - [hw0, 0], mc + [hw0, 0]; chin = float(bx[3])
    mx, my = float(mc[0]), float(mc[1]); hw = max(6.0, 0.5 * abs(cr[0] - cl[0]))
    # ligne des lèvres : parabole par les deux coins et le centre
    A_ = np.array([[cl[0] ** 2, cl[0], 1], [mx ** 2, mx, 1], [cr[0] ** 2, cr[0], 1]], np.float64)
    coef = np.linalg.solve(A_, np.array([cl[1], my, cr[1]], np.float64)) if abs(cr[0] - cl[0]) > 2 else np.array([0, 0, my])
    chin = max(chin, my + 0.18 * fh); jw = 0.42 * fw; tail = 0.25 * fh
    x0, x1 = int(mx - jw - 6), int(mx + jw + 6); y0, y1 = int(my - 0.06 * fh), int(chin + tail + 4)
    x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(img.shape[1], x1), min(img.shape[0], y1)
    ys, xs = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    seam = (coef[0] * xs ** 2 + coef[1] * xs + coef[2]).astype(np.float32)
    def prof(ysrc):  # profil vertical (source) : lèvre basse 1 → menton 0,55 → 0 sous le menton
        u = np.clip((ysrc - seam) / max(1, chin - my), 0, 1); vv = 1 - 0.45 * u
        return np.where(ysrc > chin, 0.55 * np.clip(1 - (ysrc - chin) / tail, 0, 1), vv) * (ysrc >= seam)
    def horiz(ysrc):
        k = np.clip((ysrc - my) / max(1, chin - my), 0, 1); half = hw * 1.25 + (jw - hw * 1.25) * k
        q = np.clip(np.abs(xs - mx) / half, 0, 1); return np.cos(q * np.pi / 2) ** 2
    lib = {'roi': (x0, y0, x1, y1)}; base = img[y0:y1, x0:x1].astype(np.float32)
    for i in range(5):
        o = (i / 4) * 0.10 * fh
        ysrc = ys - o * horiz(ys) * (ys >= seam)
        for _ in range(5): ysrc = np.where(ys >= seam, ys - o * prof(np.maximum(ysrc, seam)) * horiz(ysrc), ys)
        gap = o * horiz(seam)                     # ouverture au droit de chaque colonne
        inside = np.clip(ys - seam + 0.5, 0, 1) * np.clip(seam + gap - ys + 0.5, 0, 1) * (gap > 0.8)
        ysrc = np.where(inside > 0, seam - 0.5, np.maximum(ysrc, np.where(ys >= seam, seam + 0.5, ysrc)))
        warped = cv2.remap(img, xs, ysrc.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
        # intérieur : gorge sombre, dents du haut (bande claire), langue en bas
        rel = np.clip((ys - seam) / np.maximum(gap, 1e-3), 0, 1)[..., None]
        col = np.array([38, 14, 16], np.float32) * np.ones_like(warped)
        teeth = (rel < np.clip(0.03 * fh / np.maximum(gap, 1e-3), 0, 0.35)[..., None]) & (gap[..., None] > 4)
        col = np.where(teeth, np.array([232, 226, 214], np.float32), col)
        tongue = (rel > 0.68) & (gap[..., None] > 8)
        col = np.where(tongue, np.array([150, 62, 66], np.float32), col)
        al = cv2.GaussianBlur(inside.astype(np.float32), (0, 0), 0.6)[..., None]
        lib[(i, 0)] = warped * (1 - al) + col * al
    return lib
def ouverture_lib(img, lib, box):
    R = lib['roi']; out = []
    for k in ((0, 0), (4, 0)):
        im = img.copy(); im[R[1]:R[3], R[0]:R[2]] = np.clip(lib[k], 0, 255).astype(np.uint8)
        L = lmk(im, box); out.append(None if L is None else float(np.linalg.norm(L[13] - L[14]) / np.ptp(L[:, 1])))
    return out
# ── scènes préparées ──
SC = {}
for sk in T['sketchs']:
    if ONLY and sk['id'] != ONLY: continue
    d = cfg['scenes'][sk['id']]; S = json.load(open(f'{d}/scene.json'))
    img = cv2.cvtColor(cv2.imread(f'{d}/image.png'), cv2.COLOR_BGR2RGB); plate = cv2.cvtColor(cv2.imread(f'{d}/plaque.png'), cv2.COLOR_BGR2RGB)
    acts = {}
    for a in S['acteurs']:
        m = cv2.imread(f"{d}/{a['slug']}-masque.png", 0).astype(np.float32) / 255
        lib = {}; vd = f"{d}/visages/{a['slug']}"
        if os.path.isfile(f'{vd}/etats.json'):
            lib = greffe_visage(img, vd, a)
        if a.get('visage'):
            bx = a['visage']['box']; mg = bx[2] - bx[0]; box = [bx[0] - mg, bx[1] - mg, bx[2] + mg, bx[3] + mg]
            o0, o4 = ouverture_lib(img, lib, box) if lib else (None, None)
            if not lib or o0 is None or o4 is None or o4 - o0 < 0.03:   # LivePortrait n'ouvre pas cette bouche
                lib = bouche_param(img, a, lmk(img, box)); moteur = 'mâchoire paramétrique'
            else: moteur = 'LivePortrait'
            print(f"{a['nom']}: bouche par {moteur} (ouverture LivePortrait {o0} → {o4})", flush=True)
        p = np.array(a['pts'])
        acts[a['nom']] = dict(a=a, mask=cv2.GaussianBlur(m, (0, 0), 1.0), lib=lib, hip=np.array([p[[23, 24], 0].mean(), a['bassin_y']]),
                              neck=p[[11, 12], :2].mean(0), head=np.array(a['tete']), sh=a['epaules'], bbox=a['bbox'])
    SC[sk['id']] = dict(img=img, plate=plate, acts=acts, H=img.shape[0], W=img.shape[1], sk=sk)
LIPS, EYES = (0.0, 0.25, 0.5, 0.75, 1.0), (0.0, 0.5, 1.0)
SEATED = {'BAYE NDIAYE': True, 'KOFFI': True, 'COUMBA': True}
lines = T['lines']
def line_at(t, qui=None):
    for L in lines:
        if L['t0'] - 0.02 <= t <= L['t0'] + L['dur'] + 0.02 and (qui is None or L['qui'] == qui): return L
    return None
def jaw(L, t):
    # ouverture visée par phonème, anticipée de 40 ms (coarticulation), lissée sur ±50 ms, modulée par l'énergie réelle
    u = t - L['t0'] + 0.04; acc = 0.0; wsum = 0.0
    for dt, w in ((-0.05, 0.25), (0.0, 0.5), (0.05, 0.25)):
        v = 0.0
        for p in L['phonemes']:
            if p['t0'] <= u + dt < p['t1']: v = p['open'] / 4; break
        acc += v * w; wsum += w
    e = L['env'][min(len(L['env']) - 1, max(0, int((t - L['t0']) * 100)))]
    # amplitude exagérée (les visages font 40 à 80 px dans les plans moyens : une bouche à mi-ouverture y est invisible,
    # mesuré le 16/10) ; la puissance < 1 relève les ouvertures moyennes, les consonnes fermées restent fermées
    return float(np.clip((acc / wsum * (0.55 + 0.6 * e)) * 1.5 + 0.1 * e, 0, 1) ** 0.85)
def blink(name, t):
    rng = np.random.default_rng(zlib.crc32(name.encode())); ts = np.cumsum(rng.uniform(2.2, 5.0, 80))
    return max([max(0.0, 1 - abs(t - b) / 0.12) for b in ts if abs(t - b) < 0.2] + [0.0])
def ease(x): x = min(1, max(0, x)); return x * x * (3 - 2 * x)
def noise(t, seed):  # bruit doux (somme de sinus incommensurables, méthode Perlin 1995 « rythmique + stochastique »)
    return 0.5 * math.sin(1.31 * t + seed) + 0.3 * math.sin(2.17 * t + 1.7 * seed) + 0.2 * math.sin(3.73 * t + 0.3 * seed)
CHUTES = [L for L in lines if L.get('chute')]
def pose(name, t, sk):
    """angles (degrés) et échelle du haut du corps + hochement de tête, d'après le jeu de la réplique en cours."""
    seed = (zlib.crc32(name.encode()) % 1000) / 100
    AMP = 0.5 if SEATED.get(name) else 1.0  # assis : le buste bouge moins (et le dossier de la chaise ne suit pas)
    rot = 1.3 * noise(0.45 * t, seed); breath = 0.016 * math.sin(2 * math.pi * 0.27 * t + seed); shake = 0.0; lean = 0.0
    head = 0.9 * noise(0.8 * t, seed + 3.1)   # la tête vit toujours un peu (micro-mouvements, Perlin 1995)
    other = [Lx for Lx in lines if Lx['t0'] <= t <= Lx['t0'] + Lx['dur'] and Lx['qui'] != name and Lx['sketch'] == sk]
    if other:  # celui qui écoute acquiesce / suit l'autre du regard
        u_ = t - other[0]['t0']; head += 1.4 * math.sin(2 * math.pi * 0.9 * u_) * ease(u_ / 0.4)
    L = line_at(t, name)
    if L:
        u = t - L['t0']; e = L['env'][min(len(L['env']) - 1, int(u * 100))]
        head += 3.4 * e * math.sin(2 * math.pi * 2.1 * u) + 1.2 * math.sin(2 * math.pi * 0.6 * u)  # la tête ponctue la parole
        j = L.get('jeu', '')
        k = ease(u / 0.25) * (1 - ease((u - L['dur'] + 0.2) / 0.4))
        if j in ('accuse', 'marchande', 'soupcon'): lean += 3.0 * k
        if j in ('panique',): shake += 1.2 * math.sin(2 * math.pi * 7 * u) * k; lean -= 1.5 * k
        if j in ('innocent', 'frime', 'camera'): lean -= 2.0 * k; head -= 1.5 * k
        if j == "choc": lean -= 4.0 * ease(u / 0.2)
        if j == 'rire': shake += 2.5 * abs(math.sin(2 * math.pi * 3.2 * u)) * k; lean -= 2.0 * k
    # réaction des autres à la chute : recul de choc tenu 1,5 s (sauf le gagnant)
    for C in CHUTES:
        if C['sketch'] == sk and C['qui'] != name:
            u = t - (C['t0'] + C['dur'] * 0.7)
            if 0 <= u < 1.8: lean -= 4.5 * ease(u / 0.2) * (1 - ease((u - 1.3) / 0.5)); rot = 0
    # immobilité avant la chute (15 images) : seul le souffle reste, très bas
    for C in CHUTES:
        if C['sketch'] == sk and -0.5 <= t - C['t0'] < 0.0: rot *= 0.1; head *= 0.1; breath *= 0.3
    return (rot + lean + shake) * AMP, head, breath
def warp_actor(S, A, t, name):
    """le haut du corps plié autour du bassin, la tête autour du cou ; jambes immobiles (aucune couture)."""
    ang, hd, br = pose(name, t, S['sk']['id'])
    # FONDU entre états voisins (bouche × yeux) + mâchoire lissée sur ±2 images : plus de saut d'un état à l'autre
    jj = 0.0; wsum = 0.0
    for dt, w_ in ((-2, 0.1), (-1, 0.2), (0, 0.4), (1, 0.2), (2, 0.1)):
        tt = t + dt / FPS; Lx = line_at(tt, name); jj += w_ * (jaw(Lx, tt) if Lx else 0.0); wsum += w_
    jj /= wsum; bb = blink(name, t)
    src = S['img']; lib = A['lib']
    if lib:
        x = jj * 4; i0 = int(min(3, math.floor(x))); fa = x - i0
        e = bb * 2; j0 = int(min(1, math.floor(e))); fe = e - j0
        if (0, 2) not in lib: j0, fe = 0, 0.0
        g = lambda i, j: lib.get((i, j), lib.get((i, 0)))
        roi = (g(i0, j0) * (1 - fa) + g(i0 + 1, j0) * fa) * (1 - fe) + (g(i0, j0 + 1) * (1 - fa) + g(i0 + 1, j0 + 1) * fa) * fe
        R = lib['roi']; src = S['img'].copy(); src[R[1]:R[3], R[0]:R[2]] = np.clip(roi, 0, 255).astype(np.uint8)
    x0, y0, x1, y1 = A['bbox']; m = 40; X0, Y0, X1, Y1 = max(0, x0 - m), max(0, y0 - m), min(S['W'], x1 + m), min(S['H'], y1 + m)
    ys, xs = np.mgrid[Y0:Y1, X0:X1].astype(np.float32)
    hx, hy = A['hip']; nx, ny = A['neck']; top = min(y0, A['head'][1] - A['sh']); span = max(20, hy - ny)
    w = np.clip((hy - ys) / span, 0, 1); w = w * w * (3 - 2 * w)   # 0 au bassin → 1 aux épaules, rigide au-dessus
    a = math.radians(ang); dx = xs - hx; dy = ys - hy
    # rotation inverse (échantillonnage) autour du bassin, pondérée par la hauteur
    sx = hx + (dx * np.cos(-a * w) - dy * np.sin(-a * w)); sy = hy + (dx * np.sin(-a * w) + dy * np.cos(-a * w))
    sy = hy + (sy - hy) / (1 + br * w)
    chin = A['a']['visage']['box'][3] if A['a'].get('visage') else ny - 0.4 * A['sh']
    wh = np.clip((ny - ys) / max(6, 0.5 * (ny - chin)), 0, 1); wh = wh * wh * (3 - 2 * wh); b = math.radians(hd)   # seule la moitié basse du cou plie ; tête, menton et boucles d'oreilles tournent d'un bloc (cisaillement vu le 16/10)
    ddx, ddy = sx - nx, sy - ny
    sx2 = nx + ddx * np.cos(-b * wh) - ddy * np.sin(-b * wh); sy2 = ny + ddx * np.sin(-b * wh) + ddy * np.cos(-b * wh)
    sx2 = sx2.astype(np.float32); sy2 = sy2.astype(np.float32)
    rgb = cv2.remap(src, sx2, sy2, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)   # bicubique : −19 % de netteté mesurés en bilinéaire
    al = cv2.remap(A['mask'], sx2, sy2, cv2.INTER_LINEAR, borderValue=0)
    return (X0, Y0, X1, Y1), rgb, al
def frame_scene(S, t):
    can = S['plate'].astype(np.float32).copy()
    for name, A in sorted(S['acts'].items(), key=lambda kv: kv[1]['hip'][1]):
        (X0, Y0, X1, Y1), rgb, al = warp_actor(S, A, t, name)
        sub = can[Y0:Y1, X0:X1]; al3 = al[..., None]; sub[:] = sub * (1 - al3) + rgb.astype(np.float32) * al3
    return np.clip(can, 0, 255).astype(np.uint8)
# ── découpage : un plan par réplique (coupe au changement de locuteur) ──
def crop_for(S, kind, who=None):
    W, H = S['W'], S['H']; asp = CW / CH
    if kind == 'large' or who is None: h = H; w = min(W, h * asp); return (W / 2, H / 2, w, h)
    A = S['acts'][who]; cx, cy = A['head'][0], A['head'][1] + 1.1 * A['sh']
    h = {'moyen': 2.5, 'serre': 2.0, 'gros': 1.6}[kind] * 2 * A['sh']; h = min(H, max(260, h)); w = h * asp   # resserrés : visages plus grands, bouches lisibles
    if w > W: w = W; h = w / asp
    return (cx, cy, w, h)
def clamp_crop(S, c):
    cx, cy, w, h = c; k = min(1.0, S['W'] / w, S['H'] / h); w, h = w * k, h * k
    cx = min(max(cx, w / 2), S['W'] - w / 2); cy = min(max(cy, h / 2), S['H'] - h / 2); return cx, cy, w, h
def head_box(A):
    """la TÊTE entière : du sommet des cheveux (haut du masque) au menton, élargie sur les côtés."""
    v = A['a'].get('visage')
    if not v: return None
    fx0, fy0, fx1, fy1 = v['box']; mx = 0.35 * (fx1 - fx0)
    # cheveux : le haut du masque peut s'arrêter avant le sommet d'une coiffure (afro de Modou, foulard) → +35 % de la hauteur du visage
    top = min(fy0 - 0.35 * (fy1 - fy0), A['bbox'][1]); return [fx0 - mx, top, fx1 + mx, fy1 + 0.1 * (fy1 - fy0)]
def faces_ok(S, c, keep=None):
    """RÈGLE « tête entière ou absente », sur les quatre bords : une tête à moitié dans le cadre est poussée dehors ;
    la tête du personnage visé est toujours entière, avec de l'air au-dessus (8 % de la hauteur du cadre)."""
    cx, cy, w, h = c
    for _ in range(8):
        moved = False
        for n, A in S['acts'].items():
            hb = head_box(A)
            if not hb: continue
            x0, y0, x1, y1 = hb; l, r, t, btm = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2
            ix = max(0, min(r, x1) - max(l, x0)) / (x1 - x0); iy = max(0, min(btm, y1) - max(t, y0)) / (y1 - y0)
            if n == keep:
                air = 0.08 * h
                if y0 - air < t: cy -= (t - (y0 - air)); moved = True
                if x0 < l: cx -= (l - x0) + 2; moved = True
                if x1 > r: cx += (x1 - r) + 2; moved = True
                if (y1 - y0) + air > h * 0.9 or (x1 - x0) > w * 0.95: w = min(S['W'], w * 1.12); h = w * CH / CW; moved = True
                continue
            bx0, by0, bx1, by1 = A['bbox']; vw = max(0, min(r, bx1) - max(l, bx0)); vh = max(0, min(btm, by1) - max(t, by0))
            if y1 <= t + 1 and vw > 0.2 * w and vh > 0.3 * h:
                cx += (vw - 0.2 * w + 2) * (1 if (bx0 + bx1) / 2 < cx else -1); moved = True; continue
            cols = np.nonzero(A['mask'][max(0, int(t)):max(1, int(btm))].max(0) > 0.5)[0]   # colonnes où la personne existe DANS la hauteur du cadre (masque, pas la boîte)
            ins = cols[(cols >= l) & (cols <= r)]; mid = (bx0 + bx1) / 2
            # un bout de personne collé au bord (masque OU boîte : une main restée dans le décor hors masque compte aussi) : sorti du cadre
            if (0 < len(ins) < 0.1 * w or 0 < vw < 0.1 * w) and not (l <= mid <= r):
                if mid < cx: edge = max(bx1, ins.max() if len(ins) else bx1); cx += edge - l + 2
                else: edge = min(bx0, ins.min() if len(ins) else bx0); cx -= r - edge + 2
                moved = True; continue
            if ix * iy > 0.02 and (ix < 0.98 or iy < 0.98):
                if x0 < l < x1: cx += (x1 - l) + 2
                elif x0 < r < x1: cx -= (r - x0) + 2
                elif y0 < t: cy -= (t - y0) + 2
                moved = True
        cx, cy, w, h = clamp_crop(S, (cx, cy, w, h))
        if not moved: break
    # secours : si une tête reste coupée (le cadre ne peut plus glisser), on élargit pour la prendre entière
    for _ in range(10):
        cut = None
        for n, A in S['acts'].items():
            hb = head_box(A)
            if not hb: continue
            x0, y0, x1, y1 = hb; l, r, t, btm = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2
            ix = max(0, min(r, x1) - max(l, x0)) / (x1 - x0); iy = max(0, min(btm, y1) - max(t, y0)) / (y1 - y0)
            if ix * iy > 0.02 and (ix < 0.98 or iy < 0.98): cut = hb
        if cut is None: break
        nl = min(cx - w / 2, cut[0] - 8); nr = max(cx + w / 2, cut[2] + 8); nw = nr - nl; nh = nw * CH / CW
        cx, cy, w, h = clamp_crop(S, ((nl + nr) / 2, cy, nw, max(h, nh)))
    # secours : un bout de personne reste au bord car le cadre bute sur le bord de l'image → on resserre de ce côté
    # (quelques pixels), seulement si toutes les têtes restent entières ou absentes
    def tetes_ok(c):
        cx_, cy_, w_, h_ = c; l_, r_, t_, b_ = cx_ - w_ / 2, cx_ + w_ / 2, cy_ - h_ / 2, cy_ + h_ / 2
        for n_, A_ in S['acts'].items():
            hb_ = head_box(A_)
            if not hb_: continue
            ix_ = max(0, min(r_, hb_[2]) - max(l_, hb_[0])) / (hb_[2] - hb_[0]); iy_ = max(0, min(b_, hb_[3]) - max(t_, hb_[1])) / (hb_[3] - hb_[1])
            if (n_ == keep and (ix_ < 0.98 or iy_ < 0.98)) or (ix_ * iy_ > 0.02 and (ix_ < 0.98 or iy_ < 0.98)): return False
        return True
    for n, A in S['acts'].items():
        if n == keep: continue
        l, r, t, btm = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2
        cols = np.nonzero(A['mask'][max(0, int(t)):max(1, int(btm))].max(0) > 0.5)[0]; ins = cols[(cols >= l) & (cols <= r)]
        mid = (A['bbox'][0] + A['bbox'][2]) / 2
        if 0 < len(ins) < 0.1 * w and not (l <= mid <= r):
            nl, nr = (ins.max() + 2, r) if mid < cx else (l, ins.min() - 2)
            nw = nr - nl; nh = nw * CH / CW; cand = ((nl + nr) / 2, cy, nw, nh)
            if nw > 0.8 * w and tetes_ok(cand): cx, cy, w, h = cand
    # secours : corps sans tête encore trop présent → le cadre monte et s'élargit pour prendre la tête entière
    for n, A in S['acts'].items():
        hb = head_box(A)
        if not hb or n == keep: continue
        l, r, t, btm = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2
        bx0, by0, bx1, by1 = A['bbox']; vw = max(0, min(r, bx1) - max(l, bx0)); vh = max(0, min(btm, by1) - max(t, by0))
        if hb[3] <= t + 1 and vw > 0.2 * w and vh > 0.3 * h:
            top = hb[1] - 0.06 * h; nh = btm - top; nw = nh * CW / CH
            cx, cy, w, h = clamp_crop(S, (cx, (top + btm) / 2, max(w, nw), max(h, nh)))
    return cx, cy, w, h
SH = []  # (t0, t1, sketch, kind, who, punch_t)
for sk in T['sketchs']:
    Ls = [L for L in lines if L['sketch'] == sk['id']]
    for k, L in enumerate(Ls):
        t0 = sk['t0'] - 0.3 if k == 0 else L['t0'] - 0.12; t1 = (Ls[k + 1]['t0'] - 0.12) if k + 1 < len(Ls) else sk['t1'] + 0.25
        if k == 0:   # plan d'ensemble court (1,4 s de réplique), puis on coupe sur celui qui parle
            cut = L['t0'] + 1.4
            if t1 - cut >= 0.8: SH.append((t0, cut, sk['id'], 'large', None, None)); SH.append((cut, t1, sk['id'], 'moyen', L['qui'], None))
            else: SH.append((t0, t1, sk['id'], 'large', None, None))
            continue
        if L.get('chute'):
            SH.append((t0, L['t0'] + L['dur'] + 0.05, sk['id'], 'serre', L['qui'], L['t0'] + 0.6 * L['dur']))
            # gros plan de réaction sur celui qui subit (le premier autre acteur de la scène), tenu jusqu'à la réplique suivante
            nxt = Ls[k + 1]['qui'] if k + 1 < len(Ls) and Ls[k + 1]['qui'] != L['qui'] else None
            vict = nxt or [n for n in sk['acteurs'] if n != L['qui']][0]
            SH.append((L['t0'] + L['dur'] + 0.05, t1, sk['id'], 'gros', vict, None)); continue
        kind = 'large' if L.get('jeu') == 'choc' and len(L['texte']) < 18 else 'moyen'
        SH.append((t0, t1, sk['id'], kind, L['qui'] if kind != 'large' else None, None))
MIN_PLAN = 0.5
_k = 0
while _k < len(SH):
    s_ = SH[_k]
    if s_[1] - s_[0] < MIN_PLAN and len(SH) > 1:
        if _k + 1 < len(SH) and SH[_k + 1][2] == s_[2]: n_ = SH[_k + 1]; SH[_k + 1] = (s_[0],) + tuple(n_[1:])
        elif _k > 0: p_ = SH[_k - 1]; SH[_k - 1] = (p_[0], s_[1]) + tuple(p_[2:])
        del SH[_k]; continue
    _k += 1
assert all(s_[1] - s_[0] >= MIN_PLAN for s_ in SH), 'plan trop court'
def shot_at(t):
    for s in SH:
        if s[0] <= t < s[1]: return s
    # hors de tout plan : avant le premier → le premier plan (la 1re image est la miniature TikTok), sinon le plus proche avant t
    if t < SH[0][0]: return SH[0]
    return max((s for s in SH if s[0] <= t), key=lambda s: s[0], default=SH[0])
def in_card(t):
    for c in T['cartes']:
        if c['t0'] - 0.05 <= t < c['t1'] + 0.2: return c
    return None
from PIL import Image as PImage, ImageDraw, ImageFont
EMO = {'addition': 'emoji/face_with_tears_of_joy.png', 'poulet': 'emoji/face_screaming_in_fear.png'}
FONT = '/root/.cache/massamba-models/fonts/Montserrat.ttf'
def carte(c, t):
    im = PImage.new('RGB', (CW, CH), (0, 0, 0)); u = (t - c['t0']) / (c['t1'] - c['t0'])
    e = PImage.open(EMO.get(c['apres'], 'emoji/face_with_tears_of_joy.png')).convert('RGBA')
    k = 1.32 if u < 0.25 else (1.15 if u < 0.5 else 1.0)  # le logo grossit par coupes (×1,32 puis ×1,15, mesuré chez Ladjagaï)
    sz = int(210 * k); e = e.resize((sz, sz), PImage.LANCZOS); im.paste(e, ((CW - sz) // 2, 40 + (210 - sz) // 2), e)
    titre = [k_ for k_ in H_['sketchs'] if k_['id'] == c['apres']][0]['titre'].upper()
    d = ImageDraw.Draw(im); f = ImageFont.truetype(FONT, 34)
    try: f.set_variation_by_name(b'Black')
    except Exception: pass
    words = titre.split(); lines_, cur = [], ''
    for w_ in words:
        if f.getlength((cur + ' ' + w_).strip()) > CW - 60: lines_.append(cur); cur = w_
        else: cur = (cur + ' ' + w_).strip()
    lines_.append(cur)
    y = 290
    for ln in lines_:
        d.text(((CW - f.getlength(ln)) / 2, y), ln, font=f, fill=(255, 214, 0), stroke_width=4, stroke_fill=(0, 0, 0)); y += 44
    return np.array(im)
CADRES = {}
cut_count = 0; prev = None
RANGE = range(NF)
if ONLY:
    sk = [k for k in T['sketchs'] if k['id'] == ONLY][0]; RANGE = range(int((sk['t0'] - 0.3) * FPS), int((sk['t1'] + 0.25) * FPS))
import time; T0 = time.time()
for f in RANGE:
    t = f / FPS; c = in_card(t)
    if c:
        img = carte(c, t)
        cv2.imwrite(f'{OUT}/clip/f{f:05d}.jpg', cv2.cvtColor(img, cv2.COLOR_RGB2BGR)); prev = 'carte'; continue
    s = shot_at(t)
    if s[2] not in SC: continue
    if s != prev: cut_count += 1; prev = s
    S = SC[s[2]]; fr = frame_scene(S, t)
    # CADRAGE SOUS-PIXEL CONTINU : les cadres sont validés UNE fois par plan (début, fin de la dérive, punch de la chute)
    # puis interpolés en flottant ; l'image est prise par transformation affine (filtre anti-crénelage), jamais par
    # découpe au pixel entier (qui faisait trembler toute l'image d'un pixel à chaque image — mesuré : 1,42 saute/s).
    key = tuple(s[:5])
    if key not in CADRES:
        c0 = faces_ok(S, clamp_crop(S, crop_for(S, s[3], s[4])), s[4])
        c1 = faces_ok(S, clamp_crop(S, (c0[0], c0[1], c0[2] / 1.035, c0[3] / 1.035)), s[4])
        cp = faces_ok(S, clamp_crop(S, (c1[0], c1[1], c1[2] / 1.15, c1[3] / 1.15)), s[4])
        CADRES[key] = (c0, c1, cp)
        os.makedirs(f'{OUT}/source', exist_ok=True); sc0 = CW / c0[2]
        M0 = np.float32([[sc0, 0, -(c0[0] - c0[2] / 2) * sc0], [0, sc0, -(c0[1] - c0[3] / 2) * sc0]])
        src0 = cv2.GaussianBlur(S['img'], (0, 0), 0.45 / sc0) if sc0 < 0.95 else S['img']
        cv2.imwrite(f"{OUT}/source/{s[0]:06.2f}.jpg", cv2.cvtColor(cv2.warpAffine(src0, M0, (CW, CH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 94])
    c0, c1, cp = CADRES[key]
    u = ease((t - s[0]) / max(0.5, s[1] - s[0]))
    cx, cy, w2, h2 = [a_ + (b_ - a_) * u for a_, b_ in zip(c0, c1)]
    if s[5] is not None and t >= s[5]: cx, cy, w2, h2 = cp
    assert abs((w2 / h2) / (CW / CH) - 1) < 0.01, 'cadre étiré'
    sc = CW / w2; src_ = fr
    if sc < 0.95: src_ = cv2.GaussianBlur(fr, (0, 0), 0.45 / sc)
    Maff = np.float32([[sc, 0, -(cx - w2 / 2) * sc], [0, sc, -(cy - h2 / 2) * sc]])
    out = cv2.warpAffine(src_, Maff, (CW, CH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)  # acteur en bicubique + cadre en bilinéaire : netteté la plus proche de la source (mesurée)
    cv2.imwrite(f'{OUT}/clip/f{f:05d}.jpg', cv2.cvtColor(out, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 94])
    if f % 150 == 0: print(f'{f}/{NF}', flush=True)
json.dump({'images': NF, 'plans': cut_count, 'plans_par_minute': round(cut_count / (total / 60), 1), 'decoupage': [list(map(lambda v: round(v, 2) if isinstance(v, float) else v, s)) for s in SH]},
          open(f'{OUT}/tournage.json', 'w'), ensure_ascii=False, indent=1)
print('ok', len(RANGE), 'images,', cut_count, 'plans,', round(time.time() - T0), 's')
