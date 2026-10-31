"""Détourage : fond blanc → transparence, en gardant les blancs intérieurs (yeux, dents, col).

Les illustrations sont demandées sur fond blanc pur avec un contour sombre : le fond est la zone presque blanche
reliée au bord de l'image. Les grandes zones blanches enfermées (un trou entre un bras et le corps) sont aussi du
fond ; les petites (le blanc des yeux) restent. Les bords sont adoucis et « décontaminés » du blanc.
Greffe : scipy.ndimage (BSD) pour l'étiquetage des zones.
"""
import numpy as np
from scipy import ndimage

SEUIL_BLANC = 232
TROU_MAX = 0.03          # fraction de l'image au-delà de laquelle une zone blanche enfermée est du fond


def detourer(image: np.ndarray) -> np.ndarray:
    """image : tableau H×W×3 ou H×W×4 (RVB ou BVR, peu importe : on ne regarde que les niveaux)."""
    rgb = image[:, :, :3].astype(np.int16)
    mn, mx = rgb.min(axis=2), rgb.max(axis=2)
    blanc = (mn >= SEUIL_BLANC) & ((mx - mn) <= 24)
    etiquettes, n = ndimage.label(blanc)
    bord = np.unique(np.concatenate([etiquettes[0], etiquettes[-1], etiquettes[:, 0], etiquettes[:, -1]]))
    tailles = ndimage.sum(np.ones_like(etiquettes), etiquettes, index=np.arange(n + 1))
    fond_ids = set(int(b) for b in bord if b) | {i for i in range(1, n + 1) if tailles[i] > TROU_MAX * blanc.size}
    fond = np.isin(etiquettes, list(fond_ids)) if fond_ids else np.zeros_like(blanc)
    # l'ombre au sol (gris clair neutre) collée au fond est du fond, et ce qu'elle enfermait aussi
    clair_neutre = (mn >= 150) & ((mx - mn) <= 20)
    fond = ndimage.binary_propagation(fond, mask=fond | clair_neutre | blanc)
    # bande de bord : pixels non-fond voisins du fond ; leur opacité vient de leur écart au blanc
    voisin = ndimage.binary_dilation(fond, iterations=2) & ~fond
    alpha = np.where(fond, 0.0, 1.0)
    lum = rgb.mean(axis=2)
    a_bord = np.clip((255.0 - lum) / (255.0 - 70.0), 0.0, 1.0)
    alpha = np.where(voisin, np.maximum(a_bord, 0.0), alpha)
    # les pixels du fond touchant le personnage gardent un soupçon d'opacité s'ils ne sont pas parfaitement blancs
    frange = ndimage.binary_dilation(~fond, iterations=1) & fond
    alpha = np.where(frange, np.clip((250.0 - lum) / 180.0, 0.0, 1.0), alpha)
    sortie = np.zeros(image.shape[:2] + (4,), dtype=np.uint8)
    a = alpha[:, :, None]
    with np.errstate(divide="ignore", invalid="ignore"):
        couleur = np.where(a > 0.04, (rgb - (1.0 - a) * 255.0) / np.maximum(a, 1e-3), rgb)
    sortie[:, :, :3] = np.clip(couleur, 0, 255).astype(np.uint8)
    sortie[:, :, 3] = np.round(alpha * 255).astype(np.uint8)
    return sortie
