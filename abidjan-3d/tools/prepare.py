"""Prépare la planche « Abidjan » pour le studio 3D.

1. Détecte la grille (séparateurs blancs) et les 30 vignettes.
2. Détecte le bandeau bleu (légende) de chaque vignette.
3. Agrandit chaque vignette ×4 avec Real-ESRGAN General x4v3 (BSD-3, ONNX) → assets/tiles/NN.webp
4. Calcule une carte de profondeur par vignette avec Depth Anything V2 Small (Apache-2.0) → assets/depth-atlas.png
5. Écrit assets/meta.json

Usage :
    python tools/prepare.py assets/abidjan.webp esrgan.onnx depth.onnx assets/
Dépendances : numpy, pillow, onnxruntime.
"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

DEPTH_TILE = (240, 160)  # taille d'une carte de profondeur dans l'atlas
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)

# Légendes lisibles par le studio (liste des quartiers). Les pixels de l'image ne sont jamais modifiés.
CAPTIONS = [
    ('PLATEAU', 'Boulevard de la République - Abidjan'), ('COCODY', 'Avenue Latrille - Abidjan'),
    ('RIVIERA', 'Rue Mermoz - Abidjan'), ('MARCORY', "Boulevard Valéry Giscard d'Estaing - Abidjan"),
    ('TREICHVILLE', 'Boulevard de Marseille - Abidjan'), ('KOUMASSI', 'Carrefour de Kouté - Abidjan'),
    ('YOPOUGON', 'Quartier Maroc - Abidjan'), ('ADJAMÉ', 'Grand Marché - Abidjan'),
    ('ATTECOUBÉ', 'Quartier Sicogi - Abidjan'), ('PORT-BOUËT', 'Centre-ville - Abidjan'),
    ('ANYAMA', 'Centre-ville - Abidjan'), ('BINGERVILLE', "Centre-ville - Banlieue d'Abidjan"),
    ('ABOBO', "Carrefour N'Dotré - Abidjan"), ('SONGON', 'Quartier Kassemblé - Abidjan'),
    ('PLATEAU DOKUI', 'Zone précaire - Abidjan'), ('BANCO NORD', 'Quartier populaire - Abidjan'),
    ('VRIDI', 'Zone portuaire - Abidjan'), ('ZONE 4', 'Rue des Jardins - Abidjan'),
    ('WILLIAMSVILLE', 'Quartier résidentiel - Abidjan'), ('BIÉTRY', 'Avenue de France - Abidjan'),
    ('SOCOGI', 'Zone industrielle - Abidjan'), ('RIVIERA PALMERAIE', 'Résidentiel - Abidjan'),
    ('PORT DE PÊCHE', 'Vridi - Abidjan'), ('MARCHÉ DE GROS', 'Treichville - Abidjan'),
    ('MAISON MODESTE', 'Quartier populaire - Abidjan'), ("BIDONVILLE D'ADJAMÉ", 'Quartier Bracodi - Abidjan'),
    ('VILLAGE DE SONGON', "Périphérie d'Abidjan"), ('VILLAGE DE BASSAM', 'Grand-Bassam'),
    ('VILLAGE DE JACQUEVILLE', 'Jacqueville'), ("VILLAGE D'ASSINIE", 'Assinie'),
]


def runs(mask):
    out, start = [], None
    for i, m in enumerate(mask):
        if m and start is None:
            start = i
        if not m and start is not None:
            out.append([start, i - 1])
            start = None
    if start is not None:
        out.append([start, len(mask) - 1])
    return out


def detect_grid(gray):
    """Intervalles [début, fin] des vignettes entre les séparateurs blancs (≥ 3 px)."""
    def axis(mean, std, size):
        seps = runs((mean > 236) & (std < 12))
        for s in seps:  # séparateur trop fin détecté (anti-crénelage) : élargi à 3 px
            while s[1] - s[0] < 2:
                s[0] -= 1
                s[1] += 1
        bounds, prev = [], 0
        for a, b in seps:
            bounds.append((prev, a - 1))
            prev = b + 1
        bounds.append((prev, size - 1))
        return bounds
    xs = axis(gray.mean(0), gray.std(0), gray.shape[1])
    ys = axis(gray.mean(1), gray.std(1), gray.shape[0])
    return xs, ys


def detect_caption(tile):
    """Rectangle (x, y, w, h) du bandeau bleu marine, relatif à la vignette."""
    r, g, b = (tile[..., i].astype(int) for i in range(3))
    mask = (b > 70) & (b - r > 45) & (b - g > 20) & (r < 90)
    h, w = mask.shape
    mask[: h // 2] = False
    # Dernier bloc contigu de lignes bleues en partant du bas (trous de ≤ 3 lignes tolérés) :
    # on ignore ainsi le bleu présent dans la scène au-dessus du bandeau.
    blocks = runs(list(mask.mean(1) > 0.35))
    if not blocks:
        return None
    y0, y1 = blocks[-1]
    for a, b in reversed(blocks[:-1]):
        if y0 - b > 4:
            break
        y0 = a
    rows = np.arange(y0, y1 + 1)
    cols = np.where(mask[rows].mean(0) > 0.5)[0]
    if not len(cols):
        return None
    x0, x1, y0, y1 = cols.min(), cols.max(), rows.min(), rows.max()
    pad = 2  # bordure anti-crénelée du bandeau
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(w - 1, x1 + pad), min(h - 1, y1 + pad)
    return [int(x0), int(y0), int(x1 - x0 + 1), int(y1 - y0 + 1)]


def esrgan_upscale(session, img, patch=128, margin=16):
    """Agrandit ×4 par patchs 128×128 avec recouvrement (on garde le centre de chaque patch)."""
    h, w = img.shape[:2]
    step = patch - 2 * margin
    src = np.pad(img.astype(np.float32) / 255, ((margin, margin + patch), (margin, margin + patch), (0, 0)), mode='reflect')
    out = np.zeros((h * 4, w * 4, 3), np.float32)
    for y in range(0, h, step):
        for x in range(0, w, step):
            p = src[y:y + patch, x:x + patch].transpose(2, 0, 1)[None]
            o = session.run(None, {'image': p})[0][0].transpose(1, 2, 0)
            ph, pw = min(step, h - y), min(step, w - x)
            out[y * 4:(y + ph) * 4, x * 4:(x + pw) * 4] = o[margin * 4:margin * 4 + ph * 4, margin * 4:margin * 4 + pw * 4]
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)


def depth_map(session, rgb):
    x = (np.asarray(Image.fromarray(rgb).resize((784, 518), Image.BICUBIC), np.float32) / 255 - MEAN) / STD
    d = session.run(None, {'pixel_values': x.transpose(2, 0, 1)[None]})[0][0]
    d = np.asarray(Image.fromarray(d.astype(np.float32), 'F').resize(DEPTH_TILE, Image.BILINEAR))
    lo, hi = np.percentile(d, 1), np.percentile(d, 99)
    return np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)


def main():
    src_path, esrgan_path, depth_path, out_dir = sys.argv[1], sys.argv[2], sys.argv[3], Path(sys.argv[4])
    (out_dir / 'tiles').mkdir(parents=True, exist_ok=True)
    img = np.asarray(Image.open(src_path).convert('RGB'))
    gray = img.mean(2)
    xs, ys = detect_grid(gray)
    print(f'grille : {len(xs)} colonnes × {len(ys)} lignes')
    esrgan = ort.InferenceSession(esrgan_path, providers=['CPUExecutionProvider'])
    depth = ort.InferenceSession(depth_path, providers=['CPUExecutionProvider'])

    cols = len(xs)
    tw, th = DEPTH_TILE
    atlas = np.zeros((len(ys) * th, cols * tw), np.uint8)
    tiles = []
    t0 = time.time()
    for r, (y0, y1) in enumerate(ys):
        for c, (x0, x1) in enumerate(xs):
            i = r * cols + c
            tile = img[y0:y1 + 1, x0:x1 + 1]
            cap = detect_caption(tile)
            up = esrgan_upscale(esrgan, tile)
            name = f'tiles/{i + 1:02d}.webp'
            Image.fromarray(up).save(out_dir / name, quality=92, method=6)
            d = depth_map(depth, up)
            if cap:  # bandeau : profondeur plate, prise juste au-dessus (le bandeau est un calque fixe)
                cx, cy, cw, ch = cap
                h, w = tile.shape[:2]
                ax0, ax1 = int(cx / w * tw), int(np.ceil((cx + cw) / w * tw))
                ay0 = int(cy / h * th)
                ref = float(np.median(d[max(0, ay0 - 4):max(1, ay0), ax0:ax1]))
                d[ay0:, ax0:ax1] = ref
            atlas[r * th:(r + 1) * th, c * tw:(c + 1) * tw] = np.round(d * 255)
            title, subtitle = CAPTIONS[i] if i < len(CAPTIONS) else (f'VIGNETTE {i + 1}', '')
            tiles.append({
                'i': i, 'title': title, 'subtitle': subtitle,
                'rect': [int(x0), int(y0), int(x1 - x0 + 1), int(y1 - y0 + 1)],
                'caption': cap, 'up': {'file': name, 'w': int(up.shape[1]), 'h': int(up.shape[0])},
            })
            print(f'  {i + 1:02d} {title:<24} {tile.shape[1]}×{tile.shape[0]} → {up.shape[1]}×{up.shape[0]}  bandeau {cap}  ({time.time() - t0:.0f}s)', flush=True)

    Image.fromarray(atlas, 'L').save(out_dir / 'depth-atlas.png', optimize=True)
    meta = {
        'source': {'file': 'abidjan.webp', 'w': int(img.shape[1]), 'h': int(img.shape[0])},
        'grid': {'cols': cols, 'rows': len(ys)},
        'depth': {'tileW': tw, 'tileH': th, 'cols': cols, 'rows': len(ys)},
        'tiles': tiles,
        'models': ['Real-ESRGAN General x4v3 (BSD-3)', 'Depth Anything V2 Small (Apache-2.0)'],
    }
    (out_dir / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print(f'ok ({time.time() - t0:.0f}s)')


if __name__ == '__main__':
    main()
