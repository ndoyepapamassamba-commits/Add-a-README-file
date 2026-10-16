"""DiT : formes, initialisation à zéro, RoPE 3D, condition I2V, CFG, sur-apprentissage."""

import pytest
import torch

from minimoteur.config import DiTConfig, TextConfig
from minimoteur.dit import DiT, apply_rope, first_frame_condition, grid_positions, rope_angles, rope_axes_dims
from minimoteur.flow import cfg_combine, flow_matching_loss, interpolate
from minimoteur.text_encoder import TextEncoder, Tokenizer

DCFG = DiTConfig(hidden=64, depth=2, n_heads=4, freq_dim=32)


def _perturb(model, scale=0.05):
    """Sort les poids nuls de l'initialisation (sinon la sortie vaut 0 partout)."""
    with torch.no_grad():
        for p in model.parameters():
            p.add_(scale * torch.randn_like(p))


def test_formes_et_sortie_nulle_a_l_init():
    dit = DiT(DCFG, latent_channels=8, text_dim=32)
    assert dit.in_channels == 17  # 8 bruités + 8 de condition + 1 masque
    x = torch.randn(2, 8, 5, 8, 8)
    ctx, mask = torch.randn(2, 6, 32), torch.ones(2, 6, dtype=torch.bool)
    v = dit(x, torch.rand(2), ctx, mask)
    assert v.shape == x.shape
    assert torch.all(v == 0)  # adaLN-Zero : tête finale nulle
    cond, cmask = first_frame_condition(torch.randn(2, 8, 1, 8, 8), 5)
    assert dit(x, torch.rand(2), ctx, mask, cond, cmask).shape == x.shape


def test_rope_decoupage():
    assert rope_axes_dims(64) == (24, 20, 20)
    assert rope_axes_dims(48) == (16, 16, 16)
    assert sum(rope_axes_dims(16)) == 16


@pytest.mark.parametrize("head_dim", [16, 64])
def test_rope_ne_depend_que_de_la_position_relative(head_dim):
    g = torch.Generator().manual_seed(0)
    q, k = torch.randn(head_dim, generator=g), torch.randn(head_dim, generator=g)
    a = torch.tensor([[1.0, 2.0, 3.0]])
    b = torch.tensor([[4.0, 0.0, 1.0]])
    delta = torch.tensor([[2.0, 5.0, -3.0]])

    def score(pq, pk):
        return (apply_rope(q[None], rope_angles(pq, head_dim)) * apply_rope(k[None], rope_angles(pk, head_dim))).sum()

    s1, s2 = score(a, b), score(a + delta, b + delta)
    assert torch.allclose(s1, s2, atol=1e-4)
    assert not torch.allclose(s1, score(a, b + delta), atol=1e-3)  # la position relative compte
    rq = apply_rope(q[None], rope_angles(a, head_dim))
    assert torch.allclose(rq.norm(), q.norm(), atol=1e-5)  # rotation : norme conservée


def test_positions_dans_l_ordre_des_jetons():
    pos = grid_positions(5, 4, 4)
    assert pos.shape == (80, 3)
    assert pos[0].tolist() == [0, 0, 0] and pos[1].tolist() == [0, 0, 1] and pos[16].tolist() == [1, 0, 0]


def test_condition_image_vers_video():
    first = torch.randn(3, 8, 1, 8, 8)
    cond, mask = first_frame_condition(first, 5)
    assert cond.shape == (3, 8, 5, 8, 8) and mask.shape == (3, 5)
    assert torch.equal(cond[:, :, 0], first[:, :, 0]) and torch.all(cond[:, :, 1:] == 0)
    assert mask[:, 0].eq(1).all() and mask[:, 1:].eq(0).all()


def test_cfg_w1_egale_la_prediction_conditionnelle():
    """Le chemin CFG en lot (conditionnel + nul concaténés) avec w = 1 rend exactement v_texte."""
    tok = Tokenizer.default()
    text = TextEncoder(TextConfig(d_model=32, n_layers=1), len(tok)).eval()
    dit = DiT(DCFG, 8, 32).eval()
    _perturb(dit)
    ids, mask = tok.batch(["MODOU saute dans la Cour", "COUMBA parle dans le Salon"], 12)
    with torch.no_grad():
        ctx, cm = text(ids, mask)
        nctx, nm = text.null_context(2, 12)
        x, t = torch.randn(2, 8, 5, 8, 8), torch.rand(2)
        cond, cmask = first_frame_condition(torch.randn(2, 8, 1, 8, 8), 5)
        v_c = dit(x, t, ctx, cm, cond, cmask)
        v = dit(torch.cat([x, x]), torch.cat([t, t]), torch.cat([ctx, nctx]), torch.cat([cm, nm]),
                torch.cat([cond, cond]), torch.cat([cmask, cmask]))
        vc_lot, vu_lot = v.chunk(2)
    assert torch.allclose(cfg_combine(vu_lot, vc_lot, 1.0), v_c, atol=1e-5)
    assert not torch.allclose(vu_lot, vc_lot, atol=1e-4)  # le texte change bien la prédiction


def test_surapprentissage_petit_lot():
    torch.manual_seed(0)
    tok = Tokenizer.default()
    text = TextEncoder(TextConfig(d_model=32, n_layers=1), len(tok))
    dit = DiT(DCFG, 8, 32)
    ids, mask = tok.batch(["MODOU saute dans la Cour", "KOFFI tombe au Maquis",
                           "COUMBA parle dans le Salon", "BAYE NDIAYE saute au Marché"], 12)
    x0, noise, t = torch.randn(4, 8, 5, 8, 8), torch.randn(4, 8, 5, 8, 8), torch.rand(4)
    cond, cmask = first_frame_condition(x0[:, :, :1], 5)
    opt = torch.optim.Adam(list(text.parameters()) + list(dit.parameters()), lr=2e-3)
    losses = []
    for _ in range(60):
        ctx, cm = text(ids, mask)
        loss = flow_matching_loss(dit(interpolate(x0, noise, t), t, ctx, cm, cond, cmask), x0, noise)
        opt.zero_grad()
        loss.backward()
        opt.step()
        losses.append(loss.item())
    assert losses[-1] < 0.5 * losses[0]
