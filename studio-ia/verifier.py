"""Contrôle de la banque de sketchs avant toute dépense.

  python3 verifier.py

- personnages en double : même vêtement de même couleur chez deux personnages (toute la chaîne) ;
- dialogue sans marqueur du français d'Abidjan (l'accent ivoirien vient surtout du texte, cf. README) ;
- sketchs du programme absents de la banque, ou sketchs de la banque hors programme.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import generer  # noqa: E402

VETEMENTS = ("wax dress", "dress", "boubou", "kaftan", "polo", "t-shirt", "shirt", "suit", "tracksuit", "jersey",
             "overalls", "hoodie", "apron", "uniform", "pagne", "headwrap", "nightgown", "pyjamas", "jacket", "cap",
             "hat", "vest", "singlet", "tank top", "jumpsuit", "cardigan", "blouse", "skirt", "scrubs", "tuxedo",
             "gown", "durag", "bandana", "headscarf", "fez", "kufi", "bomber", "turtleneck", "dashiki", "lace")
MARQUEURS = ("dêh", "tonton", "tantie", "mon vieux", "vieux père", "-là", "ya fohi", "mon gars", "hein", "on dit quoi",
             "c'est comment", "gbê", "yako", "ma go", "papi", "mamie", "ma sœur", "mon petit", "mon fils", "ma fille")


def signatures(desc):
    """Paires « couleur(s) + vêtement » : « royal-blue boubou », « orange cap »…"""
    d = desc.lower()
    trouvees = set()
    for v in sorted(VETEMENTS, key=len, reverse=True):
        for m in re.finditer(r"((?:[a-z]+-)*[a-z]+(?:-and-[a-z]+)?)\s+(?:[a-z]+\s+)?" + re.escape(v) + r"\b", d):
            couleur = m.group(1)
            if couleur not in ("a", "an", "the", "his", "her", "with", "and", "over", "of", "in", "big", "long", "tight",
                               "simple", "plain", "old", "elegant", "shiny", "oversized", "faded", "huge", "small"):
                trouvees.add(f"{couleur} {v}")
    return trouvees


def main():
    tous = generer.sketchs()
    vus = defaultdict(list)
    for sid, s in sorted(tous.items()):
        for p in s["persos"]:
            for sig in signatures(p["desc"]):
                vus[sig].append(f"{sid} {p['nom']}")
    doublons = {k: v for k, v in vus.items() if len({x.split()[0] for x in v}) > 1}
    print(f"{len(tous)} sketchs, {sum(len(s['persos']) for s in tous.values())} personnages")
    print(f"tenues en double : {len(doublons)}")
    for k, v in sorted(doublons.items()):
        print(f"  « {k} » : {' | '.join(v)}")
    sans = [sid for sid, s in tous.items()
            if not any(m in " ".join(t for _, t in s["dialogue"]).lower() for m in MARQUEURS)]
    print(f"dialogues sans marqueur ivoirien : {sans or 'aucun'}")
    prog = ICI / "sketchs" / "programme.json"
    if prog.exists():
        p = json.loads(prog.read_text())
        dans = [i for c in p.values() for i in c]
        print("programme :", len(p), "compilations,", len(dans), "sketchs ;",
              "absents de la banque :", [i for i in dans if i not in tous] or "aucun", ";",
              "hors programme :", [i for i in tous if i not in dans] or "aucun", ";",
              "en double :", sorted({i for i in dans if dans.count(i) > 1}) or "aucun")
    total = sum(generer.duree(s) for s in tous.values())
    print(f"durée totale demandée : {total} s ; moyenne {total / len(tous):.1f} s")


if __name__ == "__main__":
    main()
