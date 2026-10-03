#!/usr/bin/env python3
"""Contrôle (et durcit) un rapport HTML hors ligne avant diffusion.

    python check_report.py rapport.html                       # contrôle seul (code 1 si problème)
    python check_report.py rapport.html --durcir --classe "CONFIDENTIEL – USAGE INTERNE"

Vérifie : aucune ressource ni appel externe (CDN, polices, images, fetch, XHR, WebSocket, beacon,
formulaires), pas de secrets, données personnelles non masquées, présence d'une politique CSP et d'une
mention de confidentialité. --durcir ajoute la CSP « tout local », la mention en en-tête et pied de
page (aussi à l'impression), et bloque l'envoi réseau même si un script l'oublie.
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "coffre-fort" / "scripts"))
from patterns import COMPILED, COMPILED_PERSONAL, luhn, mask, plausible  # noqa: E402

EXTERNAL = [
    ("ressource externe", r"""(?:src|href)\s*=\s*["']\s*(?:https?:)?//[^"']+"""),
    ("CSS externe", r"""@import\s+(?:url\()?\s*["']?(?:https?:)?//"""),
    ("url() externe", r"""url\(\s*["']?(?:https?:)?//"""),
    ("appel réseau", r"\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|navigator\.sendBeacon)\s*\("),
    ("formulaire", r"<form\b"),
    ("iframe", r"<iframe\b"),
]
CSP = ("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; "
       "style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; "
       "base-uri 'none'\">")
GUARD = ("<script>/* rapport hors ligne : aucun envoi réseau */(function(){var no=function(){throw new Error("
         "'Envoi réseau interdit dans ce rapport')};window.fetch=no;window.XMLHttpRequest=no;window.WebSocket=no;"
         "if(navigator.sendBeacon)navigator.sendBeacon=no;})();</script>")


def check(html: str) -> list:
    issues = []
    for name, rx in EXTERNAL:
        for m in re.finditer(rx, html, re.I):
            issues.append(("BLOQUANT", name, m.group(0)[:70]))
    for name, rx in COMPILED:
        for m in rx.finditer(html):
            if plausible(name, m):
                issues.append(("BLOQUANT", name, mask(m.group(0))))
    text = re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", html, flags=re.S)
    for name, rx in COMPILED_PERSONAL:
        for m in rx.finditer(text):
            if name == "Carte bancaire" and not luhn(m.group(0)):
                continue
            issues.append(("À VÉRIFIER", name, mask(m.group(0))))
    if "Content-Security-Policy" not in html:
        issues.append(("À CORRIGER", "pas de politique CSP", "—"))
    if not re.search(r"confidentiel|usage interne|restreint", html, re.I):
        issues.append(("À CORRIGER", "pas de mention de confidentialité", "—"))
    return issues


def harden(html: str, label: str) -> str:
    head = CSP + GUARD
    band = (f'<div class="classif" style="position:sticky;top:0;z-index:99999;background:#7a0010;color:#fff;'
            f'font:600 12px sans-serif;text-align:center;padding:4px">{label}</div>')
    foot = (f'<style>@media print{{.classif{{position:fixed!important}} body::after{{content:"{label}";'
            f'position:fixed;bottom:0;left:0;right:0;text-align:center;font:600 10px sans-serif;color:#7a0010}}}}'
            f'</style>')
    if "Content-Security-Policy" not in html:
        html = re.sub(r"<head[^>]*>", lambda m: m.group(0) + head, html, count=1, flags=re.I) \
            if re.search(r"<head", html, re.I) else head + html
    if "class=\"classif\"" not in html:
        html = re.sub(r"<body[^>]*>", lambda m: m.group(0) + band + foot, html, count=1, flags=re.I) \
            if re.search(r"<body", html, re.I) else band + foot + html
    return html


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rapport", type=Path)
    ap.add_argument("--durcir", action="store_true")
    ap.add_argument("--classe", default="CONFIDENTIEL – USAGE INTERNE")
    a = ap.parse_args()
    html = a.rapport.read_text("utf-8", errors="ignore")
    if a.durcir:
        html = harden(html, a.classe)
        a.rapport.write_text(html, "utf-8")
        print(f"Durci : CSP « tout local », blocage réseau, mention « {a.classe} ».")
    issues = check(html)
    for lvl, name, val in issues[:300]:
        print(f"[{lvl}] {name} : {val}")
    blocking = [i for i in issues if i[0] != "À VÉRIFIER"]
    print("Rapport prêt à diffuser." if not issues else
          f"{len(blocking)} problème(s) bloquant(s) ou à corriger, {len(issues) - len(blocking)} à vérifier.")
    sys.exit(1 if blocking else 0)


if __name__ == "__main__":
    main()
