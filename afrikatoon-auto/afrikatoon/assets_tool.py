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


def guess_mouth(img: Image.Image) -> tuple[list[int], int]:
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
