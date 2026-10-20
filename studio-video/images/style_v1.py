# PORTE « STYLE V1 » (20/10/2026) — « le style de personnage et de scène de la V1 ne ressemble pas à la troupe avec ses 54
# personnages. Même les styles de dessin diffèrent. Donc tu devras créer des personnages et des scènes qui coïncident
# parfaitement avec ceux de la V1. »
# Le défaut vu par l'utilisateur devient un contrôle chiffré : chaque planche ou décor de la bible est comparé au style de la V1
# (3D façon Pixar, proportions réalistes) et à celui de l'ancienne troupe (caricature, grosses têtes, rendu peint), et n'entre
# dans la bible que s'il est du côté V1, avec une marge.
# GREFFE : DINOv2-small (Meta, Apache-2.0, déjà dans le cache de la machine) — descripteurs d'image sans étiquettes, sensibles
# à la texture et au rendu ; deux familles : jeton de classe et moyenne des jetons de zone. Le juge est un centroïde par style,
# calibré sur NOS images ; sa justesse est mesurée en « laisser-un-dehors » avant tout usage.
#   python3 style_v1.py calibre REF.json SORTIE.json     REF.json : {"v1": [images…], "troupe": [images…], "type": "figure|decor"}
#   python3 style_v1.py juge CALIB.json IMAGE…            → score (> 0 : côté V1) et décision
import json, os, sys
import numpy as np
from PIL import Image

_M = {}


def _modele():
    if 'm' not in _M:
        import torch
        from transformers import AutoImageProcessor, AutoModel
        _M['p'] = AutoImageProcessor.from_pretrained('facebook/dinov2-small', local_files_only=True)
        _M['m'] = AutoModel.from_pretrained('facebook/dinov2-small', local_files_only=True).eval(); _M['t'] = torch
    return _M['p'], _M['m'], _M['t']


def _image(chemin):
    im = Image.open(chemin)
    if im.mode in ('RGBA', 'LA'):   # figures détourées : posées sur blanc, comme les planches
        fond = Image.new('RGBA', im.size, (255, 255, 255, 255)); fond.alpha_composite(im.convert('RGBA')); im = fond
    return im.convert('RGB')


def descripteur(chemin):
    p, m, t = _modele()
    with t.no_grad():
        h = m(**p(images=_image(chemin), return_tensors='pt')).last_hidden_state[0].numpy()
    v = np.concatenate([h[0] / np.linalg.norm(h[0]), h[1:].mean(0) / np.linalg.norm(h[1:].mean(0))])
    return v / np.linalg.norm(v)


def _score(v, c):  # > 0 : plus près de la V1 que de la troupe (différence de cosinus)
    return float(v @ c['v1'] - v @ c['troupe'])


def calibre(ref, sortie):
    R = json.load(open(ref, encoding='utf-8')); X = {k: [descripteur(f) for f in R[k]] for k in ('v1', 'troupe')}
    bons = 0; scores = {'v1': [], 'troupe': []}
    for k in X:   # laisser-un-dehors : chaque image jugée par les centroïdes calculés sans elle
        for i, v in enumerate(X[k]):
            c = {kk: np.mean([w for j, w in enumerate(X[kk]) if not (kk == k and j == i)], 0) for kk in X}
            c = {kk: cc / np.linalg.norm(cc) for kk, cc in c.items()}
            s = _score(v, c); scores[k].append(s); bons += (s > 0) == (k == 'v1')
    n = sum(len(x) for x in X.values())
    c = {k: (np.mean(X[k], 0) / np.linalg.norm(np.mean(X[k], 0))).tolist() for k in X}
    # seuil d'entrée dans la bible : au-dessus du pire score de la troupe ET au moins au 10e centile de la V1
    seuil = max(max(scores['troupe']), float(np.percentile(scores['v1'], 10)) * 0.5)
    C = {'type': R.get('type'), 'v1': c['v1'], 'troupe': c['troupe'], 'seuil': seuil,
         'justesse_lod': round(bons / n, 3), 'n': {k: len(X[k]) for k in X},
         'scores_lod': {k: [round(min(scores[k]), 3), round(float(np.median(scores[k])), 3), round(max(scores[k]), 3)] for k in scores}}
    json.dump(C, open(sortie, 'w'), indent=1); return {k: C[k] for k in ('type', 'justesse_lod', 'n', 'scores_lod', 'seuil')}


def juge(calib, chemins):
    C = json.load(open(calib)); c = {k: np.array(C[k]) for k in ('v1', 'troupe')}
    return [{'image': os.path.basename(f), 'score': round(_score(descripteur(f), c), 3),
             'style_v1': _score(descripteur(f), c) >= C['seuil']} for f in chemins]


if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == 'calibre': print(json.dumps(calibre(a[1], a[2]), ensure_ascii=False, indent=1))
    elif a and a[0] == 'juge': print(json.dumps(juge(a[1], a[2:]), ensure_ascii=False, indent=1))
    else: print(open(__file__, encoding='utf-8').read().split('import json')[0])
