# INCRUSTATION À L'ÉCHELLE MESURÉE (16/10/2026) : un personnage pris sur SA fiche (même visage dans toutes les vidéos)
# remplace un personnage raté de la scène ; taille = hauteur de la bible × (pixels par mètre mesurés sur un acteur de
# référence posé au même niveau de sol) ; couleurs accordées à la scène (transfert de Reinhard et al. 2001, espace Lab) ;
# ombre de contact. python3 incruste.py scene.png fiche.png sortie.png <index_à_remplacer> <index_ref> <taille_ref_m> <taille_m> N
import sys, os, numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'outils'))
from scene_layers import lama_fill, magic_touch_mask, subject_mask
M = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/'
scene_p, fiche_p, out_p, i_rep, i_ref, h_ref, h_new, N = sys.argv[1:9]; i_rep, i_ref, N = int(i_rep), int(i_ref), int(N); h_ref, h_new = float(h_ref), float(h_new)
rgb = cv2.cvtColor(cv2.imread(scene_p), cv2.COLOR_BGR2RGB); H, W = rgb.shape[:2]
PL = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=M + 'pose_landmarker_heavy.task'), num_poses=N, min_pose_detection_confidence=0.2, min_pose_presence_confidence=0.2))
def det(img, x0=0):
    r = PL.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img))); h, w = img.shape[:2]
    return [np.array([[p.x * w + x0, p.y * h, p.visibility] for p in lm]) for lm in r.pose_landmarks]
P = det(rgb)
if len(P) < N:
    P = []
    for k in range(N):
        x0 = int(max(0, (k - 0.15) * W / N)); x1 = int(min(W, (k + 1.15) * W / N)); c = det(rgb[:, x0:x1], x0)
        if c: P.append(min(c, key=lambda p: abs(p[0, 0] - (k + 0.5) * W / N)))
P = sorted(P, key=lambda p: p[0, 0]); assert len(P) == N, len(P)
def mask_of(p):
    idx = [i for i in range(33) if p[i, 2] > 0.4 and 0 <= p[i, 0] < W and 0 <= p[i, 1] < H]
    m = (magic_touch_mask(rgb, [(p[i, 0] / W, p[i, 1] / H) for i in idx]) > 0.5).astype(np.uint8)
    n, lab = cv2.connectedComponents(m); c = p[[11, 12, 23, 24], :2].mean(0).astype(int); l = lab[c[1], c[0]]
    return (lab == l).astype(np.uint8) if l > 0 else m
mr, mref = mask_of(P[i_rep]), mask_of(P[i_ref])
ys, xs = np.nonzero(mref); ref_top, ref_feet = ys.min(), ys.max()
ys2, xs2 = np.nonzero(mr); feet_y = int(ys2.max()); cx = int(np.median(xs2[ys2 > feet_y - 40])) if (ys2 > feet_y - 40).any() else int(xs2.mean())
ppm = (ref_feet - ref_top) / h_ref                     # pixels par mètre au niveau de sol de l'acteur de référence
feet_y = int(0.5 * feet_y + 0.5 * ref_feet)            # même plan de sol que la référence (scène à hauteur d'œil)
# 1) effacer le personnage raté (LaMa)
clean, _, _ = lama_fill(rgb.copy(), cv2.dilate(mr, np.ones((21, 21), np.uint8)) * 255)
# 2) le personnage de la fiche, détouré (BiRefNet, MIT) et mis à sa taille
f = cv2.cvtColor(cv2.imread(fiche_p), cv2.COLOR_BGR2RGB); a = subject_mask(f); a = (a > 0.5).astype(np.float32)
yy, xx = np.nonzero(a > 0); f, a = f[yy.min():yy.max() + 1, xx.min():xx.max() + 1], a[yy.min():yy.max() + 1, xx.min():xx.max() + 1]
th = int(round(h_new * ppm)); tw = int(round(f.shape[1] * th / f.shape[0]))
f = cv2.resize(f, (tw, th), interpolation=cv2.INTER_AREA); a = cv2.resize(a, (tw, th), interpolation=cv2.INTER_AREA)
# 3) couleurs accordées à la scène : transfert de Reinhard (Lab) à 60 %, sur la zone de la scène autour du point de pose
def lab(x): return cv2.cvtColor(x, cv2.COLOR_RGB2LAB).astype(np.float32)
x0, y0 = cx - tw // 2, feet_y - th; reg = clean[max(0, y0):feet_y, max(0, x0 - tw):min(W, x0 + 2 * tw)]
ref_ref = rgb[ref_top:ref_feet, :][mref[ref_top:ref_feet, :] > 0]  # la peau et les tissus de l'acteur de référence : même lumière
src = lab(f)[a > 0.5]; tgt = lab(ref_ref.reshape(-1, 1, 3)).reshape(-1, 3)
fl = lab(f); s = 0.6
for c in range(3):
    fl[..., c] = (1 - s) * fl[..., c] + s * ((fl[..., c] - src[:, c].mean()) * (tgt[:, c].std() / (src[:, c].std() + 1e-6)) ** 0.5 + tgt[:, c].mean() * 0.35 + src[:, c].mean() * 0.65)
f = cv2.cvtColor(np.clip(fl, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)
# 4) ombre de contact puis pose
out = clean.astype(np.float32); sh = np.zeros((H, W), np.float32)
cv2.ellipse(sh, (cx, feet_y - 2), (int(tw * 0.42), int(tw * 0.09)), 0, 0, 360, 1, -1); sh = cv2.GaussianBlur(sh, (0, 0), tw * 0.06)
out *= (1 - 0.45 * sh)[..., None]
X0, Y0 = max(0, x0), max(0, y0); X1, Y1 = min(W, x0 + tw), min(H, y0 + th)
aa = cv2.GaussianBlur(a, (0, 0), 0.7)[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0, None]
out[Y0:Y1, X0:X1] = out[Y0:Y1, X0:X1] * (1 - aa) + f[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0] * aa
cv2.imwrite(out_p, cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
print(f'référence {ref_feet - ref_top}px = {h_ref} m → {ppm:.0f} px/m ; incrusté {th}px = {h_new} m, pieds y={feet_y}, x={cx}')
