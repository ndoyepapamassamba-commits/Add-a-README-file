# AUDIT DES BOUCHES PAR JEV (17/10/2026). Avis de JEV sur la v25 : la bouche de Koffi « bave » (0,86) et celle de Coumba ne
# montre pas l'intérieur sombre (remède désigné : ouvrir la mâchoire, 0,90). Avant tout réglage, JEV inspecte la
# BIBLIOTHÈQUE elle-même (chaque émotion × chaque ouverture) : pour chaque image, la bouche est-elle abîmée (bavée, fondue,
# dédoublée) et est-elle franchement ouverte (intérieur sombre visible) ? Une requête par émotion (4 images + le dessin
# d'origine), en parallèle.
#   python3 audit_bouches.py dossier_bibliotheque [image_scene scene.json NOM] → audit.json dans le dossier
import base64, json, os, sys, uuid, urllib.request
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


def juge_emotion(dossier, e, n, ref=None):
    ids, assets, Q = {}, {}, {}
    ims = {f'L{k}': cv2.imread(f'{dossier}/{e}_{k}.png') for k in range(n)}
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
            a = json.loads(urllib.request.urlopen(req, timeout=180).read())['answers']; break
        except Exception:
            if essai == 2: raise
    return {'bave': [round(a[f'bave_{k}']['noul'], 2) for k in range(n)], 'ouverte': [round(a[f'ouverte_{k}']['noul'], 2) for k in range(n)]}


def audit(dossier, ref=None, emotions=None):
    meta = json.load(open(f'{dossier}/meta.json')); n = len(meta['bouche'])
    E = emotions or meta['emotions']
    with ThreadPoolExecutor(8) as ex: R = list(ex.map(lambda e: juge_emotion(dossier, e, n, ref), E))
    out = {'bouche': meta['bouche'], 'emotions': dict(zip(E, R))}
    json.dump(out, open(f'{dossier}/audit.json', 'w'), indent=1)
    return out


if __name__ == '__main__':
    d = sys.argv[1]; ref = None
    if len(sys.argv) > 4:
        img = cv2.imread(sys.argv[2]); S = json.load(open(sys.argv[3]))
        a = [x for x in S['acteurs'] if x['nom'] == sys.argv[4]][0]; x0, y0, x1, y1 = [int(v) for v in a['visage']['box']]; ref = img[y0:y1, x0:x1]
    r = audit(d, ref)
    print(os.path.basename(d.rstrip('/')), 'ouvertures', r['bouche'])
    for e, v in r['emotions'].items(): print(f"  {e:12s} bavée {v['bave']}  ouverte {v['ouverte']}")
