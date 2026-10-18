# SQUELETTE 2D DE LA TÊTE AUX PIEDS — v3 (17/10/2026). Demande : « une parfaite maîtrise de tous les mouvements du corps
# humain, de la tête aux pieds » ; « je vois encore beaucoup d'étirements » ; « l'homme en bleu bouge avec le linge ».
# Mesuré sur v22 : la déformation par champs (buste plié selon la hauteur, tête tournée au-dessus du cou, corps glissé)
# étirait les personnages de 6 à 15 % (médiane du 99e centile), pliait les bras avec le buste et faisait glisser les pieds.
#
# Méthode (publiée, réécrite) :
#   · os rigides posés sur les 33 repères MediaPipe Pose : buste, tête, bras, avant-bras, mains, cuisses, tibias, pieds ;
#   · grille régulière sur la découpe ; chaque sommet appartient à un os (distance au segment de l'os ; visage et cheveux
#     → tête, par la segmentation) ; le CŒUR de chaque os est rigide (exactement sa transformation) ;
#   · près des articulations et le long des contacts (main posée sur la cuisse), les sommets sont LIBRES : leur position
#     minimise l'énergie « aussi rigide que possible » (ARAP : Igarashi, Moscovich, Hughes 2005 ; forme locale/globale de
#     Liu, Zhang, Xu, Gotsman, Gortler 2008), comme dans Animated Drawings (Meta, MIT) — la flexion se répartit sur toute
#     la bande au lieu de se concentrer en un pli ;
#   · pieds plantés : quand le bassin bouge, les jambes suivent par cinématique inverse à deux os ; une robe (pas d'espace
#     entre les genoux) est une jupe souple tenue par la taille et les pieds ;
#   · mains en appui (sur la cuisse, sur la table) : elles restent posées, le bras suit par cinématique inverse ;
#   · tête en 3D : rotation (lacet, tangage) d'un relief de tête (ellipsoïde + relief du visage lu par Face Landmarker),
#     projetée — c'est le paramètre « Angle X / Angle Y » de Live2D, obtenu sans dessiner de déformeurs ;
#   · rendu : champ de déplacement de la grille (bilinéaire, exact sur les parties rigides), inversé par point fixe,
#     échantillonnage bicubique de l'image ; l'étirement (valeurs singulières de la jacobienne) est mesurable à chaque image.
#   preparer(img, masque, pts, bbox, ...) → R ; rendre(R, pose, src, alpha) → (boîte, rgb, alpha) ; enveloppe(R) → limites
import math
import numpy as np, cv2
from scipy import ndimage, sparse
from scipy.spatial import cKDTree
from scipy.sparse.linalg import splu


def _mid(a, b): return (np.asarray(a, np.float64) + np.asarray(b, np.float64)) / 2


def completer(pts, bbox):
    """repères illisibles (visibilité < 0,3 ou (0, 0)) reconstruits par la morphologie : yeux et oreilles depuis le nez et
    la largeur d'épaules, chevilles et pieds depuis les genoux et le bas de la découpe (Baye : barbe et position assise)."""
    p = np.array(pts, np.float64); p = np.c_[p, np.ones(len(p))] if p.shape[1] < 3 else p
    bad = lambda i: p[i, 2] < 0.3 or (abs(p[i, 0]) < 1 and abs(p[i, 1]) < 1)
    sh = p[11, :2] - p[12, :2]; sw = max(8.0, float(np.hypot(*sh))); cote = np.sign(sh[0]) or 1.0
    nez = p[0, :2]
    for i, sgn in ((2, 1), (5, -1)):
        if bad(i): p[i, :2] = nez + [cote * sgn * 0.17 * sw, -0.07 * sw]; p[i, 2] = 0.5
    for i, j, sgn in ((7, 2, 1), (8, 5, -1)):
        if bad(i): p[i, :2] = p[j, :2] + [cote * sgn * 0.16 * sw, 0.02 * sw]; p[i, 2] = 0.5
    bas = float(bbox[3])
    for kn, an, ft in ((25, 27, 31), (26, 28, 32)):
        if bad(an): p[an, :2] = [p[kn, 0], min(bas - 0.04 * sw, p[kn, 1] + 0.85 * max(0.0, bas - p[kn, 1]))]; p[an, 2] = 0.5
        if bad(ft): p[ft, :2] = [p[an, 0] + 0.05 * sw * cote, min(bas, p[an, 1] + 0.12 * sw)]; p[ft, 2] = 0.5
    return p


def modele(pts, bbox=None):
    """os au repos depuis les 33 repères (x, y en pixels de la scène)."""
    if bbox is not None: pts = completer(pts, bbox)
    p = np.asarray(pts, np.float64)[:, :2]; P = {}
    nom = dict(nose=0, lEye=2, rEye=5, lEar=7, rEar=8, lSh=11, rSh=12, lEl=13, rEl=14, lWr=15, rWr=16, lHand=19, rHand=20,
               lHip=23, rHip=24, lKn=25, rKn=26, lAn=27, rAn=28, lFoot=31, rFoot=32)
    for k, i in nom.items(): P[k] = p[i].copy()
    neck = _mid(P['lSh'], P['rSh']); pelvis = _mid(P['lHip'], P['rHip']); eyeC = _mid(P['lEye'], P['rEye'])
    eyeD = max(np.linalg.norm(P['lEye'] - P['rEye']), 1e-4); headW = max(eyeD * 2.3, np.linalg.norm(P['lEar'] - P['rEar']) * 1.15)
    up = eyeC - neck; upL = max(1e-4, np.linalg.norm(up)); headTop = eyeC + up / upL * headW * 0.62
    for s in 'lr':
        wr, el, hand = P[s + 'Wr'], P[s + 'El'], P[s + 'Hand']; fore = wr - el
        if np.linalg.norm(hand - wr) < np.linalg.norm(fore) * 0.12 or np.linalg.norm(hand - wr) > np.linalg.norm(fore) * 0.8:
            P[s + 'Hand'] = wr + fore * 0.35
        an, kn = P[s + 'An'], P[s + 'Kn']
        if np.linalg.norm(P[s + 'Foot'] - an) > np.linalg.norm(an - kn) * 0.7: P[s + 'Foot'] = an + (an - kn) * 0.15
        if np.linalg.norm(P[s + 'Foot'] - an) < 2: P[s + 'Foot'] = an + np.array([0.0, 0.06 * np.linalg.norm(an - kn) + 2])
    feet = _mid(P['lAn'], P['rAn']); chin = neck + (eyeC - neck) * 0.45
    P.update(neck=neck, pelvis=pelvis, headTop=headTop, feet=feet, eyeC=eyeC, chin=chin)
    sw = np.linalg.norm(P['lSh'] - P['rSh']); hw = np.linalg.norm(P['lHip'] - P['rHip']); torsoR = 0.33 * max(sw, hw * 1.1)
    os_ = [dict(id='torso', parent=None, pivot=pelvis, path=[pelvis, neck], r=torsoR),
           dict(id='head', parent='torso', pivot=neck, path=[chin, headTop], r=headW * 0.42)]
    for s in 'lr':
        os_ += [dict(id=s + 'Up', parent='torso', pivot=P[s + 'Sh'], path=[P[s + 'Sh'], P[s + 'El']], r=0.0, bras=True),
                dict(id=s + 'Lo', parent=s + 'Up', pivot=P[s + 'El'], path=[P[s + 'El'], P[s + 'Wr']], r=0.0, bras=True),
                dict(id=s + 'Main', parent=s + 'Lo', pivot=P[s + 'Wr'], path=[P[s + 'Wr'], P[s + 'Hand']], r=0.0, bras=True),
                dict(id=s + 'Th', parent=None, pivot=P[s + 'Hip'], path=[P[s + 'Hip'], P[s + 'Kn']], r=0.0, jambe=True),
                dict(id=s + 'Shin', parent=s + 'Th', pivot=P[s + 'Kn'], path=[P[s + 'Kn'], P[s + 'An']], r=0.0, jambe=True),
                dict(id=s + 'Pied', parent=s + 'Shin', pivot=P[s + 'An'], path=[P[s + 'An'], P[s + 'Foot']], r=0.0, pied=True)]
    height = max(1e-4, max(feet[1], P['lFoot'][1], P['rFoot'][1]) - headTop[1])
    idx = {b['id']: i for i, b in enumerate(os_)}
    return dict(P=P, os=os_, height=height, idx=idx, headW=headW, sw=sw, hw=hw)


def _lies(M):
    """paires d'os liés par une articulation → point de l'articulation et rayon de la bande souple autour."""
    P = M['P']; I = M['idx']; L = {}
    nrm = lambda a, b: float(np.linalg.norm(P[a] - P[b]))
    def add(a, b, J, r): L[(I[a], I[b])] = L[(I[b], I[a])] = (np.asarray(J, np.float64), max(r, 6.0))
    add('torso', 'head', P['neck'], 0.33 * float(np.linalg.norm(P['neck'] - P['pelvis'])))
    hw = max(M['hw'], 0.5 * M['sw'])
    for s in 'lr':
        add('torso', s + 'Up', P[s + 'Sh'], 0.40 * nrm(s + 'Sh', s + 'El'))
        add(s + 'Up', s + 'Lo', P[s + 'El'], 0.32 * nrm(s + 'El', s + 'Wr'))
        add(s + 'Lo', s + 'Main', P[s + 'Wr'], 0.70 * nrm(s + 'Wr', s + 'Hand'))
        add('torso', s + 'Th', P[s + 'Hip'], 0.60 * hw)
        add(s + 'Th', s + 'Shin', P[s + 'Kn'], 0.30 * nrm(s + 'Kn', s + 'An'))
        add(s + 'Shin', s + 'Pied', P[s + 'An'], 0.80 * nrm(s + 'An', s + 'Foot'))
    add('lTh', 'rTh', P['pelvis'], 0.60 * hw)
    return L


def _dist_chemin(X, Y, path):
    d = np.full(X.shape, np.inf)
    for a, b in zip(path[:-1], path[1:]):
        v = b - a; L2 = float(v @ v)
        t = np.clip(((X - a[0]) * v[0] + (Y - a[1]) * v[1]) / L2, 0, 1) if L2 else np.zeros_like(X)
        d = np.minimum(d, np.hypot(X - a[0] - v[0] * t, Y - a[1] - v[1] * t))
    return d


def sous_menton(M, X, Y):
    """points sous la ligne du menton (le cou), le long de l'axe cou → sommet du crâne."""
    P = M['P']; v = P['headTop'] - P['neck']; L2 = float(v @ v) or 1.0
    tc = float((P['chin'] - P['neck']) @ v) / L2
    return ((X - P['neck'][0]) * v[0] + (Y - P['neck'][1]) * v[1]) / L2 < tc


def _bandes(M, X, Y, own, tete_g, L):
    """sommets LIBRES (bandes souples) : la flexion d'une articulation se répartit sur une bande assez large pour rester
    sous quelques % d'étirement — bas du buste et haut des cuisses (bassin), haut du buste et cou (tête, épaules),
    disques autour des coudes, poignets, genoux, chevilles."""
    P = M['P']; I = M['idx']; libre = np.zeros(X.shape, bool)
    pv, nk = P['pelvis'], P['neck']; Lt = max(1e-6, float(np.linalg.norm(nk - pv))); u = (nk - pv) / Lt
    t = ((X - pv[0]) * u[0] + (Y - pv[1]) * u[1]) / Lt
    tor = own == I['torso']
    libre |= tor & (t < 0.45)                 # taille et bassin : la flexion du buste se répartit sur le bas du dos
    libre |= tor & (t > 0.72)                 # épaules et base du cou : la tête et les épaules bougent sans pli
    libre |= (own == I['head']) & sous_menton(M, X, Y)   # le cou
    d = lambda p: np.hypot(X - p[0], Y - p[1]); n = lambda a, b: float(np.linalg.norm(P[a] - P[b]))
    for s in 'lr':
        libre |= (own == I[s + 'Up']) & (d(P[s + 'Sh']) < 0.45 * n(s + 'Sh', s + 'El'))
        for o in (s + 'Up', s + 'Lo'): libre |= (own == I[o]) & (d(P[s + 'El']) < 0.35 * n(s + 'El', s + 'Wr'))
        for o in (s + 'Lo', s + 'Main'): libre |= (own == I[o]) & (d(P[s + 'Wr']) < 0.7 * n(s + 'Wr', s + 'Hand'))
        libre |= (own == I[s + 'Th']) & (d(P[s + 'Hip']) < 0.45 * n(s + 'Hip', s + 'Kn'))
        for o in (s + 'Th', s + 'Shin'): libre |= (own == I[o]) & (d(P[s + 'Kn']) < 0.35 * n(s + 'Kn', s + 'An'))
        for o in (s + 'Shin', s + 'Pied'): libre |= (own == I[o]) & (d(P[s + 'An']) < 0.8 * n(s + 'An', s + 'Foot'))
    return libre


def possession(M, X, Y):
    """os propriétaire de chaque point (le plus proche, bras limités à leur portée) et distances."""
    portee = M['height'] * 0.075; S = []
    for b in M['os']:
        d = _dist_chemin(X, Y, b['path'])
        if b.get('bras'): d = np.where(d > portee, np.inf, d)
        S.append(np.maximum(0, d - b['r']))
    S = np.stack(S, -1); return np.argmin(S, -1), S


def _separe_meuble(img, pers, meuble, personne, box, marge=40):
    """là où la segmentation « personne » (MediaPipe) et ADE20K se contredisent (personne pour l'une, meuble pour l'autre),
    la couleur tranche : GrabCut (Rother, Kolmogorov, Blake 2004 ; OpenCV) sur chaque zone de conflit et ses abords
    (modèles de couleur LOCAUX : la barbe blanche, loin, ne vote pas pour l'accoudoir blanc), graines sûres prises aux deux
    segmentations — la chaise va au décor, le boubou reste à Baye (vu le 17/10 : la règle seule emportait son bras).
    → booléen « pas lui » (meuble) à la taille de l'image."""
    H, W = img.shape[:2]; x0, y0, x1, y1 = [int(v) for v in box]
    conflit = np.zeros((H, W), bool)
    conflit[y0:y1, x0:x1] = ((pers > 0.5) & (meuble > 0.5) & (personne < 0.5))[y0:y1, x0:x1]
    out = np.zeros((H, W), bool)
    if conflit.sum() < 50: return out
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(conflit.astype(np.uint8), np.ones((15, 15), np.uint8)))
    bgr = img[..., ::-1]
    for i in range(1, n):
        cx, cy, cw, ch, _a = st[i]
        a0, b0, a1, b1 = max(0, cx - marge), max(0, cy - marge), min(W, cx + cw + marge), min(H, cy + ch + marge)
        p, mb, pe = pers[b0:b1, a0:a1], meuble[b0:b1, a0:a1], personne[b0:b1, a0:a1]
        cf = conflit[b0:b1, a0:a1] & (lab[b0:b1, a0:a1] == i)
        if cf.sum() < 50: continue
        gc = np.full(p.shape, cv2.GC_PR_BGD, np.uint8)
        gc[p > 0.5] = cv2.GC_PR_FGD
        gc[(p > 0.8) & (pe > 0.5) & ~cf] = cv2.GC_FGD
        gc[p < 0.15] = cv2.GC_BGD
        gc[(mb > 0.8) & (pe < 0.1) & (p < 0.5)] = cv2.GC_BGD
        if not ((gc == cv2.GC_FGD).any() and (gc == cv2.GC_BGD).any()): continue
        # départ des pixels en conflit : du côté de la graine sûre la plus proche en couleur (Lab) — sinon GrabCut apprend
        # la couleur de l'accoudoir dans le modèle « personne » et l'y garde
        lab_ = cv2.cvtColor(np.ascontiguousarray(img[b0:b1, a0:a1]), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
        rng = np.random.default_rng(0); g_ = gc.reshape(-1)
        tire = lambda m: lab_[rng.choice(np.flatnonzero(m), min(3000, int(m.sum())), replace=False)]
        dF = cKDTree(tire(g_ == cv2.GC_FGD)).query(lab_[cf.reshape(-1)])[0]
        dB = cKDTree(tire(g_ == cv2.GC_BGD)).query(lab_[cf.reshape(-1)])[0]
        gc[cf] = np.where(dB < dF, cv2.GC_PR_BGD, cv2.GC_PR_FGD)
        bg = np.zeros((1, 65), np.float64); fg = np.zeros((1, 65), np.float64)
        cv2.grabCut(np.ascontiguousarray(bgr[b0:b1, a0:a1]), gc, None, bg, fg, 5, cv2.GC_INIT_WITH_MASK)
        lui = (gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)
        out[b0:b1, a0:a1] |= cf & ~lui
    return out


def decoupe(img, m0, box, C, autres=(), meuble=None, personne=None):
    """découpe de la PERSONNE entière : la segmentation multiclasse (MediaPipe, Apache-2.0) dit ce qui est une personne ;
    on garde la pièce reliée au cœur de l'ancien masque (bras, main sur l'accoudoir, bord du boubou que l'ancien masque
    oubliait — vu sur Baye le 17/10), sans les autres acteurs ; le décor que l'ancien masque emportait (linge, chaise) en
    sort ; bords affinés sur l'image par filtre guidé (He, Sun, Tang 2010). meuble / personne : probabilités ADE20K
    (objets.meubles) — ce qui est sûrement un meuble (la chaise de Baye) n'est pas l'acteur et reste dans le décor."""
    H, W = img.shape[:2]; x0, y0, x1, y1 = [int(v) for v in box]
    pers = np.clip(1 - C[0], 0, 1)
    autre = np.zeros((H, W), np.uint8)
    for o in autres: autre |= (o > 0.5).astype(np.uint8)
    autre = cv2.dilate(autre, np.ones((5, 5), np.uint8)) > 0
    zone = np.zeros((H, W), bool); zone[y0:y1, x0:x1] = True
    coeur = cv2.erode((m0 > 0.5).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    pas_lui = np.zeros((H, W), bool)
    if meuble is not None:
        pe_ = personne if personne is not None else np.zeros_like(meuble)
        pas_lui = _separe_meuble(img, pers, meuble, pe_, box)                 # conflits tranchés par la couleur
        pas_lui |= (meuble > 0.5) & (pe_ < 0.35) & (pers < 0.5)               # meuble sûr (l'ancien masque l'emportait)
        coeur &= ~pas_lui
    cand = (pers > 0.5) & ~autre & zone & ~pas_lui
    n, lab = cv2.connectedComponents(cand.astype(np.uint8))
    ids = np.unique(lab[coeur & (lab > 0)]); garde = np.isin(lab, ids[ids > 0])
    garde |= (m0 > 0.5) & (pers > 0.25) & ~autre & ~pas_lui   # détails fins de l'ancien masque (doigts) si la segmentation hésite
    garde = cv2.morphologyEx(garde.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)) > 0
    trous = ndimage.binary_fill_holes(garde) & ~garde          # petits trous seulement (pas l'espace entre le bras et le corps)
    n, lab, st, _ = cv2.connectedComponentsWithStats(trous.astype(np.uint8))
    petit = 0.015 * max(1, int(garde.sum()))
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] <= petit: garde |= lab == i
    garde &= ~pas_lui                                          # ni la fermeture ni les trous bouchés ne rendent le meuble
    n, lab, st, _ = cv2.connectedComponentsWithStats(garde.astype(np.uint8))
    if n > 2: garde = lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    g = garde[y0:y1, x0:x1].astype(np.float32)
    try:
        fin = cv2.ximgproc.guidedFilter(img[y0:y1, x0:x1].astype(np.float32) / 255, g, 4, 1e-4)
    except Exception:
        fin = cv2.GaussianBlur(g, (0, 0), 1.0)
    alpha = np.zeros((H, W), np.float32)
    alpha[y0:y1, x0:x1] = np.clip(fin, 0, 1) * (cv2.dilate(g, np.ones((5, 5), np.uint8)) > 0)
    perdu = float(((m0 > 0.5) & (alpha < 0.5)).sum() / max(1, (m0 > 0.5).sum()))
    return alpha, perdu


def plaque_restauree(img, plaque, m0, mref, C):
    """la plaque (décor sans acteur, reconstitué) reprend les VRAIS pixels du décor que l'ancienne découpe emportait :
    seulement là où la segmentation est sûre que c'est du fond, à plus de 3 px de la personne."""
    sur = (m0 > 0.5) & (mref < 0.05) & (C[0] > 0.8)
    loin = cv2.distanceTransform((mref < 0.5).astype(np.uint8), cv2.DIST_L2, 5) > 3
    k = cv2.GaussianBlur((sur & loin).astype(np.float32), (0, 0), 1.2)[..., None]
    return np.clip(plaque.astype(np.float32) * (1 - k) + img.astype(np.float32) * k, 0, 255).astype(np.uint8)


def _rot(p, t):
    c, s = math.cos(t), math.sin(t)
    return np.array([[c, -s, p[0] - c * p[0] + s * p[1]], [s, c, p[1] - s * p[0] - c * p[1]], [0, 0, 1.0]])


def _tr(d): return np.array([[1, 0, d[0]], [0, 1, d[1]], [0, 0, 1.0]])


def _app(Mx, p): p = np.asarray(p, np.float64); return Mx[:2, :2] @ p + Mx[:2, 2]


def _ik2(S, T, l1, l2, E0, S0, T0):
    """coude/genou E par cinématique inverse à deux os (épaule/hanche S, cible T), du même côté qu'au repos."""
    d = T - S; D = float(np.linalg.norm(d)); D = min(max(D, abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
    u = (T - S) / max(1e-9, np.linalg.norm(T - S)); a = (l1 * l1 - l2 * l2 + D * D) / (2 * D); hgt = math.sqrt(max(0.0, l1 * l1 - a * a))
    n = np.array([-u[1], u[0]]); w0 = T0 - S0
    cote = np.sign((E0 - S0)[0] * w0[1] - (E0 - S0)[1] * w0[0]) or 1.0   # côté du coude au repos (produit vectoriel)
    E1, E2 = S + u * a + n * hgt, S + u * a - n * hgt
    c1 = np.sign((E1 - S)[0] * d[1] - (E1 - S)[1] * d[0])
    return E1 if c1 == cote else E2


def _ang(v): return math.atan2(v[1], v[0])


def boite(bbox, shape, marge=0.14):
    """boîte de travail de l'acteur : sa boîte élargie de `marge` (place pour bouger)."""
    H, W = shape[:2]; x0, y0, x1, y1 = [float(v) for v in bbox]; mg = marge * max(x1 - x0, y1 - y0)
    return max(0, int(x0 - mg)), max(0, int(y0 - mg)), min(W, int(x1 + mg)), min(H, int(y1 + mg))


def preparer(img, alpha, pts, bbox, C, plaque=None, bras=None, segmente=None, visage3d=None, assis=False, cellules=64, marge=0.14):
    """tout ce qui ne dépend pas de l'image courante : découpe, os, grille, cœurs rigides, bandes souples (système ARAP
    factorisé une fois), contacts des mains, relief de la tête."""
    H, W = img.shape[:2]; M = modele(pts, bbox); h = M['height']; P = M['P']; I = M['idx']; nb = len(M['os'])
    X0, Y0, X1, Y1 = boite(bbox, img.shape, marge)
    alpha = alpha.astype(np.float32); tete = ((C[1] + C[3]) > 0.5) & (alpha > 0.5)
    calques, alpha_corps, src_corps = _calques_bras(img, alpha, bras or [], plaque, segmente, (X0, Y0, X1, Y1))
    cell = max(5.0, h / cellules)
    gx = X0 + np.arange(int(math.ceil((X1 - X0) / cell)) + 1) * cell; gy = Y0 + np.arange(int(math.ceil((Y1 - Y0) / cell)) + 1) * cell
    X, Y = np.meshgrid(gx, gy); ny, nx = X.shape
    smp = lambda m: m[np.clip(np.round(Y).astype(int), 0, H - 1), np.clip(np.round(X).astype(int), 0, W - 1)]
    k_ = int(2 * cell) | 1
    dedans = smp(cv2.dilate((alpha > 0.05).astype(np.uint8), np.ones((k_, k_), np.uint8))) > 0
    own, S = possession(M, X, Y)
    if calques:   # sous un avant-bras détouré, le corps appartient à ce qui est derrière (buste, cuisse), pas au bras
        sous = np.zeros((H, W), np.uint8)
        for b in calques: x0b, y0b, x1b, y1b = b['box']; sous[y0b:y1b, x0b:x1b] |= b['trou'].astype(np.uint8)
        S2 = S.copy(); S2[..., [i for i, b in enumerate(M['os']) if b.get('bras') and not b['id'].endswith('Up')]] = np.inf
        own = np.where(smp(sous) > 0, np.argmin(S2, -1), own)
    tete_g = smp(cv2.dilate(tete.astype(np.uint8), np.ones((3, 3), np.uint8))) > 0
    own = np.where(tete_g, I['head'], own)
    # robe ou boubou : pas d'espace entre les genoux → les jambes sont une JUPE souple (seuls les pieds sont rigides)
    a_, b_ = P['lKn'], P['rKn']; ts = np.linspace(0.3, 0.7, 9); seg = a_[None] + (b_ - a_)[None] * ts[:, None]
    jupe = bool(np.min(alpha[np.clip(seg[:, 1].astype(int), 0, H - 1), np.clip(seg[:, 0].astype(int), 0, W - 1)]) > 0.5)
    L = _lies(M)
    libre = _bandes(M, X, Y, own, tete_g, L)
    kc = max(1, int(round(0.018 * h / cell)))   # contacts entre os non liés (main contre la cuisse, bras contre le flanc)
    for a in range(nb):
        pres = cv2.dilate((own == a).astype(np.uint8), np.ones((2 * kc + 1, 2 * kc + 1), np.uint8)) > 0
        for b in range(nb):
            if b != a and (a, b) not in L: libre |= (own == b) & pres
    if jupe:
        for s in 'lr': libre |= (own == I[s + 'Th']) | (own == I[s + 'Shin'])
    libre |= ~dedans
    coeur = dedans & ~libre
    coeur |= dedans & tete_g & (own == I['head']) & ~sous_menton(M, X, Y)   # visage et cheveux : toujours rigides
    libre = dedans & ~coeur
    # une zone libre sans aucun cœur voisin serait indéterminée : elle suit son os
    n_, lab = cv2.connectedComponents(libre.astype(np.uint8), connectivity=4)
    voisin = cv2.dilate(coeur.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    for i in range(1, n_):
        if not (voisin & (lab == i)).any(): coeur |= lab == i
    libre = dedans & ~coeur
    # système ARAP (triangles de la grille, deux par case), factorisé une fois
    vid = -np.ones((ny, nx), np.int64); n = int(dedans.sum()); vid[dedans] = np.arange(n)
    tris, typ = [], []
    jj, ii = np.mgrid[0:ny - 1, 0:nx - 1]
    c00, c10, c01, c11 = vid[jj, ii], vid[jj, ii + 1], vid[jj + 1, ii], vid[jj + 1, ii + 1]
    okA = (c00 >= 0) & (c10 >= 0) & (c01 >= 0); okB = (c10 >= 0) & (c11 >= 0) & (c01 >= 0)
    TA = np.stack([c00[okA], c10[okA], c01[okA]], 1); TB = np.stack([c10[okB], c11[okB], c01[okB]], 1)
    Cm = np.array([[-1.0, -1.0], [1.0, 0.0], [0.0, 1.0]])
    GA = Cm @ np.linalg.inv(np.array([[cell, 0.0], [0.0, cell]])); GB = Cm @ np.linalg.inv(np.array([[0.0, -cell], [cell, cell]]))
    T_ = np.concatenate([TA, TB]); G_ = np.concatenate([np.repeat(GA[None], len(TA), 0), np.repeat(GB[None], len(TB), 0)])
    lib_v = libre[dedans]
    garde = lib_v[T_].any(1); T_, G_ = T_[garde], G_[garde]
    rows = (2 * np.arange(len(T_))[:, None, None] + np.arange(2)[None, None, :]).repeat(3, 1)
    cols = T_[:, :, None].repeat(2, 2)
    A = sparse.csr_matrix((G_.ravel(), (rows.ravel(), cols.ravel())), shape=(2 * len(T_), n))
    fi = np.nonzero(lib_v)[0]; ci = np.nonzero(~lib_v)[0]
    Af, Ac = A[:, fi].tocsc(), A[:, ci].tocsc()
    lu = splu((Af.T @ Af).tocsc() + sparse.identity(len(fi), format='csc') * 1e-9) if len(fi) else None
    # extrapolation hors de la découpe : chaque sommet extérieur prend le déplacement du sommet intérieur le plus proche
    _, (iy, ix) = ndimage.distance_transform_edt(~dedans, return_indices=True)
    # contacts des mains : sur la cuisse (assis), sur le buste (poing sur la hanche), sur la table (hors du corps), libres
    contacts = {}
    for s in 'lr':
        hp = P[s + 'Hand']; r = 0.05 * h
        yy, xx = np.mgrid[int(hp[1] - r):int(hp[1] + r) + 1, int(hp[0] - r):int(hp[0] + r) + 1]
        ok = (yy >= 0) & (yy < H) & (xx >= 0) & (xx < W) & (np.hypot(xx - hp[0], yy - hp[1]) <= r)
        yy, xx = yy[ok], xx[ok]; dans = alpha[yy, xx] > 0.5
        ow, _ = possession(M, xx.astype(np.float64), yy.astype(np.float64)); bras_ = np.array([M['os'][o].get('bras', False) for o in ow])
        autres = ow[dans & ~bras_]
        jambe = np.isin(autres, [I['lTh'], I['rTh'], I['lShin'], I['rShin']]).mean() if len(autres) else 0.0
        bas = hp[1] > P['pelvis'][1] - 0.12 * float(np.linalg.norm(P['neck'] - P['pelvis']))   # main au niveau du bassin ou plus bas
        if assis and dans.mean() < 0.55: contacts[s] = ('monde', None)             # posée sur la table
        elif assis and jambe > 0.5:
            contacts[s] = ('cuisse', I[s + 'Th'])   # posée sur les genoux : elle reste avec la jambe
        elif len(autres) and np.mean(autres == I['torso']) > 0.5 and hp[1] > P['neck'][1] + 0.55 * (P['pelvis'][1] - P['neck'][1]):
            contacts[s] = ('buste', I['torso'])     # poing sur la hanche : la main suit le buste
        else: contacts[s] = ('libre', None)
    R = dict(M=M, box=(X0, Y0, X1, Y1), alpha=alpha, alpha_corps=alpha_corps, src_corps=src_corps, bras=calques, cell=cell, gx=gx, gy=gy, X=X, Y=Y, own=own, dedans=dedans,
             coeur=coeur, libre=libre, vid=vid, n=n, T=T_, G=G_, fi=fi, ci=ci, Af=Af, Ac=Ac, lu=lu, ext=(iy, ix), jupe=jupe,
             contacts=contacts, assis=assis, L=L, tete=tete)
    R['tete3d'] = relief_tete(R, visage3d)
    # cartes statiques de la boîte (coordonnées en cases de la grille) pour suréchantillonner le champ
    ys, xs = np.mgrid[Y0:Y1, X0:X1].astype(np.float32)
    R['grx'], R['gry'] = (xs - np.float32(gx[0])) / np.float32(cell), (ys - np.float32(gy[0])) / np.float32(cell)
    R['xs'], R['ys'] = xs, ys
    return R


def _calques_bras(img, alpha, bras, plaque, segmente, box):
    """calques des avant-bras / mains (préparés par gestes.prepare : calque, fond reconstitué par LaMa, pivot) rendus
    EXACTS : la couleur du bras est DÉCONTAMINÉE de son fond (matting : src = c·bras + (1 − c)·fond), le corps, dessous,
    montre le fond reconstitué, et son alpha y devient « ce qu'il y a derrière le bras » (segmentation de l'image sans le
    bras : le buste, la cuisse, ou le décor). Au repos : pixel pour pixel l'image d'origine ; en mouvement : aucune trace
    du bras à son ancienne place, aucun étirement (le bras glisse devant le corps)."""
    H, W = img.shape[:2]; alpha_c = alpha.copy(); src_c = []; out = []
    if not bras: return out, alpha_c, src_c
    sans = img.copy()
    for b in bras:
        x0, y0, x1, y1 = b['box']; t = b['trou']
        sans[y0:y1, x0:x1][t] = b['fond'][t]
    derriere = None
    if segmente is not None:
        Cf = segmente(sans, box); derriere = np.clip(1 - Cf[0], 0, 1)
    for b in bras:
        x0, y0, x1, y1 = b['box']; t = b['trou']
        m = np.clip(b['sil'], 0, 1).astype(np.float32); f = np.clip(b['fondu'], 0, 1).astype(np.float32); mf = m * f
        a = np.clip(alpha[y0:y1, x0:x1], 0, 1).astype(np.float32); m = np.minimum(m, a)
        if b.get('sil_bras') is not None:   # BRAS ARTICULÉ : couleur décontaminée et corps dessous pris sur le bras ENTIER
            m = np.minimum(np.clip(b['sil_bras'], 0, 1).astype(np.float32), a)   # (aucune couture interne bras / avant-bras)
        der = derriere[y0:y1, x0:x1] if derriere is not None else a
        der = cv2.GaussianBlur((der > 0.5).astype(np.float32), (0, 0), 1.0)
        fond = b['fond'].astype(np.float32); pl = plaque[y0:y1, x0:x1].astype(np.float32) if plaque is not None else fond
        bg = der[..., None] * fond + (1 - der[..., None]) * pl          # derrière le bras : le corps reconstitué ou le décor
        src = b['rgb'].astype(np.float32); m3 = m[..., None]
        # couleur PROPRE du bras (bord anticrénelé décontaminé : src = m·bras + (1 − m)·derrière)
        wb = np.clip((m3 - 0.3) / 0.3, 0, 1)
        P = (1 - wb) * b['rgb_ext'].astype(np.float32) + wb * np.clip((src - (1 - m3) * bg) / np.maximum(m3, 1e-3), 0, 255)
        # corps dessous : « bras par-dessus corps » = l'acteur d'origine, exactement (algèbre de la composition RGBA)
        mc = m if b.get('sil_bras') is not None else mf
        A_f = np.clip((a - mc) / np.maximum(1 - mc, 1e-3), 0, 1)
        B_f = np.clip((a[..., None] * src - mc[..., None] * P) / np.maximum(a - mc, 1e-3)[..., None], 0, 255)
        w = np.clip((mc - 0.9) / 0.1, 0, 1); w3 = w[..., None]   # cœur du bras : derrière lui, le corps reconstitué (ou rien)
        A_B = (1 - w) * A_f + w * der * (a > 0.02); B_c = (1 - w3) * B_f + w3 * fond
        tt = np.clip(mc / 0.005, 0, 1)
        if b.get('sil_bras') is not None: mf = np.minimum(mf, a)   # le calque ne couvre que SA partie du bras
        al = alpha_c[y0:y1, x0:x1]
        alpha_c[y0:y1, x0:x1] = al * (1 - tt) + A_B * tt
        side = 'l' if b['cote'] == 'gauche' else 'r'
        out.append(dict(cote=side, nu=b['nu'], piv=np.asarray(b['piv'], np.float64), box=(x0, y0, x1, y1), rgb=P.astype(np.float32),
                        calque=mf, sens=b['sens'], amax=b.get('amax', 0.0), emax=b.get('emax', 1.0), trou=t, part=b.get('part'),
                        peau=b.get('peau'), calque_bras=m if b.get('sil_bras') is not None else None))
        src_c.append(((x0, y0, x1, y1), B_c, tt))
    return out, alpha_c, src_c


def relief_tete(R, v3=None):
    """profondeur (px, vers la caméra) des sommets de la tête : ellipsoïde aplati ajusté à la tête, plus le relief du
    visage (nez, orbites, bouche) lu par Face Landmarker (478 points x, y, z) quand il est fourni."""
    M = R['M']; I = M['idx']; X, Y = R['X'], R['Y']
    sel = (R['own'] == I['head']) & R['dedans']
    if not sel.any(): return None
    tete = R['tete']; ys_, xs_ = np.nonzero(tete)
    if len(xs_) < 50: xs_, ys_ = X[sel].astype(int), Y[sel].astype(int)
    cx, cy = float(np.median(xs_)), float(np.median(ys_))
    a = max(8.0, 0.5 * float(np.percentile(xs_, 98) - np.percentile(xs_, 2))); b = max(8.0, 0.5 * float(np.percentile(ys_, 98) - np.percentile(ys_, 2)))
    Z0 = 0.55 * a
    rho2 = ((X - cx) / a) ** 2 + ((Y - cy) / b) ** 2
    z = Z0 * np.cos(0.5 * math.pi * np.clip(np.sqrt(rho2), 0, 1))   # bord à pente finie (pas d'étirement infini au contour)
    if v3 is not None and len(v3) >= 468:
        from scipy.interpolate import griddata
        f = np.asarray(v3, np.float64)[:468]
        zf = griddata(f[:, :2], f[:, 2], (X, Y), method='linear')
        ova = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
        ze_ova = Z0 * np.cos(0.5 * math.pi * np.clip(np.sqrt(((f[ova, 0] - cx) / a) ** 2 + ((f[ova, 1] - cy) / b) ** 2), 0, 1))
        decal = float(np.median(ze_ova - f[ova, 2]))
        m = np.isfinite(zf)
        if m.any():
            dd = ndimage.distance_transform_edt(m) * R['cell']; fond = np.clip(dd / (0.12 * 2 * a), 0, 1)   # fondu près du bord du visage
            z = np.where(m, (1 - fond) * z + fond * (zf + decal), z)
    return dict(c=np.array([cx, cy]), a=a, b=b, z=z.astype(np.float64), sel=sel)


def _cyl(dx, ps, sw):
    """abscisse projetée d'un point du buste (écart dx à l'axe) quand le buste tourne de ps (radians) : cylindre aplati."""
    hw = 0.6 * sw; zc = 0.45 * hw * np.sqrt(np.clip(1 - (dx / (1.2 * hw)) ** 2, 0, 1))
    return dx * math.cos(ps) + zc * math.sin(ps)


def _fk(R, pose):
    """matrices monde 3 × 3 des os (rotation + translation), cibles des pieds et des mains, et déplacements propres
    (souffle, haussement d'épaules, buste qui tourne)."""
    M = R['M']; P = M['P']; I = M['idx']; os_ = M['os']; ang = pose.get('ang', {})
    dxb, dyb = pose.get('bassin', (0.0, 0.0)); racine = _tr((dxb, dyb))
    Wd = {}
    rad = lambda k: math.radians(ang.get(k, 0.0))
    Wd['torso'] = racine @ _rot(P['pelvis'], math.radians(pose.get('buste', 0.0)))
    # souffle et épaules : les attaches de la tête et des bras montent avec la poitrine
    torse_l = float(np.linalg.norm(P['neck'] - P['pelvis'])); s_ = pose.get('souffle', 0.0); ep = pose.get('epaules', 0.0)
    up_t = (P['neck'] - P['pelvis']) / max(1e-6, torse_l)
    leve_cou = up_t * s_ * torse_l; leve_ep = leve_cou + up_t * ep
    Wd['head'] = Wd['torso'] @ _tr(leve_cou + up_t * pose.get('tete_dy', 0.0)) @ _rot(P['neck'], math.radians(pose.get('tete', 0.0)))
    # le buste qui tourne déplace les épaules (cylindre) : les bras suivent leur épaule
    ps = math.radians(pose.get('buste_lacet', 0.0))
    for s in 'lr':
        dx = P[s + 'Sh'][0] - P['neck'][0]; dsh = np.array([float(_cyl(np.array([dx]), ps, M['sw'])[0]) - dx, 0.0])
        Wd[s + 'Up'] = Wd['torso'] @ _tr(leve_ep + dsh) @ _rot(P[s + 'Sh'], rad(s + 'Up'))
        Wd[s + 'Lo'] = Wd[s + 'Up'] @ _rot(P[s + 'El'], rad(s + 'Lo'))
        Wd[s + 'Main'] = Wd[s + 'Lo'] @ _rot(P[s + 'Wr'], rad(s + 'Main'))
    # jambes : pieds plantés (ou qui font un pas), hanches portées par le bassin
    pieds = pose.get('pieds', {})
    for s in 'lr':
        Hp, Kn, An, Ft = P[s + 'Hip'], P[s + 'Kn'], P[s + 'An'], P[s + 'Foot']
        H1 = _app(racine, Hp); dpf = np.asarray(pieds.get(s, (0.0, 0.0)), np.float64); A1 = An + dpf
        l1, l2 = float(np.linalg.norm(Kn - Hp)), float(np.linalg.norm(An - Kn))
        pli = abs(math.degrees(_ang(Kn - Hp) - _ang(An - Kn)))
        pli = min(pli, 360 - pli)
        if R['jupe'] or pli < 8:   # jambe tendue (ou sous la robe) : un seul bloc qui pivote à la cheville
            a0, a1 = _ang(Hp - An), _ang(H1 - A1); D0, D1 = float(np.linalg.norm(Hp - An)), float(np.linalg.norm(H1 - A1))
            k = min(1.0, D1 / max(1e-6, D0)); e = (Hp - An) / max(1e-6, D0)   # genou qui avance vers la caméra : la jambe se raccourcit
            Sc = np.eye(3); Sc[:2, :2] = np.eye(2) + (k - 1) * np.outer(e, e); Sc[:2, 2] = An - Sc[:2, :2] @ An
            Wd[s + 'Th'] = _tr(A1 - An) @ _rot(An, a1 - a0) @ Sc; Wd[s + 'Shin'] = Wd[s + 'Th']
        else:
            K1 = _ik2(H1, A1, l1, l2, Kn, Hp, An)
            Wd[s + 'Th'] = _tr(H1 - Hp) @ _rot(Hp, _ang(K1 - H1) - _ang(Kn - Hp))
            Wd[s + 'Shin'] = _tr(K1 - Kn) @ _rot(Kn, _ang(A1 - K1) - _ang(An - Kn))
        Wd[s + 'Shin'] = Wd[s + 'Shin'] @ _rot(Kn, rad(s + 'Shin')) if ang.get(s + 'Shin') else Wd[s + 'Shin']
        Wd[s + 'Pied'] = _tr(dpf) @ _rot(An, rad(s + 'Pied'))   # le pied reste à plat sur le sol
    return np.stack([Wd[b['id']] for b in os_])


def pose_bras(R, pose, mats):
    """transformation (3 × 3) de chaque calque d'avant-bras / main : porté par sa chaîne (épaule → coude → poignet) ;
    main en appui (genoux, table) : l'avant-bras pivote au coude pour que la main reste posée ; puis le geste demandé
    (angle, avancée vers la caméra) dans l'enveloppe sans défaut du bras."""
    M = R['M']; P = M['P']; I = M['idx']; out = []; gestes = pose.get('gestes') or []; haut = {}
    for k, b in enumerate(R['bras']):
        s = b['cote']; piv = b['piv']
        if b.get('part') == 'bas' and s in haut:   # BRAS ARTICULÉ (bras_articules.py) : l'avant-bras est porté par le bras
            a, e = (gestes[k] if k < len(gestes) else (0.0, 1.0)); Th, thh = haut[s]
            out.append(_tr(_app(Th, piv) - piv) @ _rot(piv, thh - math.radians(a * b['sens']))); continue
        ch = mats[I[s + 'Up']] if b['nu'] else mats[I[s + 'Lo']]
        P1 = _app(ch, piv); th = math.atan2(ch[1, 0], ch[0, 0])
        typ, sup = R['contacts'][s]; w = float(pose.get('appui', {}).get(s, 1.0)) if typ in ('cuisse', 'monde') and not b.get('part') else 0.0
        if w > 0:
            ref = P[s + 'Wr'] if b['nu'] else P[s + 'Hand']; Mc = np.eye(3) if typ == 'monde' else mats[sup]
            cible = _app(Mc, ref); thc = _ang(cible - P1) - _ang(ref - piv)
            th = (1 - w) * th + w * thc
        a, e = (gestes[k] if k < len(gestes) else (0.0, 1.0))
        tg = -math.radians(a * b['sens'])   # gestes : degrés, sens d'OpenCV (positif = anti-horaire à l'écran)
        Sc = np.eye(3); Sc[:2, :2] *= e; Sc[:2, 2] = piv - e * piv
        out.append(_tr(P1 - piv) @ _rot(piv, th + tg) @ Sc)
        if b.get('part') == 'haut': haut[s] = (out[-1], th + tg)
    return out


def _cible(R, pose, mats):
    """position déformée de chaque sommet intérieur : cœurs = transformation de leur os (tête en 3D, souffle, buste qui
    tourne) ; sommets libres = même chose comme point de départ, puis ARAP."""
    M = R['M']; I = M['idx']; P = M['P']; dd = R['dedans']
    X = R['X'][dd]; Y = R['Y'][dd]; own = R['own'][dd]
    V = np.stack([X, Y], 1)
    # buste : souffle (la poitrine s'élève, le bassin reste) et rotation en lacet sur un cylindre
    tor = own == I['torso']
    if tor.any() and (pose.get('souffle') or pose.get('buste_lacet')):
        pv = P['pelvis']; nk = P['neck']; L_ = max(1e-6, float(np.linalg.norm(nk - pv))); u = (nk - pv) / L_
        t_ = np.clip(((V[tor] - pv) @ u) / L_, 0, 1.2)
        W_ = V[tor].copy()
        if pose.get('souffle'): W_ += u[None] * (pose['souffle'] * L_ * t_ ** 1.5)[:, None]
        if pose.get('buste_lacet'):
            ps = math.radians(pose['buste_lacet']); axe = pv[0] + (nk[0] - pv[0]) * t_; dx = W_[:, 0] - axe
            W_[:, 0] = axe + dx + (_cyl(dx, ps, M['sw']) - dx) * np.clip(t_ * 2.5 - 0.5, 0, 1)   # la taille tourne peu, les épaules tout
        V = V.copy(); V[tor] = W_
    # tête : lacet et tangage d'un relief 3D, projeté (avant le roulis, porté par le cou)
    T3 = R['tete3d']; hd = own == I['head']
    if T3 is not None and hd.any() and (pose.get('tete_lacet') or pose.get('tete_tangage')):
        z = T3['z'][dd][hd]; c = T3['c']; ps, ph = math.radians(pose.get('tete_lacet', 0.0)), math.radians(pose.get('tete_tangage', 0.0))
        x_ = V[hd, 0] - c[0]; y_ = V[hd, 1] - c[1]
        py = 0.55 * T3['b']; pz = -0.35 * T3['a']   # le hochement pivote sous et derrière le centre (atlas)
        y1 = (y_ - py) * math.cos(ph) + (z - pz) * math.sin(ph) + py; z1 = -(y_ - py) * math.sin(ph) + (z - pz) * math.cos(ph) + pz
        x1 = x_ * math.cos(ps) + z1 * math.sin(ps)
        V = V.copy(); V[hd, 0] = c[0] + x1; V[hd, 1] = c[1] + y1
    Mo = mats[own]; out = np.einsum('nij,nj->ni', Mo[:, :2, :2], V) + Mo[:, :2, 2]
    return out


def arap(R, X0, iters=10):
    """sommets libres : minimum de l'énergie ARAP (cœurs fixés) ; X0 = positions de départ (n, 2)."""
    if R['lu'] is None or not len(R['fi']): return X0
    X = X0.copy(); T, G = R['T'], R['G']; Af, Ac, lu = R['Af'], R['Ac'], R['lu']
    AcXc = Ac @ X[R['ci']]
    for _ in range(iters):
        J = np.einsum('tik,tic->tck', G, X[T])   # jacobienne de chaque triangle (2 × 2)
        phi = np.arctan2(J[:, 1, 0] - J[:, 0, 1], J[:, 0, 0] + J[:, 1, 1]); c, s = np.cos(phi), np.sin(phi)
        Rt = np.stack([np.stack([c, -s], -1), np.stack([s, c], -1)], 1)   # rotation la plus proche
        b = Rt.transpose(0, 2, 1).reshape(-1, 2)
        X[R['fi']] = lu.solve(np.asarray(Af.T @ (b - AcXc)))
    return X


def champ(R, pose):
    """déplacement de chaque sommet de la grille (ny, nx, 2) pour la pose."""
    mats = _fk(R, pose); X0 = _cible(R, pose, mats)
    Xd = arap(R, X0, pose.get('iters', 10))
    dd = R['dedans']; U = np.zeros(R['X'].shape + (2,), np.float32)
    U[dd, 0] = Xd[:, 0] - R['X'][dd]; U[dd, 1] = Xd[:, 1] - R['Y'][dd]
    iy, ix = R['ext']; U = U[iy, ix]
    return U, mats


def carte(R, U, iters=6):
    """carte inverse (sx, sy) de la boîte : point fixe s = d − u(s) (le champ est défini sur l'image source)."""
    gx0, gy0, c = np.float32(R['gx'][0]), np.float32(R['gy'][0]), np.float32(R['cell'])
    xs, ys = R['xs'], R['ys']; Ux, Uy = np.ascontiguousarray(U[..., 0]), np.ascontiguousarray(U[..., 1])
    ux = cv2.remap(Ux, R['grx'], R['gry'], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    uy = cv2.remap(Uy, R['grx'], R['gry'], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    sx, sy = xs - ux, ys - uy
    for _ in range(iters):
        gxs, gys = (sx - gx0) / c, (sy - gy0) / c
        ux = cv2.remap(Ux, gxs, gys, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        uy = cv2.remap(Uy, gxs, gys, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        sx, sy = xs - ux, ys - uy
    return sx, sy


def rendre(R, pose, src, alpha=None):
    """acteur posé : (boîte, rgb, alpha, sx, sy). src = image de la scène (bouche, yeux déjà posés) ; alpha = découpe
    (par défaut celle de la préparation). Couche 1 : le corps (champ ARAP), avec, sous les avant-bras détourés, ce qui est
    derrière eux ; couche 2 : les avant-bras / mains, transformations rigides, par-dessus."""
    U, mats = champ(R, pose); sx, sy = carte(R, U)
    X0, Y0, X1, Y1 = R['box']
    a = R['alpha_corps'] if alpha is None else alpha
    if R['src_corps']:
        src = src.copy()
        for (x0, y0, x1, y1), fond, tt in R['src_corps']:
            reg = src[y0:y1, x0:x1].astype(np.float32); k = tt[..., None]
            src[y0:y1, x0:x1] = np.clip(reg * (1 - k) + fond * k, 0, 255).astype(np.uint8)
    rgb = cv2.remap(src, sx, sy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
    al = cv2.remap(a, sx, sy, cv2.INTER_LINEAR, borderValue=0)
    if R['bras']:
        w, h = X1 - X0, Y1 - Y0; acc = rgb * al[..., None]; Ts = pose_bras(R, pose, mats)
        # PEAU PONDÉRÉE (peau_ponderee.py) : un bras qui en porte une est déformé d'un seul tenant par trois os — corps
        # (près de l'épaule), bras, avant-bras — au lieu de ses deux calques rigides
        peaux = {b['cote'] for b in R['bras'] if b.get('peau') is not None}
        T_bas = {b['cote']: T for b, T in zip(R['bras'], Ts) if b.get('part') == 'bas'}
        for b, T in zip(R['bras'], Ts):
            x0, y0, x1, y1 = b['box']
            A = _tr((-X0, -Y0)) @ T @ _tr((x0, y0))
            if b['cote'] in peaux:
                if b.get('peau') is None: continue                 # avant-bras : déjà dans la peau du bras
                import peau_ponderee
                ch = mats[R['M']['idx'][b['cote'] + 'Up']]; piv = b['piv']
                T_corps = _tr(_app(ch, piv) - piv) @ _rot(piv, math.atan2(ch[1, 0], ch[0, 0]))   # suit le buste, sans le geste
                cadre = lambda M_: _tr((-X0, -Y0)) @ M_ @ _tr((x0, y0))
                cb, rb = peau_ponderee.rendre(b['peau'], (cadre(T_corps), A, cadre(T_bas.get(b['cote'], T))), b['rgb'], b['calque_bras'], (w, h))
            else:
                cb = cv2.warpAffine(b['calque'], A[:2], (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
                rb = cv2.warpAffine(b['rgb'], A[:2], (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            acc = acc * (1 - cb[..., None]) + rb * cb[..., None]; al = al * (1 - cb) + cb
        rgb = acc / np.maximum(al, 1e-4)[..., None]
    return (X0, Y0, X1, Y1), np.clip(rgb, 0, 255).astype(np.uint8), al.astype(np.float32), sx, sy


def etirement(sx, sy, al, masque=None):
    """étirement local (valeurs singulières de la jacobienne de la carte inverse) : 99e centile et maximum."""
    a_, b_ = np.gradient(sx, axis=1), np.gradient(sx, axis=0); c_, d_ = np.gradient(sy, axis=1), np.gradient(sy, axis=0)
    E = a_ * a_ + b_ * b_ + c_ * c_ + d_ * d_; D = np.abs(a_ * d_ - b_ * c_); r = np.sqrt(np.maximum(E * E - 4 * D * D, 0))
    s1 = np.sqrt((E + r) / 2); s2 = np.sqrt(np.maximum((E - r) / 2, 1e-9)); st = np.maximum(s1, 1 / s2) - 1
    m = cv2.erode((al > 0.5).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    if masque is not None: m &= masque
    return (round(float(np.percentile(st[m], 99)), 4), round(float(st[m].max()), 4)) if m.any() else (0.0, 0.0), st


def enveloppe(R, seuil=0.04):
    """amplitude la plus grande de chaque mouvement du CORPS qui reste sous `seuil` d'étirement (99e centile, hors tête) :
    mesurée sur ce personnage, une fois ; le jeu (jeu.py) ne la dépasse jamais."""
    I = R['M']['idx']; out = {}
    def p99(pose):
        U, _ = champ(R, pose); sx, sy = carte(R, U)
        al = cv2.remap(R['alpha'], sx, sy, cv2.INTER_LINEAR, borderValue=0)
        gx = ((sx - R['gx'][0]) / R['cell']).round().astype(int).clip(0, len(R['gx']) - 1)
        gy = ((sy - R['gy'][0]) / R['cell']).round().astype(int).clip(0, len(R['gy']) - 1)
        (p, _), _ = etirement(sx, sy, al, R['own'][gy, gx] != I['head']); return p
    essais = {'buste': ([1, 2, 3, 4, 5, 6], lambda v: {'buste': v}), 'tete': ([2, 4, 6, 8, 10], lambda v: {'tete': v}),
              'epaules': ([1, 2, 3, 4, 6], lambda v: {'epaules': v}), 'bassin_x': ([2, 4, 6, 8], lambda v: {'bassin': (v, 0)}),
              # la respiration (vers le haut seulement) et le lacet de la tête (le cou se tord : un peu plus de tolérance) —
              # vu le 17/10 : le souffle étirait les poignets de Baye posés sur les accoudoirs, le lacet son col
              'souffle': ([0.004, 0.008, 0.012, 0.016, 0.02], lambda v: {'souffle': v}), 'tete_lacet': ([6, 10, 14, 18], lambda v: {'tete_lacet': v}),
              # le buste qui tourne (cylindre) : vu le 17/10, −5,9° étiraient de 7 % le bras de Maman, poing sur la hanche
              'buste_lacet': ([2, 4, 6, 8], lambda v: {'buste_lacet': v})}
    tol = {'tete_lacet': 1.5 * seuil}
    for canal, (vals, f) in essais.items():
        if canal == 'bassin_x' and R['assis']: out[canal] = 0.0; continue
        best = 0.0
        for v in vals:
            m = p99(f(v)) if canal == 'souffle' else max(p99(f(v)), p99(f(-v)))
            if m <= tol.get(canal, seuil): best = float(v)
            else: break
        out[canal] = best
    return out
