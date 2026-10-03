#!/usr/bin/env python3
"""Audit de la mémoire OpenClaw : cherche secrets et données personnelles dans MEMORY.md, USER.md,
memory/*.md (et tout dossier donné), et peut les masquer.

    python audit_memoire.py <dossier_espace_de_travail>             # rapport (code 1 si problème)
    python audit_memoire.py <dossier> --masquer                     # remplace les valeurs par [MASQUÉ]
                                                                     #   (sans copie : une copie garderait le secret)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "coffre-fort" / "scripts"))
from patterns import COMPILED, COMPILED_PERSONAL, luhn, mask, plausible  # noqa: E402


def files(root: Path):
    for name in ("MEMORY.md", "USER.md", "DREAMS.md", "AGENTS.md", "SOUL.md", "TOOLS.md"):
        if (root / name).exists():
            yield root / name
    for sub in ("memory",):
        if (root / sub).exists():
            yield from sorted((root / sub).rglob("*.md"))


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else ".")
    fix = "--masquer" in sys.argv
    total = 0
    for f in files(root):
        text = f.read_text("utf-8", errors="ignore")
        hits = []
        for name, rx in COMPILED + COMPILED_PERSONAL:
            for m in rx.finditer(text):
                if (name == "Carte bancaire" and not luhn(m.group(0))) or not plausible(name, m):
                    continue
                hits.append((name, m.group(0)))
        for name, val in hits:
            print(f"⚠  {f.relative_to(root)} : {name} {mask(val)}")
        if hits and fix:
            for _, val in sorted(hits, key=lambda x: -len(x[1])):
                text = text.replace(val, "[MASQUÉ]")
            f.write_text(text, "utf-8")
            print("   → masqué")
        total += len(hits)
    print(f"{total} élément(s) sensible(s) en mémoire." if total else "Mémoire propre : aucun secret ni donnée personnelle.")
    sys.exit(1 if total and not fix else 0)


if __name__ == "__main__":
    main()
