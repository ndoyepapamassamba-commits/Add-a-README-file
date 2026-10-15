"""Squelette 2D de chaque personnage découpé (ViTPose, Apache-2.0) pour l'animation articulée.

Pour chaque découpe de genre « pieton » listée dans assets/anim.json, estime les 17 points COCO
(nez, yeux, oreilles, épaules, coudes, poignets, hanches, genoux, chevilles) sur la vignette agrandie,
et les ajoute à l'entrée sous la clé « pose » : [[x, y, score], …] en pixels de la vignette agrandie.
Le studio en déduit les os (tête, bras, avant-bras, cuisses, jambes) et anime le personnage.

(tools/prepare_anim.py --pose fait la même chose, et détecte en plus les objets tenus en main ; ce script sert
à compléter une préparation faite sans --pose.)

Usage :
    python tools/prepare_pose.py <dossier usyd-community/vitpose-base-simple> [--assets assets/scenes]
Puis relancer tools/build_mosaic_anim.py (même --assets) pour la planche animée.
"""
import json
import sys
import time
from pathlib import Path

import torch
from PIL import Image
from transformers import AutoProcessor, VitPoseForPoseEstimation

ROOT = Path(__file__).resolve().parent.parent


def main():
    flags = sys.argv[1:]
    assets = ROOT / 'assets'
    if '--assets' in flags:
        k = flags.index('--assets')
        assets = (Path.cwd() / flags[k + 1]).resolve()
        flags = flags[:k] + flags[k + 2:]
    torch.set_num_threads(4)
    proc = AutoProcessor.from_pretrained(flags[0])
    model = VitPoseForPoseEstimation.from_pretrained(flags[0]).eval()
    meta = json.loads((assets / 'meta.json').read_text())
    anim_path = assets / 'anim.json'
    anim = json.loads(anim_path.read_text())
    t0 = time.time()
    total = 0
    for tile in meta['tiles']:
        a = anim['tiles'].get(str(tile['i']))
        if not a:
            continue
        people = [e for e in a['decoupesListe'] if e['genre'] == 'pieton']
        if not people:
            continue
        img = Image.open(assets / tile['up']['file']).convert('RGB')
        boxes = [[float(v) for v in e['rect']] for e in people]
        with torch.no_grad():
            out = model(**proc(img, boxes=[boxes], return_tensors='pt'))
        res = proc.post_process_pose_estimation(out, boxes=[boxes])[0]
        for e, r in zip(people, res):
            kp, sc = r['keypoints'].numpy(), r['scores'].numpy()
            e['pose'] = [[round(float(x), 1), round(float(y), 1), round(float(s), 2)] for (x, y), s in zip(kp, sc)]
        total += len(people)
        print(f"  {tile['i'] + 1:02d} {tile['title']:<24} {len(people)} squelette(s)  ({time.time() - t0:.0f} s)", flush=True)
    anim_path.write_text(json.dumps(anim, ensure_ascii=False, indent=1))
    print(f'ok : {total} squelettes ({time.time() - t0:.0f} s)')


if __name__ == '__main__':
    main()
