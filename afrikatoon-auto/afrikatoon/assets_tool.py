"""Import des images de personnages : détourage automatique + estimation de la bouche + planche de contrôle."""
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from .photoanim import ASSETS

POSES = ("neutral", "angry", "shock", "smug", "laugh", "despair", "sweat", "unimpressed")


def _cutout(img: Image.Image) -> Image.Image:
    from rembg import new_session, remove
    if not hasattr(_cutout, "session"):
        _cutout.session = new_session("isnet-general-use")
    return remove(img.convert("RGB"), session=_cutout.session)


def guess_mouth(img: Image.Image) -> tuple[list[int], int]:
    """Bouche estimée : ~15 % de la hauteur sous le haut de la tête, au centre de la tête."""
    a = np.array(img)[:, :, 3] > 40
    ys = np.where(a.any(axis=1))[0]
    top, bottom = ys[0], ys[-1]
    h = bottom - top
    y = int(top + h * 0.15)
    band = np.where(a[int(top + h * 0.05):int(top + h * 0.17)].any(axis=0))[0]
    x = int(band.mean()) if len(band) else img.width // 2
    head_w = (band.max() - band.min()) if len(band) else h * 0.2
    return [x, y], int(max(head_w * 0.28, 12))


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


SHEET_ORDER = ("neutral", "angry", "shock", "smug", "laugh")


def import_sheet(path: Path, name: str, faces: str = "right") -> list[Path]:
    """Planche « 5 expressions côte à côte » → 5 images détourées (ordre : neutre, colère, choc,
    mauvaise foi, fou rire)."""
    cut = _cutout(Image.open(path))
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
    for pose, (x0, x1) in zip(SHEET_ORDER, segs):
        part = cut.crop((x0, 0, x1, cut.height))
        part = part.crop(part.getbbox())
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
