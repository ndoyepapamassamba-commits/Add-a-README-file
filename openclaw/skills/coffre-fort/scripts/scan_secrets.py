#!/usr/bin/env python3
"""Cherche des secrets (clés, jetons, clés privées…) dans un dossier et, en option, tout l'historique Git.
Les valeurs trouvées sont toujours masquées. Code de sortie 1 si une fuite est trouvée.

    python3 scan_secrets.py <dossier> [--git-history] [--staged] [--personal]
"""
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from patterns import COMPILED, COMPILED_PERSONAL, luhn, mask, plausible  # noqa: E402

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", "mpenv", ".cache"}
TEXT_MAX = 2_000_000


def scan_text(text: str, where: str, personal: bool, out: list):
    for lineno, line in enumerate(text.splitlines(), 1):
        if "coffre-fort: ignore" in line:
            continue
        for name, rx in COMPILED + (COMPILED_PERSONAL if personal else []):
            for m in rx.finditer(line):
                val = m.group(0)
                if (name == "Carte bancaire" and not luhn(val)) or not plausible(name, m):
                    continue
                out.append((where, lineno, name, mask(val)))


def scan_tree(root: Path, personal: bool, out: list):
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            p = Path(dirpath) / f
            try:
                if p.stat().st_size > TEXT_MAX:
                    continue
                data = p.read_bytes()
            except OSError:
                continue
            if b"\0" in data[:4096]:
                continue                                  # binaire
            scan_text(data.decode("utf-8", "ignore"), str(p.relative_to(root)), personal, out)


def git(root: Path, *args) -> str:
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True).stdout


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    root = Path(args[0] if args else ".").resolve()
    personal = "--personal" in sys.argv
    found = []
    if "--staged" in sys.argv:
        scan_text(git(root, "diff", "--cached", "-U0"), "(index Git)", personal, found)
    else:
        scan_tree(root, personal, found)
    if "--git-history" in sys.argv:
        scan_text(git(root, "log", "-p", "--all", "--no-color", "-U0"), "(historique Git)", personal, found)
    if (root / ".git").exists():                           # fichiers d'environnement suivis par Git
        for f in git(root, "ls-files").splitlines():
            name = Path(f).name
            if name in (".env", ".env.local", "id_rsa", "id_ed25519", "credentials.json", "tiktok_tokens.json") \
                    or name.endswith((".pem", ".p12", ".key")):
                found.append((f, 0, "Fichier sensible suivi par Git", "—"))
    for where, line, name, val in found:
        print(f"⚠  {where}:{line}  {name}  {val}")
    print(f"\n{len(found)} élément(s) sensible(s) trouvé(s)." if found else "Aucun secret détecté.")
    sys.exit(1 if found else 0)


if __name__ == "__main__":
    main()
