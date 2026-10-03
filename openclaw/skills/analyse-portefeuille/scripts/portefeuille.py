#!/usr/bin/env python3
"""Indicateurs de risque d'un portefeuille de crédits, calculés en local (aucune donnée ne sort).

    py portefeuille.py arrete.xlsx --encours "Encours" [--retard "Jours de retard" | --classe "Classe"]
        [--client "Client"] [--secteur "Secteur"] [--provision "Provision"] [--cle "Compte"]
        [--douteux "Douteux,Compromis,Litigieux"] [--precedent arrete_mois_dernier.xlsx] [--json kpi.json] [--noms]

Calcule : encours total, ratio de créances en souffrance (NPL), taux de couverture par provisions,
concentration (top 10 / top 20, indice HHI par client et par secteur), ventilation par ancienneté de retard,
et, avec --precedent, la matrice de migration des classes entre deux arrêtés (même --cle).
Sans --noms, les clients sont désignés par leur rang (aucun nom affiché). Les seuils et la définition du
« douteux » sont des paramètres : à aligner sur les règles en vigueur (BCEAO / IFRS 9 / politique interne).
"""
import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "qualite-donnees" / "scripts"))
from qualite import load, num  # noqa: E402

BUCKETS = [(0, 0, "à jour"), (1, 30, "1-30 j"), (31, 90, "31-90 j"), (91, 180, "91-180 j"),
           (181, 360, "181-360 j"), (361, 10 ** 9, "> 360 j")]


def table(path: Path, a):
    head, rows = load(path, None)
    col = {h: i for i, h in enumerate(head)}
    for need in [a.encours] + [c for c in (a.retard, a.classe, a.client, a.secteur, a.provision, a.cle) if c]:
        if need not in col:
            sys.exit(f"Colonne introuvable : « {need} » (colonnes : {', '.join(head)})")
    out = []
    for r in rows:
        g = lambda c: (r[col[c]] if c and col[c] < len(r) else None)
        e = num(g(a.encours))
        if e is None:
            continue
        out.append({"encours": e, "retard": num(g(a.retard)) if a.retard else None,
                    "classe": str(g(a.classe) or "").strip() if a.classe else None,
                    "client": str(g(a.client) or "").strip() if a.client else None,
                    "secteur": str(g(a.secteur) or "Non renseigné").strip() if a.secteur else None,
                    "provision": num(g(a.provision)) or 0 if a.provision else 0,
                    "cle": str(g(a.cle)).strip() if a.cle else None})
    return out


def douteux(r, a, dset):
    if a.classe:
        return r["classe"].lower() in dset
    return (r["retard"] or 0) > a.seuil


def hhi(shares):
    return sum((s * 100) ** 2 for s in shares)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fichier", type=Path)
    ap.add_argument("--encours", required=True)
    ap.add_argument("--retard")
    ap.add_argument("--classe")
    ap.add_argument("--client")
    ap.add_argument("--secteur")
    ap.add_argument("--provision")
    ap.add_argument("--cle")
    ap.add_argument("--douteux", default="Douteux,Compromis,Litigieux,Douteux litigieux")
    ap.add_argument("--seuil", type=int, default=90, help="jours de retard au-delà desquels la créance est en souffrance")
    ap.add_argument("--precedent", type=Path)
    ap.add_argument("--json", type=Path)
    ap.add_argument("--noms", action="store_true")
    a = ap.parse_args()
    if not (a.retard or a.classe):
        sys.exit("Indiquez --retard ou --classe.")
    dset = {d.strip().lower() for d in a.douteux.split(",")}
    rows = table(a.fichier, a)
    tot = sum(r["encours"] for r in rows) or 1
    npl = sum(r["encours"] for r in rows if douteux(r, a, dset))
    prov = sum(r["provision"] for r in rows)
    k = {"lignes": len(rows), "encours_total": tot, "encours_en_souffrance": npl, "ratio_npl_pct": npl / tot * 100}
    if a.provision:
        k["provisions"] = prov
        k["couverture_npl_pct"] = prov / npl * 100 if npl else None
    print(f"Lignes : {len(rows)}   Encours total : {tot:,.0f}".replace(",", " "))
    print(f"En souffrance : {npl:,.0f}  →  ratio NPL {k['ratio_npl_pct']:.2f} %".replace(",", " "))
    if a.provision:
        print(f"Provisions : {prov:,.0f}  →  couverture {k['couverture_npl_pct'] or 0:.1f} %".replace(",", " "))
    if a.retard:
        print("\nAncienneté des retards :")
        k["anciennete"] = {}
        for lo, hi, lab in BUCKETS:
            s = sum(r["encours"] for r in rows if lo <= (r["retard"] or 0) <= hi)
            k["anciennete"][lab] = s
            print(f"  {lab:<10} {s:>18,.0f}  {s / tot * 100:5.1f} %".replace(",", " "))
    if a.client:
        by = Counter()
        for r in rows:
            by[r["client"]] += r["encours"]
        top = by.most_common(20)
        k["top10_pct"] = sum(v for _, v in top[:10]) / tot * 100
        k["top20_pct"] = sum(v for _, v in top) / tot * 100
        k["hhi_clients"] = hhi(v / tot for v in by.values())
        print(f"\nConcentration : top 10 = {k['top10_pct']:.1f} %, top 20 = {k['top20_pct']:.1f} %, "
              f"HHI clients = {k['hhi_clients']:.0f} (>1 500 : concentré, >2 500 : très concentré)")
        for i, (c, v) in enumerate(top[:5], 1):
            print(f"  n° {i} {(c if a.noms else '(client masqué)'):<24} {v / tot * 100:5.2f} %")
    if a.secteur:
        bs = Counter()
        for r in rows:
            bs[r["secteur"]] += r["encours"]
        k["hhi_secteurs"] = hhi(v / tot for v in bs.values())
        k["secteurs_pct"] = {s: v / tot * 100 for s, v in bs.most_common()}
        print(f"\nSecteurs (HHI {k['hhi_secteurs']:.0f}) :")
        for s, v in bs.most_common(8):
            print(f"  {s[:30]:<30} {v / tot * 100:5.1f} %")
    if a.precedent:
        if not a.cle:
            sys.exit("--precedent exige --cle (identifiant commun aux deux arrêtés).")
        prev = {r["cle"]: r for r in table(a.precedent, a)}
        lab = (lambda r: r["classe"]) if a.classe else (lambda r: next(l for lo, hi, l in BUCKETS if lo <= (r["retard"] or 0) <= hi))
        mig = defaultdict(lambda: defaultdict(float))
        for r in rows:
            p = prev.get(r["cle"])
            mig[lab(p) if p else "(nouveau)"][lab(r)] += r["encours"]
        sorties = [c for c in prev if c not in {r["cle"] for r in rows}]
        cols = sorted({c for d in mig.values() for c in d})
        print("\nMigration (encours actuel, ligne = classe précédente → colonne = classe actuelle) :")
        print(" " * 14 + "".join(f"{c[:12]:>14}" for c in cols))
        for src in sorted(mig):
            print(f"{src[:13]:<14}" + "".join(f"{mig[src].get(c, 0):>14,.0f}".replace(",", " ") for c in cols))
        print(f"Sortis du portefeuille depuis l'arrêté précédent : {len(sorties)}")
        k["migration"] = {s: dict(d) for s, d in mig.items()}
    if a.json:
        a.json.write_text(json.dumps(k, ensure_ascii=False, indent=2), "utf-8")
        print(f"\nIndicateurs écrits : {a.json}")


if __name__ == "__main__":
    main()
