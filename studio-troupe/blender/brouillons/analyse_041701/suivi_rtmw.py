"""RTMW 133 points par image et par personnage (2 passes : zone large puis boîte issue des points) + visage MediaPipe."""
import json, sys, time
import numpy as np, cv2
sys.path.insert(0, '/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/ana041701')
from reperes_base import rtmw, mp_visage
W = '/home/user/Add-a-README-file/studio-troupe/.private/references/041701/travail'
F = np.load(W + '/frames_full.npy', mmap_mode='r')
Y0, Y1 = 531, 1390
N = 301
ZONES = {'V': (0, 0, 540, 859), 'T': (470, 0, 1080, 859)}
def boite_points(K, seuil):
    ok = K[:, 2] > seuil
    body = K[:23]
    if ok.sum() < 8:
        return None
    P = K[ok, :2]
    x0, y0 = P.min(0); x1, y1 = P.max(0)
    # sommet du crâne/cheveux : au-dessus des yeux d'environ 1,2 × (cou → nez)
    nez = body[0, :2]; epaules = (body[5, :2] + body[6, :2]) / 2
    y0 = min(y0, nez[1] - 1.2 * max(20.0, abs(epaules[1] - nez[1])))
    return [float(x0), float(y0), float(x1), float(y1)]
res = []
t0 = time.time()
for i in range(N):
    band = np.ascontiguousarray(F[i, Y0:Y1])
    rec = {'i': i}
    for nm, z in ZONES.items():
        K1 = rtmw(band, z, 1.0)
        b = boite_points(K1, 2.0) or list(z)
        K = rtmw(band, b, 1.2)
        fc = K[23:91, :2]
        c = fc.mean(0)
        s = max(60.0, float(np.ptp(fc[:, 0])), float(np.ptp(fc[:, 1]))) * 1.7
        P, bl = mp_visage(band, (c[0] - s / 2, c[1] - s / 2, c[0] + s / 2, c[1] + s / 2), 512)
        rec[nm] = {'boite_pts': [round(v, 1) for v in b], 'K': np.round(K, 2).tolist(),
                   'mp': None if P is None else {'pts': np.round(P[[1, 4, 10, 13, 14, 61, 291, 152, 33, 263, 78, 308, 0, 17]], 1).tolist(),
                                                 'jawOpen': bl.get('jawOpen'), 'mouthClose': bl.get('mouthClose'), 'mouthFunnel': bl.get('mouthFunnel')}}
    res.append(rec)
    if i % 20 == 0:
        print(i, round(time.time() - t0, 1), flush=True)
json.dump(res, open(W + '/suivi_rtmw.json', 'w'))
print('fini', time.time() - t0)
