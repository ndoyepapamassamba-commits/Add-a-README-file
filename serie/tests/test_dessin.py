import math

import numpy as np
import pytest
import skia

from keba import dessin


def _surface(w=200, h=200):
    s = skia.Surface(w, h)
    s.getCanvas().clear(skia.ColorTRANSPARENT)
    return s


def _alpha(surface):
    return surface.makeImageSnapshot().toarray()[:, :, 3]


def test_teinte_lit_une_couleur_hexadecimale():
    assert dessin.teinte("#FF0000") == skia.Color(255, 0, 0)
    assert dessin.teinte("#00FF00", 0.5) == skia.Color(0, 255, 0, 128)


def test_melanger_deux_couleurs():
    assert dessin.melanger("#000000", "#FFFFFF", 0.5) in ("#7F7F7F", "#808080")
    assert dessin.melanger("#102030", "#102030", 0.3) == "#102030"


def test_forme_eclairee_reste_dans_sa_silhouette_avec_son_contour():
    s = _surface()
    chemin = skia.Path().addCircle(100, 100, 40)
    dessin.forme_eclairee(s.getCanvas(), chemin, "#E0A040", contour=6)
    a = _alpha(s)
    assert a[100, 100] == 255
    assert a[100, 100 + 44] > 0          # le contour déborde un peu
    assert a[100, 100 + 52] == 0         # mais pas plus
    assert a[5, 5] == 0


def test_forme_eclairee_ombre_le_cote_oppose_a_la_lumiere():
    s = _surface()
    chemin = skia.Path().addCircle(100, 100, 50)
    dessin.forme_eclairee(s.getCanvas(), chemin, "#C08040", contour=0)
    px = s.makeImageSnapshot().toarray()
    haut_gauche = px[70, 70, :3].astype(int).sum()
    bas_droite = px[135, 135, :3].astype(int).sum()
    assert haut_gauche > bas_droite


def _longueur(points):
    return sum(math.dist(points[i], points[i + 1]) for i in range(len(points) - 1))


def test_membre_garde_sa_longueur_en_pliant_le_coude():
    a, b, longueur = (0.0, 0.0), (80.0, 0.0), 120.0
    controle = dessin.coude(a, b, longueur, sens=1)
    pts = [dessin.point_quad(a, controle, b, i / 200) for i in range(201)]
    assert _longueur(pts) == pytest.approx(longueur, rel=0.05)
    assert controle[1] != 0.0


def test_membre_tendu_quand_la_distance_depasse_la_longueur():
    controle = dessin.coude((0.0, 0.0), (200.0, 0.0), 120.0, sens=1)
    assert controle[1] == pytest.approx(0.0)


def test_membre_dessine_un_trait_plein_entre_ses_extremites():
    s = _surface()
    dessin.membre(s.getCanvas(), (30, 100), (170, 100), 140, 20, "#AA6633", contour=4)
    a = _alpha(s)
    assert a[100, 100] == 255
    assert a[100, 30] > 0 and a[100, 170] > 0
    assert a[20, 100] == 0


def test_ombre_au_sol_est_transparente_et_douce():
    s = _surface()
    dessin.ombre_sol(s.getCanvas(), 100, 150, 60, 0.3)
    a = _alpha(s)
    assert 0 < a[150, 100] < 255
    assert a[50, 100] == 0


def test_motif_wax_remplit_avec_plusieurs_couleurs():
    s = _surface()
    shader = dessin.motif_wax(("#1E88E5", "#FDD835", "#E53935"), echelle=1.0, graine=3)
    p = skia.Paint(Shader=shader, AntiAlias=True)
    s.getCanvas().drawRect(skia.Rect(0, 0, 200, 200), p)
    px = s.makeImageSnapshot().toarray()[:, :, :3].reshape(-1, 3)
    assert len(np.unique(px // 32, axis=0)) >= 3
