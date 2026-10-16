# TEST 7 — ŒIL DE JEV SUR LE FILM LIVRÉ : une image au milieu de chaque plan (bande du clip), quatre questions typées.
# python3 jev_plans.py v10/troupe-v10.mp4 v10/tournage.json v10/jev_plans.json
import base64, io, json, sys, uuid, urllib.request, cv2
from PIL import Image
API = 'https://api.typesafe.ai/v1/systemone'
MP4, SHOTS, OUT = sys.argv[1:4]
SH = json.load(open(SHOTS))['decoupage']
cap = cv2.VideoCapture(MP4)
Q = {
    'tete_coupee': {'type': 'noul', 'instructions': 'In `frame`, is the head of any person cut off by the image border (part of a head outside the picture)?'},
    'visage_deforme': {'type': 'noul', 'instructions': 'In `frame`, does any face look deformed, melted, stretched, warped or anatomically wrong?'},
    'artefacts': {'type': 'noul', 'instructions': 'In `frame`, are there visible rendering artifacts on the people: smears, ghost duplicates, broken or bent limbs, blurred patches or seams?'},
    'style_coherent': {'type': 'noul', 'instructions': '`frame` looks like a clean still from a 3D animated feature film, with the characters in the same style and lighting as the background.'},
}
res = []
for s in SH:
    t = (s[0] + s[1]) / 2; cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * 30)); ok, f = cap.read()
    if not ok: continue
    clip = cv2.cvtColor(f[282:742], cv2.COLOR_BGR2RGB); b = io.BytesIO(); Image.fromarray(clip).save(b, 'JPEG', quality=90)
    ref = 'frame-' + uuid.uuid4().hex[:12]
    body = {'model': 'jev-1.14.0', 'state': {'frame': ref}, 'assets': {ref: {'type': 'image', 'format': 'jpg', 'data_base64': base64.b64encode(b.getvalue()).decode()}}, 'questions': Q}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
    a = json.loads(urllib.request.urlopen(req, timeout=120).read())['answers']
    r = {'t': round(t, 2), 'plan': f'{s[2]}/{s[3]}/{s[4]}', **{k: round(a[k]['noul'], 2) for k in Q}}
    res.append(r); print(r, flush=True)
    cv2.imwrite(OUT.replace('.json', f'_{len(res):02d}.jpg'), f[282:742])
bad = lambda k, thr=0.5: [r['t'] for r in res if r[k] >= thr]
synth = {'plans_juges': len(res), 'tetes_coupees': bad('tete_coupee'), 'visages_deformes': bad('visage_deforme'), 'artefacts': bad('artefacts'),
         'style_incoherent': [r['t'] for r in res if r['style_coherent'] < 0.5]}
json.dump({'synthese': synth, 'plans': res}, open(OUT, 'w'), ensure_ascii=False, indent=1)
print('SYNTHÈSE', json.dumps(synth, ensure_ascii=False))
