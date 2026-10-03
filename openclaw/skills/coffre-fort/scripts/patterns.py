"""Motifs de secrets et de données sensibles (partagés par scan_secrets.py et redact.py)."""
import re

SECRETS = [
    ("Clé Anthropic", r"sk-ant-[A-Za-z0-9_\-]{20,}"),
    ("Clé OpenAI", r"sk-(?!ant-)(?:proj-)?[A-Za-z0-9_\-]{32,}"),
    ("Jeton HuggingFace", r"hf_(?:hf_)?[A-Za-z0-9]{30,}"),
    ("Jeton GitHub", r"(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}"),
    ("Clé Google", r"AIza[0-9A-Za-z_\-]{35}"),
    ("Clé AWS", r"(?:AKIA|ASIA)[0-9A-Z]{16}"),
    ("Jeton Slack", r"xox[abprs]-[A-Za-z0-9\-]{10,}"),
    ("Clé Stripe", r"(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}"),
    ("Jeton Telegram", r"\b\d{8,10}:[A-Za-z0-9_\-]{35}\b"),
    ("Clé privée", r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----"),
    ("JWT", r"\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"),
    ("Mot de passe dans une URL", r"[a-z][a-z0-9+\-.]*://[^\s/:@]+:[^\s/@]{3,}@"),
    ("Affectation de secret", r"(?i)\b[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|ACCESS_KEY)"
                              r"[A-Z0-9_]*['\"]?\s*[:=]\s*(['\"]?)(?P<val>[A-Za-z0-9+/_\-]{16,})\1(?![A-Za-z0-9(.\[])"),
]

PERSONAL = [
    ("IBAN", r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b"),
    ("Carte bancaire", r"\b(?:\d[ \-]?){13,19}\b"),
    ("E-mail", r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),
    ("Téléphone", r"(?<!\d)(?:\+?\d{1,3}[ .\-]?)?(?:\(?\d{2,3}\)?[ .\-]?){3,4}\d{2}(?!\d)"),
]

COMPILED = [(n, re.compile(p)) for n, p in SECRETS]
COMPILED_PERSONAL = [(n, re.compile(p)) for n, p in PERSONAL]


def luhn(number: str) -> bool:
    digits = [int(c) for c in number if c.isdigit()]
    if not 13 <= len(digits) <= 19:
        return False
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def mask(value: str) -> str:
    v = value.strip()
    return f"{v[:3]}…({len(v)} car.)" if len(v) > 6 else "…"


def entropy(v: str) -> float:
    import math
    from collections import Counter
    c = Counter(v)
    return -sum(n / len(v) * math.log2(n / len(v)) for n in c.values())


def plausible(name: str, m) -> bool:
    """Filtre les faux positifs de la règle générique : valeur aléatoire, lettres ET chiffres."""
    if name != "Affectation de secret":
        return True
    v = m.group("val")
    return entropy(v) > 3.6 and any(c.isdigit() for c in v) and any(c.isalpha() for c in v) \
        and not v.isupper() and "_" not in v[:4]
