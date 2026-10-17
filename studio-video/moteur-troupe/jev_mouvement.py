# JEV JUGE LE MOUVEMENT, SECONDE PAR SECONDE (17/10/2026). Consignes : « le contrôle qualité de JEV doit être sur toute la
# vidéo, image par image, seconde par seconde, plan par plan » ; « inclure animation, fluidité, arrière-plan, tout ».
# JEV ne lit pas la vidéo : pour chaque seconde, il reçoit quatre images du même plan (sans coupe ni carte de titre),
# régulièrement espacées, et juge ce qui se passe ENTRE elles : à-coups (un visage, une bouche, un membre ou le décor qui
# saute), personnages figés, décor mort, mouvement non naturel, faux raccords. Aucune tolérance : chaque seconde doit être
# conforme ; une seconde signalée est redemandée deux fois (moyenne des trois avis, contre le bruit de JEV).
#   python3 jev_mouvement.py film.mp4 tournage.json timeline.json sortie.json
import json, math, os, sys, uuid
from concurrent.futures import ThreadPoolExecutor
import numpy as np, cv2
import jev_api

CLIP = (slice(282, 742), slice(None)); FPS = 30
INTRO = ('`a`, `b`, `c` and `d` are four moments of the same shot of an animated film, in this order, about {dt:.2f} s apart '
         '(no camera cut between them; the camera may move slowly).')
SUITE = ('`e`, `f`, `g` and `h` are four CONSECUTIVE frames (1/30 s apart) of the same shot of an animated film, taken where the '
         'picture changes the most in this second.')
# ANALYSE DE LA DÉCISION DE JEV (17/10) : avec quatre images à 0,3 s d'écart, une bouche qui parle ou un zoom d'ouverture
# changent forcément d'une image à l'autre et JEV y voyait des « sauts » (11 secondes) sans pouvoir distinguer un mouvement
# continu d'un vrai saut. Les à-coups et les faux raccords sont donc jugés sur quatre images CONSÉCUTIVES prises là où l'image
# change le plus dans la seconde (un vrai saut s'y voit ; un mouvement fluide y est minuscule) ; le figé, le décor mort et le
# naturel restent jugés sur les images espacées.
Q = {'saccade': (False, SUITE + ' Between consecutive frames, does anything jump or pop abruptly — a face, a mouth, a body part, an '
                 'object or the background changing suddenly, flickering or teleporting — instead of moving a tiny step?'),
     'raccord': (False, SUITE + ' Is there a continuity error between these frames — a character changing clothes, size or place, an '
                 'object appearing or disappearing?'),
     'fige': (False, INTRO + ' Do the characters look completely frozen, like a still picture — not even a small movement of head, '
              'body, eyes or mouth across the four moments?'),
     'fond_mort': (False, INTRO + ' Apart from the camera movement, is the background completely dead across the four moments — no '
                   'leaves, smoke, people, animals, light or anything else moving?'),
     # CALIBRATION (17/10/2026, calibre_mouvement2.py : animation 3D professionnelle + Grok contre la même seconde FIGÉE) :
     # l'ancienne question « naturel » ne voyait pas le mouvement (AUC 0,40 : 4 images figées 0,59 > animation pro 0,53) ;
     # questions concrètes retenues — ensemble 0,90, tête 0,93, buste 0,90, bras 0,88. « ensemble » décide ; bras, buste et
     # tête disent ce qui manque (v27 : bras 0,28 contre 0,56 pour l'animation pro).
     'ensemble': (True, INTRO + ' Do several body parts of the same character (head, torso, arms) change pose together across `a`–`d`, '
                  'as in natural acting?'),
     'bras': (True, INTRO + ' Between `a` and `d`, do a character\'s arms or hands visibly change position?'),
     'buste': (True, INTRO + ' Between `a` and `d`, does a character\'s torso visibly lean, twist or shift its weight?'),
     'tete': (True, INTRO + ' Between `a` and `d`, does a character\'s head visibly turn, tilt or nod?')}
DIAGNOSTIC = ('bras', 'buste', 'tete')   # mesurés et rapportés, mais la décision de la seconde se fait sur « ensemble »


def segment(sec, SH, cartes, N):
    """le plus long morceau d'un même plan dans [sec, sec+1), hors cartes de titre, bords de coupe exclus (2 images)."""
    best = None
    for s in SH:
        a, b = max(sec, s[0]) + 2 / FPS, min(sec + 1, s[1]) - 2 / FPS
        for c0, c1 in cartes:   # retirer les cartes de titre
            if c0 <= a < c1: a = c1
            if c0 < b <= c1: b = c0
        if b - a >= 0.3 and (best is None or b - a > best[1] - best[0]): best = (a, b, s)
    if best is None: return None
    a, b, s = best; ts = np.linspace(a, b, 4)
    return [min(N - 1, int(round(t * FPS))) for t in ts], float(ts[1] - ts[0]), s, (int(round(a * FPS)), int(round(b * FPS)))


def demande(ims, suite, dt):
    ids, assets = {}, {}
    for c, im in zip('abcdefgh', list(ims) + list(suite)):
        ids[c] = f'{c}-{uuid.uuid4().hex[:8]}'; assets[ids[c]] = {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(im)}
    a = jev_api.demande(ids, {k: {'type': 'noul', 'instructions': txt.format(dt=dt)} for k, (_, txt) in Q.items()}, assets, outil='jev_mouvement')
    return {k: round(float(a[k]['noul']) if att else 1.0 - float(a[k]['noul']), 3) for k, (att, _) in Q.items()}   # 1 = conforme


def plus_vif(images, n0, n1):
    """rang k où l'image change le plus (écart moyen entre images voisines, en petit) → quatre images consécutives autour."""
    p = [cv2.cvtColor(cv2.resize(images[n], (144, 115)), cv2.COLOR_BGR2GRAY).astype(np.float32) for n in range(n0, n1 + 1)]
    d = [float(np.abs(p[i + 1] - p[i]).mean()) for i in range(len(p) - 1)]
    k = n0 + int(np.argmax(d)) if d else n0; k = min(max(k - 1, n0), max(n0, n1 - 3)); return [k, k + 1, k + 2, k + 3]


if __name__ == '__main__':
    MP4, TOUR, TL, OUT = sys.argv[1:5]
    TO = json.load(open(TOUR)); T = json.load(open(TL)); SH = TO['decoupage']
    cartes = [(c['t0'] - 0.05, c['t1'] + 0.2) for c in T.get('cartes', [])]
    cap = cv2.VideoCapture(MP4); images = []
    while True:
        ok, f = cap.read()
        if not ok: break
        images.append(f[CLIP])
    N = len(images); taches = []
    for sec in range(math.ceil(N / FPS)):
        g = segment(sec, SH, cartes, N)
        if g: taches.append({'seconde': sec, 'images': g[0], 'dt': g[1], 'plan': f'{g[2][2]}/{g[2][3]}/{g[2][4]}', 'suite': plus_vif(images, *g[3])})
    print(f"jev_mouvement : {len(taches)} secondes — prévu {jev_api.prevoir([('secondes', len(taches), 8, len(Q), 0.265)])['cout_usd']} $", flush=True)
    un = lambda x: demande([images[n] for n in x['images']], [images[n] for n in x['suite']], x['dt'])
    with ThreadPoolExecutor(12) as ex: R = list(ex.map(un, taches))
    decide = [k for k in Q if k not in DIAGNOSTIC]
    sign = [i for i, r in enumerate(R) if min(r[k] for k in decide) <= 0.5]
    with ThreadPoolExecutor(12) as ex: rr = list(ex.map(lambda i: [un(taches[i]) for _ in range(2)], sign))
    for i, r2 in zip(sign, rr):
        R[i] = {k: round(float(np.mean([R[i][k]] + [x[k] for x in r2])), 3) for k in R[i]}; R[i]['confirme'] = 3
    par_seconde = [dict(x, **r, defauts=[k for k in decide if r[k] <= 0.5], a_ameliorer=[k for k in DIAGNOSTIC if r[k] <= 0.5]) for x, r in zip(taches, R)]
    synth = {'secondes_jugees': len(par_seconde), 'secondes_fautives': [x['seconde'] for x in par_seconde if x['defauts']],
             **{k: [x['seconde'] for x in par_seconde if k in x['defauts']] for k in decide},
             'a_ameliorer': {k: [x['seconde'] for x in par_seconde if k in x['a_ameliorer']] for k in DIAGNOSTIC},
             'pire': {k: round(min(x[k] for x in par_seconde), 3) for k in Q}, 'cout': jev_api.bilan()['par_outil'].get('jev_mouvement')}
    json.dump({'synthese': synth, 'par_seconde': par_seconde}, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print('SYNTHÈSE', json.dumps({k: v for k, v in synth.items() if k != 'cout'}, ensure_ascii=False))
