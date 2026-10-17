# CONSEIL DE JEV AVANT DE CODER (17/10/2026). Consigne : « pour aller vite avant de coder, demande l'avis de JEV d'abord ;
# tu ne chercheras pas plusieurs solutions, il va te permettre de chercher les bonnes ». Un défaut mesuré (porte A–K) est
# montré à JEV : images du défaut (et de la référence d'origine), contexte chiffré, liste FERMÉE des causes possibles et des
# remèdes codables. Une seule requête (quelques secondes) rend :
#   - la cause la plus probable (Choice, avec « autre » pour ne pas forcer une cause absente de la liste) ;
#   - le remède à coder (Choice) ;
#   - pour chaque cause, la probabilité qu'elle soit VRAIE au vu des images (Noul, indépendante des autres causes) ;
#   - pour chaque remède, le gain attendu (Score à cinq niveaux), pour classer les remèdes quand plusieurs sont utiles.
# On ne code que le remède désigné. Si « autre » l'emporte, ou si aucune cause ne dépasse 0,5 en Noul, on élargit la liste
# au lieu d'essayer à l'aveugle.
#   conseil(sujet, contexte, causes, remedes, images={nom: image BGR}) → dict
#   python3 jev_conseil.py dossier.json [sortie.json]   (dossier : sujet, contexte, causes, remedes, images {nom: chemin})
import base64, json, sys, uuid, urllib.error, urllib.request
import cv2

API = 'https://api.typesafe.ai/v1/systemone'
MIN_COTE = 320   # mesuré le 17/10 : 256 et 260 px refusés, 300 accepté
GAIN = ['no effect on the problem', 'small improvement', 'clear improvement but the problem remains visible',
        'fixes most of the problem', 'fixes the problem completely']


def _b64(im):
    if min(im.shape[:2]) < MIN_COTE:   # JEV refuse une image dont le petit côté est sous ~300 px (« Invalid image dimensions », 17/10)
        k = MIN_COTE / min(im.shape[:2]); im = cv2.resize(im, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
    return base64.b64encode(cv2.imencode('.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 90])[1].tobytes()).decode()


def conseil(sujet, contexte, causes, remedes, images=None, timeout=240, essais=3):
    ids, assets = {}, {}
    for nom, im in (images or {}).items():
        ids[nom] = f'{nom}-{uuid.uuid4().hex[:8]}'
        assets[ids[nom]] = {'type': 'image', 'format': 'jpg', 'data_base64': _b64(im)}
    etat = dict(ids); etat['contexte'] = contexte
    causes = dict(causes); causes.setdefault('autre', 'None of the other listed causes explains the problem.')
    Q = {'cause': {'type': 'choice', 'instructions': f'{sujet} Using `contexte` and the images, which cause best explains the problem?',
                   'criteria': causes},
         'remede': {'type': 'choice', 'instructions': f'{sujet} Using `contexte` and the images, which single change should be made first to fix the problem?',
                    'criteria': remedes}}
    for k, v in causes.items():
        if k != 'autre':
            Q[f'vrai_{k}'] = {'type': 'noul', 'instructions': f'{sujet} Using `contexte` and the images: is the following true? {v}'}
    for k, v in remedes.items():
        Q[f'gain_{k}'] = {'type': 'score', 'instructions': f'{sujet} If only this change were made — {v} — how much would it fix the problem shown?',
                          'criteria': GAIN}
    body = {'model': 'jev-1.14.0', 'state': etat, 'questions': Q}
    if assets: body['assets'] = assets   # un dictionnaire d'images vide est refusé (400)
    body = json.dumps(body).encode()
    for e in range(essais):
        try:
            req = urllib.request.Request(API, data=body, headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
            a = json.loads(urllib.request.urlopen(req, timeout=timeout).read())['answers']
            break
        except urllib.error.HTTPError as x:
            if x.code < 500: raise RuntimeError(f'JEV {x.code} : {x.read().decode()[:400]}')   # requête invalide : inutile de réessayer
            if e == essais - 1: raise
        except Exception:
            if e == essais - 1: raise
    rang = lambda d: sorted(((k, round(float(p), 3)) for k, p in d.items()), key=lambda x: -x[1])
    return {'cause': rang(a['cause']['probabilities']), 'remede': rang(a['remede']['probabilities']),
            'vrai': dict(rang({k: a[f'vrai_{k}']['noul'] for k in causes if k != 'autre'})),
            'gain': dict(rang({k: a[f'gain_{k}']['score'] for k in remedes})),
            'libelles': {'causes': causes, 'remedes': remedes}}


def resume(nom, r):
    c, m = r['cause'][0], r['remede'][0]
    L = [f"== {nom}", f"  cause : {c[0]} ({c[1]:.2f}) — {r['libelles']['causes'][c[0]]}",
         '  vraies (noul) : ' + ', '.join(f'{k} {v:.2f}' for k, v in r['vrai'].items()),
         f"  remède : {m[0]} ({m[1]:.2f}) — {r['libelles']['remedes'][m[0]]}",
         '  gain (0–4) : ' + ', '.join(f'{k} {v:.2f}' for k, v in r['gain'].items())]
    return '\n'.join(L)


if __name__ == '__main__':
    D = json.load(open(sys.argv[1]))
    r = conseil(D['sujet'], D['contexte'], D['causes'], D['remedes'], {k: cv2.imread(p) for k, p in D.get('images', {}).items()})
    print(resume(D.get('nom', sys.argv[1]), r))
    if len(sys.argv) > 2: json.dump(r, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
