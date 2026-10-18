# PUBLICATION VIRALE MESURÉE (18/10/2026, « étudie toutes les techniques de publication qui vont rendre les miennes virales »).
# CE QUE DIT TIKTOK (« How TikTok recommends videos #ForYou », newsroom officielle) : signaux FORTS = finir une vidéo longue,
# partager, commenter, s'abonner ; la légende, le son et les mots-dièse décrivent la vidéo ; le nombre d'abonnés et les
# succès passés ne sont PAS des facteurs directs ; pays et langue pèsent peu. Rémunération (Creator Rewards) : contenu
# original de plus d'une minute (nos épisodes ≈ 70 s). Les chiffres des blogs (taux de complétion « viral », nombre
# idéal de mots-dièse) n'ont pas de source primaire : ils ne sont pas codés, nos propres chiffres les remplacent.
# TECHNIQUES ET CE QUE LE CODE EN FAIT :
#   1. accroche ≤ 3 s + boucle ouverte (« attends le dernier ») : dans le film (marque.py) ; la légende la prolonge ;
#   2. partage (signal fort) → appel au partage CIBLÉ, tiré de l'histoire (« envoie-la à ton ami qui… ») ;
#   3. commentaire (signal fort) → question à camps tirée des duos de l'épisode (« team Coumba ou team Koffi ? ») ;
#   4. recherche TikTok : mots-clés réellement dits dans le film (sujet de chaque sketch, lieu) en tête de légende ;
#   5. mots-dièse : 5 au plus — niche (#humourivoirien #abidjan), large (#humour #sketch), série (#nomdelachaine) ;
#   6. couverture : l'instant du premier choc (visage le plus expressif, « LE CHOC ! ») au lieu de la première image ;
#   7. série : « Épisode N » dans la légende, même créneau d'un jour à l'autre ;
#   8. créneaux : hypothèse de départ midi et soir à Abidjan (UTC+0), jamais 1 h–5 h ; puis APPRIS sur les chiffres réels
#      du compte (API Display : vues, partages, commentaires de chaque vidéo) — échantillonnage de Thompson ;
#   9. JEV choisit la légende parmi plusieurs styles (probabilité de partage ET de commentaire) et refuse toute promesse
#      que la vidéo ne tient pas (le leurre fait fuir avant la fin : signal fort perdu).
import json, os, random, re, unicodedata

ICI = os.path.dirname(os.path.abspath(__file__))
CRENEAUX_DEPART = ['12:30', '19:30']   # Abidjan, UTC+0 — hypothèse, remplacée par l'apprentissage dès 6 vidéos mesurées
NICHE = ['#humourivoirien', '#abidjan', '#cotedivoire', '#humourafricain', '#nouchi']
LARGE = ['#humour', '#sketch', '#drole', '#famille']


def _sans(s):
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode()


def _tag(s):
    return '#' + re.sub(r'[^a-z0-9]', '', _sans(s).lower())


def marque():
    for f in (os.path.join(ICI, '..', '..', 'workbench', '.private', 'marque', 'marque.json'), os.path.expanduser('~/.massamba-prive/marque/marque.json')):
        try: return json.load(open(f, encoding='utf-8'))
        except (OSError, ValueError): pass
    return {}


def numero(dossier_episode):
    m = re.search(r'(\d+)', os.path.basename(os.path.abspath(dossier_episode)))
    return int(m.group(1)) if m else None


def _duos(H):
    """(personnage qui se trompe, personnage qui a raison) par sketch : le ressort désigne le premier."""
    out = []
    for s in H.get('sketchs', []):
        a = s.get('acteurs') or []; r = (s.get('ressort') or {}).get('qui')
        if len(a) >= 2: out.append((r or a[0], next((x for x in a if x != r), a[1]), s))
    return out


def _nom(n):
    return ' '.join(w.capitalize() for w in n.lower().split())


def variantes(H, ep=None, m=None):
    """quatre légendes de styles différents, toutes vraies (elles décrivent ce que la vidéo montre)."""
    m = m or {}; duos = _duos(H); titres = [s.get('titre', '').capitalize() for s in H.get('sketchs', []) if s.get('titre')]
    tete = (f'Épisode {ep} · ' if ep else '') + ' · '.join(titres)
    a, b, s0 = duos[0] if duos else ('', '', {})
    trait = ((s0.get('ressort') or {}).get('trait') or '').split(':')[0].strip()
    tags = ([_tag(m['nom'])] if m.get('nom') else []) + NICHE[:2] + LARGE[:2]
    pied = ' '.join(tags[:5])
    V = {
        'camp': f"{tete} 😂\nTeam {_nom(b)} ou team {_nom(a)} ? Dis-le en commentaire 👇",
        'partage': f"{tete} 😂\nEnvoie-la à ton ami qui fait exactement comme {_nom(a)} 🤣" + (f" ({trait})" if trait else ''),
        'suspense': f"{tete}\nLe dernier sketch est le pire… tu as tenu jusqu'au bout ? 😭👇",
        'reconnaissance': f"{tete} 😂\nOn a tous un {_nom(a)} dans la famille… c'est qui chez toi ? 👇",
    }
    return {k: f'{v}\n{pied}' for k, v in V.items()}


def choisit(V, H, outil='viral'):
    """JEV : probabilité qu'un spectateur ivoirien partage / commente après avoir vu l'épisode, et refus du leurre."""
    if os.environ.get('VIRAL_SANS_JEV') == '1': return 'camp', V['camp'], {'jev': 'désactivé (essai hors ligne)'}
    try:
        import jev_api
        etat = {'episode': {'sketchs': [{'titre': s.get('titre'), 'repliques': [r.get('texte') for r in s.get('repliques', [])][:8]}
                                        for s in H.get('sketchs', [])]}, 'legendes': V}
        Q = {}
        for k in V:
            Q[f'partage|{k}'] = {'type': 'noul', 'instructions': f'A viewer in Côte d\'Ivoire just watched the comedy episode in `episode`. '
                                 f'Reading the caption `legendes.{k}`, would they send this video to a friend or family member?'}
            Q[f'commente|{k}'] = {'type': 'noul', 'instructions': f'Would the caption `legendes.{k}` make a viewer of `episode` write a comment?'}
            Q[f'leurre|{k}'] = {'type': 'noul', 'instructions': f'Does the caption `legendes.{k}` promise something the episode `episode` does not show?'}
        r = jev_api.demande(etat, Q, outil=outil)
        sc = {k: round(float(r[f'partage|{k}']['noul']) + float(r[f'commente|{k}']['noul']), 3) for k in V if float(r[f'leurre|{k}']['noul']) < 0.5}
        if sc: k = max(sc, key=sc.get); return k, V[k], sc
    except Exception as e:
        return 'camp', V['camp'], {'jev': f'indisponible ({str(e)[:80]})'}
    return 'camp', V['camp'], {}


def titres(sketchs, candidats, outil='viral_titres'):
    """TITRES QUI DONNENT ENVIE (18/10/2026, épisode 2 : « LES ASSIETTES » 0,38 et « LE COURANT » 0,42 à la porte O,
    « titre_accroche ») : pour chaque sketch, JEV note les titres candidats — envie de regarder ET chute non dévoilée —
    et garde le meilleur au-dessus de 0,5 ; sinon le titre d'origine reste et la porte O le signalera.
    sketchs : liste de sketchs (histoire.json) ; candidats : {id: [titres]} → {id: (titre retenu, score, {titre: score})}."""
    import jev_api
    out = {}
    for S in sketchs:
        C = [c.upper() for c in candidats.get(S['id'], [])] + [S.get('titre', '').upper()]
        etat = {'sketch': {'repliques': [r.get('texte') for r in S.get('repliques', [])]}, 'titres': {f't{i}': c for i, c in enumerate(C)}}
        Q = {}
        for i in range(len(C)):
            Q[f'envie|{i}'] = {'type': 'noul', 'instructions': f'`titres.t{i}` is the title card of the short comedy sketch `sketch` (Côte d\'Ivoire). Does this title make a viewer want to watch the sketch (catchy, funny, intriguing)?'}
            Q[f'devoile|{i}'] = {'type': 'noul', 'instructions': f'Does the title `titres.t{i}` give away the final punchline of `sketch` before it is said?'}
        r = jev_api.demande(etat, Q, outil=outil)
        sc = {i: round(float(r[f'envie|{i}']['noul']), 3) for i in range(len(C)) if float(r[f'devoile|{i}']['noul']) < 0.5}
        i = max(sc, key=sc.get) if sc else len(C) - 1
        out[S['id']] = (C[i], sc.get(i, 0.0), {C[k]: v for k, v in sc.items()})
    return out


def couverture_ms(T, defaut=1200):
    """instant du premier choc (réaction la plus expressive, bande « LE CHOC ! ») ; défaut : l'accroche."""
    try:
        import jeu
        ch = [jeu.prise_t(L) for L in T.get('lines', []) if L.get('chute')]
        return int((min(ch) + 0.35) * 1000) if ch else defaut
    except Exception:
        return defaut


def creneau(publications, stats, graine=None):
    """créneau de la prochaine publication : Thompson sur (partages + commentaires) / vues par créneau, à partir des chiffres
    réels du compte ; au départ, les créneaux d'hypothèse. publications : journal ({'publish_id'|'video_id', 'creneau'}) ;
    stats : {video_id: {'view_count', 'share_count', 'comment_count'}}."""
    rng = random.Random(graine); par = {c: [1.0, 1.0] for c in CRENEAUX_DEPART}
    mesures = 0
    for p in publications:
        s = stats.get(p.get('video_id') or '') if p.get('video_id') else None
        c = p.get('creneau')
        if not s or not c: continue
        v = max(1, int(s.get('view_count', 0))); k = int(s.get('share_count', 0)) + int(s.get('comment_count', 0))
        par.setdefault(c, [1.0, 1.0]); par[c][0] += k; par[c][1] += max(0, v - k); mesures += 1
    if mesures < 6: return CRENEAUX_DEPART[len(publications) % len(CRENEAUX_DEPART)], 'hypothèse de départ'
    tir = {c: rng.betavariate(a, b) for c, (a, b) in par.items()}
    return max(tir, key=tir.get), f'appris sur {mesures} vidéos'


def prepare(D, dossier_episode=None):
    """→ {'legende', 'style', 'scores', 'couverture_ms'} pour la version D ; écrit D/publication.json."""
    D = os.path.abspath(D); E = dossier_episode or os.path.dirname(D)
    H = json.load(open(os.path.join(E, 'histoire.json'), encoding='utf-8')) if os.path.isfile(os.path.join(E, 'histoire.json')) else {}
    T = json.load(open(os.path.join(E, 'timeline.json'), encoding='utf-8')) if os.path.isfile(os.path.join(E, 'timeline.json')) else {}
    V = variantes(H, numero(E), marque()); style, leg, sc = choisit(V, H)
    cred = ''
    f = os.path.join(D, 'legende.txt')
    if os.path.isfile(f):
        t = open(f, encoding='utf-8').read(); i = t.find('Crédits')
        cred = t[i:].strip() if i >= 0 else ''
    out = {'legende': (leg + ('\n\n' + cred if cred else ''))[:2200], 'style': style, 'scores': sc, 'variantes': V,
           'couverture_ms': couverture_ms(T)}
    json.dump(out, open(os.path.join(D, 'publication.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return out


if __name__ == '__main__':
    import sys
    print(json.dumps(prepare(sys.argv[1]), ensure_ascii=False, indent=1))
