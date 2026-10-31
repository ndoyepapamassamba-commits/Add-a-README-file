import shutil
import wave

import numpy as np
import pytest

from keba import son
from keba.son import TAUX


@pytest.mark.parametrize("nom", sorted(son.BRUITAGES))
def test_chaque_bruitage_est_court_audible_et_sans_saturation(nom):
    x = son.bruitage(nom, graine=1)
    assert x.dtype == np.float32 and x.ndim == 1
    assert 0.02 * TAUX <= len(x) <= 2.0 * TAUX
    assert np.abs(x).max() <= 1.0
    assert np.sqrt(np.mean(x ** 2)) > 0.01


def test_les_bruitages_varient_avec_la_graine_mais_sont_reproductibles():
    a, b, c = son.bruitage("tink", graine=1), son.bruitage("tink", graine=1), son.bruitage("tink", graine=2)
    assert np.array_equal(a, b)
    assert not np.array_equal(a, c)


def test_le_mixage_place_chaque_son_au_bon_instant():
    piste = son.mixer(3.0, [(1.0, "bonk", 1.0)], musique=None)
    debut = np.argmax(np.abs(piste[:, 0]) > 0.01)
    assert debut == pytest.approx(TAUX, abs=TAUX * 0.01)
    assert piste.shape == (3 * TAUX, 2)
    assert np.abs(piste).max() <= 0.99


def test_la_partition_musicale_suit_les_humeurs():
    sections = [(0.0, 4.0, "calme"), (4.0, 6.0, "silence"), (6.0, 10.0, "chaos")]
    notes = son.composer(sections, coups=[5.9], graine=3)
    dans = lambda a, b: [n for n in notes if a <= n.debut < b]
    assert dans(0.0, 4.0) and dans(6.0, 10.0)
    assert not [n for n in dans(4.0, 5.85)]                    # le silence avant la chute
    assert len(dans(6.0, 10.0)) > 1.5 * len(dans(0.0, 4.0))   # le chaos est plus dense
    assert any(n.programme == son.COUP_ORCHESTRE and abs(n.debut - 5.9) < 0.01 for n in notes)


@pytest.mark.skipif(not shutil.which("fluidsynth") or not son.BANQUE.exists(), reason="FluidSynth absent")
def test_la_musique_est_jouee_par_fluidsynth_a_la_bonne_duree(tmp_path):
    chemin = son.jouer(son.composer([(0.0, 3.0, "calme")], coups=[], graine=1), 3.0, tmp_path / "m.wav")
    with wave.open(str(chemin)) as w:
        assert w.getframerate() == TAUX
        # FluidSynth laisse s'éteindre les notes et la réverbération ; le mixage coupe à la durée de l'épisode
        assert 3.0 <= w.getnframes() / TAUX <= 9.0
