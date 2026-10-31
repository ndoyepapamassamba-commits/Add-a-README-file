"""Liste des illustrations à fabriquer par l'atelier (machines gratuites de GitHub).

Écrit serie/atelier/taches.json depuis la bible (illustrations.json) : pousser ce fichier sur la branche de travail
déclenche .github/workflows/atelier-images.yml.
    python3 -m atelier.taches          (depuis serie/)
"""
import json
from pathlib import Path

ICI = Path(__file__).resolve().parent
BIBLE = ICI.parent / "bible" / "illustrations.json"
CHEMIN = ICI / "taches.json"


def lot_planches() -> list[dict]:
    ill = json.loads(BIBLE.read_text(encoding="utf-8"))
    taches = []
    for ident, p in ill["personnages"].items():
        taches.append({
            "id": f"{ident}-planche",
            "prompt": ill[p["style"]] + " " + p["description"],
            "w": p["format"][0], "h": p["format"][1], "graine": p["graine"], "refs": [],
        })
    return taches


def ecrire():
    CHEMIN.write_text(json.dumps({"lot": "planches", "taches": lot_planches()}, ensure_ascii=False, indent=1) + "\n",
                      encoding="utf-8")


if __name__ == "__main__":
    ecrire()
    print(CHEMIN)
