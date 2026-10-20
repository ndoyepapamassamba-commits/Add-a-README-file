# MARIONNETTES PEINTES (20/10/2026, « les personnages ne ressemblent pas à des humains … je parlais comme la version précédente
# mais plus propre et animables »). On garde le DESSIN PEINT de la troupe (planches : 5 poses par personnage, neutre, accuse,
# choc, haussement, rire) et on change seulement la façon de l'animer : plus rien n'est déformé (ni LivePortrait, ni ARAP).
#   · BOUCHE REMPLACÉE, comme dans les studios de découpage (Toon Boom, Moho) : la bouche peinte d'origine est effacée une
#     fois (LaMa, Apache-2.0, avec de la place sous la lèvre pour l'ouverture), puis chaque visème est REPEINT à partir des
#     repères de ses propres lèvres (FaceLandmarker, Apache-2.0) et de leurs couleurs relevées sur la planche : lèvres,
#     intérieur, dents, langue, ombre sous la lèvre. Au repos, la bouche d'origine revient telle quelle.
#   · PAUPIÈRES peintes à la couleur de la peau au-dessus de l'œil, sur le masque réel de l'œil (blanc et iris mesurés, pas
#     seulement les repères humains, trop petits pour des yeux de dessin animé) ; aucune paupière derrière des lunettes noires.
#   · POSES de la planche choisies par l'émotion de la réplique ; respiration et balancement en transformations rigides.
# python3 marionnette_peinte.py prepare NOM… | planche NOM SORTIE.jpg
import json, math, os, sys
import numpy as np, cv2, skia

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
POSES = os.environ.get('TROUPE_POSES', os.path.join(ICI, '..', '..', 'workbench', '.private', 'troupe', 'poses'))
CACHE = os.path.expanduser(os.environ.get('MARIONNETTES_PEINTES', '~/.cache/massamba-models/marionnettes-peintes'))
MODELES = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models'))
ECH = 2   # résolution de travail : planche ×2 (bouches et paupières peintes nettes jusqu'au gros plan)

HAUT_EXT = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291]
BAS_EXT = [291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61]
HAUT_INT = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308]
BAS_INT = [308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78]
YEUX = [([33, 246, 161, 160, 159, 158, 157, 173, 133], [33, 7, 163, 144, 145, 153, 154, 155, 133]),
        ([263, 466, 388, 387, 386, 385, 384, 398, 362], [263, 249, 390, 373, 374, 380, 381, 382, 362])]
POSE_NOMS = ['neutre', 'accuse', 'choc', 'haussement', 'rire']
# visèmes (Rhubarb A–H, X) : ouverture (en largeur de bouche), largeur, arrondi, dents du haut, lèvre sous les dents, langue
VISEMES = {'A': (0.00, 0.45, 0.0, 0, 0, 0), 'B': (0.10, 0.62, 0.0, 1, 0, 0), 'C': (0.20, 0.66, 0.0, 1, 0, 0),
           'D': (0.36, 0.74, 0.0, 1, 0, 1), 'E': (0.22, 0.42, 0.6, 0, 0, 0), 'F': (0.12, 0.25, 1.0, 0, 0, 0),
           'G': (0.06, 0.56, 0.0, 1, 1, 0), 'H': (0.18, 0.56, 0.0, 1, 0, 1), 'X': (0.0, 0.5, 0.0, 0, 0, 0)}


# ── repères du visage ────────────────────────────────────────────────────────────────────────────────────────────────
_DET = {}


def _detecteur():
    if 'd' not in _DET:
        import mediapipe as mp
        from mediapipe.tasks.python import vision, BaseOptions
        _DET['mp'] = mp
        _DET['d'] = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODELES + '/face_landmarker.task'), running_mode=vision.RunningMode.IMAGE,
            num_faces=1, min_face_detection_confidence=0.1, min_face_presence_confidence=0.1))
    return _DET['mp'], _DET['d']


def reperes(rgb, nez, rayon):
    """478 repères du visage autour du nez (fenêtre agrandie : les visages des planches font ≈ 100 px)."""
    mp, d = _detecteur(); H, W = rgb.shape[:2]
    x0, y0 = max(0, int(nez[0] - rayon)), max(0, int(nez[1] - rayon * 1.2)); x1, y1 = min(W, int(nez[0] + rayon)), min(H, int(nez[1] + rayon * 0.9))
    k = max(1.0, 640.0 / max(1, x1 - x0)); c = cv2.resize(rgb[y0:y1, x0:x1], None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
    r = d.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(c)))
    if not r.face_landmarks: return None
    return np.array([[p.x * c.shape[1] / k + x0, p.y * c.shape[0] / k + y0] for p in r.face_landmarks[0]], np.float32)


def _poly(L, idx): return np.array([L[i] for i in idx], np.float32)


def _mediane(rgb, masque):
    px = rgb[masque > 0]
    return [int(v) for v in np.median(px, 0)] if len(px) > 10 else [120, 60, 50]


# ── préparation (une fois par personnage, gardée en cache) ─────────────────────────────────────────────────────────────
def _oeil(rgb, L, haut, bas, peau):
    """ouverture réelle de l'œil d'un visage de dessin animé (les repères humains sont trop petits) : enveloppe convexe du
    BLANC de l'œil (clair, peu saturé) autour des repères, iris compris ; aucun blanc visible (yeux plissés du rire,
    lunettes noires) = pas de paupière à peindre."""
    U, D = _poly(L, haut), _poly(L, bas); pts = np.vstack([U, D[::-1]]); cx, cy = pts.mean(0)
    w = max(np.ptp(pts[:, 0]), 8.0); h = max(np.ptp(pts[:, 1]), w * 0.35)
    H, W = rgb.shape[:2]; x0, x1 = int(max(0, cx - w * 1.1)), int(min(W, cx + w * 1.1)); y0, y1 = int(max(0, cy - h * 1.8)), int(min(H, cy + h * 1.8))
    zone = rgb[y0:y1, x0:x1]; hsv = cv2.cvtColor(zone, cv2.COLOR_RGB2HSV)
    blanc = ((hsv[..., 2] > 165) & (hsv[..., 1] < 70)).astype(np.uint8)
    ell = np.zeros(blanc.shape, np.uint8); cv2.ellipse(ell, (int(cx - x0), int(cy - y0)), (int(w * 0.95), int(h * 1.5)), 0, 0, 360, 1, -1)
    vmed = float(np.median(hsv[..., 2][ell > 0]))
    blanc = (blanc | ((hsv[..., 2] > max(120, vmed * 1.25)) & (hsv[..., 1] < 90)).astype(np.uint8))   # blanc dans l'ombre (sourcils froncés)
    blanc &= ell; blanc = cv2.morphologyEx(blanc, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab_, st, _ = cv2.connectedComponentsWithStats(blanc)
    garde = [k for k in range(1, n) if st[k, cv2.CC_STAT_AREA] >= max(12, 0.04 * w * h)]
    m = np.zeros(blanc.shape, np.uint8)
    if garde:
        ys, xs = np.nonzero(np.isin(lab_, garde))
        cont = (pts - [cx, cy]) * 1.2 + [cx, cy] - [x0, y0]   # contour des repères agrandi (iris et coins compris)
        tous = np.vstack([np.stack([xs, ys], 1), cont]).astype(np.int32)
        hull = cv2.convexHull(tous); cv2.fillPoly(m, [hull], 1)
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    aire_blanc = int(sum(st[k, cv2.CC_STAT_AREA] for k in garde))
    sombre = float(cv2.cvtColor(zone, cv2.COLOR_RGB2GRAY)[ell > 0].mean())
    # couleur de paupière : peau juste au-dessus de l'ouverture, pixels proches de la peau du visage seulement (ni cils ni sourcils)
    col = list(peau)
    if m.any():
        ys, xs = np.nonzero(m); top = ys.min(); hh = max(4, ys.max() - top)
        band = zone[max(0, top - int(hh * 0.9)):max(1, top - int(hh * 0.25))]
        if band.size:
            lab = cv2.cvtColor(band, cv2.COLOR_RGB2LAB).astype(np.float32); pl = cv2.cvtColor(np.uint8([[peau]]), cv2.COLOR_RGB2LAB).astype(np.float32)[0, 0]
            ok = np.linalg.norm(lab - pl, axis=2) < 22
            if ok.sum() > 10: col = [int(v) for v in np.median(band[ok], 0)]
    return {'boite': [x0, y0], 'masque': m, 'paupiere': col, 'lunettes_noires': bool(sombre < 55 and aire_blanc < 0.05 * w * h),
            'visible': bool(aire_blanc >= 0.06 * w * h)}


def prepare_pose(rgba0, nez0):
    import compositeur, gestes
    a0 = rgba0[..., 3].astype(np.float32) / 255.0
    rgb0 = compositeur.etend_couleurs(rgba0[..., :3], a0).clip(0, 255).astype(np.uint8)
    H, W = rgb0.shape[:2]
    rgb = cv2.resize(rgb0, (W * ECH, H * ECH), interpolation=cv2.INTER_CUBIC)
    rgb = cv2.addWeighted(rgb, 1.35, cv2.GaussianBlur(rgb, (0, 0), 1.2), -0.35, 0)   # netteté rendue après l'agrandissement
    a = cv2.resize(a0, (W * ECH, H * ECH), interpolation=cv2.INTER_CUBIC).clip(0, 1)
    L = reperes(rgb, (nez0[0] * ECH, nez0[1] * ECH), 0.09 * H * ECH)
    if L is None: return None
    c = (L[61] + L[291]) / 2; mw = float(np.linalg.norm(L[291] - L[61]))
    # peau et lèvres (couleurs relevées sur la planche)
    ext = np.vstack([_poly(L, HAUT_EXT), _poly(L, BAS_EXT)])
    mb = np.zeros((H * ECH, W * ECH), np.uint8); cv2.fillPoly(mb, [np.round(ext).astype(np.int32)], 1)
    mh = np.zeros_like(mb); cv2.fillPoly(mh, [np.round(np.vstack([_poly(L, HAUT_EXT), _poly(L, HAUT_INT)[::-1]])).astype(np.int32)], 1)
    ml = np.zeros_like(mb); cv2.fillPoly(ml, [np.round(np.vstack([_poly(L, BAS_INT), _poly(L, BAS_EXT)[::-1]])).astype(np.int32)], 1)
    anneau = cv2.dilate(mb, np.ones((int(mw * 0.5) | 1,) * 2, np.uint8)) - cv2.dilate(mb, np.ones((int(mw * 0.2) | 1,) * 2, np.uint8))
    peau = _mediane(rgb, anneau & (a > 0.9))
    # la bouche d'origine est effacée une fois : lèvres + marge, et la place de la lèvre du bas quand la mâchoire s'ouvre
    trou = cv2.dilate(mb, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(mw * 0.26) | 1,) * 2))
    for coin in (L[61], L[291]):   # fossettes et ombres des coins du sourire d'origine
        cv2.circle(trou, (int(coin[0]), int(coin[1])), int(mw * 0.26), 1, -1)
    v = np.array([-(L[291] - L[61])[1], (L[291] - L[61])[0]], np.float32) / max(1e-6, mw)
    if v[1] < 0: v = -v
    bas = np.round(_poly(L, BAS_EXT) + v * mw * 0.42).astype(np.int32)
    cv2.fillPoly(trou, [np.vstack([np.round(_poly(L, BAS_EXT)).astype(np.int32), bas[::-1]])], 1)
    trou = cv2.dilate(trou, np.ones((5, 5), np.uint8)) & (a > 0.5).astype(np.uint8)
    cx, cy = int(c[0]), int(c[1]); x0, y0 = int(np.clip(cx - 256, 0, max(0, W * ECH - 512))), int(np.clip(cy - 256, 0, max(0, H * ECH - 512)))
    win = rgb[y0:y0 + 512, x0:x0 + 512].copy(); tw = trou[y0:y0 + 512, x0:x0 + 512]
    dehors = a[y0:y0 + 512, x0:x0 + 512] < 0.5; win[dehors] = peau   # LaMa ne voit que la figure (pas le fond vert de la planche)
    rempli = gestes.remplit(win, tw) if win.shape[:2] == (512, 512) else cv2.inpaint(win, tw, 7, cv2.INPAINT_TELEA)
    sans = rgb.copy(); sans[y0:y0 + 512, x0:x0 + 512][tw > 0] = rempli[tw > 0]
    yeux = [_oeil(rgb, L, h_, b_, peau) for h_, b_ in YEUX]
    paup = [oe['paupiere'] for oe in yeux]
    # PAUPIÈRES FERMÉES : chaque ouverture d'œil (blanc, iris, cils du haut) effacée une fois par LaMa — la peau reconstituée
    # garde le modelé de la planche ; le clignement la dévoile de haut en bas, avec un trait de cils au bord.
    trou_y = np.zeros_like(mb)
    for oe in yeux:
        if not oe['visible'] or oe['lunettes_noires']: continue
        m_ = oe['masque']; bx, by = oe['boite']; hh_ = max(4, np.ptp(np.nonzero(m_)[0]))
        g = cv2.dilate(m_, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        g = np.maximum(g, np.roll(g, -int(hh_ * 0.18), axis=0))   # les cils du haut, au-dessus du blanc
        trou_y[by:by + g.shape[0], bx:bx + g.shape[1]] |= g
    ferme = rgb.copy()
    if trou_y.any():
        # les cils (pixels sombres reliés à l'œil) entrent dans le trou : la peau est diffusée depuis la seule peau voisine
        g = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32); pl = cv2.cvtColor(np.uint8([[peau]]), cv2.COLOR_RGB2LAB).astype(np.float32)[0, 0]
        pas_peau = (np.linalg.norm(g - pl, axis=2) > 30).astype(np.uint8)
        zone = cv2.dilate(trou_y, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
        n_, lab_ = cv2.connectedComponents((pas_peau & zone) | trou_y)
        lies = np.isin(lab_, np.unique(lab_[trou_y > 0])) & (lab_ > 0)
        trou_f = cv2.dilate(lies.astype(np.uint8), np.ones((5, 5), np.uint8))
        src = rgb.copy(); src[a < 0.5] = peau   # le fond de la planche n'entre pas dans la diffusion
        ferme = cv2.inpaint(src, trou_f, 9, cv2.INPAINT_TELEA)
        ferme = cv2.GaussianBlur(ferme, (0, 0), 1.5) * (trou_f[..., None] > 0) + rgb * (trou_f[..., None] == 0)
        ferme = ferme.astype(np.uint8)
    ys, xs = np.nonzero(a > 0.5); bas_y = int(ys.max()); pied_x = float(xs[ys > bas_y - 0.03 * H * ECH].mean())
    r_ = (L[1, 0] - L[33, 0]) / max(1e-6, L[263, 0] - L[33, 0]); lacet = float(np.degrees(np.arctan(1.8 * (r_ - 0.5))))
    menton = L[152]; front = L[10]
    ouverte = float(np.linalg.norm(L[13] - L[14])) > 0.12 * mw   # la planche montre déjà la bouche ouverte (rire) : on la garde
    return {'rgb': rgb, 'a': a, 'sans': sans, 'trou': trou, 'ferme': ferme, 'L': L, 'mw': mw, 'peau': peau, 'levre_h': _mediane(rgb, mh), 'levre_b': _mediane(rgb, ml),
            'yeux': yeux, 'paupieres': paup, 'pied': [pied_x, bas_y], 'lacet': lacet, 'parle': not ouverte,
            'tete': [float(L[:, 0].min()), float(front[1] - 0.45 * (menton[1] - front[1])), float(L[:, 0].max()), float(menton[1])]}


def _ecrit(f, im):
    if not cv2.imwrite(f, im): raise IOError(f'écriture impossible (disque plein ?) : {f}')


def prepare(nom, force=False):
    d = f'{CACHE}/{nom}'; meta_f = f'{d}/marionnette.json'
    if os.path.isfile(meta_f) and not force: return charge(nom)
    os.makedirs(d, exist_ok=True); J = json.load(open(f'{POSES}/{nom}/poses.json')); meta = {'nom': nom, 'ech': ECH, 'poses': {}}
    for i, p in enumerate(J['poses']):
        rgba = cv2.cvtColor(cv2.imread(f"{POSES}/{nom}/{p['fichier']}", cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA)
        H, W = rgba.shape[:2]; b = p['body']['0']; P_ = prepare_pose(rgba, (b[0] * W, b[1] * H))
        nomp = p.get('nom_propose') or POSE_NOMS[i]
        if P_ is None: print(f'{nom} {nomp} : visage non lu, pose écartée'); continue
        _ecrit(f'{d}/{nomp}.png', cv2.cvtColor(np.dstack([P_['rgb'], (P_['a'] * 255).astype(np.uint8)]), cv2.COLOR_RGBA2BGRA))
        _ecrit(f'{d}/{nomp}-sans-bouche.png', cv2.cvtColor(P_['sans'], cv2.COLOR_RGB2BGR)); _ecrit(f'{d}/{nomp}-trou.png', P_['trou'] * 255)
        for k, oe in enumerate(P_['yeux']): _ecrit(f'{d}/{nomp}-oeil{k}.png', oe['masque'] * 255)
        _ecrit(f'{d}/{nomp}-yeux-fermes.png', cv2.cvtColor(P_['ferme'], cv2.COLOR_RGB2BGR))
        meta['poses'][nomp] = {k: v for k, v in P_.items() if k not in ('rgb', 'a', 'sans', 'trou', 'yeux', 'ferme')} | {
            'L': P_['L'].round(2).tolist(), 'yeux': [{'boite': oe['boite'], 'lunettes_noires': oe['lunettes_noires'], 'visible': oe['visible']} for oe in P_['yeux']]}
    json.dump(meta, open(meta_f, 'w'))
    return charge(nom)


def charge(nom):
    d = f'{CACHE}/{nom}'; meta = json.load(open(f'{d}/marionnette.json'))
    for nomp, m in meta['poses'].items():
        m['nom_pose'] = nomp
        im = cv2.cvtColor(cv2.imread(f'{d}/{nomp}.png', cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA)
        m['rgb'] = im[..., :3]; m['a'] = im[..., 3].astype(np.float32) / 255.0
        m['ferme'] = cv2.cvtColor(cv2.imread(f'{d}/{nomp}-yeux-fermes.png'), cv2.COLOR_BGR2RGB)
        m['sans'] = cv2.cvtColor(cv2.imread(f'{d}/{nomp}-sans-bouche.png'), cv2.COLOR_BGR2RGB); m['trou'] = cv2.imread(f'{d}/{nomp}-trou.png', 0) > 0
        m['L'] = np.array(m['L'], np.float32); L_ = m['L']
        # crâne (taille du personnage, sans foulard ni coiffure) et haut réel de la coiffure (cadrage)
        m['crane'] = float(L_[10][1] - 0.28 * (L_[152][1] - L_[10][1]))
        x0, x1 = int(L_[:, 0].min()), int(L_[:, 0].max()) + 1; col = m['a'][:int(L_[152][1]), max(0, x0):x1] > 0.5
        rows = np.nonzero(col.any(1))[0]; m['coiffe'] = float(rows.min()) if len(rows) else m['crane']
        m['tete'] = [float(L_[:, 0].min()), min(m['coiffe'], m['crane']), float(L_[:, 0].max()), float(L_[152][1])]
        for k, oe in enumerate(m['yeux']): oe['masque'] = cv2.imread(f'{d}/{nomp}-oeil{k}.png', 0) > 0
    return meta


# ── bouche repeinte ──────────────────────────────────────────────────────────────────────────────────────────────────
def _rvb(c, a=255): return skia.Color(int(c[0]), int(c[1]), int(c[2]), int(a))


def _chemin(pts, ferme=True):
    p = skia.Path(); p.moveTo(*map(float, pts[0]))
    for i in range(1, len(pts) - 1):   # courbe lissée passant par les milieux (pas d'angles de polygone)
        m = (pts[i] + pts[i + 1]) / 2; p.quadTo(float(pts[i][0]), float(pts[i][1]), float(m[0]), float(m[1]))
    p.lineTo(*map(float, pts[-1]))
    if ferme: p.close()
    return p


def melange(v0, v1, b):
    """paramètres de bouche entre deux visèmes (0 → v0, 1 → v1) : la bouche dessinée par paramètres passe d'une forme à
    l'autre comme la parole réelle (coarticulation), ce qu'une feuille de bouches figées ne peut pas faire."""
    a, c = VISEMES.get(v0, VISEMES['X']), VISEMES.get(v1, VISEMES['X']); b = float(np.clip(b, 0, 1))
    return tuple(a[i] * (1 - b) + c[i] * b for i in range(3)) + (c[3:] if b >= 0.5 else a[3:])


def geometrie_bouche(P, vis, k=1.0, params=None):
    """anneaux des lèvres déplacés pour le visème (ou des paramètres mélangés), dans le repère de la bouche."""
    L = P['L']; o, lw, rd, dents, fv, langue = params if params is not None else VISEMES.get(vis, VISEMES['X']); o *= k
    c = (L[61] + L[291]) / 2; mw = P['mw']; u = (L[291] - L[61]) / mw; v = np.array([-u[1], u[0]], np.float32)
    if v[1] < 0: v = -v
    h = o * mw; wf = 0.86 + 0.24 * lw - 0.32 * rd

    def bouge(idx, dt_haut, dt_bas):
        out = []
        for i in idx:
            q = L[i] - c; s, t = float(q @ u) / (mw / 2), float(q @ v)
            b = max(0.0, 1 - min(1.0, abs(s)) ** 2) ** (0.75 - 0.4 * rd)
            s2 = s * wf * (1 - 0.18 * rd * abs(s)); t2 = t - dt_haut * h * b + dt_bas * h * b
            out.append(c + u * s2 * mw / 2 + v * t2)
        return np.array(out, np.float32)
    return {'he': bouge(HAUT_EXT, 0.26, 0), 'hi': bouge(HAUT_INT, 0.30, 0), 'bi': bouge(BAS_INT, 0, 0.70), 'be': bouge(BAS_EXT, 0, 0.66),
            'h': h, 'mw': mw, 'u': u, 'v': v, 'dents': dents, 'fv': fv, 'langue': langue, 'o': o}


def peint_bouche(P, vis, k=1.0, boite=None, params=None):
    """→ (x0, y0, RGB, alpha) : le visage sans bouche + la bouche du visème, à coller sur la pose."""
    G = geometrie_bouche(P, vis, k, params); mw = G['mw']; tr = P['trou']
    ys, xs = np.nonzero(tr); x0, y0, x1, y1 = int(xs.min()) - 6, int(ys.min()) - 6, int(xs.max()) + 7, int(ys.max()) + 7
    H, W = tr.shape; x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    base = P['sans'][y0:y1, x0:x1]; w, h = x1 - x0, y1 - y0
    s = skia.Surface(w, h); cv = s.getCanvas()
    cv.drawImage(skia.Image.fromarray(np.dstack([base, np.full(base.shape[:2], 255, np.uint8)]).copy(), colorType=skia.ColorType.kRGBA_8888_ColorType), 0, 0)
    cv.translate(-x0, -y0)
    peau = np.array(P['peau'], np.float32); lh = np.array(P['levre_h'], np.float32); lb = np.array(P['levre_b'], np.float32)
    flou = lambda r: skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, max(0.3, r))
    he, hi, bi, be = G['he'], G['hi'], G['bi'], G['be']
    # ombre portée de la lèvre du bas sur le menton
    om = _chemin(np.vstack([be, be[::-1] + G['v'] * mw * 0.10]))
    cv.drawPath(om, skia.Paint(AntiAlias=True, Color=_rvb(peau * 0.62, 90), MaskFilter=flou(mw * 0.05)))
    if G['o'] > 0.015:
        inter = _chemin(np.vstack([hi, bi]))   # intérieur : de coin à coin par le haut, retour par le bas
        haut_y = float(min(p @ G['v'] for p in hi)); bas_y = float(max(p @ G['v'] for p in bi))
        c0 = (hi[0] + hi[-1]) / 2
        sh = skia.GradientShader.MakeLinear([skia.Point(*map(float, c0 + G['v'] * (haut_y - c0 @ G['v']))), skia.Point(*map(float, c0 + G['v'] * (bas_y - c0 @ G['v'])))],
                                            [_rvb((96, 32, 36)), _rvb((42, 12, 16))])
        cv.drawPath(inter, skia.Paint(AntiAlias=True, Shader=sh))
        cv.save(); cv.clipPath(inter, skia.ClipOp.kIntersect, True)
        n = len(hi) // 2; top = hi[n]
        if G['dents'] or G['fv']:   # rangée de dents du haut, ombrée vers le bas
            dh = min(G['h'] * (0.42 if not G['fv'] else 0.9), mw * 0.13)
            dp = _chemin(np.vstack([hi + G['v'] * 0.0, (hi + G['v'] * dh)[::-1]]))
            sd = skia.GradientShader.MakeLinear([skia.Point(*map(float, top)), skia.Point(*map(float, top + G['v'] * dh))],
                                                [_rvb((250, 247, 240)), _rvb((212, 204, 196))])
            cv.drawPath(dp, skia.Paint(AntiAlias=True, Shader=sd))
        if G['o'] > 0.25:   # dents du bas sur les grandes ouvertures
            bp = _chemin(np.vstack([bi[::-1] - G['v'] * mw * 0.05, bi]))
            cv.drawPath(bp, skia.Paint(AntiAlias=True, Color=_rvb((226, 218, 210))))
        if G['langue'] or G['o'] > 0.2:
            cl = bi[len(bi) // 2] - G['v'] * G['h'] * 0.18; rw, rh = mw * 0.26, max(2.0, G['h'] * 0.30)
            cv.drawOval(skia.Rect.MakeLTRB(cl[0] - rw, cl[1] - rh, cl[0] + rw, cl[1] + rh), skia.Paint(AntiAlias=True, Color=_rvb((196, 86, 96))))
        cv.restore()
    # lèvres : haut plus sombre, bas plus clair avec un reflet ; coins marqués d'une ombre douce
    cv.drawPath(_chemin(np.vstack([he, hi[::-1]])), skia.Paint(AntiAlias=True, Color=_rvb(lh)))
    cv.drawPath(_chemin(np.vstack([bi, be[::-1]])), skia.Paint(AntiAlias=True, Color=_rvb(lb)))
    rf = (bi[len(bi) // 2] + be[len(be) // 2]) / 2 - G['v'] * mw * 0.01
    cv.drawOval(skia.Rect.MakeLTRB(rf[0] - mw * 0.14, rf[1] - mw * 0.035, rf[0] + mw * 0.14, rf[1] + mw * 0.035),
                skia.Paint(AntiAlias=True, Color=_rvb(np.minimum(255, lb * 1.25 + 25), 110), MaskFilter=flou(mw * 0.03)))
    for coin in (he[0], he[-1]):
        cv.drawCircle(float(coin[0]), float(coin[1]), mw * 0.035, skia.Paint(AntiAlias=True, Color=_rvb(peau * 0.55, 120), MaskFilter=flou(mw * 0.025)))
    if G['o'] > 0.015 or vis != 'X':   # fente entre les lèvres
        cv.drawPath(_chemin(hi, ferme=False), skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=max(1.0, mw * 0.018),
                                                       Color=_rvb(lh * 0.45, 200), MaskFilter=flou(mw * 0.006)))
    out = s.makeImageSnapshot().toarray(colorType=skia.ColorType.kRGBA_8888_ColorType)[..., :3]
    al = cv2.GaussianBlur(tr[y0:y1, x0:x1].astype(np.float32), (0, 0), 2.0)
    return x0, y0, out, al


def peint_paupieres(P, k):
    """paupières fermées à k (0 ouvert … 1 fermé) : la peau reconstituée (œil effacé) est dévoilée du haut de l'ouverture
    jusqu'au bord de la paupière, qui porte un trait de cils effilé → [(x0, y0, RGB, alpha)]."""
    res = []
    if k <= 0.02: return res
    for oe in P['yeux']:
        if oe['lunettes_noires'] or not oe.get('visible', True): continue
        m = oe['masque'].astype(np.uint8); x0, y0 = oe['boite']; h, w = m.shape
        cols = np.nonzero(m.any(0))[0]
        if len(cols) < 3: continue
        haut = np.array([np.nonzero(m[:, x])[0].min() for x in cols], np.float32); bas = np.array([np.nonzero(m[:, x])[0].max() for x in cols], np.float32)
        hmax = float((bas - haut).max()); haut_l = haut - 0.45 * hmax
        bord = haut + (bas - haut) * min(1.0, k) + 0.12 * hmax * max(0.0, k - 0.8) / 0.2   # fermé : sous le bas du blanc
        yy = np.arange(h, dtype=np.float32)[:, None]; B = np.full(w, -1e3, np.float32); T = np.full(w, 1e3, np.float32)
        B[cols] = bord; T[cols] = haut_l
        al = np.clip(B[None, :] - yy + 0.5, 0, 1) * np.clip(yy - T[None, :] + 1.5, 0, 1)
        zone_ = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(hmax * 0.5) | 1,) * 2))
        al = np.maximum(al * (zone_ > 0), 0)
        al = cv2.GaussianBlur(al.astype(np.float32), (0, 0), 0.7)
        img = P['ferme'][y0:y0 + h, x0:x0 + w].astype(np.float32).copy()
        # trait de cils au bord, plus épais au milieu, ombre douce dessous
        s_ = skia.Surface(w, h); c = s_.getCanvas(); c.clear(skia.ColorTRANSPARENT)
        pts = np.stack([cols.astype(np.float32), bord], 1)[::2]; n = len(pts); ep = max(1.5, hmax * (0.10 + 0.08 * min(1.0, k)))
        haut_p, bas_p = [], []
        for i, (x, y) in enumerate(pts):
            t = i / max(1, n - 1); e = ep * (0.25 + 0.75 * math.sin(math.pi * t))
            haut_p.append((x, y - e * 0.5)); bas_p.append((x, y + e * 0.5))
        trait = _chemin(np.array(haut_p + bas_p[::-1], np.float32))
        c.drawPath(trait, skia.Paint(AntiAlias=True, Color=skia.Color(26, 16, 14, 235)))
        tr = s_.makeImageSnapshot().toarray(colorType=skia.ColorType.kRGBA_8888_ColorType).astype(np.float32)
        ta = tr[..., 3:4] / 255.0; img = img * (1 - ta) + tr[..., :3] * ta
        res.append((x0, y0, img.clip(0, 255).astype(np.uint8), np.maximum(al, ta[..., 0]).clip(0, 1)))
    return res


def colle(dst, x0, y0, img, al):
    h, w = al.shape; H, W = dst.shape[:2]
    X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(W, x0 + w), min(H, y0 + h)
    if X1 <= X0 or Y1 <= Y0: return
    a = al[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0, None]
    dst[Y0:Y1, X0:X1] = (dst[Y0:Y1, X0:X1] * (1 - a) + img[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0] * a).astype(dst.dtype)


def figure(P, vis='X', k=1.0, cligne=0.0):
    """image RGB + alpha de la pose avec la bouche du visème et les paupières (bouche d'origine au repos)."""
    rgb = P['rgb'].copy()
    if (vis != 'X' or k < 1.0) and P.get('parle', True):
        x0, y0, im, al = peint_bouche(P, vis, k); colle(rgb, x0, y0, im, al)
    if P.get('nom_pose') != 'choc':   # yeux écarquillés du choc : pas de clignement
        for x0, y0, im, al in peint_paupieres(P, cligne): colle(rgb, x0, y0, im, al)
    return rgb, P['a']


def planche(nom, sortie):
    M_ = prepare(nom); rangs = []
    for nomp, P in M_['poses'].items():
        tb = P['tete']; x0, y0, x1, y1 = int(tb[0]) - 20, int(tb[1]) - 10, int(tb[2]) + 20, int(tb[3]) + 30
        cases = []
        for vis, cl in [('X', 0), ('A', 0), ('B', 0), ('C', 0), ('D', 0), ('E', 0), ('F', 0), ('G', 0), ('H', 0), ('X', 0.5), ('X', 1.0)]:
            rgb, a = figure(P, vis, 1.0, cl); c = (rgb[max(0, y0):y1, max(0, x0):x1] * a[max(0, y0):y1, max(0, x0):x1, None] + 200 * (1 - a[max(0, y0):y1, max(0, x0):x1, None])).astype(np.uint8)
            c = cv2.resize(c, (180, int(180 * c.shape[0] / c.shape[1])))
            cv2.putText(c, f'{vis}{" cligne" if cl else ""}', (4, 16), 0, 0.5, (255, 255, 255), 2); cases.append(c)
        hmax = max(c.shape[0] for c in cases); rangs.append(np.hstack([cv2.copyMakeBorder(c, 0, hmax - c.shape[0], 0, 0, 0) for c in cases]))
    W_ = max(r.shape[1] for r in rangs)
    cv2.imwrite(sortie, cv2.cvtColor(np.vstack([cv2.copyMakeBorder(r, 0, 0, 0, W_ - r.shape[1], 0) for r in rangs]), cv2.COLOR_RGB2BGR))


if __name__ == '__main__':
    if sys.argv[1] == 'prepare':
        for n in sys.argv[2:]: prepare(n, force=True); print(n, 'prêt')
    elif sys.argv[1] == 'planche': planche(sys.argv[2], sys.argv[3])
