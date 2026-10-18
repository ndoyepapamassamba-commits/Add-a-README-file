# VÉRIFICATION DU MOTEUR PYTHON (npm run test:moteur) — sans carte graphique ni modèle téléchargé :
#   1. tous les scripts Python de l'app se compilent (moteur-troupe, blender, outils) ;
#   2. la fluidité (moteur-troupe/fluide.py) : cadre exact sans déformation, réglage de couleur constant qui rapproche
#      la source de la cible, mesure de saccade (une image figée sur deux = 50 %), retiming exact quand RIFE est présent
#      (RIFE_DIR) ; sinon le retiming est sauté et le dit ;
#   3. la publication TikTok (moteur-troupe/publie_tiktok.py, viral.py), sans réseau ni compte : découpe des morceaux
#      (Media Transfer Guide), défi PKCE en hexadécimal (Login Kit for Desktop), épisode non « à publier » retenu, kit
#      écrit, fichier hors normes retenu, étiquette IA désactivée par défaut, légendes vraies et ≤ 5 mots-dièse.
import os, sys, glob, importlib.util, json, tempfile, shutil, hashlib

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
echecs, n = [], 0
for motif in ('moteur-troupe/*.py', 'blender/*.py', 'blender/film/*.py', 'outils/*.py', 'outils/filmbench/*.py'):
    for f in sorted(glob.glob(os.path.join(ICI, motif))):
        n += 1
        try:
            compile(open(f, encoding='utf-8').read(), f, 'exec')  # compilation en mémoire, rien n'est écrit
        except SyntaxError as e:
            echecs.append(f'{os.path.relpath(f, ICI)} : ligne {e.lineno} : {e.msg}')
print(f'compilation : {n - len(echecs)}/{n} scripts')

try:
    import numpy as np, cv2
except ImportError:
    np = None
    print('fluidité : numpy / opencv absents, contrôles sautés')
if np is not None:
    spec = importlib.util.spec_from_file_location('fluide', os.path.join(ICI, 'moteur-troupe', 'fluide.py'))
    try:
        fl = importlib.util.module_from_spec(spec); spec.loader.exec_module(fl)
    except ImportError as e:  # torch absent : on vérifie quand même ce qui n'en dépend pas
        print(f'fluidité : {e} — retiming sauté'); fl = None
    if fl is not None:
        im = np.zeros((720, 1280, 3), np.uint8); im[:, :640] = (40, 80, 160)
        c = fl.cadre(im)
        if c.shape != (fl.CH, fl.CW, 3): echecs.append(f'cadre : {c.shape} au lieu de {(fl.CH, fl.CW, 3)}')
        rng = np.random.default_rng(1)
        src = (rng.random((120, 160, 3)) * 120 + 20).astype(np.uint8); cib = (rng.random((120, 160, 3)) * 120 + 110).astype(np.uint8)
        app = fl.reglage_couleur(src, cib)
        ecart = lambda a, b: float(np.abs(cv2.cvtColor(a, cv2.COLOR_BGR2LAB).astype(float).mean((0, 1)) - cv2.cvtColor(b, cv2.COLOR_BGR2LAB).astype(float).mean((0, 1))).sum())
        if not ecart(app(src), cib) < ecart(src, cib) * 0.3: echecs.append('réglage de couleur : la source ne se rapproche pas de la cible')
        fig = [src, src, cib, cib, src, src]
        s = fl.saccade(fig)
        if abs(s['images_figees_%'] - 60.0) > 0.1: echecs.append(f'saccade : {s} (attendu 60 % d’images figées)')
        if os.path.exists(os.path.join(fl.RIFE, 'flownet.safetensors')):
            fr = [np.full((96, 128, 3), v, np.uint8) for v in (0, 64, 128, 192)]
            out, _ = fl.retime(fr, 16, 8)
            if len(out) != 8: echecs.append(f'retiming : {len(out)} images au lieu de 8')
            print('fluidité : cadre, couleur, saccade et retiming RIFE vérifiés')
        else:
            print('fluidité : cadre, couleur et saccade vérifiés (RIFE absent : retiming sauté, poser RIFE_DIR)')

tmp = tempfile.mkdtemp(); os.environ['MASSAMBA_PRIVE_TIKTOK'] = os.path.join(tmp, 'prive')
for k in ('TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REFRESH_TOKEN'): os.environ.pop(k, None)
sys.path.insert(0, os.path.join(ICI, 'moteur-troupe'))
try:
    import publie_tiktok as pt, viral
    M = 2 ** 20
    if pt.decoupe(3 * M) != (3 * M, 1) or pt.decoupe(60 * M) != (60 * M, 1): echecs.append('publication : un fichier ≤ 64 Mo doit partir en un morceau')
    cs, k = pt.decoupe(200 * M)
    if not (5 * M <= cs <= 64 * M and 200 * M - cs * (k - 1) <= 128 * M): echecs.append(f'publication : découpe {cs} × {k} hors des règles TikTok')
    if pt.reglages()['aigc'] is not False: echecs.append('publication : étiquette IA activée par défaut (consigne : désactivée)')
    if not pt.reglages()['redirect_uri'].startswith('http://127.0.0.1:'): echecs.append('publication : rappel hors 127.0.0.1 (Login Kit for Desktop)')
    E = os.path.join(tmp, 'ep07'); D = os.path.join(E, 'v1'); os.makedirs(D)
    open(os.path.join(D, 'tiktok-1080x1920.mp4'), 'wb').write(b'\0' * 1000); open(os.path.join(D, 'legende.txt'), 'w').write('Essai\n\nCrédits — x')
    json.dump({'a_publier': False, 'echecs': ['G_jev']}, open(os.path.join(D, 'rapport.json'), 'w'))
    if pt.publie(D).get('voie') is not None: echecs.append('publication : un épisode pas « à publier » est parti')
    json.dump({'a_publier': True}, open(os.path.join(D, 'rapport.json'), 'w'))
    H = {'sketchs': [{'titre': 'LE LOYER', 'acteurs': ['TANTIE AWA', 'MODOU'], 'ressort': {'qui': 'MODOU', 'trait': 'mauvais payeur'}, 'repliques': []}]}
    json.dump(H, open(os.path.join(E, 'histoire.json'), 'w')); json.dump({'lines': []}, open(os.path.join(E, 'timeline.json'), 'w'))
    os.environ['VIRAL_SANS_JEV'] = '1'   # aucun appel réseau dans le contrôle
    V = viral.variantes(H, 7, {'nom': 'machaine'})
    if any(v.count('#') > 6 or 'Épisode 7' not in v for v in V.values()): echecs.append('viralité : légende sans « Épisode N » ou trop de mots-dièse')
    if not pt.publie(D, voie='kit').get('normes'): echecs.append('publication : un fichier hors normes (faux MP4) n’a pas été retenu')
    r = pt.publie(D, voie='kit', force=True)
    if r.get('voie') != 'kit' or not os.path.isfile(os.path.join(r.get('kit', ''), 'legende.txt')): echecs.append(f'publication : kit non écrit ({r})')
    print('publication TikTok : découpe, PKCE, garde « à publier », normes du fichier, kit, étiquette IA et légendes vérifiés')
except Exception as e:
    echecs.append(f'publication : {e}')
finally:
    shutil.rmtree(tmp, ignore_errors=True)

# ── 4. JUGE LOCAL (18/10/2026, « arrête les appels vers JEV ») : aucun appel ne part vers JEV, règles du son, lissage par
#       plan, mouvement mesuré (seconde figée contre seconde qui bouge), « non jugé » honnête pour une question sans voie.
try:
    import json as _j, urllib.request as _u, numpy as _np, cv2
    import jev_api, juge_local as jl
    os.environ.pop('JEV_AUTORISE', None); os.environ['JUGE_LLM'] = '/inexistant.gguf'; jl.LLM = '/inexistant.gguf'
    n0 = sum(1 for _ in open(jev_api.REGISTRE)) if os.path.isfile(jev_api.REGISTRE) else 0
    try:
        jev_api.demande({'x': 'y'}, {'q': {'type': 'noul', 'instructions': 'Is the sky blue today?'}}, outil='verif')
        echecs.append('juge local : une question sans voie a reçu une réponse')
    except jl.NonJuge:
        pass
    try:
        jev_api.ouvre(_u.Request(jev_api.API, data=_j.dumps({'state': {}, 'questions': {'q': {'type': 'noul', 'instructions': 'Is it fine?'}}}).encode()), outil='verif')
        echecs.append('juge local : la garde des modules directs a laissé passer')
    except jl.NonJuge:
        pass
    if (sum(1 for _ in open(jev_api.REGISTRE)) if os.path.isfile(jev_api.REGISTRE) else 0) != n0: echecs.append('juge local : un appel à JEV a été inscrit au registre')
    F = {'repliques': [{'sketch': 'a', 'ecart_voix_musique_db': 30}], 'fichier_livre': {'sonie_integree_lufs': -14.0, 'crete_vraie_dbtp': -1.2},
         'silences_entre_repliques_plus_de_0_8_s': [{'duree_s': 1.7}], 'ecarts_de_niveau_entre_repliques_db': [{'saut_db': 2.0}]}
    r = jl.regles_son(F)
    if not (r['technique']['noul'] == 1.0 and r['silence']['noul'] == 1.0 and r['saut']['noul'] == 0.0 and r['musique_couvre']['noul'] == 0.0):
        echecs.append(f'juge local : règles du son fausses ({ {k: v["noul"] for k, v in r.items()} })')
    l_ = jl.lisse_plan([0.1, 0.9, 0.1, 0.8, 0.9, 0.85], [0, 0, 0, 1, 1, 1], rayon=1)
    if not (l_[1] < 0.5 and l_[4] > 0.5): echecs.append(f'juge local : lissage par plan faux ({l_})')
    rng_ = _np.random.default_rng(1); im = (rng_.random((460, 576, 3)) * 255).astype(_np.uint8); im = cv2.GaussianBlur(im, (0, 0), 3)
    fige, _ = jl.mouvement_local([im] * 8, tmp, 0.0, 0.3)
    bouge, _ = jl.mouvement_local([_np.roll(im, 3 * k, axis=1) for k in range(4)] + [_np.roll(im, k, axis=1) for k in range(4)], tmp, 0.0, 0.3)
    if not (fige['fige'] == 1.0 and bouge['fige'] == 0.0): echecs.append(f"juge local : figé {fige['fige']} / mouvement {bouge['fige']} mal distingués")
    print('juge local : JEV coupé (0 appel), règles du son, lissage par plan, mouvement mesuré et « non jugé » vérifiés')
except Exception as e:
    echecs.append(f'juge local : {e}')

# ── 5. FLUIDITÉ ET SOUPLESSE (18/10/2026, « la vidéo doit respecter tous les critères de fluidité à 100 % ») : lissage des
#       articulations sans déphasage (bornes gardées, tremblement coupé, prise de choc vive sans tremblement), indice SPARC (un geste en
#       cloche est plus souple qu'un geste haché), flou de bougé qui ne touche pas une image immobile.
try:
    import numpy as _np, cv2 as _cv2, jeu as _jeu, fluidite as _fl
    t_ = _np.arange(600) / 60.0; x_ = _np.where(t_ > 3, 10.0, 0.0) + 0.5 * _np.sin(2 * _np.pi * 7 * t_)
    y_ = _jeu.souple(x_, 60, 2.0)
    if not (y_.min() >= x_.min() - 1e-6 and y_.max() <= x_.max() + 1e-6): echecs.append('souplesse : le lissage sort des bornes')
    if not _np.std(y_[400:] - 10) < 0.2 * _np.std(x_[400:] - 10): echecs.append('souplesse : le tremblement de 7 Hz n’est pas coupé')
    # prise de choc (18/10/2026) : lissée à PRISE_HZ, elle reste plus vive que le jeu courant (90 % du saut atteint plus tôt)
    # et son tremblement est coupé au moins de moitié
    g_ = _np.zeros(600); g_[162:211] = 1; pas_ = _np.where(t_ > 3, 10.0, 0.0)
    yg_, yc_ = _jeu.souple(x_, 60, 2.0, g_), _jeu.souple(x_, 60, 2.0)
    if not _np.argmax(yg_ >= 9.0) < _np.argmax(yc_ >= 9.0): echecs.append('souplesse : la prise de choc a perdu son claquement')
    tr_ = 0.5 * _np.sin(2 * _np.pi * 7 * t_)   # tremblement seul, pendant la prise
    if not _np.std(_jeu.souple(tr_, 60, 2.0, g_)[175:200]) < 0.5 * _np.std(tr_[175:200]): echecs.append('souplesse : la prise de choc tremble encore')
    cloche = _np.exp(-((_np.arange(120) - 60) / 15.0) ** 2); hache = cloche * (1 + 0.6 * _np.sign(_np.sin(_np.arange(120) * 1.3)))
    if not _fl.sparc(cloche, 30.0) > _fl.sparc(_np.abs(hache), 30.0): echecs.append('SPARC : un geste haché ne paraît pas moins souple')
    d_ = tempfile.mkdtemp(); im_ = (_np.random.default_rng(3).random((92, 116, 3)) * 255).astype(_np.uint8)
    for k in range(3): _cv2.imwrite(f'{d_}/f{k:05d}.jpg', im_)
    _fl.flou_bouge(d_, d_ + '-flou')
    if _np.abs(_cv2.imread(f'{d_}-flou/f00001.jpg').astype(int) - _cv2.imread(f'{d_}/f00001.jpg').astype(int)).max() > 0: echecs.append('flou de bougé : une image immobile a été modifiée')
    shutil.rmtree(d_, ignore_errors=True); shutil.rmtree(d_ + '-flou', ignore_errors=True)
    print('fluidité : lissage sans déphasage, prise de choc gardée, SPARC et flou de bougé vérifiés')
except Exception as e:
    echecs.append(f'fluidité : {e}')

if echecs:
    print('ÉCHECS :\n- ' + '\n- '.join(echecs)); sys.exit(1)
print('moteur : OK')
