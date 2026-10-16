"""VAE vidéo causal : formes, causalité, image seule, apprentissage."""

import math

import pytest
import torch

from minimoteur import troupe_data as td
from minimoteur.config import Config, VAEConfig
from minimoteur.vae import VideoVAE, psnr

CFG = VAEConfig(channels=(8, 16, 16), latent_channels=8)


@pytest.fixture(params=["groupnorm_image", "rms"])
def vae(request):
    """Les deux normalisations proposées doivent rester causales."""
    torch.manual_seed(0)
    return VideoVAE(VAEConfig(channels=(8, 16, 16), latent_channels=8, norm=request.param)).eval()


def test_formes_et_aller_retour(vae):
    x = torch.rand(2, 3, 17, 32, 32) * 2 - 1
    with torch.no_grad():
        z = vae.encode(x)
        y = vae.decode(z)
        zi = vae.encode_image(x[:, :, 0])
    assert z.shape == (2, 8, 5, 8, 8)
    assert y.shape == x.shape
    assert zi.shape == (2, 8, 1, 8, 8)
    assert Config().latent_shape == (8, 5, 8, 8)


@pytest.mark.parametrize("frame", [1, 4, 5, 9, 16])
def test_causalite_encodeur(vae, frame):
    """Perturber l'image f ne change pas les latents k < ceil(f/4), mais change le latent ceil(f/4)."""
    x = torch.randn(1, 3, 17, 32, 32)
    x2 = x.clone()
    x2[:, :, frame] += 1.0
    with torch.no_grad():
        z, z2 = vae.encode(x), vae.encode(x2)
    k = math.ceil(frame / 4)
    assert torch.allclose(z[:, :, :k], z2[:, :, :k], atol=1e-6)
    assert not torch.allclose(z[:, :, k], z2[:, :, k], atol=1e-4)


def test_causalite_decodeur(vae):
    """Le latent k n'influence que les images >= 4k - 3."""
    z = torch.randn(1, 8, 5, 8, 8)
    z2 = z.clone()
    z2[:, :, 2] += 1.0
    with torch.no_grad():
        y, y2 = vae.decode(z), vae.decode(z2)
    assert torch.allclose(y[:, :, :5], y2[:, :, :5], atol=1e-6)
    assert not torch.allclose(y[:, :, 5], y2[:, :, 5], atol=1e-4)


def test_image_seule_egale_premier_latent(vae):
    """Grâce à la causalité, encoder l'image 0 seule donne exactement le latent 0 du clip."""
    x = torch.randn(2, 3, 17, 32, 32)
    with torch.no_grad():
        assert torch.allclose(vae.encode(x)[:, :, 0], vae.encode(x[:, :, :1])[:, :, 0], atol=1e-5)


def test_statistiques_latentes(vae):
    xs = [torch.randn(2, 3, 17, 32, 32) for _ in range(2)]
    vae.fit_latent_stats(xs)
    with torch.no_grad():
        z = torch.cat([vae.encode(x) for x in xs])
    assert z.transpose(0, 1).reshape(8, -1).mean(1).abs().max() < 1e-3
    assert (z.transpose(0, 1).reshape(8, -1).std(1) - 1).abs().max() < 0.05


def test_le_vae_apprend():
    torch.manual_seed(0)
    vae = VideoVAE(CFG)
    clips = [td.render_clip(n, "saute", "Cour", seed=i, supersample=2) for i, n in enumerate(td.PERSONNAGES[:2])]
    x = torch.stack([td.to_model_space(c) for c in clips])
    opt = torch.optim.Adam(vae.parameters(), lr=3e-3)
    losses = []
    for _ in range(40):
        r, mu, lv = vae(x)
        loss, _ = vae.loss(x, r, mu, lv)
        opt.zero_grad()
        loss.backward()
        opt.step()
        losses.append(loss.item())
    assert losses[-1] < 0.6 * losses[0]
    assert psnr(r.detach(), x).mean() > 12


def test_perte_ponderee():
    """Poids uniforme = perte non pondérée ; un poids sur une zone n'y compte que cette zone."""
    torch.manual_seed(0)
    v = VideoVAE(CFG)
    x = torch.rand(2, 3, 5, 32, 32) * 2 - 1
    r = torch.rand(2, 3, 5, 32, 32) * 2 - 1
    mu, logvar = torch.zeros(2, 8, 2, 8, 8), torch.zeros(2, 8, 2, 8, 8)
    base, _ = v.loss(x, r, mu, logvar)
    uni, _ = v.loss(x, r, mu, logvar, torch.full((2, 1, 5, 32, 32), 3.0))
    assert torch.allclose(base, uni, atol=1e-6)
    w = torch.zeros(2, 1, 5, 32, 32)
    w[..., :8, :8] = 1.0
    r2 = r.clone()
    r2[..., 8:, :] = 5.0  # erreur énorme HORS de la zone pondérée : ignorée
    a, _ = v.loss(x, r, mu, logvar, w)
    b, _ = v.loss(x, r2, mu, logvar, w)
    assert torch.allclose(a, b, atol=1e-6)
