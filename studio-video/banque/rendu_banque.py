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


def _ease(u):
    u = min(1.0, max(0.0, u)); return u * u * (3 - 2 * u)


def _visages(img_bgr, corps=False):
    """boîtes (x0, y0, x1, y1) des visages de l'image : peau du visage du segmenteur MediaPipe (classe 3, peau.py) ; avec
    corps=True, aussi le masque des personnes entières (toutes classes sauf le fond)."""
    import peau
    mp, seg = peau._seg(); rgb = np.ascontiguousarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
    c = cv2.resize(np.squeeze(seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)).category_mask.numpy_view()),
                   (img_bgr.shape[1], img_bgr.shape[0]), interpolation=cv2.INTER_NEAREST); m = c == 3
    k, _, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8))
    v = [(x, y, x + w, y + h) for x, y, w, h, a in st[1:] if a > 0.004 * m.size]
    return (v, c > 0) if corps else v


def _place_carte(titre, visages, corps=None):
    """(centre x, centre y de l'émoji, haut du titre, taille de base) qui couvre le moins de visage — tourne.place_carte
    (v34 : l'émoji couvrait le visage de Coumba, le titre la tête de Petit Mamadou), mêmes positions candidates."""
    from PIL import ImageFont
    import cartes_fx
    f = ImageFont.truetype(cartes_fx.FONT, 34)
    try: f.set_variation_by_name(b'Black')
    except Exception: pass
    lignes, cur = 1, ''
    for w_ in titre.split():
        if f.getlength((cur + ' ' + w_).strip()) > CW - 60: lignes += 1; cur = w_
        else: cur = (cur + ' ' + w_).strip()
    th = 44 * lignes
    def couvre(r):
        tot = 0.0
        for v in visages:
            mx, my = 0.15 * (v[2] - v[0]), 0.15 * (v[3] - v[1])
            tot += max(0.0, min(r[2], v[2] + mx) - max(r[0], v[0] - mx)) * max(0.0, min(r[3], v[3] + my) - max(r[1], v[1] - my))
        return tot
    def sur_corps(e, base):   # part de l'émoji et des deux petits émojis posée sur un corps (masque des personnes)
        if corps is None: return 0.0
        R = base * 0.5; tot = 0.0
        for cx, cy, r in ((e[0], e[1], 0.62 * base), (e[0] - 1.7 * R, e[1] + 0.55 * R, 0.25 * base), (e[0] + 1.7 * R, e[1] + 0.55 * R, 0.25 * base)):
            x0, y0, x1, y1 = [int(round(v)) for v in (cx - r, cy - r, cx + r, cy + r)]
            z = corps[max(0, y0):max(0, y1), max(0, x0):max(0, x1)]; tot += float(z.mean()) if z.size else 0.0
        return round(tot / 3, 2)
    best = None
    for base in (210, 170, 140):
        sz = 1.32 * base
        for k_, (ex, ey, ty) in enumerate(((CW / 2, 145, 290), (CW * 0.27, 30 + sz / 2, CH - th - 14), (CW * 0.73, 30 + sz / 2, CH - th - 14),
                                         (CW * 0.27, CH - 14 - sz / 2, 18), (CW * 0.73, CH - 14 - sz / 2, 18), (CW / 2, CH - 14 - sz / 2, 18))):
            ex = min(CW - sz / 2 - 4, max(sz / 2 + 4, ex))
            cle = (couvre((ex - sz / 2, ey - sz / 2, ex + sz / 2, ey + sz / 2)) + couvre((30, ty - 6, CW - 30, ty + th)),
                   sur_corps((ex, ey), base), 210 - base, k_)
            if best is None or cle < best[0]: best = (cle, (ex, ey, ty, base))
        if best[0][0] == 0 and best[0][1] == 0: break
    return best[1] + (best[0][1],)


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
    import assemble, camera_v1
    assemble.FPS = FPS; camera_v1.SORTIE = (CW, CH); i = [P['repliques'][k]['_i0']]   # réglages du parent (processus neuf)
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
    tmp = tempfile.mkdtemp(prefix='rendu-banque-'); deja = 0.0
    for j, S in enumerate(T['sketchs']):
        HS = next(x for x in H['sketchs'] if x['id'] == S['id']); lieu = HS.get('lieu_bible') or HS.get('lieu'); lieu = usine_scene.DECOR_DU_LIEU.get(lieu, lieu)
        lignes = sorted([L for L in T['lines'] if L['sketch'] == S['id']], key=lambda L: L['t0'])
        acteurs = sorted({scene.slug(L['qui']) for L in lignes} | {scene.slug(a) for a in HS.get('acteurs') or []})
        _, manque = usine_scene.clips(acteurs, priv, os.path.join(cache, 'clips'))
        if manque: raise SystemExit(f'gestes pas encore tournés pour : {", ".join(manque)}')
        decor = usine_scene.decor(lieu, priv, os.path.join(cache, 'decors'))
        # SCÈNE SOUS LA CARTE (21/10/2026, comme tourne.carte_sur_scene) : la réaction après la chute continue de jouer sous la
        # carte qui suit le sketch (« LE CHOC », titre suivant) au lieu d'une image figée — dans la V1, l'arrière-plan bouge
        # aussi sous les cartes (mesuré seconde par seconde : 0,50 à 1,0 aux cartes ; épisode banque 1 : image fixe)
        fin = max([c['t1'] for c in T.get('cartes', []) if abs(c['t0'] - S['t1']) < 0.05] + [S['t1']])
        # AUCUNE IMAGE FIGÉE (21/10/2026, épisode banque 1 v6 : 11 sautes sur 31 dans les 0,4 premières secondes des sketchs 1
        # et 2) : entre la fin d'une carte et la 1re image du sketch suivant (0,25 s), et avant le 1er sketch (0,3 s), l'image
        # la plus proche était recopiée — résidu 0,0, puis la poussée d'ouverture démarrait d'un coup (7 ‰ de zoom par image,
        # résidu 4) : saute. La V1 pousse plus vite encore (jusqu'à 37 ‰ par image, mesuré à 25,2 s) sans saute, parce que sa
        # scène bouge déjà sous la carte. Le sketch commence donc dès la fin de la carte précédente (dès 0 pour le premier,
        # attente avant la 1re réplique allongée d'autant) et le dernier joue jusqu'au bout de la bande son, sous la boucle
        if j == len(T['sketchs']) - 1: fin = max(fin, T['total'])
        t0 = min(deja, S['t0']); deja = fin
        P = plan_sketch(HS, lignes, t0, fin, decor, os.path.join(cache, 'clips'))
        P['_carte_t0'] = next((c['t0'] for c in T.get('cartes', []) if abs(c['t0'] - S['t1']) < 0.05), None)   # recul de caméra
        gains, inf = assemble.prepare(P, tmp); info[S['id']] = {'lieu': lieu, 'decor': os.path.basename(decor), 'plans': inf.get('plans')}
        taches += [(P, k, gains, D) for k in range(len(P['repliques']))]
    # processus NEUFS (spawn) : le parent a déjà ouvert MediaPipe (sens dessiné des personnages, assemble.sens_du_corps) ; des
    # enfants clonés (fork) en héritent l'état sans ses fils et se bloquent au premier visage à lire (v2 : 2 191 images sur 2 400)
    import multiprocessing
    try: camera_v1._retention_lit(camera_v1._dossier_lit(os.path.join(cache, 'x.mov')))   # cache ramené à son plafond avant de compter
    except Exception: pass
    with ProcessPoolExecutor(assemble.nb_processus(), mp_context=multiprocessing.get_context('spawn')) as ex:   # selon la mémoire
        list(ex.map(_tache, taches))
    # CARTES DE LA V1 (21/10/2026, épisode banque 1 v7) : pendant les cartes entre sketchs, l'image (qui continue de jouer)
    # s'assombrit et porte, DANS la scène, l'émoji animé, ses rayons et le ruban du titre du sketch suivant — la carte de la V1
    # (tourne.sur_scene → cartes_fx.carte), posée hors des visages (tourne.place_carte). Avant, la scène était seulement
    # assombrie : mesuré sur la V1, le décor bouge à 0,5–1,0 sous ses cartes et le résidu y reste à 1,2–1,5 ; sous les nôtres
    # 0,4–0,5, si bien que la poussée d'ouverture du sketch suivant (résidu 3 à 5) comptait 7 sautes. Une image manquante
    # (il ne devrait plus y en avoir) : la plus proche
    import cartes_fx
    ids = [x['id'] for x in H['sketchs']]; places = {}
    faites = sorted(int(f[1:6]) for f in os.listdir(os.path.join(D, 'clip')) if f.startswith('f'))
    for i in range(n):
        f = os.path.join(D, 'clip', f'f{i:05d}.jpg'); c = next((c for c in T.get('cartes', []) if c['t0'] <= i / FPS < c['t1']), None)
        if os.path.isfile(f) and c is None: continue
        im = cv2.imread(f) if os.path.isfile(f) else cv2.imread(os.path.join(D, 'clip', f'f{min(faites, key=lambda x: abs(x - i)):05d}.jpg'))
        if c is not None:
            titre = next((x.get('titre', '') for x in H['sketchs'] if x['id'] == c.get('apres')), '').upper()
            if c['t0'] not in places: places[c['t0']] = _place_carte(titre, *_visages(im, corps=True))
            t = i / FPS; k = _ease((t - (c['t0'] - 0.05)) / 0.15)
            pl = places[c['t0']]   # (x, y, titre, taille, part sur un corps) : entrée douce si la carte touche un personnage
            cal = cartes_fx.carte(CW, CH, t - c['t0'], titre, ids.index(c['apres']) + 1 if c.get('apres') in ids else 1, len(ids), pl[:4], doux=pl[4] > 0.05).astype(np.float32)
            a = cal[..., 3:] / 255.0; im = im.astype(np.float32) * (1 - 0.35 * k) * (1 - a) + cal[..., 2::-1] * a
        cv2.imwrite(f, np.clip(im, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 94])
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
