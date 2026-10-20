# Repère chaque personnage d'une scène générée : squelette + masque par personne (MediaPipe Pose Landmarker heavy, Apache-2.0),
# visage (Face Landmarker, Apache-2.0) ; ordre gauche → droite = ordre des acteurs de la description.
import os, json, sys, numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
M = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/'
def poses(rgb, n):
    o = vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=M + 'pose_landmarker_heavy.task'), running_mode=vision.RunningMode.IMAGE,
                                     num_poses=n, min_pose_detection_confidence=0.2, min_pose_presence_confidence=0.2, output_segmentation_masks=True)
    with vision.PoseLandmarker.create_from_options(o) as d:
        r = d.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    H, W = rgb.shape[:2]; out = []
    for i, lm in enumerate(r.pose_landmarks):
        pts = np.array([[p.x * W, p.y * H, p.visibility] for p in lm])
        m = r.segmentation_masks[i].numpy_view() if r.segmentation_masks else None
        out.append({'pts': pts, 'mask': m})
    return sorted(out, key=lambda a: a['pts'][0, 0])
def face5(rgb, box):
    x0, y0, x1, y1 = [int(v) for v in box]
    crop = np.ascontiguousarray(rgb[y0:y1, x0:x1])
    o = vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=M + 'face_landmarker.task'), running_mode=vision.RunningMode.IMAGE, num_faces=1,
                                     min_face_detection_confidence=0.2)
    with vision.FaceLandmarker.create_from_options(o) as d:
        r = d.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop))
    if not r.face_landmarks: return None
    h, w = crop.shape[:2]; L = np.array([[p.x * w + x0, p.y * h + y0] for p in r.face_landmarks[0]])
    eyeL = L[[33, 133, 159, 145]].mean(0); eyeR = L[[362, 263, 386, 374]].mean(0)
    return {'eyes': [{'c': eyeL.tolist()}, {'c': eyeR.tolist()}], 'nose': L[1].tolist(), 'seam': L[[13, 14]].mean(0).tolist(),
            'mouthWidth': float(np.linalg.norm(L[61] - L[291])), 'box': [float(L[:, 0].min()), float(L[:, 1].min()), float(L[:, 0].max()), float(L[:, 1].max())]}
if __name__ == '__main__':
    f, n = sys.argv[1], int(sys.argv[2])
    rgb = cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB)
    A = poses(rgb, n); vis = rgb.copy()
    for k, a in enumerate(A):
        p = a['pts']; m = (a['mask'] > 0.5) if a['mask'] is not None else None
        col = [(255, 0, 0), (0, 255, 0), (0, 0, 255)][k % 3]
        if m is not None: vis[m] = (0.55 * vis[m] + 0.45 * np.array(col)).astype(np.uint8)
        hx, hy = p[0, :2]; sh = np.linalg.norm(p[11, :2] - p[12, :2])
        box = [hx - 1.3 * sh, hy - 1.6 * sh, hx + 1.3 * sh, hy + 1.0 * sh]
        box = [max(0, box[0]), max(0, box[1]), min(rgb.shape[1], box[2]), min(rgb.shape[0], box[3])]
        fc = face5(rgb, box)
        print(k, 'nez', p[0, :2].round(), 'cheville', p[27, :2].round(), p[28, :2].round(), 'vis', p[[0, 11, 12, 27, 28], 2].round(2), 'visage', None if fc is None else [round(v) for v in fc['seam']])
        if fc:
            for e in fc['eyes']: cv2.circle(vis, tuple(int(v) for v in e['c']), 4, (255, 255, 0), -1)
            cv2.circle(vis, tuple(int(v) for v in fc['seam']), 4, (255, 0, 255), -1)
    cv2.imwrite(sys.argv[3], cv2.cvtColor(vis, cv2.COLOR_RGB2BGR))
