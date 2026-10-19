# PRÉPARATION « CORPS ENTIER » D'UNE SCÈNE (17/10/2026), une seule fois par scène, réutilisée par tous les épisodes :
#   1. découpe de chaque personne entière (rig2d.decoupe : décor retiré, membres oubliés ajoutés, bords affinés) ;
#   2. plaque du décor sans AUCUN acteur, à pleine résolution (plaque.plaque_pleine), fils réparés (plaque.fils) ;
#   3. complétion des parties cachées par un acteur plus proche (plaque.amodal) ;
#   4. calques des avant-bras / mains et leur fond reconstitué (gestes.prepare) ;
#   5. relief du visage (Face Landmarker, 478 points x, y, z) pour tourner la tête et diriger le regard ;
#   6. contrôle de cohérence de la scène (coherence.controle : géométrie + œil de JEV).
# Tout est écrit dans <scène>/rig/ ; tourne.py le relit (sinon il le calcule et l'écrit).
#   python3 prepare_rig.py prep/cour [--sans-jev]
import hashlib, json, os, sys, time
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig2d, plaque as PQ, gestes, coherence, objets

ASSIS_MOTS = ('assis', 'chaise', 'seated')


def visage3d(img, box):
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    f = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/face_landmarker.task'
    FL = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=f), num_faces=1, min_face_detection_confidence=0.2))
    x0, y0, x1, y1 = [int(v) for v in box]; x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(img.shape[1], x1), min(img.shape[0], y1)
    c = np.ascontiguousarray(img[y0:y1, x0:x1]); r = FL.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=c)); FL.close()
    if not r.face_landmarks: return None
    h, w = c.shape[:2]
    return np.array([[p.x * w + x0, p.y * h + y0, -p.z * w] for p in r.face_landmarks[0]], np.float64)


VERSION_PLAQUE = 2   # à augmenter quand le calcul de la plaque change : le cache des scènes est alors refait
VERSION_DECOUPE = 2  # 18/10/2026 : membres rendus à leur corps (membres_rendus) — les scènes déjà préparées sont refaites,
                     # plaque et calques des acteurs inchangés repris


def empreinte_decoupes(alphas):
    return hashlib.md5(str(VERSION_PLAQUE).encode() + b''.join(np.clip(al * 65535, 0, 65535).astype(np.uint16).tobytes() for al in alphas)).hexdigest()


CLES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]   # épaules, coudes, poignets, hanches, genoux, chevilles


def squelette(img, a, alpha, echelle=2.0, marge=40):
    """pose re-détectée sur le recadrage AGRANDI de la personne (Pose Landmarker « heavy », Apache-2.0) : la détection sur
    la scène entière plaçait le bassin de Baye au bas du boubou, ses mains sur les pieds de la chaise et oubliait ses
    chevilles (vu le 17/10 : le buste « possédait » tout le bas du boubou et l'étirait de 13 % contre le pied immobile).
    Gardée si elle est sûre (visibilité des articulations clés) et dans la découpe. → (pts 33 × 3, score) ou (None, 0)."""
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    f = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/pose_landmarker_heavy.task'
    if not os.path.isfile(f): return None, 0.0
    H, W = img.shape[:2]; x0, y0, x1, y1 = [int(v) for v in a['bbox']]
    X0, Y0, X1, Y1 = max(0, x0 - marge), max(0, y0 - marge), min(W, x1 + marge), min(H, y1 + marge)
    c = cv2.resize(np.ascontiguousarray(img[Y0:Y1, X0:X1]), None, fx=echelle, fy=echelle, interpolation=cv2.INTER_CUBIC)
    P = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=f), num_poses=1, min_pose_detection_confidence=0.2))
    r = P.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=c)); P.close()
    if not r.pose_landmarks: return None, 0.0
    L = np.array([[p.x * c.shape[1] / echelle + X0, p.y * c.shape[0] / echelle + Y0, p.visibility] for p in r.pose_landmarks[0]])
    dil = cv2.dilate((alpha > 0.5).astype(np.uint8), np.ones((15, 15), np.uint8))
    xi, yi = np.clip(L[CLES, 0].astype(int), 0, W - 1), np.clip(L[CLES, 1].astype(int), 0, H - 1)
    dedans = float(dil[yi, xi].mean()); vis = float(L[CLES, 2].mean())
    return L, vis * dedans


# ARTICULATIONS DES BRAS PAR RTMW (19/10/2026, greffe « bras à deux segments », étape 1). Planche du 19/10 sur la cour :
# MediaPipe (entraîné sur des photos) pose coudes et poignets des dessins à côté du bras — coude de Maman Nounou sur sa
# hanche, poignets de Baye sur l'accoudoir ; RTMW (rtmlib 0.0.16, Apache-2.0, entraîné sur COCO-WholeBody ET HumanArt,
# donc sur des dessins) les pose sur le bras. Les épaules, coudes, poignets et mains de MediaPipe sont remplacés par ceux de
# RTMW quand RTMW est sûr (score ≥ RTMW_SUR) et que le point tombe dans la découpe ; sinon MediaPipe reste (secours).
RTMW = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/rtmw-dw-x-l_simcc-cocktail14_270e-384x288_20231122.onnx'
RTMW_SUR = 0.45
# MediaPipe ← COCO-WholeBody : coudes, poignets ; auriculaire, index, pouce (articulations de base de la main). Les ÉPAULES
# restent celles de MediaPipe (écart ≤ 11 px sur la cour) : elles portent le buste du squelette, qui passe la porte d'étirement
RTMW_MP = {13: 7, 14: 8, 15: 9, 16: 10, 17: 108, 19: 96, 21: 93, 18: 129, 20: 117, 22: 114}
VERSION_BRAS = 5   # 19/10/2026 : coudes, poignets et mains RTMW ; 3 : pas deux calques pour une même main (gestes.sans_doublon) ; 4-5 : corps mémorisé (la main ne glisse pas sur le corps)
_RTMW = {}


def bras_rtmw(img, a, alpha, pts):
    """pts MediaPipe (33 × 3) → (pts corrigés, {indice MediaPipe: écart en px}) ; img en RVB."""
    if not os.path.isfile(RTMW): return pts, {}
    if 'm' not in _RTMW:
        from rtmlib import RTMPose
        _RTMW['m'] = RTMPose(RTMW, model_input_size=(288, 384), backend='onnxruntime', device='cpu')
    kp, sc = _RTMW['m'](np.ascontiguousarray(img[..., ::-1]), bboxes=[[float(v) for v in a['bbox']]])   # BGR, comme les exemples de rtmlib
    kp, sc = kp[0], sc[0]; H, W = alpha.shape; p = np.array(pts, np.float64); dil = cv2.dilate((alpha > 0.5).astype(np.uint8), np.ones((9, 9), np.uint8))
    ecarts = {}
    for im_, ir in RTMW_MP.items():
        x, y = kp[ir]; s = float(sc[ir])
        if s < RTMW_SUR or not (0 <= x < W and 0 <= y < H) or not dil[int(y), int(x)]: continue
        ecarts[im_] = round(float(np.hypot(x - p[im_, 0], y - p[im_, 1])), 1)
        p[im_, 0], p[im_, 1] = x, y
        if p.shape[1] > 2: p[im_, 2] = max(float(p[im_, 2]), min(1.0, s))
    return p.round(2).tolist(), ecarts


def bras_v2(d, R, img, info):
    """scène déjà préparée : articulations des bras relues par RTMW et calques des bras refaits, sans toucher aux découpes,
    à la plaque ni au visage (quelques secondes par acteur au lieu de la préparation entière)."""
    S = json.load(open(f'{d}/scene.json'))
    for a in S['acteurs']:
        ent = info['acteurs'].get(a['nom']); s = a['slug']; fa = f'{R}/alpha-{s}.png'
        if not ent or not ent.get('pts') or not os.path.isfile(fa): continue
        al = cv2.imread(fa, cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535
        try: pts, ec = bras_rtmw(img, dict(a, pts=ent['pts']), al, ent['pts'])
        except Exception as ex: print(f"{a['nom']} : RTMW indisponible ({str(ex)[:80]})", flush=True); continue
        if not ec: continue
        ent['pts'] = pts; ent['bras_rtmw'] = {str(i): e for i, e in ec.items()}
        bras = gestes.prepare(img, al, pts, a['visage']['box'] if a.get('visage') else None, a['bbox'])
        _sauve_bras(f'{R}/bras-{s}.npz', bras); ent['bras'] = [(b['cote'], 'avant-bras' if b['nu'] else 'main', b['amax'], b['emax']) for b in bras]
        print(f"{a['nom']} : bras RTMW — écarts {ec} → {ent['bras']}", flush=True)
    info['version_bras'] = VERSION_BRAS
    json.dump(info, open(f'{R}/scene_rig.json', 'w'), ensure_ascii=False, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
    gestes.ferme()
    return info


def _score_pts(pts, alpha):
    p = np.asarray(pts, np.float64); H, W = alpha.shape
    if p.shape[0] < 33: return 0.0
    dil = cv2.dilate((alpha > 0.5).astype(np.uint8), np.ones((15, 15), np.uint8))
    xi, yi = np.clip(p[CLES, 0].astype(int), 0, W - 1), np.clip(p[CLES, 1].astype(int), 0, H - 1)
    ok = (p[CLES, 0] > 0) | (p[CLES, 1] > 0)
    vis = p[CLES, 2] if p.shape[1] > 2 else np.ones(len(CLES))
    return float((dil[yi, xi] * ok * np.clip(vis, 0, 1)).mean())


def assis(a):
    """assis : hanches presque à la hauteur des genoux (cuisses vers la caméra), ou indiqué dans la fiche."""
    p = rig2d.completer(a['pts'], a['bbox']); hip = p[[23, 24], 1].mean(); kn = p[[25, 26], 1].mean(); an = p[[27, 28], 1].mean()
    return bool(a.get('assis')) or bool((kn - hip) < 0.45 * max(1.0, an - kn))


def orphelins(img, alphas, pers, meuble=None, personne=None, portee=25):
    """pixels « personne » (segmentation) qui n'appartiennent à AUCUN acteur — vu le 17/10 sur la cour : une bande de la robe
    de Maman coincée entre elle et Petit Mamadou restait figée dans le décor (puis recopiée en « bouteille » par le
    remplissage) : chacun est rattaché à l'acteur le plus proche (≤ portee px), bord affiné par filtre guidé. Les alphas sont
    modifiées sur place. → nombre de pixels rattachés par acteur."""
    n = len(alphas); couvert = np.max(np.stack(alphas), 0) if n else np.zeros(pers.shape, np.float32)
    orph = (pers > 0.5) & (couvert < 0.3)
    if meuble is not None: orph &= ~((meuble > 0.5) & ((personne if personne is not None else 0) < 0.35))
    orph = cv2.morphologyEx(orph.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
    if not orph.any() or not n: return [0] * n
    dist = np.stack([cv2.distanceTransform((a < 0.5).astype(np.uint8), cv2.DIST_L2, 5) for a in alphas])
    qui = dist.argmin(0); proche = dist.min(0) <= portee; out = []
    for k in range(n):
        m = orph & proche & (qui == k)
        if m.sum() < 20: out.append(0); continue
        ys, xs = np.nonzero(m); x0, y0 = max(0, xs.min() - 8), max(0, ys.min() - 8); x1, y1 = min(m.shape[1], xs.max() + 9), min(m.shape[0], ys.max() + 9)
        g = m[y0:y1, x0:x1].astype(np.float32)
        try: f = cv2.ximgproc.guidedFilter(img[y0:y1, x0:x1].astype(np.float32) / 255, g, 3, 1e-4)
        except Exception: f = cv2.GaussianBlur(g, (0, 0), 0.8)
        alphas[k][y0:y1, x0:x1] = np.maximum(alphas[k][y0:y1, x0:x1], np.clip(f, 0, 1) * (cv2.dilate(g, np.ones((3, 3), np.uint8)) > 0))
        out.append(int(m.sum()))
    return out


def sans_couture(a, k=5):
    """INTÉRIEUR OPAQUE (18/10/2026) : le filtre guidé de la découpe et le bord de la complétion amodale laissaient, À
    L'INTÉRIEUR des personnages, des pixels d'alpha 0,5–0,9 (3 000 à 7 600 par acteur, coutures et voiles) où la plaque
    de fond transparaît — lignes fines sur le bras de Maman, voile sur les visages. Ce qui est à plus de 2 px du bord de la
    silhouette fermée (fentes de moins de `k` px comblées, vrais jours entre bras et corps gardés) devient opaque ; le bord
    garde son fondu."""
    m = cv2.morphologyEx((a > 0.5).astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    dedans = cv2.erode(m, np.ones((5, 5), np.uint8)).astype(np.float32)
    return np.maximum(a, cv2.GaussianBlur(dedans, (0, 0), 0.8)).astype(np.float32)

OS_CORPS = ((11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (11, 12), (11, 23),
            (12, 24), (23, 24), (23, 25), (25, 27), (27, 29), (29, 31), (27, 31), (24, 26), (26, 28), (28, 30), (30, 32), (28, 32))
_MT = {}
def magic_touch(img, box, point):
    """MediaPipe Interactive Segmenter (MagicTouch, Apache-2.0) sur le recadrage `box`, invité par UN point de l'image :
    probabilité « même objet que ce point », à la taille de l'image (0 hors du recadrage)."""
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    from mediapipe.tasks.python.components import containers
    if 's' not in _MT:
        p = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/magic_touch.tflite'
        _MT['s'] = vision.InteractiveSegmenterLegacy.create_from_options(vision.InteractiveSegmenterLegacyOptions(base_options=BaseOptions(model_asset_path=p), output_confidence_masks=True))
    H, W = img.shape[:2]; x0, y0, x1, y1 = [int(v) for v in box]; x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    c = np.ascontiguousarray(img[y0:y1, x0:x1]); h, w = c.shape[:2]; R = vision.InteractiveSegmenterLegacyRegionOfInterest
    r = _MT['s'].segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=c),
                         R(format=R.Format.KEYPOINT, keypoint=containers.keypoint.NormalizedKeypoint(float((point[0] - x0) / w), float((point[1] - y0) / h))))
    out = np.zeros((H, W), np.float32); out[y0:y1, x0:x1] = cv2.resize(r.confidence_masks[0].numpy_view().astype(np.float32), (w, h)); return out


def membres_rendus(img, alphas, acts, portee=25, aire_min=40):
    """MEMBRE RENDU À SON CORPS (18/10/2026). Le masque d'origine de Petit Mamadou contenait l'avant-bras de Maman Nounou
    posé contre sa tête (main sur la hanche) : la découpe de Maman l'excluait (« autres acteurs »), la complétion amodale
    le repeignait délavé derrière l'enfant (LaMa) et le vrai bras suivait la tête de l'enfant — bras translucide jugé
    « rendu » et « artefacts » par JEV sur les plans de la cachette (v31 : 50 + 50 + 18 images). Squelette (coude posé sur
    le tablier) et classes de la segmentation (peau contre peau) ne tranchent pas ; MagicTouch, invité par un point, si :
    le nez de l'enfant donne l'enfant seul, un point de l'avant-bras donne le bras entier de Maman (planche essai du 18/10).
    Règle : pour chaque acteur B qui a un visage, sa découpe hors de « l'objet de son nez » (MagicTouch) et à moins de
    `portee` px de la découpe d'un autre acteur forme des pièces douteuses ; chaque pièce est confiée à MagicTouch par son
    point le plus intérieur : si l'objet trouvé déborde dans le corps SÛR d'un autre acteur A (sa découpe sans ses propres
    pièces douteuses) et presque pas dans l'objet du nez de B, la pièce est un membre de A — elle lui est rendue (alpha
    déplacée, bord flou compris). → pixels rendus, par acteur qui les perd (alphas modifiées sur place)."""
    n = len(alphas); out = [0] * n
    if n < 2: return out
    pres = [cv2.distanceTransform((al < 0.5).astype(np.uint8), cv2.DIST_L2, 5) <= portee for al in alphas]
    objet, cand, boites = [None] * n, [np.zeros(alphas[0].shape, bool) for _ in range(n)], [None] * n
    for k in range(n):   # « l'objet de son nez » et les pièces douteuses (hors de cet objet, au contact d'un autre acteur)
        vb = acts[k].get('visage', {}).get('box') if acts[k].get('visage') else None
        if not vb: continue
        boites[k] = rig2d.boite(acts[k]['bbox'], img.shape, marge=0.3)
        objet[k] = magic_touch(img, boites[k], ((vb[0] + vb[2]) / 2, (vb[1] + vb[3]) / 2))
        autres = np.zeros(alphas[0].shape, bool)
        for j in range(n):
            if j != k: autres |= pres[j]
        cand[k] = (alphas[k] > 0.5) & (objet[k] < 0.3) & autres
    # le corps SÛR de chaque acteur : sa découpe sans ses pièces douteuses — sinon un membre mal attribué (le bras de Maman
    # dans la découpe de l'enfant) servirait de preuve pour lui prendre ce qui la touche (aller-retour vu à l'essai)
    sur = [(alphas[k] > 0.5) & ~cand[k] for k in range(n)]
    for b in range(n):
        if objet[b] is None: continue
        # garde : une pièce posée sur un os de B (bras, tronc, jambes, pieds) reste à B — à l'essai, MagicTouch invité sur les
        # orteils de Maman rendait aussi la sandale voisine de l'enfant
        P = np.asarray(acts[b]['pts'], np.float64); os_b = np.full(alphas[b].shape, 255, np.uint8)
        for i, j in OS_CORPS: cv2.line(os_b, tuple(int(round(v)) for v in P[i, :2]), tuple(int(round(v)) for v in P[j, :2]), 0, 1)
        loin_os = cv2.distanceTransform(os_b, cv2.DIST_L2, 5) > 0.3 * max(8.0, abs(P[11, 0] - P[12, 0]))
        ncc, lab, st, _ = cv2.connectedComponentsWithStats(cand[b].astype(np.uint8), connectivity=8)
        for c in range(1, ncc):
            if st[c, cv2.CC_STAT_AREA] < aire_min: continue
            m = lab == c; dt = cv2.distanceTransform(m.astype(np.uint8), cv2.DIST_L2, 5)
            py, px = np.unravel_index(int(np.argmax(dt)), dt.shape)
            if not loin_os[py, px]: continue
            mK = magic_touch(img, boites[b], (px, py)) > 0.5
            dans_b = int((mK & (objet[b] > 0.5)).sum())
            if dans_b > 0.2 * max(1, int(mK.sum())): continue
            a_ = max((j for j in range(n) if j != b), key=lambda j: int((mK & sur[j]).sum()))
            if int((mK & sur[a_]).sum()) < 0.3 * m.sum(): continue
            zone = (cv2.dilate(m.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0) & (objet[b] < 0.5)
            alphas[a_][zone] = np.maximum(alphas[a_][zone], alphas[b][zone]); alphas[b][zone] = 0.0; out[b] += int(m.sum())
    if 's' in _MT: _MT.pop('s').close()
    return out

def _sauve_bras(f, bras):
    d = {}
    for i, b in enumerate(bras):
        for k, v in b.items():
            if isinstance(v, np.ndarray): d[f'{i}__{k}'] = v
            else: d[f'{i}__{k}'] = np.array(json.dumps(v if not isinstance(v, (np.floating, np.integer)) else v.item()))
    np.savez_compressed(f, n=np.array(len(bras)), **d)


def charge_bras(f):
    z = np.load(f); out = []
    for i in range(int(z['n'])):
        b = {}
        for k in z.files:
            if not k.startswith(f'{i}__'): continue
            v = z[k]; kk = k.split('__', 1)[1]
            b[kk] = json.loads(str(v)) if v.dtype.kind in 'US' else v
        b['box'] = tuple(int(x) for x in b['box']); out.append(b)
    return out


AMODAL = 4   # 18/10/2026 : complétion amodale opaque + couverture au contact de deux personnes (plaque.amodal) ;
             # v3 : intérieur sans couture (sans_couture) ; v4 : liseré de celui de devant ôté de celui de derrière (v34)


VERSION_FILS = 2   # v35 : fil entrant dans une tête raccourci à un appui choisi par JEV (plaque.retracte_fils)


def juge_fil(vues):
    """JEV : probabilité de défaut de chaque vue (fil faux — traverse une tête, flotte, attaché à rien — ou rendu abîmé)."""
    import uuid
    from concurrent.futures import ThreadPoolExecutor
    import jev_api, jev_film
    Q = {'fil': {'type': 'noul', 'instructions': 'Read `contexte`. Look at the thin rope (clothesline) in `frame`. Does it look wrong: passing through a head, floating, ending in the air or attached to nothing?'},
         'rendu': {'type': 'noul', 'instructions': jev_film.N1['rendu'][1]}}
    def un(v):
        fid = 'frame-' + uuid.uuid4().hex[:10]; im = cv2.cvtColor(cv2.resize(v, (576, 460), interpolation=cv2.INTER_CUBIC), cv2.COLOR_RGB2BGR)
        a = jev_api.demande({'frame': fid, 'contexte': jev_film.STYLE}, Q, {fid: {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(im)}}, outil='juge_fil')
        return max(float(a['fil']['noul']), float(a['rendu']['noul']))
    with ThreadPoolExecutor(4) as ex: return list(ex.map(un, vues))


def fils_v2(d, R, img, info0, jev=True):
    """passage léger (plaque gardée) : les fils prolongés à travers une tête sont raccourcis (VERSION_FILS)."""
    S = json.load(open(f'{d}/scene.json')); acts = S['acteurs']
    alphas = [cv2.imread(f"{R}/alpha-{a['slug']}.png", cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535 for a in acts]
    pl = cv2.cvtColor(cv2.imread(f'{R}/plaque.png'), cv2.COLOR_BGR2RGB)
    pl, gardes, coupes = PQ.retracte_fils(img, pl, info0.get('fils', []), alphas, juge=juge_fil if jev else None)
    if coupes: cv2.imwrite(f'{R}/plaque.png', cv2.cvtColor(pl, cv2.COLOR_RGB2BGR))
    info0.update(fils=gardes, fils_coupes=info0.get('fils_coupes', []) + coupes, version_fils=VERSION_FILS)
    json.dump(info0, open(f'{R}/scene_rig.json', 'w'), indent=1, ensure_ascii=False)
    return info0


def prepare(d, jev=True, force=False):
    R = f'{d}/rig'; os.makedirs(R, exist_ok=True)
    S = json.load(open(f'{d}/scene.json')); img = cv2.cvtColor(cv2.imread(f'{d}/image.png'), cv2.COLOR_BGR2RGB)
    if os.path.isfile(f'{R}/scene_rig.json') and not force:
        info0 = json.load(open(f'{R}/scene_rig.json'))
        if info0.get('version_decoupe', 1) == VERSION_DECOUPE and info0.get('amodal') == AMODAL:
            if info0.get('version_fils', 1) != VERSION_FILS: info0 = fils_v2(d, R, img, info0, jev)
            if info0.get('version_bras', 1) != VERSION_BRAS and os.environ.get('BRAS_RTMW', '1') == '1': info0 = bras_v2(d, R, img, info0)
            return info0
    t0 = time.time(); acts = S['acteurs']
    m0s = [cv2.imread(f"{d}/{a['slug']}-masque.png", 0).astype(np.float32) / 255 for a in acts]
    alphas, boites, decoupes = [], [], []
    meuble, personne = objets.meubles(img)   # chaises, bancs, tables : restent dans le décor
    pers_tous = np.zeros(img.shape[:2], np.float32)
    for k, a in enumerate(acts):
        box = rig2d.boite(a['bbox'], img.shape); C = gestes.classes(img, box)
        al, perdu = rig2d.decoupe(img, m0s[k], box, C, autres=[m for j, m in enumerate(m0s) if j != k], meuble=meuble, personne=personne)
        ajoute = float(((m0s[k] < 0.5) & (al > 0.5)).sum() / max(1, (m0s[k] > 0.5).sum()))
        alphas.append(al); boites.append(box); decoupes.append({'decor_retire': round(perdu, 3), 'personne_ajoutee': round(ajoute, 3)})
        x0, y0, x1, y1 = [int(v) for v in box]; pers_tous[y0:y1, x0:x1] = np.maximum(pers_tous[y0:y1, x0:x1], np.clip(1 - C[0], 0, 1)[y0:y1, x0:x1])
    rendus = membres_rendus(img, alphas, acts)   # avant les orphelins : un membre mal attribué n'en est pas un
    orph = orphelins(img, alphas, pers_tous, meuble, personne)
    pts_fins = {}; ecarts_rtmw = {}
    for k, a in enumerate(acts):   # squelette re-détecté sur le recadrage agrandi, gardé s'il est meilleur
        L, sc_ = squelette(img, a, alphas[k]); s0 = _score_pts(a['pts'], alphas[k])
        if L is not None and sc_ > s0 + 0.02:
            a['pts'] = L.round(2).tolist(); pts_fins[a['nom']] = (round(s0, 3), round(sc_, 3))
        if os.environ.get('BRAS_RTMW', '1') == '1':
            try: a['pts'], ecarts_rtmw[a['nom']] = bras_rtmw(img, a, alphas[k], a['pts'])
            except Exception as ex: print(f"{a['nom']} : RTMW indisponible ({str(ex)[:80]}), articulations MediaPipe", flush=True)
    for k, a in enumerate(acts): decoupes[k]['orphelins_rattaches'] = orph[k]; decoupes[k]['membres_rendus'] = rendus[k]
    # le décor sans acteur et les parties cachées ne dépendent que des découpes : repris tels quels si elles n'ont pas
    # changé (corriger un squelette ou des bras ne refait pas 7 minutes de reconstitution)
    empreinte = empreinte_decoupes(alphas)
    ancien = json.load(open(f'{R}/scene_rig.json')) if os.path.isfile(f'{R}/scene_rig.json') else {}
    cache = ancien.get('empreinte_alphas') == empreinte and all(os.path.isfile(f'{R}/{f}') for f in ('plaque.png', 'trou.png', 'coherence.json')) \
        and all(os.path.isfile(f"{R}/alpha-{a['slug']}.png") for a in acts)
    # PLAQUE GARDÉE quand le trou des acteurs n'a pas grandi : un membre passé d'un acteur à l'autre ne change pas l'union
    # des découpes, donc pas le décor à reconstituer (7 minutes épargnées, décor identique)
    plaque_gardee = False
    if not cache and ancien and all(os.path.isfile(f'{R}/{f}') for f in ('plaque.png', 'trou.png')):
        t_new = np.zeros(img.shape[:2], np.uint8)
        for al_ in alphas: t_new |= (al_ > 0.02).astype(np.uint8)
        t_new = cv2.dilate(t_new, np.ones((13, 13), np.uint8)) > 0   # même halo que plaque.plaque_pleine (6 px)
        plaque_gardee = not (t_new & ~(cv2.imread(f'{R}/trou.png', 0) > 0)).any()
    if cache or plaque_gardee:
        pl = cv2.cvtColor(cv2.imread(f'{R}/plaque.png'), cv2.COLOR_BGR2RGB); trou = (cv2.imread(f'{R}/trou.png', 0) > 0).astype(np.uint8)
        inventes = [tuple(x) for x in ancien.get('inventes', [])]; faits = ancien.get('fils', []); ordre_noms = ancien.get('ordre', [a['nom'] for a in acts])
    if cache:
        finals = [(cv2.imread(f"{R}/alpha-{a['slug']}.png", cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535, ancien.get('acteurs', {}).get(a['nom'], {}).get('complete')) for a in acts]
    elif not plaque_gardee:
        pl, trou = PQ.plaque_pleine(img, alphas)
        pl, inventes = PQ.nettoie(img, pl, trou)   # restes d'acteur et objets inventés par le remplissage : rebouchés
        pl, faits = PQ.fils(img, pl, alphas)
        pl, faits, coupes_ = PQ.retracte_fils(img, pl, faits, alphas, juge=juge_fil if jev else None)   # fil entrant dans une tête (v35)
        cv2.imwrite(f'{R}/plaque.png', cv2.cvtColor(pl, cv2.COLOR_RGB2BGR)); cv2.imwrite(f'{R}/trou.png', trou * 255)
    if cache or plaque_gardee:   # plaque gardée d'avant la v35 : fil prolongé à travers une tête encore dessiné
        coupes_ = ancien.get('fils_coupes', [])
        if ancien.get('version_fils', 1) < VERSION_FILS:
            pl, faits, c2_ = PQ.retracte_fils(img, pl, faits, alphas, juge=juge_fil if jev else None); coupes_ = coupes_ + c2_
            if c2_: cv2.imwrite(f'{R}/plaque.png', cv2.cvtColor(pl, cv2.COLOR_RGB2BGR))
    alphas_avant = {}
    for a in acts:
        fa_ = f"{R}/alpha-{a['slug']}.png"
        if os.path.isfile(fa_): alphas_avant[a['nom']] = hashlib.md5(cv2.imread(fa_, cv2.IMREAD_UNCHANGED).astype(np.uint16).tobytes()).hexdigest()
    if not cache or ancien.get('amodal') != AMODAL:   # complétion amodale refaite seule quand sa méthode change (plaque gardée)
        am, ordre = PQ.amodal(img, alphas, personne=pers_tous); ordre_noms = [acts[k]['nom'] for k in ordre]; finals = []
        for k, a in enumerate(acts):
            a2, im2 = am[k]; comp = None; fin = alphas[k]
            if (a2 > alphas[k] + 0.01).any():
                diff = np.abs(im2.astype(np.int16) - img.astype(np.int16)).max(2) > 0
                ys, xs = np.nonzero(diff)
                if len(xs):
                    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
                    cv2.imwrite(f"{R}/complete-{a['slug']}.png", cv2.cvtColor(im2[y0:y1, x0:x1], cv2.COLOR_RGB2BGR)); comp = [x0, y0, x1, y1]
                fin = a2
            fin = sans_couture(fin)
            cv2.imwrite(f"{R}/alpha-{a['slug']}.png", np.clip(fin * 65535, 0, 65535).astype(np.uint16)); finals.append((fin, comp))
    info = {'acteurs': {}, 'ordre': ordre_noms, 'fils': faits, 'inventes': inventes, 'empreinte_alphas': empreinte, 'plaque_reprise': bool(cache or plaque_gardee),
            'version_bras': VERSION_BRAS if os.environ.get('BRAS_RTMW', '1') == '1' else 1,
            'version_fils': VERSION_FILS, 'fils_coupes': coupes_,
            'amodal': AMODAL, 'version_decoupe': VERSION_DECOUPE}
    for k, a in enumerate(acts):
        s = a['slug']; alphas[k], comp = finals[k]; ent = {'assis': assis(a), 'decoupe': decoupes[k], 'pts': a['pts']}
        if a['nom'] in pts_fins: ent['squelette_affine'] = {'score_avant': pts_fins[a['nom']][0], 'score_apres': pts_fins[a['nom']][1]}
        if ecarts_rtmw.get(a['nom']): ent['bras_rtmw'] = {str(i): e for i, e in ecarts_rtmw[a['nom']].items()}
        if comp: ent['complete'] = comp
        fb = a['visage']['box'] if a.get('visage') else None
        ent['empreinte_alpha'] = hashlib.md5(np.clip(alphas[k] * 65535, 0, 65535).astype(np.uint16).tobytes()).hexdigest()
        av = ancien.get('acteurs', {}).get(a['nom'], {})
        if av.get('bras') is not None and os.path.isfile(f'{R}/bras-{s}.npz') and av.get('empreinte_alpha', alphas_avant.get(a['nom'])) == ent['empreinte_alpha'] \
                and av.get('pts') == a['pts']:
            ent['bras'] = av['bras']   # découpe et squelette inchangés : calques des bras repris tels quels (rien ne bouge chez lui)
            if av.get('visage3d'): ent['visage3d'] = True
            info['acteurs'][a['nom']] = ent; continue
        bras = gestes.prepare(img, alphas[k], a['pts'], fb, a['bbox'])
        _sauve_bras(f'{R}/bras-{s}.npz', bras); ent['bras'] = [(b['cote'], 'avant-bras' if b['nu'] else 'main', b['amax'], b['emax']) for b in bras]
        if fb:
            m_ = 0.8 * (fb[2] - fb[0]); v3 = visage3d(img, (fb[0] - m_, fb[1] - m_, fb[2] + m_, fb[3] + m_))
            if v3 is not None: np.save(f'{R}/visage3d-{s}.npy', v3); ent['visage3d'] = True
        info['acteurs'][a['nom']] = ent
    if cache: rap = json.load(open(f'{R}/coherence.json'))
    else: rap = coherence.controle(img, pl, trou, alphas, [a['nom'] for a in acts], gestes.classes, faits, decoupes, jev=jev, inventes=inventes)
    json.dump(rap, open(f'{R}/coherence.json', 'w'), ensure_ascii=False, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
    info['coherence'] = {'incoherences': rap['incoherences']}; info['secondes'] = round(time.time() - t0, 1)
    # planche de contrôle : image | ancienne plaque | nouvelle plaque
    old = cv2.cvtColor(cv2.imread(f'{d}/plaque.png'), cv2.COLOR_BGR2RGB) if os.path.isfile(f'{d}/plaque.png') else img
    h = 420; row = [cv2.resize(x, (int(x.shape[1] * h / x.shape[0]), h)) for x in (img, old, pl)]
    cv2.imwrite(f'{R}/controle.jpg', cv2.cvtColor(np.hstack(row), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 85])
    json.dump(info, open(f'{R}/scene_rig.json', 'w'), ensure_ascii=False, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
    gestes.ferme()
    return info


if __name__ == '__main__':
    d = sys.argv[1]; jev = '--sans-jev' not in sys.argv
    print(json.dumps(prepare(d, jev=jev, force='--force' in sys.argv), ensure_ascii=False, indent=1))
