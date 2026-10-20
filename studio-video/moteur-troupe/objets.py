# OBJETS DU DÉCOR TOUCHÉS PAR LES ACTEURS (17/10/2026) — vu sur la cour : la chaise de Baye partait avec lui (la
# segmentation « personne » la collait à son corps) et disparaissait du décor. Segmentation sémantique ADE20K (UperNet
# ConvNeXt-S, MIT, exportée en ONNX) : 150 classes, dont chaise, fauteuil, siège, banc, tabouret, canapé, table. Ce qui est
# sûrement un meuble n'est pas l'acteur : il reste dans la plaque, l'acteur bouge devant.
import json, os
import numpy as np, cv2
import onnxruntime as ort

MODELES = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models'))
SEG_H, SEG_W = 576, 1152   # entrée fixe de l'UperNet exporté
PERSONNE = 12
MEUBLES = [15, 19, 23, 30, 31, 64, 69, 75, 110]   # table, chaise, canapé, fauteuil, siège, table basse, banc, chaise pivotante, tabouret
_S = {}


def _sess():
    if 'ade' not in _S:
        f = f'{MODELES}/upernet-convnext-small-ade.onnx'
        _S['ade'] = ort.InferenceSession(f, providers=['CPUExecutionProvider']) if os.path.isfile(f) else None
    return _S['ade']


def _probas_brutes(img):
    """probabilités ADE20K (150 × h' × w', au quart de la résolution d'entrée du réseau) ; None si le modèle manque."""
    s = _sess()
    if s is None: return None
    H, W = img.shape[:2]; k = min(SEG_W / W, SEG_H / H); w, h = max(32, round(W * k)), max(32, round(H * k))
    x = cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    x = np.pad(x, ((0, SEG_H - h), (0, SEG_W - w), (0, 0)), mode='reflect')
    lg = s.run(None, {'pixel_values': x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
    lg = lg[:, :max(1, h * lg.shape[1] // SEG_H), :max(1, w * lg.shape[2] // SEG_W)]
    m = lg.max(0, keepdims=True); e = np.exp(lg - m); return e / e.sum(0, keepdims=True)


def probas(img, classes):
    """probabilités ADE20K des classes demandées (somme par groupe) à la taille de l'image. img : RGB uint8.
    classes : {nom: [indices]} → {nom: carte float32 H × W} (None si le modèle manque)."""
    p = _probas_brutes(img)
    if p is None: return None
    H, W = img.shape[:2]
    return {n: cv2.resize(p[idx].sum(0).astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR) for n, idx in classes.items()}


def classes(img):
    """classe ADE20K la plus probable de chaque pixel (uint8, H × W) et sa probabilité ; (None, None) sans modèle."""
    p = _probas_brutes(img)
    if p is None: return None, None
    H, W = img.shape[:2]
    return (cv2.resize(p.argmax(0).astype(np.uint8), (W, H), interpolation=cv2.INTER_NEAREST),
            cv2.resize(p.max(0).astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR))


def meubles(img):
    """(meuble, personne) : probabilité qu'un pixel soit un meuble / une personne (ADE20K)."""
    P = probas(img, {'meuble': MEUBLES, 'personne': [PERSONNE]})
    return (None, None) if P is None else (P['meuble'], P['personne'])


def noms():
    f = f'{MODELES}/upernet-convnext-small-ade.labels.json'
    return json.load(open(f)) if os.path.isfile(f) else []
