#!/usr/bin/env python3
"""JEV — moteur de jugement probabiliste et d'évolution du risque.

Question traitée : quelle est la probabilité qu'une contrepartie, un segment ou le
portefeuille entre en dégradation sur les prochains horizons, pourquoi cette probabilité
évolue-t-elle, et quelles actions peuvent la réduire ?

Chaîne : OBSERVÉ → DÉTECTÉ → PROBABILITÉ → TRAJECTOIRE → SCÉNARIO → ACTION
Niveaux : CONTREPARTIE · SEGMENT · PORTEFEUILLE · SCÉNARIO / STRESS

Règle critique : aucune probabilité sans provenance. Chaque chiffre porte un objet
Provenance (OBSERVED, EMPIRICAL, MARKOV, MODELLED, EXPERT, STRESS, SIMULATED, HYBRID) avec
N, nombre de périodes, date de calibration, horizon, confiance, qualité et méthode. Quand
l'historique ne permet pas une calibration robuste, l'avertissement est affiché, jamais masqué.

Partage des rôles
  - Le code calcule toutes les probabilités (comptages, matrices de Markov, cohortes,
    simulations). Les classes réglementaires (BCEAO, IFRS9, ACTE7) restent dans le code.
  - TypeSafe (modèle jev-latest) ne fournit que des jugements (motif, crédibilité,
    incohérence, nature de l'entité…) lus dans la couche Impayés. Ils entrent dans JEV
    comme signaux d'alerte (étape DÉTECTÉ) via des multiplicateurs EXPERT documentés.

Usage
  python3 impayes_typesafe.py --demo --depuis-cache   # couche TypeSafe des Impayés
  python3 jev.py                                       # moteur JEV + classeur
"""

import json
import math
import random
from dataclasses import dataclass, asdict, field
from datetime import date
from pathlib import Path

import impayes_typesafe as imp

ICI = Path(__file__).resolve().parent
SORTIE = ICI / "sortie"

ETATS = ["Sain", "31-60j", "61-90j", "Douteux"]
D = 3                                  # état absorbant : douteux (> 90 jours, BCEAO)
HORIZONS = [3, 6, 12]

# Seuils de qualité : une calibration robuste de PD demande au moins un cycle (60 mois)
# et des effectifs suffisants. En dessous, l'estimation est indicative.
MOIS_ROBUSTE = 60
MOIS_MINIMUM = 24
N_MIN_LIGNE = 30                       # transitions par ligne de matrice avant rétrécissement
AVERTISSEMENT = "Estimation indicative — historique insuffisant pour une calibration statistique robuste."


# --------------------------------------------------------------------------- #
# Provenance : obligatoire pour toute probabilité affichée.
# --------------------------------------------------------------------------- #

@dataclass
class Provenance:
    source: str                 # OBSERVED | EMPIRICAL | MARKOV | MODELLED | EXPERT | STRESS | SIMULATED | HYBRID
    methode: str
    n: int
    periodes: int
    calibration: str
    horizon: int
    confiance: str = ""
    qualite: str = ""
    avertissement: str = ""
    composantes: list = field(default_factory=list)

    def __post_init__(self):
        self.confiance, self.qualite, self.avertissement = evaluer_qualite(self)

    def etiquette(self):
        return (f"{self.source} · {self.methode} · N = {self.n:,} · Historique = {self.periodes} mois · "
                f"Confiance = {self.confiance}".replace(",", " "))


def evaluer_qualite(p):
    if p.source == "OBSERVED":
        return "élevée", "Constat", ""
    if p.source == "EXPERT":
        return "faible", "Jugement non calibré", "Paramètre d'expert, non estimé sur données."
    if p.source == "STRESS":
        return "faible", "Hypothèse de scénario", "Scénario hypothétique : ce n'est pas une prévision."
    if p.periodes < MOIS_MINIMUM or p.n < 100:
        conf, q = "faible", "Insuffisante"
    elif p.periodes < MOIS_ROBUSTE or p.n < 1000:
        conf, q = "moyenne", "Partielle"
    else:
        conf, q = "élevée", "Robuste"
    if p.source == "HYBRID" and conf == "élevée":
        conf = "moyenne"           # une surcouche experte plafonne la confiance
    return conf, q, (AVERTISSEMENT if p.periodes < MOIS_ROBUSTE else "")


@dataclass
class Proba:
    valeur: float
    prov: Provenance
    ic_bas: float = None
    ic_haut: float = None


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    c = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    d = 1 + z * z / n
    return (max(0, (p + z * z / (2 * n) - c) / d), min(1, (p + z * z / (2 * n) + c) / d))


# --------------------------------------------------------------------------- #
# Historique : arrêtés mensuels (démo synthétique, remplacée par l'archive APEX arList/arGet).
# --------------------------------------------------------------------------- #

SEGMENTS = ["Consumer", "Commercial", "Corporate", "Public Sector"]
# Matrices génératrices de la démo (inconnues du moteur, qui ne voit que les arrêtés).
_VRAIES = {
    "Consumer":      [[.965, .025, .006, .004], [.40, .35, .17, .08], [.18, .14, .33, .35], [0, 0, 0, 1]],
    "Commercial":    [[.972, .018, .006, .004], [.38, .37, .16, .09], [.16, .14, .32, .38], [0, 0, 0, 1]],
    "Corporate":     [[.985, .010, .003, .002], [.45, .35, .13, .07], [.20, .15, .35, .30], [0, 0, 0, 1]],
    "Public Sector": [[.980, .015, .004, .001], [.50, .35, .10, .05], [.30, .20, .30, .20], [0, 0, 0, 1]],
}
_EFFECTIFS = {"Consumer": 2600, "Commercial": 1100, "Corporate": 420, "Public Sector": 161}


def historique_demo(arrete, mois=18, graine=7):
    """Liste d'arrêtés : [{date, lignes: {id: (segment, etat, encours)}}], anonymisés."""
    rnd = random.Random(graine)
    pop, k = {}, 0
    for seg, n in _EFFECTIFS.items():
        for _ in range(n):
            k += 1
            enc = int(rnd.lognormvariate(16.5 if seg != "Consumer" else 14.5, 1.1))
            pop[f"C{k:05d}"] = [seg, rnd.choices(range(4), [.9, .05, .03, .02])[0], enc]
    arretes = []
    for m in range(mois):
        a = arrete.month - (mois - 1 - m)
        y = arrete.year + (a - 1) // 12
        d = imp.fin_de_mois(y, (a - 1) % 12 + 1)
        arretes.append({"date": d, "lignes": {i: tuple(v) for i, v in pop.items()}})
        for v in pop.values():
            v[1] = rnd.choices(range(4), _VRAIES[v[0]][v[1]])[0]
    return arretes


# --------------------------------------------------------------------------- #
# Calibration : matrices de Markov et cohortes empiriques.
# --------------------------------------------------------------------------- #

def compter(arretes, filtre=lambda seg: True):
    c = [[0] * 4 for _ in range(4)]
    for a, b in zip(arretes, arretes[1:]):
        for i, (seg, e, _) in a["lignes"].items():
            if filtre(seg) and i in b["lignes"]:
                c[e][b["lignes"][i][1]] += 1
    return c


def normaliser(c, repli=None, n_min=N_MIN_LIGNE):
    """MLE ligne à ligne ; une ligne trop mince est rétrécie vers la matrice portefeuille."""
    P, retrecies = [], []
    for e, ligne in enumerate(c):
        n = sum(ligne)
        if e == D:
            P.append([0, 0, 0, 1.0])
            continue
        mle = [x / n for x in ligne] if n else (repli[e] if repli else [1 if j == e else 0 for j in range(4)])
        if repli and n < n_min:
            w = n / n_min
            mle = [w * a + (1 - w) * b for a, b in zip(mle, repli[e])]
            retrecies.append(ETATS[e])
        P.append(mle)
    return P, retrecies


def mult(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def puissance(P, h):
    R = [[float(i == j) for j in range(4)] for i in range(4)]
    for _ in range(h):
        R = mult(R, P)
    return R


def cohortes(arretes, h, filtre=lambda seg: True, etat0=0):
    """PD empirique : part des contreparties dans l'état etat0 à t, douteuses à t+h."""
    k = n = 0
    nb = 0
    for t in range(len(arretes) - h):
        a, b = arretes[t]["lignes"], arretes[t + h]["lignes"]
        nb += 1
        for i, (seg, e, _) in a.items():
            if e == etat0 and filtre(seg) and i in b:
                n += 1
                k += b[i][1] == D
    return k, n, nb


class Moteur:
    def __init__(self, arretes):
        self.arretes = arretes
        self.periodes = len(arretes)
        self.calib = arretes[-1]["date"].isoformat()
        cp = compter(arretes)
        self.P_ptf, _ = normaliser(cp)
        self.n_ptf = sum(map(sum, cp[:3]))
        self.P, self.n, self.retrecies = {}, {}, {}
        for s in SEGMENTS:
            c = compter(arretes, lambda g, s=s: g == s)
            self.P[s], self.retrecies[s] = normaliser(c, self.P_ptf)
            self.n[s] = sum(map(sum, c[:3]))

    # ---- PROBABILITÉ ----
    def pd_markov(self, seg, etat, h):
        P = self.P[seg] if seg in self.P else self.P_ptf
        n = self.n.get(seg, self.n_ptf)
        meth = f"Markov mensuel {seg} (MLE sur {self.periodes - 1} transitions)"
        if self.retrecies.get(seg):
            meth += f", lignes {', '.join(self.retrecies[seg])} rétrécies vers le portefeuille"
        return Proba(puissance(P, h)[etat][D],
                     Provenance("MARKOV", meth, n, self.periodes, self.calib, h))

    def pd_empirique(self, seg, h, etat0=0):
        f = (lambda g: True) if seg is None else (lambda g: g == seg)
        k, n, nb = cohortes(self.arretes, h, f, etat0)
        lo, hi = wilson(k, n)
        return Proba(k / n if n else 0, Provenance(
            "EMPIRICAL", f"Cohortes {ETATS[etat0]} → Douteux à {h} mois ({nb} cohortes, IC Wilson 95 %)",
            n, self.periodes, self.calib, h), lo, hi)


# --------------------------------------------------------------------------- #
# DÉTECTÉ : signaux d'alerte (EWS). Multiplicateurs EXPERT, non calibrés, appliqués
# sur les cotes (odds) pour rester dans [0, 1].
# --------------------------------------------------------------------------- #

EWS = {
    "fraude":            (2.50, lambda r: r["motif"] == "Fraude / détournement"),
    "injoignable":       (2.00, lambda r: r["motif"] == "Client injoignable"),
    "perte_revenus":     (1.60, lambda r: r["motif"] == "Perte de revenus"),
    "litige":            (1.40, lambda r: r["motif"] == "Litige juridique"),
    "promesse_tardive":  (1.30, lambda r: r["position"] == "Après la bascule"),
    "incoherence":       (1.30, lambda r: (r["p_incoherence"] or 0) >= imp.SEUIL_SIGNAL),
    "sans_retour":       (1.20, lambda r: not r["commentaire"]),
    "credibilite_bonne": (0.75, lambda r: (r["credibilite"] or 0) >= 3 and r["position"] == "Avant la bascule"),
    "retard_technique":  (0.70, lambda r: r["motif"] == "Retard technique"),
}
LIB_EWS = {
    "fraude": "Signal de fraude (TypeSafe)", "injoignable": "Client injoignable (TypeSafe)",
    "perte_revenus": "Perte durable de revenus (TypeSafe)", "litige": "Litige juridique (TypeSafe)",
    "promesse_tardive": "Promesse après la bascule (code)", "incoherence": "Commentaire incohérent (TypeSafe)",
    "sans_retour": "Aucun retour gestionnaire (code)", "credibilite_bonne": "Promesse crédible avant bascule (TypeSafe + code)",
    "retard_technique": "Incident technique (TypeSafe)",
}


def ajuster(p, mult):
    if p >= 1:
        return 1.0
    o = p / (1 - p) * mult
    return o / (1 + o)


def etat_de(jours):
    return 0 if jours <= 30 else 1 if jours <= 60 else 2 if jours <= 90 else 3


# --------------------------------------------------------------------------- #
# Niveau 1 — CONTREPARTIE : OBSERVÉ → DÉTECTÉ → PROBABILITÉ → TRAJECTOIRE → SCÉNARIO → ACTION
# --------------------------------------------------------------------------- #

def contrepartie(m, r, stress):
    seg = r["segment"] if r["segment"] in m.P else "Commercial"
    e = etat_de(r["jours"])
    e_prec = etat_de(max(0, r["jours"] - 30))
    signaux = [k for k, (_, f) in EWS.items() if f(r)]
    mult = math.prod(EWS[k][0] for k in signaux) if signaux else 1.0
    out = {"ref": r["ref"], "client": r["client"], "segment": r["segment"], "jours": r["jours"],
           "impaye": r["impaye"], "encours": r["encours"], "etat": ETATS[e], "signaux": signaux,
           "mult": mult, "motif": r["motif"], "statut": r["statut_retenu"], "revue": r["revue"]}
    pd = {}
    for h in HORIZONS:
        base = m.pd_markov(seg, e, h)
        v = ajuster(base.valeur, mult)
        prov = Provenance("HYBRID" if signaux else "MARKOV",
                          "Markov + EWS + expert" if signaux else base.prov.methode,
                          base.prov.n, m.periodes, m.calib, h,
                          composantes=[base.prov.etiquette()] + [f"EXPERT ×{EWS[k][0]:.2f} {LIB_EWS[k]}" for k in signaux])
        pd[h] = Proba(v, prov)
        out[f"base_{h}"] = base.valeur
    out["pd"] = pd
    # POURQUOI ÇA ÉVOLUE : décomposition de la PD 12M (état d'il y a un mois → état actuel → signaux).
    p_prec = m.pd_markov(seg, e_prec, 12).valeur
    out["pourquoi"] = [("PD 12M à l'état du mois précédent (" + ETATS[e_prec] + ")", p_prec),
                       ("Effet migration " + ETATS[e_prec] + " → " + ETATS[e], out["base_12"] - p_prec)]
    cur = out["base_12"]
    for k in signaux:
        nv = ajuster(cur, EWS[k][0])
        out["pourquoi"].append((LIB_EWS[k], nv - cur))
        cur = nv
    # TRAJECTOIRE : distribution des états à 1..12 mois (Markov + EWS sur la sortie en douteux).
    out["trajectoire"] = [ajuster(m.pd_markov(seg, e, h).valeur, mult) for h in range(1, 13)]
    # SCÉNARIO : même contrepartie sous matrice stressée.
    out["pd_stress"] = {n: ajuster(puissance(P[seg], 12)[e][D], mult) for n, P in stress.items()}
    # ACTION : effet calculé (code) de chaque levier sur la PD 12M.
    actions = []
    if e >= 1:
        p_reg = ajuster(m.pd_markov(seg, 0, 12).valeur, mult)
        actions.append(("Régularisation complète des impayés (retour en Sain)", p_reg))
        if e == 2:
            actions.append(("Règlement partiel ramenant à 31-60 jours", ajuster(m.pd_markov(seg, 1, 12).valeur, mult)))
    if signaux:
        gardes = [k for k in signaux if EWS[k][0] < 1]
        actions.append(("Lever les signaux d'alerte (visite, preuve de fonds, mise à jour du dossier)",
                        ajuster(out["base_12"], math.prod(EWS[k][0] for k in gardes) if gardes else 1)))
    out["actions"] = [(a, p, p - pd[12].valeur) for a, p in actions]
    return out


# --------------------------------------------------------------------------- #
# Niveau 4 — SCÉNARIO / STRESS et simulation.
# --------------------------------------------------------------------------- #

SCENARIOS = {"Central": 1.0, "Modéré (×1,5 dégradations)": 1.5, "Sévère (×2,0 dégradations)": 2.0}


def stresser(P, f):
    Q = []
    for e, ligne in enumerate(P):
        if e == D:
            Q.append(ligne[:])
            continue
        deg = [x * f if j > e else x for j, x in enumerate(ligne)]
        exces = sum(deg) - 1
        reste = sum(x for j, x in enumerate(ligne) if j <= e) or 1
        Q.append([x - exces * x / reste if j <= e else x for j, x in enumerate(deg)])
    return Q


def simuler(m, P_par_seg, h=12, tirages=2000, graine=11):
    """Monte Carlo des entrées en douteux (montants) sur le portefeuille du dernier arrêté."""
    rnd = random.Random(graine)
    lignes = [(s, e, enc) for s, e, enc in m.arretes[-1]["lignes"].values() if e != D]
    pd = {(s, e): puissance(P_par_seg[s], h)[e][D] for s in SEGMENTS for e in range(3)}
    tot = []
    for _ in range(tirages):
        tot.append(sum(enc for s, e, enc in lignes if rnd.random() < pd[(s, e)]))
    tot.sort()
    q = lambda a: tot[int(a * (len(tot) - 1))]
    return {"moyenne": sum(tot) / len(tot), "p50": q(.5), "p95": q(.95), "p99": q(.99), "tirages": tirages}


# --------------------------------------------------------------------------- #
# Classeur JEV (charte BLUE ECOBANK, navigation commune).
# --------------------------------------------------------------------------- #

FEUILLES_JEV = ["JEV Synthèse", "JEV Contreparties", "JEV Segments", "JEV Portefeuille",
                "JEV Scénarios", "JEV Matrices", "JEV Provenance"]


def pct(x):
    return f"{100 * x:.1f} %".replace(".", ",")


def ecrire(m, cps, segs, ptf, scen, sims, arrete, chemin):
    C = imp.Classeur(chemin, FEUILLES_JEV)
    wb, f = C.wb, C.f
    fp = wb.add_format({**{"font_name": "Segoe UI", "font_size": 9, "border": 1, "border_color": imp.LIGNE},
                        "num_format": "0.0%", "align": "center", "valign": "vcenter"})
    C.f["pd"] = fp
    warn = wb.add_format({"font_name": "Segoe UI", "font_size": 9, "bold": True, "font_color": imp.OCRE,
                          "bg_color": "#FBEFD9", "text_wrap": True, "valign": "vcenter", "left": 5, "left_color": imp.OCRE})
    prov_f = wb.add_format({"font_name": "Consolas", "font_size": 8, "font_color": "#3E5C6B", "italic": True,
                            "text_wrap": True, "valign": "vcenter"})

    def bandeau_limite(ws, ligne, largeur, prov):
        ws.set_row(ligne, 30)
        txt = "⚠ " + (prov.avertissement or "Calibration jugée suffisante.") + \
              f"  Provenance : {prov.etiquette()} · calibration au {prov.calibration}."
        ws.merge_range(ligne, 0, ligne, largeur - 1, txt, warn)

    # ---------- Synthèse ----------
    ws = wb.add_worksheet("JEV Synthèse")
    L = 12
    ws.set_column(0, L - 1, 13.5)
    C.entete(ws, "JEV Synthèse", "JEV · MOTEUR DE JUGEMENT PROBABILISTE ET D'ÉVOLUTION DU RISQUE",
             f"Arrêté du {arrete:%d/%m/%Y} · OBSERVÉ → DÉTECTÉ → PROBABILITÉ → TRAJECTOIRE → SCÉNARIO → ACTION · "
             "données de démonstration anonymisées", L)
    p12 = ptf["pd12"]
    bandeau_limite(ws, 5, L, p12.prov)
    tuiles = [("PD 12M portefeuille (sains)", pct(p12.valeur)), ("Empirique 12M (cohortes)", pct(ptf["emp12"].valeur)),
              ("Dossiers 30-90j suivis", len(cps)), ("Avec signaux EWS", sum(bool(c["signaux"]) for c in cps)),
              ("Entrées douteux 12M (M XOF)", f"{sims['Central']['moyenne'] / 1e6:,.0f}".replace(",", " ")),
              ("P95 sévère (M XOF)", f"{sims['Sévère (×2,0 dégradations)']['p95'] / 1e6:,.0f}".replace(",", " "))]
    ws.set_row(7, 26)
    ws.set_row(8, 30)
    for i, (l, v) in enumerate(tuiles):
        ws.merge_range(7, 2 * i, 7, 2 * i + 1, l.upper(), f["tile_l"])
        ws.merge_range(8, 2 * i, 8, 2 * i + 1, v, f["tile_v"])
    ws.set_row(9, 24)
    for i, h in enumerate(["PD 12M", p12.prov.source + " · " + p12.prov.methode[:40], f"N = {p12.prov.n:,}".replace(",", " "),
                           f"Historique = {p12.prov.periodes} mois", f"Confiance = {p12.prov.confiance}",
                           f"Qualité = {p12.prov.qualite}"]):
        ws.merge_range(9, 2 * i, 9, 2 * i + 1, h, prov_f)

    wd = wb.add_worksheet("_jev")
    wd.hide()
    wd.write_row(0, 0, ["Horizon", "Central", "Modéré", "Sévère", "Segment", "Markov 12M", "Empirique 12M"])
    for h in range(1, 13):
        wd.write_row(h, 0, [f"{h} m"] + [ptf["traj"][n][h - 1] for n in SCENARIOS])
    for i, s in enumerate(segs, 1):
        wd.write_row(i, 4, [s["segment"], s["markov12"].valeur, s["emp12"].valeur])
    top = sorted(cps, key=lambda c: -c["pd"][12].valeur)[:10]
    wd.write_row(0, 8, ["Client", "Base Markov", "Surcouche EWS"])
    for i, c in enumerate(top, 1):
        wd.write_row(i, 8, [c["client"][:28], c["base_12"], c["pd"][12].valeur - c["base_12"]])

    W, H = 600, 300
    ch = wb.add_chart({"type": "line"})
    for j, (n, col) in enumerate(zip(SCENARIOS, [imp.BLEU, imp.OCRE, imp.ROUGE]), 1):
        ch.add_series({"name": ["_jev", 0, j], "categories": ["_jev", 1, 0, 12, 0], "values": ["_jev", 1, j, 12, j],
                       "line": {"color": col, "width": 2.25}, "marker": {"type": "circle", "size": 4,
                       "fill": {"color": col}, "border": {"color": col}}})
    imp.style_graphique(ch, "Trajectoire PD cumulée — sains (STRESS)")
    ch.set_legend({"position": "bottom", "font": {"size": 8}})
    ch.set_y_axis({"num_format": "0%", "major_gridlines": {"visible": True, "line": {"color": imp.FOND}}})
    ch.set_size({"width": W, "height": H})
    ws.insert_chart(11, 0, ch, {"x_offset": 6, "y_offset": 6})

    ch = wb.add_chart({"type": "column"})
    for j, col in ((5, imp.BLEU), (6, imp.LIME)):
        ch.add_series({"name": ["_jev", 0, j], "categories": ["_jev", 1, 4, len(segs), 4],
                       "values": ["_jev", 1, j, len(segs), j], "fill": {"color": col}, "gap": 80,
                       "data_labels": {"value": True, "num_format": "0.0%", "font": {"size": 8}}})
    imp.style_graphique(ch, "PD 12M par segment : Markov vs empirique")
    ch.set_legend({"position": "bottom", "font": {"size": 8}})
    ch.set_y_axis({"num_format": "0%", "major_gridlines": {"visible": True, "line": {"color": imp.FOND}}})
    ch.set_size({"width": W, "height": H})
    ws.insert_chart(11, 6, ch, {"x_offset": 6, "y_offset": 6})

    ch = wb.add_chart({"type": "bar", "subtype": "stacked"})
    for j, col in ((9, imp.CLAIR), (10, imp.ROUGE)):
        ch.add_series({"name": ["_jev", 0, j], "categories": ["_jev", 1, 8, len(top), 8],
                       "values": ["_jev", 1, j, len(top), j], "fill": {"color": col}, "gap": 50})
    imp.style_graphique(ch, "Top 10 PD 12M : base Markov + surcouche EWS")
    ch.set_legend({"position": "bottom", "font": {"size": 8}})
    ch.set_y_axis({"reverse": True, "num_font": {"size": 8}})
    ch.set_x_axis({"num_format": "0%", "major_gridlines": {"visible": True, "line": {"color": imp.FOND}}})
    ch.set_size({"width": 2 * W, "height": 340})
    ws.insert_chart(27, 0, ch, {"x_offset": 6, "y_offset": 6})

    lect = [
        f"PD 12M d'une contrepartie saine : {pct(p12.valeur)} (Markov) contre {pct(ptf['emp12'].valeur)} observé sur "
        f"cohortes (IC 95 % {pct(ptf['emp12'].ic_bas)} – {pct(ptf['emp12'].ic_haut)}).",
        f"Historique de {m.periodes} mois : {AVERTISSEMENT if m.periodes < MOIS_ROBUSTE else 'calibration robuste.'}",
        f"{sum(bool(c['signaux']) for c in cps)} dossiers 30-90j portent des signaux EWS issus de la lecture TypeSafe : "
        "leur PD est HYBRID (Markov + EWS + expert) et les multiplicateurs sont des paramètres d'expert, non calibrés.",
        f"Scénario sévère : entrées en douteux à 12 mois de {sims['Sévère (×2,0 dégradations)']['moyenne'] / 1e6:,.0f} M XOF "
        f"en moyenne (P95 {sims['Sévère (×2,0 dégradations)']['p95'] / 1e6:,.0f} M XOF, SIMULATED).".replace(",", " "),
    ]
    ws.merge_range(46, 0, 46, L - 1, "Lecture", f["h2"])
    for i, t in enumerate(lect):
        ws.set_row(47 + i, 28)
        ws.merge_range(47 + i, 0, 47 + i, L - 1, "• " + t, f["p"])

    # ---------- Contreparties ----------
    ws = wb.add_worksheet("JEV Contreparties")
    rows = []
    for c in sorted(cps, key=lambda c: -c["pd"][12].valeur):
        meill = min(c["actions"], key=lambda a: a[2]) if c["actions"] else ("—", None, None)
        rows.append({**c, "pd3": c["pd"][3].valeur, "pd6": c["pd"][6].valeur, "pd12": c["pd"][12].valeur,
                     "src": c["pd"][12].prov.source, "conf": c["pd"][12].prov.confiance,
                     "prov": " | ".join(c["pd"][12].prov.composantes),
                     "sig": ", ".join(LIB_EWS[k] for k in c["signaux"]) or "—",
                     "sev": c["pd_stress"]["Sévère (×2,0 dégradations)"],
                     "act": meill[0], "act_pd": meill[1], "rev": " ; ".join(c["revue"]) or ""})
    cols = [("Réf LD", 11, "ref", "cell"), ("Client", 26, "client", "wrap"), ("Segment", 11, "segment", "cell"),
            ("Jours", 7, "jours", "int"), ("État observé", 9, "etat", "cell"), ("Motif (TypeSafe)", 16, "motif", "cell"),
            ("Signaux détectés (EWS)", 30, "sig", "wrap"), ("Base Markov 12M", 9, "base_12", "pd"),
            ("PD 3M", 8, "pd3", "pd"), ("PD 6M", 8, "pd6", "pd"), ("PD 12M", 8, "pd12", "pd"),
            ("Prove-nance", 9, "src", "cell"), ("Confiance", 9, "conf", "cell"),
            ("PD 12M sévère", 9, "sev", "pd"), ("Meilleure action", 30, "act", "wrap"),
            ("PD 12M après action", 10, "act_pd", "pd"), ("Revue analyste", 22, "rev", "wrap"),
            ("Détail de provenance", 60, "prov", "wrap")]
    C.entete(ws, "JEV Contreparties", "JEV · NIVEAU 1 — CONTREPARTIES (IMPAYÉS 30-90J)",
             "PD par horizon avec provenance ; signaux issus de la couche TypeSafe ; action dont l'effet est calculé par le code.",
             len(cols))
    fin = C.tableau(ws, 5, cols, rows, "JevCp")
    ws.conditional_format(6, 10, fin, 10, {"type": "data_bar", "bar_color": imp.ROUGE, "bar_solid": True,
                                           "min_type": "num", "min_value": 0, "max_type": "num", "max_value": 1})
    ws.conditional_format(6, 11, fin, 11, {"type": "cell", "criteria": "==", "value": '"HYBRID"', "format": f["ocre"]})

    # Décomposition « pourquoi » et trajectoire par contrepartie.
    ws = wb.add_worksheet("JEV Portefeuille")
    L = 12
    ws.set_column(0, 0, 34)
    ws.set_column(1, L - 1, 11)
    C.entete(ws, "JEV Portefeuille", "JEV · NIVEAU 3 — PORTEFEUILLE ET TRAJECTOIRES",
             "Distribution des états projetée (MARKOV) ; décomposition de la PD de chaque dossier (pourquoi elle évolue).", L)
    bandeau_limite(ws, 5, L, ptf["pd12"].prov)
    ws.write_row(7, 0, ["Projection des encours sains (part par état)"] + [f"{h} m" for h in range(1, 12)], f["hdr"])
    for e in range(4):
        ws.write(8 + e, 0, ETATS[e], f["cell"])
        for h in range(1, 12):
            ws.write(8 + e, h, puissance(m.P_ptf, h)[0][e], fp)
    r0 = 14
    ws.merge_range(r0, 0, r0, L - 1, "Pourquoi la PD 12M évolue — décomposition par dossier (code)", f["h2"])
    ws.write_row(r0 + 1, 0, ["Dossier / composante", "Contribution", "PD 12M finale"], f["hdr"])
    i = r0 + 2
    for c in sorted(cps, key=lambda c: -c["pd"][12].valeur):
        ws.write(i, 0, f"{c['ref']} · {c['client'][:30]}", f["h2"])
        ws.write(i, 2, c["pd"][12].valeur, fp)
        i += 1
        for lib, v in c["pourquoi"]:
            ws.write(i, 0, "   " + lib, f["cell"])
            ws.write(i, 1, v, fp)
            i += 1

    # ---------- Segments ----------
    ws = wb.add_worksheet("JEV Segments")
    rows = [{"segment": s["segment"], "n": s["markov12"].prov.n, "m3": s["m3"], "m6": s["m6"],
             "m12": s["markov12"].valeur, "e12": s["emp12"].valeur, "lo": s["emp12"].ic_bas, "hi": s["emp12"].ic_haut,
             "ne": s["emp12"].prov.n, "conf": s["markov12"].prov.confiance, "q": s["markov12"].prov.qualite,
             "ret": ", ".join(m.retrecies[s["segment"]]) or "—", "av": s["markov12"].prov.avertissement}
            for s in segs]
    cols = [("Segment", 14, "segment", "cell"), ("N transitions", 11, "n", "num"),
            ("PD 3M Markov", 9, "m3", "pd"), ("PD 6M Markov", 9, "m6", "pd"), ("PD 12M Markov", 9, "m12", "pd"),
            ("PD 12M empirique", 10, "e12", "pd"), ("IC 95 % bas", 9, "lo", "pd"), ("IC 95 % haut", 9, "hi", "pd"),
            ("N cohortes", 10, "ne", "num"), ("Confiance", 10, "conf", "cell"), ("Qualité", 11, "q", "cell"),
            ("Lignes rétrécies", 14, "ret", "cell"), ("Avertissement", 50, "av", "wrap")]
    C.entete(ws, "JEV Segments", "JEV · NIVEAU 2 — SEGMENTS",
             "Deux estimateurs indépendants (MARKOV et EMPIRICAL) affichés côte à côte ; l'écart mesure l'incertitude de modèle.",
             len(cols))
    C.tableau(ws, 5, cols, rows, "JevSeg")

    # ---------- Scénarios ----------
    ws = wb.add_worksheet("JEV Scénarios")
    rows = [{"sc": n, "f": fct, "pd": ptf["traj"][n][11], "moy": sims[n]["moyenne"], "p50": sims[n]["p50"],
             "p95": sims[n]["p95"], "p99": sims[n]["p99"], "src": "MARKOV" if fct == 1 else "STRESS",
             "sim": f"SIMULATED · Monte Carlo {sims[n]['tirages']} tirages · N = {len(m.arretes[-1]['lignes'])} lignes"}
            for n, fct in SCENARIOS.items()]
    cols = [("Scénario", 26, "sc", "cell"), ("Facteur (EXPERT)", 10, "f", "int"), ("PD 12M sains", 10, "pd", "pd"),
            ("Prove-nance PD", 10, "src", "cell"), ("Entrées douteux 12M moy. (XOF)", 18, "moy", "num"),
            ("P50 (XOF)", 16, "p50", "num"), ("P95 (XOF)", 16, "p95", "num"), ("P99 (XOF)", 16, "p99", "num"),
            ("Provenance montants", 50, "sim", "wrap")]
    C.entete(ws, "JEV Scénarios", "JEV · NIVEAU 4 — SCÉNARIOS ET STRESS",
             "Les facteurs de stress multiplient les probabilités de dégradation : hypothèses d'expert, pas des prévisions.",
             len(cols))
    C.tableau(ws, 5, cols, rows, "JevSc")

    # ---------- Matrices ----------
    ws = wb.add_worksheet("JEV Matrices")
    ws.set_column(0, 0, 18)
    ws.set_column(1, 6, 11)
    C.entete(ws, "JEV Matrices", "JEV · MATRICES DE TRANSITION MENSUELLES CALIBRÉES",
             f"MLE sur {m.periodes - 1} transitions mensuelles ; calibration au {m.calib}.", 7)
    i = 5
    for nom, P, n in [("Portefeuille", m.P_ptf, m.n_ptf)] + [(s, m.P[s], m.n[s]) for s in SEGMENTS]:
        ws.merge_range(i, 0, i, 6, f"{nom} · MARKOV · N = {n:,} transitions".replace(",", " "), f["h2"])
        ws.write_row(i + 1, 0, ["De \\ Vers"] + ETATS, f["hdr"])
        for e in range(4):
            ws.write(i + 2 + e, 0, ETATS[e], f["cell"])
            for j in range(4):
                ws.write(i + 2 + e, 1 + j, P[e][j], fp)
        ws.conditional_format(i + 2, 1, i + 5, 4, {"type": "2_color_scale", "min_color": "#FFFFFF", "max_color": "#9CC9DD"})
        i += 8

    # ---------- Provenance ----------
    ws = wb.add_worksheet("JEV Provenance")
    ws.set_column(0, 0, 14)
    ws.set_column(1, 1, 100)
    C.entete(ws, "JEV Provenance", "JEV · PROVENANCE, LIMITES ET MÉTHODE",
             "Aucune probabilité n'est affichée sans sa provenance ; aucune limitation n'est masquée.", 2)
    defs = [
        ("OBSERVED", "Constat sur l'arrêté : état, jours d'impayés, montants."),
        ("EMPIRICAL", "Fréquence observée sur cohortes historiques, avec intervalle de Wilson à 95 %."),
        ("MARKOV", "Matrice de transition mensuelle estimée (MLE) et élevée à la puissance de l'horizon."),
        ("MODELLED", "Modèle statistique ajusté (score, régression). Non utilisé ici : historique insuffisant."),
        ("EXPERT", "Paramètre fixé à dire d'expert (multiplicateurs EWS, facteurs de stress) : non calibré."),
        ("STRESS", "Probabilité sous matrice stressée : hypothèse de scénario, pas une prévision."),
        ("SIMULATED", "Distribution obtenue par Monte Carlo à partir des probabilités MARKOV/STRESS."),
        ("HYBRID", "Combinaison : Markov + EWS (signaux TypeSafe et code) + multiplicateurs d'expert. Confiance plafonnée."),
        ("Qualité", f"Robuste : ≥ {MOIS_ROBUSTE} mois et N ≥ 1 000 · Partielle : ≥ {MOIS_MINIMUM} mois · "
                    f"Insuffisante en dessous. Sous {MOIS_ROBUSTE} mois : « {AVERTISSEMENT} »"),
        ("TypeSafe", "Les jugements (motif, crédibilité, incohérence, promesse) viennent de jev-latest via la couche "
                     "Impayés ; ils ne produisent aucun chiffre. Le code les convertit en signaux EWS."),
        ("Réglementaire", "Classes BCEAO, stages IFRS9 et moteur ACTE7 restent dans le code d'APEX : JEV ne les "
                          "modifie pas, il projette leur évolution."),
        ("Données", "Démonstration : historique synthétique anonymisé de 18 mois (4 281 contreparties). En production : "
                    "archive des arrêtés APEX (arList/arGet)."),
    ]
    ws.write_row(5, 0, ["Code", "Signification"], f["hdr"])
    for i, (k, v) in enumerate(defs, 6):
        ws.set_row(i, 15 * (len(v) // 110 + 1) + 6)
        ws.write(i, 0, k, f["cell"])
        ws.write(i, 1, v, f["wrap"])
    i += 2
    ws.write_row(i, 0, ["Objet", "Provenance complète"], f["hdr"])
    for nom, p in [("PD 12M ptf", ptf["pd12"]), ("Empirique 12M", ptf["emp12"])] + \
                  [(s["segment"], s["markov12"]) for s in segs]:
        i += 1
        txt = json.dumps({k: v for k, v in asdict(p.prov).items() if k != "composantes"}, ensure_ascii=False)
        ws.set_row(i, 30)
        ws.write(i, 0, nom, f["cell"])
        ws.write(i, 1, txt, f["wrap"])
    wb.worksheets()[0].activate()
    C.close()


def main():
    arrete = date(2026, 9, 29)
    res_path = SORTIE / "impayes_resultats.json"
    if not res_path.exists():
        raise SystemExit("Lancer d'abord : python3 impayes_typesafe.py --demo")
    impayes = json.loads(res_path.read_text())
    arretes = historique_demo(arrete)
    m = Moteur(arretes)

    stress = {n: {s: stresser(m.P[s], fct) for s in SEGMENTS} for n, fct in SCENARIOS.items()}
    cps = [contrepartie(m, r, stress) for r in impayes]
    segs = []
    for s in SEGMENTS:
        segs.append({"segment": s, "m3": m.pd_markov(s, 0, 3).valeur, "m6": m.pd_markov(s, 0, 6).valeur,
                     "markov12": m.pd_markov(s, 0, 12), "emp12": m.pd_empirique(s, 12)})
    P_stress_ptf = {n: stresser(m.P_ptf, f) for n, f in SCENARIOS.items()}
    ptf = {"pd12": Proba(puissance(m.P_ptf, 12)[0][D],
                         Provenance("MARKOV", "Markov mensuel portefeuille", m.n_ptf, m.periodes, m.calib, 12)),
           "emp12": m.pd_empirique(None, 12),
           "traj": {n: [puissance(P, h)[0][D] for h in range(1, 13)] for n, P in P_stress_ptf.items()}}
    sims = {n: simuler(m, stress[n]) for n in SCENARIOS}

    out = SORTIE / "JEV_Risque_Prospectif_demo.xlsx"
    ecrire(m, cps, segs, ptf, SCENARIOS, sims, arrete, out)
    (SORTIE / "jev_resultats.json").write_text(json.dumps({
        "portefeuille": {"pd12": asdict(ptf["pd12"]), "empirique12": asdict(ptf["emp12"])},
        "segments": [{"segment": s["segment"], "markov12": asdict(s["markov12"]), "empirique12": asdict(s["emp12"])} for s in segs],
        "contreparties": [{"ref": c["ref"], "pd": {h: asdict(p) for h, p in c["pd"].items()}, "signaux": c["signaux"],
                           "actions": c["actions"]} for c in cps],
        "scenarios": sims}, ensure_ascii=False, indent=1, default=str))

    p = ptf["pd12"]
    print(f"PD 12M : {pct(p.valeur)}\n{p.prov.etiquette()}\n{p.prov.avertissement}")
    print(f"Empirique 12M : {pct(ptf['emp12'].valeur)} [{pct(ptf['emp12'].ic_bas)} ; {pct(ptf['emp12'].ic_haut)}] "
          f"N = {ptf['emp12'].prov.n}")
    for c in sorted(cps, key=lambda c: -c["pd"][12].valeur)[:5]:
        print(f"{c['ref']} {c['client'][:30]:30} PD12 {pct(c['pd'][12].valeur):>7} {c['pd'][12].prov.source}")
    print(f"→ {out}")


if __name__ == "__main__":
    main()
