"""Moteur de dessin animé 2D (gratuit, sur processeur) : personnages 2D « découpés » animés comme dans une
série TV, avec

- lip-sync précis : formes de bouche dessinées d'après Rhubarb Lip Sync (A…H, X), synchronisées sur la voix ;
- jeu physique : respiration, balancement, tête qui hoche sur les syllabes fortes, tremblement de colère,
  « pop » (squash & stretch) à chaque changement d'expression, clignement des yeux ;
- caméra virtuelle : plan large, plan à deux, par-dessus l'épaule, gros plan, plans de réaction, poussée
  lente, panoramique filé, tremblement sur les cris, gel final ;
- décor en parallaxe avec profondeur de champ, accessoire de gag (la marmite marquée au nom du coupable).

Unités de scène : le sol est à y = 0, l'axe y monte, un adulte mesure ≈ 1,7.
"""
import json
import math
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
W, H, FPS = 1080, 1920, 24
INK = (40, 22, 18)
RHUBARB = Path.home() / "tools" / "Rhubarb-Lip-Sync-1.14.0-Linux" / "rhubarb"
SPEAK_POSE = {"laugh": "smug", "despair": "shock", "sweat": "shock", "unimpressed": "neutral"}


def smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


# --- Bouche ------------------------------------------------------------------------------------

def mouth_cues(wav: Path) -> list[tuple[float, float, str]]:
    """Formes de bouche (Rhubarb, reconnaissance phonétique indépendante de la langue)."""
    out = subprocess.run([str(RHUBARB), "-r", "phonetic", "-f", "json", "-q", str(wav)], capture_output=True,
                         text=True, check=True).stdout
    return [(c["start"], c["end"], c["value"]) for c in json.loads(out)["mouthCues"]]


SHAPES = {  # (largeur, hauteur) relatives à la largeur de bouche, dents, langue
    "A": (0.80, 0.06, False, False), "B": (0.90, 0.22, True, False), "C": (0.95, 0.42, True, True),
    "D": (1.05, 0.66, True, True), "E": (0.72, 0.48, False, True), "F": (0.46, 0.36, False, False),
    "G": (0.85, 0.24, True, False), "H": (0.92, 0.46, True, True), "X": (0.78, 0.04, False, False),
}


def draw_mouth(img: Image.Image, cx: float, cy: float, mw: float, shape: str, mood: str, skin) -> None:
    """Remplace la bouche peinte par une bouche dessinée (forme phonétique), au style encré du personnage."""
    k = 4                                                     # sur-échantillonnage (anticrénelage)
    bw, bh = int(mw * 1.9), int(mw * 1.5)
    layer = Image.new("RGBA", (bw * k, bh * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    ox, oy = bw * k / 2, bh * k * 0.42
    sw, sh, teeth, tongue = SHAPES.get(shape, SHAPES["X"])
    if shape in ("X", "A"):                                   # bouche fermée : on garde celle du dessin
        return
    sw = max(sw, 0.62)                                        # couvre toujours la bouche peinte
    w2, h2 = sw * mw * 0.5 * k, sh * mw * k
    lw = max(2, int(mw * 0.07 * k))
    lip = tuple(int(c * 0.62) for c in skin)
    if h2 < mw * 0.1 * k:                                     # bouche fermée : un trait, courbé selon l'humeur
        curve = {"angry": 0.10, "shock": 0.05, "smug": -0.10, "laugh": -0.14}.get(mood, -0.04) * mw * k
        d.line([(ox - w2, oy + curve), (ox, oy - curve * 0.6), (ox + w2, oy + curve)], fill=INK, width=lw,
               joint="curve")
    else:
        box = [ox - w2, oy - h2 * 0.35, ox + w2, oy + h2 * 0.65]
        d.ellipse(box, fill=(70, 16, 22, 255), outline=INK, width=lw)
        if tongue:
            d.ellipse([ox - w2 * 0.55, oy + h2 * 0.15, ox + w2 * 0.55, oy + h2 * 0.75], fill=(205, 85, 95, 255))
        if teeth:
            d.chord([ox - w2 * 0.86, oy - h2 * 0.35, ox + w2 * 0.86, oy + h2 * 0.18], 180, 360,
                    fill=(250, 246, 236, 255))
        d.ellipse(box, outline=INK, width=lw)
        d.arc([ox - w2 * 1.05, oy - h2 * 0.5, ox + w2 * 1.05, oy + h2 * 0.8], 20, 160, fill=lip, width=lw)
    layer = layer.resize((bw, bh), Image.LANCZOS)
    img.alpha_composite(layer, (int(cx - bw / 2), int(cy - bh * 0.42)))


def draw_blink(img: Image.Image, eyes: list, skin) -> None:
    d = ImageDraw.Draw(img)
    for (ex, ey, er) in eyes:
        d.ellipse([ex - er * 1.25, ey - er * 0.95, ex + er * 1.25, ey + er * 0.75], fill=(*skin, 255))
        d.arc([ex - er * 1.2, ey - er * 0.9, ex + er * 1.2, ey + er * 0.5], 15, 165, fill=INK,
              width=max(2, int(er * 0.25)))


# --- Personnage --------------------------------------------------------------------------------

class Puppet:
    def __init__(self, name: str, height: float):
        self.name = name
        self.dir = ASSETS / "characters_2d" / name.replace(" ", "_")
        self.meta = json.loads((self.dir / "meta.json").read_text())
        faces_p = self.dir / "faces.json"
        self.faces = json.loads(faces_p.read_text()) if faces_p.exists() else {}
        self.height = height                                    # en unités de scène
        self.cache = {}

    def pose(self, pose: str, facing: str | None = None):
        """(image, bouche, largeur de bouche, peau, yeux, regard) ; retournée en miroir si `facing` l'exige."""
        pose = pose if pose in self.meta else ("neutral" if "neutral" in self.meta else next(iter(self.meta)))
        base = self._load(pose)
        faces = base[5]
        if facing and faces in ("left", "right") and facing != faces:
            key = (pose, "flip")
            if key not in self.cache:
                im, mouth, mw, skin, eyes, _ = base
                w = im.width
                self.cache[key] = (im.transpose(Image.FLIP_LEFT_RIGHT), (w - mouth[0], mouth[1]), mw, skin,
                                   [(w - x, y, r) for x, y, r in eyes], facing)
            return self.cache[key]
        return base

    def _load(self, pose: str):
        if pose not in self.cache:
            im = Image.open(self.dir / f"{pose}.png").convert("RGBA")
            bbox = im.getbbox()
            im = im.crop(bbox)
            m = dict(self.meta[pose])
            fp = self.faces.get(pose) or {}
            if fp.get("mouth"):                                 # repères MediaPipe, plus précis
                m["mouth"], m["mouth_w"] = fp["mouth"], fp["mouth_w"] * 1.05
            mouth = (m["mouth"][0] - bbox[0], m["mouth"][1] - bbox[1])
            arr = np.array(im)
            mx, my, mw = int(mouth[0]), int(mouth[1]), m["mouth_w"]
            ring = arr[max(0, my - int(mw * 0.9)):my + int(mw * 0.9), max(0, mx - int(mw * 1.6)):mx + int(mw * 1.6)]
            px = ring[ring[..., 3] > 200][:, :3]
            # peau : tons moyens (ni encre, ni dents, ni tissu saturé)
            lum = px.mean(1)
            px = px[(lum > 60) & (lum < 200)]
            skin = tuple(int(v) for v in np.median(px, axis=0)) if len(px) else (150, 95, 65)
            eyes = [(e[0] - bbox[0], e[1] - bbox[1], e[2]) for e in self.faces.get(pose, {}).get("eyes", [])]
            self.cache[pose] = (im, mouth, mw, skin, eyes, m.get("faces", "right"))
        return self.cache[pose]


@dataclass
class Actor:
    puppet: Puppet
    x: float                      # position au sol (unités de scène)
    facing: str                   # "left" / "right"
    z: float = 0.0                # profondeur : > 0 = plus près de la caméra
    pose: str = "neutral"
    phase: float = field(default_factory=lambda: np.random.default_rng().uniform(0, 6))


# --- Rendu d'une image ------------------------------------------------------------------------

def head_warp(arr: np.ndarray, pivot, angle_deg: float, top: float, bottom: float, dy: float = 0.0):
    """Tourne la tête (au-dessus du cou) autour du pivot, en fondant progressivement vers le buste."""
    if abs(angle_deg) < 0.05 and abs(dy) < 0.3:
        return arr
    h, w = arr.shape[:2]
    y1 = int(min(h, bottom + 2))
    region = arr[:y1]
    ys, xs = np.mgrid[0:y1, 0:w].astype(np.float32)
    wgt = np.clip((bottom - ys) / max(1.0, bottom - top), 0, 1)
    wgt = wgt * wgt * (3 - 2 * wgt)
    a = -math.radians(angle_deg) * wgt
    px, py = pivot
    sx = px + (xs - px) * np.cos(a) - (ys - py) * np.sin(a)
    sy = py + (xs - px) * np.sin(a) + (ys - py) * np.cos(a) - dy * wgt
    warped = cv2.remap(region, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    out = arr.copy()
    out[:y1] = warped
    return out


@dataclass
class Cam:
    cx: float
    cy: float
    h: float                      # hauteur visible (unités de scène)
    shake: float = 0.0


def render(bg: Image.Image, bg_width_units: float, actors: list[Actor], states: dict, cam: Cam, t: float,
           props=(), focus: str | None = None, flash: float = 0.0) -> Image.Image:
    """Image 1080×1920. states[nom] = dict(shape, open, nod, shake, pop, blink, mood)."""
    ppu = H / cam.h                                             # pixels par unité
    sx = cam.shake * math.sin(t * 83) * 14
    sy = cam.shake * math.cos(t * 71) * 10
    # décor : plan lointain (parallaxe 0,55) avec flou de profondeur selon le cadrage
    bw, bh = bg.size
    par = 0.55
    vis_h = bh * 0.92 * (cam.h / 3.1) ** 0.55                     # le décor zoome moins que les personnages
    vis_w = vis_h * W / H
    scale_bg = vis_h / cam.h
    cx_bg = bw / 2 + cam.cx * par * scale_bg
    cy_bg = bh * 0.56 - (cam.cy - 1.05) * par * scale_bg
    x0 = min(max(cx_bg - vis_w / 2, 0), bw - vis_w)
    y0 = min(max(cy_bg - vis_h / 2, 0), bh - vis_h)
    frame = bg.crop((int(x0), int(y0), int(x0 + vis_w), int(y0 + vis_h))).resize((W, H), Image.BILINEAR)
    blur = max(0.0, 2.6 - cam.h) * 2.2
    if blur > 0.4:
        frame = frame.filter(ImageFilter.GaussianBlur(blur))
    frame = frame.convert("RGBA")

    def to_px(x, y):
        return (W / 2 + (x - cam.cx) * ppu + sx, H / 2 - (y - cam.cy) * ppu + sy)

    for prop in props:
        prop(frame, to_px, ppu, t)
    shadows = Image.new("RGBA", (W, H), (0, 0, 0, 0))            # ombres de contact : ancrent les personnages au sol
    ds = ImageDraw.Draw(shadows)
    for a in actors:
        st = states.get(a.puppet.name, {})
        k_depth = 1 + a.z * 0.35
        gx, gy = to_px(a.x + st.get("dx", 0.0), -a.z * 0.02)
        hop = st.get("hop", 0.0)
        rw = a.puppet.height * k_depth * ppu * 0.24 * (1 - 1.6 * hop)
        rh = rw * 0.16
        if rw > 2:
            ds.ellipse([gx - rw, gy - rh, gx + rw, gy + rh], fill=(40, 20, 10, int(120 * (1 - 2 * hop))))
    frame.alpha_composite(shadows.filter(ImageFilter.GaussianBlur(max(2, ppu * 0.03))))
    for a in sorted(actors, key=lambda a: a.z):
        st = states.get(a.puppet.name, {})
        im, mouth, mw, skin, eyes, faces = a.puppet.pose(st.get("pose", a.pose), a.facing)
        k_depth = 1 + a.z * 0.35
        target_h = a.puppet.height * k_depth * ppu
        k = target_h / im.height
        # étirement « pop » et respiration (autour des pieds)
        pop = st.get("pop", 0.0)
        breath = 0.006 * math.sin(t * 2.3 + a.phase)
        ky = k * (1 + breath + 0.05 * pop)
        kx = k * (1 - 0.035 * pop)
        # recadrage de la partie visible avant agrandissement (rapidité)
        fx, fy = to_px(a.x + st.get("dx", 0.0), 0)
        left_px = fx - im.width * kx / 2
        top_px = fy - im.height * ky - a.z * 0.02 * ppu - st.get("hop", 0.0) * a.puppet.height * ppu
        vx0 = max(0, int((-left_px) / kx) - 4)
        vx1 = min(im.width, int((W - left_px) / kx) + 4)
        vy0 = max(0, int((-top_px) / ky) - 4)
        vy1 = min(im.height, int((H - top_px) / ky) + 4)
        if vx1 <= vx0 or vy1 <= vy0:
            continue
        work = im.copy()
        if st.get("talking") and st.get("shape"):
            draw_mouth(work, mouth[0], mouth[1], mw, st["shape"], st.get("mood", "neutral"), skin)
        if st.get("blink") and eyes:
            draw_blink(work, eyes, skin)
        arr = np.array(work)
        nod = st.get("nod", 0.0) + 1.2 * math.sin(t * 1.1 + a.phase) + st.get("shake", 0.0) * math.sin(t * 38)
        neck = (mouth[0], mouth[1] + mw * 1.4)
        arr = head_warp(arr, neck, nod * (1 if faces == "right" else -1), mouth[1] - mw * 0.2,
                        mouth[1] + mw * 2.6, dy=st.get("bob", 0.0) * mw * 0.15)
        piece = Image.fromarray(arr[vy0:vy1, vx0:vx1])
        flip = False
        pw, ph = max(1, int((vx1 - vx0) * kx)), max(1, int((vy1 - vy0) * ky))
        piece = piece.resize((pw, ph), Image.BILINEAR if pw * ph > 4e6 else Image.LANCZOS)
        if flip:
            piece = piece.transpose(Image.FLIP_LEFT_RIGHT)
            px0 = fx + im.width * kx / 2 - vx1 * kx
        else:
            px0 = left_px + vx0 * kx
        sway = 0.5 * math.sin(t * 0.9 + a.phase) + st.get("lean", 0.0)
        if abs(sway) > 0.05:
            piece = piece.rotate(sway * (-1 if flip else 1), resample=Image.BILINEAR, expand=False,
                                 center=(piece.width / 2, piece.height))
        if focus and a.puppet.name != focus and a.z > 0.3:
            piece = piece.filter(ImageFilter.GaussianBlur(6))     # amorce floue (par-dessus l'épaule)
        frame.alpha_composite(piece, (int(px0), int(top_px + vy0 * ky)))
    out = grade(frame.convert("RGB"), t, cam)
    if flash > 0:
        out = Image.blend(out, Image.new("RGB", (W, H), (255, 255, 255)), min(0.8, flash))
    return out


# --- Vie du décor et étalonnage ----------------------------------------------------------------------

_LOOK = {}


def _look():
    """Masques précalculés : vignettage chaud et rayons de soleil obliques (venant d'en haut à gauche)."""
    if not _LOOK:
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.sqrt(((xs - W / 2) / (W * 0.75)) ** 2 + ((ys - H * 0.45) / (H * 0.7)) ** 2)
        _LOOK["vig"] = np.clip(1.08 - 0.42 * r ** 2.2, 0.55, 1.0)[..., None]
        u = (xs * 0.55 + ys * 0.84) / 60.0                      # coordonnée perpendiculaire aux rayons
        bands = sum(np.clip(np.sin(u * f + ph), 0, 1) ** 6 for f, ph in ((0.9, 0.0), (0.37, 1.7), (0.21, 4.1)))
        fade = np.clip(1.1 - (xs / W * 0.6 + ys / H * 0.9), 0, 1) ** 1.5
        _LOOK["rays"] = (bands * fade).astype(np.float32)[..., None]
        rng = np.random.default_rng(7)
        _LOOK["dust"] = rng.uniform(0, 1, (46, 4))               # x, y, taille, phase
    return _LOOK


def grade(img: Image.Image, t: float, cam: "Cam") -> Image.Image:
    lk = _look()
    arr = np.asarray(img).astype(np.float32)
    rays = lk["rays"] * (0.55 + 0.45 * math.sin(t * 0.7)) * 26.0
    arr = arr + rays * np.array([1.0, 0.86, 0.6], np.float32)    # lumière dorée de fin d'après-midi
    arr = arr * lk["vig"] * np.array([1.03, 1.0, 0.95], np.float32)
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    # poussière qui flotte dans la lumière + oiseaux de passage (plan large et moyen seulement)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for x, y, sz, ph in lk["dust"]:
        px = ((x + 0.012 * t + 0.02 * math.sin(t * 0.5 + ph * 9)) % 1) * W - cam.cx * 40
        py = ((y - 0.006 * t) % 1) * H * 0.85
        rr = 2 + sz * 4
        a = int(70 + 80 * (0.5 + 0.5 * math.sin(t * 1.3 + ph * 20)))
        d.ellipse([px - rr, py - rr, px + rr, py + rr], fill=(255, 236, 190, a))
    if cam.h > 1.8:
        for k in range(3):                                     # vol d'oiseaux toutes les 14 s
            u = ((t + 4) % 14) / 6.0 - k * 0.04
            if 0 < u < 1:
                bx, by = -60 + u * (W + 120) + k * 46, H * (0.09 + 0.02 * k) + 30 * math.sin(u * 6)
                flap = 10 * math.sin(t * 18 + k)
                d.line([(bx - 14, by - flap), (bx, by), (bx + 14, by - flap)], fill=(40, 30, 30, 200), width=4)
    out = out.convert("RGBA")
    out.alpha_composite(layer.filter(ImageFilter.GaussianBlur(1.2)))
    return out.convert("RGB")


# --- Accessoire : la marmite --------------------------------------------------------------------

def pot_prop(x: float, label: str = "NOUNOU", size: float = 0.42, show_label: bool = True):
    def draw(frame, to_px, ppu, t):
        cx, cy = to_px(x, 0)
        r = size * ppu / 2
        if r < 4 or cx < -3 * r or cx > W + 3 * r:
            return
        d = ImageDraw.Draw(frame)
        lw = max(2, int(r * 0.05))
        # foyer (trois pierres + braises)
        for dx in (-0.8, 0, 0.8):
            d.ellipse([cx + dx * r - r * 0.28, cy - r * 0.25, cx + dx * r + r * 0.28, cy + r * 0.1],
                      fill=(110, 100, 95), outline=INK, width=lw)
        d.ellipse([cx - r * 0.6, cy - r * 0.35, cx + r * 0.6, cy - r * 0.05], fill=(240, 120, 40))
        # marmite en fonte
        body = [cx - r, cy - r * 1.9, cx + r, cy - r * 0.15]
        d.ellipse(body, fill=(38, 36, 40), outline=INK, width=lw)
        d.ellipse([cx - r * 0.95, cy - r * 2.05, cx + r * 0.95, cy - r * 1.6], fill=(25, 24, 28), outline=INK,
                  width=lw)
        d.arc([cx - r * 0.6, cy - r * 1.7, cx - r * 0.1, cy - r * 0.9], 180, 260, fill=(110, 110, 120),
              width=max(2, int(r * 0.08)))                      # reflet
        for side in (-1, 1):
            d.ellipse([cx + side * r * 1.0 - r * 0.15, cy - r * 1.55, cx + side * r * 1.0 + r * 0.15,
                       cy - r * 1.3], outline=INK, width=lw)
        if show_label and r > 30:
            from PIL import ImageFont
            try:
                f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(r * 0.36))
            except OSError:
                f = ImageFont.load_default()
            d.text((cx, cy - r * 1.0), label, fill=(245, 240, 225), font=f, anchor="mm")
        # vapeur (calque transparent mélangé)
        steam = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        ds = ImageDraw.Draw(steam)
        for i in range(3):
            ph = (t * 0.35 + i / 3) % 1
            vx = cx + math.sin(ph * 6 + i) * r * 0.3 + (i - 1) * r * 0.3
            vy = cy - r * 2.1 - ph * r * 2.2
            rr = r * (0.18 + ph * 0.3)
            ds.ellipse([vx - rr, vy - rr, vx + rr, vy + rr], fill=(255, 255, 255, int(110 * (1 - ph))))
        frame.alpha_composite(steam.filter(ImageFilter.GaussianBlur(max(1, r * 0.08))))
    return draw


# --- Mise en scène automatique (« réalisateur ») ------------------------------------------------

HEIGHTS = {"PETIT MAMADOU": 1.16, "PETIT MOUSSA": 1.1, "PETITE AYA": 1.0}


def _envelope(wav: Path, fps: int = FPS) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(wav), "-ac", "1", "-ar", "16000", "-f", "s16le",
                          "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.int16).astype(float) / 32768
    hop = 16000 // fps
    e = np.array([np.sqrt((x[i:i + hop] ** 2).mean()) for i in range(0, len(x), hop)] or [0])
    return np.clip(e / (np.percentile(e, 95) + 1e-6), 0, 1)


def name_is_kid(name) -> bool:
    return name in HEIGHTS


class Director:
    """Construit la timeline d'une vidéo à partir d'un kit (scènes, répliques, émotions) et des voix."""

    def __init__(self, kit: dict, workdir: Path, setting_bg: Path):
        from . import animatic
        self.kit, self.work = kit, workdir
        self.bg = Image.open(setting_bg).convert("RGB")
        self.bg_units = 7.0
        names = []
        for sc in kit["scenes"]:
            for n in sc["characters"]:
                if n not in names:
                    names.append(n)
        adults = [n for n in names if n not in HEIGHTS]
        kids = [n for n in names if n in HEIGHTS]
        self.actors = {}
        for k, n in enumerate(adults[:2]):
            self.actors[n] = Actor(Puppet(n, 1.72), x=-0.62 if k == 0 else 0.62, facing="right" if k == 0 else "left",
                                   phase=k * 1.7)
        for n in kids:
            # l'enfant n'est jamais retourné en miroir (texte sur le maillot) : il arrive par la gauche
            self.actors[n] = Actor(Puppet(n, HEIGHTS[n]), x=-0.12, facing="right", z=0.35, phase=4.0)
        self.lines, self.events, self.shots, self.poses, self.sfx, self.music_cuts = [], [], [], {}, [], []
        self.kid_entry = None
        t = 0.35
        for i, sc in enumerate(kit["scenes"]):
            emos = {n: animatic.emotion_for(n, sc["image_prompt"]) for n in sc["characters"]}
            beat = sc.get("beat", "")
            for j, line in enumerate(sc.get("dialogue") or []):
                wav = workdir / f"voice_{i:02d}_{j}.wav"
                from .wananim import _dur
                d = _dur(wav)
                if beat == "twist" and j == 0:
                    t += 0.2
                    self.kid_entry = (t - 0.2, t + 1.0)          # l'enfant arrive en courant
                    self.sfx += [("scratch_001.ogg", t - 0.25, 0.9)] + \
                        [(f"footstep_grass_00{k % 4}.ogg", t - 0.15 + k * 0.17, 0.5) for k in range(7)]
                    self.music_cuts.append((t - 0.2, t + 0.9))
                    t += 0.9
                self.lines.append(dict(scene=i, idx=j, speaker=line["speaker"], text=line["text"], start=t,
                                       end=t + d, wav=wav, beat=beat, emos=emos, cues=mouth_cues(wav),
                                       env=_envelope(wav), names=sc["characters"]))
                t += d + (0.22 if j < len(sc["dialogue"]) - 1 else 0.38)
        self.total = t + 1.8                                     # gel final
        self._plan()

    # -- émotions et réactions
    def _pose_at(self, name: str, t: float) -> str:
        sched = self.poses.get(name, [])
        p = "neutral"
        for ts, pose in sched:
            if ts <= t:
                p = pose
        return p

    def _set(self, name, t, pose):
        self.poses.setdefault(name, []).append((t, pose))

    def _head(self, name: str) -> float:
        a = self.actors[name]
        im, mouth, *_ = a.puppet.pose("neutral")
        return a.puppet.height * (1 + a.z * 0.35) * (1 - mouth[1] / im.height) + 0.05

    def _framing(self, kind: str, who: str | None = None, other: str | None = None) -> Cam:
        if kind == "WIDE":
            return Cam(0.0, 1.05, 3.1)
        if kind == "MED2":
            return Cam(0.0, 1.2, 2.15)
        a = self.actors[who]
        lead = (0.16 if a.facing == "right" else -0.16) * (0.4 if name_is_kid(who) else 1)
        hy = self._head(who)
        if kind == "MCU":
            return Cam(a.x + lead, hy - 0.3, 1.2)
        if kind == "CU":
            return Cam(a.x + lead * 0.5, hy - 0.12, 0.85)
        if kind == "OTS":
            o = self.actors[other]
            return Cam(a.x * 0.72 + o.x * 0.28, hy - 0.22, 1.45)
        return Cam(0, 1.1, 2.4)

    def _plan(self):
        shots, cyc = [], 0
        for n, L in enumerate(self.lines):
            sp, emo = L["speaker"], L["emos"].get(L["speaker"], "neutral")
            others = [x for x in L["names"] if x != sp and x in self.actors]
            lst = others[0] if others else None
            self._set(sp, L["start"] - 0.15, SPEAK_POSE.get(emo, emo))
            for o in others:                                     # réactions muettes des autres
                oe = L["emos"].get(o, "neutral")
                react = "shock" if (emo in ("neutral", "unimpressed", "smug") and o not in HEIGHTS
                                    and self.actors[o].x < 0) else SPEAK_POSE.get(oe, oe)
                self._set(o, L["start"] + 0.35 * (L["end"] - L["start"]), react)
            dur = L["end"] - L["start"]
            shout = "!" in L["text"]
            if n == 0:
                shots.append(dict(t=0.0, cam=self._framing("WIDE"), move=0.9, kind="WIDE"))
                shots.append(dict(t=L["start"] + 0.9, cam=self._framing("MCU", sp), move=0.93, punch=True,
                                  focus=sp))
                continue
            if L["beat"] == "twist":
                kid = sp
                shots.append(dict(t=self.kid_entry[0], cam=self._framing("MED2"), move=0.96, whip=True))
                shots.append(dict(t=L["start"] + 0.1, cam=self._framing("MCU", kid), move=0.9, punch=True,
                                  focus=kid))
                pot = Cam(0.0, 0.3, 0.7)
                ins = L["start"] + dur * 0.62
                shots.append(dict(t=ins, cam=pot, move=0.85, label=True, punch=True))
                self.sfx.append(("impactMetal_heavy_000.ogg", ins, 0.8))
                self.sfx.append(("impactBell_heavy_000.ogg", ins + 0.05, 0.5))
                shots.append(dict(t=L["end"] + 0.05, cam=self._framing("CU", others[-1] if others else sp),
                                  move=0.9, punch=True, focus=others[-1] if others else sp))
                for o in others:
                    self._set(o, L["start"] + dur * 0.7, "shock")
                continue
            if L["beat"] == "chute":
                shots.append(dict(t=L["start"] - 0.2, cam=self._framing("CU", sp), move=0.86, focus=sp))
                self._set(sp, L["start"] - 0.2, "shock")
                for o in others:
                    self._set(o, L["start"] + 0.4, "laugh")
                shots.append(dict(t=L["end"] + 0.15, cam=self._framing("CU", sp), move=1.0, freeze=True, focus=sp))
                self.sfx += [("impactBell_heavy_000.ogg", L["end"] + 0.15, 0.6), ("lowDown.ogg", L["end"] + 0.4, 0.7)]
                continue
            kinds = ["MCU", "OTS", "MED2", "CU"] if not shout else ["MCU", "OTS"]
            kind = kinds[cyc % len(kinds)]
            cyc += 1
            if kind == "MED2" and not lst:
                kind = "MCU"
            cam = self._framing(kind, sp, lst) if kind != "MED2" else self._framing("MED2")
            shots.append(dict(t=L["start"] - 0.12, cam=cam, move=0.93, punch=shout, focus=sp,
                              ots=lst if kind == "OTS" else None))
            if dur > 2.8 and lst:                                # coupe sur la réaction, la voix continue
                r0 = L["start"] + dur * 0.5
                shots.append(dict(t=r0, cam=self._framing("CU", lst), move=0.95, focus=lst))
                shots.append(dict(t=r0 + 0.85, cam=self._framing("MCU" if kind != "MCU" else "CU", sp), move=0.94,
                                  focus=sp))
            if self.lines[n - 1]["speaker"] != sp and n + 1 < len(self.lines) and dur < 2.5 and lst:
                shots.append(dict(t=L["end"] + 0.02, cam=self._framing("CU", lst), move=0.97, focus=lst))
        self.shots = sorted(shots, key=lambda s: s["t"])
        for n in self.actors:
            self.poses.setdefault(n, []).sort()

    def shot_at(self, t):
        cur = self.shots[0]
        for s in self.shots:
            if s["t"] <= t:
                cur = s
        nxt = next((s for s in self.shots if s["t"] > t), None)
        return cur, (nxt["t"] if nxt else self.total)

    def frame(self, f: int) -> Image.Image:
        t = f / FPS
        shot, t_end = self.shot_at(t)
        u = (t - shot["t"]) / max(0.01, t_end - shot["t"])
        base = shot["cam"]
        h = base.h * (1 + (shot["move"] - 1) * smooth(u))      # poussée lente
        if shot.get("punch"):
            h *= 1 + 0.14 * max(0, 1 - (t - shot["t"]) / 0.22)
        cx, cy = base.cx, base.cy
        shake = 0.0
        flash = 0.0
        if shot.get("freeze"):
            t_fr = shot["t"]
            h = base.h * (1 - 0.22 * smooth((t - t_fr) / 0.3))
            flash = max(0, 0.7 - (t - t_fr) / 0.12)
            t = t_fr                                            # l'image se fige
        if shot.get("whip"):
            prev = [s for s in self.shots if s["t"] < shot["t"]]
            if prev and t - shot["t"] < 0.22:
                k = smooth((t - shot["t"]) / 0.22)
                cx = prev[-1]["cam"].cx * (1 - k) + cx * k
        states = {}
        speaking = None
        for L in self.lines:
            if L["start"] <= t < L["end"]:
                speaking = L
        for name, a in self.actors.items():
            pose = self._pose_at(name, t)
            st = {"pose": pose, "mood": pose}
            changes = [ts for ts, _ in self.poses.get(name, []) if ts <= t]
            if changes and t - changes[-1] < 0.22:
                st["pop"] = math.sin((t - changes[-1]) / 0.22 * math.pi)
            if changes and pose == "shock" and 0 <= t - changes[-1] < 0.38:      # sursaut
                st["hop"] = 0.07 * math.sin((t - changes[-1]) / 0.38 * math.pi)
            if pose == "laugh":                                                  # rire secoué
                st["hop"] = 0.018 * abs(math.sin(t * 9 + a.phase))
                st["nod"] = -4 + 3 * math.sin(t * 9)
            if pose == "angry" and changes and h > 1.6:                          # pas vers l'autre (plans larges)
                k = smooth(min(1.0, (t - changes[-1]) / 0.45))
                st["dx"] = 0.07 * k * (1 if a.facing == "right" else -1)
            if speaking and speaking["speaker"] == name:
                lt = t - speaking["start"]
                cue = next((c for c in speaking["cues"] if c[0] <= lt < c[1]), None)
                st["talking"] = True
                st["shape"] = cue[2] if cue else "X"
                e = speaking["env"][min(len(speaking["env"]) - 1, int(lt * FPS))]
                st["nod"] = st.get("nod", 0.0) + 3.2 * e * math.sin(lt * 7.5)
                st["bob"] = e
                if pose == "angry" and e > 0.55:
                    st["shake"] = 0.7
                    shake = max(shake, 0.25 if "!" in speaking["text"] and lt < 0.5 else 0.0)
                st["lean"] = 1.5 if pose == "angry" else 0.0
            per = 3.1 + (a.phase % 1.7)
            st["blink"] = (t + a.phase) % per < 0.12 and pose != "shock" and not shot.get("freeze")
            states[name] = st
        # entrée de l'enfant en courant (petits sauts)
        for name, a in self.actors.items():
            if name in HEIGHTS and self.kid_entry:
                t0, t1 = self.kid_entry
                k = smooth((t - t0) / (t1 - t0))
                a.x = -2.6 * (1 - k) - 0.12 * k if t < t1 else -0.12
                states[name]["lean"] = 4 * (1 - k) if 0 < k < 1 else 0
                if 0 < k < 1:
                    states[name]["bob"] = abs(math.sin(t * 14))
        visible = [a for n, a in self.actors.items() if not (n in HEIGHTS and (not self.kid_entry or t < self.kid_entry[0]))]
        props = [pot_prop(0.0, size=0.34, show_label=bool(shot.get("label")))]
        if shot.get("label"):                                   # insert sur l'objet : rien devant
            visible = []
        cam = Cam(cx, cy, h, shake)
        saved = {}
        if shot.get("ots"):                                     # amorce par-dessus l'épaule : plus près, floue
            o = self.actors[shot["ots"]]
            saved = {"z": o.z}
            o.z = 1.1
        img = render(self.bg, self.bg_units, visible, states, cam, t, props, focus=shot.get("focus"), flash=flash)
        if saved:
            self.actors[shot["ots"]].z = saved["z"]
        return img


# --- Fabrication de la vidéo ----------------------------------------------------------------------

_DIR = None


def _render_range(args):
    a, b, dest = args
    proc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s",
                             f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium",
                             "-crf", "18", "-pix_fmt", "yuv420p", str(dest)], stdin=subprocess.PIPE)
    for f in range(a, b):
        proc.stdin.write(_DIR.frame(f).tobytes())
    proc.stdin.close()
    proc.wait()
    return dest


def _subtitles(director: "Director", dest: Path, hook: str) -> Path:
    from . import montage
    from .wananim import word_times
    head = ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "", "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, "
            "Outline, Shadow, Alignment, MarginL, MarginR, MarginV",
            "Style: Hook,DejaVu Sans,74,&H00FFFFFF,&H00000000,&H96000000,1,3,6,0,8,50,50,170",
            "Style: Word,DejaVu Sans,62,&H00FFFFFF,&H00000000,&H64000000,1,1,4,1,2,90,90,230", "",
            "[Events]", "Format: Layer, Start, End, Style, Text"]
    if hook:
        head.append(f"Dialogue: 1,{montage._ts(0)},{montage._ts(2.6)},Hook,{{\\fad(0,250)}}{montage._escape(hook.upper())}")
    for L in director.lines:
        words = [(w, L["start"] + a, L["start"] + b) for w, a, b in word_times(L["wav"], L["text"])]
        head += montage._word_events(words, 0.0)
    dest.write_text("\n".join(head) + "\n", encoding="utf-8")
    return dest


def make_video(kit: dict, workdir: Path, bg: Path, dest: Path, workers: int = 4) -> Path:
    """Vidéo 2D complète : images (en parallèle), son mixé, sous-titres mot à mot."""
    global _DIR
    from multiprocessing import get_context
    from . import sound2d
    _DIR = Director(kit, workdir, bg)
    n = int(_DIR.total * FPS)
    cuts = [n * k // workers for k in range(workers + 1)]
    parts = [(cuts[k], cuts[k + 1], workdir / f"part2d_{k}.mp4") for k in range(workers)]
    with get_context("fork").Pool(workers) as pool:
        files = pool.map(_render_range, parts)
    lst = workdir / "parts2d.txt"
    lst.write_text("".join(f"file '{p.resolve()}'\n" for p in files))
    video = workdir / "video2d.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy",
                    str(video)], check=True)
    audio = sound2d.mix(_DIR.total, [(L["wav"], L["start"]) for L in _DIR.lines], _DIR.sfx,
                        workdir / "mix2d.wav", _DIR.music_cuts)
    ass = _subtitles(_DIR, workdir / "subs2d.ass", kit.get("hook_text", ""))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-i", str(audio), "-vf", f"ass={ass}",
                    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(dest)], check=True)
    return dest
