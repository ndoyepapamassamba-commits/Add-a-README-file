# VRAIES EXPRESSIONS DESSINÉES (17/10/2026) — « on ne voit pas de visage fâché, qui sourit, ému, qui a peur » : déplacer
# les traits du dessin ne suffit pas, il faut REDESSINER bouche, yeux et sourcils. LivePortrait (KwaiVGI, MIT) le fait,
# piloté par les commandes d'édition de ses auteurs (lp_onnx.edits) et par nos commandes de sourcils (froncer, inquiet,
# hausser : trouvées par balayage, mêmes effets sur un enfant et un adulte), combinées en émotions (Ekman ; comédie).
# Une BIBLIOTHÈQUE par personnage et par scène, calculée une fois et réutilisée par tous les épisodes : émotions × 4
# ouvertures de bouche (la parole) + yeux clos (le clignement). Au tournage, les images voisines ne sont pas fondues
# (le fondu dédouble sourcils et lèvres pendant la transition) mais MORPHÉES : flux optique (DIS, OpenCV) de l'image neutre
# vers chaque image de la bibliothèque, géométrie mélangée selon les poids, puis couleurs mélangées sur cette géométrie.
# Les émotions ne touchent pas au regard ni aux paupières (regard.py et le clignement s'en chargent) : pas de conflit.
import json, os
import numpy as np, cv2
import lp_onnx as LP

VERSION = 2
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
INTENSITES = (1.0, 0.7, 0.45)   # la plus forte qui n'abîme pas le visage (œil de JEV) ; vu le 17/10 : la colère étale le
TOLERANCE = 0.08                # sourcil gris de Baye, vu de trois quarts (défaut 0,51 contre 0,38 au neutre)
CLOS = {'regard_y': 34}    # yeux clos : commande « regard » vers le bas poussée jusqu'à fermer la paupière
BOUCHE = [0, 22, 45, 70]   # ouverture de la bouche (commande « lèvres 3 » des auteurs) : fermée … grande ouverte
OVALE = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]


def _commande(e, m, k=1.0):
    c = {n: v * k for n, v in EMO[e].items()}; c['levre3'] = c.get('levre3', 0) + m; return LP.edits(**c)


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


def bibliotheque(img, v3, dossier, emotions=None, journal=print, juge='jev'):
    """rend et range la bibliothèque d'expressions d'un personnage (une fois ; une émotion dont la commande a changé est
    redessinée). Chaque émotion est dessinée à l'intensité la plus forte qui n'abîme pas CE visage (juge : œil de JEV,
    « défaut » comparé au neutre, tolérance TOLERANCE), et sa lisibilité est notée. → méta-données."""
    os.makedirs(dossier, exist_ok=True); src = LP.Source(img, v3); x, y, s = src.box
    taille = int(round(min(512, max(96, s))))
    ancien = json.load(open(f'{dossier}/meta.json')) if os.path.isfile(f'{dossier}/meta.json') else {}
    compat = ancien.get('bouche') == BOUCHE and ancien.get('taille') == taille
    vieux = ancien.get('commandes', {}) if compat else {}; v_int = ancien.get('intensite', {}) if compat else {}; v_jev = ancien.get('jev', {}) if compat else {}
    juger = _juge_jev() if juge == 'jev' else (juge if callable(juge) else None)
    meta = {'version': VERSION, 'box': [x, y, s], 'taille': taille, 'bouche': BOUCHE, 'emotions': [], 'commandes': {}, 'intensite': {}, 'jev': {}}
    rend = lambda e, m, k: cv2.resize(src.rendu(_commande(e, m, k)), (taille, taille), interpolation=cv2.INTER_AREA)
    ecrit = lambda f, o: cv2.imwrite(f, cv2.cvtColor(o, cv2.COLOR_RGB2BGR))
    lire = lambda f: cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB)
    base = None
    for e in (emotions or EMO):
        meme = vieux.get(e) == EMO[e]; k = float(v_int.get(e, 1.0)) if meme else 1.0; fait0 = None
        if juger and e != 'neutre' and not (meme and e in v_jev):
            try:
                if base is None:
                    if not os.path.isfile(f'{dossier}/neutre_0.png'): ecrit(f'{dossier}/neutre_0.png', rend('neutre', BOUCHE[0], 1.0))
                    base = v_jev.get('neutre', {}).get('abime') if vieux.get('neutre') == EMO['neutre'] else None
                    if base is None: base = juger(lire(f'{dossier}/neutre_0.png'), {'abime': ABIME})['abime']
                    meta['jev']['neutre'] = {'abime': base}
                for k in INTENSITES:
                    o = rend(e, BOUCHE[0], k); r = juger(o, {'abime': ABIME, 'lisible': f'Does this cartoon face clearly look {DESC[e]}?'})
                    if r['abime'] - base <= TOLERANCE: break
                meta['jev'][e] = {'intensite': k, 'abime': r['abime'], 'lisible': r['lisible']}; fait0 = o
            except Exception as ex:
                journal(f'  {e} : juge indisponible ({str(ex)[:80]}), intensité {k}')
        elif e in v_jev and meme: meta['jev'][e] = v_jev[e]
        if e == 'neutre' and 'neutre' in v_jev and meme: meta['jev']['neutre'] = v_jev['neutre']
        neuf = (not meme) or abs(k - float(v_int.get(e, 1.0))) > 1e-6
        for i, m in enumerate(BOUCHE):
            f = f'{dossier}/{e}_{i}.png'
            if i == 0 and fait0 is not None: ecrit(f, fait0); continue
            if neuf or not os.path.isfile(f): ecrit(f, rend(e, m, k))
        meta['emotions'].append(e); meta['commandes'][e] = EMO[e]; meta['intensite'][e] = k
        journal(f"  {e} : intensité {k}{' (redessinée)' if neuf else ''} {meta['jev'].get(e, '')}")
    f = f'{dossier}/clos.png'
    if vieux.get('_clos') != CLOS or not os.path.isfile(f): ecrit(f, cv2.resize(src.rendu(LP.edits(**CLOS)), (taille, taille), interpolation=cv2.INTER_AREA))
    meta['commandes']['_clos'] = CLOS
    json.dump(meta, open(f'{dossier}/meta.json', 'w'))
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
