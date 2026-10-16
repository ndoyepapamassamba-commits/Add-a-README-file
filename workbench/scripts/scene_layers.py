#!/usr/bin/env python3
"""COUCHES D'UNE SCÈNE — pour que la caméra 3D voie DERRIÈRE les personnages :

  * détection des éléments : UperNet ConvNeXt-small ADE20K (OpenMMLab, MIT ; exporté en ONNX par
    scripts/export-scene-seg.py) → premier plan (personnes, véhicules, bateaux, animaux), ciel, eau, végétation.
    (Mask2Former a été étudié : son code est MIT mais ses poids officiels sont CC BY-NC 4.0 → exclus.)
  * reconstruction du décor : LaMa (big-lama, Apache-2.0, ONNX 512×512) efface le premier plan, fenêtre par fenêtre
    autour de chaque élément (le détail et les proportions de l'image sont gardés) ; repli OpenCV Telea ;
  * profondeur du décor reconstruit : Depth Anything V2 Small (Apache-2.0, ONNX) ;
  * --atlas : ATLAS DE LA SCÈNE pour le système de mouvement (sceneMotion.ts) — instances MediaPipe ObjectDetector
    recoupées avec l'analyse de scène, squelette MediaPipe Pose de chaque personne, découpe et pieds de chaque personne /
    animal, masques d'animation (végétation, ciel, eau, tissus).

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


ADE_NAMES = None


def ade_names():
    global ADE_NAMES
    if ADE_NAMES is None:
        p = os.path.join(MODELS, 'upernet-convnext-small-ade.labels.json')
        ADE_NAMES = json.load(open(p)) if os.path.exists(p) else []
    return ADE_NAMES


def detect_instances(rgb):
    """MediaPipe ObjectDetector (EfficientDet-Lite0, Apache-2.0) on the whole picture and on 4 overlapping tiles (small
    background figures), duplicates merged. Returns [(label, score, x, y, w, h)] in pixels."""
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    p = os.path.join(MODELS, 'efficientdet_lite0.tflite')
    if not os.path.exists(p):
        return []
    det = vision.ObjectDetector.create_from_options(vision.ObjectDetectorOptions(base_options=BaseOptions(model_asset_path=p), score_threshold=0.15, max_results=50))
    H, W = rgb.shape[:2]
    tiles = [(0, 0, W, H)] + [(int(x), int(y), int(W * 0.6), int(H * 0.6)) for x in (0, W * 0.4) for y in (0, H * 0.4)]
    out = []
    for x0, y0, w, h in tiles:
        r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb[y0:y0 + h, x0:x0 + w])))
        for d in r.detections:
            b = d.bounding_box
            out.append((d.categories[0].category_name, float(d.categories[0].score), x0 + b.origin_x, y0 + b.origin_y, b.width, b.height))

    def iou(a, b):
        ix = max(0, min(a[2] + a[4], b[2] + b[4]) - max(a[2], b[2]))
        iy = max(0, min(a[3] + a[5], b[3] + b[5]) - max(a[3], b[3]))
        return ix * iy / (a[4] * a[5] + b[4] * b[5] - ix * iy + 1e-9)
    def inside(a, b):  # share of the smaller box covered by the other
        ix = max(0, min(a[2] + a[4], b[2] + b[4]) - max(a[2], b[2]))
        iy = max(0, min(a[3] + a[5], b[3] + b[5]) - max(a[3], b[3]))
        return ix * iy / max(1e-9, min(a[4] * a[5], b[4] * b[5]))
    out.sort(key=lambda d: -d[1])
    keep = []
    for d in out:
        if all(iou(k, d) <= 0.4 and not (k[0] == d[0] and inside(k, d) > 0.6) for k in keep):
            keep.append(d)
    return keep


def subject_mask(crop_rgb):
    """BiRefNet lite (MIT, ONNX — same model as scripts/asset-forge.py) on the crop: the alpha of its main subject. Painted
    background figures are far from selfies: measured 16/10, the MediaPipe selfie segmenter gives fragments on them,
    BiRefNet whole silhouettes. Returns a float mask at the crop size, or None."""
    import cv2
    p = os.path.join(MODELS, 'birefnet-lite.onnx')
    if not os.path.exists(p):
        return None
    if 'biref' not in _S:
        so = ort.SessionOptions()
        so.enable_cpu_mem_arena = False
        _S['biref'] = ort.InferenceSession(p, so, providers=['CPUExecutionProvider'])
    s = _S['biref']
    h, w = crop_rgb.shape[:2]
    x = cv2.resize(crop_rgb, (1024, 1024), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255.0
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    y = s.run(None, {s.get_inputs()[0].name: x.transpose(2, 0, 1)[None]})[-1][0, 0]
    a = 1 / (1 + np.exp(-y))
    return cv2.resize(a.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)


def magic_touch_mask(crop_rgb, points):
    """MediaPipe Interactive Segmenter (MagicTouch, Apache-2.0) prompted by the person's OWN skeleton points (MediaPipe
    Pose): the union of the masks of each point. Returns a float mask at the crop size, or None."""
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    from mediapipe.tasks.python.components import containers
    p = os.path.join(MODELS, 'magic_touch.tflite')
    if not os.path.exists(p) or not points:
        return None
    if 'magic' not in _S:
        _S['magic'] = vision.InteractiveSegmenterLegacy.create_from_options(vision.InteractiveSegmenterLegacyOptions(base_options=BaseOptions(model_asset_path=p), output_confidence_masks=True))
    R = vision.InteractiveSegmenterLegacyRegionOfInterest
    h, w = crop_rgb.shape[:2]
    acc = np.zeros((h, w), np.float32)
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(crop_rgb))
    for px, py in points:
        r = _S['magic'].segment(img, R(format=R.Format.KEYPOINT, keypoint=containers.keypoint.NormalizedKeypoint(float(px), float(py))))
        acc = np.maximum(acc, cv2.resize(r.confidence_masks[0].numpy_view().astype(np.float32), (w, h)))
    return acc


def person_mask(crop_rgb):
    """MediaPipe Image Segmenter (selfie multiclass 256, Apache-2.0) on an enlarged crop: hair + body skin + face skin +
    clothes + accessories = the person. Returns a float mask in [0, 1] at the crop size, or None."""
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    p = os.path.join(MODELS, 'selfie_multiclass_256x256.tflite')
    if not os.path.exists(p):
        return None
    if 'seg' not in _S:
        _S['seg'] = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=p), output_confidence_masks=True))
    h, w = crop_rgb.shape[:2]
    k = 512 / max(h, w)
    big = cv2.resize(crop_rgb, (max(1, round(w * k)), max(1, round(h * k))), interpolation=cv2.INTER_CUBIC)
    r = _S['seg'].segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big)))
    if not r.confidence_masks:
        return None
    bg = r.confidence_masks[0].numpy_view()
    m = 1.0 - np.asarray(bg, np.float32)
    return cv2.resize(m, (w, h), interpolation=cv2.INTER_LINEAR)


def pose_of(crop_rgb):
    """MediaPipe Pose Landmarker (heavy, Apache-2.0) on an enlarged crop with a white margin: 33 points in fractions of
    the crop, or None when no body is found (the element will not be animated as a person)."""
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    p = os.path.join(MODELS, 'pose_landmarker_heavy.task')
    if not os.path.exists(p):
        return None
    if 'pose' not in _S:
        _S['pose'] = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=p), min_pose_detection_confidence=0.3))
    h, w = crop_rgb.shape[:2]
    k = max(1.0, 480 / max(1, h))
    big = cv2.resize(crop_rgb, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
    P = int(0.25 * big.shape[0])
    pad = cv2.copyMakeBorder(big, P, P, P, P, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    r = _S['pose'].detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(pad)))
    if not r.pose_landmarks:
        return None
    L = r.pose_landmarks[0]
    pts = {i: [round((L[i].x * pad.shape[1] - P) / (w * k), 4), round((L[i].y * pad.shape[0] - P) / (h * k), 4), round(float(L[i].visibility or 0), 3)] for i in range(33)}
    core = [11, 12, 23, 24]
    return pts if all(pts[i][2] > 0.4 for i in core) else None


def atlas(img_path, out_dir, plate_path=None):
    """ATLAS DE LA SCÈNE — every element of a painted set, for the scene motion system (sceneMotion.ts): instances
    (detector) cross-checked with the scene parser (share of each ADE class in the box) and, for people, a MediaPipe
    skeleton; a cut-out of each person / animal (RGBA, from the picture) and its feet on the ground; animation masks of
    the set (vegetation for the wind, sky, water, cloth). The class is decided at run time by sceneMotion.validateInstance
    (an « umbrella » over a roof is a roof). Without --plate, the set without its people / animals is rebuilt (LaMa)."""
    import cv2
    t0 = time.time()
    os.makedirs(out_dir, exist_ok=True)
    im = Image.open(img_path).convert('RGB')
    W, H = im.size
    rgb = np.asarray(im)
    lab = segment(im)
    names = ade_names()
    lh, lw = lab.shape
    up = cv2.resize(lab, (W, H), interpolation=cv2.INTER_NEAREST)
    els = []
    for n, (label, score, x, y, w, h) in enumerate(detect_instances(rgb)):
        x0, y0, x1, y1 = max(0, int(x)), max(0, int(y)), min(W, int(x + w)), min(H, int(y + h))
        if x1 - x0 < 8 or y1 - y0 < 8:
            continue
        box = up[y0:y1, x0:x1]
        ids, cnt = np.unique(box, return_counts=True)
        parsed = {names[i] if i < len(names) else str(i): round(c / box.size, 3) for i, c in zip(ids, cnt) if c / box.size >= 0.03}
        el = {'id': f'{label.replace(" ", "-")}-{n}', 'label': label, 'score': round(score, 3), 'box': [round(x0 / W, 4), round(y0 / H, 4), round((x1 - x0) / W, 4), round((y1 - y0) / H, 4)], 'parsed': parsed}
        living = {12: 'person', 126: 'animal'}
        if label in ('person', 'bird', 'dog', 'cat', 'horse', 'sheep', 'cow') or parsed.get('person', 0) > 0.15 or parsed.get('animal', 0) > 0.1:
            # the box grown by 12 % (detector boxes cut heads and feet), then the element's own mask
            gx, gy = int(0.12 * (x1 - x0)), int(0.12 * (y1 - y0))
            x0, y0, x1, y1 = max(0, x0 - gx), max(0, y0 - gy), min(W, x1 + gx), min(H, y1 + gy)
            box = up[y0:y1, x0:x1]
            el['box'] = [round(x0 / W, 4), round(y0 / H, 4), round((x1 - x0) / W, 4), round((y1 - y0) / H, 4)]
            pm = subject_mask(rgb[y0:y1, x0:x1])
            ok = pm is not None and (pm > 0.5).sum() > 50
            m = (pm > 0.5).astype(np.uint8) if ok else np.isin(box, list(living)).astype(np.uint8)
            if ok:  # the subject must be the element: BiRefNet's silhouette, but only near what the parser calls a person /
                # an animal (a hut or a barrel touching a villager is not the villager); the parser is 4× coarser, so
                # its mask is grown by ~2 % of the picture before cutting
                seed0 = np.isin(box, list(living)).astype(np.uint8)
                if seed0.sum() > 30:
                    g = max(5, int(0.012 * max(W, H))) | 1
                    seed = cv2.dilate(seed0, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (g, g)))
                    m = (m & seed).astype(np.uint8)
                nl2, cl2, st2, _ = cv2.connectedComponentsWithStats(m)
                if nl2 > 1:
                    m = (cl2 == 1 + int(np.argmax(st2[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
                el['maskQuality'] = round(float((m & seed0).sum() / max(1, m.sum())), 3) if seed0.sum() > 30 else None
            el['mask'] = 'birefnet-lite' if ok else 'ade20k'
            if m.sum() < 30:  # the parser missed it: the box is the element (soft ellipse)
                m = np.zeros_like(m)
                cv2.ellipse(m, ((x1 - x0) // 2, (y1 - y0) // 2), ((x1 - x0) // 2, (y1 - y0) // 2), 0, 0, 360, 1, -1)
            nl, cl, st, _ = cv2.connectedComponentsWithStats(m)
            if nl > 1:
                m = (cl == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
            alpha = np.clip(pm, 0, 1) * cv2.dilate(m, np.ones((3, 3), np.uint8)) if el['mask'] == 'birefnet-lite' else cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.8)
            # SEVERAL CUT-OUTS, THE BEST KEPT (16/10: no method wins everywhere): BiRefNet ∩ parser, MediaPipe MagicTouch
            # prompted by the skeleton, and their intersection; score = share of the cut-out that the parser calls the
            # person × how much of the parsed person it covers
            seed0b = np.isin(box, list(living)).astype(np.uint8)
            sk0 = pose_of(np.where(alpha[..., None] > 0.5, rgb[y0:y1, x0:x1], 255).astype(np.uint8)) or pose_of(rgb[y0:y1, x0:x1])
            cands = [('birefnet-lite' if el['mask'] == 'birefnet-lite' else 'ade20k', alpha)]
            if sk0 and seed0b.sum() > 30:
                pts = [(v[0], v[1]) for k, v in sk0.items() if str(k) in ('0', '11', '12', '23', '24', '25', '26', '13', '14') and v[2] > 0.4 and 0 < v[0] < 1 and 0 < v[1] < 1]
                mt = magic_touch_mask(rgb[y0:y1, x0:x1], pts)
                if mt is not None:
                    mtb = (mt > 0.5).astype(np.uint8)
                    nl3, cl3, st3, _ = cv2.connectedComponentsWithStats(mtb)
                    if nl3 > 1:
                        mtb = (cl3 == 1 + int(np.argmax(st3[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
                    cands.append(('mediapipe-magictouch', cv2.GaussianBlur(mtb.astype(np.float32), (0, 0), 0.8)))
                    cands.append(('magictouch∩birefnet', cv2.GaussianBlur((mtb & (alpha > 0.5)).astype(np.float32), (0, 0), 0.8)))
            def score(a_):
                mm = a_ > 0.5
                if mm.sum() < 50 or seed0b.sum() <= 30:
                    return 0.0, None
                inside = float((mm & (seed0b > 0)).sum() / mm.sum())
                cover = float((mm & (seed0b > 0)).sum() / seed0b.sum())
                return inside * min(1.0, cover / 0.8), inside
            scored = [(score(a_)[0], score(a_)[1], n_, a_) for n_, a_ in cands]
            scored.sort(key=lambda z: -z[0])
            if scored[0][0] > 0:
                _, q_, n_, alpha = scored[0]
                el['mask'] = n_
                el['maskQuality'] = round(q_, 3)
                m = (alpha > 0.5).astype(np.uint8)
            el['maskCandidates'] = {n_: round(sc, 3) for sc, _, n_, _ in scored}
            ys, xs = np.where(m > 0)
            cut = np.dstack([rgb[y0:y1, x0:x1], (alpha * 255).astype(np.uint8)])
            fn = f'{el["id"]}.png'
            Image.fromarray(cut, 'RGBA').save(os.path.join(out_dir, fn))
            el['cutout'] = fn
            el['feet'] = [round((x0 + float(np.median(xs[ys >= ys.max() - 3]))) / W, 4), round((y0 + ys.max()) / H, 4)]
            el['heightPx'] = int(ys.max() - ys.min() + 1)
            sk = pose_of(np.where(alpha[..., None] > 0.5, rgb[y0:y1, x0:x1], 255).astype(np.uint8))
            el['skeleton'] = sk
        els.append(el)
    # set masks (≤ 512 px wide, like layers()): vegetation weight for the wind, sky, water, cloth
    def mk(cls):
        ids = [i for i, n in enumerate(names) if n in cls]
        return np.isin(lab, ids)
    veg = cv2.GaussianBlur(mk({'tree', 'plant', 'palm', 'grass', 'flower'}).astype(np.float32), (0, 0), 1.5)
    sky = mk({'sky'}).astype(np.float32)
    water = mk({'water', 'sea', 'river', 'lake', 'swimming pool', 'fountain', 'waterfall'}).astype(np.float32)
    cloth = mk({'curtain', 'flag', 'awning', 'tent', 'canopy', 'blind'}).astype(np.float32)
    Image.fromarray((np.dstack([veg, sky, water]) * 255).astype(np.uint8), 'RGB').save(os.path.join(out_dir, 'anim-masks.png'))
    Image.fromarray((cloth * 255).astype(np.uint8), 'L').save(os.path.join(out_dir, 'anim-cloth.png'))
    if not plate_path:
        living = np.zeros((H, W), np.uint8)
        for el in els:
            if el.get('cutout'):
                x0, y0 = int(el['box'][0] * W), int(el['box'][1] * H)
                a = np.asarray(Image.open(os.path.join(out_dir, el['cutout'])))[..., 3]
                living[y0:y0 + a.shape[0], x0:x0 + a.shape[1]] |= (a > 20).astype(np.uint8) * 255
        living = cv2.dilate(living, np.ones((9, 9), np.uint8))
        plate, how, _ = lama_fill(rgb, living.copy()) if living.any() else (rgb, 'rien à effacer', 0)
        Image.fromarray(plate).save(os.path.join(out_dir, 'plate.jpg'), quality=90)
    info = {'image': os.path.basename(img_path), 'size': [W, H], 'masks': [lw, lh], 'elements': els,
            'counts': {k: sum(1 for e in els if e['label'] == k) for k in sorted({e['label'] for e in els})},
            'skeletons': sum(1 for e in els if e.get('skeleton')), 'seconds': round(time.time() - t0, 2)}
    json.dump(info, open(os.path.join(out_dir, 'atlas.json'), 'w'), ensure_ascii=False, indent=1)
    return info


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--image', required=True)
    ap.add_argument('--out-dir', required=True)
    ap.add_argument('--seg', default=None)
    ap.add_argument('--plate-width', type=int, default=1024)
    ap.add_argument('--atlas', action='store_true', help='atlas de la scène (éléments, squelettes, découpes, masques d’animation)')
    ap.add_argument('--plate', default=None, help='avec --atlas : décor déjà nettoyé (sinon reconstruit par LaMa)')
    a = ap.parse_args()
    if a.atlas:
        r = atlas(a.image, a.out_dir, a.plate)
        print(json.dumps({k: v for k, v in r.items() if k != 'elements'}, ensure_ascii=False))
    else:
        print(json.dumps(layers(a.image, a.out_dir, a.seg, a.plate_width)))
