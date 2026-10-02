"""Voix gratuites et libres pour usage commercial : Chatterbox Multilingual (Resemble AI, licence MIT).

Chaque personnage parle avec la voix d'un extrait de référence (~10-20 s) placé dans
state/voice_refs/<PERSONNAGE>.wav — par exemple une voix tirée de VOS vidéos Grok
(`python run.py voix auto ma_video.mp4`, puis copier le meilleur extrait).

Installation (gratuit) : `pip install chatterbox-tts` — tourne sur PC (lent sans carte graphique) ou
sur Google Colab avec GPU gratuit (voir colab/afrikatoon_gratuit.ipynb).
"""
from functools import lru_cache
from pathlib import Path

from . import config

REFS_DIR = config.STATE_DIR / "voice_refs"

# Exagération des émotions par personnage (0.5 = neutre, 1.0+ = très théâtral)
EXAGGERATION = {"BAYE": 0.8, "MODOU": 0.9, "TANTIE AWA": 1.0, "PETIT MAMADOU": 0.7,
                "COUMBA": 0.5, "TONTON DIENG": 1.0}


def available() -> bool:
    try:
        import chatterbox  # noqa: F401
        return True
    except ImportError:
        return False


@lru_cache(maxsize=1)
def _model():
    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    device = "cuda" if torch.cuda.is_available() else "cpu"
    return ChatterboxMultilingualTTS.from_pretrained(device=device)


def reference(character: str) -> Path | None:
    for ext in ("wav", "mp3"):
        p = REFS_DIR / f"{character.replace(' ', '_')}.{ext}"
        if p.exists():
            return p
    return None


def speak(character: str, text: str, dest: Path) -> Path:
    import torchaudio
    model = _model()
    ref = reference(character)
    exaggeration = EXAGGERATION.get(character, 0.7)
    if "!" in text:
        exaggeration += 0.2
    kwargs = {"language_id": "fr", "exaggeration": min(exaggeration, 1.5), "cfg_weight": 0.3}
    if ref:
        kwargs["audio_prompt_path"] = str(ref)
    wav = model.generate(text, **kwargs)
    torchaudio.save(str(dest), wav, model.sr)
    return dest
