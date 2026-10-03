#!/usr/bin/env python3
"""Sauvegarde chiffrée (ZIP AES-256) d'un ou plusieurs dossiers, avec empreintes, rotation et vérification.

    py sauvegarde.py creer  <dossier> [<dossier>…] --vers D:\\Sauvegardes [--garder 8]
    py sauvegarde.py verifier D:\\Sauvegardes\\sauvegarde_2026-10-03_2130.zip
    py sauvegarde.py restaurer <archive.zip> --vers C:\\Restauration

Le mot de passe est lu dans la variable SAUVEGARDE_MDP (via le coffre : vault.ps1 run -- …) ou saisi masqué.
Exclut .git, node_modules, caches, sorties temporaires. Un manifeste sha256 est inclus et vérifié.
"""
import argparse
import datetime as dt
import getpass
import hashlib
import json
import os
import sys
from pathlib import Path

SKIP = {".git", "node_modules", "__pycache__", ".venv", "venv", "output", ".cache", "mpenv"}


def password(confirm: bool) -> bytes:
    pw = os.getenv("SAUVEGARDE_MDP") or getpass.getpass("Mot de passe de sauvegarde (≥ 12 caractères) : ")
    if len(pw) < 12:
        sys.exit("Mot de passe trop court.")
    if confirm and not os.getenv("SAUVEGARDE_MDP") and pw != getpass.getpass("Confirmez : "):
        sys.exit("Les mots de passe diffèrent.")
    return pw.encode()


def creer(dirs, dest: Path, keep: int):
    import pyzipper
    dest.mkdir(parents=True, exist_ok=True)
    pw = password(True)
    name = dest / f"sauvegarde_{dt.datetime.now():%Y-%m-%d_%H%M}.zip"
    manifest = {}
    with pyzipper.AESZipFile(name, "w", compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as z:
        z.setpassword(pw)
        for d in dirs:
            d = Path(d).resolve()
            for root, sub, files in os.walk(d):
                sub[:] = [s for s in sub if s not in SKIP]
                for f in files:
                    p = Path(root) / f
                    arc = f"{d.name}/{p.relative_to(d).as_posix()}"
                    try:
                        data = p.read_bytes()
                    except OSError:
                        continue
                    manifest[arc] = hashlib.sha256(data).hexdigest()
                    z.writestr(arc, data)
        z.writestr("MANIFESTE.json", json.dumps(manifest, indent=1))
    old = sorted(dest.glob("sauvegarde_*.zip"))[:-keep]
    for o in old:
        o.unlink()
    print(f"Sauvegarde : {name} ({len(manifest)} fichiers, {name.stat().st_size / 1e6:.1f} Mo) ; {len(old)} ancienne(s) supprimée(s).")


def ouvrir(archive: Path):
    import pyzipper
    z = pyzipper.AESZipFile(archive)
    z.setpassword(password(False))
    return z


def verifier(archive: Path) -> bool:
    z = ouvrir(archive)
    man = json.loads(z.read("MANIFESTE.json"))
    bad = [n for n, h in man.items() if hashlib.sha256(z.read(n)).hexdigest() != h]
    print(f"{len(man) - len(bad)}/{len(man)} fichiers intacts." + (f" Corrompus : {bad[:10]}" if bad else ""))
    return not bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["creer", "verifier", "restaurer"])
    ap.add_argument("cibles", nargs="+")
    ap.add_argument("--vers", type=Path)
    ap.add_argument("--garder", type=int, default=8)
    a = ap.parse_args()
    if a.action == "creer":
        creer(a.cibles, a.vers, a.garder)
    elif a.action == "verifier":
        sys.exit(0 if verifier(Path(a.cibles[0])) else 1)
    else:
        z = ouvrir(Path(a.cibles[0]))
        a.vers.mkdir(parents=True, exist_ok=True)
        for n in z.namelist():
            target = (a.vers / n).resolve()
            if not str(target).startswith(str(a.vers.resolve())):   # protection « zip slip »
                sys.exit(f"Chemin dangereux refusé : {n}")
        z.extractall(a.vers)
        print(f"Restauré dans {a.vers}")


if __name__ == "__main__":
    main()
