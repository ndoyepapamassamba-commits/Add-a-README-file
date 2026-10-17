# ACCÈS UNIQUE À JEV + REGISTRE DES COÛTS (17/10/2026). Consigne : « tu analyseras la décision de JEV et tu l'amélioreras
# pour prévoir les coûts de JEV ». Tarif publié (docs.typesafe.ai/models, jev-1.14.0) : 42 $ par milliard de jetons
# d'entrée (0,042 $ / million), sortie gratuite ; contexte 64 k jetons par requête, 32 k par question. Chaque réponse donne
# usage.input_tokens : le coût de CHAQUE appel est donc exact, pas estimé. Chaque appel est inscrit au registre
# (outil, images, questions, jetons, coût, durée) ; prevoir() ajuste jetons ≈ a·images + b·questions + c sur le registre
# (moindres carrés) et chiffre un plan AVANT de le lancer ; decoupe() garde chaque requête sous le contexte.
import base64, json, os, time, urllib.error, urllib.request
import numpy as np, cv2

API = 'https://api.typesafe.ai/v1/systemone'
MODELE = 'jev-1.14.0'
PRIX_MTOK = 0.042          # $ par million de jetons d'entrée (sortie gratuite)
CONTEXTE = 64000           # jetons par requête (sans l'en-tête « long context »)
MIN_COTE = 320             # JEV refuse une image dont le petit côté est sous ~300 px (mesuré le 17/10 : 256/260 refusés)
REGISTRE = os.path.expanduser('~/.cache/massamba-jev/registre.jsonl')


def b64(im, qualite=90):
    if min(im.shape[:2]) < MIN_COTE:
        k = MIN_COTE / min(im.shape[:2]); im = cv2.resize(im, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
    return base64.b64encode(cv2.imencode('.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, qualite])[1].tobytes()).decode()


def _pixels(assets):
    """pixels des images JPEG envoyées (lus dans l'en-tête SOF, sans décoder) : les jetons d'une image suivent sa taille."""
    tot = 0
    for a in (assets or {}).values():
        b = base64.b64decode(a.get('data_base64', ''))[:65536]; i = 2
        while i < len(b) - 9:
            if b[i] != 0xFF: i += 1; continue
            m = b[i + 1]
            if m in (0xC0, 0xC1, 0xC2): tot += int.from_bytes(b[i + 5:i + 7], 'big') * int.from_bytes(b[i + 7:i + 9], 'big'); break
            i += 2 + int.from_bytes(b[i + 2:i + 4], 'big')
    return tot


def demande(etat, questions, assets=None, outil='?', timeout=240, essais=4):
    """une requête à JEV → réponses ; inscrit jetons et coût au registre. 4xx : erreur immédiate avec le message du
    service ; 429/5xx/réseau : nouvel essai après 2, 4, 8 s."""
    body = {'model': MODELE, 'state': etat, 'questions': questions}
    if assets: body['assets'] = assets
    data = json.dumps(body).encode(); t0 = time.time()
    for e in range(essais):
        try:
            req = urllib.request.Request(API, data=data, headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
            r = json.loads(urllib.request.urlopen(req, timeout=timeout).read()); break
        except urllib.error.HTTPError as x:
            if x.code < 500 and x.code != 429: raise RuntimeError(f'JEV {x.code} : {x.read().decode()[:300]}')
            if e == essais - 1: raise
        except Exception:
            if e == essais - 1: raise
        time.sleep(2 ** (e + 1))
    u = r.get('usage', {}); it = int(u.get('input_tokens', 0))
    ligne = {'date': time.strftime('%Y-%m-%dT%H:%M:%S'), 'outil': outil, 'modele': r.get('model', MODELE), 'images': len(assets or {}),
             'questions': len(questions), 'mpix': round(_pixels(assets) / 1e6, 4), 'jetons': it, 'sortie': int(u.get('output_tokens', 0)), 'cout_usd': round(it * PRIX_MTOK / 1e6, 8),
             'octets': len(data), 'duree_s': round(time.time() - t0, 2)}
    try:
        os.makedirs(os.path.dirname(REGISTRE), exist_ok=True)
        with open(REGISTRE, 'a') as f: f.write(json.dumps(ligne) + '\n')
    except OSError:
        pass
    return r['answers']


def registre():
    if not os.path.isfile(REGISTRE): return []
    return [json.loads(l) for l in open(REGISTRE) if l.strip()]


def modele_jetons():
    """jetons ≈ a·mégapixels + b·questions + c·images + d, ajusté sur le registre (moindres carrés, coefficients ≥ 0)."""
    R = [r for r in registre() if r['jetons'] > 0 and 'mpix' in r]
    if len(R) < 6: return {'mpix': 2700.0, 'question': 23.0, 'image': 30.0, 'fixe': 280.0, 'appels': len(R)}   # mesures du 17/10
    X = np.array([[r['mpix'], r['questions'], r['images'], 1.0] for r in R]); y = np.array([r['jetons'] for r in R], float)
    c = np.clip(np.linalg.lstsq(X, y, rcond=None)[0], 0, None)
    return {'mpix': round(float(c[0]), 1), 'question': round(float(c[1]), 1), 'image': round(float(c[2]), 1), 'fixe': round(float(c[3]), 1), 'appels': len(R)}


def prevoir(plan):
    """plan : [(libellé, requêtes, images par requête, questions par requête, mégapixels par image)] → coût prévu."""
    m = modele_jetons(); lignes = []; tot = 0.0
    for lib, n, im, q, mp in plan:
        j = n * (m['mpix'] * mp * im + m['question'] * q + m['image'] * im + m['fixe']); tot += j
        lignes.append({'poste': lib, 'requetes': n, 'jetons': int(j), 'cout_usd': round(j * PRIX_MTOK / 1e6, 5)})
    return {'modele': m, 'postes': lignes, 'jetons': int(tot), 'cout_usd': round(tot * PRIX_MTOK / 1e6, 5)}


def decoupe(cles, images_par_cle, mpix_par_image=0.27, questions_par_cle=3, max_jetons=0.8 * CONTEXTE):
    """groupes de clés dont la requête tient dans le contexte (marge 20 %), d'après le modèle de jetons mesuré."""
    m = modele_jetons(); par = (m['mpix'] * mpix_par_image + m['image']) * images_par_cle + m['question'] * questions_par_cle
    n = max(1, int((max_jetons - m['fixe']) // max(1.0, par)))
    return [cles[i:i + n] for i in range(0, len(cles), n)]


def bilan():
    R = registre(); par = {}
    for r in R:
        b = par.setdefault(r['outil'], {'appels': 0, 'jetons': 0, 'cout_usd': 0.0, 'images': 0, 'questions': 0})
        b['appels'] += 1; b['jetons'] += r['jetons']; b['cout_usd'] += r['cout_usd']; b['images'] += r['images']; b['questions'] += r['questions']
    return {'total_usd': round(sum(r['cout_usd'] for r in R), 5), 'jetons': sum(r['jetons'] for r in R), 'appels': len(R),
            'par_outil': {k: dict(v, cout_usd=round(v['cout_usd'], 5)) for k, v in par.items()}}


if __name__ == '__main__':
    print(json.dumps({'bilan': bilan(), 'modele': modele_jetons()}, ensure_ascii=False, indent=1))
