import numpy as np
import pytest

from atelier import expressions

ART = {"nez": (380.0, 320.0), "epaule_av": (300.0, 465.0), "epaule_ar": (470.0, 455.0)}


def test_le_cadre_de_la_tete_contient_le_visage_et_reste_dans_l_image():
    x, y, cote = expressions.cadre_tete(ART, largeur=768, hauteur=1024)
    assert cote % 64 == 0 and 256 <= cote <= 640
    assert x <= 380 <= x + cote and y <= 320 <= y + cote
    assert x >= 0 and y >= 0 and x + cote <= 768 and y + cote <= 1024


def test_les_taches_d_expression_retouchent_la_tete_avec_la_planche_en_reference():
    cadres = {"keba": (190, 60, 384)}
    t = expressions.lot({"keba": ["colere", "yeux_fermes"]}, cadres)
    assert [x["id"] for x in t] == ["keba-expr-colere", "keba-expr-yeux_fermes"]
    assert t[0]["refs"] == ["keba-tete.png"]
    assert (t[0]["w"], t[0]["h"]) == (384, 384)
    assert "angry" in t[0]["prompt"] and "same" in t[0]["prompt"]


def test_recoller_la_tete_ne_change_que_le_cadre_avec_un_fondu():
    planche = np.zeros((200, 200, 3), np.uint8)
    tete = np.full((64, 64, 3), 255, np.uint8)
    out = expressions.recoller(planche, tete, (50, 40, 64), fondu=8)
    assert out[40 + 32, 50 + 32].tolist() == [255, 255, 255]   # centre du cadre : la nouvelle tête
    assert out[10, 10].tolist() == [0, 0, 0]                   # hors du cadre : inchangé
    assert 0 < out[40 + 1, 50 + 32, 0] < 255                   # bord du cadre : fondu


def test_egaliser_les_couleurs_ramene_la_teinte_de_la_planche():
    rng = np.random.default_rng(1)
    reference = np.clip(rng.normal((140, 90, 60), 12, (64, 64, 3)), 0, 255).astype(np.uint8)
    reference[:8] = 255                                   # un bout de fond blanc, ignoré
    plus_sombre = (reference.astype(float) * 0.75).astype(np.uint8)
    plus_sombre[:8] = 255
    sortie = expressions.egaliser_couleurs(plus_sombre, reference)
    peau = slice(8, 64)
    assert np.abs(sortie[peau].mean(axis=(0, 1)) - reference[peau].mean(axis=(0, 1))).max() < 3
    assert (sortie[:8] == 255).all()                      # le fond blanc reste blanc
