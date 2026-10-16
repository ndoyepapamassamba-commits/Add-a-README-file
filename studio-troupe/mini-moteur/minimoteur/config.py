"""Configuration du mini-moteur : toutes les tailles au même endroit.

Le mini-moteur reproduit, en miniature, la recette des générateurs vidéo actuels
(Wan 2.x, HunyuanVideo, Veo 3 pour ce qui est public) :

    encodeur de texte -> VAE vidéo 3D causal -> Transformer de diffusion (DiT)
    entraîné en « flow matching » -> échantillonneur d'Euler + guidance (CFG).

Ordres de grandeur (mini-moteur vs Wan 2.1 / 2.2) :

    clip       : 17 images 32x32 (1 + 4k)       vs 81-121 images 832x480 à 1280x720
    VAE        : 4x temps, 4x4 espace, 8 canaux vs 4x8x8 / 16 canaux (2.1), 4x16x16 / 48 canaux (2.2)
    DiT        : ~5 M paramètres, 80 jetons      vs 1,3 à 14 milliards, ~30 000 à 75 000 jetons
    texte      : petit Transformer appris        vs umT5-XXL gelé (~5,7 milliards de paramètres)

Toutes les classes sont des dataclasses sérialisables (``asdict``) : la
configuration est enregistrée dans chaque checkpoint pour pouvoir le recharger.
"""

from __future__ import annotations

from dataclasses import MISSING, asdict, dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any

# Dossiers du projet (calculés à partir de l'emplacement de ce fichier).
PACKAGE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = PACKAGE_DIR.parent
RUNS_DIR = PROJECT_DIR / "runs"
TROUPE_JSON = PROJECT_DIR.parent / "troupe" / "troupe.json"


@dataclass
class ClipConfig:
    """Format des clips vidéo."""

    n_frames: int = 17  # règle « 1 + 4k » : la 1re image est compressée seule
    size: int = 32  # 32x32 pixels
    channels: int = 3  # RGB, valeurs dans [-1, 1]
    fps: int = 8  # cadence nominale (17 images ~ 2 s)


@dataclass
class DataConfig:
    """Jeu de données procédural (marionnettes de la troupe)."""

    n_train_clips: int = 3000  # clips d'entraînement mis en cache
    n_eval_clips: int = 200  # clips d'évaluation (combinaisons tenues à l'écart)
    seed: int = 1234
    supersample: int = 3  # anti-crénelage : rendu 3x plus grand puis moyenne


@dataclass
class VAEConfig:
    """VAE vidéo 3D causal.

    ``channels`` donne la largeur de chaque étage ; entre deux étages, la
    résolution est divisée par 2 en temps ET en espace. Avec 3 étages :
    17x32x32 -> 9x16x16 -> 5x8x8 (compression 4x en temps, 4x4 en espace).
    """

    channels: tuple[int, ...] = (32, 64, 96)
    n_res_blocks: int = 1
    latent_channels: int = 8
    kl_weight: float = 1e-4  # beta du terme KL (petit, comme Wan : 3e-6 relatif)
    mse_weight: float = 1.0  # perte = L1 + mse_weight * MSE + kl_weight * KL

    @property
    def temporal_factor(self) -> int:
        return 2 ** (len(self.channels) - 1)

    @property
    def spatial_factor(self) -> int:
        return 2 ** (len(self.channels) - 1)


@dataclass
class TextConfig:
    """Encodeur de texte (petit Transformer entraîné avec le DiT)."""

    d_model: int = 128
    n_layers: int = 2
    n_heads: int = 4
    max_len: int = 12  # le plus long prompt fait 9 mots
    dropout: float = 0.0


@dataclass
class DiTConfig:
    """Transformer de diffusion (DiT) façon Wan."""

    hidden: int = 256
    depth: int = 6
    n_heads: int = 4
    mlp_ratio: float = 4.0
    patch: tuple[int, int, int] = (1, 2, 2)  # (temps, hauteur, largeur), comme Wan
    rope_theta: float = 10000.0
    freq_dim: int = 128  # dimension de l'encodage sinusoïdal du pas de temps


@dataclass
class FlowConfig:
    """Objectif « flow matching » et échantillonnage."""

    cond_drop: float = 0.1  # probabilité de remplacer le texte par l'embedding nul (CFG)
    i2v_prob: float = 0.5  # part des exemples entraînés en image->vidéo
    logit_mean: float = 0.0  # t = sigmoid(N(logit_mean, logit_std))
    logit_std: float = 1.0
    train_shift: float = 1.0  # décalage appliqué aussi à l'entraînement (1 = aucun)
    sample_steps: int = 30
    sample_shift: float = 3.0
    cfg_scale: float = 4.0


@dataclass
class TrainConfig:
    """Hyper-paramètres d'entraînement (CPU, 4 cœurs)."""

    vae_steps: int = 1500
    vae_batch: int = 16
    vae_lr: float = 3e-4
    dit_steps: int = 4000
    dit_batch: int = 64
    dit_lr: float = 4e-4
    weight_decay: float = 0.01
    warmup: int = 100
    ema_decay: float = 0.999
    grad_clip: float = 1.0
    threads: int = 4
    log_every: int = 25
    save_every: int = 500


@dataclass
class Config:
    clip: ClipConfig = field(default_factory=ClipConfig)
    data: DataConfig = field(default_factory=DataConfig)
    vae: VAEConfig = field(default_factory=VAEConfig)
    text: TextConfig = field(default_factory=TextConfig)
    dit: DiTConfig = field(default_factory=DiTConfig)
    flow: FlowConfig = field(default_factory=FlowConfig)
    train: TrainConfig = field(default_factory=TrainConfig)

    # Formes dérivées -----------------------------------------------------
    @property
    def latent_frames(self) -> int:
        return 1 + (self.clip.n_frames - 1) // self.vae.temporal_factor

    @property
    def latent_size(self) -> int:
        return self.clip.size // self.vae.spatial_factor

    @property
    def latent_shape(self) -> tuple[int, int, int, int]:
        """(C, T, H, W) du latent d'un clip."""
        return (self.vae.latent_channels, self.latent_frames, self.latent_size, self.latent_size)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Config":
        return _from_dict(cls, d)


def _from_dict(klass, d):
    """Reconstruit récursivement une dataclass (les listes JSON redeviennent des tuples)."""
    kwargs = {}
    for f in fields(klass):
        if f.name not in d:
            continue
        value = d[f.name]
        sub = f.default_factory  # MISSING pour les champs simples
        if sub is not MISSING and is_dataclass(sub):
            value = _from_dict(sub, value)
        elif isinstance(value, list):
            value = tuple(value)
        kwargs[f.name] = value
    return klass(**kwargs)


def tiny_config() -> Config:
    """Petite configuration pour les tests et le « smoke run » (quelques secondes)."""
    cfg = Config()
    cfg.data.n_train_clips = 64
    cfg.data.n_eval_clips = 16
    cfg.data.supersample = 2
    cfg.vae.channels = (8, 16, 16)
    cfg.text.d_model = 32
    cfg.text.n_layers = 1
    cfg.dit.hidden = 64
    cfg.dit.depth = 2
    cfg.dit.n_heads = 4
    cfg.dit.freq_dim = 32
    cfg.train.vae_batch = 4
    cfg.train.dit_batch = 8
    cfg.train.warmup = 5
    cfg.train.log_every = 10
    cfg.train.save_every = 1000
    return cfg


def count_params(module) -> int:
    return sum(p.numel() for p in module.parameters())
