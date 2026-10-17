# Fluidité, caméra séparée du jeu : flux DIS à 288 px ; caméra = flux médian de l'image ; jeu = |flux − médiane|.
#  caméra : mouvement moyen de la caméra (px/image) ; jeu vivant : part de l'image dont le mouvement propre > 0,3 px/i ;
#  sautes : images où l'écart propre (hors caméra) bondit > 3 × la médiane glissante — dessin ou bouche qui saute.
import sys, cv2, numpy as np
path, y0, y1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
cap = cv2.VideoCapture(path); fps = cap.get(cv2.CAP_PROP_FPS)
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
prev = None; cam, live, loc, dif = [], [], [], []
while True:
    ok, f = cap.read()
    if not ok: break
    h = f.shape[0]; f = f[int(h * y0):int(h * y1)]
    g = cv2.cvtColor(cv2.resize(f, (288, int(288 * f.shape[0] / f.shape[1]))), cv2.COLOR_BGR2GRAY)
    if prev is not None:
        fl = dis.calc(prev, g, None)
        md = np.median(fl.reshape(-1, 2), 0)
        r = np.hypot(fl[..., 0] - md[0], fl[..., 1] - md[1])
        cam.append(np.hypot(*md)); live.append((r > 0.3).mean()); loc.append(r.mean())
        # écart propre : image précédente recalée de la caméra, puis différence
        M = np.float32([[1, 0, md[0]], [0, 1, md[1]]])
        w = cv2.warpAffine(prev, M, (g.shape[1], g.shape[0]), borderMode=cv2.BORDER_REPLICATE)
        dif.append(np.abs(g.astype(np.float32) - w.astype(np.float32))[8:-8, 8:-8].mean())
    prev = g
cam, live, loc, dif = map(np.array, (cam, live, loc, dif))
cut = dif > 12 * np.median(dif)
k = ~cut
med = np.array([np.median(dif[max(0, i - 7):i + 8]) for i in range(len(dif))])
pops = ((dif > 3 * med) & k).sum()
sm = np.abs(np.diff(loc, 2))[(k[2:] & k[1:-1] & k[:-2])]
print(f"{path.split('/')[-1][:34]:34} | caméra {cam[k].mean():.2f} px/i | jeu vivant {live[k].mean()*100:4.1f} % | jeu {loc[k].mean():.2f} px/i | sautes {pops / (len(dif) / fps):.2f}/s | régularité du jeu {sm.mean() / (loc[k].mean() + 1e-9):.2f} | coupes {int(cut.sum())}")
