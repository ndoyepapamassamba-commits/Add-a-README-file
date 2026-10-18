"""Mesure REA : la vidéo de référence peut-elle piloter un rig 2D ? RTMW (COCO-WholeBody) image par image sur les deux
personnages (boîtes fixes, caméra fixe), puis angles de segments dans le plan image (ce qu'un rig découpé consomme
directement), Hampel (fenêtre 7) + Butterworth ordre 4 à 6 Hz sans déphasage (réglages par défaut de Sports2D, lus).

Usage : python -I mocap_ref.py <video.mp4> <rtmw.onnx> <sortie.json> [pas]
Code écrit ici. Sortie : nombres seulement (aucune image dérivée).
"""
import json, subprocess, sys, time
import numpy as np
import cv2
import onnxruntime as ort
from scipy.signal import butter, filtfilt

vid, onnx_p, out_p = sys.argv[1:4]
PAS = int(sys.argv[4]) if len(sys.argv) > 4 else 2
W, H, Y0, BH = 1080, 1920, 530, 860
N_SCENE = 330                       # carte de fin ensuite
so = ort.SessionOptions(); so.intra_op_num_threads = 3
sess = ort.InferenceSession(onnx_p, so, providers=['CPUExecutionProvider'])
_, _, IH, IW = sess.get_inputs()[0].shape
boxes = {"voisine": (20, 110, 470, 860), "tonton": (510, 160, 1070, 860)}   # coordonnées dans la bande

def rtmw(rgb, box):
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    bw, bh = (x1 - x0) * 1.25, (y1 - y0) * 1.25
    if bw / bh > IW / IH: bh = bw * IH / IW
    else: bw = bh * IW / IH
    src = np.float32([[cx - bw / 2, cy - bh / 2], [cx + bw / 2, cy - bh / 2], [cx - bw / 2, cy + bh / 2]])
    M = cv2.getAffineTransform(src, np.float32([[0, 0], [IW, 0], [0, IH]]))
    crop = cv2.warpAffine(rgb, M, (IW, IH), flags=cv2.INTER_LINEAR)
    x = ((crop.astype(np.float32) - [123.675, 116.28, 103.53]) / [58.395, 57.12, 57.375]).transpose(2, 0, 1)[None]
    sx, sy = sess.run(None, {sess.get_inputs()[0].name: x.astype(np.float32)})
    sx, sy = sx[0], sy[0]
    k = np.stack([sx.argmax(1) / 2.0, sy.argmax(1) / 2.0, np.ones(sx.shape[0])], 1) @ cv2.invertAffineTransform(M).T
    return np.concatenate([k, np.minimum(sx.max(1), sy.max(1))[:, None]], 1)

cmd = ["ffmpeg", "-loglevel", "error", "-i", vid, "-vf", f"crop={W}:{BH}:0:{Y0}", "-frames:v", str(N_SCENE),
       "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
K = {n: [] for n in boxes}
t0 = time.perf_counter(); i = 0; n_inf = 0
while True:
    buf = p.stdout.read(W * BH * 3)
    if len(buf) < W * BH * 3: break
    if i % PAS == 0:
        rgb = np.frombuffer(buf, np.uint8).reshape(BH, W, 3)
        for n, b in boxes.items():
            K[n].append(rtmw(rgb, b)); n_inf += 1
    i += 1
dt = time.perf_counter() - t0
np.savez(out_p.replace(".json", "_brut.npz"), **{n: np.stack(L) for n, L in K.items()})
fps = 30.0 / PAS
# COCO-WholeBody : 5/6 épaules, 7/8 coudes, 9/10 poignets, 11/12 hanches, 13/14 genoux, 15/16 chevilles, 0 nez
SEG = {"bras_G": (5, 7), "avbras_G": (7, 9), "bras_D": (6, 8), "avbras_D": (8, 10), "cuisse_G": (11, 13),
       "jambe_G": (13, 15), "cuisse_D": (12, 14), "jambe_D": (14, 16)}
def hampel(x, w=7, n=2.0):
    x = x.copy(); h = w // 2
    for j in range(len(x)):
        s = x[max(0, j - h): j + h + 1]; med = np.median(s); mad = 1.4826 * np.median(np.abs(s - med))
        if mad > 0 and abs(x[j] - med) > n * mad: x[j] = med
    return x
b, a = butter(4, 6.0 / (fps / 2), 'low') if 6.0 < fps / 2 else (None, None)
res = {"images_analysees": len(K["voisine"]), "fps_analyse": fps, "inferences": n_inf,
       "s_par_inference": round(dt / max(n_inf, 1), 3), "personnages": {}}
for n, L in K.items():
    A = np.stack(L)                                   # (T, 133, 3)
    body = A[:, :17, 2]
    r = {"score_simcc_median_corps": round(float(np.median(body)), 2),
         "part_points_corps_score_sup_3": round(float((body > 3).mean()), 3), "segments": {}}
    tronc = np.degrees(np.arctan2(*(((A[:, 5, :2] + A[:, 6, :2]) / 2 - (A[:, 11, :2] + A[:, 12, :2]) / 2)[:, ::-1].T)))
    for s, (i0, i1) in SEG.items():
        v = A[:, i1, :2] - A[:, i0, :2]
        ang = np.degrees(np.unwrap(np.arctan2(v[:, 1], v[:, 0])))
        angh = hampel(ang)
        angf = filtfilt(b, a, angh) if b is not None else angh
        jit = lambda x: float(np.sqrt(np.mean(np.diff(x, 2) ** 2)))
        r["segments"][s] = {"amplitude_p5_p95_deg": round(float(np.percentile(angf, 95) - np.percentile(angf, 5)), 1),
                            "gigue_brute_deg": round(jit(ang), 2), "gigue_filtree_deg": round(jit(angf), 2)}
    r["tronc_amplitude_p5_p95_deg"] = round(float(np.percentile(tronc, 95) - np.percentile(tronc, 5)), 1)
    hc = (A[:, 11, :2] + A[:, 12, :2]) / 2
    r["bassin_deplacement_px"] = [round(float(np.ptp(hc[:, 0])), 1), round(float(np.ptp(hc[:, 1])), 1)]
    res["personnages"][n] = r
json.dump(res, open(out_p, "w"), indent=1)
print(json.dumps(res, indent=1))
