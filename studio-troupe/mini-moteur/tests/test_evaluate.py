"""Les détecteurs de l'évaluation reconnaissent les vrais clips (sinon les scores ne veulent rien dire)."""

import numpy as np

from minimoteur import evaluate as ev
from minimoteur import troupe_data as td


def test_detecteurs_sur_vrais_clips():
    ok = []
    for i, nom in enumerate(td.PERSONNAGES):
        for j, action in enumerate(td.ACTIONS):
            decor = td.DECORS[(i + j) % 4]
            clip = td.render_clip(nom, action, decor, seed=[42, i, j], supersample=2)
            r = ev.analyse_clip(clip, nom, action, decor)
            ok.append((r["identite_ok"], r["action_ok"], r["decor_ok"]))
    ok = np.array(ok)
    assert ok[:, 0].mean() == 1.0  # identité
    assert ok[:, 1].mean() >= 0.95  # action
    assert ok[:, 2].mean() == 1.0  # décor


def test_clip_immobile_n_est_pas_une_action():
    clip = td.render_clip("MODOU", "parle", "Cour", seed=0, supersample=2)
    fige = np.repeat(clip[:1], 17, axis=0)
    assert ev.analyse_clip(fige, "MODOU", "parle", "Cour")["action_vue"] == "immobile"
    vide = np.repeat((td.render_background("Cour")[None] * 255).astype(np.uint8), 17, axis=0)
    assert ev.analyse_clip(vide, "MODOU", "parle", "Cour")["action_vue"] == "absent"


def test_markdown():
    res = {"date": "x", "vae": {"n": 3, "psnr_heldout_dB": 30.0, "psnr_min_dB": 28.0},
           "parametres": {"pas": 30, "cfg": 4, "shift": 3, "n_par_prompt": 1},
           "texte_video": {"vus": {"n": 1, "identite_ok": 1.0, "action_ok": 0.5, "decor_ok": 1.0, "tout_ok": 0.5}}}
    md = ev.to_markdown(res)
    assert "30.0 dB" in md and "texte→vidéo" in md and "50 %" in md


def test_decor_vide_bruite_ne_valide_aucune_identite():
    # Un décor sans personnage, avec quelques pixels « parasites » aux couleurs de la troupe (comme le bruit
    # d'un VAE) : aucun personnage ne doit être reconnu, ni sur le clip ni image par image.
    assert ev.classify_identity(np.zeros((0, 3), np.float32))[0] == ev.ABSENT
    rng = np.random.default_rng(0)
    _, cb = ev.codebook()
    for decor in td.DECORS:
        fond = (td.render_background(decor)[None] * 255 + 0.5).astype(np.uint8).repeat(17, 0)
        for t in range(17):
            ys, xs = rng.integers(0, 32, 7), rng.integers(0, 32, 7)
            fond[t, ys, xs] = (cb[rng.integers(0, len(cb), 7)] * 255).astype(np.uint8)
        for nom in td.PERSONNAGES:
            r = ev.analyse_clip(fond, nom, "saute", decor)
            assert not r["identite_ok"] and r["identite_vue"] == ev.ABSENT, (decor, nom)
            assert r["persistance_identite"] == 0.0 and r["action_vue"] == ev.ABSENT
