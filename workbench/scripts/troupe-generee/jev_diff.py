# TEST 8 — PREUVE DIFFÉRENTIELLE PAR L'ŒIL DE JEV (16/10/2026) : pour chaque plan, l'image ANIMÉE (vidéo livrée) et la
# MÊME image avant animation (même cadre pris dans l'image générée d'origine). Un défaut présent dans les deux vient de
# l'image générée ; un défaut présent seulement dans l'animée vient du moteur. C'est ce second chiffre qui compte.
# python3 jev_diff.py v11/troupe-v11.mp4 v11/tournage.json v11/source v11/jev_diff.json
import base64, io, json, os, sys, uuid, urllib.request, cv2
from concurrent.futures import ThreadPoolExecutor
API = 'https://api.typesafe.ai/v1/systemone'
MP4, SHOTS, SRC, OUT = sys.argv[1:5]
SH = json.load(open(SHOTS))['decoupage']
CARTES = json.load(open('timeline.json'))['cartes']
def b64(img):
    ok, b = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90]); return base64.b64encode(b.tobytes()).decode()
Q = {
    'rendu_deforme': {'type': 'noul', 'instructions': 'In `rendu`, does any face look deformed, melted, stretched, warped or anatomically wrong?'},
    'source_deforme': {'type': 'noul', 'instructions': 'In `source`, does any face look deformed, melted, stretched, warped or anatomically wrong?'},
    'rendu_artefacts': {'type': 'noul', 'instructions': 'In `rendu`, are there visible rendering artifacts on the people: smears, ghost duplicates, broken or bent limbs, blurred patches or seams?'},
    'source_artefacts': {'type': 'noul', 'instructions': 'In `source`, are there visible rendering artifacts on the people: smears, ghost duplicates, broken or bent limbs, blurred patches or seams?'},
    'pire_que_source': {'type': 'noul', 'instructions': '`rendu` is the same shot as `source`, a fraction of a second into the animation (mouths, eyelids, head and upper body may move slightly; that is expected). Does `rendu` contain a deformation, smear, seam, ghost or other defect on a person that is NOT present in `source`?'},
}
def judge(s):
    fn = f'{SRC}/{s[0]:06.2f}.jpg'
    if not os.path.isfile(fn): return None
    t = s[0] + 0.12
    for c in CARTES:   # le plan d'ouverture commence sous la carte émoji : on prend la 1re image après la carte
        if c['t0'] - 0.05 <= t < c['t1'] + 0.2: t = c['t1'] + 0.25
    cap = cv2.VideoCapture(MP4); cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * 30))); ok, f = cap.read()
    if not ok: return None
    rendu = f[282:742]; source = cv2.imread(fn)
    r1, r2 = 'rendu-' + uuid.uuid4().hex[:10], 'source-' + uuid.uuid4().hex[:10]
    body = {'model': 'jev-1.14.0', 'state': {'rendu': r1, 'source': r2},
            'assets': {r1: {'type': 'image', 'format': 'jpg', 'data_base64': b64(rendu)}, r2: {'type': 'image', 'format': 'jpg', 'data_base64': b64(source)}},
            'questions': Q}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
    a = json.loads(urllib.request.urlopen(req, timeout=180).read())['answers']
    cv2.imwrite(OUT.replace('.json', f'_{s[0]:06.2f}.jpg'), cv2.hconcat([source, rendu]))
    return {'t0': s[0], 'plan': f'{s[2]}/{s[3]}/{s[4]}', **{k: round(a[k]['noul'], 2) for k in Q}}
with ThreadPoolExecutor(4) as ex: res = [r for r in ex.map(judge, SH) if r]
for r in res: print(r)
synth = {'plans': len(res),
         'moteur_pire_que_source': [r['t0'] for r in res if r['pire_que_source'] >= 0.5],
         'deformation_ajoutee_moy': round(sum(r['rendu_deforme'] - r['source_deforme'] for r in res) / len(res), 3),
         'artefacts_ajoutes_moy': round(sum(r['rendu_artefacts'] - r['source_artefacts'] for r in res) / len(res), 3),
         'source_deforme_moy': round(sum(r['source_deforme'] for r in res) / len(res), 3),
         'rendu_deforme_moy': round(sum(r['rendu_deforme'] for r in res) / len(res), 3)}
json.dump({'synthese': synth, 'plans': res}, open(OUT, 'w'), ensure_ascii=False, indent=1)
print('SYNTHÈSE', json.dumps(synth, ensure_ascii=False))
