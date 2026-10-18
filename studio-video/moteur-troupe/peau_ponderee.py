# PEAU PONDÉRÉE DES BRAS ARTICULÉS (18/10/2026) — remède désigné par JEV (conseil/bras_conseil_rea.json) : cause « le bras
# a l'air découpé dans la peinture, bords nets et coutures à l'épaule et au coude » (0,68 ; probabilité qu'elle soit vraie
# 0,86), remède « peau pondérée façon DragonBones » (0,78, gain 2,71 sur 4). Méthode lue par REA dans le moteur libre
# DragonBones (pixi-dragonbones 5.7.0-1, MIT ; preuve ev_0b47f7a2…, dragonBones.js l. 15698-15738, PixiSlot._updateMesh) :
# chaque sommet d'un maillage porte des poids sur plusieurs os, sa position est la somme pondérée des positions que lui
# donne chaque os (xG = Σ w · (M_os · v)). Réécrite ici pour la peinture : plus de bras coupé en deux calques rigides,
# le bras ENTIER et le haut de l'épaule se déforment d'un seul tenant, sous trois os :
#   · le corps (près de l'épaule : le haut du bras reste attaché au buste) ;
#   · le bras (de l'épaule au coude) ;
#   · l'avant-bras et la main (portés par le bras).
# Les poids suivent l'abscisse le long du membre (épaule → coude → poignet → main), avec des fondus courts à l'épaule et
# au coude (pas d'effet « caoutchouc »). Rendu exact par triangles : chaque triangle déformé lit ses pixels dans la
# peinture d'origine (transformation affine par triangle, une seule passe cv2.remap).
#   maillage(S, E, W, M, masque, pas=4) → peau (sommets, triangles, poids), coordonnées locales du calque
#   rendre(peau, (A_corps, A_bras, A_avant_bras), rgb, alpha, (w, h)) → (alpha, rgb) déformés dans le cadre (w, h)
import numpy as np, cv2

# FONDUS COURTS (18/10/2026) — essai A/B jugé par JEV (conseil/bras_conseil_ab.json) : avec des fondus longs (0,22 à
# l'épaule, 0,16 au coude), le bras « s'étire comme du caoutchouc » entre l'épaule et le coude (cause 0,91, vraie à 0,89) ;
# remède désigné « peau à fondu court aux articulations, le bras reste rigide ailleurs » (0,87, gain 2,65 sur 4).
FONDU_EPAULE = 0.06    # part du bras (épaule → coude) qui passe du corps au bras
FONDU_COUDE = 0.06     # demi-largeur du fondu au coude, en part du plus court des deux segments


def _lisse(e0, e1, x):
    t = np.clip((x - e0) / max(e1 - e0, 1e-6), 0, 1)
    return t * t * (3 - 2 * t)


def abscisse(P, chaine):
    """abscisse curviligne du point le plus proche sur la ligne brisée `chaine` (épaule → coude → poignet → main)."""
    P = np.asarray(P, np.float64); best_d = np.full(len(P), np.inf); best_a = np.zeros(len(P)); a0 = 0.0
    for A, B in zip(chaine[:-1], chaine[1:]):
        d = B - A; L = float(np.linalg.norm(d)) + 1e-9
        t = np.clip(((P - A) @ d) / (L * L), 0, 1)
        q = A + t[:, None] * d; dist = np.linalg.norm(P - q, axis=1)
        m = dist < best_d; best_d[m] = dist[m]; best_a[m] = a0 + t[m] * L; a0 += L
    return best_a


def poids(P, S, E, W, M):
    """poids (corps, bras, avant-bras) de chaque point : fondu court à l'épaule et au coude, somme 1."""
    S, E, W, M = (np.asarray(v, np.float64) for v in (S, E, W, M))
    L1, L2 = float(np.linalg.norm(E - S)), float(np.linalg.norm(W - E))
    a = abscisse(P, [S, E, W, M])
    b = FONDU_COUDE * min(L1, L2)
    w_av = _lisse(L1 - b, L1 + b, a)
    w_co = 1 - _lisse(0.0, FONDU_EPAULE * L1, a)
    w_br = np.clip(1 - w_av - w_co, 0, 1)
    tot = w_co + w_br + w_av + 1e-9
    return np.stack([w_co / tot, w_br / tot, w_av / tot], 1)


def maillage(S, E, W, M, masque, pas=4, marge=6):
    """maillage en grille sur le bras (masque dilaté de `marge` px), triangles coupés en deux par cellule."""
    h, w = masque.shape
    zone = cv2.dilate((masque > 0).astype(np.uint8), np.ones((2 * marge + 1, 2 * marge + 1), np.uint8))
    xs = np.arange(0, w + pas, pas, dtype=np.float64); ys = np.arange(0, h + pas, pas, dtype=np.float64)
    nx, ny = len(xs), len(ys)
    gx, gy = np.meshgrid(xs, ys); V = np.stack([gx.ravel(), gy.ravel()], 1)
    tri = []
    for j in range(ny - 1):
        y0, y1 = int(ys[j]), int(min(h, ys[j + 1]))
        for i in range(nx - 1):
            x0, x1 = int(xs[i]), int(min(w, xs[i + 1]))
            if y0 >= h or x0 >= w or not zone[y0:max(y1, y0 + 1), x0:max(x1, x0 + 1)].any(): continue
            a, b, c, d = j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1
            tri += [(a, b, d), (a, d, c)]
    T = np.asarray(tri, np.int32)
    return {'V': V, 'T': T, 'W': poids(V, S, E, W, M)}


def deforme(peau, matrices):
    """positions déformées des sommets : somme pondérée des positions données par chaque os (3 × 3, local → cadre)."""
    V = peau['V']; Vh = np.concatenate([V, np.ones((len(V), 1))], 1)
    out = np.zeros_like(V)
    for k, A in enumerate(matrices):
        out += peau['W'][:, k:k + 1] * (Vh @ np.asarray(A, np.float64)[:2].T)
    return out


def cartes(peau, matrices, taille):
    """cartes inverses (cadre → calque) : pour chaque pixel du cadre, le triangle déformé qui le couvre et la
    transformation affine qui ramène ce pixel dans le calque d'origine."""
    w, h = taille; D = deforme(peau, matrices); V = peau['V']; T = peau['T']
    ids = np.full((h, w), -1, np.int32)
    Dt = D[T]; St = V[T]                                             # (K, 3, 2)
    Dh = np.concatenate([Dt, np.ones((len(T), 3, 1))], 2)            # (K, 3, 3)
    det = np.linalg.det(Dh); ok = np.abs(det) > 1e-6
    Minv = np.zeros_like(Dh); Minv[ok] = np.linalg.inv(Dh[ok])
    Aff = Minv @ St                                                  # (K, 3, 2) : [x, y, 1] @ Aff → source
    pts = np.round(Dt * 16).astype(np.int32)                         # sous-pixel (shift = 4)
    for k in np.nonzero(ok)[0]:
        cv2.fillConvexPoly(ids, pts[k], int(k), lineType=cv2.LINE_8, shift=4)
    yy, xx = np.nonzero(ids >= 0)
    mx = np.full((h, w), -1.0, np.float32); my = np.full((h, w), -1.0, np.float32)
    if len(yy):
        A = Aff[ids[yy, xx]]
        mx[yy, xx] = xx * A[:, 0, 0] + yy * A[:, 1, 0] + A[:, 2, 0]
        my[yy, xx] = xx * A[:, 0, 1] + yy * A[:, 1, 1] + A[:, 2, 1]
    return mx, my


def rendre(peau, matrices, rgb, alpha, taille):
    """calque du bras entier déformé par la peau pondérée : (alpha, rgb) dans le cadre `taille` = (w, h)."""
    mx, my = cartes(peau, matrices, taille)
    al = cv2.remap(np.ascontiguousarray(alpha, np.float32), mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    rb = cv2.remap(np.ascontiguousarray(rgb, np.float32), mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return np.clip(al, 0, 1), rb
