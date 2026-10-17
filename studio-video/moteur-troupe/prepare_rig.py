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


def prepare(d, jev=True, force=False):
    R = f'{d}/rig'; os.makedirs(R, exist_ok=True)
    S = json.load(open(f'{d}/scene.json')); img = cv2.cvtColor(cv2.imread(f'{d}/image.png'), cv2.COLOR_BGR2RGB)
    if os.path.isfile(f'{R}/scene_rig.json') and not force: return json.load(open(f'{R}/scene_rig.json'))
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
    orph = orphelins(img, alphas, pers_tous, meuble, personne)
    pts_fins = {}
    for k, a in enumerate(acts):   # squelette re-détecté sur le recadrage agrandi, gardé s'il est meilleur
        L, sc_ = squelette(img, a, alphas[k]); s0 = _score_pts(a['pts'], alphas[k])
        if L is not None and sc_ > s0 + 0.02:
            a['pts'] = L.round(2).tolist(); pts_fins[a['nom']] = (round(s0, 3), round(sc_, 3))
    for k, a in enumerate(acts): decoupes[k]['orphelins_rattaches'] = orph[k]
    # le décor sans acteur et les parties cachées ne dépendent que des découpes : repris tels quels si elles n'ont pas
    # changé (corriger un squelette ou des bras ne refait pas 7 minutes de reconstitution)
    empreinte = empreinte_decoupes(alphas)
    ancien = json.load(open(f'{R}/scene_rig.json')) if os.path.isfile(f'{R}/scene_rig.json') else {}
    cache = ancien.get('empreinte_alphas') == empreinte and all(os.path.isfile(f'{R}/{f}') for f in ('plaque.png', 'trou.png', 'coherence.json')) \
        and all(os.path.isfile(f"{R}/alpha-{a['slug']}.png") for a in acts)
    if cache:
        pl = cv2.cvtColor(cv2.imread(f'{R}/plaque.png'), cv2.COLOR_BGR2RGB); trou = (cv2.imread(f'{R}/trou.png', 0) > 0).astype(np.uint8)
        inventes = [tuple(x) for x in ancien.get('inventes', [])]; faits = ancien.get('fils', []); ordre_noms = ancien.get('ordre', [a['nom'] for a in acts])
        finals = [(cv2.imread(f"{R}/alpha-{a['slug']}.png", cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535, ancien.get('acteurs', {}).get(a['nom'], {}).get('complete')) for a in acts]
    else:
        pl, trou = PQ.plaque_pleine(img, alphas)
        pl, inventes = PQ.nettoie(img, pl, trou)   # restes d'acteur et objets inventés par le remplissage : rebouchés
        pl, faits = PQ.fils(img, pl, alphas)
        cv2.imwrite(f'{R}/plaque.png', cv2.cvtColor(pl, cv2.COLOR_RGB2BGR)); cv2.imwrite(f'{R}/trou.png', trou * 255)
        am, ordre = PQ.amodal(img, alphas); ordre_noms = [acts[k]['nom'] for k in ordre]; finals = []
        for k, a in enumerate(acts):
            a2, im2 = am[k]; comp = None; fin = alphas[k]
            if (a2 > alphas[k] + 0.01).any():
                diff = np.abs(im2.astype(np.int16) - img.astype(np.int16)).max(2) > 0
                ys, xs = np.nonzero(diff)
                if len(xs):
                    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
                    cv2.imwrite(f"{R}/complete-{a['slug']}.png", cv2.cvtColor(im2[y0:y1, x0:x1], cv2.COLOR_RGB2BGR)); comp = [x0, y0, x1, y1]
                fin = a2
            cv2.imwrite(f"{R}/alpha-{a['slug']}.png", np.clip(fin * 65535, 0, 65535).astype(np.uint16)); finals.append((fin, comp))
    info = {'acteurs': {}, 'ordre': ordre_noms, 'fils': faits, 'inventes': inventes, 'empreinte_alphas': empreinte, 'plaque_reprise': bool(cache)}
    for k, a in enumerate(acts):
        s = a['slug']; alphas[k], comp = finals[k]; ent = {'assis': assis(a), 'decoupe': decoupes[k], 'pts': a['pts']}
        if a['nom'] in pts_fins: ent['squelette_affine'] = {'score_avant': pts_fins[a['nom']][0], 'score_apres': pts_fins[a['nom']][1]}
        if comp: ent['complete'] = comp
        fb = a['visage']['box'] if a.get('visage') else None
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
