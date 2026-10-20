# PHYSIQUE DE LA SCÈNE (17/10/2026, v25) — consigne : « l'ombre de la poule ne devait pas passer le contrôle… faire de JEV
# un dieu qui crée ses créatures de la manière la plus naturelle… inclure la physique, la mécanique et tout ». Tout ce que le
# moteur AJOUTE à un décor peint (poule, objet, fumée) doit obéir à la lumière et au sol de ce décor :
#   1. LUMIÈRE MESURÉE sur le tableau : l'ombre que chaque personnage peint projette au sol (pixels plus sombres que le sol
#      éclairé, au contact de ses pieds) donne la direction de l'ombre à l'écran, sa longueur rapportée à la taille, sa
#      couleur (rapport ombre / sol éclairé, canal par canal : une ombre de plein soleil est bleutée) et sa netteté ;
#   2. OMBRE PROJETÉE de toute silhouette : chaque point à la hauteur h au-dessus des pieds tombe au sol à h × longueur dans
#      la direction mesurée (projection plane d'une source lointaine), pénombre qui s'élargit en s'éloignant des pieds ;
#   3. OMBRE DE CONTACT (occlusion ambiante) sous les pieds, toujours, même sans soleil ;
#   4. TEINTE : la créature prend la couleur de la lumière locale du décor (transfert partiel des moyennes Lab), bord
#      enveloppé par la lumière du fond (« light wrap »).
#   lumiere(img, acteurs) → dict ; ombre(alpha_scene, pied, hauteur, L) → masque ; applique_ombre(fond, masque, L)
import numpy as np, cv2


def _lum(img):
    return cv2.cvtColor(img, cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32)


def lumiere(img, acteurs, journal=print):
    """img RGB uint8 ; acteurs : [(masque float 0..1 H×W, bbox, debout)]. Direction de l'ombre peinte de chaque personnage :
    on lance des rayons au sol depuis ses pieds (tous les 5°), le rayon le plus sombre est celui de son ombre (le corps
    cache ce qui est derrière lui : seuls les points de sol visibles comptent)."""
    H, W = img.shape[:2]; L = _lum(img); f = img.astype(np.float32) + 1.0
    tous = np.zeros((H, W), np.float32)
    for m, _, _ in acteurs: tous = np.maximum(tous, m)
    tous = cv2.dilate((tous > 0.3).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    mesures, clairs = [], []
    for m, b, debout in acteurs:
        ys, xs = np.nonzero(m > 0.5)
        if len(ys) < 50: continue
        hpx = float(b[3] - b[1]); ybas = ys.max(); bas = ys > ybas - 0.04 * hpx
        F = np.array([float(np.median(xs[bas])), float(ybas) - 0.01 * hpx])     # point d'appui (pieds, ou pieds de la chaise)
        x0, x1, y0, y1 = max(0, int(F[0] - hpx)), min(W, int(F[0] + hpx)), max(0, int(F[1] - 0.3 * hpx)), min(H, int(F[1] + 0.3 * hpx))
        sol = np.zeros((H, W), bool); sol[y0:y1, x0:x1] = True; sol &= ~tous
        if sol.sum() < 200: continue
        clair = float(np.percentile(L[sol], 75)); clairs.append(clair)
        r = np.linspace(0.04, 0.5, 24) * hpx; ang = np.radians(np.arange(0, 360, 5)); score, val = [], []
        for a in ang:
            px, py = F[0] + r * np.cos(a), F[1] + r * np.sin(a); ok = (px >= 0) & (px < W) & (py >= 0) & (py < H)
            pi, qi = py[ok].astype(int), px[ok].astype(int); ok2 = ~tous[pi, qi]
            if ok.sum() == 0 or ok2.mean() < 0.4 or ok2.sum() < 8: score.append(0.0); val.append(None); continue
            dk = np.clip((clair - L[pi[ok2], qi[ok2]]) / clair, 0, 1); score.append(float(dk.mean())); val.append((r[ok][ok2], dk))
        sc = np.array(score); sc_l = np.array([sc[(k - 1) % len(sc)] + 2 * sc[k] + sc[(k + 1) % len(sc)] for k in range(len(sc))]) / 4
        k = int(sc_l.argmax())
        if sc_l[k] < 0.08 or val[k] is None: continue
        u = np.array([np.cos(ang[k]), np.sin(ang[k])]); rr, dk = val[k]
        long_ = float(rr[dk >= 0.5 * dk.max()].max()) / hpx if (dk >= 0.5 * dk.max()).any() else 0.1
        o = np.zeros((H, W), bool)
        for a in ang[[(k - 1) % len(ang), k, (k + 1) % len(ang)]]:   # pixels d'ombre le long du faisceau retenu
            px, py = F[0] + r * np.cos(a), F[1] + r * np.sin(a); ok = (px >= 0) & (px < W) & (py >= 0) & (py < H)
            o[py[ok].astype(int), px[ok].astype(int)] = True
        o &= ~tous & (L < 0.8 * clair)
        lit = sol & (L > clair * 0.95) & (L < clair * 1.15)
        ratio = [float(np.median(f[..., c][o]) / np.median(f[..., c][lit])) for c in range(3)] if o.sum() > 5 and lit.sum() > 50 else [0.6, 0.6, 0.65]
        mesures.append(dict(dir=u.tolist(), longueur=max(0.08, long_), ratio=ratio, nettete=10.0, poids=float(sc_l[k]), debout=bool(debout), pied=F.tolist()))
    if not mesures:
        journal('lumière : aucune ombre peinte mesurable → lumière diffuse (ombre de contact seule)')
        return dict(dir=[0.0, -1.0], longueur=0.0, ratio=[0.62, 0.62, 0.68], nettete=6.0, diffuse=True, mesures=[],
                    clair=float(np.median(clairs)) if clairs else float(np.percentile(L, 75)))
    P = np.array([m_['poids'] for m_ in mesures]); D = np.array([m_['dir'] for m_ in mesures])
    d = (D * P[:, None]).sum(0); u = d / max(1e-6, np.hypot(*d))
    accord = float((D @ u * P).sum() / P.sum())   # 1 : toutes les ombres vont dans le même sens (un soleil)
    out = dict(dir=u.tolist(), longueur=float(np.average([m_['longueur'] for m_ in mesures], weights=P)),
               ratio=np.average([m_['ratio'] for m_ in mesures], axis=0, weights=P).clip(0.25, 0.95).tolist(),
               nettete=10.0, diffuse=accord < 0.6, accord=accord, mesures=mesures, clair=float(np.median(clairs)))
    if out['diffuse']: out['longueur'] = min(out['longueur'], 0.15)
    journal(f"lumière : ombre vers ({u[0]:+.2f}, {u[1]:+.2f}), longueur {out['longueur']:.2f} × la hauteur, rapport RVB "
            f"{[round(r_, 2) for r_ in out['ratio']]}, accord {accord:.2f} sur {len(mesures)} ombres peintes")
    return out


def ombre(alpha, pied, hauteur, L, H, W):
    """(ombre projetée, ombre de contact) d'une silhouette déjà placée (alpha H × W), pieds au point `pied`, `hauteur` en px."""
    Fx, Fy = float(pied[0]), float(pied[1]); proj = np.zeros((H, W), np.float32)
    if L.get('longueur', 0) > 0.02 and not L.get('diffuse'):
        dx, dy = L['dir']; k = L['longueur']
        # un point (x, y) de la silhouette est à h = Fy − y au-dessus du sol → tombe en (x + h·k·dx, Fy + h·k·dy)
        dy_ = dy if abs(dy) > 0.12 else 0.12 * (1 if dy >= 0 else -1)   # sol vu d'en haut : jamais une ligne
        A = np.float32([[1, -k * dx, k * dx * Fy], [0, -k * dy_, Fy * (1 + k * dy_)]])
        p = cv2.warpAffine(alpha.astype(np.float32), A, (W, H), flags=cv2.INTER_LINEAR, borderValue=0)
        # un corps a de l'ÉPAISSEUR : son ombre est la silhouette projetée balayée sur l'empreinte du corps au sol (profondeur
        # ≈ 0,8 × la hauteur, vue en raccourci ≈ ×0,3) — sans cela l'ombre d'un soleil rasant n'est qu'un trait (vu le 17/10)
        ep = max(3, int(0.24 * hauteur)) | 1
        p = np.clip(cv2.blur(p, (1, ep)) * 1.6, 0, 1)
        # pénombre : nette au pied, floue au bout (le soleil n'est pas un point)
        n1, n2 = cv2.GaussianBlur(p, (0, 0), max(0.8, 0.015 * hauteur)), cv2.GaussianBlur(p, (0, 0), max(1.5, 0.06 * hauteur))
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        t = np.clip(((xx - Fx) * dx + (yy - Fy) * dy) / max(1.0, k * hauteur), 0, 1)
        proj = np.clip(n1 * (1 - t) + n2 * t, 0, 1)
    # contact (occlusion ambiante) : sous le CORPS entier (empreinte), pas sous les seules pattes, plus dense au centre
    cols = np.nonzero(alpha.max(0) > 0.3)[0]
    larg = 0.85 * float(cols.max() - cols.min()) if len(cols) > 1 else 0.6 * hauteur; larg = max(larg, 0.3 * hauteur)
    cx_ = float(cols.mean()) if len(cols) > 1 else Fx
    c = np.zeros((H, W), np.float32)
    cv2.ellipse(c, (int(round(0.5 * (Fx + cx_))), int(round(Fy - 0.01 * hauteur))), (max(2, int(0.5 * larg)), max(2, int(0.13 * larg))), 0, 0, 360, 1.0, -1)
    return proj, cv2.GaussianBlur(c, (0, 0), max(1.0, 0.12 * larg))


def eclaire(fond, L):
    """part de lumière directe reçue par chaque pixel du sol : 1 au soleil, 0 dans une ombre déjà peinte."""
    r = float(np.mean(L.get('ratio', [0.6, 0.6, 0.65]))); clair = float(L.get('clair', 200.0))
    lum = _lum(np.clip(fond, 0, 255).astype(np.uint8)) / max(1.0, clair)
    return np.clip((lum - r) / max(0.05, 1 - r), 0, 1)


def applique_ombre(fond, ombres, L, contact_force=0.55):
    """assombrit le fond (float32 RGB, en place) avec la COULEUR de l'ombre mesurée. Lois : une ombre projetée n'assombrit
    que le sol encore éclairé (deux ombres du même soleil ne s'additionnent pas) ; l'occlusion de contact vaut partout."""
    proj, contact = ombres; r = np.asarray(L.get('ratio', [0.6, 0.6, 0.65]), np.float32)
    k = np.maximum(proj * eclaire(fond, L), contact_force * contact)
    fond *= (1 - k[..., None] * (1 - r[None, None, :]))
    return fond


def lumiere_locale(fond, alpha, pied, hauteur, L):
    """facteur RVB de lumière reçue par une créature dont les pieds sont en `pied` : au soleil 1, dans une ombre peinte le
    rapport de l'ombre (elle est dans l'ombre : elle s'assombrit et bleuit comme le sol)."""
    H, W = fond.shape[:2]; x, y = int(pied[0]), int(pied[1]); w = max(4, int(0.5 * hauteur))
    y0, y1, x0, x1 = max(0, y - int(0.05 * hauteur)), min(H, y + int(0.1 * hauteur) + 1), max(0, x - w), min(W, x + w)
    if y1 <= y0 or x1 <= x0: return np.ones(3, np.float32)
    z = eclaire(fond[y0:y1, x0:x1], L); m = alpha[y0:y1, x0:x1] < 0.05
    s = float(np.median(z[m])) if m.sum() > 5 else 1.0
    r = np.asarray(L.get('ratio', [0.6, 0.6, 0.65]), np.float32)
    return r + (1 - r) * s


def teinte(sprite, alpha, fond, force=0.45):
    """la créature prend la lumière locale : moyennes a*b* (couleur) et L* (intensité) du fond autour d'elle, transfert
    partiel ; puis le bord de la silhouette reçoit un peu de la lumière du fond (light wrap)."""
    m = alpha > 0.5
    if m.sum() < 20: return sprite
    ys, xs = np.nonzero(m); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    hh, ww = y1 - y0, x1 - x0; Y0, Y1, X0, X1 = max(0, y0 - hh), min(fond.shape[0], y1 + hh // 2), max(0, x0 - ww), min(fond.shape[1], x1 + ww)
    autour = np.zeros(alpha.shape, bool); autour[Y0:Y1, X0:X1] = True; autour &= alpha < 0.05
    lab_s = cv2.cvtColor(np.clip(sprite, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    lab_f = cv2.cvtColor(np.clip(fond, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    if autour.sum() < 20: return sprite
    ms, mf = lab_s[m].mean(0), lab_f[autour].mean(0)
    dl = np.array([0.35 * (mf[0] - ms[0]), force * (mf[1] - ms[1]), force * (mf[2] - ms[2])], np.float32)
    lab_s[m] += dl
    out = cv2.cvtColor(np.clip(lab_s, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32)
    flou = cv2.GaussianBlur(fond, (0, 0), 6); bord = np.clip(alpha - cv2.erode(alpha, np.ones((5, 5), np.uint8)), 0, 1)[..., None]
    return np.where(m[..., None] | (alpha[..., None] > 0), out * (1 - 0.35 * bord) + flou * 0.35 * bord, sprite)
