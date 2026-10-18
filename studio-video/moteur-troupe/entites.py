# ENTITÉS VIVANTES DU DÉCOR (17/10/2026) — « l'animation de l'arrière-plan » : des poules dans la cour et sous les tables
# du maquis, qui picorent, marchent, s'arrêtent et repartent, chacune à son rythme (aucune boucle visible). Corps non
# humains de la troupe : découpe de la poule déjà reprise dans le style de la troupe (photo CC0 de l'USDA, détourage
# BiRefNet MIT, style LCM MIT : ~/.cache/massamba-assets/poule), animée en marionnette (pivot aux pattes).
#   prepare(d, img, acteurs) → <scène>/entites.json (trajets choisis sur le sol LIBRE, échelle de la perspective des acteurs)
#   etat(E, t) → pose de chaque entité à l'instant t ; dessine(can, poses, plus_loin_que=None) → incruste avec ombre de contact
# v25 (17/10/2026, « l'ombre de la poule ne devait pas passer le contrôle… JEV, un dieu qui crée ses créatures de la manière
# la plus naturelle », « pas de poule au maquis ») :
#   · une espèce ne vit que dans les lieux où on la trouve (ESPECES_LIEUX : pas de poule au maquis ni dans une chambre) ;
#   · ombre PROJETÉE de la silhouette + ombre de contact + teinte de la lumière locale (physique.py) ;
#   · la poule de chaque décor est CRÉÉE PAR JEV (genese.py) : le décor généré n'a pas d'ombres cohérentes entre elles (cour :
#     vers la droite pour Maman et Petit Mamadou, vers la gauche pour Baye), la mesure seule ne tranche pas ; direction et
#     longueur de l'ombre, force, netteté de la profondeur, rendu, teinte sont cherchés par une évolution dont l'aptitude est
#     la note de JEV contre un objectif écrit, la référence étant les poules peintes par l'artiste → <scène>/genese.json
import base64, json, math, os, uuid, urllib.request
import numpy as np, cv2
import physique, genese

DOSSIER = os.path.expanduser(os.environ.get('MASSAMBA_ASSETS', '~/.cache/massamba-assets')) + '/poule'
ASSET = DOSSIER + '/asset.png'
PIVOT = (343, 482)        # pattes de la découpe photo (pixels de l'asset)
HAUTEUR_M = 0.35          # poule adulte ; la troupe est mise à l'échelle sur les acteurs debout (1,6 m)
ESPECES_LIEUX = {'poule': ('cour', 'rue', 'village', 'ferme', 'jardin', 'marche', 'brousse')}   # où l'on croise chaque espèce
_SPRITES = {}


def permise(espece, lieu):
    return lieu is None or any(l_ in str(lieu).lower() for l_ in ESPECES_LIEUX.get(espece, ()))


def _sprite(nom='photo'):
    """découpe → (rgb float32, alpha, pivot des pattes, hauteur en px, regarde à gauche ?). « photo » : poule CC0 reprise
    dans le style de la troupe ; « peinte-1/2 » : poules peintes dans un décor de la troupe (même rendu, même lumière)."""
    if nom not in _SPRITES:
        f = ASSET if nom == 'photo' else f'{DOSSIER}/{nom}.png'
        im = cv2.imread(f, cv2.IMREAD_UNCHANGED)
        if im is None: _SPRITES[nom] = None; return None
        rgb, al = cv2.cvtColor(im[..., :3], cv2.COLOR_BGR2RGB).astype(np.float32), im[..., 3].astype(np.float32) / 255
        if nom == 'photo': piv, haut, gauche = PIVOT, PIVOT[1] - 18, True
        else:
            ys, xs = np.nonzero(al > 0.5); yb = ys.max(); bas = ys > yb - 0.06 * (yb - ys.min())
            if yb >= al.shape[0] - 2:   # CONTRÔLE (17/10) : la découpe touche le bord bas du fichier → pattes coupées, la bête
                _SPRITES[nom] = None; return None   # « flotterait » ; peinte-1 en est un cas : refusée
            piv = (float(np.median(xs[bas])), float(yb)); haut = float(yb - ys.min())
            meta = json.load(open(f'{DOSSIER}/peintes.json')) if os.path.isfile(f'{DOSSIER}/peintes.json') else {}
            gauche = meta.get(nom, {}).get('regarde', 'gauche') == 'gauche'
        _SPRITES[nom] = (rgb, al, piv, float(haut), gauche)
    return _SPRITES[nom]


def prepare(d, H, W, acteurs, n=2, graine=7, lieu=None, journal=print):
    """trajets des entités sur le sol libre (hors des acteurs), échelle tirée des acteurs debout. acteurs : [(bbox, debout)]."""
    if not permise('poule', lieu):
        journal(f'entités : pas de poule au lieu « {lieu} » (espèce hors de son milieu, consigne du 17/10)'); return []
    f = f'{d}/entites.json'
    if os.path.isfile(f): return json.load(open(f))
    if _sprite('photo') is None: return []
    deb = [b for b, debout in acteurs if debout] or [b for b, _ in acteurs]
    if not deb: return []
    pieds = float(np.median([b[3] for b in deb])); haut_px = float(np.median([b[3] - b[1] for b in deb]))
    px_m = haut_px / 1.6; horizon = pieds - 2.2 * haut_px   # perspective simple : la taille décroît vers l'horizon
    occupe = np.zeros(W, bool)
    for b, _ in acteurs: occupe[max(0, int(b[0]) - 30):min(W, int(b[2]) + 30)] = True
    zones, x = [], 0
    while x < W:   # bandes horizontales libres d'acteurs
        if not occupe[x]:
            x0 = x
            while x < W and not occupe[x]: x += 1
            if x - x0 > 0.1 * W: zones.append((x0, x))
        x += 1
    rng = np.random.default_rng(graine); E = []
    zones = sorted(zones, key=lambda z: -(z[1] - z[0]))
    prof = cv2.imread(f'{d}/profondeur.png', cv2.IMREAD_UNCHANGED)
    if prof is not None and prof.ndim == 3: prof = prof[..., 0]
    if prof is not None: prof = cv2.resize(prof.astype(np.float32), (W, H))
    places = [(z, 'devant') for z in zones] + [(z, 'fond') for z in zones]   # puis au fond (plus petite, derrière les acteurs)
    for k, ((x0, x1), ou) in enumerate(places[:n]):
        y = min(H - 12.0, pieds + 0.03 * H) if ou == 'devant' else pieds - 0.14 * H   # au sol : devant la ligne des pieds, ou au fond
        if ou == 'fond' and prof is not None: y = max(y, sol_haut(prof, x0, x1, pieds) + 0.12 * H)   # la poule entière (≈ 85 px) sur le sol, pas sur l'arête
        ech = HAUTEUR_M * px_m * (y - horizon) / (pieds - horizon) / (PIVOT[1] - 18)   # échelle rapportée à la découpe photo
        E.append({'espece': 'poule', 'x0': float(x0 + 0.15 * (x1 - x0)), 'x1': float(x1 - 0.15 * (x1 - x0)), 'y': float(y),
                  'echelle': float(ech), 'graine': int(rng.integers(1, 10 ** 6))})
    json.dump(E, open(f, 'w'), indent=1)
    return E


def sol_haut(prof, x0, x1, pieds, pas=8):
    """LOI DU SOL PRATICABLE (18/10/2026) : le bord le plus lointain du sol au-dessus de la ligne des pieds, lu dans la carte
    de profondeur (proche = clair) — le sol se rapproche régulièrement vers le bas de l'image, un mur ou une contremarche
    garde la même profondeur. v30 jugée par JEV : la poule « du fond » de la cour marchait sur l'arête de la marche au pied
    du mur (« flotte » 0,55 à 22,9 s) : la carte y montre le mur (≈ 70) jusqu'à y = 600, la marche (78–89) jusqu'à
    y ≈ 690, puis le sol (103 → 246)."""
    cols = prof[:, max(0, int(x0)):max(int(x0) + 1, int(x1))].mean(1); y = int(min(len(cols) - 1, pieds))
    while y - pas > 0 and cols[y] - cols[y - pas] > 0.35 * pas: y -= pas   # tant que la profondeur décroît vers le haut : c'est le sol
    return float(y)


def _programme(e, duree=120.0):
    """suite d'actions (marche, picore, regarde) tirée une fois pour toutes : chaque poule a son rythme, sans boucle."""
    rng = np.random.default_rng(e['graine']); t, x, sens, P = 0.0, rng.uniform(e['x0'], e['x1']), rng.choice([-1, 1]), []
    while t < duree:
        a = rng.choice(['marche', 'picore', 'regarde'], p=[0.4, 0.4, 0.2])
        if a == 'marche':
            d_ = rng.uniform(0.8, 2.2); v = rng.uniform(25, 45) * e['echelle'] * 3.0 * sens
            x1 = float(np.clip(x + v * d_, e['x0'], e['x1'])); P.append(('marche', t, t + d_, x, x1, sens)); x = x1
            if x in (e['x0'], e['x1']) or rng.random() < 0.3: sens = -sens
        elif a == 'picore':
            d_ = rng.uniform(0.9, 2.4); P.append(('picore', t, t + d_, x, x, sens))
        else:
            d_ = rng.uniform(0.6, 1.5); P.append(('regarde', t, t + d_, x, x, sens))
        t += d_
    return P


def etat(E, t):
    poses = []
    for e in E:
        if '_P' not in e: e['_P'] = _programme(e)
        a, t0, t1, xa, xb, sens = next((p for p in e['_P'] if p[1] <= t < p[2]), e['_P'][-1])
        u = (t - t0) / max(1e-3, t1 - t0); x = xa + (xb - xa) * (u * u * (3 - 2 * u)); dy = 0.0; ang = 0.0
        if a == 'marche':
            ph = 2 * math.pi * 4.2 * (t - t0); dy = -abs(math.sin(ph)) * 0.04; ang = 3.0 * math.sin(ph)   # sautillement
        elif a == 'picore':
            k = ((t - t0) * 2.6) % 1.0; ang = 26.0 * (math.sin(math.pi * min(1.0, k / 0.35)) if k < 0.35 else 0.0)   # coups de bec
        else:
            ang = -6.0 * math.sin(math.pi * u)   # relève la tête, regarde
        poses.append({'x': x, 'y': e['y'], 'echelle': e['echelle'], 'sens': sens, 'angle': ang, 'dy': dy})
    return poses


def _place(p, nom='photo'):
    """matrice de placement de la découpe `nom` pour la pose p, et hauteur de la poule en pixels (l'échelle de la pose est
    celle de la découpe photo : une autre découpe est ramenée à la même taille réelle)."""
    _, _, piv, haut, gauche = _sprite(nom); s = p['echelle'] * (PIVOT[1] - 18) / haut; h_ = haut * s
    a = math.radians(p['angle']) * (-1 if p['sens'] < 0 else 1)   # bec vers le sol, du côté où elle regarde (y vers le bas)
    sx = s * (1 if (p['sens'] < 0) == gauche else -1)   # miroir quand elle marche à l'opposé de son regard d'origine
    Mx = np.float32([[sx * math.cos(a), -s * math.sin(a), 0], [sx * math.sin(a), s * math.cos(a), 0]])
    Mx[:, 2] = np.float32([p['x'], p['y'] + p['dy'] * h_]) - Mx[:, :2] @ np.float32(piv)
    return Mx, h_


STYLE0 = {'flou': 0.0, 'stylise': 0.0, 'saturation': 1.0, 'lumiere': 1.0, 'teinte': 0.45, 'ombre': 1.0, 'sprite': 'photo'}
_STYL = {}


def _sprite_style(k, nom='photo'):
    """découpe adoucie vers le rendu « film d'animation » (filtre qui lisse en gardant les contours), mélangée à k."""
    rgb = _sprite(nom)[0]; k = round(float(k), 1)
    if k <= 0: return rgb
    if (nom, k) not in _STYL:
        u8 = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
        sm = cv2.cvtColor(cv2.edgePreservingFilter(u8, flags=cv2.RECURS_FILTER, sigma_s=40, sigma_r=0.4), cv2.COLOR_BGR2RGB).astype(np.float32)
        _STYL[(nom, k)] = rgb * (1 - k) + sm * k
    return _STYL[(nom, k)]


def dessine(can, poses, filtre=None, L=None, style=None, mesures=None):
    """incruste les entités (can : float32 RGB) : ombre projetée selon la lumière L de la scène + ombre de contact, lumière
    locale (à l'ombre si le sol l'est), teinte, netteté de la profondeur et rendu choisis par la genèse de JEV (style) ;
    filtre(pose) → bool pour un ordre de profondeur. Travail dans une fenêtre autour de chaque bête."""
    st = dict(STYLE0, **(style or {})); sp = _sprite(st['sprite']) or _sprite('photo')
    if sp is None: return can
    nom = st['sprite'] if _sprite(st['sprite']) else 'photo'
    al = sp[1]; H, W = can.shape[:2]; L = L or {'longueur': 0.0, 'diffuse': True, 'ratio': [0.6, 0.6, 0.66]}
    rgb = _sprite_style(st['stylise'], nom)
    r0 = np.asarray(L.get('ratio', [0.6, 0.6, 0.66]), np.float32); Lo = dict(L, ratio=(1 - (1 - r0) * st['ombre']).clip(0.15, 1).tolist())
    for p in poses:
        if filtre and not filtre(p): continue
        Mx, h_ = _place(p, nom)
        if st.get('enfonce', 0.0) > 0:   # pattes ANCRÉES (avis de JEV, 17/10 : « poser les pieds sur le sol », 0,68) : sur un sol de
            p = dict(p, y=p['y'] + st['enfonce'] * h_); Mx, h_ = _place(p, nom)   # terre, la patte s'enfonce un peu au lieu de l'effleurer
        k = 0.0 if L.get('diffuse') else float(L.get('longueur', 0.0)); ext = h_ * (1.3 + k)
        x0, x1, y0, y1 = int(max(0, p['x'] - ext)), int(min(W, p['x'] + ext)), int(max(0, p['y'] - ext)), int(min(H, p['y'] + ext))
        if x1 - x0 < 4 or y1 - y0 < 4: continue
        Mr = Mx.copy(); Mr[:, 2] -= np.float32([x0, y0]); w_, hh = x1 - x0, y1 - y0
        c_ = cv2.warpAffine(rgb, Mr, (w_, hh), flags=cv2.INTER_LINEAR, borderValue=0)
        a_ = cv2.warpAffine(al, Mr, (w_, hh), flags=cv2.INTER_LINEAR, borderValue=0)
        if st['flou'] > 0.05:   # même netteté que le décor à cette profondeur (flou prémultiplié : pas de liseré noir)
            s_ = st['flou'] * h_ / 110.0; ab = cv2.GaussianBlur(a_, (0, 0), s_)
            c_ = cv2.GaussianBlur(c_ * a_[..., None], (0, 0), s_) / np.maximum(ab, 1e-4)[..., None]; a_ = ab
        if abs(st['saturation'] - 1) > 0.01: g_ = c_.mean(2, keepdims=True); c_ = g_ + (c_ - g_) * st['saturation']
        c_ = c_ * st['lumiere']
        sub = can[y0:y1, x0:x1]; pied = (p['x'] - x0, p['y'] - y0)
        lum = physique.lumiere_locale(sub, a_, pied, h_, Lo)        # dans une ombre peinte, la bête est à l'ombre elle aussi
        om = physique.ombre(a_, pied, h_, Lo, hh, w_); avant = sub.mean(2) if mesures is not None else None
        physique.applique_ombre(sub, om, Lo, contact_force=st.get('contact', 0.55))
        if mesures is not None:   # contrôle : l'ombre se voit-elle ? assombrissement réel du sol sous le masque d'ombre, hors bête
            m_ = np.maximum(om[0], om[1]) * (a_ < 0.05); w8 = float(m_.sum())
            mesures.append({'x': round(float(p['x']), 1), 'y': round(float(p['y']), 1), 'h': round(float(h_), 1), 'aire_ombre': round(float((m_ > 0.2).sum()) / max(1.0, h_ * h_), 3),
                            'contraste_ombre': round(float(((1 - sub.mean(2) / np.maximum(avant, 1.0)) * m_).sum() / max(1e-6, w8)), 3) if w8 > 1 else 0.0})
        c_ = physique.teinte(np.clip(c_ * lum[None, None, :], 0, 255), a_, sub, force=st['teinte'])
        sub[:] = sub * (1 - a_[..., None]) + c_ * a_[..., None]
    return can


TYPES = [('ombre de contact seule', None, 0.0), ('vers le fond, à gauche', (-0.6, -0.8), 0.35), ('vers le fond, à droite', (0.6, -0.8), 0.35),
         ('vers la gauche', (-0.98, -0.2), 0.35), ('vers la droite', (0.98, -0.2), 0.35), ('vers l’avant, à gauche', (-0.6, 0.6), 0.3),
         ('vers l’avant, à droite', (0.6, 0.6), 0.3), ('longue, vers le fond', (0.0, -1.0), 0.55)]


OBJECTIF = ('In `image`, a chicken was added by the animators to a painted 3D animated film scene. How completely does it look like it '
            'truly belongs in this scene, as in a Pixar or Disney feature: the same soft 3D animated rendering (not a photo), the same light '
            'and colors, the same sharpness as the ground at its distance, standing firmly on the ground with a shadow consistent with the scene?')
NIVEAUX = ['obviously pasted: a photo or sticker that does not belong in the scene', 'clearly added: wrong light, sharpness, style or shadow',
           'acceptable but something is slightly off', 'well integrated: hard to tell it was added', 'perfectly part of the film, as in a Pixar feature']


def genese_poule(d, img, acteurs, E, reference=None, journal=print, generations=3):
    if reference is None and os.path.isfile(f'{DOSSIER}/reference.jpg'): reference = cv2.imread(f'{DOSSIER}/reference.jpg')
    """la poule de CE décor créée par JEV : lumière de l'ombre, force de l'ombre, netteté, rendu, teinte, cherchés par une
    évolution dont l'aptitude est la note de JEV contre OBJECTIF ; référence = les poules peintes par l'artiste d'origine.
    Cache <scène>/genese.json → {'L': lumière, 'style': réglages, 'note', 'reference'}."""
    f = f'{d}/genese.json'
    if os.path.isfile(f): return json.load(open(f))
    Lm = physique.lumiere(img, acteurs, journal)
    if not E or _sprite('photo') is None: return {'L': Lm, 'style': dict(STYLE0)}
    H, W = img.shape[:2]; p = etat(E, 3.0)[0]; wc = int(0.62 * W); hc = int(wc * 0.78)
    cx0 = int(np.clip(p['x'] - wc / 2, 0, W - wc)); cy0 = int(np.clip(p['y'] - 0.62 * hc, 0, H - hc))
    def rend(q):
        L = dict(Lm, dir=[float(np.cos(np.radians(q['angle']))), float(np.sin(np.radians(q['angle'])))], longueur=q['longueur'], diffuse=q['longueur'] < 0.03)
        can = img.astype(np.float32).copy(); dessine(can, [p], None, L, {k: q[k] for k in STYLE0})
        im = cv2.cvtColor(np.clip(can[cy0:cy0 + hc, cx0:cx0 + wc], 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
        return cv2.resize(im, (640, int(640 * hc / wc)), interpolation=cv2.INTER_AREA)
    sprites = [n_ for n_ in ('peinte-2', 'peinte-1', 'photo') if _sprite(n_) is not None]
    espace = {'angle': (-180.0, 180.0), 'longueur': (0.0, 0.7), 'ombre': (0.5, 1.4), 'flou': (0.0, 3.0), 'stylise': (0.0, 1.0),
              'saturation': (0.7, 1.2), 'lumiere': (0.8, 1.15), 'teinte': (0.1, 0.8), 'sprite': sprites}
    depart = []
    for k_, (_, dir_, lg) in enumerate(TYPES):   # chaque direction type, avec chaque découpe à tour de rôle
        a_ = float(np.degrees(np.arctan2(dir_[1], dir_[0]))) if dir_ else -90.0
        depart.append(dict(STYLE0, angle=a_, longueur=lg, flou=1.0, stylise=0.3, sprite=sprites[k_ % len(sprites)]))
    for m in Lm.get('mesures', []):
        depart.append(dict(STYLE0, angle=float(np.degrees(np.arctan2(m['dir'][1], m['dir'][0]))), longueur=float(np.clip(m['longueur'], 0.2, 0.6)), sprite=sprites[0]))
    os.makedirs(f'{d}/genese', exist_ok=True)
    meilleur, h = genese.evolue(OBJECTIF, NIVEAUX, espace, rend, depart=depart, generations=generations, enfants=6, garder=3,
                                reference=reference, journal=journal, dossier=f'{d}/genese')
    Lb = dict(Lm, dir=[float(np.cos(np.radians(meilleur['angle']))), float(np.sin(np.radians(meilleur['angle'])))], longueur=meilleur['longueur'],
              diffuse=meilleur['longueur'] < 0.03); Lb.pop('mesures', None)
    out = {'L': Lb, 'style': {k: meilleur[k] for k in STYLE0}, 'note': h['meilleure_note'], 'reference': h['reference'], 'historique': h['historique']}
    json.dump(out, open(f, 'w'), ensure_ascii=False, indent=1)
    cv2.imwrite(f'{d}/genese/meilleure.jpg', rend(meilleur))
    return out
