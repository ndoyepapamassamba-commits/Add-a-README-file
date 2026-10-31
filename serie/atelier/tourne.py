"""Une machine de l'atelier : fabrique sa part des illustrations, les détoure et note leur provenance.

Exécuté par .github/workflows/atelier-images.yml sur les machines gratuites de GitHub (accord de l'utilisateur, 31/10/2026).
Moteur : stable-diffusion.cpp (MIT, commit épinglé) + FLUX.2-klein-4B GGUF Q8_0 + Qwen3-4B Q8_0 + décodeur FLUX.2
(tous Apache-2.0, téléchargés sans compte) — recette de la Fabrique (bible-v1.yml, 445 images, 884 s à une référence).
Accélération reprise de la Fabrique (lecture de stable-diffusion.cpp, src/pipeline/image.cpp) : une référence est
ramenée à la surface de l'image demandée et double les jetons ; « --ref-image-args vae_input_max_pixels=N » la
plafonne au quart.
Reprenable : une image déjà présente dans SORTIE n'est jamais refaite.
    python3 serie/atelier/tourne.py TACHES.json PART NB_PARTS POIDS SORTIE SD_CLI [REFS]
"""
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

SERIE = Path(__file__).resolve().parents[1]
SD_CPP = "0518b34374761cb82aeda5ad3c2f0686fdad2cec"


def taches_de_la_part(taches, part, nb_parts):
    return [t for i, t in enumerate(taches) if i % nb_parts == part]


def commande_sd(tache, poids, sortie, binaire, tuiles, refs_dir):
    cmd = [binaire, "--diffusion-model", f"{poids}/klein.gguf", "--vae", f"{poids}/vae.safetensors",
           "--llm", f"{poids}/llm.gguf", "--cfg-scale", "1.0", "--steps", "4", "--sampling-method", "euler",
           "-p", tache["prompt"], "-W", str(tache["w"]), "-H", str(tache["h"]), "--seed", str(tache["graine"]),
           "-t", "4", "-o", sortie, "-v"]
    for ref in tache["refs"]:
        cmd += ["-r", f"{refs_dir}/{ref}"]
    if tache["refs"]:
        cmd += ["--ref-image-args", f"vae_input_max_pixels={tache['w'] * tache['h'] // 4}"]
    if tuiles:
        cmd.append("--vae-tiling")
    return cmd


def _detourer(brut: Path, propre: Path):
    import numpy as np
    from PIL import Image
    sys.path.insert(0, str(SERIE))
    from keba.detourage import detourer
    rgb = np.asarray(Image.open(brut).convert("RGB"))
    Image.fromarray(detourer(rgb)).save(propre)          # tableau H×W×4 : Pillow en déduit le mode RGBA


def main(argv):
    taches_json, part, nb, poids, sortie, binaire = argv[:6]
    refs_dir = argv[6] if len(argv) > 6 else sortie
    part, nb = int(part), int(nb)
    sortie = Path(sortie)
    sortie.mkdir(parents=True, exist_ok=True)
    journal = open(sortie / "journal.txt", "a", encoding="utf-8")
    taches = json.loads(Path(taches_json).read_text(encoding="utf-8"))["taches"]
    for t in taches_de_la_part(taches, part, nb):
        propre, brut = sortie / f"{t['id']}.png", sortie / f"{t['id']}-brut.png"
        if propre.exists():
            print(f"déjà fait : {t['id']}", flush=True)
            continue
        print(f"=== {t['id']}", file=journal, flush=True)
        debut = time.time()
        ok = False
        for tuiles in (False, True):
            r = subprocess.run(commande_sd(t, poids, str(brut), binaire, tuiles, refs_dir),
                               stdout=journal, stderr=subprocess.STDOUT)
            if r.returncode == 0 and brut.exists():
                ok = True
                break
        secondes = round(time.time() - debut, 1)
        if not ok:
            print(f"ÉCHEC {t['id']} après {secondes} s", file=journal, flush=True)
            continue
        _detourer(brut, propre)
        provenance = {"id": t["id"], "modele": "FLUX.2-klein-4B (GGUF Q8_0)", "licence": "Apache-2.0",
                      "encodeur": "Qwen3-4B Q8_0 (Apache-2.0)", "decodeur": "FLUX.2-small-decoder (Apache-2.0)",
                      "moteur": f"stable-diffusion.cpp {SD_CPP} (MIT)", "prompt": t["prompt"], "graine": t["graine"],
                      "largeur": t["w"], "hauteur": t["h"], "refs": t["refs"], "secondes": secondes,
                      "date": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        (sortie / f"{t['id']}.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"fait : {t['id']} en {secondes} s", file=journal, flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
