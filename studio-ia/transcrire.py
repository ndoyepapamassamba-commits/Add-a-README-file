"""Transcription mot à mot (faster-whisper) d'une vidéo, pour le contrôle et les sous-titres.

L'audio est décodé par ffmpeg (la version de PyAV installée ne convient pas à faster-whisper).
"""
import subprocess
import sys
from functools import lru_cache

import numpy as np


def audio_16k(chemin):
    brut = subprocess.run(["ffmpeg", "-v", "error", "-i", str(chemin), "-f", "f32le", "-ac", "1",
                           "-ar", "16000", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(brut, dtype=np.float32)


@lru_cache(maxsize=1)
def modele(taille="small"):
    from faster_whisper import WhisperModel
    return WhisperModel(taille, device="cpu", compute_type="int8")


def mots(chemin, invite=None):
    """Liste de (début, fin, mot) ; `invite` = texte attendu, qui guide l'orthographe."""
    segs, _ = modele().transcribe(audio_16k(chemin), language="fr", word_timestamps=True,
                                  initial_prompt=invite, vad_filter=False)
    return [(w.start, w.end, w.word.strip()) for s in segs for w in s.words]


if __name__ == "__main__":
    for d, f, m in mots(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None):
        print(f"{d:5.2f}-{f:5.2f} {m}")
