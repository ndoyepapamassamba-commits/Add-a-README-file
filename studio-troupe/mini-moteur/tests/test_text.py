"""Tokenizer et encodeur de texte."""

import torch

from minimoteur import troupe_data as td
from minimoteur.config import TextConfig
from minimoteur.text_encoder import TextEncoder, Tokenizer


def test_tokenizer_aller_retour():
    tok = Tokenizer.default()
    for p in td.all_prompts():
        ids = tok.encode(p)
        assert tok.unk_id not in ids
        assert tok.decode(ids) == p
    assert tok.encode("modou SAUTE") == tok.encode("MODOU saute")
    assert tok.encode("MODOU vole")[1] == tok.unk_id
    tok2 = Tokenizer.from_state_dict(tok.state_dict())
    assert tok2.vocab == tok.vocab and tok2.encode("COUMBA parle") == tok.encode("COUMBA parle")


def test_lot_et_masque():
    tok = Tokenizer.default()
    ids, mask = tok.batch(["MODOU saute dans la Cour", "KOFFI parle au Maquis"], 12)
    assert ids.shape == (2, 12) and mask.dtype == torch.bool
    assert mask.sum(1).tolist() == [5, 4]
    assert (ids[~mask] == tok.pad_id).all()


def test_encodeur_formes_et_embedding_nul():
    tok = Tokenizer.default()
    enc = TextEncoder(TextConfig(d_model=32, n_layers=1, n_heads=4), len(tok))
    ids, mask = tok.batch(["MODOU saute dans la Cour", "KOFFI parle au Maquis"], 12)
    ctx, m = enc(ids, mask)
    assert ctx.shape == (2, 12, 32) and torch.equal(m, mask)
    assert torch.all(ctx[~mask] == 0)
    nctx, nm = enc.null_context(2, 12)
    assert nm[:, 0].all() and not nm[:, 1:].any()
    assert torch.allclose(nctx[:, 0], enc.null[0, 0].expand(2, -1))
    c2, m2 = enc.encode_with_dropout(ids, mask, torch.tensor([True, False]))
    assert torch.allclose(c2[0], nctx[0]) and torch.equal(m2[0], nm[0])
    assert torch.allclose(c2[1], ctx[1]) and torch.equal(m2[1], mask[1])
