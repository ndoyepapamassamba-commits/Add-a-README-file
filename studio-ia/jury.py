"""Jury d'humour avant tournage : les sketchs candidats sont classés À L'AVEUGLE avec la RÉFÉRENCE (1er sketch de la vidéo la
plus vue de la chaîne, 2,4 M de vues) mélangée parmi eux, anonymisée. Plusieurs tirages dans un ordre différent pour gommer
l'effet de position ; on garde ceux qui passent devant la référence. Juge : Gemini Flash (texte).
(Un duel « candidat contre référence » a été essayé d'abord : le juge donnait presque tout gagnant, il ne triait rien.)

  python3 jury.py candidats.json [tirages]     → rang moyen, nombre de tirages où le candidat bat la référence, et alerte
                                                 si la blague ou la situation a déjà été tournée
"""
import glob
import json
import random
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import or_api  # noqa: E402

MODELE = "google/gemini-3.8-flash"
REFERENCE = {"titre": "RÉFÉRENCE (2,4 M de vues)",
             "repliques": [["FILS", "Papa, qui m'a donné mon intelligence ?"],
                           ["PÈRE", "Ça doit être ta mère. Moi, j'ai encore la mienne."]]}
CLASSER = ("Tu es un juge de comédie très exigeant. Public : TikTok d'Abidjan (Côte d'Ivoire), sketchs animés courts. "
           "Voici {n} sketchs. Classe-les du PLUS drôle au MOINS drôle, en jugeant surtout la CHUTE : est-elle inattendue, "
           "féroce, est-ce qu'elle fait éclater de rire et donne envie de rejouer la vidéo ?\n\n{liste}\n\n"
           "Réponds UNIQUEMENT par la liste des numéros dans l'ordre, séparés par des virgules (ex. : S3, S1, S2).")
DOUBLONS = ("CATALOGUE des sketchs déjà tournés par la chaîne (id : dialogue) :\n{catalogue}\n\nNOUVEAUX candidats :\n{liste}\n\n"
            "Pour chaque candidat, dis s'il reprend un sketch du catalogue. MÊME_BLAGUE = même chute ou même mécanisme de "
            "chute, même reformulée. MÊME_SITUATION = même situation de départ (même question, même conflit) avec une autre "
            "chute. NOUVEAU = rien de proche. Réponds une ligne par candidat, au format exact : "
            "C1 : NOUVEAU   ou   C1 : MÊME_BLAGUE 004   ou   C1 : MÊME_SITUATION 122")


def demander(texte):
    corps = {"model": MODELE, "temperature": 0, "messages": [{"role": "user", "content": texte}]}
    r = requests.post(f"{or_api.API}/chat/completions", headers=or_api._entetes(), json=corps, timeout=180)
    r.raise_for_status()
    d = r.json()
    or_api.noter_depense("jury", MODELE, (d.get("usage") or {}).get("cost"), "jury")
    return d["choices"][0]["message"]["content"]


def deja_tournes():
    """Tous les dialogues déjà écrits (lots en cours et archives), pour repérer une blague déjà tournée."""
    for f in sorted(glob.glob(str(ICI / "sketchs" / "*.json")) + glob.glob(str(ICI / "sketchs" / "archives" / "*.json"))):
        if f.endswith("programme.json"):
            continue
        for s in json.load(open(f)):
            yield s["id"], " / ".join(t for _, t in s["dialogue"])


def doublons(cands):
    """{titre: verdict} : un modèle lit tout le catalogue déjà écrit et dit si chaque candidat reprend la même blague (même
    chute) ou la même situation de départ. (Un score par mots communs a été essayé : il ne séparait pas un vrai doublon d'une
    blague neuve.)"""
    catalogue = "\n".join(f"{sid} : {t}" for sid, t in deja_tournes())
    liste = "\n".join(f"C{i + 1} : {' / '.join(x for _, x in c['repliques'])}" for i, c in enumerate(cands))
    rep = demander(DOUBLONS.format(catalogue=catalogue, liste=liste))
    verdicts = {}
    for i, c in enumerate(cands):
        m = re.search(rf"C{i + 1}\s*[:=-]\s*(.+)", rep)
        verdicts[c["titre"]] = (m.group(1).strip() if m else "?")
    return verdicts


def script(c):
    return " / ".join(f"{qui} : {txt}" for qui, txt in c["repliques"])


def tirage(sketchs, graine):
    ordre = list(range(len(sketchs)))
    random.Random(graine).shuffle(ordre)
    liste = "\n".join(f"S{i + 1}. {script(sketchs[k])}" for i, k in enumerate(ordre))
    rep = demander(CLASSER.format(n=len(sketchs), liste=liste))
    vus, rangs = set(), {}
    for num in re.findall(r"S(\d+)", rep):
        i = int(num) - 1
        if 0 <= i < len(ordre) and i not in vus:
            vus.add(i)
            rangs[ordre[i]] = len(rangs) + 1
    for k in range(len(sketchs)):            # un oubli du juge compte comme dernier
        rangs.setdefault(k, len(sketchs))
    return rangs


if __name__ == "__main__":
    cands = json.load(open(sys.argv[1]))
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    tous = cands + [REFERENCE]
    ref = len(tous) - 1
    with ThreadPoolExecutor(n) as ex:
        tirages = list(ex.map(lambda g: tirage(tous, g), range(n)))
    verdicts = doublons(cands)
    lignes = []
    for k, c in enumerate(tous):
        moy = sum(t[k] for t in tirages) / n
        bat = sum(t[k] < t[ref] for t in tirages)
        v = verdicts.get(c["titre"], "") if k != ref else ""
        lignes.append((moy, bat, c["titre"], f"   ⚠ {v}" if v and not v.startswith("NOUVEAU") else ""))
    for moy, bat, titre, alerte in sorted(lignes):
        print(f"  rang {moy:5.1f}   bat la réf. {bat}/{n}   {titre}{alerte}")
