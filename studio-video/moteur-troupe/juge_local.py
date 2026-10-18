# JUGE LOCAL — la logique de contrôle de JEV dans le moteur, sans appel payant (18/10/2026). Consigne de l'utilisateur :
# « intègre le juge JEV dans le moteur et arrête les appels vers JEV. Ça coûte beaucoup […] introduire dans le moteur la
# logique de contrôle du juge JEV ». Registre au moment de l'arrêt : 60 191 appels, 117,7 M de jetons, 4,94 $ (dont
# jev_film 54 134 appels, 78 %).
#
# Principe : JEV a déjà jugé nos propres films — 16 versions, ~33 000 images, chaque question avec sa probabilité. Ces
# verdicts deviennent l'apprentissage d'un juge maison : chaque image passe par DINOv2-small (Apache-2.0, 22 M de
# paramètres, ~0,2 s par image sur le processeur), et une tête par question (régression logistique sur la probabilité de
# JEV) rend la MÊME réponse au MÊME seuil (> 0,5 = défaut). Validation honnête : les têtes apprennent sur des versions et
# sont mesurées sur d'AUTRES versions (jamais vues) ; une question n'est confiée au juge local que si son accord avec JEV
# atteint le plancher fixé (ACCORD_MIN) — sinon elle est déclarée « non jugée » au lieu d'inventer une réponse.
#   python3 juge_local.py extrait <version>…        caractéristiques des images jugées par JEV (cache disque)
#   python3 juge_local.py apprend                   têtes par question + accord mesuré sur versions tenues à l'écart
#   python3 juge_local.py etat                      questions confiées au juge local et leur accord avec JEV
import hashlib, json, os, re, sys, time
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.expanduser(os.environ.get('JUGE_LOCAL', '~/.cache/massamba-jev/juge-local'))
MODELE = 'facebook/dinov2-small'
TAILLE = (406, 322)          # (largeur, hauteur) : l'image des acteurs 576 × 460 réduite, multiple de 14 (29 × 23 pièces)
ACCORD_MIN = float(os.environ.get('JUGE_ACCORD_MIN', 0.85))   # accord de décision minimal avec JEV sur versions tenues à l'écart
CLIP = (slice(282, 742), slice(None))

_M = {}


def _modele():
    if 'm' not in _M:
        import torch
        from transformers import AutoModel
        torch.set_num_threads(int(os.environ.get('JUGE_FILS', os.cpu_count() or 4)))
        _M['m'] = AutoModel.from_pretrained(MODELE).eval(); _M['torch'] = torch
    return _M['m'], _M['torch']


def caracteristiques(ims):
    """images BGR → vecteurs (jeton de classe, moyenne et moyenne généralisée p=3 des pièces) : 1 152 nombres par image."""
    m, torch = _modele()
    moy, ec = np.array([0.485, 0.456, 0.406], np.float32), np.array([0.229, 0.224, 0.225], np.float32)
    x = np.stack([(cv2.resize(cv2.cvtColor(im, cv2.COLOR_BGR2RGB), TAILLE, interpolation=cv2.INTER_AREA).astype(np.float32) / 255 - moy) / ec for im in ims])
    with torch.no_grad():
        h = m(pixel_values=torch.from_numpy(x.transpose(0, 3, 1, 2))).last_hidden_state.numpy()
    cls, pieces = h[:, 0], h[:, 1:]
    gem = np.cbrt(np.mean(np.clip(pieces, 0, None) ** 3, axis=1))
    return np.concatenate([cls, pieces.mean(1), gem], 1).astype(np.float32)


# ── normalisation des questions : la même question posée avec d'autres noms d'images ou de personnages a la même tête
def cle_question(txt):
    t = re.sub(r'\d+(?:[.,]\d+)?', '#', re.sub(r'`[^`]*`', '`x`', txt.strip()))
    return hashlib.sha1(t.encode()).hexdigest()[:12]


def _jev_film():
    sys.path.insert(0, ICI)
    import jev_film as jf
    return jf


def extrait(dossiers, pas=3, lot=8):
    """images du film (grille des 30 i/s, une sur `pas`) et références de plan → caractéristiques + verdicts JEV."""
    jf = _jev_film(); os.makedirs(f'{DOSSIER}/donnees', exist_ok=True)
    for d in dossiers:
        d = os.path.abspath(d); nom = hashlib.sha1(d.encode()).hexdigest()[:10]; sortie = f'{DOSSIER}/donnees/{nom}.npz'
        if os.path.isfile(sortie): print('déjà extrait', d, flush=True); continue
        R = json.load(open(f'{d}/jev_film.json')); TO = json.load(open(f'{d}/tournage.json')); SH = TO['decoupage']
        pi = [x for x in R['par_image'] if not x.get('carte') and x['n'] % pas == 0]
        voulu = {x['n']: x for x in pi}
        cap = cv2.VideoCapture(f'{d}/film.mp4'); PAS = max(1, int(round((cap.get(cv2.CAP_PROP_FPS) or 30) / jf.FPS))); n_ = -1; k = -1
        ims, ns = [], []; t0 = time.time()
        while True:
            ok, f = cap.read()
            if not ok: break
            n_ += 1
            if n_ % PAS: continue
            k += 1
            if k in voulu: ims.append(f[CLIP] if f.shape[0] > 700 else f); ns.append(k)
        X = np.concatenate([caracteristiques(ims[i:i + lot]) for i in range(0, len(ims), lot)]) if ims else np.zeros((0, 1152), np.float32)
        src = os.path.join(d, 'source'); refs = {}
        for i, s in enumerate(SH):
            p = os.path.join(src, f'{s[0]:06.2f}.jpg')
            if os.path.isfile(p): refs[i] = cv2.imread(p)
        ki = sorted(refs); XR = caracteristiques([refs[i] for i in ki]) if ki else np.zeros((0, 1152), np.float32)
        cles = sorted({k_ for x in pi for k_, v in x.items() if isinstance(v, float) and k_ != 't'})
        Y = np.array([[voulu[n].get(k_, np.nan) for k_ in cles] for n in ns], np.float32)
        np.savez_compressed(sortie, X=X, Y=Y, cles=np.array(cles), n=np.array(ns), plan=np.array([voulu[n]['plan'] for n in ns]),
                            XR=XR, plans_ref=np.array(ki), dossier=d)
        print(f'{d} : {len(ns)} images, {len(ki)} références, {time.time() - t0:.0f} s', flush=True)


# ── MOUVEMENT (jev_mouvement : 8 images par seconde, a–d espacées et e–h consécutives). Les questions de JEV disent ce qu'elles
#    regardent — bras, buste, tête qui changent de position, un saut entre images voisines, un décor mort, des personnages
#    figés — : le juge local les MESURE (flux optique par zone, sauts entre images consécutives, déplacement des articulations
#    MediaPipe Pose, Apache-2.0) et une tête par question, apprise sur les verdicts de JEV, combine ces mesures.
_POSE = {}


def _pose(im):
    """repères du corps (jusqu'à 3 personnes) : liste de tableaux 33 × 2 normalisés ; [] si personne n'est trouvé."""
    if 'p' not in _POSE:
        import mediapipe as mp
        from mediapipe.tasks.python import vision, BaseOptions
        m = os.path.expanduser('~/.cache/massamba-models/pose_landmarker_full.task')
        _POSE['p'] = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=m), num_poses=3))
        _POSE['mp'] = mp
    mp = _POSE['mp']; r = _POSE['p'].detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(im, cv2.COLOR_BGR2RGB)))
    return [np.array([[l.x, l.y] for l in p], np.float32) for p in r.pose_landmarks]


PARTIES = {'tete': [0, 2, 5, 7, 8], 'buste': [11, 12, 23, 24], 'bras': [13, 14, 15, 16]}


def traits_mouvement(ims):
    """8 images BGR (a–d espacées, e–h consécutives, pleine taille) → 50 mesures."""
    p = [cv2.cvtColor(cv2.resize(im, (144, 115), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY) for im in ims]
    out = []
    for i, j in ((0, 1), (1, 2), (2, 3), (0, 3)):   # flux optique entre images espacées, par bande et par moitié
        f = cv2.calcOpticalFlowFarneback(p[i], p[j], None, 0.5, 3, 15, 3, 5, 1.2, 0); m = np.hypot(f[..., 0], f[..., 1])
        h3 = np.array_split(m, 3, 0); l2 = np.array_split(m, 2, 1)
        out += [m.mean(), np.percentile(m, 90), (m > 0.5).mean(), (m > 2).mean()] + [x.mean() for x in h3] + [x.mean() for x in l2]
    d = [float(np.abs(p[k + 1].astype(np.float32) - p[k]).mean()) for k in range(4, 7)]   # images consécutives : sauts
    out += d + [max(d), max(d) / (np.median(d) + 1e-3), np.std(d)]
    bord = np.ones((115, 144), bool); bord[20:95, 30:114] = False   # pourtour de l'image : surtout du décor
    f = cv2.calcOpticalFlowFarneback(p[0], p[3], None, 0.5, 3, 15, 3, 5, 1.2, 0); m = np.hypot(f[..., 0], f[..., 1])
    out += [m[bord].mean(), (m[bord] > 0.3).mean()]
    P0, P3 = _pose(ims[0]), _pose(ims[3]); dep = {k: 0.0 for k in PARTIES}; n = 0
    for a in P0:   # chaque personne de a appariée à la plus proche dans d, déplacements normalisés par la taille du corps
        if not P3: break
        b = min(P3, key=lambda q: float(np.abs(q[[11, 12, 23, 24]].mean(0) - a[[11, 12, 23, 24]].mean(0)).sum()))
        tl = float(np.linalg.norm(a[[11, 12]].mean(0) - a[[23, 24]].mean(0))) + 1e-3; n += 1
        for k, idx in PARTIES.items(): dep[k] = max(dep[k], float(np.linalg.norm(a[idx] - b[idx], axis=1).mean() / tl))
    out += [len(P0), len(P3), n] + [dep[k] for k in PARTIES]
    return np.array(out, np.float32)


def extrait_mouvement(dossiers):
    sys.path.insert(0, ICI); import jev_mouvement as jm
    os.makedirs(f'{DOSSIER}/mouvement', exist_ok=True)
    for d in dossiers:
        d = os.path.abspath(d); nom = hashlib.sha1(d.encode()).hexdigest()[:10]; sortie = f'{DOSSIER}/mouvement/{nom}.npz'
        if os.path.isfile(sortie) or not os.path.isfile(f'{d}/jev_mouvement.json'): continue
        R = json.load(open(f'{d}/jev_mouvement.json'))['par_seconde']; t0 = time.time()
        utiles = {n for x in R if 'suite' in x for n in x['images'] + x['suite']}
        cap = cv2.VideoCapture(f'{d}/film.mp4'); PAS = max(1, int(round((cap.get(cv2.CAP_PROP_FPS) or 30) / jm.FPS))); ims = {}; n_ = -1
        while True:
            ok, f = cap.read()
            if not ok: break
            n_ += 1
            if n_ % PAS == 0 and n_ // PAS in utiles: ims[n_ // PAS] = f[CLIP] if f.shape[0] > 700 else f
        X, Y = [], []
        cles = sorted(jm.Q)
        for x in R:
            if 'suite' not in x or any(n not in ims for n in x['images'] + x['suite']): continue
            X.append(traits_mouvement([ims[n] for n in x['images'] + x['suite']])); Y.append([x.get(k, np.nan) for k in cles])
        np.savez_compressed(sortie, X=np.array(X), Y=np.array(Y, np.float32), cles=np.array(cles), dossier=d)
        print(f'{d} : {len(X)} secondes, {time.time() - t0:.0f} s', flush=True)


# ── CE QUE LE MOTEUR SAIT DE L'IMAGE (« plus fort que JEV ») : JEV ne voyait que les pixels ; le tournage note pour chaque
#    personnage et chaque instant l'étirement de la peau (médiane, 95e centile), la bouche, les émotions jouées, les rotations
#    de tête et de visage, le regard (mesures-*.jsonl). Ces grandeurs, au même instant, s'ajoutent aux pixels.
EMO_M = ('surprise', 'colere', 'peur', 'joie', 'rire', 'malice')


def traits_moteur(dossier):
    """→ fonction t → 12 nombres (pires valeurs parmi les personnages présents à ±0,05 s) ; zéros si rien n'est noté."""
    import glob
    E = []
    for f in glob.glob(f'{dossier}/mesures-*.jsonl'):
        for l in open(f):
            try: E.append(json.loads(l))
            except Exception: pass
    E.sort(key=lambda e: e.get('t', 0)); ts = np.array([e.get('t', 0) for e in E])

    def f(t):
        if not len(ts): return np.zeros(12, np.float32)
        a, b = np.searchsorted(ts, t - 0.05), np.searchsorted(ts, t + 0.05); L = E[a:b]
        if not L: return np.zeros(12, np.float32)
        g = lambda fn: max(fn(e) for e in L)
        return np.array([g(lambda e: (e.get('etirement') or [0, 0])[0]), g(lambda e: (e.get('etirement') or [0, 0])[1]), g(lambda e: e.get('bouche', 0)),
                         g(lambda e: abs((e.get('pose') or {}).get('lacet_visage', 0))), g(lambda e: abs((e.get('pose') or {}).get('tete_lacet', 0))),
                         g(lambda e: abs((e.get('pose') or {}).get('tete_tangage', 0)))] +
                        [g(lambda e, k=k: (e.get('emotions') or {}).get(k, 0)) for k in EMO_M], np.float32)
    return f


# ── MOUVEMENT MESURÉ (« plus précis que JEV ») : banc de vérité terrain du 17/10 rejoué (animation 3D pro et Grok contre la
#    même seconde figée, même tirage) — JEV reconnaissait le mouvement sur 10 secondes pro sur 21, la mesure locale sur 21/21
#    (AUC 0,90 contre 1,00). Sur nos films, la tête tourne de 3° ou plus dans 90 % des secondes et JEV répond « la tête bouge »
#    avec la même probabilité qu'elle bouge ou non (0,54 contre 0,50) : ses verdicts de mouvement ne suivent pas le mouvement
#    réel. Le juge local mesure ce que chaque question énonce : amplitudes réelles du moteur (mesures-*.jsonl), flux optique
#    (décor hors mouvement de caméra), sauts et changements brusques entre images consécutives.
SEUIL_TETE, SEUIL_BUSTE = 3.0, 2.0   # degrés : ≈ 3 px pour un visage de 60 px, ≈ 5 px pour un buste de 150 px (visibles)
_PISTES = {}


def _pistes(dossier):
    import glob
    if dossier not in _PISTES:
        E = {}
        for f in glob.glob(f'{dossier}/mesures-*.jsonl'):
            for l in open(f):
                try: e = json.loads(l)
                except Exception: continue
                E.setdefault(e.get('qui', '?'), []).append(e)
        _PISTES[dossier] = E
    return _PISTES[dossier]


def mouvement_local(ims, dossier, ta, td):
    """8 images (a–d espacées, e–h consécutives) + dossier de la version + bornes (s) → réponses brutes « oui » aux 8
    questions de jev_mouvement (même sens que celles de JEV)."""
    p = [cv2.cvtColor(cv2.resize(im, (144, 115), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY) for im in ims]
    fl = [cv2.calcOpticalFlowFarneback(p[i], p[i + 1], None, 0.5, 3, 15, 3, 5, 1.2, 0) for i in range(3)]
    part = float(np.mean([(np.hypot(f[..., 0], f[..., 1]) > 0.5).mean() for f in fl]))
    f = cv2.calcOpticalFlowFarneback(p[0], p[3], None, 0.5, 3, 15, 3, 5, 1.2, 0); f = f - np.median(f.reshape(-1, 2), 0)   # caméra retirée
    bord = np.ones((115, 144), bool); bord[20:95, 30:114] = False
    decor = float((np.hypot(f[..., 0], f[..., 1])[bord] > 0.3).mean())
    d = [float(np.abs(p[k + 1].astype(np.float32) - p[k]).mean()) for k in range(4, 7)]
    saut = max(d) > 4.0 and max(d) > 3.0 * (sorted(d)[1] + 0.3)
    h = [cv2.calcHist([cv2.cvtColor(ims[k], cv2.COLOR_BGR2HSV)], [0, 1], None, [30, 32], [0, 180, 0, 256]) for k in range(4, 8)]
    raccord = max(cv2.compareHist(cv2.normalize(h[k], h[k]), cv2.normalize(h[k + 1], h[k + 1]), cv2.HISTCMP_BHATTACHARYYA) for k in range(3)) > 0.3
    tete = buste = ens = 0.0
    for L in _pistes(dossier).values():
        s = [e for e in L if ta - 0.02 <= e.get('t', -1) <= td + 0.02]
        if len(s) < 2: continue
        po = lambda c: float(np.ptp([(e.get('pose') or {}).get(c, 0.0) for e in s]))
        rt = max(po('tete_lacet'), po('tete_tangage'), po('tete')); rb = max(po('buste'), po('buste_lacet'))
        tete, buste = max(tete, rt), max(buste, rb); ens = max(ens, float(rt >= SEUIL_TETE and rb >= SEUIL_BUSTE))
    connu = bool(_pistes(dossier))
    r = {'saccade': float(saut), 'raccord': float(raccord), 'fige': float(part < 0.005 and tete < 0.5), 'fond_mort': float(decor < 0.002),
         'ensemble': ens if connu else float(part > 0.02), 'tete': float(tete >= SEUIL_TETE) if connu else float(part > 0.02),
         'buste': float(buste >= SEUIL_BUSTE) if connu else float(part > 0.02), 'bras': float(part > 0.02)}
    return r, {'part_en_mouvement': round(part, 4), 'decor_hors_camera': round(decor, 4), 'sauts': [round(x, 2) for x in d],
               'tete_deg': round(tete, 2), 'buste_deg': round(buste, 2), 'pistes_moteur': connu}


# ── TEXTES À L'IMAGE (jev_texte) : le moteur sait quel texte il a écrit et où. Sous-titres : la bande sous l'image est lue
#    (EasyOCR, Apache-2.0) et comparée à la réplique ; « couvre un visage » est impossible par construction (compose.py
#    refuse tout texte ou émoji sur la scène). Titres : lus et comparés au titre du sketch ; l'accroche est jugée sur le
#    texte du titre par le modèle de langage local.
def _ocr():
    if 'ocr' not in _M:
        import easyocr
        _M['ocr'] = easyocr.Reader(['fr'], gpu=False, model_storage_directory=os.path.expanduser('~/.cache/massamba-models/easyocr'), download_enabled=False, verbose=False)
    return _M['ocr']


def _mots(t):
    import unicodedata
    t = unicodedata.normalize('NFD', str(t).lower()); t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return [m for m in re.findall(r"[a-z0-9]+", t) if len(m) >= 2]


def _proche(m, ref):
    import difflib
    return max((difflib.SequenceMatcher(None, m, r).ratio() for r in ref), default=0.0)


def regles_texte(outil, etat, im):
    """réponses brutes « oui » aux questions de jev_texte sur une image (sous-titre ou carte de titre)."""
    h = im.shape[0]; zone = im[int(0.72 * h):] if outil == 'jev_texte_soustitres' else im
    lu = [(t, float(c)) for _, t, c in _ocr().readtext(zone)]
    mots = [m for t, _ in lu for m in _mots(t)]; conf = float(np.mean([c for _, c in lu])) if lu else 0.0
    if outil == 'jev_texte_soustitres':
        ref = _mots(etat.get('replique', ''))
        ok_m = [m for m in mots if _proche(m, ref) >= 0.75]
        return {'lisible': float(bool(mots) and conf >= 0.5 and len(ok_m) >= 0.8 * len(mots)),
                'conforme': float(bool(mots) and len(ok_m) >= 0.8 * len(mots)), 'visage': 0.0}, {'lu': ' '.join(t for t, _ in lu), 'confiance': round(conf, 2)}
    ref = _mots(etat.get('titre', ''))
    trouves = [r for r in ref if _proche(r, mots) >= 0.75]
    r = {'titre_lisible': float(bool(ref) and len(trouves) >= 0.8 * len(ref) and conf >= 0.4)}
    if etat.get('titre') and os.path.isfile(LLM):
        r['titre_accroche'] = llm_oui({'titre': etat['titre'], 'genre': 'sketch comique ivoirien sur TikTok'},
                                      'Does the sketch title `titre` make a viewer want to watch the sketch (catchy, funny, intriguing)?')
    return r, {'lu': ' '.join(t for t, _ in lu), 'confiance': round(conf, 2)}


# ── SON (jev_son) : JEV lisait une FEUILLE de mesures et appliquait les seuils écrits dans ses questions ; le juge local
#    applique ces mêmes seuils, mot pour mot, sur la même feuille (probabilité 1 = « oui »).
def regles_son(F):
    L = F.get('repliques') or []; R = F.get('rires_mesures') or []; E = {e.get('sketch'): e for e in F.get('rires_entendus_yamnet') or [] if 'sketch' in e}
    sketchs = list(dict.fromkeys(x['sketch'] for x in L))
    couvre = any(x.get('ecart_voix_musique_db', 99) < 10 for x in L)   # « less than 10 dB below the voice »
    def rire_ok(sk):
        return any(r['sketch'] == sk and 0 <= r['ecart_apres_la_prise_de_choc_s'] < 1.0 and 1.0 <= r['duree_s'] <= 3.5
                   and abs(r['ecart_rire_moins_voix_db']) <= 3 and not r['chevauche_une_replique'] and E.get(sk, {}).get('entendu') for r in R)
    rires = bool(sketchs) and all(rire_ok(sk) for sk in sketchs)
    silence = any(s['duree_s'] > 1.5 for s in F.get('silences_entre_repliques_plus_de_0_8_s') or [])
    saut = any(abs(s['saut_db']) > 6 for s in F.get('ecarts_de_niveau_entre_repliques_db') or [])
    pauses = (F.get('rythme_mesure') or {}).get('pause_avant_chaque_chute_s') or []
    temps = all(0.1 <= p <= 1.5 for p in pauses)   # « a short beat before each punchline »
    fl = F.get('fichier_livre') or {}
    tech = -16 <= fl.get('sonie_integree_lufs', -99) <= -12 and fl.get('crete_vraie_dbtp', 9) <= -1
    v = {'musique_couvre': couvre, 'rires_place': rires, 'silence': silence, 'saut': saut, 'rythme': (not couvre) and temps and rires, 'technique': tech}
    return {k: {'noul': 1.0 if b else 0.0, 'juge': 'règle locale'} for k, b in v.items()}


class NonJuge(RuntimeError):
    """question sans tête validée : la porte qui l'utilise est déclarée « non jugée » (jamais une réponse inventée)."""


# ── apprentissage : une tête par question de jev_film, sur la probabilité de JEV (étiquettes souples)
TENUES = ('ep02/v1', 'ep01/v5')   # versions les plus récentes, jamais vues à l'apprentissage : la mesure d'accord
LISSE = os.environ.get('JUGE_LISSE', '1') == '1'   # lissage par plan évalué (et appliqué en production par jev_film)


def _questions_film():
    jf = _jev_film()
    Q = {k: (txt, 'frame') for k, (_, txt) in {**jf.N1}.items()}
    Q.update({k: (txt, 'frame+ref') for k, (_, txt) in jf.N2.items()})
    # « style » est posée en conformité (vrai = conforme) : la tête apprend la probabilité de JEV telle qu'il la rend
    return Q, {k: v[0] for k, v in {**jf.N1, **jf.N2}.items()}


def _entree(X, XR=None):
    return X if XR is None else np.concatenate([X, X - XR], 1)


def _ajuste(X, p, poids_pos=1.0):
    """régression logistique sur étiquettes souples : chaque image compte pour « oui » avec le poids p et « non » avec 1 − p."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    sc = StandardScaler().fit(X); Z = sc.transform(X)
    Xd = np.concatenate([Z, Z]); yd = np.r_[np.ones(len(p)), np.zeros(len(p))]; wd = np.r_[p * poids_pos, 1 - p]
    m = LogisticRegression(C=0.05, max_iter=2000).fit(Xd, yd, sample_weight=wd)
    return {'mu': sc.mean_.astype(np.float32), 'sd': sc.scale_.astype(np.float32), 'w': m.coef_[0].astype(np.float32), 'b': float(m.intercept_[0])}


def _proba(t, X):
    z = ((X - t['mu']) / t['sd']) @ t['w'] + t['b'] - t.get('decale', 0.0)
    return 1 / (1 + np.exp(-z))


def _mesure(p_loc, p_jev):
    from sklearn.metrics import roc_auc_score
    y = p_jev > 0.5; d = p_loc > 0.5
    rp = float((d & y).sum() / max(1, y.sum())); rn = float((~d & ~y).sum() / max(1, (~y).sum()))
    auc = float(roc_auc_score(y, p_loc)) if 0 < y.sum() < len(y) else None
    return {'images': int(len(y)), 'defauts_jev': int(y.sum()), 'accord': round(float((d == y).mean()), 3),
            'rappel_defauts': round(rp, 3), 'specificite': round(rn, 3), 'equilibre': round((rp + rn) / 2, 3), 'auc': None if auc is None else round(auc, 3)}


def _avis(d, ns, plans):
    """avis INDIVIDUELS de JEV (cache de jev_film) pour les images extraites : [{question: [avis…]}…] ; {} si absent."""
    try:
        TO = json.load(open(f'{d}/tournage.json')); SH = TO['decoupage']; EMP = TO.get('empreintes', {})
    except Exception:
        return [{} for _ in ns]
    if 'index' not in _AVIS:   # index du cache une seule fois : (empreinte, décalage) → fichier
        C = os.path.expanduser('~/.cache/massamba-jev/images'); idx = {}
        for f in os.listdir(C):
            p_ = f.split('_')
            if len(p_) == 4 and p_[3] == '0.json': idx.setdefault((p_[0], p_[1]), f'{C}/{f}')
        _AVIS['index'] = idx
    idx = _AVIS['index']; out = []
    for n, i in zip(ns, plans):
        cle = EMP.get(f'{SH[int(i)][0]:.2f}'); r = {}
        f = idx.get((cle, str(int(n) - int(round(SH[int(i)][0] * 30))))) if cle else None
        if f:
            try: r = json.load(open(f))
            except Exception: pass
        out.append(r)
    return out


_AVIS = {}


def _donnees():
    D = []
    for f in sorted(os.listdir(f'{DOSSIER}/donnees')):
        z = np.load(f'{DOSSIER}/donnees/{f}', allow_pickle=True); d = str(z['dossier'])
        refs = dict(zip(z['plans_ref'].tolist(), z['XR']))
        D.append({'dossier': d, 'tenue': any(d.endswith(t) for t in TENUES), 'X': z['X'], 'Y': z['Y'], 'cles': list(z['cles']),
                  'avis': _avis(d, z['n'], z['plan']) if any(d.endswith(t) for t in TENUES) else None,
                  'plan': z['plan'], 'XR': np.stack([refs.get(int(p), np.full(z['X'].shape[1], np.nan, np.float32)) for p in z['plan']]) if len(z['plan']) else z['X']})
    return D


def apprend():
    Q, defaut_si_vrai = _questions_film(); D = _donnees(); tetes, rapport = {}, {}
    for k, (txt, roles) in Q.items():
        def pile(tenue):
            Xs, ps = [], []
            for d in D:
                if d['tenue'] != tenue or k not in d['cles']: continue
                y = d['Y'][:, d['cles'].index(k)]; ok = ~np.isnan(y)
                if not defaut_si_vrai.get(k, False) is False: y = 1 - y   # question de conformité : verdict stocké = 1 − réponse brute
                if roles == 'frame+ref': ok &= ~np.isnan(d['XR']).any(1)
                if ok.sum(): Xs.append(_entree(d['X'][ok], d['XR'][ok] if roles == 'frame+ref' else None)); ps.append(y[ok])
            return (np.concatenate(Xs), np.concatenate(ps)) if Xs else (None, None)
        Xa, pa = pile(False); Xt, pt = pile(True)
        if Xa is None or len(pa) < 200 or (pa > 0.5).sum() < 10: rapport[k] = {'statut': 'données insuffisantes', 'images': 0 if pa is None else int(len(pa))}; continue
        t = _ajuste(Xa, pa)
        # seuil de décision réglé sur l'apprentissage (équilibre rappel / spécificité), ramené à 0,5 : « > 0,5 = défaut » reste la règle
        pa_loc = _proba(t, Xa); ya = pa > 0.5
        seuils = np.linspace(0.05, 0.95, 91); rare = ya.mean() < 0.05
        if rare:   # défaut rare chez JEV : seuil qui reproduit SA fréquence de défauts (l'équilibre multipliait les fausses alertes)
            s_ = float(np.clip(np.quantile(pa_loc, 1 - ya.mean()), 0.05, 0.95))
        else:
            sc = [((pa_loc > s) & ya).sum() / max(1, ya.sum()) + ((pa_loc <= s) & ~ya).sum() / max(1, (~ya).sum()) for s in seuils]
            s_ = float(seuils[int(np.argmax(sc))])
        t['decale'] = float(np.log(s_ / (1 - s_)))
        m_app = _mesure(_proba(t, Xa), pa); m_ten = _mesure(_proba(t, Xt), pt) if Xt is not None else None
        # JEV FACE À LUI-MÊME : sur les images tenues à l'écart où JEV a donné deux avis, l'accord du juge local avec le
        # premier avis est comparé à l'accord du second avis avec le premier (le plafond honnête : un second appel à JEV)
        rep = {'paires': 0}
        L1, L2, LL = [], [], []
        for d in D:
            if not d['tenue'] or k not in d['cles'] or not d.get('avis'): continue
            ok = np.ones(len(d['X']), bool)
            if roles == 'frame+ref': ok &= ~np.isnan(d['XR']).any(1)
            pl = _proba(t, _entree(d['X'], d['XR'] if roles == 'frame+ref' else None))
            if LISSE: pl = lisse_plan(pl, d['plan'], rayon=1)   # images extraites une sur trois : ±1 = ±0,1 s
            for j in np.where(ok)[0]:
                a_ = d['avis'][j].get(k)
                if isinstance(a_, list) and len(a_) >= 2: L1.append(a_[0] > 0.5); L2.append(a_[1] > 0.5); LL.append(pl[j] > 0.5)
        if L1:
            L1, L2, LL = map(np.array, (L1, L2, LL))
            rep = {'paires': int(len(L1)), 'accord_jev_jev': round(float((L1 == L2).mean()), 3), 'accord_local_jev': round(float((LL == L1).mean()), 3),
                   'rappel_jev_jev': round(float((L2 & L1).sum() / max(1, L1.sum())), 3), 'rappel_local_jev': round(float((LL & L1).sum() / max(1, L1.sum())), 3)}
        valide = bool(m_ten) and ((rep['paires'] >= 30 and rep['accord_local_jev'] >= rep['accord_jev_jev'] - 0.02 and rep['rappel_local_jev'] >= rep['rappel_jev_jev'] - 0.05
                                   and m_ten['accord'] >= 0.70) or (m_ten['accord'] >= ACCORD_MIN and m_ten['equilibre'] >= 0.75))
        # VALIDATION PARTIELLE : trop peu de défauts chez JEV sur les versions tenues à l'écart pour mesurer un rappel ; la
        # tête reproduit sa fréquence de défauts et s'accorde avec lui sur au moins 95 % des images — elle juge, étiquetée
        partielle = bool(m_ten) and not valide and m_ten['defauts_jev'] < 10 and m_ten['accord'] >= 0.95
        m_ten = dict(m_ten or {}, jev_face_a_lui_meme=rep)
        tetes[cle_question(txt)] = dict(t, nom=k, roles=roles, valide=valide or partielle, partielle=partielle)
        rapport[k] = {'question': txt[:90], 'roles': roles, 'apprentissage': m_app, 'versions_tenues_a_l_ecart': m_ten, 'seuil_jev_equivalent': round(s_, 2),
                      'statut': 'confiée au juge local' if valide else ('confiée au juge local (validation partielle : défaut rare)' if partielle else 'greffe en cours (accord insuffisant)')}
        print(f"{k:22s} {rapport[k]['statut']:40s} tenues : {m_ten}", flush=True)
    # mouvement : JEV rend la probabilité brute de « oui » ; jev_mouvement la change en conformité (1 − p pour les défauts)
    sys.path.insert(0, ICI); import jev_mouvement as jm
    M = []
    for f in sorted(os.listdir(f'{DOSSIER}/mouvement')) if os.path.isdir(f'{DOSSIER}/mouvement') else []:
        z = np.load(f'{DOSSIER}/mouvement/{f}', allow_pickle=True); d = str(z['dossier'])
        M.append({'tenue': any(d.endswith(t) for t in TENUES), 'X': z['X'], 'Y': z['Y'], 'cles': list(z['cles'])})
    for k, (att, txt) in jm.Q.items():
        def pile(tenue):
            Xs, ps = [], []
            for d in M:
                if d['tenue'] != tenue or k not in d['cles'] or not len(d['X']): continue
                y = d['Y'][:, d['cles'].index(k)]; ok = ~np.isnan(y)
                Xs.append(d['X'][ok]); ps.append(y[ok] if att else 1 - y[ok])
            return (np.concatenate(Xs), np.concatenate(ps)) if Xs else (None, None)
        Xa, pa = pile(False); Xt, pt = pile(True)
        if Xa is None or len(pa) < 100 or min((pa > 0.5).sum(), (pa <= 0.5).sum()) < 10:
            rapport[k] = {'statut': 'données insuffisantes', 'images': 0 if pa is None else int(len(pa))}; continue
        t = _ajuste(Xa, pa); pa_loc = _proba(t, Xa); ya = pa > 0.5; seuils = np.linspace(0.05, 0.95, 91)
        sc = [((pa_loc > s_) & ya).sum() / max(1, ya.sum()) + ((pa_loc <= s_) & ~ya).sum() / max(1, (~ya).sum()) for s_ in seuils]
        s_ = float(seuils[int(np.argmax(sc))]); t['decale'] = float(np.log(s_ / (1 - s_)))
        m_app = _mesure(_proba(t, Xa), pa); m_ten = _mesure(_proba(t, Xt), pt) if Xt is not None else None
        valide = bool(m_ten) and m_ten['accord'] >= ACCORD_MIN and m_ten['equilibre'] >= 0.75
        tetes[cle_question(txt.format(dt=0.3))] = dict(t, nom=k, roles='mouvement', valide=valide)   # même texte que celui posé (dt formaté)
        rapport[k] = {'question': txt[:90], 'roles': 'mouvement', 'apprentissage': m_app, 'versions_tenues_a_l_ecart': m_ten,
                      'seuil_jev_equivalent': round(s_, 2), 'statut': 'confiée au juge local' if valide else 'greffe en cours (accord insuffisant)'}
        print(f"{k:22s} {rapport[k]['statut']:40s} tenues : {m_ten}", flush=True)
    # DOMAINE APPRIS par rôle : ACP à 32 dimensions des images d'apprentissage, distance au plus proche voisin ; le seuil est
    # le 99e centile des distances entre images d'apprentissage (une image plus loin que ça = jamais vu → voie suivante)
    rng = np.random.default_rng(0); dom = {}
    pools = {'frame': [d['X'] for d in D if not d['tenue']], 'frame+ref': [_entree(d['X'][~np.isnan(d['XR']).any(1)], d['XR'][~np.isnan(d['XR']).any(1)]) for d in D if not d['tenue']],
             'mouvement': [d['X'] for d in M if not d['tenue'] and len(d['X'])]}
    for role, L_ in pools.items():
        L_ = [x for x in L_ if len(x)]
        if not L_: continue
        X_ = np.concatenate(L_); mu, sd = X_.mean(0), X_.std(0) + 1e-6; Z = (X_ - mu) / sd
        _, _, Vt = np.linalg.svd(Z[rng.choice(len(Z), min(len(Z), 4000), replace=False)], full_matrices=False); P = Vt[:32].T
        pts = (Z @ P)[rng.choice(len(Z), min(len(Z), 3000), replace=False)]
        q_ = pts[rng.choice(len(pts), min(len(pts), 500), replace=False)]
        dd = np.sqrt(((q_[:, None, :] - pts[None]) ** 2).sum(-1)); dd[dd == 0] = np.inf
        dom[role] = {'mu': mu.astype(np.float32), 'sd': sd.astype(np.float32), 'P': P.astype(np.float32), 'pts': pts.astype(np.float32),
                     'seuil': float(np.percentile(dd.min(1), 99))}
    tetes['_domaines'] = dom
    os.makedirs(DOSSIER, exist_ok=True)
    np.save(f'{DOSSIER}/tetes.npy', tetes, allow_pickle=True)
    json.dump({'date': time.strftime('%Y-%m-%d %H:%M'), 'modele': MODELE, 'accord_min': ACCORD_MIN, 'versions_tenues': TENUES, 'questions': rapport},
              open(f'{DOSSIER}/accord.json', 'w'), ensure_ascii=False, indent=1)
    _T.clear()


_T = {}


def tetes():
    if not _T and os.path.isfile(f'{DOSSIER}/tetes.npy'): _T.update(np.load(f'{DOSSIER}/tetes.npy', allow_pickle=True).item())
    return _T


def _image(a):
    import base64
    return cv2.imdecode(np.frombuffer(base64.b64decode(a['data_base64']), np.uint8), cv2.IMREAD_COLOR)


# ── CASCADE (18/10/2026, « prévoir tous les cas, même non encore rencontrés » ; « plus fort et plus précis que JEV ») :
#    1. règle exacte quand la question énonce un seuil mesuré (son) ;
#    2. tête apprise sur les verdicts de JEV, validée contre JEV face à lui-même, ET image dans le domaine appris (distance au
#       plus proche voisin des images d'apprentissage sous son 99e centile : un lieu, un personnage, un défaut jamais vus
#       font sortir du domaine) ;
#    3. sinon, modèle vision-langage local (SmolVLM, Apache-2.0) pour toute question sur des images, ou modèle de langage
#       local (Qwen3-1.7B, Apache-2.0) pour une question sur du texte — oui/non lu dans les probabilités des jetons ;
#    4. sinon NonJuge (la porte est « non jugée », jamais une réponse inventée).
#    Chaque réponse locale est inscrite au journal (voie, question, probabilité) : audit et apprentissage continu.
VLM = os.environ.get('JUGE_VLM', 'HuggingFaceTB/SmolVLM-256M-Instruct')
LLM = os.path.expanduser(os.environ.get('JUGE_LLM', '~/.cache/massamba-models/llm/Qwen3-1.7B-Q4_K_M.gguf'))


def _domaine(role, X):
    """vrai si les caractéristiques X (une ligne) sont dans le domaine appris pour ce rôle."""
    D_ = tetes().get('_domaines', {}).get(role)
    if not D_: return True
    z = ((X - D_['mu']) / D_['sd']) @ D_['P']
    return float(np.sqrt(((D_['pts'] - z) ** 2).sum(1)).min()) <= D_['seuil']


def _vlm():
    if 'vlm' not in _M:
        import torch
        from transformers import AutoProcessor, AutoModelForVision2Seq
        # une seule tuile de 512 px par image (sans découpage) : ~64 jetons d'image au lieu de plusieurs centaines
        _M['vlm'] = (AutoProcessor.from_pretrained(VLM, do_image_splitting=False), AutoModelForVision2Seq.from_pretrained(VLM, torch_dtype=torch.float32).eval(), torch)
    return _M['vlm']


VLM_MAX = int(os.environ.get('JUGE_VLM_MAX', 120))   # appels de la voie de secours par contrôle ; au-delà : « non jugé »


def _oui_non_ids(tok):
    y = {tok.encode(w, add_special_tokens=False)[0] for w in ('Yes', 'yes', ' Yes', ' yes')}
    n = {tok.encode(w, add_special_tokens=False)[0] for w in ('No', 'no', ' No', ' no')}
    return sorted(y), sorted(n)


def vlm_oui(ims, texte, contexte=''):
    """probabilité de « oui » du modèle vision-langage local ; ims : {nom: image BGR} cités dans la question (≤ 4)."""
    from PIL import Image
    _M['n_vlm'] = _M.get('n_vlm', 0) + 1
    if _M['n_vlm'] > VLM_MAX: raise NonJuge(f'budget de la voie de secours atteint ({VLM_MAX} questions) : tête apprise à compléter')
    proc, m, torch = _vlm()
    noms = [k for k in re.findall(r'`([^`]+)`', texte) if k in ims][:4] or list(ims)[:1]
    noms = list(dict.fromkeys(noms))
    intro = ' '.join(f'Image {i + 1} is `{k}`.' for i, k in enumerate(noms))
    msgs = [{'role': 'user', 'content': [{'type': 'image'} for _ in noms] + [{'type': 'text', 'text': f'{contexte} {intro} {texte} Answer yes or no.'.strip()}]}]
    x = proc(text=proc.apply_chat_template(msgs, add_generation_prompt=True), images=[Image.fromarray(cv2.cvtColor(ims[k], cv2.COLOR_BGR2RGB)) for k in noms], return_tensors='pt')
    with torch.no_grad(): lg = m(**x).logits[0, -1]
    y, n = _oui_non_ids(proc.tokenizer)
    return float(torch.sigmoid(torch.logsumexp(lg[y], 0) - torch.logsumexp(lg[n], 0)))


def llm_oui(etat, texte):
    """probabilité de « oui » du modèle de langage local pour une question sur des données en texte (état JSON)."""
    if 'llm' not in _M:
        from llama_cpp import Llama
        _M['llm'] = Llama(model_path=LLM, n_ctx=8192, n_threads=os.cpu_count() or 4, logits_all=False, verbose=False)
    L = _M['llm']; etat_ = json.dumps(etat, ensure_ascii=False)[:20000]
    p = (f"<|im_start|>user\nState (JSON):\n{etat_}\n\nQuestion: {texte}\nAnswer with Yes or No only. /no_think<|im_end|>\n"
         f"<|im_start|>assistant\n<think>\n\n</think>\n\n")
    r = L.create_completion(p, max_tokens=1, logprobs=20, temperature=0.0)
    top = (r['choices'][0].get('logprobs') or {}).get('top_logprobs') or [{}]
    py = sum(np.exp(v) for k, v in top[0].items() if k.strip().lower() == 'yes'); pn = sum(np.exp(v) for k, v in top[0].items() if k.strip().lower() == 'no')
    return float(py / (py + pn)) if py + pn > 0 else 0.5


def _journal(ligne):
    try:
        os.makedirs(DOSSIER, exist_ok=True)
        with open(f'{DOSSIER}/journal.jsonl', 'a') as f: f.write(json.dumps(ligne, ensure_ascii=False) + '\n')
    except OSError:
        pass


def _texte(q):
    i_ = q.get('instructions', '')
    return i_ if isinstance(i_, str) else json.dumps(i_, ensure_ascii=False)


def demande(etat, questions, assets=None, outil='?'):
    """même contrat que jev_api.demande : {id: {'noul': p}} (ou choice) pour chaque question, par la cascade ci-dessus."""
    if outil == 'jev_son' and isinstance(etat.get('feuille'), dict):   # voie 1 : règles écrites des questions, feuille mesurée
        r = regles_son(etat['feuille'])
        if set(questions) <= set(r): return {k: r[k] for k in questions}
    T = tetes()
    ims = {k: _image(assets[v]) for k, v in etat.items() if isinstance(v, str) and assets and v in assets}
    if outil in ('jev_texte_soustitres', 'jev_texte_titres') and 'image' in ims:   # voie 1 : texte écrit par le moteur, relu
        try:
            r, lu = regles_texte(outil, etat, ims['image'])
            if set(questions) <= set(r):
                _journal({'date': time.strftime('%Y-%m-%dT%H:%M:%S'), 'outil': outil, 'voie': 'ocr', **lu})
                return {k: {'noul': r[k], 'juge': 'règle locale (OCR)'} for k in questions}
        except Exception:
            pass
    F, dom = {}, {}

    def traits(role):
        if role in F: return F[role]
        if role == 'mouvement': F[role] = traits_mouvement([ims[c] for c in 'abcdefgh'])
        else:
            for k in ('frame', 'reference'):
                if k in ims and k not in F: F[k] = caracteristiques([ims[k]])[0]
            F[role] = F['frame'] if role == 'frame' else np.concatenate([F['frame'], F['frame'] - F['reference']])
        dom[role] = _domaine(role, F[role])
        return F[role]
    out, contexte = {}, (etat.get('contexte') if isinstance(etat.get('contexte'), str) else '')
    for qid, q in questions.items():
        txt = _texte(q); t = T.get(cle_question(txt)); voie = None; err = ''
        try:
            if q.get('type') == 'noul' and t and t.get('valide'):   # voie 2 : tête apprise, dans son domaine
                x = traits(t['roles'])
                if dom[t['roles']]: out[qid] = {'noul': float(_proba(t, x[None])[0]), 'juge': 'local (validation partielle)' if t.get('partielle') else 'local'}; voie = 'tete'
            if voie is None and ims and q.get('type') in ('noul', 'choice'):   # voie 3a : question ou image inédite
                if q.get('type') == 'noul': out[qid] = {'noul': vlm_oui(ims, txt, contexte), 'juge': 'vlm-local'}
                else:
                    C = q.get('criteria') or {}
                    pr = {c: vlm_oui(ims, f'{txt} Is the answer: {d if isinstance(d, str) else json.dumps(d)}?', contexte) for c, d in C.items()}
                    tot = sum(pr.values()) or 1.0; pr = {c: v / tot for c, v in pr.items()}
                    out[qid] = {'choice': max(pr, key=pr.get), 'probabilities': pr, 'juge': 'vlm-local'}
                voie = 'vlm'
            if voie is None and not ims and q.get('type') == 'noul' and os.path.isfile(LLM):   # voie 3b : question sur du texte
                out[qid] = {'noul': llm_oui(etat, txt), 'juge': 'llm-local'}; voie = 'llm'
        except NonJuge:
            raise
        except Exception as e:
            voie = None; err = str(e)[:120]
        if voie is None:
            raise NonJuge(f"{outil} : question « {qid} » sans voie locale ({q.get('type')}{', ' + err if err else ''})")
        _journal({'date': time.strftime('%Y-%m-%dT%H:%M:%S'), 'outil': outil, 'question': qid, 'cle': cle_question(txt), 'voie': voie,
                  **{k: v for k, v in out[qid].items() if k in ('noul', 'choice')}})
    return out


def lisse_plan(p, plans, rayon=2):
    """PLUS PRÉCIS QUE JEV : un défaut réel persiste sur les images voisines d'un même plan (JEV juge chaque image seule et se
    contredit 1 fois sur 3 sur « rendu ») — médiane glissante de ±rayon images, sans franchir une coupe."""
    p = np.asarray(p, np.float64); out = p.copy(); plans = np.asarray(plans)
    for i in range(len(p)):
        a, b = max(0, i - rayon), min(len(p), i + rayon + 1); m = plans[a:b] == plans[i]
        out[i] = float(np.median(p[a:b][m]))
    return out


def etat():
    if not os.path.isfile(f'{DOSSIER}/accord.json'): print('aucune tête apprise'); return
    A = json.load(open(f'{DOSSIER}/accord.json'))
    for k, r in A['questions'].items():
        m = r.get('versions_tenues_a_l_ecart') or {}
        print(f"{k:22s} {r['statut']:40s} accord {m.get('accord')} équilibre {m.get('equilibre')} rappel {m.get('rappel_defauts')} AUC {m.get('auc')}")


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'extrait': extrait(sys.argv[2:])
    elif cmd == 'extrait-mouvement': extrait_mouvement(sys.argv[2:])
    elif cmd == 'apprend': apprend()
    elif cmd == 'etat': etat()
    else: print(open(__file__, encoding='utf-8').read().split('import hashlib')[0])
