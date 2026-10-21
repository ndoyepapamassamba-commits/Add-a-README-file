# MACHINE À HISTOIRES (17/10/2026) — « écrire des histoires à l'infini, les unes plus drôles que les autres », en français
# ivoirien, avec la troupe, dans les lieux déjà préparés (le moteur les anime aussitôt).
#   python3 histoires.py ecris <dossier> [n=1] [lieu | « Lieu:NOM,NOM »] → n histoires CHAMPIONNES de plus dans <dossier>/ (registre.json)
#   python3 histoires.py episode <dossier> <sortie.json> [id …] → épisode de 60 s (3 sketchs, 3 lieux) au format histoire.json
#   python3 histoires.py juge <histoire.json>                 → notes de JEV de chaque sketch d'une histoire existante
# 1. MATIÈRE : bible_comique.json (exporte_bible.ts : règles mesurées sur vos TikTok, mécaniques, interjections, 10 histoires
#    écrites, 54 fiches de personnages) + LEXIQUE ivoirien familial (Wiktionnaire « Liste de mots nouchis », CC BY-SA :
#    seuls les mots et leur sens) + récapitulatif des vidéos de référence (HISTOIRES_RECAP, facultatif, gardé hors du dépôt).
# 2. ÉCRITURE : modèle texte gratuit sans clé (Pollinations : GPT-OSS 20B, Apache-2.0) ; repli hors ligne : Qwen3 1,7B
#    (Apache-2.0) par llama.cpp (MIT). K brouillons par tour, au format des sketchs de la troupe.
# 3. CONTRÔLES PAR LE CODE : 6 à 11 répliques, ≤ 14 mots chacune, chute ≤ 8 mots, accroche = conflit, personnages du lieu
#    seulement, au moins 2 marques du parler ivoirien, AUCUN mot wolof, rien de vulgaire, chute jamais déjà utilisée.
# 4. JUGE JEV : drôle (échelle 0–4), vraie chute, français ivoirien naturel, clair sans contexte, sans méchanceté.
# 5. ÉCHELLE : le meilleur brouillon affronte le CHAMPION en duel (JEV « lequel fait le plus rire ? », dans les deux ordres
#    pour annuler le biais de position) ; il n'entre au registre que s'il gagne. Chaque histoire acceptée est donc plus drôle
#    que la précédente pour le même juge ; un tour perdu renvoie au scénariste les faiblesses relevées.
import json, os, re, sys, time, uuid, base64, unicodedata, urllib.request
import jev_api   # garde JEV (18/10/2026) : coupé par défaut, le juge local répond
from concurrent.futures import ThreadPoolExecutor

ICI = os.path.dirname(os.path.abspath(__file__))
BIBLE = json.load(open(os.path.join(ICI, 'bible_comique.json'), encoding='utf-8'))
JEV_API = 'https://api.typesafe.ai/v1/systemone'
LLM_URL = 'https://text.pollinations.ai/openai'
LLM_MODELE = os.environ.get('HISTOIRES_MODELE', 'openai-fast')
LOCAL_GGUF = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/llm/Qwen3-1.7B-Q4_K_M.gguf'

# Lieux préparés (prep/<lieu>, personnages en place) : une histoire n'y met que ceux qui y sont.
LIEUX = {'cour': {'nom': 'la cour de la concession Ndiaye', 'acteurs': ['BAYE NDIAYE', 'MAMAN NOUNOU', 'PETIT MAMADOU']},
         'maquis': {'nom': 'un maquis du quartier (table, boissons, addition)', 'acteurs': ['KOFFI', 'COUMBA']},
         'chambre': {'nom': 'la chambre-salon de Modou', 'acteurs': ['TANTIE AWA', 'MODOU']}}


def distribution(lieu, acteurs):
    """21/10/2026 — « Tu te focalises trop sur 7 personnages alors qu'on doit tourner 10 000 » : un sketch peut se jouer dans
    n'importe quel lieu de la bible V1 (images/bible.py : 30 lieux dessinés) avec n'importe quels personnages de la troupe animés
    dans la banque (banque/troupe.json), plus seulement les 3 lieux et 7 personnages de la V1. → clé de LIEUX (une, controle)."""
    cle = re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', f"{lieu} {' '.join(acteurs)}").encode('ascii', 'ignore').decode().lower()).strip('-')
    LIEUX[cle] = {'nom': f"{lieu} (Abidjan)", 'acteurs': [a.upper() for a in acteurs], 'lieu_bible': lieu}
    return cle


def distributions(disponibles):
    """lieu → personnages disponibles qui le fréquentent (champ « lieux » de leur fiche) ; seuls les lieux à 2 personnages ou plus."""
    par_lieu = {}
    for p in BIBLE['personnages']:
        if p['name'] in disponibles:
            for l in p.get('lieux', []): par_lieu.setdefault(l, []).append(p['name'])
    return {l: n for l, n in par_lieu.items() if len(n) >= 2}


JEUX = ['accuse', 'innocent', 'malice', 'panique', 'choc', 'marchande', 'soupcon', 'frime', 'rire', 'camera', 'neutre']

# Parler ivoirien populaire, FAMILIAL (sens tirés du Wiktionnaire, annexe « Liste de mots nouchis » ; mots crus écartés).
LEXIQUE = {'barre': 'mille francs CFA', 'gbêss': 'cinq cents francs', 'gbonhon': 'cinq mille francs', 'plomb': 'cent francs',
           'djê': 'argent', 'bédou': 'portefeuille', 'bigo': 'téléphone', 'woro-woro': 'taxi collectif', 'gbaka': 'minibus',
           'môgô': 'personne, gars, pote', 'go': 'fille, petite amie', 'groto': 'homme riche', 'gaou': 'naïf, pas branché',
           'gawa': 'ringard', 'kpakpato': 'rapporteur, commère', 'gbairè': 'commérage', 'dôhi': 'mensonge', 'flôcô': 'mentir',
           'fraya': 'fuir', 'béou': 'partir, filer', 'daba': 'manger', 'dabali': 'nourriture', 'gbô': 'manger',
           'enjailler': "s'amuser, plaire", 'djossi': 'travail', 'brobro': 'trimer', 'grouilleur': 'débrouillard',
           'soutra': 'aider, sortir de la galère', 'dindin': 'surveiller, lorgner', 'dendjô': 'comprendre', 'gbê': 'la vérité',
           'gbahé': 'gronder, sermonner', 'yafor': "d'accord", 'pahé': 'parce que', 'jahin': 'jamais', 'mono': 'policier',
           'foul': 'plein, beaucoup', 'bôrô': 'beaucoup', 'zo': 'beau', 'zota': 'belle', 'goumin': "chagrin d'amour",
           'faux-type': 'hypocrite', 'ken': 'affaire, plan', 'côcô': 'quémander', 'djafoule': 'tout donner, impressionner'}
MARQUES = set(LEXIQUE) | {'dêh', 'ehh', 'ehhh', 'eh dieu', 'ehhh dieu', 'hein', 'c’est comment', "c'est comment", 'on dit quoi',
                          'y a pas drap', 'ça va aller', 'bon vieux', 'dieu merci', 'mon frère', 'tantie', 'tonton', 'vieux père',
                          'maquis', 'garba', 'attiéké', 'alloco', 'tchip', 'gâté', 'c’est gâté', "c'est gâté", 'toi qui', 'là'}
# Wolof courant : la consigne est « retire le wolof, tout doit être en français ivoirien ».
WOLOF = {'dégg', 'degg', 'nanga', 'nanga def', 'jërëjëf', 'jerejef', 'waaw', 'deedeet', 'xale', 'teranga', 'lekk', 'ndax', 'yow',
         'maa ngi', 'mangi', 'dafa', 'dama', 'baax', 'bëgg', 'begg', 'xam', 'toubab', 'thieb', 'thiéboudienne', 'thiebou', 'yassa',
         'ndeysaan', 'ndeysan', 'boroom', 'kaay', 'ñam', 'nopp', 'sama', 'suma', 'yaay', 'baay'}
CRU = {'pute', 'putain', 'merde', 'connard', 'conne', 'salope', 'nichon', 'cul', 'baiser', 'bite', 'couilles', 'enculé'}


def mots(t):
    t = unicodedata.normalize('NFC', t.lower()).replace('’', "'")
    return re.findall(r"[a-zàâäçéèêëîïôöùûüÿœæñ'\-]+", t)


def _contient(texte, ensemble):
    t = ' ' + ' '.join(mots(texte)) + ' '
    return sorted({e for e in ensemble if (' ' + e.replace('’', "'") + ' ') in t})


# ── écriture ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def fiche(nom):
    for p in BIBLE['personnages']:
        if p['name'] == nom:
            return (f"{nom} ({p.get('surnom', '')}) : {p.get('personnalite', '')} Traits : {', '.join(p.get('traits', []))}. "
                    f"Habitudes : {'; '.join(p.get('habitudes', [])[:4])}.")
    return nom


# PLANCHER V17 (20/10/2026, « pas moins que V17 ») : les trois sketchs de l'épisode publié sur TikTok. Toute histoire nouvelle
# doit faire AU MOINS autant rire qu'eux (duel du juge, dans les deux ordres) ; leurs chutes sont interdites (pas de copie).
V17 = json.load(open(os.path.join(ICI, 'plancher_v17.json'), encoding='utf-8'))
SEUIL_V17 = 0.5

FORMATS = {'blague': {'n': (2, 4), 'duree': '5 à 9 secondes', 'rappel': False},
           'sketch': {'n': (6, 10), 'duree': '15 à 25 secondes', 'rappel': True}}


# LE CHOC FINAL (20/10/2026, consignes du producteur : « augmente l'humour au max » ; « le choc final de chaque sketch doit être
# vraiment choquant de rire » ; « trouve des jeux de dialogue qui vont capter l'attention et le choc sera terrible de rires »).
# Méthode des scènes d'humour (fausse piste puis révélation, escalade en trois marches, rappel retourné) écrite en consignes ;
# le juge note à part la force du choc (question « choc ») et la note pèse dans le classement des brouillons.
CHOC = """
LE CHOC FINAL (le plus important : tu es le plus grand comédien du monde) :
- La chute est une RÉVÉLATION qui RETOURNE toute la situation en une phrase : le menteur se trahit par sa propre excuse, la
  victime était le coupable, l'objet de la dispute était ailleurs depuis le début, le sage est le pire de tous… Le public ne
  doit PAS la voir venir, mais tout s'explique en une seconde : il sursaute, puis il éclate de rire et rejoue la vidéo.
- Prépare-la par une FAUSSE PISTE : l'accroche et les marches font croire à une autre fin.
- La chute est dite par le personnage le plus inattendu (l'enfant, le timide, la victime) ou par le menteur qui se trahit seul.
- Le mot qui fait exploser le rire est le DERNIER mot de la chute.
- RIEN après la chute : l'autre personnage reste FIGÉ de choc, le moteur le montre en gros plan (2 à 4 s) ; la chute doit
  tenir en 9 syllabes au plus (≈ 1,2 s) pour claquer.
JEUX DE DIALOGUE QUI ACCROCHENT DÈS LA PREMIÈRE SECONDE (en combiner un ou deux) :
- accroche = un reproche, un secret ou une accusation directe, jamais une salutation ;
- escalade en trois marches : chaque excuse est plus énorme que la précédente ;
- répétition à trois temps : le même mot revient, la troisième fois il change de sens ;
- ping-pong rapide : répliques de 3 à 6 mots qui se renvoient le même mot ;
- quiproquo : chacun parle d'autre chose sans le savoir, la chute le révèle ;
- double sens d'un mot du parler ivoirien.
"""


def consignes(lieu, champion, deja, faiblesses, recap, fmt='sketch'):
    L = LIEUX[lieu]; F = FORMATS[fmt]
    regles = '\n'.join(f"- {r['rule']}" for r in BIBLE['regles'])
    meca = '\n'.join(f"- {m['label']} : {m['how']}" for m in BIBLE['mecaniques'])
    inter = ', '.join(f"« {i['text']} » ({i['meaning']})" for i in BIBLE['interjections'])
    lex = ', '.join(f'{k} = {v}' for k, v in LEXIQUE.items())
    exemple = next((s for s in BIBLE['histoires'] if s.get('beats')), None)
    ex_txt = '\n'.join(f"{b['who'].upper()} : {b['text']}" for b in exemple['beats'][:9]) if exemple else ''
    txt = f"""Tu écris UNE {'BLAGUE EXPRESS' if fmt == 'blague' else 'sketch comique'} de {F['duree']} pour une série animée TikTok tournée à Abidjan, en FRANÇAIS IVOIRIEN
populaire (comme Afrikatoon, Ladjagaï, « la blague du jour ») : phrases courtes, « hein », « dêh », « Ehhh Dieu ! », un peu de nouchi
compréhensible par tous. JAMAIS de wolof. Humour familial : on rit des SITUATIONS et des défauts du personnage, jamais d'un groupe,
d'une ethnie, d'une religion, d'un handicap ou d'un corps ; rien de vulgaire.

LIEU : {L['nom']}. PERSONNAGES (uniquement eux, au moins deux) :
""" + '\n'.join(fiche(n) for n in L['acteurs']) + f"""

RÈGLES MESURÉES SUR LES VIDÉOS DE LA CHAÎNE :
{regles}

MÉCANIQUES COMIQUES (en choisir UNE qui porte tout le sketch) :
{meca}
- Mot pris au pied de la lettre (Afrikatoon : « la mort m'a bipé » → « appelle-la et laisse-moi dormir »).
- Logique qui se contredit (vient au bureau dire qu'il n'a pas l'argent du transport pour venir).
- Mauvaise foi commerciale, règle absurde inventée sur-le-champ, compliment empoisonné, insulte reprise en écho, défi immobile,
  proverbe de sortie (Ladjagaï : « C'est les affaires mon pote. On fait pas de favoritisme »).

INTERJECTIONS : {inter}
LEXIQUE (sens exact, n'en mets que 2 ou 3) : {lex}

FORMAT : de {F['n'][0]} à {F['n'][1]} répliques, chacune de 14 mots au plus ; la CHUTE (dernière réplique avant le bouton éventuel) fait
8 mots au plus{' et REPREND un mot de la première réplique avec un autre sens' if F['rappel'] else ', le mot drôle en DERNIER'} ;
{'la chute est la DERNIÈRE réplique (la réaction choquée est jouée en image) ; deux répliques de suite jamais du même personnage ; ' if fmt == 'sketch' else 'un bouton final de 3 à 6 mots est permis (réaction) ; '}2 à 4 marques du parler ivoirien, pas plus.
Jeu de chaque réplique parmi : {', '.join(JEUX)}.
"""
    if fmt == 'sketch': txt += CHOC
    txt += ("\nNIVEAU MINIMUM À DÉPASSER (épisode publié, NE PAS le recopier, ses chutes sont interdites) :\n"
            + '\n'.join(f"« {v['titre']} » : " + ' / '.join(f"{r['qui']} : {r['texte']}" for r in v['repliques'][-3:]) for v in V17) + '\n')
    if ex_txt: txt += f"\nEXEMPLE DE TON (déjà tourné, NE PAS le recopier) :\n{ex_txt}\n"
    if fmt == 'blague':   # leçon de l'échelle du 17/10 (25 blagues, duels JEV dans les deux ordres)
        txt += ("\nCE QUI GAGNE LES DUELS (mesuré) : le RAPPEL RETOURNÉ — la chute reprend les MOTS de l'accroche et les retourne "
                "contre celui qui les a dits, en trois répliques : « Commande tout ! Ce soir, c'est Koffi qui gère ! » → « Même "
                "l'addition ? » → « Ah non. L'addition, c'est toi qui gères. » Vise ce ressort, avec une autre situation.\n")
    if recap: txt += f"\nCE QUI FAIT RIRE DANS LES VIDÉOS DE RÉFÉRENCE :\n{recap[:2500]}\n"
    if champion:
        txt += ("\nLE SKETCH À BATTRE (fais PLUS DRÔLE, avec une autre mécanique et une autre chute) :\n"
                + '\n'.join(f"{r['qui']} : {r['texte']}" for r in champion['repliques']) + '\n')
    if deja: txt += f"\nCHUTES DÉJÀ UTILISÉES (interdites) : {' | '.join(deja[-30:])}\n"
    if faiblesses: txt += f"\nLE DERNIER ESSAI A ÉTÉ REFUSÉ POUR : {faiblesses}. Corrige cela.\n"
    txt += """
Réponds UNIQUEMENT par un objet JSON :
{"titre": "...", "mecanique": "UNE de : """ + ' | '.join(MECANIQUES_TON) + """", "repliques": [{"qui": "NOM EXACT", "texte": "...", "jeu": "...", "role": "accroche|marche 1|marche 2|réaction|chute|bouton"}]}
Une seule réplique porte "role": "chute"."""
    return txt


def _json(texte):
    """premier objet JSON lisible du texte ; un brouillon mal formé est simplement écarté."""
    m = re.search(r'\{.*\}', texte or '', re.S)
    if not m: return None
    for t in (m.group(0), re.sub(r',\s*([}\]])', r'\1', m.group(0)).replace('“', '"').replace('”', '"')):
        try: return json.loads(t)
        except ValueError: pass
    return None


import threading
_VERROU_LOCAL = threading.Lock()
# service gratuit sans clé : au plus 2 appels en vol (20/10/2026, mesuré : 6 appels simultanés — 3 brouillons jugés, 2 questions
# chacun — laissaient une réponse sans retour au bout de 240 s, alors qu'un appel seul du juge répond en 9 s)
_EN_VOL = threading.BoundedSemaphore(int(os.environ.get('HISTOIRES_EN_VOL', '2')))


def llm(prompt, temp=1.0):
    """modèle texte : point d'accès compatible OpenAI (HISTOIRES_URL + HISTOIRES_CLE, par ex. la clé de l'utilisateur dans
    l'app), sinon Pollinations sans clé ; repli hors ligne Qwen3 1,7B (un seul appel à la fois : le modèle local n'est pas
    réentrant — 4 appels parallèles l'ont fait avorter le 17/10)."""
    url = os.environ.get('HISTOIRES_URL', LLM_URL); cle = os.environ.get('HISTOIRES_CLE')
    corps = {'model': LLM_MODELE, 'messages': [{'role': 'user', 'content': prompt}], 'temperature': temp, 'max_tokens': 6000,
             'reasoning_effort': os.environ.get('HISTOIRES_EFFORT', 'low'), 'seed': int(time.time() * 1e6) % 2 ** 31}
    tete = {'Content-Type': 'application/json', **({'Authorization': f'Bearer {cle}'} if cle else {})}
    err = None
    for essai in range(3):
        try:
            req = urllib.request.Request(url, data=json.dumps(corps).encode(), headers=tete)
            with _EN_VOL: m = json.loads(urllib.request.urlopen(req, timeout=240).read())['choices'][0]['message']
            if m.get('content'): return m['content']
            err = 'réponse vide (raisonnement seul)'
        except Exception as e:
            err = e
        time.sleep(4 * (essai + 1))
    if os.environ.get('HISTOIRES_LOCAL') != '1': raise RuntimeError(f'modèle texte injoignable ({err})')
    with _VERROU_LOCAL:   # repli hors ligne (HISTOIRES_LOCAL=1) : Qwen3 1,7B (Apache-2.0) par llama.cpp (MIT)
        try:
            from llama_cpp import Llama
            global _LOCAL
            if '_LOCAL' not in globals(): _LOCAL = Llama(LOCAL_GGUF, n_ctx=8192, n_threads=4, verbose=False)
            r = _LOCAL.create_chat_completion(messages=[{'role': 'user', 'content': prompt + ' /no_think'}], temperature=temp, max_tokens=1500)
            return r['choices'][0]['message']['content']
        except Exception as e2:
            raise RuntimeError(f'aucun modèle texte joignable ({err} ; local : {e2})')


# ── contrôles ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def noms_exacts(h, lieu):
    """21/10/2026 — le scénariste écrit « Aya », « Moussa » ou « Professeur Samba » pour PETITE AYA, PETIT MOUSSA, PROFESSEUR
    SAMBA (brouillons refusés « hors du lieu ») : chaque nom est ramené au personnage du lieu qui le contient, sans accents ni casse."""
    def n(t): return ' '.join(mots(t))
    acteurs = LIEUX[lieu]['acteurs']
    for r in h.get('repliques') or []:
        q = n(r.get('qui', ''))
        cand = [a for a in acteurs if n(a) == q] or [a for a in acteurs if q and (q in n(a) or n(a) in q)]
        if not cand:   # faute de frappe du scénariste (« Petit Mussa ») : le nom le plus proche, s'il l'est vraiment
            import difflib
            cand = [a for a in acteurs if n(a) in difflib.get_close_matches(q, [n(x) for x in acteurs], n=1, cutoff=0.8)]
        if len(cand) == 1: r['qui'] = cand[0]
    return h


def controle(h, lieu, deja=(), fmt='sketch'):
    """défauts objectifs d'un brouillon (liste vide = conforme)."""
    d = []; R = h.get('repliques') or []; F = FORMATS[fmt]; n0, n1 = F['n'][0], F['n'][1] + 1
    if not n0 <= len(R) <= n1: d.append(f'{len(R)} répliques ({n0} à {n1})')
    acteurs = set(LIEUX[lieu]['acteurs'])
    if any(r.get('qui') not in acteurs for r in R): d.append('personnage hors du lieu : ' + ', '.join(sorted({r.get('qui', '?') for r in R} - acteurs)))
    if len({r.get('qui') for r in R}) < 2: d.append('un seul personnage parle')
    longues = [r['texte'] for r in R if len(mots(r.get('texte', ''))) > 14]
    if longues: d.append(f'{len(longues)} réplique(s) de plus de 14 mots')
    ch = [r for r in R if r.get('role') == 'chute' or r.get('chute')]
    if len(ch) != 1: d.append('il faut exactement une chute')
    else:
        c = ch[0]['texte']
        if len(mots(c)) > 8: d.append(f'chute de {len(mots(c))} mots (8 au plus)')
        acc = {w for w in mots(R[0]['texte']) if len(w) > 3}
        if F['rappel'] and not acc & {w for w in mots(c) if len(w) > 3}: d.append("la chute ne reprend aucun mot de l'accroche (pas de rappel)")
        if any(_norm(c) == _norm(x) for x in deja): d.append('chute déjà utilisée')
    tout = ' '.join(r.get('texte', '') for r in R)
    if len(_contient(tout, MARQUES)) < (1 if fmt == 'blague' else 2): d.append('pas assez de marques du parler ivoirien')
    w = _contient(tout, WOLOF)
    if w: d.append('wolof interdit : ' + ', '.join(w))
    c_ = _contient(tout, CRU)
    if c_: d.append('mot cru : ' + ', '.join(c_))
    for r in R:
        if r.get('jeu') not in JEUX: r['jeu'] = 'neutre'
    return d


def _norm(t): return ' '.join(mots(t))


# ── juge JEV ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def _juge_llm(state, questions):
    """JUGE COMIQUE GRATUIT (20/10/2026) : JEV est coupé (consigne du 18/10) et le juge local n'a aucune voie pour noter un texte
    (« drole » : « sans voie locale ») — sans lui, aucun brouillon n'était jamais classé et l'écriture de la série échouait.
    Même contrat que JEV (score, noul, choice avec probabilités), rendu par le modèle texte gratuit à température basse ; la
    position est neutralisée par les duels joués dans les deux ordres (duel()) et contrôlée par une question à réponse connue
    (verif_moteur : la V17 contre sa version sans chute)."""
    lignes = []
    for k, q in questions.items():
        if q['type'] == 'score':
            lignes.append(f'"{k}" : un nombre de 0 à {len(q["criteria"]) - 1} (décimales permises) — {q["instructions"]} Niveaux : '
                          + ' | '.join(f'{i} = {c}' for i, c in enumerate(q['criteria'])))
        elif q['type'] == 'noul': lignes.append(f'"{k}" : probabilité (0 à 1) que la réponse soit OUI — {q["instructions"]}')
        else:
            lignes.append(f'"{k}" : un objet {{' + ', '.join(f'"{c}": probabilité' for c in q['criteria']) + '}} dont la somme vaut 1 — '
                          + q['instructions'] + ' ' + ' | '.join(f'{c} = {d}' for c, d in q['criteria'].items()))
    prompt = ("Tu es le jury le plus exigeant d'un festival d'humour d'Abidjan : tu connais par cœur les meilleurs sketchs "
              "d'Afrikatoon, de Ladjagaï et de « la blague du jour », et tu ne ris jamais par politesse. Note honnêtement.\n\n"
              + '\n\n'.join(f'`{k}` :\n{v}' for k, v in state.items())
              + "\n\nRéponds UNIQUEMENT par un objet JSON avec ces clés :\n" + '\n'.join(lignes))
    J = _json(llm(prompt, temp=0.2)) or {}
    out = {}
    for k, q in questions.items():
        v = J[k]
        if q['type'] == 'score': out[k] = {'score': max(0.0, min(float(len(q['criteria']) - 1), float(v)))}
        elif q['type'] == 'noul': out[k] = {'noul': max(0.0, min(1.0, float(v)))}
        else:
            pr = {c: max(0.0, float(v.get(c, 0))) for c in q['criteria']}; t = sum(pr.values()) or 1.0
            pr = {c: x / t for c, x in pr.items()}; out[k] = {'choice': max(pr, key=pr.get), 'probabilities': pr}
    return out


def _jev(state, questions):
    if not jev_api.autorise(): return _juge_llm(state, questions)
    body = {'model': 'jev-1.14.0', 'state': state, 'questions': questions}
    req = urllib.request.Request(JEV_API, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    for essai in range(3):
        try: return json.loads(jev_api.ouvre(req, outil='histoires', timeout=120).read())['answers']
        except Exception:
            time.sleep(3 * (essai + 1))
    raise RuntimeError('JEV injoignable')


def script(h):
    return '\n'.join(f"{r['qui']} : {r['texte']}" for r in h['repliques'])


PUBLIC = 'a TikTok audience in Abidjan (Côte d’Ivoire) watching a 20-second animated family comedy sketch'


def juge(h):
    Q = {'drole': {'type': 'score', 'instructions': f'How funny would `sketch` be for {PUBLIC}?',
                   'criteria': ['not funny at all, flat or confusing', 'mildly amusing, a small smile', 'funny, a real laugh',
                                'very funny, people would share it', 'hilarious, people would laugh out loud and replay it']},
         'chute': {'type': 'noul', 'instructions': 'Does the last real line of `sketch` deliver a punchline: a surprising twist that still makes sense given the setup?'},
         'choc': {'type': 'score', 'instructions': 'How hard does the FINAL punchline of `sketch` hit: a sudden reveal or reversal that flips the whole situation, so viewers gasp and then burst out laughing?',
                  'criteria': ['no final shock: the ending fizzles or was predictable', 'a small twist, mildly surprising',
                               'a real twist that gets a laugh', 'a strong shocking reveal, people laugh out loud',
                               'a devastating reversal: a gasp then uncontrollable laughter, viewers replay and share it']},
         'clair': {'type': 'noul', 'instructions': 'Can a viewer understand the situation and the joke of `sketch` without any extra context?'},
         'mechant': {'type': 'noul', 'instructions': '`sketch` mocks an ethnic group, a religion, a disability or someone’s body, or contains vulgar or sexual content.'}}
    # la langue est jugée à part, sur les répliques SEULES : les noms de la troupe (fixés par l'utilisateur, d'origines
    # diverses) ne disent rien du parler et faussaient la note (0,26 avec les noms, 0,64 sans, même texte)
    QL = {'ivoirien': {'type': 'noul', 'instructions': 'Does the dialogue in `repliques` sound like natural popular Ivorian French as spoken in Abidjan (not standard France French, and not Wolof)?'}}
    with ThreadPoolExecutor(2) as p:
        fa = p.submit(_jev, {'sketch': script(h)}, Q)
        fl = p.submit(_jev, {'repliques': '\n'.join('— ' + r['texte'] for r in h['repliques'])}, QL)
        a = dict(fa.result(), **fl.result())
    n = {'drole': round(a['drole']['score'], 3), 'choc': round(a['choc']['score'], 3), **{k: round(a[k]['noul'], 3) for k in ('chute', 'ivoirien', 'clair', 'mechant')}}
    n['note'] = round(n['drole'] / 4 * 0.4 + n['choc'] / 4 * 0.25 + n['chute'] * 0.1 + n['ivoirien'] * 0.15 + n['clair'] * 0.1
                      - 0.5 * max(0.0, n['mechant'] - 0.3), 3)
    return n


def duel(nouveau, champion):
    """probabilité que `nouveau` fasse plus rire que `champion` (moyenne des deux ordres de présentation)."""
    def un(a, b):
        Q = {'mieux': {'type': 'choice', 'instructions': f'Which of the two sketches, `A` or `B`, would make {PUBLIC} laugh more?',
                       'criteria': {'A': 'sketch A is funnier', 'B': 'sketch B is funnier'}}}
        return _jev({'A': script(a), 'B': script(b)}, Q)['mieux']['probabilities']
    with ThreadPoolExecutor(2) as p:
        p1, p2 = p.map(lambda ab: un(*ab), [(nouveau, champion), (champion, nouveau)])
    return round((p1['A'] + p2['B']) / 2, 3)


def plancher_v17(h):
    """probabilité moyenne que `h` fasse plus rire que les trois sketchs de la V17 (chaque duel dans les deux ordres)."""
    with ThreadPoolExecutor(2) as p:
        r = list(p.map(lambda v: _essai(lambda: duel(h, v)), V17))
    r = [x for x in r if x is not None]
    return round(sum(r) / len(r), 3) if r else 0.0


# ── échelle ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def registre(dossier):
    f = f'{dossier}/registre.json'
    return json.load(open(f, encoding='utf-8')) if os.path.isfile(f) else {'acceptees': [], 'refus': 0, 'tours': 0}


def ecrit_registre(dossier, R):
    tmp = f'{dossier}/registre.json.tmp'; json.dump(R, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); os.replace(tmp, f'{dossier}/registre.json')


def charge(dossier, i):
    return json.load(open(f'{dossier}/{i}.json', encoding='utf-8'))


def une(dossier, lieu, recap='', K=3, tours_max=4, seuil=0.6, journal=print, fmt='sketch'):
    """écrit des brouillons jusqu'à battre le champion du registre (ou à défaut le meilleur de 4 tours) ; → id ou None."""
    R = registre(dossier); deja = [a['chute'] for a in R['acceptees']] + [r['texte'] for v in V17 for r in v['repliques'] if r.get('chute')]
    champ = charge(dossier, R['acceptees'][-1]['id']) if R['acceptees'] else None
    faiblesses = ''
    for tour in range(tours_max):
        R['tours'] += 1
        with ThreadPoolExecutor(2) as p:   # 2 appels à la fois : le service gratuit sans clé limite les rafales
            textes = list(p.map(lambda _: _essai(lambda: llm(consignes(lieu, champ, deja, faiblesses, recap, fmt))), range(K)))
        journal(f'  tour {tour + 1} : {sum(1 for t in textes if t)} brouillon(s) reçu(s)')
        bons = []
        for t in textes:
            h = _json(t) if t else None
            if not h or not h.get('repliques'): continue
            d = controle(noms_exacts(h, lieu), lieu, deja, fmt)
            if d: journal(f"  brouillon refusé : {'; '.join(d)}"); faiblesses = '; '.join(d); continue
            bons.append(h)
        if not bons: continue
        with ThreadPoolExecutor(len(bons)) as p:
            notes = list(p.map(lambda h: _essai(lambda: juge(h)), bons))
        cands = sorted([(n['note'], h, n) for h, n in zip(bons, notes) if n and n['mechant'] < 0.5], key=lambda x: -x[0])
        if not cands: faiblesses = 'jugé méchant ou vulgaire'; continue
        note, h, n = cands[0]
        p_ = duel(h, champ) if champ else 1.0
        journal(f"  tour {tour + 1} : meilleur brouillon « {h.get('titre')} » note {note} (drôle {n['drole']}/4, choc {n['choc']}/4), duel contre le champion {p_}")
        pv = plancher_v17(h) if p_ >= seuil and fmt == 'sketch' else None
        if pv is not None:
            journal(f"  plancher V17 : {pv} (au moins {SEUIL_V17} exigé)")
            if pv < SEUIL_V17:
                R['refus'] += 1; ecrit_registre(dossier, R)
                faiblesses = (f"moins drôle que l'épisode publié V17 ({pv}) ; drôle {n['drole']}/4, choc final {n['choc']}/4 : "
                              "rends la chute plus inattendue et plus forte, prépare-la par une fausse piste"); continue
        if p_ >= seuil:
            i = f"h{len(R['acceptees']) + 1:03d}-{uuid.uuid4().hex[:6]}"
            ch = next(r['texte'] for r in h['repliques'] if r.get('role') == 'chute' or r.get('chute'))
            for r in h['repliques']:
                if r.get('role') == 'chute': r['chute'] = True
            h.update(id=i, lieu=lieu, image=lieu, format=fmt, lieu_bible=LIEUX[lieu].get('lieu_bible'), acteurs=sorted({r['qui'] for r in h['repliques']}, key=LIEUX[lieu]['acteurs'].index))
            json.dump(h, open(f'{dossier}/{i}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            R['acceptees'].append({'id': i, 'titre': h.get('titre'), 'lieu': lieu, 'mecanique': h.get('mecanique'), 'chute': ch, 'notes': n,
                                   'duel': p_, 'contre': champ['id'] if champ else None, 'date': time.strftime('%d/%m/%Y %H:%M')})
            ecrit_registre(dossier, R); return i
        R['refus'] += 1; ecrit_registre(dossier, R)
        faiblesses = (f"duel perdu ({p_}) contre « {champ.get('titre')} » ; drôle {n['drole']}/4, chute {n['chute']}, ivoirien {n['ivoirien']}, "
                      f"clair {n['clair']}") if champ else ''
    return None


def _essai(f):
    try: return f()
    except Exception as e:
        print('  (échec :', str(e)[:120], ')', flush=True); return None


# mécaniques reconnues par fabrique/ton.py (le contrôle de ton refuse toute autre étiquette)
MECANIQUES_TON = ['pied de la lettre', 'logique contradictoire', 'ironie dramatique', 'croyance au bout', 'mauvaise foi', 'règle absurde',
                  'compliment empoisonné', 'vantardise contredite', 'contre-pied', 'pince-sans-rire', 'surenchère', 'proverbe détourné']


def _scene(s):
    """sketch du registre → sketch d'épisode : mécanique, ressort et RÉACTION FIGÉE après la chute (exigés par fabrique/ton.py ;
    20/10/2026 : sans eux, tout épisode écrit par la machine était refusé). Un témoin (l'autre personnage) reste figé de choc."""
    R = s['repliques']; c = next((r for r in R if r.get('chute')), R[-1])
    temoin = next((a for a in s['acteurs'] if a != c['qui']), c['qui'])
    x = {'id': s['id'], 'titre': s.get('titre'), 'lieu': s['lieu'], 'image': s['image'], 'acteurs': s['acteurs'], 'repliques': R,
         'mecanique': s.get('mecanique'), 'ressort': s.get('ressort') or {'qui': c['qui']},
         'reaction': s.get('reaction') or {'qui': temoin, 'jeu': 'choc', 'duree_s': 3.0, 'plan': 'gros plan fixe'}}
    for k in ('mise_en_scene', 'objets'):
        if s.get(k): x[k] = s[k]
    return x


def episode(dossier, sortie, ids=None):
    """trois champions de trois lieux → histoire.json (60 s) que voix.py, tourne.py et compose.py prennent tel quel."""
    R = registre(dossier); A = R['acceptees']
    if not ids:
        ids, vus = [], set()
        for a in sorted(A, key=lambda a: -a['notes']['note']):
            if a['lieu'] not in vus: ids.append(a['id']); vus.add(a['lieu'])
            if len(ids) == 3: break
    S = [charge(dossier, i) for i in ids]
    chutes = [w.upper() for s in S for r in s['repliques'] if r.get('chute') for w in mots(r['texte']) if len(w) > 3][-8:]
    H = {'titre': S[0].get('titre', 'Épisode'), 'duree_cible_s': 60, 'reference': 'machine à histoires (histoires.py) : champions du registre',
         'sketchs': [_scene(s) for s in S],
         'mots_chute': chutes, 'ecriture': 'histoires.py : bible comique + juge JEV + duel contre le champion précédent'}
    json.dump(H, open(sortie, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return H


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'ecris':
        d = sys.argv[2]; n = int(sys.argv[3]) if len(sys.argv) > 3 else 1; lieux = [sys.argv[4]] if len(sys.argv) > 4 else list(LIEUX)
        # « Lieu:NOM 1,NOM 2,… » : distribution libre (toute la troupe, tous les lieux de la bible)
        lieux = [distribution(l.split(':')[0], l.split(':', 1)[1].split(',')) if ':' in l else l for l in lieux]
        os.makedirs(d, exist_ok=True); recap = open(os.environ['HISTOIRES_RECAP'], encoding='utf-8').read() if os.environ.get('HISTOIRES_RECAP') else ''
        fmt = os.environ.get('HISTOIRES_FORMAT', 'sketch')
        for k in range(n):
            lieu = lieux[k % len(lieux)]; t0 = time.time()
            i = une(d, lieu, recap, fmt=fmt)
            print(f"{lieu} : {'acceptée ' + i if i else 'aucun brouillon ne bat le champion'} ({time.time() - t0:.0f} s)", flush=True)
    elif cmd == 'episode':
        H = episode(sys.argv[2], sys.argv[3], sys.argv[4:] or None); print(json.dumps([s['titre'] for s in H['sketchs']], ensure_ascii=False))
    elif cmd == 'juge':
        H = json.load(open(sys.argv[2], encoding='utf-8'))
        for s in H['sketchs']: print(s['id'], juge(s), flush=True)
