"""Animation de personnages à partir d'IMAGES réalistes (générées par l'utilisateur) — sans carte graphique.

Chaque personnage = une image détourée (PNG transparent) + la position de sa bouche. Le moteur :
respiration, balancement, mâchoire qui s'ouvre au rythme exact de la voix, caméra qui suit celui
qui parle, tremblement sur les cris, gel final. Rendu ≈ quelques minutes par vidéo sur CPU.

Bibliothèque : assets/characters/<NOM>/<pose>.png + meta.json
  meta.json = {"<pose>": {"mouth": [x, y], "mouth_w": 40, "height": 1.0}}
Poses usuelles : neutral, angry, shock, smug, laugh (la plus proche de l'émotion est choisie).
"""
import json
import math
import subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from . import animatic, config

W, H, FPS = 1080, 1920, 24
ASSETS = Path(__file__).resolve().parent.parent / "assets"
EMO_FALLBACK = {"angry": ["angry", "neutral"], "shock": ["shock", "neutral"], "smug": ["smug", "neutral"],
                "laugh": ["laugh", "smug", "neutral"], "despair": ["despair", "shock", "neutral"],
                "sweat": ["sweat", "shock", "neutral"], "unimpressed": ["unimpressed", "neutral"],
                "neutral": ["neutral"]}


class Sprite:
    def __init__(self, name: str, emotion: str, target_h: int):
        folder = ASSETS / "characters" / name.replace(" ", "_")
        meta = json.loads((folder / "meta.json").read_text())
        pose = next((p for p in EMO_FALLBACK.get(emotion, ["neutral"]) if p in meta), next(iter(meta)))
        m = meta[pose]
        img = Image.open(folder / f"{pose}.png").convert("RGBA")
        bbox = img.getbbox()
        img = img.crop(bbox)
        k = target_h * m.get("height", 1.0) / img.height
        self.img = img.resize((int(img.width * k), int(img.height * k)), Image.LANCZOS)
        self.arr = np.array(self.img)
        self.mouth = ((m["mouth"][0] - bbox[0]) * k, (m["mouth"][1] - bbox[1]) * k)
        self.mouth_w = m.get("mouth_w", 40) * k
        self.faces = m.get("faces", "front")   # "left", "right" ou "front" : vers où regarde le personnage

    def face(self, direction: str) -> None:
        """Retourne l'image (effet miroir) pour que le personnage regarde vers `direction`."""
        if self.faces in ("left", "right") and direction in ("left", "right") and self.faces != direction:
            self.img = self.img.transpose(Image.FLIP_LEFT_RIGHT)
            self.arr = np.array(self.img)
            self.mouth = (self.img.width - self.mouth[0], self.mouth[1])
            self.faces = direction

    def frame(self, open_amt: float) -> Image.Image:
        """Image du personnage, mâchoire ouverte de `open_amt` (0 à 1)."""
        if open_amt < 0.05:
            return self.img
        a = self.arr
        mx, my, mw = self.mouth[0], self.mouth[1], self.mouth_w
        d = open_amt * mw * 0.42                       # descente de la mâchoire (px)
        x0, x1 = int(max(mx - mw * 1.3, 0)), int(min(mx + mw * 1.3, a.shape[1]))
        y0, y1 = int(max(my - mw * 0.2, 0)), int(min(my + mw * 1.9, a.shape[0]))
        sub = a[y0:y1, x0:x1]
        hh, ww = sub.shape[:2]
        ys, xs = np.mgrid[0:hh, 0:ww].astype(np.float32)
        gx = xs + x0 - mx
        wx = np.clip(1 - (np.abs(gx) / (mw * 1.25)) ** 2, 0, 1)            # fenêtre horizontale
        gy = ys + y0 - my
        start = np.clip((gy + mw * 0.05) / (mw * 0.12), 0, 1)              # à partir de la lèvre
        end = np.clip((mw * 1.9 - gy) / (mw * 1.0), 0, 1)                  # s'estompe vers le cou
        disp = d * wx * start * end
        warped = cv2.remap(sub, xs, ys - disp, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        out = a.copy()
        out[y0:y1, x0:x1] = warped
        img = Image.fromarray(out)
        # intérieur de la bouche (sombre) dans l'ouverture
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        dr = ImageDraw.Draw(layer)
        ow, oh = mw * 0.42, d * 0.55
        dr.ellipse([mx - ow, my - oh * 0.2, mx + ow, my + oh * 1.6], fill=(55, 12, 16, 235))
        dr.ellipse([mx - ow * 0.55, my + oh * 0.7, mx + ow * 0.55, my + oh * 1.5], fill=(170, 60, 70, 200))
        layer = layer.filter(ImageFilter.GaussianBlur(max(1, mw * 0.03)))
        img.alpha_composite(layer)
        return img


def background(setting: str, size=(W, H)) -> Image.Image:
    for ext in ("png", "jpg", "webp"):
        p = ASSETS / "backgrounds" / f"{setting}.{ext}"
        if p.exists():
            bg = Image.open(p).convert("RGB")
            k = max(size[0] / bg.width, size[1] / bg.height)
            bg = bg.resize((int(bg.width * k) + 1, int(bg.height * k) + 1), Image.LANCZOS)
            l, t = (bg.width - size[0]) // 2, (bg.height - size[1]) // 2
            return bg.crop((l, t, l + size[0], t + size[1]))
    return bokeh(setting, size)


def bokeh(setting: str, size=(W, H)) -> Image.Image:
    """Fond provisoire « arrière-plan de film » : dégradé chaud + lumières floues (en attendant un vrai décor)."""
    import random
    rnd = random.Random(setting)
    top, bottom = {"salon": ((40, 90, 100), (120, 80, 60)), "maquis": ((20, 15, 40), (90, 50, 40))}.get(
        setting, ((235, 170, 110), (150, 90, 50)))
    grad = np.linspace(0, 1, size[1])[:, None, None]
    arr = (np.array(top) * (1 - grad) + np.array(bottom) * grad).repeat(size[0], axis=1).astype(np.uint8)
    img = Image.fromarray(arr)
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    palette = [(255, 220, 150), (255, 170, 90), (250, 120, 80), (255, 240, 200), (120, 200, 160)]
    for _ in range(45):
        x, y, r = rnd.randint(0, size[0]), rnd.randint(0, int(size[1] * 0.75)), rnd.randint(40, 160)
        c = rnd.choice(palette)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(*c, rnd.randint(40, 110)))
    layer = layer.filter(ImageFilter.GaussianBlur(25))
    img = img.convert("RGBA")
    img.alpha_composite(layer)
    ground = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(ground).rectangle([0, int(size[1] * 0.8), size[0], size[1]], fill=(110, 70, 40, 140))
    img.alpha_composite(ground.filter(ImageFilter.GaussianBlur(40)))
    return img.convert("RGB")


def available(names) -> bool:
    return all((ASSETS / "characters" / n.replace(" ", "_") / "meta.json").exists() for n in names)


def render_clip(scene: dict, index: int, dest: Path, setting: str = "cour", is_last: bool = False,
                title: str = "", min_seconds: float = 8.0) -> Path:
    workdir = dest.parent
    lines = scene.get("dialogue") or []
    duration = animatic.needed_duration(lines, workdir, index, min_seconds)
    freeze = 1.5 if is_last else 0
    duration += freeze
    audio = animatic.build_audio(lines, workdir, index, duration)
    env = animatic.envelope(audio, FPS)
    events = [("dun", 0.0)] if scene.get("beat") == "twist" else []
    if scene.get("beat") == "hook":
        events.append(("whoosh", 0.0))
    if is_last:
        events.append(("boing", duration - freeze))
    audio = animatic.add_sfx(audio, events, workdir / f"audio_fx_{index:02d}.wav", duration)

    names = scene["characters"][:3]
    n = len(names)
    xs = {1: [0.5], 2: [0.25, 0.76], 3: [0.17, 0.5, 0.83]}[n]
    target_h = {1: 1500, 2: 1250, 3: 1050}[n]
    sprites = {nm: Sprite(nm, animatic.emotion_for(nm, scene["image_prompt"]), target_h) for nm in names}
    for k, nm in enumerate(names):  # les personnages se regardent
        sprites[nm].face("right" if xs[k] < 0.5 else "left" if xs[k] > 0.5 else "front")
    bg = background(setting).filter(ImageFilter.GaussianBlur(3))
    beat = scene.get("beat", "")

    proc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                             "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", str(audio), "-c:v", "libx264",
                             "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                             str(dest)], stdin=subprocess.PIPE)
    frames = int(duration * FPS)
    focus = None
    for f in range(frames):
        t = f / FPS
        frozen = is_last and t >= duration - freeze
        line = next((l for l in lines if l.get("start", 0) <= t < l.get("end", 0)), None)
        speaker = line["speaker"] if line else None
        img = bg.copy().convert("RGBA")
        anchors = {}
        order = sorted(names, key=lambda nm: nm == speaker)          # celui qui parle au premier plan
        for nm in order:
            sp = sprites[nm]
            k = names.index(nm)
            talking = speaker == nm and not frozen
            open_amt = env[f] if (talking and f < len(env)) else 0.0
            fr = sp.frame(open_amt)
            # respiration + balancement + petit rebond quand il parle
            breath = 1 + 0.008 * math.sin(t * 2.4 + k)
            bounce = (0.012 * open_amt) if talking else 0
            sc = breath + bounce
            fr = fr.resize((int(fr.width * sc), int(fr.height * sc)), Image.BILINEAR)
            ang = 1.2 * math.sin(t * 1.3 + k * 2) + (2.5 * math.sin(t * 7) if talking and open_amt > 0.3 else 0)
            fr = fr.rotate(ang, resample=Image.BILINEAR, expand=True, center=(fr.width / 2, fr.height))
            cx = int(W * xs[k] - fr.width / 2)
            cy = int(H - fr.height + 40)
            img.alpha_composite(fr, (max(min(cx, W - 50), -fr.width + 50), cy))
            anchors[nm] = (W * xs[k], cy + sp.mouth[1] * sc)
        # caméra
        if frozen:
            focus = focus or anchors[names[-1]]
            kz = min(1, (t - (duration - freeze)) / 0.18)
            z, fx, fy = 1 + 0.9 * kz, focus[0], focus[1] - 60
        else:
            z = 1.05 + 0.06 * t / duration + (0.22 * max(0, 1 - t / 0.3) if beat in ("twist", "chute") else 0)
            fx = (anchors[speaker][0] * 0.4 + W * 0.3) if speaker in anchors else W / 2
            fy = H * 0.52
            if line and "!" in line["text"] and t - line["start"] < 0.4:
                fx += 12 * math.sin(t * 90)
                fy += 9 * math.cos(t * 75)
        cw, ch = W / z, H / z
        x0 = min(max(fx - cw / 2, 0), W - cw)
        y0 = min(max(fy - ch / 2, 0), H - ch)
        out = img.convert("RGB").crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((W, H), Image.BILINEAR)
        if frozen and t - (duration - freeze) < 0.1:
            out = Image.blend(out, Image.new("RGB", (W, H), (255, 255, 255)), 0.5)
        proc.stdin.write(out.tobytes())
    proc.stdin.close()
    proc.wait()
    return dest
