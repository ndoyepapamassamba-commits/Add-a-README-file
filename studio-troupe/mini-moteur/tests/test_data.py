"""Jeu de données : bible, légendes, déterminisme, combinaisons tenues à l'écart."""

import itertools

import numpy as np

from minimoteur import troupe_data as td


def test_personnages_planche_de_la_bible():
    fiches = td.load_troupe()
    assert set(td.PERSONNAGES) <= set(fiches)
    for nom in td.PERSONNAGES:
        assert fiches[nom].get("dessin", "planche") == "planche"
        assert len(td.palette(nom)) >= 2
    tailles = {n: td.hauteur_px(n) for n in td.PERSONNAGES}
    assert min(tailles, key=tailles.get) == "PETIT MAMADOU"
    assert max(tailles, key=tailles.get) == "KOFFI"


def test_legendes_et_articles():
    assert td.prompt_for("MODOU", "saute", "Cour") == "MODOU saute dans la Cour"
    assert td.prompt_for("KOFFI", "parle", "Marché") == "KOFFI parle au Marché"
    assert td.prompt_for("COUMBA", "tombe", "Salon") == "COUMBA tombe dans le Salon"
    assert td.prompt_for("TANTIE AWA", "marche vers la gauche", "Maquis") == "TANTIE AWA marche vers la gauche au Maquis"
    for tr in td.all_triples():
        assert td.parse_prompt(td.prompt_for(*tr)) == tr
    assert td.parse_prompt("petit mamadou MARCHE VERS LA DROITE au marché") == ("PETIT MAMADOU", "marche vers la droite", "Marché")


def test_clip_forme_et_determinisme():
    a = td.render_clip("COUMBA", "parle", "Salon", seed=3, supersample=2)
    b = td.render_clip("COUMBA", "parle", "Salon", seed=3, supersample=2)
    c = td.render_clip("COUMBA", "parle", "Salon", seed=4, supersample=2)
    assert a.shape == (17, 32, 32, 3) and a.dtype == np.uint8
    assert np.array_equal(a, b)
    assert not np.array_equal(a, c)
    # le personnage bouge (le clip n'est pas une image fixe)
    assert np.abs(a[1:].astype(int) - a[:-1].astype(int)).sum() > 0


def test_combinaisons_tenues_a_l_ecart():
    held, train = set(td.heldout_triples()), set(td.train_triples())
    assert len(held) == 20 and len(held) + len(train) == 140 and not held & train
    assert 0.12 < len(held) / 140 < 0.18
    # toutes les paires restent vues à l'entraînement (on teste la recomposition)
    for (i, j) in itertools.combinations(range(3), 2):
        paires_train = {(tr[i], tr[j]) for tr in train}
        paires_toutes = {(tr[i], tr[j]) for tr in held | train}
        assert paires_train == paires_toutes


def test_build_dataset_deterministe_et_sans_fuite():
    ds1 = td.build_dataset("train", 30, seed=1, supersample=2, workers=1)
    ds2 = td.build_dataset("train", 30, seed=1, supersample=2, workers=1)
    assert np.array_equal(ds1.clips, ds2.clips) and ds1.prompts == ds2.prompts
    held = set(td.heldout_triples())
    assert not set(ds1.triples) & held
    hd = td.build_dataset("heldout", 10, seed=1, supersample=2, workers=1)
    assert set(hd.triples) <= held
    vu = td.build_dataset("seen", 10, seed=1, supersample=2, workers=1)
    assert vu.triples == ds1.triples[:10] and not np.array_equal(vu.clips, ds1.clips[:10])


def test_conversion_espace_modele():
    clip = td.render_clip("MODOU", "saute", "Cour", seed=0, supersample=2)
    x = td.to_model_space(clip)
    assert tuple(x.shape) == (3, 17, 32, 32) and x.min() >= -1 and x.max() <= 1
    assert np.array_equal(td.from_model_space(x), clip)
