"""Prépare l'« univers animé » de chaque vignette : personnages, véhicules, ciel, arbres, mer.

Pour chaque vignette agrandie (assets/tiles/NN.webp) :
 1. Détourage panoptique (Mask2Former, COCO) : chaque personne, voiture, bus, moto, vélo, bateau
    devient une découpe, et l'on repère le ciel, les arbres et l'eau.
 2. Reconstruction du décor derrière les découpes (LaMa, Apache-2.0, ONNX).
 3. Écrit : assets/anim/NN-fond.webp (décor reconstruit), NN-decoupes.webp (découpes avec transparence, en atlas),
    NN-ambiance.png (R = ciel, G = arbres, B = eau) et assets/anim.json (position, profondeur et
    mouvement de chaque découpe).

Usage :
    python tools/prepare_anim.py <dossier mask2former-swin-tiny-coco-panoptic> <lama_fp32.onnx> [--assets assets/scenes]
                                 [--pose <dossier vitpose-base-simple>] [--sam <dossier SlimSAM-uniform-77>] [i ...]
En intérieur (pas de rue ni de ciel), les personnes restent à leur place : assises, elles respirent et se
balancent ; debout, elles se balancent et font de petits pas ; une main levée s'agite.
--pose : squelette de chaque personne (ViTPose, Apache-2.0), utilisé par le studio pour l'animation articulée,
et pour emporter avec la main ce qu'elle tient (craie, stylo, téléphone…) que la segmentation n'a pas reconnu.
--sam (avec --pose) : un bras levé oublié par la segmentation est découpé par SAM (SlimSAM, Apache-2.0),
guidé par le coude et le poignet.
Dépendances : torch (CPU), transformers, onnxruntime, numpy, pillow, opencv-python-headless, scipy.
"""
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
import torch
from PIL import Image
from scipy import ndimage
from transformers import AutoImageProcessor, Mask2FormerForUniversalSegmentation

ROOT = Path(__file__).resolve().parent.parent
MOVING = {'person': 'pieton', 'car': 'vehicule', 'bus': 'vehicule', 'truck': 'vehicule',
          'motorcycle': 'deux-roues', 'bicycle': 'deux-roues', 'boat': 'bateau'}
SKY = {'sky-other-merged'}
TREES = {'tree-merged', 'grass-merged'}
WATER = {'sea', 'water-other', 'river'}
ATLAS_W = 2048


def segment(proc, model, img):
    """Segmentation panoptique à mi-résolution ; renvoie la carte d'identifiants et les segments."""
    small = img.resize((img.width // 2, img.height // 2), Image.BICUBIC)
    with torch.no_grad():
        out = model(**proc(images=small, return_tensors='pt'))
    r = proc.post_process_panoptic_segmentation(out, target_sizes=[small.size[::-1]], threshold=0.5, label_ids_to_fuse=set())[0]
    seg = cv2.resize(r['segmentation'].numpy().astype(np.int32), img.size, interpolation=cv2.INTER_NEAREST)
    return seg, [(s['id'], model.config.id2label[s['label_id']], s['score']) for s in r['segments_info']]


def _lama(session, img, mask):
    """Un passage LaMa sur une image 512×512 (img uint8, mask bool). Renvoie uint8."""
    out = session.run(None, {'image': (img.astype(np.float32) / 255).transpose(2, 0, 1)[None],
                             'mask': mask.astype(np.float32)[None, None]})[0][0].transpose(1, 2, 0)
    return np.clip(out, 0, 255).astype(np.uint8)


def lama_fill(session, rgb, mask):
    """Reconstruit le décor sous le masque.
    Grands trous (bus, files de voitures) : passage global sur l'image réduite à 512 px (plus de contexte).
    Petits trous (piétons) : fenêtres 512×512 à pleine résolution (plus de détail)."""
    h, w = mask.shape
    P = 512
    # Passage global : image réduite (aspect conservé), complétée par réflexion jusqu'à 512×512.
    k = P / max(w, h)
    sw, sh = round(w * k), round(h * k)
    small = cv2.resize(rgb, (sw, sh), interpolation=cv2.INTER_AREA)
    small_m = cv2.resize(mask.astype(np.uint8), (sw, sh), interpolation=cv2.INTER_NEAREST) > 0
    pad = ((0, P - sh), (0, P - sw))
    g = _lama(session, np.pad(small, pad + ((0, 0),), mode='reflect'), np.pad(small_m, pad, mode='constant'))[:sh, :sw]
    global_fill = cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)

    labels, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    big = np.isin(labels, [j + 1 for j, a in enumerate(sizes) if a > w * h * 0.012])
    out = rgb.copy()
    out[big] = global_fill[big]

    # Fenêtres locales pour les petits trous ; chaque fenêtre ne remplit que ce qui reste à faire.
    todo_all = mask & ~big
    xs = sorted({0, max(0, w - P)} | set(range(0, max(1, w - P), 384)))
    ys = sorted({0, max(0, h - P)} | set(range(0, max(1, h - P), 384)))
    for y in ys:
        for x in xs:
            todo = todo_all[y:y + P, x:x + P]
            if not todo.any():
                continue
            crop = out[y:y + P, x:x + P]
            ph, pw = crop.shape[:2]
            if ph < P or pw < P:  # image plus petite que la fenêtre : complétée par réflexion
                crop = np.pad(crop, ((0, P - ph), (0, P - pw), (0, 0)), mode='reflect')
                tm = np.pad(todo, ((0, P - ph), (0, P - pw)), mode='constant')
            else:
                tm = todo
            res = _lama(session, crop, tm)[:ph, :pw]
            region = out[y:y + P, x:x + P]
            region[todo] = res[todo]
            todo_all[y:y + P, x:x + P] &= ~todo
    return out


def vanishing_point(seg, segments, w, h):
    """Point de fuite approximatif : centre horizontal, à hauteur du haut de la chaussée."""
    road = np.zeros((h, w), bool)
    for sid, name, _ in segments:
        if name in ('road', 'pavement-merged', 'sand', 'dirt-merged', 'gravel'):
            road |= seg == sid
    rows = np.where(road.mean(1) > 0.15)[0]
    vy = float(rows.min()) if len(rows) else h * 0.42
    return [w / 2, max(h * 0.25, min(h * 0.6, vy))]


# Objets que l'on porte : un segment de ces classes collé à une personne part avec elle.
HANDHELD = {'book', 'cell phone', 'cup', 'bottle', 'umbrella', 'handbag', 'backpack', 'tie', 'knife', 'fork', 'spoon',
            'scissors', 'toothbrush', 'remote', 'baseball bat', 'tennis racket', 'kite', 'frisbee', 'sports ball',
            'wine glass', 'banana', 'apple', 'orange', 'teddy bear', 'baseball glove', 'suitcase', 'hair drier'}
# Seulement s'ils sont dans une main (un livre ouvert est souvent pris pour un ordinateur portable).
HELD_IF_IN_HAND = {'laptop', 'keyboard', 'mouse', 'bowl', 'vase', 'potted plant'}


def estimate_poses(pose_model, img, boxes):
    """17 points COCO [x, y, score] par boîte [x, y, l, h] (ViTPose)."""
    proc, model = pose_model
    with torch.no_grad():
        out = model(**proc(img, boxes=[boxes], return_tensors='pt'))
    res = proc.post_process_pose_estimation(out, boxes=[boxes])[0]
    return [[[round(float(x), 1), round(float(y), 1), round(float(sc), 2)] for (x, y), sc in zip(r['keypoints'].numpy(), r['scores'].numpy())]
            for r in res]


def _seg_dist(xx, yy, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = np.clip(((xx - a[0]) * dx + (yy - a[1]) * dy) / max(1e-6, dx * dx + dy * dy), 0, 1)
    return np.hypot(xx - a[0] - t * dx, yy - a[1] - t * dy)


def sam_embed(sam, img):
    proc, model = sam
    with torch.no_grad():
        return model.get_image_embeddings(proc(img, return_tensors='pt')['pixel_values'])


def sam_arms(sam, img, emb, m, pose, others):
    """Bras oubliés par la segmentation (un bras levé devant une fenêtre…) : SAM, guidé par le coude et le poignet,
    découpe le bras et la main ; on garde ce qui reste dans le couloir des os et touche la personne."""
    proc, model = sam
    h, w = m.shape
    add = np.zeros_like(m)
    area = m.sum()
    ok = lambda i: pose[i][2] >= 0.3
    for sh, el, wr in ((5, 7, 9), (6, 8, 10)):
        if not (ok(el) and ok(wr)):
            continue
        e, wv = np.array(pose[el][:2]), np.array(pose[wr][:2])
        v = wv - e
        L = float(np.linalg.norm(v))
        if L < 8:
            continue
        pts = [e.tolist(), (e + 0.5 * v).tolist(), wv.tolist(), (wv + 0.4 * v).tolist()]
        if ok(sh):  # le haut du bras aussi : sinon l'avant-bras peut rester séparé du corps
            pts.insert(0, ((np.array(pose[sh][:2]) + e) / 2).tolist())
        pts = [pts]
        ip = proc(img, input_points=[pts], return_tensors='pt')
        with torch.no_grad():
            o = model(image_embeddings=emb, input_points=ip['input_points'], multimask_output=True)
        masks = proc.image_processor.post_process_masks(o.pred_masks, ip['original_sizes'], ip['reshaped_input_sizes'])[0][0].numpy()
        sm = masks[int(o.iou_scores[0, 0].argmax())]
        segs = [(e, wv + 1.0 * v, 0.6 * L)]
        if ok(sh):
            a = np.array(pose[sh][:2])
            segs.append((a, e, 0.5 * max(L, float(np.linalg.norm(e - a)))))
        pts_ = np.array([q for a_, b_, _ in segs for q in (a_, b_)])
        rmax = max(r for *_, r in segs)
        x0, y0 = np.floor(pts_.min(0) - rmax).astype(int)
        x1, y1 = np.ceil(pts_.max(0) + rmax).astype(int) + 1
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
        if x1 - x0 < 4 or y1 - y0 < 4:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        inside = np.min([_seg_dist(xx, yy, a_, b_) / r for a_, b_, r in segs], axis=0) <= 1
        mm = m[y0:y1, x0:x1]
        cand = sm[y0:y1, x0:x1] & inside & ~mm & ~others[y0:y1, x0:x1]
        lbl, n = ndimage.label(cand)
        touch = cv2.dilate(mm.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        # Bras qui passe derrière un voisin (il ne touche pas le corps à l'image) : on l'accepte si l'épaule est
        # sur la personne ou tout près (elle-même peut être cachée) et que la tache contient le poignet.
        shoulder_on = False
        if ok(sh):
            sx, sy = int(round(pose[sh][0])), int(round(pose[sh][1]))
            r = int(max(6, 0.5 * np.hypot(pose[el][0] - pose[sh][0], pose[el][1] - pose[sh][1])))
            shoulder_on = m[max(0, sy - r):sy + r + 1, max(0, sx - r):sx + r + 1].any()
        near_wrist = np.hypot(xx - wv[0], yy - wv[1]) <= max(4.0, 0.2 * L)
        for k in range(1, n + 1):
            comp = lbl == k
            linked = (comp & touch).sum() >= 4 or (shoulder_on and (comp & near_wrist).any())
            if linked and comp.sum() < 0.35 * area:
                add[y0:y1, x0:x1] |= comp
    return add


def held_objects(m, pose, lab, others):
    """Pixels tenus en main que la segmentation a laissés au décor : au bout de chaque avant-bras, les taches
    qui tranchent sur un fond uni et touchent la main (craie sur le tableau, stylo, téléphone…)."""
    h, w = m.shape
    add = np.zeros_like(m)
    near = cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0  # contact direct avec la main
    area = m.sum()
    for el, wr in ((7, 9), (8, 10)):
        if pose[wr][2] < 0.3 or pose[el][2] < 0.3:
            continue
        (ex, ey), (wx, wy) = pose[el][:2], pose[wr][:2]
        vx, vy = wx - ex, wy - ey
        L = float(np.hypot(vx, vy))
        if L < 6:
            continue
        cx, cy, R = wx + 0.4 * vx, wy + 0.4 * vy, 1.1 * L
        x0, x1 = int(max(0, cx - R)), int(min(w, cx + R + 1))
        y0, y1 = int(max(0, cy - R)), int(min(h, cy + R + 1))
        if x1 - x0 < 4 or y1 - y0 < 4:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        dist = np.hypot(xx - cx, yy - cy)
        free = (dist <= R) & ~m[y0:y1, x0:x1] & ~others[y0:y1, x0:x1]
        ring = free & (dist >= 0.75 * R)
        if ring.sum() < 30:
            continue
        sub = lab[y0:y1, x0:x1].astype(np.float32)
        ref = np.median(sub[ring], axis=0)
        dist_ref = np.linalg.norm(sub - ref, axis=-1)
        if np.percentile(dist_ref[ring], 80) > 18:
            continue  # fond trop varié (affiches, fenêtre…) : on ne saurait pas distinguer un objet tenu
        sal = free & (dist_ref > 32)
        lbl, n = ndimage.label(sal)
        touch = near[y0:y1, x0:x1]
        for k in range(1, n + 1):
            comp = lbl == k
            if (comp & touch).sum() >= 4 and comp.sum() < 0.05 * area:
                add[y0:y1, x0:x1] |= comp
    return add


def posture(m):
    """Posture d'une personne d'après sa silhouette : (« debout » | « assis », main levée ?)."""
    ys, xs = np.where(m)
    h, w = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
    widths = m[ys.min():ys.max() + 1].sum(1)
    top = widths[: max(2, int(h * 0.12))]
    raised = bool(np.median(top) < 0.22 * widths.max())  # pointe étroite au-dessus de la tête : bras levé
    return ('debout' if h / max(1, w) > 2.1 else 'assis'), raised


def main():
    flags = sys.argv[1:]
    assets = ROOT / 'assets'
    if '--assets' in flags:
        k = flags.index('--assets')
        assets = (Path.cwd() / flags[k + 1]).resolve()
        flags = flags[:k] + flags[k + 2:]
    pose_model = None
    if '--pose' in flags:
        k = flags.index('--pose')
        from transformers import AutoProcessor, VitPoseForPoseEstimation
        pose_model = (AutoProcessor.from_pretrained(flags[k + 1]), VitPoseForPoseEstimation.from_pretrained(flags[k + 1]).eval())
        flags = flags[:k] + flags[k + 2:]
    sam = None
    if '--sam' in flags:
        k = flags.index('--sam')
        from transformers import SamModel, SamProcessor
        sam = (SamProcessor.from_pretrained(flags[k + 1]), SamModel.from_pretrained(flags[k + 1]).eval())
        flags = flags[:k] + flags[k + 2:]
    m2f_dir, lama_path = flags[0], flags[1]
    torch.set_num_threads(4)
    proc = AutoImageProcessor.from_pretrained(m2f_dir)
    model = Mask2FormerForUniversalSegmentation.from_pretrained(m2f_dir).eval()
    lama = ort.InferenceSession(lama_path, providers=['CPUExecutionProvider'])
    meta = json.loads((assets / 'meta.json').read_text())
    depth_atlas = np.asarray(Image.open(assets / 'depth-atlas.png'), np.float32) / 255
    dm = meta['depth']
    out_dir = assets / 'anim'
    out_dir.mkdir(exist_ok=True)
    only = {int(a) for a in flags[2:]} if len(flags) > 2 else None
    anim_path = assets / 'anim.json'
    anim = json.loads(anim_path.read_text()) if anim_path.exists() and only else {'tiles': {}}
    rng = np.random.default_rng(7)
    t0 = time.time()

    for tile in meta['tiles']:
        i = tile['i']
        if only is not None and i not in only:
            continue
        img = Image.open(assets / tile['up']['file']).convert('RGB')
        rgb = np.asarray(img)
        h, w = rgb.shape[:2]
        sx, sy = w / tile['rect'][2], h / tile['rect'][3]
        cap = np.zeros((h, w), bool)
        if tile['caption']:
            cx, cy, cw, ch = tile['caption']
            cap[int(cy * sy) - 6:, :int((cx + cw) * sx) + 6] = True
        # profondeur de la vignette, à pleine résolution
        r, c = divmod(i, dm['cols'])
        d_tile = depth_atlas[r * dm['tileH']:(r + 1) * dm['tileH'], c * dm['tileW']:(c + 1) * dm['tileW']]
        depth = cv2.resize(d_tile, (w, h), interpolation=cv2.INTER_LINEAR)

        seg, segments = segment(proc, model, img)
        vp = vanishing_point(seg, segments, w, h)
        outdoor_px = sum((seg == sid).sum() for sid, name, _ in segments
                         if name in ('road', 'pavement-merged', 'sand', 'dirt-merged', 'gravel', 'sky-other-merged', 'sea'))
        outdoor = outdoor_px > w * h * 0.04

        sprites, holes = [], np.zeros((h, w), bool)
        ambiance = np.zeros((h // 2, w // 2, 3), np.uint8)
        masks = {sid: seg == sid for sid, name, _ in segments if name in MOVING or name in HANDHELD or name in HELD_IF_IN_HAND}
        persons = [sid for sid, name, _ in segments if name == 'person']
        things = np.zeros((h, w), bool)
        for mm in masks.values():
            things |= mm
        poses = {}
        if pose_model is not None:
            cand = []
            for sid in persons:
                mm = masks[sid]
                ar = mm.sum()
                if ar < w * h * 0.0012 or (mm & cap).sum() > ar * 0.1:
                    continue
                ys, xs = np.where(mm)
                # boîte élargie (surtout vers le haut) : un bras levé oublié par le masque y reste
                bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
                bx0, by0 = max(0, xs.min() - 0.2 * bw), max(0, ys.min() - 0.3 * bh)
                bx1, by1 = min(w - 1, xs.max() + 0.2 * bw), min(h - 1, ys.max() + 0.05 * bh)
                cand.append((sid, [float(bx0), float(by0), float(bx1 - bx0 + 1), float(by1 - by0 + 1)]))
            if cand:
                for (sid, _), pz in zip(cand, estimate_poses(pose_model, img, [b for _, b in cand])):
                    poses[sid] = pz
        # Objets portés : un objet que tient un poignet (squelette) part avec la personne ; sans squelette,
        # chaque objet de la liste HANDHELD rejoint la personne qu'il touche le plus.
        for sid, name, _ in segments:
            if (name not in HANDHELD and name not in HELD_IF_IN_HAND) or not persons:
                continue
            owner = None
            if poses:
                ys_, xs_ = np.where(masks[sid])
                for p_, pz in poses.items():
                    if name in HELD_IF_IN_HAND and len(xs_) > 0.15 * masks[p_].sum():
                        continue  # trop grand pour être tenu (ordinateur posé sur le bureau)
                    for el, wr in ((7, 9), (8, 10)):
                        if pz[wr][2] < 0.3:
                            continue
                        reach = 0.6 * np.hypot(pz[wr][0] - pz[el][0], pz[wr][1] - pz[el][1]) if pz[el][2] >= 0.3 else 10
                        if np.min(np.hypot(xs_ - pz[wr][0], ys_ - pz[wr][1])) <= max(8, reach):
                            owner = p_
                    if owner is not None:
                        break
            elif name in HANDHELD:
                ring = cv2.dilate(masks[sid].astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
                c, p_ = max((int((ring & masks[q]).sum()), q) for q in persons)
                owner = p_ if c > 0 else None
            if owner is not None:
                masks[owner] = masks[owner] | masks[sid]
        if pose_model is not None:
            lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
            emb = sam_embed(sam, img) if sam is not None and poses else None
            for sid, pz in poses.items():
                if emb is not None:
                    masks[sid] = masks[sid] | sam_arms(sam, img, emb, masks[sid], pz, things & ~masks[sid])
                masks[sid] = masks[sid] | held_objects(masks[sid], pz, lab, things & ~masks[sid])
        for sid, name, score in segments:
            if name in HANDHELD or name in HELD_IF_IN_HAND:
                continue
            m = masks.get(sid, seg == sid)
            if name in SKY | TREES | WATER:
                ch_idx = 0 if name in SKY else 1 if name in TREES else 2
                small = cv2.resize((m & ~cap).astype(np.uint8) * 255, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
                ambiance[..., ch_idx] = np.maximum(ambiance[..., ch_idx], small)
                continue
            kind = MOVING.get(name)
            if not kind:
                continue
            area = m.sum()
            if area < w * h * 0.0012 or (m & cap).sum() > area * 0.1:
                continue
            ys, xs = np.where(m)
            x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
            if (x1 - x0) < 8 or (y1 - y0) < 8:
                continue
            holes |= m
            pad = 3
            x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
            x1, y1 = min(w - 1, x1 + pad), min(h - 1, y1 + pad)
            alpha = cv2.GaussianBlur(cv2.dilate(m.astype(np.uint8) * 255, np.ones((3, 3), np.uint8)), (0, 0), 1.0)
            cut = np.dstack([rgb, alpha])[y0:y1 + 1, x0:x1 + 1]
            foot = [float((xs[ys >= y1 - 3 - pad].mean()) if (ys >= y1 - 3 - pad).any() else (x0 + x1) / 2), float(y1 - pad)]
            d = float(np.median(depth[m]))
            # Mouvement : véhicules et deux-roues suivent la route vers le point de fuite (voie de droite :
            # ils s'éloignent ; voie de gauche : ils approchent) ; piétons : marche latérale ; bateaux : tangage.
            if kind in ('vehicule', 'deux-roues'):
                away = foot[0] >= vp[0]
                speed = (0.035 if kind == 'vehicule' else 0.055) * (0.8 + 0.4 * rng.random())
                move = {'type': 'route', 'sens': 'eloigne' if away else 'approche', 'vitesse': round(speed, 3)}
            elif kind == 'pieton' and outdoor:
                move = {'type': 'marche', 'dir': int(rng.choice([-1, 1])), 'vitesse': round(0.14 + 0.12 * rng.random(), 3),
                        'phase': round(float(rng.random()) * 6.28, 2)}
            elif kind == 'pieton':  # intérieur : la personne reste à sa place et vit
                pose, raised = posture(m)
                move = {'type': 'vie', 'posture': pose, 'leve': raised, 'phase': round(float(rng.random()) * 6.28, 2),
                        'amp': round(0.8 + 0.4 * float(rng.random()), 2)}
            else:
                move = {'type': 'tangage', 'phase': round(float(rng.random()) * 6.28, 2)}
            sprites.append({'classe': name, 'genre': kind, 'cut': cut, 'rect': [int(x0), int(y0), int(x1 - x0 + 1), int(y1 - y0 + 1)],
                            'pied': [round(foot[0], 1), round(foot[1], 1)], 'profondeur': round(d, 3), 'mouvement': move})
            if sid in poses:
                sprites[-1]['pose'] = poses[sid]

        # Décor reconstruit derrière les découpes.
        hole_mask = cv2.dilate(holes.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0  # franges des silhouettes incluses
        hole_mask &= ~cap
        bg = lama_fill(lama, rgb, hole_mask) if hole_mask.any() else rgb
        Image.fromarray(bg).save(out_dir / f'{i + 1:02d}-fond.webp', quality=90, method=6)
        amb = cv2.GaussianBlur(ambiance, (0, 0), 2.0)
        Image.fromarray(amb).save(out_dir / f'{i + 1:02d}-ambiance.png', optimize=True)

        # Atlas des découpes (rangées simples), trié du plus loin au plus proche.
        sprites.sort(key=lambda s: s['pied'][1])
        x = y = row_h = 0
        placed = []
        for s in sprites:
            ch_, cw_ = s['cut'].shape[:2]
            if x + cw_ > ATLAS_W:
                x, y, row_h = 0, y + row_h + 2, 0
            placed.append((s, x, y))
            x += cw_ + 2
            row_h = max(row_h, ch_)
        atlas_h = max(1, y + row_h)
        atlas = np.zeros((atlas_h, ATLAS_W, 4), np.uint8)
        entries = []
        for s, ax, ay in placed:
            ch_, cw_ = s['cut'].shape[:2]
            atlas[ay:ay + ch_, ax:ax + cw_] = s['cut']
            e = {k: v for k, v in s.items() if k != 'cut'}
            e['atlas'] = [ax, ay, cw_, ch_]
            entries.append(e)
        Image.fromarray(atlas, 'RGBA').save(out_dir / f'{i + 1:02d}-decoupes.webp', quality=88, method=6, exact=True)
        anim['tiles'][str(i)] = {
            'fond': f'anim/{i + 1:02d}-fond.webp', 'decoupes': f'anim/{i + 1:02d}-decoupes.webp',
            'ambiance': f'anim/{i + 1:02d}-ambiance.png', 'atlas': [ATLAS_W, int(atlas_h)],
            'taille': [w, h], 'fuite': [round(vp[0], 1), round(vp[1], 1)], 'scene': 'exterieur' if outdoor else 'interieur',
            'decoupesListe': entries,
        }
        kinds = {}
        for e in entries:
            g = e['genre'] if e['mouvement']['type'] != 'vie' else f"{e['mouvement']['posture']}{' (main levée)' if e['mouvement']['leve'] else ''}"
            kinds[g] = kinds.get(g, 0) + 1
        print(f"  {i + 1:02d} {tile['title']:<24} {', '.join(f'{k} ×{v}' for k, v in kinds.items()) or 'aucune découpe'}  ({time.time() - t0:.0f} s)", flush=True)

    anim['modeles'] = ['Mask2Former Swin-T COCO panoptique (Meta)', 'LaMa (Apache-2.0)'] + (['ViTPose base (Apache-2.0)'] if pose_model else []) + (['SlimSAM (Apache-2.0)'] if sam else [])
    anim_path.write_text(json.dumps(anim, ensure_ascii=False, indent=1))
    print(f'ok ({time.time() - t0:.0f} s)')


if __name__ == '__main__':
    main()
