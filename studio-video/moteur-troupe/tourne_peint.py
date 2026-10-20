# TOURNAGE DES MARIONNETTES PEINTES (20/10/2026, « comme la version précédente mais plus propre et animables » ; « les 3 scènes
# qu'on travaillait, il faut commencer par ça : le maquis, la cour et le loyer »). Même entrée que tourne.py (timeline.json et
# histoire.json de l'épisode, voix, visèmes Rhubarb), même sortie (D/clip/f%05d.jpg 576 × 460 + D/tournage.json) : compose.py,
# planche_repliques.py, l'export et le juge unique ne changent pas. Ici, RIEN N'EST DÉFORMÉ :
#   · décor : la plaque PEINTE du lieu écrit dans l'histoire (bibliothèque decors-peints/<lieu> : plaque vide, pixels par mètre,
#     ligne de sol), sans reste d'anciens acteurs ;
#   · personnages : les poses de leur planche (marionnette_peinte.py), à leur taille de la bible, pieds sur le sol, placés du
#     côté d'où leur visage peint regarde le partenaire (le miroir n'est qu'un dernier recours) ;
#   · jeu : pose choisie par l'émotion de la réplique, bouche repeinte au visème, clignements (dont un à chaque changement de
#     pose, qui cache la coupe comme chez les animateurs), souffle et balancement rigides, accent du buste sur l'énergie de la voix ;
#   · lumière : couleurs de chaque personnage accordées au décor autour de ses pieds, ombre de contact au sol ;
#   · caméra : découpage au rythme mesuré sur vos TikTok (tourne_marionnettes.decoupage), rendu directement dans le cadre.
# python3 tourne_peint.py DOSSIER_SORTIE   (dans le dossier de l'épisode)
import json, math, os, re, sys, time, unicodedata
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import marionnette_peinte as MP
from tourne_marionnettes import decoupage, lisse

FPS = 30
CW, CH = int(os.environ.get('TOURNE_CW', 576)), int(os.environ.get('TOURNE_CH', 460))   # images clés de la chaîne générative : 1056 × 864
ASP = CW / CH
DECORS = os.environ.get('DECORS_PEINTS', os.path.join(os.environ.get('MASSAMBA_BIBLIO', '.'), 'decors-peints'))
POSE_JEU = {'accuse': 'accuse', 'colere': 'accuse', 'mecontent': 'accuse', 'frustration': 'accuse', 'soupcon': 'accuse',
            'surprise': 'choc', 'peur': 'choc', 'panique': 'choc', 'choc': 'choc',
            'haussement': 'haussement', 'innocent': 'haussement', 'frime': 'haussement', 'malice': 'haussement', 'joie': 'haussement',
            'camera': 'haussement', 'emu': 'neutre', 'rire': 'rire'}
TEXTE_PEINT = {'petit-mamadou'}   # maillot « 10 » : jamais en miroir
AVANCE_BOUCHE = float(os.environ.get('AVANCE_BOUCHE', 2 / 30))   # la bouche précède le son de 2 images (règle des animateurs ; juge A de m3 : bouche 100 ms en retard)


def slug(nom):
    s = unicodedata.normalize('NFD', nom.lower()); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', s.replace('œ', 'oe')).strip('-')


def decor(lieu):
    d = f'{DECORS}/{slug(lieu)}'; J = json.load(open(f'{d}/decor.json'))
    J['img'] = cv2.cvtColor(cv2.imread(f"{d}/{J.get('plaque', 'plaque.png')}"), cv2.COLOR_BGR2RGB); return J


# ── caméra (coordonnées de la plaque) ─────────────────────────────────────────────────────────────────────────────
def borne(c, W, H):
    cx, cy, w, h = c; k = min(1.0, W / w, H / h); w, h = w * k, h * k
    return (min(max(cx, w / 2), W - w / 2), min(max(cy, h / 2), H - h / 2), w, h)


def cadre(kind, who, G, W, H, ex=None):
    if kind == 'large' or not who:
        h = min(H, W / ASP); return (W / 2, H - h / 2, h * ASP, h)
    if kind in ('duo', 'ouvre'):
        gs = [G[n] for n in (who if isinstance(who, list) else [who]) if n in G]
        # largeur : silhouettes ENTIÈRES (ep01 p5, 12 s : Koffi en pose de choc à moitié hors du plan à deux, le cadre ne
        # tenait que les têtes ± ½ tête) ; ÷ 0,95 : la poussée de caméra (−5 % en fin de plan) ne doit couper personne
        x0 = min(min(g['tete_box'][0] - g['hh'] * 0.5, g['corps'][0]) for g in gs); x1 = max(max(g['tete_box'][2] + g['hh'] * 0.5, g['corps'][2]) for g in gs)
        top = min(g['tete_box'][1] - g['hh'] * 0.22 for g in gs); bas = max(g['sol'] - g['H'] * 0.42 for g in gs)
        h = max(bas - top, (x1 - x0) / ASP / 0.95); return borne(((x0 + x1) / 2, top + h / 2, h * ASP, h), W, H)
    g = G[who]; hh = g['hh']; h = {'moyen': 3.0, 'serre': 2.2, 'gros': 1.55}[kind] * hh; w = h * ASP; tb = g['tete_box']   # hh : coiffure comprise
    cx = (tb[0] + tb[2]) / 2 + g['face'] * w * 0.12; cy = tb[1] - {'moyen': 0.25, 'serre': 0.18, 'gros': 0.10}[kind] * hh + h / 2
    return sans_bout(borne((cx, cy, w, h), W, H), who, G, W, H, ex)


def _coupe(c, who, G, ex=None):
    """voisins dont un BOUT est dans le cadre c (corps qui touche le cadre, tête pas entière dedans)."""
    cx, cy, w, h = c; X0, X1, Y0, Y1 = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2; r = []
    for o, g in G.items():
        # silhouettes des poses que le voisin prend PENDANT le plan (p7 : bras du haussement de Modou à 64,8 s), sinon sa pose
        # de repos (p6 : l'union de TOUTES ses poses, bras tendu d'« accuse » compris, bloquait le cadre à 40,4 s)
        b, ot = (ex or {}).get(o) or g.get('corps_neutre', g['corps']), g['tete_box']
        if o == who or b[2] <= X0 or b[0] >= X1 or b[3] <= Y0 or b[1] >= Y1: continue
        if not (ot[0] >= X0 and ot[2] <= X1 and ot[1] >= Y0 and ot[3] <= Y1): r.append(o)
    return r


def sans_bout(c, who, G, W, H, ex=None):
    """plan sur un seul personnage : aucun BOUT d'un autre au bord du cadre (ep01 p5 : un bras et une robe de Maman Nounou à
    41 s, une moitié du visage de Modou à 66,5 s — règle de cadrage : un voisin est soit dehors, soit sa tête entière
    dedans). Le cadre glisse pour sortir le voisin tant que la tête du sujet garde 6 % de marge et que son visage reste à
    moins de 20 % de la largeur du centre ; sinon il se resserre (au plus 3 fois 10 %) autour du visage du sujet."""
    tb = G[who]['tete_box']
    for _ in range(4):
        cx, cy, w, h = c; m = 0.06 * w
        gene = _coupe(c, who, G, ex)
        if not gene: return c
        for o in gene:
            b = (ex or {}).get(o) or G[o].get('corps_neutre', G[o]['corps']); ncx = b[0] - w / 2 if (b[0] + b[2]) / 2 > (tb[0] + tb[2]) / 2 else b[2] + w / 2
            fx_ = (tb[0] + tb[2]) / 2   # visage gardé dans le tiers central élargi (p7 : Tantie poussée contre le bord où elle regarde)
            if tb[0] - m >= ncx - w / 2 and tb[2] + m <= ncx + w / 2 and abs(fx_ - ncx) <= 0.2 * w:
                n_ = borne((ncx, cy, w, h), W, H)
                if not _coupe(n_, who, G, ex) or len(_coupe(n_, who, G, ex)) < len(gene): c = n_; break
        else:
            # resserrer en zoomant AUTOUR DU VISAGE (le visage garde sa place dans le cadre) : resserrer à « haut de cadre
            # constant » coupait la bouche de Tantie Awa en gros plan (essai du 20/10/2026)
            fx, fy = (tb[0] + tb[2]) / 2, (tb[1] + tb[3]) / 2; w2, h2 = w * 0.9, h * 0.9
            haut, bas = tb[3] + 0.04 * h2 - h2 / 2, tb[1] - 0.04 * h2 + h2 / 2   # la tête entière (coiffure comprise) reste dedans
            if haut > bas: return c   # la tête ne tiendrait plus : on garde le cadre précédent (le juge C tranchera)
            c = borne((fx + (cx - fx) * 0.9, min(max(fy + (cy - fy) * 0.9, haut), bas), w2, h2), W, H)
    return c


def camera(sh, t, G, W, H):
    t0, t1, sid, kind, who, _ = sh; u = (t - t0) / max(1e-3, t1 - t0)
    if kind == 'ouvre':
        a = cadre('large', None, G, W, H); b = cadre('duo', who, G, W, H); k = lisse((t - t0) / 2.4)
        return tuple(a[i] * (1 - k) + b[i] * k for i in range(4))
    c = cadre(kind, who, G, W, H, EXCLU.get((sid, round(t0, 3)))); z = 1.0 - 0.05 * lisse(u)
    return borne((c[0], c[1], c[2] * z, c[3] * z), W, H)


# ── préparation d'un sketch ───────────────────────────────────────────────────────────────────────────────────────
def accord_couleur(rgb, a, ref, force=0.35):
    """table par canal (gain, décalage) vers les couleurs du décor autour des pieds — même lumière pour tous (Reinhard partiel)."""
    m = a > 0.5; S = rgb[m].astype(np.float32); R = ref.reshape(-1, 3).astype(np.float32)
    lut = np.zeros((256, 1, 3), np.uint8); x = np.arange(256, dtype=np.float32)
    for c in range(3):
        ms, ss, mr, sr = S[:, c].mean(), S[:, c].std() + 1e-6, R[:, c].mean(), R[:, c].std() + 1e-6
        y = (x - ms) * (sr / ss) ** 0.5 + (0.65 * ms + 0.35 * mr)
        lut[:, 0, c] = np.clip((1 - force) * x + force * y, 0, 255).astype(np.uint8)
    return lut


def prepare_sketch(sk, acts, dec, fiches):
    W, H = dec['img'].shape[1], dec['img'].shape[0]; ppm, sol = dec['ppm'], dec['sol_y']
    A = {}
    for n in acts:
        s_ = slug(n); M_ = MP.prepare(s_)
        P0 = M_['poses'].get('neutre') or next(iter(M_['poses'].values()))
        haut = P0['pied'][1] - P0['crane']   # taille du corps jusqu'au crâne : un foulard ou un chignon ne rapetisse personne
        taille = float((fiches.get(n) or {}).get('taille') or 1.7)
        A[n] = {'slug': s_, 'M': M_, 'echelle': taille * ppm / haut, 'lacet': P0['lacet'], 'taille': taille}
    # places : décor (par slug) sinon tiers ; ceux qui regardent vers la droite à gauche
    pl = dec.get('places', {}); n_ = len(acts)
    defaut = {1: [0.5], 2: [0.36, 0.64], 3: [0.27, 0.5, 0.73]}.get(n_, list(np.linspace(0.2, 0.8, n_)))
    if all(A[n]['slug'] in pl for n in acts): xs = {n: pl[A[n]['slug']] * W for n in acts}
    else: xs = dict(zip(sorted(acts, key=lambda n: -A[n]['lacet']), [x * W for x in defaut]))
    for n in acts:
        autres = [xs[m] for m in acts if m != n]; vers = np.sign(np.mean(autres) - xs[n]) if autres else 1.0
        A[n]['x'] = xs[n]; A[n]['sol'] = sol + dec.get('profondeur', {}).get(A[n]['slug'], 0.0)
        A[n]['miroir'] = bool(A[n]['lacet'] * vers < -6 and A[n]['slug'] not in TEXTE_PEINT)
        A[n]['face'] = vers
        # même lumière que le décor : couleurs autour des pieds
        P0 = A[n]['M']['poses'].get('neutre') or next(iter(A[n]['M']['poses'].values()))
        hp = A[n]['taille'] * ppm; x0, x1 = int(max(0, xs[n] - hp * 0.4)), int(min(W, xs[n] + hp * 0.4)); y0 = int(max(0, sol - hp))
        A[n]['lut'] = accord_couleur(P0['rgb'], P0['a'], dec['img'][y0:int(min(H, sol + 10)), x0:x1])
    G = {}
    for n in acts:   # gabarit pour la caméra (pose neutre)
        P0 = A[n]['M']['poses'].get('neutre') or next(iter(A[n]['M']['poses'].values()))
        Mx = placement(A[n], P0, 0.0, 1.0); tb = P0['tete']
        c = np.array([[tb[0], tb[1], 1], [tb[2], tb[1], 1], [tb[0], tb[3], 1], [tb[2], tb[3], 1]], np.float32) @ Mx.T
        box = [float(c[:, 0].min()), float(c[:, 1].min()), float(c[:, 0].max()), float(c[:, 1].max())]
        # silhouette de TOUTES les poses (un bras tendu d'« accuse » dépasse du neutre) + balancement (±1,5° aux pieds)
        cs, par_pose = [], {}
        mg = 0.03 * A[n]['taille'] * ppm
        for nom_p, P_ in A[n]['M']['poses'].items():
            b = P_['corps']; c_ = np.array([[b[0], b[1], 1], [b[2], b[1], 1], [b[0], b[3], 1], [b[2], b[3], 1]], np.float32) @ placement(A[n], P_, 0.0, 1.0).T
            cs.append(c_); par_pose[nom_p] = [float(c_[:, 0].min() - mg), float(c_[:, 1].min()), float(c_[:, 0].max() + mg), float(c_[:, 1].max())]
        cs = np.vstack(cs)
        b = P0['corps']; cn = np.array([[b[0], b[1], 1], [b[2], b[1], 1], [b[0], b[3], 1], [b[2], b[3], 1]], np.float32) @ Mx.T
        G[n] = {'tete_box': box, 'hh': box[3] - box[1], 'sol': A[n]['sol'], 'H': A[n]['taille'] * ppm, 'face': A[n]['face'],
                'corps': [float(cs[:, 0].min() - mg), float(cs[:, 1].min()), float(cs[:, 0].max() + mg), float(cs[:, 1].max())],
                'corps_neutre': [float(cn[:, 0].min() - mg), float(cn[:, 1].min()), float(cn[:, 0].max() + mg), float(cn[:, 1].max())],
                'corps_poses': par_pose}
    return A, G


def placement(Ad, P, theta, sy):
    """figure (pixels du cache) → plaque : échelle, miroir, rotation théta (degrés) et souffle sy autour des pieds."""
    s = Ad['echelle']; px, py = P['pied']; mx = -1.0 if Ad['miroir'] else 1.0
    c, si = math.cos(math.radians(theta)), math.sin(math.radians(theta))
    # (u, v) → ((u - px)·s·mx, (v - py)·s·sy) → rotation → + (x, sol)
    a, b = s * mx, 0.0; d_, e = 0.0, s * sy
    R = np.array([[c * a - si * d_, c * b - si * e], [si * a + c * d_, si * b + c * e]], np.float32)
    t = np.array([Ad['x'], Ad['sol']], np.float32) - R @ np.array([px, py], np.float32)
    return np.hstack([R, t[:, None]]).astype(np.float32)


# ── jeu ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def pistes_jeu(T, sid, acts, reaction, t_a, t_b):
    """par acteur : segments de pose [(t0, t1, pose)], répliques (pour la bouche), changements de pose (pour les clignements)."""
    Ls = [L for L in T['lines'] if L['sketch'] == sid]; J = {}
    for L in Ls:
        if L.get('env'): L['env_lisse'] = lisse_env(L['env'], len(L['env']) / max(1e-3, L['dur']))
    chute = next((L for L in Ls if L.get('chute')), None); vict = (reaction or {}).get('qui')
    for n in acts:
        segs = []; mes = [L for L in Ls if L['qui'] == n]
        for i, L in enumerate(mes):
            p = POSE_JEU.get(L.get('jeu', ''), 'neutre'); d = L['t0'] - 0.15
            f = min(L['t0'] + L['dur'] + 0.8, (mes[i + 1]['t0'] - 0.15) if i + 1 < len(mes) else 1e9)
            segs.append((d, f, p))
        if chute is not None:
            tf = chute['t0'] + chute['dur']
            if n == vict and n != chute['qui']: segs = [s for s in segs if s[0] < tf - 0.2] + [(tf - 0.2, t_b + 1, 'choc')]
            elif n == chute['qui']: segs = [(a, min(b, tf + 0.35), p) for a, b, p in segs] + [(tf + 0.35, t_b + 1, 'rire')]
        J[n] = {'segs': segs, 'lignes': mes}
    return J


def pose_a(J, n, t, dispo):
    p = 'neutre'
    for a, b, q in J[n]['segs']:
        if a <= t < b: p = q
    return p if p in dispo else 'neutre'


TRANSITION = 2 / 30   # passage d'un visème au suivant en 2 images


def visème(J, n, t):
    """→ (visème, réplique, paramètres de bouche mélangés avec le visème précédent)."""
    for L in J[n]['lignes']:
        if L['t0'] - TRANSITION <= t < L['t0'] + L['dur'] + TRANSITION:
            r = t - L['t0']; vs = L.get('visemes') or []; prev, cur, debut = 'X', 'X', -1.0
            for v in vs:
                if v['t0'] <= r < v['t1']: cur, debut = v['v'], v['t0']; break
                if v['t1'] <= r: prev = v['v']
            else:
                if r >= (vs[-1]['t1'] if vs else 0): prev, cur, debut = (vs[-1]['v'] if vs else 'X'), 'X', (vs[-1]['t1'] if vs else 0)
            b = 1.0 if debut < 0 else (r - debut) / TRANSITION
            return cur, L, MP.melange(prev, cur, b)
    return 'X', None, MP.VISEMES['X']


def lisse_env(e, n):
    """énergie de la voix lissée (moyenne glissante sur 0,2 s, puis vitesse limitée) : le buste accompagne la phrase, il ne
    tressaute pas à chaque syllabe (juge E de p2 : 39 à-coups, par paires, pendant la parole)."""
    e = np.clip(np.asarray(e, np.float32), 0, 1)
    k = max(1, int(round(0.2 * n))); e = np.convolve(np.pad(e, (k // 2, k - 1 - k // 2), mode='edge'), np.ones(k) / k, mode='valid')
    pas = 1.5 / max(1.0, n)   # au plus 1,5 unité par seconde
    for i in range(1, len(e)): e[i] = e[i - 1] + np.clip(e[i] - e[i - 1], -pas, pas)
    return e


def energie(L, t):
    e = L.get('env_lisse') if L else None
    if e is None or not len(e): return 0.0
    i = int((t - L['t0']) * len(e) / max(1e-3, L['dur'])); return float(e[max(0, min(len(e) - 1, i))])


CLIGNE = [0.3, 0.75, 1.0, 1.0, 0.6, 0.25]   # 6 images (200 ms), fermeture et ouverture adoucies


def cligne(n, t, changements):
    f = int(round(t * FPS))
    for tc in changements:   # un clignement à chaque changement de pose (il cache la coupe)
        k = f - int(round(tc * FPS)) + 2
        if 0 <= k < len(CLIGNE): return CLIGNE[k]
    rng = np.random.default_rng(sum(map(ord, n)))
    tt = 0.0
    while tt < t + 1:
        tt += rng.uniform(2.6, 5.2)
        k = f - int(round(tt * FPS))
        if 0 <= k < len(CLIGNE): return CLIGNE[k]
    return 0.0


# ── rendu ─────────────────────────────────────────────────────────────────────────────────────────────────────────
_E = {}
EXCLU = {}   # (sketch, début du plan) → {voisin: silhouette des poses qu'il prend pendant le plan}


def _init(etat):
    _E.update(etat); _E['cache'] = {}
    _E['M'] = {s: MP.charge(s) for s in etat['slugs']}
    _E['dec'] = {sid: decor(l) for sid, l in etat['lieux'].items()}
    for sid, d_ in _E['dec'].items():
        d_['img2'] = cv2.resize(d_['img'], None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)


def _patch(slug_, pose, pm, kc):
    pm = tuple(round(float(x), 2) for x in pm[:3]) + tuple(int(x) for x in pm[3:])
    cle = (slug_, pose, pm, round(kc, 2)); C = _E['cache']
    if cle not in C:
        P = _E['M'][slug_]['poses'][pose]; L_ = []
        # poses parlantes : bouche toujours repeinte (fermée au repos) — plus de saut entre la bouche d'origine et la repeinte
        if P.get('parle', True): L_.append(MP.peint_bouche(P, 'X', 1.0, params=pm))
        if kc > 0.02 and pose != 'choc': L_ += MP.peint_paupieres(P, kc)
        C[cle] = L_
        if len(C) > 3000: C.pop(next(iter(C)))
    return C[cle]


def _warp(img, M3, interp=cv2.INTER_LINEAR):
    return cv2.warpAffine(img, M3, (CW, CH), flags=interp, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def image(f):
    E = _E; t = f / FPS; SH = E['SH']
    sh = next((s for s in SH if s[0] <= t < s[1]), SH[-1] if t >= SH[-1][0] else SH[0]); sid = sh[2]
    d_ = E['dec'][sid]; W, H = d_['img'].shape[1], d_['img'].shape[0]; G = E['G'][sid]
    cx, cy, w, h = camera(sh, t, G, W, H); k = CW / w
    Cm = np.array([[k, 0, -(cx - w / 2) * k], [0, k, -(cy - h / 2) * k], [0, 0, 1]], np.float32)   # plaque → image
    base = d_['img2'] if k > 0.6 else d_['img']; sb = 0.5 if base is d_['img2'] else 1.0
    out = _warp(base, (Cm @ np.diag([sb, sb, 1]).astype(np.float32))[:2]).astype(np.float32)
    A = E['A'][sid]; J = E['J'][sid]; boites = {}
    ordre = sorted(A, key=lambda n: (A[n]['sol'], A[n]['x']))
    for n in ordre:   # ombres de contact d'abord
        Ad = A[n]; p = Cm @ np.array([Ad['x'], Ad['sol'], 1], np.float32); rx = Ad['taille'] * E['ppm'][sid] * 0.20 * k
        sm = np.zeros((CH, CW), np.float32); cv2.ellipse(sm, (int(p[0]), int(p[1])), (max(2, int(rx)), max(1, int(rx * 0.16))), 0, 0, 360, 1, -1)
        sm = cv2.GaussianBlur(sm, (0, 0), max(1.0, rx * 0.25)); out *= (1 - 0.45 * sm)[..., None]
    for n in ordre:
        Ad = A[n]; M_ = E['M'][Ad['slug']]; dispo = M_['poses']
        pose = pose_a(J, n, t, dispo); P = dispo[pose]
        vis, L, pm = visème(J, n, t + AVANCE_BOUCHE); kc = cligne(n, t, J[n]['changements'])
        ph = sum(map(ord, n)) % 17
        theta = 0.55 * math.sin(2 * math.pi * t / 5.3 + ph) + 0.9 * energie(L, t) * Ad['face']
        tsw = max([tc for tc in J[n]['changements'] if tc <= t] or [-9]); u_ = (t - tsw) / 0.3
        pop = 0.008 * math.sin(math.pi * u_) if 0 <= u_ < 1 else 0.0   # rebond doux (0,3 s) au changement de pose
        sy = 1.0 + 0.006 * math.sin(2 * math.pi * t / 3.8 + ph * 0.7) + pop
        Mx = placement(Ad, P, theta, sy); M3 = (Cm @ np.vstack([Mx, [0, 0, 1]]))[:2]
        sc = abs(M3[0, 0]) + abs(M3[0, 1])
        src, srca, ds = P['rgb'], P['a'], 1.0
        if sc < 0.5:   # plan large : niveau réduit (pas de crénelage)
            cle = (Ad['slug'], pose, 'demi')
            if cle not in E['cache']: E['cache'][cle] = (cv2.pyrDown(P['rgb']), cv2.pyrDown(P['a']))
            src, srca = E['cache'][cle]; ds = 2.0
        Md = (M3 @ np.diag([ds, ds, 1]).astype(np.float32)).astype(np.float32)
        fig = _warp(src, Md).astype(np.float32); al = _warp(srca, Md)
        s_al = float(al.sum()); vu = s_al / max(1.0, P['aire'] * abs(float(np.linalg.det(M3[:, :2]))))   # part de la silhouette dans l'image
        for x0, y0, im, pa in _patch(Ad['slug'], pose, pm, kc):   # bouche et paupières : petits calques, même transformation
            Mp = (M3 @ np.array([[1, 0, x0], [0, 1, y0], [0, 0, 1]], np.float32)).astype(np.float32)
            pi = _warp(im, Mp).astype(np.float32); pa_ = _warp(pa.astype(np.float32), Mp)[..., None]
            fig = fig * (1 - pa_) + pi * pa_
        fig = cv2.LUT(np.clip(fig, 0, 255).astype(np.uint8), Ad['lut']).astype(np.float32)
        al = cv2.GaussianBlur(al, (0, 0), 0.5)[..., None]
        out = out * (1 - al) + fig * al
        def tr(b):
            c_ = np.array([[b[0], b[1], 1], [b[2], b[1], 1], [b[0], b[3], 1], [b[2], b[3], 1]], np.float32) @ M3.T
            return [float(c_[:, 0].min()), float(c_[:, 1].min()), float(c_[:, 0].max()), float(c_[:, 1].max())]
        Lm = P['L']; bb = [float(Lm[61][0]), float(min(Lm[0][1], Lm[13][1])), float(Lm[291][0]), float(max(Lm[17][1], Lm[14][1]) + P['mw'] * 0.3)]
        boites[n] = {'bouche': tr([min(bb[0], bb[2]), bb[1], max(bb[0], bb[2]), bb[3]]), 'tete': tr(P['tete']), 'pose': pose, 'vis': vis, 'ouv': round(float(pm[0]), 3),
                     'corps': tr(P['corps']), 'vu': round(min(1.0, vu), 3), 'aire': round(s_al / (CW * CH), 4)}   # coupes au bord (juge C)
    cv2.imwrite(f"{E['D']}/clip/f{f:05d}.jpg", cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 93])
    return f, boites


def _bloc(fs): return [image(f) for f in fs]


def tourne(D):
    t_dep = time.time(); T = json.load(open('timeline.json')); Hs = json.load(open('histoire.json'))
    import marionnette as MV
    F = MV.bible(); plateau = json.load(open('plateau.json')) if os.path.isfile('plateau.json') else {}
    nf = int(math.ceil(T['total'] * FPS)); os.makedirs(f'{D}/clip', exist_ok=True)
    sk_h = {s['id']: s for s in Hs['sketchs']}; sk_t = {s['id']: (max(0.0, s['t0'] - 0.3), s['t1'] + 0.25) for s in T['sketchs']}
    ids = list(sk_t); lim = [0.0] + [(sk_t[a][1] + sk_t[b][0]) / 2 for a, b in zip(ids, ids[1:])] + [T['total'] + 1]
    for i, sid in enumerate(ids): sk_t[sid] = (lim[i], lim[i + 1])
    lieux, A_, G_, J_, acteurs, ppm, dims = {}, {}, {}, {}, {}, {}, {}
    for sid in ids:
        sk = sk_h.get(sid, {'id': sid}); acts = sk.get('acteurs') or list(dict.fromkeys(L['qui'] for L in T['lines'] if L['sketch'] == sid))
        lieu = (plateau.get(sid) or {}).get('lieu') or sk.get('image') or sk.get('lieu') or 'cour'
        dec = decor(lieu); lieux[sid] = lieu; acteurs[sid] = acts; ppm[sid] = dec['ppm']; dims[sid] = dec['img'].shape[1], dec['img'].shape[0]
        A, G = prepare_sketch(sk, acts, dec, F); A_[sid], G_[sid] = A, G
        J = pistes_jeu(T, sid, acts, sk.get('reaction'), *sk_t[sid])
        for n in acts:   # instants des changements de pose
            ch, prev = [], None
            for f in range(int(sk_t[sid][0] * FPS), int(min(nf, sk_t[sid][1] * FPS))):
                p = pose_a(J, n, f / FPS, A[n]['M']['poses'])
                if prev is not None and p != prev: ch.append(f / FPS)
                prev = p
            J[n]['changements'] = ch
        J_[sid] = J
        for n in acts: A[n]['_poses'] = set(A[n].pop('M')['poses'])   # poses disponibles (pose_a), après le départ des images
    SH = decoupage(T, sk_t, acteurs, {s: sk_h.get(s, {}).get('reaction') for s in ids})
    for sh in SH:   # plans sur un seul personnage : silhouettes des poses réellement prises par les voisins pendant le plan
        if sh[3] in ('moyen', 'serre', 'gros') and isinstance(sh[4], str):
            sid, ex = sh[2], {}
            for n in acteurs[sid]:
                if n == sh[4]: continue
                ps = {pose_a(J_[sid], n, f / FPS, A_[sid][n]['_poses']) for f in range(int(sh[0] * FPS), int(sh[1] * FPS) + 1)}
                bs = [G_[sid][n]['corps_poses'][p] for p in ps if p in G_[sid][n]['corps_poses']]
                if bs: ex[n] = [min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)]
            EXCLU[(sid, round(sh[0], 3))] = ex
    etat = dict(D=os.path.abspath(D), SH=SH, lieux=lieux, A=A_, G=G_, J=J_, ppm=ppm, slugs=sorted({A_[s][n]['slug'] for s in ids for n in A_[s]}))
    t_prep = time.time() - t_dep
    from concurrent.futures import ProcessPoolExecutor
    import multiprocessing as mp
    choisies = [int(x) for x in os.environ['TOURNE_IMAGES'].split(',')] if os.environ.get('TOURNE_IMAGES') else list(range(nf))   # images clés seules
    nproc = int(os.environ.get('TOURNE_PROCS', os.cpu_count() or 4)); blocs = [choisies[i::nproc] for i in range(nproc)]
    with ProcessPoolExecutor(nproc, mp_context=mp.get_context('fork'), initializer=_init, initargs=(etat,)) as ex:
        res = [r for b in ex.map(_bloc, blocs) for r in b]
    json.dump({str(f): b for f, b in sorted(res)}, open(f'{D}/boites.json', 'w'))
    # trajet de caméra de CHAQUE image (plaque : centre, largeur, hauteur) : la chaîne générative anime l'image clé d'un plan
    # caméra fixe, puis rejoue ce trajet en recadrant le plan généré (generatif/assemble_generatif.py)
    cams = {}
    for f in range(nf):
        t = f / FPS; sh = next((s for s in SH if s[0] <= t < s[1]), SH[-1] if t >= SH[-1][0] else SH[0])
        cams[str(f)] = [round(float(v), 2) for v in camera(sh, t, G_[sh[2]], *dims[sh[2]])]
    json.dump(cams, open(f'{D}/cameras.json', 'w'))
    json.dump({'fps': FPS, 'peint': True, 'decoupage': SH, 'images': nf,
               'lieux': {s: {'lieu': l, 'scores': None} for s, l in lieux.items()},
               'placements': {s: {n: {'x': round(a['x'], 1), 'miroir': a['miroir'], 'echelle': round(a['echelle'], 4)} for n, a in A_[s].items()} for s in ids},
               'duree_s': {'preparation': round(t_prep, 1), 'images': round(time.time() - t_dep - t_prep, 1)}},
              open(f'{D}/tournage.json', 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({'images': nf, 'plans': len(SH), 'lieux': lieux, 'secondes': round(time.time() - t_dep, 1)}, ensure_ascii=False))


if __name__ == '__main__':
    tourne(sys.argv[1])
