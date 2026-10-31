import pytest

from keba.acteur import V_MARCHE
from keba.mise_en_scene import Plateau

SOL = 1500.0


def test_aller_rend_l_heure_d_arrivee_et_deplace_l_acteur():
    p = Plateau(duree=10.0, sol_y=SOL)
    p.acteur("keba", jambe=100.0, x=100.0)
    t1 = p.aller("keba", 1.0, 100.0 + 2 * V_MARCHE)
    assert t1 == pytest.approx(3.0, abs=0.35)
    a = p.acteurs["keba"]
    assert a.pistes.valeur("x", 0.5) == 100.0
    assert a.pistes.valeur("x", t1) == pytest.approx(100.0 + 2 * V_MARCHE)
    assert a.pistes.valeur("y", 5.0) == SOL


def test_le_saut_s_accroupit_decolle_et_s_ecrase_a_l_arrivee():
    p = Plateau(duree=5.0, sol_y=SOL)
    p.acteur("keba", jambe=100.0, x=0.0)
    fin = p.sauter("keba", 1.0, hauteur=150.0, duree=0.8)
    v = p.acteurs["keba"].pistes.valeur
    assert v("ecrase", 1.08) < 0.9                  # anticipation : il se tasse
    assert v("saut", 1.0 + 0.12 + 0.4) > 120.0      # au sommet
    assert v("saut", fin) == pytest.approx(0.0)
    assert min(v("ecrase", fin + k / 100) for k in range(10)) < 0.9   # écrasé à l'arrivée


def test_les_chocs_de_la_physique_deviennent_des_sons_doses():
    p = Plateau(duree=4.0, sol_y=SOL)
    p.monde.ajouter("boite1", forme="boite", taille=(50, 60), masse=1.0, position=(500, SOL - 30 - 600))
    p.monde.ajouter("orange1", forme="rond", taille=20, masse=0.3, position=(800, SOL - 20 - 40))
    p.monde.avancer_jusqua(4.0)
    p.sons_des_chocs()
    noms = [s[1] for s in p.sons]
    assert "tink" in noms
    forts = [s for s in p.sons if s[1] == "tink"]
    assert all(0.05 <= s[2] <= 1.0 for s in forts)


def test_un_gros_choc_secoue_la_camera():
    p = Plateau(duree=4.0, sol_y=SOL)
    p.monde.ajouter("tole", forme="boite", taille=(300, 20), masse=8.0, position=(500, SOL - 10 - 900))
    p.monde.avancer_jusqua(3.0)
    p.sons_des_chocs()
    assert p.camera.secousses and max(a for _, a in p.camera.secousses) > 5.0


def test_les_humeurs_couvrent_tout_l_episode():
    p = Plateau(duree=10.0, sol_y=SOL)
    p.humeur(0.0, "calme")
    p.humeur(4.0, "silence")
    p.humeur(5.0, "chaos")
    assert p.sections() == [(0.0, 4.0, "calme"), (4.0, 5.0, "silence"), (5.0, 10.0, "chaos")]
