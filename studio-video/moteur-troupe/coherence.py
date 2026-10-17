# CONTRÔLE DE COHÉRENCE DES SCÈNES (17/10/2026) — demande : « comme pour le fil à linge, le moteur doit pouvoir détecter
# les incohérences dans les scènes ». Deux yeux, lancés à la préparation de chaque scène (prepare_rig.py) :
#   GÉOMÉTRIE (code, sur chaque scène, sans réseau)
#     1. fils et lignes fines coupés par un acteur sans ressortir (fil à linge, câble) — réparés dans la plaque (plaque.fils) ;
#     2. restes d'acteur dans la plaque : la segmentation « personne » ne doit plus rien trouver là où étaient les acteurs ;
#     3. zones reconstituées floues : netteté (variance du laplacien) de la zone rebouchée contre le décor autour ;
#     4. découpe : part du masque d'origine qui était du décor (linge, chaise : retiré) et part de la personne qu'il oubliait
#        (main, bord du boubou : ajouté) ;
#   SENS (œil de JEV 1.14, TypeSafe) : questions « oui/non » sur l'image de la scène et sur la plaque — objet ou fil qui
#     s'arrête dans le vide, objet coupé ou fusionné, objet qui flotte, membre en trop ou manquant, texte parasite, ombres
#     incohérentes, échelle incohérente, restes de personne dans le décor vide.
# Un point au-dessus du seuil est une INCOHÉRENCE : réparée quand le code sait faire (fils, plaque), sinon signalée avec
# l'endroit, pour la greffe suivante (régénérer la zone, ou la scène).
import base64, json, uuid, urllib.request
import numpy as np, cv2

API = 'https://api.typesafe.ai/v1/systemone'
Q_SCENE = {
    'fil_dans_le_vide': 'Is there a rope, clothesline, wire or cable that ends abruptly in mid-air, or disappears behind a character or object without continuing on the other side?',
    'objet_coupe': 'Is there an object that is cut off unnaturally, partially erased, or merged into a character or into another object?',
    'flotte': 'Does a person or an object float in the air without support (feet not touching the ground, object not resting on anything)?',
    'membre': 'Does any character have an extra, missing, duplicated or deformed arm, leg, hand or finger?',
    'texte': 'Is there visible text, letters, numbers or a watermark that looks like a generation artifact (not a deliberate sign or a jersey number)?',
    'ombres': 'Are the shadows inconsistent: pointing in different directions, or missing under a character who stands in direct sunlight?',
    'echelle': 'Is any character or object clearly at a wrong size compared with the others and the place (too big or too small for its position)?',
}
Q_PLAQUE = {
    'reste_de_personne': 'This image is the background of an animated scene after all the characters were removed. Is there still any part of a person in it: a ghost or blurry silhouette, a smear of clothing color, a leftover hand, foot, leg or head?',
    'tache': 'Is there an obviously smeared, blurry or repeated patch that does not match the rest of the background (wall, ground, door, laundry)?',
}


def _b64(img, larg=768):
    h, w = img.shape[:2]; k = larg / max(h, w)
    im = cv2.resize(img, (max(300, round(w * k)), max(300, round(h * k))), interpolation=cv2.INTER_AREA)
    return base64.b64encode(cv2.imencode('.jpg', cv2.cvtColor(im, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])[1].tobytes()).decode()


def jev_noul(img, questions, nom='scene'):
    """probabilité « oui » de chaque question sur l'image (JEV 1.14, une requête)."""
    ident = f'{nom}-{uuid.uuid4().hex[:8]}'
    Q = {k: {'type': 'noul', 'instructions': f'`{nom}` is a frame of an animated comedy film (3D, Pixar-like style). ' + q} for k, q in questions.items()}
    body = {'model': 'jev-1.14.0', 'state': {nom: ident}, 'questions': Q, 'assets': {ident: {'type': 'image', 'format': 'jpg', 'data_base64': _b64(img)}}}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
    a = json.loads(urllib.request.urlopen(req, timeout=180).read())['answers']
    out = {}
    for k in Q:
        v = a[k]; out[k] = round(float(v['noul'] if isinstance(v, dict) and 'noul' in v else v), 3)
    return out


def nettete(img, zone):
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32); lap = cv2.Laplacian(g, cv2.CV_32F)
    return float(lap[zone].var()) if zone.any() else 0.0


def controle(img, plaque_, trou, alphas, noms, segmente, fils_repares=(), decoupes=(), jev=True, seuil=0.6, inventes=()):
    """rapport de cohérence d'une scène préparée."""
    R = {'geometrie': {}, 'sens': {}, 'incoherences': []}
    for aire, ou in inventes: R['incoherences'].append({'type': 'reste ou objet inventé dans le décor', 'aire': aire, 'ou': ou, 'repare': True})
    R['geometrie']['fils_repares'] = list(fils_repares)
    for f in fils_repares: R['incoherences'].append({'type': 'fil dans le vide', 'ou': f['de'], 'repare': True})
    # restes de personne dans la plaque
    ys, xs = np.nonzero(trou)
    if len(xs):
        box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
        C = segmente(plaque_, box); pers = (1 - C[0]) > 0.5
        reste = float((pers & (trou > 0)).sum() / max(1, (trou > 0).sum()))
        R['geometrie']['reste_personne_plaque'] = round(reste, 4)
        if reste > 0.01: R['incoherences'].append({'type': 'reste de personne dans la plaque', 'part': round(reste, 3), 'repare': False})
        # netteté de la zone reconstituée contre le décor autour
        dedans = cv2.erode(trou, np.ones((9, 9), np.uint8)) > 0
        autour = (cv2.dilate(trou, np.ones((61, 61), np.uint8)) > 0) & (trou == 0)
        rn = nettete(plaque_, dedans) / max(1e-6, nettete(plaque_, autour))
        R['geometrie']['nettete_reconstituee'] = round(rn, 3)
        if rn < 0.35: R['incoherences'].append({'type': 'zone reconstituée floue', 'rapport': round(rn, 3), 'repare': False})
    for nom, d in zip(noms, decoupes): R['geometrie'].setdefault('decoupes', {})[nom] = d
    if jev:
        try:
            R['sens']['scene'] = jev_noul(img, Q_SCENE, 'scene')
            R['sens']['plaque'] = jev_noul(plaque_, Q_PLAQUE, 'background')
            for qui, rep in R['sens'].items():
                for k, p in rep.items():
                    if p >= seuil: R['incoherences'].append({'type': k, 'image': qui, 'probabilite': p, 'repare': k == 'fil_dans_le_vide' and bool(fils_repares)})
        except Exception as e:
            R['sens']['erreur'] = str(e)[:200]
    return R
