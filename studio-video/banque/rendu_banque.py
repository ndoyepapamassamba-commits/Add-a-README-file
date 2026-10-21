# ÉPISODE DE LA BANQUE AU FORMAT DE LA V1 (21/10/2026) — « des vidéos de 1 minute doivent être publiées regroupant 3 sketchs,
# même format que V1 » ; « généraliser les changements pour pousser la V1 à toutes les vidéos ».
# La V1 sort de la chaîne de l'usine : voix.py (minutage de la chaîne, cartes entre sketchs, réaction tenue, durée > 1 min) →
# musique.py → ambiance.py → tourne.py (images de la scène 576 × 460) → compose.py (habillage : pastille « SKETCH n/3 », titre,
# bandeau « PARTAGE À TA FAMILLE », sous-titres mot à mot, vote, son masterisé, fichier TikTok). Ici, seul tourne.py (qui
# ne connaît que les 7 personnages peints de la V1) est remplacé : les images de la scène viennent de la banque des 54
# personnages, montées avec la grammaire de la V1 (camera_v1.py, assemble.bande_v1), au même format et à la même cadence ;
# tout le reste est la chaîne de la V1, inchangée.
#   python3 rendu_banque.py EPISODE VERSION CLE_CLAUDE.priv.pem CACHE   (EPISODE : histoire.json, timeline.json, voix/)
import json, os, sys, time
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI); sys.path.insert(0, os.path.join(ICI, '..', 'moteur-troupe'))
FPS, CW, CH = 30, 576, 460      # cadence et image de la scène de la V1 (tourne.FPS, CW, CH)


def _grille(t):
    return round(t * FPS)


def plan_sketch(S, lignes, t0, t1, decor, banque):
    """plan de montage d'un sketch (même forme que scene.plan) à partir du minutage de voix.py : chaque réplique commence quand
    sa voix commence (la synchro des lèvres part de la première image), l'attente avant la 1re réplique et la réaction tenue
    après la chute sont des segments sans voix."""
    import bible, scene
    fiches = {p['name']: p for p in json.load(open(bible.PERSONNAGES, encoding='utf-8'))['personnages']}
    noms = list(dict.fromkeys([L['qui'] for L in lignes] + list(S.get('acteurs') or [])))
    acteurs = {}
    for nom, x in scene.places(noms).items():
        age = bible.age_de(fiches.get(nom, {}))
        acteurs[scene.slug(nom)] = {'x': round(float(x), 3), 'sol': 0.97, 'taille': 0.64 if age < 13 else 0.9, 'regarde': 'gauche' if x > 0.5 else 'droite'}
    R = []; bornes = [_grille(L['t0']) for L in lignes] + [_grille(t1)]
    if bornes[0] > _grille(t0):
        R.append({'_i0': _grille(t0), '_i1': bornes[0], 'reagit': {}})   # la caméra pousse vers ceux qui vont parler
    for k, L in enumerate(lignes):
        fin = bornes[k + 1]
        if k == len(lignes) - 1:   # après la dernière réplique : réaction tenue (choc des autres, rire de l'auteur de la chute)
            fin = min(bornes[k + 1], _grille(L['t0'] + L['dur'] + 0.35))
        R.append({'qui': scene.slug(L['qui']), 'geste': scene.GESTE_DU_JEU.get(L.get('jeu'), 'parler'), 'voix': L['wav'], 'texte': L['texte'],
                  'reagit': {}, 'chute': bool(L.get('chute')), '_i0': bornes[k], '_i1': fin,
                  **({'a': scene.slug(L['a'])} if L.get('a') and scene.slug(L['a']) in acteurs else {})})
    for k, r in enumerate(R[:-1]):   # l'accusé encaisse (choc) avant de répondre (scene.plan)
        if r.get('geste') == 'montrer' and R[k + 1].get('qui') and R[k + 1]['qui'] != r['qui']: r['reagit'] = {R[k + 1]['qui']: 'choc'}
    if R[-1]['_i1'] < _grille(t1):
        ch = next((r for r in R if r.get('chute')), R[-1])
        R.append({'_i0': R[-1]['_i1'], '_i1': _grille(t1), 'reagit': {a: ('rire' if a == ch.get('qui') else 'choc') for a in acteurs}})
    for r in R: r['_t0'] = r['_i0'] / FPS; r['duree'] = (r['_i1'] - r['_i0']) / FPS
    return {'decor': decor, 'titre': S.get('titre', ''), 'banque': banque, 'acteurs': acteurs, 'repliques': [r for r in R if r['_i1'] > r['_i0']]}


def _tache(a):
    """une réplique d'un sketch → ses images JPEG (numérotées sur toute la vidéo)."""
    P, k, gains, dossier = a
    import assemble
    assemble.FPS = FPS; i = [P['repliques'][k]['_i0']]
    def ecrit(img):
        cv2.imwrite(os.path.join(dossier, 'clip', f'f{i[0]:05d}.jpg'), cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 94]); i[0] += 1
    assemble.bande_v1(P, k, gains, ecrit)
    return i[0] - P['repliques'][k]['_i0']


def rend(episode, version, cle, cache):
    from cryptography.hazmat.primitives import serialization
    from concurrent.futures import ProcessPoolExecutor
    import tempfile, assemble, camera_v1, usine_scene, scene
    t_ = time.time(); priv = serialization.load_pem_private_key(open(cle, 'rb').read(), None)
    H = json.load(open(os.path.join(episode, 'histoire.json'), encoding='utf-8')); T = json.load(open(os.path.join(episode, 'timeline.json'), encoding='utf-8'))
    D = os.path.join(episode, version); os.makedirs(os.path.join(D, 'clip'), exist_ok=True)
    assemble.FPS = FPS; camera_v1.SORTIE = (CW, CH); n = _grille(T['total']); taches = []; info = {}
    tmp = tempfile.mkdtemp(prefix='rendu-banque-')
    for S in T['sketchs']:
        HS = next(x for x in H['sketchs'] if x['id'] == S['id']); lieu = HS.get('lieu_bible') or HS.get('lieu'); lieu = usine_scene.DECOR_DU_LIEU.get(lieu, lieu)
        lignes = sorted([L for L in T['lines'] if L['sketch'] == S['id']], key=lambda L: L['t0'])
        acteurs = sorted({scene.slug(L['qui']) for L in lignes} | {scene.slug(a) for a in HS.get('acteurs') or []})
        _, manque = usine_scene.clips(acteurs, priv, os.path.join(cache, 'clips'))
        if manque: raise SystemExit(f'gestes pas encore tournés pour : {", ".join(manque)}')
        decor = usine_scene.decor(lieu, priv, os.path.join(cache, 'decors'))
        P = plan_sketch(HS, lignes, S['t0'], S['t1'], decor, os.path.join(cache, 'clips'))
        gains, inf = assemble.prepare(P, tmp); info[S['id']] = {'lieu': lieu, 'decor': os.path.basename(decor), 'plans': inf.get('plans')}
        taches += [(P, k, gains, D) for k in range(len(P['repliques']))]
    with ProcessPoolExecutor(int(os.environ.get('ASSEMBLE_PROCS', os.cpu_count() or 4))) as ex: list(ex.map(_tache, taches))
    # avant le 1er sketch et pendant les cartes entre sketchs : l'image la plus proche, assombrie comme une carte de la V1
    # (tourne.carte_sur_scene : l'image continue sous l'émoji et le titre posés par compose.py)
    faites = sorted(int(f[1:6]) for f in os.listdir(os.path.join(D, 'clip')) if f.startswith('f'))
    for i in range(n):
        f = os.path.join(D, 'clip', f'f{i:05d}.jpg')
        if os.path.isfile(f): continue
        j = min(faites, key=lambda x: abs(x - i)); im = cv2.imread(os.path.join(D, 'clip', f'f{j:05d}.jpg'))
        cv2.imwrite(f, (im * (0.65 if any(c['t0'] <= i / FPS < c['t1'] for c in T.get('cartes', [])) else 1.0)).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 94])
    for f in os.listdir(os.path.join(D, 'clip')):   # rien au-delà de la durée de la bande son
        if f.startswith('f') and int(f[1:6]) >= n: os.remove(os.path.join(D, 'clip', f))
    json.dump({'images': n, 'fps': FPS, 'banque': True, 'grammaire': 'V1 (camera_v1.py)', 'sketchs': info,
               'reglages': dict(camera_v1.REG, coupe_s=camera_v1.COUPE_S)}, open(os.path.join(D, 'tournage.json'), 'w'), ensure_ascii=False, indent=1)
    return {'images': n, 'secondes': round(time.time() - t_, 1), 'sketchs': info}


def episode(dossier, *sketchs):
    """histoire.json d'un épisode de la banque (3 sketchs de la machine à histoires), à la forme de celles de la V1."""
    import scene
    os.makedirs(dossier, exist_ok=True); S = []; vus = set()
    for f in sketchs:
        h = json.load(open(f, encoding='utf-8')); i = scene.slug(h.get('titre', 'sketch'))[:24] or 'sketch'
        while i in vus: i += '-b'
        vus.add(i); lieu = h.get('lieu_bible') or h.get('lieu')
        S.append({'id': i, 'titre': h.get('titre', '').upper(), 'lieu': lieu, 'lieu_bible': lieu, 'image': scene.slug(lieu or ''),
                  'acteurs': list(dict.fromkeys(h.get('acteurs') or [r['qui'] for r in h['repliques']])),
                  'repliques': [{k: v for k, v in r.items() if k in ('qui', 'texte', 'jeu', 'a', 'chute', 'role')} for r in h['repliques']],
                  **({'reaction': h['reaction']} if h.get('reaction') else {}),
                  **({'plancher_v17': h['plancher_v17']} if h.get('plancher_v17') is not None else {})})
    H = {'titre': ' · '.join(x['titre'] for x in S), 'univers': 'banque (54 personnages, bible V1)', 'sketchs': S}
    json.dump(H, open(os.path.join(dossier, 'histoire.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return os.path.join(dossier, 'histoire.json')


if __name__ == '__main__':
    if sys.argv[1] == 'episode': print(episode(sys.argv[2], *sys.argv[3:]))
    else: print(json.dumps(rend(*sys.argv[1:5]), ensure_ascii=False, indent=1))
