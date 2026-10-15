#!/usr/bin/env python3
"""COUCHES D'UNE SCÈNE — pour que la caméra 3D voie DERRIÈRE les personnages :

  * détection des éléments : UperNet ConvNeXt-small ADE20K (OpenMMLab, MIT ; exporté en ONNX par
    scripts/export-scene-seg.py) → premier plan (personnes, véhicules, bateaux, animaux), ciel, eau, végétation.
    (Mask2Former a été étudié : son code est MIT mais ses poids officiels sont CC BY-NC 4.0 → exclus.)
  * reconstruction du décor : LaMa (big-lama, Apache-2.0, ONNX 512×512) efface le premier plan, fenêtre par fenêtre
    autour de chaque élément (le détail et les proportions de l'image sont gardés) ; repli OpenCV Telea ;
  * profondeur du décor reconstruit : Depth Anything V2 Small (Apache-2.0, ONNX).

Sorties (dans --out-dir) : plate.jpg (décor sans le premier plan, ≤ --plate-width px), plate-depth.png (gris,
blanc = proche, ≤ 512 px), masks.png (RGB ≤ 512 px : R premier plan, G ciel, B eau 255 / végétation 128), layers.json.
Usage : scene_layers.py --image entree.jpg --out-dir dossier [--seg labels.png] [--plate-width 1024]
"""
import argparse
import json
import os
import sys
import time

import numpy as np
import onnxruntime as ort
from PIL import Image

MODELS = os.path.expanduser('~/.cache/massamba-models')
SEG_H, SEG_W = 576, 1152  # fixed input of the exported UperNet
# ADE20K (0-based) — see upernet-convnext-small-ade.labels.json
OBJECTS = [12, 20, 76, 80, 83, 90, 102, 103, 116, 126, 127]  # person, car, boat, bus, truck, airplane, van, ship, minibike, animal, bicycle
SKY = [2]
WATER = [21, 26, 60, 104, 109, 113, 128]  # water, sea, river, fountain, swimming pool, waterfall, lake
VEGETATION = [4, 17, 72]  # tree, plant, palm
_S = {}


def sess(name):
    if name not in _S:
        p = os.path.join(MODELS, name)
        _S[name] = ort.InferenceSession(p, providers=['CPUExecutionProvider']) if os.path.exists(p) else None
    return _S[name]


def segment(im):
    s = sess('upernet-convnext-small-ade.onnx')
    if s is None:
        return None
    import cv2
    W, H = im.size
    k = min(SEG_W / W, SEG_H / H)
    w, h = max(32, round(W * k)), max(32, round(H * k))
    x = np.asarray(im.resize((w, h), Image.BICUBIC), dtype=np.float32) / 255.0
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    x = np.pad(x, ((0, SEG_H - h), (0, SEG_W - w), (0, 0)), mode='reflect')
    lg = s.run(None, {'pixel_values': x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
    lg = lg[:, : h * lg.shape[1] // SEG_H, : w * lg.shape[2] // SEG_W]
    ow = min(512, W)
    oh = round(ow * H / W)
    up = np.stack([cv2.resize(c, (ow, oh), interpolation=cv2.INTER_LINEAR) for c in lg])
    return up.argmax(0).astype(np.uint8)


def lama_fill(rgb, mask):
    """Erases the masked pixels: one 512×512 LaMa window around each group of elements (scene kept around it)."""
    import cv2
    s = sess('lama_fp32.onnx')
    out = rgb.copy()
    if s is None:
        return cv2.inpaint(rgb, mask, 7, cv2.INPAINT_TELEA), 'OpenCV Telea', 0
    H, W = mask.shape
    n, lab, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), 8)
    comps = sorted([stats[i] for i in range(1, n) if stats[i][4] > 30], key=lambda s: -s[4])[:24]
    names = [i.name for i in s.get_inputs()]
    done = 0
    for x, y, bw, bh, _area in comps:
        side = int(min(max(H, W), max(160, max(bw, bh) * 1.8)))
        cx, cy = x + bw // 2, y + bh // 2
        wx0 = int(np.clip(cx - side // 2, 0, max(0, W - side)))
        wy0 = int(np.clip(cy - side // 2, 0, max(0, H - side)))
        wx1, wy1 = min(W, wx0 + side), min(H, wy0 + side)
        win, wm = out[wy0:wy1, wx0:wx1], mask[wy0:wy1, wx0:wx1]
        if not wm.any():
            continue
        im = cv2.resize(win, (512, 512), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
        mk = (cv2.resize(wm, (512, 512), interpolation=cv2.INTER_NEAREST) > 127).astype(np.float32)
        r = s.run(None, {names[0]: im.transpose(2, 0, 1)[None], names[1]: mk[None, None]})[0][0].transpose(1, 2, 0)
        r = r if r.max() > 2 else r * 255
        r = cv2.resize(np.clip(r, 0, 255).astype(np.uint8), (wx1 - wx0, wy1 - wy0), interpolation=cv2.INTER_CUBIC)
        sub = out[wy0:wy1, wx0:wx1]
        sub[wm > 0] = r[wm > 0]
        mask[wy0:wy1, wx0:wx1] = 0  # filled: later windows see the rebuilt scene
        done += 1
    if mask.any():  # anything left (tiny specks): classic inpainting
        out = cv2.inpaint(out, mask, 5, cv2.INPAINT_TELEA)
    return out, 'LaMa (big-lama, Apache-2.0)', done


def depth(im):
    s = sess('depth-anything-v2-small.onnx')
    W, H = im.size
    k = 518 / min(W, H)
    w, h = max(14, round(W * k / 14) * 14), max(14, round(H * k / 14) * 14)
    x = np.asarray(im.convert('RGB').resize((w, h), Image.BICUBIC), dtype=np.float32) / 255.0
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    d = s.run(None, {'pixel_values': x.transpose(2, 0, 1)[None]})[0][0]
    lo, hi = np.percentile(d, 1), np.percentile(d, 99)
    d = np.clip((d - lo) / max(1e-6, hi - lo), 0, 1)
    ow = min(512, W)
    return Image.fromarray((d * 255).astype(np.uint8)).resize((ow, round(ow * H / W)), Image.BICUBIC)


def layers(img_path, out_dir, seg_path=None, plate_width=1024):
    import cv2
    t0 = time.time()
    os.makedirs(out_dir, exist_ok=True)
    im = Image.open(img_path).convert('RGB')
    W, H = im.size
    lab = np.asarray(Image.open(seg_path).convert('L')) if seg_path and os.path.exists(seg_path) else segment(im)
    if lab is None:
        raise SystemExit('modèle de scène absent (scripts/export-scene-seg.py)')
    t_seg = time.time() - t0
    m = lambda ids: np.isin(lab, ids).astype(np.uint8) * 255
    obj, sky, water, veg = m(OBJECTS), m(SKY), m(WATER), m(VEGETATION)
    # Premier plan à pleine résolution, élargi (bords, ombres portées au sol) pour que rien n'en reste dans le décor.
    full = cv2.resize(obj, (W, H), interpolation=cv2.INTER_NEAREST)
    grow = max(3, int(0.012 * max(W, H)))
    full = cv2.dilate(full, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1)))
    share = float((full > 0).mean())
    t1 = time.time()
    rgb = np.asarray(im)
    plate, how, windows = lama_fill(rgb, full.copy()) if share > 0.0005 else (rgb, 'aucun premier plan', 0)
    t_fill = time.time() - t1
    pim = Image.fromarray(plate)
    pw = min(plate_width, W)
    pim.resize((pw, round(pw * H / W)), Image.LANCZOS).save(os.path.join(out_dir, 'plate.jpg'), quality=88)
    t2 = time.time()
    depth(pim).save(os.path.join(out_dir, 'plate-depth.png'))
    t_depth = time.time() - t2
    # Masks at the label resolution (the soft edge of the foreground comes from the dilation).
    oh, ow = lab.shape
    objd = cv2.resize(full, (ow, oh), interpolation=cv2.INTER_AREA)
    # RGB only (an alpha channel would be premultiplied by the browser): R premier plan, G ciel, B eau 255 / végétation 128.
    blue = np.where(water > 0, 255, np.where(veg > 0, 128, 0)).astype(np.uint8)
    rgb3 = np.dstack([objd, sky, blue]).astype(np.uint8)
    Image.fromarray(rgb3, 'RGB').save(os.path.join(out_dir, 'masks.png'))
    info = {'size': [W, H], 'plate': [pw, round(pw * H / W)], 'masks': [ow, oh], 'foreground_share': round(share, 4), 'sky': round(float((sky > 0).mean()), 4),
            'water': round(float((water > 0).mean()), 4), 'vegetation': round(float((veg > 0).mean()), 4), 'fill': how, 'lama_windows': windows,
            'seconds': {'segmentation': round(t_seg, 2), 'reconstruction': round(t_fill, 2), 'depth': round(t_depth, 2), 'total': round(time.time() - t0, 2)}}
    json.dump(info, open(os.path.join(out_dir, 'layers.json'), 'w'), indent=1)
    return info


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--image', required=True)
    ap.add_argument('--out-dir', required=True)
    ap.add_argument('--seg', default=None)
    ap.add_argument('--plate-width', type=int, default=1024)
    a = ap.parse_args()
    print(json.dumps(layers(a.image, a.out_dir, a.seg, a.plate_width)))
