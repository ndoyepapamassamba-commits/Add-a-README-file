#!/usr/bin/env python3
"""POSES D'UNE PLANCHE DE PERSONNAGE — généralisé à toute la troupe (16/10 : « cet affinement doit concerner tous les
personnages et scènes de la troupe »). Pour chaque planche sur fond vert (5 poses par personnage, ou une galerie de
dizaines de personnages) :

  1. DÉTOURAGE du fond vert (dominance du vert) et SÉPARATION des figures par partage des eaux (OpenCV) : graines =
     cœur érodé de chaque figure, de sorte qu'un doigt posé sur le foulard du voisin revient à SA figure ; un débris
     (bout de manche d'une figure voisine) est retiré, rien n'est coupé au bord (cadre élargi d'une marge) ;
  2. MESURE COMPLÈTE avec MediaPipe (Apache-2.0) : corps (Pose Landmarker heavy, 33 points), mains (Hand Landmarker,
     21 points par main), visage recadré et agrandi (Face Landmarker, contour des yeux + iris 468-477) ;
  3. NOM DE LA POSE déduit du squelette (neutre, accuse, choc, haussement, rire) — une suggestion, vérifiable sur la
     planche de contrôle.

Sorties (dossier --out) : <n>.png (RGBA), poses.json (cadre, squelettes, mains, yeux, nom proposé), controle.jpg.
Usage : troupe_poses.py --sheet planche.jpg --out dossier [--margin 40]
"""
import argparse
import json
import os

import cv2
import numpy as np

MODELS = os.path.expanduser('~/.cache/massamba-models')
EYE = {'g': [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246], 'd': [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]}
IRIS = {'g': [468, 469, 470, 471, 472], 'd': [473, 474, 475, 476, 477]}
_M = {}


def key_alpha(bgr):
    """Green-screen alpha; then the HOLES inside a figure are filled back unless they have the exact colour of the
    sheet's background (a green jersey number is not the backdrop; the gap between an arm and the body is)."""
    b, g, r = [bgr[..., c].astype(np.float32) for c in range(3)]
    a = np.clip((90 - (g - np.maximum(r, b))) / 70, 0, 1)
    H, W = a.shape
    border = np.concatenate([bgr[0], bgr[-1], bgr[:, 0], bgr[:, -1]]).astype(np.float32)
    bg = np.median(border, axis=0)
    low = (a < 0.5).astype(np.uint8)
    n, lab = cv2.connectedComponents(low)
    outside = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    hole = (low > 0) & ~np.isin(lab, outside)
    far = np.linalg.norm(bgr.astype(np.float32) - bg, axis=2) > 60
    fill = hole & far
    return np.where(fill, 1.0, a)


def separate(bgr, alpha, min_share=0.004):
    """Figures of the sheet: watershed from the eroded core of each figure (thin bridges between neighbours ignored)."""
    fg = (alpha > 0.5).astype(np.uint8)
    core = cv2.erode(fg, np.ones((13, 13), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(core)
    H, W = fg.shape
    mk = np.zeros((H, W), np.int32)
    mk[alpha < 0.15] = 1
    seeds = []
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] >= min_share * H * W:
            seeds.append(i)
            mk[lab == i] = len(seeds) + 1
    # a thin neck can split one figure into a head seed and a body seed: seeds of the same figure (same connected
    # silhouette) that are STACKED (x-ranges overlapping by half) are merged — figures side by side stay apart
    fgl = cv2.connectedComponents(fg)[1]
    info = []
    for j, i in enumerate(seeds):
        ys, xs = np.where(lab == i)
        info.append((j + 2, xs.min(), xs.max(), int(np.bincount(fgl[lab == i]).argmax())))
    parent = {k[0]: k[0] for k in info}
    find = lambda x: x if parent[x] == x else find(parent[x])
    for a_ in info:
        for b_ in info:
            if a_[0] < b_[0] and a_[3] == b_[3]:
                ov = min(a_[2], b_[2]) - max(a_[1], b_[1])
                if ov > 0.5 * min(a_[2] - a_[1], b_[2] - b_[1]):
                    parent[find(b_[0])] = find(a_[0])
    for k in parent:
        r = find(k)
        if r != k:
            mk[mk == k] = r
    ws = cv2.watershed(bgr.copy(), mk)
    labels = sorted({find(k) for k in parent})
    remap = np.zeros(ws.max() + 2, np.int32)
    for j, k in enumerate(labels):
        remap[k] = j + 2
    ws = np.where(ws > 1, remap[np.clip(ws, 0, ws.max())], ws)
    return ws, len(labels)


def clean_alpha(a, keep_px=128):
    """One piece: the biggest opaque component (judged on the core eroded by 1 px), debris and their halo removed."""
    solid = cv2.erode(cv2.morphologyEx((a > keep_px / 255).astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))), np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(solid)
    if n < 2:
        return a
    areas = st[1:, cv2.CC_STAT_AREA]
    big = 1 + int(np.argmax(areas))
    # a DEBRIS is small (< 8 % of the figure): a head joined by a thin neck is kept (measured on Petit Mamadou, 16/10)
    keep = np.isin(lab, [i for i in range(1, n) if i == big or st[i, cv2.CC_STAT_AREA] >= 0.08 * areas.max()])
    body = cv2.dilate(keep.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
    other = cv2.dilate(((lab > 0) & ~keep).astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool) & ~cv2.dilate(keep.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    return np.where(body & ~other, a, 0)


def mp_models():
    if _M:
        return _M
    from mediapipe.tasks.python import vision, BaseOptions
    p = lambda f: os.path.join(MODELS, f)
    _M['pose'] = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=p('pose_landmarker_heavy.task')), min_pose_detection_confidence=0.3)) if os.path.exists(p('pose_landmarker_heavy.task')) else None
    _M['hands'] = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(base_options=BaseOptions(model_asset_path=p('hand_landmarker.task')), num_hands=2, min_hand_detection_confidence=0.2, min_hand_presence_confidence=0.2)) if os.path.exists(p('hand_landmarker.task')) else None
    _M['face'] = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=p('face_landmarker.task')), num_faces=1, min_face_detection_confidence=0.2)) if os.path.exists(p('face_landmarker.task')) else None
    return _M


def measure(rgba):
    """MediaPipe body (33), hands (2 × 21), face (eyes + irises) of one pose, in fractions of the pose."""
    import mediapipe as mp
    M = mp_models()
    h, w = rgba.shape[:2]
    al = rgba[..., 3:4].astype(np.float32) / 255
    rgb = (rgba[..., :3][..., ::-1] * al + 255 * (1 - al)).astype(np.uint8)
    P = 60
    pad = cv2.copyMakeBorder(rgb, P, P, P, P, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(pad))
    rec = {'body': None, 'mains': [], 'yeux': {}}
    if M.get('pose'):
        r = M['pose'].detect(img)
        if r.pose_landmarks:
            L = r.pose_landmarks[0]
            rec['body'] = {str(i): [round((L[i].x * pad.shape[1] - P) / w, 4), round((L[i].y * pad.shape[0] - P) / h, 4), round(float(L[i].visibility or 0), 3)] for i in range(33)}
    if M.get('hands'):
        for scale in (1.0, 1.6):
            if rec['mains']:
                break
            im2 = img if scale == 1 else mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.resize(pad, None, fx=scale, fy=scale)))
            hr = M['hands'].detect(im2)
            for lm, hd in zip(hr.hand_landmarks, hr.handedness):
                rec['mains'].append({'cote': hd[0].category_name, 'score': round(hd[0].score, 3), 'pts': [[round((p.x * pad.shape[1] - P) / w, 4), round((p.y * pad.shape[0] - P) / h, 4)] for p in lm]})
    if M.get('face') and rec['body']:
        nx, ny = rec['body']['0'][0] * w, rec['body']['0'][1] * h
        half = 0.13 * h
        x0, y0, x1, y1 = int(max(0, nx - half)), int(max(0, ny - half * 1.1)), int(min(w, nx + half)), int(min(h, ny + half * 0.9))
        if x1 - x0 > 8 and y1 - y0 > 8:
            crop = cv2.copyMakeBorder(rgb[y0:y1, x0:x1], 40, 40, 40, 40, cv2.BORDER_CONSTANT, value=(255, 255, 255))
            k = 480 / crop.shape[0]
            big = cv2.resize(crop, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
            fr = M['face'].detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big)))
            if fr.face_landmarks:
                L = fr.face_landmarks[0]
                xy = lambda i: [(L[i].x * big.shape[1] / k - 40 + x0) / w, (L[i].y * big.shape[0] / k - 40 + y0) / h]
                for e in 'gd':
                    ir = np.array([xy(i) for i in IRIS[e]])
                    c = ir[0]
                    rec['yeux'][e] = {'contour': [[round(v, 4) for v in xy(i)] for i in EYE[e]], 'iris': [round(c[0], 4), round(c[1], 4)],
                                      'r_iris_px': round(float(np.mean(np.hypot((ir[1:, 0] - c[0]) * w, (ir[1:, 1] - c[1]) * h))), 2)}
    return rec


def name_pose(body, w, h):
    """Pose name suggested by the skeleton (thresholds measured on the troupe's 35 drawn poses, 16/10), in units of the
    figure's height H: hands at the face → choc; torso leaning > 15° → rire; one wrist at shoulder height and the other
    down → accuse; both wrists at mid height and apart → haussement; both arms down → neutre."""
    if not body:
        return 'inconnue'
    P = lambda i: np.array([body[str(i)][0] * w, body[str(i)][1] * h])
    nose, ls, rs, lw, rw, lh, rh = (P(i) for i in (0, 11, 12, 15, 16, 23, 24))
    shm, him = (ls + rs) / 2, (lh + rh) / 2
    H = max(1.0, np.linalg.norm(shm - him) * 3.2)
    reach = [abs(x[0] - shm[0]) / H for x in (lw, rw)]
    up = [(x[1] - shm[1]) / H for x in (lw, rw)]
    near_face = [np.linalg.norm(x - nose) / H for x in (lw, rw)]
    lean = np.degrees(np.arctan2(abs(shm[0] - him[0]), max(1e-6, him[1] - shm[1])))
    if max(near_face) < 0.13 or (max(reach) < 0.08 and max(up) < 0.05):
        return 'choc'
    if lean > 15:
        return 'rire'
    if min(up) < 0.08 and max(up) > 0.14:
        return 'accuse'
    if max(up) < 0.14 and min(reach) > 0.09:
        return 'haussement'
    return 'neutre'


def run(sheet_path, out, margin=40):
    os.makedirs(out, exist_ok=True)
    bgr = cv2.imread(sheet_path)
    H, W = bgr.shape[:2]
    alpha = key_alpha(bgr)
    ws, n = separate(bgr, alpha)
    poses = []
    for lab in range(2, n + 2):
        m = ws == lab
        ys, xs = np.where(m)
        if len(ys) < 0.004 * H * W:
            continue
        x0, y0, x1, y1 = max(0, xs.min() - margin), max(0, ys.min() - margin), min(W, xs.max() + margin + 1), min(H, ys.max() + margin + 1)
        mine = cv2.dilate(m[y0:y1, x0:x1].astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        a = np.where(mine, alpha[y0:y1, x0:x1], 0)
        a = clean_alpha(a)
        crop = bgr[y0:y1, x0:x1].astype(np.float32)
        edge = (a > 0) & (a < 0.98)
        lim = (crop[..., 0] + crop[..., 2]) / 2 + 15                       # vert résiduel sur les bords
        crop[..., 1] = np.where(edge & (crop[..., 1] > lim), lim, crop[..., 1])
        rgba = np.dstack([crop, a * 255]).clip(0, 255).astype(np.uint8)
        touches = int((a[:, 0] > 0.16).sum() + (a[:, -1] > 0.16).sum() + (a[0] > 0.16).sum() + (a[-1] > 0.16).sum())
        poses.append({'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0), 'rgba': rgba, 'bords_sheet': touches})
    # order: rows top to bottom, then left to right
    rowh = np.median([p['h'] for p in poses]) if poses else 1
    poses.sort(key=lambda p: (round((p['y'] + p['h']) / rowh), p['x']))
    rec = {'planche': os.path.basename(sheet_path), 'taille': [W, H], 'poses': []}
    for i, p in enumerate(poses):
        fn = f'{i + 1:02d}.png'
        cv2.imwrite(os.path.join(out, fn), p['rgba'])
        mz = measure(p['rgba'])
        nm = name_pose(mz['body'], p['w'], p['h'])
        rec['poses'].append({'fichier': fn, 'cadre': [p['x'], p['y'], p['w'], p['h']], 'nom_propose': nm, 'bords_de_planche': p['bords_sheet'], **mz})
    json.dump(rec, open(os.path.join(out, 'poses.json'), 'w'), ensure_ascii=False)
    # contact sheet with skeleton, hands and eyes
    tiles = []
    for p, r in zip(poses, rec['poses']):
        a = p['rgba'].astype(np.float32)
        al = a[..., 3:4] / 255
        im = (a[..., :3] * al + 190 * (1 - al)).astype(np.uint8)
        h, w = im.shape[:2]
        if r['body']:
            for k, (x, y, v) in r['body'].items():
                if v > 0.5:
                    cv2.circle(im, (int(x * w), int(y * h)), 3, (0, 0, 255), -1)
        for mn in r['mains']:
            for x, y in mn['pts']:
                cv2.circle(im, (int(x * w), int(y * h)), 2, (0, 255, 255), -1)
        for e in r['yeux'].values():
            cv2.circle(im, (int(e['iris'][0] * w), int(e['iris'][1] * h)), 3, (0, 255, 0), -1)
        im = cv2.resize(im, (int(w * 300 / h), 300))
        cv2.putText(im, f"{r['fichier'][:2]} {r['nom_propose']}", (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
        tiles.append(im)
    if tiles:
        cv2.imwrite(os.path.join(out, 'controle.jpg'), np.hstack(tiles))
    return {'planche': rec['planche'], 'poses': len(rec['poses']), 'squelettes': sum(1 for p in rec['poses'] if p['body']),
            'mains': sum(len(p['mains']) for p in rec['poses']), 'yeux': sum(1 for p in rec['poses'] if p['yeux']),
            'noms': [p['nom_propose'] for p in rec['poses']], 'coupees_par_la_planche': sum(1 for p in rec['poses'] if p['bords_de_planche'] > 0)}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheet', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--margin', type=int, default=40)
    a = ap.parse_args()
    print(json.dumps(run(a.sheet, a.out, a.margin), ensure_ascii=False))
