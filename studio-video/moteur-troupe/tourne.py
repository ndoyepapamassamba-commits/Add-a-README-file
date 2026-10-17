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
import decor_vivant, gestes, rig2d, regard, expressions, expressions_lp, jeu, prepare_rig
FPS, CW, CH = 30, 576, 460
cfg = json.load(open(sys.argv[1])); OUT = sys.argv[2]; os.makedirs(f'{OUT}/clip', exist_ok=True)
REG = {'plan_s': 5.0, 'cam_px': 2.5, 'pousse': 1.10, 'parallaxe': 0.35, 'jeu_gain': 2.3, 'corps': 0.1, 'whip_s': 0.45, 'ouverture': 2.2, 'decor': 1.0, 'gestes': 1.0, 'carte_sur_scene': 1, 'rig': 1}
REG.update(cfg.get('reglages', {}))
ONLY = sys.argv[3] if len(sys.argv) > 3 else None  # essai : un seul sketch
T = json.load(open(cfg['timeline'])); total = T['total']; NF = int(math.ceil(total * FPS))
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
    cache = f'{d}/profondeur.png'
    if os.path.isfile(cache): return cv2.imread(cache, 0).astype(np.float32) / 255
    import onnxruntime as ort
    s_ = ort.InferenceSession(os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/depth-anything-v2-small.onnx', providers=['CPUExecutionProvider'])
    H_, W_ = plate.shape[:2]; k = 518 / min(W_, H_); w, h = max(14, round(W_ * k / 14) * 14), max(14, round(H_ * k / 14) * 14)
    x = cv2.resize(plate, (w, h), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    dd = s_.run(None, {'pixel_values': x.transpose(2, 0, 1)[None]})[0][0]
    lo, hi = np.percentile(dd, 1), np.percentile(dd, 99); dd = np.clip((dd - lo) / max(1e-6, hi - lo), 0, 1)   # 1 = près
    dd = cv2.resize(dd.astype(np.float32), (W_, H_), interpolation=cv2.INTER_CUBIC)
    cv2.imwrite(cache, (dd * 255).astype(np.uint8)); return dd
def facteur_parallaxe(dep, acts, H_, W_):
    """vitesse apparente de chaque point du décor par rapport aux acteurs : 1 au niveau de leurs pieds, 1 − P au plus
    loin, jusqu'à 1 + P/2 au premier plan ; lissée pour ne jamais déchirer l'image."""
    P = REG['parallaxe']; pieds = []
    for A in acts.values():
        x0, y0, x1, y1 = A['bbox']; pieds.append(float(dep[min(H_ - 1, int(y1) - 2), min(W_ - 1, max(0, int((x0 + x1) / 2)))]))
    df = float(np.median(pieds)) if pieds else 0.6; lo, hi = float(dep.min()), float(dep.max())
    k = np.where(dep <= df, 1 - P * (df - dep) / max(1e-3, df - lo), 1 + 0.5 * P * (dep - df) / max(1e-3, hi - df))
    return cv2.GaussianBlur(k.astype(np.float32), (0, 0), 6)
# ── scènes préparées ──
SC = {}
for sk in T['sketchs']:
    if ONLY and sk['id'] != ONLY: continue
    d = cfg['scenes'][sk['id']]; S = json.load(open(f'{d}/scene.json'))
    img = cv2.cvtColor(cv2.imread(f'{d}/image.png'), cv2.COLOR_BGR2RGB); plate = cv2.cvtColor(cv2.imread(f'{d}/plaque.png'), cv2.COLOR_BGR2RGB)
    rinfo = prepare_rig.prepare(d) if REG['rig'] else None   # une fois par scène (cache <scène>/rig/)
    if rinfo: plate = cv2.cvtColor(cv2.imread(f'{d}/rig/plaque.png'), cv2.COLOR_BGR2RGB)
    acts = {}
    for a in S['acteurs']:
        if rinfo and rinfo['acteurs'].get(a['nom'], {}).get('pts'): a['pts'] = rinfo['acteurs'][a['nom']]['pts']   # squelette affiné à la préparation
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
        if rinfo:   # squelette de la tête aux pieds (rig2d) sur la découpe de la personne entière
            sl = a['slug']; A_ = acts[a['nom']]; ent = rinfo['acteurs'].get(a['nom'], {})
            al = cv2.imread(f'{d}/rig/alpha-{sl}.png', cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535; im_a = img
            if ent.get('complete'):
                x0c, y0c, x1c, y1c = ent['complete']; im_a = img.copy(); im_a[y0c:y1c, x0c:x1c] = cv2.cvtColor(cv2.imread(f'{d}/rig/complete-{sl}.png'), cv2.COLOR_BGR2RGB)
            v3 = np.load(f'{d}/rig/visage3d-{sl}.npy') if os.path.isfile(f'{d}/rig/visage3d-{sl}.npy') else None
            bras_ = prepare_rig.charge_bras(f'{d}/rig/bras-{sl}.npz') if os.path.isfile(f'{d}/rig/bras-{sl}.npz') else []
            assis_ = prepare_rig.assis(a); box_ = rig2d.boite(a['bbox'], img.shape)
            R_ = rig2d.preparer(im_a, al, a['pts'], a['bbox'], gestes.classes(img, box_), plaque=plate, bras=bras_, segmente=gestes.classes, visage3d=v3, assis=assis_)
            dl = f'{d}/expressions/{sl}'
            A_['xl'] = expressions_lp.charge(dl, im_a, v3) if os.path.isfile(f'{dl}/meta.json') and v3 is not None else None
            src00 = im_a   # le visage tel qu'il sera tourné au repos : les yeux du regard sont pris dessus (pas de saut au premier coup d'œil)
            if A_['xl']: src00 = expressions_lp.colle(im_a, A_['xl'], expressions_lp.visage(A_['xl'], {}, 0.0))
            elif lib:
                Rr = lib['roi']; src00 = im_a.copy(); src00[Rr[1]:Rr[3], Rr[0]:Rr[2]] = np.clip(lib[(0, 0)], 0, 255).astype(np.uint8)
            A_.update(rig=R_, img=im_a, mask=cv2.GaussianBlur(al, (0, 0), 0.5), assis=assis_, env=rig2d.enveloppe(R_), bras=[], marge_bras=0)
            A_['yeux'] = regard.prepare(src00, v3)
            A_['expr'] = expressions.prepare(im_a, v3, yeux=A_['yeux'])
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
    kpar = facteur_parallaxe(profondeur(d, plate), acts, img.shape[0], img.shape[1]) if REG['parallaxe'] > 0 else None
    vie = decor_vivant.prepare(d, plate, [A_['mask'] for A_ in acts.values()]) if REG['decor'] > 0 else None
    SC[sk['id']] = dict(img=img, plate=plate, acts=acts, H=img.shape[0], W=img.shape[1], sk=sk, xs=xs_, ys=ys_, kpar=kpar, vie=vie)
gestes.ferme()
if REG['rig']:   # pistes de jeu et ressenti de chaque personnage, image par image, pour tout le film
    for sid, S_ in SC.items():
        A2 = S_['acts']
        S_['pistes'] = jeu.pistes(T['lines'], sid, list(A2), {n: float(A['hip'][0]) for n, A in A2.items()}, {n: A.get('assis', False) for n, A in A2.items()},
                                  {n: A.get('env', {}) for n, A in A2.items()}, NF, FPS, {n: len(A['rig']['bras']) if A.get('rig') else 0 for n, A in A2.items()})
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
            u = t - (C['t0'] + C['dur'] * 0.7)
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
            u = t - (C['t0'] + C['dur'] * 0.7)
            if 0 <= u < 1.8:
                k = ease(u / 0.25) * (1 - ease((u - 1.3) / 0.5)); ang = [max(a_, G * 0.55 * k) for a_ in ang]
    # fraction du geste (0 → 1) → (angle, avancée) dans l'enveloppe sans défaut du bras
    return [(f_ * b_['amax'], 1 + f_ * (b_['emax'] - 1)) for f_, b_ in zip(ang, B)]
MESURE = os.environ.get('ETIREMENT') == '1'; MESURES = []
def etirement(sx, sy, al):
    """ÉTIREMENT EXACT du personnage dans cette image : valeurs singulières de la jacobienne de la déformation (carte
    inverse sx, sy) sur la silhouette ; 0 = rigide, 0,03 = 3 % d'étirement local (99e centile et maximum)."""
    a_, b_ = np.gradient(sx, axis=1), np.gradient(sx, axis=0); c_, d_ = np.gradient(sy, axis=1), np.gradient(sy, axis=0)
    E = a_ * a_ + b_ * b_ + c_ * c_ + d_ * d_; D = np.abs(a_ * d_ - b_ * c_); r = np.sqrt(np.maximum(E * E - 4 * D * D, 0))
    s1 = np.sqrt((E + r) / 2); s2 = np.sqrt(np.maximum((E - r) / 2, 1e-9))
    st = np.maximum(s1, 1 / s2) - 1; m = al > 0.5
    return (round(float(np.percentile(st[m], 99)), 4), round(float(st[m].max()), 4)) if m.any() else (0.0, 0.0)
def warp_rig(S, A, t, name):
    """acteur posé par son squelette : visage (expression dessinée ou déformée, bouche, clignement, regard), puis corps."""
    f = min(NF - 1, max(0, int(round(t * FPS)))); P = S['pistes'][name]; v = lambda k: float(P[k][f])
    jj = 0.0; wsum = 0.0
    for dt, w_ in ((-2, 0.1), (-1, 0.2), (0, 0.4), (1, 0.2), (2, 0.1)):
        tt = t + dt / FPS; Lx = line_at(tt, name); jj += w_ * (jaw(Lx, tt) if Lx else 0.0); wsum += w_
    jj /= wsum; bb = blink(name, t)
    emo = {e: v('emo_' + e) for e in jeu.EMOS if P['emo_' + e][f] > 0.02}
    src = A['img']; lib = A['lib']
    if A.get('xl'):   # visage redessiné (LivePortrait) : émotions × bouche × clignement
        src = expressions_lp.colle(src, A['xl'], expressions_lp.visage(A["xl"], emo, jj, bb))
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
    R_ = A['rig']
    gest = [(v(f'geste_{k}') * b['amax'], 1 + v(f'geste_{k}') * (b['emax'] - 1)) for k, b in enumerate(R_['bras'])]
    pose = dict(buste=v('buste'), buste_lacet=v('buste_lacet'), tete=v('tete'), tete_lacet=v('tete_lacet'), tete_tangage=v('tete_tangage'),
                souffle=v('souffle'), epaules=v('epaules'), bassin=(v('bassin_x'), v('bassin_y')), gestes=gest)
    box, rgb, al, sx, sy = rig2d.rendre(R_, pose, src)
    if MESURE:
        I_ = R_['M']['idx']
        gx = ((sx - R_['gx'][0]) / R_['cell']).round().astype(int).clip(0, len(R_['gx']) - 1); gy = ((sy - R_['gy'][0]) / R_['cell']).round().astype(int).clip(0, len(R_['gy']) - 1)
        (p99, mx), _ = rig2d.etirement(sx, sy, al, R_['own'][gy, gx] != I_['head'])
        MESURES.append(dict(qui=name, t=round(t, 3), etirement=(p99, mx), bouche=round(float(jj), 3), emotions={k: round(x_, 2) for k, x_ in emo.items()},
                            pose={k: (round(x_, 2) if not isinstance(x_, (tuple, list)) else [round(float(y_), 2) for y_ in x_]) for k, x_ in pose.items() if k != 'gestes'},
                            regard=round(v('regard_x'), 2)))
    return box, rgb, al
def warp_actor(S, A, t, name):
    """le haut du corps plié autour du bassin, la tête autour du cou ; jambes immobiles (aucune couture)."""
    if A.get('rig'): return warp_rig(S, A, t, name)
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
    if MESURE: MESURES.append(dict(qui=name, t=round(t, 3), etirement=etirement(sx2, sy2, al), bouche=round(float(jj), 3), lib=bool(lib),
                                   buste=round(float(ang), 2), tete=round(float(hd), 2), souffle=round(float(br), 4), pas=(round(float(cdx), 2), round(float(cdy), 2))))
    return (X0, Y0, X1, Y1), rgb, al
def frame_scene(S, t, off=None, zoom=None):
    plate = S['plate']; V = S.get('vie')
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
        if V is not None:   # le décor vit : feuillages, linge, fumée, bêtes (déplacements) et ampoules (lumière)
            dx, dy, gain = decor_vivant.champ(V, t, REG['decor']); mx = mx - dx; my = my - dy
        plate = cv2.remap(plate, mx.astype(np.float32), my.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        if V is not None: plate = np.clip(plate.astype(np.float32) * gain[..., None], 0, 255)
    can = plate.astype(np.float32).copy()
    for name, A in sorted(S['acts'].items(), key=lambda kv: kv[1]['hip'][1]):
        (X0, Y0, X1, Y1), rgb, al = warp_actor(S, A, t, name)
        sub = can[Y0:Y1, X0:X1]; al3 = al[..., None]; sub[:] = sub * (1 - al3) + rgb.astype(np.float32) * al3
    return np.clip(can, 0, 255).astype(np.uint8)
# ── découpage : un plan par réplique (coupe au changement de locuteur) ──
def crop_for(S, kind, who=None):
    W, H = S['W'], S['H']; asp = CW / CH
    if kind.startswith('ouvre-'): kind = kind[6:]   # plan d'ouverture : son cadre d'arrivée est celui de l'échange
    if kind == 'large' or who is None: h = H; w = min(W, h * asp); return (W / 2, H / 2, w, h)
    if kind == 'duo':   # plan à deux : les têtes de ceux qui se parlent, avec de l'air (le plan des TikTok Grok)
        As = [S['acts'][n] for n in who if n in S['acts']]; hbs = [head_box(A) for A in As if head_box(A)]
        if not hbs: return (W / 2, H / 2, min(W, H * asp), H)
        x0 = min(h_[0] for h_ in hbs); x1 = max(h_[2] for h_ in hbs); y0 = min(h_[1] for h_ in hbs); sh = max(A['sh'] for A in As)
        w = max((x1 - x0) * 1.5, 2.5 * 2 * sh * asp); h = w / asp
        if h > H: h = H; w = h * asp
        return ((x0 + x1) / 2, y0 + 0.40 * h, w, h)
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
def carte(c, t, rgba=False):
    im = PImage.new('RGBA' if rgba else 'RGB', (CW, CH), (0, 0, 0, 0) if rgba else (0, 0, 0)); u = (t - c['t0']) / (c['t1'] - c['t0'])
    e = PImage.open(EMO.get(c['apres'], 'emoji/face_with_tears_of_joy.png')).convert('RGBA')
    k = 1.32 if u < 0.25 else (1.15 if u < 0.5 else 1.0)  # le logo grossit par coupes (×1,32 puis ×1,15, mesuré chez Ladjagaï)
    sz = int(210 * k); e = e.resize((sz, sz), PImage.LANCZOS)
    if rgba: im.alpha_composite(e, ((CW - sz) // 2, 40 + (210 - sz) // 2))
    else: im.paste(e, ((CW - sz) // 2, 40 + (210 - sz) // 2), e)
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
        d.text(((CW - f.getlength(ln)) / 2, y), ln, font=f, fill=(255, 214, 0, 255), stroke_width=4, stroke_fill=(0, 0, 0, 255)); y += 44
    return np.array(im)
CADRES = {}
RANGE = range(NF)
if ONLY:
    sk = [k for k in T['sketchs'] if k['id'] == ONLY][0]; RANGE = range(int((sk['t0'] - 0.3) * FPS), int((sk['t1'] + 0.25) * FPS))
def cadres_du_plan(S, s, keep):
    """CADRAGE SOUS-PIXEL CONTINU : les cadres sont validés UNE fois par plan (début, fin du mouvement, punch de la chute)
    puis interpolés en flottant ; l'image est prise par transformation affine (filtre anti-crénelage), jamais par découpe
    au pixel entier (qui faisait trembler toute l'image d'un pixel à chaque image — mesuré : 1,42 saute/s)."""
    key = tuple(s[:5])
    if key not in CADRES:
        c0 = faces_ok(S, clamp_crop(S, crop_for(S, s[3], s[4])), keep)
        # CAMÉRA VIVANTE : glissement latéral (cam_px pixels d'écran par image) vers le côté qui a de la place, petite
        # montée un plan sur deux, poussée de 6 % ; validée par les mêmes règles de cadrage (têtes entières ou absentes)
        nfr = (s[1] - s[0]) * FPS; sc0_ = CW / c0[2]; dep_ = REG['cam_px'] * nfr / sc0_
        dirn = 1.0 if S['W'] - (c0[0] + c0[2] / 2) >= c0[0] - c0[2] / 2 else -1.0
        # plans à deux : la largeur du décor borne le glissement (mesuré le 17/10 : 0,5 px/image au lieu de 2,5) → la caméra
        # monte ou descend aussi (un plan sur deux, toute la place en hauteur) et pousse de 10 % : grue + travelling avant
        sens_v = -1.0 if SH.index(s) % 2 else 1.0; up = sens_v * min(0.15 * dep_, 0.5 * max(0.0, S['H'] - c0[3] / REG['pousse']))
        c1 = faces_ok(S, clamp_crop(S, (c0[0] + dirn * dep_, c0[1] - up, c0[2] / REG['pousse'], c0[3] / REG['pousse'])), keep)
        cp = faces_ok(S, clamp_crop(S, (c1[0], c1[1], c1[2] / 1.15, c1[3] / 1.15)), keep)
        cs = faces_ok(S, clamp_crop(S, crop_for(S, 'large')), None) if s[3].startswith('ouvre-') else None
        CADRES[key] = (None if cs is None else tuple(float(v) for v in cs),) + tuple(tuple(float(v) for v in c) for c in (c0, c1, cp))   # flottants Python
    return CADRES[key]
def sur_scene(img, c, t):
    """la carte posée sur la fin du sketch : image assombrie qui continue de vivre, émoji + titre par-dessus. Fondu de 0,6 s :
    à 0,25 s l'instrument des TikTok le comptait encore comme une coupe (mesuré le 17/10 sur v19)."""
    k = ease((t - (c['t0'] - 0.05)) / 0.6); cal = carte(c, t, rgba=True).astype(np.float32)
    a_ = cal[..., 3:] / 255.0 * k; cal = cal[..., :3]                                   # émoji et titre (contour noir compris)
    base = img.astype(np.float32) * (1 - 0.35 * k)
    return np.clip(base * (1 - a_) + cal * a_, 0, 255).astype(np.uint8)
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
    u = ease((t - s[0]) / max(0.5, s[1] - s[0]))
    cx, cy, w2, h2 = [a_ + (b_ - a_) * u for a_, b_ in zip(c0, c1)]; ref = c0
    if cs is not None:   # ouverture : du plan d'ensemble au cadre de l'échange (la poussée ne crée pas de parallaxe, seul le glissement)
        v_o = ease(min(1.0, (t - s[0]) / max(0.3, REG['ouverture'])))
        ref = [a_ + (b_ - a_) * v_o for a_, b_ in zip(cs, c0)]; cx, cy, w2, h2 = [a_ + (b_ - a_) * v_o for a_, b_ in zip(cs, (cx, cy, w2, h2))]
    zp = (ref[2] / w2, cx, cy)   # poussée de la caméra (le coup de zoom de la chute, lui, est un zoom d'objectif : sans parallaxe)
    if s[5] is not None and t >= s[5]:   # coup de zoom sur la chute, fluide (whip_s) au lieu d'un saut d'image
        v_ = ease((t - s[5]) / max(0.05, REG['whip_s'])); cx, cy, w2, h2 = [a_ + (b_ - a_) * v_ for a_, b_ in zip((cx, cy, w2, h2), cp)]
    assert abs((w2 / h2) / (CW / CH) - 1) < 0.01, 'cadre étiré'
    fr = frame_scene(S, t, (cx - ref[0], cy - ref[1]), zp)   # le décor suit la caméra à sa profondeur (parallaxe latérale et avant)
    sc = CW / w2; src_ = fr
    if sc < 0.95: src_ = cv2.GaussianBlur(fr, (0, 0), 0.45 / sc)
    Maff = np.float32([[sc, 0, -(cx - w2 / 2) * sc], [0, sc, -(cy - h2 / 2) * sc]])
    out = cv2.warpAffine(src_, Maff, (CW, CH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)  # acteur en bicubique + cadre en bilinéaire : netteté la plus proche de la source (mesurée)
    if c: out = sur_scene(out, c, t)
    cv2.imwrite(f'{OUT}/clip/f{f:05d}.jpg', cv2.cvtColor(out, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 94])
def morceau(bloc):
    for f in bloc: rend(f)
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
for s in SH:   # cadres calculés une fois AVANT le partage : chaque processeur en hérite et tournage.json les garde (diagnostic caméra)
    if s[2] in SC and int(s[1] * FPS) >= RANGE[0] and int(s[0] * FPS) <= RANGE[-1]: cadres_du_plan(SC[s[2]], s, s[4][0] if isinstance(s[4], tuple) else s[4])
if os.environ.get('TOURNE_CADRES') == '1':   # diagnostic : les cadres seuls (début, fin, chute) de chaque plan, sans rendu
    json.dump({f'{k[0]:.2f} {k[3]}': [None if c is None else [round(v, 1) for v in c] for c in v_] for k, v_ in CADRES.items()}, open(f'{OUT}/cadres.json', 'w'), indent=1)
    print('cadres écrits', len(CADRES)); raise SystemExit(0)
# RENDU PARALLÈLE : les images sont indépendantes ; chaque processeur tourne des blocs de 24 images (TOURNE_PROCS)
NPROC = int(os.environ.get('TOURNE_PROCS', os.cpu_count() or 1)); blocs = [list(RANGE[i:i + 24]) for i in range(0, len(RANGE), 24)]
if NPROC > 1:
    import multiprocessing as mpr
    # le réservoir de fils d'OpenCV est vidé AVANT le fork : un fils hérite sinon de fils d'exécution qui n'existent pas
    # chez lui et attend leur réponse indéfiniment (blocage mesuré le 17/10 : 4 processus à 0 % pendant 12 min)
    cv2.setNumThreads(1)
    with mpr.get_context('fork').Pool(NPROC) as pool:
        fait = 0
        for n in pool.imap_unordered(morceau, blocs):
            fait += n
            if fait % 240 < 24: print(f'{fait}/{len(RANGE)}', flush=True)
else:
    for b in blocs: morceau(b)
json.dump({'images': NF, 'plans': cut_count, 'plans_par_minute': round(cut_count / (total / 60), 1), 'reglages': REG, 'decoupage': [list(map(lambda v: round(v, 2) if isinstance(v, float) else (list(v) if isinstance(v, tuple) else v), s)) for s in SH],
           'cadres': {f'{k[0]:.2f}': [None if c is None else [round(v, 1) for v in c] for c in v_] for k, v_ in CADRES.items()}},
          open(f'{OUT}/tournage.json', 'w'), ensure_ascii=False, indent=1)
print('ok', len(RANGE), 'images,', cut_count, 'plans,', round(time.time() - T0), 's')
