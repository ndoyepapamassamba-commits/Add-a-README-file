# CONTRÔLE DE JEV SUR TOUTE LA VIDÉO, IMAGE PAR IMAGE — v2 en cascade (17/10/2026). Consignes : « le contrôle qualité de
# JEV doit être sur toute la vidéo, image par image, seconde par seconde, plan par plan » ; « aucune tolérance » ;
# « réduire les coûts d'appel JEV sans diminuer le concept de JEV partout » ; « analyse la décision de JEV et améliore-la ».
# ANALYSE (calibration du 17/10, 176 images étiquetées, outils/calibre_questions.py) : les questions d'origine signalaient
# les peintures d'origine elles-mêmes (visage déformé 7/21, flotte 4/21, ombre 4/21) ; réécrites avec le style du film en
# contexte (« grands yeux, proportions de dessin animé : jamais un défaut ») et en excluant ce que coupe le bord du cadre :
# 0/21, et meilleur rappel (fantômes 0,65 → 0,90 ; déformations 0,45 → 0,60 ; physique AUC 0,93–0,99). La basse définition
# a été REFUSÉE : −18 % de jetons seulement, jugement dégradé.
# CASCADE (coût ÷3 environ, chaque image reste jugée par JEV) :
#   1. toutes les images, pleine définition, sans image source : têtes coupées, rendu abîmé, physique, style ;
#   2. les images SUSPECTES (une réponse ≥ 0,4) : contrôle détaillé avec l'image source du plan (déformation et artefacts
#      ajoutés, flotte, ombre, échelle, lumière, hors contexte), et les questions du niveau 1 reposées ;
#   décision : moyenne des avis sur chaque question ; défaut si ≥ 0,5 (conformité : ≤ 0,5). Aucune marge.
# Cartes de titre : hors physique et comparaison à la source (graphisme voulu), lisibilité du titre jugée à part.
# Cache par empreinte de plan et rang de l'image : une image inchangée garde son verdict, 0 jeton.
#   python3 jev_film.py film.mp4 tournage.json timeline.json sortie.json
import hashlib, json, math, os, sys, uuid
from concurrent.futures import ThreadPoolExecutor
import numpy as np, cv2
import jev_api

CLIP = (slice(282, 742), slice(None)); FPS = 30
STYLE = ('`frame` is a frame from a stylized 3D animated film: big eyes, smooth skin and simplified cartoon proportions are the '
         'intended style, never a defect. Anything cut by the frame edge does not count as a defect of that thing.')
N1 = {'tete_coupee': (False, 'In `frame`, is a person\'s face or head only PARTLY visible because the image border cuts through it (some of '
                      'the face or skull inside the picture, some outside)? A head entirely outside the picture, or fully inside, does not count.'),
      'rendu': (False, 'Read `contexte`. Is there a visible RENDERING or ANIMATION ERROR on a character or creature in `frame`: a face or body '
                'part smeared, melted, torn, doubled like a ghost, stretched out of its normal shape, or eyes or mouth in the wrong place?'),
      'physique': (False, 'Read `contexte`. Does something in `frame` clearly break the physics of the scene: a person, animal or object '
                   'floating above the ground or looking pasted on with no contact, no shadow at all while the other things nearby cast '
                   'clear shadows, a clearly wrong size for its distance, or lit from another direction than the rest? A person whose feet '
                   'are outside the picture is not floating.'),
      'style': (True, '`frame` looks like a clean still from a 3D animated feature film, with the characters in the same style and '
                'lighting as the background.')}
N2 = {'deforme_vs_source': (False, '`reference` is the original still of this scene; `frame` is a later moment, animated (the camera may be '
                            'closer; heads may turn, mouths talk, eyes blink, expressions change — all normal). Is any face in `frame` damaged '
                            'in a way the same face in `reference` is not: melted, smeared, stretched, doubled, torn, or with misplaced eyes or mouth?'),
      'artefacts_vs_source': (False, '`reference` is the original still of this scene; `frame` is a later moment, animated (normal changes: '
                              'camera, head turns, talking, blinking, expressions). Does `frame` show rendering damage on the people that '
                              '`reference` does not have: smears, ghost duplicates, broken or bent limbs, torn clothes, blurred patches or seams?'),
      'flotte': (False, 'Read `contexte`. In `frame`, does a person, animal or object whose feet or base ARE VISIBLE in the picture float above '
                 'the ground or look pasted on, without contact with the ground?'),
      'ombre': (False, 'Read `contexte`. In `frame`, while the other people and objects cast clearly visible shadows, is there one standing on '
                'the same sunlit ground, with its feet or base visible, that has no shadow at all?'),
      'echelle': (False, 'In `frame`, is any animal or object clearly the wrong size for its distance, compared with the people and the place?'),
      'lumiere': (False, 'Read `contexte`. In `frame`, is any person, animal or object lit differently from the rest of the scene (wrong light '
                  'direction, color or brightness), as if it came from another picture?'),
      'hors_contexte': (False, 'In `frame`, is there something that does not belong in this place, such as a farm animal inside a restaurant, a '
                        'bar or a bedroom?')}
CARTE = {'tete_coupee': N1['tete_coupee'], 'rendu': N1['rendu'],
         'titre_lisible': (True, '`frame` shows a title over a scene of an animated film. Is the title text clearly legible and correctly written?')}
PHYS = ('physique', 'flotte', 'ombre', 'echelle', 'lumiere', 'hors_contexte')
QV = hashlib.sha1(json.dumps([STYLE, N1, N2, CARTE], sort_keys=True).encode()).hexdigest()[:12]
CJ = os.path.expanduser('~/.cache/massamba-jev/images'); THREADS = int(os.environ.get('JEV_FILM_FILS', 16)); SUSPECT = 0.45   # 0,40 envoyait 77 % des images au niveau 2 (v26) : coût −18 % seulement


def demande(fr, Q, ref=None):
    ids = {'frame': 'frame-' + uuid.uuid4().hex[:10]}; assets = {ids['frame']: {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(fr)}}
    if ref is not None:
        ids['reference'] = 'reference-' + uuid.uuid4().hex[:10]; assets[ids['reference']] = {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(ref)}
    etat = dict(ids, contexte=STYLE)   # le contexte de style UNE fois dans l'état, pas répété dans chaque question
    a = jev_api.demande(etat, {k: {'type': 'noul', 'instructions': txt} for k, (_, txt) in Q.items()}, assets, outil='jev_film')
    return {k: [round(float(a[k]['noul']), 3)] for k in Q}   # listes : on accumule les avis


def verdict(av, Q):
    """moyenne des avis par question ; probabilité de DÉFAUT (style / titre lisible : 1 − conformité)."""
    return {k: round(float(np.mean(v)) if Q[k][0] is False else 1.0 - float(np.mean(v)), 3) for k, v in av.items() if k in Q}


if __name__ == '__main__':
    MP4, TOUR, TL, OUT = sys.argv[1:5]
    TO = json.load(open(TOUR)); T = json.load(open(TL)); SH = TO['decoupage']; EMP = TO.get('empreintes', {})
    SRC = os.path.join(os.path.dirname(os.path.abspath(TOUR)), 'source')
    # la carte s'arrête sur la coupe vers le sketch suivant (tourne.rend) : les images de ce plan ne sont plus des cartes —
    # v32 : 16 images du plan d'ouverture du maquis et de la cour jugées « titre illisible » alors qu'aucun titre n'y est
    cartes = [(c['t0'] - 0.05, c['t1'] + 0.2, c.get('apres')) for c in T.get('cartes', [])]
    # film à 60 i/s (18/10/2026) : JEV juge la grille des 30 i/s (une image sur deux), comme toutes les versions précédentes —
    # mêmes questions calibrées, même nombre d'images par seconde ; FPS reste celui de cette grille
    cap = cv2.VideoCapture(MP4); images = []; PAS = max(1, int(round((cap.get(cv2.CAP_PROP_FPS) or 30) / FPS))); n_ = -1
    while True:
        ok, f = cap.read()
        if not ok: break
        n_ += 1
        if n_ % PAS == 0: images.append(f[CLIP])
    N = len(images); os.makedirs(CJ, exist_ok=True)
    plan_de = lambda t: next((i for i, s in enumerate(SH) if s[0] <= t < s[1]), len(SH) - 1 if t >= SH[-1][0] else 0)
    refs = {i: (cv2.imread(os.path.join(SRC, f'{s[0]:06.2f}.jpg')) if os.path.isfile(os.path.join(SRC, f'{s[0]:06.2f}.jpg')) else None) for i, s in enumerate(SH)}
    taches = []
    for n in range(N):
        t = n / FPS; i = plan_de(t); carte = any(a <= t < b and SH[i][2] != ap for a, b, ap in cartes); cle = EMP.get(f'{SH[i][0]:.2f}')
        taches.append({'n': n, 't': round(t, 3), 'plan': i, 'carte': carte, 'Q': CARTE if carte else N1,
                       'cache': f"{CJ}/{cle}_{n - int(round(SH[i][0] * FPS))}_{QV}_{int(carte)}.json" if cle else None})
    AV = {x['n']: json.load(open(x['cache'])) for x in taches if x['cache'] and os.path.isfile(x['cache'])}
    a_faire = [x for x in taches if x['n'] not in AV]
    pr = jev_api.prevoir([('niveau 1 (toutes les images)', len(a_faire), 1, len(N1), 0.265)])
    print(f"jev_film : {N} images, {len(AV)} reprises du cache, {len(a_faire)} à juger — niveau 1 prévu {pr['cout_usd']} $", flush=True)
    with ThreadPoolExecutor(THREADS) as ex:
        for x, r in zip(a_faire, ex.map(lambda x: demande(images[x['n']], x['Q']), a_faire)): AV[x['n']] = r
    if not jev_api.autorise() and a_faire:
        # JUGE LOCAL (18/10/2026) : un défaut réel persiste sur les images voisines d'un même plan ; JEV jugeait chaque image
        # seule et se contredisait 1 fois sur 3 sur « rendu » — médiane sur ±2 images du même plan (juge_local.lisse_plan)
        import juge_local
        loc = sorted(x['n'] for x in a_faire)
        for k in N1:
            v = [AV[n][k][0] if k in AV[n] else np.nan for n in loc]
            if any(np.isnan(v)): continue
            for n, p in zip(loc, juge_local.lisse_plan(v, [taches[n]['plan'] for n in loc])): AV[n][k] = [round(float(p), 3)]
    # niveau 2 : images suspectes (une réponse de défaut ≥ 0,4), contrôle détaillé avec l'image source, questions reposées
    def suspecte(x):
        v = verdict(AV[x['n']], {**x['Q'], **(N2 if not x['carte'] else {})})
        return any(p >= SUSPECT for p in v.values()) and not AV[x['n']].get('_niveau2')
    sus = [x for x in taches if suspecte(x)]
    def detail(x):
        Q = dict(x['Q']) if x['carte'] else {**N1, **N2}
        r = demande(images[x['n']], Q, None if x['carte'] else refs[x['plan']]); return x['n'], r
    with ThreadPoolExecutor(THREADS) as ex:
        for n, r in ex.map(detail, sus):
            for k, v in r.items(): AV[n].setdefault(k, []).extend(v)
            AV[n]['_niveau2'] = True
    # désaccord au seuil (un avis ≥ 0,5, l'autre < 0,5) : troisième avis, la moyenne tranche
    def desaccord(x):
        return any(len(v) == 2 and (v[0] >= 0.5) != (v[1] >= 0.5) for k, v in AV[x['n']].items() if not k.startswith('_'))
    tiers = [x for x in taches if desaccord(x)]
    with ThreadPoolExecutor(THREADS) as ex:
        for n, r in ex.map(detail, tiers):
            for k, v in r.items(): AV[n].setdefault(k, []).extend(v)
    for x in taches:
        if x['cache']: json.dump(AV[x['n']], open(x['cache'], 'w'))
    # synthèses : image, seconde, plan
    par_image = []
    for x in taches:
        Qx = {**x['Q'], **(N2 if not x['carte'] else {})}; v = verdict({k: a for k, a in AV[x['n']].items() if not k.startswith('_')}, Qx)
        par_image.append({'n': x['n'], 't': x['t'], 'plan': x['plan'], 'carte': x['carte'], 'avis': max(len(a) for k, a in AV[x['n']].items() if not k.startswith('_')),
                          'defauts': sorted(k for k, p in v.items() if p >= 0.5), **v})
    cles = sorted({k for r in par_image for k in r if k not in ('n', 't', 'plan', 'carte', 'avis', 'defauts')})
    pire = lambda L_, k: max((r.get(k, 0.0) for r in L_), default=0.0)
    par_seconde = [{'seconde': s, 'images': len(L_), 'images_fautives': sum(bool(r['defauts']) for r in L_), **{k: pire(L_, k) for k in cles}}
                   for s in range(math.ceil(N / FPS)) for L_ in [[r for r in par_image if s <= r['t'] < s + 1]] if L_]
    par_plan = [{'plan': f'{s[2]}/{s[3]}/{s[4]}', 'debut': s[0], 'fin': s[1], 'images': len(L_), 'images_fautives': [r['n'] for r in L_ if r['defauts']], **{k: pire(L_, k) for k in cles}}
                for i, s in enumerate(SH) for L_ in [[r for r in par_image if r['plan'] == i]] if L_]
    fautives = [r for r in par_image if r['defauts']]
    temps = lambda ks: sorted({round(r['t'], 1) for r in fautives if set(ks) & set(r['defauts'])})
    synth = {'images_jugees': N, 'images_suspectes_niveau2': len(sus), 'troisiemes_avis': len(tiers), 'images_fautives': len(fautives),
             'secondes_fautives': sorted({int(r['t']) for r in fautives}),
             'plans_fautifs': [p['plan'] + f" ({p['debut']:.1f}–{p['fin']:.1f} s, {len(p['images_fautives'])} images)" for p in par_plan if p['images_fautives']],
             'tetes_coupees': temps(['tete_coupee']), 'visages_deformes': temps(['rendu', 'deforme_vs_source']), 'artefacts': temps(['artefacts_vs_source']),
             'style_incoherent': temps(['style']), 'titres_illisibles': temps(['titre_lisible']),
             'physique': {k: temps([k]) for k in PHYS}, 'cout': jev_api.bilan()['par_outil'].get('jev_film')}
    json.dump({'synthese': synth, 'questions': {'niveau1': N1, 'niveau2': N2, 'cartes': CARTE, 'contexte': STYLE}, 'par_plan': par_plan, 'par_seconde': par_seconde,
               'par_image': par_image}, open(OUT, 'w'), ensure_ascii=False)
    if fautives:   # planche des images fautives (24 au plus, réparties sur le film)
        pick = [fautives[int(j)] for j in np.linspace(0, len(fautives) - 1, min(24, len(fautives)))]; tu = []
        for r in pick:
            im = cv2.resize(images[r['n']], (288, 230)); cv2.putText(im, f"{r['t']:.1f}s {','.join(d[:9] for d in r['defauts'][:2])}", (4, 16), 0, 0.42, (0, 255, 255), 1); tu.append(im)
        while len(tu) % 6: tu.append(np.zeros_like(tu[0]))
        cv2.imwrite(OUT.replace('.json', '_fautives.jpg'), np.vstack([np.hstack(tu[i:i + 6]) for i in range(0, len(tu), 6)]))
    print('SYNTHÈSE', json.dumps({k: v for k, v in synth.items() if k != 'cout'}, ensure_ascii=False))
    print('coût JEV (cumul de l\'outil) :', synth['cout'])
