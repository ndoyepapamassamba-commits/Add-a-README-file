# DÉCOR VIVANT (17/10/2026) — demande : « l'animation de l'arrière-plan », jugée par l'œil de JEV (jev_tiktok.py).
# Méthode publiée, réécrite : Chuang, Goldman, Zheng, Curless, Salesin, Szeliski, « Animating Pictures with Stochastic
# Motion Textures », SIGGRAPH 2005 — chaque couche du décor est animée par un champ de déplacement stochastique propre à
# sa nature (balancement, ondulation, volutes, scintillement), puis le décor est recomposé.
# Ce que nous ajoutons : l'annotation des couches, faite à la main dans l'article, est faite par l'ŒIL DE JEV — chaque
# case d'une grille du décor reçoit une étiquette (feuillage, linge, fumée, lumière, animal, rien), affinée au pixel par la
# couleur ; les zones des acteurs sont exclues (aucun reste d'acteur ne peut bouger derrière eux).
#   prepare(d, plaque, masques_acteurs) → couches (mises en cache dans d/vie.npz) ; champ(V, t) → (dx, dy, gain)
import base64, json, os, uuid, urllib.request
import jev_api   # garde JEV (18/10/2026) : coupé par défaut, le juge local répond
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
    a = json.loads(jev_api.ouvre(req, outil='decor_vivant', timeout=180).read())['answers']
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


def _pre(V, q=2):
    """précalculs du champ (une fois par scène) : couches à mi-résolution, cos/sin des phases (sin(ωt + φ) = sin ωt·cos φ +
    cos ωt·sin φ : plus aucun sinus par pixel à chaque image) ; les bêtes et les ampoules, rares, sont gardées en liste de
    pixels. Mesuré le 17/10 : 250 ms → ~15 ms par image, écart au calcul complet < 0,3 px."""
    if '_pre' in V: return V['_pre']
    H, W = V['feuil'].shape; h, w = (H + q - 1) // q, (W + q - 1) // q; r = lambda a: cv2.resize(a.astype(np.float32), (w, h), interpolation=cv2.INTER_AREA)
    ys = (np.arange(h, dtype=np.float32) * q + (q - 1) / 2)[:, None] * np.ones((1, w), np.float32)
    ph1, ph2 = r(V['ph1']), r(V['ph2'])
    cs = lambda P: (np.cos(P).astype(np.float32), np.sin(P).astype(np.float32))
    P = dict(H=H, W=W, h=h, w=w, feuil=r(V['feuil']), tissu=r(V['tissu']), fumee=r(V['fumee']), bete=r(V['bete']), amp=r(V['ampoules']),
             p1=cs(ph1), p2=cs(ph2), p2b=cs(ph2 + 1.3), pt=cs(ph1 - ys / 35.0), pf=cs(ph2 + ys / 22.0))
    ib = np.nonzero(P['bete'] > 1e-3); P['ib'] = ib; P['bfr'], P['bph'] = r(V['fr_b'])[ib], r(V['ph_b'])[ib]
    ia = np.nonzero(P['amp'] > 1e-3); P['ia'] = ia; P['afr'], P['aph'] = r(V['fr_l'])[ia], r(V['ph_l'])[ia]
    V['_pre'] = P
    return P


def champ(V, t, ampl=1.0):
    """déplacements (dx, dy) en pixels du décor et gain de lumière à l'instant t (textures de mouvement stochastiques :
    somme de sinusoïdes à phases spatiales lisses, une famille par nature de couche)."""
    P = _pre(V); tp = 2 * np.pi * t; a = np.float32(ampl)
    S = lambda om, cs: np.float32(np.sin(tp * om)) * cs[0] + np.float32(np.cos(tp * om)) * cs[1]   # sin(ω·2πt + φ)
    fx = 2.2 * S(0.35, P['p1']) + 0.8 * S(0.9, P['p2']); fy = 0.9 * S(0.5, P['p2b'])   # feuillage : bruissement
    tx = 3.0 * S(0.6, P['pt'])                                                           # linge : onde qui descend
    mx = 3.2 * S(0.45, P['pf']); my = 2.0 + 1.5 * S(0.3, P['p1'])                        # fumée : volutes qui montent
    dx = P['feuil'] * fx + P['tissu'] * tx + P['fumee'] * mx; dy = P['feuil'] * fy + P['fumee'] * my
    if len(P['ib'][0]):   # bêtes : coups de bec et petits pas, chacune à son rythme
        bx = 1.2 * np.sin(tp * 0.3 * P['bfr'] + P['bph']); pk = np.maximum(0, np.sin(tp * P['bfr'] + P['bph'])) ** 3
        dx[P['ib']] += P['bete'][P['ib']] * bx; dy[P['ib']] += P['bete'][P['ib']] * (-2.6) * pk
    # GARDE DE COUCHE (18/10/2026, v34) : v33 jugée par JEV — « tête et mur au-dessus » de Tantie Awa 0,85 : au bord des
    # palmiers, le feuillage (×6 de jour, jusqu'à 18 px) allait chercher la couleur du MUR voisin et l'étirait dans les arbres,
    # en suivant le contour de la couche (une bosse de mur en forme de tête). Un pixel qui bouge ne prend plus sa couleur hors de
    # sa couche : son déplacement est réduit d'autant que l'endroit où il la prendrait sort de la couche.
    if 'garde' not in P:   # « grille » d'abord, « garde » (la clé témoin) en dernier : le réalisateur JEV rend des images dans
                           # plusieurs fils à la fois (18/10/2026 : KeyError 'grille' quand un fil voyait « garde » seule)
        P['grille'] = np.meshgrid(np.arange(P['w'], dtype=np.float32), np.arange(P['h'], dtype=np.float32))
        P['garde'] = np.clip(P['feuil'] + P['tissu'] + P['fumee'] + P['bete'], 0, 1).astype(np.float32)
    M_ = P['garde']; gx_, gy_ = P['grille']; q_ = np.float32(P['W'] / P['w'])
    Ms_ = cv2.remap(M_, (gx_ - a * dx / q_).astype(np.float32), (gy_ - a * dy / q_).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    f_ = np.clip(Ms_ / np.maximum(M_, 0.05), 0, 1).astype(np.float32); dx = dx * f_; dy = dy * f_
    gain = np.ones((P['h'], P['w']), np.float32)
    if len(P['ia'][0]): gain[P['ia']] += np.float32(min(float(a), 1.0)) * P['amp'][P['ia']] * 0.16 * np.sin(tp * P['afr'] + P['aph'])   # ampoules : jamais amplifiées
    up = lambda x: cv2.resize(x, (P['W'], P['H']), interpolation=cv2.INTER_LINEAR)
    return up(a * dx).astype(np.float32), up(a * dy).astype(np.float32), up(gain).astype(np.float32)


# ── PANACHE DE FUMÉE PHYSIQUE (17/10/2026, v25 — « inclure la physique, la mécanique et tout ») ──
# Au maquis, la fumée du grill à braise ne fait pas que frémir sur place : elle MONTE. Modèle du panache thermique de
# Morton, Taylor & Turner (1956) : demi-largeur b = 0,12 (z + z0) (entraînement α ≈ 0,1), vitesse sur l'axe ∝ (z + z0)^(-1/3)
# (la bouffée ralentit en montant), concentration ∝ (z + z0)^(-5/3) (elle se dilue) ; z0 = origine virtuelle qui donne à la
# base la largeur du grill peint. Des bouffées naissent en continu (12 par seconde, 3,5 s de vie), chacune ondule (méandres
# turbulents dont l'amplitude croît avec b) et porte une texture de volutes ; la fumée passe DERRIÈRE les acteurs.
def panache(V, plaque=None):
    """source (pied du panache peint), largeur de base, couleur ; None s'il n'y a pas de fumée peinte."""
    if '_panache' in V: return V['_panache']
    m = (V['fumee'] > 0.15).astype(np.uint8); n, lab, st, _ = cv2.connectedComponentsWithStats(m); P = None
    if n > 1:
        k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        if st[k, cv2.CC_STAT_AREA] >= 400:
            ys, xs = np.nonzero(lab == k); hh = st[k, cv2.CC_STAT_HEIGHT]; bas = ys > ys.max() - 0.15 * hh
            b0 = 0.5 * float(xs[bas].max() - xs[bas].min() + 1)
            col = plaque[lab == k].astype(np.float32).mean(0) if plaque is not None else np.array([200.0, 195, 200])
            col = 0.5 * col + 0.5 * np.array([235.0, 232, 235])   # la fumée vue en épaisseur est plus claire que ses bords peints
            P = dict(x=float(np.median(xs[bas])), y=float(ys.max()), b0=b0, z0=b0 / 0.12, hauteur=float(max(hh * 2.2, 200)), couleur=col.tolist())
    V['_panache'] = P
    return P


def _texture_volutes(n=128, graine=21):
    rng = np.random.default_rng(graine); t = np.zeros((n, n), np.float32)
    for o in range(4):   # bruit fractal (somme d'octaves), valeurs 0..1
        g = rng.uniform(0, 1, (4 * 2 ** o, 4 * 2 ** o)).astype(np.float32)
        t += cv2.resize(g, (n, n), interpolation=cv2.INTER_CUBIC) / 2 ** o
    t -= t.min(); return t / max(1e-6, t.max())


_TEX = None


def fumee(V, plaque, t, taux=12.0, vie=3.5, alpha0=0.55):
    """dessine le panache à l'instant t sur la plaque (RGB float32 ou uint8) → plaque float32."""
    global _TEX
    P = panache(V)
    if P is None: return plaque
    if _TEX is None: _TEX = _texture_volutes()
    can = plaque.astype(np.float32); H, W = can.shape[:2]; z0 = P['z0']; zmax = P['hauteur']
    C = ((zmax + z0) ** (4 / 3) - z0 ** (4 / 3)) * 0.75 / vie          # (z + z0)^(4/3) = z0^(4/3) + (4/3)·C·âge
    bmax = 0.12 * (zmax + z0); x0, x1 = int(max(0, P['x'] - 2.2 * bmax)), int(min(W, P['x'] + 2.2 * bmax))
    y0, y1 = int(max(0, P['y'] - zmax - bmax)), int(min(H, P['y'] + 0.2 * P['b0']))
    if x1 - x0 < 4 or y1 - y0 < 4: return can
    q = 2   # la fumée est floue : calculée sur une grille deux fois plus lâche puis agrandie (×4 plus rapide, mesuré)
    yy, xx = np.mgrid[y0:y1:q, x0:x1:q].astype(np.float32); A = np.zeros(xx.shape, np.float32)
    i0, i1 = int(np.floor((t - vie) * taux)), int(np.floor(t * taux))
    for i in range(i0, i1 + 1):
        rng = np.random.default_rng(1000003 + i); tn = (i + rng.uniform(0, 1)) / taux; age = t - tn
        if age < 0 or age > vie: continue
        z = (z0 ** (4 / 3) + (4 / 3) * C * age) ** 0.75 - z0
        b = 0.12 * (z + z0); dil = (z0 / (z + z0)) ** (5 / 3)
        ph = rng.uniform(0, 2 * np.pi); off = rng.normal(0, 0.35)
        cx = P['x'] + b * (off + 0.45 * np.sin(1.3 * age + ph)) + 0.08 * z; cy = P['y'] - z
        r = 0.75 * b * rng.uniform(0.8, 1.2)
        a = alpha0 * dil ** 0.6 * min(1.0, age / 0.35) * (1 - age / vie) ** 1.5
        # VOLUTE LOCALE (18/10/2026, profil : fumée = 25 % du tournage) : chaque bouffée n'est calculée que dans son voisinage
        # (4 rayons : au-delà sa contribution est sous exp(−16) ≈ 1e−7) au lieu de toute la zone du panache
        j0 = max(0, int((cx - 4 * r - x0) // q)); j1 = min(xx.shape[1], int((cx + 4 * r - x0) // q) + 2)
        k0 = max(0, int((cy - 4 * r - y0) // q)); k1 = min(xx.shape[0], int((cy + 4 * r - y0) // q) + 2)
        if j1 <= j0 or k1 <= k0: continue
        xs_, ys_ = xx[k0:k1, j0:j1], yy[k0:k1, j0:j1]
        d2 = ((xs_ - cx) ** 2 + (ys_ - cy) ** 2) / (r * r)
        if d2.min() > 9: continue
        u = ((xs_ - cx) / (2.5 * r) * 0.5 + 0.5 + 0.37 * i) % 1.0; v = ((ys_ - cy) / (2.5 * r) * 0.5 + 0.5 + 0.21 * i + 0.15 * age) % 1.0
        tex = _TEX[(v * 127).astype(np.int32), (u * 127).astype(np.int32)]
        A[k0:k1, j0:j1] = 1 - (1 - A[k0:k1, j0:j1]) * (1 - np.clip(a * np.exp(-d2) * (0.45 + 0.75 * tex), 0, 1))
    A = cv2.resize(cv2.GaussianBlur(A, (0, 0), 0.6), (x1 - x0, y1 - y0), interpolation=cv2.INTER_LINEAR)
    can[y0:y1, x0:x1] = can[y0:y1, x0:x1] * (1 - A[..., None]) + np.asarray(P['couleur'], np.float32)[None, None, :] * A[..., None]
    return can


def couverture_panache(V, H, W, duree=6.0):
    """part de l'image où le panache bouge visiblement (alpha > 0,15 à un instant au moins d'une fenêtre de 6 s)."""
    if panache(V) is None: return np.zeros((H, W), bool)
    vide = np.zeros((H, W, 3), np.float32); m = np.zeros((H, W), bool)
    for t in np.linspace(10.0, 10.0 + duree, 25):
        m |= fumee(V, vide, t).mean(2) > 0.15 * float(np.mean(panache(V)['couleur']))
    return m


# ── OMBRES DE FEUILLAGE QUI PASSENT (« komorebi ») — 17/10/2026, porte L de JEV (seconde par seconde) : la cour et la
# concession étaient jugées « décor mort » sur 31 secondes. Essai A/B jugé par JEV (4 instants à 0,25 s, décor seul) :
# l'amplitude seule ne suffisait pas (×6 : « mort » 0,52) ; avec des taches de lumière qui dérivent avec le vent sur le sol et
# les murs ensoleillés : « mort » 0,42 (cour) et 0,36 (concession), objets rigides intacts (« caoutchouc » 0,18–0,21).
_SOLEIL = {}


def soleil(plaque):
    """zones ensoleillées de la plaque (où des ombres de feuilles peuvent passer), 0..1, mise en cache par plaque."""
    k = id(plaque)
    if k not in _SOLEIL:
        lum = cv2.cvtColor(np.clip(plaque, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
        lo, hi = np.percentile(lum, 45), np.percentile(lum, 85)
        _SOLEIL[k] = (cv2.GaussianBlur(np.clip((lum - lo) / (hi - lo + 1e-3), 0, 1), (0, 0), 6), float(lum.mean()))
    return _SOLEIL[k]


def tachete(H, W, t, graine=3, force=0.16, vitesse=(14.0, 5.0)):
    """facteur de lumière (≤ 1) : deux couches de taches d'ombre floues qui dérivent avec le vent et frémissent (calcul à
    demi-résolution, remonté)."""
    h, w = H // 2, W // 2; rng = np.random.default_rng(graine); G = np.zeros((h, w), np.float32)
    for n, r, sp in ((70, 0.06, 1.0), (140, 0.03, 1.7)):
        P = rng.uniform(0, 1, (n, 2)) * [w, h]; R = rng.uniform(0.5, 1.5, n) * r * w; ph = rng.uniform(0, 6.28, n)
        cx = (P[:, 0] + 0.5 * vitesse[0] * sp * t + 3 * np.sin(2.1 * t + ph)) % w; cy = (P[:, 1] + 0.5 * vitesse[1] * sp * t + 2 * np.cos(1.7 * t + ph)) % h
        for x, y, rr, p in zip(cx, cy, R, ph): cv2.circle(G, (int(x), int(y)), max(1, int(rr * (1 + 0.15 * np.sin(3.0 * t + p)))), 1.0, -1)
    G = cv2.GaussianBlur(G, (0, 0), 0.035 * w * 0.35); G = G / max(1e-6, float(G.max()))
    return cv2.resize(1.0 - force * G, (W, H), interpolation=cv2.INTER_LINEAR)
