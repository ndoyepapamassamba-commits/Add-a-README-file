"""Entraînement du mini-moteur sur CPU, en deux temps (comme les vrais moteurs).

1. Le VAE vidéo apprend à compresser / décompresser les clips :

       python -m minimoteur.train vae

2. Le DiT (+ l'encodeur de texte) apprend à débruiter les latents du VAE gelé,
   en flow matching, avec 50 % d'exemples image->vidéo et 10 % de texte effacé
   (pour la guidance sans classifieur) :

       python -m minimoteur.train dit

Les checkpoints et journaux vont dans ``runs/`` (``vae.pt``, ``dit.pt``,
``*_log.jsonl``). ``--tiny`` lance une version minuscule (test de bout en bout).
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import torch

from .config import RUNS_DIR, Config, count_params, tiny_config
from .flow import flow_matching_loss, interpolate, sample_t
from .pipeline import build_dit, load_vae
from .text_encoder import Tokenizer
from .troupe_data import build_dataset, to_model_space
from .vae import VideoVAE, psnr


# ---------------------------------------------------------------------------
# Outils
# ---------------------------------------------------------------------------
class EMA:
    """Moyenne exponentielle des poids (les échantillons sont tirés des poids EMA)."""

    def __init__(self, model: torch.nn.Module, decay: float):
        self.decay = decay
        self.model = copy.deepcopy(model).eval()
        for p in self.model.parameters():
            p.requires_grad_(False)

    @torch.no_grad()
    def update(self, model: torch.nn.Module, step: int) -> None:
        d = min(self.decay, (1 + step) / (10 + step))  # démarrage progressif
        for pe, p in zip(self.model.parameters(), model.parameters()):
            pe.lerp_(p.detach(), 1.0 - d)
        for be, b in zip(self.model.buffers(), model.buffers()):
            be.copy_(b)


def lr_at(step: int, total: int, base: float, warmup: int) -> float:
    """Montée linéaire puis décroissance cosinus jusqu'à 10 % du taux de base."""
    if step < warmup:
        return base * (step + 1) / warmup
    k = (step - warmup) / max(1, total - warmup)
    return base * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * min(1.0, k))))


class Logger:
    def __init__(self, path: Path, total: int):
        self.path, self.total = path, total
        path.parent.mkdir(parents=True, exist_ok=True)
        self.f = path.open("w", encoding="utf-8")
        self.t0 = time.time()

    def log(self, step: int, **vals) -> None:
        elapsed = time.time() - self.t0
        rec = {"step": step, "temps_s": round(elapsed, 2), **{k: (round(v, 6) if isinstance(v, float) else v)
                                                               for k, v in vals.items()}}
        self.f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        self.f.flush()
        eta = elapsed / max(step, 1) * (self.total - step)
        parts = " | ".join((f"{k} {v:.2e}" if abs(v) < 0.01 else f"{k} {v:.4f}") if isinstance(v, float)
                           else f"{k} {v}" for k, v in vals.items())
        print(f"pas {step:>5}/{self.total} | {parts} | {elapsed / max(step, 1):.3f} s/pas | reste ~{eta / 60:.1f} min",
              flush=True)

    def close(self) -> None:
        self.f.close()


def _base_config(args) -> Config:
    return tiny_config() if getattr(args, "tiny", False) else Config()


def _setup(args) -> None:
    torch.set_num_threads(args.threads)
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)


# ---------------------------------------------------------------------------
# VAE
# ---------------------------------------------------------------------------
def train_vae(args) -> Path:
    cfg = _base_config(args)
    cfg.train.threads = args.threads
    if args.steps is not None:
        cfg.train.vae_steps = args.steps
    if args.batch is not None:
        cfg.train.vae_batch = args.batch
    if args.lr is not None:
        cfg.train.vae_lr = args.lr
    if args.n_clips is not None:
        cfg.data.n_train_clips = args.n_clips
    _setup(args)
    out = Path(args.out) if args.out else RUNS_DIR / "vae.pt"
    tc = cfg.train

    t0 = time.time()
    cache_dir = out.parent / "cache"
    ds = build_dataset("train", cfg.data.n_train_clips, cfg.data.seed, cfg.data.supersample, cache_dir=cache_dir)
    print(f"[données] {len(ds)} clips d'entraînement {ds.clips.shape[1:]} en {time.time() - t0:.1f} s", flush=True)

    vae = VideoVAE(cfg.vae)
    print(f"[VAE] {count_params(vae):,} paramètres ; latent {cfg.latent_shape} ; "
          f"{tc.vae_steps} pas x lot {tc.vae_batch}", flush=True)
    opt = torch.optim.AdamW(vae.parameters(), lr=tc.vae_lr, betas=(0.9, 0.99), weight_decay=0.0)
    g = torch.Generator().manual_seed(args.seed)
    logger = Logger(out.with_name(out.stem + "_log.jsonl"), tc.vae_steps)
    run = {"loss": 0.0, "l1": 0.0, "psnr": 0.0, "n": 0}
    t_steps = time.time()
    for step in range(1, tc.vae_steps + 1):
        for gr in opt.param_groups:
            gr["lr"] = lr_at(step - 1, tc.vae_steps, tc.vae_lr, tc.warmup)
        idx = torch.randint(len(ds), (tc.vae_batch,), generator=g).numpy()
        x = to_model_space(ds.clips[idx])
        if torch.rand(1, generator=g).item() < 0.5:  # augmentation : miroir horizontal
            x = x.flip(-1)
        vae.train()
        recon, mu, logvar = vae(x)
        loss, parts = vae.loss(x, recon, mu, logvar)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(vae.parameters(), tc.grad_clip)
        opt.step()
        run["loss"] += loss.item()
        run["l1"] += parts["l1"]
        run["psnr"] += psnr(recon.detach(), x).mean().item()
        run["n"] += 1
        if step % tc.log_every == 0 or step == tc.vae_steps:
            n = run.pop("n")
            logger.log(step, perte=run["loss"] / n, l1=run["l1"] / n, psnr_dB=run["psnr"] / n, kl=parts["kl"],
                       lr=opt.param_groups[0]["lr"])
            run = {"loss": 0.0, "l1": 0.0, "psnr": 0.0, "n": 0}
        if step % tc.save_every == 0 and step < tc.vae_steps:
            _save_vae(out, vae, cfg, step, {})
    sec_per_step = (time.time() - t_steps) / tc.vae_steps
    logger.close()

    # Normalisation du latent mesurée sur les données (comme mean/std du Wan-VAE).
    vae.eval()
    n_stats = min(len(ds), 512)
    vae.fit_latent_stats(to_model_space(ds.clips[i: i + 32]) for i in range(0, n_stats, 32))
    # PSNR sur des clips de combinaisons jamais vues.
    held = build_dataset("heldout", cfg.data.n_eval_clips, cfg.data.seed, cfg.data.supersample, cache_dir=cache_dir)
    with torch.no_grad():
        scores = [psnr(vae.decode(vae.encode(x)), x) for x in
                  (to_model_space(held.clips[i: i + 32]) for i in range(0, len(held), 32))]
    held_psnr = torch.cat(scores).mean().item()
    metrics = {"psnr_heldout_dB": round(held_psnr, 2), "s_par_pas": round(sec_per_step, 4),
               "latent_mean": [round(v, 4) for v in vae.latent_mean.tolist()],
               "latent_std": [round(v, 4) for v in vae.latent_std.tolist()],
               "duree_min": round((time.time() - t0) / 60, 2), "params": count_params(vae)}
    _save_vae(out, vae, cfg, tc.vae_steps, metrics)
    print(f"[VAE] PSNR sur clips tenus à l'écart : {held_psnr:.2f} dB ; {sec_per_step:.3f} s/pas ; "
          f"checkpoint -> {out}", flush=True)
    return out


def _save_vae(path: Path, vae: VideoVAE, cfg: Config, step: int, metrics: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    torch.save({"kind": "vae", "config": cfg.to_dict(), "vae": vae.state_dict(), "step": step,
                "metrics": metrics}, tmp)
    tmp.replace(path)


# ---------------------------------------------------------------------------
# DiT
# ---------------------------------------------------------------------------
def _vae_fingerprint(path: Path) -> str:
    st = path.stat()
    return hashlib.sha1(f"{path.resolve()}:{st.st_size}:{st.st_mtime_ns}".encode()).hexdigest()[:12]


@torch.no_grad()
def encode_dataset(vae: VideoVAE, clips: np.ndarray, batch: int = 64) -> torch.Tensor:
    """Pré-calcule les latents (moyenne du VAE, normalisés) de tous les clips."""
    out = [vae.encode(to_model_space(clips[i: i + batch])) for i in range(0, len(clips), batch)]
    return torch.cat(out)


def train_dit(args) -> Path:
    vae_path = Path(args.vae) if args.vae else RUNS_DIR / "vae.pt"
    vae, cfg, _ = load_vae(vae_path)
    if args.tiny:
        tiny = tiny_config()
        cfg.text, cfg.dit, cfg.train = tiny.text, tiny.dit, tiny.train
    cfg.train.threads = args.threads
    for name, attr in (("steps", "dit_steps"), ("batch", "dit_batch"), ("lr", "dit_lr")):
        if getattr(args, name) is not None:
            setattr(cfg.train, attr, getattr(args, name))
    if args.n_clips is not None:
        cfg.data.n_train_clips = args.n_clips
    for name in ("hidden", "depth", "heads"):
        if getattr(args, name, None) is not None:
            setattr(cfg.dit, "n_heads" if name == "heads" else name, getattr(args, name))
    _setup(args)
    out = Path(args.out) if args.out else RUNS_DIR / "dit.pt"
    tc, fc = cfg.train, cfg.flow

    t0 = time.time()
    ds = build_dataset("train", cfg.data.n_train_clips, cfg.data.seed, cfg.data.supersample,
                       cache_dir=out.parent / "cache")
    cache = out.parent / "cache" / f"latents_{_vae_fingerprint(vae_path)}_{len(ds)}_s{cfg.data.seed}.pt"
    if cache.exists():
        latents = torch.load(cache)
    else:
        latents = encode_dataset(vae, ds.clips)
        cache.parent.mkdir(parents=True, exist_ok=True)
        torch.save(latents, cache)
    print(f"[données] {len(ds)} clips -> latents {tuple(latents.shape[1:])} "
          f"(moyenne {latents.mean():.3f}, écart-type {latents.std():.3f}) en {time.time() - t0:.1f} s", flush=True)

    tok = Tokenizer.default()
    ids, mask = tok.batch(ds.prompts, cfg.text.max_len)
    text, dit = build_dit(cfg, tok)
    print(f"[texte] vocabulaire {len(tok)} mots ; {count_params(text):,} paramètres", flush=True)
    print(f"[DiT] {count_params(dit):,} paramètres ; {cfg.dit.depth} blocs x {cfg.dit.hidden} ; "
          f"{tc.dit_steps} pas x lot {tc.dit_batch}", flush=True)
    params = list(text.parameters()) + list(dit.parameters())
    decay = [p for p in params if p.dim() >= 2]
    no_decay = [p for p in params if p.dim() < 2]
    opt = torch.optim.AdamW([{"params": decay, "weight_decay": tc.weight_decay},
                             {"params": no_decay, "weight_decay": 0.0}], lr=tc.dit_lr, betas=(0.9, 0.99))
    ema_text, ema_dit = EMA(text, tc.ema_decay), EMA(dit, tc.ema_decay)
    g = torch.Generator().manual_seed(args.seed)
    B, T = tc.dit_batch, latents.shape[2]
    logger = Logger(out.with_name(out.stem + "_log.jsonl"), tc.dit_steps)
    run_loss, run_n = 0.0, 0
    t_steps = time.time()
    for step in range(1, tc.dit_steps + 1):
        for gr in opt.param_groups:
            gr["lr"] = lr_at(step - 1, tc.dit_steps, tc.dit_lr, tc.warmup)
        idx = torch.randint(len(latents), (B,), generator=g)
        x0 = latents[idx]
        # 1) texte, effacé ~10 % du temps (CFG)
        drop = torch.rand(B, generator=g) < fc.cond_drop
        text.train()
        dit.train()
        ctx, cmask = text.encode_with_dropout(ids[idx], mask[idx], drop)
        # 2) image->vidéo pour ~50 % des exemples : latent de l'image 0 + masque
        i2v = torch.rand(B, generator=g) < fc.i2v_prob
        cond = torch.zeros_like(x0)
        cond[i2v, :, 0] = x0[i2v, :, 0]
        cond_mask = torch.zeros(B, T)
        cond_mask[i2v, 0] = 1.0
        # 3) flow matching : x_t = (1-t) x0 + t bruit, cible v = bruit - x0
        t = sample_t(B, fc.logit_mean, fc.logit_std, fc.train_shift, generator=g)
        noise = torch.randn(x0.shape, generator=g)
        v = dit(interpolate(x0, noise, t), t, ctx, cmask, cond, cond_mask)
        loss = flow_matching_loss(v, x0, noise)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        gnorm = torch.nn.utils.clip_grad_norm_(params, tc.grad_clip)
        opt.step()
        ema_text.update(text, step)
        ema_dit.update(dit, step)
        run_loss += loss.item()
        run_n += 1
        if step % tc.log_every == 0 or step == tc.dit_steps:
            logger.log(step, perte=run_loss / run_n, norme_grad=float(gnorm), lr=opt.param_groups[0]["lr"])
            run_loss, run_n = 0.0, 0
        if step % tc.save_every == 0 and step < tc.dit_steps:
            _save_dit(out, cfg, vae, text, dit, ema_text, ema_dit, tok, step, vae_path, {})
    sec_per_step = (time.time() - t_steps) / tc.dit_steps
    logger.close()
    metrics = {"s_par_pas": round(sec_per_step, 4), "duree_min": round((time.time() - t0) / 60, 2),
               "params_dit": count_params(dit), "params_texte": count_params(text)}
    _save_dit(out, cfg, vae, text, dit, ema_text, ema_dit, tok, tc.dit_steps, vae_path, metrics)
    print(f"[DiT] {sec_per_step:.3f} s/pas ; checkpoint -> {out}", flush=True)
    return out


def _save_dit(path, cfg, vae, text, dit, ema_text, ema_dit, tok, step, vae_path, metrics) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    torch.save({
        "kind": "moteur", "config": cfg.to_dict(), "step": step, "vae_path": str(vae_path),
        "vae": vae.state_dict(), "tokenizer": tok.state_dict(),
        "text": text.state_dict(), "dit": dit.state_dict(),
        "text_ema": ema_text.model.state_dict(), "dit_ema": ema_dit.model.state_dict(),
        "metrics": metrics,
    }, tmp)
    tmp.replace(path)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m minimoteur.train",
        description="Entraîne le mini-moteur vidéo de la troupe sur CPU : d'abord « vae », puis « dit ».",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        sp.add_argument("--steps", type=int, default=None, help="nombre de pas d'optimisation")
        sp.add_argument("--batch", type=int, default=None, help="taille de lot")
        sp.add_argument("--lr", type=float, default=None, help="taux d'apprentissage de base")
        sp.add_argument("--n-clips", type=int, default=None, help="nombre de clips d'entraînement générés")
        sp.add_argument("--seed", type=int, default=0, help="graine aléatoire")
        sp.add_argument("--threads", type=int, default=4, help="fils de calcul CPU (torch.set_num_threads)")
        sp.add_argument("--out", default=None, help="chemin du checkpoint (défaut : runs/vae.pt ou runs/dit.pt)")
        sp.add_argument("--tiny", action="store_true", help="configuration minuscule (test de bout en bout)")

    sv = sub.add_parser("vae", help="entraîne le VAE vidéo causal")
    common(sv)
    sd = sub.add_parser("dit", help="entraîne le DiT + l'encodeur de texte (VAE gelé)")
    common(sd)
    sd.add_argument("--vae", default=None, help="checkpoint du VAE (défaut : runs/vae.pt)")
    sd.add_argument("--hidden", type=int, default=None, help="largeur du DiT")
    sd.add_argument("--depth", type=int, default=None, help="nombre de blocs du DiT")
    sd.add_argument("--heads", type=int, default=None, help="nombre de têtes d'attention")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.cmd == "vae":
        train_vae(args)
    else:
        train_dit(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
