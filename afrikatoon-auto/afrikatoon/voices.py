"""Voix clonées des personnages (ElevenLabs) + synchronisation des lèvres (fal.ai).

Usage : extraire quelques extraits propres de VOS vidéos pour chaque personnage (30 s à 2 min au total,
une seule voix à la fois, sans musique), cloner, puis chaque réplique est dite avec cette voix.
N'utilisez que des voix dont vous avez les droits (vos propres vidéos / voix générées pour votre compte,
ou des comédiens qui ont donné leur accord).
"""
import json
import subprocess
from pathlib import Path

import requests

from . import config

API = "https://api.elevenlabs.io/v1"
SAMPLES_DIR = config.STATE_DIR / "voice_samples"
VOICES_FILE = config.STATE_DIR / "voices.json"


def _key():
    if not config.ELEVENLABS_API_KEY:
        raise RuntimeError("ELEVENLABS_API_KEY manquant")
    return {"xi-api-key": config.ELEVENLABS_API_KEY}


def load_voices() -> dict:
    return json.loads(VOICES_FILE.read_text()) if VOICES_FILE.exists() else {}


def extract_sample(video: Path, start: float, end: float, character: str) -> Path:
    """Découpe un extrait de voix dans une de vos vidéos (mono 44,1 kHz, bruit de fond atténué)."""
    folder = SAMPLES_DIR / character.replace(" ", "_")
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"sample_{len(list(folder.glob('*.wav'))) + 1:02d}.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(start), "-to", str(end), "-i", str(video),
                    "-vn", "-ac", "1", "-ar", "44100", "-af", "highpass=f=80,lowpass=f=9000,afftdn",
                    str(dest)], check=True)
    return dest


def auto_split(video: Path, threshold_hz: float = 210, min_len: float = 0.8) -> list[Path]:
    """Découpe automatiquement la parole d'une vidéo en extraits « aigue » / « grave » à trier à l'écoute.

    Les extraits vont dans state/voice_samples/_a_trier/ ; déplacez les bons dans le dossier du
    personnage (ex. state/voice_samples/MODOU/) avant de lancer `voix cloner`.
    """
    import wave
    import numpy as np

    out_dir = SAMPLES_DIR / "_a_trier"
    out_dir.mkdir(parents=True, exist_ok=True)
    wav = out_dir / "_tmp.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000",
                    str(wav)], check=True)
    with wave.open(str(wav)) as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768
    wav.unlink()

    def pitch(fr):
        fr = fr - fr.mean()
        if np.sqrt((fr ** 2).mean()) < 0.03:
            return 0
        c = np.correlate(fr, fr, "full")[len(fr) - 1:]
        lo, hi = int(sr / 450), int(sr / 70)
        k = lo + int(np.argmax(c[lo:hi]))
        return sr / k if c[k] > 0.35 * c[0] else 0

    step, n = 0.25, int(0.04 * sr)
    labels = []
    for i in range(int(len(x) / sr / step)):
        seg = x[int(i * step * sr):int((i + 1) * step * sr)]
        vals = [v for v in (pitch(seg[j:j + n]) for j in range(0, len(seg) - n, n // 2)) if v]
        labels.append(None if len(vals) < 2 else ("aigue" if np.median(vals) >= threshold_hz else "grave"))

    runs, start = [], 0
    for i in range(1, len(labels) + 1):
        if i == len(labels) or labels[i] != labels[start]:
            if labels[start] and (i - start) * step >= min_len:
                runs.append((labels[start], start * step, i * step))
            start = i
    paths = []
    stem = video.stem[:20]
    for k, (lab, a, b) in enumerate(runs):
        dest = out_dir / f"{lab}_{stem}_{k:02d}_{a:.1f}s-{b:.1f}s.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(a), "-to", str(b), "-i", str(video),
                        "-vn", "-ac", "1", "-ar", "44100", "-af", "highpass=f=80,lowpass=f=9000",
                        str(dest)], check=True)
        paths.append(dest)
    return paths


def clone(character: str, description: str = "") -> str:
    samples = sorted((SAMPLES_DIR / character.replace(" ", "_")).glob("*.wav"))
    if not samples:
        raise RuntimeError(f"Aucun extrait pour {character} : utilisez d'abord `voix extraire`")
    files = [("files", (p.name, p.read_bytes(), "audio/wav")) for p in samples]
    r = requests.post(f"{API}/voices/add", headers=_key(), files=files, timeout=300,
                      data={"name": f"Afrikatoon {character}",
                            "description": description or f"Voix du personnage {character}, accent ouest-africain"})
    r.raise_for_status()
    voice_id = r.json()["voice_id"]
    voices = load_voices()
    voices[character] = voice_id
    VOICES_FILE.parent.mkdir(parents=True, exist_ok=True)
    VOICES_FILE.write_text(json.dumps(voices, indent=2))
    return voice_id


def speak(character: str, text: str, dest: Path) -> Path:
    voice_id = load_voices().get(character) or config.ELEVENLABS_DEFAULT_VOICE
    if not voice_id:
        raise RuntimeError(f"Pas de voix pour {character} : `python run.py voix cloner \"{character}\"`")
    r = requests.post(f"{API}/text-to-speech/{voice_id}?output_format=mp3_44100_128", headers=_key(), timeout=120,
                      json={"text": text, "model_id": config.ELEVENLABS_MODEL,
                            "voice_settings": {"stability": 0.3, "similarity_boost": 0.85, "style": 0.7,
                                               "use_speaker_boost": True}})
    r.raise_for_status()
    dest.write_bytes(r.content)
    return dest


def scene_audio(scene: dict, workdir: Path, index: int, clip_seconds: float) -> Path:
    """Toutes les répliques de la scène, enchaînées avec de courtes pauses comiques."""
    parts = []
    for j, line in enumerate(scene.get("dialogue") or []):
        text = line["text"].strip()
        if not text.strip(".… "):
            continue
        parts.append(speak(line["speaker"], text, workdir / f"tts_{index:02d}_{j}.mp3"))
    out = workdir / f"tts_{index:02d}.wav"
    if not parts:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
                        "-t", str(clip_seconds), str(out)], check=True)
        return out
    inputs, chain = [], ""
    for k, p in enumerate(parts):
        inputs += ["-i", str(p)]
        chain += f"[{k}:a]aresample=44100,aformat=channel_layouts=mono,apad=pad_dur=0.25[p{k}];"
    chain += "".join(f"[p{k}]" for k in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1,adelay=300[out]"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", chain, "-map", "[out]",
                    str(out)], check=True)
    return out


def lipsync(clip: Path, audio: Path, dest: Path) -> Path:
    """Fait parler les personnages du clip sur l'audio cloné (modèle de lip-sync via fal.ai)."""
    from . import visuals
    res = visuals.fal_run(config.LIPSYNC_MODEL, {
        "video_url": visuals._data_uri(clip, "video/mp4"),
        "audio_url": visuals._data_uri(audio, "audio/wav"),
        "sync_mode": "cut_off",
    })
    return visuals._download(res["video"]["url"], dest)
