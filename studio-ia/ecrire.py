"""Atelier d'écriture à plusieurs plumes : plusieurs grands modèles de familles différentes (OpenRouter) écrivent chacun des
sketchs candidats sur le même cahier des charges ; on les met en commun avec les nôtres, puis jury.py les départage.

  python3 ecrire.py SORTIE.json [nombre_par_modele]
  python3 ecrire.py --reecrire ORIGINAUX.json SORTIE.json [reecritures_par_original]
      réécriture des sketchs les plus vus de la chaîne (prive/originaux_top.json, hors du dépôt public) (demande de l'utilisateur, 26/10/2026 : « réécrire autrement, sans
      doublons, de manière plus drôle et plus choquante ») : même moteur comique, situation et chute neuves
"""
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import jury  # noqa: E402
import or_api  # noqa: E402

MARQUE = ICI / "prive" / "marque.json"            # nom de la chaîne, hors du dépôt public
CHAINE = (f"la chaîne TikTok {json.loads(MARQUE.read_text()).get('pseudo', '')}" if MARQUE.exists() else "la chaîne TikTok")
PLUMES = ["x-ai/grok-4.7", "openai/gpt-6.1-sol", "google/gemini-4-argon", "deepseek/deepseek-v4-pro-0813"]
CONSIGNE = """Tu écris des sketchs comiques TRÈS COURTS pour {chaine} (620 000 abonnés), dessin animé 3D,
personnages ivoiriens, à Abidjan. Le public veut mourir de rire et rejouer la vidéo en boucle.

RÉFÉRENCE (la vidéo la plus vue de la chaîne, 2,4 millions de vues) :
  FILS : Papa, qui m'a donné mon intelligence ?
  PÈRE : Ça doit être ta mère. Moi, j'ai encore la mienne.
Pourquoi ça marche : situation comprise en une seconde, une question innocente, et une réponse qui RETOURNE LA LOGIQUE
(« donner » = ne plus avoir) et touche DEUX cibles d'un coup (le fils ET la mère). Aucun mot de trop.

LA BARRE À DÉPASSER (nos sketchs qui ont le mieux battu la référence devant le jury) :
{exemples}

RÈGLES :
- Français populaire d'Abidjan dans chaque réplique : « dêh », « -là » (« ton copain-là »), « Tonton », « Tantie »,
  « mon vieux », « vieux père », « ya fohi », « gbê », « on dit quoi », syntaxe ivoirienne (« c'est moi tu as choisi »,
  « il a pas l'argent »). Réalités d'Abidjan bienvenues : garba, attiéké, maquis, gbaka, woro-woro, CIE, Sodeci,
  tontine, Cocody, Yopougon, Abobo, coupure de courant, fin du mois.
- On ouvre EN PLEIN CONFLIT : la 1re réplique est une question, une accusation ou une révélation. Jamais d'exposition.
- 2 à 4 répliques, 30 mots au total au maximum, 2 ou 3 personnages, un seul lieu, personne ne se déplace.
- Le CHOC FINAL doit être ÉPOUSTOUFLANT : un retournement total que personne ne voit venir, féroce, qui touche deux
  cibles si possible. Tu peux ajouter une RELANCE : une toute dernière réplique très courte (6 mots max) de la victime
  ou d'un témoin, qui en remet une couche et rend la chute encore plus forte (double choc).
- Humour familial : pas de vulgarité, pas de sexe, pas de politique, pas de religion moquée, pas de moquerie d'ethnie.
- Interdit de reprendre une blague connue ou une des blagues DÉJÀ TOURNÉES ci-dessous (ni la chute, ni la situation).

DÉJÀ TOURNÉES :
{catalogue}

Écris d'abord pour toi-même trois fois plus d'idées, puis ne garde que les {n} plus EXPLOSIVES : celles dont la chute
dépasse la barre ci-dessus. Tous différents (situations, personnages, lieux variés). Réponds UNIQUEMENT par un tableau
JSON : [{{"titre": "…", "repliques": [["RÔLE", "texte"], …]}}, …]"""


CONSIGNE_REECRIRE = """Tu écris pour {chaine} (620 000 abonnés), sketchs comiques TRÈS COURTS en dessin
animé 3D, personnages ivoiriens, à Abidjan. Voici ses sketchs LES PLUS VUS (vidéos à 2,4 millions de vues) :
{originaux}

Pour CHACUN de ces sketchs, écris {k} RÉÉCRITURES. Une réécriture garde le MÊME MOTEUR COMIQUE (le même type de
retournement, la même mécanique de chute), mais avec une NOUVELLE situation, de NOUVEAUX personnages, un NOUVEAU lieu et une
NOUVELLE chute : jamais la même phrase, jamais la même chute que l'original. Chaque réécriture doit être PLUS DRÔLE et PLUS
CHOQUANTE que l'original : une chute qui fait sursauter, que personne ne voit venir, féroce, qui touche deux cibles si
possible ; une relance très courte (6 mots max) d'un témoin ou de la victime est permise pour un double choc.

RÈGLES :
- Français populaire d'Abidjan dans chaque réplique (« dêh », « -là », « Tonton », « Tantie », « mon vieux », « ya fohi »,
  « gbê », syntaxe ivoirienne) ; réalités d'Abidjan bienvenues (garba, maquis, gbaka, woro-woro, CIE, tontine, quartiers).
- On ouvre EN PLEIN CONFLIT. 2 à 4 répliques, 30 mots au total au maximum, 2 ou 3 personnages, un lieu, personne ne bouge.
- Sujets de couple, de grossesse, d'argent permis comme dans les originaux, mais rien de sexuel dit crûment, pas de nudité,
  pas de politique, pas de religion moquée, pas de moquerie d'ethnie.
- Interdit de reprendre une blague des DÉJÀ TOURNÉES ci-dessous :
{catalogue}

Réponds UNIQUEMENT par un tableau JSON : [{{"source": "<titre exact de l'original>", "titre": "…",
"repliques": [["RÔLE", "texte"], …]}}, …]"""


def reecrire(modele, originaux, k):
    catalogue = "\n".join(f"- {t}" for _, t in jury.deja_tournes())
    texte_orig = "\n".join(f"[{o['titre']}] " + " / ".join(f"{a} : {b}" for a, b in o["repliques"]) for o in originaux)
    corps = {"model": modele, "temperature": 1.0, "reasoning": {"effort": "low"},
             "messages": [{"role": "user", "content": CONSIGNE_REECRIRE.format(chaine=CHAINE, originaux=texte_orig, k=k, catalogue=catalogue)}]}
    r = requests.post(f"{or_api.API}/chat/completions", headers=or_api._entetes(), json=corps, timeout=900)
    r.raise_for_status()
    d = r.json()
    or_api.noter_depense("ecriture", modele, (d.get("usage") or {}).get("cost"), "reecriture")
    m = re.search(r"\[.*\]", d["choices"][0]["message"]["content"], re.S)
    sketchs = json.loads(m.group(0)) if m else []
    for s in sketchs:
        s["plume"] = modele
    return sketchs


# sketchs maison qui ont battu la référence le plus nettement aux jurys des tests 5 et 6 (barre donnée aux plumes)
EXEMPLES = ["Je rentre chez ma mère dêh ! / Ya fohi. Tiens deux mille pour le woro-woro. / Mais c'est cinq cents seulement ! / "
            "Prends tes sœurs avec toi.",
            "Qui a mangé le poulet que j'ai caché dans le congélateur-là ?! / Madame, je jure c'est pas moi dêh. Patron et moi "
            "on était à Bassam toute la journée.",
            "Papa, le voleur a laissé la télé et il a sauté par la fenêtre dêh ! / Chérie, je t'ai dit de pas te promener la "
            "nuit sans ta perruque. Voilà, tu as traumatisé l'enfant d'autrui !",
            "Papa, pourquoi mon bulletin-là est dans ton dossier de prêt ? / Mon fils, la banque veut savoir si je finance un "
            "projet sans avenir.",
            "Maman, j'ai pris ma beauté de qui ? / De moi, ma fille. / Ahh… C'est pour ça toi tu as plus rien dêh.",
            "Papa ! Il y a la viande dans ma sauce dêh ! / Mange vite avant de te réveiller."]


def ecrire(modele, n):
    catalogue = "\n".join(f"- {t}" for _, t in jury.deja_tournes())
    corps = {"model": modele, "temperature": 1.0, "reasoning": {"effort": "low"},
             "messages": [{"role": "user", "content": CONSIGNE.format(chaine=CHAINE, catalogue=catalogue, n=n,
                                                                       exemples="\n".join(f"  {e}" for e in EXEMPLES))}]}
    r = requests.post(f"{or_api.API}/chat/completions", headers=or_api._entetes(), json=corps, timeout=600)
    r.raise_for_status()
    d = r.json()
    or_api.noter_depense("ecriture", modele, (d.get("usage") or {}).get("cost"), "ecriture")
    texte = d["choices"][0]["message"]["content"]
    m = re.search(r"\[.*\]", texte, re.S)
    sketchs = json.loads(m.group(0)) if m else []
    for s in sketchs:
        s["plume"] = modele
    return sketchs


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[0] == "--reecrire":
        originaux = json.load(open(args[1]))
        sortie, k = args[2], int(args[3]) if len(args) > 3 else 2
        tache = lambda m: reecrire(m, originaux, k)          # noqa: E731
    else:
        sortie, n = args[0], int(args[1]) if len(args) > 1 else 12
        tache = lambda m: ecrire(m, n)                       # noqa: E731
    tous = []
    with ThreadPoolExecutor(len(PLUMES)) as ex:
        futurs = {m: ex.submit(tache, m) for m in PLUMES}
        for m, f in futurs.items():
            try:
                lot = f.result()
                print(f"  {m:32s} {len(lot)} sketchs")
                tous += lot
            except Exception as e:
                print(f"  {m:32s} ERREUR {str(e)[:200]}")
    Path(sortie).write_text(json.dumps(tous, ensure_ascii=False, indent=0))
    print(f"  {len(tous)} candidats → {sortie}")
