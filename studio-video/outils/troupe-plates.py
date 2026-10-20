#!/usr/bin/env python3
"""DÉCORS EN COUCHES — pour chaque décor du projet (dossier privé .private/troupe, jamais publié) : premier plan
détecté (UperNet ADE20K, MIT), décor reconstruit derrière (LaMa, Apache-2.0), profondeur du décor reconstruit
(Depth Anything V2, Apache-2.0) et masques ciel / eau / végétation (décor vivant). Résultats mis en cache à côté
du décor (.plate.jpg, .plate-depth.png, .masks.png) et notés dans le manifeste ; l'app les embarque au build.
Usage : python3 outils/troupe-plates.py [--max N] [--force] [--seulement <nom>]
"""
import json
import os
import shutil
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scene_layers import layers  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.private', 'troupe')
FIRST = ['Salon', 'Marché', 'Maquis', 'Village', 'Cérémonie', 'Hôpital', 'École', 'Taxi', 'Salon de coiffure', 'Plage', 'Tribunal', 'Douane', 'Bureau']


def main():
    args = sys.argv[1:]
    cap = int(args[args.index('--max') + 1]) if '--max' in args else 10_000
    only = args[args.index('--seulement') + 1].lower() if '--seulement' in args else None
    force = '--force' in args
    man_path = os.path.join(ROOT, 'manifest.json')
    man = json.load(open(man_path))
    decors = man.get('decors', [])
    order = sorted(range(len(decors)), key=lambda i: (FIRST.index(decors[i]['name']) if decors[i]['name'] in FIRST else 99, i))
    done = 0
    for i in order:
        d = decors[i]
        if only and only not in d['name'].lower():
            continue
        if done >= cap:
            break
        if d.get('plate') and not force and os.path.exists(os.path.join(ROOT, d['plate'])):
            continue
        src = d.get('hd') or d['file']
        base = os.path.splitext(src)[0]
        t0 = time.time()
        tmp = tempfile.mkdtemp()
        try:
            info = layers(os.path.join(ROOT, src), tmp, os.path.join(ROOT, d['seg']) if d.get('seg') else None, 1024)
            for k, ext in (('plate', '.plate.jpg'), ('plateDepth', '.plate-depth.png'), ('masks', '.masks.png')):
                name = {'plate': 'plate.jpg', 'plateDepth': 'plate-depth.png', 'masks': 'masks.png'}[k]
                shutil.copy(os.path.join(tmp, name), os.path.join(ROOT, base + ext))
                d[k] = base + ext
            d['layers'] = {k: info[k] for k in ('foreground_share', 'sky', 'water', 'vegetation', 'fill')}
            tmp_man = man_path + '.tmp'  # saved after each set (resumable), atomically (a build may read it meanwhile)
            json.dump(man, open(tmp_man, 'w'), ensure_ascii=False, indent=1)
            os.replace(tmp_man, man_path)
            done += 1
            print(f'{done:3d} {d["name"]:<32} premier plan {info["foreground_share"] * 100:4.1f} % · ciel {info["sky"] * 100:4.1f} % · eau {info["water"] * 100:4.1f} % · {time.time() - t0:5.1f} s', flush=True)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    print(f'terminé : {done} décor(s) mis en couches', flush=True)


if __name__ == '__main__':
    main()
