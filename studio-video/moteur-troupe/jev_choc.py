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

    # JUGE LOCAL (19/10/2026, JEV coupé) : FaceLandmarker sur le gros plan du visage de celui qui subit la chute, comparé à son
    # dessin neutre — bouche tombée ET (sourcils levés OU yeux écarquillés) ; visage introuvable ou géométrie aberrante
    # (yeux ou sourcils hors de 0,4 à 3 fois le neutre) = visage abîmé. Même règle sans tolérance que JEV.
    if not jev_api.autorise():
        import jev_levres as JL, visage_mesure as VM
        M_ = json.load(open('montage.json')) if os.path.isfile('montage.json') else {'scenes': {}}
        tpl_, neutre_ = {}, {}
        for s, qui, _, _ in taches:
            if (s, qui) in tpl_ or s not in M_['scenes']: continue
            d_ = M_['scenes'][s]; d_ = d_ if os.path.isabs(d_) else os.path.join(os.getcwd(), d_)
            Sc = json.load(open(f'{d_}/scene.json')); img_ = cv2.imread(f'{d_}/image.png')
            a_ = next((x for x in Sc['acteurs'] if x['nom'] == qui), None)
            if a_ is None: continue
            x0, y0, x1, y1 = [int(v) for v in a_['visage']['box']]; tpl_[(s, qui)] = img_[y0:y1, x0:x1]
            k_ = 360 / max(tpl_[(s, qui)].shape[:2]); neutre_[(s, qui)] = VM.mesure(cv2.resize(tpl_[(s, qui)], None, fx=k_, fy=k_, interpolation=cv2.INTER_CUBIC))
    def juge_local(x):
        s, qui, t, t0 = x
        g_ = JL.gros_plan(ims[(s, t)], tpl_[(s, qui)]) if (s, qui) in tpl_ else None
        m_, n_ = VM.mesure(g_), neutre_.get((s, qui))
        abime = m_ is None or n_ is None or not all(0.4 <= m_[k] / max(n_[k], 1e-4) <= 3.0 for k in ('yeux', 'sourcils'))
        return {'sketch': s, 'qui': qui, 't': t, 'choc': VM.p_choc(m_, n_), 'rendu': 1.0 if abime else 0.0, 'juge': 'local (FaceLandmarker)',
                'mesure': m_, 'neutre': n_}

    def juge(x):
        if not jev_api.autorise(): return juge_local(x)
        s, qui, t, t0 = x
        ref = cv2.imread(f'{SRC}/{t0:06.2f}.jpg')
        Q = {'choc': (True, f'In `frame`, does {QUI[qui]} look shocked or stunned: eyebrows raised, eyes wide open, mouth dropped open?'),
             'rendu': jf.N1['rendu']}
        a = jf.demande(ims[(s, t)], Q, ref if ref is not None else None)
        return {'sketch': s, 'qui': qui, 't': t, 'choc': a['choc'][0], 'rendu': a['rendu'][0]}
    with ThreadPoolExecutor(8 if jev_api.autorise() else 1) as ex: R = list(ex.map(juge, [x for x in taches if ims.get((x[0], x[2])) is not None]))
    fautes = [r for r in R if r['choc'] <= 0.5 or r['rendu'] >= 0.5]
    synth = {'ok': bool(R) and not fautes and len({r['sketch'] for r in R}) == len([s for s in T['sketchs'] if any(L.get('chute') for L in T['lines'] if L['sketch'] == s['id'])]),
             'images_jugees': len(R), 'fautes': [f"{r['sketch']}/{r['qui']} à {r['t']} s : choquée {r['choc']:.2f}, rendu {r['rendu']:.2f}" for r in fautes],
             'cout': jev_api.bilan()['par_outil'].get('jev_film') if jev_api.autorise() else 0.0}
    json.dump({'synthese': synth, 'detail': R}, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print('jev_choc', 'OK' if synth['ok'] else 'À REPRENDRE', len(R), 'images', synth['fautes'][:4])
