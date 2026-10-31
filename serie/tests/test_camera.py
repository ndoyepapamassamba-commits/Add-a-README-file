import pytest
import skia

from keba.camera import Camera


def test_par_defaut_la_camera_cadre_le_centre():
    c = Camera(1080, 1920)
    c.preparer(2.0)
    cx, cy, zoom, _, _, _ = c.etat(1.0)
    assert (cx, cy, zoom) == pytest.approx((540.0, 960.0, 1.0))


def test_un_changement_brutal_de_cadre_est_adouci():
    c = Camera(1080, 1920)
    c.pistes.cle("cx", 0.0, 540.0)
    c.pistes.cle("cx", 1.0, 540.0)
    c.pistes.cle("cx", 1.0001, 1540.0, "lin")       # saut de 1000 px en 0,1 ms
    c.preparer(4.0)
    pas = [abs(c.etat(1.0 + (k + 1) / 60)[0] - c.etat(1.0 + k / 60)[0]) for k in range(60)]
    assert max(pas) < 120                          # jamais plus de 120 px d'une image à l'autre
    assert c.etat(3.5)[0] == pytest.approx(1540.0, abs=2)


def test_la_secousse_s_eteint():
    c = Camera(1080, 1920)
    c.secouer(1.0, 30.0)
    c.preparer(4.0)
    pendant = max(abs(c.etat(1.0 + k / 60)[3]) + abs(c.etat(1.0 + k / 60)[4]) for k in range(12))
    apres = max(abs(c.etat(3.0 + k / 60)[3]) + abs(c.etat(3.0 + k / 60)[4]) for k in range(12))
    assert pendant > 8 and apres < 0.5


def test_la_matrice_envoie_le_point_vise_au_centre_de_l_ecran():
    c = Camera(1080, 1920)
    c.pistes.cle("cx", 0.0, 2000.0)
    c.pistes.cle("cy", 0.0, 1300.0)
    c.pistes.cle("zoom", 0.0, 1.5)
    c.preparer(1.0)
    m = c.matrice(0.5)
    p = m.mapXY(2000.0, 1300.0)
    assert (p.x(), p.y()) == pytest.approx((540.0, 960.0), abs=0.5)
    q = m.mapXY(2100.0, 1300.0)
    assert q.x() - p.x() == pytest.approx(150.0, abs=0.5)


def test_la_camera_ne_sort_jamais_du_decor():
    c = Camera(1080, 1920)
    c.limites = (0.0, 0.0, 1460.0, 2555.0)
    c.pistes.cle("cx", 0.0, 100.0)          # trop à gauche : on verrait hors du décor
    c.pistes.cle("zoom", 0.0, 1.25)
    c.preparer(2.0)
    cx, cy, zoom, _, _, _ = c.etat(1.5)
    assert cx - 540 / zoom >= -0.5
    m = c.matrice(1.5)
    assert m.mapXY(0.0, 1300.0).x() <= 0.5    # le bord gauche du décor est au bord de l'écran ou au-delà
