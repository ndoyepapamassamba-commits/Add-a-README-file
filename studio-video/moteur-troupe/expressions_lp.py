# VRAIES EXPRESSIONS DESSINÉES (17/10/2026) — « on ne voit pas de visage fâché, qui sourit, ému, qui a peur » : déplacer
# les traits du dessin ne suffit pas, il faut REDESSINER bouche, yeux et sourcils. LivePortrait (KwaiVGI, MIT) le fait,
# piloté par les commandes d'édition de ses auteurs (lp_onnx.edits) et par nos commandes de sourcils (froncer, inquiet,
# hausser : trouvées par balayage, mêmes effets sur un enfant et un adulte), combinées en émotions (Ekman ; comédie).
# Une BIBLIOTHÈQUE par personnage et par scène, calculée une fois et réutilisée par tous les épisodes : émotions × 4
# ouvertures de bouche (la parole) + yeux clos (le clignement). Au tournage, les images voisines ne sont pas fondues
# (le fondu dédouble sourcils et lèvres pendant la transition) mais MORPHÉES : flux optique (DIS, OpenCV) de l'image neutre
# vers chaque image de la bibliothèque, géométrie mélangée selon les poids, puis couleurs mélangées sur cette géométrie.
# Les émotions ne touchent pas au regard ni aux paupières (regard.py et le clignement s'en chargent) : pas de conflit.
# RECETTE PAR PERSONNAGE (v3) : une même commande ne donne pas la même lisibilité sur un enfant de face, un grand-père barbu
# de trois quarts ou un profil ; la recette de chaque émotion est cherchée pour CE visage (variantes jugées par JEV).
import json, os
import numpy as np, cv2
import lp_onnx as LP

VERSION = 3   # 3 : recette cherchée par personnage (17/10/2026)
EMO = {   # validées à l'œil sur Petit Mamadou (enfant, sourire de base) et Maman Nounou (adulte de trois quarts)
    'neutre': {},
    'joie': {'sourire': 1.0, 'hausser': 0.25},
    'rire': {'sourire': 1.25, 'levre3': 40, 'hausser': 0.3},
    'colere': {'froncer': 1.4, 'sourire': -1.0},                                   # + bouche ouverte = il crie
    'frustration': {'froncer': 0.9, 'sourire': -0.7, 'levre1': 10},
    'mecontent': {'froncer': 0.6, 'sourire': -0.6, 'levre0': 0.05},
    'tristesse': {'inquiet': 1.2, 'sourire': -0.6, 'levre0': 0.04},
    'emu': {'inquiet': 0.8, 'sourire': 0.35},
    'surprise': {'hausser': 1.2, 'levre3': 45},
    'peur': {'inquiet': 1.0, 'hausser': 0.8, 'levre3': 25, 'levre2': 8, 'sourire': -0.3},
    'malice': {'sourire': 0.7, 'levre0': -0.06, 'froncer': 0.3},                  # sourire en coin
    'soupcon': {'froncer': 0.7, 'levre0': 0.06, 'sourire': -0.2},
    'innocent': {'inquiet': 0.8, 'sourire': 0.35},
    'frime': {'sourire': 0.6, 'hausser': 0.3, 'levre0': -0.04},
    'degout': {'froncer': 0.7, 'levre1': 12, 'sourire': -0.6, 'levre0': 0.05},
}
DESC = {'joie': 'happy and smiling', 'rire': 'laughing', 'colere': 'angry (eyebrows lowered and pulled together into a frown)',
        'frustration': 'frustrated or annoyed', 'mecontent': 'displeased or sulking', 'tristesse': 'sad', 'emu': 'moved, touched and tender',
        'surprise': 'surprised (eyebrows raised)', 'peur': 'afraid or worried', 'malice': 'mischievous, with a sly smile',
        'soupcon': 'suspicious', 'innocent': 'innocent and pleading', 'frime': 'smug, showing off', 'degout': 'disgusted'}
ABIME = ('Look closely at the eyebrows, eyes and mouth of this cartoon face. Is any of them smeared, blurred, dissolved into the '
         'skin, doubled or deformed (an artifact, not a normal drawn expression)?')
INTENSITES = (1.0, 0.7, 0.45)   # du plus fort au plus doux : on n'adoucit que si le visage est abîmé
TOL_DURE = 0.12   # défaut au-delà du neutre qui marque un visage ABÎMÉ (vu le 17/10 : sourcil gris de Baye étalé, +0,13) ; en
                  # dessous c'est le bruit du juge (±0,03 d'une requête à l'autre sur 30 rendus de Petit Mamadou, 17/10) : la
                  # tolérance de 0,08 adoucissait à tort la colère de Petit Mamadou (lisible 0,76 → 0,24)
SUFFIT = 0.8      # lisible à 80 % : la recherche de recette s'arrête
CLOS = {'regard_y': 34}    # yeux clos : commande « regard » vers le bas poussée jusqu'à fermer la paupière
BOUCHE = [-25, 0, 30, 62, 100]  # ouverture de la bouche (commande « lèvres 3 » des auteurs) : fermée … grande ouverte ; 70 → 100 le 17/10 :
                           # « le vieux assis ne parle pas » — à 52 px de visage, la bouche à 70 ne se lisait pas (Baye : propre jusqu'à 130)
# LÈVRES JOINTES (18/10/2026) : la bouche PEINTE (0) est entrouverte chez 5 personnages sur 7 (sourires à dents de Petit
# Mamadou, Maman Nounou, Koffi) ; JEV voyait donc la bouche ouverte aux m, b, p et aux silences de la v28 (« fermée »
# 0,06–0,55). Les auteurs de LivePortrait ferment les lèvres par « lèvres 3 » négatif ; planche essai_fermeture (7 visages,
# 0 à −80) : −20 à −40 joignent les lèvres, −60 et au-delà gonflent les joues → −25 en tête, la bouche peinte reste au rang 1.
# RANGS PROPRES À UN VISAGE (18/10/2026, v30 jugée par JEV, gros plans réduits à la taille du visage dans le film) :
# Baye (moustache et barbe, visage de 60 px) — « fermée » 0,63 à −25, 0,70 à −40, 0,66 à −55 (plus abîmée) ; Modou (trois
# quarts, moustache) — « franchement ouverte » 0,58 à 100, 0,87 à 140 (abîmée 0,49), 0,92 à 170 (0,50), 0,95 à 200 (0,57).
BOUCHE_PERSO = {'baye-ndiaye': [-40, 0, 30, 62, 100], 'modou': [-25, 0, 30, 62, 100, 140]}
def bouches(slug): return BOUCHE_PERSO.get(slug, BOUCHE)
OVALE = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
SOURCILS = ('froncer', 'inquiet', 'hausser', 'sourcils')
LEVRES = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]   # contour extérieur des lèvres (FaceMesh)
# RECETTES DE RECHANGE : chaque visage ne répond pas pareil (barbe, trois quarts, profil, sourire de base) ; la recherche
# essaie la recette de base, « sourcils + » / « bouche + », puis celles-ci, et garde la plus lisible qui n'abîme pas CE visage
ALT = {
    'colere': [{'froncer': 1.2, 'levre1': 12, 'sourire': -0.6}, {'froncer': 1.0, 'sourire': -1.3, 'levre2': 6}],
    'joie': [{'sourire': 1.4, 'hausser': 0.3, 'levre3': 12}, {'sourire': 1.6, 'hausser': 0.4}],
    'rire': [{'sourire': 1.5, 'levre3': 50, 'hausser': 0.4}],
    'frime': [{'sourire': 0.5, 'levre0': -0.1, 'froncer': 0.3}, {'sourire': 0.8, 'levre0': -0.08, 'hausser': 0.5}],
    'degout': [{'froncer': 0.5, 'levre1': 18, 'levre0': 0.06, 'sourire': -0.4}, {'froncer': 0.9, 'levre1': 14, 'sourire': -0.9}],
    'malice': [{'sourire': 0.9, 'levre0': -0.08, 'froncer': 0.5}],
    'tristesse': [{'inquiet': 1.5, 'sourire': -0.9, 'levre0': 0.05}],
    'mecontent': [{'froncer': 0.9, 'sourire': -0.9, 'levre0': 0.06}],
    'frustration': [{'froncer': 1.2, 'sourire': -0.8, 'levre1': 12}],
    'surprise': [{'hausser': 1.6, 'levre3': 50}],
    'soupcon': [{'froncer': 0.9, 'levre0': 0.08, 'sourire': -0.3}],
    'peur': [{'inquiet': 1.3, 'hausser': 1.0, 'levre3': 30, 'levre2': 10, 'sourire': -0.5}],
    'emu': [{'inquiet': 1.1, 'sourire': 0.5}],
    'innocent': [{'inquiet': 1.1, 'sourire': 0.45}],
}


def _commande(c, m):
    # une bouche FERMÉE (m < 0) l'est quelle que soit l'émotion : le rire aussi a les lèvres jointes sur m, b, p (18/10)
    c = dict(c); c['levre3'] = m if m < 0 else c.get('levre3', 0) + m; return LP.edits(**c)


def variantes(e):
    """recettes candidates d'une émotion, dans l'ordre d'essai."""
    R = EMO[e]; V = [R]
    if any(k in SOURCILS for k in R) and any(k not in SOURCILS for k in R):
        V += [{k: v * (1.4 if k in SOURCILS else 0.7) for k, v in R.items()}, {k: v * (0.8 if k in SOURCILS else 1.4) for k, v in R.items()}]
    else: V.append({k: v * 1.3 for k, v in R.items()})
    return V + ALT.get(e, [])


def _juge_jev():
    try:
        import coherence
        return lambda im, Q: coherence.jev_noul(im, Q, 'face')
    except Exception:
        return None


def masque_visage(v3, box, taille, ouverte=None, fermee=None):
    """zone greffée dans le carré de rendu : enveloppe convexe de TOUS les repères du visage (yeux, sourcils, nez, lèvres,
    menton), plus la mâchoire qui descend quand la bouche s'ouvre (là où la bouche grande ouverte diffère de la bouche
    fermée, près du visage) ; bord fondu.
    17/10 (v25) : l'ancien masque suivait l'OVALE du visage ; de trois quarts, le contour du côté caché se replie sur le
    nez et le polygone devient un croissant qui laissait la bouche DEHORS (Baye, Coumba, Koffi : bouche ouverte dans la
    bibliothèque, fermée à l'écran — « le vieux assis ne parle pas »)."""
    x, y, s = box; k = taille / s
    p = (np.asarray(v3[:, :2]) - [x, y]) * k
    m = np.zeros((taille, taille), np.float32); cv2.fillConvexPoly(m, cv2.convexHull(np.round(p).astype(np.int32)), 1.0)
    if ouverte is not None and fermee is not None:
        d = cv2.GaussianBlur(np.abs(ouverte - fermee).max(2), (0, 0), 1.5) > 18
        r = max(3, int(0.12 * taille)); pres = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))) > 0
        m = np.maximum(m, (d & pres).astype(np.float32))
        r = max(2, int(0.03 * taille)); m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    return cv2.GaussianBlur(m, (0, 0), max(1.5, 0.025 * taille))


def cherche_recette(e, rend, juger, base, journal=print):
    """RECHERCHE DE RECETTE PAR PERSONNAGE : toutes les recettes candidates sont rendues à pleine intensité et jugées EN
    PARALLÈLE par l'œil de JEV ; seules celles qu'il dit abîmées (défaut > neutre + TOL_DURE) sont adoucies et rejugées.
    On garde la plus lisible des propres (à 0,03 près, la moins abîmée). → (commande, image bouche fermée, jugement, essais)"""
    from concurrent.futures import ThreadPoolExecutor
    Q = {'abime': ABIME, 'lisible': f'Does this cartoon face clearly look {DESC[e]}?'}; V = variantes(e)
    abime = lambda x: x[2]['abime'] - base > TOL_DURE
    o = rend(dict(V[0]), 0); r = juger(o, Q); essais = [(dict(V[0]), o, r, 1.0, V[0])]   # la recette de base d'abord
    if not abime(essais[0]) and r['lisible'] >= SUFFIT: return dict(V[0]), o, dict(r, intensite=1.0), 1
    a_adoucir = [V[0]] if abime(essais[0]) else []; a_faire = V[1:]
    with ThreadPoolExecutor(8) as pool:
        for k in INTENSITES:
            if k != 1.0: a_faire, a_adoucir = a_adoucir, []   # seules les recettes abîmées sont adoucies
            if not a_faire: break
            cs = [{n: round(v * k, 4) for n, v in R.items()} for R in a_faire]; ims = [rend(c, 0) for c in cs]
            rs = list(pool.map(lambda o: juger(o, Q), ims))
            lot = list(zip(cs, ims, rs, [k] * len(cs), a_faire)); essais += lot; a_adoucir += [x[4] for x in lot if abime(x)]
            propres = [x for x in essais if not abime(x)]
            if propres and max(x[2]['lisible'] for x in propres) >= SUFFIT: break
    propres = [x for x in essais if x[2]['abime'] - base <= TOL_DURE]
    if propres:
        top = max(x[2]['lisible'] for x in propres)
        c, o, r, k, _ = min([x for x in propres if x[2]['lisible'] >= top - 0.03], key=lambda x: x[2]['abime'])
    else: c, o, r, k, _ = min(essais, key=lambda x: x[2]['abime'])   # tout est abîmé : le moins abîmé
    return c, o, dict(r, intensite=k), len(essais)


# GARDE DE SILHOUETTE (18/10/2026, v33) — vu sur la v32 : la commande « lèvres 0 » (décalage latéral de la mâchoire, point 19
# des auteurs) de la recette « frime » de Modou (−0,07) poussait sa barbiche HORS de la silhouette dessinée, sur le ciel :
# LivePortrait l'y inventait floue (halo clair, « rendu » 0,82 pour JEV, image 1777). Mesure sur les 7 personnages : la
# découpe dessinée amenée sur chaque expression (flux DIS inverse) sort de 4,7 ‰ du carré chez Modou (frime), 1,6 à 3,4 ‰
# chez cinq autres ; sans décalage, la même frime sort de 0,2 ‰ et reste lisible. Au-delà de GARDE_DEBORDE, le décalage
# est divisé par deux, puis supprimé, et la recette gardée est rejugée par JEV.
GARDE_DEBORDE = 1.5   # ‰ du carré de rendu


def zone_visage(v3, box, taille):
    """découpe dessinée et voisinage du visage (enveloppe des repères élargie), dans le carré de rendu."""
    x, y, s = box; p = (np.asarray(v3[:, :2]) - [x, y]) * taille / s
    h = np.zeros((taille, taille), np.uint8); cv2.fillConvexPoly(h, cv2.convexHull(np.round(p).astype(np.int32)), 1)
    return cv2.dilate(h, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.16 * taille) | 1,) * 2)) > 0


def debordement(n0, o, an, pres):
    """(sorti, rentré) en ‰ du carré : la découpe dessinée an (carré de rendu) amenée sur le visage o par le flux inverse
    depuis le neutre n0 ; seulement près du visage (pres)."""
    t = an.shape[0]; gx, gy = np.meshgrid(np.arange(t, dtype=np.float32), np.arange(t, dtype=np.float32))
    fi = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(_gris(o), _gris(n0), None)
    ae = cv2.remap(an, gx + fi[..., 0], gy + fi[..., 1], cv2.INTER_LINEAR, borderValue=0)
    return (round(1000 * float(((ae > 0.5) & (an < 0.5) & pres).sum()) / t / t, 2),
            round(1000 * float(((ae < 0.5) & (an > 0.5) & pres).sum()) / t / t, 2))


# GARDE DES LUNETTES (18/10/2026, v33) — vu sur la v32 : les commandes de sourcils (inquiet 1,3, hausser 1,0) de la peur de
# Koffi pliaient la monture de ses lunettes noires (écart du flux à une transformation affine dans la zone des yeux :
# 2,63 px ; « rendu » et « déformé » pour JEV sur 68 images de 71). Sans sourcils : 0,03 px. Un personnage à lunettes
# (question posée une fois à JEV sur le neutre) voit ses commandes de sourcils divisées par deux, puis supprimées, tant que
# la zone des yeux ne reste pas rigide (GARDE_RIGIDE).
GARDE_RIGIDE = 0.5   # px (carré de rendu) : écart moyen du flux à la meilleure affine dans la zone des yeux
LUNETTES = 'Is this cartoon character wearing glasses or sunglasses over the eyes?'


def zone_yeux(v3, box, taille):
    """yeux et sourcils (enveloppes élargies) dans le carré de rendu : là où une monture de lunettes doit rester rigide."""
    x, y, s = box; p = (np.asarray(v3[:, :2]) - [x, y]) * taille / s; z = np.zeros((taille, taille), np.uint8)
    for c_ in ([33, 133, 159, 145, 70, 105, 107], [263, 362, 386, 374, 300, 334, 336]):
        cv2.fillConvexPoly(z, cv2.convexHull(np.round(p[c_]).astype(np.int32)), 1)
    return cv2.dilate(z, np.ones((15, 15), np.uint8)) > 0


def rigidite(n0, o, zone):
    """écart moyen (px) du flux neutre → o à sa meilleure transformation affine, dans la zone : 0 = monture rigide."""
    ys, xs = np.nonzero(zone); f = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(_gris(n0), _gris(o), None)[ys, xs]
    A = np.c_[xs, ys, np.ones(len(xs))]; sol, *_ = np.linalg.lstsq(A, f, rcond=None); r = f - A @ sol
    return round(float(np.sqrt((r ** 2).sum(1)).mean()), 2)


def bibliotheque(img, v3, dossier, emotions=None, journal=print, juge='jev', alpha=None):
    """rend et range la bibliothèque d'expressions d'un personnage (une fois ; une émotion dont la recette de base a changé
    est recherchée et redessinée). Chaque émotion reçoit la RECETTE la plus lisible qui n'abîme pas CE visage
    (cherche_recette, œil de JEV) ; sans juge, la recette de base à pleine intensité. alpha (découpe de l'acteur, image
    entière) : garde de silhouette (GARDE_DEBORDE). → méta-données."""
    os.makedirs(dossier, exist_ok=True); src = LP.Source(img, v3); x, y, s = src.box; BOUCHE = bouches(os.path.basename(os.path.normpath(dossier)))
    taille = int(round(min(512, max(96, s))))
    ancien = json.load(open(f'{dossier}/meta.json')) if os.path.isfile(f'{dossier}/meta.json') else {}
    compat = ancien.get('taille') == taille and ancien.get('version') == VERSION   # recettes réutilisables
    neuf_bouche = ancien.get('bouche') != BOUCHE   # seules les bouches ouvertes sont redessinées (recettes gardées, pas de JEV)
    vieux = ancien.get('commandes', {}) if compat else {}; v_rec = ancien.get('recettes', {}) if compat else {}; v_jev = ancien.get('jev', {}) if compat else {}
    # reprise d'une construction interrompue (minuterie, machine reprise) : les émotions déjà cherchées ET dessinées avec les
    # bouches actuelles sont gardées telles quelles (partiel.json, écrit après chaque émotion)
    fp = f'{dossier}/partiel.json'; P = json.load(open(fp)) if os.path.isfile(fp) else {}; repris = set()
    if P.get('taille') == taille and P.get('version') == VERSION and P.get('bouche') == BOUCHE:
        vieux = dict(vieux); v_rec = dict(v_rec); v_jev = dict(v_jev)
        for e in P.get('emotions', []):
            vieux[e] = P['commandes'][e]; v_rec[e] = P['recettes'][e]; repris.add(e)
            if e in P.get('jev', {}): v_jev[e] = P['jev'][e]
        if 'neutre' in P.get('jev', {}): v_jev['neutre'] = P['jev']['neutre']
        if repris: journal(f'  reprise : {len(repris)} émotions déjà faites')
    juger = _juge_jev() if juge == 'jev' else (juge if callable(juge) else None)
    meta = {'version': VERSION, 'box': [x, y, s], 'taille': taille, 'bouche': BOUCHE, 'emotions': [], 'commandes': {}, 'recettes': {}, 'intensite': {}, 'jev': {},
            'garde': dict(ancien.get('garde', {})) if compat else {}}
    an = pres = None; k0 = BOUCHE.index(0) if 0 in BOUCHE else 0; zy = zone_yeux(v3, (x, y, s), taille); lun = ancien.get('lunettes') if compat else None
    if alpha is not None:
        Mg = np.float32([[taille / s, 0, -x * taille / s], [0, taille / s, -y * taille / s]])
        an = cv2.warpAffine(np.asarray(alpha, np.float32), Mg, (taille, taille), flags=cv2.INTER_LINEAR, borderValue=0); pres = zone_visage(v3, (x, y, s), taille)
    rend = lambda c, m: cv2.resize(src.rendu(_commande(c, m)), (taille, taille), interpolation=cv2.INTER_AREA)
    ecrit = lambda f, o: cv2.imwrite(f, cv2.cvtColor(o, cv2.COLOR_RGB2BGR))
    lire = lambda f: cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB)
    base = (v_jev.get('neutre') or {}).get('abime') if repris else None
    if base is not None: meta['jev']['neutre'] = v_jev['neutre']
    for e in (emotions or EMO):
        meme = vieux.get(e) == EMO[e] and e in v_rec; c = v_rec[e] if meme else dict(EMO[e]); fait0 = None
        if meme and e in v_jev: meta['jev'][e] = v_jev[e]
        elif juger and e != 'neutre':
            try:
                if base is None:   # défaut du neutre à la bouche peinte, comme les recettes : moyenne de deux avis (±0,03 par requête)
                    n0 = rend({}, 0); base = float(np.mean([juger(n0, {'abime': ABIME})['abime'] for _ in range(2)]))
                    meta['jev']['neutre'] = {'abime': round(base, 3)}
                c, fait0, r, n = cherche_recette(e, rend, juger, base, journal)
                meta['jev'][e] = dict(r, essais=n)
            except Exception as ex:
                journal(f'  {e} : juge indisponible ({str(ex)[:80]}), recette de base')
        if e == 'neutre' and 'neutre' in v_jev and meme: meta['jev']['neutre'] = v_jev['neutre']
        garde = False
        if an is not None and e != 'neutre' and abs(c.get('levre0', 0.0)) > 1e-4 and os.path.isfile(f'{dossier}/neutre_{k0}.png'):
            n0 = lire(f'{dossier}/neutre_{k0}.png'); f0 = f'{dossier}/{e}_{k0}.png'
            o = fait0 if fait0 is not None else (lire(f0) if meme and os.path.isfile(f0) else rend(c, 0))
            d0 = debordement(n0, o, an, pres); c0 = dict(c); d_ = d0
            while d_[0] > GARDE_DEBORDE and abs(c.get('levre0', 0.0)) > 1e-4:
                c = dict(c); c['levre0'] = round(c['levre0'] * 0.5, 4) if abs(c['levre0']) > 0.03 else 0.0
                o = rend(c, 0); d_ = debordement(n0, o, an, pres)
            if c != c0:
                garde = True; fait0 = o; g_ = {'avant': c0, 'deborde_avant': d0, 'deborde': d_}
                if juger:
                    try: g_['jev'] = {k_: round(v_, 3) for k_, v_ in juger(o, {'abime': ABIME, 'lisible': f'Does this cartoon face clearly look {DESC[e]}?'}).items()}
                    except Exception as ex: journal(f'  {e} : juge indisponible pour la garde ({str(ex)[:60]})')
                meta['garde'][e] = g_; journal(f"  {e} : garde de silhouette, lèvres 0 {c0.get('levre0')} → {c.get('levre0')}, débordement {d0} → {d_} {g_.get('jev', '')}")
        if e != 'neutre' and any(abs(c.get(k_, 0.0)) > 1e-4 for k_ in SOURCILS) and os.path.isfile(f'{dossier}/neutre_{k0}.png'):
            n0 = lire(f'{dossier}/neutre_{k0}.png')
            if lun is None and juger:
                try: lun = round(float(juger(n0, {'lunettes': LUNETTES})['lunettes']), 3); journal(f'  lunettes (JEV) : {lun}')
                except Exception as ex: journal(f'  lunettes : juge indisponible ({str(ex)[:60]})')
            if lun is not None and lun > 0.5:
                f0 = f'{dossier}/{e}_{k0}.png'
                o = fait0 if fait0 is not None else (lire(f0) if meme and not garde and os.path.isfile(f0) else rend(c, 0))
                r0 = rigidite(n0, o, zy); r_ = r0; c1 = dict(c)
                while r_ > GARDE_RIGIDE and any(abs(c.get(k_, 0.0)) > 1e-4 for k_ in SOURCILS):
                    c = {k_: ((round(v_ * 0.5, 4) if abs(v_ * 0.5) >= 0.1 else 0.0) if k_ in SOURCILS else v_) for k_, v_ in c.items()}
                    o = rend(c, 0); r_ = rigidite(n0, o, zy)
                if c != c1:
                    garde = True; fait0 = o; g_ = meta['garde'].setdefault(e, {}); g_.update(sourcils_avant={k_: c1[k_] for k_ in SOURCILS if k_ in c1}, rigide_avant=r0, rigide=r_)
                    if juger:
                        try: g_['jev'] = {k_: round(v_, 3) for k_, v_ in juger(o, {'abime': ABIME, 'lisible': f'Does this cartoon face clearly look {DESC[e]}?'}).items()}
                        except Exception as ex: journal(f'  {e} : juge indisponible pour la garde ({str(ex)[:60]})')
                    journal(f"  {e} : garde des lunettes, écart {r0} → {r_} px, sourcils {g_['sourcils_avant']} → {({k_: c[k_] for k_ in SOURCILS if k_ in c})} {g_.get('jev', '')}")
        neuf = not meme or garde
        for i, m in enumerate(BOUCHE):
            f = f'{dossier}/{e}_{i}.png'
            if m == 0 and fait0 is not None: ecrit(f, fait0); continue   # la recette est jugée à la bouche peinte (0)
            ab = ancien.get('bouche') or []   # bouches changées : seuls les rangs dont la valeur change sont redessinés
            if neuf or (neuf_bouche and e not in repris and (i >= len(ab) or ab[i] != m)) or not os.path.isfile(f): ecrit(f, rend(c, m))
        meta['emotions'].append(e); meta['commandes'][e] = EMO[e]; meta['recettes'][e] = c
        meta['intensite'][e] = meta['jev'].get(e, {}).get('intensite', 1.0)
        json.dump(meta, open(fp, 'w'))
        journal(f"  {e} : recette {c}{' (redessinée)' if neuf else ''} {meta['jev'].get(e, '')}")
    f = f'{dossier}/clos.png'
    if vieux.get('_clos') != CLOS or not os.path.isfile(f): ecrit(f, cv2.resize(src.rendu(LP.edits(**CLOS)), (taille, taille), interpolation=cv2.INTER_AREA))
    meta['commandes']['_clos'] = CLOS
    if lun is not None: meta['lunettes'] = lun
    json.dump(meta, open(f'{dossier}/meta.json', 'w'))
    if os.path.isfile(fp): os.remove(fp)
    return meta


def _gris(im):
    l = cv2.cvtColor(np.clip(im, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB)[..., 0]
    return cv2.createCLAHE(2.0, (4, 4)).apply(l)


def charge(dossier, img, v3, alpha=None):
    """bibliothèque prête au tournage : images (float32), flux depuis le neutre, masque du visage, couleur recalée sur le
    dessin d'origine. alpha (découpe de l'acteur, image entière) : la découpe suivra le visage collé (voir visage)."""
    meta = json.load(open(f'{dossier}/meta.json')); x, y, s = meta['box']; t = meta['taille']
    lire = lambda f: cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB).astype(np.float32)
    imgs = {(e, k): lire(f'{dossier}/{e}_{k}.png') for e in meta['emotions'] for k in range(len(meta['bouche']))}
    clos = lire(f'{dossier}/clos.png')
    # flux optique neutre fermé → chaque image (DIS + raffinement variationnel ; luminance égalisée : sourcils, lèvres)
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM); g0 = _gris(imgs[('neutre', 0)])
    flux = {k_: (np.zeros((t, t, 2), np.float32) if k_ == ('neutre', 0) else dis.calc(g0, _gris(v), None)) for k_, v in imgs.items()}
    flux['clos'] = dis.calc(g0, _gris(clos), None)
    # flux DIRECTS entre ouvertures voisines d'une même émotion (v25) : depuis la bouche fermée, l'intérieur de la bouche
    # (dents, langue) n'existe pas et le flux y est faux ; d'une ouverture à la suivante il existe des deux côtés
    paires = {}
    for e in meta['emotions']:
        for k in range(len(meta['bouche']) - 1):
            ga, gb = _gris(imgs[(e, k)]), _gris(imgs[(e, k + 1)]); paires[(e, k)] = (dis.calc(ga, gb, None), dis.calc(gb, ga, None))
    M = np.float32([[t / s, 0, -x * t / s], [0, t / s, -y * t / s]])
    orig = cv2.warpAffine(img, M, (t, t), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
    # masque de collage : la mâchoire qui descend, pour CHAQUE émotion (18/10/2026 — avec la seule mâchoire neutre, la
    # barbiche de Koffi qui descend plus bas en surprise, peur ou rire passait sous le bord du masque : barbiche dédoublée,
    # menton barbouillé, jugés « rendu » 0,50–0,63 par JEV sur ses plans de la v31)
    nb = len(meta['bouche']) - 1
    masque = np.max(np.stack([masque_visage(v3, (x, y, s), t, imgs[(e, nb)], imgs[(e, 0)]) for e in meta['emotions']]), 0)
    # recalage : l'écart de couleur basse fréquence entre le dessin et le rendu neutre à la bouche PEINTE (commande 0 ; la
    # bouche aux lèvres jointes diffère du dessin à la bouche : son écart flouté y laisserait une tache), ajouté à tout
    kp = meta['bouche'].index(0) if 0 in meta['bouche'] else 0
    ecart = cv2.GaussianBlur(orig - imgs[('neutre', kp)], (0, 0), max(3.0, 0.04 * t))
    for k_ in imgs: imgs[k_] = imgs[k_] + ecart
    clos = clos + ecart
    # zone des yeux (pour le clignement) : autour des deux yeux
    yeux = np.zeros((t, t), np.float32)
    for c_ in ([33, 133, 159, 145], [263, 362, 386, 374]):
        p = (np.asarray(v3[c_, :2]) - [x, y]) * t / s; m_ = p.mean(0); r = max(4.0, 0.9 * float(np.ptp(p[:, 0])))
        cv2.ellipse(yeux, (int(m_[0]), int(m_[1])), (int(r), int(0.75 * r)), 0, 0, 360, 1.0, -1)
    yeux = cv2.GaussianBlur(yeux, (0, 0), max(1.5, 0.02 * t)) * masque
    # zone de la BOUCHE (lèvres, menton, barbiche) : là, l'émotion dominante seule (voir visage)
    p = (np.asarray(v3[LEVRES, :2]) - [x, y]) * t / s; c_ = p.mean(0); lw = max(4.0, float(np.ptp(p[:, 0])))
    bm = np.zeros((t, t), np.float32)
    cv2.ellipse(bm, (int(c_[0]), int(c_[1] + 0.25 * lw)), (int(0.85 * lw), int(0.95 * lw)), 0, 0, 360, 1.0, -1)
    bm = cv2.GaussianBlur(bm, (0, 0), max(1.5, 0.15 * lw)) * masque   # bord plus net (avis de JEV sur Modou : « adoucir moins le bord de la zone bouche », 0,83)
    # OUVERTURE PERÇUE, mesurée par JEV sur la bibliothèque (audit_bouches.py) : probabilité « bouche franchement ouverte »
    # de chaque ouverture stockée, par émotion (rendue croissante)
    ouv, fa = {}, f'{dossier}/audit.json'
    if os.path.isfile(fa):
        A_ = json.load(open(fa)); b0 = A_.get('bouche') or []; bl = meta['bouche']
        # audit fait avant un changement de rangs (lèvres jointes en tête le 18/10, rang plus ouvert pour un visage) : les
        # rangs communs sont les mêmes images (rendu déterministe, mêmes recettes) ; une bouche fermée ajoutée devant compte
        # pour une ouverture perçue nulle, un rang plus ouvert ajouté derrière pour au moins la dernière mesurée
        off = next((o_ for o_ in range(len(bl) - len(b0) + 1) if bl[o_:o_ + len(b0)] == b0), None) if b0 else None
        if off is not None:
            pre, post = [0.0] * off, len(bl) - off - len(b0)
            ouv = {e: np.maximum.accumulate(np.asarray(pre + list(v['ouverte']) + [v['ouverte'][-1]] * post, np.float64))
                   for e, v in A_['emotions'].items() if e in meta['emotions']}
    gx, gy = np.meshgrid(np.arange(t, dtype=np.float32), np.arange(t, dtype=np.float32))
    a_c = None if alpha is None else cv2.warpAffine(np.asarray(alpha, np.float32), M, (t, t), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    return dict(meta=meta, imgs=imgs, clos=clos, flux=flux, paires=paires, masque=masque, yeux=yeux, box=(x, y, s), taille=t, grille=(gx, gy),
                bouche_masque=bm, ouv=ouv, alpha=a_c, orig=orig)


def _poids(B, emotions):
    """poids des émotions (le neutre complète à 1)."""
    w = {e: float(v) for e, v in emotions.items() if v > 0.02 and e in B['meta']['emotions'] and e != 'neutre'}
    tot = sum(w.values())
    if tot > 1: w = {e: v / tot for e, v in w.items()}; tot = 1.0
    w['neutre'] = 1.0 - tot
    return {e: v for e, v in w.items() if v > 1e-3}


def _niveau(B, e, k0, f):
    """visage de l'émotion e entre les ouvertures k0 et k0 + 1 (fraction f), et son flux depuis le neutre fermé.
    Morphing par les flux DIRECTS entre ces deux ouvertures : lèvres et dents glissent d'une forme à l'autre au lieu de se
    dédoubler (vu le 17/10 : dents du bas fantômes de Petit Mamadou et menton blanc de Modou au fondu de deux ouvertures)."""
    A, FA = B['imgs'][(e, k0)], B['flux'][(e, k0)]
    if f < 1e-3 or (e, k0 + 1) not in B['imgs']: return A, FA
    C, FC = B['imgs'][(e, k0 + 1)], B['flux'][(e, k0 + 1)]
    if f > 1 - 1e-3: return C, FC
    gx, gy = B['grille']; fab, fba = B['paires'][(e, k0)]
    a = cv2.remap(A, gx - f * fab[..., 0], gy - f * fab[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    c = cv2.remap(C, gx - (1 - f) * fba[..., 0], gy - (1 - f) * fba[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    fc = f * f * (3 - 2 * f)   # couleurs fondues plus vite que la forme ne glisse : jamais deux bouches à moitié visibles
    return a * (1 - fc) + c * fc, FA * (1 - f) + FC * f


def _position(B, e, bouche):
    """position (0..n) entre les ouvertures stockées de l'émotion e pour une commande de bouche 0..1. Avis de JEV sur la
    v25 (17/10) : la bouche malicieuse de Coumba ne s'ouvrait pas sur les syllabes fortes — remède désigné « ouvrir la
    mâchoire » (0,90). Le niveau 1 de « malice » paraît fermé (0,06), le 2 à moitié (0,49) : une commande linéaire
    laissait la bouche presque close. Avec l'audit, la commande b vise l'ouverture PERÇUE b : chaque émotion s'ouvre
    autant à l'œil (le rire, déjà ouvert au repos, s'ouvre moins ; la malice davantage)."""
    n = len(B['meta']['bouche']) - 1; b = float(np.clip(bouche, 0, 1)); o = B.get('ouv', {}).get(e)
    if o is None or o[-1] - o[0] < 0.2: return b * n   # sans audit : commande linéaire
    if b <= o[0]: return 0.0
    if b >= o[-1]: return float(n)
    k = int(min(n - 1, max(0, np.searchsorted(o, b, side='right') - 1)))
    return k + float(np.clip((b - o[k]) / max(1e-3, o[k + 1] - o[k]), 0, 1))


RANG_PETIT_VISAGE = 100   # v31 : le rang 140 de Modou, propre à 64 px (audit à l'échelle du film), se voyait abîmé en plan serré
                          # (visage > 150 px, « rendu » 0,77) — au-delà de 100, réservé aux visages de moins de 100 px à l'écran
def visage(B, emotions, bouche, clignement=0.0, visage_px=None, avec_alpha=False):
    """image du visage (carré de rendu) : émotions (poids), ouverture de bouche 0..1, clignement 0..1 — par morphing.
    visage_px : hauteur du visage à l'écran dans ce plan (les plus grands rangs ne servent qu'aux petits visages).
    avec_alpha : rend aussi (image, découpe) — la découpe de l'acteur amenée sur la géométrie de l'expression."""
    n = len(B['meta']['bouche']) - 1; W = _poids(B, emotions); gx, gy = B['grille']; V = {}
    n_max = n if visage_px is None or visage_px < 100 else max([k for k, r in enumerate(B['meta']['bouche']) if r <= RANG_PETIT_VISAGE] or [n])
    for e in W:
        m = min(_position(B, e, bouche), float(n_max)); k0 = int(min(n - 1, np.floor(m))); V[e] = _niveau(B, e, k0, m - k0)
    D = sum(w * V[e][1] for e, w in W.items())                                  # géométrie mélangée (déplacements)
    p0x, p0y = gx - D[..., 0], gy - D[..., 1]                                    # point du neutre qui arrive en q
    D1 = cv2.remap(D, p0x, p0y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)   # une itération de point fixe
    px, py = gx - D1[..., 0], gy - D1[..., 1]
    def tire(im, fl):   # l'image amenée sur la géométrie mélangée
        d = cv2.remap(fl, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        return cv2.remap(im, px + d[..., 0], py + d[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    out = sum(w * tire(*V[e]) for e, w in W.items())
    # ZONE DE LA BOUCHE SANS FLUX DEPUIS LA BOUCHE FERMÉE (avis de JEV, 17/10 : la bouche de Koffi « bave » dans le film et
    # pas dans la bibliothèque — 0,86). Rejouée : amener une bouche OUVERTE sur la géométrie mélangée passe par le flux depuis
    # la bouche fermée, faux à l'intérieur de la bouche (dents et langue n'y existent pas) : dents déchirées (0,61–0,83).
    # Dans la zone de la bouche, chaque émotion garde ses propres traits (images de la bibliothèque, ouvertures voisines
    # morphées par leurs flux directs) et les émotions sont fondues avec des poids aiguisés (puissance 4 : 0,69/0,20 →
    # 0,99/0,01 ; deux poids voisins restent fondus, un changement de dominante ne saute pas). Sourcils et yeux gardent le
    # mélange des géométries.
    mm = B.get('bouche_masque')
    if mm is not None:
        Wb = {e: w ** 4 for e, w in W.items()}; sb = sum(Wb.values()); bo = 0.0; b_ = float(np.clip(bouche, 0, 1)); n0 = B['imgs'].get(('neutre', 0))
        for e in W:
            im_e = V[e][0]; o = B.get('ouv', {}).get(e)
            # LÈVRES JOINTES MÊME EN RIANT (17/10) : la bouche la moins ouverte du rire ou de la surprise paraît déjà ouverte
            # (audit JEV : 0,41–0,67) ; quand la piste demande moins (m, b, p, silences), la zone de la bouche rejoint la
            # bouche neutre fermée, en proportion de ce qui manque
            if o is not None and n0 is not None and b_ < o[0]:
                lam = float(np.clip((o[0] - b_) / max(1e-3, o[0]), 0, 1)); im_e = im_e * (1 - lam) + n0 * lam
            bo = bo + (Wb[e] / sb) * im_e
        a_ = mm[..., None]; out = out * (1 - a_) + bo * a_
    if clignement > 0.02:
        a = (B['yeux'] * float(np.clip(clignement, 0, 1)))[..., None]; out = out * (1 - a) + tire(B['clos'], B['flux']['clos']) * a
    if not avec_alpha: return out
    # DÉCOUPE QUI SUIT LE VISAGE (18/10/2026, v33) — vu sur la v32 (Modou, image 1777, « rendu » 0,82 pour JEV) : en
    # « frime », le menton et la barbiche remontent ; LivePortrait remplit leur ancienne place avec le ciel pâle de son carré,
    # que la découpe d'origine gardait opaque : un halo clair au bord de la barbiche. La découpe est amenée sur la géométrie
    # de l'expression par le même champ que l'image (point du neutre qui arrive en q) : là où le menton s'est retiré au-dessus
    # du décor, la plaque réapparaît ; là où la mâchoire descend plus bas que le dessin, la découpe s'étend. Elle ne change
    # que là où le visage collé diffère du dessin (un flux sans texture ailleurs — ciel, oreilles — ne la fait pas trembler).
    if B.get('alpha') is None: return out, None
    a0 = B['alpha']; a_t = cv2.remap(a0, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    t = B['taille']; ch = np.clip((np.abs(out - B['orig']).max(2) - 12.0) / 24.0, 0, 1)
    ch = cv2.GaussianBlur(ch.astype(np.float32), (0, 0), max(1.0, 0.006 * t))
    d = (a_t - a0) * ch; m = B['masque']
    d = np.where(d > 0, d * m, d * np.clip(2 * m, 0, 1))   # s'étendre : seulement où le visage est collé ; se retirer : jusqu'au bord du masque
    return out, a0 + d


def colle_alpha(alpha, B, a_face):
    """découpe de l'acteur (image entière) mise à jour par celle du visage (visage(..., avec_alpha=True)) : seul l'écart
    est reporté, la découpe reste au pixel près là où le visage n'a pas changé."""
    if a_face is None: return alpha
    x, y, s = B['box']; t = B['taille']; H, W = alpha.shape[:2]
    M = np.float32([[s / t, 0, x], [0, s / t, y]])
    x0, y0, x1, y1 = max(0, int(np.floor(x))), max(0, int(np.floor(y))), min(W, int(np.ceil(x + s))), min(H, int(np.ceil(y + s)))
    Mi = M.copy(); Mi[0, 2] -= x0; Mi[1, 2] -= y0
    d = cv2.warpAffine((a_face - B['alpha']).astype(np.float32), Mi, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderValue=0)
    out = alpha.copy(); out[y0:y1, x0:x1] = np.clip(out[y0:y1, x0:x1] + d, 0, 1)
    return out


def colle(src, B, face):
    """greffe le visage dans l'image de la scène (src : RGB uint8)."""
    x, y, s = B['box']; t = B['taille']; H, W = src.shape[:2]
    M = np.float32([[s / t, 0, x], [0, s / t, y]])
    x0, y0, x1, y1 = max(0, int(np.floor(x))), max(0, int(np.floor(y))), min(W, int(np.ceil(x + s))), min(H, int(np.ceil(y + s)))
    Mi = M.copy(); Mi[0, 2] -= x0; Mi[1, 2] -= y0
    f_ = cv2.warpAffine(np.clip(face, 0, 255).astype(np.float32), Mi, (x1 - x0, y1 - y0), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    a = cv2.warpAffine(B['masque'], Mi, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderValue=0)[..., None]
    out = src.copy(); reg = out[y0:y1, x0:x1].astype(np.float32)
    out[y0:y1, x0:x1] = np.clip(reg * (1 - a) + f_ * a, 0, 255).astype(np.uint8)
    return out
