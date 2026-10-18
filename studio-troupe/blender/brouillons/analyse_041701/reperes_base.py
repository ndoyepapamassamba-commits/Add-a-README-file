"""Détecteurs de repères partagés (RTMW 133 points, MediaPipe pose et visage) sur une image RGB."""
import numpy as np, cv2
import onnxruntime as ort
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision
VDIR = "/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/modeles/vision"; MPDIR = VDIR

_so = ort.SessionOptions(); _so.intra_op_num_threads = 1; _so.inter_op_num_threads = 1
_rtmw = None; _pose = None; _face = None


def rtmw(rgb, bbox, marge=1.25):
    """133 points (x, y, score) en px image. bbox = (x0, y0, x1, y1) de la silhouette."""
    global _rtmw
    if _rtmw is None:
        _rtmw = ort.InferenceSession(f'{VDIR}/rtmw/end2end.onnx', _so, providers=['CPUExecutionProvider'])
    _, _, IH, IW = _rtmw.get_inputs()[0].shape
    x0, y0, x1, y1 = bbox
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    bw, bh = (x1 - x0) * marge, (y1 - y0) * marge
    if bw / bh > IW / IH: bh = bw * IH / IW
    else: bw = bh * IW / IH
    src = np.float32([[cx - bw / 2, cy - bh / 2], [cx + bw / 2, cy - bh / 2], [cx - bw / 2, cy + bh / 2]])
    M = cv2.getAffineTransform(src, np.float32([[0, 0], [IW, 0], [0, IH]]))
    crop = cv2.warpAffine(rgb, M, (IW, IH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    xin = ((crop.astype(np.float32) - np.array([123.675, 116.28, 103.53])) / np.array([58.395, 57.12, 57.375])).transpose(2, 0, 1)[None].astype(np.float32)
    sx, sy = _rtmw.run(None, {_rtmw.get_inputs()[0].name: xin})
    sx, sy = sx[0], sy[0]
    score = np.minimum(sx.max(1), sy.max(1))
    pts = np.stack([sx.argmax(1) / 2.0, sy.argmax(1) / 2.0, np.ones(sx.shape[0])], 1) @ cv2.invertAffineTransform(M).T
    return np.concatenate([pts, score[:, None]], 1)


def mp_pose(rgb):
    global _pose
    if _pose is None:
        _pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=mpt.BaseOptions(model_asset_path=f'{MPDIR}/pose_landmarker_heavy.task'), running_mode=vision.RunningMode.IMAGE,
            num_poses=1, min_pose_detection_confidence=0.2, min_pose_presence_confidence=0.2))
    H, W = rgb.shape[:2]
    r = _pose.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
    if not r.pose_landmarks: return None
    return np.array([[l.x * W, l.y * H, l.visibility] for l in r.pose_landmarks[0]])


def mp_visage(rgb, boite, taille=512):
    """478 points + blendshapes sur la tête recadrée (boite x0, y0, x1, y1) agrandie à `taille`."""
    global _face
    if _face is None:
        _face = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=mpt.BaseOptions(model_asset_path=f'{VDIR}/face_landmarker.task'), running_mode=vision.RunningMode.IMAGE,
            num_faces=1, output_face_blendshapes=True, min_face_detection_confidence=0.2, min_face_presence_confidence=0.2))
    H, W = rgb.shape[:2]
    x0, y0, x1, y1 = [int(round(v)) for v in boite]
    pad = ((max(0, -y0), max(0, y1 - H)), (max(0, -x0), max(0, x1 - W)), (0, 0))
    img = np.pad(rgb, pad, mode='edge')
    crop = img[y0 + pad[0][0]:y1 + pad[0][0], x0 + pad[1][0]:x1 + pad[1][0]]
    sc = taille / max(crop.shape[:2])
    up = cv2.resize(crop, (int(round(crop.shape[1] * sc)), int(round(crop.shape[0] * sc))), interpolation=cv2.INTER_CUBIC)
    r = _face.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(up)))
    if not r.face_landmarks: return None, {}
    hh, ww = up.shape[:2]
    P = np.array([[x0 + l.x * ww / sc, y0 + l.y * hh / sc] for l in r.face_landmarks[0]])
    bl = {c.category_name: round(float(c.score), 3) for c in r.face_blendshapes[0]} if r.face_blendshapes else {}
    return P, bl


COCO = {0: 'nez', 1: 'oeil_g', 2: 'oeil_d', 3: 'oreille_g', 4: 'oreille_d', 5: 'epaule_g', 6: 'epaule_d', 7: 'coude_g', 8: 'coude_d',
        9: 'poignet_g', 10: 'poignet_d', 11: 'hanche_g', 12: 'hanche_d', 13: 'genou_g', 14: 'genou_d', 15: 'cheville_g',
        16: 'cheville_d', 17: 'gros_orteil_g', 18: 'petit_orteil_g', 19: 'talon_g', 20: 'gros_orteil_d', 21: 'petit_orteil_d', 22: 'talon_d'}
COCO2MP = {0: 0, 1: 2, 2: 5, 3: 7, 4: 8, 5: 11, 6: 12, 7: 13, 8: 14, 9: 15, 10: 16, 11: 23, 12: 24, 13: 25, 14: 26, 15: 27, 16: 28,
           19: 29, 22: 30, 17: 31, 20: 32}


def fusion(K, MP, torse):
    """Articulations fusionnées RTMW + MediaPipe (moyenne pondérée si accord, le plus confiant sinon)."""
    J = {}
    for i, nm in COCO.items():
        pr, sr = K[i, :2], float(K[i, 2])
        if MP is not None and i in COCO2MP:
            pm, sm = MP[COCO2MP[i], :2], float(MP[COCO2MP[i], 2])
            d = float(np.linalg.norm(pr - pm)) / max(1.0, torse)
            wr, wm = max(1e-3, min(sr, 1.0)), max(1e-3, sm)
            if d > 0.15:
                p, c = (pr, sr) if wr >= wm else (pm, sm)
            else:
                p, c = (wr * pr + wm * pm) / (wr + wm), max(sr, sm)
            J[nm] = {'xy': [round(float(p[0]), 1), round(float(p[1]), 1)], 'conf': round(float(min(1.0, c)), 3), 'rtmw': round(sr, 3),
                     'mp': round(sm, 3), 'ecart_torse': round(d, 3), 'xy_rtmw': [round(float(pr[0]), 1), round(float(pr[1]), 1)],
                     'xy_mp': [round(float(pm[0]), 1), round(float(pm[1]), 1)]}
        else:
            J[nm] = {'xy': [round(float(pr[0]), 1), round(float(pr[1]), 1)], 'conf': round(min(1.0, sr), 3), 'rtmw': round(sr, 3)}
    for side, rng in (('g', range(91, 112)), ('d', range(112, 133))):
        hk = K[list(rng)]
        good = hk[hk[:, 2] > 0.3]
        c = good[:, :2].mean(0) if len(good) >= 5 else hk[:, :2].mean(0)
        J[f'main_{side}'] = {'xy': [round(float(c[0]), 1), round(float(c[1]), 1)], 'conf': round(float(hk[:, 2].mean()), 3),
                             'points_main': hk[:, :3].round(2).tolist()}
    return J
