import math

import pytest

from keba.courbes import COURBES, adoucir
from keba.pistes import Piste, Pistes


@pytest.mark.parametrize("nom", sorted(COURBES))
def test_chaque_courbe_part_de_0_et_arrive_a_1(nom):
    assert adoucir(nom, 0.0) == pytest.approx(0.0, abs=1e-9)
    assert adoucir(nom, 1.0) == pytest.approx(1.0, abs=1e-9)


def test_adoucir_borne_l_entree():
    assert adoucir("lin", -3.0) == 0.0
    assert adoucir("lin", 7.0) == 1.0


def test_depassement_apres_l_arrivee():
    assert max(adoucir("depasse", i / 100) for i in range(101)) > 1.02


def test_anticipation_recule_avant_de_partir():
    assert min(adoucir("anticipe", i / 100) for i in range(101)) < -0.02


def test_douce_est_symetrique():
    assert adoucir("douce", 0.5) == pytest.approx(0.5)
    assert adoucir("douce", 0.25) == pytest.approx(1 - adoucir("douce", 0.75))


def test_maintien_reste_en_place_jusqu_a_la_fin():
    assert adoucir("maintien", 0.99) == 0.0


def test_piste_vide_donne_la_valeur_par_defaut():
    assert Piste(4.0).valeur(10.0) == 4.0


def test_piste_avant_la_premiere_cle_et_apres_la_derniere():
    p = Piste(0.0)
    p.cle(1.0, 10.0)
    p.cle(2.0, 20.0)
    assert p.valeur(0.0) == 10.0
    assert p.valeur(5.0) == 20.0


def test_piste_interpole_avec_la_courbe_de_la_cle_d_arrivee():
    p = Piste(0.0)
    p.cle(0.0, 0.0)
    p.cle(2.0, 100.0, "lin")
    assert p.valeur(1.0) == pytest.approx(50.0)
    p.cle(4.0, 200.0, "douce")
    assert p.valeur(3.0) == pytest.approx(150.0)
    assert p.valeur(2.5) < 125.0


def test_piste_trie_les_cles_inserees_dans_le_desordre():
    p = Piste(0.0)
    p.cle(2.0, 20.0, "lin")
    p.cle(0.0, 0.0, "lin")
    assert p.valeur(1.0) == pytest.approx(10.0)


def test_piste_de_vecteurs():
    p = Piste((0.0, 0.0))
    p.cle(0.0, (0.0, 10.0))
    p.cle(1.0, (10.0, 30.0), "lin")
    assert p.valeur(0.5) == pytest.approx((5.0, 20.0))


def test_maintenir_garde_la_valeur_courante_jusqu_a_t():
    p = Piste(0.0)
    p.cle(0.0, 0.0)
    p.cle(1.0, 10.0, "lin")
    p.maintenir(3.0)
    p.cle(4.0, 0.0, "lin")
    assert p.valeur(2.0) == pytest.approx(10.0)
    assert p.valeur(3.5) == pytest.approx(5.0)


def test_cle_au_meme_instant_remplace_la_precedente():
    p = Piste(0.0)
    p.cle(1.0, 5.0)
    p.cle(1.0, 7.0)
    assert p.valeur(1.0) == 7.0
    assert len(p.cles) == 1


def test_pistes_donne_un_etat_complet_avec_defauts():
    ps = Pistes({"x": 0.0, "sourire": 0.2})
    ps.cle("x", 0.0, 0.0)
    ps.cle("x", 1.0, 100.0, "lin")
    etat = ps.etat(0.5)
    assert etat["x"] == pytest.approx(50.0)
    assert etat["sourire"] == 0.2


def test_pistes_refuse_un_parametre_inconnu():
    ps = Pistes({"x": 0.0})
    with pytest.raises(KeyError):
        ps.cle("vol", 0.0, 1.0)


def test_courbes_sont_continues():
    for nom in COURBES:
        if nom == "maintien":
            continue
        prec = adoucir(nom, 0.0)
        for i in range(1, 1001):
            v = adoucir(nom, i / 1000)
            assert math.isfinite(v)
            assert abs(v - prec) < 0.05, nom
            prec = v
