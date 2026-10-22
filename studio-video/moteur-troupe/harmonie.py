# PERSONNAGE DANS LA LUMIÈRE DE SON DÉCOR (22/10/2026) — écarts de E00001 à la V1 publiée : « écart de lumière personnage/décor
# (L*) 14,4 (V1 8,5) », « netteté des personnages / décor autour 1,61 (V1 1,88) », peau 37,3 / 27,0 (V1 35,3 / 26,0 au plus).
# Les personnages de la nouvelle troupe sont des fiches éclairées en studio, posées dans un décor peint : ils gardent leur propre
# lumière. Dans la V1, peints dans la scène, ils prenaient celle du lieu, et le fond était plus doux qu'eux.
# Veille (22/10/2026) : Harmonizer (ZHKKKe, ECCV 2022) règle le premier plan par des filtres « boîte blanche » (luminosité,
# contraste, saturation, température) régressés depuis le fond — licence CC BY-NC-SA 4.0 : banc d'essai seulement, rien de son
# code ni de ses poids ici. Méthode publiée réécrite : transfert de luminance de Reinhard et al. (2001, « Color Transfer between
# Images ») borné à un gain de lumière unique par personnage, appliqué en lumière linéaire (une intensité d'éclairage, pas un
# voile), qui garde le contraste interne du dessin ; et une profondeur de champ (flou du décor selon sa distance au plan des
# pieds, carte Depth Anything V2 déjà calculée par le moteur), le décor de la V1 étant plus doux que ses personnages.
import cv2, numpy as np

ECART_CIBLE = 6.0      # L* : écart personnage/anneau de décor visé au plus (V1 : 8,5 en médiane), le signe est gardé
GAIN_BORNES = (0.72, 1.25)
SIGMA_FOND = 1.4       # px de la scène (1152 × 896) au plus loin derrière le plan des pieds
ZONE_NETTE = 0.05      # écart de profondeur (carte 0–1) autour du plan des pieds sans aucun flou


def _lab_L(rgb):
    return cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8)[None], cv2.COLOR_RGB2LAB)[0][..., 0].astype(np.float32) * 100 / 255


def anneau(alpha, plate_shape, part=0.06):
    """décor autour du personnage : même anneau que la mesure de la V1 (niveau_v1.profil, 6 % de la largeur)."""
    m = (alpha > 0.5).astype(np.uint8); k = int(part * plate_shape[1]) | 1
    return cv2.dilate(m, np.ones((k, k), np.uint8)).astype(bool) & (alpha < 0.05)


def gain_lumiere(img_act, alpha, plate):
    """gain sRGB (multiplicatif) qui ramène l'écart de clarté moyen personnage/décor environnant à ECART_CIBLE au plus, sans en
    changer le signe. Renvoie (gain, écart avant, écart après) ; gain 1.0 si l'écart est déjà dans la cible."""
    p = alpha > 0.5; an = anneau(alpha, plate.shape)
    if p.sum() < 200 or an.sum() < 200: return 1.0, None, None
    pix = img_act[p].astype(np.float32); pix = pix[:: max(1, len(pix) // 30000)]
    Lr = float(_lab_L(plate[an][:: max(1, int(an.sum()) // 30000)]).mean())
    L0 = float(_lab_L(pix).mean()); d0 = L0 - Lr
    if abs(d0) <= ECART_CIBLE: return 1.0, round(d0, 1), round(d0, 1)
    cible = Lr + np.sign(d0) * ECART_CIBLE
    lin = (pix / 255.0) ** 2.2   # en lumière linéaire : g·E, puis retour sRGB — g^(1/2,2) sur les valeurs sRGB
    lo, hi = GAIN_BORNES
    for _ in range(22):
        g = (lo + hi) / 2; L = float(_lab_L(255 * np.clip(lin * g ** 2.2, 0, 1) ** (1 / 2.2)).mean())
        if L > cible: hi = g
        else: lo = g
    g = (lo + hi) / 2; L1 = float(_lab_L(np.clip(pix * g, 0, 255)).mean())
    return round(g, 4), round(d0, 1), round(L1 - Lr, 1)


def profondeur_de_champ(plate, dep, pieds, sigma=SIGMA_FOND):
    """décor flouté selon sa distance au plan des pieds des personnages (dep : 1 = près, 0 = loin) : net au plan des acteurs,
    jusqu'à sigma au plus loin ; le premier plan devant eux, à moitié. Une seule fois par scène (aucun coût par image)."""
    if dep is None or sigma <= 0: return plate
    lo, hi = float(dep.min()), float(dep.max()); span = max(1e-3, pieds - lo, hi - pieds) - ZONE_NETTE
    # zone nette autour du plan des pieds (le décor contre les acteurs garde son dessin), puis flou croissant ; même échelle
    # devant et derrière (une table juste devant ne devient pas floue d'un coup quand le décor est peu profond)
    w = np.maximum(0.0, np.abs(dep - pieds) - ZONE_NETTE) / max(1e-3, span) * np.where(dep < pieds, 1.0, 0.5)
    w = cv2.GaussianBlur(np.clip(w, 0, 1).astype(np.float32), (0, 0), 4)[..., None]
    f = plate.astype(np.float32)
    # deux niveaux de flou mêlés selon le poids : continu, sans halo de seuil
    b1 = cv2.GaussianBlur(f, (0, 0), sigma * 0.5); b2 = cv2.GaussianBlur(f, (0, 0), sigma)
    out = np.where(w < 0.5, f + (b1 - f) * (w / 0.5), b1 + (b2 - b1) * ((w - 0.5) / 0.5))
    return np.clip(out, 0, 255).astype(plate.dtype)


def nettete(img_act, alpha, plate):
    """netteté du personnage rapportée au décor qui l'entoure (même mesure que niveau_v1.profil, sur la scène fixe)."""
    p = alpha > 0.5; an = anneau(alpha, plate.shape)
    la = np.abs(cv2.Laplacian(cv2.cvtColor(img_act, cv2.COLOR_RGB2GRAY), cv2.CV_32F))
    lp = np.abs(cv2.Laplacian(cv2.cvtColor(plate, cv2.COLOR_RGB2GRAY), cv2.CV_32F))
    return round(float(la[p].mean() / max(float(lp[an].mean()), 1e-3)), 2) if p.any() and an.any() else None
