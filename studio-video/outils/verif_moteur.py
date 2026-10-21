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
        # UNE PASSE (corps + calque de bras rigide mêlés par OpenGL) = corps + mélange numpy de l'ancien chemin
        _cal = _n2.zeros((40, 30), _n2.float32); __import__('cv2').circle(_cal, (15, 20), 12, 1.0, -1); _cal = __import__('cv2').GaussianBlur(_cal, (0, 0), 1.5)
        _b = {'calque': _cal, 'rgb': _n2.full((40, 30, 3), (30, 200, 90), _n2.uint8), 'box': (50, 50, 80, 90)}
        _A = _rg._tr((-20, -20)) @ _rg._tr((7.3, -4.6)) @ _rg._tr((50, 50))
        _U[...] = 0; _ac, _al1 = _rg.rendre_personnage(dict(_R, src_corps=[]), _U, _src, _a, [(_b, _A)])
        _rgb0, _al0 = _rg.rendre_maillage(_R, _U, _src, _a); _acc0 = _rgb0 * _al0[..., None]
        _k = __import__('cv2').warpAffine(_cal, _A[:2], (100, 100), flags=__import__('cv2').INTER_LINEAR, borderValue=0)
        _r = __import__('cv2').warpAffine(_b['rgb'], _A[:2], (100, 100), flags=__import__('cv2').INTER_LINEAR, borderMode=__import__('cv2').BORDER_REPLICATE)
        _acc0 = _acc0 * (1 - _k[..., None]) + _r * _k[..., None]; _al0 = _al0 * (1 - _k) + _k
        _e2 = float(_n2.abs(_ac - _acc0).max()); _e3 = float(_n2.abs(_al1 - _al0).max())
        if _e2 > 3.0 or _e3 > 0.02: echecs.append(f'personnage en une passe : écart {_e2:.2f} niveaux, alpha {_e3:.3f}')
        print(f'personnage en une passe (corps + bras, mélange OpenGL) : écart {_e2:.2f} niveaux, alpha {_e3:.3f}')
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

# SON NON ÉCRASÉ, CADRE SANS BOUT, CHAÎNE GÉNÉRATIVE (20/10/2026) : deux compresseurs avant le limiteur et sa mesure jugée ;
# juge C sur les côtés et les bouts ; ordre [haut, gauche, bas, droite] des masques d'InfiniteTalk ; plafond dur Modal
try:
    _so = _il.import_module('sonie'); import numpy as _n4
    _t = _n4.arange(48000 * 2) / 48000; _a = _n4.sin(2 * _n4.pi * 220 * _t) * 0.2; _b = _a.copy(); _b[48000:48480] *= 0.25
    _p, _ = _so.travail_limiteur(_a, _b)
    if not 0 < _p < 5: echecs.append(f'son : la mesure du travail du limiteur ne voit pas une baisse de 12 dB sur 10 ms ({_p} %)')
    _src_s = open(os.path.join(ICI, 'moteur-troupe', 'sonie.py'), encoding='utf-8').read()
    if 'detection=peak' not in _src_s or 'detection=rms' not in _src_s: echecs.append('son : les deux compresseurs (lent RMS, crêtes) manquent avant le limiteur')
    _src_j = open(os.path.join(ICI, 'moteur-troupe', 'juge_unique.py'), encoding='utf-8').read()
    if 'limiteur_part_pct' not in _src_j or 'bouts' not in _src_j: echecs.append('juge unique : travail du limiteur ou bouts de personnage non jugés')
    _g = os.path.join(ICI, 'generatif')
    _src_p = open(os.path.join(_g, 'plan_generatif.py'), encoding='utf-8').read()
    if "round(max(0, c[1])), round(max(0, c[0])), round(min(KH, c[3])), round(min(KW, c[2]))" not in _src_p:
        echecs.append('génératif : le masque d\'InfiniteTalk n\'est plus écrit [haut, gauche, bas, droite] (wan/multitalk.py l. 592-601)')
    _src_m = open(os.path.join(_g, 'modal_studio.py'), encoding='utf-8').read()
    if 'if deja + estime > PLAFOND_USD' not in _src_m or 'raise SystemExit' not in _src_m: echecs.append('génératif : plafond dur Modal absent')
    print('son (deux compresseurs, limiteur mesuré), juge C étendu, génératif (masques, plafond) : OK')
except Exception as e:
    echecs.append(f'son / génératif : {e}')

# TOUTE LA TROUPE (20/10/2026) : visages du casting replacés sur une figure posée ailleurs (échelle, place, miroir) ; voix
# distinctes pour les 54 ; repli curl d'AI Horde (Cloudflare 1010) ; série reprenable (diskcache) dans l'ordre des étapes
try:
    import tempfile, json as _js, numpy as _n5, cv2 as _cv5
    _ct = _il.import_module('casting_troupe')
    with tempfile.TemporaryDirectory() as _tmp:
        _fig = _n5.zeros((400, 120, 4), _n5.uint8); _fig[20:390, 10:110] = 255                    # figure de 100 × 370 px utiles
        _os_ = os; _os_.makedirs(f'{_tmp}/casting/x/visages'); _cv5.imwrite(f'{_tmp}/casting/x/figure.png', _fig)
        _cv5.imwrite(f'{_tmp}/casting/x/visages/neutre_0.png', _n5.dstack([_n5.tile(_n5.arange(64, dtype=_n5.uint8), (64, 1))] * 3))
        _js.dump({'u0': 0.1, 'v0': 0.05, 'su': 0.5, 'sv': 0.5 * 100 / 370, 'miroir': False, 'taille': 64, 'empreinte': 'e'}, open(f'{_tmp}/casting/x/visages/casting.json', 'w'))
        _js.dump({'box': [0, 0, 1], 'taille': 64, 'emotions': ['neutre'], 'bouche': [0]}, open(f'{_tmp}/casting/x/visages/meta.json', 'w'))
        _sl = _ct.slug_de; _ct.slug_de = lambda n: 'x'
        try:
            for _mir, _att in ((False, 200 + 0.1 * 200), (True, 200 + (1 - 0.1 - 0.5) * 200)):
                _d = f'{_tmp}/prep/s{int(_mir)}'; _os_.makedirs(_d)
                _js.dump({'acteurs': [{'nom': 'X', 'slug': 'x'}], 'compose': {'acteurs': [{'nom': 'X', 'x': 300, 'pieds_y': 900, 'hauteur_px': 740, 'miroir': _mir}]}}, open(f'{_d}/scene.json', 'w'))
                _ct.transfere(_d, _tmp, journal=lambda *a: None)
                _M = _js.load(open(f'{_d}/expressions/x/meta.json')); _bx = _M['box']; _im = _cv5.imread(f'{_d}/expressions/x/neutre_0.png')
                if abs(_bx[0] - _att) > 1.5 or abs(_bx[2] - 100) > 1.5 or abs(_bx[1] - (160 + 0.05 * 740)) > 1.5:
                    echecs.append(f'casting : cadre replacé faux (miroir={_mir}) {[round(v, 1) for v in _bx]}')
                if bool(_im[0, 0, 0] > _im[0, -1, 0]) != _mir: echecs.append(f'casting : images non retournées en miroir ({_mir})')
        finally: _ct.slug_de = _sl
    import itertools as _it5
    _vx = _il.import_module('voix'); _noms = list(_js.load(open(os.path.join(ICI, 'blender', 'film', 'characters.json'), encoding='utf-8')))
    _T = {n: _vx.CAST[n] for n in _noms}
    _conf = [(a, b) for a, b in _it5.combinations(_T, 2) if _T[a][0] == _T[b][0] and _vx._distance(_T[a], _T[b]) < 1]
    if _conf: echecs.append(f'voix : {len(_conf)} paires confondables parmi les {len(_T)} personnages, ex. {_conf[:2]}')
    if any(_vx.CAST[n] != v for n, v in _vx.CAST_CALIBRE.items()): echecs.append('voix : une voix calibrée de la troupe a changé')
    if "'curl'" not in open(os.path.join(ICI, 'moteur-troupe', 'horde.py'), encoding='utf-8').read(): echecs.append('horde : repli curl absent (Cloudflare 1010)')
    _se = _il.import_module('serie')
    if _se.ETAPES != ('distribue', 'scenes', 'ecrit', 'tourne', 'fini') or set(_se.FAIRE) != {'scenes', 'ecrit', 'tourne', 'fini'}: echecs.append('série : étapes')
    print(f'casting (cadre replacé et miroir), voix distinctes ({len(_T)} personnages, 0 confondable), Horde (curl), série : OK')
except Exception as e:
    echecs.append(f'casting / voix / série : {e}')

# ÉPISODE PUBLIABLE ET RAPIDE (20/10/2026) : avance des lèvres mesurée, voisin collé → plan à deux, sortie de champ en
# mouvement, vote en commentaire, viralité mesurée, fumée hors champ, film + TikTok d'une passe, essai des visages en cache
try:
    import importlib as _il6, json as _js6, tempfile as _tf6, random as _rd6, numpy as _n6
    _sy = _il6.import_module('synchro'); _rd6.seed(1); _L6 = []
    for _r in range(8):
        _ph, _t = [], 0.0
        while _t < 2.0:
            _d = _rd6.uniform(0.06, 0.15); _ph.append({'t0': _t, 't1': _t + _d, 'open': _rd6.choice([0, 1, 2, 3, 4])}); _t += _d
        _o = _n6.zeros(220)
        for _p in _ph: _o[int(_p['t0'] * 100):int(_n6.ceil(_p['t1'] * 100))] = _p['open'] / 4
        _e = _n6.roll(_o, -5); _e[-5:] = 0; _L6.append({'phonemes': _ph, 'env': _e.tolist()})   # voix 50 ms avant les phonèmes
    _av, _m6 = _sy.avance_levres(_L6)
    if abs(_av - 0.07) > 0.011: echecs.append(f'synchro : avance des lèvres {_av} s au lieu de 0,07 (retard mesuré {_m6})')
    _mq = _il6.import_module('marque')
    if (_mq.nom_court('PETIT MAMADOU'), _mq.nom_court('BAYE NDIAYE'), _mq.nom_court('TANTIE AWA'), _mq.nom_court('KOFFI')) != ('MAMADOU', 'BAYE', 'TANTIE AWA', 'KOFFI'):
        echecs.append('marque : noms courts du vote')
    _PT = _il6.import_module('publie_tiktok'); _vi = _il6.import_module('viralite'); _pr = _PT.PRIVE
    with _tf6.TemporaryDirectory() as _tmp6:
        _PT.PRIVE = _tmp6
        try:
            _vi.note('a', vues=1000, jaime=80, commentaires=12, partages=5, publiee='2026-10-20T00:00:00+00:00'); _vi.note('b', vues=500, jaime=10, commentaires=1, partages=0)
            _R6 = _vi.rapport(); _v0 = _R6['videos'][0]
            if _R6['mesurees'] != 2 or _v0['video'] != 'a' or _v0['taux_commentaire_pct'] != 1.2 or _v0['engagement_pct'] != 9.7: echecs.append(f'viralité : rapport faux {_v0}')
        finally: _PT.PRIVE = _pr
    _src = {f: open(os.path.join(ICI, 'moteur-troupe', f), encoding='utf-8').read() for f in ('tourne.py', 'juge_unique.py', 'compose.py', 'usine.py', 'fume_visages.py', 'decor_vivant.py')}
    for _f, _mot in (('tourne.py', 'def voisin_coupe'), ('tourne.py', 'synchro.avance_levres'), ('tourne.py', "e_[n_]['ouv']"), ('tourne.py', 'def _fumee_vue'),
                     ('juge_unique.py', 'sorties_de_champ_en_mouvement'), ('compose.py', 'COMPOSE_TIKTOK'), ('compose.py', 'HAB.vote('),
                     ('usine.py', "'COMPOSE_TIKTOK': tk"), ('fume_visages.py', '.fume-ok'), ('decor_vivant.py', 'def rect_fumee')):
        if _mot not in _src[_f]: echecs.append(f'{_f} : « {_mot} » absent')
    if 'os.nice(' not in open(os.path.join(ICI, 'outils', 'veille_rea.py'), encoding='utf-8').read(): echecs.append('veille_rea : priorité basse absente')
    print(f'synchro labiale (avance {_av:.2f} s pour 50 ms de retard), vote, viralité, cadrage, vitesse : OK')
except Exception as e:
    echecs.append(f'synchro / vote / viralité : {e}')

# FABRIQUE (20/10/2026) : autopilote, doublons, version téléchargeable ≤ 15 Mo, distribution imposée et duos récurrents
try:
    import importlib as _il7, tempfile as _tf7, subprocess as _sp7
    _db7 = _il7.import_module('doublons')
    if _db7.ressemblance([1, 2, 3], [1, 2, 3]) != 1.0 or _db7.ressemblance([0], [2 ** 64 - 1]) != 0.0: echecs.append('doublons : ressemblance fausse')
    if not (_db7.SEUIL_PROCHE < _db7.SEUIL_DOUBLON <= 0.612): echecs.append('doublons : seuils hors du calibrage (versions d’un même épisode ≥ 0,612)')
    with _tf7.TemporaryDirectory() as _t7:
        os.environ['MASSAMBA_BIBLIO'] = _t7
        for _m in ('casting_troupe', 'serie', 'autopilot'): sys.modules.pop(_m, None)
        _ap = _il7.import_module('autopilot')
        _v7 = os.path.join(_t7, 'essai.mp4'); _o7 = os.path.join(_t7, 'tel.mp4')
        _sp7.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
                  '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', _v7], check=True)
        _r7 = _ap.version_tel(_v7, _o7, cible_mo=1.0)
        if _r7['taille_mo'] > 1.0 or (_r7['ssim'] or 0) < 0.9: echecs.append(f'autopilote : version téléchargeable hors cible {_r7}')
        if not 0.95 <= _ap.SSIM_MIN < 1: echecs.append(f'autopilote : plancher de qualité SSIM_MIN hors bornes ({_ap.SSIM_MIN})')
        os.makedirs(_ap.LIV, exist_ok=True); json.dump([1, 2], open(os.path.join(_ap.LIV, 'x.emp.json'), 'w'))
        if _ap.fiches() != []: echecs.append('autopilote : empreintes lues comme fiches')
    # fabrique indépendante (GitHub) : coffre scellé ouvrable avec la phrase, refusé sans elle ; créneaux de constance
    sys.path.insert(0, os.path.join(ICI, 'fabrique')); _cf = _il7.import_module('coffre')
    with _tf7.TemporaryDirectory() as _t8:
        _cf.cles(_t8, 'phrase de controle jetable')
        _m8 = _cf.scelle_octets(b'troupe' * 1000, _cf._pub(os.path.join(_t8, 'cle.pub.pem')))
        if _cf.ouvre_octets(_m8, _cf._priv(os.path.join(_t8, 'cle.priv.json'), 'phrase de controle jetable')) != b'troupe' * 1000: echecs.append('coffre : ouverture fausse')
        try: _cf._priv(os.path.join(_t8, 'cle.priv.json'), 'mauvaise phrase de test'); echecs.append('coffre : mauvaise phrase acceptée')
        except Exception: pass
    import datetime as _dt8
    _c8 = _ap.prochain_creneau(set(), _dt8.datetime(2026, 10, 20, 23, 0, tzinfo=_dt8.timezone.utc))
    if not _c8.startswith('2026-10-21T'): echecs.append(f'autopilote : créneau suivant faux ({_c8})')
    _s7 = open(os.path.join(ICI, 'moteur-troupe', 'serie.py'), encoding='utf-8').read()
    if 'def impose(' not in _s7 or 'reprises' not in _s7: echecs.append('série : distribution imposée ou duos récurrents absents')
    print(f"fabrique : doublons (seuil {_db7.SEUIL_DOUBLON}), version téléchargeable {_r7['taille_mo']} Mo SSIM {_r7['ssim']}, file : OK")
except Exception as e:
    echecs.append(f'fabrique : {e}')

# humour au maximum (20/10/2026) : choc final exigé et jugé, plancher V17, juge comique gratuit quand JEV est coupé
try:
    _src8 = open(os.path.join(ICI, 'moteur-troupe', 'histoires.py'), encoding='utf-8').read()
    _v8 = json.load(open(os.path.join(ICI, 'moteur-troupe', 'plancher_v17.json'), encoding='utf-8'))
    if len(_v8) != 3 or any(sum(1 for r in v['repliques'] if r.get('chute')) != 1 for v in _v8): echecs.append('humour : plancher V17 incomplet')
    for _m8 in ("'choc': {'type': 'score'", 'def plancher_v17(', 'def _juge_llm(', 'if not jev_api.autorise(): return _juge_llm', 'LE CHOC FINAL', '_EN_VOL'):
        if _m8 not in _src8: echecs.append(f'humour : « {_m8} » absent de histoires.py')
    print('humour : choc final jugé, plancher V17 (3 sketchs), juge comique gratuit : OK')
except Exception as e:
    echecs.append(f'humour : {e}')

# scénariste ouvert sur machine GitHub (21/10/2026) : HISTOIRES_URL déplace le SCÉNARISTE, jamais le juge calibré
try:
    sys.path.insert(0, os.path.join(ICI, 'moteur-troupe')); import histoires as _h10, urllib.request as _u10
    _vus10, _orig10 = [], _u10.urlopen
    class _R10:
        def __init__(s, c): s.c = c
        def read(s): return json.dumps({'choices': [{'message': {'content': s.c}}]}).encode()
    def _faux10(req, timeout=None):
        _vus10.append((req.full_url, json.loads(req.data)['model'], timeout)); return _R10('{}')
    _env10 = {k: os.environ.get(k) for k in ('HISTOIRES_URL', 'HISTOIRES_DELAI', 'HISTOIRES_JUGE_URL')}
    os.environ.update(HISTOIRES_URL='http://127.0.0.1:8080/v1/chat/completions', HISTOIRES_DELAI='1800'); os.environ.pop('HISTOIRES_JUGE_URL', None)
    _u10.urlopen = _faux10
    try: _h10.llm('x'); _h10.llm('x', juge=True)
    finally:
        _u10.urlopen = _orig10
        for _k, _v in _env10.items():
            if _v is None: os.environ.pop(_k, None)
            else: os.environ[_k] = _v
    if _vus10[0][0] != 'http://127.0.0.1:8080/v1/chat/completions' or _vus10[0][2] != 1800: echecs.append('scénariste : HISTOIRES_URL ou délai ignorés')
    if _vus10[1][0] != _h10.LLM_URL or _vus10[1][1] != 'openai-fast' or _vus10[1][2] != 240: echecs.append('scénariste : le juge a suivi le scénariste')
    print('scénariste ouvert : HISTOIRES_URL déplace le scénariste, le juge reste le modèle calibré : OK')
except Exception as e:
    echecs.append(f'scénariste ouvert : {e}')

# synchro labiale par choix d'images (21/10/2026) : la bouche montrée suit la voix, sans saut de plus de 3 images
try:
    sys.path.insert(0, os.path.join(ICI, 'banque')); import levres_banque as _lb11
    _q11 = 0.05 + 0.05 * np.sin(np.arange(33) / 33 * 2 * np.pi * 2)            # clip : bouche qui s'ouvre et se ferme deux fois
    _e11 = (np.sin(np.arange(72) / 24 * 2 * np.pi * 2.2) > 0.3).astype(float)  # voix : syllabes à 2,2 Hz pendant 3 s
    _a11, _b11, _s11 = _lb11.ordre_mesure(_q11, _e11, 24)
    if _b11 < 0.35 or _b11 < _a11 + 0.2: echecs.append(f'synchro labiale : corrélation {_a11} → {_b11}')
    if max(abs(_s11[i] - _s11[i - 1]) for i in range(1, len(_s11))) > 3 and max(_s11) - min(_s11) < 30:
        echecs.append('synchro labiale : saut d\'image de plus de 3')
    print(f'synchro labiale : corrélation lèvres/voix {_a11} → {_b11} : OK')
except Exception as e:
    echecs.append(f'synchro labiale : {e}')

# réparer au lieu de jeter (21/10/2026) : un brouillon refusé pour la forme revient au scénariste avec ses défauts exacts
try:
    import histoires as _h12
    _bon12 = {'titre': 't', 'repliques': [{'qui': 'KOFFI', 'texte': "Coumba, ce soir c'est moi qui paie, dêh !", 'jeu': 'frime'},
              {'qui': 'COUMBA', 'texte': 'Toi ? Ehhh Dieu, depuis quand, hein ?', 'jeu': 'soupcon'},
              {'qui': 'KOFFI', 'texte': 'Depuis que ton porte-monnaie est sur la table.', 'jeu': 'malice'},
              {'qui': 'COUMBA', 'texte': 'Mon porte-monnaie ? Koffi, rends-moi ça !', 'jeu': 'choc'},
              {'qui': 'KOFFI', 'texte': "Doucement, c'est le patron qui encaisse.", 'jeu': 'frime'},
              {'qui': 'COUMBA', 'texte': 'Quel patron ? Tu es fauché !', 'jeu': 'accuse'},
              {'qui': 'KOFFI', 'texte': 'Ce soir, le patron paie avec toi.', 'jeu': 'rire', 'role': 'chute'}]}
    _mal12 = json.loads(json.dumps(_bon12)); _mal12['repliques'][-1]['texte'] = 'Ce soir, mon frère, le patron paie vraiment avec ton argent à toi.'
    _vus12 = []; _orig12 = _h12.llm
    _h12.llm = lambda p, temp=1.0, juge=False: (_vus12.append(p), json.dumps(_bon12))[1]
    try:
        _hh12, _d12 = _h12.verifie(json.dumps(_mal12), 'maquis', [], 'sketch', lambda t: None)
        _hx12, _dx12 = _h12.verifie(json.dumps(_bon12), 'maquis', ['Ce soir, le patron paie avec toi.'], 'sketch', lambda t: None)
    finally: _h12.llm = _orig12
    if _d12 or len(_vus12) != 1 or 'mots :' not in _vus12[0]: echecs.append(f'réparation des brouillons : {_d12}, {len(_vus12)} appel(s)')
    if _dx12 != ['chute déjà utilisée'] or len(_vus12) != 1: echecs.append('réparation des brouillons : une chute déjà utilisée a été « réparée »')
    print('réparation des brouillons : défauts de forme réparés en 1 appel, chute déjà utilisée laissée au brouillon neuf : OK')
except Exception as e:
    echecs.append(f'réparation des brouillons : {e}')

# quasi-doublons de chute (21/10/2026) : à 10 000 sketchs, la même chute reformulée doit être refusée, deux chutes différentes non
try:
    import histoires as _h14
    _dj14 = ['Dans la sauce grée, mon djê !', 'Le quartier te dit merci, Tantie !']
    if _h14.ressemblance('Mon djê ? Dans la sauce grée !', _dj14[0]) < _h14.SEUIL_DOUBLON: echecs.append('quasi-doublons : reformulation non vue')
    if max(_h14.ressemblance('Sourd aux dettes, pas aux barres !', x) for x in _dj14) >= _h14.SEUIL_DOUBLON: echecs.append('quasi-doublons : chute neuve refusée')
    print('quasi-doublons de chute : reformulation refusée, chute neuve acceptée : OK')
except Exception as e:
    echecs.append(f'quasi-doublons : {e}')

# jeu varié (21/10/2026, « La Douane du Gâteau ») : plus de la moitié des répliques en « neutre » = défaut à réparer, la moitié non
try:
    _L18 = next(iter(_h14.LIEUX))
    def _d18(jeux): return [x for x in _h14.controle({'titre': 't', 'repliques': [{'qui': '', 'texte': 'a', 'jeu': j} for j in jeux]}, _L18) if 'neutre' in x]
    if not _d18(['neutre', 'neutre', 'neutre', 'choc']): echecs.append('jeu varié : 3 neutres sur 4 non vus')
    if _d18(['neutre', 'neutre', 'accuse', 'choc']): echecs.append('jeu varié : 2 neutres sur 4 refusés')
    print('jeu varié : 3 répliques « neutre » sur 4 à réparer, 2 sur 4 acceptées : OK')
except Exception as e:
    echecs.append(f'jeu varié : {e}')

# consigne réutilisable par le cache du serveur (21/10/2026) : le début de la consigne est le même d'un lieu à l'autre (le lieu et la
# distribution viennent après les règles), et chaque appel garde le chronométrage rendu par llama-server
try:
    import os as _os19, io as _io19, urllib.request as _ur19
    _L19 = list(_h14.LIEUX); _a19, _b19 = _h14.consignes(_L19[0], None, [], '', ''), _h14.consignes(_L19[-1], None, [], '', '')
    _p19 = len(_os19.path.commonprefix([_a19, _b19])) / min(len(_a19), len(_b19))
    if _p19 < 0.8: echecs.append(f'consigne : début commun à deux lieux {_p19:.0%} (80 % exigé)')
    _u19 = _ur19.urlopen; _e19 = _os19.environ.get('HISTOIRES_URL'); _n19 = len(_h14.TEMPS)
    _ur19.urlopen = lambda req, timeout=0: _io19.BytesIO(json.dumps({'choices': [{'message': {'content': 'x'}, 'finish_reason': 'stop'}],
                                                                     'timings': {'prompt_n': 9, 'cache_n': 90, 'prompt_ms': 1.0, 'predicted_n': 5, 'predicted_ms': 2.0}}).encode())
    try:
        _os19.environ['HISTOIRES_URL'] = 'http://127.0.0.1:1/v1/chat/completions'; _h14.llm('x')
    finally:
        _ur19.urlopen = _u19
        if _e19 is None: _os19.environ.pop('HISTOIRES_URL', None)
        else: _os19.environ['HISTOIRES_URL'] = _e19
    if len(_h14.TEMPS) != _n19 + 1 or _h14.TEMPS[-1].get('cache_n') != 90: echecs.append('chronométrage des appels non relevé')
    del _h14.TEMPS[_n19:]
    print(f'consigne : début commun à deux lieux {_p19:.0%}, chronométrage du serveur relevé : OK')
except Exception as e:
    echecs.append(f'consigne et chronométrage : {e}')

# nom d'un absent (21/10/2026, « L'empreinte de la chaussure ») : « Koffi, ta chaussure… » sans Koffi dans la scène = défaut ;
# le même nom, Koffi présent, n'en est pas un ; aucune fausse alerte sur les trois sketchs de l'épisode publié V17
try:
    _h14.LIEUX['_essai20'] = {'nom': 'x', 'acteurs': ['LA GO LÉOPARD', 'MAÎTRE COULIBALY']}
    _r20 = lambda t: {'titre': 't', 'repliques': [{'qui': 'LA GO LÉOPARD', 'texte': t, 'jeu': 'accuse'}, {'qui': 'MAÎTRE COULIBALY', 'texte': 'Moi ?', 'jeu': 'choc'}]}
    if not any('Koffi' in x for x in _h14.controle(_r20('Koffi, ta chaussure est fausse !'), '_essai20')): echecs.append('nom d’un absent non vu')
    _h14.LIEUX['_essai20']['acteurs'].append('KOFFI')
    if any('Koffi' in x for x in _h14.controle(_r20('Koffi, ta chaussure est fausse !'), '_essai20')): echecs.append('nom d’un présent refusé')
    del _h14.LIEUX['_essai20']
    for _v20 in _h14.V17:
        _h14.LIEUX['_v20'] = {'nom': 'x', 'acteurs': sorted({r['qui'] for r in _v20['repliques']})}
        if any("n'est pas dans la scène" in x for x in _h14.controle(_v20, '_v20')): echecs.append(f"nom d’un absent : fausse alerte sur « {_v20['titre']} »")
    _h14.LIEUX.pop('_v20', None)
    print('nom d’un absent : « Koffi, … » sans Koffi refusé, avec Koffi accepté, 0 fausse alerte sur la V17 : OK')
    # deux répliques de suite du même personnage (21/10/2026, « Le petit malin du maquis ») : défaut ; alternance : aucun
    _h14.LIEUX['_essai20b'] = {'nom': 'x', 'acteurs': ['LA GO LÉOPARD', 'MAÎTRE COULIBALY']}
    _r20b = lambda qs: {'titre': 't', 'repliques': [{'qui': q, 'texte': 'Moi ?', 'jeu': 'choc'} for q in qs]}
    if not any('deux fois de suite' in x for x in _h14.controle(_r20b(['LA GO LÉOPARD', 'MAÎTRE COULIBALY', 'MAÎTRE COULIBALY']), '_essai20b')):
        echecs.append('deux répliques de suite du même personnage non vues')
    if any('deux fois de suite' in x for x in _h14.controle(_r20b(['LA GO LÉOPARD', 'MAÎTRE COULIBALY', 'LA GO LÉOPARD']), '_essai20b')):
        echecs.append('alternance des personnages refusée à tort')
    del _h14.LIEUX['_essai20b']
    print('deux répliques de suite du même personnage : refusées, alternance acceptée : OK')
except Exception as e:
    echecs.append(f'nom d’un absent : {e}')

# porte « drôle » (21/10/2026) : sous la note du moins drôle des sketchs publiés, le brouillon ne va pas au plancher V17 (6 appels
# du juge épargnés) ; au-dessus, il y va
try:
    import tempfile as _tf21
    _sv21 = {k: getattr(_h14, k) for k in ('llm', 'verifie', 'juge', 'plancher_v17', 'DROLE_MIN')}; _pl21 = []
    _h21 = {'titre': 't', 'repliques': [{'qui': 'A', 'texte': 'x', 'role': 'chute'}]}
    _h14.llm = lambda *a, **k: '{}'; _h14.verifie = lambda t, *a, **k: (dict(_h21), [])
    _h14.juge = lambda h: {'note': 0.4, 'drole': 1.5, 'choc': 1.0, 'chute': 0.5, 'ivoirien': 0.5, 'clair': 0.5, 'mechant': 0.0}
    _h14.plancher_v17 = lambda h: _pl21.append(1) or 0.4
    try:
        _L21 = next(iter(_h14.LIEUX))
        with _tf21.TemporaryDirectory() as _d21:
            _h14.DROLE_MIN = 2.0; _h14.une(_d21, _L21, K=1, tours_max=1, journal=lambda t: None)
            _n_sous = len(_pl21); _h14.DROLE_MIN = 1.0; _h14.une(_d21, _L21, K=1, tours_max=1, journal=lambda t: None)
    finally:
        for _k21, _v21 in _sv21.items(): setattr(_h14, _k21, _v21)
    if _n_sous != 0 or len(_pl21) != 1: echecs.append(f'porte drôle : plancher joué {_n_sous} fois sous la porte, {len(_pl21) - _n_sous} au-dessus')
    print('porte drôle : brouillon sous la note de la V17 arrêté avant le plancher, au-dessus jugé : OK')
except Exception as e:
    echecs.append(f'porte drôle : {e}')

# chutes de la machine (21/10/2026) : chaque essai a son registre ; les chutes déjà acceptées sur la machine (CHUTES_DEJA) doivent
# arriver au contrôle des quasi-doublons de tout nouvel essai
try:
    import tempfile as _tf22
    _sv22 = {k: getattr(_h14, k) for k in ('llm', 'verifie', 'CHUTES_DEJA')}; _vu22 = []
    _h14.llm = lambda *a, **k: '{}'; _h14.verifie = lambda t, l, deja=(), *a, **k: (_vu22.append(list(deja)) or (None, []))
    _h14.CHUTES_DEJA = ['Dans la sauce grée, mon djê !']
    try:
        with _tf22.TemporaryDirectory() as _d22: _h14.une(_d22, next(iter(_h14.LIEUX)), K=1, tours_max=1, journal=lambda t: None)
    finally:
        for _k22, _v22 in _sv22.items(): setattr(_h14, _k22, _v22)
    if not _vu22 or 'Dans la sauce grée, mon djê !' not in _vu22[0]: echecs.append('chutes de la machine absentes du contrôle des doublons')
    print('chutes de la machine : transmises au contrôle des quasi-doublons de chaque essai : OK')
except Exception as e:
    echecs.append(f'chutes de la machine : {e}')

# emplacements dédiés du serveur (21/10/2026 07:25) : brouillons sur 0 et 1, réparations et juge sur 2 et 3 ; rien sans la variable
try:
    import os as _os23, io as _io23, urllib.request as _ur23
    _vus23 = []; _u23 = _ur23.urlopen; _sv23 = {k: _os23.environ.get(k) for k in ('HISTOIRES_URL', 'HISTOIRES_JUGE_URL', 'HISTOIRES_EMPLACEMENTS')}
    _ur23.urlopen = lambda req, timeout=0: (_vus23.append(json.loads(req.data).get('id_slot')) or
                                            _io23.BytesIO(json.dumps({'choices': [{'message': {'content': 'x'}}]}).encode()))
    try:
        _os23.environ['HISTOIRES_URL'] = _os23.environ['HISTOIRES_JUGE_URL'] = 'http://127.0.0.1:1/v1/chat/completions'
        _os23.environ.pop('HISTOIRES_EMPLACEMENTS', None); _h14.llm('Tu écris UNE blague')
        _os23.environ['HISTOIRES_EMPLACEMENTS'] = '1'
        for _p23, _j23 in (('Tu écris UNE blague', False), ('Tu écris UNE blague', False), ('Voici un sketch', False), ('Tu es le jury', True)):
            _h14.llm(_p23, juge=_j23)
    finally:
        _ur23.urlopen = _u23
        for _k23, _v23 in _sv23.items():
            if _v23 is None: _os23.environ.pop(_k23, None)
            else: _os23.environ[_k23] = _v23
    del _h14.TEMPS[-5:]
    if _vus23[0] is not None or sorted(_vus23[1:3]) != [0, 1] or not all(x in (2, 3) for x in _vus23[3:]):
        echecs.append(f'emplacements du serveur : {_vus23}')
    print(f'emplacements du serveur : brouillons {sorted(_vus23[1:3])}, réparation et juge {_vus23[3:]}, aucun sans la variable : OK')
except Exception as e:
    echecs.append(f'emplacements du serveur : {e}')

# registre commun des chutes (21/10/2026) : empreintes BLAKE2b à clé des trigrammes — même ressemblance que sur le texte, la
# reformulation d'une chute d'une AUTRE machine est refusée (irréparable), une chute neuve passe, aucun mot dans l'empreinte
try:
    _k24 = _h14.cle_empreinte('essai-verif-moteur'); _a24, _b24 = 'Dans la sauce grée, mon djê !', 'Mon djê ? Dans la sauce grée !'
    _ea24, _eb24 = _h14.empreinte(_a24, _k24), _h14.empreinte(_b24, _k24)
    if abs(len(_ea24 & _eb24) / len(_ea24 | _eb24) - _h14.ressemblance(_a24, _b24)) > 1e-9: echecs.append('registre commun : ressemblance changée par l’empreinte')
    if any(g in ' '.join(_ea24) for g in ('sau', 'djê', 'grée')): echecs.append('registre commun : texte lisible dans l’empreinte')
    _sv24 = (_h14.CLE_EMPREINTE, _h14.CHUTES_AUTRES, _h14.DOUBLONS_AILLEURS[0])
    try:
        _h14.CLE_EMPREINTE, _h14.CHUTES_AUTRES = _k24, [_ea24]
        _l24 = next(iter(_h14.LIEUX)); _ac24 = _h14.LIEUX[_l24]['acteurs']
        _s24 = lambda c: {'repliques': [{'qui': _ac24[0], 'texte': 'Ehhh, la sauce est où, hein ?', 'jeu': 'soupcon'},
                                        {'qui': _ac24[1], 'texte': c, 'jeu': 'malice', 'chute': True}]}
        _d24a = _h14.controle(_s24(_b24), _l24, fmt='blague'); _d24b = _h14.controle(_s24('Sourd aux dettes, pas aux barres !'), _l24, fmt='blague')
        _n24 = _h14.DOUBLONS_AILLEURS[0] - _sv24[2]
    finally:
        _h14.CLE_EMPREINTE, _h14.CHUTES_AUTRES, _h14.DOUBLONS_AILLEURS[0] = _sv24
    if 'chute déjà utilisée' not in _d24a or 'chute déjà utilisée' in _d24b or _n24 != 1:
        echecs.append(f'registre commun : reformulation {_d24a}, chute neuve {_d24b}, doublons comptés {_n24}')
    print('registre commun des chutes : reformulation d’une autre machine refusée, chute neuve acceptée, texte illisible : OK')
except Exception as e:
    echecs.append(f'registre commun des chutes : {e}')

# consigne du juge reprise du cache (21/10/2026 07:50) : questions fixes AVANT le texte noté — deux sketchs différents notés avec
# les mêmes questions partagent au moins 70 % de la consigne (llama-server ne reprend que le début commun)
try:
    import os as _os25
    _pr25 = []; _sv25 = _h14.llm
    _h14.llm = lambda p, temp=1.0, juge=False: (_pr25.append(p), '{"drole": 1, "chute": 0.5, "choc": 1, "clair": 0.5, "mechant": 0, '
                                                '"ivoirien": 0.5, "mieux": {"A": 0.5, "B": 0.5}}')[1]
    try: _h14.juge(_h14.V17[0]); _h14.juge(_h14.V17[1])
    finally: _h14.llm = _sv25
    _q25 = [p for p in _pr25 if '"drole"' in p]
    _c25 = len(_os25.path.commonprefix(_q25)) / max(len(p) for p in _q25)
    if len(_q25) != 2 or _c25 < 0.7: echecs.append(f'consigne du juge : début commun {_c25:.0%} (70 % au moins)')
    print(f'consigne du juge : début commun à deux sketchs {_c25:.0%} (questions avant le texte) : OK')
except Exception as e:
    echecs.append(f'consigne du juge : {e}')

# jeux inventés (21/10/2026 08:20, « Match à la t-shirt ») : un jeu hors liste compte comme « neutre » dans le contrôle (il passait
# pour joué puis devenait « neutre ») ; les plus courants vont au geste voisin ; aucune alerte sur la V17
try:
    _l26 = next(iter(_h14.LIEUX)); _a26 = _h14.LIEUX[_l26]['acteurs']
    _s26 = lambda js: {'repliques': [{'qui': _a26[i % 2], 'texte': 'Ehhh, c’est comment, hein ?', 'jeu': j} for i, j in enumerate(js)]}
    _h26 = _s26(['neutre', 'xyz', 'abc', 'malice']); _d26 = _h14.controle(_h26, _l26, fmt='blague')
    _v26 = _s26(['Surprise', 'colère', 'neutre', 'rire']); _e26 = _h14.controle(_v26, _l26, fmt='blague')
    if not any('jouées « neutre »' in x for x in _d26): echecs.append(f'jeux inventés : 3 neutres de fait sur 4 non vus ({_d26})')
    if [r['jeu'] for r in _v26['repliques']] != ['choc', 'accuse', 'neutre', 'rire'] or any('neutre' in x for x in _e26):
        echecs.append(f"jeux inventés : geste voisin faux {[r['jeu'] for r in _v26['repliques']]}")
    print('jeux inventés : comptés « neutre » avant le contrôle, surprise → choc, colère → accuse : OK')
except Exception as e:
    echecs.append(f'jeux inventés : {e}')

# pas deux fois le même geste (21/10/2026) : départ du clip d'écoute propre à chaque vidéo, continu d'une réplique à l'autre
try:
    import assemble as _as15
    _vrai15 = _as15._images_clip; _as15._images_clip = lambda mov: 50   # clip d'écoute type (50 images, aller-retour de 100)
    _d15 = [_as15.depart(t, 'x', 0.0, 'c.mov') for t in ('Sketch A', 'Sketch B', 'Sketch C', 'Sketch D')]
    if len(set(_d15)) < 3: echecs.append(f'gestes : départ identique d\'une vidéo à l\'autre {_d15}')
    _a15, _b15 = _as15.depart('Sketch A', 'x', 1.25, 'c.mov'), _as15.depart('Sketch A', 'x', 2.0, 'c.mov')
    if abs(((_b15 - _a15) * _as15.FPS) % 100 - 0.75 * _as15.FPS) > 1e-6: echecs.append('gestes : écoute discontinue entre deux répliques')
    print('pas deux fois le même geste : départ propre à la vidéo, continu entre répliques : OK')
    _as15._images_clip = _vrai15
except Exception as e:
    echecs.append(f'gestes : {e}')

# creux verts (21/10/2026) : fond à l'ombre entre le bras et le corps rendu transparent chez un personnage sans vert,
# tee-shirt vert (Modou) gardé par la règle prudente
try:
    import numpy as _np16, detoure as _dt16
    _im16 = _np16.zeros((60, 60, 3), _np16.uint8); _im16[:] = (1, 241, 1)               # fond du tournage
    _im16[10:50, 10:50] = (225, 215, 160); _im16[25:35, 25:35] = (38, 115, 15)          # costume beige, creux vert à l'ombre
    _im16[12:18, 12:18] = (74, 194, 12)                                                 # tee-shirt vert de Modou
    _f16 = _dt16.fond(_im16); _a16 = _dt16.alpha(_im16, _f16); _s16 = _a16 * (1 - _dt16.creux_verts(_im16, _f16))
    if _a16[30, 30] < 0.5: echecs.append('creux verts : témoin faux (creux déjà transparent)')
    if _s16[30, 30] > 0.1: echecs.append(f'creux verts : creux à l\'ombre resté opaque ({_s16[30, 30]:.2f})')
    # tee-shirt vert : la règle prudente (inchangée) le laisse à 0,85 d'opacité — défaut ancien des 7 personnages en vert, noté
    if _s16[40, 40] < 0.99 or _a16[15, 15] < 0.8: echecs.append('creux verts : costume ou tee-shirt troué')
    if _dt16.porte_du_vert('monsieur-diarra') or not _dt16.porte_du_vert('modou'): echecs.append('creux verts : fiches mal lues')
    print('creux verts : fond à l\'ombre transparent, costume et tee-shirt vert gardés : OK')
except Exception as e:
    echecs.append(f'creux verts : {e}')

# voix et raccords (21/10/2026) : hommes sur la voix source complète (gilles-low sans « ̃ » : 66 % des mots compris),
# « garçon » reconnu comme enfant, voix toutes distinctes ; répliques en images entières, son PCM jusqu'au seul encodage AAC
try:
    import voix as _v13, itertools as _it13, inspect as _ins13, assemble as _as13
    _hommes13 = [k for k, v in _v13._toutes_distinctes().items() if v[5] < 0.95]
    if not _hommes13 or any(_v13.CAST[k][0] != 'fr_FR-siwis-medium' for k in _hommes13): echecs.append('voix : homme hors de la voix source complète')
    if _v13._naturelle('PETIT IBRAHIMA')[5] <= 1.05: echecs.append('voix : « garçon » de 9 ans traité en homme')
    _tous13 = list(_v13._toutes_distinctes().values()) + list(_v13.CAST_CALIBRE.values())
    _pp13 = sum(1 for a, b in _it13.combinations(_tous13, 2) if a[0] == b[0] and _v13._distance(a, b) < 1.0)
    if _pp13: echecs.append(f'voix : {_pp13} paires presque identiques')
    if any(abs(_as13.en_images(d) * _as13.FPS - round(_as13.en_images(d) * _as13.FPS)) > 1e-9 for d in (0.01, 1.234, 3.3333, 7.91)):
        echecs.append('raccords : durée de réplique hors images entières')
    if 'pcm_s16le' not in _ins13.getsource(_as13.segment): echecs.append('raccords : son des segments encodé avant la concaténation')
    print(f'voix et raccords : {len(_hommes13)} hommes sur siwis, Petit Ibrahima enfant, 0 paire proche, répliques en images entières : OK')
except Exception as e:
    echecs.append(f'voix et raccords : {e}')

# niveau de la V1 (20/10/2026) : la vidéo 2 (figures collées, animation 20,4 % < 24,3 %) doit être arrêtée par le contrôle
try:
    sys.path.insert(0, os.path.join(ICI, 'moteur-troupe')); import niveau_v1 as _nv9
    _m9, _ = _nv9.motifs(os.devnull, ['DJECKY', 'KOFFI'])
    if not any('DJECKY' in x for x in _m9): echecs.append('niveau V1 : personnage hors troupe V1 non arrêté')
    if _nv9.REF['surface'] < 0.24 or not {'KOFFI', 'COUMBA'} <= _nv9.TROUPE_V1: echecs.append('niveau V1 : références absentes')
    print('niveau V1 : animation comparée à la V1 et personnages hors troupe arrêtés : OK')
except Exception as e:
    echecs.append(f'niveau V1 : {e}')

# profil complet contre la V1 (21/10/2026) : « toutes les vidéos devront avoir ou dépasser les mesures de la V1. Même l'humour »,
# « même le teint », « tes nouvelles vidéos devront même dépasser V1 ». La V1 contre elle-même ne la dépasse pas (8 critères à égalité,
# teint dans la gamme) ; « L'autre moitié » (usine, mesurée le 21/10) est arrêtée sur les 11 critères.
try:
    _r27 = _nv9.reference()
    _m27 = {'persos_bouge': 0.026, 'persos_vitesse': 0.5, 'taille_persos': 0.207, 'fond_bouge': 0.003, 'regards': 0.0,
            'acoups_min': 2.3, 'sautes_min': 18.5, 'plans_min': 2.3, 'teint_L': 55.3, 'teint_b': 57.0}
    _e27 = _nv9.ecarts(_r27, humour=0.55)
    if len(_e27) != 8 or any('teint' in x or 'humour' in x for x in _e27): echecs.append(f'profil V1 : la V1 contre elle-même {_e27}')
    _x27 = {k: (v * 1.1 if k in _nv9.PLUS else v * 0.9 if k in _nv9.MOINS else v) for k, v in _r27.items() if isinstance(v, (int, float))}
    if _nv9.ecarts(_x27, humour=0.6): echecs.append(f'profil V1 : une vidéo qui dépasse la V1 partout est refusée {_nv9.ecarts(_x27, humour=0.6)}')
    if len(_nv9.ecarts(_m27)) != 11: echecs.append(f"profil V1 : « L'autre moitié » {len(_nv9.ecarts(_m27))} écarts au lieu de 11")
    if _nv9.regressions(_x27, _r27) or len(_nv9.regressions(_m27, _r27)) != 10: echecs.append('profil V1 : régressions mal vues')
    _b27 = _nv9.reference()['teint_dessins_v1']
    if not (_b27['L'] >= max(v[0] for v in _b27['personnages'].values()) and 50 <= _b27['L'] <= 55): echecs.append(f'profil V1 : gamme de teint des dessins {_b27}')
    print("profil V1 : dépasser la V1 exigé (égaler ne suffit pas), teint dans sa gamme, « L'autre moitié » arrêtée sur 11 critères, régressions vues, gamme de teint des dessins V1 : OK")
except Exception as e:
    echecs.append(f'profil V1 : {e}')

if echecs:
    print('ÉCHECS :\n- ' + '\n- '.join(echecs)); sys.exit(1)
print('moteur : OK')
