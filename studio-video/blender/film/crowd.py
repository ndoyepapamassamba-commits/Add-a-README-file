"""LA FOULE PEINTE, PERSONNE PAR PERSONNE — pour qu'un décor vive sans glisser d'un bloc.

La segmentation de scène (ADE20K) voit une foule dense comme UNE tache « personne » (Grand Marché d'Adjamé : 99,7 %
de la foule dans une seule composante) : animée telle quelle, toute la foule ondulerait d'un seul mouvement, comme un
tableau qui glisse. Ici, Mask R-CNN (torchvision, code BSD-3, poids COCO) sépare chaque personne peinte ; le décor
vivant de `scene.py` donne ensuite à chacune son propre rythme, ancré aux pieds.

    python blender/film/crowd.py --images <décor.jpg> [...]       # écrit <décor>.inst.png à côté
    python blender/film/crowd.py --plan <film>/plan.json         # les vues que le film utilise

Sortie : <décor>.inst.png, une image 8 bits où chaque personne porte un numéro (0 = personne), les plus proches
(pied le plus bas) peintes en dernier. Calculé une fois par vue (≈ 50 s sur 4 cœurs de processeur), gardé dans le kit.
"""
import argparse
import json
import os
import re
import sys
import time

import numpy as np
from PIL import Image


def inst_path(image):
    return re.sub(r'\.[^./\\]+$', '', image) + '.inst.png'


_MODEL = None


def model():
    global _MODEL
    if _MODEL is None:
        import torch
        from torchvision.models.detection import maskrcnn_resnet50_fpn_v2, MaskRCNN_ResNet50_FPN_V2_Weights
        torch.set_num_threads(max(1, min(8, os.cpu_count() or 4)))
        _MODEL = maskrcnn_resnet50_fpn_v2(weights=MaskRCNN_ResNet50_FPN_V2_Weights.DEFAULT, box_detections_per_img=200).eval()
    return _MODEL


def instances(image, min_score=0.5, min_px=150):
    """Instance map of the painted people: uint8, 0 = nobody, 1..254 = one person each (nearest drawn last)."""
    import torch
    rgb = np.array(Image.open(image).convert('RGB'))
    x = torch.from_numpy(rgb).permute(2, 0, 1).float() / 255
    with torch.no_grad():
        o = model()([x])[0]
    keep = (o['labels'] == 1) & (o['scores'] > min_score)
    masks = (o['masks'][keep, 0] > 0.5).numpy()
    masks = [m for m in masks if m.sum() >= min_px][:254]
    # Painter's order: the person whose feet are lowest in the picture is nearest — drawn last, on top.
    feet = [np.nonzero(m.any(1))[0].max() for m in masks]
    inst = np.zeros(rgb.shape[:2], np.uint8)
    for n, k in enumerate(np.argsort(feet), start=1):
        inst[masks[k]] = n
    return inst


def sway_field(inst, seed=7):
    """Each painted person sways and breathes in its own rhythm, ANCHORED AT THE FEET (law of physics: painted feet do
    not slide): the lever goes from 0 at the feet to 1 at the top of the head, scaled by the person's height in pixels.
    The per-person fields are blurred (σ = 5 % of the height) so neighbours never tear apart, and summed as a
    quadrature pair — displacement(t) = C·sin(2πft) + S·cos(2πft) = Σᵢ wᵢ·sin(2π(ft + φᵢ)) — so ONE two-channel
    picture carries every person's own phase. Returns C, S in pixels (per unit of the shader's amplitude ratio)."""
    import cv2
    h, w = inst.shape
    C = np.zeros((h, w), np.float32)
    S = np.zeros((h, w), np.float32)
    rng = np.random.default_rng(seed)
    for n in range(1, int(inst.max()) + 1):
        m = inst == n
        if not m.any():
            continue
        ys, xs = np.nonzero(m)
        y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        hh = float(y1 - y0 + 1)
        sig = max(1.5, 0.05 * hh)
        pad = int(3 * sig) + 1
        a0, a1, b0, b1 = max(0, y0 - pad), min(h, y1 + pad + 1), max(0, x0 - pad), min(w, x1 + pad + 1)
        lever = np.clip((y1 - np.arange(a0, a1, dtype=np.float32)) / hh, 0, 1)[:, None]
        wi = cv2.GaussianBlur(m[a0:a1, b0:b1].astype(np.float32) * lever, (0, 0), sig) * hh
        ph = 2 * np.pi * rng.random()
        C[a0:a1, b0:b1] += wi * np.cos(ph)
        S[a0:a1, b0:b1] += wi * np.sin(ph)
    return C, S


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--images', nargs='*', default=[])
    ap.add_argument('--plan', default='')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    images = list(a.images)
    if a.plan:
        plan = json.load(open(a.plan, encoding='utf-8'))
        rig = json.load(open(plan['rig'], encoding='utf-8'))
        views = [plan.get('decor')] + [c.get('decor') for c in plan.get('coupes', [])]
        for v in dict.fromkeys(v for v in views if v):
            d = rig['decors'].get(v)
            if d and d.get('image'):
                images.append(d['image'])
    for im in dict.fromkeys(images):
        out = inst_path(im)
        if os.path.isfile(out) and not a.force:
            print(f'[foule] {os.path.basename(out)} déjà calculé', flush=True)
            continue
        t = time.time()
        inst = instances(im)
        Image.fromarray(inst).save(out)
        print(f'[foule] {os.path.basename(im)} : {int(inst.max())} personne(s) peinte(s) séparée(s) en {time.time() - t:.0f} s', flush=True)


if __name__ == '__main__':
    sys.exit(main())
