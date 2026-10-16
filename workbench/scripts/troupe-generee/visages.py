# BIBLIOTHÈQUE DE VISAGES PAR ACTEUR (LivePortrait, KwaiVGI, MIT — code et poids) : 5 ouvertures de bouche × 3 états
# d'yeux, calculés UNE fois par image de scène et réutilisés dans toutes les vidéos tournées dans cette scène.
# python3  (environnement avec torch : LivePortrait / EasyOCR) visages.py prep/chambre
import json, os, sys, time, numpy as np, cv2
sys.path.insert(0, '/home/user/Add-a-README-file/workbench/scripts/blenderfilm')
import liveface
d = sys.argv[1]; S = json.load(open(f'{d}/scene.json'))
img = cv2.cvtColor(cv2.imread(f'{d}/image.png'), cv2.COLOR_BGR2RGB)
eng = None
for a in S['acteurs']:
    if not a.get('visage'): print('pas de visage', a['nom']); continue
    x0, y0, x1, y1 = a['bbox']
    pad = 20; x0, y0 = max(0, x0 - pad), max(0, y0 - pad); x1, y1 = min(img.shape[1], x1 + pad), min(img.shape[0], y1 + pad)
    crop = img[y0:y1, x0:x1]; rgba = np.dstack([crop, np.full(crop.shape[:2], 255, np.uint8)])
    v = a['visage']; sh = lambda p: [p[0] - x0, p[1] - y0]
    face = {'eyes': [{'c': sh(e['c'])} for e in v['eyes']], 'seam': sh(v['seam']), 'nose': sh(v['nose']), 'mouthWidth': v['mouthWidth']}
    out = f"{d}/visages/{a['slug']}"
    if eng is None: eng = liveface.Engine()
    t = time.time(); files, meta = liveface.library(eng, rgba, face, out)
    json.dump({'origine': [x0, y0], 'taille': [x1 - x0, y1 - y0]}, open(f'{out}/cadre.json', 'w'))
    print(a['nom'], len(files), 'états', round(time.time() - t), 's', 'bouche ouverte au repos' if meta['bouche_dessinee_ouverte'] else '', flush=True)
