"""Flow matching / rectified flow : l'objectif d'entraînement et l'échantillonneur.

Conventions de signe (À LIRE : chaque article choisit les siennes)
------------------------------------------------------------------
* x0    = donnée propre (le latent d'un vrai clip)
* bruit = epsilon ~ N(0, I)
* t dans [0, 1], t = 0 -> donnée, t = 1 -> bruit pur
* interpolation linéaire : x_t = (1 - t) * x0 + t * bruit
* vitesse cible : v = d x_t / d t = bruit - x0   (le réseau prédit v)
* génération : on part de x_1 = bruit et on intègre l'EDO dx/dt = v de t = 1
  vers t = 0 avec Euler : x_{t'} = x_t + (t' - t) * v   (t' < t, donc on
  RETIRE un peu de vitesse à chaque pas).

C'est la convention du code de Wan / SD3 / diffusers (où t s'appelle « sigma »).
Le rapport de Wan écrit l'inverse (x_t = t*x1 + (1-t)*x0 avec x1 = donnée,
x0 = bruit, v = x1 - x0) : même chose avec t <-> 1 - t et v changé de signe.

Tirage de t : logit-normal, t = sigmoid(N(0, 1)) (Wan, HunyuanVideo, Movie Gen,
SD3) : on s'entraîne surtout aux niveaux de bruit intermédiaires.

« Shift » du calendrier : t' = s*t / (1 + (s-1)*t). Avec s > 1 on passe plus de
pas près du bruit (t proche de 1), là où se décident la composition et le
mouvement. Wan 2.2 : s = 5 ; HunyuanVideo : s = 7 (50 pas).

Guidance sans classifieur (CFG) : v = v_nul + w * (v_texte - v_nul).
w = 1 -> modèle conditionnel seul ; w > 1 -> on pousse « dans le sens du texte ».
Pendant l'entraînement, le texte est remplacé par l'embedding nul ~10 % du temps
pour que le même réseau sache prédire v_nul.
"""

from __future__ import annotations

from typing import Callable

import torch


def sample_t(n: int, mean: float = 0.0, std: float = 1.0, shift: float = 1.0,
             generator: torch.Generator | None = None, device=None) -> torch.Tensor:
    """t ~ logit-normal(mean, std), puis shift optionnel. Valeurs dans ]0, 1[."""
    t = torch.sigmoid(mean + std * torch.randn(n, generator=generator, device=device))
    return shift_t(t, shift)


def shift_t(t: torch.Tensor, shift: float) -> torch.Tensor:
    """t' = s*t / (1 + (s-1)*t) : identité si s = 1, garde 0 -> 0 et 1 -> 1."""
    if shift == 1.0:
        return t
    return shift * t / (1.0 + (shift - 1.0) * t)


def _bcast(t: torch.Tensor, like: torch.Tensor) -> torch.Tensor:
    return t.reshape(-1, *([1] * (like.dim() - 1))).to(like.dtype)


def interpolate(x0: torch.Tensor, noise: torch.Tensor, t: torch.Tensor) -> torch.Tensor:
    """x_t = (1 - t) * x0 + t * bruit."""
    tt = _bcast(t, x0)
    return (1.0 - tt) * x0 + tt * noise


def velocity_target(x0: torch.Tensor, noise: torch.Tensor) -> torch.Tensor:
    """v = d x_t / dt = bruit - x0."""
    return noise - x0


def flow_matching_loss(v_pred: torch.Tensor, x0: torch.Tensor, noise: torch.Tensor) -> torch.Tensor:
    """Erreur quadratique moyenne sur la vitesse."""
    return (v_pred - velocity_target(x0, noise)).pow(2).mean()


def timesteps(n_steps: int, shift: float = 1.0, device=None) -> torch.Tensor:
    """n_steps + 1 instants de 1 (bruit) à 0 (donnée), décalés par ``shift``."""
    t = torch.linspace(1.0, 0.0, n_steps + 1, device=device)
    return shift_t(t, shift)


def cfg_combine(v_uncond: torch.Tensor, v_cond: torch.Tensor, scale: float) -> torch.Tensor:
    """Guidance sans classifieur : v = v_nul + w * (v_texte - v_nul)."""
    return v_uncond + scale * (v_cond - v_uncond)


@torch.no_grad()
def euler_sample(velocity_fn: Callable[[torch.Tensor, torch.Tensor], torch.Tensor], x1: torch.Tensor,
                 n_steps: int, shift: float = 1.0,
                 callback: Callable[[int, torch.Tensor, torch.Tensor], None] | None = None) -> torch.Tensor:
    """Intègre dx/dt = v(x, t) de t = 1 (x1 = bruit) à t = 0 par Euler explicite.

    ``velocity_fn(x, t)`` reçoit t de forme (B,). Renvoie l'estimation de x0.
    """
    ts = timesteps(n_steps, shift, device=x1.device)
    x = x1
    B = x1.shape[0]
    for i in range(n_steps):
        t, t_next = ts[i], ts[i + 1]
        v = velocity_fn(x, t.expand(B))
        x = x + (t_next - t) * v
        if callback is not None:
            callback(i, x, t_next)
    return x
