#!/usr/bin/env python3
"""Gestionnaire de tâches local (fichier JSON, rien en ligne) : priorités Eisenhower, échéances, projets, revue.

    py taches.py ajouter "Préparer dossier Comité" --echeance 2026-10-15 --urgent --important --projet Risques [--duree 90]
    py taches.py liste [--projet P] [--toutes]       # tri : en retard, urgent+important, échéance
    py taches.py jour                                # le plan du jour (≤ 6 h de travail estimé)
    py taches.py fait 3        |  py taches.py report 3 --echeance 2026-10-20  |  py taches.py suppr 3
    py taches.py revue [--sortie revue.md]           # bilan de la semaine : fait, en retard, à décider
    py taches.py ics [--sortie taches.ics]           # échéances à importer dans Outlook / Google Agenda (fichier local)

Fichier : %USERPROFILE%\\.taches\\taches.json (ou $TACHES_FICHIER). Copie de sécurité .bak à chaque écriture.
Ne jamais y mettre de mots de passe ni de données clients nominatives.
"""
import argparse
import datetime as dt
import json
import os
import shutil
import sys
import uuid
from pathlib import Path

FILE = Path(os.getenv("TACHES_FICHIER", Path.home() / ".taches" / "taches.json"))
TODAY = dt.date.today()
QUAD = {(True, True): "1-FAIRE", (False, True): "2-PLANIFIER", (True, False): "3-DÉLÉGUER", (False, False): "4-ABANDONNER?"}


def load():
    if not FILE.exists():
        return {"suivant": 1, "taches": []}
    try:
        return json.loads(FILE.read_text("utf-8"))
    except json.JSONDecodeError:
        bak = FILE.with_suffix(".bak")
        if bak.exists():
            print("⚠  fichier abîmé : restauration de la copie de sécurité")
            return json.loads(bak.read_text("utf-8"))
        raise


def save(db):
    FILE.parent.mkdir(parents=True, exist_ok=True)
    if FILE.exists():
        shutil.copy2(FILE, FILE.with_suffix(".bak"))
    tmp = FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(db, ensure_ascii=False, indent=1), "utf-8")
    os.replace(tmp, FILE)                         # écriture atomique


def date(s):
    if not s:
        return None
    s = s.lower()
    rel = {"aujourdhui": 0, "aujourd'hui": 0, "demain": 1, "apres-demain": 2}
    if s in rel:
        return (TODAY + dt.timedelta(rel[s])).isoformat()
    if s.startswith("+") and s[1:-1].isdigit() and s[-1] in "js":
        return (TODAY + dt.timedelta(int(s[1:-1]) * (7 if s[-1] == "s" else 1))).isoformat()
    for f in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m"):
        try:
            d = dt.datetime.strptime(s, f).date()
            if f == "%d/%m":
                d = d.replace(year=TODAY.year)       # date la plus proche : passée de < 90 j, sinon l'an prochain
                if (TODAY - d).days > 90:
                    d = d.replace(year=TODAY.year + 1)
            return d.isoformat()
        except ValueError:
            pass
    sys.exit(f"Date non comprise : {s} (AAAA-MM-JJ, JJ/MM, demain, +3j, +2s)")


def key(t):
    e = dt.date.fromisoformat(t["echeance"]) if t.get("echeance") else dt.date.max
    late = e < TODAY
    return (not late, not (t["urgent"] and t["important"]), not t["important"], e, t["id"])


def line(t):
    e = t.get("echeance")
    tag = ""
    if e:
        d = (dt.date.fromisoformat(e) - TODAY).days
        tag = f"⚠ EN RETARD {-d} j" if d < 0 else "AUJOURD'HUI" if d == 0 else "demain" if d == 1 else f"J-{d}"
    q = QUAD[(t["urgent"], t["important"])]
    fait = "✔ " if t["fait"] else ""
    return f"{t['id']:>3}. {fait}[{q}] {t['titre']}" + (f"  ({t['projet']})" if t.get("projet") else "") + \
        (f"  — {tag}" if tag else "") + (f"  ~{t['duree']} min" if t.get("duree") else "")


def find(db, i):
    for t in db["taches"]:
        if t["id"] == i:
            return t
    sys.exit(f"Tâche {i} introuvable")


def main():
    ap = argparse.ArgumentParser(description="Tâches locales")
    ap.add_argument("action", choices=["ajouter", "liste", "jour", "fait", "report", "suppr", "revue", "ics"])
    ap.add_argument("arg", nargs="?")
    ap.add_argument("--echeance")
    ap.add_argument("--urgent", action="store_true")
    ap.add_argument("--important", action="store_true")
    ap.add_argument("--projet", default="")
    ap.add_argument("--duree", type=int, default=0)
    ap.add_argument("--toutes", action="store_true")
    ap.add_argument("--sortie", type=Path)
    a = ap.parse_args()
    db = load()
    if a.action == "ajouter":
        if not a.arg:
            sys.exit("Titre requis")
        t = {"id": db["suivant"], "uid": str(uuid.uuid4()), "titre": a.arg.strip()[:200], "echeance": date(a.echeance),
             "urgent": a.urgent, "important": a.important, "projet": a.projet, "duree": a.duree, "fait": False,
             "cree": TODAY.isoformat(), "fini": None, "reports": 0}
        db["suivant"] += 1
        db["taches"].append(t)
        save(db)
        print("Ajoutée :", line(t))
    elif a.action in ("liste", "jour"):
        ts = [t for t in db["taches"] if (a.toutes or not t["fait"]) and (not a.projet or t["projet"] == a.projet)]
        ts.sort(key=key)
        if a.action == "jour":
            budget, plan = 360, []
            for t in ts:
                e = t.get("echeance")
                if t["fait"] or not (t["important"] or t["urgent"] or (e and e <= (TODAY + dt.timedelta(2)).isoformat())):
                    continue
                if budget - (t.get("duree") or 30) < 0 and plan:
                    break
                budget -= t.get("duree") or 30
                plan.append(t)
            print(f"Plan du {TODAY:%d/%m/%Y} ({(360 - budget) // 60} h {(360 - budget) % 60:02d} estimées) :")
            ts = plan
        for t in ts:
            print(line(t))
        if not ts:
            print("Rien à faire. 🎉")
        stale = [t for t in db["taches"] if not t["fait"] and t.get("reports", 0) >= 3]
        if stale:
            print(f"\n{len(stale)} tâche(s) reportée(s) 3 fois ou plus : décider (faire, déléguer ou abandonner).")
    elif a.action in ("fait", "report", "suppr"):
        t = find(db, int(a.arg))
        if a.action == "fait":
            t["fait"], t["fini"] = True, TODAY.isoformat()
        elif a.action == "report":
            t["echeance"], t["reports"] = date(a.echeance or "+1j"), t.get("reports", 0) + 1
        else:
            db["taches"].remove(t)
            db.setdefault("corbeille", []).append(t)
        save(db)
        print({"fait": "Terminée", "report": "Reportée", "suppr": "Mise à la corbeille"}[a.action], ":", line(t))
    elif a.action == "revue":
        start = TODAY - dt.timedelta(days=7)
        done = [t for t in db["taches"] if t["fait"] and t["fini"] and t["fini"] >= start.isoformat()]
        late = [t for t in db["taches"] if not t["fait"] and t.get("echeance") and t["echeance"] < TODAY.isoformat()]
        nxt = sorted([t for t in db["taches"] if not t["fait"] and t.get("echeance")
                      and TODAY.isoformat() <= t["echeance"] <= (TODAY + dt.timedelta(7)).isoformat()], key=lambda t: t["echeance"])
        drift = [t for t in db["taches"] if not t["fait"] and t.get("reports", 0) >= 3]
        md = [f"# Revue de la semaine — {TODAY:%d/%m/%Y}", "",
              f"**{len(done)}** terminée(s), **{len(late)}** en retard, **{len(nxt)}** à échéance dans 7 jours.", "",
              "## Terminé"] + [f"- {t['titre']}" for t in done] + ["", "## En retard"] + \
             [f"- {t['titre']} (échéance {t['echeance']})" for t in late] + ["", "## Semaine prochaine"] + \
             [f"- {t['echeance']} — {t['titre']}" for t in nxt] + ["", "## À décider (reportées ≥ 3 fois)"] + \
             [f"- {t['titre']}" for t in drift]
        txt = "\n".join(md)
        if a.sortie:
            a.sortie.write_text(txt, "utf-8")
            print("Revue :", a.sortie)
        else:
            print(txt)
    else:
        def esc(s):
            return s.replace("\\", "\\\\").replace(";", "\;").replace(",", "\\,").replace("\n", " ")
        ev = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//taches-pro//FR", "CALSCALE:GREGORIAN"]
        n = 0
        for t in db["taches"]:
            if t["fait"] or not t.get("echeance"):
                continue
            d = t["echeance"].replace("-", "")
            ev += ["BEGIN:VEVENT", f"UID:{t['uid']}@taches-pro", f"DTSTAMP:{dt.datetime.utcnow():%Y%m%dT%H%M%SZ}",
                   f"DTSTART;VALUE=DATE:{d}", f"SUMMARY:{esc(t['titre'])}",
                   "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15H", f"DESCRIPTION:{esc(t['titre'])}", "END:VALARM",
                   "END:VEVENT"]
            n += 1
        ev.append("END:VCALENDAR")
        dest = a.sortie or Path("taches.ics")
        dest.write_text("\r\n".join(ev) + "\r\n", "utf-8")
        print(f"{n} échéance(s) dans {dest} : à ouvrir avec Outlook ou à importer dans l'agenda (aucun envoi).")


if __name__ == "__main__":
    main()
