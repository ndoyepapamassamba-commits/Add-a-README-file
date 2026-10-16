"""Entrées / sorties : MP4 (H.264, yuv420p) via ffmpeg, GIF et PNG via Pillow.

Les clips sont en 32x32 : on les agrandit x8 au « plus proche voisin » (256x256)
pour garder les pixels nets à l'écran.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image


def ffmpeg_path() -> str:
    exe = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"
    if not Path(exe).exists():
        raise FileNotFoundError("ffmpeg introuvable : installez-le ou ajoutez-le au PATH")
    return exe


def upscale(frames: np.ndarray, scale: int) -> np.ndarray:
    """(T, H, W, 3) uint8 -> agrandi ``scale`` fois au plus proche voisin."""
    return frames.repeat(scale, axis=1).repeat(scale, axis=2)


def write_mp4(frames: np.ndarray, path: str | Path, fps: int = 8, scale: int = 8) -> Path:
    """Écrit un MP4 H.264 (yuv420p, lisible partout, y compris TikTok/WhatsApp)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    T, H, W, _ = frames.shape
    cmd = [
        ffmpeg_path(), "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
        "-vf", f"scale={W * scale}:{H * scale}:flags=neighbor",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart",
        str(path),
    ]
    subprocess.run(cmd, input=np.ascontiguousarray(frames, dtype=np.uint8).tobytes(), check=True)
    return path


def write_gif(frames: np.ndarray, path: str | Path, fps: int = 8, scale: int = 8) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    imgs = [Image.fromarray(f) for f in upscale(frames, scale)]
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=int(round(1000 / fps)), loop=0,
                 optimize=False, disposal=2)
    return path


def save_png(image: np.ndarray, path: str | Path, scale: int = 1) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(upscale(image[None], scale)[0] if scale > 1 else image).save(path)
    return path


def load_image(path: str | Path, size: int = 32) -> np.ndarray:
    """Lit une image et la ramène en (size, size, 3) uint8 (moyenne par zone si plus grande)."""
    img = Image.open(path).convert("RGB")
    if img.size != (size, size):
        img = img.resize((size, size), Image.BOX if img.size[0] > size else Image.NEAREST)
    return np.asarray(img, dtype=np.uint8)


def contact_sheet(clips: list[np.ndarray], frames=(0, 4, 8, 12, 16), gap: int = 2) -> np.ndarray:
    """Planche : une ligne par clip, quelques images par ligne."""
    rows = []
    for clip in clips:
        cells = []
        for f in frames:
            cells.append(clip[min(f, len(clip) - 1)])
            cells.append(np.full((clip.shape[1], gap, 3), 255, np.uint8))
        rows.append(np.concatenate(cells, axis=1))
        rows.append(np.full((gap, rows[-1].shape[1], 3), 255, np.uint8))
    return np.concatenate(rows, axis=0)
