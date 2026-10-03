"""Bande son originale générée par code (aucun droit d'auteur) : boucle balafon + djembé + basse,
ambiance de village (oiseaux, vent, enfants au loin), et mixage final avec les voix et les bruitages
(Kenney, CC0, assets/sfx/)."""
import subprocess
from pathlib import Path

import numpy as np

SR = 44100
SFX = Path(__file__).resolve().parent.parent / "assets" / "sfx"


def _env(n, attack=0.004, decay=0.35):
    t = np.arange(n) / SR
    return np.minimum(t / attack, 1) * np.exp(-t / decay)


def balafon(freq, dur=0.6):
    """Lame de balafon : fondamentale + partiels inharmoniques + léger « bourdonnement » de calebasse."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 3.93 * t) * np.exp(-t * 18)
         + 0.15 * np.sin(2 * np.pi * freq * 9.2 * t) * np.exp(-t * 40))
    buzz = 1 + 0.08 * np.sign(np.sin(2 * np.pi * freq * 0.5 * t))
    return s * buzz * _env(n, 0.002, 0.22)


def djembe(kind, dur=0.35):
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(len(kind))
    if kind == "bass":
        return 1.2 * np.sin(2 * np.pi * (70 + 60 * np.exp(-t * 30)) * t) * _env(n, 0.001, 0.18)
    if kind == "tone":
        return 0.6 * np.sin(2 * np.pi * 330 * t) * _env(n, 0.001, 0.08) + 0.15 * rng.standard_normal(n) * _env(n, 0.001, 0.03)
    return 0.45 * rng.standard_normal(n) * _env(n, 0.001, 0.035)     # claqué (slap)


def music(seconds: float, bpm: int = 112, seed: int = 3) -> np.ndarray:
    """Boucle comique et légère (pentatonique majeure en ré), 4 mesures répétées avec variations."""
    rng = np.random.default_rng(seed)
    beat = 60 / bpm
    out = np.zeros(int((seconds + 2) * SR))
    scale = [293.7, 329.6, 370.0, 440.0, 493.9, 587.3, 659.3, 740.0]
    motif = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 5, 7, 5, 4, 2]          # croches
    bassline = [146.8, 146.8, 196.0, 220.0]
    groove = ["bass", None, "slap", "tone", "bass", "slap", "tone", "slap"]

    def put(sig, at, gain):
        i = int(at * SR)
        j = min(len(out), i + len(sig))
        if i < len(out):
            out[i:j] += gain * sig[:j - i]
    t, bar = 0.0, 0
    while t < seconds + 1:
        for k in range(16):
            note = motif[k]
            if bar % 4 == 3 and k > 11:
                note = motif[k] + rng.integers(-1, 2)
            if rng.random() < 0.85:
                put(balafon(scale[int(np.clip(note, 0, 7))]), t + k * beat / 2, 0.22)
            if k % 4 == 2 and rng.random() < 0.5:                       # deuxième main, octave
                put(balafon(scale[int(np.clip(note + 2, 0, 7))] * 2, 0.3), t + k * beat / 2 + beat / 4, 0.07)
        for k, g in enumerate(groove * 2):
            if g:
                put(djembe(g), t + k * beat / 2, 0.35 if g == "bass" else 0.22)
        for q in range(4):                                              # basse : une note toutes les 2 temps
            nb = int(beat * 2 * SR)
            put(0.5 * np.sin(2 * np.pi * bassline[(bar + q // 2) % 4] * np.arange(nb) / SR) * _env(nb, 0.01, 0.5),
                t + q * beat * 2, 0.22)
        t += beat * 8
        bar += 1
    out = out[:int(seconds * SR)]
    return 0.8 * out / (np.abs(out).max() + 1e-9)


def ambience(seconds: float, seed: int = 5) -> np.ndarray:
    """Ambiance de cour de village : vent léger, oiseaux, poules au loin."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    wind = rng.standard_normal(n)
    k = 400
    wind = np.convolve(wind, np.ones(k) / k, mode="same")              # bruit grave et doux
    wind *= 0.6 + 0.4 * np.sin(2 * np.pi * np.arange(n) / SR / 7.0)
    out = wind / (np.abs(wind).max() + 1e-9) * 0.25
    t = 0.3
    while t < seconds - 1:
        f0 = rng.uniform(2600, 4200)                                    # gazouillis
        for c in range(rng.integers(2, 5)):
            d = rng.uniform(0.05, 0.11)
            m = int(d * SR)
            tt = np.arange(m) / SR
            chirp = np.sin(2 * np.pi * (f0 + rng.uniform(-900, 900) * tt / d) * tt) * np.sin(np.pi * tt / d) ** 2
            i = int((t + c * 0.13) * SR)
            out[i:i + m] += 0.12 * chirp[:max(0, min(m, n - i))]
        t += rng.uniform(1.2, 3.5)
    return out


def _load(path: Path) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f",
                          "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def mix(seconds: float, voices: list[tuple[Path, float]], sfx: list[tuple[str, float, float]],
        dest: Path, music_cuts: list[tuple[float, float]] = ()) -> Path:
    """voices = [(wav, début)], sfx = [(nom de fichier dans assets/sfx ou 'synth:…', début, gain)].
    La musique baisse automatiquement sous les voix (ducking) et se coupe sur les intervalles music_cuts."""
    n = int(seconds * SR)
    vtrack = np.zeros(n)
    for wav, at in voices:
        v = _load(wav)
        i = int(at * SR)
        j = min(n, i + len(v))
        vtrack[i:j] += v[:j - i]
    duck = np.convolve((np.abs(vtrack) > 0.02).astype(float), np.ones(int(0.25 * SR)) / int(0.25 * SR), "same")
    duck = np.clip(duck * 3, 0, 1)
    mus = music(seconds)[:n]
    mus = np.pad(mus, (0, n - len(mus)))
    gain = 0.30 - 0.20 * duck
    for a, b in music_cuts:
        i, j = int(a * SR), int(b * SR)
        ramp = np.linspace(1, 0, min(2000, max(1, j - i)))
        gain[i:i + len(ramp)] *= ramp
        gain[i + len(ramp):j] = 0
    out = vtrack * 1.0 + mus * gain + ambience(seconds)[:n] * 0.35
    for name, at, g in sfx:
        s = _load(SFX / name)
        i = int(at * SR)
        j = min(n, i + len(s))
        if i < n:
            out[i:j] += g * s[:j - i]
    out = np.tanh(out * 1.1) * 0.9                                          # limiteur doux
    tmp = dest.with_suffix(".f32")
    out.astype(np.float32).tofile(tmp)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", str(tmp),
                    "-af", "loudnorm=I=-14:TP=-1:LRA=9", "-ar", str(SR), "-ac", "2", str(dest)], check=True)
    tmp.unlink()
    return dest
