# EFFACE LE TEXTE PARASITE écrit par le générateur (enseignes, étiquettes) : EasyOCR (Apache-2.0) le repère, LaMa
# (Apache-2.0) le remplace — sur l'image de scène ET sur la plaque, hors visages des acteurs.
# python3  (environnement avec torch : LivePortrait / EasyOCR) texte.py prep/maquis
import json, sys, numpy as np, cv2, easyocr
sys.path.insert(0, '/home/user/Add-a-README-file/workbench/scripts')
import onnxruntime  # noqa (scene_layers l'importe)
from scene_layers import lama_fill
d = sys.argv[1]; S = json.load(open(f'{d}/scene.json'))
rd = easyocr.Reader(['fr', 'en'], gpu=False, model_storage_directory='/root/.cache/massamba-models/easyocr', download_enabled=False, verbose=False)
img = cv2.cvtColor(cv2.imread(f'{d}/image.png'), cv2.COLOR_BGR2RGB)
mask = np.zeros(img.shape[:2], np.uint8); found = []
faces = [a['bbox'] for a in S['acteurs']]  # rien n'est effacé sur un acteur (le « 10 » du maillot fait partie du costume)
for box, t, conf in rd.readtext(img):
    pts = np.array(box, np.int32); x0, y0 = pts.min(0); x1, y1 = pts.max(0)
    if conf < 0.3 or len(t.strip()) < 2: continue
    if any(not (x1 < f[0] or x0 > f[2] or y1 < f[1] or y0 > f[3]) for f in faces): continue
    cv2.fillPoly(mask, [pts], 1); found.append((t, round(float(conf), 2)))
if found:
    mask = cv2.dilate(mask, np.ones((11, 11), np.uint8)) * 255
    for name in ('image.png', 'plaque.png'):
        im = cv2.cvtColor(cv2.imread(f'{d}/{name}'), cv2.COLOR_BGR2RGB); out, _, _ = lama_fill(im, mask.copy())
        cv2.imwrite(f'{d}/{name}', cv2.cvtColor(out, cv2.COLOR_RGB2BGR))
S['texte_efface'] = found; json.dump(S, open(f'{d}/scene.json', 'w'), ensure_ascii=False, indent=1)
print('texte effacé :', found)
