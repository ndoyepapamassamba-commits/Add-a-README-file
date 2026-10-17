# ÉCOLE DE JEV (17/10/2026) — consignes : « mettre JEV dans un environnement d'apprentissage, lui faire visionner des vidéos
# par milliers pour qu'il apprenne vite » ; « des batteries de test, des batteries de réponses qui vont te permettre
# d'atteindre ou de dépasser ton objectif ». JEV est un modèle hébergé : on ne change pas ses poids, on lui donne ses
# CAPACITÉS par l'expérience mesurée — exactement comme on étalonne un instrument :
#   1. corpus  : images de films d'animation de studio sous licence libre (Blender Studio, CC BY : Big Buck Bunny,
#                Caminandes, Coffee Run, Elephants Dream, Spring, Sprite Fright, Wing It!), lues EN FLUX par sauts (aucun
#                film stocké) = le « juste » ; + fenêtres de 12 images consécutives pour les normes de mouvement ;
#   2. défauts : sur ces images justes, des défauts fabriqués et ÉTIQUETÉS (créature collée sans ombre, qui flotte, à la
#                mauvaise échelle, mal éclairée ; visage tordu ; image fantôme) + la même créature posée avec notre
#                physique (ombre, lumière, teinte) pour mesurer ce que la physique apporte ;
#   3. batterie: toutes les questions des portes posées à JEV sur tout le corpus (en parallèle, il répond vite) ;
#   4. apprend : pour chaque défaut, AUC de chaque question (Mann-Whitney) et SEUIL qui ne déclenche presque jamais sur
#                les films de studio (spécificité ≥ 95 %) ; détecteur composite (régression logistique L2, validation
#                croisée 5 plis) → ecole/capacites.json, lu par les portes et la genèse ;
#   5. normes  : vitesse, accélération et part d'images figées des films de studio (flux optique) → cibles de fluidité.
#   python3 ecole_jev.py <dossier_ecole> corpus|defauts|batterie|apprend|normes|tout
import base64, glob, json, os, random, subprocess, sys, uuid, urllib.request
import numpy as np, cv2
from concurrent.futures import ThreadPoolExecutor

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
UA = 'ecole-jev/1.0 (open movies research)'
API = 'https://api.typesafe.ai/v1/systemone'


def image_a(url, t, larg=640):
    """une image du film distant à l'instant t (lecture par saut : quelques centaines de Ko au plus)."""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-user_agent', UA, '-ss', f'{t:.2f}', '-i', url, '-frames:v', '1', '-vf', f'scale={larg}:-2',
                        '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True, timeout=180)
    return cv2.imdecode(np.frombuffer(r.stdout, np.uint8), 1) if r.stdout else None


def corpus(E, pas=4.0, fenetres=12):
    F = json.load(open(f'{E}/films.json')); os.makedirs(f'{E}/ref', exist_ok=True); taches = []
    for f in F:
        if not f.get('url') or not f.get('duree'): continue
        nom = f['titre'].split(' - ')[0].split('(')[0].strip().replace(' ', '_')[:24]; d = float(f['duree'])
        for t in np.arange(8.0, 0.9 * d, pas): taches.append((nom, f['url'], float(t)))
    def un(x):
        nom, url, t = x; sortie = f'{E}/ref/{nom}_{t:07.1f}.jpg'
        if os.path.isfile(sortie): return 1
        im = image_a(url, t)
        if im is None or im.std() < 8: return 0   # écran noir, fondu : rien à apprendre
        cv2.imwrite(sortie, im, [cv2.IMWRITE_JPEG_QUALITY, 90]); return 1
    with ThreadPoolExecutor(6) as ex: n = sum(ex.map(un, taches))
    print(f'corpus : {n} images de studio ({len(taches)} demandées)')


def _colle(fond, sprite, alpha, x, y, h, flotte=0.0, teinte=None):
    """pose la découpe (pattes en (x, y), hauteur h px) ; flotte = décalage vers le haut en fraction de h."""
    ys, xs = np.nonzero(alpha > 0.5); hs = ys.max() - ys.min(); k = h / hs
    sp = cv2.resize(sprite, None, fx=k, fy=k, interpolation=cv2.INTER_AREA); al = cv2.resize(alpha, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    if teinte is not None: sp = np.clip(sp.astype(np.float32) * np.asarray(teinte, np.float32), 0, 255)
    yb = int(ys.max() * k); xm = int(np.median(xs[ys > ys.max() - 0.06 * hs]) * k)
    X0, Y0 = int(x - xm), int(y - yb - flotte * h); H, W = fond.shape[:2]
    x0, y0, x1, y1 = max(0, X0), max(0, Y0), min(W, X0 + sp.shape[1]), min(H, Y0 + sp.shape[0])
    if x1 <= x0 or y1 <= y0: return fond
    out = fond.astype(np.float32).copy(); a = al[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0, None]
    out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - a) + sp[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0].astype(np.float32) * a
    return np.clip(out, 0, 255).astype(np.uint8)


def defauts(E, n_par_type=60, graine=3):
    import entites, physique
    rng = random.Random(graine); refs = sorted(glob.glob(f'{E}/ref/*.jpg')); os.makedirs(f'{E}/defauts', exist_ok=True)
    peinte = entites._sprite('peinte-2'); photo = entites._sprite('photo')
    to_bgr = lambda s: cv2.cvtColor(np.clip(s[0], 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    types = ['colle', 'integre', 'flotte', 'echelle', 'lumiere', 'deforme', 'fantome']
    for ty in types:
        for k, f in enumerate(rng.sample(refs, min(n_par_type, len(refs)))):
            im = cv2.imread(f); H, W = im.shape[:2]; x, y = rng.uniform(0.15, 0.85) * W, rng.uniform(0.72, 0.95) * H; h = rng.uniform(0.12, 0.2) * H
            sp = peinte if rng.random() < 0.5 else photo
            if ty == 'colle': out = _colle(im, to_bgr(sp), sp[1], x, y, h)
            elif ty == 'flotte': out = _colle(im, to_bgr(sp), sp[1], x, y, h, flotte=rng.uniform(0.25, 0.5))
            elif ty == 'echelle': out = _colle(im, to_bgr(sp), sp[1], x, y, h * rng.uniform(2.6, 3.5))
            elif ty == 'lumiere': out = _colle(im, to_bgr(sp), sp[1], x, y, h, teinte=rng.choice([(1.5, 1.2, 0.8), (0.55, 0.6, 0.75), (1.4, 1.4, 1.4)]))
            elif ty == 'integre':   # la même créature, posée avec notre physique (ombre projetée + contact, lumière locale)
                can = cv2.cvtColor(im, cv2.COLOR_BGR2RGB).astype(np.float32)
                L = {'dir': [rng.choice([-0.9, 0.9]), -0.4], 'longueur': 0.4, 'ratio': [0.55, 0.55, 0.62], 'diffuse': False, 'clair': float(np.percentile(cv2.cvtColor(im, cv2.COLOR_BGR2LAB)[..., 0], 75))}
                p = {'x': x, 'y': y, 'echelle': h / (entites.PIVOT[1] - 18), 'sens': 1, 'angle': 0.0, 'dy': 0.0}
                entites.dessine(can, [p], None, L, {'sprite': 'peinte-2' if sp is peinte else 'photo'})
                out = cv2.cvtColor(np.clip(can, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
            elif ty == 'deforme':   # tourbillon sur la zone la plus « contrastée » du centre (souvent un visage, un corps)
                cx, cy, r = W * rng.uniform(0.35, 0.65), H * rng.uniform(0.3, 0.55), 0.12 * H
                yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); dx, dy = xx - cx, yy - cy; d = np.sqrt(dx * dx + dy * dy)
                a = 2.4 * np.clip(1 - d / r, 0, 1) ** 2; c, s = np.cos(a), np.sin(a)
                out = cv2.remap(im, cx + c * dx - s * dy, cy + s * dx + c * dy, cv2.INTER_LINEAR)
            else:   # fantôme : double exposition décalée (personnage dédoublé)
                M = np.float32([[1, 0, rng.uniform(14, 30)], [0, 1, rng.uniform(-6, 6)]])
                out = cv2.addWeighted(im, 0.6, cv2.warpAffine(im, M, (W, H), borderMode=cv2.BORDER_REFLECT), 0.4, 0)
            cv2.imwrite(f'{E}/defauts/{ty}_{k:03d}.jpg', out, [cv2.IMWRITE_JPEG_QUALITY, 90])
    print('défauts fabriqués :', {t: len(glob.glob(f'{E}/defauts/{t}_*.jpg')) for t in types})


def _questions():
    import jev_plans
    return {k: v for k, v in jev_plans.Q_ABS.items()}


def batterie(E, extra=()):
    """toutes les questions des portes sur tout le corpus ; réponses mises en cache (ecole/reponses.jsonl)."""
    Q = _questions(); f_rep = f'{E}/reponses.jsonl'
    faits = {json.loads(l)['image'] for l in open(f_rep)} if os.path.isfile(f_rep) else set()
    imgs = sorted(glob.glob(f'{E}/ref/*.jpg')) + sorted(glob.glob(f'{E}/defauts/*.jpg')) + [f for d in extra for f in sorted(glob.glob(f'{d}/*.jpg'))]
    imgs = [f for f in imgs if f not in faits]
    def un(f):
        im = cv2.imread(f); ref = 'frame-' + uuid.uuid4().hex[:12]
        body = {'model': 'jev-1.14.0', 'state': {'frame': ref}, 'assets': {ref: {'type': 'image', 'format': 'jpg', 'data_base64': base64.b64encode(cv2.imencode('.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 88])[1].tobytes()).decode()}}, 'questions': Q}
        for essai in range(3):
            try:
                req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
                a = json.loads(urllib.request.urlopen(req, timeout=180).read())['answers']
                return {'image': f, **{k: round(float(a[k]['noul']), 4) for k in Q}}
            except Exception: pass
        return None
    n = 0
    with ThreadPoolExecutor(8) as ex, open(f_rep, 'a') as out:
        for r in ex.map(un, imgs):
            if r: out.write(json.dumps(r) + '\n'); out.flush(); n += 1
    print(f'batterie : {n} images jugées sur {len(Q)} questions ({len(faits)} déjà en cache)')


def auc(pos, neg):
    """aire sous la courbe ROC (statistique de Mann-Whitney) : probabilité qu'un défaut soit noté au-dessus d'un juste."""
    pos, neg = np.asarray(pos), np.asarray(neg)
    if len(pos) == 0 or len(neg) == 0: return None
    r = np.argsort(np.argsort(np.r_[pos, neg])) + 1.0
    return float((r[:len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def logistique(X, y, l2=1.0, iters=400):
    X1 = np.c_[np.ones(len(X)), X]; w = np.zeros(X1.shape[1])
    for _ in range(iters):   # Newton (IRLS) avec pénalité L2
        p = 1 / (1 + np.exp(-X1 @ w)); g = X1.T @ (p - y) + l2 * np.r_[0, w[1:]]
        Hs = X1.T @ (X1 * (p * (1 - p))[:, None]) + l2 * np.diag(np.r_[0, np.ones(len(w) - 1)])
        w -= np.linalg.solve(Hs + 1e-6 * np.eye(len(w)), g)
    return w


ATTENDU = {'colle': ['ombre_manquante', 'flotte', 'lumiere_incoherente'], 'flotte': ['flotte'], 'echelle': ['echelle'],
           'lumiere': ['lumiere_incoherente'], 'deforme': ['visage_deforme', 'physique_impossible'], 'fantome': ['physique_impossible', 'visage_deforme']}


def apprend(E, specificite=0.95):
    R = [json.loads(l) for l in open(f'{E}/reponses.jsonl')]; Q = [k for k in R[0] if k != 'image']
    typ = lambda f: 'juste' if '/ref/' in f else (os.path.basename(f).split('_')[0] if '/defauts/' in f else 'film')
    G = {}
    for r in R: G.setdefault(typ(r['image']), []).append(r)
    justes = G.get('juste', []); cap = {'images': {k: len(v) for k, v in G.items()}, 'questions': {}, 'defauts': {}}
    for q in Q:
        v = np.array([r[q] for r in justes]); seuil = float(np.quantile(v, specificite)) if len(v) else 0.5
        cap['questions'][q] = {'seuil_appris': round(max(0.5, seuil), 3), 'quantile95_studio': round(seuil, 3), 'moyenne_studio': round(float(v.mean()), 3) if len(v) else None}
    for d, qs in ATTENDU.items():
        if d not in G: continue
        res = {}
        for q in Q:
            a = auc([r[q] for r in G[d]], [r[q] for r in justes]); s = cap['questions'][q]['seuil_appris']
            res[q] = {'auc': None if a is None else round(a, 3), 'rappel_au_seuil': round(float(np.mean([r[q] >= s for r in G[d]])), 3)}
        best = max(res, key=lambda q: res[q]['auc'] or 0)
        cap['defauts'][d] = {'question_attendue': qs, 'meilleure_question': best, 'detail': res}
    # détecteur composite « un défaut ajouté » : régression logistique sur toutes les réponses, validation croisée 5 plis
    D = [r for d in ATTENDU for r in G.get(d, [])]
    if justes and D:
        X = np.array([[r[q] for q in Q] for r in justes + D]); y = np.r_[np.zeros(len(justes)), np.ones(len(D))]
        idx = np.random.default_rng(0).permutation(len(y)); plis = np.array_split(idx, 5); sc = np.zeros(len(y))
        for k in range(5):
            te = plis[k]; tr = np.concatenate([plis[j] for j in range(5) if j != k]); w = logistique(X[tr], y[tr])
            sc[te] = 1 / (1 + np.exp(-(np.c_[np.ones(len(te)), X[te]] @ w)))
        w = logistique(X, y)
        cap['composite'] = {'questions': Q, 'poids': [round(float(x), 4) for x in w], 'auc_validation_croisee': round(auc(sc[y == 1], sc[y == 0]), 3),
                            'seuil': round(float(np.quantile(sc[y == 0], specificite)), 3)}
    if 'integre' in G and 'colle' in G:   # ce que notre physique apporte : défaut perçu, créature collée vs posée avec la physique
        cap['physique_apport'] = {q: {'colle': round(float(np.mean([r[q] for r in G['colle']])), 3), 'integre': round(float(np.mean([r[q] for r in G['integre']])), 3),
                                      'studio': cap['questions'][q]['moyenne_studio']} for q in ('ombre_manquante', 'flotte', 'lumiere_incoherente', 'style_coherent')}
    json.dump(cap, open(f'{E}/capacites.json', 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({k: cap[k] for k in ('images', 'composite', 'physique_apport') if k in cap}, ensure_ascii=False, indent=1))
    for d, v in cap['defauts'].items(): print(f"  {d:8s} meilleure question {v['meilleure_question']:20s} AUC {v['detail'][v['meilleure_question']]['auc']}  rappel {v['detail'][v['meilleure_question']]['rappel_au_seuil']}")


def normes(E, par_film=16, n=12):
    """mouvement des films de studio : vitesse (px/image, image de 320 px) et accélération médianes et au 99e centile,
    part d'images quasi figées — par fenêtres de 12 images consécutives tirées au hasard."""
    F = [f for f in json.load(open(f'{E}/films.json')) if f.get('url') and f.get('duree')]; rng = np.random.default_rng(5); taches = []
    for f in F:
        for t in rng.uniform(10, 0.88 * float(f['duree']), par_film): taches.append((f['url'], float(t)))
    def un(x):
        url, t = x
        r = subprocess.run(['ffmpeg', '-v', 'error', '-user_agent', UA, '-ss', f'{t:.2f}', '-i', url, '-frames:v', str(n), '-vf', 'scale=320:180,fps=24',
                            '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True, timeout=240)
        b = np.frombuffer(r.stdout, np.uint8)
        if len(b) < 320 * 180 * 4: return None
        Fr = b[:len(b) // (320 * 180) * 320 * 180].reshape(-1, 180, 320)
        dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_FAST); v = [dis.calc(Fr[i], Fr[i + 1], None) for i in range(len(Fr) - 1)]
        mag = [float(np.median(np.hypot(f_[..., 0], f_[..., 1]))) for f_ in v]
        acc = [float(np.median(np.hypot(*(v[i + 1] - v[i]).transpose(2, 0, 1)))) for i in range(len(v) - 1)]
        return {'vitesse': mag, 'acceleration': acc}
    with ThreadPoolExecutor(4) as ex: R = [r for r in ex.map(un, taches) if r]
    V = np.concatenate([r['vitesse'] for r in R]); A = np.concatenate([r['acceleration'] for r in R])
    N = {'fenetres': len(R), 'vitesse_mediane': round(float(np.median(V)), 3), 'vitesse_p95': round(float(np.percentile(V, 95)), 3),
         'acceleration_mediane': round(float(np.median(A)), 3), 'acceleration_p99': round(float(np.percentile(A, 99)), 3),
         'part_figee': round(float(np.mean(V < 0.05)), 3), 'unite': 'pixels par image, image de 320 × 180 à 24 i/s'}
    json.dump(N, open(f'{E}/normes_mouvement.json', 'w'), ensure_ascii=False, indent=1); print(N)


if __name__ == '__main__':
    E, etape = sys.argv[1], sys.argv[2]
    if etape in ('corpus', 'tout'): corpus(E)
    if etape in ('defauts', 'tout'): defauts(E)
    if etape in ('batterie', 'tout'): batterie(E, extra=sys.argv[3:])
    if etape in ('apprend', 'tout'): apprend(E)
    if etape in ('normes', 'tout'): normes(E)
