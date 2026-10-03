"""Vraie animation IA, gratuite : Wan 2.2 (HuggingFace ZeroGPU) + voix Chatterbox + montage.

Pour chaque réplique du kit :
  1. voix Chatterbox (voix de référence state/voice_refs/<PERSO>.wav, accent africain) ;
  2. image de départ : le personnage qui parle en plan rapproché, l'autre en amorce, sur le décor ;
  3. Wan 2.2 image→vidéo (Space ZeroGPU) anime le plan : gestes, expressions, bouche qui parle, caméra ;
  4. le plan est calé sur la durée de la voix, puis tout est monté (sous-titres, accroche).

Le jeton HuggingFace (HF_TOKEN, « Read » suffit) donne droit au quota ZeroGPU du compte.
Chaque plan est mis en cache dans le dossier de travail : relancer reprend là où le quota s'est arrêté.
"""
import json
import shutil
import subprocess
import time
from pathlib import Path

from . import config

WAN_SPACE = "zerogpu-aoti/wan2-2-fp8da-aoti-faster"
KIDS = {"PETIT MAMADOU", "PETIT MOUSSA", "PETITE AYA", "PETIT IBRAHIMA", "PETITE KHADIJA"}
SR = 44100


class QuotaError(RuntimeError):
    """Quota ZeroGPU du jour épuisé : relancer plus tard (les plans déjà faits sont gardés)."""


# --- Voix -----------------------------------------------------------------------------------

def _dur(path: Path) -> float:
    import soundfile as sf
    return sf.info(str(path)).duration


_ASR = None


def _norm(text: str) -> str:
    import re
    import unicodedata
    t = unicodedata.normalize("NFD", text.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", t).split())


def heard(path: Path) -> str:
    """Ce que Whisper entend (contrôle qualité des voix : phrase complète, sans mots inventés)."""
    global _ASR
    if _ASR is None:
        from transformers import pipeline
        _ASR = pipeline("automatic-speech-recognition", model="openai/whisper-small", device="cpu")
    return _ASR(str(path), generate_kwargs={"language": "french", "task": "transcribe"})["text"].strip()


def _similar(a: str, b: str) -> float:
    import difflib
    return difflib.SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def voice(line: dict, dest: Path, tries: int = 4) -> float:
    """Voix Chatterbox d'une réplique, vérifiée par Whisper (on garde la meilleure prise), silences coupés,
    volume égalisé ; renvoie sa durée (s)."""
    if dest.exists():
        return _dur(dest)
    import torch
    from . import voices_local
    text = line["text"].strip()
    best = (-1.0, None)
    for k in range(tries):  # Chatterbox coupe parfois la phrase, bafouille ou invente une fin
        raw = dest.with_name(f"{dest.stem}_take{k}.wav")
        torch.manual_seed(1000 + k)
        voices_local.speak(line["speaker"], text, raw)
        score = _similar(text, heard(raw))
        if score > best[0]:
            best = (score, raw)
        if score >= 0.9:
            break
    line["voice_score"] = round(best[0], 2)
    trim = ("silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
            "silenceremove=start_periods=1:start_threshold=-45dB,areverse")
    af = trim + ",loudnorm=I=-16:TP=-1.5:LRA=11"
    if line["speaker"] in KIDS:  # voix d'enfant : plus aiguë (formants compris), même débit
        af = "aresample=24000,asetrate=24000*1.18,aresample=24000,atempo=0.847," + af
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(best[1]), "-af", af, "-ar", str(SR), "-ac", "1",
                    str(dest)], check=True)
    return _dur(dest)


def voice_kit(kit: dict, workdir: Path) -> None:
    for i, scene in enumerate(kit["scenes"]):
        for j, line in enumerate(scene.get("dialogue") or []):
            d = voice(line, workdir / f"voice_{i:02d}_{j}.wav")
            print(f"  voix {i + 1}.{j + 1} {line['speaker']:<14} {d:4.1f} s  {line['text']}  "
                  f"(contrôle {line.get('voice_score', '-')})", flush=True)


# --- Plans (images de départ) ----------------------------------------------------------------

CW, CH = 720, 1248            # proportions exactes de Wan 2.2 (480×832) : rien n'est recadré
W, H, FPS = 1080, 1920, 24    # format final TikTok

LOOKS = {  # description visuelle courte (pour que Wan sache qui est qui)
    "MAMAN NOUNOU": "the plump grandmother in the red headwrap and green checkered apron",
    "COUMBA": "the young woman with long braids in the pink dress",
    "PETIT MAMADOU": "the little boy in the yellow football jersey",
    "TANTIE AWA": "the large woman in the orange headwrap",
    "KOFFI": "the young man with sunglasses and gold chain",
}
ACTING = {  # jeu du personnage qui parle, selon son émotion
    "angry": "is furious: she shakes her pointing finger and scolds loudly",
    "shock": "is in cartoon shock, eyes wide, then stammers an excuse with a nervous forced smile",
    "smug": "shrugs with open palms and a smug, cheeky grin",
    "laugh": "laughs proudly, swaying, very pleased with herself",
    "despair": "holds her head in despair",
    "sweat": "sweats nervously with a forced smile",
    "unimpressed": "raises one eyebrow and answers calmly with a cold, ironic polite smile",
    "neutral": "answers calmly with an ironic polite smile",
}
LISTENING = {
    "angry": "glares", "shock": "stares in shock", "smug": "smirks", "laugh": "giggles",
    "unimpressed": "listens, unimpressed, arms crossed", "neutral": "listens with a raised eyebrow",
}


def _look(name: str) -> str:
    return LOOKS.get(name, f"{name.title()}")


def _clean(sprite_img):
    """Bords du détourage : on rogne d'1 px et on retire le reflet vert de l'ancien fond."""
    import numpy as np
    from PIL import Image, ImageFilter
    r, g, b, a = sprite_img.split()
    a = a.filter(ImageFilter.MinFilter(3))
    arr = np.array(Image.merge("RGBA", (r, g, b, a))).astype(np.int16)
    edge = arr[..., 3] < 250
    cap = np.maximum(arr[..., 0], arr[..., 2]) + 12
    arr[..., 1] = np.where(edge & (arr[..., 1] > cap), cap, arr[..., 1])
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), "RGBA")


def compose(names: list[str], speaker: str, emotions: dict, setting: str, dest: Path) -> Path:
    """Plan rapproché sur celui qui parle ; les autres en amorce floue (règle des 180° respectée)."""
    from PIL import ImageFilter
    from . import photoanim as pa
    if dest.exists():
        return dest
    img = pa.background(setting, (CW, CH)).filter(ImageFilter.GaussianBlur(4)).convert("RGBA")
    others = [n for n in names if n != speaker]
    centre = len(names) == 3                              # à trois : celui qui parle au milieu
    if centre:
        left_of = {others[0]: True, others[1]: False}
        on_left = False
    else:                                                 # à deux : chacun garde son côté (gauche → droite)
        on_left = names.index(speaker) == 0 if speaker in names else True
        left_of = {n: not on_left for n in others}
    for n in others:                                     # amorces, floues, derrière
        left = left_of[n]
        sp = pa.Sprite(n, emotions.get(n, "neutral"), 1700)
        sp.face("right" if left else "left")
        im = _clean(sp.img).filter(ImageFilter.GaussianBlur(3))
        x = int(CW * (0.08 if left else 0.92) - sp.mouth[0])
        y = int(CH * 0.30 - sp.mouth[1])
        img.alpha_composite(im, (x, y))
    sp = pa.Sprite(speaker, emotions.get(speaker, "neutral"), 2100)
    sp.face("front" if centre else ("right" if on_left else "left"))
    x_m = CW * (0.5 if centre else (0.40 if on_left else 0.60))
    y_m = CH * 0.42
    img.alpha_composite(_clean(sp.img), (int(x_m - sp.mouth[0]), int(y_m - sp.mouth[1])))
    img.convert("RGB").save(dest)
    return dest


def shot_prompt(speaker: str, emotion: str, listeners: dict, beat: str) -> str:
    act = ACTING.get(emotion, ACTING["neutral"])
    if speaker in KIDS:
        act = act.replace(" she ", " he ").replace("her", "his").replace("herself", "himself")
    p = (f"3D Pixar-style animated cartoon, West African family comedy. {_look(speaker).capitalize()} {act}, "
         f"talking expressively, her mouth opening and closing clearly with each word, lively facial animation, "
         f"natural hand gestures. ")
    if speaker in KIDS:
        p = p.replace("her mouth", "his mouth")
    for n, emo in listeners.items():
        p += f"In the blurred background, {_look(n)} {LISTENING.get(emo, 'listens')}. "
    cam = "Quick punchy zoom-in at the start" if beat in ("twist", "chute") else "Slow cinematic push-in"
    return p + f"{cam}, shallow depth of field, warm sunlight, smooth natural motion, consistent character design."


NEGATIVE = ("static, frozen, still image, blurry face, deformed face, distorted mouth, extra fingers, extra limbs, "
            "morphing, text, subtitles, watermark, low quality, jpeg artifacts, ugly, 3 legs, many people")


# --- Wan 2.2 (HuggingFace ZeroGPU) ------------------------------------------------------------

_CLIENT = None


def _client():
    global _CLIENT
    if _CLIENT is None:
        from gradio_client import Client
        _CLIENT = Client(WAN_SPACE, token=config.HF_TOKEN or None, verbose=False)
    return _CLIENT


def gpu_seconds(seconds: float, steps: int) -> float:
    """Temps GPU réservé par le Space (sa formule) → décompté du quota ZeroGPU du compte."""
    frames = min(max(round(seconds * 16), 8), 80)
    factor = frames * 480 * 832 / (81 * 832 * 624)
    return 10 + steps * 15 * factor ** 1.5


def wan(image: Path, prompt: str, seconds: float, dest: Path, seed: int, steps: int = 6) -> Path:
    if dest.exists():
        return dest
    from gradio_client import handle_file
    seconds = round(min(max(seconds, 0.5), 5.0), 1)
    log = dest.parent / "wan_log.jsonl"
    for attempt in range(3):
        t0 = time.time()
        try:
            res = _client().predict(input_image=handle_file(str(image)), prompt=prompt, steps=steps,
                                    negative_prompt=NEGATIVE, duration_seconds=seconds, guidance_scale=1,
                                    guidance_scale_2=1, seed=seed, randomize_seed=False,
                                    api_name="/generate_video")
            video = res[0]["video"] if isinstance(res[0], dict) else res[0]
            shutil.copy(video, dest)
            with open(log, "a") as f:
                f.write(json.dumps({"clip": dest.name, "seconds": seconds, "steps": steps,
                                    "gpu_requested": round(gpu_seconds(seconds, steps), 1),
                                    "wall": round(time.time() - t0, 1)}) + "\n")
            return dest
        except Exception as e:  # noqa: BLE001 — les erreurs du Space arrivent comme exceptions génériques
            msg = str(e)
            if "quota" in msg.lower() or "exceeded" in msg.lower():
                raise QuotaError(msg) from e
            print(f"    Wan : erreur ({msg[:200]}), nouvel essai…", flush=True)
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"Wan 2.2 indisponible pour {dest.name}")


# --- Scènes ----------------------------------------------------------------------------------

def shots(kit: dict, workdir: Path, setting: str, only_ready: bool = False) -> list[Path]:
    """Un plan Wan 2.2 par réplique (image composée → clip animé). Lève QuotaError si le quota est épuisé."""
    from . import animatic
    done = []
    for i, sc in enumerate(kit["scenes"]):
        names = sc["characters"][:3]
        emos = {n: animatic.emotion_for(n, sc["image_prompt"]) for n in names}
        for j, line in enumerate(sc.get("dialogue") or []):
            wav = workdir / f"voice_{i:02d}_{j}.wav"
            if only_ready and not wav.exists():
                continue
            seconds = (voice(line, wav) if not wav.exists() else _dur(wav)) + 0.6
            sp = line["speaker"]
            img = compose(names, sp, emos, setting, workdir / f"shot_{i:02d}_{j}.png")
            prompt = shot_prompt(sp, emos.get(sp, "neutral"), {n: e for n, e in emos.items() if n != sp},
                                 sc.get("beat", ""))
            dest = workdir / f"wan_{i:02d}_{j}.mp4"
            fresh = not dest.exists()
            t0 = time.time()
            wan(img, prompt, seconds, dest, seed=100 * i + j)
            if fresh:
                print(f"  plan {i + 1}.{j + 1} ({sp}, {min(seconds, 5):.1f} s) animé en {time.time() - t0:.0f} s",
                      flush=True)
            done.append(dest)
    return done


# --- Montage d'une scène -----------------------------------------------------------------------

LEAD = 0.25    # silence avant la réplique (s)
TAIL = 0.35    # réaction après la réplique (s)


def _frames(video: Path):
    """Images d'un clip (RGB, taille d'origine) et sa cadence."""
    import numpy as np
    info = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
         "-of", "json", str(video)], capture_output=True, text=True, check=True).stdout)["streams"][0]
    w, h = info["width"], info["height"]
    num, den = map(int, info["r_frame_rate"].split("/"))
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(video), "-f", "rawvideo", "-pix_fmt", "rgb24",
                          "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3), num / den


def _zoom(frames, box):
    """Recadrage (plan plus serré) : box = (x0, y0, x1, y1) en proportions de l'image."""
    import cv2
    import numpy as np
    h, w = frames.shape[1:3]
    x0, y0, x1, y1 = int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)
    return np.stack([cv2.resize(f[y0:y1, x0:x1], (w, h), interpolation=cv2.INTER_CUBIC) for f in frames])


def _fit(frames, fps: float, seconds: float):
    """Adapte le clip à la durée voulue : coupé s'il est trop long, ralenti (jusqu'à ×1,35) ou joué en
    aller-retour s'il est trop court. Renvoie (images, cadence d'entrée)."""
    import numpy as np
    n = len(frames)
    need = seconds * fps
    if n >= need:
        return frames[:int(round(need))], fps
    if seconds / (n / fps) <= 1.35:
        return frames, n / seconds                      # ralenti, lissé ensuite par interpolation
    idx, k, step = [], 0, 1
    while len(idx) < need:                              # aller-retour sans répéter l'image du bout
        idx.append(k)
        if not 0 <= k + step < n:
            step = -step
        k += step
    return frames[np.array(idx)], fps


def line_clip(src: Path, voice_wav: Path, dest: Path, seconds: float, box=None, freeze: float = 0.0) -> Path:
    """Plan final 1080×1920 / 24 i/s : clip Wan calé sur la voix, agrandi, net ; gel zoomé optionnel."""
    import cv2
    import numpy as np
    frames, fps = _frames(src)
    if box:
        frames = _zoom(frames, box)
    frames, in_fps = _fit(frames, fps, seconds)
    h, w = frames.shape[1:3]
    if freeze:                                          # gel final : zoom sur le visage + flash
        last = frames[-1]
        extra = []
        for f in range(int(freeze * in_fps)):
            z = 1 + 0.45 * min(1, f / (0.25 * in_fps))
            cw, ch = int(w / z), int(h / z)
            x0, y0 = (w - cw) // 2, int((h - ch) * 0.3)
            im = cv2.resize(last[y0:y0 + ch, x0:x0 + cw], (w, h), interpolation=cv2.INTER_CUBIC)
            if f < 2:
                im = (im * 0.5 + 127).astype(np.uint8)
            extra.append(im)
        frames = np.concatenate([frames, np.stack(extra)])
    total = len(frames) / in_fps
    vf = (f"minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,"
          f"scale={int(H * w / h) + 1}:{H}:flags=lanczos,crop={W}:{H},unsharp=5:5:0.7:5:5:0.0,setsar=1")
    delay = int(LEAD * 1000)
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}",
         "-framerate", f"{in_fps:.4f}", "-i", "-", "-i", str(voice_wav),
         "-filter_complex", f"[0:v]{vf}[v];[1:a]adelay={delay}|{delay},apad,atrim=0:{total:.3f},"
         f"aresample={SR},aformat=channel_layouts=stereo[a]",
         "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}", str(dest)],
        stdin=subprocess.PIPE)
    proc.stdin.write(np.ascontiguousarray(frames).tobytes())
    proc.stdin.close()
    if proc.wait():
        raise RuntimeError(f"ffmpeg a échoué pour {dest.name}")
    return dest


def _sfx(clip: Path, events: list[tuple[str, float]], dest: Path) -> Path:
    """Ajoute des bruitages (animatic.SFX) par-dessus la bande son d'un clip."""
    from . import animatic
    if not events:
        shutil.copy(clip, dest)
        return dest
    inputs, chains = ["-i", str(clip)], []
    for k, (name, at) in enumerate(events):
        inputs += ["-f", "lavfi", "-i", animatic.SFX[name][0]]
        ms = int(at * 1000)
        chains.append(f"[{k + 1}:a]aresample={SR},aformat=channel_layouts=stereo,volume=0.7,adelay={ms}|{ms}[s{k}]")
    mix = ";".join(chains) + ";[0:a]" + "".join(f"[s{k}]" for k in range(len(events))) + \
        f"amix=inputs={len(events) + 1}:normalize=0:duration=first[a]"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", mix, "-map", "0:v",
                    "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", str(dest)], check=True)
    return dest


def _source(workdir: Path, i: int, j: int, speaker: str, scenes: list) -> tuple[Path, tuple | None]:
    """Clip animé d'une réplique ; à défaut (quota épuisé), un autre plan du même personnage, recadré
    plus serré pour ne pas montrer deux fois le même cadre."""
    for name in (f"wan_{i:02d}_{j}.mp4", f"w21_{i:02d}_{j}.mp4"):
        if (workdir / name).exists():
            return workdir / name, None
    same = []
    for a, sc in enumerate(scenes):
        for b, line in enumerate(sc.get("dialogue") or []):
            for name in (f"wan_{a:02d}_{b}.mp4", f"w21_{a:02d}_{b}.mp4"):
                if line["speaker"] == speaker and (workdir / name).exists() and len(sc["characters"]) <= 2:
                    same.append((abs(a - i), workdir / name))
    if not same:
        raise FileNotFoundError(f"aucun plan animé pour {speaker}")
    same.sort(key=lambda s: s[0])
    use = same[(i + j) % len(same)][1]
    boxes = [(0.08, 0.02, 0.92, 0.62), (0.0, 0.05, 0.8, 0.6), (0.2, 0.05, 1.0, 0.6)]
    return use, boxes[(i + j) % len(boxes)]


def render_clip(scene: dict, index: int, dest: Path, setting: str = "village", is_last: bool = False,
                title: str = "", min_seconds: float = 0, scenes: list | None = None) -> Path:
    """Scène complète (interface des autres moteurs de run.py) : un plan animé par réplique, voix, bruitages."""
    workdir = dest.parent
    parts, t = [], 0.0
    lines = scene.get("dialogue") or []
    for j, line in enumerate(lines):
        wav = workdir / f"voice_{index:02d}_{j}.wav"
        d = voice(line, wav)
        seconds = LEAD + d + TAIL
        src, box = _source(workdir, index, j, line["speaker"], scenes or [scene])
        if box is None and not src.exists():
            raise FileNotFoundError(src)
        last = is_last and j == len(lines) - 1
        part = line_clip(src, wav, workdir / f"line_{index:02d}_{j}.mp4", seconds, box, freeze=1.4 if last else 0)
        line["start"], line["end"] = t + LEAD, t + LEAD + d
        try:
            line["words"] = [(wd, t + LEAD + a, t + LEAD + b) for wd, a, b in word_times(wav, line["text"])]
        except Exception as e:  # noqa: BLE001 — sous-titres classiques si l'horodatage échoue
            print(f"    horodatage des mots impossible ({e})")
        t += seconds
        parts.append(part)
    concat = workdir / f"scene_{index:02d}_raw.mp4"
    lst = workdir / f"scene_{index:02d}.txt"
    lst.write_text("".join(f"file '{p.resolve()}'\n" for p in parts))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                    "-c", "copy", str(concat)], check=True)
    events = []
    if scene.get("beat") == "hook" and index == 0:
        events.append(("whoosh", 0.0))
    if scene.get("beat") == "twist":
        events.append(("dun", 0.0))
    if is_last:
        events.append(("boing", t))
    return _sfx(concat, events, dest)


# --- Sous-titres mot à mot ---------------------------------------------------------------------

def word_times(wav: Path, text: str) -> list[tuple[str, float, float]]:
    """Horodatage de chaque mot du texte (en s depuis le début du fichier), d'après Whisper. Si Whisper
    n'entend pas le même nombre de mots, les mots du texte sont répartis sur la parole selon leur longueur."""
    global _ASR
    heard(wav)  # charge le modèle
    res = _ASR(str(wav), return_timestamps="word", generate_kwargs={"language": "french", "task": "transcribe"})
    chunks = [c for c in res.get("chunks", []) if c.get("timestamp") and c["timestamp"][0] is not None]
    words = []
    for tok in text.replace("…", "… ").split():   # « ! », « ?! » collés au mot précédent
        if words and not any(c.isalnum() for c in tok):
            words[-1] += " " + tok
        else:
            words.append(tok)
    if not chunks:
        return []
    t0, t1 = chunks[0]["timestamp"][0], chunks[-1]["timestamp"][1] or _dur(wav)
    if len(chunks) == len(words):
        return [(w, c["timestamp"][0], c["timestamp"][1] or t1) for w, c in zip(words, chunks)]
    total = sum(len(w) + 1 for w in words)
    out, t = [], t0
    for w in words:
        d = (t1 - t0) * (len(w) + 1) / total
        out.append((w, t, t + d))
        t += d
    return out
