"""Silhouettes BiRefNet (1 image sur 6) partagées entre V et T par le squelette RTMW le plus proche -> boîte, hauteur, aire."""
import json
import numpy as np, cv2

W = '/home/user/Add-a-README-file/studio-troupe/.private/references/041701/travail'
Z = np.load(W + '/masques_biref.npz')
S = json.load(open(W + '/suivi_rtmw.json'))
OS = [(5, 7), (7, 9), (6, 8), (8, 10), (5, 6), (11, 12), (5, 11), (6, 12), (11, 13), (13, 15), (12, 14), (14, 16), (0, 5), (0, 6),
      (15, 19), (16, 22), (15, 17), (16, 20)]


def squelette(K, seuil=1.0):
    img = np.zeros((859, 1080), np.uint8)
    for a, b in OS:
        if K[a][2] > seuil and K[b][2] > seuil:
            cv2.line(img, (int(K[a][0]), int(K[a][1])), (int(K[b][0]), int(K[b][1])), 255, 3)
    for j in list(range(0, 23)) + list(range(91, 133)):
        if K[j][2] > seuil:
            cv2.circle(img, (int(K[j][0]), int(K[j][1])), 4, 255, -1)
    return img


res = []
for k, i in enumerate(Z['idx']):
    m = Z['m'][k] > 127
    n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
    keep = np.zeros_like(m)
    for c in range(1, n):
        if st[c, cv2.CC_STAT_AREA] > 800:
            keep |= lab == c
    dv = cv2.distanceTransform(255 - squelette(S[i]['V']['K']), cv2.DIST_L2, 5)
    dt = cv2.distanceTransform(255 - squelette(S[i]['T']['K']), cv2.DIST_L2, 5)
    rec = {'i': int(i), 't': round(int(i) / 30, 3)}
    for nm, mm in (('V', keep & (dv <= dt)), ('T', keep & (dt < dv))):
        ys, xs = np.nonzero(mm)
        if len(xs) < 100:
            rec[nm] = None
            continue
        bas = ys.max()
        rec[nm] = {'boite': [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1], 'hauteur': int(ys.max() - ys.min() + 1),
                   'largeur': int(xs.max() - xs.min() + 1), 'aire': int(mm.sum()), 'centre': [round(float(xs.mean()), 1), round(float(ys.mean()), 1)],
                   'bas': [round(float(np.median(xs[ys >= bas - 8])), 1), int(bas)]}
    res.append(rec)
json.dump(res, open(W + '/silhouettes.json', 'w'), indent=0)
for r in res[::5]:
    print(r['i'], {nm: (r[nm]['boite'], r[nm]['hauteur']) if r[nm] else None for nm in ('V', 'T')})
