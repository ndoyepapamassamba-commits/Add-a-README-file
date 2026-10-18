# JEV JUGE LES REGARDS (18/10/2026, v36) — remarque de l'utilisateur sur le film : « Mamie, il ne regarde pas Baye ».
# La porte D ne mesurait que le SENS du lacet de tête (> 2° vers celui qui parle, 75 % du temps) : elle passait alors que,
# à l'image, Maman Nounou regardait le ciel pendant que Baye lui répondait (JEV sur la v34 : « regarde Baye » 0,20 à 0,32,
# « en l'air » jusqu'à 0,75). Chaque défaut vu par l'utilisateur devient un contrôle qui l'aurait arrêté : réplique par
# réplique, à 40 % et 75 % de sa durée, JEV dit si chacun regarde celui qui lui parle, et si celui qui parle regarde celui à
# qui il s'adresse (aparté à la caméra excepté) — seulement quand les deux sont à l'image (question de présence posée avec).
# Aucune tolérance : chaque paire jugée doit être conforme (moyenne des deux instants > 0,5).
#   python3 jev_regard.py film.mp4 timeline.json montage.json sortie.json
import json, os, sys, uuid
from concurrent.futures import ThreadPoolExecutor
import numpy as np, cv2
import jev_api, jeu
from mise_en_scene import QUI

CLIP = (slice(282, 742), slice(None)); INSTANTS = (0.4, 0.75)
FPS = round(cv2.VideoCapture(sys.argv[1]).get(cv2.CAP_PROP_FPS)) or 30   # cadence du fichier (60 i/s depuis le 18/10/2026)


def question(x, y):
    return {'regarde': {'type': 'noul', 'instructions': f'In `frame`, is {QUI[x]} looking at {QUI[y]}: eyes and face turned toward that '
                                                        f'person? If either of them is not in the picture, answer no.'},
            'presents': {'type': 'noul', 'instructions': f'Are both {QUI[x]} and {QUI[y]} visible in `frame`?'}}


if __name__ == '__main__':
    MP4, TL, MONTAGE, OUT = sys.argv[1:5]
    T = json.load(open(TL)); M = json.load(open(MONTAGE)); L_all = T['lines']
    cartes = [(c['t0'] - 0.05, c['t1'] + 0.2) for c in T.get('cartes', [])]
    acteurs = {}
    for sid, d in M['scenes'].items():
        try: acteurs[sid] = [a['nom'] for a in json.load(open(f'{d}/scene.json'))['acteurs']]
        except Exception: acteurs[sid] = []
    taches = []
    for k, L in enumerate(L_all):
        noms = [n for n in acteurs.get(L.get('sketch'), []) if n in QUI]
        if L['qui'] not in noms: continue
        dest = jeu.interlocuteur(L, L_all, noms)
        paires = [(n, L['qui'], 'écoute') for n in noms if n != L['qui']]
        if dest in noms and L.get('jeu') != 'camera': paires.append((L['qui'], dest, 'parle à'))
        for u in INSTANTS:
            t = L['t0'] + u * L['dur']
            if any(c0 <= t < c1 for c0, c1 in cartes): continue
            for x, y, role in paires: taches.append({'replique': k, 't': round(t, 2), 'qui': x, 'vers': y, 'role': role, 'texte': L.get('texte', '')[:40]})
    voulu = {int(round(x['t'] * FPS)) for x in taches}; images = {}
    cap = cv2.VideoCapture(MP4); n = 0
    while True:
        ok, f = cap.read()
        if not ok: break
        if n in voulu: images[n] = f[CLIP]
        n += 1
    def un(x):
        im = images.get(int(round(x['t'] * FPS)))
        if im is None: return None
        i = 'frame-' + uuid.uuid4().hex[:8]
        a = jev_api.demande({'frame': i}, question(x['qui'], x['vers']), {i: {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(im)}}, outil='jev_regard')
        return {'regarde': round(float(a['regarde']['noul']), 3), 'presents': round(float(a['presents']['noul']), 3)}
    print(f"jev_regard : {len(taches)} questions — prévu {jev_api.prevoir([('regards', len(taches), 1, 2, 0.265)])['cout_usd']} $", flush=True)
    with ThreadPoolExecutor(12) as ex: R = list(ex.map(un, taches))
    paires = {}
    for x, r in zip(taches, R):
        if r: paires.setdefault((x['replique'], x['qui'], x['vers'], x['role'], x['texte']), []).append(dict(r, t=x['t']))
    detail = []
    for (k, qui, vers, role, txt), rs in paires.items():
        vus = [r for r in rs if r['presents'] > 0.5]
        if not vus: continue   # pas tous deux à l'image : rien à juger
        m = round(float(np.mean([r['regarde'] for r in vus])), 3)
        detail.append({'replique': k, 'texte': txt, 'qui': qui, 'regarde': vers, 'role': role, 'jev': m, 'instants': vus, 'ok': m > 0.5})
    fautes = [d for d in detail if not d['ok']]
    synth = {'paires_jugees': len(detail), 'fautes': [f"{d['qui']} → {d['regarde']} ({d['role']}, « {d['texte']} ») {d['jev']}" for d in fautes],
             'pire': min((d['jev'] for d in detail), default=None), 'cout': jev_api.bilan()['par_outil'].get('jev_regard')}
    json.dump({'synthese': synth, 'detail': detail}, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print('SYNTHÈSE', json.dumps({k: v for k, v in synth.items() if k != 'cout'}, ensure_ascii=False))
