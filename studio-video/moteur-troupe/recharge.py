# RECHARGE DE LA RÉSERVE DE SKETCHS (21/10/2026) — « les 10000 vidéos […] fabriqué d'avance à ma disposition » : 10 000 épisodes
# = 30 000 sketchs ; la fabrique les écrit elle-même, sans Claude, pour chaque scène préparée de la troupe neuve.
#   1. modèle texte gratuit, sans clé à demander : sur GitHub, GitHub Models par le jeton de la tâche (HISTOIRES_URL /
#      HISTOIRES_CLE posés par le flux) ; ailleurs Pollinations sans clé (histoires.llm, mêmes replis) ;
#   2. consigne = règles mesurées de fabrique/ton.py + deux sketchs de la réserve pour CE lieu (le ton exact de la V1) +
#      personnages de la scène (fiche : âge, activité, ressort) ;
#   3. chaque sketch rendu passe ton.controle (structure, chute ≤ 8 mots / 9 syllabes, rappel de l'accroche, 2 à 4 marques du
#      parler ivoirien, rien de cru, ni wolof, ni corps) ET n'entre que si sa chute n'existe pas déjà dans la réserve.
#   python3 recharge.py SCENE N        → jusqu'à N sketchs neufs pour cette scène préparée
#   python3 recharge.py tout N [MIN]   → chaque scène prête qui a moins de MIN sketchs libres (défaut 12) en reçoit jusqu'à N
import hashlib, json, os, re, sys, unicodedata

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI); sys.path.insert(0, os.path.join(ICI, 'fabrique'))
import serie_v1 as SV
JEUX = ('frime', 'soupcon', 'innocent', 'malice', 'panique', 'accuse', 'colere', 'boude', 'marchande', 'rire')


def _norm(t): return re.sub(r'[^a-z ]', '', unicodedata.normalize('NFKD', t.lower()).encode('ascii', 'ignore').decode()).strip()


def consigne(scene, acteurs, exemples, n):
    import ton
    fi = json.load(open(os.path.join(ICI, '..', 'blender', 'film', 'characters.json'), encoding='utf-8'))
    perso = '\n'.join(f"- {a} : {(fi.get(a) or {}).get('genre', '')}, {(fi.get(a) or {}).get('age', '')} ans, {(fi.get(a) or {}).get('activite', '')}" for a in acteurs)
    ex = json.dumps([{k: s[k] for k in ('titre', 'mecanique', 'ressort', 'repliques')} for s in exemples], ensure_ascii=False, indent=1)
    return f"""Tu écris des sketchs comiques TikTok en français d'Abidjan (Côte d'Ivoire), pour une série animée familiale.
Lieu : {exemples[0]['lieu'] if exemples else scene}. Personnages (et seulement eux) :
{perso}

Règles STRICTES (chaque sketch est contrôlé automatiquement, un seul défaut et il est jeté) :
- 6 ou 7 répliques, chacune de 14 mots au plus ; elles alternent entre les deux personnages ;
- la 1re réplique est un conflit : elle finit par « ? » ou « ! » ;
- la DERNIÈRE réplique est la chute : 8 mots au plus, très courte (9 syllabes au plus), et elle REPREND un mot de la 1re réplique ;
- une seule chute ; elle retourne la situation (contre-pied, mauvaise foi, pied de la lettre, logique contradictoire…) ;
- entre 2 et 4 marques du parler ivoirien en tout, prises dans : dêh, hein, ehh, vieux père, c'est comment, c'est gâté, on dit quoi, gaou, ça va aller ;
- aucun mot cru, aucun mot wolof, rien sur le corps, la couleur, une ethnie ou une religion ; humour bienveillant ;
- « jeu » de chaque réplique parmi : {', '.join(JEUX)} ; la chute a le jeu « camera » ;
- « mecanique » parmi : {', '.join(ton.MECANIQUES)} ; « ressort » = celui qui dit la chute et son trait comique.

Exemples de la série (même ton, même longueur) :
{ex}

Écris {n} sketchs NEUFS (situations différentes des exemples et entre eux), au format JSON strict : une liste d'objets
{{"titre": "TITRE EN MAJUSCULES", "mecanique": "...", "ressort": {{"qui": "NOM", "trait": "..."}}, "repliques": [{{"qui": "NOM", "texte": "...", "jeu": "..."}}, ...]}}.
Réponds seulement par le JSON."""


def _json(t):
    """objets JSON lus un par un (accolades appariées, chaînes et échappements respectés) : un sketch mal formé par le modèle
    est sauté, les autres sont gardés (21/10/2026 : une virgule manquante au 5e sketch faisait perdre tout le lot)."""
    out, i, n = [], 0, len(t)
    while i < n:
        if t[i] != '{': i += 1; continue
        prof, j, chaine, esc = 0, i, False, False
        while j < n:
            c = t[j]
            if chaine:
                if esc: esc = False
                elif c == '\\': esc = True
                elif c == '"': chaine = False
            elif c == '"': chaine = True
            elif c == '{': prof += 1
            elif c == '}':
                prof -= 1
                if prof == 0: break
            j += 1
        try:
            o = json.loads(t[i:j + 1])
            if isinstance(o, dict) and 'repliques' in o: out.append(o)
        except Exception:
            pass
        i = j + 1
    return out


def recharge(scene, n, journal=print):
    import ton, histoires
    pretes = SV.scenes_pretes()
    if scene not in pretes: journal(f'{scene} : scène non prête'); return 0
    acteurs = pretes[scene]; R = SV.reserve(); deja = {_norm(r['texte']) for s in R for r in s['repliques'] if r.get('chute')}
    ex = [s for s in R if s.get('image') == scene][:2]
    lieu = ex[0]['lieu'] if ex else scene
    faits, essais = [], 0
    while len(faits) < n and essais < 4:
        essais += 1
        try: brut = _json(histoires.llm(consigne(scene, acteurs, ex, min(6, n - len(faits) + 2)), temp=0.9))
        except Exception as e: journal(f'{scene} : écriture impossible ({str(e)[:120]})'); break
        for b in brut:
            try:
                rep = [{'qui': r['qui'].upper().strip(), 'texte': r['texte'].strip(), 'jeu': r.get('jeu') if r.get('jeu') in JEUX else 'malice'} for r in b['repliques']]
                if {r['qui'] for r in rep} - set(acteurs): continue
                for r in rep: r['a'] = [a for a in acteurs if a != r['qui']][0]
                rep[-1]['chute'] = True; rep[-1]['jeu'] = 'camera'
                if _norm(rep[-1]['texte']) in deja: continue
                autre = [a for a in acteurs if a != rep[-1]['qui']][0]
                s = {'id': f"{scene.split('-')[0]}-{hashlib.sha1(rep[-1]['texte'].encode()).hexdigest()[:8]}", 'titre': b['titre'].upper().strip()[:40],
                     'lieu': lieu, 'image': scene, 'acteurs': acteurs, 'mecanique': b.get('mecanique'),
                     'ressort': {'qui': (b.get('ressort') or {}).get('qui', rep[-1]['qui']).upper(), 'trait': (b.get('ressort') or {}).get('trait', '')},
                     'mise_en_scene': f'{lieu} ; {autre} figé après la chute', 'objets': [], 'repliques': rep,
                     'reaction': {'qui': autre, 'jeu': 'choc', 'duree_s': 3.0, 'plan': 'gros plan fixe', 'note': f'{autre} figé'},
                     'source': f"recharge {os.environ.get('HISTOIRES_MODELE') or histoires.LLM_MODELE}"}
                d, _ = ton.controle(s)
                if d: continue
                faits.append(s); deja.add(_norm(rep[-1]['texte']))
            except Exception:
                continue
    if faits:
        T = json.load(open(SV.STOCK, encoding='utf-8')); T['sketchs'].extend(faits[:n])
        json.dump(T, open(SV.STOCK, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    journal(f'{scene} : {len(faits[:n])} sketch(s) neuf(s) conformes ({essais} appel(s) au modèle)')
    return len(faits[:n])


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'tout':
        n = int(a[1]) if len(a) > 1 else 6; mini = int(a[2]) if len(a) > 2 else 12; deja = SV.tournes()
        for sc in SV.scenes_pretes():
            libres = sum(1 for s in SV.reserve() if s.get('image') == sc and s['id'] not in deja)
            if libres < mini: recharge(sc, n)
    else: recharge(a[0], int(a[1]) if len(a) > 1 else 6)
