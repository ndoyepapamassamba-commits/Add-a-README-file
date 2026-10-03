#!/usr/bin/env python3
"""Masque secrets et données personnelles d'un texte (entrée standard → sortie standard).

    commande | python3 redact.py            # secrets + e-mails, téléphones, IBAN, cartes
    commande | python3 redact.py --secrets  # secrets seulement
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from patterns import COMPILED, COMPILED_PERSONAL, luhn, plausible  # noqa: E402


def redact(text: str, personal: bool = True) -> str:
    for name, rx in COMPILED:
        text = rx.sub(lambda m, n=name: f"[{n.upper()} MASQUÉ]" if plausible(n, m) else m.group(0), text)
    if personal:
        for name, rx in COMPILED_PERSONAL:
            def sub(m, name=name):
                if name == "Carte bancaire" and not luhn(m.group(0)):
                    return m.group(0)
                return f"[{name.upper()}]"
            text = rx.sub(sub, text)
    return text


if __name__ == "__main__":
    personal = "--secrets" not in sys.argv
    for line in sys.stdin:
        sys.stdout.write(redact(line, personal))
