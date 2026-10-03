"""Configuration lue depuis les variables d'environnement (fichier .env accepté)."""
import json
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Jeton HuggingFace collé avec un « hf_ » en trop (hf_hf_…) : refusé par HuggingFace, on le corrige
if os.getenv("HF_TOKEN", "").startswith("hf_hf_"):
    os.environ["HF_TOKEN"] = os.environ["HF_TOKEN"][3:]
HF_TOKEN = os.getenv("HF_TOKEN", "")

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", ROOT / "output"))
STATE_DIR = Path(os.getenv("STATE_DIR", ROOT / "state"))

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-5-5")

FAL_KEY = os.getenv("FAL_KEY", "")

# Préréglages vidéo fal.ai — vérifier les identifiants exacts sur https://fal.ai/models
VIDEO_PRESETS = {
    # Veo 3 : audio natif (dialogues FR parlés), clips de 8 s
    "veo3": {
        "model": "fal-ai/veo3/fast/image-to-video",
        "clip_seconds": 8,
        "params": {"duration": "8s", "generate_audio": True, "resolution": "720p"},
    },
    # Grok Imagine (xAI) via fal : audio natif
    "grok": {
        "model": "xai/grok-imagine-video/image-to-video",
        "clip_seconds": 10,
        "params": {"duration": 10, "resolution": "720p"},
    },
    # Kling : très bonne cohérence des personnages
    "kling": {
        "model": "fal-ai/kling-video/v2.6/pro/image-to-video",
        "clip_seconds": 10,
        "params": {"duration": "10", "generate_audio": True},
    },
}

VIDEO_PRESET = os.getenv("VIDEO_PRESET", "veo3")
_preset = dict(VIDEO_PRESETS.get(VIDEO_PRESET, VIDEO_PRESETS["veo3"]))
VIDEO_MODEL = os.getenv("VIDEO_MODEL", _preset["model"])
CLIP_SECONDS = int(os.getenv("CLIP_SECONDS", _preset["clip_seconds"]))
VIDEO_PARAMS = {**_preset["params"], **json.loads(os.getenv("VIDEO_PARAMS_JSON", "{}"))}

# Images : Nano Banana (génération) et sa version "edit" (cohérence avec les fiches personnages)
IMAGE_MODEL = os.getenv("IMAGE_MODEL", "fal-ai/nano-banana")
IMAGE_EDIT_MODEL = os.getenv("IMAGE_EDIT_MODEL", "fal-ai/nano-banana/edit")

TARGET_SECONDS = int(os.getenv("TARGET_SECONDS", "64"))  # > 60 s pour Creator Rewards

# Format : "sketch" (une histoire en 3 actes) ou "blagues" (compilation de 4 blagues courtes)
STORY_FORMAT = os.getenv("STORY_FORMAT", "sketch")

# Voix : "native" (voix générées par le modèle vidéo) ou "clone" (voix clonées ElevenLabs + lip-sync)
VOICE_MODE = os.getenv("VOICE_MODE", "native")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2")
ELEVENLABS_DEFAULT_VOICE = os.getenv("ELEVENLABS_DEFAULT_VOICE", "")
LIPSYNC_MODEL = os.getenv("LIPSYNC_MODEL", "fal-ai/sync-lipsync/v2")

TIKTOK_CLIENT_KEY = os.getenv("TIKTOK_CLIENT_KEY", "")
TIKTOK_CLIENT_SECRET = os.getenv("TIKTOK_CLIENT_SECRET", "")
TIKTOK_REDIRECT_URI = os.getenv("TIKTOK_REDIRECT_URI", "")
TIKTOK_REFRESH_TOKEN = os.getenv("TIKTOK_REFRESH_TOKEN", "")
# "draft" = envoi dans la boîte de réception TikTok (vous validez dans l'app),
# "direct" = publication directe (nécessite une app TikTok auditée pour être publique)
TIKTOK_MODE = os.getenv("TIKTOK_MODE", "draft")
TIKTOK_PRIVACY = os.getenv("TIKTOK_PRIVACY", "PUBLIC_TO_EVERYONE")
