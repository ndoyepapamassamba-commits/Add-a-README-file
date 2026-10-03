#!/usr/bin/env python3
"""Contrôle qualité d'un fichier Excel/CSV avant reporting (lecture seule, rien ne sort de la machine).

    py qualite.py portefeuille.xlsx [--feuille Feuil1] [--cle "Compte"] [--montant "Encours"]
                                    [--total-attendu 1234567890] [--html rapport_qualite.html]

Contrôles : lignes/colonnes, cellules vides par colonne, doublons (lignes entières et clé), types incohérents,
dates invalides ou futures, montants négatifs / nuls / aberrants (méthode IQR), total de contrôle comparé à
un total attendu (rapprochement), colonnes constantes. Code de sortie 1 s'il y a une anomalie bloquante.
Les valeurs individuelles ne sont jamais affichées (seulement des numéros de ligne et des comptes).
"""
import argparse
import csv
import datetime as dt
import html
import statistics
import sys
from collections import Counter
from pathlib import Path


def load(path: Path, sheet: str | None):
    if path.suffix.lower() in (".xlsx", ".xlsm"):
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb[sheet] if sheet else wb.worksheets[0]
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
    else:
        raw = path.read_text("utf-8-sig", errors="ignore")
        d = csv.Sniffer().sniff(raw.splitlines()[0], delimiters=",;\t")
        rows = list(csv.reader(raw.splitlines(), d))
    rows = [r for r in rows if any(v not in (None, "") for v in r)]
    head = [str(h).strip() if h is not None else f"col{i + 1}" for i, h in enumerate(rows[0])]
    return head, rows[1:]


def num(v):
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.replace("\u202f", "").replace(" ", "").replace(",", ".")
        try:
            return float(s)
        except ValueError:
            return None
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fichier", type=Path)
    ap.add_argument("--feuille")
    ap.add_argument("--cle", help="colonne qui doit être unique (ex. numéro de compte)")
    ap.add_argument("--montant", help="colonne montant pour total et aberrations")
    ap.add_argument("--total-attendu", type=float)
    ap.add_argument("--html", type=Path)
    a = ap.parse_args()
    head, rows = load(a.fichier, a.feuille)
    out, blocking = [], 0

    def add(level, msg):
        nonlocal blocking
        out.append((level, msg))
        blocking += level == "BLOQUANT"

    add("INFO", f"{len(rows)} lignes, {len(head)} colonnes")
    dup = [k for k, c in Counter(tuple(r) for r in rows).items() if c > 1]
    if dup:
        add("BLOQUANT", f"{sum(Counter(tuple(r) for r in rows)[d] - 1 for d in dup)} ligne(s) entièrement en double")
    for j, h in enumerate(head):
        col = [r[j] if j < len(r) else None for r in rows]
        empty = sum(v in (None, "") for v in col)
        if empty:
            add("ALERTE" if empty < len(rows) else "INFO", f"« {h} » : {empty} cellule(s) vide(s) ({empty * 100 // max(1, len(rows))} %)")
        vals = [v for v in col if v not in (None, "")]
        if vals and len(set(map(str, vals))) == 1 and len(rows) > 5:
            add("INFO", f"« {h} » : valeur constante")
        kinds = Counter("nombre" if num(v) is not None else "date" if isinstance(v, (dt.date, dt.datetime))
                        else "texte" for v in vals)
        if len(kinds) > 1 and min(kinds.values()) / len(vals) < 0.2:
            minority = min(kinds, key=kinds.get)
            lines = [i + 2 for i, v in enumerate(col) if v not in (None, "") and
                     ("nombre" if num(v) is not None else "date" if isinstance(v, (dt.date, dt.datetime)) else "texte") == minority]
            add("ALERTE", f"« {h} » : {kinds[minority]} valeur(s) de type {minority} au milieu de {max(kinds, key=kinds.get)}s (lignes {lines[:10]})")
        dates = [(i + 2, v) for i, v in enumerate(col) if isinstance(v, (dt.date, dt.datetime))]
        fut = [i for i, v in dates if (v.date() if isinstance(v, dt.datetime) else v) > dt.date.today() + dt.timedelta(days=3650)]
        old = [i for i, v in dates if v.year < 1950]
        if fut or old:
            add("ALERTE", f"« {h} » : dates improbables lignes {(fut + old)[:10]}")
    if a.cle and a.cle in head:
        j = head.index(a.cle)
        c = Counter(r[j] for r in rows if j < len(r) and r[j] not in (None, ""))
        d = sum(n - 1 for n in c.values() if n > 1)
        if d:
            add("BLOQUANT", f"clé « {a.cle} » : {d} doublon(s)")
    if a.montant and a.montant in head:
        j = head.index(a.montant)
        m = [(i + 2, num(r[j])) for i, r in enumerate(rows) if j < len(r)]
        bad = [i for i, v in m if v is None]
        vals = [v for _, v in m if v is not None]
        if bad:
            add("ALERTE", f"« {a.montant} » : {len(bad)} valeur(s) non numérique(s) (lignes {bad[:10]})")
        neg = [i for i, v in m if v is not None and v < 0]
        if neg:
            add("ALERTE", f"« {a.montant} » : {len(neg)} montant(s) négatif(s) (lignes {neg[:10]})")
        total = sum(vals)
        add("INFO", f"total « {a.montant} » = {total:,.2f}".replace(",", " "))
        if len(vals) >= 8:
            q = statistics.quantiles(vals, n=4)
            iqr = q[2] - q[0]
            hi = [i for i, v in m if v is not None and v > q[2] + 3 * iqr]
            if hi:
                add("ALERTE", f"« {a.montant} » : {len(hi)} valeur(s) très au-dessus de la normale (lignes {hi[:10]})")
        if a.total_attendu is not None:
            ecart = total - a.total_attendu
            add("BLOQUANT" if abs(ecart) > 0.5 else "INFO",
                f"rapprochement : écart {ecart:,.2f} avec le total attendu".replace(",", " "))
    for lvl, msg in out:
        print(f"[{lvl}] {msg}")
    print("\nFichier exploitable." if not blocking else f"\n{blocking} anomalie(s) bloquante(s) : corriger avant le reporting.")
    if a.html:
        color = {"BLOQUANT": "#b00020", "ALERTE": "#c77700", "INFO": "#1a5fb4"}
        items = "".join(f'<li style="color:{color[l]}"><b>{l}</b> {html.escape(m)}</li>' for l, m in out)
        a.html.write_text(f'<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" '
                          f'content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Qualité</title>'
                          f'<body style="font:15px sans-serif;max-width:860px;margin:24px auto">'
                          f'<div style="background:#7a0010;color:#fff;padding:4px;text-align:center">CONFIDENTIEL – USAGE INTERNE</div>'
                          f'<h2>Contrôle qualité : {html.escape(a.fichier.name)}</h2><ul>{items}</ul>'
                          f'<p>Généré le {dt.datetime.now():%d/%m/%Y %H:%M}</p></body>', "utf-8")
    sys.exit(1 if blocking else 0)


if __name__ == "__main__":
    main()
