"""Découpe automatique d'un personnage peint (RGBA) en pièces (bras G/D, jambes G/D, tronc+tête) à partir des repères
RTMW, puis remplissage (inpainting OpenCV Telea) des zones du tronc que les bras/jambes recouvraient.

Usage : python -I decouper_pieces.py <rgba.png> <kp.json> <sortie_dir>
Écrit <sortie_dir>/piece_<nom>.png (RGBA, même taille que l'entrée) et pieces.json (os de chaque pièce, ordre z).
Code écrit ici.
"""
import json, os, sys
import numpy as np
import cv2
from PIL import Image

rgba_p, kp_p, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
im = np.asarray(Image.open(rgba_p).convert("RGBA")).copy()
H, W = im.shape[:2]
A = im[:, :, 3] > 127
kp = {k: np.array(v, np.float32) for k, v in json.load(open(kp_p)).items()}
mid = lambda a, b: (kp[a] + kp[b]) / 2
hip_c, sho_c = mid("lhip", "rhip"), mid("lsho", "rsho")
top = np.array([kp["nose"][0], 71.0], np.float32)

parts = {
    "bras_G": ([("lsho", "lelb"), ("lelb", "lwri"), ("lwri", "lmid")], 0.040),
    "bras_D": ([("rsho", "relb"), ("relb", "rwri"), ("rwri", "rmid")], 0.040),
    "jambe_G": ([("lhip", "lkne"), ("lkne", "lank"), ("lank", "lbigtoe")], 0.050),
    "jambe_D": ([("rhip", "rkne"), ("rkne", "rank"), ("rank", "rbigtoe")], 0.050),
}
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
def dist_seg(a, b):
    ab = b - a
    t = ((xx - a[0]) * ab[0] + (yy - a[1]) * ab[1]) / max(float(ab @ ab), 1e-6)
    t = np.clip(t, 0, 1)
    return np.hypot(xx - (a[0] + t * ab[0]), yy - (a[1] + t * ab[1]))
def P(n):
    return kp[n]
score = {}
for name, (segs, r) in parts.items():
    d = np.min([dist_seg(P(a), P(b)) for a, b in segs], axis=0)
    score[name] = d / (r * H)
core_d = np.min([dist_seg(hip_c, sho_c), dist_seg(sho_c, kp["nose"]), dist_seg(kp["nose"], top)], axis=0)
score["tronc"] = core_d / (0.11 * H)
names = list(score)
lab = np.argmin(np.stack([score[n] for n in names]), axis=0)
# les jambes ne montent pas au-dessus des hanches, les bras ne descendent pas dans le bassin côté intérieur
for n in ("jambe_G", "jambe_D"):
    i = names.index(n)
    lab[(lab == i) & (yy < hip_c[1] + 0.02 * H)] = names.index("tronc")

res = {"pieces": {}}
k3 = np.ones((3, 3), np.uint8)
masks = {n: (A & (lab == i)) for i, n in enumerate(names)}
# garder la plus grande composante connexe de chaque membre (le reste retourne au tronc)
for n in names:
    if n == "tronc":
        continue
    m = masks[n].astype(np.uint8)
    cnt, cc, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if cnt > 2:
        big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        rest = (cc > 0) & (cc != big)
        masks["tronc"] |= rest
        masks[n] = cc == big
# tronc : plus grande composante ; les îlots (bouts de doigts...) vont au membre le plus proche
m = masks["tronc"].astype(np.uint8)
cnt, cc, st, _ = cv2.connectedComponentsWithStats(m, 8)
if cnt > 2:
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    membres = [n for n in names if n != "tronc"]
    best = np.argmin(np.stack([score[n] for n in membres]), axis=0)
    for c in range(1, cnt):
        if c == big:
            continue
        isl = cc == c
        votes = np.bincount(best[isl], minlength=len(membres))
        masks[membres[int(np.argmax(votes))]] |= isl
    masks["tronc"] = cc == big
for n in names:
    m = masks[n].astype(np.uint8)
    m = cv2.dilate(m, k3, iterations=2) & A.astype(np.uint8)       # recouvrement de 2 px aux coutures
    piece = im.copy()
    piece[:, :, 3] = np.where(m > 0, im[:, :, 3], 0)
    if n == "tronc":
        # trou du tronc : pixels de membres situés à l'intérieur de l'enveloppe convexe du tronc -> inpainting
        # zone de recouvrement plausible : membres à moins de 1 % de la hauteur du tronc
        pres = cv2.dilate(masks["tronc"].astype(np.uint8), np.ones((3, 3), np.uint8), iterations=int(0.01 * H))
        trou = (pres > 0) & A & (m == 0)
        trou = cv2.erode(trou.astype(np.uint8), k3, iterations=1)    # rester prudent sur les bords
        rgb = cv2.inpaint(np.ascontiguousarray(im[:, :, :3]), trou, 5, cv2.INPAINT_TELEA)
        piece[:, :, :3] = np.where(trou[..., None] > 0, rgb, piece[:, :, :3])
        piece[:, :, 3] = np.where(trou > 0, 255, piece[:, :, 3])
        res["trou_tronc_px"] = int(trou.sum())
    Image.fromarray(piece).save(os.path.join(out, f"piece_{n}.png"))
    res["pieces"][n] = int((piece[:, :, 3] > 127).sum())
json.dump(res, open(os.path.join(out, "pieces.json"), "w"), indent=1)
# planche de contrôle des étiquettes
col = np.array([[230, 60, 60], [60, 120, 230], [240, 180, 40], [60, 200, 90], [180, 180, 180]], np.uint8)
viz = np.zeros((H, W, 3), np.uint8)
for i, n in enumerate(names):
    viz[masks[n]] = col[i]
Image.fromarray(viz).save(os.path.join(out, "etiquettes.png"))
print(json.dumps(res))
