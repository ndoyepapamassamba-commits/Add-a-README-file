# REGARD (17/10/2026) — demande : « Petit Mamadou face à la caméra qui parle, ça n'a pas de sens : il devrait faire face à
# ses parents ». Le regard est le signe le plus fort de « à qui je parle » (bien avant le corps) : l'iris de chaque œil glisse
# dans l'ouverture de la paupière vers l'interlocuteur, la paupière reste en place, l'iris est caché par elle là où il en sort.
# Méthode : Face Landmarker (MediaPipe, Apache-2.0) donne le contour de chaque œil et le centre de l'iris (points 468, 473) ;
# l'œil « sans iris » est préparé une fois (le blanc de l'œil reconstitué par sa propre couleur), puis à chaque image
# l'iris est reposé, décalé, dans l'ouverture (bord adouci). Sur un clignement, le regard s'efface avec l'ouverture.
import math, numpy as np, cv2

OEIL = {'g': ([33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7], 468),
        'd': ([263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249], 473)}


def _oeil_dessin(img, c, s):
    """œil d'un dessin 3D (Pixar) : grand blanc clair et peu saturé autour du point d'iris ; l'ouverture = enveloppe
    convexe du blanc ; l'iris = la partie sombre dans l'ouverture (les repères Face Landmarker, faits pour des visages
    humains, sous-estiment ces grands yeux — mesuré le 17/10 : 14 px au lieu de ~30 sur Petit Mamadou)."""
    H, W = img.shape[:2]; x0, y0 = int(max(0, c[0] - s)), int(max(0, c[1] - s)); x1, y1 = int(min(W, c[0] + s)), int(min(H, c[1] + s))
    reg = img[y0:y1, x0:x1]; hsv = cv2.cvtColor(reg, cv2.COLOR_RGB2HSV).astype(np.float32)
    v, sat = hsv[..., 2], hsv[..., 1]
    blanc = (v > max(150.0, np.percentile(v, 80) * 0.92)) & (sat < 70)
    n_, lab, st, cen = cv2.connectedComponentsWithStats(blanc.astype(np.uint8))
    if n_ < 2: return None
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    # la tache de blanc la plus grande parmi celles proches du point d'iris
    cand = [i for i in range(1, n_) if st[i, cv2.CC_STAT_AREA] >= 6 and np.hypot(cen[i][0] + x0 - c[0], cen[i][1] + y0 - c[1]) < 0.9 * s]
    if not cand: return None
    i = max(cand, key=lambda i: st[i, cv2.CC_STAT_AREA])
    pts = np.column_stack(np.nonzero(lab == i))[:, ::-1].astype(np.int32)
    # deux taches de blanc de part et d'autre de l'iris : on prend toutes celles qui touchent l'enveloppe de l'iris sombre
    for j in cand:
        if j != i and st[j, cv2.CC_STAT_AREA] > 0.15 * st[i, cv2.CC_STAT_AREA]: pts = np.vstack([pts, np.column_stack(np.nonzero(lab == j))[:, ::-1].astype(np.int32)])
    hull = cv2.convexHull(pts); ouv = np.zeros(reg.shape[:2], np.uint8); cv2.fillConvexPoly(ouv, hull, 1)
    sombre = (ouv > 0) & ~blanc & (v < np.percentile(v[ouv > 0], 60))
    n2, lab2, st2, cen2 = cv2.connectedComponentsWithStats(sombre.astype(np.uint8))
    if n2 < 2: return None
    k = 1 + int(np.argmax(st2[1:, cv2.CC_STAT_AREA]))
    (cx, cy), r = cv2.minEnclosingCircle(np.column_stack(np.nonzero(lab2 == k))[:, ::-1].astype(np.float32))
    larg = float(np.ptp(hull[:, 0, 0])); haut = float(np.ptp(hull[:, 0, 1]))
    return dict(box=(x0, y0, x1, y1), ouv=ouv, iris_c=(cx + x0, cy + y0), r=float(r) * 1.05, larg=larg, haut=haut, blanc=blanc & (ouv > 0))


def _oeil_reperes(img, v3, contour, ic):
    """œil lu par les repères de Face Landmarker (contour de la paupière) : yeux de proportions humaines."""
    H, W = img.shape[:2]; poly = np.asarray(v3[contour, :2], np.float32); c = np.asarray(v3[ic, :2], np.float64)
    x0, y0 = np.floor(poly.min(0)).astype(int) - 6; x1, y1 = np.ceil(poly.max(0)).astype(int) + 7
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if x1 - x0 < 6 or y1 - y0 < 4: return None
    ouv = np.zeros((y1 - y0, x1 - x0), np.uint8); cv2.fillPoly(ouv, [np.round(poly - [x0, y0]).astype(np.int32)], 1)
    g = cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY).astype(np.float32); dedans = ouv > 0
    if dedans.sum() < 12: return None
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32); larg = float(np.ptp(poly[:, 0]))
    sombre = dedans & (g <= np.percentile(g[dedans], 45)) & (np.hypot(xx - c[0], yy - c[1]) < 0.6 * larg)
    n_, lab, st, cen = cv2.connectedComponentsWithStats(sombre.astype(np.uint8))
    if n_ < 2: return None
    k_ = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); cx, cy = cen[k_][0] + x0, cen[k_][1] + y0
    r_l = float(np.mean([np.linalg.norm(v3[ic + j, :2] - v3[ic, :2]) for j in range(1, 5)]))
    r = max(np.sqrt(st[k_, cv2.CC_STAT_AREA] / np.pi), r_l) * 1.08
    blanc = dedans & (np.hypot(xx - cx, yy - cy) > r + 0.5)
    return dict(box=(x0, y0, x1, y1), ouv=ouv, iris_c=(cx, cy), r=r, larg=larg, haut=float(np.ptp(poly[:, 1])), blanc=blanc)


def prepare(img, v3):
    """données des deux yeux (ou None si le visage n'a pas été lu, ou si un œil manque)."""
    if v3 is None or len(v3) < 478: return None
    H, W = img.shape[:2]; yeux = []
    fw = float(np.ptp(v3[:468, 0]))
    for k, (contour, ic) in OEIL.items():
        c = np.asarray(v3[ic, :2], np.float64)
        es = [e for e in (_oeil_dessin(img, c, max(12.0, 0.2 * fw)), _oeil_reperes(img, v3, contour, ic)) if e is not None]
        es = [e for e in es if 1.5 <= e['r'] <= 0.47 * e['larg'] and e['blanc'].sum() >= 0.12 * (e['ouv'] > 0).sum()]
        if not es: continue
        e = max(es, key=lambda e: (e['ouv'] > 0).sum())   # le plus grand œil lisible (les repères sous-estiment les yeux Pixar)
        x0, y0, x1, y1 = e['box']; reg = img[y0:y1, x0:x1].astype(np.float32); ouv = e['ouv'] > 0
        cx, cy = e['iris_c']; r = e['r']; larg = e['larg']
        if r > 0.47 * larg or r < 1.5: continue                         # l'iris remplit l'œil : pas de place pour regarder
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        disque = np.clip(r + 0.5 - np.hypot(xx - cx, yy - cy), 0, 1)
        iris = disque * ouv
        blanc = ouv & (disque < 0.02) & e['blanc']
        if blanc.sum() < 0.12 * ouv.sum(): continue
        coul_blanc = np.median(reg[blanc], 0)
        if coul_blanc.mean() < 110: continue                            # « blanc » sombre : verres teintés, pas un œil
        A = np.c_[xx[blanc] - cx, yy[blanc] - cy, np.ones(int(blanc.sum()))]; coef, *_ = np.linalg.lstsq(A, reg[blanc], rcond=None)
        modele = np.stack([xx - cx, yy - cy, np.ones_like(xx)], -1) @ coef
        modele = np.clip(modele, np.percentile(reg[blanc], 5, axis=0), np.percentile(reg[blanc], 98, axis=0))
        d3 = disque[..., None]; sans = reg * (1 - d3) + modele * d3
        # REGARD PEINT ET COURSE RÉELLE (v36) : « Mamie ne regarde pas Baye » (remarque de l'utilisateur, 18/10) — l'iris peint de
        # Maman Nounou est en haut de l'œil (elle regarde le ciel) ; le moteur ne déplaçait l'iris que de 0,14 × la hauteur de
        # l'œil, sans savoir d'où il partait. On garde le centre de l'ouverture et la place réelle de l'iris dans l'œil.
        oy, ox = np.nonzero(ouv); co = (x0 + float(ox.mean()), y0 + float(oy.mean())) if len(ox) else (cx, cy)
        demi = (0.5 * float(ox.max() - ox.min() + 1), 0.5 * float(oy.max() - oy.min() + 1)) if len(ox) else (0.5 * larg, 0.5 * e['haut'])
        course = (max(0.22 * larg, 0.8 * (demi[0] - r)), max(0.14 * e['haut'], 0.8 * (demi[1] - r)))
        yeux.append(dict(box=(x0, y0, x1, y1), ouv=cv2.GaussianBlur(ouv.astype(np.float32), (0, 0), 0.6), iris=iris, rgb=reg, sans=sans,
                         larg=larg, haut=e['haut'], c=np.array([cx, cy]), centre=np.array(co), course=course,
                         peint=((cx - co[0]) / course[0], (cy - co[1]) / course[1])))
    return yeux if len(yeux) == 2 else None   # les deux yeux ou aucun (un seul qui bouge : regard qui louche)


def peint(yeux):
    """direction du regard PEINT (moyenne des deux yeux), en fraction de la course de l'iris : (x, y), y > 0 = vers le bas."""
    if not yeux or 'peint' not in yeux[0]: return (0.0, 0.0)
    return tuple(float(np.clip(np.mean([e['peint'][k] for e in yeux]), -1.5, 1.5)) for k in (0, 1))


DEPLACEMENT_MAX = (1.8, 1.7)   # courses (horizontale, verticale) depuis la position peinte de l'iris
# 19/10/2026 (juge local des regards, v9) : avec (1,1 ; 0,9), Maman Nounou — iris peint en haut à droite (0,87 ; −0,88) — ne
# pouvait pas baisser les yeux vers Petit Mamadou, 55° plus bas : commande 1,7, iris final à 0,02, elle regardait par-dessus
# sa tête dans les 8 répliques de la cour (0 image conforme). Le déplacement relatif est élargi et c'est l'ELLIPSE de la course
# qui garde l'iris dans l'œil : la position finale reste dans le disque unité (en courses), ce que la borne carrée [−1, 1]²
# ne garantissait pas aux coins — la cause de l'œil blanc de la porte G (iris poussé en diagonale hors de la fente).


def applique(src, yeux, gx, gy, ouverture=1.0):
    """iris décalés de (gx, gy) ∈ [−1, 1] (fraction de la course possible) ; ouverture = 1 − clignement."""
    if not yeux or ouverture <= 0.05 or (abs(gx) < 0.02 and abs(gy) < 0.02): return src
    src = src.copy()
    for e in yeux:
        x0, y0, x1, y1 = e['box']; w, h = x1 - x0, y1 - y0
        cx_, cy_ = e.get('course', (0.22 * e['larg'], 0.14 * e['haut'])); p_ = e.get('peint', (0.0, 0.0))
        # l'iris reste dans l'œil : position finale (peinte + commande) dans [−1, 1] courses, sans jamais pousser un regard
        # peint déjà hors de ces bornes quand la commande est nulle
        gx_ = float(np.clip(gx, min(0.0, -1 - p_[0]), max(0.0, 1 - p_[0]))); gy_ = float(np.clip(gy, min(0.0, -1 - p_[1]), max(0.0, 1 - p_[1])))
        # DÉPLACEMENT RELATIF BORNÉ (18/10/2026, porte G de l'épisode 1 : œil de Maman Nounou BLANC, sans iris, sur les plans
        # de Baye — regard peint en haut à droite (0,87 ; −0,88), Baye en bas à gauche : l'iris traversait l'œil de 1,72
        # course et sortait de la fente de l'œil lointain, plus étroite de trois quarts). Au plus DEPLACEMENT_MAX course
        # depuis la position peinte : la tête (lacet, tangage) fait le reste du chemin
        gx_ = float(np.clip(gx_, -DEPLACEMENT_MAX[0], DEPLACEMENT_MAX[0])); gy_ = float(np.clip(gy_, -DEPLACEMENT_MAX[1], DEPLACEMENT_MAX[1]))
        fx_, fy_ = p_[0] + gx_, p_[1] + gy_; r_ = math.hypot(fx_, fy_)
        R_ = max(1.0, math.hypot(*p_) - math.hypot(gx_, gy_))   # un regard peint hors du disque n'est pas ramené d'un coup
        if r_ > R_: gx_, gy_ = fx_ * R_ / r_ - p_[0], fy_ * R_ / r_ - p_[1]
        dx, dy = gx_ * cx_, gy_ * cy_
        M = np.float32([[1, 0, dx], [0, 1, dy]])
        ir = cv2.warpAffine(e['iris'], M, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
        rg = cv2.warpAffine(e['rgb'], M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        m = (ir * e['ouv'])[..., None]; o = (e['ouv'] * ouverture)[..., None]
        eye = e['sans'] * (1 - m) + rg * m
        reg = src[y0:y1, x0:x1].astype(np.float32)
        src[y0:y1, x0:x1] = np.clip(reg * (1 - o) + eye * o, 0, 255).astype(np.uint8)
    return src
