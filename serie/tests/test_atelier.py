import json

from atelier import taches, tourne


def test_les_planches_du_casting_principal_sont_des_taches(tmp_path):
    t = taches.lot_planches()
    ids = [x["id"] for x in t]
    assert ids == ["keba-planche", "bara-planche", "coumba-planche", "gainde-planche"]
    keba = t[0]
    assert keba["w"] == 768 and keba["h"] == 1024 and keba["graine"] == 11 and keba["refs"] == []
    assert "puppet pose" in keba["prompt"] and "Keba" in keba["prompt"]
    assert t[3]["w"] > t[3]["h"]                      # le mouton est en largeur


def test_chaque_tache_va_a_une_seule_machine():
    toutes = [{"id": f"t{i}"} for i in range(9)]
    vues = []
    for part in range(4):
        vues += [x["id"] for x in tourne.taches_de_la_part(toutes, part, 4)]
    assert sorted(vues) == sorted(x["id"] for x in toutes)


def test_commande_du_moteur_sans_reference():
    tache = {"id": "keba-planche", "prompt": "un gamin", "w": 768, "h": 1024, "graine": 11, "refs": []}
    cmd = tourne.commande_sd(tache, "/m", "/o/keba-planche-brut.png", "/bin/sd-cli", tuiles=False, refs_dir="/r")
    assert cmd[0] == "/bin/sd-cli"
    assert cmd[cmd.index("--diffusion-model") + 1] == "/m/klein.gguf"
    assert cmd[cmd.index("--llm") + 1] == "/m/llm.gguf"
    assert cmd[cmd.index("-W") + 1] == "768" and cmd[cmd.index("-H") + 1] == "1024"
    assert cmd[cmd.index("--steps") + 1] == "4" and cmd[cmd.index("--seed") + 1] == "11"
    assert "-r" not in cmd and "--vae-tiling" not in cmd


def test_commande_du_moteur_avec_reference_plafonnee():
    tache = {"id": "keba-colere", "prompt": "en colère", "w": 512, "h": 512, "graine": 3, "refs": ["keba-planche.png"]}
    cmd = tourne.commande_sd(tache, "/m", "/o/x.png", "/bin/sd-cli", tuiles=True, refs_dir="/r")
    assert cmd[cmd.index("-r") + 1] == "/r/keba-planche.png"
    assert cmd[cmd.index("--ref-image-args") + 1] == f"vae_input_max_pixels={512 * 512 // 4}"
    assert "--vae-tiling" in cmd


def test_le_decor_est_vertical_et_vide_de_personnages():
    (decor,) = taches.lot_decors()
    assert decor["id"] == "decor-rue-boutique"
    assert decor["h"] > decor["w"] and decor["w"] % 64 == 0 and decor["h"] % 64 == 0
    assert "no people" in decor["prompt"].lower()


def test_les_objets_du_pilote_sont_des_vignettes_sur_fond_blanc():
    objets = taches.lot_objets()
    ids = {o["id"] for o in objets}
    assert {"objet-boite-tomate", "objet-orange", "objet-bassine", "objet-claquette", "objet-auvent",
            "objet-seau"} <= ids
    for o in objets:
        assert (o["w"], o["h"]) == (512, 512) and "white background" in o["prompt"]


def test_le_fichier_de_taches_publie_est_a_jour():
    publie = json.loads(taches.CHEMIN.read_text(encoding="utf-8"))
    attendu = taches.lot_planches() + taches.lot_decors() + taches.lot_objets() + taches.lot_expressions()
    assert publie == {"lot": "pilote", "taches": attendu}
    assert len({t["id"] for t in attendu}) == len(attendu)


def test_le_lot_des_expressions_vient_du_fichier_prepare(tmp_path, monkeypatch):
    import json as _json
    f = tmp_path / "expressions.json"
    f.write_text(_json.dumps({"choix": {"keba": ["joie"]}, "cadres": {"keba": [190, 60, 384]}}))
    monkeypatch.setattr(taches, "EXPRESSIONS", f)
    (t,) = taches.lot_expressions()
    assert t["id"] == "keba-expr-joie" and t["refs"] == ["keba-tete.png"]
    monkeypatch.setattr(taches, "EXPRESSIONS", tmp_path / "absent.json")
    assert taches.lot_expressions() == []
