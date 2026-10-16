"""Encodeur de texte : tokenizer par mots + petit Transformer.

Rôle dans la recette : transformer le prompt en une suite de vecteurs
(B, L, D) que le DiT « lit » par cross-attention, plus un masque de padding.

Différence assumée avec les vrais moteurs
-----------------------------------------
Wan 2.1/2.2 utilise umT5-XXL (~5,7 milliards de paramètres, 512 jetons,
> 20 Go de mémoire GPU), HunyuanVideo un LLM multimodal, Veo 3 des modèles
Gemini pour les légendes. Ces encodeurs sont PRÉ-ENTRAÎNÉS sur des milliards de
phrases puis GELÉS : le DiT apprend à lire un « sens » déjà construit, ce qui
lui permet de comprendre des prompts jamais vus.

Ici, impossible : un T5 ne tient ni dans le budget CPU ni dans un vocabulaire de
26 mots (28 entrées avec ``<pad>`` et ``<unk>``). On entraîne donc un petit
Transformer (2 couches) EN MÊME TEMPS que le DiT, sur un vocabulaire fermé.
Conséquence : le mini-moteur ne comprend que les mots de la troupe
(personnages, actions, décors) ; un mot inconnu devient ``<unk>``.

Le tokenizer ignore la casse mais PAS les accents : « Marche » est le verbe
« marche », pas le décor « Marché ». La ligne de commande (``generate.py``)
ramène donc d'abord le prompt à sa forme exacte avec
``troupe_data.canonical_prompt`` (accents, casse, espaces).

Avec de vrais poids (Wan 2.2), ce rôle est tenu par umT5 gelé, avec la même
interface (embeddings + masque).

Guidance sans classifieur (CFG) : pendant l'entraînement, ~10 % des prompts sont
remplacés par un embedding « nul » APPRIS (``null``) ; à l'inférence on calcule
la vitesse avec le prompt ET avec l'embedding nul, puis on extrapole.
"""

from __future__ import annotations

import re
from typing import Iterable, Sequence

import torch
import torch.nn as nn

from .config import TextConfig

PAD, UNK = "<pad>", "<unk>"
_SPLIT = re.compile(r"[\s']+")


class Tokenizer:
    """Tokenizer au niveau du mot sur un vocabulaire fermé (insensible à la casse, sensible aux accents)."""

    def __init__(self, words: Iterable[str]):
        self.vocab: list[str] = [PAD, UNK]
        for w in words:
            if w and w not in self.vocab:
                self.vocab.append(w)
        self._index = {w.lower(): i for i, w in enumerate(self.vocab)}
        self.pad_id, self.unk_id = 0, 1

    @classmethod
    def default(cls) -> "Tokenizer":
        from .troupe_data import iter_vocabulary

        return cls(iter_vocabulary())

    def __len__(self) -> int:
        return len(self.vocab)

    @staticmethod
    def split(text: str) -> list[str]:
        return [w for w in _SPLIT.split(text.replace("’", "'").strip()) if w]

    def encode(self, text: str) -> list[int]:
        return [self._index.get(w.lower(), self.unk_id) for w in self.split(text)]

    def decode(self, ids: Sequence[int]) -> str:
        return " ".join(self.vocab[i] for i in ids if i != self.pad_id)

    def batch(self, texts: Sequence[str], max_len: int) -> tuple[torch.Tensor, torch.Tensor]:
        """-> ids (B, L) long, masque (B, L) bool (True = vrai jeton)."""
        ids = torch.full((len(texts), max_len), self.pad_id, dtype=torch.long)
        mask = torch.zeros((len(texts), max_len), dtype=torch.bool)
        for i, t in enumerate(texts):
            toks = self.encode(t)[:max_len]
            if not toks:
                toks = [self.unk_id]
            ids[i, : len(toks)] = torch.tensor(toks)
            mask[i, : len(toks)] = True
        return ids, mask

    def state_dict(self) -> dict:
        return {"vocab": list(self.vocab)}

    @classmethod
    def from_state_dict(cls, d: dict) -> "Tokenizer":
        tok = cls([])
        tok.vocab = list(d["vocab"])
        tok._index = {w.lower(): i for i, w in enumerate(tok.vocab)}
        return tok


class TextEncoder(nn.Module):
    """Embeddings de mots + positions + Transformer encodeur (pré-normalisation)."""

    def __init__(self, cfg: TextConfig, vocab_size: int):
        super().__init__()
        self.cfg = cfg
        d = cfg.d_model
        self.tok_emb = nn.Embedding(vocab_size, d)
        self.pos_emb = nn.Parameter(torch.zeros(1, cfg.max_len, d))
        layer = nn.TransformerEncoderLayer(
            d, cfg.n_heads, dim_feedforward=4 * d, dropout=cfg.dropout,
            activation="gelu", batch_first=True, norm_first=True,
        )
        self.encoder = nn.TransformerEncoder(layer, cfg.n_layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(d)
        # Embedding « nul » appris pour la CFG (un seul jeton valide).
        self.null = nn.Parameter(torch.zeros(1, 1, d))
        nn.init.normal_(self.tok_emb.weight, std=0.02)
        nn.init.normal_(self.pos_emb, std=0.02)
        nn.init.normal_(self.null, std=0.02)

    @property
    def dim(self) -> int:
        return self.cfg.d_model

    def forward(self, ids: torch.Tensor, mask: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """ids (B, L), mask (B, L) bool -> (embeddings (B, L, D), mask)."""
        L = ids.shape[1]
        x = self.tok_emb(ids) + self.pos_emb[:, :L]
        x = self.encoder(x, src_key_padding_mask=~mask)
        x = self.norm(x) * mask[..., None]
        return x, mask

    def null_context(self, batch: int, length: int) -> tuple[torch.Tensor, torch.Tensor]:
        """Contexte « sans texte » : le jeton nul en position 0, du padding ensuite."""
        pad = torch.zeros(batch, length - 1, self.dim, device=self.null.device, dtype=self.null.dtype)
        ctx = torch.cat([self.null.expand(batch, 1, -1), pad], dim=1)
        mask = torch.zeros(batch, length, dtype=torch.bool, device=self.null.device)
        mask[:, 0] = True
        return ctx, mask

    def encode_with_dropout(self, ids: torch.Tensor, mask: torch.Tensor,
                            drop: torch.Tensor | None) -> tuple[torch.Tensor, torch.Tensor]:
        """Encode puis remplace les exemples ``drop`` (B,) bool par le contexte nul."""
        ctx, m = self(ids, mask)
        if drop is None or not bool(drop.any()):
            return ctx, m
        nctx, nm = self.null_context(ids.shape[0], ids.shape[1])
        d = drop.view(-1, 1)
        return torch.where(d[..., None], nctx, ctx), torch.where(d, nm, m)
