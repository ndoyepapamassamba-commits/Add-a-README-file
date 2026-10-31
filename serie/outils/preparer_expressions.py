"""Prépare le lot des expressions : python3 serie/outils/preparer_expressions.py

Pour chaque personnage dont la planche et les articulations sont dans la bible : découpe le carré de la tête dans la
planche brute (fond blanc) → serie/atelier/refs/<perso>-tete.png, et écrit serie/atelier/expressions.json (choix +
cadres). Ensuite : python3 -m atelier.taches (depuis serie/) puis pousser taches.json pour lancer l'atelier.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SERIE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERIE))
from atelier import expressions  # noqa: E402

CHOIX = {
    "keba": ["joie", "surprise", "peur", "choc", "gene", "douleur", "yeux_fermes"],
    "bara": ["colere", "fureur", "peur", "choc", "douleur", "soulagement", "joie", "yeux_fermes"],
    "coumba": ["choc", "fureur", "colere", "surprise", "yeux_fermes"],
}


def main():
    choix, cadres = {}, {}
    refs = SERIE / "atelier" / "refs"
    refs.mkdir(parents=True, exist_ok=True)
    for perso, noms in CHOIX.items():
        d = SERIE / "bible" / "png" / perso
        brut, art = d / "planche-brut.png", d / "planche-articulations.json"
        if not (brut.exists() and art.exists()):
            print(f"{perso} : planche ou articulations absentes, ignoré")
            continue
        image = np.asarray(Image.open(brut).convert("RGB"))
        h, w = image.shape[:2]
        x, y, cote = expressions.cadre_tete(json.loads(art.read_text()), w, h)
        Image.fromarray(image[y:y + cote, x:x + cote]).save(refs / f"{perso}-tete.png")
        choix[perso], cadres[perso] = noms, [x, y, cote]
        print(f"{perso} : tête {cote}×{cote} en ({x}, {y}), {len(noms)} expressions")
    (SERIE / "atelier" / "expressions.json").write_text(
        json.dumps({"choix": choix, "cadres": cadres}, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
