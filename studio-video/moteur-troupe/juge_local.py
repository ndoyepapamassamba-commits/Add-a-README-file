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


def _donnees():
    D = []
    for f in sorted(os.listdir(f'{DOSSIER}/donnees')):
        z = np.load(f'{DOSSIER}/donnees/{f}', allow_pickle=True); d = str(z['dossier'])
        refs = dict(zip(z['plans_ref'].tolist(), z['XR']))
        D.append({'dossier': d, 'tenue': any(d.endswith(t) for t in TENUES), 'X': z['X'], 'Y': z['Y'], 'cles': list(z['cles']),
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
                if roles == 'frame+ref': ok &= ~np.isnan(d['XR']).any(1)
                if ok.sum(): Xs.append(_entree(d['X'][ok], d['XR'][ok] if roles == 'frame+ref' else None)); ps.append(y[ok])
            return (np.concatenate(Xs), np.concatenate(ps)) if Xs else (None, None)
        Xa, pa = pile(False); Xt, pt = pile(True)
        if Xa is None or len(pa) < 200 or (pa > 0.5).sum() < 10: rapport[k] = {'statut': 'données insuffisantes', 'images': 0 if pa is None else int(len(pa))}; continue
        t = _ajuste(Xa, pa)
        # seuil de décision réglé sur l'apprentissage (équilibre rappel / spécificité), ramené à 0,5 : « > 0,5 = défaut » reste la règle
        pa_loc = _proba(t, Xa); ya = pa > 0.5
        seuils = np.linspace(0.05, 0.95, 91)
        sc = [((pa_loc > s) & ya).sum() / max(1, ya.sum()) + ((pa_loc <= s) & ~ya).sum() / max(1, (~ya).sum()) for s in seuils]
        s_ = float(seuils[int(np.argmax(sc))]); t['decale'] = float(np.log(s_ / (1 - s_)))
        m_app = _mesure(_proba(t, Xa), pa); m_ten = _mesure(_proba(t, Xt), pt) if Xt is not None else None
        valide = bool(m_ten) and m_ten['accord'] >= ACCORD_MIN and m_ten['equilibre'] >= 0.75
        tetes[cle_question(txt)] = dict(t, nom=k, roles=roles, valide=valide)
        rapport[k] = {'question': txt[:90], 'roles': roles, 'apprentissage': m_app, 'versions_tenues_a_l_ecart': m_ten, 'seuil_jev_equivalent': round(s_, 2),
                      'statut': 'confiée au juge local' if valide else 'greffe en cours (accord insuffisant)'}
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


def demande(etat, questions, assets=None, outil='?'):
    """même contrat que jev_api.demande : {id: {'noul': p}} pour chaque question ; NonJuge si une question n'a pas de tête
    validée sur versions tenues à l'écart (la porte correspondante est alors « non jugée »)."""
    if outil == 'jev_son' and isinstance(etat.get('feuille'), dict):   # règles écrites des questions, sur la feuille mesurée
        r = regles_son(etat['feuille'])
        if set(questions) <= set(r): return {k: r[k] for k in questions}
    T = tetes(); manque = []
    for qid, q in questions.items():
        t = T.get(cle_question(q.get('instructions', '') if isinstance(q.get('instructions'), str) else json.dumps(q.get('instructions'))))
        if q.get('type') != 'noul' or not t or not t.get('valide'): manque.append(qid)
    if manque:
        raise NonJuge(f"{outil} : {len(manque)}/{len(questions)} question(s) sans tête locale validée ({', '.join(manque[:4])}{'…' if len(manque) > 4 else ''})")
    ims = {k: _image(assets[v]) for k, v in etat.items() if isinstance(v, str) and assets and v in assets}
    roles = {T[cle_question(q['instructions'])]['roles'] for q in questions.values()}
    F = {k: caracteristiques([im])[0] for k, im in ims.items()} if roles & {'frame', 'frame+ref'} else {}
    if 'mouvement' in roles: F['mouvement'] = traits_mouvement([ims[c] for c in 'abcdefgh'])
    out = {}
    for qid, q in questions.items():
        t = T[cle_question(q['instructions'])]
        x = (F['mouvement'] if t['roles'] == 'mouvement' else F['frame'] if t['roles'] == 'frame'
             else np.concatenate([F['frame'], F['frame'] - F['reference']]))
        out[qid] = {'noul': float(_proba(t, x[None])[0]), 'juge': 'local'}
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
