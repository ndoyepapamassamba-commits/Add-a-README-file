# PLAQUE DU DÉCOR SANS AUCUN ACTEUR (17/10/2026). Vu sur la scène « cour » : l'ancienne plaque n'effaçait que le HAUT des
# acteurs (les jambes restaient peintes dans le décor) et LaMa, appliqué à toute l'image réduite à 512 px, y laissait des
# traînées floues (le tablier de Maman, la tête de Baye) — elles apparaissaient dès qu'un corps bougeait.
#   · le trou = la découpe affinée de chaque personne (le linge, la chaise, le décor pris dans l'ancienne découpe restent :
#     ce sont les VRAIS pixels de l'image) ;
#   · LaMa (Suvorov et al. 2022, Apache-2.0) à la résolution d'origine, par fenêtres de 512 × 512 qui avancent du bord du
#     trou vers son centre, bande après bande (« pelure d'oignon ») : chaque fenêtre voit du vrai décor et ce que les
#     fenêtres précédentes ont reconstitué ; le grain du dessin est ensuite rendu à la zone reconstituée ;
#   · complétion AMODALE : là où un acteur en cache un autre (Petit Mamadou devant la robe de Maman), la partie cachée
#     de celui de derrière est reconstituée (l'acteur de devant effacé, la personne re-segmentée) — quand celui de devant
#     bouge, on voit la robe, pas un trou.
import numpy as np, cv2
import gestes


def lama512(win, mk):
    """LaMa sur une fenêtre 512 × 512, sans rééchantillonnage."""
    return gestes.remplit(win, (mk > 0).astype(np.uint8))


def remplit_progressif(img, trou, bande=96, pas=160, marge=40, passes=12):
    """reconstitue tous les pixels du trou à la résolution d'origine, du bord vers le centre."""
    out = img.copy(); reste = (trou > 0).astype(np.uint8); H, W = reste.shape
    if H < 512 or W < 512: return gestes.remplit(out, reste)
    for _ in range(passes):
        if not reste.any(): break
        dist = cv2.distanceTransform(reste, cv2.DIST_L2, 5)
        cible = (reste > 0) & (dist <= bande)
        ys, xs = np.nonzero(cible)
        x0s = list(range(max(0, xs.min() - 256), max(1, min(W - 512, xs.max() - 256) + 1), pas)) or [0]
        y0s = list(range(max(0, ys.min() - 256), max(1, min(H - 512, ys.max() - 256) + 1), pas)) or [0]
        x0s = sorted(set(min(W - 512, max(0, v)) for v in x0s + [min(W - 512, max(0, xs.max() - 256))]))
        y0s = sorted(set(min(H - 512, max(0, v)) for v in y0s + [min(H - 512, max(0, ys.max() - 256))]))
        fait = np.zeros_like(reste)
        for y0 in y0s:
            for x0 in x0s:
                mk = reste[y0:y0 + 512, x0:x0 + 512]
                if not mk.any() or mk.mean() > 0.6: continue
                ok = cible[y0:y0 + 512, x0:x0 + 512].copy()
                # pas les bords de la fenêtre (contexte d'un seul côté), sauf au bord de l'image
                if x0 > 0: ok[:, :marge] = False
                if y0 > 0: ok[:marge, :] = False
                if x0 + 512 < W: ok[:, -marge:] = False
                if y0 + 512 < H: ok[-marge:, :] = False
                ok &= mk > 0
                if not ok.any(): continue
                r = lama512(out[y0:y0 + 512, x0:x0 + 512], mk)
                sub = out[y0:y0 + 512, x0:x0 + 512]; sub[ok] = r[ok]
                reste[y0:y0 + 512, x0:x0 + 512][ok] = 0; fait[y0:y0 + 512, x0:x0 + 512][ok] = 1
        if not fait.any():   # plus aucune fenêtre n'a assez de contexte : le reste en une fois, réduit
            out = gestes.remplit(out, reste); break
    return out


def grain(fond, orig, trou):
    """rend à la zone reconstituée l'énergie des hautes fréquences du décor autour (gain ≤ 2,5)."""
    f = fond.astype(np.float32); bas = cv2.GaussianBlur(f, (0, 0), 1.6); haut = f - bas
    o = orig.astype(np.float32); ho = o - cv2.GaussianBlur(o, (0, 0), 1.6)
    dedans = cv2.erode(trou, np.ones((5, 5), np.uint8)) > 0
    autour = (cv2.dilate(trou, np.ones((41, 41), np.uint8)) > 0) & (trou == 0)
    if not dedans.any() or autour.sum() < 50: return fond
    g = float(np.clip(np.sqrt(ho[autour].var() / max(1e-6, haut[dedans].var())), 1.0, 2.5))
    m = cv2.GaussianBlur((trou > 0).astype(np.float32), (0, 0), 2)[..., None]
    return np.clip(bas + haut * (1 + (g - 1) * m), 0, 255).astype(np.uint8)


def plaque_pleine(img, alphas, halo=6):
    """le décor sans aucun acteur : trou = découpes affinées (+ halo), reconstitution progressive à pleine résolution."""
    trou = np.zeros(img.shape[:2], np.uint8)
    for a in alphas: trou |= (a > 0.02).astype(np.uint8)
    trou = cv2.dilate(trou, np.ones((2 * halo + 1, 2 * halo + 1), np.uint8))
    return grain(remplit_progressif(img, trou), img, trou), trou


def inventions(plaque_, trou, taille_min=30, anneau=61, seuil=15.0):
    """objets INVENTÉS par le remplissage ou restes d'acteur dans la zone des acteurs (vu le 17/10 : un bout du maillot vert
    de Petit Mamadou recopié en « bouteille » près de la porte de la cour) : pixels du trou dont la COULEUR n'existe nulle
    part dans le décor tout autour (écart Lab ΔE76 > seuil au plus proche voisin), et toute personne (ADE20K). La seule
    classe sémantique ne suffit pas : ADE20K appelle « table » une chaise vue en partie. → masque uint8, liste des zones."""
    from scipy.spatial import cKDTree
    import objets
    H, W = trou.shape; dedans = trou > 0
    autour = (cv2.dilate(trou, np.ones((anneau, anneau), np.uint8)) > 0) & ~dedans
    if not dedans.any() or autour.sum() < 100: return np.zeros((H, W), np.uint8), []
    lab = cv2.cvtColor(plaque_, cv2.COLOR_RGB2LAB).astype(np.float32); lab[..., 0] *= 100 / 255; lab[..., 1:] -= 128
    ref = lab[autour]; rng = np.random.default_rng(0)
    if len(ref) > 40000: ref = ref[rng.choice(len(ref), 40000, replace=False)]
    d = cKDTree(ref).query(lab[dedans], k=1, workers=-1)[0]
    neuf = np.zeros((H, W), bool); neuf[dedans] = d > seuil
    P = objets.probas(plaque_, {'personne': [objets.PERSONNE]})
    if P is not None: neuf |= dedans & (P['personne'] > 0.5)
    neuf = cv2.morphologyEx(neuf.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab_, st, ce = cv2.connectedComponentsWithStats(neuf)
    out = np.zeros((H, W), np.uint8); liste = []
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < taille_min: continue
        out |= (lab_ == i).astype(np.uint8); liste.append((int(st[i, cv2.CC_STAT_AREA]), (int(ce[i][0]), int(ce[i][1]))))
    return out, liste


def nettoie(img, plaque_, trou, passes=2, journal=None):
    """rebouche les objets inventés (inventions) jusqu'à ce qu'il n'y en ait plus (au plus « passes » fois)."""
    faits = []
    for _ in range(passes):
        m, liste = inventions(plaque_, trou)
        if not liste: break
        faits += liste; m = cv2.dilate(m, np.ones((15, 15), np.uint8))
        plaque_ = grain(remplit_progressif(plaque_, m, passes=4), img, m)
        if journal: journal(f'  restes et objets inventés rebouchés (aire, centre) : {liste}')
    return plaque_, faits


def ordre_profondeur(alphas):
    """du plus loin au plus près : le bas de la silhouette (les pieds) le plus haut dans l'image est le plus loin."""
    bas = [float(np.nonzero((a > 0.5).any(1))[0].max()) if (a > 0.5).any() else 0.0 for a in alphas]
    return list(np.argsort(bas))


def amodal(img, alphas, bande=16, personne=None, opaque=True, fondu=4, contact=12, liseré=6):
    """pour chaque acteur caché en partie par un acteur plus proche : (alpha étendue, image complétée). Seule la bande où
    un petit mouvement de celui de devant peut découvrir celui de derrière est reconstituée (LaMa continue la robe à
    partir de son bord visible) : quand Petit Mamadou bouge, on voit la robe de Maman, pas le mur.
    OPAQUE ET SANS TROU ENTRE DEUX PERSONNES (18/10/2026) : v29 et v30 jugées par JEV — 260 des 399 images « rendu » de la
    v29 venaient du bras de Maman Nounou vu EN TRANSPARENCE contre Petit Mamadou. La bande reconstituée s'effaçait sur
    toute sa largeur (1 − d/16 : à moitié transparente à 8 px du bord visible) et la découpe du bras collé à l'enfant
    restait partielle (alpha 0,02–0,98 sur tout l'avant-bras) : dès que l'un ou l'autre bougeait, le mur apparaissait à
    travers. Désormais la partie reconstituée est opaque jusqu'à `fondu` px de sa limite, et au contact de celui de
    devant (à `contact` px), là où la segmentation voit une personne (`personne` > 0,7), celui de derrière est opaque :
    entre deux personnes il n'y a pas de décor. opaque=False : l'ancien fondu (banc de comparaison).
    LISERÉ DE CELUI DE DEVANT (18/10/2026, v34) : v33 jugée par JEV — « bras de Maman » 0,54 à 0,74 dès que Petit Mamadou
    bouge (0,11 sur la peinture d'origine). La lumière de contour peinte autour de ses cheveux et de son oreille (3 à 6 px)
    n'est pas dans sa découpe : elle restait sur le bras de Maman (traits blancs, cercle d'oreille fantôme) et LaMa, qui la
    voyait, la recopiait dans la partie reconstituée. Désormais LaMa ne voit pas ce liseré (trou élargi de `liseré` px) et,
    chez celui de derrière, l'anneau de `liseré` px autour de celui de devant est repeint par la même reconstitution."""
    n = len(alphas); ordre = ordre_profondeur(alphas); rang = {k: i for i, k in enumerate(ordre)}; out = []
    for i in range(n):
        A = (alphas[i] > 0.5).astype(np.uint8)
        cache = np.zeros(A.shape, np.uint8)
        for j in range(n):
            if j != i and rang[j] > rang[i]: cache |= (alphas[j] > 0.02).astype(np.uint8)
        visible = A & (1 - cache)
        if not cache.any() or not visible.any(): out.append((alphas[i], img)); continue
        d = cv2.distanceTransform((1 - visible).astype(np.uint8), cv2.DIST_L2, 5)
        zone = (cache > 0) & (d < bande)
        if zone.sum() < 30: out.append((alphas[i], img)); continue
        r_ = max(2, int(liseré)); cache_l = cv2.dilate(cache, np.ones((2 * r_ + 1, 2 * r_ + 1), np.uint8))
        sans = remplit_progressif(img, cache_l, bande=bande + 8 + r_, passes=1)
        ext = (np.clip((bande - d) / fondu, 0, 1) if opaque else np.clip(1 - d / bande, 0, 1)) * zone
        a2 = np.maximum(alphas[i], cv2.GaussianBlur(ext.astype(np.float32), (0, 0), 0.8))
        if opaque and personne is not None:   # au contact de celui de devant, hors de lui : sa propre découpe partielle comblée
            pres = cv2.dilate(cache, np.ones((2 * contact + 1, 2 * contact + 1), np.uint8)) > 0
            couvre = pres & (cache == 0) & (d < 6) & (personne > 0.7)
            a2 = np.where(couvre, np.maximum(a2, np.clip((personne - 0.7) / 0.2, 0, 1)), a2)
        im2 = np.where((ext > 0)[..., None], sans, img)
        if liseré:   # l'anneau autour de celui de devant, chez celui de derrière : repeint (fondu sur ses 2 derniers px)
            dc = cv2.distanceTransform((1 - cache).astype(np.uint8), cv2.DIST_L2, 5)
            w_ = (np.clip((r_ + 1 - dc) / 2.0, 0, 1) * ((cache == 0) & (A > 0)))[..., None]
            im2 = np.clip(im2.astype(np.float32) * (1 - w_) + sans.astype(np.float32) * w_, 0, 255).astype(img.dtype)
        out.append((a2.astype(np.float32), im2))
    return out, ordre


def retracte_fils(img, plaque_, faits, alphas, juge=None, journal=print):
    """FIL RACCOURCI À UN APPUI CHOISI PAR JEV (18/10/2026, v35) — v33 jugée par JEV : le fil à linge prolongé jusqu'à la
    fenêtre « traverse la tête » de Maman (0,88–0,91 sur ses plans) ; tel que peint, il s'arrêtait déjà dans sa tête
    (0,50–0,60). Un fil qui entre dans un acteur à HAUTEUR DE TÊTE n'est plus prolongé derrière lui : il est raccourci à un
    appui vertical franc AVANT la tête (montant de porte, bord de rideau, poteau), noué là, et tout ce qui suivait (bout
    peint jusqu'à la tête, prolongement) est effacé (Telea, bande mince). Les appuis candidats (jusqu'à 4, en remontant le
    fil) sont jugés par `juge(images)` (probabilité de défaut de chaque image : la scène autour de la tête, fil raccourci) ;
    le plus sûr est gardé. → (plaque, fils restants, fils raccourcis)"""
    H, W = img.shape[:2]; g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    gx = np.abs(cv2.Sobel(cv2.GaussianBlur(g, (0, 0), 1.2).astype(np.float32), cv2.CV_32F, 1, 0))
    un = np.zeros((H, W), np.float32)
    for a in alphas: un = np.maximum(un, a)
    acteur = un > 0.3; out = plaque_.copy(); gardes, coupes = [], []
    dedans = lambda p: 0 <= int(round(p[1])) < H and 0 <= int(round(p[0])) < W
    def efface(im, de_, a_, d, e):
        mk = np.zeros((H, W), np.uint8)
        A = tuple(int(round(v * 16)) for v in de_ + d * 2); B = tuple(int(round(v * 16)) for v in a_ + d * 6)
        cv2.line(mk, A, B, 255, int(round(e + 6)), cv2.LINE_8, 4)
        cv2.circle(mk, (int(round(a_[0])), int(round(a_[1]))), int(round(e)) + 5, 255, -1)
        return cv2.inpaint(im, mk, 5, cv2.INPAINT_TELEA)
    def noeud(im, p_, coul, e):
        im = im.copy(); cv2.circle(im, (int(round(p_[0])), int(round(p_[1]))), max(2, int(round(e)) + 1), coul, -1, cv2.LINE_AA); return im
    for f_ in faits:
        de, a_ = np.array(f_['de'], np.float64), np.array(f_['a'], np.float64); d = (a_ - de) / max(1e-6, np.linalg.norm(a_ - de))
        q = de + d * 6; k_ = int(np.argmax([float(al[int(round(q[1])), int(round(q[0]))]) for al in alphas])) if dedans(q) else 0
        ys_ = np.nonzero((alphas[k_] > 0.5).any(1))[0]; y0_, y1_ = (float(ys_.min()), float(ys_.max())) if len(ys_) else (0.0, float(H))
        if de[1] > y0_ + 0.25 * (y1_ - y0_): gardes.append(f_); continue   # à hauteur de buste : le prolongement reste
        appuis, k = [], 6
        while k < 420 and len(appuis) < 4:   # en remontant le fil, les bords verticaux francs hors des acteurs
            p_ = de - d * k
            if not dedans(p_): break
            yy, xx = int(round(p_[1])), int(round(p_[0]))
            if not acteur[yy, xx] and np.median(gx[max(0, yy - 6):yy + 7, xx]) > 25: appuis.append(p_); k += 20; continue
            k += 1
        if not appuis: gardes.append(f_); continue
        e = float(f_.get('epaisseur', 3.0)); coul = tuple(float(c) * 0.5 for c in f_.get('couleur', (120, 100, 80)))
        choix, notes = 0, None
        if juge is not None and len(appuis) > 1:
            hy = 0.5 * (y1_ - y0_); cx, cy = float(de[0]), float(de[1]); w_ = int(1.1 * hy); h_ = int(0.88 * hy)
            x0, y0 = int(max(0, min(W - 2 * w_, cx - w_))), int(max(0, min(H - 2 * h_, cy - 0.8 * h_)))
            vues = [noeud(efface(img, ap, de, d, e), ap, coul, e)[y0:y0 + 2 * h_, x0:x0 + 2 * w_] for ap in appuis]
            notes = [round(float(n_), 2) for n_ in juge(vues)]; choix = int(np.argmin(notes))
        appui = appuis[choix]
        out = noeud(efface(out, appui, a_, d, e), appui, coul, e)
        coupes.append(dict(de=[round(float(v), 1) for v in appui], efface_jusqua=[round(float(v), 1) for v in a_], appuis=[[round(float(v), 1) for v in ap] for ap in appuis], notes_jev=notes))
        journal(f'fil raccourci à son appui ({appui[0]:.0f}, {appui[1]:.0f}) : il entrait dans une tête à ({de[0]:.0f}, {de[1]:.0f}) ; appuis jugés {notes}')
    return out, gardes, coupes


def fils(img, plaque_, alphas, longueur_min=90, angle_max=30):
    """fils et lignes fines (fil à linge, câble) qui disparaissent derrière un acteur sans ressortir de l'autre côté
    (vu le 17/10 : le fil s'arrêtait dans la tête de Maman) : prolongés dans la plaque, même pente, jusqu'au premier appui
    vertical (cadre de fenêtre, coin de mur, poteau), avec un point d'attache. Segments : LSD (von Gioi et al. 2012)."""
    H, W = img.shape[:2]; un = np.zeros((H, W), np.float32)
    for a in alphas: un = np.maximum(un, a)
    acteur = un > 0.3; g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    hauteurs = []   # étendue verticale de chaque acteur : un fil coupé par un acteur passe à hauteur de tête ou de buste
    for a in alphas:
        ys_ = np.nonzero((a > 0.5).any(1))[0]; hauteurs.append((float(ys_.min()), float(ys_.max())) if len(ys_) else (0.0, float(H)))
    segs = cv2.createLineSegmentDetector().detect(g)[0]
    if segs is None: return plaque_, []
    gx = np.abs(cv2.Sobel(cv2.GaussianBlur(g, (0, 0), 1.2).astype(np.float32), cv2.CV_32F, 1, 0))
    out = plaque_.copy(); faits = []
    dedans = lambda p: 0 <= int(round(p[1])) < H and 0 <= int(round(p[0])) < W
    def contraste(p, d):   # crête : ligne fine plus claire (ou plus sombre) que ses DEUX voisinages (pas un simple bord)
        n = np.array([-d[1], d[0]]); best = 0.0
        for o in (-2, -1, 0, 1, 2):
            v = []
            for k in (0, -4, 4):
                q = p + n * (o + k)
                if not dedans(q): return 0.0
                v.append(float(g[int(round(q[1])), int(round(q[0]))]))
            a, b = v[0] - v[1], v[0] - v[2]
            if a * b > 0: best = max(best, min(abs(a), abs(b)))
        return best
    for x1, y1, x2, y2 in np.asarray(segs).reshape(-1, 4):
        p1, p2 = np.array([x1, y1], np.float64), np.array([x2, y2], np.float64); L = float(np.linalg.norm(p2 - p1))
        if L < longueur_min: continue
        d = (p2 - p1) / L; ang = abs(np.degrees(np.arctan2(d[1], d[0])))
        if min(ang, 180 - ang) > angle_max: continue
        ts = np.linspace(0, 1, 40); pts = p1[None] + (p2 - p1)[None] * ts[:, None]
        if np.mean([acteur[int(round(q[1])), int(round(q[0]))] for q in pts if dedans(q)]) > 0.2: continue
        c_ref = np.median([contraste(q, d) for q in pts])
        if c_ref < 6: continue
        # couleur et épaisseur DU FIL (au centre de la crête, pas sur son bord)
        nrm = np.array([-d[1], d[0]]); cols, larg, centres = [], [], []
        for q in pts[3:-3:2]:
            prof = [(o, g[int(round((q + nrm * o)[1])), int(round((q + nrm * o)[0]))]) for o in np.arange(-5, 5.5, 0.5) if dedans(q + nrm * o)]
            if len(prof) < 21: continue
            v = np.array([p_[1] for p_ in prof], np.float32); fondv = 0.5 * (v[:3].mean() + v[-3:].mean()); dv = v - fondv
            o_ = int(np.argmax(np.abs(dv)))
            if abs(dv[o_]) < 0.5 * c_ref: continue
            w_ = np.clip(np.abs(dv) - 0.5 * abs(dv[o_]), 0, None); oc = float((w_ * np.array([p_[0] for p_ in prof])).sum() / max(1e-6, w_.sum()))
            larg.append(0.5 * int((np.abs(dv) > 0.5 * abs(dv[o_])).sum())); c_ = q + nrm * oc; centres.append(c_)
            cols.append((abs(dv[o_]) * (1.0 if fondv < 90 else 0.5), img[int(round(c_[1])), int(round(c_[0]))]))
        if len(centres) < 5: continue
        # axe du fil : droite ajustée sur les centres de la crête (pas sur le bord détecté)
        C_ = np.array(centres); m_ = C_.mean(0); _, _, vt = np.linalg.svd(C_ - m_); d = vt[0] * (1 if vt[0] @ d > 0 else -1)
        proj = (C_ - m_) @ d; p1, p2 = m_ + d * proj.min(), m_ + d * proj.max(); L = float(proj.max() - proj.min())
        cols.sort(key=lambda x: -x[0]); coul = np.median(np.array([c for _, c in cols[:max(3, len(cols) // 4)]], np.float32), 0)
        epais = float(np.clip(np.median(larg), 1.5, 4.0))
        for e, sg in ((p2, 1.0), (p1, -1.0)):
            u = d * sg; t = 0.0; touche = False
            while t < 40:
                q = e + u * t
                if not dedans(q): break
                if acteur[int(round(q[1])), int(round(q[0]))]: touche = True; break
                t += 1
            if not touche: continue
            # vu le 17/10 (chambre) : un bord d'ombre au sol, coupé par les pieds de Tantie Awa, était « réparé » en fil noir
            k_ = int(np.argmax([float(a_[int(round(q[1])), int(round(q[0]))]) for a_ in alphas])); y0_, y1_ = hauteurs[k_]
            if q[1] > y0_ + 0.6 * (y1_ - y0_): continue
            debut = e + u * max(0.0, t - 4)
            while dedans(e + u * t) and acteur[int(round((e + u * t)[1])), int(round((e + u * t)[0]))] and t < 900: t += 1
            sortie = e + u * t
            if not dedans(sortie): continue
            suite = [contraste(sortie + u * k, d) for k in range(4, 34, 3) if dedans(sortie + u * k)]
            if suite and np.median(suite) > 0.5 * c_ref: continue   # le fil ressort de l'autre côté : cohérent
            # appui : premier bord vertical franc au-delà de la sortie
            fin = None
            for k in range(6, int(max(160, 1.2 * L))):
                q = sortie + u * k
                if not dedans(q): break
                yy, xx = int(round(q[1])), int(round(q[0]))
                col = gx[max(0, yy - 6):yy + 7, xx]
                if col.size and np.median(col) > 25 and not acteur[yy, xx]: fin = q; break
            if fin is None: continue
            if any(np.linalg.norm(np.array(f_['a']) - fin) < 8 and np.linalg.norm(np.array(f_['de']) - debut) < 8 for f_ in faits): continue   # les deux bords du même fil
            calque = np.zeros(out.shape[:2], np.float32)
            a = tuple(int(round(v * 16)) for v in debut); b = tuple(int(round(v * 16)) for v in fin)
            cv2.line(calque, a, b, 1.0, max(1, int(round(epais))), cv2.LINE_AA, 4)
            calque = cv2.resize(cv2.resize(calque, None, fx=2, fy=2, interpolation=cv2.INTER_LINEAR), (calque.shape[1], calque.shape[0]), interpolation=cv2.INTER_AREA)
            calque = cv2.GaussianBlur(calque, (0, 0), 0.6)[..., None] * 0.92
            out = np.clip(out.astype(np.float32) * (1 - calque) + coul[None, None] * calque, 0, 255).astype(np.uint8)
            cv2.circle(out, (int(round(fin[0])), int(round(fin[1]))), max(2, int(round(epais)) + 1), tuple(float(c) * 0.5 for c in coul), -1, cv2.LINE_AA)
            faits.append(dict(de=[round(float(v), 1) for v in debut], a=[round(float(v), 1) for v in fin], couleur=[int(c) for c in coul], epaisseur=epais))
    return out, faits
