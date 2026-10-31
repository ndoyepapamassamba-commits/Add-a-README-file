import pytest

from keba import episode


@pytest.fixture(scope="module")
def pilote():
    return episode.construire(1)


def test_le_pilote_dure_plus_d_une_minute(pilote):
    plateau, _ = pilote
    assert 60.0 <= plateau.duree <= 66.0


def test_la_pyramide_tient_jusqu_au_coup_de_claquette_puis_s_ecroule(pilote):
    plateau, _ = pilote
    m = plateau.monde
    touches = [c.t for c in m.chocs if "claquette" in (c.a, c.b) and any(n.startswith("boite") for n in (c.a, c.b))]
    assert touches, "la claquette doit toucher la pyramide"
    impact = min(touches)
    for nom in ("boite00", "boite01", "boite02", "boite10", "boite11"):
        x0, y0, _ = m.etat(nom, 0.5)
        x1, y1, _ = m.etat(nom, impact - 0.05)
        assert abs(x1 - x0) < 1.0 and abs(y1 - y0) < 1.0, nom
    t_chaos = next(a for a, b, n in plateau.sections() if n == "chaos")
    par_terre = [n for n in ("boite00", "boite01", "boite02", "boite10", "boite11", "boite_haut")
                 if m.etat(n, t_chaos + 2.5)[1] > plateau.sol_y - 120]
    assert len(par_terre) >= 4, par_terre


def test_la_musique_se_tait_juste_avant_la_chute(pilote):
    plateau, _ = pilote
    sections = plateau.sections()
    noms = [s[2] for s in sections]
    i = noms.index("chaos")
    assert noms[i - 1] == "silence"


def test_l_episode_est_sonore(pilote):
    plateau, _ = pilote
    assert len(plateau.sons) > 100
    assert {"clac", "tink", "splash", "fracas", "bee"} <= {s[1] for s in plateau.sons}
