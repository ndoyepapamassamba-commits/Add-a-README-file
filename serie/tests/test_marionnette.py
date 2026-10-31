import numpy as np
import pytest
import skia

from keba import bible, marionnette

W, H = 900, 1000
SOL = 940


@pytest.fixture(scope="module")
def b():
    return bible.charger()


def _rendu(fiche, etat, t=0.0):
    s = skia.Surface(W, H)
    s.getCanvas().clear(skia.ColorTRANSPARENT)
    marionnette.dessiner(s.getCanvas(), fiche, etat, t)
    return s.makeImageSnapshot().toarray()


def _boite(alpha, seuil=100):
    # seuil > opacité de l'ombre au sol (≈ 30 %) : on mesure le personnage, pas son ombre
    ys, xs = np.nonzero(alpha > seuil)
    return xs.min(), ys.min(), xs.max(), ys.max()


def test_la_bible_contient_le_casting_principal(b):
    for ident in ("keba", "bara", "coumba", "gainde"):
        assert b.personnage(ident)["nom"]
    with pytest.raises(KeyError):
        b.personnage("lamput")


def test_les_expressions_ne_touchent_que_des_parametres_connus(b):
    etat = marionnette.etat_defaut(b.personnage("keba"))
    for nom in b.expressions:
        nouvel = marionnette.avec_expression(etat, b.expressions[nom])
        assert set(nouvel) == set(etat)


@pytest.mark.parametrize("ident", ["keba", "bara", "coumba"])
def test_chaque_humain_a_la_hauteur_de_sa_fiche(b, ident):
    fiche = b.personnage(ident)
    etat = marionnette.etat_defaut(fiche) | {"x": W / 2, "y": SOL}
    x0, y0, x1, y1 = _boite(_rendu(fiche, etat)[:, :, 3])
    assert y1 == pytest.approx(SOL, abs=14)
    assert (y1 - y0) == pytest.approx(marionnette.hauteur(fiche), rel=0.2)


def test_le_casting_se_reconnait_a_sa_silhouette(b):
    tailles = {}
    for ident in ("keba", "bara", "coumba"):
        fiche = b.personnage(ident)
        etat = marionnette.etat_defaut(fiche) | {"x": W / 2, "y": SOL}
        x0, y0, x1, y1 = _boite(_rendu(fiche, etat)[:, :, 3])
        tailles[ident] = (x1 - x0, y1 - y0)
    assert tailles["coumba"][1] > tailles["bara"][1] > tailles["keba"][1]
    assert tailles["bara"][0] > 1.5 * tailles["coumba"][0]


def test_regarder_a_gauche_est_le_miroir_de_regarder_a_droite(b):
    fiche = b.personnage("keba")
    etat = marionnette.etat_defaut(fiche) | {"x": W / 2, "y": SOL}
    droite = _rendu(fiche, etat | {"sens": 1.0})[:, :, 3] > 40
    gauche = _rendu(fiche, etat | {"sens": -1.0})[:, :, 3] > 40
    miroir = droite[:, ::-1]
    iou = (miroir & gauche).sum() / (miroir | gauche).sum()
    assert iou > 0.9


def test_la_main_est_la_ou_le_bras_est_dessine(b):
    fiche = b.personnage("keba")
    etat = marionnette.etat_defaut(fiche) | {"x": W / 2, "y": SOL, "main_av": (90.0, -40.0)}
    alpha = _rendu(fiche, etat)[:, :, 3]
    mx, my = marionnette.point_main(fiche, etat, "av")
    zone = alpha[int(my) - 12:int(my) + 12, int(mx) - 12:int(mx) + 12]
    assert (zone > 40).mean() > 0.5


def test_le_mouton_est_plus_long_que_haut(b):
    fiche = b.personnage("gainde")
    etat = marionnette.etat_defaut(fiche) | {"x": W / 2, "y": SOL}
    x0, y0, x1, y1 = _boite(_rendu(fiche, etat)[:, :, 3])
    assert (x1 - x0) > (y1 - y0)
    assert y1 == pytest.approx(SOL, abs=14)


def test_le_dessin_est_reproductible(b):
    fiche = b.personnage("coumba")
    etat = marionnette.etat_defaut(fiche) | {"x": W / 2, "y": SOL, "foulard": 0.6}
    assert np.array_equal(_rendu(fiche, etat, 1.3), _rendu(fiche, etat, 1.3))


def test_le_saut_decolle_les_pieds_du_sol(b):
    fiche = b.personnage("keba")
    etat = marionnette.etat_defaut(fiche) | {"x": W / 2, "y": SOL}
    au_sol = _boite(_rendu(fiche, etat)[:, :, 3], 200)
    en_l_air = _boite(_rendu(fiche, etat | {"saut": 120.0})[:, :, 3], 200)
    assert en_l_air[3] < au_sol[3] - 60
