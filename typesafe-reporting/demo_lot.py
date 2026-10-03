"""Prépare un lot APEX de démonstration : commentaires et secteurs fictifs sur les premiers dossiers.

Usage :
  python3 demo_lot.py Lot_TypeSafe_Impayes_2026-09-30.json [--n 30] [--sortie lot_demo.json]
  python3 impayes_typesafe.py --lot lot_demo.json --sortie Retour_TypeSafe.xlsx

Les commentaires sont fictifs : les 24 commentaires de la démo Impayés, puis six situations complexes
(plusieurs causes, plusieurs scénarios macro, plan à contrôler). Les secteurs fictifs leur correspondent.
À n'utiliser que sur des arrêtés de démonstration. Sur des données réelles, sans validation Conformité,
l'enrichissement se fait avec --anonymiser.
"""
import argparse
import json
from pathlib import Path

import impayes_typesafe as imp
import typesafe_avance as ava


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lot", type=Path)
    ap.add_argument("--n", type=int, default=30, help="nombre de dossiers commentés conservés")
    ap.add_argument("--sortie", type=Path)
    a = ap.parse_args()
    lot = json.loads(a.lot.read_text(encoding="utf-8"))
    textes = imp.COMMENTAIRES_FICTIFS + ava.COMMENTAIRES_COMPLEXES
    lot["dossiers"] = lot["dossiers"][:a.n]
    for i, d in enumerate(lot["dossiers"]):
        d["commentaire"] = textes[i % len(textes)]
        d["secteur"] = ava.SECTEURS_DEMO[i % len(ava.SECTEURS_DEMO)]
    lot["avertissement"] = "Lot de démonstration : commentaires et secteurs fictifs. " + lot.get("avertissement", "")
    sortie = a.sortie or a.lot.with_name("lot_demo.json")
    sortie.write_text(json.dumps(lot, ensure_ascii=False, indent=1), encoding="utf-8")
    pf = lot.get("portefeuille") or {}
    print(f"{sortie} : {len(lot['dossiers'])} dossiers commentés, {len(pf.get('insights', []))} constats, "
          f"{len(pf.get('paires', []))} paires de noms")


if __name__ == "__main__":
    main()
