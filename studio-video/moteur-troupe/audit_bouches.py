# AUDIT DES BOUCHES PAR JEV (17/10/2026). Avis de JEV sur la v25 : la bouche de Koffi « bave » (0,86) et celle de Coumba ne
# montre pas l'intérieur sombre (remède désigné : ouvrir la mâchoire, 0,90). Avant tout réglage, JEV inspecte la
# BIBLIOTHÈQUE elle-même (chaque émotion × chaque ouverture) : pour chaque image, la bouche est-elle abîmée (bavée, fondue,
# dédoublée) et est-elle franchement ouverte (intérieur sombre visible) ? Une requête par émotion (4 images + le dessin
# d'origine), en parallèle.
#   python3 audit_bouches.py dossier_bibliotheque [image_scene scene.json NOM] [--px N] → audit.json dans le dossier
# --px N (18/10/2026) : chaque image est jugée À L'ÉCHELLE DU FILM — réduite pour que le visage y fasse N px de haut, puis
# agrandie comme le gros plan de jev_levres (360 px). v30 : la bouche de Modou au rang 100, « ouverte » 0,88 à 243 px,
# n'était vue ouverte qu'à 0,46–0,56 dans le film (visage de 64 px) ; la commande vise alors l'ouverture vue à l'écran.
import base64, json, os, sys, uuid, urllib.request
import jev_api   # garde JEV (18/10/2026) : coupé par défaut, le juge local répond
from concurrent.futures import ThreadPoolExecutor
import cv2

API = 'https://api.typesafe.ai/v1/systemone'
MIN_COTE = 320   # mesuré le 17/10 : 256 et 260 px refusés, 300 accepté
BAVE = ('In image `{k}` (a cartoon face), is the mouth or the lower face — lips, teeth, beard, chin — smeared, melted, doubled, torn or '
        'blurred, i.e. an artifact rather than a cleanly drawn mouth? Compare with the clean original drawing `ref`.')
OUVERTE = ('In image `{k}` (a cartoon face), is the mouth clearly open with the dark inside of the mouth visible, as when saying "ah"? '
           'Teeth or parted lips alone, without a dark opening, do not count.')


def _b64(im):
    if min(im.shape[:2]) < MIN_COTE:   # JEV refuse une image dont le petit côté est sous ~300 px (« Invalid image dimensions », 17/10)
        k = MIN_COTE / min(im.shape[:2]); im = cv2.resize(im, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
    return base64.b64encode(cv2.imencode('.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tobytes()).decode()


def a_l_echelle(im, k):
    """l'image telle que le spectateur la voit : réduite d'un facteur k (taille du visage dans le film), agrandie à 360 px."""
    p = cv2.resize(im, None, fx=k, fy=k, interpolation=cv2.INTER_AREA); return cv2.resize(p, (360, 360), interpolation=cv2.INTER_CUBIC)


def juge_emotion(dossier, e, n, ref=None, k=None):
    ids, assets, Q = {}, {}, {}
    ims = {f'L{j}': cv2.imread(f'{dossier}/{e}_{j}.png') for j in range(n)}
    if k: ims = {c: a_l_echelle(im, k) for c, im in ims.items()}
    if ref is not None: ims['ref'] = ref
    for c, im in ims.items():
        ids[c] = f'{c}-{uuid.uuid4().hex[:8]}'; assets[ids[c]] = {'type': 'image', 'format': 'jpg', 'data_base64': _b64(im)}
    for k in range(n):
        Q[f'bave_{k}'] = {'type': 'noul', 'instructions': BAVE.format(k=f'L{k}') if ref is not None else BAVE.split(' Compare')[0].format(k=f'L{k}')}
        Q[f'ouverte_{k}'] = {'type': 'noul', 'instructions': OUVERTE.format(k=f'L{k}')}
    body = json.dumps({'model': 'jev-1.14.0', 'state': ids, 'assets': assets, 'questions': Q}).encode()
    for essai in range(3):
        try:
            req = urllib.request.Request(API, data=body, headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
            a = json.loads(jev_api.ouvre(req, outil='audit_bouches', timeout=180).read())['answers']; break
        except Exception:
            if essai == 2: raise
    return {'bave': [round(a[f'bave_{k}']['noul'], 2) for k in range(n)], 'ouverte': [round(a[f'ouverte_{k}']['noul'], 2) for k in range(n)]}


def audit(dossier, ref=None, emotions=None, k=None, px=None):
    meta = json.load(open(f'{dossier}/meta.json')); n = len(meta['bouche'])
    E = emotions or meta['emotions']
    with ThreadPoolExecutor(8) as ex: R = list(ex.map(lambda e: juge_emotion(dossier, e, n, ref, k), E))
    out = {'bouche': meta['bouche'], 'emotions': dict(zip(E, R))}
    if px: out['echelle_film'] = {'visage_px': px, 'facteur': round(k, 4)}
    json.dump(out, open(f'{dossier}/audit.json', 'w'), indent=1)
    return out


if __name__ == '__main__':
    args = sys.argv[1:]; px = None
    if '--px' in args: i = args.index('--px'); px = float(args[i + 1]); del args[i:i + 2]
    d = args[0]; ref = None; k = None
    if len(args) > 3:
        img = cv2.imread(args[1]); S = json.load(open(args[2]))
        a = [x for x in S['acteurs'] if x['nom'] == args[3]][0]; x0, y0, x1, y1 = [int(v) for v in a['visage']['box']]; ref = img[y0:y1, x0:x1]
        if px:   # visage de (y1 − y0) px dans la scène, carré de s px rendu en t px : le visage y fait (y1 − y0)·t/s px
            m = json.load(open(f'{d}/meta.json')); k = px / ((y1 - y0) * m['taille'] / m['box'][2]); ref = a_l_echelle(ref, px / (y1 - y0))
    r = audit(d, ref, k=k, px=px)
    print(os.path.basename(d.rstrip('/')), 'ouvertures', r['bouche'])
    for e, v in r['emotions'].items(): print(f"  {e:12s} bavée {v['bave']}  ouverte {v['ouverte']}")
