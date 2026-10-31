import math

import pytest

from keba.acteur import Acteur, V_MARCHE


def _acteur():
    a = Acteur("keba", jambe=100.0)
    a.pistes.cle("x", 0.0, 0.0)
    a.pistes.cle("x", 2.0, 0.0)
    a.pistes.cle("x", 4.0, 2 * V_MARCHE, "lin")       # marche à V_MARCHE de 2 s à 4 s
    a.pistes.cle("x", 6.0, 2 * V_MARCHE)               # puis s'arrête (adouci)
    a.pistes.cle("x", 7.0, 2 * V_MARCHE - 600, "lin")  # repart vers la gauche en courant
    a.preparer(8.0)
    return a


def test_immobile_les_jambes_ne_bougent_pas():
    a = _acteur()
    p0, p1 = a.pose(0.5), a.pose(1.5)
    assert p0["angles"]["cuisse_av"] == pytest.approx(0.0, abs=1e-6)
    assert p1["angles"]["cuisse_av"] == pytest.approx(0.0, abs=1e-6)


def test_immobile_le_personnage_respire_quand_meme():
    a = _acteur()
    assert a.pose(0.3)["angles"]["torse"] != a.pose(1.1)["angles"]["torse"]


def test_en_marchant_les_jambes_alternent():
    a = _acteur()
    vues = [a.pose(2.5 + k * 0.05)["angles"]["cuisse_av"] for k in range(20)]
    assert max(vues) > 0.2 and min(vues) < -0.2
    p = a.pose(3.0)["angles"]
    assert p["cuisse_av"] == pytest.approx(-p["cuisse_ar"], abs=1e-9)


def test_le_pas_suit_la_distance_parcourue():
    # une fois la marche lancée (au démarrage, les pas sont volontairement plus courts)
    a = _acteur()
    assert a.phase(4.0) - a.phase(2.5) == pytest.approx(2 * math.pi * 1.5 * V_MARCHE / a.longueur_cycle(1.0, 0.0),
                                                      rel=0.03)


def test_il_se_tourne_dans_le_sens_de_la_marche():
    a = _acteur()
    assert a.pose(3.0)["placement"]["sens"] == 1.0
    assert a.pose(6.6)["placement"]["sens"] == -1.0


def test_vite_il_court_et_se_penche():
    a = _acteur()
    assert a.pose(3.0)["course"] == pytest.approx(0.0, abs=0.05)
    assert a.pose(6.6)["course"] > 0.5
    assert a.pose(6.6)["angles"]["torse"] > 0.05


def test_les_gestes_s_ajoutent_au_cycle():
    a = _acteur()
    a.pistes.cle("bras_av", 0.0, 0.0)
    a.pistes.cle("bras_av", 1.0, -2.0, "lin")
    a.preparer(8.0)
    assert a.pose(1.0)["angles"]["bras_av"] == pytest.approx(-2.0, abs=0.05)


def test_les_expressions_changent_aux_bons_moments():
    a = _acteur()
    a.expression(1.0, "colere")
    a.expression(3.0, "gene")
    assert a.pose(0.5)["expression"] == "neutre"
    assert a.pose(2.0)["expression"] == "colere"
    assert a.pose(3.5)["expression"] == "gene"
