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
EXPRESSIONS = ICI / "expressions.json"          # écrit par outils/preparer_expressions.py


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


def lot_decors() -> list[dict]:
    ill = json.loads(BIBLE.read_text(encoding="utf-8"))
    return [{"id": f"decor-{ident}", "prompt": ill["style_decor"] + " " + d["description"],
             "w": d["format"][0], "h": d["format"][1], "graine": d["graine"], "refs": []}
            for ident, d in ill["decors"].items()]


def lot_objets() -> list[dict]:
    ill = json.loads(BIBLE.read_text(encoding="utf-8"))
    return [{"id": f"objet-{ident}", "prompt": ill["style_objet"] + " " + o["description"],
             "w": 512, "h": 512, "graine": o["graine"], "refs": []}
            for ident, o in ill["objets"].items()]


def lot_expressions() -> list[dict]:
    if not EXPRESSIONS.exists():
        return []
    from . import expressions
    d = json.loads(EXPRESSIONS.read_text(encoding="utf-8"))
    return expressions.lot(d["choix"], {k: tuple(v) for k, v in d["cadres"].items()})


def ecrire():
    taches = lot_planches() + lot_decors() + lot_objets() + lot_expressions()
    CHEMIN.write_text(json.dumps({"lot": "pilote", "taches": taches}, ensure_ascii=False, indent=1) + "\n",
                      encoding="utf-8")


if __name__ == "__main__":
    ecrire()
    print(CHEMIN)
