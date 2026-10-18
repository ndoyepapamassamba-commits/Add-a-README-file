# PRISE DE CHOC DE FIN DE SKETCH JUGÉE PAR JEV (18/10/2026) — remarque de l'utilisateur : « revoir le visage du choc de la
# fin pour chaque épisode : Maman est choquée, la femme au maquis est choquée à la fin, et la dame du loyer aussi ». La v2
# posait la surprise mais rien ne se voyait (JEV « choquée » 0,03–0,07). Contrôle permanent : pour chaque sketch, le gros plan
# de réaction sur celui qui subit la chute, à 0,6 s, 1,5 s et 2,5 s après la prise (jeu.prise_t) — « choquée » > 0,5 et
# visage non abîmé (« rendu » < 0,5) sur CHAQUE image, sans tolérance.
#   python3 jev_choc.py film.mp4 tournage.json timeline.json sortie.json
import json, os, sys
from concurrent.futures import ThreadPoolExecutor
import cv2
import jev_api, jev_film as jf, jeu
from mise_en_scene import QUI

INSTANTS = (0.6, 1.5, 2.5)


def image(cap, t, fps):
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * fps))); ok, f = cap.read()
    return f[jf.CLIP] if ok and f.shape[0] > 700 else (f if ok else None)


if __name__ == '__main__':
    MP4, TOUR, TL, OUT = sys.argv[1:5]
    TO = json.load(open(TOUR)); T = json.load(open(TL)); fps = cv2.VideoCapture(MP4).get(cv2.CAP_PROP_FPS) or 30
    SRC = os.path.join(os.path.dirname(os.path.abspath(TOUR)), 'source')
    taches = []
    for sk in T['sketchs']:
        ch = [L for L in T['lines'] if L['sketch'] == sk['id'] and L.get('chute')]
        if not ch: continue
        c = ch[-1]; tp = jeu.prise_t(c)
        # le gros plan de réaction (tourne.py) : premier plan « gros » qui commence après la chute
        g = next((s for s in TO['decoupage'] if s[2] == sk['id'] and s[3] == 'gros' and s[0] >= c['t0']), None)
        if not g or not g[4] or g[4] not in QUI: continue
        for d in INSTANTS:
            if tp + d < g[1]: taches.append((sk['id'], g[4], round(tp + d, 2), g[0]))
    cap = cv2.VideoCapture(MP4)
    ims = {(s, t): image(cap, t, fps) for s, _, t, _ in taches}

    def juge(x):
        s, qui, t, t0 = x
        ref = cv2.imread(f'{SRC}/{t0:06.2f}.jpg')
        Q = {'choc': (True, f'In `frame`, does {QUI[qui]} look shocked or stunned: eyebrows raised, eyes wide open, mouth dropped open?'),
             'rendu': jf.N1['rendu']}
        a = jf.demande(ims[(s, t)], Q, ref if ref is not None else None)
        return {'sketch': s, 'qui': qui, 't': t, 'choc': a['choc'][0], 'rendu': a['rendu'][0]}
    with ThreadPoolExecutor(8) as ex: R = list(ex.map(juge, [x for x in taches if ims.get((x[0], x[2])) is not None]))
    fautes = [r for r in R if r['choc'] <= 0.5 or r['rendu'] >= 0.5]
    synth = {'ok': bool(R) and not fautes and len({r['sketch'] for r in R}) == len([s for s in T['sketchs'] if any(L.get('chute') for L in T['lines'] if L['sketch'] == s['id'])]),
             'images_jugees': len(R), 'fautes': [f"{r['sketch']}/{r['qui']} à {r['t']} s : choquée {r['choc']:.2f}, rendu {r['rendu']:.2f}" for r in fautes],
             'cout': jev_api.bilan()['par_outil'].get('jev_film')}
    json.dump({'synthese': synth, 'detail': R}, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print('jev_choc', 'OK' if synth['ok'] else 'À REPRENDRE', len(R), 'images', synth['fautes'][:4])
