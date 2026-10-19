# TOURNAGE D'UNE VIDÉO À PARTIR DE SCÈNES GÉNÉRÉES PRÉPARÉES (16/10/2026)
# Chaque acteur reste dans SA scène (pixels d'origine du générateur : même style, même lumière, même échelle que le
# décor). Il joue sur place : visage LivePortrait (bouche sur les phonèmes, clignements), haut du corps plié autour du
# bassin (respiration, poids, ponctuation de la parole, recul de choc, secousse de rire), immobilité juste avant la chute.
# Grammaire de montage mesurée (vos TikTok, Afrikatoon, Ladjagaï) : plan d'ensemble à l'ouverture, une coupe par
# changement de locuteur, recadrage serré sur la chute, gros plan de réaction tenu, cartes émoji + titre entre sketchs.
# LE CADRE « À LA MESURE DE VOS TIKTOK » (17/10/2026) : le moteur est réglé sur les vidéos de l'utilisateur (faites avec
# Grok) et sur l'animation des studios, mesurées par cadre.py et jugées par JEV (jev_tiktok.py) :
#  · RYTHME : les répliques d'un même échange dans UN plan à deux (vos TikTok : plans de ~5 s, ~11 plans/min) ;
#  · CAMÉRA EN PROFONDEUR : chaque plan glisse et pousse doucement, et le décor suit à sa profondeur (Depth Anything V2,
#    Apache-2.0 ; méthode « 3D Ken Burns », Niklaus 2019, réécrite) : le loin bouge moins, le près plus — parallaxe ;
#  · JEU AMPLIFIÉ : buste, tête et corps entier (pas vers l'autre, sursaut, rebond sur la voix), comme l'exagération des
#    studios ; recadrage de la chute en coup de zoom fluide (plus de saut d'image).
# v18 (17/10/2026, juge JEV élargi : qualité des mouvements, fluidité, arrière-plan) :
#  · OUVERTURE : le plan d'ensemble n'est plus un plan à part ; chaque sketch s'ouvre large et la caméra POUSSE vers ceux
#    qui parlent (2,2 s) — trois coupes de moins, et le mouvement d'appareil des TikTok Grok (« slow push-in ») ;
#  · DÉCOR VIVANT (decor_vivant.py) : feuillages, linge, fumée, ampoules, bêtes animés par textures de mouvement
#    stochastiques (Chuang et al., SIGGRAPH 2005, réécrit), couches étiquetées par l'œil de JEV ;
#  · coup de zoom de la chute adouci (0,45 s : il n'est plus vu comme une coupe), jeu un peu plus ample.
# v19 (17/10/2026) :
#  · GESTES (gestes.py) : l'avant-bras et la main sont un calque (papiers découpés, méthode Live2D / DragonBones) qui
#    pivote au coude sur chaque réplique — accuser, marchander, expliquer ; les autres lèvent les mains à la chute ;
#  · CARTES SUR LA SCÈNE : l'émoji et le titre se posent sur la fin du sketch, image assombrie qui continue de vivre
#    (comme un texte TikTok), au lieu d'un écran noir coupé sec — deux coupes de moins par carte.
# v23 (17/10/2026, « contrôler le mouvement des corps avant de continuer » ; « je vois encore beaucoup d'étirements ») :
#  · SQUELETTE DE LA TÊTE AUX PIEDS (rig2d.py) : os rigides, articulations souples (ARAP), pieds plantés, mains en appui,
#    avant-bras détourés qui glissent devant le corps, tête qui tourne en 3D — plus d'étirement hors des articulations ;
#  · SCÈNE PRÉPARÉE (prepare_rig.py) : découpe de la personne entière (le linge ne suit plus Baye), plaque sans aucun
#    acteur à pleine résolution, fils réparés (le fil à linge ne s'arrête plus dans la tête de Maman), parties cachées
#    complétées, contrôle de cohérence (coherence.py) ;
#  · JEU ET RESSENTI (jeu.py) : chacun se tourne vers celui à qui il parle (Petit Mamadou parle à ses parents), regard
#    (regard.py), émotions qui naissent de ce qui est dit et entendu, ressorts critiques (aucun à-coup) ;
#  · VRAIES EXPRESSIONS (expressions_lp.py : LivePortrait MIT en ONNX, bibliothèque par personnage), sinon déformation
#    FACS du visage (expressions.py).
# Réglages (montage.json → "reglages") : plan_s, cam_px, pousse (travelling avant par plan), parallaxe, jeu_gain, corps, whip_s, ouverture, decor, gestes, carte_sur_scene, rig.
# python3 tourne.py montage.json sortie_dir
import json, math, os, sys, zlib, numpy as np, cv2
import decor_vivant, entites, gestes, linge, rig2d, regard, expressions, expressions_lp, jeu, memo, prepare_rig, vie_fond
import poses_dessinees as PD   # gestes dessinés : animation pose à pose (17/10/2026)
# 60 IMAGES PAR SECONDE (18/10/2026, « on doit aller à 60 images par seconde pour améliorer la fluidité ») : chaque image est
# tournée à son instant exact (bouche, regard, décor, bêtes, caméra) ; 30 i/s par défaut depuis le 19/10/2026 (accord de
# l'utilisateur : « oui pour 30 images par seconde », norme TikTok, deux fois moins d'images) ; FILM_FPS=60 rend la cadence double
FPS, CW, CH = int(os.environ.get('FILM_FPS', 30)), 576, 460
cfg = json.load(open(sys.argv[1])); OUT = sys.argv[2]; os.makedirs(f'{OUT}/clip', exist_ok=True)
REG = {'plan_s': 5.0, 'cam_px': 2.5, 'pousse': 1.10, 'parallaxe': 0.35, 'jeu_gain': 2.3, 'corps': 0.1, 'whip_s': 0.45, 'ouverture': 1.2, 'decor': 1.0, 'gestes': 1.0, 'carte_sur_scene': 1, 'rig': 1}
REG.update(cfg.get('reglages', {}))
ONLY = sys.argv[3] if len(sys.argv) > 3 else None  # essai : un seul sketch
T = json.load(open(cfg['timeline'])); total = T['total']; NF = int(math.ceil(total * FPS)); NF30 = int(math.ceil(total * 30))
H_ = json.load(open(cfg['histoire']))
# ── GREFFE DU VISAGE : LivePortrait (MIT) redessine toute la tête (entraîné sur de vrais visages, il « humanise » les
# proportions Pixar : crâne plus gros, cheveux changés — vu sur Modou le 16/10). On ne prend donc que la BOUCHE et les
# PAUPIÈRES, alignées point par point sur l'original (Face Landmarker, Apache-2.0 ; similitude par moindres carrés
# robustes) ; tout le reste de la tête reste l'image d'origine.
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
_FL = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/face_landmarker.task'), num_faces=1, min_face_detection_confidence=0.2))
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
# ── PROFONDEUR DU DÉCOR (Depth Anything V2 Small, Apache-2.0, ONNX) : calculée une fois par scène, gardée en cache ──
def profondeur(d, plate):
    # cache à l'EMPREINTE DE LA PLAQUE (v34) : v33 jugée par JEV — derrière Tantie Awa, « tête et mur au-dessus » 0,85 ; la
    # profondeur gardée datait d'une plaque où les acteurs étaient encore là (17/10, 9 h 49 ; plaque propre à 14 h 47) : leurs
    # silhouettes y étaient « proches » et, en parallaxe, le décor derrière eux glissait comme un objet du premier plan
    import hashlib
    cle = hashlib.md5(cv2.resize(plate, (96, 96), interpolation=cv2.INTER_AREA).tobytes()).hexdigest()[:10]
    cache = f'{d}/profondeur-{cle}-s1.png'   # -s1 : objets posés solidaires de leur support (19/10/2026)
    if os.path.isfile(cache): return cv2.imread(cache, 0).astype(np.float32) / 255
    import onnxruntime as ort
    s_ = ort.InferenceSession(os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/depth-anything-v2-small.onnx', providers=['CPUExecutionProvider'])
    H_, W_ = plate.shape[:2]; k = 518 / min(W_, H_); w, h = max(14, round(W_ * k / 14) * 14), max(14, round(H_ * k / 14) * 14)
    x = cv2.resize(plate, (w, h), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    dd = s_.run(None, {'pixel_values': x.transpose(2, 0, 1)[None]})[0][0]
    lo, hi = np.percentile(dd, 1), np.percentile(dd, 99); dd = np.clip((dd - lo) / max(1e-6, hi - lo), 0, 1)   # 1 = près
    dd = cv2.resize(dd.astype(np.float32), (W_, H_), interpolation=cv2.INTER_CUBIC)
    dd = objets_solidaires(plate, dd)
    cv2.imwrite(cache, (dd * 255).astype(np.uint8)); cv2.imwrite(f'{d}/profondeur.png', (dd * 255).astype(np.uint8))   # la courante, lue par entites
    return dd
def objets_solidaires(plate, dd):
    """OBJETS SOLIDAIRES DE LEUR SUPPORT (19/10/2026) : sur le maquis, Depth Anything mettait la viande du plat plus loin
    (0,62) que le bord du plat (0,89) ; en poussée de caméra la viande glissait sur le plat (0,3 px par image, mesuré). Un
    objet posé (ADE20K : assiette, nourriture, verre, bouteille, plateau, marmite) prend la profondeur de son support : la
    médiane d'une bande juste sous lui ; bord adouci."""
    try:
        import objets, prepare_rig
        P_ = objets.probas(plate, {'objet': prepare_rig.OBJETS_POSES})
    except Exception: return dd
    if P_ is None: return dd
    obj = cv2.morphologyEx((P_['objet'] > 0.5).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    n_, lab_, st_, _ = cv2.connectedComponentsWithStats(obj); out_ = dd.copy(); poids = np.zeros_like(dd)
    for i_ in range(1, n_):
        x_, y_, w_, h_, a_ = st_[i_]
        if a_ < 80: continue
        c_ = lab_ == i_; bas = np.zeros_like(c_); y1_ = min(dd.shape[0], y_ + h_ + max(4, h_ // 4))
        bas[y_ + h_:y1_, x_:x_ + w_] = True; bas &= ~c_
        if bas.sum() < 20: continue
        out_[c_] = float(np.median(dd[bas])); poids[c_] = 1.0
    if not poids.any(): return dd
    poids = cv2.GaussianBlur(cv2.dilate(poids, np.ones((5, 5), np.uint8)), (0, 0), 2.0)
    out_ = cv2.GaussianBlur(out_, (0, 0), 1.0)
    return (dd * (1 - poids) + out_ * poids).astype(np.float32)
def facteur_parallaxe(dep, acts, H_, W_):
    """vitesse apparente de chaque point du décor par rapport aux acteurs : 1 au niveau de leurs pieds, 1 − P au plus
    loin, jusqu'à 1 + P/2 au premier plan ; lissée pour ne jamais déchirer l'image."""
    P = REG['parallaxe']; pieds = []
    for A in acts.values():
        x0, y0, x1, y1 = A['bbox']; pieds.append(float(dep[min(H_ - 1, int(y1) - 2), min(W_ - 1, max(0, int((x0 + x1) / 2)))]))
    df = float(np.median(pieds)) if pieds else 0.6; lo, hi = float(dep.min()), float(dep.max())
    k = np.where(dep <= df, 1 - P * (df - dep) / max(1e-3, df - lo), 1 + 0.5 * P * (dep - df) / max(1e-3, hi - df))
    return cv2.GaussianBlur(k.astype(np.float32), (0, 0), 6)
def main_posee_jev(d, img, P_, cote, nom, epw):
    """JEV regarde la main (recadrage autour du poignet) : posée sur une table, un comptoir, ou tenant un objet ? (cache
    <scène>/rig/mains_jev.json). Probabilité de « posée » ; 0 si le poignet est hors de l'image."""
    f = f'{d}/rig/mains_jev.json'; C = json.load(open(f)) if os.path.isfile(f) else {}
    cle = f'{nom}|{cote}'
    if cle in C: return C[cle]
    i = 15 if cote == 'l' else 16; H_, W_ = img.shape[:2]; x, y = float(P_[i, 0]), float(P_[i, 1]); r = int(0.55 * epw)
    if not (0 <= x < W_ and 0 <= y < H_): return 0.0
    cr = img[max(0, int(y) - r):int(y) + r, max(0, int(x) - r):int(x) + r]
    if cr.size == 0: return 0.0
    import uuid, jev_api
    fid = 'frame-' + uuid.uuid4().hex[:10]; im = cv2.cvtColor(cv2.resize(cr, (384, 384), interpolation=cv2.INTER_CUBIC), cv2.COLOR_RGB2BGR)
    try:
        a_ = jev_api.demande({'frame': fid}, {'posee': {'type': 'noul', 'instructions': 'In `frame` (a close-up around a cartoon character\'s hand), is the hand resting on a table, a counter or a plate, or holding an object such as cutlery, a cup, a glass or a phone? A hand on the hip, on the body or free in the air does not count.'}},
                             {fid: {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(im)}}, outil='main_posee')
        p_ = round(float(a_['posee']['noul']), 3)
    except Exception as e_:
        print(f'{nom}: main {cote} non jugée ({e_})', flush=True); return 0.0
    C[cle] = p_; json.dump(C, open(f, 'w'), indent=1, ensure_ascii=False); return p_
# ── scènes préparées ──
SC = {}; _PREP = {}
for sk in T['sketchs']:
    if ONLY and sk['id'] != ONLY: continue
    d = cfg['scenes'][sk['id']]
    # SCÈNE PRÉPARÉE UNE FOIS (18/10/2026, « réduis encore le temps de traitement ») : l'épisode 1 joue ses trois sketchs
    # dans la même cour, que le tournage préparait trois fois (squelettes, bibliothèques de visages, enveloppes, profondeur,
    # décor vivant, linge : 70 s sur 110 au profil de 60 images). Les sketchs suivants reprennent la préparation ; chacun
    # garde ses propres fiches d'acteur (copie superficielle) et ses bêtes, choisies par sketch dans le montage.
    if d in _PREP:
        S, img, plate, betes, acts, prof_, kpar, vie, lin, vf, xs_, ys_ = _PREP[d]; acts = {n_: dict(A_) for n_, A_ in acts.items()}
    else:
        S = json.load(open(f'{d}/scene.json'))
        img = cv2.cvtColor(cv2.imread(f'{d}/image.png'), cv2.COLOR_BGR2RGB); plate = cv2.cvtColor(cv2.imread(f'{d}/plaque.png'), cv2.COLOR_BGR2RGB)
        rinfo = prepare_rig.prepare(d) if REG['rig'] else None   # une fois par scène (cache <scène>/rig/)
        if rinfo: plate = cv2.cvtColor(cv2.imread(f'{d}/rig/plaque.png'), cv2.COLOR_BGR2RGB)
        # bêtes peintes du décor rendues vivantes (v34) — REPRISES (v35) : jugées par JEV dans la chambre, « poules » 0,81–0,88
        # (sans ombre, mauvaise taille, qui flottent ; plan de Tantie Awa 38 → 79 images refusées) : désactivées par défaut
        plate, betes = entites.betes_peintes(d, img, plate) if REG['decor'] > 0 and REG.get('betes_peintes', 0) else (plate, [])
        acts = {}
        for a in S['acteurs']:
            if rinfo and rinfo['acteurs'].get(a['nom'], {}).get('pts'): a['pts'] = rinfo['acteurs'][a['nom']]['pts']   # squelette affiné à la préparation
            m = cv2.imread(f"{d}/{a['slug']}-masque.png", 0).astype(np.float32) / 255
            lib = {}; vd = f"{d}/visages/{a['slug']}"
            if os.path.isfile(f'{vd}/etats.json'):
                lib = memo.memo(greffe_visage, img, vd, a, _cle=(img, memo.dossier(vd), a), _fonction_seule=True)   # cache disque (18/10)
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
            if rinfo:   # squelette de la tête aux pieds (rig2d) sur la découpe de la personne entière
                sl = a['slug']; A_ = acts[a['nom']]; ent = rinfo['acteurs'].get(a['nom'], {})
                al = cv2.imread(f'{d}/rig/alpha-{sl}.png', cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535; im_a = img
                if ent.get('complete'):
                    x0c, y0c, x1c, y1c = ent['complete']; im_a = img.copy(); im_a[y0c:y1c, x0c:x1c] = cv2.cvtColor(cv2.imread(f'{d}/rig/complete-{sl}.png'), cv2.COLOR_BGR2RGB)
                v3 = np.load(f'{d}/rig/visage3d-{sl}.npy') if os.path.isfile(f'{d}/rig/visage3d-{sl}.npy') else None
                bras_ = prepare_rig.charge_bras(f'{d}/rig/bras-{sl}.npz') if os.path.isfile(f'{d}/rig/bras-{sl}.npz') else []
                assis_ = prepare_rig.assis(a); box_ = rig2d.boite(a['bbox'], img.shape)
                R_ = rig2d.preparer(im_a, al, a['pts'], a['bbox'], memo.memo(gestes.classes, img, box_), plaque=plate, bras=bras_, segmente=gestes.classes, visage3d=v3, assis=assis_)
                dl = f'{d}/expressions/{sl}'
                A_['xl'] = expressions_lp.charge_rapide(dl, im_a, v3, alpha=R_['alpha_corps']) if os.path.isfile(f'{dl}/meta.json') and v3 is not None else None   # la découpe suit le visage
                src00 = im_a   # le visage tel qu'il sera tourné au repos : les yeux du regard sont pris dessus (pas de saut au premier coup d'œil)
                if A_['xl']: src00 = expressions_lp.colle(im_a, A_['xl'], expressions_lp.visage(A_['xl'], {}, 0.0))
                elif lib:
                    Rr = lib['roi']; src00 = im_a.copy(); src00[Rr[1]:Rr[3], Rr[0]:Rr[2]] = np.clip(lib[(0, 0)], 0, 255).astype(np.uint8)
                env_ = memo.memo(rig2d.enveloppe, R_, _cle=(im_a, al, a['pts'], a['bbox'], plate, bras_, v3, assis_, box_), _deps=('gestes.py', 'prepare_rig.py'))   # 21 s → 0 au 2e tour
                # AVIS DE JEV (17/10, contrôle image par image de la v26) :
                # — main POSÉE sur le corps (poing sur la hanche) : le geste pliait l'avant-bras et la main glissait sur la robe
                #   (Maman, « bras ou mains » 0,73 ; remède désigné « garder la main posée ») → ce bras suit le buste, sans geste ;
                P_ = np.asarray(a['pts'], np.float64); epw = max(1.0, abs(P_[11, 0] - P_[12, 0]))
                # — main posée (hanche, table) : 19/10/2026, « les personnages ne sont pas encore fluides dans leurs gestes » — la main
                #   ne pivote plus SUR place (glissement vu par JEV, v26 et v33) : elle QUITTE son appui et se lève (gestes.enveloppe_revelee :
                #   le bras découvre sa place, reconstituée et contrôlée), comme l'orateur réel qui quitte la position de repos pour
                #   gesticuler. Seule une main seule (manche longue) sur la hanche reste sans geste : pivotée au poignet, elle glisserait.
                for k_, b_ in enumerate(R_['bras']):
                    x0b, y0b, x1b, y1b = b_['box']; poings = [i for i in (15, 16) if x0b - 0.1 * epw <= P_[i, 0] <= x1b + 0.1 * epw and y0b - 0.1 * epw <= P_[i, 1] <= y1b + 0.1 * epw]
                    hanche = any(min(np.hypot(*(P_[i, :2] - P_[h, :2])) for h in (23, 24)) < 0.55 * epw for i in poings)
                    posee = R_['contacts'].get(b_['cote'], ('libre', None))[0] == 'monde' or main_posee_jev(d, img, P_, b_['cote'], a['nom'], epw) > 0.6
                    # MAIN SUR LA HANCHE : AUCUN GESTE, bras nu compris (19/10/2026, v11 : « la main de Tantie traverse son corps ») —
                    # tourné au coude, l'avant-bras fait glisser la main sur la robe (16° encore visibles, 28° sur le ventre) ;
                    # le poing reste posé et suit le buste, comme le demandait JEV dès la v26
                    ev = gestes.enveloppe_revelee(bras_[k_]) if REG.get('geste_revele', 1) and k_ < len(bras_) and not hanche else {'revele': False}
                    appui = 'hanche' if hanche else 'table' if posee else 'libre'
                    if ev['revele']:
                        b_['amax'] = max(float(b_.get('amax', 0.0)), ev['amax']); b_['revele'] = True
                        print(f"{a['nom']}: {'avant-bras' if b_['nu'] else 'main'} {b_['cote']} (appui {appui}) — geste jusqu'à {b_['amax']:.0f}°, sa place reconstituée (fantôme {ev['fantome']}, couleur étrangère {ev['etranger']})", flush=True)
                    elif hanche or posee:
                        b_['amax'], b_['emax'] = 0.0, 1.0; print(f"{a['nom']}: main posée ({appui}) — bras sans geste ({'main seule' if not b_['nu'] else 'fond refusé ' + str(ev)})", flush=True)
                # — visage DÉJÀ de trois quarts : le lacet ajouté étirait le menton et décollait la barbiche (Koffi, 0,83 ; remède
                #   désigné « lacet au plus 6° pour les visages de trois quarts »)
                if v3 is not None:
                    r_ = (v3[1, 0] - v3[33, 0]) / max(1e-6, v3[263, 0] - v3[33, 0])
                    # ORIENTATION DÉJÀ PEINTE (18/10/2026) : nez entre les yeux → lacet du visage dessiné (+ = vers la droite de
                    # l'écran ; modèle tête ronde, nez en avant de 0,55 × l'écart des yeux : tan θ = 1,8 (r − 0,5)). Le jeu ne
                    # tourne la tête que de ce qui MANQUE pour regarder l'autre : Koffi et Baye, peints de trois quarts vers leur
                    # partenaire, restaient collés à la borne de 6° (5,96–5,98 sur tous leurs plans de la v31) et le relief 3D
                    # étirait nez, menton et barbiche (carte d'étirement : 24 % sur le visage de Baye à 6°)
                    env_['lacet_peint'] = round(math.degrees(math.atan(1.8 * (r_ - 0.5))), 1)
                    if abs(r_ - 0.5) > 0.12 and env_.get('tete_lacet', 0) > 6.0:
                        env_['tete_lacet'] = 6.0; print(f"{a['nom']}: visage de trois quarts (nez à {r_:.2f} entre les yeux) — lacet limité à 6°", flush=True)
                A_.update(rig=R_, img=im_a, mask=cv2.GaussianBlur(al, (0, 0), 0.5), assis=assis_, env=env_, bras=[], marge_bras=0)
                # GESTES DESSINÉS COLLÉS : RETIRÉS (17/10/2026). L'utilisateur : « Mais ça a changé le personnage ». JEV, sur les 8
                # poses collées dans la cour : identité 0,15 à 0,29 (cause « planche dessinée avec un autre visage, un autre âge,
                # d'autres détails de costume » 0,99) ; remède désigné : garder les pixels du personnage et ne prendre de la
                # planche que la cible du squelette (bras_articules.py). Ces bras articulés n'entrent au tournage que lorsque la
                # porte de JEV (identité > 0,5 ET défaut < 0,5 sur chaque pose) les accepte — 17/10 : défaut 0,64 à 0,93, refusés.
                A_['dessins'] = {}
                A_['yeux'] = regard.prepare(src00, v3)
                A_['expr'] = memo.memo(expressions.prepare, im_a, v3, yeux=A_['yeux'])
                print(f"{a['nom']}: squelette ({'assis' if assis_ else 'debout'}, enveloppe {A_['env']}, {len(R_['bras'])} avant-bras détourés, "
                      f"regard {'oui' if A_['yeux'] else 'non'}, expressions {'dessinées' if A_['xl'] else 'déformées'})", flush=True)
                continue
            bras = gestes.prepare(img, acts[a['nom']]['mask'], a['pts'], a['visage']['box'] if a.get('visage') else None, a['bbox']) if REG['gestes'] > 0 else []
            acts[a['nom']]['bras'] = bras; acts[a['nom']]['marge_bras'] = int(max([1.1 * b_['lf'] for b_ in bras], default=0))
            print(f"{a['nom']}: gestes {[(b_['cote'], 'avant-bras' if b_['nu'] else 'main') for b_ in bras]}", flush=True)
        for n_, A_ in acts.items():   # de quel côté est le partenaire le plus proche (le « pas vers l'autre »)
            autres = [B for m_, B in acts.items() if m_ != n_]
            A_['cote'] = 0.0 if not autres else float(np.sign(min(autres, key=lambda B: abs(B['hip'][0] - A_['hip'][0]))['hip'][0] - A_['hip'][0]) or 1.0)
        ys_, xs_ = np.mgrid[0:img.shape[0], 0:img.shape[1]].astype(np.float32)
        prof_ = profondeur(d, plate) if REG['parallaxe'] > 0 or REG['decor'] > 0 else None
        kpar = facteur_parallaxe(prof_, acts, img.shape[0], img.shape[1]) if REG['parallaxe'] > 0 else None
        vie = decor_vivant.prepare(d, plate, [A_['mask'] for A_ in acts.values()]) if REG['decor'] > 0 else None
        lin = linge.prepare(d, plate, [A_['mask'] for A_ in acts.values()]) if REG['decor'] > 0 else None   # linge détouré par SAM 2.1, épinglé, au vent (v34)
        # VIE DU FOND GARANTIE (v35, vie_fond.py) : ombre de feuillage sur la moitié haute du mur, oiseaux dans le ciel du cadre
        vf = vie_fond.prepare(plate, prof_, [A_['mask'] for A_ in acts.values()]) if REG['decor'] > 0 and REG.get('vie_fond', 1) and prof_ is not None else None
        if vf is not None and not betes:   # bêtes peintes restées dans la plaque : leur ombre physique (v35, vie_fond.ombres_peintes)
            Lp_ = (json.load(open(f'{d}/genese.json')).get('L') if os.path.isfile(f'{d}/genese.json') else None) or \
                  entites.physique.lumiere(img, [(A_['mask'] if A_['mask'].ndim == 2 else A_['mask'][..., 0], A_['bbox'], not A_.get('assis')) for A_ in acts.values()])
            plate = memo.memo(vie_fond.ombres_peintes, img, plate, Lp_, [A_['mask'] for A_ in acts.values()], _deps=('linge.py',))   # SAM : 15 s → 0 au 2e tour
        _PREP[d] = (S, img, plate, betes, acts, prof_, kpar, vie, lin, vf, xs_, ys_)
    n_ent = int((REG.get('entites') or {}).get(sk['id'], 0))   # bêtes du décor (poules) : nombre choisi par sketch dans le montage
    ents = betes or (entites.prepare(d, img.shape[0], img.shape[1], [(A_['bbox'], not A_.get('assis')) for A_ in acts.values()], n=n_ent, lieu=sk.get('lieu')) if n_ent else [])
    gen = entites.genese_poule(d, img, [(A_['mask'] if A_['mask'].ndim == 2 else A_['mask'][..., 0], A_['bbox'], not A_.get('assis')) for A_ in acts.values()], ents) if ents else {}
    if ents: print(f"{sk['id']}: poule créée par JEV (genèse) : {gen.get('style', {}).get('sprite')}, note {gen.get('note')} / référence {gen.get('reference')}", flush=True)
    SC[sk['id']] = dict(img=img, plate=plate, acts=acts, H=img.shape[0], W=img.shape[1], sk=sk, xs=xs_, ys=ys_, kpar=kpar, vie=vie, ents=ents, linge=lin,
                        lum=gen.get('L'), style_ent=gen.get('style'), vf=vf)
    if vf is not None:   # carte de contrôle hors du dossier de la scène (son empreinte entre dans celle des plans)
        print(f"{sk['id']}: vie du fond — {len(vf['feuilles'])} feuilles en ombre sur {int(vf['mur'].sum())} px de mur (bas du houppier y = {int(vf['y_lim'].min())}–{int(vf['y_lim'].max())} / {vf['H']}), ciel {100 * vf['ciel'].mean():.0f} %", flush=True)
        cv2.imwrite(f"{OUT}/vie_fond-{sk['id']}.jpg", cv2.cvtColor(vie_fond.carte(vf, plate), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])
gestes.ferme()
JOURNAL_JEU = []
def visee_(A2):
    """REGARD DANS L'AXE (v36) — « Mamie ne regarde pas Baye » : pour chaque personnage, où est le VISAGE de chacun des
    autres vu de ses yeux, en hauteur (le côté, jeu.py le prend déjà) : inclinaison en degrés (> 0 = plus bas, un assis) et
    hauteur de regard en fraction de la course de l'iris (course complète ≈ 30°)."""
    def yeux_de(A):
        if A.get('yeux'): return np.mean([e['c'] for e in A['yeux']], 0)
        v = A['a'].get('visage')
        return None if not v else np.array([(v['box'][0] + v['box'][2]) / 2, v['box'][1] + 0.45 * (v['box'][3] - v['box'][1])])
    def visage_de(A):
        v = A['a'].get('visage')
        return None if not v else np.array([(v['box'][0] + v['box'][2]) / 2, (v['box'][1] + v['box'][3]) / 2])
    out = {}
    for n, A in A2.items():
        e = yeux_de(A); out[n] = {}
        if e is None: continue
        for m, B in A2.items():
            f = visage_de(B)
            if m == n or f is None: continue
            incl = math.degrees(math.atan2(float(f[1] - e[1]), max(1.0, abs(float(f[0] - e[0])))))
            out[n][m] = (float(np.clip(incl / 30.0, -0.8, 1.0)), float(np.clip(incl, -20.0, 20.0)))
    return out
if REG['rig']:   # pistes de jeu et ressenti de chaque personnage, image par image, pour tout le film
    # MOTEUR IMAGE → VIDÉO (17/10) : couche « vrai humain » (capture CMU calée sur les syllabes), dynamique du second ordre,
    # regard vivant ; réglages mocap / dyn / yeux / suivi_tete (tous à 0 : jeu de la v27, pour les essais A/B jugés par JEV)
    RJ = {k: REG.get(k, d) for k, d in (('mocap', 1.0), ('dyn', 1), ('yeux', 1), ('suivi_tete', 1), ('ampleur', 1.0), ('lacet_visage', jeu.LACET_VISAGE))}
    def gestes_fluides(A2, P):
        """GARDE DE FLUIDITÉ DES BRAS (19/10/2026) : les gestes sont des fractions (0–1) de l'angle permis ; depuis que les bras
        peuvent découvrir leur place (20–28° au lieu de 0–14°), la même piste donne des à-coups plus forts — essai du 19/10, bras
        de Koffi : 2e différence 2,9°/image² pour 2,5 admis. La garde de la tête et du buste (jeu.lisse_acc, 30 i/s) est appliquée
        à l'ANGLE réel de chaque bras, puis ramenée en fraction."""
        for n, A in A2.items():
            if not A.get('rig') or n not in P: continue
            for k, b in enumerate(A['rig']['bras']):
                c = f'geste_{k}'; am = float(b.get('amax', 0.0))
                if c in P[n] and am > 1e-3:
                    P[n][c] = np.clip(jeu.lisse_acc(np.asarray(P[n][c], np.float32) * am, 30) / am, 0, 1).astype(np.float32)
        return P
    def _a_la_cadence(P):
        """pistes du jeu calculées à 30 i/s (la capture CMU, les ressorts et la garde de fluidité y sont réglés) → cadence du
        film par interpolation cubique monotone (PCHIP : vitesse continue, aucun dépassement sur un clignement ou une saccade)"""
        if FPS == 30: return P
        from scipy.interpolate import PchipInterpolator
        t30 = np.arange(NF30) / 30.0; tf = np.minimum(np.arange(NF) / FPS, t30[-1])
        return {n: {k: (PchipInterpolator(t30, np.asarray(v, np.float64))(tf).astype(np.float32) if isinstance(v, np.ndarray) and len(v) == NF30 else v)
                    for k, v in d.items()} for n, d in P.items()}
    for sid, S_ in SC.items():
        A2 = S_['acts']
        print(f"{sid}: regard peint", {n: [round(v, 2) for v in regard.peint(A.get('yeux'))] for n, A in A2.items()}, "; visée", {n: {m: [round(x, 2) for x in v] for m, v in d.items()} for n, d in visee_(A2).items()}, flush=True)
        S_['pistes'] = _a_la_cadence(gestes_fluides(A2, jeu.pistes(T['lines'], sid, list(A2), {n: float(A['hip'][0]) for n, A in A2.items()}, {n: A.get('assis', False) for n, A in A2.items()},
                                  {n: A.get('env', {}) for n, A in A2.items()}, NF30, 30, {n: len(A['rig']['bras']) if A.get('rig') else 0 for n, A in A2.items()},
                                  echelles={n: float(A['rig']['M']['sw']) / 0.38 for n, A in A2.items() if A.get('rig')},   # largeur d'épaules humaine ≈ 0,38 m
                                  cotes_bras={n: [b['cote'] for b in A['rig']['bras']] for n, A in A2.items() if A.get('rig')},
                                  reglages=RJ, journal=JOURNAL_JEU, visee=visee_(A2), peints={n: regard.peint(A.get('yeux')) for n, A in A2.items()})))
LIPS, EYES = (0.0, 0.25, 0.5, 0.75, 1.0), (0.0, 0.5, 1.0)
SEATED = {'BAYE NDIAYE': True, 'KOFFI': True, 'COUMBA': True}
lines = T['lines']
def line_at(t, qui=None):
    for L in lines:
        if L['t0'] - 0.02 <= t <= L['t0'] + L['dur'] + 0.02 and (qui is None or L['qui'] == qui): return L
    return None
def montre(L, x):
    """phonème montré à l'image x (s depuis le début de la réplique). Exposition des animateurs 2D : la bouche devance le son
    d'une image (40 ms), SAUF au cœur de chaque phonème, montré tel quel jusqu'à une image après son centre. v29 : JEV
    prélève l'image ceil(t × 30) au centre de chaque segment (0 à 33 ms après) ; l'anticipation de 40 ms y montrait souvent
    le phonème suivant — une voyelle courte devant un « m » était déjà fermée, un « m » court déjà rouvert."""
    P = L['phonemes']
    if P and x < P[0]['t0']: x += 0.04
    for i, p in enumerate(P):
        if p['t0'] <= x < p['t1']:
            if x < (p['t0'] + p['t1']) / 2 + 1 / FPS: return p
            for q in P[i:]:
                if q['t0'] <= x + 0.04 < q['t1']: return q
            return None
    return None
def jaw(L, t):
    # ouverture visée par le phonème montré, adoucie sur ±50 ms, modulée par l'énergie réelle de la voix
    x = t - L['t0']; p = montre(L, x)
    # LÈVRES JOINTES SUR M, B, P (forme A de Rhubarb) ET AUX SILENCES (X) — avis de JEV sur la v25 (17/10) puis la v29
    # (18/10) : bouche vue fermée 16 fois sur 17 quand la commande vaut ≤ 0,05, 8 fois sur 31 au-delà. Règle des
    # animateurs : la bouche se ferme sur chaque bilabiale ; le lissage ne joue qu'aux transitions, pas au cœur de la consonne.
    if p is None or p['ph'] in ('A', 'X'): return 0.0
    acc = 0.0
    for dx, w in ((-0.05, 0.25), (0.0, 0.5), (0.05, 0.25)):
        q = montre(L, x + dx); acc += w * (q['open'] / 4 if q else 0.0)
    e = L['env'][min(len(L['env']) - 1, max(0, int(x * 100)))]
    # amplitude exagérée (les visages font 40 à 80 px dans les plans moyens : une bouche à mi-ouverture y est invisible,
    # mesuré le 16/10) ; la puissance < 1 relève les ouvertures moyennes, les consonnes fermées restent fermées
    return float(np.clip((acc * (0.55 + 0.6 * e)) * 1.5 + 0.1 * e, 0, 1) ** 0.85)
VOYELLE_OUVERTE = 0.85   # v29 jugée par JEV : bouche vue « ouverte » 16/16 à commande ≥ 0,8 ; 13/16 entre 0,6 et 0,8 ; 7/11 entre 0,4 et 0,6
def machoire(name, t):
    """ouverture de la bouche lissée sur ±2 images (aucun saut d'un état à l'autre) entre deux cœurs de phonèmes ; au cœur,
    la forme est TENUE : lèvres jointes sur m, b, p et silences, voyelle ouverte (a, è, o : formes C, D, E de Rhubarb)
    franchement ouverte. v29 : le lissage rouvrait les « m » courts à 0,3–0,6 (31 instants jugés sur 48) et laissait les
    voyelles à 0,4–0,7, que JEV ne voyait pas ouvertes."""
    Lc = line_at(t, name)
    if Lc and jaw(Lc, t) == 0.0: return 0.0
    jj = wsum = 0.0
    for dt, w_ in ((-2, 0.1), (-1, 0.2), (0, 0.4), (1, 0.2), (2, 0.1)):
        tt = t + dt / 30.0; Lx = line_at(tt, name); jj += w_ * (jaw(Lx, tt) if Lx else 0.0); wsum += w_
    jj /= wsum
    if Lc:
        x = t - Lc['t0']; p = montre(Lc, x)
        if p and p['open'] >= 2.2 and abs(x - (p['t0'] + p['t1']) / 2) <= 1 / FPS: jj = max(jj, VOYELLE_OUVERTE, jaw(Lc, t))
    return jj
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
            u = t - jeu.prise_t(C)   # même instant que la prise de choc du visage (jeu.py)
            if 0 <= u < 1.8: lean -= 4.5 * ease(u / 0.2) * (1 - ease((u - 1.3) / 0.5)); rot = 0
    # immobilité avant la chute (15 images) : seul le souffle reste, très bas
    for C in CHUTES:
        if C['sketch'] == sk and -0.5 <= t - C['t0'] < 0.0: rot *= 0.1; head *= 0.1; breath *= 0.3
    G = REG['jeu_gain']   # exagération des studios : même jeu, plus grand
    return (rot + lean + shake) * AMP * G, head * G, breath
def corps(name, t, sk, A):
    """le CORPS ENTIER se déplace sur la plaque propre : pas vers l'autre (accuse, marchande), sursaut en arrière (choc,
    réaction à la chute), rebond sur la voix et sur le rire. Assis : quatre fois moins."""
    g = REG['corps'] * A['sh']; amp = 0.25 if SEATED.get(name) else 1.0; side = A.get('cote', 1.0); dx = dy = 0.0
    L = line_at(t, name)
    if L:
        u = t - L['t0']; e = L['env'][min(len(L['env']) - 1, int(u * 100))]
        k = ease(u / 0.3) * (1 - ease((u - L['dur'] + 0.25) / 0.4)); j = L.get('jeu', '')
        dy -= 0.35 * g * e * abs(math.sin(2 * math.pi * 1.7 * u))
        if j in ('accuse', 'marchande', 'soupcon'): dx += 1.2 * g * k * side
        if j == 'choc': dx -= 1.0 * g * ease(u / 0.15) * side; dy -= 0.8 * g * max(0.0, math.sin(math.pi * min(1.0, u / 0.35)))
        if j == 'rire': dy -= 0.6 * g * abs(math.sin(2 * math.pi * 3.2 * u)) * k
        if j == 'panique': dx += 0.4 * g * math.sin(2 * math.pi * 5 * u) * k
    for C in CHUTES:
        if C['sketch'] == sk and C['qui'] != name:
            u = t - jeu.prise_t(C)   # même instant que la prise de choc du visage (jeu.py)
            if 0 <= u < 1.8: dx -= 0.9 * g * ease(u / 0.2) * (1 - ease((u - 1.3) / 0.5)) * side; dy -= 0.6 * g * max(0.0, math.sin(math.pi * min(1.0, u / 0.3)))
    return dx * amp, dy * amp
GESTE_AMPL = {'accuse': 42, 'marchande': 34, 'choc': 38, 'panique': 30, 'frime': 30, 'camera': 28, 'innocent': 26, 'rire': 22, 'soupcon': 18}
def gestes_de(name, t, sk, A):
    """pose (angle, avancée vers la caméra) de chaque bras : sur sa réplique, le bras du côté du partenaire (un sur deux
    d'une réplique à l'autre) se lève et vient vers la caméra selon le jeu, bat la mesure sur la voix, revient en fin de
    phrase ; à la chute des autres, les mains réagissent. L'ampleur est bornée par l'ENVELOPPE SANS DÉFAUT de chaque bras
    (gestes.enveloppe : au plus 8 % du bras à reconstituer)."""
    B = A['bras']; ang = [0.0] * len(B); G = REG['gestes']
    L = line_at(t, name)
    if L:
        u = t - L['t0']; e = L['env'][min(len(L['env']) - 1, int(u * 100))]
        mes = [Lx for Lx in lines if Lx['qui'] == name]; rang = mes.index(L) if L in mes else 0
        ordre = sorted(range(len(B)), key=lambda i: B[i]['x'] * A.get('cote', 1.0), reverse=True)   # côté du partenaire d'abord
        i = ordre[rang % len(ordre)] if (rang % 3 != 2 or len(ordre) == 1) else ordre[0]
        amp = GESTE_AMPL.get(L.get('jeu', ''), 26) * (1.2 if L.get('chute') else 1.0) * (0.8 if SEATED.get(name) else 1.0) * (1.0 if B[i]['nu'] else 0.7)
        if L['dur'] < 0.8: amp *= 0.6
        k = ease((u - 0.08) / 0.3) * (1 - ease((u - L['dur'] + 0.1) / 0.45))
        ang[i] = G * min(1.0, amp / 42) * k * (1 + 0.2 * e * math.sin(2 * math.pi * 2.2 * u))
    for C in CHUTES:
        if C['sketch'] == sk and C['qui'] != name:
            u = t - jeu.prise_t(C)   # même instant que la prise de choc du visage (jeu.py)
            if 0 <= u < 1.8:
                k = ease(u / 0.25) * (1 - ease((u - 1.3) / 0.5)); ang = [max(a_, G * 0.55 * k) for a_ in ang]
    # fraction du geste (0 → 1) → (angle, avancée) dans l'enveloppe sans défaut du bras
    return [(f_ * b_['amax'], 1 + f_ * (b_['emax'] - 1)) for f_, b_ in zip(ang, B)]
MESURE = os.environ.get('ETIREMENT') == '1'; MESURES = []
# mesures de contrôle (étirement, pose, bêtes) sur la grille des 30 i/s : même coût et mêmes unités que les versions à 30 i/s
def mesure_ici(t): return MESURE and int(round(t * FPS)) % max(1, FPS // 30) == 0
def etirement(sx, sy, al):
    """ÉTIREMENT EXACT du personnage dans cette image : valeurs singulières de la jacobienne de la déformation (carte
    inverse sx, sy) sur la silhouette ; 0 = rigide, 0,03 = 3 % d'étirement local (99e centile et maximum)."""
    a_, b_ = np.gradient(sx, axis=1), np.gradient(sx, axis=0); c_, d_ = np.gradient(sy, axis=1), np.gradient(sy, axis=0)
    E = a_ * a_ + b_ * b_ + c_ * c_ + d_ * d_; D = np.abs(a_ * d_ - b_ * c_); r = np.sqrt(np.maximum(E * E - 4 * D * D, 0))
    s1 = np.sqrt((E + r) / 2); s2 = np.sqrt(np.maximum((E - r) / 2, 1e-9))
    st = np.maximum(s1, 1 / s2) - 1; m = al > 0.5
    return (round(float(np.percentile(st[m], 99)), 4), round(float(st[m].max()), 4)) if m.any() else (0.0, 0.0)
ECHELLE_PLAN = [1.0]
def pose_rig(R_, P, f):
    v = lambda k: float(P[k][f])
    gest = [(v(f'geste_{k}') * b['amax'], 1 + v(f'geste_{k}') * (b['emax'] - 1)) for k, b in enumerate(R_['bras'])]
    return dict(buste=v('buste'), buste_lacet=v('buste_lacet'), tete=v('tete'), tete_lacet=v('tete_lacet'), tete_tangage=v('tete_tangage'),
                souffle=v('souffle'), epaules=v('epaules'), bassin=(v('bassin_x'), v('bassin_y')), gestes=gest)
# CARTES DU SQUELETTE À 30 Hz (18/10/2026, « réduire drastiquement le temps de production ») : les pistes de jeu sont
# calculées à 30 i/s puis rééchantillonnées (PCHIP) ; à 60 i/s, la carte de déformation d'une image impaire est la moyenne de
# celles des deux images paires voisines (déjà calculées dans le même bloc du même processus) — l'ARAP et le point fixe de la
# carte, 0,033 s par acteur et par image, ne tournent plus qu'une image sur deux. Visage, bouche et regard restent calculés à
# CHAQUE image (synchro labiale intacte). TOURNE_CARTES_30=0 : toutes les cartes calculées.
_CARTES = {}
def cartes_rig(R_, P, f, name):
    if FPS <= 30 or os.environ.get('TOURNE_CARTES_30', '1') == '0': return None
    def paire(k):
        k = int(min(max(k, 0), NF - 1)); c = _CARTES.get((name, k))
        if c is None:
            c = rig2d.cartes(R_, pose_rig(R_, P, k)); _CARTES[(name, k)] = c
            for k_ in [k_ for k_ in _CARTES if k_[0] == name and abs(k_[1] - k) > 4]: del _CARTES[k_]   # mémoire : 2 cartes par acteur
        return c
    if f % 2 == 0 or f + 1 >= NF: return paire(f)
    (ax, ay), (bx, by) = paire(f - 1), paire(f + 1)
    return 0.5 * (ax + bx), 0.5 * (ay + by)
def warp_rig(S, A, t, name):
    """acteur posé par son squelette : visage (expression dessinée ou déformée, bouche, clignement, regard), puis corps."""
    f = min(NF - 1, max(0, int(round(t * FPS)))); P = S['pistes'][name]; v = lambda k: float(P[k][f])
    jj = machoire(name, t); bb = v('cligne') if 'cligne' in P else blink(name, t)   # clignements du regard vivant (jeu.yeux)
    if 'bouche_bee' in P: jj = max(jj, v('bouche_bee'))   # prise de choc : la mâchoire tombe (jeu.py)
    emo = {e: v('emo_' + e) for e in jeu.EMOS if P['emo_' + e][f] > 0.02}
    src = A['img']; lib = A['lib']; al_v = None
    if A.get('xl'):   # visage redessiné (LivePortrait) : émotions × bouche × clignement
        vb = A['a'].get('visage', {}).get('box'); vpx = (vb[3] - vb[1]) * ECHELLE_PLAN[0] if vb else None
        face, a_v = expressions_lp.visage(A["xl"], emo, jj, bb, vpx, avec_alpha=True)
        src = expressions_lp.colle(src, A['xl'], face)
        if a_v is not None: al_v = expressions_lp.colle_alpha(A['rig']['alpha_corps'], A['xl'], a_v)   # découpe qui suit le visage (v33)
    else:
        if lib:
            x = jj * 4; i0 = int(min(3, math.floor(x))); fa = x - i0
            e_ = bb * 2; j0 = int(min(1, math.floor(e_))); fe = e_ - j0
            if (0, 2) not in lib: j0, fe = 0, 0.0
            g = lambda i, j: lib.get((i, j), lib.get((i, 0)))
            roi = (g(i0, j0) * (1 - fa) + g(i0 + 1, j0) * fa) * (1 - fe) + (g(i0, j0 + 1) * (1 - fa) + g(i0 + 1, j0 + 1) * fa) * fe
            R = lib['roi']; src = src.copy(); src[R[1]:R[3], R[0]:R[2]] = np.clip(roi, 0, 255).astype(np.uint8)
        if A.get('expr') and emo: src = expressions.applique(src, A['expr'], emo)
    if A.get('yeux'): src = regard.applique(src, A['yeux'], v('regard_x'), v('regard_y'), 1 - bb)
    if A.get('xl') and 'lacet_visage' in P: src, al_v = expressions_lp.tourne(src, A['xl'], v('lacet_visage'), al_v)   # tête tournée par LivePortrait (18/10)
    R_ = A['rig']; pose = pose_rig(R_, P, f)
    box, rgb, al, sx, sy = rig2d.rendre(R_, pose, src, al_v, sxsy=None if rig2d.gl_actif() else cartes_rig(R_, P, f, name))   # rendu direct par maillage (rig2d.rendre_maillage)
    if mesure_ici(t):
        I_ = R_['M']['idx']
        if sx is None: p99, mx = rig2d.etirement_maillage(R_, R_['_U'], I_['head'])   # même mesure, par triangle
        else:
            gx = ((sx - R_['gx'][0]) / R_['cell']).round().astype(int).clip(0, len(R_['gx']) - 1); gy = ((sy - R_['gy'][0]) / R_['cell']).round().astype(int).clip(0, len(R_['gy']) - 1)
            (p99, mx), _ = rig2d.etirement(sx, sy, al, R_['own'][gy, gx] != I_['head'])
        MESURES.append(dict(qui=name, t=round(t, 3), etirement=(p99, mx), bouche=round(float(jj), 3), emotions={k: round(x_, 2) for k, x_ in emo.items()},
                            pose={**{k: (round(x_, 2) if not isinstance(x_, (tuple, list)) else [round(float(y_), 2) for y_ in x_]) for k, x_ in pose.items() if k != 'gestes'},
                                  **({'lacet_visage': round(v('lacet_visage'), 2)} if 'lacet_visage' in P else {})},
                            bras=[round(float(g_[0]), 1) for g_ in pose.get('gestes') or []],   # angle de chaque geste (°), 19/10 : porte « bras » mesurée
                            regard=round(v('regard_x'), 2),
                            # REGARD COMPLET (18/10/2026, juge local, porte D) : commande verticale, regard déjà peint et lacet
                            # peint — de quoi rejouer exactement où pointe l'iris rendu, sans regarder l'image
                            regard_y=round(v('regard_y'), 2) if 'regard_y' in P else 0.0, regard_peint=[round(x_, 2) for x_ in regard.peint(A.get('yeux'))],
                            lacet_peint=A.get('env', {}).get('lacet_peint')))
    return box, rgb, al
def warp_actor(S, A, t, name):
    """le haut du corps plié autour du bassin, la tête autour du cou ; jambes immobiles (aucune couture)."""
    if A.get('rig'): return warp_rig(S, A, t, name)
    ang, hd, br = pose(name, t, S['sk']['id'])
    # FONDU entre états voisins (bouche × yeux) + mâchoire lissée sur ±2 images : plus de saut d'un état à l'autre
    jj = machoire(name, t); bb = blink(name, t)
    src = S['img']; lib = A['lib']
    if lib:
        x = jj * 4; i0 = int(min(3, math.floor(x))); fa = x - i0
        e = bb * 2; j0 = int(min(1, math.floor(e))); fe = e - j0
        if (0, 2) not in lib: j0, fe = 0, 0.0
        g = lambda i, j: lib.get((i, j), lib.get((i, 0)))
        roi = (g(i0, j0) * (1 - fa) + g(i0 + 1, j0) * fa) * (1 - fe) + (g(i0, j0 + 1) * (1 - fa) + g(i0 + 1, j0 + 1) * fa) * fe
        R = lib['roi']; src = S['img'].copy(); src[R[1]:R[3], R[0]:R[2]] = np.clip(roi, 0, 255).astype(np.uint8)
    msk = A['mask']
    if A.get('bras'):   # les bras jouent (calques qui pivotent au coude ou au poignet)
        src, msk = gestes.applique(src, msk, A['bras'], gestes_de(name, t, S['sk']['id'], A))
    cdx, cdy = corps(name, t, S['sk']['id'], A)
    x0, y0, x1, y1 = A['bbox']; m = 40 + A.get('marge_bras', 0) + int(abs(cdx) + abs(cdy)) + 2; X0, Y0, X1, Y1 = max(0, x0 - m), max(0, y0 - m), min(S['W'], x1 + m), min(S['H'], y1 + m)
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
    sx2 = (sx2 - np.float32(cdx)).astype(np.float32); sy2 = (sy2 - np.float32(cdy)).astype(np.float32)   # tout le corps glisse (pas, sursaut, rebond)
    rgb = cv2.remap(src, sx2, sy2, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)   # bicubique : −19 % de netteté mesurés en bilinéaire
    al = cv2.remap(msk, sx2, sy2, cv2.INTER_LINEAR, borderValue=0)
    if mesure_ici(t): MESURES.append(dict(qui=name, t=round(t, 3), etirement=etirement(sx2, sy2, al), bouche=round(float(jj), 3), lib=bool(lib),
                                   buste=round(float(ang), 2), tete=round(float(hd), 2), souffle=round(float(br), 4), pas=(round(float(cdx), 2), round(float(cdy), 2))))
    return (X0, Y0, X1, Y1), rgb, al
def geste_dessine(S, A, t, name, R):
    """pose dessinée du jeu de la réplique (ou choc à la chute d'un autre) ; intervalle par flux optique depuis la pose
    rendue par le moteur ; la bouche continue de suivre la voix, le corps garde ses pas (corps())."""
    if 'cal' not in A: A['cal'] = PD.calendrier(name, lines, CHUTES, S['sk']['id'], A['dessins'], {n: float(B['hip'][0]) for n, B in S['acts'].items()})
    p, w, arrivee = PD.poids(A['cal'], t)
    if not p: return R
    jj = machoire(name, t)
    cdx, cdy = corps(name, t, S['sk']['id'], A)
    return PD.intervalle(R, PD.rend(A['dessins'][p], jj, cdx, cdy, t, arrivee), w)
def hors_champ(A, vue):
    """acteur entièrement hors du cadre de cette image (boîte du dessin élargie de ses gestes, de son jeu et du flou de
    réduction) : ses pixels ne peuvent pas atteindre l'écran, on ne le déforme pas."""
    x0, y0, x1, y1 = A['bbox']; m = 0.25 * max(x1 - x0, y1 - y0) + 40 + A.get('marge_bras', 0)
    return x1 + m < vue[0] or x0 - m > vue[2] or y1 + m < vue[1] or y0 - m > vue[3]
def frame_scene(S, t, off=None, zoom=None, vis=None, t0=None, vue=None):
    plate = S['plate']; V = S.get('vie')
    if V is not None and decor_vivant.panache(V, plate) is not None: plate = decor_vivant.fumee(V, plate, t)   # la fumée du grill MONTE (panache physique), avant la parallaxe
    if S.get('linge') is not None: plate = linge.compose(S['linge'], plate, t)   # linge épinglé qui flotte au vent (v34), sous la couche « tissu »
    VF = S.get('vf')
    if VF is not None and S.setdefault('jour', (lambda s_: s_ is not None and s_[1] > 110)(decor_vivant.soleil(S['plate']))):
        # VIE DU FOND (v35) : ombre des rameaux sur le haut du mur (elle suit la parallaxe du mur), oiseaux du ciel du cadre
        psi_ = float(S['linge']['psi']) if S.get('linge') is not None else 0.0
        plate = plate.astype(np.float32) * vie_fond.feuillage(VF, t, psi_)[..., None]
        if vis is not None:
            plate = vie_fond.oiseaux(VF, plate, t, vis, t0 if t0 is not None else 0.0)
            plate = vie_fond.papillons(VF, plate, t, vis, t0 if t0 is not None else 0.0)   # devant le mur, derrière les acteurs
    par = off is not None and S.get('kpar') is not None and (abs(off[0]) > 0.05 or abs(off[1]) > 0.05)
    zpar = zoom is not None and S.get('kpar') is not None and abs(zoom[0] - 1) > 1e-3
    if par or zpar or V is not None:
        mx, my = S['xs'], S['ys']
        if par:
            g = 1 - S['kpar']   # le décor glisse avec la caméra selon sa profondeur : vu à l'écran, le loin bouge moins
            # cartes en float32 : un décalage numpy float64 (venu des règles de cadrage) en ferait des cartes 64 bits, et
            # OpenCV passe alors par un chemin des centaines de fois plus lent (7 min par image mesurées le 17/10)
            ox_, oy_ = np.float32(off[0]), np.float32(off[1]); mx = mx - ox_ * g; my = my - oy_ * g
        if zpar:   # TRAVELLING AVANT À PARALLAXE : un zoom seul n'en crée pas ; ici le loin grossit moins que les acteurs
            # (z^kpar au lieu de z, le premier plan davantage), comme quand la caméra avance vraiment dans la scène
            k_ = np.exp((1 - S['kpar']) * np.float32(math.log(zoom[0]))).astype(np.float32); zx_, zy_ = np.float32(zoom[1]), np.float32(zoom[2])
            mx = zx_ + (mx - zx_) * k_; my = zy_ + (my - zy_) * k_
        sol_ = decor_vivant.soleil(S['plate']) if V is not None else None; jour_ = sol_ is not None and sol_[1] > 110   # scène de jour (pas le maquis de nuit)
        if V is not None:   # le décor vit : feuillages, linge, fumée, bêtes (déplacements) et ampoules (lumière)
            # de jour, mouvement ×6 (essai A/B jugé par JEV, 17/10 : à ×1 la cour était un « décor mort »), lumière inchangée
            dx, dy, gain = decor_vivant.champ(V, t, REG['decor'] * (6.0 if jour_ else 1.0)); mx = mx - dx; my = my - dy
            if jour_ and S.get('vf') is None: gain = gain * (1 - sol_[0] * (1 - decor_vivant.tachete(gain.shape[0], gain.shape[1], t)))   # ombres de feuillage qui passent (remplacées par vie_fond)
        plate = cv2.remap(plate, mx.astype(np.float32), my.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        if V is not None: plate = np.clip(plate.astype(np.float32) * gain[..., None], 0, 255)
    can = plate.astype(np.float32).copy()
    poses = entites.etat(S['ents'], t) if S.get('ents') else []
    pieds = min((A['bbox'][3] for A in S['acts'].values()), default=1e9)
    em = [] if (mesure_ici(t) and poses) else None
    vu_ = (lambda p: True) if vue is None else (lambda p: vue[0] - 150 <= p['x'] <= vue[2] + 150 and vue[1] - 150 <= p['y'] <= vue[3] + 150)   # bêtes hors cadre : rien à dessiner
    if poses: entites.dessine(can, poses, lambda p: p['y'] <= pieds and vu_(p), S.get('lum'), S.get('style_ent'), em)   # bêtes derrière les acteurs, puis devant après eux
    for name, A in sorted(S['acts'].items(), key=lambda kv: kv[1]['hip'][1]):
        # VITESSE (18/10/2026) : en plan serré, les acteurs hors du cadre ne sont plus déformés image par image
        if vue is not None and hors_champ(A, vue): continue
        R_ = warp_actor(S, A, t, name)
        if A.get('dessins'): R_ = geste_dessine(S, A, t, name, R_)
        (X0, Y0, X1, Y1), rgb, al = R_
        sub = can[Y0:Y1, X0:X1]; al3 = al[..., None]; sub[:] = sub * (1 - al3) + rgb.astype(np.float32) * al3
    if poses: entites.dessine(can, poses, lambda p: p['y'] > pieds and vu_(p), S.get('lum'), S.get('style_ent'), em)
    if em: MESURES.extend(dict(qui='entite', sketch=S['sk']['id'], t=round(t, 3), **m_) for m_ in em)
    if REG.get('nuages', 0) > 0 and S.setdefault('jour', (lambda s_: s_ is not None and s_[1] > 110)(decor_vivant.soleil(S['plate']))):
        can *= ombre_nuage(S, t)[..., None]   # toute la scène, acteurs compris : une seule lumière
    return np.clip(can, 0, 255).astype(np.uint8)
def ombre_nuage(S, t):
    """OMBRE DE NUAGE QUI PASSE (v35) : v34, porte L — « décor mort » sur 22 secondes de la cour : le rideau détouré par
    SAM 2.1 bouge, mais les cadres de Maman n'en montrent que le haut, épinglé. Par beau temps, l'ombre douce d'un nuage
    glisse sur la cour (bande oblique, venue du côté du soleil) : la lumière vit dans TOUS les cadres. Scènes de jour
    seulement ; gain appliqué à toute l'image (décor et acteurs : une seule lumière, porte K « lumière »)."""
    H, W = S['plate'].shape[:2]; q = 8; h, w = (H + q - 1) // q, (W + q - 1) // q
    if '_nuage' not in S: S['_nuage'] = tuple(a_.astype(np.float32) for a_ in np.meshgrid(np.arange(w) * q, np.arange(h) * q))
    X, Y = S['_nuage']; L = 1.4 * W; v = REG.get('nuage_vitesse', 0.06) * W; sig = 0.22 * W
    u = np.mod((X + 0.35 * Y) - v * t + 0.5 * L, L); d = np.minimum(u, L - u)   # distance au cœur de l'ombre
    g = 1.0 - REG['nuages'] * np.exp(-0.5 * (d / sig) ** 2)
    return cv2.resize(g.astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
# ── découpage : un plan par réplique (coupe au changement de locuteur) ──
def crop_for(S, kind, who=None):
    W, H = S['W'], S['H']; asp = CW / CH
    if kind.startswith('ouvre-'): kind = kind[6:]   # plan d'ouverture : son cadre d'arrivée est celui de l'échange
    if kind == 'large' or who is None: h = H; w = min(W, h * asp); return (W / 2, H / 2, w, h)
    if kind == 'duo':   # plan à deux : les têtes de ceux qui se parlent, avec de l'air (le plan des TikTok Grok)
        As = [S['acts'][n] for n in who if n in S['acts']]; hbs = [head_box(A) for A in As if head_box(A)]
        if not hbs: return (W / 2, H / 2, min(W, H * asp), H)
        x0 = min(h_[0] for h_ in hbs); x1 = max(h_[2] for h_ in hbs); y0 = min(h_[1] for h_ in hbs); sh = max(A['sh'] for A in As)
        w = max((x1 - x0) * REG.get('duo_air', 1.5), 2.5 * 2 * sh * asp); h = w / asp
        if h > H: h = H; w = h * asp
        return ((x0 + x1) / 2, y0 + 0.40 * h, w, h)
    A = S['acts'][who]; cx, cy = A['head'][0], A['head'][1] + 1.1 * A['sh']
    h = {'moyen': 2.5, 'serre': 2.0, 'gros': 1.6}[kind] * 2 * A['sh']; h = min(H, max(260, h))   # resserrés : visages plus grands, bouches lisibles
    v_ = A['a'].get('visage')
    if v_ and kind == 'moyen':   # « bouche lisible » : celui qui parle a au moins VISAGE_MIN px de visage dans l'image finale
        # plancher 200 px de décor (agrandissement ×2,3 au plus, moins que le plan serré de la chute) : à 260, le petit visage
        # de Petit Mamadou plafonnait à 56 px et celui de Baye à 66 (simulation des cadres du 17/10)
        h = max(MOYEN_MIN, min(h, (v_['box'][3] - v_['box'][1]) * CH / (1.06 * VISAGE_MIN))); cy = min(cy, A['head'][1] + 0.42 * h)   # 6 % de marge
    w = h * asp
    if w > W: w = W; h = w / asp
    return (cx, cy, w, h)
# GROS PLANS MOINS ZOOMÉS (18/10/2026, v3 : « dans les sketchs l'arrière-plan comporte encore des flous » ; « le visage du petit
# Mamadou se déforme ») : le gros plan visage descendait à 200 px de décor pour 460 à l'écran (×2,3) — le décor, déjà peint
# avec une profondeur de champ, devenait une bouillie, et chaque défaut du visage était grossi d'autant. Plancher 260 px
# (×1,77 au plus), puis netteté rendue à l'agrandissement (NETTETE, ci-dessous).
# RETOUR À 200 px (18/10/2026, v4 → v5) : à 260, le gros plan visage de Tantie Awa (visage 66 px) prenait la tête de Modou
# dans le cadre, la règle des têtes entières le refusait et tout le sketch du loyer passait en plan large — bouches
# illisibles (porte B 15/22 contre 19/22), découpage non conforme (M), caméra immobile (0,10 px/i contre 0,75). Le flou
# des agrandissements est traité par la netteté rendue (NETTETE) ; les bandes floues, par l'habillage net (marque.py).
GROS_PLAN_MIN = float(os.environ.get('GROS_PLAN_MIN', 200))
def crop_visage(S, who, part=0.22):
    """gros plan calé sur le VISAGE de celui qui parle : le visage occupe `part` de la hauteur de l'image (≈ 100 px sur 460).
    v30 jugée par JEV (réalisateur) : pour Baye assis, le plan « serré » calé sur la largeur d'épaules (boubou ample)
    faisait 655 px de haut — plus large que le cadre du moteur — et son visage restait illisible (0,29) ; aucun cadre
    proposé n'était conforme (porte M)."""
    A = S['acts'].get(who); v_ = A['a'].get('visage') if A else None
    if not v_: return None
    fx0, fy0, fx1, fy1 = v_['box']; h = max(GROS_PLAN_MIN, (fy1 - fy0) / part); w = h * CW / CH
    return ((fx0 + fx1) / 2, (fy0 + fy1) / 2 + 0.12 * h, w, h)   # les yeux un peu au-dessus du centre (règle des tiers)
def crop_visage_ok(S, who):
    """le gros plan « visage » le plus large que la règle des têtes entières (faces_ok) laisse tel quel : sinon elle le
    repousse loin d'un voisin ou l'élargit jusqu'à redevenir le plan large du moteur (Baye, v30)."""
    for part in (0.22, 0.28, 0.34, 0.40):
        c = crop_visage(S, who, part)
        if c is None: return None
        c1 = clamp_crop(S, c); c2 = faces_ok(S, c1, who)
        if abs(c2[2] / c1[2] - 1) < 0.06 and abs(c2[0] - c1[0]) < 0.08 * c1[2] and not tete_coupee(S, c2, who): return c2
    return None
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
VISAGE_MIN = float(os.environ.get('VISAGE_MIN', 72)); MOYEN_MIN = float(os.environ.get('MOYEN_MIN', 200))   # visage qui parle : au moins 72 px de haut sur 460 (bouche ouverte ≈ 12 px, lisible)
def taille_visage(S, nom, c):
    """hauteur du VISAGE (front → menton, sans cheveux ni marge) dans l'image finale, en pixels."""
    v = S['acts'][nom]['a'].get('visage'); return 0.0 if not v else (v['box'][3] - v['box'][1]) * CH / c[3]
def bouche_lisible(sid, qui):
    """le plan à deux de `qui` montre-t-il chaque visage assez grand pour lire la bouche ?"""
    if sid not in SC: return True
    S = SC[sid]; c = faces_ok(S, clamp_crop(S, crop_for(S, 'duo', qui)), qui[0])
    px_ = min(taille_visage(S, n, c) for n in qui if n in S['acts'])
    if os.environ.get('TOURNE_DEBUG_DUO'): print('duo', sid, qui, round(px_, 1), [round(v) for v in c], flush=True)
    return px_ >= VISAGE_MIN
def echanges(Ls, plan_s):
    """RYTHME DE VOS TIKTOK : les répliques d'un même échange dans un seul plan (~plan_s secondes) ; la chute garde son plan."""
    G, cur = [], []
    for L in Ls:
        if L.get('chute'):
            if cur: G.append(cur); cur = []
            G.append([L]); continue
        if cur and L['t0'] + L['dur'] - cur[0]['t0'] > plan_s * 1.3: G.append(cur); cur = []
        cur.append(L)
        if L['t0'] + L['dur'] - cur[0]['t0'] >= plan_s: G.append(cur); cur = []
    if cur: G.append(cur)
    return G
for sk in (T['sketchs'] if REG['plan_s'] > 0 else []):
    Ls = [L for L in lines if L['sketch'] == sk['id']]; Gs = echanges(Ls, REG['plan_s'])
    for gi, Gr in enumerate(Gs):
        L = Gr[0]; t0 = sk['t0'] - 0.3 if gi == 0 else L['t0'] - 0.12
        t1 = (Gs[gi + 1][0]['t0'] - 0.12) if gi + 1 < len(Gs) else sk['t1'] + 0.25
        if L.get('chute'):
            SH.append((t0, L['t0'] + L['dur'] + 0.05, sk['id'], 'serre', L['qui'], L['t0'] + 0.6 * L['dur']))
            nxt = Gs[gi + 1][0]['qui'] if gi + 1 < len(Gs) and Gs[gi + 1][0]['qui'] != L['qui'] else None
            vict = nxt or [n for n in sk['acteurs'] if n != L['qui']][0]
            SH.append((L['t0'] + L['dur'] + 0.05, t1, sk['id'], 'gros', vict, None)); continue
        qui = tuple(dict.fromkeys(x['qui'] for x in Gr))
        kind, who = ('duo', qui) if len(qui) > 1 else ('moyen', qui[0])
        if kind == 'duo' and not bouche_lisible(sk['id'], qui):
            # RÈGLE « BOUCHE LISIBLE » (17/10, « on dirait que le vieux assis ne parle pas ») : quand les deux qui se parlent sont
            # trop loin l'un de l'autre, le plan à deux rend les visages trop petits (Baye : 52 px) ; on passe au champ-contrechamp
            # (un plan par prise de parole, comme Afrikatoon), les répliques consécutives d'un même personnage restant ensemble
            tours = []
            for x in Gr:
                if tours and tours[-1][0] == x['qui']: tours[-1][1].append(x)
                else: tours.append((x['qui'], [x]))
            # PAIRES LISIBLES (18/10/2026, porte A de la v6 : 19,6 plans/min contre 10,4–18,4 pour vos TikTok et les studios,
            # plan médian 3,0 s contre ≥ 3,04) : quand, dans un groupe à trois, deux personnages se répondent plusieurs fois et
            # que LEUR plan à deux garde les deux bouches lisibles (même règle VISAGE_MIN), on tient un seul plan à deux au lieu
            # d'une coupe par réplique ; les autres tours restent en champ-contrechamp
            runs = []
            for n_, Lx in tours:
                if runs and (n_ in runs[-1][0] or (len(runs[-1][0]) == 1 and bouche_lisible(sk['id'], (runs[-1][0][0], n_)))):
                    if n_ not in runs[-1][0]: runs[-1][0].append(n_)
                    runs[-1][1].extend(Lx)
                else: runs.append(([n_], list(Lx)))
            for k_, (ns_, Lx) in enumerate(runs):
                a_ = t0 if k_ == 0 else Lx[0]['t0'] - 0.12
                b_ = t1 if k_ == len(runs) - 1 else runs[k_ + 1][1][0]['t0'] - 0.12
                kd_ = 'duo' if len(ns_) > 1 else 'moyen'
                kd = ('ouvre-' + kd_ if (gi == 0 and k_ == 0 and REG['ouverture'] > 0) else kd_)
                SH.append((a_, b_, sk['id'], kd, tuple(ns_) if len(ns_) > 1 else ns_[0], None))
            continue
        if gi == 0 and REG['ouverture'] > 0:   # on situe en large PUIS la caméra pousse vers l'échange, sans couper
            SH.append((t0, t1, sk['id'], 'ouvre-' + kind, who, None)); continue
        if gi == 0:   # plan d'ensemble pour situer, puis le plan de l'échange
            cut = L['t0'] + 1.4
            if t1 - cut >= 1.5: SH.append((t0, cut, sk['id'], 'large', None, None)); SH.append((cut, t1, sk['id'], kind, who, None))
            else: SH.append((t0, t1, sk['id'], 'large', None, None))
            continue
        SH.append((t0, t1, sk['id'], kind, who, None))
for sk in (T['sketchs'] if REG['plan_s'] <= 0 else []):   # ancien découpage (une coupe par réplique)
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
FONT = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/fonts/Montserrat.ttf'
def carte(c, t, rgba=False, place=None):
    """place : (centre x de l'émoji, centre y de l'émoji, haut du titre, taille de base de l'émoji) — par défaut l'émoji au
    centre en haut et le titre dessous (cartes de Ladjagaï)."""
    if rgba and os.environ.get('CARTES_FX', '1') == '1':   # cartes redessinées (cartes_fx.py, 18/10/2026)
        import cartes_fx
        ids_ = [k_['id'] for k_ in H_['sketchs']]; rang_ = ids_.index(c['apres']) + 1 if c['apres'] in ids_ else 1
        titre_ = [k_ for k_ in H_['sketchs'] if k_['id'] == c['apres']][0]['titre'].upper()
        return cartes_fx.carte(CW, CH, t - c['t0'], titre_, rang_, len(ids_), place or (CW / 2, 145, 290, 210))
    im = PImage.new('RGBA' if rgba else 'RGB', (CW, CH), (0, 0, 0, 0) if rgba else (0, 0, 0)); u = (t - c['t0']) / (c['t1'] - c['t0'])
    e = PImage.open(EMO.get(c['apres'], 'emoji/face_with_tears_of_joy.png')).convert('RGBA')
    ex, ey, ty, base = place or (CW / 2, 145, 290, 210)
    k = 1.32 if u < 0.25 else (1.15 if u < 0.5 else 1.0)  # le logo grossit par coupes (×1,32 puis ×1,15, mesuré chez Ladjagaï)
    sz = int(base * k); e = e.resize((sz, sz), PImage.LANCZOS)
    if rgba: im.alpha_composite(e, (int(ex - sz / 2), int(ey - sz / 2)))
    else: im.paste(e, (int(ex - sz / 2), int(ey - sz / 2)), e)
    titre = [k_ for k_ in H_['sketchs'] if k_['id'] == c['apres']][0]['titre'].upper()
    d = ImageDraw.Draw(im); f = ImageFont.truetype(FONT, 34)
    try: f.set_variation_by_name(b'Black')
    except Exception: pass
    words = titre.split(); lines_, cur = [], ''
    for w_ in words:
        if f.getlength((cur + ' ' + w_).strip()) > CW - 60: lines_.append(cur); cur = w_
        else: cur = (cur + ' ' + w_).strip()
    lines_.append(cur)
    y = ty
    for ln in lines_:
        d.text(((CW - f.getlength(ln)) / 2, y), ln, font=f, fill=(255, 214, 0, 255), stroke_width=4, stroke_fill=(0, 0, 0, 255)); y += 44
    return np.array(im)
CADRES = {}
RANGE = range(NF)
if os.environ.get('TOURNE_PLAGE'):   # « a-b » (ou « a-b,c-d ») : seulement ces images (profilage, essais rapides)
    _pl = [tuple(map(int, p_.split('-'))) for p_ in os.environ['TOURNE_PLAGE'].split(',')]
    RANGE = sorted({f_ for _a, _b in _pl for f_ in range(max(0, _a), min(NF, _b))})
if ONLY:   # un seul sketch (et, avec TOURNE_PLAGE, seulement la part de la plage qui lui appartient : essais A/B rapides)
    sk = [k for k in T['sketchs'] if k['id'] == ONLY][0]; _r = range(int((sk['t0'] - 0.3) * FPS), int((sk['t1'] + 0.25) * FPS))
    RANGE = [f_ for f_ in RANGE if f_ in _r] if os.environ.get('TOURNE_PLAGE') else _r
def cadre_lisible(S, s, keep):
    """cadre de départ d'un plan. Plan moyen sur celui qui parle : quand la tête d'un voisin dépasse à moitié, la règle
    « tête entière ou absente » élargissait le cadre pour la prendre (Baye : 66 px de visage) ; on essaie d'abord de
    RESSERRER pour la sortir du cadre (même règle respectée, visage plus grand) et on garde le plus large cadre qui rend la
    bouche lisible (≥ VISAGE_MIN), sinon celui qui donne le plus grand visage."""
    base = crop_for(S, s[3], s[4])
    if s[3] not in ('moyen', 'ouvre-moyen') or not keep or keep not in S['acts']: return faces_ok(S, clamp_crop(S, base), keep)
    best = None
    for f in (1.0, 0.94, 0.88, 0.82, 0.76, 0.70, 0.64):
        cx, cy, w, h = base; h2 = max(MOYEN_MIN, h * f); w2 = h2 * w / h
        c = faces_ok(S, clamp_crop(S, (cx, cy, w2, h2)), keep); px = taille_visage(S, keep, c)
        if px >= VISAGE_MIN: return c
        if best is None or px > best[0]: best = (px, c)
        if h2 <= MOYEN_MIN: break
    return best[1]
def tete_coupee(S, c, keep, marge=0.05):
    """une tête est-elle à moitié dans le cadre c (boîte de tête élargie de 5 % pour le jeu de la tête) ? celle de `keep`
    doit être entière."""
    cx, cy, w, h = c; l, r, t, b = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2
    for n, A in S['acts'].items():
        hb = head_box(A)
        if not hb: continue
        mx_, my_ = marge * (hb[2] - hb[0]), marge * (hb[3] - hb[1]); x0, y0, x1, y1 = hb[0] - mx_, hb[1] - my_, hb[2] + mx_, hb[3] + my_
        ix = max(0, min(r, x1) - max(l, x0)) / (x1 - x0); iy = max(0, min(b, y1) - max(t, y0)) / (y1 - y0)
        if n == keep:
            if ix < 0.97 or iy < 0.97: return True
        elif ix * iy > 0.03 and (ix < 0.97 or iy < 0.97): return True
    return False
def tete_dedans(S, c, n):
    """la tête entière de n dans le cadre c."""
    A = S['acts'].get(n); hb = head_box(A) if A else None
    if not hb: return True
    cx, cy, w, h = c
    return hb[0] >= cx - w / 2 - 1 and hb[2] <= cx + w / 2 + 1 and hb[1] >= cy - h / 2 - 1 and hb[3] <= cy + h / 2 + 1
def chemin_ok(S, a, b, keep, n=12):
    """tout le trajet de caméra de a à b (avec la même courbe d'aisance que le rendu) garde les têtes entières ou absentes."""
    for k in range(1, n):
        u = ease(k / n); c = [a_ + (b_ - a_) * u for a_, b_ in zip(a, b)]
        if tete_coupee(S, c, keep): return False
    return True
def cadres_du_plan(S, s, keep):
    """CADRAGE SOUS-PIXEL CONTINU : les cadres sont validés UNE fois par plan (début, fin du mouvement, punch de la chute)
    puis interpolés en flottant ; l'image est prise par transformation affine (filtre anti-crénelage), jamais par découpe
    au pixel entier (qui faisait trembler toute l'image d'un pixel à chaque image — mesuré : 1,42 saute/s)."""
    key = tuple(s[:5])
    if key not in CADRES:
        c0 = C0_JEV.get(key) or cadre_lisible(S, s, keep)   # cadre choisi par JEV réalisateur, sinon la règle du moteur
        if os.environ.get('TOURNE_DEBUG_CADRE'):   # diagnostic : cadre voulu → borné → après la règle des têtes
            print('cadre', s[2], s[3], s[4], [round(v) for v in crop_for(S, s[3], s[4])], [round(v) for v in clamp_crop(S, crop_for(S, s[3], s[4]))], [round(v) for v in c0], flush=True)
        # CAMÉRA VIVANTE : glissement latéral (cam_px pixels d'écran par image) vers le côté qui a de la place, petite
        # montée un plan sur deux, poussée de 6 % ; validée par les mêmes règles de cadrage (têtes entières ou absentes)
        nfr = (s[1] - s[0]) * 30; sc0_ = CW / c0[2]; dep_ = REG['cam_px'] * nfr / sc0_   # cam_px : pixels d'écran par 1/30 s, quelle que soit la cadence
        dirn = 1.0 if S['W'] - (c0[0] + c0[2] / 2) >= c0[0] - c0[2] / 2 else -1.0
        # plans à deux : la largeur du décor borne le glissement (mesuré le 17/10 : 0,5 px/image au lieu de 2,5) → la caméra
        # monte ou descend aussi (un plan sur deux, toute la place en hauteur) et pousse de 10 % : grue + travelling avant
        sens_v = -1.0 if SH.index(s) % 2 else 1.0; up = sens_v * min(0.15 * dep_, 0.5 * max(0.0, S['H'] - c0[3] / REG['pousse']))
        # TRAJET VALIDÉ (v25) : les cadres de départ et d'arrivée respectaient la règle des têtes, mais pas le chemin entre les
        # deux — à mi-glissement, la tête de Maman ou de Baye était à moitié dans le cadre pendant une seconde (JEV : 0,8,
        # vu sur v24 à 8,81 s et v25 à 2,34 / 9,41 / 16,32 s). Le glissement est réduit jusqu'à ce que tout le trajet passe.
        # CAMÉRA VIVANTE ET SANS TÊTE COUPÉE (v27) : réduire le glissement pour sauver les têtes avait figé le film (v26 : caméra
        # 0,30 au lieu de 0,55, 6,4 images figées par minute au lieu de 1,1 — porte A). Le moteur essaie d'autres mouvements
        # valides (glissement de l'autre côté, grue, travelling avant ou arrière) et garde celui qui rend le plus de vie à
        # l'écran (pixels parcourus) sans dépasser la cible, trajet entier validé (têtes entières ou absentes).
        cible = REG['cam_px'] * nfr; essais = []
        for g_, dr, vv, pz in ([(g, dirn, 1.0, z) for g in (1.0, 0.7, 0.45, 0.25) for z in (REG['pousse'], 1.0)] + [(g, -dirn, 1.0, z) for g in (1.0, 0.7, 0.45) for z in (REG['pousse'], 1.0)]
                               + [(0.0, dirn, k, z) for k in (2.5, -2.5, 1.5, -1.5) for z in (REG['pousse'], 1.0)] + [(0.0, dirn, 0.0, z) for z in (1.2, 1.15, REG['pousse'], 1 / 1.08, 1 / 1.12, 1.0)]):
            ux = dr * dep_ * g_; uy = -up * (g_ if g_ > 0 else vv)
            c1 = faces_ok(S, clamp_crop(S, (c0[0] + ux, c0[1] + uy, c0[2] / pz, c0[3] / pz)), keep)
            cp = faces_ok(S, clamp_crop(S, (c1[0], c1[1], c1[2] / 1.15, c1[3] / 1.15)), keep)
            if not (chemin_ok(S, c0, c1, keep) and (s[5] is None or chemin_ok(S, c1, cp, keep))): continue
            vie_ = math.hypot(c1[0] - c0[0], c1[1] - c0[1]) * sc0_ + 0.5 * abs(1 - c0[2] / c1[2]) * CW
            essais.append((min(vie_, cible), -abs(vie_ - cible), g_ == 1.0 and dr == dirn, c1, cp, (g_, dr == dirn, vv, pz)))
            if g_ == 1.0 and dr == dirn and pz == REG['pousse']: break   # le mouvement voulu passe : inutile d'en chercher un autre
        if essais:
            _, _, _, c1, cp, choix_ = max(essais, key=lambda e: (e[0], e[2], e[1]))
        else:
            c1, cp, choix_ = c0, faces_ok(S, clamp_crop(S, (c0[0], c0[1], c0[2] / 1.15, c0[3] / 1.15)), keep), (0.0, True, 0.0, 1.0)
        if choix_ != (1.0, True, 1.0, REG['pousse']):
            print(f"plan {s[0]:.2f} {s[3]} {s[4]} : mouvement {'glissement ' + str(round(choix_[0] * 100)) + '%' + ('' if choix_[1] else ' (autre côté)') if choix_[0] else ('grue' if choix_[2] else 'travelling')}, poussée {choix_[3]:.2f} (trajet sans tête coupée)", flush=True)
        cs = faces_ok(S, clamp_crop(S, crop_for(S, 'large')), None) if s[3].startswith('ouvre-') else None
        CADRES[key] = (None if cs is None else tuple(float(v) for v in cs),) + tuple(tuple(float(v) for v in c) for c in (c0, c1, cp))   # flottants Python
    return CADRES[key]
def titre_lignes(c):
    f = ImageFont.truetype(FONT, 34)
    try: f.set_variation_by_name(b'Black')
    except Exception: pass
    titre = [k_ for k_ in H_['sketchs'] if k_['id'] == c['apres']][0]['titre'].upper(); n_, cur = 1, ''
    for w_ in titre.split():
        if f.getlength((cur + ' ' + w_).strip()) > CW - 60: n_ += 1; cur = w_
        else: cur = (cur + ' ' + w_).strip()
    return n_
def place_carte(c, visages):
    """CARTE HORS DES VISAGES (v34) : v33 jugée par JEV — sur la carte du maquis, l'émoji couvrait le visage de Coumba
    (« tête cachée par l'émoji » 0,82–0,89) ; sur celle de la cour, le titre passait sur la tête de Petit Mamadou (0,56–0,66).
    L'émoji (à sa plus grande taille, ×1,32) et le titre sont posés là où ils couvrent le moins de visage (boîtes des têtes à
    l'écran, élargies de 15 %), au même endroit pendant toute la carte ; l'émoji rapetisse s'il ne trouve aucune place."""
    th = 44 * titre_lignes(c)
    def couvre(r):
        x0, y0, x1, y1 = r; tot = 0.0
        for v in visages:
            mx, my = 0.15 * (v[2] - v[0]), 0.15 * (v[3] - v[1])
            tot += max(0.0, min(x1, v[2] + mx) - max(x0, v[0] - mx)) * max(0.0, min(y1, v[3] + my) - max(y0, v[1] - my))
        return tot
    best = None
    for base in (210, 170, 140):
        sz = 1.32 * base
        for k_, (ex, ey, ty) in enumerate(((CW / 2, 145, 290), (CW * 0.27, 30 + sz / 2, CH - th - 14), (CW * 0.73, 30 + sz / 2, CH - th - 14),
                                         (CW * 0.27, CH - 14 - sz / 2, 18), (CW * 0.73, CH - 14 - sz / 2, 18), (CW / 2, CH - 14 - sz / 2, 18))):
            ex = min(CW - sz / 2 - 4, max(sz / 2 + 4, ex))
            cout = couvre((ex - sz / 2, ey - sz / 2, ex + sz / 2, ey + sz / 2)) + couvre((30, ty - 6, CW - 30, ty + th))
            cle_ = (cout, 210 - base, k_)
            if best is None or cle_ < best[0]: best = (cle_, (ex, ey, ty, base))
        if best[0][0] == 0: break
    return best[1]
PLACES = {}
def sur_scene(img, c, t, visages=()):
    """la carte posée sur la fin du sketch : image assombrie qui continue de vivre, émoji + titre par-dessus. Fondu de 0,6 s :
    à 0,25 s l'instrument des TikTok le comptait encore comme une coupe (mesuré le 17/10 sur v19)."""
    # CARTE OPAQUE D'UN COUP (17/10, contrôle image par image de JEV) : pendant le fondu de 0,6 s, l'émoji à moitié transparent
    # posé sur les visages faisait un « fantôme » (rendu abîmé 0,85) et le titre translucide était illisible (22 images) :
    # émoji et titre entrent opaques sur la coupe (comme les cartes de Ladjagaï), seul l'assombrissement du décor se fond (0,15 s)
    cle_ = round(c['t0'], 2)
    if cle_ not in PLACES: PLACES[cle_] = place_carte(c, visages)
    k = ease((t - (c['t0'] - 0.05)) / 0.15); cal = carte(c, t, rgba=True, place=PLACES[cle_]).astype(np.float32)
    a_ = cal[..., 3:] / 255.0; cal = cal[..., :3]                                       # émoji et titre (contour noir compris)
    base = img.astype(np.float32) * (1 - 0.35 * k)
    return np.clip(base * (1 - a_) + cal * a_, 0, 255).astype(np.uint8)
def cadre_t(s, cadres, t):
    """cadre de la caméra au temps t dans le plan s : (cx, cy, w, h, cadre de référence, poussée)."""
    cs, c0, c1, cp = cadres
    u = ease((t - s[0]) / max(0.5, s[1] - s[0]))
    cx, cy, w2, h2 = [a_ + (b_ - a_) * u for a_, b_ in zip(c0, c1)]; ref = c0
    if cs is not None:   # ouverture : du plan d'ensemble au cadre de l'échange (la poussée ne crée pas de parallaxe, seul le glissement)
        v_o = ease(min(1.0, (t - s[0]) / max(0.3, REG['ouverture'])))
        ref = [a_ + (b_ - a_) * v_o for a_, b_ in zip(cs, c0)]; cx, cy, w2, h2 = [a_ + (b_ - a_) * v_o for a_, b_ in zip(cs, (cx, cy, w2, h2))]
    zp = (ref[2] / w2, cx, cy)   # poussée de la caméra (le coup de zoom de la chute, lui, est un zoom d'objectif : sans parallaxe)
    if s[5] is not None and t >= s[5]:   # coup de zoom sur la chute, fluide (whip_s) au lieu d'un saut d'image
        v_ = ease((t - s[5]) / max(0.05, REG['whip_s'])); cx, cy, w2, h2 = [a_ + (b_ - a_) * v_ for a_, b_ in zip((cx, cy, w2, h2), cp)]
    return cx, cy, w2, h2, ref, zp
def visages_ecran(S, cad):
    """boîtes des têtes de la scène à l'écran pour le cadre cad = (cx, cy, w, h)."""
    cx, cy, w2, h2 = cad[:4]; sc = CW / w2; out = []
    for A in S['acts'].values():
        hb = head_box(A)
        if hb: out.append(((hb[0] - (cx - w2 / 2)) * sc, (hb[1] - (cy - h2 / 2)) * sc, (hb[2] - (cx - w2 / 2)) * sc, (hb[3] - (cy - h2 / 2)) * sc))
    return out
def rend(f):
    t = f / FPS; c = in_card(t)
    if c and not REG['carte_sur_scene']:
        cv2.imwrite(f'{OUT}/clip/f{f:05d}.jpg', cv2.cvtColor(carte(c, t), cv2.COLOR_RGB2BGR)); return
    s = shot_at(t)
    if c and s[2] == c['apres']: c = None   # le sketch suivant a commencé : la carte s'arrête sur la coupe
    if s[2] not in SC: return
    S = SC[s[2]]; keep = s[4][0] if isinstance(s[4], tuple) else s[4]
    cs, c0, c1, cp = cadres_du_plan(S, s, keep)
    if not c and (f == RANGE[0] or (in_card((f - 1) / FPS) and not REG['carte_sur_scene']) or shot_at((f - 1) / FPS) != s):   # 1re image du plan : l'image source (preuve JEV)
        os.makedirs(f'{OUT}/source', exist_ok=True); sc0 = CW / c0[2]
        M0 = np.float32([[sc0, 0, -(c0[0] - c0[2] / 2) * sc0], [0, sc0, -(c0[1] - c0[3] / 2) * sc0]])
        src0 = cv2.GaussianBlur(S['img'], (0, 0), 0.45 / sc0) if sc0 < 0.95 else S['img']
        cv2.imwrite(f"{OUT}/source/{s[0]:06.2f}.jpg", cv2.cvtColor(cv2.warpAffine(src0, M0, (CW, CH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 94])
    cx, cy, w2, h2, ref, zp = cadre_t(s, (cs, c0, c1, cp), t)
    assert abs((w2 / h2) / (CW / CH) - 1) < 0.01, 'cadre étiré'
    ECHELLE_PLAN[0] = CW / w2   # agrandissement scène → écran de ce plan (taille des visages à l'écran)
    vis_ = (max(c0[0] - c0[2] / 2, c1[0] - c1[2] / 2), max(c0[1] - c0[3] / 2, c1[1] - c1[3] / 2),
            min(c0[0] + c0[2] / 2, c1[0] + c1[2] / 2), min(c0[1] + c0[3] / 2, c1[1] + c1[3] / 2))   # partie de la plaque visible tout le plan
    fr = frame_scene(S, t, (cx - ref[0], cy - ref[1]), zp, vis=vis_, t0=s[0], vue=(cx - w2 / 2, cy - h2 / 2, cx + w2 / 2, cy + h2 / 2))   # le décor suit la caméra à sa profondeur (parallaxe latérale et avant)
    sc = CW / w2; src_ = fr
    if sc < 0.95: src_ = cv2.GaussianBlur(fr, (0, 0), 0.45 / sc)
    Maff = np.float32([[sc, 0, -(cx - w2 / 2) * sc], [0, sc, -(cy - h2 / 2) * sc]])
    out = cv2.warpAffine(src_, Maff, (CW, CH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)  # acteur en bicubique + cadre en bilinéaire : netteté la plus proche de la source (mesurée)
    if sc > 1.15 and NETTETE > 0: out = nettete(out, sc)
    if c:   # visages pris au début de la carte (même placement dans tous les processus de rendu)
        t_r = max(s[0], c['t0'] - 0.05); out = sur_scene(out, c, t, visages_ecran(S, cadre_t(s, (cs, c0, c1, cp), t_r)))
    cv2.imwrite(f'{OUT}/clip/f{f:05d}.jpg', cv2.cvtColor(out, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 94])
# NETTETÉ RENDUE À L'AGRANDISSEMENT (18/10/2026) : un plan agrandi ×k par interpolation perd les détails fins en proportion ;
# masque flou classique (détail = image − image adoucie σ 1,1), gain croissant avec k (0,35 par unité au-delà de ×1, borné
# à 0,5), seuil de 3 niveaux pour ne pas relever le grain du JPEG ni le bruit des aplats.
NETTETE = float(os.environ.get('NETTETE', 0.35))
def nettete(im, k):
    a = min(0.5, NETTETE * (k - 1.0)); f = im.astype(np.float32); d = f - cv2.GaussianBlur(f, (0, 0), 1.1)
    d = np.where(np.abs(d) > 3.0, d, 0.0)
    return np.clip(f + a * d, 0, 255).astype(np.uint8)
def morceau(bloc):
    for f in bloc: (mesure_seule if SANS_RENDU else rend)(f)
    if MESURE and MESURES:
        with open(f'{OUT}/mesures-{os.getpid()}.jsonl', 'a') as fh:
            for m_ in MESURES: fh.write(json.dumps(m_, ensure_ascii=False) + '\n')
        MESURES.clear()
    return len(bloc)
cut_count = 0; prev = None   # coupes comptées dans l'ordre (le rendu, lui, est réparti sur les processeurs)
for f in RANGE:
    t = f / FPS
    if in_card(t) and not REG['carte_sur_scene']: prev = 'carte'; continue
    s = shot_at(t)
    if s[2] not in SC: continue
    if s != prev: cut_count += 1; prev = s
import time; T0 = time.time()
# JEV RÉALISATEUR (17/10/2026 : « fais de JEV le cadre de la vidéo, le réalisateur »). Avant le tournage, pour chaque plan,
# le moteur propose des cadres VALIDES (le sien, plus serré, plan moyen, plan à deux, plus large — têtes entières ou
# absentes) ; le moment central du plan est rendu dans chacun et JEV choisit celui qu'un grand réalisateur prendrait
# (Choice), sous condition stricte : aucune tête coupée (< 0,5) et visage de celui qui parle lisible (> 0,5). Décision mise
# en cache par empreinte (scène, plan, cadres proposés). TOURNE_REALISATEUR=0 : la règle du moteur seule.
C0_JEV, REALISATION = {}, {}
SEUIL_MAINS = 0.60    # mains d'un cadre candidat nettement ratées (v34)
REACTION_MIN = float(os.environ.get('REACTION_MIN', 96))   # visage de celui qui subit la chute dans le gros plan de réaction (px sur 460)
SEUIL_PROPRE = 0.42   # « rendu » de la porte G sur l'image d'un cadre candidat (sans marge, la porte tombe à 0,5 ; l'animation
                      # ajoute jusqu'à 0,17 — mesuré sur les plans de Koffi de la v31)
def realise(plans):
    import hashlib, uuid
    from concurrent.futures import ThreadPoolExecutor
    # RÉALISATEUR SANS MODÈLE D'IMAGES (18/10/2026, ep01 v6) : JEV coupé, les questions « tête coupée », « visage lisible »,
    # « mains » partaient vers SmolVLM sur le processeur — 8 réponses en 10 minutes, aucune image tournée. Pendant le
    # tournage, la voie de secours est fermée : le réalisateur décide par ses règles mesurées (taille du visage de chaque
    # orateur, têtes entières, réaction ≥ REACTION_MIN) et la tête « rendu » apprise quand elle est validée
    os.environ.setdefault('JUGE_VLM_MAX', '0')
    import jev_api, jev_film, juge_local
    CR = os.path.expanduser('~/.cache/massamba-jev/realisateur'); os.makedirs(CR, exist_ok=True)
    def parleurs_de(S, s):
        return sorted({L['qui'] for L in T['lines'] if L.get('sketch') == s[2] and L['t0'] < s[1] - 0.2 and L['t0'] + L['dur'] > s[0] + 0.2 and L['qui'] in S['acts']})
    def candidats(S, s, keep):
        # PARLEURS À L'IMAGE (v35) : v33, porte B — pendant « Et ta marmite… » (60,7–63,3 s), le plan à deux Modou / Tantie Awa
        # était cadré sur Modou seul (« moyen ») : Tantie parlait hors champ et JEV jugeait des lèvres fermées (0,08). Dans un
        # plan, tout cadre proposé montre la tête entière de chacun de ceux qui y parlent.
        parleurs = parleurs_de(S, s)
        cs_ = {'moteur': cadre_lisible(S, s, keep)}
        base = cs_['moteur']
        # GROS PLAN (v35) : v34, plan serré de Koffi à 39,61 — ses deux cadres (serré, moyen) montraient ses mains peintes à table
        # (JEV 0,61) : aucun cadre propre, porte M. Un cadre plus serré, le visage sur 38 % de la hauteur, sort la table du champ
        for nom, c in (('visage', crop_visage_ok(S, keep) if keep in S['acts'] else None), ('gros', crop_visage(S, keep, 0.38) if keep in S['acts'] else None),
                       ('serre', crop_for(S, 'serre', keep) if keep in S['acts'] else None), ('moyen', crop_for(S, 'moyen', keep) if keep in S['acts'] else None),
                       ('deux', crop_for(S, 'duo', s[4] if isinstance(s[4], tuple) else (keep,))), ('large', (base[0], base[1], base[2] * 1.25, base[3] * 1.25))):
            if c is None: continue
            c0_ = c; c = faces_ok(S, clamp_crop(S, c), keep)
            if os.environ.get('TOURNE_CANDIDATS'): print(f"  cadre {s[0]:.2f} {keep} {nom} : {[round(v) for v in c0_]} → {[round(v) for v in c]}, tête coupée {tete_coupee(S, c, keep)}", flush=True)
            if tete_coupee(S, c, keep): continue
            if any(not tete_dedans(S, c, n_) for n_ in parleurs): continue   # celui qui parle dans le plan reste à l'image
            if all(abs(c[2] / v[2] - 1) > 0.06 or abs(c[0] - v[0]) > 0.08 * v[2] for v in cs_.values()): cs_[nom] = c
        return cs_
    def un(s):
        S = SC[s[2]]; keep = s[4][0] if isinstance(s[4], tuple) else s[4]; cs_ = candidats(S, s, keep)
        cle = hashlib.sha1(json.dumps([list(s[:5]), {k: [round(x, 1) for x in v] for k, v in cs_.items()}, cfg['scenes'][s[2]],
                                       os.path.getmtime(os.path.join(cfg['scenes'][s[2]], 'image.png')), 'propre-4-parleurs'], default=str).encode()).hexdigest()[:20]
        f_ = f'{CR}/{cle}.json'; diag = os.environ.get('TOURNE_CANDIDATS')   # diagnostic : images des cadres proposés
        if os.path.isfile(f_) and not diag:
            d_ = json.load(open(f_))
            if d_.get('conforme') is None and str(d_.get('juge', '')).startswith('règles locales') and d_.get('choix') in cs_:   # décision gardée d'avant le 19/10
                vmin_ = all(taille_visage(S, n_, cs_[d_['choix']]) >= VISAGE_MIN for n_ in (parleurs_de(S, s) or ([keep] if keep in S['acts'] else [])))
                d_['conforme'] = bool(vmin_ and not tete_coupee(S, cs_[d_['choix']], keep)); d_['juge'] = 'règles locales (géométrie mesurée)'
            return s, d_['choix'], cs_, d_
        tm = (s[0] + s[1]) / 2; fr = frame_scene(S, tm)
        ims = {}
        for nom, (cx, cy, w2, h2) in cs_.items():
            sc = CW / w2; M_ = np.float32([[sc, 0, -(cx - w2 / 2) * sc], [0, sc, -(cy - h2 / 2) * sc]])
            ims[nom] = cv2.cvtColor(cv2.warpAffine(fr, M_, (CW, CH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT), cv2.COLOR_RGB2BGR)
        if diag:
            os.makedirs(diag, exist_ok=True)
            for nom, im in ims.items(): cv2.imwrite(f'{diag}/{s[0]:05.2f}-{nom}.jpg', im)
            json.dump({k_: [round(x, 1) for x in v] for k_, v in cs_.items()}, open(f'{diag}/{s[0]:05.2f}.json', 'w'))
            return s, 'moteur', cs_, None
        A = S['acts'].get(keep); hb = head_box(A) if A else None
        if hb:
            x0, y0, x1, y1 = [int(v) for v in hb]; ims['parleur'] = cv2.cvtColor(S['img'][max(0, y0):y1, max(0, x0):x1], cv2.COLOR_RGB2BGR)
        ids, assets = {}, {}
        for k_, im in ims.items():
            ids[k_] = f'{k_}-{uuid.uuid4().hex[:6]}'; assets[ids[k_]] = {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(im)}
        noms = [k_ for k_ in cs_]
        # v30 : les plans à un seul cadre possible (Maman à 0,00, 14,16, 24,56) n'étaient pas jugés — conformité vide, porte M
        # perdue d'avance ; ils le sont désormais (têtes coupées, visage lisible), sans question de choix
        Q = {} if len(noms) < 2 else {'choix': {'type': 'choice', 'instructions': 'The images ' + ', '.join(f'`{k_}`' for k_ in noms) + ' are alternative framings of the same moment of a '
                       'dialogue scene in an animated film' + (' ; `parleur` shows the head of the character who is speaking' if 'parleur' in ims else '') + '. '
                       'Which framing would a great film director choose: the speaker well framed with a readable face, the reaction of the other '
                       'character readable when it matters, balanced composition, no head or important part cut by the frame edge?',
                       'criteria': {k_: f'image `{k_}`' for k_ in noms}}}
        # CADRE PROPRE (18/10/2026, v31) : la porte G juge chaque image du film ; la peinture d'origine elle-même frôle le
        # défaut dans certains cadres (maquis entier : table et jambes de Koffi, « rendu » 0,45–0,50 sur l'image source sans
        # animation ; tête de Koffi seule 0,30) — l'animation y ajoute 0,04 à 0,17 et fait tomber le plan. La question de la
        # porte G, mot pour mot, est posée sur chaque cadre candidat ; un cadre déjà à SEUIL_PROPRE ou plus est écarté
        ids['contexte'] = jev_film.STYLE
        for k_ in noms:
            Q[f'propre_{k_}'] = {'type': 'noul', 'instructions': jev_film.N1['rendu'][1].replace('`frame`', f'`{k_}`')}
            Q[f'coupe_{k_}'] = {'type': 'noul', 'instructions': f'In image `{k_}`, is any character\'s head or face partly cut by the edge of the frame?'}
            Q[f'lisible_{k_}'] = {'type': 'noul', 'instructions': f'In image `{k_}`, is the face of the speaking character' + (' (shown in `parleur`)' if 'parleur' in ims else '') + ' large and clear enough to read the expression and the mouth?'}
            # MAINS PEINTES (v34) : v33, plan de Koffi à 34,71 — 55 images « rendu » ; JEV, interrogé sur chaque partie, y montrait
            # les mains à table (0,63 à 0,74), déjà mal dessinées sur la peinture d'origine (0,67), le visage restant sous 0,5. Un
            # réalisateur cadre hors champ des mains ratées : la question est posée sur chaque cadre candidat
            Q[f'mains_{k_}'] = {'type': 'noul', 'instructions': f'Read `contexte`. In image `{k_}`, look only at the HANDS and fingers that are visible: is any hand deformed, melted into an object, bent unnaturally, with wrong or merged fingers, or doubled? Hands outside the picture do not count.'}
        # la règle géométrique de la porte B aussi (visage de celui qui parle ≥ VISAGE_MIN px) : v31, Baye à 60 px et Petit
        # Mamadou à 57 px faisaient tomber la porte B malgré des lèvres justes (JEV « lisible » les acceptait)
        # … et pour CHACUN de ceux qui parlent dans le plan (v35 : la porte B mesure le visage de celui qui parle)
        grand = lambda k_: all(taille_visage(S, n_, cs_[k_]) >= VISAGE_MIN for n_ in (parleurs_de(S, s) or ([keep] if keep in S['acts'] else [])))
        try:
            a = jev_api.demande(ids, Q, assets, outil='jev_realisateur')
        except juge_local.NonJuge:
            # JEV COUPÉ (18/10/2026) — la décision du réalisateur reproduite en règles, d'après ses 268 décisions gardées : le
            # cadre du moteur 44 % des fois (puis visage 20 %, moyen 13 %), un cadre conforme 88 % des fois. Le cadre du moteur
            # s'il rend la bouche de chaque orateur lisible (≥ VISAGE_MIN), sinon le plus petit cadre qui la rend lisible ;
            # sa propreté (question « rendu » de la porte G) par la tête locale quand elle est validée, sinon « non jugée »
            ok_g = [k_ for k_ in noms if grand(k_)]
            vpx = {k_: round(taille_visage(S, keep, cs_[k_]), 1) for k_ in noms} if keep in S['acts'] else {}
            choix = 'moteur' if ('moteur' in ok_g or not ok_g) else min(ok_g, key=lambda k_: vpx.get(k_, 0.0))
            rendu = {}
            try:
                r_ = jev_api.demande({'frame': ids[choix], 'contexte': jev_film.STYLE}, {'propre': {'type': 'noul', 'instructions': jev_film.N1['rendu'][1]}},
                                     {ids[choix]: assets[ids[choix]]}, outil='jev_realisateur')
                rendu = {choix: round(r_['propre']['noul'], 2)}
            except juge_local.NonJuge:
                pass
            # PORTE M MESURÉE (19/10/2026) : sa définition est géométrique — aucune tête coupée par le cadre choisi, visage de
            # chaque orateur ≥ VISAGE_MIN ; la propreté de l'image reste à la porte G (jugée quand une tête locale l'est)
            coupe_ = bool(tete_coupee(S, cs_[choix], keep))
            conf_ = (choix in ok_g) and not coupe_ and (rendu[choix] < SEUIL_PROPRE if rendu else True)
            d_ = {'choix': choix, 'conforme': conf_, 'juge': 'règles locales (géométrie mesurée)',
                  'probabilites': {k_: float(k_ == choix) for k_ in noms}, 'coupe': {choix: coupe_}, 'lisible': {k_: k_ in ok_g for k_ in noms},
                  'rendu': rendu, 'mains': {}, 'visage_px': vpx}
            json.dump(d_, open(f_, 'w')); return s, choix, cs_, d_
        pr = a['choix']['probabilities'] if 'choix' in a else {noms[0]: 1.0}; ok_ = [k_ for k_ in noms if a[f'coupe_{k_}']['noul'] < 0.5 and a[f'lisible_{k_}']['noul'] > 0.5 and grand(k_)]
        # rendu de la porte G, et les mains quand elles sont nettement ratées (SEUIL_MAINS) : mesuré au premier essai v34, les
        # mains simplement posées (hanches, genoux) donnent 0,44–0,58 et la porte G ne les compte pas ; Koffi à table, 0,63–0,74
        sale = lambda k_: max(a[f'propre_{k_}']['noul'], a[f'mains_{k_}']['noul'] if a[f'mains_{k_}']['noul'] >= SEUIL_MAINS else 0.0)
        propres = [k_ for k_ in ok_ if sale(k_) < SEUIL_PROPRE]
        if propres: choix = max(propres, key=lambda k_: pr.get(k_, 0.0))
        else:   # aucun cadre propre : le moins douteux parmi les conformes, sinon parmi les lisibles sans tête coupée
            ok2 = [k_ for k_ in noms if a[f'coupe_{k_}']['noul'] < 0.5 and a[f'lisible_{k_}']['noul'] > 0.5]
            # BOUCHE LISIBLE AVANT TOUT (18/10/2026, v5) : sans cadre conforme, le repli prenait le plus « propre » — le plan large
            # du loyer (visages de 66 px) — et la porte B tombait (17/22) alors qu'un cadre à 82 px existait ; la règle
            # géométrique de la porte B passe donc avant la propreté du rendu
            g_ = [k_ for k_ in noms if grand(k_) and a[f'coupe_{k_}']['noul'] < 0.5]
            choix = min(ok_ or [k_ for k_ in ok2 if grand(k_)] or g_ or ok2 or noms, key=sale)
        d_ = {'choix': choix, 'conforme': bool(propres), 'probabilites': pr, 'coupe': {k_: round(a[f'coupe_{k_}']['noul'], 2) for k_ in noms},
              'lisible': {k_: round(a[f'lisible_{k_}']['noul'], 2) for k_ in noms}, 'rendu': {k_: round(a[f'propre_{k_}']['noul'], 2) for k_ in noms},
              'mains': {k_: round(a[f'mains_{k_}']['noul'], 2) for k_ in noms},
              'visage_px': {k_: round(taille_visage(S, keep, cs_[k_]), 1) for k_ in noms} if keep in S['acts'] else {}}
        json.dump(d_, open(f_, 'w')); return s, choix, cs_, d_
    def reaction(s, choix, d_):
        """GROS PLAN DE RÉACTION LISIBLE (18/10/2026, ep02 v1, porte P) : sur le plan de réaction à la chute des assiettes,
        personne ne parle ; JEV « réalisateur » préférait le plan à deux (0,40) et le cadre moteur l'a emporté — Baye à 81 px,
        « choquée » 0,25 sur les trois images contrôlées. Les chocs qui passent la porte P (ep01 v5 : Maman 99,7 px, Coumba
        105,8 px, Tantie Awa 128,6 px) ont tous le visage à 96 px au moins : dans un plan de réaction muet, seul un cadre propre
        qui donne ce visage peut être retenu, le préféré de JEV parmi eux. Recalculé sur les réponses gardées en cache."""
        if s[3] != 'gros' or not d_ or not d_.get('visage_px') or parleurs_de(SC[s[2]], s): return choix
        px = d_['visage_px']
        if px.get(choix, 0) >= REACTION_MIN: return choix
        if d_.get('juge') == 'règles locales':   # JEV coupé : le plus petit cadre qui donne REACTION_MIN (têtes coupées déjà écartées)
            ok = [k_ for k_ in px if px[k_] >= REACTION_MIN]
            return min(ok, key=lambda k_: px[k_]) if ok else choix
        sale_ = lambda k_: max(d_['rendu'][k_], d_['mains'][k_] if d_['mains'][k_] >= SEUIL_MAINS else 0.0)
        ok = [k_ for k_ in px if px[k_] >= REACTION_MIN and d_['coupe'][k_] < 0.5 and d_['lisible'][k_] > 0.5 and sale_(k_) < SEUIL_PROPRE]
        return max(ok, key=lambda k_: d_['probabilites'].get(k_, 0.0)) if ok else choix
    with ThreadPoolExecutor(8) as ex: res = [(s, reaction(s, choix, d_), cs_, d_) for s, choix, cs_, d_ in ex.map(un, [s for s in plans if s[2] in SC])]
    for s, choix, cs_, d_ in res:
        C0_JEV[tuple(s[:5])] = cs_[choix]; REALISATION[f'{s[0]:.2f}'] = dict(d_ or {}, choix=choix, proposes=list(cs_))
        print(f"réalisateur JEV — plan {s[0]:.2f} {s[3]} {s[4]} : {choix}" + ('' if not d_ else f" (choix {d_['probabilites'].get(choix, 0):.2f}, rendu {d_.get('rendu', {}).get(choix, '?')}{'' if d_['conforme'] else ', AUCUN CADRE PROPRE'})"), flush=True)
if os.environ.get('TOURNE_REALISATEUR', '1') == '1' and os.environ.get('TOURNE_CADRES') != '1':
    realise([s for s in SH if int(s[1] * FPS) >= RANGE[0] and int(s[0] * FPS) <= RANGE[-1]])
    if os.environ.get('TOURNE_CANDIDATS'): print('cadres proposés écrits dans', os.environ['TOURNE_CANDIDATS']); raise SystemExit(0)
for s in SH:   # cadres calculés une fois AVANT le partage : chaque processeur en hérite et tournage.json les garde (diagnostic caméra)
    if s[2] in SC and int(s[1] * FPS) >= RANGE[0] and int(s[0] * FPS) <= RANGE[-1]: cadres_du_plan(SC[s[2]], s, s[4][0] if isinstance(s[4], tuple) else s[4])
if os.environ.get('TOURNE_CADRES') == '1':   # diagnostic : les cadres seuls (début, fin, chute) de chaque plan, sans rendu
    json.dump({f'{k[0]:.2f} {k[3]}': {'cadres': [None if c is None else [round(v, 1) for v in c] for c in v_],
                                       'visages_px': {n: round(taille_visage(SC[k[2]], n, v_[1]), 1) for n in SC[k[2]]['acts']}} for k, v_ in CADRES.items()},
              open(f'{OUT}/cadres.json', 'w'), indent=1, ensure_ascii=False)
    print('cadres écrits', len(CADRES)); raise SystemExit(0)
# TOURNAGE INCRÉMENTAL (avis de JEV du 17/10/2026 sur la vitesse : « ne refaire et ne recontrôler que les plans qui ont
# changé », 0,85 ; gain attendu 2,73/4). Chaque plan reçoit une EMPREINTE de tout ce qui fait ses images : code du moteur
# (les bêtes et leur physique à part : elles ne touchent que les sketchs qui en ont), fichiers de sa scène (dessin, rig,
# visages, audit, genèse, bêtes, vie), images des bêtes, réglages, cadres, bornes du plan, répliques et visèmes de son
# sketch, cartes qui le recouvrent. Un plan dont l'empreinte est au cache est recopié par liens physiques (0 octet de plus)
# avec ses mesures et son image source ; seuls les autres sont tournés, puis rangés. TOURNE_CACHE=0 : tout retourner.
import hashlib, shutil
CACHE = os.environ.get('TOURNE_CACHE', os.path.expanduser('~/.cache/massamba-tournage'))
def _h(*parts): return hashlib.sha1(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()[:24]
_ICI = os.path.dirname(os.path.abspath(__file__)); _ENT = {'entites.py', 'genese.py', 'physique.py'}
_MODS = sorted(f for f in os.listdir(_ICI) if f.endswith('.py'))
def _code(noms): return _h([(f, hashlib.sha1(open(os.path.join(_ICI, f), 'rb').read()).hexdigest()) for f in noms])
CODE_BASE, CODE_ENT = _code([f for f in _MODS if f not in _ENT]), _code([f for f in _MODS if f in _ENT])
# la couche « vrai humain » dépend aussi du lecteur de capture, de l'index des gestes et des prises présentes en cache
_FILM = os.path.join(_ICI, '..', 'blender', 'film'); _CMU = os.path.expanduser('~/.cache/massamba-models/cmu-mocap')
CODE_BASE = _h(CODE_BASE, [hashlib.sha1(open(os.path.join(_FILM, f), 'rb').read()).hexdigest() for f in ('mocap.py', 'direction-vocab.json') if os.path.isfile(os.path.join(_FILM, f))],
               sorted((f, os.path.getsize(os.path.join(_CMU, f))) for f in os.listdir(_CMU)) if os.path.isdir(_CMU) else None)
CODE_BASE = _h(CODE_BASE, sorted((os.path.relpath(os.path.join(r, f), PD.RACINE), os.path.getsize(os.path.join(r, f))) for r, _, fs in os.walk(PD.RACINE) for f in fs)
               if os.path.isdir(PD.RACINE) and PD.ACTIF else None)   # planches de poses : un geste dessiné change le plan
# dictionnaire humain (BEAT2) et réglages de la couche « vrai humain » par variables d'environnement : sans eux, un tournage
# MOCAP_SOURCE=beat2+cmu reprenait les images d'un tournage MOCAP_SOURCE=cmu (constaté le 19/10/2026)
_B2 = os.path.expanduser(os.environ.get('BEAT2_PISTES', '~/.cache/massamba-models/beat2-pistes'))
CODE_BASE = _h(CODE_BASE, {k: os.environ.get(k) for k in ('MOCAP_SOURCE', 'MOCAP_BEAT_N', 'BEAT2_PISTES')},
               (os.path.getsize(os.path.join(_B2, 'dictionnaire.json')), len(os.listdir(_B2))) if os.path.isfile(os.path.join(_B2, 'dictionnaire.json')) else None)
def _dossier(d):
    L_ = []
    for r_, _, fs in os.walk(d):
        for f in fs:
            st = os.stat(os.path.join(r_, f)); L_.append((os.path.relpath(os.path.join(r_, f), d), st.st_size, st.st_mtime_ns))
    return _h(sorted(L_))
_DOSS = {}
def empreinte(s):
    sid = s[2]; S_ = SC[sid]; ent = bool(S_.get('ents'))
    if sid not in _DOSS: _DOSS[sid] = (_dossier(cfg['scenes'][sid]), _dossier(entites.DOSSIER) if ent and os.path.isdir(entites.DOSSIER) else None)
    keep_ = s[4][0] if isinstance(s[4], tuple) else s[4]
    cartes = [c for c in T['cartes'] if c['t0'] - 0.05 < s[1] and c['t1'] + 0.2 > s[0]]
    return _h(CODE_BASE, CODE_ENT if ent else None, _DOSS[sid], REG, MESURE, list(s), cadres_du_plan(S_, s, keep_), FPS, CW, CH,
              [L for L in T['lines'] if L.get('sketch') == sid], [k for k in T['sketchs'] if k['id'] == sid], cartes)
def _lien(a, b):
    if os.path.lexists(b): os.remove(b)
    try: os.link(a, b)
    except OSError: shutil.copy2(a, b)
CLES, REPRIS = {}, []
# TOURNAGE SANS RENDU (19/10/2026, « produire un film entier en 1 minute pour accélérer les tests ») : tout le jeu est calculé
# (pistes, cadres, réalisateur, regards, visages) mais aucune image n'est dessinée ; seules les mesures image par image des
# acteurs sont écrites, à la grille de 30 Hz, avec les MÊMES valeurs que le rendu (pose du squelette, lacet du visage, regard,
# émotions, mâchoire) — de quoi juger en une minute les portes D (écoute, regards), E (automate), I (fluidité) et la
# souplesse de Q. L'étirement (porte C) et tout ce qui se voit à l'image ne sont pas mesurés dans ce mode.
SANS_RENDU = os.environ.get('TOURNE_SANS_RENDU') == '1'
def mesure_seule(f):
    t = f / FPS
    if not mesure_ici(t) or (in_card(t) and not REG['carte_sur_scene']): return
    s = shot_at(t)
    if s[2] not in SC: return
    S = SC[s[2]]
    for name, A in S['acts'].items():
        if not A.get('rig') or name not in S['pistes']: continue
        P = S['pistes'][name]; k = min(NF - 1, max(0, int(round(t * FPS)))); v = lambda c: float(P[c][k])
        jj = machoire(name, t)
        if 'bouche_bee' in P: jj = max(jj, v('bouche_bee'))
        emo = {e: v('emo_' + e) for e in jeu.EMOS if P['emo_' + e][k] > 0.02}
        pose = pose_rig(A['rig'], P, k)
        MESURES.append(dict(qui=name, t=round(t, 3), etirement=(0.0, 0.0), sans_rendu=True, bouche=round(float(jj), 3), emotions={c: round(x_, 2) for c, x_ in emo.items()},
                            pose={**{c: (round(x_, 2) if not isinstance(x_, (tuple, list)) else [round(float(y_), 2) for y_ in x_]) for c, x_ in pose.items() if c != 'gestes'},
                                  **({'lacet_visage': round(v('lacet_visage'), 2)} if 'lacet_visage' in P else {})},
                            bras=[round(float(g_[0]), 1) for g_ in pose.get('gestes') or []], regard=round(v('regard_x'), 2),
                            regard_y=round(v('regard_y'), 2) if 'regard_y' in P else 0.0, regard_peint=[round(x_, 2) for x_ in regard.peint(A.get('yeux'))],
                            lacet_peint=A.get('env', {}).get('lacet_peint')))
if CACHE != '0' and not SANS_RENDU:
    os.makedirs(CACHE, exist_ok=True); par_plan = {}
    for f in RANGE:
        t_ = f / FPS
        if in_card(t_) and not REG['carte_sur_scene']: continue
        s_ = shot_at(t_)
        if s_[2] in SC: par_plan.setdefault(SH.index(s_), []).append(f)
    for i, fr in par_plan.items():
        cle = empreinte(SH[i]); CLES[i] = (cle, fr); dc = f'{CACHE}/{cle}'
        if os.path.isfile(f'{dc}/ok') and all(os.path.isfile(f'{dc}/f{k:05d}.jpg') for k in range(len(fr))):
            for k, f in enumerate(fr): _lien(f'{dc}/f{k:05d}.jpg', f'{OUT}/clip/f{f:05d}.jpg')
            if os.path.isfile(f'{dc}/source.jpg'): os.makedirs(f'{OUT}/source', exist_ok=True); _lien(f'{dc}/source.jpg', f"{OUT}/source/{SH[i][0]:06.2f}.jpg")
            if os.path.isfile(f'{dc}/mesures.jsonl'):
                with open(f'{OUT}/mesures-cache.jsonl', 'a') as fh: fh.write(open(f'{dc}/mesures.jsonl').read())
            os.utime(f'{dc}/ok'); REPRIS.append(i)
    deja = {f for i in REPRIS for f in CLES[i][1]}
    print(f'incrémental : {len(REPRIS)}/{len(CLES)} plans repris du cache ({len(deja)} images), {len(CLES) - len(REPRIS)} à tourner', flush=True)
    RANGE_T = [f for f in RANGE if f not in deja]
else:
    RANGE_T = list(RANGE)
# RENDU PARALLÈLE : les images sont indépendantes ; chaque processeur tourne des blocs de 24 images (TOURNE_PROCS)
NPROC = int(os.environ.get('TOURNE_PROCS', os.cpu_count() or 1)); blocs = [list(RANGE_T[i:i + 24]) for i in range(0, len(RANGE_T), 24)]
# REPRISE (18/10/2026 : le conteneur a redémarré au milieu du tournage de l'épisode 1, à 2 764 images sur 4 047) :
# TOURNE_REPRISE=1 garde les blocs déjà tournés EN ENTIER (toutes leurs images présentes ; leurs mesures sont écrites à la fin
# du bloc, morceau) ; un bloc commencé est retourné en entier
if os.environ.get('TOURNE_REPRISE') == '1':
    _n0 = len(blocs); blocs = [b for b in blocs if not all(os.path.isfile(f'{OUT}/clip/f{f:05d}.jpg') for f in b)]
    print(f'reprise : {_n0 - len(blocs)} blocs de 24 images déjà tournés, {len(blocs)} à tourner', flush=True)
if NPROC > 1:
    import multiprocessing as mpr
    # le réservoir de fils d'OpenCV est vidé AVANT le fork : un fils hérite sinon de fils d'exécution qui n'existent pas
    # chez lui et attend leur réponse indéfiniment (blocage mesuré le 17/10 : 4 processus à 0 % pendant 12 min)
    cv2.setNumThreads(1)
    with mpr.get_context('fork').Pool(NPROC) as pool:
        fait = 0
        for n in pool.imap_unordered(morceau, blocs):
            fait += n
            if fait % 240 < 24: print(f'{fait}/{len(RANGE_T)}', flush=True)
else:
    for b in blocs: morceau(b)
if CLES:   # les plans tournés rejoignent le cache (images, image source, mesures du plan)
    import glob as _glob
    MES_ = [json.loads(l) for f_ in _glob.glob(f'{OUT}/mesures-*.jsonl') if not f_.endswith('mesures-cache.jsonl') for l in open(f_) if l.strip()]
    for i, (cle, fr) in CLES.items():
        if i in REPRIS: continue
        s_ = SH[i]; dc = f'{CACHE}/{cle}'; tmp = dc + '.tmp'; shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp)
        if not all(os.path.isfile(f'{OUT}/clip/f{f:05d}.jpg') for f in fr): shutil.rmtree(tmp); continue
        for k, f in enumerate(fr): _lien(f'{OUT}/clip/f{f:05d}.jpg', f'{tmp}/f{k:05d}.jpg')
        if os.path.isfile(f"{OUT}/source/{s_[0]:06.2f}.jpg"): _lien(f"{OUT}/source/{s_[0]:06.2f}.jpg", f'{tmp}/source.jpg')
        t0_, t1_ = fr[0] / FPS - 1e-6, (fr[-1] + 1) / FPS
        with open(f'{tmp}/mesures.jsonl', 'w') as fh:
            for m_ in MES_:
                if t0_ <= float(m_.get('t', -1)) < t1_: fh.write(json.dumps(m_, ensure_ascii=False) + '\n')
        open(f'{tmp}/ok', 'w').write(json.dumps({'plan': list(s_), 'images': len(fr)}, default=str))
        shutil.rmtree(dc, ignore_errors=True); os.rename(tmp, dc)
    # cache borné (TOURNE_CACHE_GO, 3 Go par défaut, et jamais plus de 30 % de l'espace dont dispose la session — disque
    # plein à 98 % le 17/10) : les plans les moins récemment servis partent d'abord
    tailles = []
    for e_ in os.listdir(CACHE):
        p_ = f'{CACHE}/{e_}'
        if os.path.isfile(f'{p_}/ok'): tailles.append((os.path.getmtime(f'{p_}/ok'), sum(os.path.getsize(f'{p_}/{x}') for x in os.listdir(p_)), p_))
    tot = sum(t[1] for t in tailles)
    lim = min(float(os.environ.get('TOURNE_CACHE_GO', 3)) * 1e9, 0.3 * (shutil.disk_usage(CACHE).free + tot))
    for _, sz, p_ in sorted(tailles):
        if tot <= lim: break
        shutil.rmtree(p_, ignore_errors=True); tot -= sz
json.dump({'images': NF, 'fps': FPS, 'plans': cut_count, 'plans_par_minute': round(cut_count / (total / 60), 1), 'reglages': REG, 'decoupage': [list(map(lambda v: round(v, 2) if isinstance(v, float) else (list(v) if isinstance(v, tuple) else v), s)) for s in SH],
           'cadres': {f'{k[0]:.2f}': [None if c is None else [round(v, 1) for v in c] for c in v_] for k, v_ in CADRES.items()},
           'empreintes': {f'{SH[i][0]:.2f}': c_[0] for i, c_ in CLES.items()}, 'repris_du_cache': [round(SH[i][0], 2) for i in REPRIS], 'realisateur_jev': REALISATION, 'jeu_humain': JOURNAL_JEU},
          open(f'{OUT}/tournage.json', 'w'), ensure_ascii=False, indent=1)
print('ok', len(RANGE), 'images,', cut_count, 'plans,', round(time.time() - T0), 's', f'({len(RANGE_T)} tournées, {len(RANGE) - len(RANGE_T)} reprises du cache)')
