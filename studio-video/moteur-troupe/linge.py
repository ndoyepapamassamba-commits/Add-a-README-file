# LINGE QUI FLOTTE (18/10/2026, v34) — porte L de la v32 : JEV jugeait le fond de la cour « mort » sur 23 secondes (0,2 à
# 0,5) alors que le décor a une corde à linge pleine et un rideau à la porte. Cause mesurée : la couche « tissu » de
# decor_vivant ne gardait, dans les cases que JEV étiquette « linge, rideau » (0,9–1,0), que les bords saturés — la serviette
# blanche, l'intérieur des serviettes et la moitié du rideau ne bougeaient pas, et les morceaux qui bougeaient ondulaient
# chacun pour soi (« caoutchouc »).
# Greffe : chaque pièce de tissu est DÉTOURÉE par SAM 2.1 (Meta, Apache-2.0, modèle « tiny » par transformers, sans
# torchvision : prétraitement de sa configuration refait ici), invité par des graines posées dans les cases « tissu » de JEV ;
# le mur derrière est reconstitué par LaMa (plaque.remplit_progressif) ; à l'image, chaque pièce est une couche ÉPINGLÉE EN
# HAUT (sur la corde, à la tringle) qui se balance d'autant plus qu'on descend, avec une onde qui la parcourt et les rafales
# communes du vent — la pièce entière bouge, rien ne s'étire hors d'elle.
#   prepare(d, plaque, masques) → L (cache <scène>/linge.npz) ou None ; compose(L, plaque, t) → plaque du temps t
import json, os
import numpy as np, cv2

SAM = 'facebook/sam2.1-hiera-tiny'
SCORE_MIN = 0.7            # confiance de SAM (IoU prédite) : les morceaux de mur trouvés par erreur sont à 0,00–0,04
COLS, ROWS = 8, 7          # grille des étiquettes de JEV (decor_vivant.etiquettes_jev)


def _sam():
    import torch
    from huggingface_hub import snapshot_download
    from transformers import Sam2Model
    motifs = ['config.json', 'model.safetensors']
    try: p = snapshot_download(SAM, allow_patterns=motifs, local_files_only=True)
    except Exception: p = snapshot_download(SAM, allow_patterns=motifs)
    return torch, Sam2Model.from_pretrained(p).eval()


def detoure(plaque, graines):
    """SAM 2.1 : pour chaque graine (x, y), trois masques candidats (H × W, bool) et leurs confiances."""
    torch, mod = _sam(); H, W = plaque.shape[:2]
    x_ = cv2.resize(plaque, (1024, 1024), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255
    x_ = (x_ - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    pv = torch.from_numpy(x_.transpose(2, 0, 1)[None].copy())
    pts = torch.tensor([[[[x * 1024 / W, y * 1024 / H]] for x, y in graines]], dtype=torch.float32)
    with torch.no_grad():
        out = mod(pixel_values=pv, input_points=pts, input_labels=torch.ones((1, len(graines), 1), dtype=torch.int64), multimask_output=True)
    lo = out.pred_masks[0].numpy(); sc = out.iou_scores[0].numpy()
    return [[cv2.resize(lo[i, j], (W, H), interpolation=cv2.INTER_LINEAR) > 0 for j in range(lo.shape[1])] for i in range(lo.shape[0])], sc


def prepare(d, plaque, masques=(), journal=print):
    f = f'{d}/linge.npz'
    if os.path.isfile(f):
        z = np.load(f); L = {k: z[k] for k in z.files}
        return L if len(L['pieces']) else None
    H, W = plaque.shape[:2]; P = json.load(open(f'{d}/vie.json')) if os.path.isfile(f'{d}/vie.json') else {}
    cw, ch = W // COLS, H // ROWS; reg = np.zeros((H, W), np.uint8)
    for r in range(ROWS):
        for c in range(COLS):
            if P.get(f'c{r}_{c}', {}).get('tissu', 0) > 0.5: reg[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = 1
    act = np.zeros((H, W), bool)
    for m in masques: act |= (m if m.ndim == 2 else m[..., 0]) > 0.3 * max(1e-6, float(m.max()))
    pieces = []
    if reg.any():
        pas = 40; graines = [(x, y) for y in range(pas // 2, H, pas) for x in range(pas // 2, W, pas) if reg[y, x] and not act[y, x]]
        if graines:
            mk, sc = detoure(plaque, graines)
            zone = cv2.dilate(reg, np.ones((ch // 2 | 1, cw // 2 | 1), np.uint8)) > 0
            lab = cv2.cvtColor(plaque, cv2.COLOR_RGB2LAB).astype(np.float32)
            for i in range(len(graines)):
                for j in np.argsort(-sc[i]):
                    m = mk[i][j]; A = int(m.sum())
                    if sc[i, j] < SCORE_MIN or A < 0.0008 * H * W or A > 0.05 * H * W: continue
                    ys, xs = np.nonzero(m); bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
                    if min(bw, bh) < 12 or A / (bw * bh) < 0.35: continue            # la corde, un fil : pas une pièce
                    if (m & zone).sum() < 0.6 * A or (m & act).sum() > 0.6 * A: continue   # en partie derrière un acteur : il la couvre
                    if float(np.median(cv2.cvtColor(plaque, cv2.COLOR_RGB2HSV)[..., 2][m])) < 45: continue   # embrasure, ombre : pas du tissu
                    anneau = cv2.dilate(m.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool) & ~m
                    if float(np.linalg.norm(lab[m].mean(0) - lab[anneau].mean(0))) < 15: continue   # même couleur que le mur
                    if any((m & p).sum() > 0.5 * min(A, int(p.sum())) for p in pieces): break
                    pieces.append(m); break
    if not pieces:
        np.savez_compressed(f, pieces=np.zeros((0, 4), np.float32)); journal('linge : aucune pièce de tissu'); return None
    lab_ = np.zeros((H, W), np.uint8); boites = []
    for k, m in enumerate(sorted(pieces, key=lambda m: np.nonzero(m)[0].min()), 1):
        lab_[m] = k; ys, xs = np.nonzero(m); boites.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    import plaque as PQ
    fond = PQ.remplit_progressif(plaque, cv2.dilate((lab_ > 0).astype(np.uint8), np.ones((9, 9), np.uint8)))
    rng = np.random.default_rng(17); n = len(boites)
    L = dict(lab=lab_, fond=fond, pieces=np.array(boites, np.float32), f=rng.uniform(0.6, 1.0, n).astype(np.float32),
             phi=rng.uniform(0, 2 * np.pi, n).astype(np.float32), psi=np.float32(rng.uniform(0, 2 * np.pi)))
    np.savez_compressed(f, **L); journal(f'linge : {n} pièces de tissu détourées par SAM 2.1')
    return L


def compose(L, plaque, t):
    """plaque du temps t : les pièces ôtées (mur reconstitué), puis redessinées épinglées en haut, balancées par le vent."""
    out = plaque.copy(); lab = L['lab']; zone = cv2.dilate((lab > 0).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    out[zone] = L['fond'][zone]
    H, W = lab.shape; g = float(0.65 + 0.35 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * t + float(L['psi']))))   # rafales communes
    for k, (x0, y0, x1, y1) in enumerate(L['pieces'].astype(int), 1):
        bw, bh = x1 - x0, y1 - y0; A = float(np.clip(0.12 * min(bw, bh), 4.0, 14.0)); mg = int(A) + 4
        X0, Y0, X1, Y1 = max(0, x0 - mg), max(0, y0 - 2), min(W, x1 + mg), min(H, y1 + mg)
        ys, xs = np.mgrid[Y0:Y1, X0:X1].astype(np.float32)
        u = np.clip((ys - y0) / max(1, bh), 0, 1); w = u ** 1.5                 # épinglé en haut, libre en bas
        ph = 2 * np.pi * float(L['f'][k - 1]) * t + float(L['phi'][k - 1]) - 1.2 * u   # onde qui descend la pièce
        dx = A * g * w * np.sin(ph); dy = -0.12 * A * g * w * (1 - np.cos(ph))      # la pièce se soulève un peu en s'écartant
        sx, sy = (xs - dx).astype(np.float32), (ys - dy).astype(np.float32)   # cartes 32 bits (OpenCV)
        a = cv2.remap((lab == k).astype(np.float32), sx, sy, cv2.INTER_LINEAR, borderValue=0)
        a = cv2.GaussianBlur(a, (0, 0), 0.6)[..., None]
        c = cv2.remap(plaque, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
        out[Y0:Y1, X0:X1] = np.clip(out[Y0:Y1, X0:X1].astype(np.float32) * (1 - a) + c * a, 0, 255).astype(np.uint8)
    return out
