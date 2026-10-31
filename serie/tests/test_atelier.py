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


def test_le_fichier_de_taches_publie_est_a_jour():
    publie = json.loads(taches.CHEMIN.read_text(encoding="utf-8"))
    assert publie == {"lot": "planches", "taches": taches.lot_planches()}
