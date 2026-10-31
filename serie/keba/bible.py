"""La bible de la série : personnages, expressions, objets et lieux, lus depuis serie/bible/*.json."""
import json
from functools import lru_cache
from pathlib import Path

DOSSIER = Path(__file__).resolve().parents[1] / "bible"


class Bible:
    def __init__(self, dossier: Path = DOSSIER):
        self.personnages = json.loads((dossier / "personnages.json").read_text(encoding="utf-8"))
        brutes = json.loads((dossier / "expressions.json").read_text(encoding="utf-8"))
        self.expressions = {k: v for k, v in brutes.items() if not k.startswith("_")}

    def personnage(self, ident: str) -> dict:
        if ident not in self.personnages:
            raise KeyError(f"personnage inconnu de la bible : {ident}")
        return self.personnages[ident] | {"id": ident}

    def expression(self, nom: str) -> dict:
        if nom not in self.expressions:
            raise KeyError(f"expression inconnue de la bible : {nom}")
        return self.expressions[nom]


@lru_cache(maxsize=1)
def charger() -> Bible:
    return Bible()
