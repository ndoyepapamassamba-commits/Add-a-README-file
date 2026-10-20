# VIE DU FOND GARANTIE (18/10/2026, v35) — porte L de la v34 : JEV jugeait le décor « mort » (« no leaves, smoke, people,
# animals, light or anything else moving ») sur 40 secondes sur 69 : toute la cour (0–26 s) et les plans serrés du poulet.
# Où il le jugeait VIVANT : là où des poules marchaient au fond (cour, 8, 18, 19 et 23 s : 0,64 à 0,86) et au maquis
# (figurants : 0,82 à 0,94). Le linge détouré qui se balance (6 s : 0,38) et les taches rondes qui glissent en bloc
# (decor_vivant.tachete, 16 % : JEV les confond avec le mouvement de la caméra) ne suffisaient pas.
# Essai éclair jugé par JEV (mêmes quatre moments, trois avis par cas) : ombre de nuage à 10 % 0,19 → 0,19 (invisible) ;
# ombres de FEUILLES qui frémissent sur le haut du mur 0,35 → 0,59 ; OISEAUX qui traversent le ciel du cadre 0,27 → 0,86.
# Greffes :
#   · feuillage : l'ombre d'un arbre hors champ (le manguier de la cour) sur le haut du mur le plus proche — rameaux de
#     feuilles qui se balancent aux rafales communes du vent (celles du linge) et frémissent chacune à son rythme, pénombre
#     douce ; posée sur la plaque (elle suit la parallaxe du mur), sur la moitié haute du mur, jamais sur le ciel ni les
#     acteurs (branches plaquées contre le mur : les acteurs, plus en avant, restent au soleil) ;
#   · oiseaux : dans le ciel visible du CADRE de chaque plan — un milan qui plane en cercles (le rapace des villes d'Afrique
#     de l'Ouest) et des hirondelles qui traversent, silhouettes sombres battant des ailes ; ce qui est plus proche que le
#     ciel (toits, palmiers, murs, acteurs) passe devant eux.
#   prepare(plaque, prof) → V ; feuillage(V, t, psi) → facteur de lumière (H × W) ; oiseaux(V, img, t, vis, t0) → img ;
#   papillons(V, img, t, vis, t0) → img
import math
import numpy as np, cv2

CIEL_PROF = 0.08     # profondeur (1 = près) en dessous de laquelle un pixel clair relié au bord haut est du ciel
LOIN = 0.14          # un oiseau n'est dessiné que devant ce qui est plus loin que lui
FORCE = 0.30         # assombrissement au cœur de l'ombre d'un rameau (essai JEV à 0,42 → « fond vivant » 0,59 ; au soleil,
                     # l'ombre ne reçoit que le ciel : 30 à 40 % de la lumière). 0,50 → 0,30 le 20/10/2026 : dans les plans
                     # moyens de la cour (épisode « cour-n1 »), les grappes faisaient de grandes taches de « camouflage » sur
                     # tout le mur (assombrissement moyen du mur 13 %, 42 % du mur sous plus de 10 %) ; à 0,30 : 8 % et 35 %,
                     # pénombre d'un feuillage clairsemé. La porte F (vie du décor) ne dépend pas de cette ombre


def rafale(t, psi=0.0):
    """rafales communes du vent (mêmes que linge.compose) : 0,65 à 1."""
    return 0.65 + 0.35 * (0.5 + 0.5 * math.sin(2 * math.pi * 0.11 * t + psi))


def _ciel(plaque, prof):
    H, W = prof.shape; lum = cv2.cvtColor(np.clip(plaque, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    c = ((prof < CIEL_PROF) & (lum > np.percentile(lum, 40))).astype(np.uint8)
    c = cv2.morphologyEx(c, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab = cv2.connectedComponents(c); garde = np.zeros(H * W, bool).reshape(H, W)
    for k in set(np.unique(lab[:max(2, H // 50)])) - {0}: garde |= lab == k   # relié au bord haut de l'image
    return garde


def prepare(plaque, prof, masques=(), graine=11):
    """feuillage du mur le plus proche, ciel des oiseaux et mur libre des papillons, pour une plaque, sa profondeur et les
    masques des acteurs (là où la plaque est reconstituée)."""
    H, W = prof.shape; rng = np.random.default_rng(graine); ciel = _ciel(plaque, prof)
    occ = np.zeros((H, W), np.uint8)
    for m in masques: occ |= ((m if m.ndim == 2 else m[..., 0]) > 0.3).astype(np.uint8)
    r_ = int(0.025 * W) | 1; libre = cv2.dilate(occ, np.ones((r_, r_), np.uint8)) == 0   # loin des acteurs et du mur reconstitué
    Y = np.arange(H, dtype=np.float32)[:, None]
    # le mur : la surface proche la plus étendue du haut de l'image (ni ciel ni lointain : l'ombre d'un arbre voisin n'y
    # porte pas à la même échelle)
    cand = ~ciel & (prof > LOIN); haut = Y < 0.6 * H
    mur = np.zeros((H, W), bool); y_lim = np.full(W, 0.12 * H, np.float32)
    if (cand & haut).sum() > 0.01 * H * W:
        d_mur = float(np.percentile(prof[cand & haut], 75))
        m_ = (cand & (np.abs(prof - d_mur) < 0.1) & (Y < 0.85 * H)).astype(np.uint8)
        m_ = cv2.morphologyEx(m_, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(m_)
        if n > 1: mur = lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    if mur.any():
        # BRANCHES PLAQUÉES CONTRE LE MUR (v35, 2e règle) : leur ombre couvre le mur sauf son pied (85 % de sa hauteur,
        # mesurée sur le mur : haut et pied de chaque colonne), avec un bord bas irrégulier ; les acteurs, plus en avant,
        # restent au soleil. À 55 puis 65 % : Baye 0,38 → 0,53, Maman 0,35 → 0,49, mais le gros plan de Petit Mamadou ne
        # montre que le mur sous la fenêtre (0,20).
        # 1re règle (« au-dessus de la tête la plus proche ») : les acteurs étant devant le mur, leurs têtes montent haut
        # dans l'image — le houppier finissait à y = 197–268 sur 896, hors des cadres de Maman (JEV 0,38 inchangé).
        cols = mur.any(0); hautc = np.where(cols, mur.argmax(0), 0).astype(np.float32); bas = np.where(cols, H - 1 - mur[::-1].argmax(0), 0).astype(np.float32)
        xs_ = np.nonzero(cols)[0]; hautc = np.interp(np.arange(W), xs_, hautc[xs_]); bas = np.interp(np.arange(W), xs_, bas[xs_])
        bruit = cv2.GaussianBlur(rng.normal(0, 1, (1, W)).astype(np.float32), (0, 0), 0.04 * W)[0]; bruit *= 0.05 * H / max(1e-6, float(np.abs(bruit).max()))
        y_lim = cv2.GaussianBlur((hautc + 0.85 * (bas - hautc)).astype(np.float32)[None], (0, 0), 0.03 * W)[0] + bruit
        px_m = float(np.median((bas - hautc)[cols])) / 2.9   # mur et toit d'une maison basse ≈ 2,9 m : échelle au mur
    else: hautc, bas, px_m = np.zeros(W, np.float32), np.full(W, H - 1.0, np.float32), 0.0
    zone = Y < y_lim[None, :]
    lum = cv2.cvtColor(np.clip(plaque, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
    soleil = np.clip(lum / max(1.0, float(np.percentile(lum[mur], 80))) if mur.any() else 0, 0.35, 1.0)   # un mur à l'ombre en prend moins
    fondu = np.clip((y_lim[None, :] - Y) / (0.08 * H), 0, 1)   # le houppier s'éclaircit vers le bas : pas de bord droit
    poids = cv2.GaussianBlur(mur.astype(np.float32), (0, 0), 0.006 * W) * soleil * fondu
    vol = libre & mur   # papillons : devant la surface même du mur proche (son échelle est connue), loin des acteurs
    mur &= zone
    # HOUPPIER : des grappes de feuilles sur toute la bande de mur (couverture ≈ 50 %, trouées de taches de soleil), chaque
    # grappe suit la branche la plus proche (balancement commun) et chaque feuille frémit à son rythme. Version 1 (grappes
    # rares, plus denses vers le haut) : toutes sur le toit, hors des cadres de Maman — JEV « fond mort » inchangé (0,38).
    F = []
    ys, xs = np.nonzero(mur[::3, ::3]); ys, xs = ys * 3, xs * 3
    if len(xs):
        n_f = int(np.clip(0.75 * mur.sum() / (math.pi * 0.010 * W * 0.0055 * W), 60, 1800)); n_g = max(4, n_f // 12)
        cg = rng.choice(len(xs), n_g, replace=len(xs) < n_g); K = int(np.clip(n_g // 6, 3, 16))
        br = [(float(xs[i]), float(ys[i]), rng.uniform(0.004, 0.008) * W, rng.uniform(0.35, 0.6), rng.uniform(0, 2 * math.pi)) for i in rng.choice(len(xs), K)]
        for g in cg:
            cx, cy = float(xs[g]), float(ys[g]); _, _, A_b, f_b, ph_b = min(br, key=lambda b_: (b_[0] - cx) ** 2 + (b_[1] - cy) ** 2)
            R_g = rng.uniform(0.025, 0.04) * W
            for _ in range(int(rng.integers(8, 17))):
                r, th = R_g * math.sqrt(rng.uniform(0, 1)), rng.uniform(0, 2 * math.pi); a = rng.uniform(0.006, 0.014) * W
                F.append((cx + r * math.cos(th), cy + 0.7 * r * math.sin(th), a, a * rng.uniform(0.45, 0.65), rng.uniform(0, 180),
                          A_b, f_b, ph_b, rng.uniform(0.0015, 0.003) * W, rng.uniform(1.5, 3.0), rng.uniform(0, 2 * math.pi)))
    return dict(H=H, W=W, ciel=ciel, prof=prof, poids=poids, feuilles=np.array(F, np.float32).reshape(-1, 11), mur=mur, y_lim=y_lim,
                mur_haut=np.asarray(hautc, np.float32), mur_bas=np.asarray(bas, np.float32), px_m=px_m, libre=vol[::8, ::8].copy())


def feuillage(V, t, psi=0.0):
    """facteur de lumière (H × W, ≤ 1) : ombre des rameaux au temps t, calculée à demi-résolution puis remontée."""
    H, W = V['H'], V['W']
    if not len(V['feuilles']): return np.ones((H, W), np.float32)
    h, w = H // 2, W // 2; m = np.zeros((h, w), np.float32); g = rafale(t, psi); fr = 0.5 + 0.5 * g
    for x, y, a, b, ang, A_b, f_b, ph_b, A_l, f_l, ph_l in V['feuilles']:
        bx = A_b * g * math.sin(2 * math.pi * f_b * t + ph_b); by = 0.35 * A_b * g * math.sin(2 * math.pi * f_b * t + ph_b + 1.1)
        lx = A_l * fr * math.sin(2 * math.pi * f_l * t + ph_l); ly = 0.6 * A_l * fr * math.cos(2 * math.pi * 1.3 * f_l * t + ph_l)
        cv2.ellipse(m, (int(round((x + bx + lx) / 2)), int(round((y + by + ly) / 2))), (max(1, int(a / 2)), max(1, int(b / 2))),
                    float(ang + 14.0 * fr * math.sin(2 * math.pi * 1.7 * f_l * t + ph_l)), 0, 360, 1.0, -1)
    m = cv2.GaussianBlur(m, (0, 0), 0.0011 * W)                    # pénombre : feuilles à quelques mètres du mur (plus, la forme des feuilles se perd)
    m = cv2.resize(m, (W, H), interpolation=cv2.INTER_LINEAR)
    return (1.0 - FORCE * np.clip(m, 0, 1) * V['poids']).astype(np.float32)


def _trace(img, pts, ep, corps, coul, far, queue=None):
    """silhouette d'oiseau (ailes = ligne brisée plus épaisse près du corps, corps = ellipse, queue = triangle) composée
    sur img là où le fond est plus loin que lui."""
    H, W = img.shape[:2]; P = np.array(pts + ([] if queue is None else queue), np.float32)
    x0, y0 = int(max(0, P[:, 0].min() - 6)), int(max(0, P[:, 1].min() - 6)); x1, y1 = int(min(W, P[:, 0].max() + 7)), int(min(H, P[:, 1].max() + 7))
    if x1 <= x0 or y1 <= y0: return
    q = 4; a = np.zeros(((y1 - y0) * q, (x1 - x0) * q), np.uint8); Q = np.int32((np.array(pts, np.float32) - [x0, y0]) * q)   # ×4 puis réduit
    cv2.polylines(a, [Q], False, 255, max(1, int(round(0.7 * ep * q))), cv2.LINE_AA)                       # mains, fines
    cv2.polylines(a, [Q[1:4]], False, 255, max(1, int(round(1.4 * ep * q))), cv2.LINE_AA)                 # bras, épais
    (cx, cy), (rx, ry) = corps; cv2.ellipse(a, (int((cx - x0) * q), int((cy - y0) * q)), (max(1, int(rx * q)), max(1, int(ry * q))), 0, 0, 360, 255, -1, cv2.LINE_AA)
    if queue is not None: cv2.fillPoly(a, [np.int32((np.array(queue, np.float32) - [x0, y0]) * q)], 255, cv2.LINE_AA)
    al = cv2.resize(a, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA).astype(np.float32) / 255 * far[y0:y1, x0:x1]
    al = cv2.GaussianBlur(al, (0, 0), 0.5)[..., None]
    img[y0:y1, x0:x1] = img[y0:y1, x0:x1] * (1 - al) + np.float32(coul) * al


def _oiseau(x, y, env, bat):
    """ligne des ailes d'un oiseau vu de loin (le « M » que tout le monde lit) d'envergure env : coudes relevés, mains
    qui battent (bat ∈ [-1, 1] ; 0 = plané)."""
    w = env / 2; coude = w * (0.20 + 0.18 * bat); main = w * (0.02 + 0.55 * bat)
    return [(x - w, y - main), (x - 0.42 * w, y - coude), (x, y + 0.04 * w), (x + 0.42 * w, y - coude), (x + w, y - main)]


def oiseaux(V, img, t, vis, t0):
    """dessine les oiseaux du plan (début t0, partie de la plaque toujours visible vis = (x0, y0, x1, y1)) sur img (float32)."""
    H, W = V['H'], V['W']; x0, y0, x1, y1 = [int(round(v)) for v in vis]; x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if x1 - x0 < 20 or y1 - y0 < 20: return img
    C = V['ciel'][y0:y1, x0:x1]
    if C.mean() < 0.04: return img
    if 'far' not in V: V['far'] = cv2.GaussianBlur((V['prof'] < LOIN).astype(np.float32), (0, 0), 1.0)
    img = img.astype(np.float32); rng = np.random.default_rng(int(round(t0 * 100)) + 7); u = t - t0
    dist = cv2.distanceTransform(C.astype(np.uint8), cv2.DIST_L2, 5)
    cy_, cx_ = np.unravel_index(int(np.argmax(dist)), dist.shape); R = float(dist[cy_, cx_])
    # MILAN : cercles lents au cœur du ciel du cadre (période 7 à 10 s), quelques battements toutes les ~3 s.
    # v36 (porte K de la v35 : milan « énorme, noir, net » dans les gros plans de Tantie, physique/échelle/hors contexte
    # sous 0,5) : envergure plafonnée à 2,5 % de la largeur VISIBLE (un rapace à 100 m reste petit même cadré serré),
    # couleur tirée vers le ciel du cadre (perspective aérienne : 40 %), et pas de milan si le ciel du cadre ne le contient pas.
    vw = x1 - x0; env = min(0.034 * W, 0.025 * vw) * rng.uniform(0.9, 1.1)
    cie = img[y0:y1, x0:x1][C > 0.5].reshape(-1, 3).mean(0) if (C > 0.5).any() else np.float32((200, 200, 200))
    c_milan = tuple(float(v) for v in 0.6 * np.float32((52, 44, 38)) + 0.4 * cie); c_hir = tuple(float(v) for v in 0.7 * np.float32((46, 42, 40)) + 0.3 * cie)
    rx = float(np.clip(1.2 * R, 1.0 * env, 0.4 * (x1 - x0))); ry = 0.35 * rx
    if R < 0.7 * env: rx = 0.0   # ciel trop mince pour lui : on ne garde que les hirondelles
    om = 2 * math.pi / rng.uniform(7, 10) * rng.choice([-1, 1]); th = rng.uniform(0, 2 * math.pi) + om * u
    mx, my = x0 + cx_ + rx * math.cos(th), y0 + cy_ + ry * math.sin(th)
    k = (u + rng.uniform(0, 3)) % 3.2; bat = math.sin(2 * math.pi * 2.6 * k) if k < 0.75 else 0.08 * math.sin(2 * math.pi * 0.5 * u)
    vx = -om * rx * math.sin(th); sg = 1.0 if vx >= 0 else -1.0   # queue fourchue derrière, du côté d'où il vient
    queue = [(mx - sg * 0.05 * env, my + 0.02 * env), (mx - sg * 0.24 * env, my - 0.03 * env), (mx - sg * 0.22 * env, my + 0.07 * env)]
    if rx > 0: _trace(img, _oiseau(mx, my, env, bat), 0.07 * env, ((mx, my + 0.02 * env), (0.11 * env, 0.05 * env)), c_milan, V['far'], queue)
    # HIRONDELLES : traversées du ciel du cadre, une toutes les ~2,4 s, à deux ou trois
    rows = np.nonzero(C.mean(1) > 0.5)[0]
    if len(rows):
        ya, yb = y0 + rows.min(), y0 + rows.max()
        for n in range(int(u // 2.4) - 1, int(u // 2.4) + 2):
            r2 = np.random.default_rng(int(round(t0 * 100)) * 31 + n + 1000); tn = n * 2.4 + r2.uniform(0, 0.8); dur = r2.uniform(1.4, 2.2)
            if not 0 <= u - tn <= dur: continue
            s_ = r2.choice([-1, 1]); yv = r2.uniform(ya + 0.15 * (yb - ya), ya + 0.85 * (yb - ya)); e2 = min(0.012 * W, 0.012 * vw) * r2.uniform(0.85, 1.15)
            for j in range(int(r2.integers(2, 4))):
                p = (u - tn - 0.12 * j) / dur
                if not 0 <= p <= 1: continue
                bx = x0 - e2 + (x1 - x0 + 2 * e2) * (p if s_ > 0 else 1 - p); by = yv + 0.06 * (yb - ya) * math.sin(2 * math.pi * (0.7 * p + 0.2 * j)) + 0.6 * e2 * j
                b2 = math.sin(2 * math.pi * 7.0 * (u + 0.05 * j)) if (u + 0.3 * j) % 0.9 < 0.55 else 0.25
                _trace(img, _oiseau(bx, by, e2, b2), 0.09 * e2, ((bx, by + 0.03 * e2), (0.10 * e2, 0.06 * e2)), c_hir, V['far'])
    return img


# PAPILLONS (v35, 3e greffe) : feuillage seul, JEV plafonnait vers 0,5 sur la cour (Baye 0,50, Maman 0,55, Petit Mamadou 0,31 ;
# balancement doublé : pas mieux) — ce qu'il voit sans hésiter, ce sont des BÊTES qui bougent. Devant le mur, dans chaque cadre :
# un ou deux monarques africains (Danaus chrysippus, le papillon orange le plus commun d'Afrique de l'Ouest), 6 cm
# d'envergure à l'échelle du mur, dans la plus grande partie du mur libre du cadre, vol hésitant (somme de sinus lents), battements à 5–6 Hz, derrière les acteurs.
COUL_PAP = ((232, 128, 34), (238, 150, 46))


def _boite_libre(L, x0, y0, x1, y1, q=8):
    """plus grand rectangle (pixels de la plaque) entièrement libre dans [x0, x1] × [y0, y1], sur la grille L (1/q)."""
    a0, b0, a1, b1 = int(x0 // q), int(y0 // q), int(x1 // q), int(y1 // q); G = L[b0:b1, a0:a1]
    if G.size == 0: return None
    h = np.zeros(G.shape[1], np.int32); best = (0, None)
    for r in range(G.shape[0]):   # histogrammes empilés : plus grand rectangle sous chaque ligne
        h = np.where(G[r], h + 1, 0); pile = []
        for c in range(len(h) + 1):
            v = h[c] if c < len(h) else 0; d = c
            while pile and pile[-1][1] >= v:
                d, hv = pile.pop(); aire = hv * (c - d)
                if aire > best[0]: best = (aire, (d, r - hv + 1, c, r + 1))
            pile.append((d, v))
    if best[1] is None: return None
    c0, r0, c1, r1 = best[1]; return ((a0 + c0) * q, (b0 + r0) * q, (a0 + c1) * q, (b0 + r1) * q)


def papillons(V, img, t, vis, t0):
    """dessine les papillons du plan (début t0, partie de plaque toujours visible vis) devant le mur LIBRE (loin des
    acteurs), sur img (float32). Version 1 (tout le mur du cadre) : dans le gros plan de Petit Mamadou, un papillon net
    passait entre lui et Maman, sur le mur reconstitué flou — JEV : taille 0,66, hors contexte 0,60, physique 0,70 ;
    version 2 (les rangées du mur) : au poulet, des papillons à l'échelle du mur proche volaient devant le mur lointain —
    « échelle » 0,44. Ils restent devant la surface du mur proche."""
    if V['px_m'] <= 0: return img
    H, W = V['H'], V['W']; x0, y0, x1, y1 = [float(v) for v in vis]
    xa, xb = max(0.0, x0), min(float(W), x1); xs_ = np.arange(int(xa), int(xb)) if xb > xa + 20 else None
    if xs_ is None: return img
    ya = max(y0, float(np.median(V['mur_haut'][xs_]))); yb = min(y1, float(np.median(V['mur_bas'][xs_])))
    env = 0.06 * V['px_m']; cle = (round(xa), round(ya), round(xb), round(yb)); B_ = V.setdefault('_boites', {})
    if cle not in B_:   # les deux plus grandes parties libres du mur dans le cadre (une fois par plan) : un papillon dans chacune
        L = V['libre'].copy(); B_[cle] = []
        for _ in range(2):
            bx_ = _boite_libre(L, xa, ya, xb, yb) if yb - ya > 20 else None
            if bx_ is None or bx_[2] - bx_[0] < 3 * env or bx_[3] - bx_[1] < 2 * env: break
            B_[cle].append([float(v) for v in bx_]); L[bx_[1] // 8:bx_[3] // 8, bx_[0] // 8:bx_[2] // 8] = False
    boites = B_[cle]
    if not boites: return img
    img = img.astype(np.float32); mx_, my_ = 0.6 * env, 0.6 * env
    # en COUPLE dans chaque partie libre : le second suit le premier à 0,35 s (la poursuite des papillons), un peu décalé
    for k, (xa, ya, xb, yb, retard) in enumerate([(*b_, r_) for b_ in boites for r_ in (0.0, 0.35)]):
        r = np.random.default_rng(int(round(t0 * 100)) * 7 + k // 2 + 500); u = t - t0 - retard
        fx, fy = r.uniform(0.15, 0.35, 3) * [1, 2.3, 5.1], r.uniform(0.15, 0.35, 3) * [1, 2.1, 4.7]; px, py = r.uniform(0, 2 * math.pi, 3), r.uniform(0, 2 * math.pi, 3)
        ax, ay = np.array([0.30, 0.10, 0.04]), np.array([0.26, 0.10, 0.05])
        def pos(v):
            return (xa + mx_ + (xb - xa - 2 * mx_) * (0.5 + 0.5 * float(np.clip(np.sum(ax / ax.sum() * np.sin(2 * math.pi * fx * v + px)), -1, 1))),
                    ya + my_ + (yb - ya - 2 * my_) * (0.5 + 0.5 * float(np.clip(np.sum(ay / ay.sum() * np.sin(2 * math.pi * fy * v + py)), -1, 1))))
        (x, y), (xn, yn) = pos(u), pos(u + 0.05); cap = math.atan2(yn - y, xn - x)
        if retard: x, y = x + 0.5 * env * math.sin(2 * math.pi * 0.8 * u), y - 0.6 * env * (1 + math.cos(2 * math.pi * 0.6 * u))
        f_b = r.uniform(5.0, 6.0); kb = abs(math.cos(2 * math.pi * f_b * u + r.uniform(0, 6.3))); kb = 0.18 + 0.82 * kb   # ailes vues ouvertes → de chant
        y += 0.06 * env * math.sin(2 * math.pi * f_b * u)                                                                 # il monte et descend à chaque battement
        q = 4; R_ = int(env * 0.9) + 4; X0, Y0 = int(x) - R_, int(y) - R_; X1, Y1 = int(x) + R_ + 1, int(y) + R_ + 1
        if X0 < 0 or Y0 < 0 or X1 > W or Y1 > H: continue
        al = np.zeros(((Y1 - Y0) * q, (X1 - X0) * q), np.uint8); co = np.zeros(al.shape + (3,), np.float32)
        ca, sa = math.cos(cap), math.sin(cap); c_ = ((x - X0) * q, (y - Y0) * q)
        def ell(off_l, off_p, a_, b_, ang, coul):
            cx = c_[0] + q * (off_l * ca - off_p * sa); cy = c_[1] + q * (off_l * sa + off_p * ca)
            m = np.zeros_like(al); cv2.ellipse(m, (int(cx), int(cy)), (max(1, int(a_ * q)), max(1, int(b_ * q))), math.degrees(cap) + ang, 0, 360, 255, -1, cv2.LINE_AA)
            np.maximum(al, m, out=al); co[m > 0] = coul
        for sgn in (-1, 1):   # ailes postérieures, puis antérieures (bout noir, comme le monarque africain)
            ell(-0.08 * env, sgn * 0.20 * env * kb, 0.15 * env, 0.13 * env * kb + 0.01 * env, 0, COUL_PAP[1])
            ell(0.07 * env, sgn * 0.27 * env * kb, 0.22 * env, 0.15 * env * kb + 0.01 * env, sgn * -18, COUL_PAP[0])
            ell(0.14 * env, sgn * 0.42 * env * kb, 0.08 * env, 0.06 * env * kb + 0.01 * env, sgn * -18, (40, 30, 26))
        ell(0.0, 0.0, 0.24 * env, 0.035 * env, 0, (38, 30, 26))   # corps
        # au flou du mur derrière les acteurs (la mise au point est sur eux) : 1 px de la plaque
        a2 = cv2.GaussianBlur(cv2.resize(al, (X1 - X0, Y1 - Y0), interpolation=cv2.INTER_AREA).astype(np.float32) / 255, (0, 0), 1.0)[..., None]
        c2 = cv2.GaussianBlur(cv2.resize(co, (X1 - X0, Y1 - Y0), interpolation=cv2.INTER_AREA), (0, 0), 1.0) / np.maximum(a2, 1e-3)
        img[Y0:Y1, X0:X1] = img[Y0:Y1, X0:X1] * (1 - a2) + np.clip(c2, 0, 255) * a2
    return img



# OMBRE DES BÊTES PEINTES (v35) : le nouveau cadre à deux du poulet (parleurs à l'image) montre une poule PEINTE dans la
# plaque, sans ombre franche — JEV, porte G, « ombre » 0,53 (0,05 sur l'ancien cadre serré). Les poules peintes sont déjà
# localisées (betes.json : découpe, pieds, hauteur) ; leur ombre est celle de toute créature du moteur (physique.ombre :
# projetée dans la direction et à la longueur mesurées sur le tableau, plus l'ombre de contact), jamais sur la bête même.
def ombres_peintes(img, plaque, L, masques=(), seuil=0.985, journal=print):
    """img : l'image de la scène (où les bêtes peintes sont cherchées, comme entites.betes_peintes) ; plaque : où poser
    leur ombre ; masques : ceux des acteurs (l'ombre ne s'y pose pas). Version 1 (positions lues dans betes.json) : ombre
    posée à côté ; version 2 (découpe moins les masques des acteurs) : la découpe « peinte-1 » contient aussi la main et la
    jambe de Modou, et le masque de Modou recouvre la poule. La bête est donc DÉTOURÉE PAR SAM 2.1 (linge.detoure), amorcé
    au cœur de ses pixels clairs ; ses pattes sont mesurées sur ce détourage."""
    import entites, physique, linge
    if not L: return plaque
    H, W = plaque.shape[:2]; out = plaque.astype(np.float32); n = 0
    occ = np.zeros((H, W), np.float32)
    for m_ in masques: occ = np.maximum(occ, ((m_ if m_.ndim == 2 else m_[..., 0]) > 0.3).astype(np.float32))
    lum = cv2.cvtColor(img, cv2.COLOR_RGB2LAB)[..., 0]
    for nom in ('peinte-1', 'peinte-2'):
        sp = cv2.imread(f'{entites.DOSSIER}/{nom}.png', cv2.IMREAD_UNCHANGED)
        if sp is None or sp.shape[2] < 4 or sp.shape[0] >= H or sp.shape[1] >= W: continue
        m = (sp[..., 3] > 128).astype(np.uint8)
        r = cv2.matchTemplate(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), sp[..., :3], cv2.TM_CCORR_NORMED, mask=np.dstack([m] * 3))
        _, v, _, (X0, Y0) = cv2.minMaxLoc(r)
        if v < seuil: continue
        h_, w_ = m.shape; zone = np.zeros((H, W), bool); zone[Y0:Y0 + h_, X0:X0 + w_] = m > 0
        clair = zone & (lum > np.percentile(lum[zone], 60))   # le corps de la poule (plumes claires), pas une main ni un pantalon
        ys, xs = np.nonzero(clair)
        if len(ys) < 30: continue
        k = int(np.argmin((xs - np.median(xs)) ** 2 + (ys - np.median(ys)) ** 2)); graine = (float(xs[k]), float(ys[k]))
        mk, sc = linge.detoure(img, [graine]); best = None
        for j in np.argsort(-sc[0]):
            a = mk[0][j]; A = int(a.sum())
            if A < 0.25 * m.sum() or A > 1.6 * m.sum() or (a & zone).sum() < 0.6 * A: continue
            best = a; break
        if best is None: continue
        a = best.astype(np.float32); ys, xs = np.nonzero(best)
        haut = float(ys.max() - ys.min()); px = float(np.median(xs[ys > ys.max() - 0.06 * haut])); py = float(ys.max())
        proj, contact = physique.ombre(a, (px, py), haut, L, H, W)
        hors = (1.0 - np.clip(cv2.dilate(a, np.ones((3, 3), np.uint8)), 0, 1)) * (1.0 - occ)   # sur le sol : ni sur la poule, ni sur un acteur
        out = physique.applique_ombre(out, (proj * hors, contact * hors), L); n += 1
        journal(f"bête peinte {nom} retrouvée ({v:.3f}), détourée par SAM 2.1, pattes ({px:.0f}, {py:.0f}), {haut:.0f} px : ombre physique "
                f"(direction {[round(x, 2) for x in L.get('dir', [])]}, longueur {L.get('longueur', 0):.2f})")
    return np.clip(out, 0, 255).astype(np.uint8) if n else plaque


def carte(V, plaque):
    """image de contrôle : la plaque avec l'ombre des rameaux à t = 0 et, teinté de bleu, le ciel où volent les oiseaux."""
    im = plaque.astype(np.float32) * feuillage(V, 0.0)[..., None]
    im[V['ciel']] = 0.6 * im[V['ciel']] + 0.4 * np.float32([60, 120, 255])
    return np.clip(im, 0, 255).astype(np.uint8)
