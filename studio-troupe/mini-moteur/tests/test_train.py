"""Entraînement : origine de la configuration du DiT, --stop-at, reprise (EMA, pas global, graine, AdamW)."""

import json

import pytest
import torch

from minimoteur import train


@pytest.fixture(scope="module")
def vae_tiny(tmp_path_factory):
    d = tmp_path_factory.mktemp("vae")
    vae = d / "vae.pt"
    assert train.main(["vae", "--tiny", "--steps", "2", "--n-clips", "8", "--out", str(vae)]) == 0
    return vae


def _dit(vae, out, *extra):
    assert train.main(["dit", "--tiny", "--n-clips", "8", "--vae", str(vae), "--out", str(out), *extra]) == 0
    return torch.load(out, map_location="cpu", weights_only=False)


def test_config_du_dit_vient_de_config_py(vae_tiny, tmp_path):
    # Un VAE dont le checkpoint porte d'anciens réglages du DiT : ils doivent être ignorés.
    ck = torch.load(vae_tiny, map_location="cpu", weights_only=False)
    ck["config"]["train"]["dit_lr"] = 0.123
    ck["config"]["dit"]["hidden"] = 48
    vieux = tmp_path / "vae_vieux.pt"
    torch.save(ck, vieux)
    out = _dit(vieux, tmp_path / "dit.pt", "--steps", "1")
    cfg = out["config"]
    assert cfg["train"]["dit_lr"] == 5e-4 and cfg["dit"]["hidden"] == 64  # valeurs de config.py (tiny_config)
    assert cfg["vae"] == ck["config"]["vae"] and cfg["data"] == ck["config"]["data"]  # latents : ceux du VAE


def test_stop_at_garde_le_calendrier(vae_tiny, tmp_path):
    ck = _dit(vae_tiny, tmp_path / "dit.pt", "--steps", "8", "--stop-at", "3")
    assert ck["step"] == 3 and ck["metrics"]["calendrier_pas"] == 8
    log = [json.loads(l) for l in (tmp_path / "dit_log.jsonl").read_text().splitlines()]
    tc = train.tiny_config().train
    assert log[-1]["step"] == 3
    assert log[-1]["lr"] == pytest.approx(train.lr_at(2, 8, tc.dit_lr, tc.warmup), rel=1e-4)


def test_reprise_continue_l_ema_et_le_pas_global(vae_tiny, tmp_path):
    a = _dit(vae_tiny, tmp_path / "dit.pt", "--steps", "3")
    assert a["step"] == 3 and "opt" in a
    b = _dit(vae_tiny, tmp_path / "dit_suite.pt", "--steps", "1", "--init", str(tmp_path / "dit.pt"))
    assert b["step"] == 4 and b["metrics"]["graine"] == 3  # graine décalée : pas les mêmes tirages
    # EMA mise à jour au pas GLOBAL 4 : d = min(decay, 5/14), pas (1+1)/(10+1) comme une EMA neuve.
    d = min(train.tiny_config().train.ema_decay, 5 / 14)
    for k, ema_avant in a["dit_ema"].items():
        attendu = d * ema_avant + (1 - d) * b["dit"][k]
        assert torch.allclose(b["dit_ema"][k], attendu, atol=1e-6), k
    # l'état AdamW a été repris : le compteur de pas de l'optimiseur continue (3 -> 4) au lieu de repartir à 1
    avant = {i: float(s["step"]) for i, s in a["opt"]["state"].items()}
    apres = {i: float(s["step"]) for i, s in b["opt"]["state"].items()}
    assert max(apres.values()) == 4 and all(apres[i] >= n for i, n in avant.items())
