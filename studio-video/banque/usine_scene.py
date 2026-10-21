# USINE DE SCÈNE (21/10/2026) — « on doit tourner 10 000 » : un sketch accepté (machine à histoires, plancher V17 passé)
# devient une vidéo sans geste à la main :
#  1. clips de la banque des acteurs du sketch (branches banque-sortie-*, version la plus haute gardée par assemble) ;
#  2. décor du lieu dessiné par la bible (vue « champ » de jour, sinon plan large), à la version en vigueur (bible.REFAIRE) ;
#  3. voix, plan et montage (scene.plan + assemble.assemble), ambiance réelle du lieu.
# Les fichiers des branches sont scellés : la clé privée de Claude les ouvre en mémoire, rien en clair dans le dépôt.
#   python3 usine_scene.py SKETCH.json CLE_CLAUDE.priv.pem CACHE DOSSIER SORTIE.mp4   → résumé JSON (temps par étape)
import json, os, subprocess, sys, time

ICI = os.path.dirname(os.path.abspath(__file__)); DEPOT = os.path.abspath(os.path.join(ICI, '..', '..'))
sys.path.insert(0, ICI); sys.path.insert(0, os.path.join(ICI, '..', 'fabrique')); sys.path.insert(0, os.path.join(ICI, '..', 'images'))
VUES = ('champ-jour', 'large-jour')   # la vue rapprochée d'abord (scène 2 du 21/10 : personnages plus lisibles)
# lieux dessinés de l'intérieur où des acteurs en pied ne tiennent pas debout (21/10 03:45 : Aliou et Agent Doumbia debout entre
# les sièges du taxi) → la scène se joue dans un décor où l'on se tient debout
DECOR_DU_LIEU = {'Taxi': 'Rue'}


def _git(*a, **k):
    return subprocess.run(['git', '-C', DEPOT, *a], capture_output=True, **k)


def _branches(prefixe):
    out = _git('ls-remote', 'origin', f'refs/heads/{prefixe}*', text=True).stdout.split()
    brs = [r.split('refs/heads/')[1] for r in out if r.startswith('refs/heads/')]
    for b in brs: _git('fetch', '-q', 'origin', f'+refs/heads/{b}:refs/remotes/origin/{b}')
    return brs


def _ouvre(br, f, priv):
    import coffre
    return coffre.ouvre_octets(_git('show', f'origin/{br}:{f}').stdout, priv)


def clips(acteurs, priv, cache):
    """gestes des acteurs à la version en vigueur (banque.VERSIONS), ouverts une fois dans le cache partagé. Un clip d'une
    version plus basse (tourné depuis une découpe fautive) n'est jamais ouvert : assemble prendrait sinon l'ancien geste quand
    le nouveau n'est pas encore tourné. Les gestes parler et écouter sont exigés à la bonne version."""
    import banque
    os.makedirs(cache, exist_ok=True); n = 0
    def version(f): return int(f[:-4].rsplit('@', 1)[1]) if '@' in f else 1
    for br in _branches('banque-sortie-'):
        for f in _git('ls-tree', '--name-only', f'origin/{br}', text=True).stdout.split():
            p = f.split('--')[0]
            if not f.endswith('.msb') or p not in acteurs or version(f) < banque.VERSIONS.get(p, 1): continue
            if not os.path.exists(os.path.join(cache, f[:-4] + '.mp4')):
                open(os.path.join(cache, f[:-4] + '.mp4'), 'wb').write(_ouvre(br, f, priv)); n += 1
    def present(a, g):
        v = banque.VERSIONS.get(a, 1)
        return any(x == f'{a}--{g}.mp4' and v == 1 or x.startswith(f'{a}--{g}@') and version(x) >= v for x in os.listdir(cache))
    manque = [f'{a} ({g})' for a in acteurs for g in ('parler', 'ecouter') if not present(a, g)]
    return n, manque


def decor(lieu, priv, cache):
    """décor du lieu à la version en vigueur de la bible ; → chemin du PNG."""
    import bible, scene
    versions = {t['id']: t.get('version', 1) for t in bible.taches()}
    s = scene.slug(lieu); trouves = {}; os.makedirs(cache, exist_ok=True)
    for br in _branches('bible-sortie-'):
        noms = _git('ls-tree', '--name-only', f'origin/{br}', text=True).stdout.split()
        mes = json.loads(_git('show', f'origin/{br}:mesure.json', text=True).stdout or '{}').get('taches', []) if 'mesure.json' in noms else []
        v = {e['tache']: e.get('version', 1) for e in mes if e.get('ok')}
        for vue in VUES:
            i = f'decor-{s}-{vue}'
            if f'{i}.msb' in noms and v.get(i, 1) >= versions.get(i, 1): trouves[i] = br
    for vue in VUES:
        i = f'decor-{s}-{vue}'
        if i in trouves:
            png = os.path.join(cache, i + '.png')
            if not os.path.exists(png): open(png, 'wb').write(_ouvre(trouves[i], i + '.msb', priv))
            return png
    raise SystemExit(f'aucun décor à jour pour « {lieu} » ({", ".join(VUES)})')


def tourne(sketch, cle, cache, dossier, sortie):
    from cryptography.hazmat.primitives import serialization
    import scene, assemble
    priv = serialization.load_pem_private_key(open(cle, 'rb').read(), None)
    h = json.load(open(sketch, encoding='utf-8')); lieu = h.get('lieu_bible') or h.get('lieu'); lieu = DECOR_DU_LIEU.get(lieu, lieu)
    acteurs = sorted({scene.slug(r['qui']) for r in h['repliques']}); T = {}; t0 = time.time()
    n, manque = clips(acteurs, priv, os.path.join(cache, 'clips'))
    if manque: raise SystemExit(f'gestes pas encore tournés pour : {", ".join(manque)}')
    d = decor(lieu, priv, os.path.join(cache, 'decors')); T['ouverture_s'] = round(time.time() - t0, 1); t1 = time.time()
    plan = scene.plan(h, d, os.path.join(cache, 'clips'), dossier, lieu); T['voix_s'] = round(time.time() - t1, 1); t2 = time.time()
    r = assemble.assemble(plan, sortie); T['montage_s'] = round(time.time() - t2, 1); t3 = time.time()
    # PORTE V1 (21/10/2026) — « toutes les vidéos devront avoir ou dépasser les mesures de la V1. Même l'humour » : même mesure que
    # la V1 publiée (niveau_v1.profil, bande de la scène de l'assembleur), humour = duel du sketch contre la V1 (plancher V17)
    sys.path.insert(0, os.path.join(ICI, '..', 'moteur-troupe')); import niveau_v1
    p = niveau_v1.profil(sortie, (assemble.BY / assemble.H_, (assemble.BY + assemble.BH) / assemble.H_))
    e = niveau_v1.ecarts(p, humour=h.get('plancher_v17')); T['mesure_v1_s'] = round(time.time() - t3, 1)
    # « les améliorer sans régression » : comparé aussi à la dernière vidéo de l'usine (aucun critère ne doit reculer)
    dern = os.path.join(os.path.dirname(os.path.abspath(sortie)), 'usine-dernier-profil.json')
    rg = niveau_v1.regressions(p, json.load(open(dern))) if os.path.isfile(dern) else []
    bulletin = {'profil': p, 'reference_v1': niveau_v1.reference(), 'sous_la_V1': e, 'regressions': rg,
                'statut': 'a_corriger' if (e or rg) else 'depasse_la_v1'}
    json.dump(p, open(dern, 'w'), ensure_ascii=False)
    json.dump(bulletin, open(sortie + '.v1.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return {'sketch': h.get('titre'), 'lieu': lieu, 'acteurs': acteurs, 'decor': os.path.basename(d), 'clips_ouverts': n,
            'video': sortie, 'duree_s': r.get('duree_s'), 'niveau_v1': bulletin['statut'], 'sous_la_V1': len(e), **T,
            'total_s': round(time.time() - t0, 1)}


if __name__ == '__main__':
    print(json.dumps(tourne(*sys.argv[1:6]), ensure_ascii=False, indent=1))
