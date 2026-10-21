# PRÉPARATION D'UNE SCÈNE GÉNÉRÉE (une seule fois par image, réutilisable dans toutes les vidéos) :
#  - acteurs repérés de gauche à droite (MediaPipe Pose heavy, Apache-2.0), masque PAR PERSONNE par MagicTouch
#    (segmenteur interactif MediaPipe, Apache-2.0) guidé par les points de SON squelette ;
#  - visage : 5 points (Face Landmarker, Apache-2.0) pour LivePortrait ;
#  - plaque : le HAUT du corps de chaque acteur effacé (LaMa, Apache-2.0) — on n'anime que tête, buste et bras, les
#    jambes restent l'image d'origine (aucune couture au bassin).
# python3 prepare_scene.py scenes/chambre-42.png prep/chambre "TANTIE AWA,MODOU"
import json, os, sys, numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'outils'))
from scene_layers import lama_fill, magic_touch_mask
M = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/'
f, out, names = sys.argv[1], sys.argv[2], [s.strip() for s in sys.argv[3].split(',')]
os.makedirs(out, exist_ok=True)
rgb = cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB); H, W = rgb.shape[:2]; N = len(names)
PL = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=M + 'pose_landmarker_heavy.task'),
        num_poses=N, min_pose_detection_confidence=0.2, min_pose_presence_confidence=0.2))
FL = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=M + 'face_landmarker.task'), num_faces=1,
        min_face_detection_confidence=0.2))
def detect(img, x0=0):
    r = PL.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img)))
    h, w = img.shape[:2]
    return [np.array([[p.x * w + x0, p.y * h, p.visibility] for p in lm]) for lm in r.pose_landmarks]
# SCÈNE COMPOSÉE (20/10/2026, toute la troupe) : le compositeur connaît la découpe EXACTE de chaque acteur (PREPARE_ALPHAS,
# de gauche à droite). Dans un décor peuplé (l'École : élèves et un second professeur peints), le squelette et le visage
# d'un acteur étaient pris sur une personne du décor (visages de Koné et d'Awa trouvés hors de leur silhouette, mesuré sur
# ecole-n1). Chaque acteur est donc analysé SEUL : sa découpe posée sur un fond gris neutre, le décor invisible.
ALPHAS = [cv2.imread(a_, cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535 for a_ in os.environ['PREPARE_ALPHAS'].split(',')] if os.environ.get('PREPARE_ALPHAS') else None
if ALPHAS:
    def isole(k):
        a_ = cv2.dilate((ALPHAS[k] > 0.02).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32)[..., None]
        return (rgb * a_ + 128.0 * (1 - a_)).astype(np.uint8)
    P, ISO = [], [isole(k) for k in range(N)]
    for k in range(N):
        c = detect(ISO[k]); ys_, xs_ = np.nonzero(ALPHAS[k] > 0.5); cx_ = float(xs_.mean())
        P.append(min(c, key=lambda p: abs(p[0, 0] - cx_)) if c else np.array([[cx_, float(ys_.min()), 0.0]] * 33))
    rgb_analyse = rgb
P = detect(rgb) if not ALPHAS else P
if len(P) < N:
    P = []
    for k in range(N):
        x0 = int(max(0, (k - 0.15) * W / N)); x1 = int(min(W, (k + 1.15) * W / N))
        c = detect(rgb[:, x0:x1], x0)
        if c: P.append(min(c, key=lambda p: abs(p[0, 0] - (k + 0.5) * W / N)))
FACEL = {}
def slug_de(nom):   # 19/10/2026 : noms de la troupe élargie (MAÎTRE KONÉ, SŒUR AWA) → fichiers ASCII sûrs pour toute la chaîne
    import unicodedata, re as _re
    t = unicodedata.normalize('NFKD', nom.replace('Œ', 'OE').replace('œ', 'oe')).encode('ascii', 'ignore').decode().lower()
    return _re.sub(r'[^a-z0-9]+', '-', t).strip('-')
P = sorted(P, key=lambda p: p[0, 0])
assert len(P) == N, f'{len(P)} acteurs trouvés pour {N} attendus'
def plausible(p):  # tête au-dessus des épaules, épaules au-dessus des hanches
    return p[0, 1] < p[[11, 12], 1].mean() - 5 and p[[11, 12], 1].mean() < p[[23, 24], 1].mean() - 10
def redetect(k):
    # deuxième passe : un seul corps, sur un recadrage agrandi avec marge blanche (assis, partiellement caché…)
    cx = float(np.median(P[k][:, 0])); half = W / N * 0.75
    x0, x1 = int(max(0, cx - half)), int(min(W, cx + half)); crop = rgb[:, x0:x1]
    sc = 1.5; big = cv2.resize(crop, None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC); pad = int(0.15 * big.shape[0])
    big = cv2.copyMakeBorder(big, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    one = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=M + 'pose_landmarker_heavy.task'), num_poses=1, min_pose_detection_confidence=0.2))
    r = one.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big)))
    if not r.pose_landmarks: return None
    h, w = big.shape[:2]
    return np.array([[(q.x * w - pad) / sc + x0, (q.y * h - pad) / sc, q.visibility] for q in r.pose_landmarks[0]])
for k in range(N):
    if not plausible(P[k]):
        q = redetect(k)
        if q is not None and plausible(q): print('squelette repris en 2e passe :', names[k]); P[k] = q
        else:
            # repli : squelette reconstruit depuis le VISAGE (trouvé sur la bande verticale de l'acteur) et les proportions
            x0 = int(max(0, k * W / N - 0.2 * W / N)); x1 = int(min(W, (k + 1) * W / N + 0.2 * W / N))
            L = None
            for ts in (360, 260, 480):  # loupe : fenêtres qui se chevauchent sur la bande de l'acteur
                for ty in range(0, max(1, H - ts + 1), ts // 2):
                    for tx in range(x0, max(x0 + 1, x1 - ts + 1), ts // 2):
                        crop = np.ascontiguousarray(rgb[ty:ty + ts, tx:tx + ts]); r = FL.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop))
                        if r.face_landmarks:
                            h_, w_ = crop.shape[:2]; L = np.array([[q.x * w_ + tx, q.y * h_ + ty] for q in r.face_landmarks[0]]); break
                    if L is not None: break
                if L is not None: break
            if L is None: print('squelette douteux, visage introuvable :', names[k]); continue
            fw = np.ptp(L[:, 0]); fh = np.ptp(L[:, 1]); c = L.mean(0)
            q = np.zeros((33, 3)); q[:, 2] = 0.0
            def put(i, x, y): q[i] = [x, y, 1.0]
            put(0, *L[1]); put(11, c[0] + 0.9 * fw, c[1] + 1.3 * fh); put(12, c[0] - 0.9 * fw, c[1] + 1.3 * fh)
            put(13, c[0] + 1.1 * fw, c[1] + 2.4 * fh); put(14, c[0] - 1.1 * fw, c[1] + 2.4 * fh)
            put(23, c[0] + 0.6 * fw, c[1] + 3.3 * fh); put(24, c[0] - 0.6 * fw, c[1] + 3.3 * fh)
            put(25, c[0] + 0.8 * fw, c[1] + 3.6 * fh); put(26, c[0] - 0.8 * fw, c[1] + 3.6 * fh)
            put(15, c[0] + 1.3 * fw, c[1] + 3.2 * fh); put(16, c[0] - 1.3 * fw, c[1] + 3.2 * fh)
            P[k] = q; FACEL[k] = L; print('squelette reconstruit depuis le visage :', names[k])
def face5(box, src=None):
    x0, y0, x1, y1 = [int(v) for v in box]
    crop = np.ascontiguousarray((rgb if src is None else src)[y0:y1, x0:x1]); r = FL.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop))
    if not r.face_landmarks:
        # visage de trois quarts trop petit (Junior au gbaka, 21/10/2026) : seconde lecture sur le recadrage agrandi ×2
        big = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC); r = FL.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big)))
        if not r.face_landmarks: return None
        h, w = crop.shape[:2]; L = np.array([[p.x * w + x0, p.y * h + y0] for p in r.face_landmarks[0]])
        return {'eyes': [{'c': L[[33, 133, 159, 145]].mean(0).tolist()}, {'c': L[[362, 263, 386, 374]].mean(0).tolist()}], 'nose': L[1].tolist(),
                'seam': L[[13, 14]].mean(0).tolist(), 'mouthWidth': float(np.linalg.norm(L[61] - L[291])),
                'box': [float(L[:, 0].min()), float(L[:, 1].min()), float(L[:, 0].max()), float(L[:, 1].max())]}
    h, w = crop.shape[:2]; L = np.array([[p.x * w + x0, p.y * h + y0] for p in r.face_landmarks[0]])
    return {'eyes': [{'c': L[[33, 133, 159, 145]].mean(0).tolist()}, {'c': L[[362, 263, 386, 374]].mean(0).tolist()}], 'nose': L[1].tolist(),
            'seam': L[[13, 14]].mean(0).tolist(), 'mouthWidth': float(np.linalg.norm(L[61] - L[291])),
            'box': [float(L[:, 0].min()), float(L[:, 1].min()), float(L[:, 0].max()), float(L[:, 1].max())]}
# DÉCOUPE PAR SAM 2.1 (21/10/2026, scènes neuves de la saison 2) : MagicTouch, guidé point par point, débordait sur le décor
# de même couleur — le masque de Junior emportait le bas du gbaka, l'afro de la coiffeuse restait dans la plaque, mains et
# têtes fantômes dans le décor. SAM 2.1 hiera-tiny (Apache-2.0, déjà en cache pour linge.py) reçoit pour chaque acteur une
# BOÎTE (ses points de squelette, marge de cheveux au-dessus du nez) + ses points en positif et ceux des autres en négatif.
# Repli MagicTouch si SAM échoue ; PREPARE_SAM=0 rend l'ancienne voie.
def sam_personnes(img, Ps):
    # Silhouette complète en trois temps (21/10/2026, essais sur le salon, le gbaka et le marché) : 1) SAM (boîte + squelette,
    # les autres acteurs en négatif) donne le corps sans déborder ; 2) des ANCRES autour de la tête et aux mains, chacune
    # interrogée seule, rattachent ce que SAM avait laissé (chevelure, peigne, billets, téléphone) si le morceau touche le
    # corps et reste dans sa petite boîte ; 3) la classe « cheveux / accessoires » du segmenteur MediaPipe multiclasse
    # (Apache-2.0) au-dessus des épaules complète une coiffure volumineuse (afro de la coiffeuse : 26 % → 96 % rattachée),
    # puis les piqûres du masque sont bouchées. L'image n'est encodée qu'une fois (27 s les trois scènes).
    import torch, linge, mediapipe as mp_
    from mediapipe.tasks.python import vision as v_, BaseOptions as BO_
    _, mod = linge._sam(); H_, W_ = img.shape[:2]; sx, sy = 1024 / W_, 1024 / H_
    x_ = cv2.resize(img, (1024, 1024), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255
    x_ = (x_ - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    with torch.no_grad(): emb = mod.get_image_embeddings(torch.from_numpy(x_.transpose(2, 0, 1)[None].copy()))
    seg = v_.ImageSegmenter.create_from_options(v_.ImageSegmenterOptions(base_options=BO_(model_asset_path=M + 'selfie_multiclass_256x256.tflite'), output_confidence_masks=True))
    def sam(pos, neg, box, multi):
        pts = torch.tensor([[[[x * sx, y * sy] for x, y in pos + neg]]], dtype=torch.float32)
        lab = torch.tensor([[[1] * len(pos) + [0] * len(neg)]], dtype=torch.int64)
        bx = torch.tensor([[[box[0] * sx, box[1] * sy, box[2] * sx, box[3] * sy]]], dtype=torch.float32)
        with torch.no_grad(): o = mod(image_embeddings=emb, input_points=pts, input_labels=lab, input_boxes=bx, multimask_output=multi)
        return [cv2.resize(o.pred_masks[0, 0, j].numpy(), (W_, H_)) > 0 for j in range(o.pred_masks.shape[2])], o.iou_scores[0, 0].numpy()
    vis = lambda p, I=(0, 11, 12, 13, 14, 15, 16, 23, 24): [i for i in I if p[i, 2] > 0.4 and 0 <= p[i, 0] < W_ and 0 <= p[i, 1] < H_]
    out = []
    for k, p in enumerate(Ps):
        s = float(np.linalg.norm(p[11, :2] - p[12, :2])) or 40.0; idx = vis(p) or [0, 11, 12]; xs, ys = p[idx, 0], p[idx, 1]
        box = [max(0, xs.min() - 0.6 * s), max(0, p[0, 1] - 1.4 * s), min(W_ - 1, xs.max() + 0.6 * s), min(H_ - 1, ys.max() + 2.5 * s)]
        neg = [(q[i, 0], q[i, 1]) for j, q in enumerate(Ps) if j != k for i in vis(q)]
        m = sam([(p[i, 0], p[i, 1]) for i in idx], neg, box, False)[0][0].astype(np.uint8)
        near = cv2.dilate(m, np.ones((int(0.15 * s) | 1,) * 2, np.uint8)).astype(bool)
        ancres = [(p[0, 0] + dx * s, p[0, 1] - dy * s, 1.2) for dx, dy in ((0, 0.9), (-0.6, 0.6), (0.6, 0.6), (0, 1.3))] + \
                 [(p[i, 0], p[i, 1], 0.7) for i in vis(p, (15, 16, 19, 20))]
        for ax, ay, r in ancres:
            bb = [max(0, ax - r * s), max(0, ay - r * s), min(W_ - 1, ax + r * s), min(H_ - 1, ay + r * s)]
            ms, sc = sam([(ax, ay)], neg, bb, True)
            dans = np.zeros((H_, W_), bool); dans[int(bb[1]):int(bb[3]) + 1, int(bb[0]):int(bb[2]) + 1] = True
            ok = [q for q, c in zip(ms, sc) if c > 0.6 and (q & near).any() and (q & ~dans).sum() < 0.03 * max(1, q.sum())]
            if ok: m |= max(ok, key=lambda q: q.sum()).astype(np.uint8)
        hx, hy = p[0, :2]; c0, r0 = int(max(0, hx - 1.7 * s)), int(max(0, hy - 2.0 * s)); c1, r1 = int(min(W_, hx + 1.7 * s)), int(min(H_, hy + 0.8 * s))
        if c1 - c0 > 8 and r1 - r0 > 8:
            cr = np.ascontiguousarray(img[r0:r1, c0:c1]); kz = 512 / max(cr.shape[:2])
            rs = seg.segment(mp_.Image(image_format=mp_.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.resize(cr, None, fx=kz, fy=kz, interpolation=cv2.INTER_CUBIC))))
            if rs.confidence_masks:
                hair = cv2.resize(np.maximum(rs.confidence_masks[1].numpy_view(), rs.confidence_masks[5].numpy_view()), (c1 - c0, r1 - r0)) > 0.5
                hair[int(max(0, p[[11, 12], 1].min() - r0)):] = False   # au-dessus des épaules seulement
                full = np.zeros((H_, W_), np.uint8); full[r0:r1, c0:c1] = hair
                n_, lab_ = cv2.connectedComponents(full); tou = cv2.dilate(m, np.ones((5, 5), np.uint8)).astype(bool)
                for c in range(1, n_):
                    if (tou & (lab_ == c)).any(): m |= (lab_ == c).astype(np.uint8)
        # trous : seules les piqûres (motifs du pagne, 0,000–0,03 épaule²) sont bouchées ; la boucle du bras sur la hanche
        # (0,11–0,23 épaule², mesuré sur Princesse, Josiane, Soumaïla, Junior) reste du décor, elle ne doit pas suivre le bras
        ff = m.copy(); cv2.floodFill(ff, np.zeros((H_ + 2, W_ + 2), np.uint8), (0, 0), 1)
        n_, lab_, st_, _ = cv2.connectedComponentsWithStats((1 - ff).astype(np.uint8))
        for c in range(1, n_):
            if st_[c, 4] < 0.05 * s * s: m[lab_ == c] = 1
        out.append(m.astype(np.float32))
    seg.close()
    return out
SAMM = None
if not ALPHAS and os.environ.get('PREPARE_SAM', '1') != '0':
    try: SAMM = sam_personnes(rgb, P)
    except Exception as e: print('SAM 2.1 indisponible, repli MagicTouch :', e)
info = {'image': f, 'W': W, 'H': H, 'acteurs': [], 'decoupe': 'SAM 2.1' if SAMM else ('exacte' if ALPHAS else 'MagicTouch')}; masks = []
def face_from(L):
    return {'eyes': [{'c': L[[33, 133, 159, 145]].mean(0).tolist()}, {'c': L[[362, 263, 386, 374]].mean(0).tolist()}], 'nose': L[1].tolist(),
            'seam': L[[13, 14]].mean(0).tolist(), 'mouthWidth': float(np.linalg.norm(L[61] - L[291])),
            'box': [float(L[:, 0].min()), float(L[:, 1].min()), float(L[:, 0].max()), float(L[:, 1].max())]}
for kk, (name, p) in enumerate(zip(names, P)):
    idx = [i for i in (0, 11, 12, 13, 14, 23, 24, 25, 26) if p[i, 2] > 0.4 and 0 <= p[i, 0] < W and 0 <= p[i, 1] < H]
    m = (ALPHAS[kk] > 0.5).astype(np.float32) if ALPHAS else SAMM[kk] if SAMM else magic_touch_mask(rgb, [(p[i, 0] / W, p[i, 1] / H) for i in idx])
    m = (m > 0.5).astype(np.uint8)
    # enveloppe du squelette : rien ne bouge hors de la tête, du buste et des bras (la porte, la fumée restent au décor)
    s0 = float(np.linalg.norm(p[11, :2] - p[12, :2])); env = np.zeros((H, W), np.uint8); I = lambda i: tuple(int(v) for v in p[i, :2])
    tor = np.array([p[11, :2], p[12, :2], p[24, :2], p[23, :2]], np.int32); cv2.fillConvexPoly(env, tor, 1); env = cv2.dilate(env, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.7 * s0) | 1,) * 2))
    for a, b in ((11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24)): cv2.line(env, I(a), I(b), 1, max(3, int(0.55 * s0)))
    for w_ in (15, 16): cv2.circle(env, I(w_), max(3, int(0.45 * s0)), 1, -1)
    hc = p[0, :2]; hr = (1.5 if SAMM else 0.95) * s0   # SAM : la chevelure entière (afro, foulard) reste à l'acteur
    cv2.circle(env, (int(hc[0]), int(hc[1] - 0.15 * s0)), int(hr), 1, -1); cv2.line(env, I(0), tuple(int(v) for v in p[[11, 12], :2].mean(0)), 1, int(0.6 * s0))
    keep_low = np.zeros((H, W), np.uint8); hy_ = int(p[[23, 24], 1].mean()) if p[[23, 24], 2].min() > 0.3 else H; keep_low[hy_:] = 1
    # SAM 2.1 suit la silhouette : l'enveloppe du squelette (faite pour MagicTouch, qui débordait) coupait la main posée sur la
    # portière, le téléphone, les billets — restés dans la plaque, ils devenaient des objets et des mains fantômes
    if not SAMM: m = m & (env | keep_low)
    n, lab = cv2.connectedComponents(m)
    sh = p[[11, 12], :2].mean(0).astype(int); l = lab[min(H - 1, sh[1]), min(W - 1, sh[0])]
    if l > 0: m = (lab == l).astype(np.uint8)
    if ALPHAS: m = (ALPHAS[kk] > 0.5).astype(np.uint8)   # découpe exacte du compositeur, sans l'enveloppe du squelette
    masks.append(m)
    s = float(np.linalg.norm(p[11, :2] - p[12, :2])); hx, hy = p[0, :2]
    fc = face_from(FACEL[kk]) if kk in FACEL else face5([max(0, hx - 1.5 * s), max(0, hy - 1.8 * s), min(W, hx + 1.5 * s), min(H, hy + 1.2 * s)], ISO[kk] if ALPHAS else None)
    hip_y = float(p[[23, 24], 1].mean()) if p[[23, 24], 2].min() > 0.3 else float(p[[11, 12], 1].mean() + 2.0 * s)
    info['acteurs'].append({'nom': name, 'slug': slug_de(name), 'pts': p.round(1).tolist(), 'visage': fc, 'epaules': round(s, 1),
                            'bassin_y': round(min(H - 2, hip_y), 1), 'tete': [round(hx, 1), round(hy, 1)]})
# un pixel n'appartient qu'à un acteur : on retire aux autres ce qui touche le cœur de chacun
for i in range(N):
    for j in range(N):
        if i != j: masks[i][(masks[j] > 0) & (masks[i] > 0) & (np.abs(np.arange(W)[None, :] - P[j][0, 0]) < np.abs(np.arange(W)[None, :] - P[i][0, 0]))] = 0
union = np.zeros((H, W), np.uint8)
for a, m in zip(info['acteurs'], masks):
    cv2.imwrite(f"{out}/{a['slug']}-masque.png", m * 255)
    up = m.copy(); up[int(a['bassin_y']) + 6:] = 0  # seul le haut du corps bouge
    union |= cv2.dilate(up, np.ones((17, 17), np.uint8))
    ys, xs = np.nonzero(m); a['bbox'] = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
# texte parasite écrit par le générateur (enseignes, étiquettes) : EasyOCR (Apache-2.0) le repère, LaMa l'efface
try:
    if ALPHAS: raise RuntimeError('scène composée : le décor de la bibliothèque est gardé tel quel')
    import easyocr
    rd = easyocr.Reader(['fr', 'en'], gpu=False, model_storage_directory=M + 'easyocr', download_enabled=False, verbose=False)
    txt = np.zeros((H, W), np.uint8); found = []
    for box, t, conf in rd.readtext(rgb):
        if conf > 0.3 and len(t.strip()) >= 3:
            pts = np.array(box, np.int32); cv2.fillPoly(txt, [pts], 1); found.append(t)
    if found:
        txt = cv2.dilate(txt, np.ones((9, 9), np.uint8)); rgb, _, _ = lama_fill(rgb.copy(), txt * 255); info['texte_efface'] = found
except Exception as e:
    info['texte_efface'] = f'non contrôlé ({e})'
plate, how, _ = lama_fill(rgb.copy(), union * 255)
cv2.imwrite(f'{out}/plaque.png', cv2.cvtColor(plate, cv2.COLOR_RGB2BGR)); cv2.imwrite(f'{out}/image.png', cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
info['plaque'] = how
json.dump(info, open(f'{out}/scene.json', 'w'), ensure_ascii=False, indent=1)
vis = rgb.copy()
for k, (a, m) in enumerate(zip(info['acteurs'], masks)):
    col = np.array([(255, 60, 60), (60, 255, 60), (60, 60, 255)][k % 3]); vis[m > 0] = (0.6 * vis[m > 0] + 0.4 * col).astype(np.uint8)
    cv2.line(vis, (a['bbox'][0], int(a['bassin_y'])), (a['bbox'][2], int(a['bassin_y'])), (255, 255, 255), 2)
    if a['visage']:
        for e in a['visage']['eyes']: cv2.circle(vis, tuple(int(v) for v in e['c']), 5, (255, 255, 0), -1)
        cv2.circle(vis, tuple(int(v) for v in a['visage']['seam']), 5, (255, 0, 255), -1)
cv2.imwrite(f'{out}/controle.jpg', cv2.cvtColor(np.hstack([cv2.resize(vis, (W // 2, H // 2)), cv2.resize(plate, (W // 2, H // 2))]), cv2.COLOR_RGB2BGR))
print(json.dumps([(a['nom'], a['bbox'], a['visage'] is not None, a['bassin_y']) for a in info['acteurs']], ensure_ascii=False), how)
