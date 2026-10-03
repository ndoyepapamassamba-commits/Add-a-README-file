"""Conversion locale d'une image 3D (personnage détouré ou décor) en dessin animé 2D « cel-shading » :
aplats de couleur, ombres en 2-3 tons, contours encrés. Gratuit, sans GPU, déterministe (cohérence garantie
d'un plan à l'autre)."""
import cv2
import numpy as np
from PIL import Image


def _quantize(rgb: np.ndarray, mask: np.ndarray, k: int) -> np.ndarray:
    px = rgb[mask].reshape(-1, 3).astype(np.float32)
    if len(px) < k:
        return rgb
    sample = px[np.random.default_rng(0).choice(len(px), min(len(px), 60000), replace=False)]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    _, _, centers = cv2.kmeans(sample, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    lab = cv2.cvtColor(centers.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    img_lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    idx = np.argmin(((img_lab[:, None, :] - lab[None, :, :]) ** 2).sum(-1), axis=1)
    out = centers[idx].reshape(rgb.shape).astype(np.uint8)
    out[~mask] = rgb[~mask]
    return out


def toonify(img: Image.Image, colors: int = 28, line: int = 3) -> Image.Image:
    rgba = img.convert("RGBA")
    a = np.array(rgba)
    rgb, alpha = a[..., :3].copy(), a[..., 3]
    mask = alpha > 20
    h, w = alpha.shape
    s = max(1.0, 900 / max(h, w))                      # travail à taille homogène
    sm = rgb
    for _ in range(2):
        sm = cv2.bilateralFilter(sm, 9, 40, 7)
    sm = cv2.pyrMeanShiftFiltering(sm, 6, 18)
    q = _quantize(sm, mask, colors)
    q = cv2.medianBlur(q, 5)
    # contours intérieurs : frontières entre aplats nettement différents
    lab = cv2.cvtColor(q, cv2.COLOR_RGB2LAB).astype(np.int16)
    gx = np.abs(np.diff(lab, axis=1, prepend=lab[:, :1])).sum(-1)
    gy = np.abs(np.diff(lab, axis=0, prepend=lab[:1])).sum(-1)
    edges = ((gx + gy) > 70).astype(np.uint8) * 255
    edges = cv2.morphologyEx(edges, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    # contour extérieur épais (silhouette)
    m8 = mask.astype(np.uint8) * 255
    outer = cv2.subtract(m8, cv2.erode(m8, np.ones((line * 2 + 1, line * 2 + 1), np.uint8)))
    ink = np.maximum(cv2.dilate(edges, np.ones((max(1, line - 1),) * 2, np.uint8)), outer)
    ink = cv2.GaussianBlur(ink, (3, 3), 0).astype(np.float32) / 255
    inkcol = np.array([40, 22, 18], np.float32)
    out = q.astype(np.float32) * (1 - ink[..., None]) + inkcol * ink[..., None]
    # un peu plus de saturation, façon série TV
    hsv = cv2.cvtColor(out.clip(0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.12, 0, 255)
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
    return Image.fromarray(np.dstack([out, alpha]), "RGBA")


def background(img: Image.Image) -> Image.Image:
    """Décor : même traitement, contours plus fins, couleurs plus douces."""
    return toonify(img.convert("RGBA"), colors=36, line=1)


def convert_character(name: str, scale: int = 4) -> list:
    """Toutes les poses d'un personnage → assets/characters_2d/<NOM>/<pose>.png (×scale, coordonnées de
    meta.json multipliées d'autant)."""
    import json
    from pathlib import Path
    from . import assets_tool
    src = Path(__file__).resolve().parent.parent / "assets" / "characters" / name.replace(" ", "_")
    dst = src.parent.parent / "characters_2d" / src.name
    dst.mkdir(parents=True, exist_ok=True)
    meta = json.loads((src / "meta.json").read_text())
    done = []
    for pose in meta:
        out = dst / f"{pose}.png"
        if out.exists():
            continue
        a = Image.open(src / f"{pose}.png").convert("RGBA")
        big = assets_tool.upscale4(a.convert("RGB")).convert("RGBA")
        big.putalpha(a.split()[3].resize(big.size, Image.LANCZOS))
        if scale != 4:
            big = big.resize((a.width * scale, a.height * scale), Image.LANCZOS)
        toonify(big, colors=64, line=2 + scale // 2).save(out)
        done.append(out)
    m2 = {p: {**v, "mouth": [v["mouth"][0] * scale, v["mouth"][1] * scale], "mouth_w": v["mouth_w"] * scale}
          for p, v in meta.items()}
    (dst / "meta.json").write_text(json.dumps(m2, indent=2))
    return done
