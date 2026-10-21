# ÉCRITURE SUR LES MACHINES GITHUB (21/10/2026) — « on doit tourner 10 000 [vidéos] » : le scénariste gratuit sans clé
# (Pollinations, GPT-OSS 20B) n'a passé le plancher V17 que sur 1 sketch sur 12 essais ; GitHub Models, autre voie gratuite,
# a fermé le 30/07/2026. Greffe : un modèle ouvert servi par llama.cpp (MIT, llama-server compatible OpenAI) sur chaque machine
# GitHub, branché sur histoires.llm par HISTOIRES_URL — aucun compte, aucune clé, aucun quota. Le JUGE ne change pas
# (histoires.llm(juge=True) : Pollinations GPT-OSS 20B, calibré), pour que les scénaristes soient comparés à règle égale.
# Duel mesuré : Ministral 3 14B (Apache-2.0, déc. 2025) contre Mistral Small 3.2 24B (Apache-2.0) contre le scénariste actuel.
# Chaque appel à histoires.une part d'un registre neuf : un sketch n'est accepté que s'il passe les contrôles du code, le juge
# et le PLANCHER V17 (probabilité ≥ 0,5 de faire plus rire que les trois sketchs de l'épisode publié V17).
#   python3 histoires_tourne.py MODELE PART PARTS MINUTES SORTIE CLE_CLAUDE.pub.pem
#   → SORTIE/histoire-*.msb (sketchs acceptés, scellés pour Claude), SORTIE/mesure-MODELE-PART.json (chiffres seuls),
#     SORTIE/journal-MODELE-PART.msb (journal scellé : il cite les titres)
import json, os, random, re, sys, time, unicodedata

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI); sys.path.insert(0, os.path.join(ICI, '..', 'fabrique'))
import histoires as H, coffre

MARGE = 25 * 60   # on n'ouvre plus de lieu à moins de 25 min de la fin (un lieu = jusqu'à 2 tours de 3 brouillons)
# DISTRIBUTION BORNÉE (21/10/2026) : la Cour réunit 26 personnages de la banque, leurs 26 fiches faisaient ≈ 7 200 jetons de
# consigne, plus que la place d'un emplacement du serveur (6 144) : 6 brouillons de Ministral sur 6 illisibles. Un sketch se
# joue à 2-4 : chaque essai tire au plus 5 personnages du lieu (≈ 4 300 jetons), le même tirage pour tous les scénaristes.
DISTRIBUTION_MAX = 5


def slug(t):
    return re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()).strip('-')


def lieux_de_la_part(part, parts):
    """lieux où au moins 2 personnages de la banque (clips tournés) se croisent ; même ordre sur toutes les machines, pour que
    chaque scénariste reçoive les mêmes lieux à la même part."""
    troupe = json.load(open(os.path.join(ICI, '..', 'banque', 'troupe.json'), encoding='utf-8'))
    noms = {slug(p['name']): p['name'] for p in H.BIBLE['personnages']}
    D = sorted(H.distributions([noms[s] for s in troupe['personnages'] if s in noms]).items())
    return [d for i, d in enumerate(D) if i % parts == part]


def cle_des_chutes():
    """clé du registre commun : HKDF de la clé privée RSA-4096 de la fabrique (branche fabrique-donnees, ouverte par la phrase
    FABRIQUE_CLE avec PBKDF2 600 000 tours, coffre._priv) ; None sans la phrase (essai local) ou si la clé est introuvable."""
    phrase = os.environ.get('FABRIQUE_CLE', '')
    if not phrase: return None
    import subprocess, tempfile
    from cryptography.hazmat.primitives import serialization
    depot = os.path.abspath(os.path.join(ICI, '..', '..'))
    try:
        subprocess.run(['git', '-C', depot, 'fetch', '-q', 'origin', 'fabrique-donnees'], capture_output=True, timeout=120)
        j = subprocess.run(['git', '-C', depot, 'show', 'FETCH_HEAD:cle.priv.json'], capture_output=True, timeout=60).stdout
        with tempfile.NamedTemporaryFile(suffix='.json') as f:
            f.write(j); f.flush(); k = coffre._priv(f.name, phrase)
        return H.cle_empreinte(k.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    except Exception as e:
        print(f'registre commun des chutes : clé introuvable ({type(e).__name__})', flush=True); return None


def empreintes_des_machines(sortie):
    """registre commun (histoires.CHUTES_AUTRES) : les empreintes publiées par toutes les machines sur leurs branches
    histoires-sortie-* (poussées toutes les 5 min par le workflow), plus celles de cette machine, reprises de sa branche."""
    import subprocess
    depot = os.path.abspath(os.path.join(ICI, '..', '..'))
    def g(*a): return subprocess.run(['git', '-C', depot, *a], capture_output=True, text=True, timeout=120).stdout
    E = []
    try:
        g('fetch', '-q', 'origin', '+refs/heads/histoires-sortie-*:refs/remotes/origin/histoires-sortie-*')
        for b in g('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/histoires-sortie-*').split():
            for f in g('ls-tree', '--name-only', b).split():
                if f.startswith('chutes-') and f.endswith('.json'):
                    E += json.loads(g('show', f'{b}:{f}') or '{}').get('empreintes', [])
    except Exception as e:
        print(f'registre commun des chutes injoignable : {e}', flush=True)
    for f in os.listdir(sortie):
        if f.startswith('chutes-') and f.endswith('.json'): E += json.load(open(os.path.join(sortie, f))).get('empreintes', [])
    return list({frozenset(e) for e in E})


def main(modele, part, parts, minutes, sortie, pub_claude):
    part, parts, fin = int(part), int(parts), time.time() + float(minutes) * 60
    pub = coffre._pub(pub_claude); os.makedirs(sortie, exist_ok=True)
    clair = sortie + '-clair'; os.makedirs(clair, exist_ok=True)
    stats = {'modele': modele, 'part': part, 'appels_scenariste': 0, 'secondes_scenariste': 0.0, 'echecs_scenariste': 0,
             'appels_juge': 0, 'echecs_juge': 0, 'brouillons_refuses_controle': 0, 'planchers_v17': [], 'notes': [],
             'acceptes': 0, 'lieux': []}
    vrai_llm = H.llm

    def llm(prompt, temp=1.0, juge=False):   # compteur de chaque appel (le module appelle llm par son nom global)
        t0 = time.time()
        try: r = vrai_llm(prompt, temp, juge)
        except Exception:
            stats['echecs_juge' if juge else 'echecs_scenariste'] += 1; raise
        if juge: stats['appels_juge'] += 1
        else: stats['appels_scenariste'] += 1; stats['secondes_scenariste'] += time.time() - t0
        return r
    H.llm = llm
    lignes = []

    import threading
    dernier = [time.time()]; verrou = threading.Lock()

    def journal(t):
        lignes.append(t); print(t, flush=True)
        if 'brouillon refusé' in t: stats['brouillons_refuses_controle'] += 1
        if 'brouillon illisible' in t: stats['brouillons_illisibles'] = stats.get('brouillons_illisibles', 0) + 1
        m = re.search(r'réparation \d+ : (\d+) défaut\(s\) → (\d+)', t)
        if m: stats.setdefault('reparations', []).append([int(m.group(1)), int(m.group(2))])
        m = re.search(r'plancher V17 : ([0-9.]+)', t)
        if m: stats['planchers_v17'].append(float(m.group(1)))
        m = re.search(r'note ([0-9.]+) \(drôle', t)
        if m: stats['notes'].append(float(m.group(1)))
        # mesure écrite au fil de l'essai (au plus une fois par minute) : un essai dure 15 à 30 min, la poussée a lieu toutes
        # les 5 min — le chronométrage du scénariste se lit avant la fin du premier lieu (21/10 07:55)
        if time.time() - dernier[0] > 60 and verrou.acquire(blocking=False):   # journal est appelé par plusieurs fils
            try:
                dernier[0] = time.time(); ecrit()
            except Exception: pass
            finally: verrou.release()

    def temps():   # 21/10/2026 : lecture de la consigne (dont la part reprise du cache) et écriture, par rôle, selon llama-server
        out = {}
        for role, juge in (('scenariste', False), ('juge', True)):
            T = [t for t in H.TEMPS if t['juge'] == juge and t.get('prompt_ms') is not None]
            if not T: continue
            S = {k: sum(t.get(k) or 0 for t in T) for k in H.TEMPS_CLES}
            out[role] = {'appels': len(T), 'tronques': sum(1 for t in T if t.get('fin') == 'length'),
                         'lus_jetons': round(S['prompt_n'] / len(T)), 'cache_jetons': round(S['cache_n'] / len(T)),
                         'lecture_s': round(S['prompt_ms'] / 1000 / len(T), 1), 'ecriture_jetons': round(S['predicted_n'] / len(T)),
                         'ecriture_s': round(S['predicted_ms'] / 1000 / len(T), 1),
                         'jetons_par_s': round(S['predicted_n'] / max(1e-9, S['predicted_ms'] / 1000), 1)}
        return out

    def ecrit():
        s = dict(stats, secondes_par_brouillon=round(stats['secondes_scenariste'] / max(1, stats['appels_scenariste']), 1), temps=temps())
        json.dump(s, open(os.path.join(sortie, f'mesure-{modele}-{part}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        open(os.path.join(sortie, f'journal-{modele}-{part}.msb'), 'wb').write(coffre.scelle_octets('\n'.join(lignes).encode(), pub))

    # porte « drôle » (histoires.DROLE_MIN) : le juge de la machine note d'abord les trois sketchs publiés de la V17
    if os.environ.get('HISTOIRES_PORTE_V17', '1') == '1':
        nv = [H._essai(lambda v=v: H.juge(v)) for v in H.V17]; dr = [n['drole'] for n in nv if n]
        if dr: H.DROLE_MIN = min(dr)
        stats['drole_v17'] = dr; stats['choc_v17'] = [n['choc'] for n in nv if n]
        journal(f"porte V17 : drôle {dr} → au moins {H.DROLE_MIN}/4 pour aller au plancher"); ecrit()
    # calibrage du juge à chaque tour, sur une seule machine (21/10 : la consigne du juge a changé d'ordre) — mêmes épreuves que
    # juge_calibre.py : V17 contre elle-même → 0,5 ; V17 contre sa version sans chute → 0,625 au calibrage d'origine
    if str(part) == os.environ.get('HISTOIRES_CALIBRE_PART', '0'):
        import juge_calibre
        c = {'meme': [], 'avec_sans_chute': []}
        for v in H.V17:
            for cle, b in (('meme', v), ('avec_sans_chute', juge_calibre.sans_chute(v))):
                x = H._essai(lambda: H.duel(v, b))
                if x is not None: c[cle].append(x)
        stats['calibrage'] = {k: round(sum(x) / len(x), 3) if x else None for k, x in c.items()}
        journal(f"calibrage du juge : {stats['calibrage']} (attendu 0,5 et ≈ 0,625)"); ecrit()
    # registre commun des chutes (histoires.deja_ailleurs) : clé tirée de la clé privée de la fabrique, jamais écrite nulle part
    H.CLE_EMPREINTE = cle_des_chutes(); stats['registre_commun'] = bool(H.CLE_EMPREINTE)
    mes_chutes = os.path.join(sortie, f'chutes-{modele}-{part}.json')
    miennes = json.load(open(mes_chutes)).get('empreintes', []) if os.path.exists(mes_chutes) else []
    L = lieux_de_la_part(part, parts); k = 0
    while L and time.time() + MARGE < fin:
        if H.CLE_EMPREINTE:
            H.CHUTES_AUTRES = empreintes_des_machines(sortie); stats['chutes_registre_commun'] = len(H.CHUTES_AUTRES)
        lieu, acteurs = L[k % len(L)]
        acteurs = sorted(random.Random(f'{lieu}-{k}').sample(acteurs, min(DISTRIBUTION_MAX, len(acteurs))))
        cle = H.distribution(lieu, acteurs); dossier = os.path.join(clair, f'{slug(lieu)}-{k}'); os.makedirs(dossier, exist_ok=True)
        journal(f'=== {lieu} ({len(acteurs)} personnages), essai {k}'); t0 = time.time()
        i = H._essai(lambda: H.une(dossier, cle, tours_max=2, journal=journal))
        stats['lieux'].append({'lieu': lieu, 'accepte': bool(i), 'secondes': round(time.time() - t0)})
        if i:
            stats['acceptes'] += 1
            h = json.load(open(os.path.join(dossier, f'{i}.json'), encoding='utf-8'))
            h['scenariste'] = modele
            H.CHUTES_DEJA.extend(r['texte'] for r in h['repliques'] if r.get('chute'))   # plus de reformulation sur cette machine
            if H.CLE_EMPREINTE:   # et sur les autres : l'empreinte part avec la prochaine poussée de la branche
                miennes += [sorted(H.empreinte(r['texte'], H.CLE_EMPREINTE)) for r in h['repliques'] if r.get('chute')]
                json.dump({'empreintes': miennes}, open(mes_chutes, 'w'))
            # nom propre à chaque tour de machines (GITHUB_RUN_ID) : une relance n'écrase plus les sketchs déjà acceptés
            open(os.path.join(sortie, f"histoire-{modele}-{part}-{os.environ.get('GITHUB_RUN_ID', 'local')}-{k}.msb"), 'wb').write(
                coffre.scelle_octets(json.dumps(h, ensure_ascii=False).encode(), pub))
        stats['doublons_autres_machines'] = H.DOUBLONS_AILLEURS[0]; k += 1; ecrit()
    ecrit(); print(json.dumps({k: v for k, v in stats.items() if k != 'lieux'}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main(*sys.argv[1:7])
