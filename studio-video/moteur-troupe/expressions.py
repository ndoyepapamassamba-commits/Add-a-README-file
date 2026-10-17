# EXPRESSIONS DU VISAGE (17/10/2026) — demande : « clignement des yeux aussi ; mouvement du visage quand on est frustré,
# quand on n'est pas content, quand on rit… toutes les expressions du visage ».
# Méthode publiée, réécrite : le système de codage des actions faciales (FACS, Ekman & Friesen 1978) — chaque expression
# est un mélange d'UNITÉS D'ACTION (sourcils levés au centre AU1, à l'extérieur AU2, froncés AU4, paupière supérieure
# relevée AU5, joues remontées AU6, paupières plissées AU7, nez froncé AU9, coins de la bouche tirés vers le haut AU12,
# tirés vers le bas AU15, menton relevé AU17, lèvres étirées AU20, lèvres pincées AU23) ; les émotions de base sont des
# combinaisons connues (joie AU6+AU12, tristesse AU1+AU4+AU15, colère AU4+AU5+AU7+AU23, surprise AU1+AU2+AU5, peur
# AU1+AU2+AU4+AU5+AU20, dégoût AU9+AU15).
# Sur nos dessins : chaque unité déplace des points précis du maillage du visage lu par Face Landmarker (478 points) ;
# un champ de déplacement LISSE (fonctions radiales gaussiennes, contour du visage tenu fixe) est calculé UNE fois par unité
# et par personnage ; à chaque image, le champ est la somme pondérée des unités (linéaire : instantané) — comme les
# paramètres d'un modèle Live2D, mais construits automatiquement pour toute la troupe.
import numpy as np, cv2

SOURCIL_G = [70, 63, 105, 66, 107, 46, 53, 52, 65, 55]; SOURCIL_D = [300, 293, 334, 296, 336, 276, 283, 282, 295, 285]
INT_G, INT_D = [107, 66, 55, 65], [336, 296, 285, 295]           # côté nez
EXT_G, EXT_D = [70, 63, 46, 53], [300, 293, 276, 283]            # côté tempe
PAUP_HAUT_G, PAUP_HAUT_D = [159, 158, 160, 161, 157], [386, 385, 387, 388, 384]
PAUP_BAS_G, PAUP_BAS_D = [145, 144, 153, 154, 163], [374, 373, 380, 381, 390]
JOUE_G, JOUE_D = [116, 117, 118, 119, 100, 47, 123], [345, 346, 347, 348, 329, 277, 352]
COIN_G, COIN_D = [61, 76, 62, 146, 185], [291, 306, 292, 375, 409]
NARINE = [129, 358, 98, 327, 48, 278]
MENTON = [152, 148, 176, 377, 400, 18, 200]
LEVRE_H, LEVRE_B = [0, 37, 267, 39, 269, 40, 270], [17, 84, 314, 181, 405, 91, 321]
OEILS = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249, 468, 473]
OVALE = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]

# unités d'action : liste de (points, déplacement (dx en largeur de visage vers l'EXTÉRIEUR du côté, dy en hauteur, + = bas))
AU = {
    'AU1': [(INT_G + INT_D, (0.0, -0.045))],
    'AU2': [(EXT_G + EXT_D, (0.0, -0.045))],
    'AU1g': [(INT_G, (0.0, -0.045))], 'AU2g': [(EXT_G, (0.0, -0.05))], 'AU2d': [(EXT_D, (0.0, -0.05))],
    'AU4': [(SOURCIL_G + SOURCIL_D, (0.0, 0.028)), (INT_G + INT_D, (-0.022, 0.014))],
    'AU5': [],   # yeux grands ouverts : les yeux Pixar le sont déjà ; une paupière qui monte étirait l'iris (vu le 17/10)
    'AU6': [(JOUE_G + JOUE_D, (0.0, -0.03))],
    'AU7': [],   # paupières plissées : rendues par l'état de paupière dessiné (paupieres()), pas par un étirement de l'œil
    'AU9': [(NARINE, (0.0, -0.012)), (LEVRE_H, (0.0, -0.008)), (INT_G + INT_D, (-0.008, 0.01))],
    'AU12': [(COIN_G + COIN_D, (0.024, -0.028))],
    'AU12g': [(COIN_G, (0.024, -0.03))], 'AU12d': [(COIN_D, (0.024, -0.03))],
    'AU15': [(COIN_G + COIN_D, (0.004, 0.028))],
    'AU17': [(MENTON, (0.0, -0.012)), (LEVRE_B, (0.0, -0.01))],
    'AU20': [(COIN_G + COIN_D, (0.025, 0.006))],
    'AU23': [(LEVRE_H, (0.0, 0.005)), (LEVRE_B, (0.0, -0.005)), (COIN_G + COIN_D, (-0.006, 0.0))],
}
# émotions → poids des unités (Ekman ; variantes de comédie : malice, soupçon, frime, innocent)
EMOTIONS = {
    'neutre': {},
    'joie': {'AU6': 0.8, 'AU12': 1.0},
    'rire': {'AU6': 1.0, 'AU12': 1.0, 'AU7': 0.3},
    'tristesse': {'AU1': 0.8, 'AU4': 0.4, 'AU15': 0.9, 'AU17': 0.4},
    'mecontent': {'AU4': 0.7, 'AU15': 0.6, 'AU17': 0.5, 'AU23': 0.4},
    'colere': {'AU4': 1.0, 'AU5': 0.4, 'AU7': 0.7, 'AU23': 0.6},
    'frustration': {'AU4': 0.8, 'AU7': 0.6, 'AU15': 0.4, 'AU23': 0.7, 'AU17': 0.3},
    'surprise': {'AU1': 1.0, 'AU2': 1.0, 'AU5': 1.0},
    'peur': {'AU1': 0.9, 'AU2': 0.6, 'AU4': 0.5, 'AU5': 0.9, 'AU20': 0.7},
    'degout': {'AU9': 1.0, 'AU15': 0.6, 'AU4': 0.3},
    'malice': {'AU12g': 0.8, 'AU2d': 0.6, 'AU7': 0.3, 'AU6': 0.3},
    'soupcon': {'AU4': 0.6, 'AU7': 0.9, 'AU2g': 0.7},
    'innocent': {'AU1': 0.9, 'AU2': 0.5, 'AU12': 0.35},
    'frime': {'AU12': 0.6, 'AU7': 0.5, 'AU2': 0.3},
}


GAIN = 1.6   # exagération des studios d'animation : une expression doit se lire sur un visage de 70 px


def paupieres(emotions):
    """part de fermeture des paupières (0 ouvert … 1 clos) que demande l'expression : plissement (soupçon, colère, rire),
    paupières lourdes (frime) — rendue par les états de paupière dessinés, comme le clignement."""
    w = poids(emotions); return float(min(0.55, 0.45 * w.get('AU7', 0.0) + 0.25 * w.get('AU6', 0.0)))


def prepare(img, v3, sigma=0.10, yeux=None):
    """champs de déplacement (un par unité d'action) sur la boîte du visage ; None si le visage n'est pas lu.
    yeux : les yeux lus par regard.prepare (ouverture réelle des grands yeux Pixar) — tenus fixes : une expression ne
    déforme jamais un œil (vu le 17/10 : œil étiré quand le sourcil montait)."""
    if v3 is None or len(v3) < 468: return None
    H, W = img.shape[:2]; L = np.asarray(v3[:478 if len(v3) >= 478 else 468, :2], np.float64)
    x0, y0 = L[:468].min(0); x1, y1 = L[:468].max(0); fw, fh = x1 - x0, y1 - y0
    m = 0.25 * max(fw, fh); X0, Y0 = int(max(0, x0 - m)), int(max(0, y0 - 1.6 * m)); X1, Y1 = int(min(W, x1 + m)), int(min(H, y1 + m))
    cx = 0.5 * (L[33, 0] + L[263, 0])   # milieu des yeux : « extérieur » = s'éloigner de cet axe
    lg, ld = float(np.linalg.norm(L[33] - L[133])), float(np.linalg.norm(L[263] - L[362]))
    ech = {-1.0: min(1.0, lg / max(lg, ld, 1e-6)) if L[33, 0] < cx else min(1.0, ld / max(lg, ld, 1e-6)),
           1.0: min(1.0, ld / max(lg, ld, 1e-6)) if L[263, 0] >= cx else min(1.0, lg / max(lg, ld, 1e-6))}   # visage de trois quarts : le côté éloigné est raccourci
    ancres = np.vstack([L[OVALE], [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1], [(X0 + X1) / 2, Y0], [(X0 + X1) / 2, Y1], [X0, (Y0 + Y1) / 2], [X1, (Y0 + Y1) / 2]]])
    s = sigma * fh; lam = 1e-3
    # ancres des yeux : contour de l'ouverture réelle (regard.prepare) ou, à défaut, contour des repères élargi de 40 %
    ay = []
    if yeux:
        for e in yeux:
            x0e, y0e = e['box'][:2]; ct, _ = cv2.findContours((e['ouv'] > 0.5).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            if ct:
                c_ = max(ct, key=cv2.contourArea)[:, 0, :].astype(np.float64); c_ += [x0e, y0e]
                m_ = c_.mean(0); c_ = m_ + (c_ - m_) * 1.15; ay += list(c_[np.linspace(0, len(c_) - 1, 14).astype(int)]); ay.append(m_)
    if not ay:
        for cont in ([33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7], [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249]):
            c_ = L[cont]; m_ = c_.mean(0); ay += list(m_ + (c_ - m_) * 1.4); ay.append(m_)
    ancres_yeux = np.array(ay)
    champs = {}
    ys, xs = np.mgrid[Y0:Y1, X0:X1].astype(np.float64)
    for nom, groupes in AU.items():
        if not groupes: continue
        P, D = [], []
        for pts, (dx, dy) in groupes:
            for i in pts:
                p = L[i]; sg = 1.0 if p[0] >= cx else -1.0; k = GAIN * ech[sg] ** 1.5
                P.append(p); D.append((sg * dx * fw * k, dy * fh * k))
        P = np.array(P); D = np.array(D)
        # un même point peut appartenir à deux groupes : déplacements additionnés
        uniq, inv = np.unique(np.round(P, 2), axis=0, return_inverse=True); Du = np.zeros((len(uniq), 2)); np.add.at(Du, inv.ravel(), D)
        if not len(uniq): continue
        n_ = np.linalg.norm(Du, axis=1, keepdims=True); Du = Du * np.minimum(1.0, 0.5 * s / np.maximum(n_, 1e-6))   # jamais de pli
        loin = np.min(np.linalg.norm(ancres_yeux[:, None] - uniq[None], axis=2), axis=1) > 0.03 * fh
        C = np.vstack([uniq, ancres, ancres_yeux[loin]]); V = np.vstack([Du, np.zeros((len(ancres) + int(loin.sum()), 2))])
        K = np.exp(-((C[:, None, :] - C[None, :, :]) ** 2).sum(-1) / (2 * s * s)) + lam * np.eye(len(C))
        a = np.linalg.solve(K, V)
        F = np.zeros(xs.shape + (2,), np.float32)
        for k0 in range(0, len(C), 64):   # par paquets (mémoire)
            Ck = C[k0:k0 + 64]; ak = a[k0:k0 + 64]
            Kx = np.exp(-((xs[..., None] - Ck[:, 0]) ** 2 + (ys[..., None] - Ck[:, 1]) ** 2) / (2 * s * s))
            F += np.einsum('hwk,kc->hwc', Kx, ak).astype(np.float32)
        champs[nom] = F
    gx, gy = np.meshgrid(np.arange(X0, X1, dtype=np.float32), np.arange(Y0, Y1, dtype=np.float32))
    return dict(box=(X0, Y0, X1, Y1), champs=champs, gx=gx, gy=gy, fw=fw, fh=fh)


def poids(emotions):
    """{émotion: intensité 0..1} → {unité: poids}."""
    w = {}
    for e, k in emotions.items():
        for au, v in EMOTIONS.get(e, {}).items(): w[au] = w.get(au, 0.0) + k * v
    return {au: min(1.2, v) for au, v in w.items()}


def applique(src, E, emotions):
    """le visage de src prend l'expression (mélange d'émotions pondérées) ; rien n'est copié si l'expression est neutre."""
    if E is None: return src
    w = poids(emotions); w = {k: v for k, v in w.items() if abs(v) > 0.02 and k in E['champs']}
    if not w: return src
    F = sum(E['champs'][k] * v for k, v in w.items())
    X0, Y0, X1, Y1 = E['box']
    # carte inverse : point fixe s = d − F(s) (deux itérations suffisent : déplacements de quelques pixels)
    sx, sy = E['gx'] - F[..., 0], E['gy'] - F[..., 1]
    for _ in range(2):
        fx = cv2.remap(F[..., 0], sx - X0, sy - Y0, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        fy = cv2.remap(F[..., 1], sx - X0, sy - Y0, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        sx, sy = E['gx'] - fx, E['gy'] - fy
    out = src.copy(); out[Y0:Y1, X0:X1] = cv2.remap(src, sx, sy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    return out
