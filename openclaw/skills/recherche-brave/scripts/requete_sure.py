#!/usr/bin/env python3
"""Vérifie qu'une requête de recherche web peut partir sans fuite (à lancer AVANT web_search).

    python requete_sure.py "taux directeur BCEAO octobre 2026"        # code 0 = OK, 1 = refusé
    python requete_sure.py --nettoyer "historique impayés client Awa Diop SN08…"   # propose une version sûre

Refuse : secrets, IBAN, cartes, e-mails, téléphones, montants précis rattachés à une personne, et les termes
listés dans ~/.coffre-fort/termes_interdits.txt (noms de clients, projets internes… un par ligne).
"""
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "coffre-fort" / "scripts"))
from patterns import COMPILED, COMPILED_PERSONAL, luhn, plausible  # noqa: E402

LIST = Path(os.getenv("COFFRE_FORT_DIR", Path.home() / ".coffre-fort")) / "termes_interdits.txt"


def problems(q: str) -> list[tuple[str, str]]:
    out = []
    for name, rx in COMPILED + COMPILED_PERSONAL:
        for m in rx.finditer(q):
            if (name == "Carte bancaire" and not luhn(m.group(0))) or not plausible(name, m):
                continue
            out.append((name, m.group(0)))
    if LIST.exists():
        for t in (l.strip() for l in LIST.read_text("utf-8").splitlines()):
            if t and not t.startswith("#") and re.search(rf"\b{re.escape(t)}\b", q, re.I):
                out.append(("terme interdit", t))
    return out


def main():
    clean = "--nettoyer" in sys.argv
    q = " ".join(a for a in sys.argv[1:] if a != "--nettoyer")
    found = problems(q)
    if not found:
        print("OK : la requête peut être envoyée.")
        return
    print("REFUSÉ : la requête contient des éléments qui ne doivent pas sortir :")
    for name, val in found:
        print(f"  - {name}")
    if clean:
        for _, val in sorted(found, key=lambda x: -len(x[1])):
            q = q.replace(val, "")
        print("Proposition :", re.sub(r"\s{2,}", " ", q).strip())
    sys.exit(1)


if __name__ == "__main__":
    main()
