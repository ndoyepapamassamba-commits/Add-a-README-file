"""Analyse par personnage : racine, échelle, orientation, inclinaison, gestes, bouche (repères + région suivie)."""
import json, math
import numpy as np, cv2
from scipy.ndimage import median_filter

W = '/home/user/Add-a-README-file/studio-troupe/.private/references/041701/travail'
F = np.load(W + '/frames_full.npy', mmap_mode='r')
S = json.load(open(W + '/suivi_rtmw.json'))
Y0, Y1 = 531, 1390
N = len(S)
FPS = 30.0
SEUIL = 2.0  # score RTMW (logit SimCC) jugé fiable


def arr(nm):
    return np.array([s[nm]['K'] for s in S])  # N x 133 x 3


def mid(a, b):
    return (a + b) / 2


out = {}
for nm in ('V', 'T'):
    K = arr(nm)
    sc = K[..., 2]
    P = K[..., :2]
    # --- corps
    epaule = mid(P[:, 5], P[:, 6]); hanche = mid(P[:, 11], P[:, 12])
    torse = np.linalg.norm(epaule - hanche, axis=1)
    torse_m = float(np.median(torse))
    pieds_idx = [15, 16, 17, 18, 19, 20, 21, 22]
    pied = np.array([P[i, pieds_idx][sc[i, pieds_idx] > SEUIL].mean(0) if (sc[i, pieds_idx] > SEUIL).sum() >= 2 else P[i, pieds_idx].mean(0) for i in range(N)])
    sol = np.array([P[i, pieds_idx][:, 1].max() for i in range(N)])
    incl = np.degrees(np.arctan2(epaule[:, 0] - hanche[:, 0], hanche[:, 1] - epaule[:, 1]))  # + = penché vers la droite de l'image
    nez = P[:, 0]
    oreilles = []
    for i in range(N):
        ok = [j for j in (3, 4) if sc[i, j] > SEUIL]
        oreilles.append(P[i, ok].mean(0) if ok else mid(P[i, 3], P[i, 4]))
    oreilles = np.array(oreilles)
    yeux_ecart = np.abs(P[:, 1, 0] - P[:, 2, 0]) / torse_m
    lacet = (nez[:, 0] - oreilles[:, 0]) / torse_m  # >0 : regarde vers la droite de l'image
    regard = np.where(lacet > 0.12, 'droite', np.where(lacet < -0.12, 'gauche', 'face'))
    # --- gestes (côtés = côtés anatomiques RTMW)
    def dist(a, b):
        return np.linalg.norm(a - b, axis=1)
    bras = float(np.median(dist(P[:, 5], P[:, 7]) + dist(P[:, 7], P[:, 9])))
    gestes = {}
    for cote, (s_, e_, w_, h_) in {'g': (5, 7, 9, 11), 'd': (6, 8, 10, 12)}.items():
        poignet = P[:, w_]
        v1 = P[:, s_] - P[:, e_]; v2 = P[:, w_] - P[:, e_]
        coude = np.degrees(np.arccos(np.clip((v1 * v2).sum(1) / (np.linalg.norm(v1, axis=1) * np.linalg.norm(v2, axis=1) + 1e-6), -1, 1)))
        gestes[f'main_hanche_{cote}'] = (dist(poignet, P[:, h_]) < 0.42 * torse_m) & (np.abs(poignet[:, 1] - P[:, h_, 1]) < 0.35 * torse_m)
        gestes[f'bras_leve_{cote}'] = poignet[:, 1] < P[:, s_, 1] - 0.15 * torse_m
        gestes[f'bras_tendu_{cote}'] = (coude > 140) & (dist(poignet, P[:, s_]) > 0.72 * bras) & ~gestes[f'bras_leve_{cote}']
    joue = (dist(P[:, 9], nez) < 0.55 * torse_m) & (dist(P[:, 10], nez) < 0.55 * torse_m)
    gestes['mains_joues'] = joue
    gestes['penche_avant'] = np.abs(incl) > 18
    # lissage (médiane 7 images) des drapeaux
    for k in gestes:
        gestes[k] = median_filter(gestes[k].astype(np.uint8), 7, mode='nearest').astype(bool)
    # --- bouche : repères RTMW (68 points visage à partir de l'indice 23)
    f = lambda j: P[:, 23 + j]
    hv = np.linalg.norm(f(27) - f(8), axis=1)  # haut du nez -> menton
    hv_m = float(np.median(hv))
    ouv_rtmw = np.linalg.norm(f(62) - f(66), axis=1) / hv_m
    ouv_ext = np.linalg.norm(f(51) - f(57), axis=1) / hv_m
    bouche_c = np.mean(P[:, 23 + 48:23 + 60], axis=1)
    bouche_c = np.stack([median_filter(bouche_c[:, 0], 5, mode='nearest'), median_filter(bouche_c[:, 1], 5, mode='nearest')], 1)
    # taille de tête : écart vertical œil -> menton (médiane) ; la région couvre la chute de mâchoire
    tete = max(40.0, float(np.median(np.ptp(P[:, 23:91, 1], axis=1))))
    s = 0.95 * tete
    sombre = np.zeros(N); diff = np.zeros(N); prev = None
    for i in range(N):
        g = cv2.cvtColor(np.ascontiguousarray(F[i, Y0:Y1]), cv2.COLOR_RGB2GRAY).astype(np.float32)
        cx, cy = bouche_c[i]
        x0, x1 = int(round(cx - 0.5 * s)), int(round(cx + 0.5 * s))
        y0, y1 = int(round(cy - 0.3 * s)), int(round(cy + 0.75 * s))
        x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(1080, x1), min(859, y1)
        roi = cv2.resize(g[y0:y1, x0:x1], (64, 64), interpolation=cv2.INTER_AREA)
        sombre[i] = float((roi < 42).mean())
        if prev is not None:
            # même fenêtre (celle de l'image i) dans l'image i-1 : la région suit la tête
            gp = prev[y0:y1, x0:x1]
            roi_p = cv2.resize(gp, (64, 64), interpolation=cv2.INTER_AREA)
            diff[i] = float(np.abs(roi - roi_p).mean())
        prev = g
    diff[0] = diff[1]
    # MediaPipe
    mp_ok = np.array([S[i][nm]['mp'] is not None for i in range(N)])
    jaw = np.array([S[i][nm]['mp']['jawOpen'] if S[i][nm]['mp'] is not None and S[i][nm]['mp']['jawOpen'] is not None else np.nan for i in range(N)])
    out[nm] = dict(K=K, pied=pied, sol=sol, incl=incl, lacet=lacet, regard=regard, yeux_ecart=yeux_ecart, torse=torse, torse_m=torse_m,
                   hanche=hanche, epaule=epaule, nez=nez, gestes=gestes, ouv_rtmw=ouv_rtmw, ouv_ext=ouv_ext, sombre=sombre, diff=diff,
                   mp_ok=mp_ok, jaw=jaw, tete=tete, bouche_c=bouche_c, sc=sc)
np.save(W + '/persos.npy', out, allow_pickle=True)
for nm, o in out.items():
    print(nm, 'torse %.0f px, tête %.0f px, MP détecté %.0f %%, jawOpen médian %.2f' % (o['torse_m'], o['tete'], 100 * o['mp_ok'].mean(), np.nanmedian(o['jaw']) if np.isfinite(o['jaw']).any() else -1))
