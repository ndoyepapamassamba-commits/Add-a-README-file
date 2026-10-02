"""Aperçu animé gratuit (animatic) d'un kit : personnages dessinés, voix de synthèse, sans aucune API.

Sert à valider le rythme et les répliques d'un sketch avant de payer la génération IA (Veo, Grok, Kling).
"""
import math
import shutil
import subprocess
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 720, 1280, 15
GROUND = 1010
SKIN = (120, 72, 45)
SKIN_DARK = (92, 54, 33)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# Apparence simplifiée des personnages de la bible
LOOKS = {
    "MODOU": dict(height=420, width=120, top=(70, 140, 80), bottom=(120, 80, 50), hair=(25, 20, 20),
                  outfit="tshirt"),
    "BAYE": dict(height=430, width=200, top=(30, 70, 200), bottom=(30, 70, 200), hair=(150, 150, 150),
                 outfit="boubou", trim=(235, 190, 60)),
    "TANTIE AWA": dict(height=410, width=190, top=(245, 140, 30), bottom=(250, 210, 40),
                       hair=(245, 140, 30), outfit="dress", headwrap=True),
    "PETIT MAMADOU": dict(height=270, width=105, top=(250, 215, 40), bottom=(40, 60, 140),
                          hair=(25, 20, 20), outfit="jersey"),
    "COUMBA": dict(height=400, width=130, top=(220, 80, 160), bottom=(130, 60, 170), hair=(30, 20, 20),
                   outfit="dress", braids=True),
    "TONTON DIENG": dict(height=420, width=150, top=(240, 120, 90), bottom=(60, 60, 70),
                         hair=(40, 40, 40), outfit="shirt", cap=(90, 80, 60)),
}
DEFAULT_LOOK = dict(height=400, width=140, top=(200, 60, 60), bottom=(60, 60, 60), hair=(30, 20, 20),
                    outfit="tshirt")

VOICES = {  # espeak-ng : voix, hauteur, vitesse (voix MBROLA plus naturelles si installées)
    "MODOU": ("fr+m3", 45, 160), "BAYE": ("fr+m1", 25, 145), "TANTIE AWA": ("fr+f2", 50, 160),
    "PETIT MAMADOU": ("fr+f4", 85, 175), "COUMBA": ("fr+f3", 60, 155), "TONTON DIENG": ("fr+m2", 35, 170),
}
MBROLA_VOICES = {
    "MODOU": ("mb-fr1", 55, 165), "BAYE": ("mb-fr1", 20, 135), "TANTIE AWA": ("mb-fr4", 35, 160),
    "PETIT MAMADOU": ("mb-fr4", 95, 180), "COUMBA": ("mb-fr4", 55, 150), "TONTON DIENG": ("mb-fr1", 40, 175),
}
if Path("/usr/share/mbrola/fr1").exists() or Path("/usr/share/mbrola/fr1/fr1").exists():
    VOICES = MBROLA_VOICES

BACKGROUNDS = {
    "cour": dict(sky=((250, 200, 120), (255, 235, 190)), wall=(200, 120, 60), ground=(225, 190, 130)),
    "salon": dict(sky=((40, 140, 140), (60, 160, 160)), wall=(40, 140, 140), ground=(150, 100, 70)),
    "plage": dict(sky=((90, 180, 240), (190, 230, 250)), wall=None, ground=(240, 215, 160)),
    "marche": dict(sky=((250, 190, 110), (255, 230, 180)), wall=(210, 90, 60), ground=(200, 160, 110)),
    "village": dict(sky=((250, 180, 100), (255, 225, 170)), wall=None, ground=(190, 90, 50)),
    "ceremonie": dict(sky=((250, 210, 140), (255, 240, 200)), wall=(230, 230, 240), ground=(220, 190, 140)),
}

EMOTION_KEYS = [
    ("shock", ["shock", "bulging", "jaw dropped"]),
    ("laugh", ["laughing"]),
    ("angry", ["furious", "pointing"]),
    ("despair", ["despair", "hands on head"]),
    ("sweat", ["sweating", "nervous"]),
    ("smug", ["smug", "innocent", "cheeky", "oath"]),
    ("unimpressed", ["unimpressed", "arms crossed", "side-eye", "judgmental"]),
]


def _font(size):
    return ImageFont.truetype(FONT, size)


def emotion_for(name: str, image_prompt: str) -> str:
    """Repère l'émotion du personnage dans la phrase du prompt image qui le décrit."""
    text = image_prompt
    for sentence in image_prompt.split("."):
        if name.split()[0] in sentence.upper() and ":" in sentence:
            text = sentence
            break
    low = text.lower()
    for emo, keys in EMOTION_KEYS:
        if any(k in low for k in keys):
            return emo
    return "neutral"


# --- Décor -------------------------------------------------------------------

def draw_background(img: Image.Image, setting: str, prompt: str):
    d = ImageDraw.Draw(img)
    bg = BACKGROUNDS.get(setting, BACKGROUNDS["cour"])
    top, bot = bg["sky"]
    for y in range(GROUND):
        k = y / GROUND
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * k) for i in range(3)))
    if setting == "plage":
        d.rectangle([0, 720, W, GROUND], fill=(40, 150, 200))
        for x in (90, 620):
            d.line([(x, GROUND), (x + 20, 560)], fill=(120, 80, 40), width=18)
            for a in range(0, 360, 60):
                d.line([(x + 20, 560), (x + 20 + 90 * math.cos(math.radians(a)),
                                        560 + 40 * math.sin(math.radians(a)))], fill=(40, 140, 60), width=14)
    elif setting == "village":
        d.ellipse([480, 380, 720, 600], fill=(60, 130, 60))
        d.rectangle([575, 560, 625, GROUND], fill=(110, 80, 50))
        d.polygon([(40, 760), (180, 620), (320, 760)], fill=(180, 150, 70))
        d.rectangle([70, 760, 290, 900], fill=(170, 110, 60))
    if bg["wall"]:
        d.rectangle([0, 600, W, GROUND], fill=bg["wall"])
        if setting in ("cour", "marche"):
            for row, y in enumerate(range(610, GROUND, 45)):
                for x in range(-60 if row % 2 else 0, W, 120):
                    d.rectangle([x + 4, y + 4, x + 116, y + 41], outline=tuple(c - 25 for c in bg["wall"]),
                                width=2)
        if setting == "cour":
            d.line([(40, 640), (680, 660)], fill=(80, 80, 80), width=3)
            for x, c in ((140, (220, 60, 60)), (300, (60, 120, 220)), (470, (250, 200, 40))):
                d.rectangle([x, 645, x + 70, 730], fill=c)
        if setting == "salon":
            d.rectangle([60, 650, 200, 760], fill=(240, 220, 180), outline=(90, 60, 30), width=8)
            d.rectangle([480, 700, 660, 840], fill=(40, 40, 40))
    d.rectangle([0, GROUND, W, H], fill=bg["ground"])
    for x in range(0, W, 37):
        d.ellipse([x, GROUND + 40 + (x * 7) % 200, x + 6, GROUND + 46 + (x * 7) % 200],
                  fill=tuple(c - 30 for c in bg["ground"]))
    draw_props(d, prompt.lower())


def draw_props(d: ImageDraw.ImageDraw, p: str):
    if "ram" in p or "mouton" in p:
        x, y = 520, 930
        d.line([(x - 80, y - 120), (x - 80, GROUND + 20)], fill=(110, 80, 50), width=10)
        for dx, dy in ((0, 0), (40, -10), (80, 0), (20, -40), (60, -40)):
            d.ellipse([x + dx - 40, y + dy - 40, x + dx + 50, y + dy + 40], fill=(245, 245, 240))
        for lx in (x - 10, x + 20, x + 70, x + 100):
            d.rectangle([lx, y + 30, lx + 12, GROUND + 25], fill=(60, 50, 45))
        d.ellipse([x - 70, y - 60, x - 10, y], fill=(235, 230, 225))
        d.ellipse([x - 58, y - 40, x - 48, y - 30], fill=(20, 20, 20))
        d.arc([x - 75, y - 70, x - 35, y - 20], 120, 300, fill=(160, 120, 80), width=8)
        if "ribbon" in p:
            d.rectangle([x - 20, y - 15, x - 5, y + 15], fill=(220, 30, 40))
    if "air conditioner" in p:
        d.rectangle([40, 830, 200, GROUND + 10], fill=(235, 225, 200), outline=(120, 100, 70), width=4)
        d.text((55, 880), "CLIM\nNEUVE", fill=(30, 70, 200), font=_font(28))
    if "receipt" in p:
        pass  # dessiné dans la main de l'enfant
    if "chicken" in p:
        d.ellipse([260, GROUND - 20, 360, GROUND + 15], fill=(250, 250, 250))
        d.ellipse([280, GROUND - 35, 340, GROUND], fill=(190, 110, 40))


# --- Personnages ---------------------------------------------------------------

def draw_character(img, name, cx, emotion, t, speaking, facing, prompt):
    look = LOOKS.get(name, DEFAULT_LOOK)
    d = ImageDraw.Draw(img)
    h, w = look["height"], look["width"]
    bob = math.sin(t * 9) * 6 if speaking else math.sin(t * 2) * 2
    if emotion == "laugh":
        bob = math.sin(t * 14) * 8
    base = GROUND + 20
    head_r = int(h * 0.22)
    body_top = base - int(h * 0.62) + bob
    head_cy = body_top - head_r + 10
    leg_h = int(h * 0.25)

    # jambes
    if look["outfit"] not in ("boubou", "dress"):
        for lx in (cx - w * 0.28, cx + w * 0.08):
            d.rectangle([lx, base - leg_h, lx + w * 0.22, base], fill=look["bottom"])
            d.ellipse([lx - 6, base - 8, lx + w * 0.22 + 10, base + 10], fill=(40, 40, 40))
    # corps
    body_bot = base - leg_h + 10 if look["outfit"] not in ("boubou", "dress") else base
    if look["outfit"] in ("boubou", "dress"):
        d.polygon([(cx - w * 0.38, body_top), (cx + w * 0.38, body_top),
                   (cx + w * 0.55, body_bot), (cx - w * 0.55, body_bot)], fill=look["top"])
        if look["outfit"] == "dress":
            d.rectangle([cx - w * 0.5, body_bot - 120, cx + w * 0.5, body_bot - 90], fill=look["bottom"])
        if "trim" in look:
            d.line([(cx - 40, body_top + 5), (cx, body_top + 90), (cx + 40, body_top + 5)],
                   fill=look["trim"], width=8)
            for k in range(4):
                d.ellipse([cx - 8, body_top + 100 + k * 30, cx + 8, body_top + 116 + k * 30],
                          fill=look["trim"])
        for fx in (cx - w * 0.3, cx + w * 0.1):
            d.ellipse([fx, base - 10, fx + 40, base + 8], fill=(40, 40, 40))
    else:
        d.rounded_rectangle([cx - w / 2, body_top, cx + w / 2, body_bot], radius=25, fill=look["top"])
        if look["outfit"] == "jersey":
            d.text((cx - 20, body_top + 30), "10", fill=(30, 60, 160), font=_font(46))
        if look["outfit"] == "shirt":
            d.polygon([(cx - 22, body_top), (cx + 22, body_top), (cx, body_top + 70)], fill=(250, 250, 250))
            for k in range(5):
                d.ellipse([cx - w / 2 + 15 + k * 25, body_top + 40 + (k % 2) * 50,
                           cx - w / 2 + 35 + k * 25, body_top + 60 + (k % 2) * 50], fill=(250, 220, 80))

    # bras selon l'émotion
    sx_l, sx_r, sy = cx - w * 0.45, cx + w * 0.45, body_top + 25
    arm = 16 if h > 300 else 12
    reach = int(h * 0.32)

    def limb(x0, y0, x1, y1):
        d.line([(x0, y0), (x1, y1)], fill=look["top"], width=arm + 10)
        d.ellipse([x1 - 13, y1 - 13, x1 + 13, y1 + 13], fill=SKIN)

    if emotion == "angry":
        limb(sx_l, sy, sx_l - 20, sy + reach)
        tx = cx + facing * (w * 0.5 + reach)
        limb(cx + facing * w * 0.45, sy, tx, sy - 30 + math.sin(t * 12) * 10)
    elif emotion == "despair":
        limb(sx_l, sy, cx - head_r * 0.9, head_cy - head_r * 0.4)
        limb(sx_r, sy, cx + head_r * 0.9, head_cy - head_r * 0.4)
    elif emotion == "smug":
        limb(sx_l, sy, sx_l - reach * 0.8, sy + reach * 0.5)
        limb(sx_r, sy, sx_r + reach * 0.8, sy + reach * 0.5)
        if name == "BAYE":
            for k in range(8):
                a = k * math.pi / 4
                d.ellipse([sx_r + reach * 0.8 + 18 * math.cos(a) - 5, sy + reach * 0.5 + 25 + 18 * math.sin(a) - 5,
                           sx_r + reach * 0.8 + 18 * math.cos(a) + 5, sy + reach * 0.5 + 25 + 18 * math.sin(a) + 5],
                          fill=(110, 60, 30))
    elif emotion == "unimpressed":
        d.rounded_rectangle([cx - w * 0.5, sy + 40, cx + w * 0.5, sy + 70], radius=14, fill=look["top"])
    elif emotion == "shock":
        limb(sx_l, sy, sx_l - reach * 0.6, sy - reach * 0.6)
        limb(sx_r, sy, sx_r + reach * 0.6, sy - reach * 0.6)
    elif emotion == "laugh":
        limb(sx_l, sy, cx - 10, sy + 80)
        limb(sx_r, sy, cx + 10, sy + 80)
    else:
        limb(sx_l, sy, sx_l - 10, sy + reach)
        limb(sx_r, sy, sx_r + 10, sy + reach)
    if name == "PETIT MAMADOU" and "receipt" in prompt.lower():
        rx = cx + facing * (w * 0.5 + 40)
        d.rectangle([rx - 30, sy - 70, rx + 30, sy + 10], fill=(255, 255, 250), outline=(80, 80, 80), width=2)
        d.text((rx - 26, sy - 60), "REÇU\n50 000F", fill=(200, 0, 0), font=_font(13))
        limb(cx + facing * w * 0.45, sy, rx, sy - 20)

    # tête
    d.rectangle([cx - 18, head_cy + head_r - 10, cx + 18, body_top + 5], fill=SKIN_DARK)
    d.ellipse([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r], fill=SKIN)
    d.ellipse([cx - head_r - 12, head_cy - 15, cx - head_r + 12, head_cy + 20], fill=SKIN_DARK)
    d.ellipse([cx + head_r - 12, head_cy - 15, cx + head_r + 12, head_cy + 20], fill=SKIN_DARK)
    if look.get("headwrap"):
        d.ellipse([cx - head_r - 10, head_cy - head_r - 70, cx + head_r + 10, head_cy - head_r * 0.2],
                  fill=look["hair"])
    elif look.get("cap"):
        d.chord([cx - head_r, head_cy - head_r - 10, cx + head_r, head_cy + 10], 180, 360, fill=look["cap"])
        d.rectangle([cx + facing * 10 - 0, head_cy - 18, cx + facing * (head_r + 30), head_cy - 6],
                    fill=look["cap"])
    else:
        d.chord([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r * 0.2], 180, 360,
                fill=look["hair"])
    if look.get("braids"):
        for k in range(-3, 4):
            d.line([(cx + k * 14, head_cy - head_r + 5), (cx + k * 22, head_cy + head_r + 40)],
                   fill=look["hair"], width=8)

    # yeux
    eye_r = head_r * (0.36 if emotion == "shock" else 0.24)
    ey = head_cy - head_r * 0.05
    look_dx = facing * eye_r * 0.35
    if emotion == "shock" and t > 0 and facing == 0:
        look_dx = 0
    for ex in (cx - head_r * 0.38, cx + head_r * 0.38):
        if emotion == "laugh":
            d.arc([ex - eye_r, ey - eye_r * 0.5, ex + eye_r, ey + eye_r], 200, 340, fill=(20, 20, 20), width=5)
            continue
        d.ellipse([ex - eye_r, ey - eye_r, ex + eye_r, ey + eye_r], fill=(255, 255, 255), outline=(30, 20, 20),
                  width=2)
        pr = eye_r * (0.35 if emotion == "shock" else 0.5)
        d.ellipse([ex + look_dx - pr, ey - pr, ex + look_dx + pr, ey + pr], fill=(30, 20, 15))
        if emotion in ("smug", "unimpressed"):
            d.rectangle([ex - eye_r - 2, ey - eye_r - 2, ex + eye_r + 2, ey - eye_r * 0.1], fill=SKIN)
            d.line([(ex - eye_r, ey - eye_r * 0.1), (ex + eye_r, ey - eye_r * 0.1)], fill=(30, 20, 20), width=3)
    # sourcils
    brow_y = ey - eye_r - 14
    for side, ex in ((-1, cx - head_r * 0.38), (1, cx + head_r * 0.38)):
        tilt = {"angry": 14, "despair": -14, "sweat": -10, "shock": -4}.get(emotion, 0) * side * -1
        if emotion == "unimpressed" and side == 1:
            tilt, brow_y2 = 0, brow_y - 14
        else:
            brow_y2 = brow_y
        d.line([(ex - eye_r, brow_y2 - tilt), (ex + eye_r, brow_y2 + tilt)], fill=(25, 15, 10), width=7)
    # bouche
    my = head_cy + head_r * 0.5
    open_amt = (abs(math.sin(t * 16)) * 0.8 + 0.2) if speaking else 0
    if emotion == "shock":
        d.ellipse([cx - head_r * 0.22, my - head_r * 0.15, cx + head_r * 0.22, my + head_r * 0.45],
                  fill=(60, 10, 10))
    elif emotion == "laugh":
        d.chord([cx - head_r * 0.45, my - head_r * 0.25, cx + head_r * 0.45, my + head_r * 0.4], 0, 180,
                fill=(70, 10, 10))
    elif speaking:
        mh = head_r * 0.08 + head_r * 0.28 * open_amt
        d.ellipse([cx - head_r * 0.25, my - mh / 2, cx + head_r * 0.25, my + mh / 2], fill=(70, 10, 10))
    elif emotion in ("smug",):
        d.arc([cx - head_r * 0.35 + facing * 10, my - head_r * 0.3, cx + head_r * 0.35 + facing * 10, my + head_r * 0.1],
              20, 160, fill=(40, 10, 10), width=6)
    elif emotion in ("angry", "despair", "unimpressed"):
        d.arc([cx - head_r * 0.3, my, cx + head_r * 0.3, my + head_r * 0.35], 200, 340, fill=(40, 10, 10), width=6)
    elif emotion == "sweat":
        d.rectangle([cx - head_r * 0.35, my, cx + head_r * 0.35, my + head_r * 0.15], fill=(250, 250, 250),
                    outline=(40, 10, 10), width=3)
    else:
        d.arc([cx - head_r * 0.3, my - head_r * 0.2, cx + head_r * 0.3, my + head_r * 0.15], 20, 160,
              fill=(40, 10, 10), width=6)
    if emotion == "sweat":
        for k, (sx, sy2) in enumerate(((cx + head_r * 0.8, head_cy - head_r * 0.6), (cx - head_r * 0.9, head_cy))):
            yy = sy2 + (t * 60 + k * 30) % 50
            d.ellipse([sx - 8, yy - 12, sx + 8, yy + 12], fill=(140, 200, 255))
    if emotion == "angry":
        x0, y0 = cx + head_r * 0.6, head_cy - head_r * 1.1
        for a in (0, 90, 180, 270):
            d.arc([x0 - 14, y0 - 14, x0 + 14, y0 + 14], a + 20, a + 70, fill=(220, 20, 20), width=6)
    return (cx, head_cy, head_r)


# --- Audio ---------------------------------------------------------------------

def tts(line: dict, dest: Path) -> float:
    """Synthèse vocale d'une réplique ; renvoie sa durée (0 si muette). Réutilise le fichier s'il existe."""
    if dest.exists() and dest.stat().st_size > 1000:
        with wave.open(str(dest)) as w:
            return w.getnframes() / w.getframerate()
    text = line["text"].strip().strip(".…").strip()
    if not text:
        return 0.0
    from . import config, voices_local
    if config.VOICE_MODE == "local" and voices_local.available():
        voices_local.speak(line["speaker"], line["text"].strip(), dest)
        with wave.open(str(dest)) as w:
            return w.getnframes() / w.getframerate()
    if not shutil.which("espeak-ng"):
        return 0.0
    voice, pitch, speed = VOICES.get(line["speaker"], ("fr", 50, 160))
    if "!" in text:  # répliques criées : plus aiguës et plus rapides
        pitch, speed = min(99, pitch + 15), speed + 15
    subprocess.run(["espeak-ng", "-v", voice, "-p", str(pitch), "-s", str(speed), "-w", str(dest), text],
                   check=True, capture_output=True)
    with wave.open(str(dest)) as w:
        return w.getnframes() / w.getframerate()


def build_audio(lines, workdir: Path, index: int, total: float) -> Path:
    t = 0.4
    inputs, filters = [], []
    for j, line in enumerate(lines):
        wav = workdir / f"voice_{index:02d}_{j}.wav"
        dur = tts(line, wav)
        span = dur if dur else 1.2
        line["start"], line["end"] = t, t + span
        if dur:
            inputs += ["-i", str(wav)]
            filters.append(f"[{len(filters)}:a]adelay={int(t * 1000)}|{int(t * 1000)},volume=1.6[a{len(filters)}]")
        t += span + 0.3
    out = workdir / f"audio_{index:02d}.wav"
    if not filters:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                        f"anullsrc=r=22050:cl=mono", "-t", f"{total}", str(out)], check=True)
        return out
    mix = ";".join(filters) + ";" + "".join(f"[a{k}]" for k in range(len(filters))) + \
        f"amix=inputs={len(filters)}:normalize=0,apad=whole_dur={total}[out]"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", mix,
                    "-map", "[out]", "-t", f"{total}", str(out)], check=True)
    return out


def needed_duration(lines, workdir: Path, index: int, minimum: float) -> float:
    total = 0.4
    for j, line in enumerate(lines):
        dur = tts(line, workdir / f"voice_{index:02d}_{j}.wav")
        total += (dur or 1.2) + 0.3
    return max(minimum, total + 0.6)


# --- Rendu d'une scène ----------------------------------------------------------

def render_clip(scene: dict, index: int, dest: Path, setting: str = "cour", is_last: bool = False,
                title: str = "", min_seconds: float = 8.0) -> Path:
    workdir = dest.parent
    lines = scene.get("dialogue") or []
    duration = needed_duration(lines, workdir, index, min_seconds)
    freeze = 1.6 if is_last else 0
    duration += freeze
    audio = build_audio(lines, workdir, index, duration)

    names = scene["characters"][:3]
    n = len(names)
    xs = {1: [360], 2: [220, 500], 3: [150, 370, 590]}[n] if n else []
    emotions = {nm: emotion_for(nm, scene["image_prompt"]) for nm in names}
    beat = scene.get("beat", "")

    bg = Image.new("RGB", (W, H))
    draw_background(bg, setting, scene["image_prompt"])

    proc = subprocess.Popen([
        "ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
        "-r", str(FPS), "-i", "-", "-i", str(audio), "-c:v", "libx264", "-preset", "veryfast",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(dest)], stdin=subprocess.PIPE)

    frames = int(duration * FPS)
    focus = None
    for f in range(frames):
        t = f / FPS
        frozen = is_last and t >= duration - freeze
        img = bg.copy()
        speaker = next((l["speaker"] for l in lines if l.get("start", 0) <= t < l.get("end", 0)), None)
        heads = {}
        for k, nm in enumerate(names):
            facing = 1 if xs[k] < 360 else -1 if xs[k] > 360 else 0
            emo = emotions[nm]
            if frozen and nm == names[-1]:
                emo, facing = "shock", 0
            heads[nm] = draw_character(img, nm, xs[k], emo, 0 if frozen else t, speaker == nm and not frozen,
                                       facing, scene["image_prompt"])
        d = ImageDraw.Draw(img)
        d.text((20, 18), "@comedyvideos_100", fill=(255, 255, 255), font=_font(26),
               stroke_width=3, stroke_fill=(0, 0, 0))
        if title:
            d.text((W - 20, 18), title, fill=(255, 230, 0), font=_font(24), anchor="ra",
                   stroke_width=3, stroke_fill=(0, 0, 0))
        if beat == "twist" and t < 0.5:
            d.rectangle([0, 0, W, H], outline=(255, 255, 255), width=int(40 * (1 - t / 0.5)) + 1)

        # caméra : léger zoom avant, plus fort et centré sur le visage au gel final
        if frozen:
            focus = focus or heads[names[-1]]
            k = min(1, (t - (duration - freeze)) / 0.25)
            z = 1 + 0.9 * k
            fx, fy = focus[0], focus[1]
        else:
            z = 1 + 0.06 * (t / duration) + (0.08 if beat in ("twist", "chute") and t < 0.3 else 0)
            fx, fy = W / 2, H * 0.62
        cw, ch = W / z, H / z
        x0 = min(max(fx - cw / 2, 0), W - cw)
        y0 = min(max(fy - ch / 2, 0), H - ch)
        frame = img.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((W, H))
        if frozen and t - (duration - freeze) < 0.12:
            frame = Image.blend(frame, Image.new("RGB", (W, H), (255, 255, 255)), 0.6)
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    proc.wait()
    return dest
