"""Bout en bout minuscule : train vae -> train dit -> generate (T2V et I2V), via les lignes de commande."""

from pathlib import Path

import numpy as np
from PIL import Image

from minimoteur import generate, train
from minimoteur.pipeline import generate as gen_fn
from minimoteur.pipeline import load_moteur


def test_cli_bout_en_bout(tmp_path: Path):
    vae = tmp_path / "vae.pt"
    dit = tmp_path / "dit.pt"
    assert train.main(["vae", "--tiny", "--steps", "3", "--n-clips", "8", "--out", str(vae)]) == 0
    vae2 = tmp_path / "vae_reprise.pt"  # reprise d'un VAE existant (--init)
    assert train.main(["vae", "--tiny", "--steps", "2", "--n-clips", "8", "--init", str(vae), "--out", str(vae2)]) == 0
    assert vae2.exists()
    assert train.main(["dit", "--tiny", "--steps", "3", "--vae", str(vae), "--out", str(dit)]) == 0
    assert vae.exists() and dit.exists() and (tmp_path / "dit_log.jsonl").exists()
    dit2 = tmp_path / "dit_suite.pt"  # reprise du DiT (--init)
    assert train.main(["dit", "--tiny", "--steps", "2", "--vae", str(vae), "--init", str(dit), "--out", str(dit2)]) == 0
    assert dit2.exists()

    out = tmp_path / "clip.mp4"
    assert generate.main(["--prompt", "MODOU saute dans la Cour", "--steps", "2", "--ckpt", str(dit),
                          "--out", str(out)]) == 0
    assert out.stat().st_size > 0 and out.with_suffix(".gif").exists()
    gif = Image.open(out.with_suffix(".gif"))
    assert gif.size == (256, 256) and gif.n_frames == 17

    out2 = tmp_path / "i2v.mp4"
    assert generate.main(["--prompt", "COUMBA parle dans le Salon", "--image-from", "COUMBA parle dans le Salon",
                          "--steps", "2", "--ckpt", str(dit), "--out", str(out2), "--no-gif"]) == 0
    assert out2.exists() and (tmp_path / "i2v_image0.png").exists()

    m = load_moteur(dit)
    a = gen_fn(m, ["KOFFI tombe au Maquis"] * 2, steps=2, seed=5)
    b = gen_fn(m, ["KOFFI tombe au Maquis"] * 2, steps=2, seed=5, batch_size=1)
    assert a.shape == (2, 17, 32, 32, 3)
    assert np.abs(a.astype(int) - b.astype(int)).max() <= 1  # graine par clip, indépendante du lot
