# TEST 7 — ŒIL DE JEV SUR LE FILM LIVRÉ, plan par plan (v2, 17/10/2026).
# v1 jugeait UNE image au milieu du plan avec des questions absolues : JEV trouvait « déformés » (0,5 à 0,65) des visages
# de dessin animé que l'animation n'avait pas touchés (nez et cous de Pixar), et lisait un corps sans tête au bord du
# cadre comme une « tête coupée ». v2 :
#   1. trois images par plan (30, 50, 70 % de sa durée), note du plan = médiane des trois ;
#   2. la DÉFORMATION est jugée PAR RAPPORT À L'IMAGE SOURCE du plan (le dessin d'origine au même cadre, écrit par
#      tourne.py dans <tournage>/source/) : seul compte ce que l'animation a abîmé ;
#   3. tête coupée = une partie du visage dedans et une partie dehors ; une tête entièrement hors champ ne compte pas.
# python3 jev_plans.py film.mp4 <tournage>/tournage.json <tournage>/jev_plans.json
import base64, io, json, os, sys, uuid, urllib.request, cv2, numpy as np
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
API = 'https://api.typesafe.ai/v1/systemone'
CLIP = slice(282, 742)
ANIME = ('`reference` is the original still of this scene. `frame` is a later moment of the same scene, animated: the camera '
         'may be closer, and the characters may turn their head, talk, blink or change expression — all of that is normal. ')
Q_ABS = {
    'tete_coupee': {'type': 'noul', 'instructions': 'In `frame`, is a person\'s face or head only PARTLY visible because the image border cuts '
                    'through it (some of the face or skull inside the picture, some outside)? A person whose head is entirely outside the '
                    'picture, with only the body visible, does NOT count; a head fully inside the picture does not count either.'},
    'visage_deforme': {'type': 'noul', 'instructions': 'In `frame`, does any face look deformed, melted, stretched, warped or anatomically wrong?'},
    'style_coherent': {'type': 'noul', 'instructions': '`frame` looks like a clean still from a 3D animated feature film, with the characters in the same style and lighting as the background.'},
}
PHYSIQUE = {   # porte K « physique et nature » (17/10/2026) — chaque question décrit un DÉFAUT ; jugée aussi sur la source
    'flotte': 'In `frame`, does any person, animal or object look like it floats above the ground or is pasted onto the picture, instead of standing on it?',
    'ombre_manquante': 'In `frame`, is there a person, animal or object standing on sunlit ground with no shadow where one should be, or with a shadow pointing in a clearly different direction than the other shadows?',
    'echelle': 'In `frame`, is any animal or object clearly the wrong size for its distance, compared with the people and the place?',
    'lumiere_incoherente': 'In `frame`, is any person, animal or object lit differently from the rest of the scene (wrong light direction, color, brightness or sharpness), as if it came from another picture?',
    'hors_contexte': 'In `frame`, is there something that does not belong in this place, such as a farm animal inside a restaurant, a bar or a bedroom?',
    'physique_impossible': 'In `frame`, does anything break the laws of physics: bodies passing through objects or each other, an impossibly bent limb, an object hanging in the air without support?',
}
Q_ABS.update({k: {'type': 'noul', 'instructions': v} for k, v in PHYSIQUE.items()})
Q_REF = {
    'deforme_vs_source': {'type': 'noul', 'instructions': ANIME + 'Is any face in `frame` damaged in a way the same face in `reference` is not: '
                          'melted, smeared, stretched, doubled, torn, or with misplaced eyes or mouth?'},
    'artefacts_vs_source': {'type': 'noul', 'instructions': ANIME + 'Does `frame` show rendering damage on the people that `reference` does not '
                            'have: smears, ghost duplicates, broken or bent limbs, torn clothes, blurred patches or visible seams?'},
}


def jpeg(im_bgr):
    b = io.BytesIO(); Image.fromarray(cv2.cvtColor(im_bgr, cv2.COLOR_BGR2RGB)).save(b, 'JPEG', quality=90)
    return base64.b64encode(b.getvalue()).decode()


def demande_source(ref):
    """la batterie physique sur l'image source seule (le tableau d'origine) : dit si un défaut est DÉJÀ dans la peinture
    (à corriger aussi : aucune tolérance, consigne du 17/10)."""
    import jev_api
    rf = 'frame-' + uuid.uuid4().hex[:12]
    a = jev_api.demande({'frame': rf}, {k: {'type': 'noul', 'instructions': v} for k, v in PHYSIQUE.items()},
                        {rf: {'type': 'image', 'format': 'jpg', 'data_base64': jpeg(ref)}}, outil='jev_plans_source')
    return {k: float(a[k]['noul']) for k in PHYSIQUE}


def demande(frame, ref):
    import jev_api
    fr = 'frame-' + uuid.uuid4().hex[:12]; state = {'frame': fr}; assets = {fr: {'type': 'image', 'format': 'jpg', 'data_base64': jpeg(frame)}}
    Q = dict(Q_ABS)
    if ref is not None:
        rf = 'reference-' + uuid.uuid4().hex[:12]; state['reference'] = rf
        assets[rf] = {'type': 'image', 'format': 'jpg', 'data_base64': jpeg(ref)}; Q.update(Q_REF)
    a = jev_api.demande(state, Q, assets, outil='jev_plans')
    return {k: float(a[k]['noul']) for k in Q}


if __name__ == '__main__':
    MP4, SHOTS, OUT = sys.argv[1:4]
    SH = json.load(open(SHOTS))['decoupage']; SRC = os.path.join(os.path.dirname(os.path.abspath(SHOTS)), 'source')
    cap = cv2.VideoCapture(MP4); NF = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    taches = []
    for i, s in enumerate(SH):
        d = s[1] - s[0]; ts = [min(s[1] - 0.15, max(s[0] + 0.15, s[0] + p * d)) for p in (0.3, 0.5, 0.7)]
        f_src = os.path.join(SRC, f'{s[0]:06.2f}.jpg'); ref = cv2.imread(f_src) if os.path.isfile(f_src) else None
        for t in ts:
            cap.set(cv2.CAP_PROP_POS_FRAMES, min(NF - 1, int(round(t * 30)))); ok, f = cap.read()
            if ok: taches.append((i, round(t, 2), f[CLIP], ref))
    # CACHE PAR PLAN (17/10/2026) : un plan dont l'empreinte de tournage n'a pas changé (mêmes images) garde les réponses de
    # JEV déjà obtenues (mêmes questions) : même verdict, 0 jeton ; seuls les plans retournés sont rejugés
    import hashlib
    EMP = json.load(open(SHOTS)).get('empreintes', {}); CJ = os.path.expanduser('~/.cache/massamba-jev/plans'); os.makedirs(CJ, exist_ok=True)
    QV = hashlib.sha1(json.dumps([Q_ABS, Q_REF, PHYSIQUE, (0.3, 0.5, 0.7)], sort_keys=True).encode()).hexdigest()[:12]
    fic = lambda i: f"{CJ}/{EMP[f'{SH[i][0]:.2f}']}_{QV}.json" if f'{SH[i][0]:.2f}' in EMP else None
    connus = {i: json.load(open(fic(i))) for i in range(len(SH)) if fic(i) and os.path.isfile(fic(i))}
    a_faire = [x for x in taches if x[0] not in connus]
    with ThreadPoolExecutor(8) as ex:
        reps_n = list(ex.map(lambda x: demande(x[2], x[3]), a_faire))
        refs_i = sorted({i for (i, _, _, ref) in a_faire if ref is not None})
        srcs = dict(zip(refs_i, ex.map(lambda i: demande_source(next(x[3] for x in a_faire if x[0] == i)), refs_i)))
    neuf = iter(reps_n); reps = []
    for x in taches:
        if x[0] in connus: reps.append(connus[x[0]]['reponses'][[round(t, 2) for t in connus[x[0]]['t']].index(x[1])] if x[1] in [round(t, 2) for t in connus[x[0]]['t']] else connus[x[0]]['reponses'][0])
        else: reps.append(next(neuf))
    for i, c_ in connus.items():
        if c_.get('source') is not None: srcs[i] = c_['source']
    for i in {x[0] for x in a_faire}:   # rangement des réponses neuves
        if fic(i):
            R_ = [(x[1], r) for x, r in zip(taches, reps) if x[0] == i]
            json.dump({'t': [t for t, _ in R_], 'reponses': [r for _, r in R_], 'source': srcs.get(i)}, open(fic(i), 'w'))
    print(f'jev_plans : {len(connus)} plans repris du cache, {len({x[0] for x in a_faire})} jugés', flush=True)
    res = []
    for i, s in enumerate(SH):
        R = [(t, r, f) for (j, t, f, _), r in zip(taches, reps) if j == i]
        if not R: continue
        # AUCUNE TOLÉRANCE (consigne du 17/10/2026) : la PIRE des images du plan compte (défaut : maximum ; conformité de
        # style : minimum), plus de médiane qui cache une image ratée
        med = {k: round(float((np.min if k == 'style_coherent' else np.max)([r[k] for _, r, _ in R])), 2) for k in R[0][1]}
        res.append({'t': round((s[0] + s[1]) / 2, 2), 'debut': s[0], 'plan': f'{s[2]}/{s[3]}/{s[4]}', 'images': [t for t, _, _ in R], **med,
                    'source': os.path.isfile(os.path.join(SRC, f'{s[0]:06.2f}.jpg')), 'physique_source': {k: round(v, 2) for k, v in srcs.get(i, {}).items()}})
        print(res[-1], flush=True)
        cv2.imwrite(OUT.replace('.json', f'_{len(res):02d}.jpg'), R[len(R) // 2][2])
    bad = lambda k, thr=0.5: [r['t'] for r in res if r.get(k, 0) >= thr]
    synth = {'plans_juges': len(res), 'images_jugees': len(reps), 'tetes_coupees': bad('tete_coupee'),
             # déformé = abîmé PAR L'ANIMATION (comparaison à la source) ; sans source, l'ancienne question absolue
             # visage déformé : par rapport à la source ET dans l'absolu (aucune tolérance : les deux décisions doivent être « non »)
             'visages_deformes': [r['t'] for r in res if max(r.get('deforme_vs_source', 0.0), r['visage_deforme']) >= 0.5],
             'artefacts': [r['t'] for r in res if r.get('artefacts_vs_source', 0) >= 0.5],
             'style_incoherent': [r['t'] for r in res if r['style_coherent'] <= 0.5],
             # physique SANS TOLÉRANCE : défaut dès que JEV y croit (≥ 0,5) sur une image, que la peinture d'origine l'ait déjà
             # ou non (si elle l'a, la plaque doit être corrigée aussi) ; la source est gardée pour le diagnostic
             'physique': {k: [r['t'] for r in res if r.get(k, 0) >= 0.5] for k in PHYSIQUE},
             'physique_deja_dans_la_source': {k: [r['t'] for r in res if r.get('physique_source', {}).get(k, 0.0) >= 0.5] for k in PHYSIQUE},
             'visages_deformes_absolus': bad('visage_deforme')}
    json.dump({'synthese': synth, 'plans': res}, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print('SYNTHÈSE', json.dumps(synth, ensure_ascii=False))
