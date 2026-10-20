#!/usr/bin/env python3
"""Profondeur image par image d'une vidéo avec Depth Anything V2 Small (Apache-2.0) en ONNX (onnxruntime, MIT).

Lit la vidéo avec ffmpeg (cadence et recadrage demandés), passe chaque image dans le modèle (côté court 518 px,
multiple de 14, normalisation ImageNet, comme le DPTImageProcessor), remet chaque carte à la taille demandée,
la normalise entre 0 et 1 (1 = proche) et écrit le tout en float32 brut, image après image.

Usage : depth_onnx.py --model model.onnx --video in.mp4 --fps 15 [--crop w:h:x:y] --ow 162 --oh 129 --out depth.f32
"""
import argparse
import json
import subprocess
import sys
import time

import numpy as np
import onnxruntime as ort
from PIL import Image


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--video', required=True)
    ap.add_argument('--fps', type=float, default=15)
    ap.add_argument('--crop', default='')
    ap.add_argument('--cw', type=int, required=True, help='largeur de la zone analysée (après recadrage)')
    ap.add_argument('--ch', type=int, required=True, help='hauteur de la zone analysée (après recadrage)')
    ap.add_argument('--ow', type=int, required=True)
    ap.add_argument('--oh', type=int, required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    s = 518 / min(a.cw, a.ch)
    mw = max(14, int(round(a.cw * s / 14)) * 14)
    mh = max(14, int(round(a.ch * s / 14)) * 14)
    # fps <= 0: a still image (one frame, no resampling in time).
    vf = ','.join(x for x in [f'fps={a.fps}' if a.fps > 0 else '', f'crop={a.crop}' if a.crop else '', f'scale={mw}:{mh}:flags=bicubic'] if x)
    proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', a.video, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    sess = ort.InferenceSession(a.model, providers=['CPUExecutionProvider'])
    name = sess.get_inputs()[0].name
    mean = np.array([0.485, 0.456, 0.406], np.float32).reshape(3, 1, 1)
    std = np.array([0.229, 0.224, 0.225], np.float32).reshape(3, 1, 1)
    size = mw * mh * 3
    n = 0
    t0 = time.time()
    infer = 0.0
    with open(a.out, 'wb') as out:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            x = np.frombuffer(buf, np.uint8).reshape(mh, mw, 3).transpose(2, 0, 1).astype(np.float32) / 255.0
            x = ((x - mean) / std)[None]
            t1 = time.time()
            d = sess.run(None, {name: x})[0][0]
            infer += time.time() - t1
            img = Image.fromarray(d.astype(np.float32), mode='F').resize((a.ow, a.oh), Image.BILINEAR)
            r = np.asarray(img, np.float32)
            lo, hi = float(r.min()), float(r.max())
            r = (r - lo) / max(1e-6, hi - lo)
            out.write(r.astype(np.float32).tobytes())
            n += 1
            if n % 20 == 0:
                print(f'profondeur {n} images ({infer / n:.2f} s/image)', file=sys.stderr, flush=True)
    proc.wait()
    print(json.dumps({'frames': n, 'model_input': [mw, mh], 'seconds': round(time.time() - t0, 1), 'infer_s_per_frame': round(infer / max(1, n), 3)}))


if __name__ == '__main__':
    main()
