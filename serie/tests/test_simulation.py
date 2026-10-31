import math

import pytest

from keba.simulation import Monde

SOL = 1500.0


def test_une_orange_lachee_finit_posee_sur_le_sol():
    m = Monde(sol_y=SOL)
    m.ajouter("orange", forme="rond", taille=20, masse=1.0, position=(500, 1000))
    m.avancer_jusqua(3.0)
    x, y, _ = m.etat("orange", 3.0)
    assert y == pytest.approx(SOL - 20, abs=1.5)


def test_la_chute_produit_un_choc_au_bon_moment():
    m = Monde(sol_y=SOL, gravite=2600)
    m.ajouter("boite", forme="boite", taille=(40, 50), masse=2.0, position=(500, SOL - 25 - 400))
    m.avancer_jusqua(2.0)
    chocs = [c for c in m.chocs if "boite" in (c.a, c.b)]
    assert chocs, "aucun choc enregistré"
    attendu = math.sqrt(2 * 400 / 2600)
    assert chocs[0].t == pytest.approx(attendu, abs=0.03)
    assert chocs[0].force > 0


def test_deux_mondes_identiques_donnent_les_memes_trajectoires():
    def monde():
        m = Monde(sol_y=SOL)
        for i in range(6):
            m.ajouter(f"boite{i}", forme="boite", taille=(40, 50), masse=1.0, position=(500 + 3 * i, SOL - 25 - 52 * i))
        m.impulsion("boite5", (900.0, 0.0))
        m.avancer_jusqua(2.0)
        return [m.etat(f"boite{i}", 2.0) for i in range(6)]
    assert monde() == monde()


def test_un_corps_pilote_pousse_les_objets():
    m = Monde(sol_y=SOL)
    m.ajouter("orange", forme="rond", taille=20, masse=0.5, position=(600, SOL - 20))
    m.ajouter_pilote("pied", forme="boite", taille=(30, 30),
                     trajectoire=lambda t: (400 + 300 * t, SOL - 15, 0.0))
    m.avancer_jusqua(1.5)
    x, _, _ = m.etat("orange", 1.5)
    assert x > 700


def test_l_etat_entre_deux_images_est_interpole():
    m = Monde(sol_y=SOL)
    m.ajouter("orange", forme="rond", taille=20, masse=1.0, position=(500, 1000))
    m.avancer_jusqua(0.5)
    y0 = m.etat("orange", 0.2)[1]
    y1 = m.etat("orange", 0.2 + 1 / 120)[1]
    y2 = m.etat("orange", 0.2 + 1 / 60)[1]
    assert y0 < y1 < y2


def test_un_objet_fige_ne_bouge_pas_tant_qu_on_ne_le_libere_pas():
    m = Monde(sol_y=SOL)
    m.ajouter("tole", forme="boite", taille=(200, 12), masse=3.0, position=(500, 900), fige=True)
    m.avancer_jusqua(1.0)
    assert m.etat("tole", 1.0)[1] == pytest.approx(900)
    m.liberer("tole")
    m.avancer_jusqua(2.0)
    assert m.etat("tole", 2.0)[1] > 1300
