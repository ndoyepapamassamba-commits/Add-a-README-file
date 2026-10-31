import numpy as np
import pytest
import skia

from keba.pantin import Pantin, articulations_quadrupede

W, H = 320, 300


def _mouton():
    s = skia.Surface(W, H)
    c = s.getCanvas()
    c.clear(skia.ColorTRANSPARENT)
    patte = skia.Paint(AntiAlias=True, Color=skia.Color(60, 40, 30))
    for x in (95, 118, 188, 211):
        c.drawRect(skia.Rect(x - 7, 175, x + 7, 262), patte)
    c.drawOval(skia.Rect(60, 100, 240, 200), skia.Paint(AntiAlias=True, Color=skia.Color(240, 235, 220)))
    c.drawCircle(262, 112, 30, skia.Paint(AntiAlias=True, Color=skia.Color(70, 50, 40)))
    return s.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)


@pytest.fixture(scope="module")
def art():
    return articulations_quadrupede(_mouton())


def test_les_sabots_sont_en_bas_des_quatre_pattes(art):
    xs = sorted(art[f"sabot_{n}"][0] for n in ("ar_loin", "ar_pres", "av_loin", "av_pres"))
    assert xs == pytest.approx([95, 118, 188, 211], abs=6)
    for n in ("ar_loin", "ar_pres", "av_loin", "av_pres"):
        assert art[f"sabot_{n}"][1] == pytest.approx(258, abs=8)


def test_le_museau_est_a_droite_en_haut(art):
    assert art["museau"][0] > 270 and art["museau"][1] < 140


def _rendu(p, angles):
    s = skia.Surface(W, H)
    s.getCanvas().clear(skia.ColorTRANSPARENT)
    p.dessiner(s.getCanvas(), p.poser(angles))
    return s.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)


def test_une_patte_bouge_seule(art):
    p = Pantin.depuis_image(_mouton(), art, pas=7, modele="quadrupede")
    repos, bouge = _rendu(p, {}), _rendu(p, {"patte_av_pres": -0.6})
    corps = (slice(120, 170), slice(90, 200))
    assert np.abs(repos[corps].astype(int) - bouge[corps].astype(int)).max() < 10
    assert (repos[230:262, 200:222, 3] > 100).mean() > (bouge[230:262, 200:222, 3] > 100).mean() + 0.3


def test_la_tete_baisse_sans_emporter_le_corps(art):
    p = Pantin.depuis_image(_mouton(), art, pas=7, modele="quadrupede")
    repos, baisse = _rendu(p, {}), _rendu(p, {"tete": 0.7})
    assert (np.abs(repos[90:140, 240:300, 3].astype(int) - baisse[90:140, 240:300, 3].astype(int)) > 100).mean() > 0.1
    corps = (slice(130, 170), slice(80, 180))
    assert np.abs(repos[corps].astype(int) - baisse[corps].astype(int)).max() < 10
