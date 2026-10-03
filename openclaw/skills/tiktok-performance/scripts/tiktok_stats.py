#!/usr/bin/env python3
"""Analyse des performances TikTok à partir de l'export CSV/XLSX de TikTok Studio (ou d'un tableau tenu à la main).

    py tiktok_stats.py export.csv [--kits ..\\..\\..\\afrikatoon-auto\\state\\history.json] [--json stats.json]

Colonnes reconnues (noms français ou anglais) : titre/title, date, vues/views, likes/j'aime, commentaires/comments,
partages/shares, enregistrements/saves, durée moyenne regardée/average watch time, durée/duration,
spectateurs ayant regardé en entier/watched full video (%), abonnés gagnés/followers gained.
Produit : classement, taux d'engagement, rétention, ce qui marche (personnages, thèmes, longueur, heure),
et écrit un résumé JSON réutilisable par le skill afrikatoon-video (state/stats.json).
"""
import argparse
import csv
import json
import re
import statistics
import sys
from pathlib import Path

ALIASES = {
    "titre": ["titre", "title", "video title", "description"],
    "date": ["date", "post time", "publié le", "create time"],
    "vues": ["vues", "views", "video views", "lectures"],
    "likes": ["likes", "j'aime", "jaime"],
    "comms": ["commentaires", "comments"],
    "partages": ["partages", "shares"],
    "saves": ["enregistrements", "saves", "favoris"],
    "watch": ["durée moyenne regardée", "average watch time", "temps de visionnage moyen"],
    "duree": ["durée", "duration", "video duration"],
    "full": ["regardé en entier", "watched full video", "completion rate"],
    "abos": ["abonnés gagnés", "followers gained", "new followers"],
}


def load(p: Path):
    if p.suffix.lower() == ".xlsx":
        import openpyxl
        rows = [list(r) for r in openpyxl.load_workbook(p, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True)]
    else:
        raw = p.read_text("utf-8-sig", errors="ignore")
        rows = list(csv.reader(raw.splitlines(), csv.Sniffer().sniff(raw.splitlines()[0], delimiters=",;\t")))
    head = [str(h or "").strip().lower() for h in rows[0]]
    idx = {}
    for key, names in ALIASES.items():
        for n in names:
            hit = next((i for i, h in enumerate(head) if n in h), None)
            if hit is not None:
                idx[key] = hit
                break
    out = []
    for r in rows[1:]:
        d = {}
        for k, i in idx.items():
            v = r[i] if i < len(r) else None
            if k not in ("titre", "date"):
                s = str(v or "").replace("%", "").replace("\u202f", "").replace(" ", "").replace(",", ".")
                m = re.match(r"^([\d.]+)([kKmM]?)$", s)
                v = float(m.group(1)) * {"": 1, "k": 1e3, "m": 1e6}[m.group(2).lower()] if m else None
            d[k] = v
        if d.get("vues"):
            out.append(d)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("export", type=Path)
    ap.add_argument("--kits", type=Path, help="state/history.json d'Afrikatoon pour relier vidéos et thèmes")
    ap.add_argument("--json", type=Path)
    a = ap.parse_args()
    vids = load(a.export)
    if not vids:
        sys.exit("Aucune ligne exploitable (colonne vues introuvable ?).")
    for v in vids:
        inter = sum(v.get(k) or 0 for k in ("likes", "comms", "partages", "saves"))
        v["engagement"] = inter / v["vues"] * 100
        v["partage_pour_1000"] = (v.get("partages") or 0) / v["vues"] * 1000
    vids.sort(key=lambda v: v["vues"], reverse=True)
    med = statistics.median(v["vues"] for v in vids)
    print(f"{len(vids)} vidéos — vues médianes {med:,.0f}".replace(",", " "))
    print("\nTop 5 :")
    for v in vids[:5]:
        print(f"  {v['vues']:>10,.0f} vues | engagement {v['engagement']:4.1f} % | partages/1000 {v['partage_pour_1000']:4.1f}"
              f" | {str(v.get('titre') or '')[:60]}".replace(",", " "))
    print("\nFlop 3 :")
    for v in vids[-3:]:
        print(f"  {v['vues']:>10,.0f} vues | {str(v.get('titre') or '')[:60]}".replace(",", " "))
    words = {}
    for v in vids:
        for w in set(re.findall(r"[A-Za-zÀ-ÿ']{4,}", str(v.get("titre") or "").lower())):
            words.setdefault(w, []).append(v["vues"])
    strong = sorted(((statistics.median(x) / med, w, len(x)) for w, x in words.items() if len(x) >= 2), reverse=True)[:8]
    if strong:
        print("\nMots/thèmes associés aux meilleures vidéos (× médiane) :")
        for r, w, n in strong:
            print(f"  {w:<18} ×{r:4.1f}  ({n} vidéos)")
    if any(v.get("full") for v in vids):
        fr = [v["full"] for v in vids if v.get("full")]
        print(f"\nRegardées en entier : médiane {statistics.median(fr):.1f} % (objectif > 15 % pour la percée)")
    summary = {"videos": len(vids), "vues_mediane": med,
               "top": [{"titre": v.get("titre"), "vues": v["vues"], "engagement": round(v["engagement"], 2)} for v in vids[:10]],
               "themes_forts": [w for _, w, _ in strong]}
    if a.json:
        a.json.write_text(json.dumps(summary, ensure_ascii=False, indent=2), "utf-8")
        print(f"\nRésumé écrit : {a.json}")


if __name__ == "__main__":
    main()
