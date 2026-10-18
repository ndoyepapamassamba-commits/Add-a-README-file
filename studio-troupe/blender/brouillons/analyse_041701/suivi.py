"""Suivi par image des deux personnages de 041701 (bande de scène) : boîte, racine, échelle, 133 repères RTMW, visage MP."""
import json, sys, time
import numpy as np, cv2
sys.path.insert(0, '/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/ana041701')
from reperes_base import rtmw, mp_visage

W = '/home/user/Add-a-README-file/studio-troupe/.private/references/041701/travail'
F = np.load(W + '/frames_full.npy', mmap_mode='r')
M = np.load(W + '/masques_isnet.npy', mmap_mode='r')
Y0, Y1 = 531, 1390
N = 301


def separer(m):
    """Masque binaire -> (masque V gauche, masque T droite) ; coupe à la colonne la moins occupée entre les deux corps."""
    n, lab, st, cen = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
    keep = np.zeros_like(m, bool)
    for k in range(1, n):
        if st[k, cv2.CC_STAT_AREA] > 1500:
            keep |= lab == k
    col = keep.sum(0).astype(np.float32)
    col_s = np.convolve(col, np.ones(15) / 15, 'same')
    lo, hi = 330, 760
    xc = lo + int(np.argmin(col_s[lo:hi]))
    v = keep.copy(); v[:, xc:] = False
    t = keep.copy(); t[:, :xc] = False
    # rattacher les morceaux coupés (bras tendu qui franchit la coupe) au corps auquel ils sont reliés
    return v, t, xc


def boite(m):
    ys, xs = np.nonzero(m)
    if len(xs) < 50:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


res = []
t0 = time.time()
for i in range(N):
    band = np.ascontiguousarray(F[i, Y0:Y1])
    m = M[i] > 127
    v, t, xc = separer(m)
    rec = {'i': i, 't': round(i / 30, 4), 'coupe_x': xc}
    for nm, mm in (('V', v), ('T', t)):
        b = boite(mm)
        if b is None:
            rec[nm] = None
            continue
        K = rtmw(band, b, 1.15)
        fc = K[23:91, :2]
        c = fc.mean(0)
        s = max(60.0, float(np.ptp(fc[:, 0])), float(np.ptp(fc[:, 1]))) * 1.7
        P, bl = mp_visage(band, (c[0] - s / 2, c[1] - s / 2, c[0] + s / 2, c[1] + s / 2), 512)
        ys, xs = np.nonzero(mm)
        rec[nm] = {
            'boite': b, 'aire': int(mm.sum()),
            'bas_x': float(np.median(xs[ys >= ys.max() - 6])), 'bas_y': int(ys.max()),
            'cx': float(xs.mean()), 'cy': float(ys.mean()),
            'K': np.round(K, 2).tolist(),
            'mp': None if P is None else {'pts': np.round(P[[1, 4, 10, 13, 14, 61, 291, 152, 33, 263, 78, 308, 0, 17]], 1).tolist(),
                                          'jawOpen': bl.get('jawOpen'), 'mouthClose': bl.get('mouthClose'), 'mouthFunnel': bl.get('mouthFunnel')},
        }
    res.append(rec)
    if i % 25 == 0:
        print(i, round(time.time() - t0, 1), flush=True)
json.dump(res, open(W + '/suivi.json', 'w'))
print('fini', time.time() - t0)
