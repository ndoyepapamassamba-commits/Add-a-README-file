# Test témoin JEV : mêmes questions que jev_diff.py, sur des paires (source, essai) prises dans deux dossiers.
# python3 jev_paires.py dossier_source dossier_essai sortie.json
import base64, json, os, sys, uuid, urllib.request, cv2
import jev_api   # garde JEV (18/10/2026) : coupé par défaut, le juge local répond
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(__file__))
API = 'https://api.typesafe.ai/v1/systemone'
SRC, ESS, OUT = sys.argv[1:4]
src_q = open(os.path.join(os.path.dirname(__file__), 'jev_diff.py')).read().split('Q = ')[1].split('\ndef judge')[0]
Q = eval(src_q)
def b64(img): ok, b = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90]); return base64.b64encode(b.tobytes()).decode()
def judge(fn):
    r1, r2 = 'rendu-' + uuid.uuid4().hex[:10], 'source-' + uuid.uuid4().hex[:10]
    body = {'model': 'jev-1.14.0', 'state': {'rendu': r1, 'source': r2},
            'assets': {r1: {'type': 'image', 'format': 'jpg', 'data_base64': b64(cv2.imread(f'{ESS}/{fn}'))}, r2: {'type': 'image', 'format': 'jpg', 'data_base64': b64(cv2.imread(f'{SRC}/{fn}'))}},
            'questions': Q}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
    a = json.loads(jev_api.ouvre(req, outil='jev_paires', timeout=180).read())['answers']
    return {'f': fn, **{k: round(a[k]['noul'], 2) for k in Q}}
fs = sorted(f for f in os.listdir(ESS) if f.endswith('.jpg') and os.path.isfile(f'{SRC}/{f}'))
with ThreadPoolExecutor(4) as ex: res = list(ex.map(judge, fs))
n = len(res)
synth = {'paires': n, 'pire_que_source_>=0.5': sum(r['pire_que_source'] >= 0.5 for r in res), 'pire_moy': round(sum(r['pire_que_source'] for r in res) / n, 3),
         'deformation_ajoutee_moy': round(sum(r['rendu_deforme'] - r['source_deforme'] for r in res) / n, 3),
         'artefacts_ajoutes_moy': round(sum(r['rendu_artefacts'] - r['source_artefacts'] for r in res) / n, 3)}
json.dump({'synthese': synth, 'paires': res}, open(OUT, 'w'), ensure_ascii=False, indent=1); print(json.dumps(synth, ensure_ascii=False))
