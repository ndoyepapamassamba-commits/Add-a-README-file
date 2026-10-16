"""VAE vidéo 3D CAUSAL : compresse 17x32x32 pixels en 5x8x8 latents de 8 canaux.

Pourquoi un VAE ? Le DiT coûte ~ (nombre de jetons)^2. On ne diffuse donc jamais
sur les pixels : on « zippe » la vidéo en une petite pâte de nombres (le latent),
on génère cette pâte, puis on « dézippe ». C'est le rôle du Wan-VAE.

Causalité (comme Wan-VAE, HunyuanVideo, Seedance)
-------------------------------------------------
Toutes les convolutions 3D sont ``CausalConv3d`` : en temps, on ne complète
QUE le passé (la 1re image est répétée), jamais le futur. Donc la sortie à
l'instant t ne dépend que des entrées <= t. Avec deux étages qui divisent le
temps par 2 (noyau 3, pas 2) :

    images   :  0 | 1 2 3 4 | 5 6 7 8 | 9 10 11 12 | 13 14 15 16
    latents  :  0 |    1    |    2    |      3     |      4

le latent k ne dépend que des images <= 4k : la 1re image est compressée SEULE
(règle « 1 + 4k »). Conséquences utiles :
* une image fixe = une vidéo d'une image (encode d'un clip de longueur 1) ;
* image->vidéo : le latent de la 1re image se calcule sans le reste du clip ;
* on pourrait encoder/décoder des vidéos longues par morceaux (cache, streaming).
Les normalisations sont des RMSNorm par position (sur les canaux) : une
GroupNorm mélangerait les instants et casserait la causalité (Wan a fait le même
remplacement).

Compression (mini-moteur vs vrais VAE)
--------------------------------------
* mini-moteur : 4x temps, 4x4 espace, 8 canaux  (17x32x32x3 -> 5x8x8x8, ~24x moins de nombres)
* Wan 2.1     : 4x temps, 8x8 espace, 16 canaux (127 M paramètres, ~48x)
* Wan 2.2     : 4x temps, 16x16 espace, 48 canaux (~64x, 4x32x32 avec la patchification)

Choix de régularisation : VAE à KL faible (beta = 1e-4, perte L1 + MSE + beta.KL),
comme Wan (L1 + KL 3e-6 + LPIPS + GAN, sans LPIPS ni GAN ici). Le latent n'est
pas forcément centré-réduit : après l'entraînement, on mesure sur les données
la moyenne et l'écart-type de chaque canal (``latent_mean`` / ``latent_std``,
comme les listes ``mean``/``std`` du Wan-VAE) et ``encode()`` renvoie un latent
normalisé (~ N(0, 1)), à la même échelle que le bruit de la diffusion.
"""

from __future__ import annotations

import math

import torch
import torch.nn as nn
import torch.nn.functional as F

from .config import VAEConfig


def _triple(k):
    return (k, k, k) if isinstance(k, int) else tuple(k)


class CausalConv3d(nn.Module):
    """Conv3d causale en temps : complète (noyau-1) images dans le PASSÉ seulement.

    Le complément temporel répète la 1re image (« replicate ») ; le complément
    spatial est fait de zéros, symétrique.
    """

    def __init__(self, cin: int, cout: int, kernel=3, stride=1):
        super().__init__()
        kt, kh, kw = _triple(kernel)
        self.pad_t = kt - 1
        self.pad_h, self.pad_w = kh // 2, kw // 2
        self.conv = nn.Conv3d(cin, cout, (kt, kh, kw), stride=_triple(stride), padding=0)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if self.pad_h or self.pad_w:
            x = F.pad(x, (self.pad_w, self.pad_w, self.pad_h, self.pad_h, 0, 0))
        if self.pad_t:
            x = torch.cat([x[:, :, :1].expand(-1, -1, self.pad_t, -1, -1), x], dim=2)
        return self.conv(x)


class ChannelRMSNorm(nn.Module):
    """RMSNorm sur les canaux, position par position (donc causale)."""

    def __init__(self, c: int, eps: float = 1e-6):
        super().__init__()
        self.eps = eps
        self.gamma = nn.Parameter(torch.ones(1, c, 1, 1, 1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x * torch.rsqrt(x.pow(2).mean(1, keepdim=True) + self.eps) * self.gamma


class FrameGroupNorm(nn.Module):
    """GroupNorm calculée image par image (groupes de canaux x H x W d'UNE image).

    Aucune statistique ne traverse le temps : c'est causal, comme la RMSNorm de
    Wan, et dans nos essais cela converge nettement plus vite sur CPU.
    """

    def __init__(self, c: int, groups: int = 8):
        super().__init__()
        self.gn = nn.GroupNorm(math.gcd(groups, c), c, eps=1e-6)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, C, T, H, W = x.shape
        y = self.gn(x.transpose(1, 2).reshape(B * T, C, H, W))
        return y.reshape(B, T, C, H, W).transpose(1, 2)


def make_norm(kind: str, c: int) -> nn.Module:
    if kind == "rms":
        return ChannelRMSNorm(c)
    if kind == "groupnorm_image":
        return FrameGroupNorm(c)
    raise ValueError(f"normalisation inconnue : {kind}")


class ResBlock(nn.Module):
    def __init__(self, cin: int, cout: int, norm: str = "groupnorm_image"):
        super().__init__()
        self.n1 = make_norm(norm, cin)
        self.c1 = CausalConv3d(cin, cout, 3)
        self.n2 = make_norm(norm, cout)
        self.c2 = CausalConv3d(cout, cout, 3)
        self.skip = nn.Conv3d(cin, cout, 1) if cin != cout else nn.Identity()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.c1(F.silu(self.n1(x)))
        h = self.c2(F.silu(self.n2(h)))
        return self.skip(x) + h


class Upsample(nn.Module):
    """x2 en temps (1+k -> 1+2k) et en espace, de façon causale.

    Une conv temporelle causale produit 2 sous-images par instant ; on les
    entrelace (2T images) puis on retire la toute première : l'image 0 reste
    seule, comme à l'encodage. Puis voisin le plus proche x2 en espace + conv.
    """

    def __init__(self, cin: int, cout: int):
        super().__init__()
        self.time_conv = CausalConv3d(cin, 2 * cin, kernel=(3, 1, 1))
        self.conv = CausalConv3d(cin, cout, 3)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, C, T, H, W = x.shape
        y = self.time_conv(x).view(B, 2, C, T, H, W).permute(0, 2, 3, 1, 4, 5).reshape(B, C, 2 * T, H, W)
        y = y[:, :, 1:]
        y = F.interpolate(y, scale_factor=(1, 2, 2), mode="nearest")
        return self.conv(y)


def _per_stage(n, n_stages: int) -> tuple[int, ...]:
    """Nombre de blocs résiduels par étage (entier commun ou un nombre par étage)."""
    return tuple(n) if isinstance(n, (tuple, list)) else (int(n),) * n_stages


class Encoder(nn.Module):
    def __init__(self, cfg: VAEConfig, in_ch: int = 3):
        super().__init__()
        ch, nb, norm = cfg.channels, _per_stage(cfg.n_res_blocks, len(cfg.channels)), cfg.norm
        self.conv_in = CausalConv3d(in_ch, ch[0], 3)
        blocks: list[nn.Module] = []
        for i, c in enumerate(ch):
            blocks += [ResBlock(c, c, norm) for _ in range(nb[i])]
            if i < len(ch) - 1:
                blocks.append(CausalConv3d(c, ch[i + 1], 3, stride=2))  # /2 en temps et en espace
        self.down = nn.Sequential(*blocks)
        self.mid = ResBlock(ch[-1], ch[-1], norm)
        self.norm_out = make_norm(norm, ch[-1])
        self.conv_out = CausalConv3d(ch[-1], 2 * cfg.latent_channels, 3)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.mid(self.down(self.conv_in(x)))
        return self.conv_out(F.silu(self.norm_out(h)))


class Decoder(nn.Module):
    def __init__(self, cfg: VAEConfig, out_ch: int = 3):
        super().__init__()
        ch, nb, norm = cfg.channels, _per_stage(cfg.n_res_blocks, len(cfg.channels)), cfg.norm
        self.conv_in = CausalConv3d(cfg.latent_channels, ch[-1], 3)
        self.mid = ResBlock(ch[-1], ch[-1], norm)
        blocks: list[nn.Module] = []
        for i in reversed(range(len(ch))):
            blocks += [ResBlock(ch[i], ch[i], norm) for _ in range(nb[i])]
            if i > 0:
                blocks.append(Upsample(ch[i], ch[i - 1]))
        self.up = nn.Sequential(*blocks)
        self.norm_out = make_norm(norm, ch[0])
        self.conv_out = CausalConv3d(ch[0], out_ch, 3)

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        h = self.up(self.mid(self.conv_in(z)))
        return self.conv_out(F.silu(self.norm_out(h)))


class VideoVAE(nn.Module):
    """VAE vidéo causal. ``encode`` / ``decode`` travaillent en latent NORMALISÉ."""

    def __init__(self, cfg: VAEConfig):
        super().__init__()
        self.cfg = cfg
        self.encoder = Encoder(cfg)
        self.decoder = Decoder(cfg)
        C = cfg.latent_channels
        self.register_buffer("latent_mean", torch.zeros(C))
        self.register_buffer("latent_std", torch.ones(C))

    # -- latent brut ---------------------------------------------------------
    def encode_dist(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """x (B, 3, T, H, W) dans [-1, 1] -> (mu, logvar) bruts (B, C, t, h, w)."""
        mu, logvar = self.encoder(x).chunk(2, dim=1)
        return mu, logvar.clamp(-30.0, 20.0)

    def _stats(self, z: torch.Tensor):
        shape = (1, -1) + (1,) * (z.dim() - 2)
        return self.latent_mean.view(shape), self.latent_std.view(shape)

    def normalize(self, z: torch.Tensor) -> torch.Tensor:
        m, s = self._stats(z)
        return (z - m) / s

    def denormalize(self, z: torch.Tensor) -> torch.Tensor:
        m, s = self._stats(z)
        return z * s + m

    # -- interface publique -------------------------------------------------
    def encode(self, x: torch.Tensor, sample: bool = False, generator: torch.Generator | None = None) -> torch.Tensor:
        """Pixels -> latent normalisé. ``sample=False`` renvoie la moyenne (déterministe)."""
        mu, logvar = self.encode_dist(x)
        z = mu
        if sample:
            eps = torch.randn(mu.shape, generator=generator, device=mu.device, dtype=mu.dtype)
            z = mu + torch.exp(0.5 * logvar) * eps
        return self.normalize(z)

    def decode(self, z: torch.Tensor) -> torch.Tensor:
        """Latent normalisé -> pixels (non bornés ; à borner dans [-1, 1] pour l'affichage)."""
        return self.decoder(self.denormalize(z))

    def encode_image(self, img: torch.Tensor) -> torch.Tensor:
        """Image (B, 3, H, W) -> latent (B, C, 1, h, w) : une image = une vidéo d'une image."""
        return self.encode(img.unsqueeze(2))

    def forward(self, x: torch.Tensor):
        """Passe d'entraînement : renvoie (reconstruction, mu, logvar)."""
        mu, logvar = self.encode_dist(x)
        z = mu + torch.exp(0.5 * logvar) * torch.randn_like(mu)
        return self.decoder(z), mu, logvar

    def loss(self, x: torch.Tensor, recon: torch.Tensor, mu: torch.Tensor, logvar: torch.Tensor):
        l1 = (recon - x).abs().mean()
        mse = (recon - x).pow(2).mean()
        kl = 0.5 * (mu.pow(2) + logvar.exp() - 1.0 - logvar).mean()
        total = l1 + self.cfg.mse_weight * mse + self.cfg.kl_weight * kl
        return total, {"l1": l1.item(), "mse": mse.item(), "kl": kl.item()}

    @torch.no_grad()
    def fit_latent_stats(self, batches) -> None:
        """Mesure moyenne / écart-type de chaque canal latent sur des lots de clips."""
        s = s2 = n = 0.0
        for x in batches:
            mu, _ = self.encode_dist(x)
            C = mu.shape[1]
            flat = mu.transpose(0, 1).reshape(C, -1).double()
            s = s + flat.sum(1)
            s2 = s2 + flat.pow(2).sum(1)
            n += flat.shape[1]
        mean = s / n
        std = (s2 / n - mean.pow(2)).clamp_min(1e-8).sqrt()
        self.latent_mean.copy_(mean.float())
        self.latent_std.copy_(std.float())

    @property
    def scaling_factor(self) -> float:
        """Équivalent « facteur d'échelle » global (comme 0,18215 pour SD) : 1 / std moyen."""
        return float(1.0 / self.latent_std.mean())


def psnr(x: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
    """PSNR (dB) par exemple, pour des tenseurs dans [-1, 1] (ramenés à [0, 1])."""
    x = (x.clamp(-1, 1) + 1) / 2
    y = (y.clamp(-1, 1) + 1) / 2
    mse = (x - y).pow(2).flatten(1).mean(1).clamp_min(1e-10)
    return 10 * torch.log10(1.0 / mse)
