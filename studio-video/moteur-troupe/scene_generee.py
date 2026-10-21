# SCÈNE GÉNÉRÉE EN UNE COMMANDE (21/10/2026) — « toute nouvelle scène va bénéficier de l'ensemble de la production totale de
# la vidéo, sans qu'on ait à revenir retoucher des éléments […] fais en sorte que ça aille très vite » ; « je ne veux pas des
# personnages de l'ancienne troupe ». Une idée de lieu et de personnages → une scène prête à tourner, rangée dans la bibliothèque
# et réutilisée par tous les épisodes, sans geste manuel :
#   1. dessin : plusieurs graines en parallèle sur AI Horde (Z-Image-Turbo, Apache-2.0, gratuit, sans compte), style de la V1 ;
#   2. tri : la première variante où chaque personnage a un visage LU et tourné vers la caméra (squelette → tête → FaceLandmarker,
#      lacet ≤ LACET_MAX — de profil, la bouche et le choc final ne s'animent pas : gbaka-71 refusé le 21/10) et un teint dans
#      la gamme de la V1 (L* ≤ TEINT_MAX) ;
#   3. préparation : prepare_scene (découpe SAM complète : corps, chevelure, objets tenus) → prepare_rig → bibliothèques de
#      visages, UN PROCESSUS PAR PERSONNAGE (≈ 25 min chacun, en parallèle au lieu de l'un après l'autre) ;
#   4. fiches : genre et âge ajoutés à blender/film/characters.json — voix.py leur attribue une voix naturelle et distincte.
#   python3 scene_generee.py NOM "DESCRIPTION DE LA SCÈNE (anglais)" "NOM1:femme:35,NOM2:homme:48" [--graines 81,82,83]
import json, os, subprocess, sys, threading, time
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
BIBLIO = os.path.realpath(os.path.expanduser(os.environ.get('MASSAMBA_BIBLIO', '~/massamba-bibliotheque')))
M = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/'
TEINT_MAX = 40.0   # L* de peau (niveau_v1.teint) : V1 ≈ 32 ; scènes de l'épisode 4 mesurées 31,4 à 38,8 ; usine refusée 50 à 54
LACET_MAX = 45.0   # au-delà, profil : la bouche et le choc final ne se lisent plus (gbaka-71 : −52°, refusé le 21/10)
# PLAN À DEUX POSSIBLE (21/10/2026, épisode 4 : salon en champ-contrechamp, plan médian 2,3 s contre 3,5 s pour la V1) : écart
# horizontal des nez ≤ ECART_MAX × largeur d'un cadre vertical 9:16 de toute la hauteur — marché 0,76 (plan à deux tenu),
# gbaka-91 0,89, salon-81 1,07 (impossible : une coupe par réplique)
ECART_MAX = 0.8
STYLE = ("3D animated feature film still in the style of Pixar, warm cinematic lighting, sharp focus everywhere, no depth of field "
         "blur. Black West African characters with dark brown skin, both faces turned three-quarters towards the camera, faces "
         "large and clearly visible, eyes open, mouths closed, standing close together near the centre of the image, about half a metre "
         "apart, NOT touching each other, arms away from the body, full bodies visible from head to feet, no text, no letters, no logo, "
         "no other people. ")


def dessine(nom, description, graines):
    import horde
    os.makedirs(f'{BIBLIO}/scenes-neuves', exist_ok=True); sorties = {}
    def un(g):
        out = f'{BIBLIO}/scenes-neuves/{nom}-{g}.png'
        for _ in range(3):
            try:
                if not os.path.isfile(out): horde.generate(STYLE + description, out, 1152, 896, 'Z-Image-Turbo', g)
                sorties[g] = out; return
            except BaseException as e: print('dessin', g, ':', e); time.sleep(10)
    ts = [threading.Thread(target=un, args=(g,)) for g in graines]
    for t in ts: t.start(); time.sleep(1.5)
    for t in ts: t.join()
    return [sorties[g] for g in graines if g in sorties]


def visages_lisibles(img, n):
    """nombre de personnages dont le visage est LU et tourné vers la caméra : chaque personne est trouvée par le squelette
    (Pose Landmarker heavy, Apache-2.0), sa tête recadrée autour du nez (±0,9 épaule), lue par FaceLandmarker (×1, ×2, ×3) ;
    lacet (matrice de transformation du visage) ≤ LACET_MAX. Mesuré le 21/10/2026 : gbaka-71 refusé à juste titre (un
    visage non lu, l'autre à −52°, profil où bouche et choc ne s'animent pas), gbaka-72 refusé (0 lu), gbaka-91 (19°, −18°),
    salon-81 (41°, −37°) et marche-72 (41°, −30°) acceptés — les trois scènes de l'épisode 4."""
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    PL = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=M + 'pose_landmarker_heavy.task'),
                                                                                  num_poses=n + 2, min_pose_detection_confidence=0.2))
    FL = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=M + 'face_landmarker.task'),
                                                                                  num_faces=1, min_face_detection_confidence=0.2,
                                                                                  output_facial_transformation_matrixes=True))
    H, W = img.shape[:2]; lus, nez = [], []
    for p in PL.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img))).pose_landmarks:
        P = np.array([[q.x * W, q.y * H] for q in p]); s = max(float(np.linalg.norm(P[11] - P[12])), 20.0)
        if any(np.linalg.norm(P[0] - q) < 0.5 * s for q in nez): continue   # même personne détectée deux fois
        nez.append(P[0])
        x0, x1 = int(max(0, P[0, 0] - 0.9 * s)), int(min(W, P[0, 0] + 0.9 * s))
        y0, y1 = int(max(0, P[0, 1] - 1.2 * s)), int(min(H, P[0, 1] + 0.7 * s))
        c = np.ascontiguousarray(img[y0:y1, x0:x1]); lacet = None
        for f in (1, 2, 3):
            cc = c if f == 1 else cv2.resize(c, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
            r = FL.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cc)))
            if r.facial_transformation_matrixes:
                R = np.array(r.facial_transformation_matrixes[0])[:3, :3]; lacet = float(np.degrees(np.arctan2(R[0, 2], R[2, 2]))); break
        lus.append(lacet)
    PL.close(); FL.close()
    xs = sorted(float(n[0]) for n in nez); ecart = (xs[-1] - xs[0]) / (H * 9 / 16) if len(xs) >= 2 else 0.0
    visages_lisibles.ecart = ecart
    return sum(1 for l in lus if l is not None and abs(l) <= LACET_MAX), lus


def teint_ok(chemin, n):
    import niveau_v1 as N
    mp, seg, _ = N._outils(); L = sorted(l for l, _ in N.teint(cv2.imread(chemin), seg=seg, mp=mp))
    return len(L) >= n and L[n - 1] <= TEINT_MAX, L


def choisit(variantes, n):
    for v in variantes:
        img = cv2.cvtColor(cv2.imread(v), cv2.COLOR_BGR2RGB); lus, lacets = visages_lisibles(img, n); t, L = teint_ok(v, n)
        ec = getattr(visages_lisibles, 'ecart', 0.0)
        print(os.path.basename(v), ': visages', lus, '/', n, [None if x is None else round(x) for x in lacets], '; teint', [round(x, 1) for x in L],
              '; écart des visages', round(ec, 2))
        if lus >= n and t and ec <= ECART_MAX: return v
    return None


def fiches(acteurs):
    p = os.path.join(ICI, '..', 'blender', 'film', 'characters.json'); c = json.load(open(p, encoding='utf-8')); neufs = 0
    for nom, genre, age in acteurs:
        if nom not in c:
            c[nom] = {'height': 1.75 if genre == 'homme' else 1.64, 'voice': 'siwis', 'pitch': 1.0, 'dessin': 'scene', 'lieux': [],
                      'activite': '', 'genre': genre, 'age': int(age)}; neufs += 1
    if neufs: json.dump(c, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return neufs


def prepare(nom, image, acteurs, journal=print):
    t0 = time.time(); env = dict(os.environ, MASSAMBA_BIBLIO=BIBLIO, OMP_NUM_THREADS='2')
    dst = f'{BIBLIO}/scenes/{nom}.png'; os.makedirs(os.path.dirname(dst), exist_ok=True); cv2.imwrite(dst, cv2.imread(image))
    noms = ','.join(a[0] for a in acteurs)
    for etape in ([f'{ICI}/prepare_scene.py', f'scenes/{nom}.png', f'prep/{nom}', noms], [f'{ICI}/prepare_rig.py', f'prep/{nom}', '--sans-jev']):
        r = subprocess.run([sys.executable] + etape, cwd=BIBLIO, env=env, capture_output=True, text=True)
        if r.returncode: raise RuntimeError(f'{os.path.basename(etape[0])} : {r.stderr[-800:]}')
        journal(f'{os.path.basename(etape[0])} : {time.time() - t0:.0f} s')
    slugs = [slug(a[0]) for a in acteurs]
    ps = [subprocess.Popen([sys.executable, f'{ICI}/prepare_expressions.py', f'prep/{nom}', s], cwd=BIBLIO, env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) for s in slugs]
    for q in ps: q.wait()
    faits = [s for s in slugs if os.path.isfile(f'{BIBLIO}/prep/{nom}/expressions/{s}/meta.json')]
    journal(f'visages : {len(faits)}/{len(slugs)} en {time.time() - t0:.0f} s')
    return faits


def slug(nom):
    import unicodedata, re
    t = unicodedata.normalize('NFKD', nom.replace('Œ', 'OE').replace('œ', 'oe')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


if __name__ == '__main__':
    a = sys.argv[1:]
    nom, description = a[0], a[1]
    acteurs = [tuple(x.split(':')) for x in a[2].split(',')]
    graines = [int(g) for g in (a[a.index('--graines') + 1].split(',') if '--graines' in a else ('81', '82', '83'))]
    t0 = time.time(); fiches(acteurs)
    v = choisit(dessine(nom, description, graines), len(acteurs))
    if not v: sys.exit(f'{nom} : aucune variante lisible (visages ou teint) — autres graines à tirer')
    faits = prepare(nom, v, acteurs)
    print(json.dumps({'scene': nom, 'image': v, 'visages': faits, 'secondes': round(time.time() - t0)}, ensure_ascii=False))
