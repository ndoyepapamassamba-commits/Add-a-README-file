"""Assemble l'univers animé de la MOSAÏQUE (la planche entière) à partir des 30 vignettes préparées.

Lit assets/anim.json et assets/anim/NN-*.{webp,png} (produits par tools/prepare_anim.py), puis écrit :
  assets/anim/planche-fond.webp      la planche sans personnages ni véhicules (séparateurs intacts)
  assets/anim/planche-ambiance.png   masques ciel (R), arbres (G), eau (B) à l'échelle de la planche
  assets/anim/planche-decoupes.webp  toutes les découpes, réduites à l'échelle de la planche
et ajoute la section « planche » dans assets/anim.json (coordonnées en pixels de la planche).

Usage : python tools/build_mosaic_anim.py [--assets assets/scenes]
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ATLAS_W = 2048


def main():
    import sys
    A = (Path.cwd() / sys.argv[sys.argv.index('--assets') + 1]).resolve() if '--assets' in sys.argv else ROOT / 'assets'
    meta = json.loads((A / 'meta.json').read_text())
    anim = json.loads((A / 'anim.json').read_text())
    src = Image.open(A / meta['source']['file']).convert('RGB')
    fond = src.copy()
    amb = Image.new('RGB', src.size, (0, 0, 0))
    cuts = []
    for tile in meta['tiles']:
        i = tile['i']
        a = anim['tiles'].get(str(i))
        if not a:
            continue
        x, y, w, h = tile['rect']
        up_w, up_h = a['taille']
        k = w / up_w  # échelle vignette agrandie → planche
        bg = Image.open(A / a['fond']).convert('RGB').resize((w, h), Image.LANCZOS)
        fond.paste(bg, (x, y))
        am = Image.open(A / a['ambiance']).convert('RGB').resize((w, h), Image.BILINEAR)
        amb.paste(am, (x, y))
        atlas = Image.open(A / a['decoupes']).convert('RGBA')
        for e in a['decoupesListe']:
            ax, ay, aw, ah = e['atlas']
            cw, ch = max(2, round(aw * k)), max(2, round(ah * k))
            cut = atlas.crop((ax, ay, ax + aw, ay + ah)).resize((cw, ch), Image.LANCZOS)
            rx, ry, rw, rh = e['rect']
            c = {
                'tile': i, 'cut': cut,
                'rect': [round(x + rx * k, 2), round(y + ry * k, 2), round(rw * k, 2), round(rh * k, 2)],
                'pied': [round(x + e['pied'][0] * k, 2), round(y + e['pied'][1] * k, 2)],
                'profondeur': e['profondeur'], 'genre': e['genre'], 'mouvement': e['mouvement'],
            }
            if e.get('pose'):  # squelette ramené à l'échelle de la planche
                c['pose'] = [[round(x + px * k, 2), round(y + py * k, 2), s_] for px, py, s_ in e['pose']]
            cuts.append(c)
        a['fuitePlanche'] = [round(x + a['fuite'][0] * k, 2), round(y + a['fuite'][1] * k, 2)]

    # Atlas unique des découpes réduites (rangées).
    cuts.sort(key=lambda c: -c['cut'].size[1])
    xx = yy = row_h = 0
    for c in cuts:
        cw, ch = c['cut'].size
        if xx + cw > ATLAS_W:
            xx, yy, row_h = 0, yy + row_h + 2, 0
        c['atlas'] = [xx, yy, cw, ch]
        xx += cw + 2
        row_h = max(row_h, ch)
    atlas_h = yy + row_h
    big = Image.new('RGBA', (ATLAS_W, max(1, atlas_h)), (0, 0, 0, 0))
    for c in cuts:
        big.paste(c['cut'], tuple(c['atlas'][:2]))

    out = A / 'anim'
    fond.save(out / 'planche-fond.webp', quality=92, method=6)
    amb.save(out / 'planche-ambiance.png', optimize=True)
    big.save(out / 'planche-decoupes.webp', quality=88, method=6, exact=True)
    per_tile = {}
    for c in cuts:
        per_tile.setdefault(str(c['tile']), []).append({k: v for k, v in c.items() if k not in ('cut', 'tile')})
    anim['planche'] = {
        'fond': 'anim/planche-fond.webp', 'ambiance': 'anim/planche-ambiance.png', 'decoupes': 'anim/planche-decoupes.webp',
        'atlas': [ATLAS_W, max(1, atlas_h)], 'parVignette': per_tile,
    }
    (A / 'anim.json').write_text(json.dumps(anim, ensure_ascii=False, indent=1))
    print(f'Planche animée : {len(cuts)} découpes, atlas {ATLAS_W}×{atlas_h}')


if __name__ == '__main__':
    main()
