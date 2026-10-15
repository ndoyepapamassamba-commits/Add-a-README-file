"""Prépare l'« univers animé » de chaque vignette : personnages, véhicules, ciel, arbres, mer.

Pour chaque vignette agrandie (assets/tiles/NN.webp) :
 1. Détourage panoptique (Mask2Former, COCO) : chaque personne, voiture, bus, moto, vélo, bateau
    devient une découpe, et l'on repère le ciel, les arbres et l'eau.
 2. Reconstruction du décor derrière les découpes (LaMa, Apache-2.0, ONNX).
 3. Écrit : assets/anim/NN-fond.webp (décor reconstruit), NN-decoupes.webp (découpes avec transparence, en atlas),
    NN-ambiance.png (R = ciel, G = arbres, B = eau) et assets/anim.json (position, profondeur et
    mouvement de chaque découpe).

Usage :
    python tools/prepare_anim.py <dossier mask2former-swin-tiny-coco-panoptic> <lama_fp32.onnx> [--assets assets/scenes] [i ...]
En intérieur (pas de rue ni de ciel), les personnes restent à leur place : assises, elles respirent et se
balancent ; debout, elles se balancent et font de petits pas ; une main levée s'agite.
Dépendances : torch (CPU), transformers, onnxruntime, numpy, pillow, opencv-python-headless, scipy.
"""
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
import torch
from PIL import Image
from scipy import ndimage
from transformers import AutoImageProcessor, Mask2FormerForUniversalSegmentation

ROOT = Path(__file__).resolve().parent.parent
MOVING = {'person': 'pieton', 'car': 'vehicule', 'bus': 'vehicule', 'truck': 'vehicule',
          'motorcycle': 'deux-roues', 'bicycle': 'deux-roues', 'boat': 'bateau'}
SKY = {'sky-other-merged'}
TREES = {'tree-merged', 'grass-merged'}
WATER = {'sea', 'water-other', 'river'}
ATLAS_W = 2048


def segment(proc, model, img):
    """Segmentation panoptique à mi-résolution ; renvoie la carte d'identifiants et les segments."""
    small = img.resize((img.width // 2, img.height // 2), Image.BICUBIC)
    with torch.no_grad():
        out = model(**proc(images=small, return_tensors='pt'))
    r = proc.post_process_panoptic_segmentation(out, target_sizes=[small.size[::-1]], threshold=0.5, label_ids_to_fuse=set())[0]
    seg = cv2.resize(r['segmentation'].numpy().astype(np.int32), img.size, interpolation=cv2.INTER_NEAREST)
    return seg, [(s['id'], model.config.id2label[s['label_id']], s['score']) for s in r['segments_info']]


def _lama(session, img, mask):
    """Un passage LaMa sur une image 512×512 (img uint8, mask bool). Renvoie uint8."""
    out = session.run(None, {'image': (img.astype(np.float32) / 255).transpose(2, 0, 1)[None],
                             'mask': mask.astype(np.float32)[None, None]})[0][0].transpose(1, 2, 0)
    return np.clip(out, 0, 255).astype(np.uint8)


def lama_fill(session, rgb, mask):
    """Reconstruit le décor sous le masque.
    Grands trous (bus, files de voitures) : passage global sur l'image réduite à 512 px (plus de contexte).
    Petits trous (piétons) : fenêtres 512×512 à pleine résolution (plus de détail)."""
    h, w = mask.shape
    P = 512
    # Passage global : image réduite (aspect conservé), complétée par réflexion jusqu'à 512×512.
    k = P / max(w, h)
    sw, sh = round(w * k), round(h * k)
    small = cv2.resize(rgb, (sw, sh), interpolation=cv2.INTER_AREA)
    small_m = cv2.resize(mask.astype(np.uint8), (sw, sh), interpolation=cv2.INTER_NEAREST) > 0
    pad = ((0, P - sh), (0, P - sw))
    g = _lama(session, np.pad(small, pad + ((0, 0),), mode='reflect'), np.pad(small_m, pad, mode='constant'))[:sh, :sw]
    global_fill = cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)

    labels, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    big = np.isin(labels, [j + 1 for j, a in enumerate(sizes) if a > w * h * 0.012])
    out = rgb.copy()
    out[big] = global_fill[big]

    # Fenêtres locales pour les petits trous ; chaque fenêtre ne remplit que ce qui reste à faire.
    todo_all = mask & ~big
    xs = sorted({0, max(0, w - P)} | set(range(0, max(1, w - P), 384)))
    ys = sorted({0, max(0, h - P)} | set(range(0, max(1, h - P), 384)))
    for y in ys:
        for x in xs:
            todo = todo_all[y:y + P, x:x + P]
            if not todo.any():
                continue
            crop = out[y:y + P, x:x + P]
            ph, pw = crop.shape[:2]
            if ph < P or pw < P:  # image plus petite que la fenêtre : complétée par réflexion
                crop = np.pad(crop, ((0, P - ph), (0, P - pw), (0, 0)), mode='reflect')
                tm = np.pad(todo, ((0, P - ph), (0, P - pw)), mode='constant')
            else:
                tm = todo
            res = _lama(session, crop, tm)[:ph, :pw]
            region = out[y:y + P, x:x + P]
            region[todo] = res[todo]
            todo_all[y:y + P, x:x + P] &= ~todo
    return out


def vanishing_point(seg, segments, w, h):
    """Point de fuite approximatif : centre horizontal, à hauteur du haut de la chaussée."""
    road = np.zeros((h, w), bool)
    for sid, name, _ in segments:
        if name in ('road', 'pavement-merged', 'sand', 'dirt-merged', 'gravel'):
            road |= seg == sid
    rows = np.where(road.mean(1) > 0.15)[0]
    vy = float(rows.min()) if len(rows) else h * 0.42
    return [w / 2, max(h * 0.25, min(h * 0.6, vy))]


def posture(m):
    """Posture d'une personne d'après sa silhouette : (« debout » | « assis », main levée ?)."""
    ys, xs = np.where(m)
    h, w = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
    widths = m[ys.min():ys.max() + 1].sum(1)
    top = widths[: max(2, int(h * 0.12))]
    raised = bool(np.median(top) < 0.22 * widths.max())  # pointe étroite au-dessus de la tête : bras levé
    return ('debout' if h / max(1, w) > 2.1 else 'assis'), raised


def main():
    flags = sys.argv[1:]
    assets = ROOT / 'assets'
    if '--assets' in flags:
        k = flags.index('--assets')
        assets = (Path.cwd() / flags[k + 1]).resolve()
        flags = flags[:k] + flags[k + 2:]
    m2f_dir, lama_path = flags[0], flags[1]
    torch.set_num_threads(4)
    proc = AutoImageProcessor.from_pretrained(m2f_dir)
    model = Mask2FormerForUniversalSegmentation.from_pretrained(m2f_dir).eval()
    lama = ort.InferenceSession(lama_path, providers=['CPUExecutionProvider'])
    meta = json.loads((assets / 'meta.json').read_text())
    depth_atlas = np.asarray(Image.open(assets / 'depth-atlas.png'), np.float32) / 255
    dm = meta['depth']
    out_dir = assets / 'anim'
    out_dir.mkdir(exist_ok=True)
    only = {int(a) for a in flags[2:]} if len(flags) > 2 else None
    anim_path = assets / 'anim.json'
    anim = json.loads(anim_path.read_text()) if anim_path.exists() and only else {'tiles': {}}
    rng = np.random.default_rng(7)
    t0 = time.time()

    for tile in meta['tiles']:
        i = tile['i']
        if only is not None and i not in only:
            continue
        img = Image.open(assets / tile['up']['file']).convert('RGB')
        rgb = np.asarray(img)
        h, w = rgb.shape[:2]
        sx, sy = w / tile['rect'][2], h / tile['rect'][3]
        cap = np.zeros((h, w), bool)
        if tile['caption']:
            cx, cy, cw, ch = tile['caption']
            cap[int(cy * sy) - 6:, :int((cx + cw) * sx) + 6] = True
        # profondeur de la vignette, à pleine résolution
        r, c = divmod(i, dm['cols'])
        d_tile = depth_atlas[r * dm['tileH']:(r + 1) * dm['tileH'], c * dm['tileW']:(c + 1) * dm['tileW']]
        depth = cv2.resize(d_tile, (w, h), interpolation=cv2.INTER_LINEAR)

        seg, segments = segment(proc, model, img)
        vp = vanishing_point(seg, segments, w, h)
        outdoor_px = sum((seg == sid).sum() for sid, name, _ in segments
                         if name in ('road', 'pavement-merged', 'sand', 'dirt-merged', 'gravel', 'sky-other-merged', 'sea'))
        outdoor = outdoor_px > w * h * 0.04

        sprites, holes = [], np.zeros((h, w), bool)
        ambiance = np.zeros((h // 2, w // 2, 3), np.uint8)
        for sid, name, score in segments:
            m = seg == sid
            if name in SKY | TREES | WATER:
                ch_idx = 0 if name in SKY else 1 if name in TREES else 2
                small = cv2.resize((m & ~cap).astype(np.uint8) * 255, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
                ambiance[..., ch_idx] = np.maximum(ambiance[..., ch_idx], small)
                continue
            kind = MOVING.get(name)
            if not kind:
                continue
            area = m.sum()
            if area < w * h * 0.0012 or (m & cap).sum() > area * 0.1:
                continue
            ys, xs = np.where(m)
            x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
            if (x1 - x0) < 8 or (y1 - y0) < 8:
                continue
            holes |= m
            pad = 3
            x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
            x1, y1 = min(w - 1, x1 + pad), min(h - 1, y1 + pad)
            alpha = cv2.GaussianBlur(cv2.dilate(m.astype(np.uint8) * 255, np.ones((3, 3), np.uint8)), (0, 0), 1.0)
            cut = np.dstack([rgb, alpha])[y0:y1 + 1, x0:x1 + 1]
            foot = [float((xs[ys >= y1 - 3 - pad].mean()) if (ys >= y1 - 3 - pad).any() else (x0 + x1) / 2), float(y1 - pad)]
            d = float(np.median(depth[m]))
            # Mouvement : véhicules et deux-roues suivent la route vers le point de fuite (voie de droite :
            # ils s'éloignent ; voie de gauche : ils approchent) ; piétons : marche latérale ; bateaux : tangage.
            if kind in ('vehicule', 'deux-roues'):
                away = foot[0] >= vp[0]
                speed = (0.035 if kind == 'vehicule' else 0.055) * (0.8 + 0.4 * rng.random())
                move = {'type': 'route', 'sens': 'eloigne' if away else 'approche', 'vitesse': round(speed, 3)}
            elif kind == 'pieton' and outdoor:
                move = {'type': 'marche', 'dir': int(rng.choice([-1, 1])), 'vitesse': round(0.14 + 0.12 * rng.random(), 3),
                        'phase': round(float(rng.random()) * 6.28, 2)}
            elif kind == 'pieton':  # intérieur : la personne reste à sa place et vit
                pose, raised = posture(m)
                move = {'type': 'vie', 'posture': pose, 'leve': raised, 'phase': round(float(rng.random()) * 6.28, 2),
                        'amp': round(0.8 + 0.4 * float(rng.random()), 2)}
            else:
                move = {'type': 'tangage', 'phase': round(float(rng.random()) * 6.28, 2)}
            sprites.append({'classe': name, 'genre': kind, 'cut': cut, 'rect': [int(x0), int(y0), int(x1 - x0 + 1), int(y1 - y0 + 1)],
                            'pied': [round(foot[0], 1), round(foot[1], 1)], 'profondeur': round(d, 3), 'mouvement': move})

        # Décor reconstruit derrière les découpes.
        hole_mask = cv2.dilate(holes.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0  # franges des silhouettes incluses
        hole_mask &= ~cap
        bg = lama_fill(lama, rgb, hole_mask) if hole_mask.any() else rgb
        Image.fromarray(bg).save(out_dir / f'{i + 1:02d}-fond.webp', quality=90, method=6)
        amb = cv2.GaussianBlur(ambiance, (0, 0), 2.0)
        Image.fromarray(amb).save(out_dir / f'{i + 1:02d}-ambiance.png', optimize=True)

        # Atlas des découpes (rangées simples), trié du plus loin au plus proche.
        sprites.sort(key=lambda s: s['pied'][1])
        x = y = row_h = 0
        placed = []
        for s in sprites:
            ch_, cw_ = s['cut'].shape[:2]
            if x + cw_ > ATLAS_W:
                x, y, row_h = 0, y + row_h + 2, 0
            placed.append((s, x, y))
            x += cw_ + 2
            row_h = max(row_h, ch_)
        atlas_h = max(1, y + row_h)
        atlas = np.zeros((atlas_h, ATLAS_W, 4), np.uint8)
        entries = []
        for s, ax, ay in placed:
            ch_, cw_ = s['cut'].shape[:2]
            atlas[ay:ay + ch_, ax:ax + cw_] = s['cut']
            e = {k: v for k, v in s.items() if k != 'cut'}
            e['atlas'] = [ax, ay, cw_, ch_]
            entries.append(e)
        Image.fromarray(atlas, 'RGBA').save(out_dir / f'{i + 1:02d}-decoupes.webp', quality=88, method=6, exact=True)
        anim['tiles'][str(i)] = {
            'fond': f'anim/{i + 1:02d}-fond.webp', 'decoupes': f'anim/{i + 1:02d}-decoupes.webp',
            'ambiance': f'anim/{i + 1:02d}-ambiance.png', 'atlas': [ATLAS_W, int(atlas_h)],
            'taille': [w, h], 'fuite': [round(vp[0], 1), round(vp[1], 1)], 'scene': 'exterieur' if outdoor else 'interieur',
            'decoupesListe': entries,
        }
        kinds = {}
        for e in entries:
            g = e['genre'] if e['mouvement']['type'] != 'vie' else f"{e['mouvement']['posture']}{' (main levée)' if e['mouvement']['leve'] else ''}"
            kinds[g] = kinds.get(g, 0) + 1
        print(f"  {i + 1:02d} {tile['title']:<24} {', '.join(f'{k} ×{v}' for k, v in kinds.items()) or 'aucune découpe'}  ({time.time() - t0:.0f} s)", flush=True)

    anim['modeles'] = ['Mask2Former Swin-T COCO panoptique (Meta)', 'LaMa (Apache-2.0)']
    anim_path.write_text(json.dumps(anim, ensure_ascii=False, indent=1))
    print(f'ok ({time.time() - t0:.0f} s)')


if __name__ == '__main__':
    main()
