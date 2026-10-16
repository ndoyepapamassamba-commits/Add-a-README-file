"""Flow matching : interpolation, signe de la vitesse, shift, Euler, CFG."""

import torch

from minimoteur.flow import (
    cfg_combine, euler_sample, interpolate, sample_t, shift_t, timesteps, velocity_target,
)


def test_interpolation_bornes():
    x0, n = torch.randn(3, 4, 5), torch.randn(3, 4, 5)
    assert torch.allclose(interpolate(x0, n, torch.zeros(3)), x0)
    assert torch.allclose(interpolate(x0, n, torch.ones(3)), n)
    mid = interpolate(x0, n, torch.full((3,), 0.25))
    assert torch.allclose(mid, 0.75 * x0 + 0.25 * n)


def test_signe_de_la_vitesse():
    """v = bruit - x0 est bien la dérivée dx_t/dt (t va de la donnée vers le bruit)."""
    x0, n = torch.randn(2, 6, dtype=torch.float64), torch.randn(2, 6, dtype=torch.float64)
    t, h = torch.full((2,), 0.3, dtype=torch.float64), 1e-6
    fd = (interpolate(x0, n, t + h) - interpolate(x0, n, t)) / h
    assert torch.allclose(fd, velocity_target(x0, n), atol=1e-6)
    assert torch.allclose(velocity_target(x0, n), n - x0)


def test_shift_et_calendrier():
    t = torch.linspace(0, 1, 11)
    assert torch.allclose(shift_t(t, 1.0), t)
    s = shift_t(t, 3.0)
    assert s[0] == 0 and torch.isclose(s[-1], torch.tensor(1.0))
    assert (s >= t - 1e-7).all() and (s[1:] > s[:-1]).all()
    ts = timesteps(10, 3.0)
    assert len(ts) == 11 and ts[0] == 1 and ts[-1] == 0 and (ts[1:] < ts[:-1]).all()


def test_t_logit_normal():
    t = sample_t(20000, generator=torch.Generator().manual_seed(0))
    assert (t > 0).all() and (t < 1).all()
    assert abs(t.median().item() - 0.5) < 0.02
    assert ((t > 0.25) & (t < 0.75)).float().mean() > 0.6  # concentré au milieu


def test_euler_sur_champ_analytique():
    """Pour une donnée unique c, la vitesse exacte est v(x, t) = (x - c)/t : Euler la suit exactement."""
    c = torch.randn(4, 3)
    x1 = torch.randn(4, 3)
    for steps, shift in ((1, 1.0), (7, 3.0), (30, 5.0)):
        out = euler_sample(lambda x, t: (x - c) / t.view(-1, 1), x1, steps, shift)
        assert torch.allclose(out, c, atol=1e-5)
    k = torch.randn(4, 3)
    out = euler_sample(lambda x, t: k.expand_as(x), x1, 13, 2.0)  # vitesse constante : x0 = x1 - k
    assert torch.allclose(out, x1 - k, atol=1e-5)


def test_cfg():
    vu, vc = torch.randn(5), torch.randn(5)
    assert torch.allclose(cfg_combine(vu, vc, 1.0), vc)
    assert torch.allclose(cfg_combine(vu, vc, 0.0), vu)
    assert torch.allclose(cfg_combine(vu, vc, 3.0), vu + 3 * (vc - vu))
