"""Génération des images et des clips animés via l'API fal.ai (Nano Banana, Veo, Grok Imagine, Kling)."""
import base64
import mimetypes
import subprocess
import time
from pathlib import Path

import requests

from . import bible, config

FAL_QUEUE = "https://queue.fal.run"


def _headers():
    if not config.FAL_KEY:
        raise RuntimeError("FAL_KEY manquant (clé API fal.ai)")
    return {"Authorization": f"Key {config.FAL_KEY}", "Content-Type": "application/json"}


def fal_run(model: str, payload: dict, timeout_s: int = 900) -> dict:
    """Soumet une tâche dans la file fal.ai et attend le résultat."""
    r = requests.post(f"{FAL_QUEUE}/{model}", json=payload, headers=_headers(), timeout=60)
    r.raise_for_status()
    job = r.json()
    status_url, response_url = job["status_url"], job["response_url"]
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        s = requests.get(status_url, headers=_headers(), timeout=30).json()
        if s.get("status") == "COMPLETED":
            res = requests.get(response_url, headers=_headers(), timeout=60)
            res.raise_for_status()
            return res.json()
        if s.get("status") in ("FAILED", "ERROR"):
            raise RuntimeError(f"Tâche fal.ai échouée ({model}) : {s}")
        time.sleep(5)
    raise TimeoutError(f"Tâche fal.ai trop longue ({model})")


def _download(url: str, dest: Path) -> Path:
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    return dest


def _data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def character_sheet(name: str) -> Path:
    """Fiche de référence d'un personnage, générée une seule fois puis réutilisée (cohérence)."""
    folder = config.STATE_DIR / "characters"
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"{name.replace(' ', '_')}.png"
    if dest.exists():
        return dest
    visual = bible.CHARACTERS[name]["visual"]
    prompt = (f"{bible.STYLE}. Full-body character reference sheet of {visual}, standing, "
              "neutral friendly pose, plain light background, front view, consistent design.")
    res = fal_run(config.IMAGE_MODEL, {"prompt": prompt, "num_images": 1,
                                       "aspect_ratio": "9:16", "output_format": "png"})
    return _download(res["images"][0]["url"], dest)


def scene_image(scene: dict, dest: Path) -> Path:
    refs = [character_sheet(c) for c in scene["characters"] if c in bible.CHARACTERS]
    if refs:
        prompt = (scene["image_prompt"] + " Keep each character exactly identical to the "
                  "reference images (face, body, outfit).")
        res = fal_run(config.IMAGE_EDIT_MODEL, {
            "prompt": prompt, "image_urls": [_data_uri(p) for p in refs], "num_images": 1,
            "aspect_ratio": "9:16", "output_format": "png"})
    else:
        res = fal_run(config.IMAGE_MODEL, {"prompt": scene["image_prompt"], "num_images": 1,
                                           "aspect_ratio": "9:16", "output_format": "png"})
    return _download(res["images"][0]["url"], dest)


def scene_clip(scene: dict, image: Path, dest: Path) -> Path:
    payload = {"prompt": scene["animation_prompt"], "image_url": _data_uri(image),
               **config.VIDEO_PARAMS}
    res = fal_run(config.VIDEO_MODEL, payload)
    return _download(res["video"]["url"], dest)


# --- Mode maquette (sans API) : pour tester le montage et l'envoi gratuitement ---

def mock_clip(scene: dict, index: int, dest: Path) -> Path:
    colors = ["0xE07A2F", "0x2F80E0", "0x7A2FE0", "0x2FA05A", "0xD0335A"]
    label = f"Scene {index + 1} - {scene['beat']}".replace(":", " ")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", f"color=c={colors[index % len(colors)]}:s=720x1280:d={config.CLIP_SECONDS}:r=30",
        "-f", "lavfi", "-i", f"sine=frequency={300 + 60 * index}:duration={config.CLIP_SECONDS}",
        "-vf", f"drawtext=text='{label}':fontcolor=white:fontsize=48:x=(w-tw)/2:y=h/3",
        "-af", "volume=0.05", "-shortest", "-c:v", "libx264", "-c:a", "aac", str(dest),
    ], check=True)
    return dest
