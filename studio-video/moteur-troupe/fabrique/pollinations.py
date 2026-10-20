# CLIENT POLLINATIONS (18/10/2026) — alternative rapide à AI Horde (file anonyme saturée le 18/10 : 1 088 demandes pour 14
# machines, nos demandes jamais servies en 15 min). API gen.pollinations.ai (schéma OpenAPI lu le 18/10) avec la clé de
# l'utilisateur (variable POLLINATIONS_TOKEN, jamais affichée) ; modèles de l'offre gratuite retenus :
#   · Z-Image-Turbo (Apache-2.0) : 0,004 pollen l'image, 60 par minute — planches de rotation, décors, objets ;
#   · FLUX.2 klein 4B (Apache-2.0) : édition multi-références — mêmes personnages vus sous d'autres angles, à partir de la
#     planche de face (identité verrouillée par l'image, pas seulement par le texte).
#   python3 pollinations.py "<invite>" sortie.png [largeur] [hauteur] [modèle] [graine] [référence.png …]
import base64, json, os, sys, time, urllib.request

API = 'https://gen.pollinations.ai'
MODELES = {'z': 'tongyi-mai/z-image-turbo', 'klein': 'black-forest-labs/flux.2-klein-4b', 'kontext': 'black-forest-labs/flux.1-kontext-pro'}


def cle():
    k = os.environ.get('POLLINATIONS_TOKEN') or os.environ.get('POLLINATIONS_API_KEY')
    if not k: raise SystemExit("clé Pollinations absente : l'ajouter dans les réglages de l'environnement sous POLLINATIONS_TOKEN")
    return k


def _post(chemin, corps, essais=4):
    for e in range(essais):
        req = urllib.request.Request(API + chemin, data=json.dumps(corps).encode(), method='POST',
                                     headers={'Authorization': f'Bearer {cle()}', 'Content-Type': 'application/json', 'User-Agent': 'massamba-fabrique/1.0'})
        try:
            with urllib.request.urlopen(req, timeout=300) as r: return json.loads(r.read())
        except urllib.error.HTTPError as ex:
            msg = ex.read()[:300].decode(errors='ignore')
            if ex.code in (401, 402, 403): raise SystemExit(f'Pollinations {ex.code} : {msg}')
            print(f'  Pollinations {ex.code}, nouvel essai ({msg[:100]})', flush=True); time.sleep(5 * (e + 1))
        except Exception as ex:
            print(f'  Pollinations : {repr(ex)[:100]}, nouvel essai', flush=True); time.sleep(5 * (e + 1))
    raise RuntimeError('Pollinations : échec après plusieurs essais')


def _image_data(f):
    t = 'png' if f.lower().endswith('.png') else 'jpeg'
    return f'data:image/{t};base64,' + base64.b64encode(open(f, 'rb').read()).decode()


def genere(invite, sortie, w=832, h=1216, modele='z', graine=None, references=()):
    """une image (texte → image, ou édition guidée par des images de référence) écrite dans sortie ; → méta-données."""
    corps = {'prompt': invite, 'model': MODELES.get(modele, modele), 'n': 1, 'size': f'{w}x{h}', 'response_format': 'b64_json'}
    if graine is not None: corps['seed'] = int(graine)
    t0 = time.time()
    if references:
        corps['image'] = [{'image_url': _image_data(f)} for f in references]; r = _post('/v1/images/edits', corps)
    else:
        r = _post('/v1/images/generations', corps)
    d = r['data'][0]
    data = base64.b64decode(d['b64_json']) if d.get('b64_json') else urllib.request.urlopen(d['url'], timeout=120).read()
    os.makedirs(os.path.dirname(os.path.abspath(sortie)), exist_ok=True); open(sortie, 'wb').write(data)
    print('ok', sortie, corps['model'], f'{time.time() - t0:.1f}s', flush=True)
    return {'modele': corps['model'], 'graine': graine, 'duree': round(time.time() - t0, 1)}


if __name__ == '__main__':
    a = sys.argv
    genere(a[1], a[2], int(a[3]) if len(a) > 3 else 832, int(a[4]) if len(a) > 4 else 1216, a[5] if len(a) > 5 else 'z',
           int(a[6]) if len(a) > 6 else None, a[7:])
