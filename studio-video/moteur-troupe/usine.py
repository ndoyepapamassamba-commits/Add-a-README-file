# USINE À ÉPISODES (18/10/2026) — « préparer tout le mécanisme pour que je puisse cliquer sur un bouton et qu'une vidéo d'une
# minute et plus soit automatiquement déployée sans erreur, sans défaut, sans flou d'arrière-plan, avec fluidité » ; « s'assurer
# que toute la troupe est prête : personnages, animations, scènes, dialogues ».
# Une seule commande enchaîne tout, mesure chaque étape, juge le film avec les 17 portes (qualite.py) et livre le fichier
# TikTok (1080 × 1920) avec sa légende ; l'épisode n'est marqué « à publier » que si TOUTES les portes passent.
#   python3 usine.py pret                          → la troupe est-elle prête ? (lieux, personnages, voix, visages, dialogues)
#   python3 usine.py episode <dossier> [n]         → dossier d'épisode : histoire (sketchs non encore tournés), liens, montage
#   python3 usine.py tourne <dossier> <version>    → voix → bouches → rires → ambiance → visages → tournage → montage → portes
#                                                    → planche → export TikTok → rapport.json
#   python3 usine.py exporte <film.mp4> <sortie>   → 1080 × 1920, H.264 High, AAC 48 kHz, −14 LUFS (déjà masterisé)
# Bibliothèque (lieux préparés, fiches, émojis) : MASSAMBA_BIBLIO (hors dépôt : images de la troupe privées).
import re, glob, json, os, shutil, subprocess, sys, time

ICI = os.path.dirname(os.path.abspath(__file__))
BIBLIO = os.path.expanduser(os.environ.get('MASSAMBA_BIBLIO', '~/massamba-bibliotheque'))
LIENS = ('prep', 'fiches', 'emoji', 'scenes', 'ltas.json', 'registre-repliques.json', 'voix-mls.json')
LIEU_DOSSIER = {'maquis': 'prep/maquis', 'cour': 'prep/cour', 'chambre': 'prep/chambre'}
BANQUES = ('fabrique/histoires/reserve-cour.json',)   # sketchs écrits et contrôlés, prêts à tourner (en plus des épisodes)
REGLAGES = {'cam_px': 3.0, 'rig': 1, 'entites': {'cour': 2}, 'nuages': 0.0, 'betes_peintes': 0}


def _py(*a, env=None, log=None, cwd=None):
    t0 = time.time()
    r = subprocess.run([sys.executable, *a], cwd=cwd, env=dict(os.environ, **(env or {})), capture_output=True, text=True)
    sortie = (r.stdout + r.stderr)
    if log:
        with open(log, 'a', encoding='utf-8') as fh: fh.write(f'\n$ {" ".join(map(str, a))}\n{sortie}')
    if r.returncode: raise RuntimeError(f'{os.path.basename(a[0])} a échoué ({r.returncode}) : {sortie.strip().splitlines()[-3:] if sortie.strip() else ""}')
    return round(time.time() - t0, 1), sortie


# ── LA TROUPE EST-ELLE PRÊTE ? ─────────────────────────────────────────────────────────────────────────────────────────────
def pret():
    sys.path.insert(0, ICI)
    import voix
    R = {'lieux': {}, 'personnages': {}, 'dialogues': {}, 'manques': []}
    for lieu, d in LIEU_DOSSIER.items():
        p = os.path.join(BIBLIO, d); S = json.load(open(f'{p}/scene.json')) if os.path.isfile(f'{p}/scene.json') else None
        fichiers = {f: os.path.isfile(f'{p}/{f}') for f in ('image.png', 'plaque.png', 'profondeur.png')}
        R['lieux'][lieu] = {'scene': bool(S), **fichiers, 'acteurs': [a['nom'] for a in (S or {}).get('acteurs', [])]}
        if not S: R['manques'].append(f'lieu {lieu} : scene.json absent'); continue
        for f, ok in fichiers.items():
            if not ok: R['manques'].append(f'lieu {lieu} : {f} absent')
        for a in S['acteurs']:
            sl = a['slug']; e = f'{p}/expressions/{sl}'
            meta = json.load(open(f'{e}/meta.json')) if os.path.isfile(f'{e}/meta.json') else {}
            c = {'lieu': lieu, 'voix': a['nom'] in voix.CAST, 'visage3d': os.path.isfile(f'{p}/rig/visage3d-{sl}.npy'),
                 'expressions': sorted(meta.get('emotions', [])), 'bouches': len(meta.get('bouche', [])),
                 'lacets': os.path.isfile(f'{e}/lacet.npz'), 'masque': bool(glob.glob(f'{p}/{sl}-masque.png') or glob.glob(f'{p}/rig/*{sl}*'))}
            R['personnages'][a['nom']] = c
            for k in ('voix', 'visage3d'):
                if not c[k]: R['manques'].append(f"{a['nom']} : {k} absent")
            if len(c['expressions']) < 6: R['manques'].append(f"{a['nom']} : {len(c['expressions'])} expressions seulement")
    deja = sketchs_tournes()
    for b in BANQUES + tuple(sorted(glob.glob(os.path.join(BIBLIO, 'ep*/histoire.json')))):
        f = b if os.path.isabs(b) else os.path.join(ICI, b)
        if not os.path.isfile(f): continue
        for s in json.load(open(f, encoding='utf-8'))['sketchs']:
            R['dialogues'].setdefault(s.get('image') or s['lieu'].lower(), set()).add(s['id'])
    R['dialogues'] = {k: {'ecrits': sorted(v), 'deja_tournes': sorted(v & deja), 'disponibles': sorted(v - deja)} for k, v in R['dialogues'].items()}
    R['pret'] = not R['manques']
    return R


def sketchs_tournes():
    """sketchs déjà présents dans un épisode tourné (film.mp4 présent) : jamais deux fois le même sketch."""
    vu = set()
    for h in glob.glob(os.path.join(BIBLIO, 'ep*/histoire.json')):
        if glob.glob(os.path.join(os.path.dirname(h), 'v*/film.mp4')):
            vu |= {s['id'] for s in json.load(open(h, encoding='utf-8'))['sketchs']}
    return vu


# ── DOSSIER D'ÉPISODE ─────────────────────────────────────────────────────────────────────────────────────────────────────
def episode(d):
    """liens vers la bibliothèque + montage (lieu de chaque sketch → dossier préparé). histoire.json doit exister (écrite à la
    main ou par histoires.py episode), contrôlée par fabrique/ton.py."""
    d = os.path.abspath(d); os.makedirs(d, exist_ok=True)
    for l in LIENS:
        src, dst = os.path.join(BIBLIO, l), os.path.join(d, l)
        if os.path.exists(src) and not os.path.lexists(dst): os.symlink(src, dst)
    H = json.load(open(f'{d}/histoire.json', encoding='utf-8'))
    r = subprocess.run([sys.executable, os.path.join(ICI, 'fabrique', 'ton.py'), f'{d}/histoire.json'], capture_output=True, text=True)
    if r.returncode: raise RuntimeError('ton.py refuse l’histoire :\n' + r.stdout[-1500:])
    M = {'timeline': 'timeline.json', 'histoire': 'histoire.json',
         'scenes': {s['id']: LIEU_DOSSIER[s['image']] for s in H['sketchs']},
         'reglages': dict(REGLAGES, entites={s['id']: 2 for s in H['sketchs'] if s['image'] == 'cour'})}
    json.dump(M, open(f'{d}/montage.json', 'w'), ensure_ascii=False, indent=1)
    return M


# ── TOURNAGE COMPLET ──────────────────────────────────────────────────────────────────────────────────────────────────────
def tourne(d, v):
    d = os.path.abspath(d); D = os.path.join(d, v); log = f'{d}/{v}-usine.log'; T = {}; t0 = time.time()
    if not os.path.isfile(f'{d}/montage.json'): episode(d)
    env = {'PIPER_VOICES': os.environ.get('PIPER_VOICES', os.path.join(os.path.dirname(BIBLIO), 'piper') + '/')}
    etape = lambda nom, *a, e=None: T.__setitem__(nom, _py(*a, env=dict(env, **(e or {})), log=log, cwd=d)[0])
    etape('voix', f'{ICI}/voix.py')
    etape('bouches', f'{ICI}/levres.py', 'timeline.json')
    etape('rires', f'{ICI}/musique.py', 'timeline.json', 'voix/mix.wav', 'voix/mix-musique.wav')
    etape('ambiance', f'{ICI}/ambiance.py', 'timeline.json', 'voix/mix-musique.wav', 'voix/mix-ambiance.wav')
    lieux = ','.join(sorted({os.path.basename(os.path.normpath(x)) for x in json.load(open(f'{d}/montage.json'))['scenes'].values()}))
    etape('visages', f'{ICI}/fume_visages.py', 'prep', f'{d}/{v}-visages.jpg', lieux)   # seulement les lieux tournés
    etape('tournage', f'{ICI}/tourne.py', 'montage.json', D, e={'ETIREMENT': '1', 'TOURNE_PROCS': str(os.cpu_count() or 4)})
    # FLOU DE BOUGÉ PHYSIQUE (18/10/2026, « au niveau de Pixar ») : obturateur 180° le long du flux optique, raccords du
    # moteur respectés, images nettes gardées dans clip-net (fluidite.flou_bouge) ; USINE_FLOU=0 pour s'en passer
    if os.environ.get('USINE_FLOU', '1') == '1':
        etape('flou', '-c', f"import sys; sys.path.insert(0, {ICI!r}); import fluidite as F; "
                            f"print(F.flou_bouge({D + '/clip'!r}, coupes=F.coupes_du_moteur({D + '/tournage.json'!r})))")
    etape('montage', f'{ICI}/compose.py', D, f'{D}/film.mp4')
    etape('planche', f'{ICI}/planche_repliques.py', f'{D}/film.mp4', 'timeline.json', f'{D}/planche.jpg')
    exporte(f'{D}/film.mp4', f'{D}/tiktok-1080x1920.mp4'); shutil.copy(f'{D}/legende.txt', f'{d}/{v}-legende.txt')
    json.dump({'durees_s': T, 't0': t0}, open(f'{D}/usine-etapes.json', 'w'))
    # CONTRÔLES EN TEMPS MASQUÉ (18/10/2026, « réduire le temps de production ») : les 17 portes (≈ 5 min, surtout des appels
    # JEV réseau) partent en arrière-plan pendant que l'épisode suivant se tourne ; le rapport s'écrit à leur fin.
    if os.environ.get('USINE_PORTES_FOND', '1') == '1':
        subprocess.Popen([sys.executable, os.path.abspath(__file__), 'finit', d, v], cwd=d, start_new_session=True,
                         stdout=open(f'{d}/{v}-portes.log', 'w'), stderr=subprocess.STDOUT)
        return {'episode': os.path.basename(d), 'version': v, 'durees_s': T, 'portes': 'en cours (arrière-plan)', 'rapport': f'{D}/rapport.json'}
    return finit(d, v)


def finit(d, v):
    """portes de qualité, comparaison avec la version de référence, rapport.json (peut tourner en arrière-plan)."""
    d = os.path.abspath(d); D = os.path.join(d, v); log = f'{d}/{v}-usine.log'
    E = json.load(open(f'{D}/usine-etapes.json')) if os.path.isfile(f'{D}/usine-etapes.json') else {'durees_s': {}, 't0': time.time()}
    T, t0 = E['durees_s'], E['t0']
    try: T['portes'] = _py(f'{ICI}/qualite.py', D, f'{D}/film.mp4', 'montage.json', log=log, cwd=d)[0]
    except RuntimeError as ex: T['portes'] = 'erreur : ' + str(ex)[:200]
    q = json.load(open(f'{D}/qualite.json')) if os.path.isfile(f'{D}/qualite.json') else {}
    rap = {'episode': os.path.basename(d), 'version': v, 'durees_s': T, 'total_s': round(time.time() - t0, 1),
           'portes': f"{q.get('passees')}/{q.get('total')}", 'a_publier': q.get('passees') == q.get('total') and bool(q),
           'echecs': [k for k, p in q.get('portes', {}).items() if not p.get('ok')],
           'juges_non_disponibles': q.get('juges_non_disponibles', {}),   # JEV coupé : juge local en cours de greffe pour ces portes
           'fichiers': {'tiktok': f'{D}/tiktok-1080x1920.mp4', 'legende': f'{D}/legende.txt', 'planche': f'{D}/planche.jpg'}}
    try:
        rap['controles_utilisateur'] = controles_utilisateur(D, q)
        if not all(c['ok'] for c in rap['controles_utilisateur'].values()): rap['a_publier'] = False
    except Exception as ex:
        rap['controles_utilisateur'] = {'erreur': str(ex)[:200]}; rap['a_publier'] = False
    # CONTRÔLE DE LA TROUPE (19/10/2026, « un contrôle automatique de l'âge apparent, qui bloquera la publication tant qu'il
    # échoue » ; regards entre personnages, taille des têtes par rapport au corps) : chaque lieu tourné passe controle_troupe
    # (âge lu sur le visage et sur la silhouette, proportions, orientation vers un partenaire) ; un échec bloque la publication
    try:
        import controle_troupe as CT
        rap['controle_troupe'] = {s: CT.controle_cache(os.path.join(d, p)) for s, p in json.load(open(f'{d}/montage.json'))['scenes'].items()}
        if not all(r['conforme'] for r in rap['controle_troupe'].values()): rap['a_publier'] = False
    except Exception as ex:
        rap['controle_troupe'] = {'erreur': str(ex)[:200]}; rap['a_publier'] = False
    refs = sorted(glob.glob(f'{d}/v*/qualite.json'), key=os.path.getmtime)
    refs = [r for r in refs if os.path.dirname(r) != D]
    if os.environ.get('USINE_REF') and os.path.isfile(f"{d}/{os.environ['USINE_REF']}/qualite.json"):   # référence = la dernière version LIVRÉE
        refs = [f"{d}/{os.environ['USINE_REF']}/qualite.json"]
    if refs and q:
        rap['non_regression'] = compare(json.load(open(refs[-1])), q); rap['non_regression']['reference'] = os.path.basename(os.path.dirname(refs[-1]))
        if rap['non_regression']['regressions']: rap['a_publier'] = False
    json.dump(rap, open(f'{D}/rapport.json', 'w'), ensure_ascii=False, indent=1)
    # PUBLICATION AUTOMATIQUE (18/10/2026, « fais automatiquement la voie retenue, sans risque et gratuite ») : un épisode
    # « à publier » part par la voie officielle disponible (publication directe si l'app TikTok est auditée, sinon brouillon
    # dans la boîte de réception TikTok, sinon kit « A PUBLIER ») ; le compte reste public, jamais d'étiquette IA imposée.
    if os.environ.get('USINE_PUBLIE', '1') == '1':
        try:
            import publie_tiktok
            rap['publication'] = publie_tiktok.publie(D)
        except Exception as ex:
            rap['publication'] = {'statut': 'erreur : ' + str(ex)[:200]}
        json.dump(rap, open(f'{D}/rapport.json', 'w'), ensure_ascii=False, indent=1)
    a_corriger(d, v, rap)
    for x in ('compose',):   # disque : les images composées ne servent plus une fois le film encodé et jugé (le FILM reste)
        shutil.rmtree(f'{D}/{x}', ignore_errors=True)
    return rap


# NON-RÉGRESSION (18/10/2026, « je ne veux pas de régression, toujours un avancement ») : chaque nouvelle version est comparée
# porte par porte et mesure par mesure à la version de référence (la dernière livrée) ; une mesure qui recule est signalée
# en tête du rapport et l'épisode n'est pas « à publier ».
MESURES_SUIVIES = {   # (porte, chemin dans le détail, sens : +1 plus haut = mieux, −1 plus bas = mieux)
    'images_fautives_jev': ('G_jev', ('images_fautives',), -1),
    'visages_deformes': ('G_jev', ('visages_deformes',), -1),
    'plans_par_minute': ('A_rythme', ('detail', 'plansParMinute'), 0),   # 0 : cible en bande (TikTok q1 → studios), on compte l'écart à la bande
    'camera': ('A_rythme', ('detail', 'camera'), +1),
    'secondes_mouvement_fautives': ('L_mouvement', ('secondes_fautives',), -1),
    'pire_bras': ('L_mouvement', ('pire', 'bras'), +1),
    'pire_buste': ('L_mouvement', ('pire', 'buste'), +1),
    'regard_pire': ('D_regard', ('pire',), +1),
}


def _val(q, porte, chemin):
    d = q.get('portes', {}).get(porte, {}).get('detail')
    if chemin[0] == 'detail' and isinstance(d, list):
        v = next((x.get('film') for x in d if x.get('mesure') == chemin[1]), None)
    else:
        v = d
        for c in chemin:
            v = v.get(c) if isinstance(v, dict) else None
    return len(v) if isinstance(v, list) else v


def compare(ref, nouv):
    """→ {'portes': (avant, après), 'mesures': {nom: (avant, après, 'progrès'|'égal'|'RÉGRESSION')}, 'regressions': [...]}"""
    R = {'portes': (ref.get('passees'), nouv.get('passees')), 'mesures': {}, 'regressions': []}
    for p, a in ref.get('portes', {}).items():
        b = nouv.get('portes', {}).get(p)
        if a.get('ok') and b is not None and not b.get('ok'): R['regressions'].append(f'porte {p} passait, elle échoue')
    def saccades(q):   # porte I : à-coups mesurés de chaque piste de chaque personnage (plus bas = plus fluide), sommés
        d = q.get('portes', {}).get('I_fluidite', {}).get('detail') or {}
        v = [x for p_ in d.values() if isinstance(p_, dict) for k_, x in p_.items() if isinstance(x, (int, float)) and k_ != 'ok']
        return round(sum(v), 2) if v else None
    def bouches(q):   # porte B : répliques dont la bouche est lisible et juste (« 19/22 » → 19)
        r_ = str(q.get('portes', {}).get('B_bouche', {}).get('repliques_ok', ''))
        return int(r_.split('/')[0]) if '/' in r_ else None
    def compte(q, porte, cle):   # nombre d'éléments fautifs listés par une porte
        d = q.get('portes', {}).get(porte, {}).get('detail') or {}
        v = d.get(cle) if isinstance(d, dict) else None
        return len(v) if isinstance(v, list) else None
    calc = {'fluidite_saccades_total': (saccades(ref), saccades(nouv), -1), 'bouches_lisibles': (bouches(ref), bouches(nouv), +1),
            'regards_fautifs': (compte(ref, 'D_regard', 'fautes'), compte(nouv, 'D_regard', 'fautes'), -1),
            'sous_titres_fautifs': (compte(ref, 'O_textes', 'sous_titres_fautifs'), compte(nouv, 'O_textes', 'sous_titres_fautifs'), -1)}
    BANDE_PPM = (10.425, 18.4)   # gabarit_tiktok.json : quart bas des TikTok de l'utilisateur → médiane des studios 3D
    ecart = lambda x: max(0.0, BANDE_PPM[0] - x, x - BANDE_PPM[1])
    for nom, (porte, chemin, sens) in list(MESURES_SUIVIES.items()) + [(k, (None, None, c[2])) for k, c in calc.items()]:
        a, b = (calc[nom][0], calc[nom][1]) if nom in calc else (_val(ref, porte, chemin), _val(nouv, porte, chemin))
        if not isinstance(a, (int, float)) or not isinstance(b, (int, float)): continue
        if sens == 0: a_, b_ = ecart(a), ecart(b); etat = 'égal' if abs(b_ - a_) < 1e-9 else ('progrès' if b_ < a_ else 'RÉGRESSION')
        else: etat = 'égal' if abs(b - a) < 1e-9 else ('progrès' if (b - a) * sens > 0 else 'RÉGRESSION')
        R['mesures'][nom] = (a, b, etat)
        if etat == 'RÉGRESSION': R['regressions'].append(f'{nom} : {a} → {b}')
    return R


# REGISTRE « DÉFAUT VU PAR L'UTILISATEUR → CONTRÔLE AUTOMATIQUE » (18/10/2026, « corriger tous les défauts avant de lancer la
# production en masse, pour ne pas avoir à revenir sur des détails déjà réglés ») : chaque remarque devient une vérification
# exécutée sur CHAQUE épisode ; une seule en échec → l'épisode n'est pas « à publier ».
def controles_utilisateur(D, q):
    import cv2, marque, numpy as np
    R = {}
    cap = cv2.VideoCapture(f'{D}/film.mp4'); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); flous = []
    for k in range(1, 9):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(n * k / 9)); ok, im = cap.read()
        if ok: ok_, r_ = marque.aucun_flou(im, 282, 460); flous.append(r_) if not ok_ else None
    R['arriere_plan_sans_flou (18/10)'] = (not flous, flous[:3])
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0); ok0, i0 = cap.read(); cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, n - 1)); ok1, i1 = cap.read()
    if ok0 and ok1:   # boucle : la relance automatique de TikTok ne doit montrer aucune coupure (écart moyen < 6 niveaux)
        ec = float(np.abs(i0.astype(np.float32) - i1.astype(np.float32)).mean()); R['boucle_sans_coupure (18/10)'] = (ec < 6.0, round(ec, 2))
    leg = open(f'{D}/legende.txt', encoding='utf-8').read() if os.path.isfile(f'{D}/legende.txt') else ''
    R['credits_dans_la_legende_pas_a_l_image (18/10)'] = ('CC BY' in leg, None)
    P = q.get('portes', {})
    det = lambda k: (P.get(k) or {}).get('detail') or {}   # porte non jugée : détail absent (v12 : P_choc → None)
    son = json.load(open(f'{D}/jev_son.json')) if os.path.isfile(f'{D}/jev_son.json') else {}
    def_son = son.get('synthese', {}).get('defauts', [])
    R['son_pas_aigu (18/10)'] = ('son_aigu' not in def_son, [a for a in son.get('feuille', {}).get('aigus_mesures', [])][:5])
    R['rires_apres_chaque_chute (18/10)'] = ('rires_absents' not in def_son, None)
    R['visage_de_choc_net_sans_sourcils_doubles (18/10)'] = (bool((P.get('P_choc') or {}).get('ok')), det('P_choc').get('fautes'))
    g = det('G_jev')
    vd = g.get('visages_deformes')   # None = porte G non jugée : jamais compté comme conforme
    R['visages_non_deformes (18/10)'] = (isinstance(vd, list) and not vd, len(vd) if isinstance(vd, list) else 'non jugé')
    R['mouvements_souples_sans_saccade (18/10)'] = ('saccade' in det('L_mouvement') and not det('L_mouvement')['saccade'], det('L_mouvement').get('saccade', 'non jugé'))
    R['regards_vers_le_partenaire (17/10)'] = (bool((P.get('D_regard') or {}).get('ok')), det('D_regard').get('fautes'))
    return {k: {'ok': bool(v[0]), 'detail': v[1]} for k, v in R.items()}


def exporte(src, dst):
    """fichier de publication : 1080 × 1920 (agrandissement Lanczos + netteté légère), H.264 High CRF 17, AAC 192 k 48 kHz ; le
    son est déjà masterisé (−14 LUFS, crête ≤ −2,3 dBTP) par compose.py."""
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf', 'scale=1080:1920:flags=lanczos,unsharp=5:5:0.45:5:5:0.0,format=yuv420p',
                    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'medium', '-crf', '17', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                    '-movflags', '+faststart', dst], check=True)
    return dst


# FILE DE CORRECTION (18/10/2026, « les vidéos qui échouent aux contrôles sont corrigées, il ne faut pas les supprimer ») :
# un épisode refusé n'est JAMAIS effacé (film, fichier TikTok, rapport restent) ; il entre dans la file avec ses portes
# en échec et ses régressions, et `corrige` le retourne en version suivante avec le moteur du jour, comparé à la
# version de référence, jusqu'à ce qu'il soit « à publier » ; il sort alors de la file.
def a_corriger(d, v, rap):
    f = os.path.join(os.path.dirname(os.path.abspath(d)), 'a-corriger.json'); ep = os.path.basename(os.path.abspath(d))
    F = json.load(open(f, encoding='utf-8')) if os.path.isfile(f) else {}
    if rap.get('a_publier'): F.pop(ep, None)
    else:
        F[ep] = {'version': v, 'date': time.strftime('%Y-%m-%d %H:%M'), 'portes': rap.get('portes'), 'echecs': rap.get('echecs'),
                 'regressions': (rap.get('non_regression') or {}).get('regressions', []),
                 'controles': [k for k, c in (rap.get('controles_utilisateur') or {}).items() if isinstance(c, dict) and not c.get('ok')],
                 'essais': (F.get(ep) or {}).get('essais', 0) + 1}
    json.dump(F, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def corrige(d):
    """retourne l'épisode en version suivante (v1 → v2 …) avec le moteur corrigé ; rien n'est supprimé."""
    d = os.path.abspath(d); vs = sorted(int(x[1:]) for x in os.listdir(d) if re.fullmatch(r'v\d+', x) and os.path.isdir(os.path.join(d, x)))
    v = f'v{(vs[-1] + 1) if vs else 1}'
    return tourne(d, v)


if __name__ == '__main__':
    c = sys.argv[1]
    if c == 'pret':
        R = pret(); print(json.dumps(R, ensure_ascii=False, indent=1, default=sorted)); sys.exit(0 if R['pret'] else 1)
    elif c == 'episode': print(json.dumps(episode(sys.argv[2]), ensure_ascii=False))
    elif c == 'tourne': print(json.dumps(tourne(sys.argv[2], sys.argv[3]), ensure_ascii=False, indent=1))
    elif c == 'exporte': print(exporte(sys.argv[2], sys.argv[3]))
    elif c == 'finit': print(json.dumps(finit(sys.argv[2], sys.argv[3]), ensure_ascii=False, indent=1))
    elif c == 'a_corriger':
        f = os.path.join(BIBLIO, 'a-corriger.json'); print(open(f, encoding='utf-8').read() if os.path.isfile(f) else '{}')
    elif c == 'corrige': print(json.dumps(corrige(sys.argv[2]), ensure_ascii=False, indent=1))
