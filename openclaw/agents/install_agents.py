#!/usr/bin/env python3
"""Installe l'équipe d'agents OpenClaw : un espace de travail par agent, avec ses consignes (AGENTS.md + règles de
sécurité communes), sa personnalité (SOUL.md) et SES skills seulement (liens vers ce dépôt).

    py install_agents.py                 # APERÇU : montre ce qui serait créé, ne touche à rien
    py install_agents.py --appliquer     # crée / met à jour (les fichiers existants sont sauvegardés en .bak)
    py install_agents.py --appliquer --racine D:\\openclaw     # autre dossier d'état OpenClaw (défaut ~/.openclaw)

Ne modifie PAS openclaw.json : fusionner ensuite openclaw.agents.json5 soi-même, puis lancer audit_agents.py.
"""
import argparse
import datetime as dt
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
SKILLS = REPO / "skills"
SECU = REPO / "AGENTS.securite.md"

TEAM = {
    "chef": ["coffre-fort", "briefing-quotidien"],
    "risques": ["coffre-fort", "qualite-donnees", "analyse-portefeuille", "reporting-securise", "export-pro",
                "export-securise", "dossier-comite", "boite-a-outils"],
    "veille": ["coffre-fort", "recherche-brave", "veille-reglementaire"],
    "studio": ["coffre-fort", "afrikatoon-video", "studio-media", "tiktok-performance"],
    "secretaire": ["coffre-fort", "taches-pro", "briefing-quotidien", "redaction-pro", "boite-a-outils"],
    "gardien": ["coffre-fort", "sauvegarde-chiffree", "modeles-ia-locaux", "memoire-semantique"],
    "dev": ["coffre-fort", "boite-a-outils", "qualite-donnees"],
}
# scripts qui importent un skill voisin : le voisin doit être présent si l'on copie au lieu de lier
DEPENDS = {"export-pro": ["qualite-donnees"], "boite-a-outils": ["qualite-donnees"],
           "analyse-portefeuille": ["qualite-donnees"], "reporting-securise": ["coffre-fort"],
           "export-securise": ["coffre-fort"], "recherche-brave": ["coffre-fort"], "memoire-semantique": ["coffre-fort"]}


def link(src: Path, dst: Path) -> str:
    """Lien symbolique ; sous Windows, jonction (aucun droit administrateur requis) ; sinon copie."""
    try:
        os.symlink(src, dst, target_is_directory=True)
        return "lien"
    except OSError:
        pass
    if sys.platform.startswith("win"):
        r = subprocess.run(["cmd", "/c", "mklink", "/J", str(dst), str(src)], capture_output=True, text=True)
        if r.returncode == 0:
            return "jonction"
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    return "copie"


def backup(p: Path):
    if p.exists() and not p.is_symlink():
        shutil.copy2(p, p.with_name(p.name + f".{dt.datetime.now():%Y%m%d%H%M%S}.bak"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--appliquer", action="store_true")
    ap.add_argument("--racine", type=Path, default=Path(os.getenv("OPENCLAW_STATE_DIR", Path.home() / ".openclaw")))
    ap.add_argument("--agents", default=",".join(TEAM), help="sous-ensemble, ex. chef,risques")
    a = ap.parse_args()
    missing = [s for ids in TEAM.values() for s in ids if not (SKILLS / s / "SKILL.md").exists()]
    if missing:
        sys.exit(f"Skills absents du dépôt : {sorted(set(missing))} — faire « git pull » d'abord.")
    secu = SECU.read_text("utf-8")
    for aid in [x.strip() for x in a.agents.split(",") if x.strip()]:
        if aid not in TEAM:
            sys.exit(f"Agent inconnu : {aid}")
        ws = a.racine / f"workspace-{aid}"
        print(f"\n■ {aid} → {ws}")
        wanted = list(dict.fromkeys(TEAM[aid]))
        print("  skills :", ", ".join(wanted))
        if not a.appliquer:
            continue
        (ws / "skills").mkdir(parents=True, exist_ok=True)
        (a.racine / "agents" / aid / "agent").mkdir(parents=True, exist_ok=True)
        agents_md = (HERE / aid / "AGENTS.md").read_text("utf-8") + "\n\n" + secu
        for name, content in (("AGENTS.md", agents_md), ("SOUL.md", (HERE / aid / "SOUL.md").read_text("utf-8"))):
            f = ws / name
            if f.exists() and f.read_text("utf-8", errors="ignore") == content:
                continue
            backup(f)
            f.write_text(content, "utf-8")
            print(f"  ✔ {name}")
        modes = set()
        for s in wanted:
            dst = ws / "skills" / s
            if dst.exists() or dst.is_symlink():
                continue
            mode = link(SKILLS / s, dst)
            modes.add(mode)
            print(f"  ✔ skill {s} ({mode})")
        if "copie" in modes:                         # dépendances des scripts quand on n'a pas pu lier
            for s in wanted:
                for dep in DEPENDS.get(s, []):
                    if not (ws / "skills" / dep).exists():
                        shutil.copytree(SKILLS / dep, ws / "skills" / dep)
                        print(f"  ✔ dépendance {dep} (copie)")
        stray = [p.name for p in (ws / "skills").iterdir() if p.name not in wanted and p.name not in
                 {d for s in wanted for d in DEPENDS.get(s, [])}]
        if stray:
            print(f"  ⚠ skills en trop dans cet espace (à vérifier, non supprimés) : {', '.join(stray)}")
    if not a.appliquer:
        print("\nAPERÇU seulement. Relancer avec --appliquer pour créer les espaces de travail.")
    else:
        print("\nÉtape suivante : fusionner agents/openclaw.agents.json5 dans openclaw.json, puis :\n"
              f"  py {HERE / 'audit_agents.py'} {a.racine / 'openclaw.json'}\n"
              "  openclaw gateway restart   (ou relancer OpenClaw)")


if __name__ == "__main__":
    main()
