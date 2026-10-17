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
BOUCHE = [0, 30, 62, 100]  # ouverture de la bouche (commande « lèvres 3 » des auteurs) : fermée … grande ouverte ; 70 → 100 le 17/10 :
                           # « le vieux assis ne parle pas » — à 52 px de visage, la bouche à 70 ne se lisait pas (Baye : propre jusqu'à 130)
OVALE = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
SOURCILS = ('froncer', 'inquiet', 'hausser', 'sourcils')
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
    c = dict(c); c['levre3'] = c.get('levre3', 0) + m; return LP.edits(**c)


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


def masque_visage(v3, box, taille):
    """ovale du visage (repères Face Landmarker) dans le carré de rendu, rétréci de 4 %, bord fondu."""
    x, y, s = box; k = taille / s
    o = (np.asarray(v3[OVALE, :2]) - [x, y]) * k; c = o.mean(0); o = c + (o - c) * 0.96
    m = np.zeros((taille, taille), np.float32); cv2.fillPoly(m, [np.round(o).astype(np.int32)], 1.0)
    return cv2.GaussianBlur(m, (0, 0), max(1.5, 0.025 * taille))


def cherche_recette(e, rend, juger, base, journal=print):
    """RECHERCHE DE RECETTE PAR PERSONNAGE : toutes les recettes candidates sont rendues à pleine intensité et jugées EN
    PARALLÈLE par l'œil de JEV ; seules celles qu'il dit abîmées (défaut > neutre + TOL_DURE) sont adoucies et rejugées.
    On garde la plus lisible des propres (à 0,03 près, la moins abîmée). → (commande, image bouche fermée, jugement, essais)"""
    from concurrent.futures import ThreadPoolExecutor
    Q = {'abime': ABIME, 'lisible': f'Does this cartoon face clearly look {DESC[e]}?'}; V = variantes(e)
    abime = lambda x: x[2]['abime'] - base > TOL_DURE
    o = rend(dict(V[0]), BOUCHE[0]); r = juger(o, Q); essais = [(dict(V[0]), o, r, 1.0, V[0])]   # la recette de base d'abord
    if not abime(essais[0]) and r['lisible'] >= SUFFIT: return dict(V[0]), o, dict(r, intensite=1.0), 1
    a_adoucir = [V[0]] if abime(essais[0]) else []; a_faire = V[1:]
    with ThreadPoolExecutor(8) as pool:
        for k in INTENSITES:
            if k != 1.0: a_faire, a_adoucir = a_adoucir, []   # seules les recettes abîmées sont adoucies
            if not a_faire: break
            cs = [{n: round(v * k, 4) for n, v in R.items()} for R in a_faire]; ims = [rend(c, BOUCHE[0]) for c in cs]
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


def bibliotheque(img, v3, dossier, emotions=None, journal=print, juge='jev'):
    """rend et range la bibliothèque d'expressions d'un personnage (une fois ; une émotion dont la recette de base a changé
    est recherchée et redessinée). Chaque émotion reçoit la RECETTE la plus lisible qui n'abîme pas CE visage
    (cherche_recette, œil de JEV) ; sans juge, la recette de base à pleine intensité. → méta-données."""
    os.makedirs(dossier, exist_ok=True); src = LP.Source(img, v3); x, y, s = src.box
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
    meta = {'version': VERSION, 'box': [x, y, s], 'taille': taille, 'bouche': BOUCHE, 'emotions': [], 'commandes': {}, 'recettes': {}, 'intensite': {}, 'jev': {}}
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
                if base is None:   # défaut du neutre : moyenne de deux avis (le juge varie de ±0,03 d'une requête à l'autre)
                    if not os.path.isfile(f'{dossier}/neutre_0.png'): ecrit(f'{dossier}/neutre_0.png', rend({}, BOUCHE[0]))
                    n0 = lire(f'{dossier}/neutre_0.png'); base = float(np.mean([juger(n0, {'abime': ABIME})['abime'] for _ in range(2)]))
                    meta['jev']['neutre'] = {'abime': round(base, 3)}
                c, fait0, r, n = cherche_recette(e, rend, juger, base, journal)
                meta['jev'][e] = dict(r, essais=n)
            except Exception as ex:
                journal(f'  {e} : juge indisponible ({str(ex)[:80]}), recette de base')
        if e == 'neutre' and 'neutre' in v_jev and meme: meta['jev']['neutre'] = v_jev['neutre']
        neuf = not meme
        for i, m in enumerate(BOUCHE):
            f = f'{dossier}/{e}_{i}.png'
            if i == 0 and fait0 is not None: ecrit(f, fait0); continue
            if neuf or (neuf_bouche and i > 0 and e not in repris) or not os.path.isfile(f): ecrit(f, rend(c, m))
        meta['emotions'].append(e); meta['commandes'][e] = EMO[e]; meta['recettes'][e] = c
        meta['intensite'][e] = meta['jev'].get(e, {}).get('intensite', 1.0)
        json.dump(meta, open(fp, 'w'))
        journal(f"  {e} : recette {c}{' (redessinée)' if neuf else ''} {meta['jev'].get(e, '')}")
    f = f'{dossier}/clos.png'
    if vieux.get('_clos') != CLOS or not os.path.isfile(f): ecrit(f, cv2.resize(src.rendu(LP.edits(**CLOS)), (taille, taille), interpolation=cv2.INTER_AREA))
    meta['commandes']['_clos'] = CLOS
    json.dump(meta, open(f'{dossier}/meta.json', 'w'))
    if os.path.isfile(fp): os.remove(fp)
    return meta


def _gris(im):
    l = cv2.cvtColor(np.clip(im, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB)[..., 0]
    return cv2.createCLAHE(2.0, (4, 4)).apply(l)


def charge(dossier, img, v3):
    """bibliothèque prête au tournage : images (float32), flux depuis le neutre, masque du visage, couleur recalée sur le
    dessin d'origine."""
    meta = json.load(open(f'{dossier}/meta.json')); x, y, s = meta['box']; t = meta['taille']
    lire = lambda f: cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB).astype(np.float32)
    imgs = {(e, k): lire(f'{dossier}/{e}_{k}.png') for e in meta['emotions'] for k in range(len(meta['bouche']))}
    clos = lire(f'{dossier}/clos.png')
    # flux optique neutre fermé → chaque image (DIS + raffinement variationnel ; luminance égalisée : sourcils, lèvres)
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM); g0 = _gris(imgs[('neutre', 0)])
    flux = {k_: (np.zeros((t, t, 2), np.float32) if k_ == ('neutre', 0) else dis.calc(g0, _gris(v), None)) for k_, v in imgs.items()}
    flux['clos'] = dis.calc(g0, _gris(clos), None)
    M = np.float32([[t / s, 0, -x * t / s], [0, t / s, -y * t / s]])
    orig = cv2.warpAffine(img, M, (t, t), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
    masque = masque_visage(v3, (x, y, s), t)
    # recalage : l'écart de couleur basse fréquence entre le dessin et le rendu neutre (bouche fermée), ajouté à tout
    ecart = cv2.GaussianBlur(orig - imgs[('neutre', 0)], (0, 0), max(3.0, 0.04 * t))
    for k_ in imgs: imgs[k_] = imgs[k_] + ecart
    clos = clos + ecart
    # zone des yeux (pour le clignement) : autour des deux yeux
    yeux = np.zeros((t, t), np.float32)
    for c_ in ([33, 133, 159, 145], [263, 362, 386, 374]):
        p = (np.asarray(v3[c_, :2]) - [x, y]) * t / s; m_ = p.mean(0); r = max(4.0, 0.9 * float(np.ptp(p[:, 0])))
        cv2.ellipse(yeux, (int(m_[0]), int(m_[1])), (int(r), int(0.75 * r)), 0, 0, 360, 1.0, -1)
    yeux = cv2.GaussianBlur(yeux, (0, 0), max(1.5, 0.02 * t)) * masque
    gx, gy = np.meshgrid(np.arange(t, dtype=np.float32), np.arange(t, dtype=np.float32))
    return dict(meta=meta, imgs=imgs, clos=clos, flux=flux, masque=masque, yeux=yeux, box=(x, y, s), taille=t, grille=(gx, gy))


def _poids(B, emotions, bouche):
    n = len(B['meta']['bouche']) - 1; m = float(np.clip(bouche, 0, 1)) * n; k0 = int(min(n - 1, np.floor(m))); f = m - k0
    w = {e: float(v) for e, v in emotions.items() if v > 0.02 and e in B['meta']['emotions'] and e != 'neutre'}
    tot = sum(w.values())
    if tot > 1: w = {e: v / tot for e, v in w.items()}; tot = 1.0
    w['neutre'] = 1.0 - tot
    out = {}
    for e, v in w.items():
        for k, fk in ((k0, 1 - f), (k0 + 1, f)):
            if v * fk > 1e-3: out[(e, k)] = out.get((e, k), 0.0) + v * fk
    return out


def visage(B, emotions, bouche, clignement=0.0):
    """image du visage (carré de rendu) : émotions (poids), ouverture de bouche 0..1, clignement 0..1 — par morphing."""
    W = _poids(B, emotions, bouche); gx, gy = B['grille']; F = B['flux']
    D = sum(w * F[k_] for k_, w in W.items())                                   # géométrie mélangée (déplacements)
    p0x, p0y = gx - D[..., 0], gy - D[..., 1]                                    # point du neutre qui arrive en q
    D1 = cv2.remap(D, p0x, p0y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)   # une itération de point fixe
    px, py = gx - D1[..., 0], gy - D1[..., 1]
    def tire(im, fl):   # l'image amenée sur la géométrie mélangée
        d = cv2.remap(fl, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        return cv2.remap(im, px + d[..., 0], py + d[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    out = sum(w * tire(B['imgs'][k_], F[k_]) for k_, w in W.items())
    if clignement > 0.02:
        a = (B['yeux'] * float(np.clip(clignement, 0, 1)))[..., None]; out = out * (1 - a) + tire(B['clos'], F['clos']) * a
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
