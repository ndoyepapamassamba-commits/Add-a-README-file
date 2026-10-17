# DÉCOR VIVANT (17/10/2026) — demande : « l'animation de l'arrière-plan », jugée par l'œil de JEV (jev_tiktok.py).
# Méthode publiée, réécrite : Chuang, Goldman, Zheng, Curless, Salesin, Szeliski, « Animating Pictures with Stochastic
# Motion Textures », SIGGRAPH 2005 — chaque couche du décor est animée par un champ de déplacement stochastique propre à
# sa nature (balancement, ondulation, volutes, scintillement), puis le décor est recomposé.
# Ce que nous ajoutons : l'annotation des couches, faite à la main dans l'article, est faite par l'ŒIL DE JEV — chaque
# case d'une grille du décor reçoit une étiquette (feuillage, linge, fumée, lumière, animal, rien), affinée au pixel par la
# couleur ; les zones des acteurs sont exclues (aucun reste d'acteur ne peut bouger derrière eux).
#   prepare(d, plaque, masques_acteurs) → couches (mises en cache dans d/vie.npz) ; champ(V, t) → (dx, dy, gain)
import base64, json, os, uuid, urllib.request
import numpy as np, cv2

ETIQ = {'feuillage': 'leaves, palm fronds, a plant or a tree', 'tissu': 'hanging cloth: laundry on a line, a curtain, a flag',
        'fumee': 'smoke or steam', 'lumiere': 'small glowing light bulbs or lamps', 'animal': 'an animal: a chicken, a goat, a dog, a bird',
        'rien': 'none of these: wall, roof, ground, sky, furniture, objects or people'}
COLS, ROWS = 8, 7


def etiquettes_jev(plaque):
    """une requête : chaque case de la grille COLS × ROWS est une image ; une question « choice » par case."""
    H, W = plaque.shape[:2]; cw, ch = W // COLS, H // ROWS; ids = {}; assets = {}; Q = {}
    for r in range(ROWS):
        for c in range(COLS):
            k = f'c{r}_{c}'; ids[k] = f'{k}-{uuid.uuid4().hex[:8]}'
            k_ = 320 / min(cw, ch)   # JEV refuse les images de moins de ~300 px de côté (« Invalid image dimensions », mesuré)
            cel = cv2.resize(plaque[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw], (round(cw * k_), round(ch * k_)), interpolation=cv2.INTER_CUBIC)
            assets[ids[k]] = {'type': 'image', 'format': 'jpg', 'data_base64': base64.b64encode(cv2.imencode('.jpg', cel, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes()).decode()}
            Q[k] = {'type': 'choice', 'instructions': f'`{k}` is a small crop of the background of an animated film scene. What is the main '
                    'thing in it that could move by itself or with the wind?', 'criteria': ETIQ}
    body = {'model': 'jev-1.14.0', 'state': ids, 'questions': Q, 'assets': assets}
    req = urllib.request.Request('https://api.typesafe.ai/v1/systemone', data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
    a = json.loads(urllib.request.urlopen(req, timeout=180).read())['answers']
    return {k: a[k]['probabilities'] for k in Q}


def _grille(P, lab, H, W):
    """carte douce H × W de la probabilité de l'étiquette `lab` (cases → interpolation bicubique, pas d'escalier)."""
    g = np.array([[P.get(f'c{r}_{c}', {}).get(lab, 0.0) for c in range(COLS)] for r in range(ROWS)], np.float32)
    return np.clip(cv2.resize(g, (W, H), interpolation=cv2.INTER_CUBIC), 0, 1)


def _phase(H, W, graine, lam):
    """champ de phase lisse (bruit basse fréquence) : les éléments voisins bougent ensemble, les lointains non."""
    rng = np.random.default_rng(graine); n = rng.uniform(0, 2 * np.pi, (max(2, H // lam + 2), max(2, W // lam + 2))).astype(np.float32)
    return cv2.resize(n, (W, H), interpolation=cv2.INTER_CUBIC)


def prepare(d, plaque, masques=(), jev=True):
    """couches du décor pour la scène d : masques doux par nature + phases ; cache d/vie.npz (+ vie.json : étiquettes)."""
    cache = f'{d}/vie.npz'
    if os.path.isfile(cache):
        z = np.load(cache); return {k: z[k] for k in z.files}
    H, W = plaque.shape[:2]; P = {}
    hors_acteurs = np.ones((H, W), np.float32)
    for m in masques:
        mm = (m if m.ndim == 2 else m[..., 0]).astype(np.float32); mm = mm / max(1.0, mm.max())
        hors_acteurs = np.minimum(hors_acteurs, 1 - np.clip(cv2.dilate(mm, np.ones((31, 31), np.uint8)), 0, 1))
    hors_acteurs = cv2.GaussianBlur(hors_acteurs, (0, 0), 6)
    if jev:   # JEV ne voit que le décor : acteurs et restes d'acteurs peints en gris (sinon une robe fait « linge »)
        vu = (plaque.astype(np.float32) * hors_acteurs[..., None] + 128 * (1 - hors_acteurs[..., None])).astype(np.uint8)
        try:
            P = etiquettes_jev(vu); json.dump(P, open(f'{d}/vie.json', 'w'), indent=0)
        except Exception as e:   # sans réseau : la couleur seule (feuillage vert, ampoules claires)
            print('décor vivant : œil de JEV indisponible, couleur seule', e)
    hsv = cv2.cvtColor(plaque, cv2.COLOR_RGB2HSV).astype(np.float32); Hh, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    lisse = lambda m, s=4: cv2.GaussianBlur(m.astype(np.float32), (0, 0), s)
    vert = ((Hh > 22) & (Hh < 95) & (S > 60) & (V > 40)).astype(np.float32)           # feuillage peint (vert à jaune-vert)
    g = lambda lab: _grille(P, lab, H, W) if P else np.zeros((H, W), np.float32)
    feuil = lisse(vert) * (np.maximum(g('feuillage'), 0.0 if P else 0.6)) * hors_acteurs
    # linge, rideau : ce qui se distingue du mur (écart à la couleur médiane de la case) dans les cases « tissu »
    med = cv2.medianBlur(plaque, 31).astype(np.float32); ecart = np.abs(plaque.astype(np.float32) - med).sum(2)
    sur = lambda m: np.clip((m - 0.35) / 0.4, 0, 1)   # seules les cases dont JEV est sûr comptent (pas de mur qui ondule)
    tissu = lisse(np.clip((S - 70) / 80, 0, 1) * np.clip(ecart / 60, 0, 1), 6) * sur(g('tissu')) * hors_acteurs
    Vb = cv2.GaussianBlur(V, (0, 0), 1.5); grad = cv2.GaussianBlur(np.hypot(cv2.Sobel(Vb, cv2.CV_32F, 1, 0), cv2.Sobel(Vb, cv2.CV_32F, 0, 1)), (0, 0), 4)
    doux = np.clip((32 - grad) / 12, 0, 1)   # mesuré au maquis : volute P50 17,5 ; arêtes du papier de l’addition P50 46
    fumee = lisse(np.clip((V - 140) / 60, 0, 1) * np.clip((70 - S) / 50, 0, 1) * doux, 5) * sur(g('fumee')) * hors_acteurs
    # ampoules : petites taches très claires (une guirlande se reconnaît à la forme, même hors des cases « lumière »)
    n_, lab_, st_, _ = cv2.connectedComponentsWithStats(((V > 235) & (S < 140)).astype(np.uint8))
    petites = np.isin(lab_, [i for i in range(1, n_) if 6 <= st_[i, cv2.CC_STAT_AREA] <= 900]).astype(np.uint8)
    ampoules = lisse(cv2.dilate(petites, np.ones((7, 7), np.uint8)), 3) * np.clip((g('lumiere') - 0.05) / 0.15, 0, 1) * hors_acteurs   # JEV hésite sur une ampoule de 50 px : seuil bas, mesuré sur la guirlande du maquis (0,07–0,38) contre ≤ 0,03 ailleurs
    bete = lisse(np.clip(ecart / 90, 0, 1), 3) * sur(g('animal')) * hors_acteurs
    # chaque bête et chaque ampoule a son propre rythme (phase par morceau connexe)
    def phases_par_morceau(m, graine):
        n, lab = cv2.connectedComponents((m > 0.15).astype(np.uint8)); rng = np.random.default_rng(graine)
        ph = rng.uniform(0, 2 * np.pi, n + 1).astype(np.float32); fr = rng.uniform(0.6, 1.6, n + 1).astype(np.float32)
        return ph[lab], fr[lab]
    ph_b, fr_b = phases_par_morceau(bete, 3); ph_l, fr_l = phases_par_morceau(ampoules, 5)
    # ancrage du linge : l'ondulation croît vers le bas de chaque pièce (pincée en haut, sur la corde)
    n, lab, st, _ = cv2.connectedComponentsWithStats((tissu > 0.15).astype(np.uint8))
    haut = np.zeros((H, W), np.float32); ys = np.mgrid[0:H, 0:W][0].astype(np.float32)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 0.08 * H * W: continue   # un « linge » grand comme un mur n'est pas du linge
        y0, hh = st[i, cv2.CC_STAT_TOP], max(8, st[i, cv2.CC_STAT_HEIGHT]); m = lab == i
        haut[m] = np.clip((ys[m] - y0) / hh, 0, 1)
    V_ = dict(feuil=feuil, tissu=tissu * cv2.GaussianBlur(haut, (0, 0), 4), fumee=fumee, ampoules=ampoules, bete=bete,
              ph1=_phase(H, W, 11, 140), ph2=_phase(H, W, 12, 60), ph_b=ph_b, fr_b=fr_b, ph_l=ph_l, fr_l=fr_l)
    V_ = {k: v.astype(np.float32) for k, v in V_.items()}
    np.savez_compressed(cache, **V_)
    return V_


def champ(V, t, ampl=1.0):
    """déplacements (dx, dy) en pixels du décor et gain de lumière à l'instant t (textures de mouvement stochastiques :
    somme de sinusoïdes à phases spatiales lisses, une famille par nature de couche)."""
    tp = 2 * np.pi * t; a = np.float32(ampl)
    # feuillage : bruissement (deux fréquences, la phase voyage dans l'espace comme une rafale)
    fx = 2.2 * np.sin(tp * 0.35 + V['ph1']) + 0.8 * np.sin(tp * 0.9 + V['ph2'])
    fy = 0.9 * np.sin(tp * 0.5 + V['ph2'] + 1.3)
    # linge : onde qui descend le long de chaque pièce
    ys = np.arange(V['tissu'].shape[0], dtype=np.float32)[:, None]
    tx = 3.0 * np.sin(tp * 0.6 - ys / 35.0 + V['ph1'])
    # fumée : volutes qui montent (la phase défile vers le haut)
    mx = 3.2 * np.sin(tp * 0.45 + ys / 22.0 + V['ph2']) ; my = 2.0 + 1.5 * np.sin(tp * 0.3 + V['ph1'])
    # bêtes : coups de bec (creux brefs) et petits pas
    pk = np.maximum(0, np.sin(tp * V['fr_b'] + V['ph_b'])) ** 3
    dx = a * (V['feuil'] * fx + V['tissu'] * tx + V['fumee'] * mx + V['bete'] * 1.2 * np.sin(tp * 0.3 * V['fr_b'] + V['ph_b']))
    dy = a * (V['feuil'] * fy + V['fumee'] * my + V['bete'] * (-2.6) * pk)
    gain = 1 + a * V['ampoules'] * 0.16 * np.sin(tp * V['fr_l'] + V['ph_l'])
    return dx.astype(np.float32), dy.astype(np.float32), gain.astype(np.float32)
