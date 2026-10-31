import numpy as np
import skia

from keba.elements import ElementObjet, Particules, image_rgba
from keba.simulation import Monde


def _surface():
    s = skia.Surface(400, 400)
    s.getCanvas().clear(skia.ColorTRANSPARENT)
    return s


def _carre_rouge(taille=40):
    a = np.zeros((taille, taille, 4), np.uint8)
    a[:, :] = (220, 30, 30, 255)
    return image_rgba(a)


def test_un_objet_est_dessine_la_ou_la_physique_l_a_mis():
    m = Monde(sol_y=380.0)
    m.ajouter("boite", forme="boite", taille=(40, 40), masse=1.0, position=(100, 100))
    m.avancer_jusqua(2.0)
    e = ElementObjet(m, "boite", _carre_rouge(), (40, 40))
    s = _surface()
    e.dessiner(s.getCanvas(), 2.0)
    a = s.makeImageSnapshot().toarray()[:, :, 3]
    assert a[360, 100] > 200          # posée sur le sol (centre à y = 360)
    assert a[100, 100] == 0           # plus en l'air


def test_les_particules_naissent_s_envolent_et_disparaissent():
    p = Particules(graine=4)
    p.bouffee(1.0, (200, 300), nombre=12, couleur="#D9B98A", vitesse=250, duree=0.8, gravite=-80)
    s = _surface()
    p.dessiner(s.getCanvas(), 0.5)
    assert s.makeImageSnapshot().toarray()[:, :, 3].max() == 0          # pas encore nées
    s = _surface()
    p.dessiner(s.getCanvas(), 1.2)
    assert s.makeImageSnapshot().toarray()[:, :, 3].max() > 0
    s = _surface()
    p.dessiner(s.getCanvas(), 2.5)
    assert s.makeImageSnapshot().toarray()[:, :, 3].max() == 0          # éteintes
