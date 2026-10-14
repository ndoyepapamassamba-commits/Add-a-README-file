#!/usr/bin/env python3
"""
VISAGE VIVANT — the troupe's drawn faces animated by a learned face model instead of bending the drawing.

The engine used to open the mouth by stretching the drawing below the lip seam (the chin stretched, a laughing mouth
stayed a laughing mouth) and to blink with flat ovals pasted on the eyes. Here every pose drawing of every actor gets
its own animated sequence from LivePortrait (KwaiVGI / Kling team, MIT — code and weights), driven by the film plan's
OWN tracks, no driving video:
  * LIPS from the voice (the jaw track of the plan): a closed-mouth drawing opens and closes on the syllables, a
    drawing with an open mouth (a laugh, a shout) breathes around its drawn opening;
  * EYES from the blink track (a drawing with closed eyes never blinks);
  * the HEAD sways and breathes a little (the turn toward the partner stays the rig's head bone).
The face detector of the LivePortrait demo (InsightFace buffalo_l) is NOT used — its models are non-commercial: the
face is located by the troupe's own measured landmarks (cutout.py), refined by LivePortrait's own landmark model.

REPLACEMENT ANIMATION (the studios' method — Aardman's replacement mouths, the mouth charts of 2D animation): the
model does NOT run per film frame (≈ 8 s per image on 4 CPU cores — 3 h for a film). Each pose of each character gets
ONCE a LIBRARY of states — lip openings × eyes (open, half, closed) — kept in the private kit
(.private/troupe/visages/<character>/<pose>/l<i>_e<j>.png); a film then picks, frame by frame, the state nearest to
its voice and blinks: ≈ 2 min per pose the first time on a CPU, then ~0 s per film. On a GPU (CUDA / Apple MPS,
auto-detected) the library is built in seconds.
Output for a film: <plan dir>/visage/<actor id>/<pose kind>/f00001.png … — one hard link per film frame (no disk),
read by Blender as an image sequence on the pose card (scene.py), the drawing's own jaw warp and flat lids off.
Usage:
    python3 scripts/blenderfilm/liveface.py --plan film/plan.json [--kit .private/troupe] [--acteurs nounou,modou]
"""
import argparse
import json
import math
import os
import subprocess
import sys
import time

import numpy as np

MODELS = os.path.expanduser('~/.cache/massamba-models')
LP = os.path.join(MODELS, 'liveportrait')
LP_REPO = 'https://github.com/KwaiVGI/LivePortrait.git'
LP_COMMIT = '9b294b3d0536135442ea73cb01e6cb3ca7029dd3'  # the code validated with the engine
LP_WEIGHTS = 'KwaiVGI/LivePortrait'


def ensure_liveportrait():
    """The LivePortrait code (pinned commit) and its human-face weights, downloaded once into the model cache."""
    src = os.path.join(LP, 'src')
    if not os.path.isdir(os.path.join(src, 'src')):
        os.makedirs(LP, exist_ok=True)
        subprocess.run(['git', 'clone', '--quiet', LP_REPO, src], check=True)
        subprocess.run(['git', '-C', src, 'checkout', '--quiet', LP_COMMIT], check=True)
    w8 = os.path.join(LP, 'weights', 'liveportrait')
    if not os.path.isfile(os.path.join(w8, 'retargeting_models', 'stitching_retargeting_module.pth')):
        from huggingface_hub import snapshot_download
        snapshot_download(LP_WEIGHTS, allow_patterns=['liveportrait/*', 'liveportrait/**/*'], local_dir=os.path.join(LP, 'weights'))
    return src, w8


EYE_MIN = 0.08  # the lowest eye-opening ratio asked of the model (see Face.frame)


class Face:
    """One pose drawing, ready to be animated: its features, keypoints and paste-back mask."""

    def __init__(self, eng, rgba, face):
        import cv2
        self.eng, self.rgba = eng, rgba
        a = rgba[..., 3:4].astype(np.float32) / 255
        self.rgb = (rgba[..., :3] * a + 128 * (1 - a)).astype(np.uint8)
        e0, e1 = face['eyes'][0]['c'], face['eyes'][1]['c']
        mw, seam = face.get('mouthWidth', 30), face['seam']
        nose = face.get('nose') or [(e0[0] + e1[0]) / 2, (e0[1] + seam[1]) / 2]
        pts5 = np.array([e0, e1, nose, [seam[0] - mw / 2, seam[1]], [seam[0] + mw / 2, seam[1]]], np.float32)
        self.lmk = eng.lmr.run(self.rgb, pts5)
        crop = eng.crop_image(self.rgb, self.lmk, dsize=512, scale=2.3, vx_ratio=0, vy_ratio=-0.125, flag_do_rot=True)
        self.M = crop['M_c2o']
        self.mask = eng.prepare_paste_back(eng.mask, self.M, dsize=(self.rgb.shape[1], self.rgb.shape[0]))
        w = eng.w
        x = w.prepare_source(cv2.resize(crop['img_crop'], (256, 256), interpolation=cv2.INTER_AREA))
        self.f_s = w.extract_feature_3d(x)
        self.info = w.get_kp_info(x)
        self.x_s = w.transform_keypoint(self.info)
        self.eye0 = float(np.mean(eng.calc_eye(self.lmk[None])))
        self.lip0 = float(eng.calc_lip(self.lmk[None])[0][0])
        self.eyes_closed = self.eye0 < 0.12   # drawn with closed eyes (a laugh): no blink
        self.mouth_open = self.lip0 > 0.12    # drawn with an open mouth: it breathes around its opening

    def frame(self, jaw, blink, t=None, nod=0.0):
        """The face in one state: jaw 0..1 (the lip opening), blink 0..1; t (seconds) adds the idle head sway — None
        for a library state (the head moves with the rig's head bone)."""
        import torch
        eng, w, info = self.eng, self.eng.w, self.info
        sway = (lambda a, f, ph=0.0: a * math.sin(t * f + ph)) if t is not None else (lambda a, f, ph=0.0: 0.0)
        pitch = info['pitch'] + torch.tensor([[2.5 * nod + sway(1.2, 1.3)]])
        yaw = info['yaw'] + torch.tensor([[sway(1.6, 0.7)]])
        roll = info['roll'] + torch.tensor([[sway(1.0, 0.9, 1.0)]])
        R = eng.rot(pitch, yaw, roll)
        x_d = info['scale'] * (info['kp'] @ R + info['exp']) + info['t']
        lip = self.lip0 * (0.7 + 0.5 * jaw) if self.mouth_open else self.lip0 + 0.45 * jaw
        x_d = x_d + w.retarget_lip(self.x_s, w.calc_combined_lip_ratio([lip], self.lmk))
        if not self.eyes_closed and blink > 0:
            # Closed to a slit, never to 0: a fully closed ratio leaves a blurred disc on the far eye of a 3/4 face
            # (control sheet of Maman Nounou, 14/10/2026); at 0.08 the lid is down and the eye clean.
            eye = max(EYE_MIN, self.eye0 * (1 - blink))
            x_d = x_d + w.retarget_eye(self.x_s, w.calc_combined_eye_ratio(np.array([[eye]]), self.lmk))
        x_d = w.stitching(self.x_s, x_d)
        out = w.parse_output(w.warp_decode(self.f_s, self.x_s, x_d)['out'])[0]
        full = eng.paste_back(out, self.M, self.rgb, self.mask)
        return np.dstack([full, self.rgba[..., 3]])


class Engine:
    def __init__(self):
        import cv2
        import torch
        src, w8 = ensure_liveportrait()
        sys.path.insert(0, src)
        from src.config.inference_config import InferenceConfig
        from src.live_portrait_wrapper import LivePortraitWrapper
        from src.utils.camera import get_rotation_matrix
        from src.utils.crop import crop_image, paste_back, prepare_paste_back
        from src.utils.human_landmark_runner import LandmarkRunner
        from src.utils.retargeting_utils import calc_eye_close_ratio, calc_lip_close_ratio
        gpu = torch.cuda.is_available()
        mps = not gpu and getattr(torch.backends, 'mps', None) is not None and torch.backends.mps.is_available()
        self.device = 'cuda' if gpu else ('mps' if mps else 'cpu')
        if self.device == 'cpu':
            torch.set_num_threads(os.cpu_count() or 4)
        b = os.path.join(w8, 'base_models')
        cfg = InferenceConfig(flag_force_cpu=self.device == 'cpu', flag_use_half_precision=gpu,
                              checkpoint_F=f'{b}/appearance_feature_extractor.pth', checkpoint_M=f'{b}/motion_extractor.pth',
                              checkpoint_G=f'{b}/spade_generator.pth', checkpoint_W=f'{b}/warping_module.pth',
                              checkpoint_S=f'{w8}/retargeting_models/stitching_retargeting_module.pth')
        self.w = LivePortraitWrapper(cfg)
        self.lmr = LandmarkRunner(ckpt_path=f'{w8}/landmark.onnx', onnx_provider='cuda' if gpu else 'cpu', device_id=0)
        self.mask = cv2.imread(os.path.join(src, 'src', 'utils', 'resources', 'mask_template.png'), cv2.IMREAD_COLOR)
        self.crop_image, self.paste_back, self.prepare_paste_back = crop_image, paste_back, prepare_paste_back
        self.calc_eye, self.calc_lip, self.rot = calc_eye_close_ratio, calc_lip_close_ratio, get_rotation_matrix


LIPS = (0.0, 0.25, 0.5, 0.75, 1.0)   # jaw levels of the library (the voice's jaw track is 0..1)
EYES = (0.0, 0.5, 1.0)               # blink levels: open, half, closed


def visible_pose(poses, f):
    """The pose shown at plan frame f (0-based) from the plan's [frame, kind] list."""
    k = poses[0][1]
    for f0, kind in poses:
        if f0 <= f:
            k = kind
        else:
            break
    return k


def blink_at(blinks, f, half=2.5):
    return max([max(0.0, 1 - abs(f - b) / half) for b in blinks] + [0.0])


def library(eng, rgba, face, d):
    """The pose's states (lip openings × eyes), computed once and kept; returns {(i, j): path} and the face facts."""
    import cv2
    os.makedirs(d, exist_ok=True)
    meta_p = os.path.join(d, 'etats.json')
    if os.path.isfile(meta_p):
        meta = json.load(open(meta_p, encoding='utf-8'))
        if all(os.path.isfile(os.path.join(d, f)) for f in meta['fichiers'].values()):
            return {tuple(int(x) for x in k.split('_')): os.path.join(d, f) for k, f in meta['fichiers'].items()}, meta
    fc = Face(eng, rgba, face)
    eyes = (0,) if fc.eyes_closed else range(len(EYES))
    files, t = {}, time.time()
    for i, jaw in enumerate(LIPS):
        for j in eyes:
            name = f'l{i}_e{j}.png'
            img = fc.frame(jaw, EYES[j])
            cv2.imwrite(os.path.join(d, name), cv2.cvtColor(img, cv2.COLOR_RGBA2BGRA))
            files[f'{i}_{j}'] = name
    meta = {'fichiers': files, 'bouche_dessinee_ouverte': fc.mouth_open, 'yeux_dessines_fermes': fc.eyes_closed,
            'levres': list(LIPS), 'yeux': list(EYES), 'secondes': round(time.time() - t), 'appareil': eng.device,
            'modele': 'LivePortrait (KwaiVGI, MIT) ' + LP_COMMIT[:7]}
    json.dump(meta, open(meta_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return {tuple(int(x) for x in k.split('_')): os.path.join(d, f) for k, f in files.items()}, meta


def nearest(levels, v):
    return min(range(len(levels)), key=lambda i: abs(levels[i] - v))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', required=True)
    ap.add_argument('--kit', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.private', 'troupe'),
                    help='kit privé : la bibliothèque des visages y est gardée (visages/<personnage>/<pose>/)')
    ap.add_argument('--acteurs', default='', help='ids séparés par des virgules (défaut : tous)')
    A = ap.parse_args()
    import cv2
    plan = json.load(open(A.plan, encoding='utf-8'))
    rig = json.load(open(plan['rig'], encoding='utf-8'))
    out_root = os.path.join(os.path.dirname(os.path.abspath(A.plan)), 'visage')
    nF = plan['frames']
    want = {x.strip() for x in A.acteurs.split(',') if x.strip()}
    eng, t0 = None, time.time()
    report = {'acteurs': {}}
    for ac in plan['actors']:
        if want and ac['id'] not in want:
            continue
        tr = plan['tracks'][ac['id']]
        jaw, blinks, poses = tr['jaw'], tr['blinks'], tr['poses']
        cast = rig['cast'][ac['name']]
        libs = {}
        for pose in cast['poses']:
            face = pose.get('face') or {}
            if not face.get('eyes') or len(face['eyes']) < 2 or not face.get('seam'):
                continue  # no measured face: this pose keeps the drawing and its own animation
            d = os.path.join(A.kit, 'visages', cast.get('slug', ac['id']), pose['kind'])
            if eng is None and not os.path.isfile(os.path.join(d, 'etats.json')):
                eng = Engine()
            rgba = cv2.cvtColor(cv2.imread(os.path.join(rig['dir'], pose['png']), cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA)
            files, meta = library(eng, rgba, face, d)
            base = os.path.join(d, 'dessin.png')
            if not os.path.isfile(base):
                cv2.imwrite(base, cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
            libs[pose['kind']] = (files, meta, base)
            print(f"[visage] {ac['name']} · {pose['kind']} : {len(files)} états" + (f" (calculés en {meta['secondes']} s sur {meta['appareil']})" if meta.get('secondes') else ''), flush=True)
        # The film's sequences: one hard link per frame, the nearest state to the voice and the blinks.
        for kind, (files, meta, base) in libs.items():
            d = os.path.join(out_root, ac['id'], kind)
            os.makedirs(d, exist_ok=True)
            for f in range(nF):
                path = os.path.join(d, f'f{f + 1:05d}.png')
                if os.path.lexists(path):
                    os.remove(path)
                if visible_pose(poses, f) == kind:
                    i = nearest(LIPS, float(jaw[f]))
                    j = 0 if meta['yeux_dessines_fermes'] else nearest(EYES, blink_at(blinks, f))
                    src = files.get((i, j)) or files[(i, 0)]
                else:
                    src = base
                os.link(src, path)
        report['acteurs'][ac['id']] = {k: {'etats': len(v[0]), 'bouche_dessinee_ouverte': v[1]['bouche_dessinee_ouverte'],
                                           'yeux_dessines_fermes': v[1]['yeux_dessines_fermes']} for k, v in libs.items()}
    report['secondes'] = round(time.time() - t0)
    os.makedirs(out_root, exist_ok=True)
    json.dump(report, open(os.path.join(out_root, 'visage.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"[visage] séquences du film prêtes en {report['secondes']} s", flush=True)


if __name__ == '__main__':
    main()
