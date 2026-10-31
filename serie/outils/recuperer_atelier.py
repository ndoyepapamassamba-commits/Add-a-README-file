"""Range les illustrations de l'atelier dans la bible : python3 serie/outils/recuperer_atelier.py [DOSSIER_GIT]

Va chercher les branches atelier-sortie-* du dépôt, copie chaque image brute et sa provenance dans serie/bible/png/,
puis refait le détourage ici avec le code le plus récent (les machines détourent avec le code du moment du lancement).
  personnage  → bible/png/<perso>/planche(-brut).png
  décor       → bible/png/decors/<id>(-brut).png
  objet       → bible/png/objets/<id>(-brut).png
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SERIE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERIE))
from atelier.expressions import egaliser_couleurs, recoller  # noqa: E402
from keba.detourage import detourer  # noqa: E402

BIBLE_PNG = SERIE / "bible" / "png"


def destination(ident: str) -> Path:
    if ident.startswith("decor-"):
        return BIBLE_PNG / "decors" / ident[len("decor-"):]
    if ident.startswith("objet-"):
        return BIBLE_PNG / "objets" / ident[len("objet-"):]
    perso, _, quoi = ident.partition("-")
    return BIBLE_PNG / perso / quoi


def git(*args, depot):
    return subprocess.run(["git", "-C", str(depot), *args], capture_output=True, text=True, check=True).stdout


def main(depot: Path):
    branches = [l.split("refs/heads/")[1] for l in git("ls-remote", "origin", "refs/heads/atelier-sortie-*",
                                                        depot=depot).splitlines()]
    ranges = []
    for b in sorted(branches):
        git("fetch", "-q", "origin", f"{b}:refs/remotes/origin/{b}", depot=depot)
        fichiers = git("ls-tree", "--name-only", f"origin/{b}", depot=depot).split()
        for f in fichiers:
            if not f.endswith(".json") or f.startswith("resume"):
                continue
            ident = f[:-5]
            if f"{ident}-brut.png" not in fichiers:
                continue
            dest = destination(ident)
            dest.parent.mkdir(parents=True, exist_ok=True)
            brut = subprocess.run(["git", "-C", str(depot), "show", f"origin/{b}:{ident}-brut.png"],
                                  capture_output=True, check=True).stdout
            dest.with_name(dest.name + "-brut.png").write_bytes(brut)
            dest.with_name(dest.name + ".json").write_text(
                git("show", f"origin/{b}:{f}", depot=depot), encoding="utf-8")
            if ident.startswith("decor-"):
                Image.open(dest.with_name(dest.name + "-brut.png")).convert("RGB").save(dest.with_suffix(".png"))
            elif "-expr-" in ident:
                # tête retouchée : recollée dans la planche brute (même cadrage), puis détourée en entier
                perso = ident.split("-expr-")[0]
                cadre = json.loads((SERIE / "atelier" / "expressions.json").read_text())["cadres"][perso]
                planche = np.asarray(Image.open(BIBLE_PNG / perso / "planche-brut.png").convert("RGB"))
                tete = np.asarray(Image.open(dest.with_name(dest.name + "-brut.png")).convert("RGB"))
                x, y, cote = cadre
                tete = egaliser_couleurs(tete, planche[y:y + cote, x:x + cote])
                Image.fromarray(detourer(recoller(planche, tete, cadre))).save(dest.with_suffix(".png"))
            else:
                rgb = np.asarray(Image.open(dest.with_name(dest.name + "-brut.png")).convert("RGB"))
                Image.fromarray(detourer(rgb)).save(dest.with_suffix(".png"))
            ranges.append(str(dest.with_suffix(".png").relative_to(SERIE)))
    print(json.dumps(ranges, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else SERIE.parent)
