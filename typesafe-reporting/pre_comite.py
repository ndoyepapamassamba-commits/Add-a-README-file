#!/usr/bin/env python3
"""Pré-Comité des Risques : analyse des commentaires gestionnaires avec TypeSafe.

Chaîne de traitement
  1. Règles déterministes (code)   : classe réglementaire et stage IFRS9 selon les
                                     jours d'impayés, taux de couverture par la garantie.
  2. Jugements TypeSafe (Jev)      : une requête par dossier, 8 questions en parallèle
                                     sur le commentaire libre du gestionnaire.
  3. Politique de risque (code)    : score d'alerte pondéré, propositions d'action,
                                     renvoi en revue analyste si la confiance est faible.
  4. Restitution                   : JSON + rapport HTML autonome pour le Comité.

Les réponses brutes sont mises en cache : changer les poids ou les seuils ne
relance pas l'inférence (option --depuis-cache).

Usage
  python3 pre_comite.py                      # appelle l'API puis produit le rapport
  python3 pre_comite.py --depuis-cache       # recalcule à partir des réponses en cache
  python3 pre_comite.py --csv mon_fichier.csv
"""

import argparse
import csv
import html
import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

API_URL = "https://api.typesafe.ai/v1/systemone"
MODELE = "jev-latest"
ICI = Path(__file__).resolve().parent

# --------------------------------------------------------------------------- #
# 1. Règles déterministes : elles restent dans le code, jamais dans le modèle.
#    Seuils simplifiés pour la démonstration ; à aligner sur le référentiel interne.
# --------------------------------------------------------------------------- #

def classe_reglementaire(jours):
    if jours > 90:
        return "douteux"
    if jours > 30:
        return "sensible"
    return "sain"


def stage_ifrs9(jours):
    if jours > 90:
        return 3
    if jours > 30:
        return 2
    return 1


# --------------------------------------------------------------------------- #
# 2. Questions TypeSafe : un jugement étroit par question.
# --------------------------------------------------------------------------- #

QUESTIONS = {
    "motif": {
        "type": "choice",
        "instructions": "Quelle est la cause principale de la dégradation ou du retard décrite dans `dossier.commentaire_gestionnaire` ?",
        "criteria": {
            "retard_technique": "Problème ponctuel de virement, de domiciliation, de prélèvement ou de délai administratif ; la capacité de remboursement n'est pas en cause",
            "tension_tresorerie": "Décalage de trésorerie temporaire, client payeur en retard, sans perte durable de revenus",
            "perte_revenus": "Perte durable de revenus : perte d'un client ou d'un contrat majeur, baisse d'activité, perte d'emploi, flux qui ne reviennent plus",
            "litige_juridique": "Litige fiscal, judiciaire ou commercial, saisie ou blocage de comptes",
            "sante_deces": "Maladie, hospitalisation ou décès de l'emprunteur ou d'un dirigeant clé",
            "fraude_detournement": "Suspicion de fraude, détournement de fonds, faux documents ou objet du financement inexistant",
            "client_disparu": "Client injoignable ou parti, sans information sur sa situation",
            "aucune_difficulte": "Le commentaire ne décrit aucune difficulté : dossier sain, régularisé ou en hausse",
        },
    },
    "perspective": {
        "type": "score",
        "instructions": "D'après `dossier.commentaire_gestionnaire`, quelles sont les perspectives de remboursement intégral du crédit sans réalisation de la garantie ?",
        "criteria": [
            "Quasi nulles : client disparu, fraude ou activité arrêtée",
            "Faibles : difficulté durable sans solution identifiée",
            "Incertaines : difficulté réelle, issue dépendant d'un événement non daté",
            "Bonnes : difficulté temporaire avec une solution crédible ou datée",
            "Très bonnes : aucune difficulté ou incident purement technique déjà résolu",
        ],
    },
    "promesse_datee": {
        "type": "noul",
        "instructions": "Le commentaire mentionne-t-il une régularisation attendue à une date ou dans un délai précis (cette semaine, le 15, fin du mois…) ?",
        "criteria": {
            "true": "Une date ou un délai précis de régularisation est cité",
            "false": "Aucune date : promesse vague ou absente",
        },
    },
    "restructuration": {
        "type": "noul",
        "instructions": "Le commentaire indique-t-il qu'une restructuration, un rééchelonnement ou un allongement de durée a été demandé ou accordé ?",
    },
    "rupture_flux": {
        "type": "noul",
        "instructions": "Le commentaire révèle-t-il que les revenus ou les flux d'exploitation qui remboursent normalement le crédit ont disparu ou ne transitent plus, même si les échéances sont encore payées ?",
        "criteria": {
            "true": "Les flux ou revenus d'origine ont disparu ou sont remplacés par des apports ponctuels",
            "false": "Les flux habituels sont présents ou le commentaire n'en dit rien de négatif",
        },
    },
    "signal_fraude": {
        "type": "noul",
        "instructions": "Le commentaire contient-il un signal de fraude, de détournement de fonds ou de faux documents ?",
    },
    "garantie_fragile": {
        "type": "noul",
        "instructions": "Le commentaire laisse-t-il penser que la garantie est fragile : non revue depuis longtemps, difficile à réaliser, de valeur volatile (stock) ou contestée ?",
        "criteria": {
            "true": "Le commentaire signale une faiblesse de la garantie",
            "false": "Garantie solide, récemment évaluée, ou non évoquée",
        },
    },
    "incoherence": {
        "type": "noul",
        "instructions": {
            "question": "Le commentaire contredit-il les données chiffrées du dossier ? Par exemple il dit « régularisé » ou « aucun impayé » alors que `dossier.jours_impayes` est supérieur à 0.",
            "rappel": "`dossier.jours_impayes` est le nombre de jours d'impayés observé dans le système à la date d'arrêté ; c'est la source de vérité.",
        },
        "criteria": {
            "true": "Le texte affirme une situation incompatible avec les chiffres",
            "false": "Le texte est compatible avec les chiffres",
        },
    },
}


def evaluer(dossier, essais=5):
    """Une requête TypeSafe par dossier ; toutes les questions partent ensemble."""
    corps = json.dumps({
        "model": MODELE,
        "state": {"dossier": {
            "segment": dossier["segment"],
            "encours_fcfa": dossier["encours_fcfa"],
            "garantie_fcfa": dossier["garantie_fcfa"],
            "jours_impayes": dossier["jours_impayes"],
            "commentaire_gestionnaire": dossier["commentaire_gestionnaire"],
        }},
        "questions": QUESTIONS,
    }).encode()
    entetes = {"Content-Type": "application/json"}
    if os.environ.get("TYPESAFE_API_KEY"):
        entetes["Authorization"] = f"Bearer {os.environ['TYPESAFE_API_KEY']}"
    for essai in range(essais):
        try:
            req = urllib.request.Request(API_URL, data=corps, headers=entetes)
            with urllib.request.urlopen(req, timeout=60) as rep:
                return json.load(rep)["answers"]
        except urllib.error.HTTPError as e:
            if e.code in (429, 529) and essai < essais - 1:
                time.sleep(2 ** essai)
                continue
            raise RuntimeError(f"{dossier['id_dossier']} : HTTP {e.code} {e.read()[:300]!r}")


# --------------------------------------------------------------------------- #
# 3. Politique de risque : poids et seuils explicites, modifiables sans réinférence.
# --------------------------------------------------------------------------- #

POIDS = {
    "perspective_faible": 0.35,
    "signal_fraude": 0.20,
    "rupture_flux": 0.15,
    "restructuration": 0.10,
    "garantie_fragile": 0.10,
    "incoherence": 0.10,
}
SEUIL_SIGNAL = 0.6          # probabilité au-delà de laquelle un signal est retenu
SEUIL_CONFIANCE_MOTIF = 0.5
SEUIL_CONFIANCE_PERSPECTIVE = 0.4

ORDRE_CLASSES = {"sain": 0, "sensible": 1, "douteux": 2}


def analyser(dossier, rep):
    n = lambda q: rep[q]["noul"]
    perspective = rep["perspective"]["score"]           # 0 (nulle) à 4 (très bonne)
    signaux = {
        "perspective_faible": (4 - perspective) / 4,
        "signal_fraude": n("signal_fraude"),
        "rupture_flux": n("rupture_flux"),
        "restructuration": n("restructuration"),
        "garantie_fragile": n("garantie_fragile"),
        "incoherence": n("incoherence"),
    }
    alerte = round(100 * sum(POIDS[k] * v for k, v in signaux.items()))

    jours = dossier["jours_impayes"]
    classe_regle = classe_reglementaire(jours)
    stage = stage_ifrs9(jours)
    couverture = dossier["garantie_fcfa"] / dossier["encours_fcfa"] if dossier["encours_fcfa"] else 0

    actions, revue = [], []
    if n("signal_fraude") >= SEUIL_SIGNAL:
        actions.append("Transfert contentieux + saisine Conformité")
    if ORDRE_CLASSES[dossier["classe_declaree"]] < ORDRE_CLASSES[classe_regle]:
        actions.append(f"Écart de classe : déclarée « {dossier['classe_declaree']} », règle « {classe_regle} »")
    sicr_qualitatif = (n("restructuration") >= SEUIL_SIGNAL or n("rupture_flux") >= SEUIL_SIGNAL
                       or perspective <= 1.5)
    if stage == 1 and sicr_qualitatif:
        stage = 2
        actions.append("SICR qualitatif : passer en Stage 2 et mettre sous surveillance")
    if n("garantie_fragile") >= SEUIL_SIGNAL and stage >= 2:
        actions.append("Faire réévaluer la garantie")
    if n("incoherence") >= SEUIL_SIGNAL:
        actions.append("Commentaire incohérent avec les impayés : demander une mise à jour")
    if jours > 0 and n("promesse_datee") >= SEUIL_SIGNAL and perspective >= 2.5 and not actions:
        actions.append("Suivre la promesse de régularisation à la date annoncée")
    if not actions:
        actions.append("Maintien en l'état")

    if rep["motif"]["confidence"] < SEUIL_CONFIANCE_MOTIF:
        revue.append(f"motif incertain ({rep['motif']['confidence']:.2f})")
    if rep["perspective"]["confidence"] < SEUIL_CONFIANCE_PERSPECTIVE:
        revue.append(f"perspective incertaine ({rep['perspective']['confidence']:.2f})")

    return {
        **dossier,
        "classe_regle": classe_regle,
        "stage_ifrs9": stage,
        "couverture": round(couverture, 2),
        "motif": rep["motif"]["choice"],
        "confiance_motif": rep["motif"]["confidence"],
        "perspective": round(perspective, 2),
        "signaux": {k: round(v, 2) for k, v in signaux.items()} | {"promesse_datee": n("promesse_datee")},
        "alerte": alerte,
        "actions": actions,
        "revue_analyste": revue,
    }


# --------------------------------------------------------------------------- #
# 4. Restitution HTML autonome (aucune dépendance, ouvrable hors ligne).
# --------------------------------------------------------------------------- #

LIBELLES_MOTIF = {
    "retard_technique": "Retard technique", "tension_tresorerie": "Tension de trésorerie",
    "perte_revenus": "Perte de revenus", "litige_juridique": "Litige juridique",
    "sante_deces": "Santé / décès", "fraude_detournement": "Fraude / détournement",
    "client_disparu": "Client disparu", "aucune_difficulte": "Aucune difficulté",
}
LIBELLES_SIGNAUX = {
    "rupture_flux": "Rupture de flux", "restructuration": "Restructuration",
    "signal_fraude": "Fraude", "garantie_fragile": "Garantie fragile",
    "incoherence": "Incohérence", "promesse_datee": "Promesse datée",
}


def fcfa(x):
    return f"{x / 1e6:,.0f} M".replace(",", " ")


def rapport_html(resultats, image_3d=None):
    e = html.escape
    total = sum(r["encours_fcfa"] for r in resultats)
    en_alerte = [r for r in resultats if r["alerte"] >= 40]
    reclasses = [r for r in resultats if r["stage_ifrs9"] > stage_ifrs9(r["jours_impayes"])]
    a_revoir = [r for r in resultats if r["revue_analyste"]]

    motifs = {}
    for r in resultats:
        motifs[r["motif"]] = motifs.get(r["motif"], 0) + r["encours_fcfa"]
    barres = "".join(
        f'<div class="barre"><span>{e(LIBELLES_MOTIF[m])}</span>'
        f'<div class="piste"><div style="width:{100 * v / total:.1f}%"></div></div>'
        f'<b>{fcfa(v)}</b></div>'
        for m, v in sorted(motifs.items(), key=lambda kv: -kv[1]))

    lignes = []
    for r in resultats:
        niveau = "haut" if r["alerte"] >= 60 else "moyen" if r["alerte"] >= 40 else "bas"
        puces = "".join(f'<span class="puce">{e(LIBELLES_SIGNAUX[k])} {v:.0%}</span>'
                        for k, v in r["signaux"].items() if k in LIBELLES_SIGNAUX and v >= SEUIL_SIGNAL)
        revue = "".join(f'<div class="revue">⚑ Revue analyste : {e(x)}</div>' for x in r["revue_analyste"])
        lignes.append(f"""
<tr>
  <td><b>{e(r['id_dossier'])}</b><br><small>{e(r['segment'])}</small></td>
  <td class="num">{fcfa(r['encours_fcfa'])}<br><small>couv. {r['couverture']:.0%}</small></td>
  <td class="num">{r['jours_impayes']} j</td>
  <td>{e(r['classe_declaree'])} → <b>{e(r['classe_regle'])}</b><br><small>Stage {r['stage_ifrs9']}</small></td>
  <td>{e(LIBELLES_MOTIF[r['motif']])}<br><small>conf. {r['confiance_motif']:.2f}</small></td>
  <td class="num">{r['perspective']:.1f} / 4</td>
  <td><span class="alerte {niveau}">{r['alerte']}</span></td>
  <td>{puces}<ul>{''.join(f'<li>{e(a)}</li>' for a in r['actions'])}</ul>{revue}
      <details><summary>Commentaire</summary>{e(r['commentaire_gestionnaire'])}</details></td>
</tr>""")

    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pré-Comité des Risques</title>
<style>
:root {{ --bleu:#003A70; --bleu2:#00A3E0; --fond:#F4F7FB; --texte:#1B2733; --gris:#5B6B7B; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font-family:Segoe UI,Arial,sans-serif; background:var(--fond); color:var(--texte); }}
header {{ background:linear-gradient(120deg,var(--bleu),#005BAA); color:#fff; padding:24px 32px; }}
header h1 {{ margin:0; font-size:24px; }} header p {{ margin:4px 0 0; opacity:.85; }}
main {{ padding:24px 32px; max-width:1400px; margin:auto; }}
.kpis {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; }}
.kpi {{ background:#fff; border-radius:10px; padding:16px; border-top:4px solid var(--bleu2); box-shadow:0 1px 3px #0001; }}
.kpi b {{ font-size:26px; color:var(--bleu); display:block; }} .kpi span {{ color:var(--gris); font-size:13px; }}
section {{ background:#fff; border-radius:10px; padding:20px; margin-top:20px; box-shadow:0 1px 3px #0001; overflow-x:auto; }}
h2 {{ margin:0 0 12px; font-size:17px; color:var(--bleu); }}
.barre {{ display:grid; grid-template-columns:180px 1fr 90px; gap:10px; align-items:center; margin:6px 0; font-size:14px; }}
.piste {{ background:#E6EDF5; border-radius:4px; height:12px; }} .piste div {{ background:var(--bleu2); height:100%; border-radius:4px; }}
.barre b {{ text-align:right; }}
table {{ border-collapse:collapse; width:100%; font-size:13.5px; }}
th {{ text-align:left; background:var(--bleu); color:#fff; padding:8px; position:sticky; top:0; }}
td {{ padding:8px; border-bottom:1px solid #E3E9F0; vertical-align:top; }}
td.num {{ text-align:right; white-space:nowrap; }} small {{ color:var(--gris); }}
ul {{ margin:4px 0; padding-left:18px; }}
.alerte {{ display:inline-block; min-width:40px; text-align:center; padding:4px 8px; border-radius:6px; font-weight:700; color:#fff; }}
.haut {{ background:#C62828; }} .moyen {{ background:#EF8F00; }} .bas {{ background:#2E7D32; }}
.puce {{ display:inline-block; background:#E8F4FB; color:var(--bleu); border-radius:10px; padding:1px 8px; margin:1px 2px; font-size:12px; }}
.revue {{ color:#8A4B00; font-size:12.5px; margin-top:4px; }}
details {{ margin-top:4px; color:var(--gris); }}
footer {{ color:var(--gris); font-size:12px; padding:0 32px 24px; max-width:1400px; margin:auto; }}
</style></head><body>
<header><h1>Pré-Comité des Risques — revue des commentaires gestionnaires</h1>
<p>Arrêté du {date.today():%d/%m/%Y} · {len(resultats)} dossiers · jugements TypeSafe ({MODELE})</p></header>
<main>
<div class="kpis">
  <div class="kpi"><b>{fcfa(total)}</b><span>Encours analysé (FCFA)</span></div>
  <div class="kpi"><b>{len(en_alerte)}</b><span>Dossiers en alerte (score ≥ 40) · {fcfa(sum(r['encours_fcfa'] for r in en_alerte))}</span></div>
  <div class="kpi"><b>{len(reclasses)}</b><span>Passages en Stage 2 par signal qualitatif (SICR)</span></div>
  <div class="kpi"><b>{len(a_revoir)}</b><span>Dossiers à confirmer par un analyste</span></div>
</div>
<section><h2>Encours par motif de difficulté</h2>{barres}</section>
{f'<section><h2>Vue 3D du portefeuille (Blender)</h2><img src="{image_3d}" alt="Colonnes par dossier : hauteur = score d’alerte, section = encours, rangées = Stage IFRS9" style="width:100%;border-radius:8px"><p><small>Hauteur = score d’alerte · section = encours · rangée = Stage IFRS9 · anneau doré = revue analyste</small></p></section>' if image_3d else ''}
<section><h2>Dossiers classés par score d'alerte</h2>
<table><thead><tr><th>Dossier</th><th>Encours</th><th>Impayés</th><th>Classe</th><th>Motif</th><th>Perspective</th><th>Alerte</th><th>Signaux et propositions</th></tr></thead>
<tbody>{''.join(lignes)}</tbody></table></section>
</main>
<footer>Classes et stages calculés par règles déterministes (seuils de démonstration). Motifs, perspectives et signaux issus de TypeSafe :
ce sont des aides à la décision à valider par le Comité. Pondérations : {e(json.dumps(POIDS))}.</footer>
</body></html>"""


# --------------------------------------------------------------------------- #

def charger(chemin):
    with open(chemin, encoding="utf-8") as f:
        lignes = list(csv.DictReader(f, delimiter=";"))
    for l in lignes:
        for k in ("encours_fcfa", "garantie_fcfa", "jours_impayes"):
            l[k] = int(l[k])
    return lignes


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--csv", default=ICI / "portefeuille_demo.csv")
    p.add_argument("--depuis-cache", action="store_true", help="réutiliser reponses_brutes.json")
    p.add_argument("--sortie", default=ICI / "sortie")
    args = p.parse_args()

    sortie = Path(args.sortie)
    sortie.mkdir(exist_ok=True)
    cache = sortie / "reponses_brutes.json"
    dossiers = charger(args.csv)

    if args.depuis_cache:
        brutes = json.loads(cache.read_text(encoding="utf-8"))
    else:
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=6) as pool:
            reponses = list(pool.map(evaluer, dossiers))
        brutes = {d["id_dossier"]: r for d, r in zip(dossiers, reponses)}
        cache.write_text(json.dumps(brutes, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{len(dossiers)} dossiers évalués en {time.time() - t0:.1f} s")

    resultats = sorted((analyser(d, brutes[d["id_dossier"]]) for d in dossiers),
                       key=lambda r: -r["alerte"])
    (sortie / "resultats.json").write_text(json.dumps(resultats, ensure_ascii=False, indent=2), encoding="utf-8")
    image_3d = "portefeuille_3d.png" if (sortie / "portefeuille_3d.png").exists() else None
    (sortie / "pre_comite.html").write_text(rapport_html(resultats, image_3d), encoding="utf-8")

    for r in resultats:
        print(f"{r['id_dossier']}  alerte {r['alerte']:>3}  {LIBELLES_MOTIF[r['motif']]:<22} "
              f"persp. {r['perspective']:.1f}  Stage {r['stage_ifrs9']}  → {' | '.join(r['actions'])}"
              + (f"  [REVUE: {', '.join(r['revue_analyste'])}]" if r["revue_analyste"] else ""))
    print(f"\nRapport : {sortie / 'pre_comite.html'}")


if __name__ == "__main__":
    main()
