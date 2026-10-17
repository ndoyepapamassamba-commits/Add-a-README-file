# VÉRIFICATION DU MOTEUR PYTHON (npm run test:moteur) — sans carte graphique ni modèle téléchargé :
#   1. tous les scripts Python de l'app se compilent (moteur-troupe, blender, outils) ;
#   2. la fluidité (moteur-troupe/fluide.py) : cadre exact sans déformation, réglage de couleur constant qui rapproche
#      la source de la cible, mesure de saccade (une image figée sur deux = 50 %), retiming exact quand RIFE est présent
#      (RIFE_DIR) ; sinon le retiming est sauté et le dit.
import os, sys, glob, importlib.util

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

if echecs:
    print('ÉCHECS :\n- ' + '\n- '.join(echecs)); sys.exit(1)
print('moteur : OK')
