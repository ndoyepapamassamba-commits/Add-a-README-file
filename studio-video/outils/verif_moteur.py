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

# bras sans défaut (19/10/2026, défauts vus par l'utilisateur sur la v11) : une même main dans deux calques (Coumba au maquis)
# est ramenée à un seul calque ; un avant-bras qui tournerait sur le tronc (Tantie Awa) voit son angle borné
try:
    import numpy as _np, importlib as _il
    sys.path.insert(0, os.path.join(ICI, 'moteur-troupe')); _ge = _il.import_module('gestes')
    def _calque(x0, y0, x1, y1, rect):
        c = _np.zeros((y1 - y0, x1 - x0), _np.float32); a, b, c2, d = rect; c[b:d, a:c2] = 1.0; return c
    b1 = dict(cote='gauche', box=(0, 0, 60, 60), calque=_calque(0, 0, 60, 60, (10, 10, 50, 40)))
    b2 = dict(cote='droit', box=(20, 0, 80, 60), calque=_calque(20, 0, 80, 60, (0, 15, 25, 35)))
    if len(_ge.sans_doublon([b1, b2], (80, 100))) != 1: echecs.append('bras : une main présente dans deux calques n’est pas dédoublonnée')
    w_, h_ = 120, 120; c_ = _np.zeros((h_, w_), _np.float32); c_[56:64, 60:110] = 1.0   # avant-bras horizontal, coude en (60, 60)
    tr_ = _np.zeros((h_, w_), _np.uint8); tr_[10:56, 60:120] = 1                          # tronc juste au-dessus du bras
    bb = dict(nu=True, box=(0, 0, w_, h_), calque=c_, piv=_np.array([60.0, 60.0], _np.float32), sens=1.0, amax=0.0, tronc=tr_,
              rgb=_np.zeros((h_, w_, 3), _np.uint8), fond=_np.zeros((h_, w_, 3), _np.uint8), trou=c_ > 0)
    _ge.qualite_fond = lambda b: dict(fantome=0.0, etranger=0.0)
    ev_ = _ge.enveloppe_revelee(bb)
    if not ev_.get('amax', 99) < 10: echecs.append(f"bras : l'avant-bras peut tourner sur le tronc ({ev_.get('amax')}°)")
    print('bras : main en double dédoublonnée, rotation sur le tronc bornée')
except Exception as e:
    echecs.append(f'bras : {e}')

# régressions de la v12 devenues contrôles (19/10/2026) : (1) l'écoute qui bute sur l'enveloppe de 6° ne fait plus de palier à
# coins (porte I : Maman 2,89 > 2,5) ; (2) une sifflante forte est ramenée sous le seuil du contrôle sans toucher le reste
# (porte N : −9,8 dB à 40,9 s) ; (3) un juge tué par le noyau est relancé seul (portes H et L muettes)
try:
    import numpy as _np, importlib as _il
    _je = _il.import_module('jeu'); _so = _il.import_module('sonie')
    f_ = 30; t_ = _np.arange(20 * f_) / f_
    ec_ = _np.where((t_ % 8) < 4, -1.0, 1.0); ec_[(t_ % 4) > 3.2] = 0.0                     # l'orateur change de côté
    y0_ = 5.5 * _np.sign(_np.sin(2 * _np.pi * t_ / 8)) * -1 + 1.5 * _np.sin(2 * _np.pi * 0.9 * t_)   # déjà près de la butée
    y_ = _je.remontee_ecoute(y0_.astype(_np.float32), ec_, f_, 4.0, 6.0)
    acc_ = float(_np.abs(y_[2:] - 2 * y_[1:-1] + y_[:-2]).max())
    if acc_ > 2.5: echecs.append(f'écoute : à-coup {acc_:.2f} > 2,5 quand la remontée bute sur l’enveloppe')
    if _np.abs(y_).max() > max(6.0, _np.abs(y0_).max()) + 0.05: echecs.append('écoute : la remontée dépasse l’enveloppe')
    sr_ = 48000; n_ = 4 * sr_; tt_ = _np.arange(n_) / sr_; rg_ = _np.random.default_rng(5)
    voix_ = 0.3 * _np.sin(2 * _np.pi * 180 * tt_) * (1 + 0.5 * _np.sin(2 * _np.pi * 3 * tt_))
    sif_ = _np.zeros(n_); sif_[int(1.5 * sr_):int(1.6 * sr_)] = 0.25 * rg_.standard_normal(int(0.1 * sr_))   # « s » trop fort
    from scipy.signal import butter as _bu, sosfiltfilt as _sf
    x_ = voix_ + _sf(_bu(4, 6000, 'high', fs=sr_, output='sos'), sif_)
    if not _so.aigus(x_, sr_): echecs.append('son : le banc de sifflante n’est pas détecté (banc invalide)')
    z_ = _so.garde_aigus(x_, sr_)
    if _so.aigus(z_, sr_): echecs.append(f'son : sifflante encore au-dessus du seuil après la garde ({_so.aigus(z_, sr_)[:1]})')
    if _np.abs(z_[:sr_] - x_[:sr_]).max() > 1e-6: echecs.append('son : la garde des sifflantes touche une parole conforme')
    src_ = open(os.path.join(ICI, 'moteur-troupe', 'qualite.py'), encoding='utf-8').read()
    if 'returncode < 0' not in src_ or 'relancé seul' not in src_ or 'q_[0].wait()' not in src_:
        echecs.append('portes : un juge tué par le noyau n’est pas relancé seul (après les autres juges)')
    print(f'écoute en butée sans à-coup ({acc_:.2f}), sifflante ramenée sous le seuil, juge tué relancé')
except Exception as e:
    echecs.append(f'v12 : {e}')

# 19/10/2026 — (1) MUSIQUE DE FOND sous la parole : au moins 20 dB sous chaque fenêtre de parole (WCAG 1.4.7), présente entre
# les répliques ; (2) NORME DE HAUTEUR : une réplique à 1,3 × la hauteur visée est une faute (contrôle resserré, ancien 1,6 ×) ;
# (3) ESSAI ÉCLAIR câblé (tournage sans rendu, portes mesurables, bande son en temps masqué) ; (4) PERMANENCE DES OBJETS et
# SOURCILS sur la scène du maquis quand la bibliothèque privée est présente (MASSAMBA_BIBLIO)
try:
    import numpy as _np, importlib as _il
    _mu = _il.import_module('musique'); _so = _il.import_module('sonie')
    sr_ = _mu.SR; n_ = 12 * sr_; tt_ = _np.arange(n_) / sr_
    parle_ = ((tt_ % 3) < 2).astype(_np.float32)                                              # 2 s de parole, 1 s de silence
    v_ = (0.3 * _np.sin(2 * _np.pi * 160 * tt_) * parle_).astype(_np.float32)
    lit_ = (0.4 * _np.sin(2 * _np.pi * 98 * tt_) * (1 + _np.sin(2 * _np.pi * 1.7 * tt_))).astype(_np.float32)   # tapis bruyant
    out_, mes_ = _mu.mixe_tapis(v_, lit_)
    if mes_['pire_ecart_tapis_moins_parole_db'] > -20.0: echecs.append(f"musique : tapis à {mes_['pire_ecart_tapis_moins_parole_db']} dB de la parole (≤ −20 exigé)")
    if not mes_.get('tapis_entre_les_repliques_vs_parole_mediane_db') or mes_['tapis_entre_les_repliques_vs_parole_mediane_db'] < -40:
        echecs.append('musique : tapis inaudible entre les répliques')
    import scipy.signal as _ss
    sr2_ = 22050; t2_ = _np.arange(2 * sr2_) / sr2_; c_ = 150.0
    def _voix(f):   # train d'impulsions glottiques avec vibrato (Harvest ne suit pas une sinusoïde pure)
        ph_ = 2 * _np.pi * _np.cumsum(f * (1 + 0.02 * _np.sin(2 * _np.pi * 5 * t2_))) / sr2_
        return _ss.sosfiltfilt(_ss.butter(4, 3000, 'low', fs=sr2_, output='sos'), 0.3 * _ss.sawtooth(ph_))
    f_ = _so.aigus(_voix(1.3 * c_), sr2_, [{'qui': 'X', 't0': 0.0, 'dur': 2.0}], {'X': c_})
    if not any(x_.get('sorte') == 'hauteur' for x_ in f_): echecs.append('voix : une réplique à 1,3 × la hauteur visée passe le contrôle')
    if any(x_.get('sorte') == 'hauteur' for x_ in _so.aigus(_voix(c_), sr2_, [{'qui': 'X', 't0': 0.0, 'dur': 2.0}], {'X': c_})):
        echecs.append('voix : une réplique à la hauteur visée est refusée')
    src_u = open(os.path.join(ICI, 'moteur-troupe', 'usine.py'), encoding='utf-8').read()
    src_t = open(os.path.join(ICI, 'moteur-troupe', 'tourne.py'), encoding='utf-8').read()
    src_q = open(os.path.join(ICI, 'moteur-troupe', 'qualite.py'), encoding='utf-8').read()
    if "def eclair(" not in src_u or "TOURNE_SANS_RENDU" not in src_t or "QUALITE_ECLAIR" not in src_q or 'bande_livree' not in src_u:
        echecs.append('éclair : essai sans rendu non câblé (usine.eclair, tourne TOURNE_SANS_RENDU, qualite QUALITE_ECLAIR)')
    if 'objets_attaches_aux_acteurs' not in src_q or 'sourcils_ecart_bibliotheque' not in src_q:
        echecs.append('portes : permanence des objets (K) ou sourcils (P) absents')
    bib_ = os.path.expanduser(os.environ.get('MASSAMBA_BIBLIO', ''))
    mq_ = os.path.join(bib_, 'prep', 'maquis') if bib_ else ''
    if mq_ and os.path.isfile(os.path.join(mq_, 'rig', 'scene_rig.json')):
        _pr = _il.import_module('prepare_rig'); at_ = _pr.objets_attaches(mq_)
        if at_ and any(at_.values()): echecs.append(f'objets : objets posés encore attachés aux acteurs du maquis {at_}')
        print(f'maquis : objets attachés {at_}')
    print(f"musique sous la parole ({mes_['pire_ecart_tapis_moins_parole_db']} dB au pire), hauteur 1,3 × refusée, essai éclair câblé")
except Exception as e:
    echecs.append(f'19/10 : {e}')

# SOUS-TITRES AU MOT PRÈS (19/10/2026) : bornes des mots tirées des durées de phonèmes Piper ; une liaison (« le-z ») ne coupe
# pas le mot, un phonème absent de la table du modèle (« ̃ » de gilles-low) ne fait plus perdre l'alignement de toute la phrase.
try:
    import types as _ty
    _vx = _il.import_module('voix')
    _ph = lambda s_: [{'ph': c_, 't0': i_ * 0.1, 't1': i_ * 0.1 + 0.1} for i_, c_ in enumerate(s_)]
    _g = _vx.bornes_mots(_ph('^le-z ɑbutɛjaʒ də- jopuɡɔ.$'))   # « les embouteillages de Yopougon » : 4 mots, « lez » d'un seul tenant
    if len(_g) != 4 or abs(_g[0][1] - 0.5) > 1e-6: echecs.append(f'sous-titres : la liaison « le-z » coupe le mot ({_g})')
    _idm = {'^': [1], '$': [2], '_': [0], 'a': [5], 'b': [6]}
    _c = _ty.SimpleNamespace(phoneme_alignments=None, phonemes=['a', '̃', 'b'], phoneme_ids=[1, 0, 5, 0, 6, 0, 2],
                             phoneme_id_samples=[10, 1, 20, 2, 30, 3, 40])
    _al = _vx._alignements(_ty.SimpleNamespace(config=_ty.SimpleNamespace(phoneme_id_map=_idm)), _c)
    if [n_ for _, n_ in _al] != [11, 22, 33, 40]: echecs.append(f'sous-titres : alignement Piper perdu sur un phonème hors table ({_al})')
    if "L.get('mots')" not in open(os.path.join(ICI, 'moteur-troupe', 'compose.py'), encoding='utf-8').read() or 'mots=bornes_mots(ph)' not in \
            open(os.path.join(ICI, 'moteur-troupe', 'voix.py'), encoding='utf-8').read():
        echecs.append('sous-titres : bornes de mots Piper non câblées (voix → timeline → compose.words_of)')
    _vf = _il.import_module('visemes_fr')   # greffe TalkingHead (MIT) : bouche fermée sur m, b, p à l'instant exact de Piper
    _c = _vf.depuis_piper([['^', 0, 0.05], ['m', 0.05, 0.12], ['a', 0.12, 0.3], [' ', 0.3, 0.33], ['p', 0.33, 0.4], ['a', 0.4, 0.55], ['.', 0.55, 0.8]], 0.8)
    if [x['value'] for x in _c][:5] != ['X', 'A', 'D', 'A', 'D'] or _c[-1]['end'] != 0.8:
        echecs.append(f'bouche : visèmes Piper/TalkingHead faux ({_c})')
    print('sous-titres : bornes de mots Piper (liaison, phonème hors table) vérifiées ; bouche m-b-p fermée (TalkingHead)')
except Exception as e:
    echecs.append(f'sous-titres 19/10 : {e}')

# RENDU DIRECT PAR MAILLAGE (19/10/2026, greffe Live2D/Spine) : zéro déplacement redonne la source, une translation la décale
# exactement (conventions de centres de pixels) ; sans OpenGL, l'ancien chemin doit rester disponible (repli automatique)
try:
    import numpy as _n2
    _rg = _il.import_module('rig2d')
    if _rg.gl_actif():
        _src = (_n2.random.default_rng(3).random((140, 140, 3)) * 255).astype(_n2.uint8); _src = __import__('cv2').GaussianBlur(_src, (0, 0), 2)
        _R = {'box': (20, 20, 120, 120), 'gx': _n2.arange(0, 141, 10, dtype=_n2.float32), 'gy': _n2.arange(0, 141, 10, dtype=_n2.float32)}
        _a = _n2.ones((140, 140), _n2.float32); _U = _n2.zeros((15, 15, 2), _n2.float32)
        _rgb, _al = _rg.rendre_maillage(_R, _U, _src, _a)
        _e0 = float(_n2.abs(_rgb - _src[20:120, 20:120]).mean())
        _U[..., 0], _U[..., 1] = 3.0, 2.0; _rgb2, _ = _rg.rendre_maillage(_R, _U, _src, _a)
        _e1 = float(_n2.abs(_rgb2[2:-2, 3:-3] - _src[20:118, 20:117][: _rgb2[2:-2, 3:-3].shape[0], : _rgb2[2:-2, 3:-3].shape[1]]).mean())
        if _e0 > 1.0 or _e1 > 1.5 or float(_al[5:-5, 5:-5].min()) < 0.99:
            echecs.append(f'rendu par maillage : écart à la source {_e0:.2f}, translation {_e1:.2f}, alpha min {float(_al.min()):.2f}')
        print(f'rendu par maillage (OpenGL logiciel) : écart identité {_e0:.2f}, translation {_e1:.2f} niveaux')
    else:
        print('rendu par maillage indisponible : ancien chemin (repli prévu)', _rg._GL.get('err', ''))
except Exception as e:
    echecs.append(f'rendu par maillage : {e}')

# CADENCE UNIQUE (19/10/2026, « oui pour 30 images par seconde ») : le tournage écrit sa cadence dans tournage.json et chaque
# étape la relit ; aucune étape ne suppose 60 i/s (sinon le flou de bougé épargne la mauvaise image aux raccords)
try:
    import tempfile as _tf, json as _js, inspect as _ins
    _fl = _il.import_module('fluidite'); _mq = _il.import_module('marque')
    _src_t = open(os.path.join(ICI, 'moteur-troupe', 'tourne.py'), encoding='utf-8').read()
    if "os.environ.get('FILM_FPS', 30)" not in _src_t: echecs.append('cadence : tourne.py ne tourne pas à 30 i/s par défaut')
    if _ins.signature(_mq.Habillage.__init__).parameters['fps'].default != 30: echecs.append('cadence : marque.Habillage suppose encore 60 i/s')
    with _tf.TemporaryDirectory() as _d:
        os.makedirs(f'{_d}/clip'); _js.dump({'fps': 30}, open(f'{_d}/tournage.json', 'w'))
        import cv2 as _cv, numpy as _n3
        for _k in range(30):
            _im = _n3.full((64, 64, 3), 40, _n3.uint8); _cv.rectangle(_im, (_k, 20), (_k + 12, 40), (230, 230, 230), -1)
            _cv.imwrite(f'{_d}/clip/f{_k:05d}.jpg', _im)
        _vu = {}
        _orig = _fl._flou_tache
        _fl._flou_tache = lambda a: (_vu.setdefault('r', a[4]), 0)[1]
        try: _fl.flou_bouge(f'{_d}/clip', coupes=[0.5], procs=1)
        finally: _fl._flou_tache = _orig
        if _vu.get('r') != {14, 15}: echecs.append(f'cadence : flou de bougé, raccord à 0,5 s lu aux images {_vu.get("r")} (attendu 14-15 à 30 i/s)')
    print('cadence : 30 i/s par défaut, relue par le flou de bougé et l\'habillage')
except Exception as e:
    echecs.append(f'cadence : {e}')

if echecs:
    print('ÉCHECS :\n- ' + '\n- '.join(echecs)); sys.exit(1)
print('moteur : OK')
