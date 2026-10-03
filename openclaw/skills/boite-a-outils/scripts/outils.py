#!/usr/bin/env python3
"""Boîte à outils fichiers — sûre par défaut (aperçu d'abord, rien n'est supprimé, tout est annulable).

    py outils.py doublons  <dossier> [--min-ko 1]                 # fichiers identiques (SHA-256), rien n'est effacé
    py outils.py taille    <dossier> [--top 20]                   # ce qui prend de la place
    py outils.py inventaire <dossier> --sortie inventaire.csv     # liste + taille + date + empreinte
    py outils.py renommer  <dossier> --motif "IMG_(\\d+)" --par "photo_\\1" [--appliquer]   # aperçu sans --appliquer
    py outils.py annuler   <journal_renommage.csv>                # remet les anciens noms
    py outils.py comparer  ancien.xlsx nouveau.xlsx --cle "Compte" [--sortie ecarts.csv]   # lignes ajoutées/supprimées/modifiées
    py outils.py fusionner f1.xlsx f2.csv … --sortie tout.csv     # empile des fichiers de mêmes colonnes (+ colonne Source)
    py outils.py decouper  fichier.xlsx --cle "Agence" --dossier sortie/   # un fichier par valeur
    py outils.py encodage  fichier.csv [--convertir]              # détecte et passe en UTF-8 (copie)
"""
import argparse
import csv
import datetime as dt
import hashlib
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "qualite-donnees" / "scripts"))
from qualite import load, num  # noqa: E402

SKIP = {".git", "node_modules", "__pycache__", ".venv", "venv", "$RECYCLE.BIN", "System Volume Information"}


def walk(root: Path):
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in SKIP and not x.startswith(".")]
        for f in files:
            p = Path(d) / f
            if p.is_file() and not p.is_symlink():
                yield p


def h(p: Path, limit=None) -> str:
    s = hashlib.sha256()
    with open(p, "rb") as f:
        if limit:
            s.update(f.read(limit))
        else:
            for b in iter(lambda: f.read(1 << 20), b""):
                s.update(b)
    return s.hexdigest()


def human(n):
    for u in ("o", "Ko", "Mo", "Go", "To"):
        if n < 1024:
            return f"{n:.0f} {u}" if u == "o" else f"{n:.1f} {u}"
        n /= 1024
    return f"{n:.1f} Po"


def doublons(root, min_ko):
    by_size = defaultdict(list)
    for p in walk(root):
        try:
            sz = p.stat().st_size
        except OSError:
            continue
        if sz >= min_ko * 1024:
            by_size[sz].append(p)
    groups, gain = [], 0
    for sz, ps in by_size.items():
        if len(ps) < 2:
            continue
        quick = defaultdict(list)
        for p in ps:
            quick[h(p, 65536)].append(p)
        for qs in quick.values():
            if len(qs) < 2:
                continue
            full = defaultdict(list)
            for p in qs:
                full[h(p)].append(p)
            for fs in full.values():
                if len(fs) > 1:
                    groups.append((sz, sorted(fs, key=lambda x: x.stat().st_mtime)))
                    gain += sz * (len(fs) - 1)
    for sz, fs in sorted(groups, key=lambda g: -g[0] * len(g[1])):
        print(f"\n{human(sz)} × {len(fs)}")
        for i, p in enumerate(fs):
            print(("  garder  " if i == 0 else "  doublon ") + str(p))
    print(f"\n{len(groups)} groupe(s), {human(gain)} récupérables. Rien n'a été supprimé : "
          "l'utilisateur choisit, et l'on déplace vers la corbeille plutôt que d'effacer.")


def taille(root, top):
    files, dirs = [], defaultdict(int)
    for p in walk(root):
        try:
            sz = p.stat().st_size
        except OSError:
            continue
        files.append((sz, p))
        rel = p.relative_to(root).parts
        dirs[rel[0] if len(rel) > 1 else "."] += sz
    print("Dossiers :")
    for d, sz in sorted(dirs.items(), key=lambda x: -x[1])[:top]:
        print(f"  {human(sz):>10}  {d}")
    print("Fichiers :")
    for sz, p in sorted(files, reverse=True)[:top]:
        print(f"  {human(sz):>10}  {p.relative_to(root)}")
    print(f"Total : {human(sum(s for s, _ in files))} dans {len(files)} fichiers")


def inventaire(root, dest):
    n = 0
    with open(dest, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["chemin", "extension", "taille_octets", "modifie_le", "sha256"])
        for p in walk(root):
            st = p.stat()
            w.writerow([p.relative_to(root), p.suffix.lower(), st.st_size,
                        dt.datetime.fromtimestamp(st.st_mtime).strftime("%d/%m/%Y %H:%M"), h(p)])
            n += 1
    print(f"Inventaire : {dest} ({n} fichiers)")


BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def renommer(root, motif, par, apply):
    rx = re.compile(motif)
    plan = []
    for p in sorted(root.iterdir()):
        if not p.is_file() or not rx.search(p.name):
            continue
        new = rx.sub(par, p.name)
        if new != p.name:
            plan.append((p, p.with_name(new)))
    targets = [b.name.lower() for _, b in plan]
    errs = []
    for a, b in plan:
        if BAD.search(b.name) or b.name.strip(" .") != b.name or not b.name:
            errs.append(f"nom invalide : {b.name}")
        if targets.count(b.name.lower()) > 1:
            errs.append(f"collision : plusieurs fichiers deviendraient {b.name}")
        if b.exists() and b not in [x for x, _ in plan]:
            errs.append(f"existe déjà : {b.name}")
    for a, b in plan[:200]:
        print(f"{a.name}  →  {b.name}")
    print(f"{len(plan)} fichier(s) concerné(s).")
    if errs:
        print("\n".join(sorted(set(errs))))
        sys.exit("Rien n'a été renommé : corriger le motif.")
    if not apply:
        print("APERÇU seulement. Relancer avec --appliquer après accord de l'utilisateur.")
        return
    journal = root / f"journal_renommage_{dt.datetime.now():%Y%m%d_%H%M%S}.csv"
    tmp = [(a, a.with_name(f".__ren_{i}_{a.name}"), b) for i, (a, b) in enumerate(plan)]
    for a, t, _ in tmp:                     # deux passes : évite les écrasements en chaîne
        a.rename(t)
    with open(journal, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["ancien", "nouveau"])
        for a, t, b in tmp:
            t.rename(b)
            w.writerow([a.name, b.name])
    print(f"Renommé. Pour annuler : py outils.py annuler \"{journal}\"")


def annuler(journal: Path):
    rows = list(csv.reader(open(journal, encoding="utf-8"), delimiter=";"))[1:]
    root = journal.parent
    for old, new in rows:
        if (root / old).exists():
            sys.exit(f"Annulation impossible : {old} existe déjà.")
    for old, new in reversed(rows):
        (root / new).rename(root / old)
    journal.rename(journal.with_suffix(".annule.csv"))
    print(f"{len(rows)} fichier(s) remis à leur ancien nom.")


def _index(path, cle):
    head, rows = load(path, None)
    if cle not in head:
        sys.exit(f"Colonne clé « {cle} » absente de {path.name} (colonnes : {', '.join(head)})")
    k = head.index(cle)
    idx, dup = {}, 0
    for r in rows:
        key = str(r[k]).strip() if k < len(r) else ""
        dup += key in idx
        idx[key] = {h_: (r[i] if i < len(r) else None) for i, h_ in enumerate(head)}
    if dup:
        print(f"⚠  {path.name} : {dup} clé(s) en double (la dernière ligne est retenue)")
    return head, idx


def same(a, b):
    na, nb = num(a), num(b)
    if na is not None and nb is not None:
        return abs(na - nb) < 0.005
    norm = lambda v: "" if v is None else (v.strftime("%Y-%m-%d") if hasattr(v, "strftime") else str(v).strip())
    return norm(a) == norm(b)


def comparer(f1, f2, cle, dest):
    h1, a = _index(f1, cle)
    h2, b = _index(f2, cle)
    cols = [c for c in h1 if c in h2 and c != cle]
    if set(h1) ^ set(h2):
        print("Colonnes ajoutées :", ", ".join(c for c in h2 if c not in h1) or "—",
              "| supprimées :", ", ".join(c for c in h1 if c not in h2) or "—")
    out = [["type", cle, "colonne", "avant", "après"]]
    for k in b.keys() - a.keys():
        out.append(["ajoutée", k, "", "", ""])
    for k in a.keys() - b.keys():
        out.append(["supprimée", k, "", "", ""])
    changed = defaultdict(int)
    for k in a.keys() & b.keys():
        for c in cols:
            if not same(a[k][c], b[k][c]):
                out.append(["modifiée", k, c, a[k][c], b[k][c]])
                changed[c] += 1
    n_add = sum(r[0] == "ajoutée" for r in out)
    n_del = sum(r[0] == "supprimée" for r in out)
    print(f"{len(a)} → {len(b)} lignes : {n_add} ajoutée(s), {n_del} supprimée(s), "
          f"{len({r[1] for r in out if r[0] == 'modifiée'})} modifiée(s)")
    for c, n in sorted(changed.items(), key=lambda x: -x[1]):
        print(f"  {c} : {n} changement(s)")
    if dest:
        with open(dest, "w", newline="", encoding="utf-8-sig") as f:
            csv.writer(f, delimiter=";").writerows(out)
        print("Détail :", dest)


def fusionner(files, dest):
    head0, allrows = None, []
    for f in files:
        head, rows = load(f, None)
        if head0 is None:
            head0 = head
        elif [x.lower() for x in head] != [x.lower() for x in head0]:
            if set(x.lower() for x in head) != set(x.lower() for x in head0):
                sys.exit(f"Colonnes différentes dans {f.name} : {set(head) ^ set(head0)}")
            order = [ [x.lower() for x in head].index(c.lower()) for c in head0]
            rows = [[r[i] if i < len(r) else None for i in order] for r in rows]
        allrows += [list(r) + [f.name] for r in rows]
        print(f"  {f.name} : {len(rows)} lignes")
    with open(dest, "w", newline="", encoding="utf-8-sig") as fo:
        w = csv.writer(fo, delimiter=";")
        w.writerow(head0 + ["Source"])
        w.writerows(allrows)
    print(f"Fusion : {dest} ({len(allrows)} lignes)")


def decouper(f, col, outdir):
    head, rows = load(f, None)
    if col not in head:
        sys.exit(f"Colonne « {col} » absente")
    k = head.index(col)
    groups = defaultdict(list)
    for r in rows:
        groups[str(r[k]).strip() if k < len(r) and r[k] is not None else "(vide)"].append(r)
    outdir.mkdir(parents=True, exist_ok=True)
    for v, rs in groups.items():
        name = BAD.sub("_", v)[:60] or "vide"
        with open(outdir / f"{f.stem}_{name}.csv", "w", newline="", encoding="utf-8-sig") as fo:
            w = csv.writer(fo, delimiter=";")
            w.writerow(head)
            w.writerows(rs)
    print(f"{len(groups)} fichier(s) dans {outdir} ; total {sum(map(len, groups.values()))} = {len(rows)} lignes ✔")


def encodage(f: Path, convert):
    raw = f.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            txt = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    bad = txt.count("Ã©") + txt.count("Ã¨") + txt.count("â€")
    print(f"Encodage détecté : {enc}" + (f" — {bad} caractère(s) « mojibake » (Ã©…) : double encodage probable" if bad else ""))
    if bad:
        try:
            txt = txt.encode("cp1252").decode("utf-8")
            print("  → réparé (cp1252 → utf-8)")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    if convert:
        dest = f.with_name(f.stem + "_utf8" + f.suffix)
        dest.write_text(txt, encoding="utf-8-sig", newline="")
        print("Copie UTF-8 :", dest)


def main():
    ap = argparse.ArgumentParser(description="Boîte à outils fichiers")
    ap.add_argument("action", choices=["doublons", "taille", "inventaire", "renommer", "annuler", "comparer",
                                       "fusionner", "decouper", "encodage"])
    ap.add_argument("chemins", nargs="+", type=Path)
    ap.add_argument("--min-ko", type=int, default=1)
    ap.add_argument("--top", type=int, default=20)
    ap.add_argument("--sortie", type=Path)
    ap.add_argument("--motif")
    ap.add_argument("--par", default="")
    ap.add_argument("--appliquer", action="store_true")
    ap.add_argument("--cle")
    ap.add_argument("--dossier", type=Path)
    ap.add_argument("--convertir", action="store_true")
    a = ap.parse_args()
    for p in a.chemins:
        if not p.exists():
            sys.exit(f"Introuvable : {p}")
    p = a.chemins[0]
    if a.action == "doublons":
        doublons(p, a.min_ko)
    elif a.action == "taille":
        taille(p, a.top)
    elif a.action == "inventaire":
        inventaire(p, a.sortie or Path("inventaire.csv"))
    elif a.action == "renommer":
        if not a.motif:
            sys.exit("--motif requis")
        renommer(p, a.motif, a.par, a.appliquer)
    elif a.action == "annuler":
        annuler(p)
    elif a.action == "comparer":
        if len(a.chemins) < 2 or not a.cle:
            sys.exit("comparer ancien nouveau --cle <colonne>")
        comparer(a.chemins[0], a.chemins[1], a.cle, a.sortie)
    elif a.action == "fusionner":
        fusionner(a.chemins, a.sortie or Path("fusion.csv"))
    elif a.action == "decouper":
        if not a.cle:
            sys.exit("decouper fichier --cle <colonne> --dossier <sortie>")
        decouper(p, a.cle, a.dossier or Path("decoupe"))
    else:
        encodage(p, a.convertir)


if __name__ == "__main__":
    main()
