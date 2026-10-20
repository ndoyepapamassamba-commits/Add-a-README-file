"""
STYLE — un décor 3D doit appartenir au même monde que les personnages dessinés.

Les personnages de la troupe sont des dessins au rendu « 3D cartoon » (volumes doux, couleurs saturées, matières
riches, lumière chaude). Un décor généré en 3D qui n'en a pas la signature (aplats, couleurs ternes, surfaces sans
matière) se voit immédiatement : deux mondes collés. Ici, la signature visuelle est MESURÉE sur les dessins eux-mêmes,
puis comparée à celle du décor :

  • saturation des couleurs (moyenne et 90ᵉ centile, HSV) ;
  • contraste (écart-type de luminance) et profondeur d'ombre (écart 5ᵉ–95ᵉ centiles) ;
  • chaleur (rouge − bleu moyen) ;
  • richesse de détail (énergie des hautes fréquences) ;
  • part d'aplats (pixels dont le voisinage 7×7 ne varie presque pas).

La génération rapproche le décor de cette signature (grade borné, fait sur l'image cuite) ; le contrôle vérifie l'écart
restant, critère par critère, contre la dispersion propre aux dessins de la troupe (pas un seuil inventé).
"""
import numpy as np

FEATURES = ('saturation', 'saturation_p90', 'contraste', 'profondeur', 'chaleur', 'detail', 'aplats')


def _box(a, r):
    """Mean filter of radius r (separable cumulative sums)."""
    for axis in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis, dtype=np.float64)
        n = a.shape[axis]
        a = (np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis) - np.take(c, np.arange(0, n), axis=axis)) / (2 * r + 1)
    return a


def signature(rgb, mask=None, max_side=512):
    """Visual signature of an image (H×W×3 floats 0..1), on the pixels of `mask` when given (a drawing's alpha)."""
    rgb = np.asarray(rgb, dtype=np.float64)[..., :3]
    h, w = rgb.shape[:2]
    step = max(1, int(max(h, w) / max_side))
    rgb = rgb[::step, ::step]
    m = np.ones(rgb.shape[:2], bool) if mask is None else (np.asarray(mask)[::step, ::step] > 0.5)
    mx, mn = rgb.max(2), rgb.min(2)
    sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    blur = _box(lum, 2)
    hf = np.abs(lum - blur)
    var = _box(lum * lum, 3) - _box(lum, 3) ** 2
    # (a drawing's border is not a feature: keep the inside of the mask)
    inner = m & (_box(m.astype(np.float64), 3) > 0.999) if mask is not None else m
    sel = inner if inner.sum() > 100 else m
    L = lum[sel]
    return {
        'saturation': float(sat[sel].mean()),
        'saturation_p90': float(np.percentile(sat[sel], 90)),
        'contraste': float(L.std()),
        'profondeur': float(np.percentile(L, 95) - np.percentile(L, 5)),
        'chaleur': float((rgb[..., 0] - rgb[..., 2])[sel].mean()),
        'detail': float(hf[sel].mean()),
        'aplats': float((var[sel] < 2e-5).mean()),
    }


def reference(cards):
    """The troupe's signature: per feature, median and the 10th–90th percentile band over the drawings."""
    sigs = [signature(rgb, a) for rgb, a in cards]
    ref = {}
    for k in FEATURES:
        v = np.array([s[k] for s in sigs])
        ref[k] = {'median': float(np.median(v)), 'p10': float(np.percentile(v, 10)), 'p90': float(np.percentile(v, 90))}
    ref['_n'] = len(sigs)
    return ref


# How far outside the troupe's own band a set may stand before it reads as another world (share of the band width,
# with a minimum margin per feature).
MARGIN = {'saturation': 0.05, 'saturation_p90': 0.05, 'contraste': 0.025, 'profondeur': 0.06, 'chaleur': 0.03, 'detail': 0.004, 'aplats': 0.08}


def compare(sig, ref):
    """Per feature: (value, band low, band high, inside?)."""
    out = {}
    for k in FEATURES:
        r = ref[k]
        span = max(r['p90'] - r['p10'], 1e-6)
        lo, hi = r['p10'] - max(0.5 * span, MARGIN[k]), r['p90'] + max(0.5 * span, MARGIN[k])
        if k == 'aplats':
            lo = 0.0  # fewer flat areas than the drawings is never a fault
        out[k] = (sig[k], lo, hi, lo <= sig[k] <= hi)
    return out


def grade(rgb, sig, ref, strength=1.0):
    """A bounded colour grade of a rendered set toward the troupe's signature: saturation, contrast and warmth (never
    the drawing — only the set). Returns the graded image (floats 0..1)."""
    rgb = np.clip(np.asarray(rgb, dtype=np.float64)[..., :3], 0, 1)
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    # Saturation: scale chroma around luminance.
    s_gain = np.clip((ref['saturation']['median'] / max(sig['saturation'], 1e-3)) ** strength, 0.8, 1.6)
    out = lum[..., None] + (rgb - lum[..., None]) * s_gain
    # Contrast: around the mean luminance.
    c_gain = np.clip((ref['contraste']['median'] / max(sig['contraste'], 1e-3)) ** strength, 0.85, 1.35)
    m = lum.mean()
    out = m + (out - m) * c_gain
    # Warmth: a light shift of red against blue.
    dw = np.clip((ref['chaleur']['median'] - sig['chaleur']) * strength, -0.06, 0.06)
    out[..., 0] += dw / 2
    out[..., 2] -= dw / 2
    return np.clip(out, 0, 1), {'saturation': round(float(s_gain), 3), 'contraste': round(float(c_gain), 3), 'chaleur': round(float(dw), 3)}
