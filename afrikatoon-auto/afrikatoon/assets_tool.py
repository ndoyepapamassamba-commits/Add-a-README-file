"""Import des images de personnages : détourage automatique + estimation de la bouche + planche de contrôle."""
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from .photoanim import ASSETS

POSES = ("neutral", "angry", "shock", "smug", "laugh", "despair", "sweat", "unimpressed")


def _chroma(img: Image.Image) -> Image.Image | None:
    """Incrustation sur fond vert (si l'image a un fond vert uni) : détourage net + suppression du reflet vert."""
    a = np.array(img.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > 150) & (g > r * 1.6) & (g > b * 1.6)
    border = np.concatenate([green[0], green[-1], green[:, 0], green[:, -1]])
    if border.mean() < 0.6:
        return None
    import cv2
    mask = (~green).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.erode(mask, np.ones((2, 2), np.uint8))
    mask = cv2.GaussianBlur(mask, (3, 3), 0)
    spill = np.maximum(g - np.maximum(r, b), 0)                     # reflet vert sur les bords
    g2 = np.where(spill > 0, np.maximum(r, b) + spill * 0.2, g)
    out = np.dstack([r, g2, b, mask]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def _cutout(img: Image.Image) -> Image.Image:
    keyed = _chroma(img)
    if keyed is not None:
        return keyed
    from rembg import new_session, remove
    if not hasattr(_cutout, "session"):
        _cutout.session = new_session("isnet-general-use")
    return remove(img.convert("RGB"), session=_cutout.session)


_MESH = None


def mesh_mouth(img: Image.Image) -> tuple[list[int], int] | None:
    """Bouche repérée par détection des points du visage (MediaPipe), avec une 2e tentative agrandie."""
    global _MESH
    try:
        import mediapipe as mp
    except ImportError:
        return None
    if _MESH is None:
        _MESH = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1,
                                                min_detection_confidence=0.3)
    for scale, pad in ((1, 0), (2, 200)):
        bg = Image.new("RGB", (img.width * scale + 2 * pad, img.height * scale + 2 * pad), (255, 255, 255))
        im = img.resize((img.width * scale, img.height * scale)) if scale > 1 else img
        bg.paste(im, (pad, pad), im)
        r = _MESH.process(np.array(bg))
        if r.multi_face_landmarks:
            L = r.multi_face_landmarks[0].landmark
            w, h = bg.size
            x = ((L[13].x + L[14].x) / 2 * w - pad) / scale
            y = ((L[13].y + L[14].y) / 2 * h - pad) / scale
            width = abs(L[291].x - L[61].x) * w / scale
            return [int(x), int(y)], int(max(width * 0.8, 12))
    return None


def guess_mouth(img: Image.Image) -> tuple[list[int], int]:
    found = mesh_mouth(img)
    if found:
        return found
    return _guess_mouth_shape(img)


def _guess_mouth_shape(img: Image.Image) -> tuple[list[int], int]:
    """Bouche estimée : on suit la tête depuis le sommet du crâne (sans les bras levés ou tendus)."""
    a = np.array(img)[:, :, 3] > 40
    ys = np.where(a.any(axis=1))[0]
    top, bottom = int(ys[0]), int(ys[-1])
    h = bottom - top
    xc = float(np.where(a[top + 2])[0].mean())

    def run_at(y, x):
        row = a[y]
        xs = np.where(row)[0]
        if not len(xs):
            return None
        x = int(xs[np.argmin(np.abs(xs - x))])
        l = x
        while l > 0 and row[l - 1]:
            l -= 1
        r = x
        while r < len(row) - 1 and row[r + 1]:
            r += 1
        return l, r

    widths = []
    for y in range(top + 2, top + int(h * 0.2)):
        rr = run_at(y, xc)
        if rr is None:
            break
        l, r = rr
        if widths and (r - l) > max(widths) * 1.5 and y > top + h * 0.08:
            break                                            # épaules / bras : fin de la tête
        widths.append(r - l)
        xc = (l + r) / 2
    head_h = len(widths) or int(h * 0.15)
    head_w = max(widths) if widths else h * 0.12
    y = int(top + head_h * 0.74)
    rr = run_at(min(y, a.shape[0] - 1), xc) or (int(xc - head_w / 2), int(xc + head_w / 2))
    x = int((rr[0] + rr[1]) / 2 + (rr[1] - rr[0]) * 0.18)   # trois quarts vers la droite
    return [x, y], int(max(head_w * 0.22, 12))


def import_images(paths: list[Path], name: str | None = None, faces: str = "right") -> list[Path]:
    """Fichiers nommés <NOM>_<pose>.png (ex. KOFFI_angry.png) ou dossier + --perso."""
    done = []
    for p in paths:
        m = re.match(r"(.+?)[_-](" + "|".join(POSES) + r")$", p.stem, re.I)
        char = (name or (m.group(1) if m else p.stem)).upper().replace("-", " ").replace("_", " ")
        pose = m.group(2).lower() if m else "neutral"
        folder = ASSETS / "characters" / char.replace(" ", "_")
        folder.mkdir(parents=True, exist_ok=True)
        cut = _cutout(Image.open(p))
        cut = cut.crop(cut.getbbox())
        dest = folder / f"{pose}.png"
        cut.save(dest)
        meta_p = folder / "meta.json"
        meta = json.loads(meta_p.read_text()) if meta_p.exists() else {}
        mouth, mw = guess_mouth(cut)
        meta[pose] = {"mouth": mouth, "mouth_w": mw, "faces": faces}
        meta_p.write_text(json.dumps(meta, indent=2))
        done.append(dest)
    return done


def _figures(cut: Image.Image, n: int) -> list[Image.Image] | None:
    """Repère les n personnages entiers de la planche (formes connexes), de gauche à droite."""
    import cv2
    arr = np.array(cut)
    alpha = (arr[:, :, 3] > 40).astype(np.uint8)
    k, labels, stats, _ = cv2.connectedComponentsWithStats(alpha, 8)
    if k <= n:
        return None
    order = 1 + np.argsort(stats[1:, cv2.CC_STAT_AREA])[::-1]
    big = order[:n]
    if stats[big[-1], cv2.CC_STAT_AREA] < 0.3 * stats[big[0], cv2.CC_STAT_AREA]:
        return None                                   # deux personnages collés : méthode par colonnes
    out = []
    for lab in sorted(big, key=lambda i: stats[i, cv2.CC_STAT_LEFT]):
        x, y, w, h = stats[lab, :4]
        keep = labels == lab
        for i in order[n:]:                           # petits éléments à l'intérieur (lunettes, bijoux…)
            xi, yi, wi, hi = stats[i, :4]
            if xi >= x and xi + wi <= x + w and yi >= y and yi + hi <= y + h and stats[i, cv2.CC_STAT_AREA] < 0.02 * w * h:
                keep |= labels == i
        a2 = arr.copy()
        a2[:, :, 3] = np.where(keep, arr[:, :, 3], 0)
        img = Image.fromarray(a2)
        out.append(img.crop(img.getbbox()))
    return out


def _main_figure(part: Image.Image) -> Image.Image:
    """Ne garde que le personnage principal (enlève les morceaux de mains des poses voisines)."""
    import cv2
    arr = np.array(part)
    alpha = (arr[:, :, 3] > 40).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(alpha, 8)
    if n > 2:
        main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        keep = labels == main
        for i in range(1, n):  # petits éléments détachés du personnage lui-même (ex. lunettes) : gardés s'ils sont proches
            if i != main and stats[i, cv2.CC_STAT_AREA] > 30:
                x, y, w, h = stats[i, :4]
                mx, my, mw, mh = stats[main, :4]
                if x > mx - 5 and x + w < mx + mw + 5 and y > my - 5 and y + h < my + mh + 5:
                    keep |= labels == i
        arr[:, :, 3] = np.where(keep, arr[:, :, 3], 0)
        part = Image.fromarray(arr)
    return part.crop(part.getbbox())


SHEET_ORDER = ("neutral", "angry", "shock", "smug", "laugh")


def import_sheet(path: Path, name: str, faces: str = "right") -> list[Path]:
    """Planche « 5 expressions côte à côte » → 5 images détourées (ordre : neutre, colère, choc,
    mauvaise foi, fou rire)."""
    cut = _cutout(Image.open(path))
    figures = _figures(cut, 5)
    a = np.array(cut)[:, :, 3] > 40
    cols = a.sum(axis=0) > a.shape[0] * 0.01
    segs, start = [], None
    for x, v in enumerate(list(cols) + [False]):
        if v and start is None:
            start = x
        elif not v and start is not None:
            segs.append((start, x))
            start = None
    segs = sorted(sorted(segs, key=lambda s: s[1] - s[0], reverse=True)[:5])
    if len(segs) < 5:  # personnages qui se touchent : découpage en 5 colonnes égales
        w = cut.width / 5
        segs = [(int(i * w), int((i + 1) * w)) for i in range(5)]
    folder = ASSETS / "characters" / name.upper().replace(" ", "_")
    folder.mkdir(parents=True, exist_ok=True)
    meta_p = folder / "meta.json"
    meta = json.loads(meta_p.read_text()) if meta_p.exists() else {}
    done = []
    parts = figures or [_main_figure(cut.crop((x0, 0, x1, cut.height))) for x0, x1 in segs]
    for pose, part in zip(SHEET_ORDER, parts):
        dest = folder / f"{pose}.png"
        part.save(dest)
        mouth, mw = guess_mouth(part)
        meta[pose] = {"mouth": mouth, "mouth_w": mw, "faces": faces}
        done.append(dest)
    meta_p.write_text(json.dumps(meta, indent=2))
    return done


def contact_sheet(dest: Path) -> Path:
    """Planche de tous les personnages avec la bouche estimée (croix rouge) pour vérification."""
    tiles = []
    for folder in sorted((ASSETS / "characters").iterdir()):
        meta_p = folder / "meta.json"
        if not meta_p.exists():
            continue
        for pose, m in json.loads(meta_p.read_text()).items():
            im = Image.open(folder / f"{pose}.png").convert("RGBA")
            bg = Image.new("RGBA", im.size, (90, 180, 110, 255))
            bg.alpha_composite(im)
            d = ImageDraw.Draw(bg)
            x, y = m["mouth"]
            r = m["mouth_w"]
            d.line([(x - r, y), (x + r, y)], fill=(255, 0, 0), width=max(2, r // 8))
            d.line([(x, y - r // 2), (x, y + r // 2)], fill=(255, 0, 0), width=max(2, r // 8))
            k = 300 / bg.height
            t = bg.resize((int(bg.width * k), 300)).convert("RGB")
            ImageDraw.Draw(t).text((4, 4), f"{folder.name}:{pose}", fill=(255, 255, 0))
            tiles.append(t)
    w = sum(t.width for t in tiles[:8]) or 1
    rows = [tiles[i:i + 8] for i in range(0, len(tiles), 8)]
    sheet = Image.new("RGB", (max(sum(t.width for t in r) for r in rows), 300 * len(rows)), "white")
    for j, r in enumerate(rows):
        x = 0
        for t in r:
            sheet.paste(t, (x, j * 300))
            x += t.width
    sheet.save(dest)
    return dest


# --- Planche « distribution » : bandeaux de noms + plusieurs poses en buste par personnage ---------

def _runs(values, gap: int = 1) -> list[tuple[int, int]]:
    out, s, p = [], None, None
    for v in values:
        if s is None:
            s = p = v
        elif v <= p + gap:
            p = v
        else:
            out.append((s, p))
            s = p = v
    if s is not None:
        out.append((s, p))
    return out


def sheet_grid(img: Image.Image) -> list[dict]:
    """Repère rangées (lignes blanches), panneaux (bandeaux de couleur séparés de blanc) et cases
    (fins traits clairs verticaux). Renvoie [{row, top, panel, cells}] de haut en bas, de gauche à droite."""
    a = np.array(img.convert("RGB")).astype(int)
    h, w, _ = a.shape
    white_rows = [y for y in range(h) if (a[y].min(axis=1) > 225).mean() > 0.5]
    bounds = [(s + e) // 2 for s, e in _runs(white_rows)]
    bounds = sorted(set([0] + bounds + [h - 1]))
    rows = []
    for y0, y1 in zip(bounds, bounds[1:]):
        if y1 - y0 < 40:                              # bandeau isolé par deux lignes blanches : rattaché
            continue
        if rows and y0 - rows[-1][1] < 40 and y0 - rows[-1][1] > 0:
            y0 = rows[-1][1] + 1
        rows.append((y0, y1))
    # une rangée dont le bandeau a été coupé par une ligne blanche commence au bandeau
    fixed = []
    for k, (y0, y1) in enumerate(rows):
        prev = bounds[bounds.index(y0) - 1] if y0 in bounds and bounds.index(y0) > 0 else None
        if prev is not None and y0 - prev < 40 and (not fixed or fixed[-1][1] < prev):
            y0 = prev
        fixed.append((y0, y1))
    out = []
    for y0, y1 in fixed:
        top_band = a[y0 + 3:y0 + 6]
        white = (top_band.min(axis=2) > 215).mean(axis=0) > 0.6
        seps = [(s + e) // 2 for s, e in _runs([x for x in range(w) if white[x]])]
        edges = sorted(set([0] + seps + [w - 1]))
        panels = [(e0, e1) for e0, e1 in zip(edges, edges[1:]) if e1 - e0 > 40]
        top = y0 + 22
        for y in range(y0 + 14, min(y0 + 34, y1)):
            if (a[y].min(axis=1) > 215).mean() > 0.5:
                top = y
                break
        band = a[top + 3:y1 - 2].min(axis=2)
        line = np.zeros(w)
        for x in range(3, w - 3):
            c, side = band[:, x], np.maximum(band[:, x - 3], band[:, x + 3])
            line[x] = ((c > 185) & (c - side > 20)).mean()
        for x0, x1 in panels:
            cuts = []
            for s, e in _runs([x for x in range(x0 + 30, x1 - 30) if line[x] > 0.28], gap=2):
                c = round((s + e) / 2)
                if not cuts or c - cuts[-1] >= 38:
                    cuts.append(c)
            b = [x0 + 1] + cuts + [x1 - 1]
            out.append({"row": [y0, y1], "top": top + 2, "panel": [x0, x1], "cells": list(zip(b, b[1:]))})
    return out


_SR = None


def upscale4(img: Image.Image) -> Image.Image:
    """Agrandissement ×4 par IA (Real-ESRGAN x4plus, licence BSD-3) sur processeur."""
    global _SR
    import torch
    if _SR is None:
        import spandrel
        model = Path.home() / ".cache" / "esrgan" / "RealESRGAN_x4plus.pth"
        if not model.exists():
            import urllib.request
            model.parent.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve("https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/"
                                       "RealESRGAN_x4plus.pth", model)
        _SR = spandrel.ModelLoader().load_from_file(str(model)).eval()
    x = torch.from_numpy(np.array(img.convert("RGB"))).permute(2, 0, 1)[None].float() / 255
    with torch.no_grad():
        y = _SR(x)
    return Image.fromarray((y[0].permute(1, 2, 0).clamp(0, 1).numpy() * 255).astype(np.uint8))


def import_cast_sheet(path: Path, distribution: dict) -> dict[str, list[Path]]:
    """Planche de distribution (bandeaux de noms, 3 à 5 poses en buste par personnage) → un dossier par
    personnage : poses agrandies ×4 et détourées. `distribution` = {"rows": [[noms…]…], "cells": {…},
    "skip": [...]} ; "cells" corrige les cases mal attribuées par la planche : {"NOM": [[panneau, case]…]}."""
    from rembg import new_session, remove
    src = Image.open(path).convert("RGB")
    grid = sheet_grid(src)
    names = [n for row in distribution["rows"] for n in row]
    if len(names) != len(grid):
        raise ValueError(f"{len(grid)} panneaux trouvés, {len(names)} noms fournis")
    owners: dict[str, list[tuple[int, int]]] = {}
    split = distribution.get("split", {})               # {"NOM": 3} : panneau à couper en N cases égales
    for p, (name, g) in enumerate(zip(names, grid)):
        if name in split:
            x0, x1 = g["panel"]
            step = (x1 - x0) / split[name]
            g["cells"] = [(int(x0 + k * step), int(x0 + (k + 1) * step)) for k in range(split[name])]
        for c in range(len(g["cells"])):
            owners.setdefault(name, []).append((p, c))
    for name, cells in distribution.get("cells", {}).items():   # réattributions explicites
        for other in owners:
            owners[other] = [pc for pc in owners[other] if list(pc) not in cells]
        owners[name] = [tuple(pc) for pc in cells]
    session = new_session("isnet-general-use")
    done = {}
    for name, cells in owners.items():
        if name in distribution.get("skip", []) or not cells:
            continue
        folder = ASSETS / "characters" / name.replace(" ", "_")
        folder.mkdir(parents=True, exist_ok=True)
        meta = {}
        done[name] = []
        for k, (p, c) in enumerate(cells):
            g = grid[p]
            x0, x1 = g["cells"][c]
            cell = src.crop((x0 + 1, g["top"], x1 - 1, g["row"][1] - 1))
            cut = remove(upscale4(cell), session=session)
            cut = _main_figure(cut)
            pose = "neutral" if k == 0 else f"pose{k + 1}"
            dest = folder / f"{pose}.png"
            cut.save(dest)
            mouth, mw = guess_mouth(cut)
            meta[pose] = {"mouth": mouth, "mouth_w": mw, "faces": "front", "height": 0.55, "portrait": True}
            done[name].append(dest)
        (folder / "meta.json").write_text(json.dumps(meta, indent=2))
    return done


def _erase_label(img: Image.Image) -> Image.Image:
    """Efface le cartouche de titre (rectangle bleu nuit, texte blanc) en bas à gauche d'une vignette."""
    import cv2
    a = np.array(img.convert("RGB"))
    h, w, _ = a.shape
    zone = a[int(h * 0.7):, :int(w * 0.75)].astype(int)
    navy = (zone[..., 2] > zone[..., 0] + 25) & (zone.max(axis=2) < 130)
    ys, xs = np.where(navy)
    if len(ys) < 50:
        return img
    y0, y1 = int(np.percentile(ys, 2)), int(np.percentile(ys, 98))
    x0, x1 = int(np.percentile(xs, 1)), int(np.percentile(xs, 99))
    mask = np.zeros((h, w), np.uint8)
    mask[int(h * 0.7) + y0 - 4:int(h * 0.7) + y1 + 5, max(x0 - 4, 0):x1 + 5] = 255
    return Image.fromarray(cv2.inpaint(a, mask, 9, cv2.INPAINT_TELEA))


def import_scene_sheet(path: Path, names: list[str], scale: int = 2) -> list[Path]:
    """Planche de décors (vignettes séparées de blanc, titre en bas à gauche) → une image par décor dans
    assets/scenes/, titre effacé et agrandie par IA (images de départ pour Wan 2.2)."""
    src = Image.open(path).convert("RGB")
    a = np.array(src).astype(int)
    white = a.min(axis=2) > 225

    def cuts(frac):
        b = [(s + e) // 2 for s, e in _runs([i for i, f in enumerate(frac) if f > 0.7])]
        b = sorted(set([0] + b + [len(frac) - 1]))
        return [(p, q) for p, q in zip(b, b[1:]) if q - p > 60]
    out = []
    dest_dir = ASSETS / "scenes"
    dest_dir.mkdir(parents=True, exist_ok=True)
    rows = cuts(white.mean(axis=1))
    panels = []
    for y0, y1 in rows:
        for x0, x1 in cuts(white[y0:y1].mean(axis=0)):
            panels.append((x0 + 2, y0 + 2, x1 - 1, y1 - 1))
    if len(panels) != len(names):
        raise ValueError(f"{len(panels)} vignettes trouvées, {len(names)} noms fournis")
    for name, box in zip(names, panels):
        tile = _erase_label(src.crop(box))
        if scale > 1:
            big = upscale4(tile)
            tile = big.resize((tile.width * scale, tile.height * scale), Image.LANCZOS)
        dest = dest_dir / f"{name}.png"
        tile.save(dest)
        out.append(dest)
    return out


# --- Personnage repéré dans une scène de groupe (segmentation SAM guidée par un cadre) -------------

_SAM = None


def _sam():
    global _SAM
    if _SAM is None:
        from transformers import SamModel, SamProcessor
        _SAM = (SamProcessor.from_pretrained("facebook/sam-vit-base"),
                SamModel.from_pretrained("facebook/sam-vit-base").eval())
    return _SAM


def extract_from_scene(scene: Path, box: tuple[int, int, int, int], name: str, pose: str = "neutral",
                       faces: str = "front", points: list | None = None, avoid: list | None = None) -> Path:
    """Découpe un personnage d'une scène (cadre x0, y0, x1, y1 en pixels de l'image) : agrandi ×2 par IA,
    masque SAM (Segment Anything, Apache 2.0) guidé par le cadre et des points sur le personnage."""
    import torch
    src = Image.open(scene).convert("RGB")
    m = 12
    x0, y0, x1, y1 = box
    crop = src.crop((max(x0 - m, 0), max(y0 - m, 0), min(x1 + m, src.width), min(y1 + m, src.height)))
    big = upscale4(crop)
    big = big.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
    k = 2
    bx = [m * k, m * k, big.width - m * k, big.height - m * k]
    proc, model = _sam()
    kw = {"input_boxes": [[bx]]}
    pts = [(p, 1) for p in points or []] + [(p, 0) for p in avoid or []]   # 1 = personnage, 0 = décor
    if pts:      # points (x, y) dans l'image d'origine
        kw["input_points"] = [[[[(px - x0 + m) * k, (py - y0 + m) * k] for (px, py), _ in pts]]]
        kw["input_labels"] = [[[lab for _, lab in pts]]]
    inputs = proc(big, return_tensors="pt", **kw)
    with torch.no_grad():
        out = model(**inputs, multimask_output=True)
    masks = proc.image_processor.post_process_masks(out.pred_masks, inputs["original_sizes"],
                                                    inputs["reshaped_input_sizes"])[0][0]
    import cv2
    from rembg import new_session, remove        # rembg : ce qui est « personnage » (exclut les décors)
    if not hasattr(extract_from_scene, "session"):
        extract_from_scene.session = new_session("isnet-general-use")
    fg = np.array(remove(big, session=extract_from_scene.session, only_mask=True))
    cands = [masks[i].numpy().astype(bool) for i in range(masks.shape[0])]
    biggest = max(c.sum() for c in cands)
    # masque SAM qui déborde le moins sur le décor, parmi ceux qui couvrent bien le personnage
    best = min((c for c in cands if c.sum() >= 0.6 * biggest), key=lambda c: (fg[c] < 40).mean())
    near = cv2.dilate(best.astype(np.uint8), np.ones((31, 31), np.uint8)).astype(bool)
    mask = ((best | ((fg > 128) & near)) * 255).astype(np.uint8)   # + canne, pieds, détails fins
    mask = cv2.GaussianBlur(cv2.erode(mask, np.ones((3, 3), np.uint8)), (3, 3), 0)
    rgba = big.convert("RGBA")
    rgba.putalpha(Image.fromarray(mask))
    cut = _main_figure(rgba)
    folder = ASSETS / "characters" / name.replace(" ", "_")
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"{pose}.png"
    cut.save(dest)
    meta_p = folder / "meta.json"
    meta = json.loads(meta_p.read_text()) if meta_p.exists() else {}
    mouth, mw = guess_mouth(cut)
    meta[pose] = {"mouth": mouth, "mouth_w": mw, "faces": faces, "source": scene.name}
    meta_p.write_text(json.dumps(meta, indent=2))
    return dest
