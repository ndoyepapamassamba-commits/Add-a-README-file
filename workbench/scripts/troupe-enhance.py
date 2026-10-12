#!/usr/bin/env python3
"""
TROUPE — improves the owner's private sets before they are embedded (run once; results cached in .private/troupe/):

  * HD: every set picture enlarged ×4 by Swin2SR (real-world super-resolution, Apache-2.0) — the crops are ~500×244 px
    and were stretched ×8 to fill a 1080×1920 film (a blurred set behind sharp actors);
  * DEPTH: a relative depth map of each set by Depth Anything V2 Small (Apache-2.0) — the set becomes a relief the
    camera moves through (true parallax), and the lens blur follows the distance.

Models are downloaded once into ~/.cache/massamba-models (never committed). The manifest gets `hd` and `depth` per set.
Usage: python3 scripts/troupe-enhance.py [--force]
"""
import json
import os
import sys
import time
import urllib.request

import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.private', 'troupe')
CACHE = os.path.expanduser('~/.cache/massamba-models')
MODELS = {
    'swin2sr.onnx': 'https://huggingface.co/Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr/resolve/main/onnx/model.onnx',
    'depth-anything-v2-small.onnx': 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx',
}


def model(name: str) -> ort.InferenceSession:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print(f'  téléchargement {name}…', flush=True)
        urllib.request.urlretrieve(MODELS[name], path + '.part')
        os.replace(path + '.part', path)
    return ort.InferenceSession(path, providers=['CPUExecutionProvider'])


def upscale(sess: ort.InferenceSession, im: Image.Image) -> Image.Image:
    """×4, tile by tile (128 px tiles + 16 px overlap, blended) so memory stays small whatever the picture."""
    x = np.asarray(im.convert('RGB'), dtype=np.float32) / 255.0
    H, W, _ = x.shape
    T, O = 128, 16
    out = np.zeros((H * 4, W * 4, 3), np.float32)
    wsum = np.zeros((H * 4, W * 4, 1), np.float32)
    ys = list(range(0, max(1, H - O), T - O)) or [0]
    xs = list(range(0, max(1, W - O), T - O)) or [0]
    for y0 in ys:
        for x0 in xs:
            y1, x1 = min(H, y0 + T), min(W, x0 + T)
            tile = x[y0:y1, x0:x1].transpose(2, 0, 1)[None]
            th, tw = tile.shape[2:]
            ph, pw = (8 - th % 8) % 8, (8 - tw % 8) % 8
            tile = np.pad(tile, ((0, 0), (0, 0), (0, ph), (0, pw)), mode='reflect')
            y = sess.run(None, {'pixel_values': tile})[0][0][:, : th * 4, : tw * 4].transpose(1, 2, 0)
            # Feathered weights: tiles blend in their overlap (no seam).
            wy = np.minimum(np.arange(th * 4) + 1, np.arange(th * 4)[::-1] + 1).astype(np.float32)
            wx = np.minimum(np.arange(tw * 4) + 1, np.arange(tw * 4)[::-1] + 1).astype(np.float32)
            w = np.minimum(np.minimum(wy[:, None], O * 4), np.minimum(wx[None, :], O * 4))[..., None]
            out[y0 * 4 : y1 * 4, x0 * 4 : x1 * 4] += y * w
            wsum[y0 * 4 : y1 * 4, x0 * 4 : x1 * 4] += w
    return Image.fromarray((np.clip(out / np.maximum(wsum, 1e-6), 0, 1) * 255).astype(np.uint8))


def depth(sess: ort.InferenceSession, im: Image.Image) -> Image.Image:
    """Relative depth, 0 = far … 255 = near (Depth Anything gives inverse depth), at most 512 px wide."""
    im = im.convert('RGB')
    W, H = im.size
    k = 518 / max(W, H)
    w, h = max(14, round(W * k / 14) * 14), max(14, round(H * k / 14) * 14)
    x = np.asarray(im.resize((w, h), Image.BICUBIC), dtype=np.float32) / 255.0
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    d = sess.run(None, {'pixel_values': x.transpose(2, 0, 1)[None]})[0][0]
    lo, hi = np.percentile(d, 1), np.percentile(d, 99)
    d = np.clip((d - lo) / max(1e-6, hi - lo), 0, 1)
    out = Image.fromarray((d * 255).astype(np.uint8)).resize((min(512, W), round(min(512, W) * H / W)), Image.BICUBIC)
    return out


def main() -> None:
    force = '--force' in sys.argv
    man_path = os.path.join(ROOT, 'manifest.json')
    man = json.load(open(man_path, encoding='utf-8'))
    os.makedirs(os.path.join(ROOT, 'hd'), exist_ok=True)
    sr = dav2 = None
    for d in man.get('decors', []):
        src = os.path.join(ROOT, d['file'])
        stem = os.path.splitext(os.path.basename(d['file']))[0]
        hd_rel, dp_rel = f'hd/{stem}.jpg', f'hd/{stem}.depth.png'
        t = time.time()
        if force or not os.path.exists(os.path.join(ROOT, hd_rel)):
            sr = sr or model('swin2sr.onnx')
            upscale(sr, Image.open(src)).save(os.path.join(ROOT, hd_rel), quality=88)
        if force or not os.path.exists(os.path.join(ROOT, dp_rel)):
            dav2 = dav2 or model('depth-anything-v2-small.onnx')
            depth(dav2, Image.open(os.path.join(ROOT, hd_rel))).save(os.path.join(ROOT, dp_rel))
        d['hd'], d['depth'] = hd_rel, dp_rel
        print(f"  {d['name']}: {Image.open(os.path.join(ROOT, hd_rel)).size} + profondeur ({time.time() - t:.0f} s)", flush=True)
    json.dump(man, open(man_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('décors améliorés:', len(man.get('decors', [])))


if __name__ == '__main__':
    main()
