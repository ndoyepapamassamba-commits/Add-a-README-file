"""Assemblage du moteur : checkpoints + génération texte->vidéo et image->vidéo.

    prompt ──tokenizer──> encodeur de texte ──┐
    (option) 1re image ──VAE.encode──> latent ┤
    bruit N(0, I) (C, 5, 8, 8) ───────────────┴─> DiT x N pas d'Euler (+ CFG)
                                                   └─> latent propre ──VAE.decode──> clip 17x32x32
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np
import torch

from .config import Config
from .dit import DiT, first_frame_condition
from .flow import cfg_combine, euler_sample
from .text_encoder import TextEncoder, Tokenizer
from .troupe_data import from_model_space, to_model_space
from .vae import VideoVAE


@dataclass
class Moteur:
    cfg: Config
    vae: VideoVAE
    text: TextEncoder
    dit: DiT
    tokenizer: Tokenizer

    def eval(self) -> "Moteur":
        self.vae.eval()
        self.text.eval()
        self.dit.eval()
        return self


def build_dit(cfg: Config, tokenizer: Tokenizer) -> tuple[TextEncoder, DiT]:
    text = TextEncoder(cfg.text, len(tokenizer))
    dit = DiT(cfg.dit, cfg.vae.latent_channels, cfg.text.d_model)
    return text, dit


def load_vae(path: str | Path) -> tuple[VideoVAE, Config, dict]:
    ck = torch.load(path, map_location="cpu", weights_only=False)
    cfg = Config.from_dict(ck["config"])
    vae = VideoVAE(cfg.vae)
    vae.load_state_dict(ck["vae"])
    vae.eval()
    return vae, cfg, ck


def load_moteur(path: str | Path, use_ema: bool = True) -> Moteur:
    ck = torch.load(path, map_location="cpu", weights_only=False)
    if ck.get("kind") != "moteur":
        raise ValueError(f"{path} n'est pas un checkpoint DiT (lancez d'abord « train dit »)")
    cfg = Config.from_dict(ck["config"])
    tok = Tokenizer.from_state_dict(ck["tokenizer"])
    vae = VideoVAE(cfg.vae)
    vae.load_state_dict(ck["vae"])
    text, dit = build_dit(cfg, tok)
    suffix = "_ema" if use_ema and "dit_ema" in ck else ""
    text.load_state_dict(ck["text" + suffix])
    dit.load_state_dict(ck["dit" + suffix])
    return Moteur(cfg, vae, text, dit, tok).eval()


@torch.no_grad()
def generate_latents(m: Moteur, prompts: Sequence[str], first_latents: torch.Tensor | None = None, *,
                     steps: int = 30, cfg_scale: float = 4.0, shift: float = 3.0,
                     seeds: Sequence[int] | None = None) -> torch.Tensor:
    """Échantillonne des latents (B, C, T, h, w). ``first_latents`` (B, C, 1, h, w) -> image->vidéo."""
    B = len(prompts)
    C, T, h, w = m.cfg.latent_shape
    seeds = list(seeds) if seeds is not None else list(range(B))
    noise = torch.stack([torch.randn(C, T, h, w, generator=torch.Generator().manual_seed(int(s))) for s in seeds])
    ids, mask = m.tokenizer.batch(list(prompts), m.cfg.text.max_len)
    ctx, cmask = m.text(ids, mask)
    nctx, nmask = m.text.null_context(B, ids.shape[1])
    if first_latents is not None:
        cond, cond_mask = first_frame_condition(first_latents, T)
    else:
        cond, cond_mask = torch.zeros(B, C, T, h, w), torch.zeros(B, T)

    def velocity(x, t):
        if cfg_scale == 1.0:
            return m.dit(x, t, ctx, cmask, cond, cond_mask)
        v = m.dit(torch.cat([x, x]), torch.cat([t, t]), torch.cat([ctx, nctx]), torch.cat([cmask, nmask]),
                  torch.cat([cond, cond]), torch.cat([cond_mask, cond_mask]))
        v_c, v_u = v.chunk(2)
        return cfg_combine(v_u, v_c, cfg_scale)

    return euler_sample(velocity, noise, steps, shift)


@torch.no_grad()
def generate(m: Moteur, prompts: Sequence[str], first_images: np.ndarray | None = None, *,
             steps: int = 30, cfg_scale: float = 4.0, shift: float = 3.0, seed: int = 0,
             batch_size: int = 16) -> np.ndarray:
    """Génère des clips uint8 (B, T, H, W, 3). ``first_images`` uint8 (B, H, W, 3) -> I2V.

    Le clip i utilise la graine ``seed + i`` (indépendante de la taille des lots).
    """
    out = []
    for s in range(0, len(prompts), batch_size):
        p = list(prompts[s : s + batch_size])
        first = None
        if first_images is not None:
            img = to_model_space(first_images[s : s + batch_size][:, None])  # (b, 3, 1, H, W)
            first = m.vae.encode(img)
        z = generate_latents(m, p, first, steps=steps, cfg_scale=cfg_scale, shift=shift,
                             seeds=[seed + s + i for i in range(len(p))])
        out.append(from_model_space(m.vae.decode(z)))
    return np.concatenate(out, axis=0)
