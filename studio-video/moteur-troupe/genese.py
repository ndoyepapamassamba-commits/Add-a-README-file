# GENÈSE — JEV CRÉATEUR (17/10/2026). Consignes : « faire de JEV un dieu qui crée ses créatures de la manière la plus
# naturelle » ; « s'il est le juge suprême, il doit être capable de créer en fonction d'un objectif bien défini, dépasser
# Pixar et Disney » ; « tu as carte blanche pour être Dieu ».
# JEV ne dessine pas : il DIRIGE la création, comme un réalisateur qui choisit les prises. Le moteur propose des variantes
# physiquement valides (paramètres d'un rendu), JEV note chacune contre un OBJECTIF ÉCRIT (Score à cinq niveaux) et désigne
# la meilleure du lot (Choice) ; les meilleures sont gardées et mutées — stratégie d'évolution (μ + λ) (Rechenberg 1973,
# Schwefel 1977) dont la fonction d'aptitude est l'œil de JEV — jusqu'à égaler la RÉFÉRENCE (la même chose faite par
# l'artiste d'origine, notée par la même question) ou épuiser le budget. Chaque lot réévalue les parents avec les enfants :
# les notes d'un même lot sont comparables (JEV varie de ±0,05 d'une requête à l'autre).
#   evolue(objectif, niveaux, espace, rend, ...) → (meilleurs paramètres, historique)
import base64, json, uuid, urllib.request
import numpy as np, cv2

API = 'https://api.typesafe.ai/v1/systemone'


def _b64(im_bgr):
    return base64.b64encode(cv2.imencode('.jpg', im_bgr, [cv2.IMWRITE_JPEG_QUALITY, 90])[1].tobytes()).decode()


def juge_lot(objectif, niveaux, images, reference=None, timeout=240):
    """note de chaque image (0..len(niveaux)-1) contre l'objectif + probabilité d'être la meilleure du lot ; et la note de la
    référence si elle est donnée (même question). images : liste d'images BGR."""
    ids, assets, Q = {}, {}, {}
    for k, im in enumerate(images + ([reference] if reference is not None else [])):
        c = f'R' if (reference is not None and k == len(images)) else f'{k + 1}'
        ids[c] = f'img_{c}-{uuid.uuid4().hex[:8]}'; assets[ids[c]] = {'type': 'image', 'format': 'jpg', 'data_base64': _b64(im)}
        Q[f'note_{c}'] = {'type': 'score', 'instructions': objectif.replace('`image`', f'`{c}`'), 'criteria': niveaux}
    crit = {f'{k + 1}': f'image `{k + 1}`' for k in range(len(images))}
    if len(images) > 1:
        Q['meilleure'] = {'type': 'choice', 'instructions': 'Images 1, 2, 3… are variants of the same shot. Which one best achieves this goal: '
                          + objectif.replace('`image`', 'the image'), 'criteria': crit}
    body = {'model': 'jev-1.14.0', 'state': ids, 'assets': assets, 'questions': Q}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
    a = json.loads(urllib.request.urlopen(req, timeout=timeout).read())['answers']
    notes = [float(a[f'note_{k + 1}']['score']) for k in range(len(images))]
    choix = [float(a['meilleure']['probabilities'].get(f'{k + 1}', 0.0)) for k in range(len(images))] if len(images) > 1 else [1.0]
    ref = float(a['note_R']['score']) if reference is not None else None
    return notes, choix, ref


def _tire(espace, rng, base=None, sigma=0.0):
    p = {}
    for k, v in espace.items():
        if isinstance(v, list):   # discret
            p[k] = (base[k] if base is not None and rng.random() > 0.3 else v[int(rng.integers(len(v)))])
        else:
            lo, hi = v
            x = (base[k] + rng.normal(0, sigma * (hi - lo))) if base is not None else rng.uniform(lo, hi)
            p[k] = float(np.clip(x, lo, hi))
    return p


def evolue(objectif, niveaux, espace, rend, depart=(), generations=3, enfants=6, garder=2, graine=0, reference=None,
           cible=None, journal=print, dossier=None):
    """espace : {nom: (min, max) | [choix…]} ; rend(params) → image BGR ; depart : paramètres proposés d'emblée (génération 0,
    avec quelques tirages au hasard). Aptitude = note / (niveaux − 1) + 0,5 × probabilité d'être la meilleure du lot."""
    rng = np.random.default_rng(graine); top = len(niveaux) - 1
    lot = [dict(p) for p in depart] + [_tire(espace, rng) for _ in range(max(0, enfants + garder - len(depart)))]
    histo, parents, ref_note = [], [], None
    for g in range(generations + 1):
        ims = [rend(p) for p in lot]
        if dossier:
            for k, im in enumerate(ims): cv2.imwrite(f'{dossier}/g{g}_{k + 1}.jpg', im)
        notes, choix, rn = juge_lot(objectif, niveaux, ims, reference if g == 0 else None)
        if rn is not None: ref_note = rn
        apt = [n / top + 0.5 * c for n, c in zip(notes, choix)]
        res = sorted(zip(apt, notes, choix, lot), key=lambda x: -x[0])
        histo.append([{'aptitude': round(a_, 3), 'note': round(n_, 3), 'choix': round(c_, 3), 'params': p_} for a_, n_, c_, p_ in res])
        journal(f'genèse g{g} : meilleure note {res[0][1]:.2f}/{top} (choix {res[0][2]:.2f})' + (f', référence {ref_note:.2f}' if ref_note is not None else ''))
        parents = [r[3] for r in res[:garder]]
        if cible is not None and res[0][1] >= cible: break
        if ref_note is not None and res[0][1] >= ref_note + 0.05 and g >= 1: break
        if g == generations: break
        sig = 0.25 * (0.6 ** g)
        lot = parents + [_tire(espace, rng, parents[k % garder], sig) for k in range(enfants)]
    tous = [c for lot_ in histo for c in lot_]   # la meilleure de TOUTE la genèse (la note est absolue ; le choix départage)
    tous = sorted(tous, key=lambda c: (c['note'], c['aptitude']), reverse=True)
    # CONFIRMATION : la plus haute de ~40 notes bruitées est flattée (malédiction du vainqueur) ; les trois meilleures et la
    # référence sont rejugées deux fois dans des lots neufs, la décision se prend sur la moyenne
    fin, vus = [], set()
    for c in tous:
        k_ = json.dumps(c['params'], sort_keys=True)
        if k_ not in vus: vus.add(k_); fin.append(c)
        if len(fin) == 3: break
    ims = [rend(c['params']) for c in fin]; R = [juge_lot(objectif, niveaux, ims, reference) for _ in range(2)]
    moy = [float(np.mean([r[0][i] for r in R])) for i in range(len(fin))]
    refs = [r[2] for r in R if r[2] is not None]; ref_c = float(np.mean(refs)) if refs else ref_note
    i = int(np.argmax(moy)); best = fin[i]
    journal(f"genèse confirmée : {moy[i]:.2f}/{top} (rejugée 2 fois) contre référence {ref_c if ref_c is None else round(ref_c, 2)}")
    return best['params'], {'historique': histo, 'reference': ref_c, 'meilleure_note': round(moy[i], 3),
                            'confirmation': [{'params': c['params'], 'note_genese': c['note'], 'note_confirmee': round(m, 3)} for c, m in zip(fin, moy)]}


def juge_noul(questions, images, outil='genese_stricte'):
    """questions : {nom: (gabarit avec {c}, attendu True/False)} ; images : {clé: image BGR}. → {clé: {nom: probabilité
    alignée sur l'attendu (1 = conforme)}} en une requête (registre des coûts : jev_api)."""
    import jev_api
    ids, assets, Q = {}, {}, {}
    for c, im in images.items():
        ids[c] = f'{c}-{uuid.uuid4().hex[:6]}'; assets[ids[c]] = {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(im)}
        for q, (g, _) in questions.items(): Q[f'{q}__{c}'] = {'type': 'noul', 'instructions': g.format(c=c)}
    a = jev_api.demande(ids, Q, assets, outil=outil)
    return {c: {q: (float(a[f'{q}__{c}']['noul']) if att else 1.0 - float(a[f'{q}__{c}']['noul'])) for q, (_, att) in questions.items()} for c in images}


def evolue_strict(questions, espace, rend, depart=(), generations=5, enfants=6, garder=2, graine=0, journal=print, dossier=None):
    """GENÈSE SANS TOLÉRANCE (consigne du 17/10/2026 : « tout doit coller à 100 % selon le jugement de JEV »). rend(params)
    → liste de vues BGR ; chaque vue reçoit toutes les questions (Noul) ; l'aptitude d'une variante est sa PIRE réponse
    alignée (toutes les décisions de JEV doivent être « conforme » : > 0,5), la moyenne départage. Arrêt dès qu'une variante
    est conforme partout ; confirmation : les trois meilleures rejugées deux fois, décision sur la pire réponse des deux."""
    rng = np.random.default_rng(graine)
    lot = [dict(p) for p in depart] + [_tire(espace, rng) for _ in range(max(0, enfants + garder - len(depart)))]
    histo = []
    def note(lot_):
        from concurrent.futures import ThreadPoolExecutor
        par = [{f'v{i}_{j}': v for j, v in enumerate(rend(p))} for i, p in enumerate(lot_)]   # une requête par variante (contexte 64 k)
        with ThreadPoolExecutor(8) as ex: R = {k: v for r_ in ex.map(lambda vues: juge_noul(questions, vues), par) for k, v in r_.items()}
        res = []
        for i, p in enumerate(lot_):
            al = [x for c, d_ in R.items() if c.startswith(f'v{i}_') for x in d_.values()]
            res.append({'pire': round(min(al), 3), 'moyenne': round(float(np.mean(al)), 3), 'params': p,
                        'detail': {c: {q: round(x, 2) for q, x in d_.items()} for c, d_ in R.items() if c.startswith(f'v{i}_')}})
        return sorted(res, key=lambda r: (-r['pire'], -r['moyenne']))
    for g in range(generations + 1):
        res = note(lot); histo.append(res)
        if dossier:
            for i, v in enumerate(rend(res[0]['params'])): cv2.imwrite(f'{dossier}/strict_g{g}_{i}.jpg', v)
        journal(f"genèse stricte g{g} : pire réponse {res[0]['pire']:.2f} (moyenne {res[0]['moyenne']:.2f})")
        if res[0]['pire'] > 0.5 or g == generations: break
        parents = [r['params'] for r in res[:garder]]; sig = 0.3 * (0.65 ** g)
        lot = parents + [_tire(espace, rng, parents[k % garder], sig) for k in range(enfants)]
    tous, vus = sorted([r for h in histo for r in h], key=lambda r: (-r['pire'], -r['moyenne'])), set(); fin = []
    for r in tous:
        k_ = json.dumps(r['params'], sort_keys=True)
        if k_ not in vus: vus.add(k_); fin.append(r)
        if len(fin) == 3: break
    conf = [note([r['params'] for r in fin]) for _ in range(2)]
    pire = {json.dumps(r['params'], sort_keys=True): [] for r in fin}
    for c_ in conf:
        for r in c_: pire[json.dumps(r['params'], sort_keys=True)].append(r['pire'])
    best = max(fin, key=lambda r: min(pire[json.dumps(r['params'], sort_keys=True)]))
    p_conf = min(pire[json.dumps(best['params'], sort_keys=True)])
    journal(f"genèse stricte confirmée : pire réponse {p_conf:.2f} sur deux rejugements → {'CONFORME' if p_conf > 0.5 else 'NON CONFORME'}")
    return best['params'], {'pire_confirmee': p_conf, 'conforme': p_conf > 0.5, 'historique': histo,
                            'confirmation': [{'params': r['params'], 'pires': pire[json.dumps(r['params'], sort_keys=True)]} for r in fin]}
