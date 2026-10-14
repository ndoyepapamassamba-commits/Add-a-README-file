"""Génère l'atlas de profondeur (une carte par frame) utilisé par le mode 3D.

Modèle : Depth Anything V2 Small (Apache-2.0), format ONNX (onnx-community/depth-anything-v2-small).
Dépendances : ffmpeg, python3, numpy, pillow, onnxruntime.

Usage :
    python tools/depth.py assets/source.mp4 chemin/vers/model.onnx assets/
Produit : assets/depth-atlas.png + assets/depth-meta.json
"""
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

W, H = 1080, 1920
SCENE_RECT = (0, 530, 1080, 860)   # x, y, w, h : plan paysage net au centre du 9:16
EMOJI_RECT = (0, 390, 1080, 1080)  # carré centré sur l'emoji final
TILE_W, TILE_H = 224, 178
COLS = 18
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


def read_frames(video):
    cmd = ['ffmpeg', '-v', 'error', '-i', video, '-vf',
           'scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24',
           '-f', 'rawvideo', '-']
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    size = W * H * 3
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        yield np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    proc.wait()


def infer(session, rgb, in_w, in_h):
    img = Image.fromarray(rgb).resize((in_w, in_h), Image.BICUBIC)
    x = (np.asarray(img, np.float32) / 255.0 - MEAN) / STD
    x = x.transpose(2, 0, 1)[None]
    return session.run(None, {'pixel_values': x})[0][0]


def to_tile(depth):
    return np.asarray(Image.fromarray(depth.astype(np.float32), 'F').resize((TILE_W, TILE_H), Image.BILINEAR))


def normalize(stack, lo_q=1, hi_q=99):
    lo, hi = np.percentile(stack, lo_q), np.percentile(stack, hi_q)
    return np.clip((stack - lo) / max(hi - lo, 1e-6), 0, 1)


def temporal_median(stack, radius=2):
    out = np.empty_like(stack)
    for i in range(len(stack)):
        out[i] = np.median(stack[max(0, i - radius):i + radius + 1], axis=0)
    return out


def main():
    video, model, out_dir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    session = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
    scene, emoji, emoji_masks = [], [], []
    cut = None
    t0 = time.time()
    for i, frame in enumerate(read_frames(video)):
        is_emoji = frame[:400].mean() < 12  # bandes floues absentes => écran noir de l'emoji
        if is_emoji and cut is None:
            cut = i
        if not is_emoji and cut is None:
            x, y, w, h = SCENE_RECT
            scene.append(to_tile(infer(session, frame[y:y + h, x:x + w], 644, 518)))
        else:
            x, y, w, h = EMOJI_RECT
            crop = frame[y:y + h, x:x + w]
            emoji.append(to_tile(infer(session, crop, 518, 518)))
            lum = np.asarray(Image.fromarray(crop).convert('L').resize((TILE_W, TILE_H), Image.BILINEAR), np.float32)
            emoji_masks.append(np.clip((lum - 8) / 30, 0, 1))
        if i % 30 == 0:
            print(f'frame {i}  ({time.time() - t0:.0f}s)', flush=True)

    scene = temporal_median(normalize(np.stack(scene)))
    emoji = temporal_median(normalize(np.stack(emoji)) * np.stack(emoji_masks), radius=1)
    tiles = np.concatenate([scene, emoji])
    n = len(tiles)
    rows = (n + COLS - 1) // COLS
    atlas = np.zeros((rows * TILE_H, COLS * TILE_W), np.uint8)
    for k, tile in enumerate(tiles):
        r, c = divmod(k, COLS)
        atlas[r * TILE_H:(r + 1) * TILE_H, c * TILE_W:(c + 1) * TILE_W] = np.round(tile * 255)
    Image.fromarray(atlas, 'L').save(out_dir / 'depth-atlas.png', optimize=True)
    meta = {
        'frames': n, 'fps': 30, 'cutFrame': cut, 'tileW': TILE_W, 'tileH': TILE_H,
        'cols': COLS, 'rows': rows, 'sceneRect': SCENE_RECT, 'emojiRect': EMOJI_RECT,
        'model': 'Depth Anything V2 Small (Apache-2.0)',
    }
    (out_dir / 'depth-meta.json').write_text(json.dumps(meta, indent=2))
    print('ok', meta, f'{time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
