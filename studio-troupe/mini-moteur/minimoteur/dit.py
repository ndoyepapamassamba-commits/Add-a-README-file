"""Transformer de diffusion (DiT) vidéo, construit comme celui de Wan 2.x.

Chemin d'un pas de débruitage :

    latent bruité x_t (C) ┐
    latent de condition (C)├─ concat canaux ─> patchs 1x2x2 ─> jetons (B, N, D)
    masque « image donnée » (1)┘                                   │
                                       pas de temps t ─> MLP ─> modulation adaLN
                                       texte (B, L, Dt) ─> MLP ─> cross-attention
    N blocs : [adaLN(shift, scale) -> self-attention 3D + RoPE 3D -> x gate]
              [LayerNorm -> cross-attention vers le texte]
              [adaLN(shift, scale) -> MLP -> x gate]
    tête : adaLN -> linéaire -> « dépatchify » -> vitesse v (C canaux)

* Patchs 1x2x2 (temps x hauteur x largeur) comme Wan : un latent 5x8x8 donne
  5x4x4 = 80 jetons (Wan 2.1 en 720p : ~75 600 jetons).
* RoPE 3D : la dimension de chaque tête est découpée en 3 parts (temps,
  hauteur, largeur) ; même découpage que Wan (h et w : 2*(d//6), t : le reste).
  Le produit q·k ne dépend alors que de la position RELATIVE des jetons.
* Modulation adaLN « partagée » façon Wan : un seul MLP prédit 6 vecteurs
  (shift, scale, gate) x 2 à partir de t, chaque bloc y ajoute sa propre table
  apprise. Les gates et la couche finale sont initialisés à ZÉRO : au départ
  chaque bloc est l'identité et la sortie vaut 0 (« adaLN-Zero » du DiT).
* Image->vidéo comme Wan I2V : en entrée, on concatène au latent bruité le
  latent de la 1re image (les autres images latentes à 0) et un masque
  (1 = image latente fournie). Texte->vidéo = latent de condition nul + masque 0.
  Un même modèle fait donc T2V et I2V (comme Wan2.2-TI2V-5B, Seedance).
  Différences : Wan met 4 canaux de masque (pas temporel du VAE) et ajoute des
  caractéristiques CLIP de l'image par cross-attention ; ici 1 canal, pas de CLIP.
* Sortie : la VITESSE v = bruit - x0 (voir ``flow.py``).
"""

from __future__ import annotations

import math

import torch
import torch.nn as nn
import torch.nn.functional as F

from .config import DiTConfig


# ---------------------------------------------------------------------------
# RoPE 3D
# ---------------------------------------------------------------------------
def rope_axes_dims(head_dim: int) -> tuple[int, int, int]:
    """Découpage de la dimension d'une tête entre (temps, hauteur, largeur), comme Wan."""
    if head_dim % 2:
        raise ValueError("la dimension d'une tête doit être paire pour RoPE")
    d_hw = 2 * (head_dim // 6)
    return head_dim - 2 * d_hw, d_hw, d_hw


def rope_angles(pos: torch.Tensor, head_dim: int, theta: float = 10000.0) -> torch.Tensor:
    """pos (N, 3) = (t, h, w) -> angles (N, head_dim/2)."""
    out = []
    for axis, d in enumerate(rope_axes_dims(head_dim)):
        if d == 0:
            continue
        freqs = 1.0 / theta ** (torch.arange(0, d, 2, dtype=torch.float32, device=pos.device) / d)
        out.append(pos[:, axis : axis + 1].float() * freqs[None])
    return torch.cat(out, dim=1)


def apply_rope(x: torch.Tensor, angles: torch.Tensor) -> torch.Tensor:
    """Tourne les paires (x[2i], x[2i+1]) de x (..., N, d) des angles (N, d/2)."""
    x1, x2 = x[..., 0::2], x[..., 1::2]
    cos, sin = angles.cos().to(x.dtype), angles.sin().to(x.dtype)
    return torch.stack([x1 * cos - x2 * sin, x1 * sin + x2 * cos], dim=-1).flatten(-2)


def grid_positions(T: int, H: int, W: int, device=None) -> torch.Tensor:
    """Positions (t, h, w) des jetons, dans l'ordre d'aplatissement (t, puis h, puis w)."""
    t, h, w = torch.meshgrid(
        torch.arange(T, device=device), torch.arange(H, device=device), torch.arange(W, device=device),
        indexing="ij",
    )
    return torch.stack([t, h, w], dim=-1).reshape(-1, 3)


# ---------------------------------------------------------------------------
# Blocs
# ---------------------------------------------------------------------------
def timestep_embedding(t: torch.Tensor, dim: int, max_period: float = 10000.0) -> torch.Tensor:
    """Encodage sinusoïdal de t dans [0, 1] (multiplié par 1000, comme Wan)."""
    half = dim // 2
    freqs = torch.exp(-math.log(max_period) * torch.arange(half, dtype=torch.float32, device=t.device) / half)
    args = (t.float() * 1000.0)[:, None] * freqs[None]
    return torch.cat([torch.cos(args), torch.sin(args)], dim=-1)


class SelfAttention(nn.Module):
    def __init__(self, dim: int, heads: int):
        super().__init__()
        self.heads, self.head_dim = heads, dim // heads
        self.qkv = nn.Linear(dim, 3 * dim)
        self.q_norm = nn.RMSNorm(self.head_dim, eps=1e-6)  # qk_norm=True comme Wan
        self.k_norm = nn.RMSNorm(self.head_dim, eps=1e-6)
        self.out = nn.Linear(dim, dim)

    def forward(self, x: torch.Tensor, angles: torch.Tensor) -> torch.Tensor:
        B, N, D = x.shape
        q, k, v = self.qkv(x).view(B, N, 3, self.heads, self.head_dim).permute(2, 0, 3, 1, 4)
        q, k = apply_rope(self.q_norm(q), angles), apply_rope(self.k_norm(k), angles)
        o = F.scaled_dot_product_attention(q, k, v)
        return self.out(o.transpose(1, 2).reshape(B, N, D))


class CrossAttention(nn.Module):
    def __init__(self, dim: int, heads: int):
        super().__init__()
        self.heads, self.head_dim = heads, dim // heads
        self.q = nn.Linear(dim, dim)
        self.kv = nn.Linear(dim, 2 * dim)
        self.q_norm = nn.RMSNorm(self.head_dim, eps=1e-6)
        self.k_norm = nn.RMSNorm(self.head_dim, eps=1e-6)
        self.out = nn.Linear(dim, dim)

    def forward(self, x: torch.Tensor, ctx: torch.Tensor, ctx_mask: torch.Tensor) -> torch.Tensor:
        B, N, D = x.shape
        L = ctx.shape[1]
        q = self.q(x).view(B, N, self.heads, self.head_dim).transpose(1, 2)
        k, v = self.kv(ctx).view(B, L, 2, self.heads, self.head_dim).permute(2, 0, 3, 1, 4)
        q, k = self.q_norm(q), self.k_norm(k)
        o = F.scaled_dot_product_attention(q, k, v, attn_mask=ctx_mask[:, None, None, :])
        return self.out(o.transpose(1, 2).reshape(B, N, D))


class DiTBlock(nn.Module):
    def __init__(self, dim: int, heads: int, mlp_ratio: float):
        super().__init__()
        self.norm1 = nn.LayerNorm(dim, elementwise_affine=False, eps=1e-6)
        self.attn = SelfAttention(dim, heads)
        self.norm_x = nn.LayerNorm(dim, eps=1e-6)
        self.cross = CrossAttention(dim, heads)
        self.norm2 = nn.LayerNorm(dim, elementwise_affine=False, eps=1e-6)
        hidden = int(dim * mlp_ratio)
        self.mlp = nn.Sequential(nn.Linear(dim, hidden), nn.GELU(approximate="tanh"), nn.Linear(hidden, dim))
        # Table de modulation propre au bloc, ajoutée à la projection partagée de t.
        self.modulation = nn.Parameter(torch.zeros(1, 6, dim))

    def forward(self, x, e, ctx, ctx_mask, angles):
        shift1, scale1, gate1, shift2, scale2, gate2 = (self.modulation + e).unbind(1)
        h = self.norm1(x) * (1 + scale1[:, None]) + shift1[:, None]
        x = x + gate1[:, None] * self.attn(h, angles)
        x = x + self.cross(self.norm_x(x), ctx, ctx_mask)
        h = self.norm2(x) * (1 + scale2[:, None]) + shift2[:, None]
        return x + gate2[:, None] * self.mlp(h)


# ---------------------------------------------------------------------------
# Modèle
# ---------------------------------------------------------------------------
class DiT(nn.Module):
    """DiT vidéo : (x_t, t, texte, condition I2V) -> vitesse."""

    def __init__(self, cfg: DiTConfig, latent_channels: int, text_dim: int):
        super().__init__()
        self.cfg = cfg
        D = cfg.hidden
        if D % cfg.n_heads:
            raise ValueError("hidden doit être divisible par n_heads")
        C = latent_channels
        self.latent_channels = C
        self.in_channels = 2 * C + 1  # latent bruité + latent de condition + masque
        self.patch = tuple(cfg.patch)
        self.patch_embed = nn.Conv3d(self.in_channels, D, kernel_size=self.patch, stride=self.patch)
        self.text_embed = nn.Sequential(nn.Linear(text_dim, D), nn.GELU(approximate="tanh"), nn.Linear(D, D))
        self.time_embed = nn.Sequential(nn.Linear(cfg.freq_dim, D), nn.SiLU(), nn.Linear(D, D))
        self.time_proj = nn.Sequential(nn.SiLU(), nn.Linear(D, 6 * D))  # partagé par tous les blocs (Wan)
        self.blocks = nn.ModuleList(DiTBlock(D, cfg.n_heads, cfg.mlp_ratio) for _ in range(cfg.depth))
        self.head_norm = nn.LayerNorm(D, elementwise_affine=False, eps=1e-6)
        self.head_modulation = nn.Parameter(torch.zeros(1, 2, D))
        self.head = nn.Linear(D, C * math.prod(self.patch))
        self._init_weights()

    def _init_weights(self) -> None:
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
        w = self.patch_embed.weight
        nn.init.xavier_uniform_(w.view(w.shape[0], -1))
        nn.init.zeros_(self.patch_embed.bias)
        nn.init.normal_(self.time_embed[0].weight, std=0.02)
        nn.init.normal_(self.time_embed[2].weight, std=0.02)
        # adaLN-Zero : modulation et tête finale à zéro -> sortie nulle au départ.
        nn.init.zeros_(self.time_proj[1].weight)
        nn.init.zeros_(self.time_proj[1].bias)
        nn.init.zeros_(self.head.weight)
        nn.init.zeros_(self.head.bias)

    def forward(self, x_t: torch.Tensor, t: torch.Tensor, ctx: torch.Tensor, ctx_mask: torch.Tensor,
                cond: torch.Tensor | None = None, cond_mask: torch.Tensor | None = None) -> torch.Tensor:
        """
        x_t       (B, C, T, H, W)  latent bruité
        t         (B,)             temps du flow dans [0, 1] (1 = bruit pur)
        ctx       (B, L, Dt)       embeddings du texte ; ctx_mask (B, L) bool
        cond      (B, C, T, H, W)  latent de condition (0 hors images fournies) ou None (T2V)
        cond_mask (B, T)           1 si l'image latente est fournie
        -> vitesse (B, C, T, H, W)
        """
        B, C, T, H, W = x_t.shape
        if cond is None:
            cond = torch.zeros_like(x_t)
        if cond_mask is None:
            cond_mask = torch.zeros(B, T, device=x_t.device, dtype=x_t.dtype)
        m = cond_mask.to(x_t.dtype)[:, None, :, None, None].expand(B, 1, T, H, W)
        h = self.patch_embed(torch.cat([x_t, cond, m], dim=1))
        Tp, Hp, Wp = h.shape[2:]
        h = h.flatten(2).transpose(1, 2)  # (B, N, D)
        angles = rope_angles(grid_positions(Tp, Hp, Wp, x_t.device), self.cfg.hidden // self.cfg.n_heads,
                             self.cfg.rope_theta)
        e0 = self.time_embed(timestep_embedding(t.reshape(-1).expand(B) if t.numel() == 1 else t, self.cfg.freq_dim))
        e = self.time_proj(e0).view(B, 6, -1)
        c = self.text_embed(ctx)
        for blk in self.blocks:
            h = blk(h, e, c, ctx_mask, angles)
        shift, scale = (self.head_modulation + e0[:, None]).unbind(1)
        h = self.head_norm(h) * (1 + scale[:, None]) + shift[:, None]
        out = self.head(h)  # (B, N, pt*ph*pw*C)
        pt, ph, pw = self.patch
        out = out.view(B, Tp, Hp, Wp, pt, ph, pw, C).permute(0, 7, 1, 4, 2, 5, 3, 6)
        return out.reshape(B, C, Tp * pt, Hp * ph, Wp * pw)


def first_frame_condition(first_latent: torch.Tensor, n_latent_frames: int) -> tuple[torch.Tensor, torch.Tensor]:
    """Latent de la 1re image (B, C, 1, h, w) -> (condition (B, C, T, h, w), masque (B, T)).

    Grâce au VAE causal, le latent 0 d'un clip ne dépend que de l'image 0 :
    encoder l'image seule donne exactement ce latent. Les autres images
    latentes de la condition sont mises à zéro, et le masque vaut 1 en t = 0.
    """
    B, C, _, h, w = first_latent.shape
    cond = first_latent.new_zeros(B, C, n_latent_frames, h, w)
    cond[:, :, :1] = first_latent[:, :, :1]
    mask = first_latent.new_zeros(B, n_latent_frames)
    mask[:, 0] = 1.0
    return cond, mask
