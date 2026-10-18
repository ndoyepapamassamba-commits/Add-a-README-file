# BIBLIOTHÈQUES D'EXPRESSIONS DESSINÉES D'UNE SCÈNE (17/10/2026) : pour chaque personnage, une fois, toutes les émotions
# (expressions_lp.EMO) × 4 ouvertures de bouche + yeux clos, par LivePortrait (MIT) en ONNX sur le processeur ; la recette
# de chaque émotion est cherchée pour CE visage par l'œil de JEV (expressions_lp.cherche_recette).
# Réutilisées par tous les épisodes tournés dans la scène ; tourne.py les prend si elles existent.
#   python3 prepare_expressions.py prep/cour [slug …]   (seulement ces personnages)
import json, os, sys, time
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import expressions_lp as XL

d = sys.argv[1]; S = json.load(open(f'{d}/scene.json')); img = cv2.cvtColor(cv2.imread(f'{d}/image.png'), cv2.COLOR_BGR2RGB)
seuls = set(sys.argv[2:])
for a in S['acteurs']:
    if seuls and a['slug'] not in seuls: continue
    f3 = f"{d}/rig/visage3d-{a['slug']}.npy"
    if not os.path.isfile(f3): print(a['nom'], ': visage non lu (préparer la scène avec prepare_rig.py)'); continue
    fa = f"{d}/rig/alpha-{a['slug']}.png"   # garde de silhouette (18/10/2026) : la mâchoire ne sort pas de la découpe dessinée
    al = cv2.imread(fa, cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535 if os.path.isfile(fa) else None
    t0 = time.time(); meta = XL.bibliotheque(img, np.load(f3), f"{d}/expressions/{a['slug']}", journal=lambda m: print(a['nom'], m.strip(), flush=True) if 'garde' in m else None, alpha=al)
    J = meta['jev']; autre = [e for e in meta['emotions'] if e != 'neutre' and meta['recettes'][e] != XL.EMO[e]]
    print(a['nom'], len(meta['emotions']), 'émotions ×', len(meta['bouche']), 'bouches,', round(time.time() - t0), 's ; lisibilité',
          {e: J[e]['lisible'] for e in meta['emotions'] if 'lisible' in J.get(e, {})}, '; recette changée :', autre, flush=True)
