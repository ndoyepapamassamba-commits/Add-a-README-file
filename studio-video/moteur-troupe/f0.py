import numpy as np
def f0_median(x, sr, fmin=70, fmax=420):
    """Hauteur médiane (Hz) par autocorrélation normalisée sur trames voisées (méthode YIN simplifiée, de Cheveigné & Kawahara 2002)."""
    x = x.astype(np.float32); x /= (np.abs(x).max() + 1e-9)
    n = int(0.04 * sr); hop = int(0.01 * sr); out = []
    lo, hi = int(sr / fmax), int(sr / fmin)
    for i in range(0, len(x) - n - hi, hop):
        f = x[i:i + n + hi]
        if np.sqrt(np.mean(f[:n] ** 2)) < 0.05: continue
        d = np.array([np.sum((f[:n] - f[t:t + n]) ** 2) for t in range(lo, hi)])
        cm = d / (np.cumsum(d) / (np.arange(len(d)) + 1) + 1e-9)
        k = np.argmin(cm)
        if cm[k] < 0.3: out.append(sr / (lo + k))
    return float(np.median(out)) if out else 0.0, len(out)
