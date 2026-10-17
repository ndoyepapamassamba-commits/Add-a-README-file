# MOTEUR IMAGE → VIDÉO MAISON — COUCHE « JEU HUMAIN » (17/10/2026). Consignes : « crée toi-même le moteur image vers vidéo,
# sans abonnement ni serveur, selon les exigences de JEV » ; « mouvements naturels, fluides » ; « prévoir même des mouvements
# qui ne sont pas dans nos plaques ».
# AVIS DE JEV (v27, deux secondes jugées « pas naturel ») : cause « corps raides, seules têtes et bouches bougent » (0,90–0,93) ;
# remède au plus fort gain : « le mouvement d'un VRAI humain retargeté sur la marionnette, coups de geste calés sur les
# syllabes accentuées » (2,60–2,76 sur 4, loin devant ressorts, regard, poids : 1,5–1,7).
# Méthode :
#   1. CAPTURE DE MOUVEMENT CMU (gratuite, « free for all uses » ; jamais redistribuée) lue en 3D par cinématique directe
#      (blender/film/mocap.py) — et non plus seulement projetée : une caméra virtuelle suit LENTEMENT le cap du sujet (moyenne
#      sur 1,5 s), et l'on mesure dans son repère ce que notre squelette 2D sait jouer : roulis, tangage et lacet de la tête,
#      roulis et torsion du buste, haussement d'épaules, transfert du poids (bassin), lever de chaque avant-bras (angle à la
#      verticale du buste : la même valeur que le bras se lève sur le côté ou vers la caméra) et son avancée vers la caméra ;
#   2. APEX DES GESTES : fin de chaque coup de main (la main s'arrête après une accélération) et fin de chaque hochement ;
#   3. CHOIX DE LA PRISE ET DE LA FENÊTRE : parmi les prises de l'intention de la réplique (explique, pointe, dispute, rire…),
#      la fenêtre et le tempo (×0,85 à ×1,18) dont les apex tombent le mieux sur les syllabes accentuées — l'apex d'un geste se
#      place au début de la voyelle accentuée (Rohrer, Hong & Bosker 2024 ; Esteve-Gibert & Prieto 2013 ; Loehr 2004) ; sans
#      marche, sans sujet qui se détourne ; jamais deux fois la même fenêtre dans un sketch ; prise retournée en miroir quand
#      son bras le plus actif doit être du côté du partenaire ;
#   4. RECALAGE TEMPOREL fin (morceaux linéaires, pente bornée 0,7–1,45) : chaque apex retenu tombe sur sa syllabe ;
#   5. PRÉPARATION ET RETOUR : la fenêtre commence 0,35 s avant la parole (le geste se prépare) et finit 0,45 s après (il
#      retombe), fondus doux : jamais de mouvement qui démarre ou s'arrête sec.
# Celui qui écoute reçoit une prise calme (réfléchir, chercher, hausser les épaules) à gain réduit, sans geste des bras.
#   couche(L, cibles, fps, nf, jeu, graine, ecoute, echelle_px_m, cote_partenaire, deja) → {canal: array} (unités du moteur)
#   python3 mocap_jeu.py            → inventaire de la bibliothèque (durée utile, apex par seconde, activité des bras)
import math, os, sys
import numpy as np

_ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_ICI, '..', 'blender', 'film'))
import mocap  # noqa: E402

FPS = 30
UNIT_M = 0.0254 / 0.45   # unité ASF de la CMU → mètres
CACHE = os.path.join(os.path.expanduser('~'), '.cache', 'massamba-models', 'cmu-pistes')
VERSION = 2
# intention de la réplique (champ « jeu ») → étiquettes de la bibliothèque (direction-vocab.json), par préférence
INTENTION = {'accuse': ('pointe', 'dispute'), 'soupcon': ('pointe', 'explique'), 'colere': ('dispute', 'pointe'),
             'marchande': ('explique', 'dispute'), 'rappel': ('explique', 'dispute'), 'malice': ('explique', 'haussement'),
             'frime': ('explique', 'joie'), 'camera': ('explique', 'dispute'), 'choc': ('peur', 'dispute'),
             'panique': ('peur', 'dispute'), 'rire': ('rire',), 'excuse': ('haussement', 'explique'),
             'innocent': ('haussement', 'explique'), 'tristesse': ('triste', 'explique'), 'emu': ('triste', 'joie'),
             'joie': ('joie', 'rire'), 'boude': ('haussement', 'reflechit'), '': ('explique', 'dispute')}
ECOUTE = ('reflechit', 'cherche', 'haussement')
PRE, POST = 0.35, 0.45   # s : préparation du geste avant la parole, retour après


def _u(v):
    n = float(np.linalg.norm(v)); return v / n if n > 1e-9 else v


def _lisse(a, k):
    """moyenne glissante centrée (k images), bords répétés."""
    if k <= 1: return np.asarray(a, np.float64)
    a = np.asarray(a, np.float64); p = k // 2
    return np.convolve(np.pad(a, (p, k - 1 - p), mode='edge'), np.ones(k) / k, mode='valid')


def _disponibles(tag):
    v = mocap.vocab()['gestes'].get(tag, {}); d = mocap._cache_dir()
    return [c for c in v.get('clips', []) if os.path.isfile(os.path.join(d, f'{c}.amc')) and os.path.isfile(os.path.join(d, f"{c.split('_')[0]}.asf"))]


def extraire(trial):
    """pistes 3D d'une prise, à 30 i/s, dans le repère d'une caméra qui suit lentement le cap du sujet (cache disque)."""
    os.makedirs(CACHE, exist_ok=True); p = os.path.join(CACHE, f'{trial}-v{VERSION}.npz')
    if os.path.isfile(p):
        z = np.load(p); return {k: z[k] for k in z.files}
    d = mocap._cache_dir(); sk = mocap.parse_asf(os.path.join(d, f"{trial.split('_')[0]}.asf"))
    fr = mocap.parse_amc(os.path.join(d, f'{trial}.amc'))[::4]   # 120 → 30 i/s
    _, P0 = mocap.forward(sk, {})
    R0 = _u(P0['lhipjoint'] - P0['rhipjoint']); U0 = np.array([0.0, 1.0, 0.0]); R0[1] = 0.0; R0 = _u(R0)
    rows = [mocap.forward(sk, f) for f in fr]; n = len(rows)
    cap = np.unwrap([math.atan2(*(G['root'] @ R0)[[2, 0]]) for G, _ in rows])
    cap_s = _lisse(cap, int(1.5 * FPS) | 1)                      # la caméra suit le cap du sujet en 1,5 s
    out = {k: np.zeros(n) for k in ('buste', 'buste_tangage', 'buste_lacet', 'tete', 'tete_tangage', 'tete_lacet', 'epaules',
                                    'bassin_x', 'bassin_y', 'bassin_z', 'lever_l', 'lever_r', 'avance_l', 'avance_r', 'coude_l', 'coude_r')}
    poignet = {s: np.zeros((n, 3)) for s in 'lr'}
    for i, (G, P) in enumerate(rows):
        c_, s_ = math.cos(cap_s[i]), math.sin(cap_s[i]); Rs = np.array([c_, 0.0, s_]); Fs = np.array([-s_, 0.0, c_]); U = U0
        ang = lambda v, a, b: math.degrees(math.atan2(float(v @ a), float(v @ b)))
        v = P['thorax'] - P['root']; tU = _u(G['thorax'] @ U0); hU = _u(G['head'] @ U0); hL = _u(G['head'] @ R0); tL = _u(G['thorax'] @ R0)
        out['buste'][i] = ang(v, Rs, U); out['buste_tangage'][i] = ang(v, Fs, U)
        out['buste_lacet'][i] = -ang(tL, Fs, Rs)
        out['tete'][i] = ang(hU, Rs, U) - ang(tU, Rs, U); out['tete_tangage'][i] = ang(hU, Fs, U) - ang(tU, Fs, U)
        out['tete_lacet'][i] = -ang(hL, Fs, Rs)
        out['epaules'][i] = 0.5 * float((P['lclavicle'] - P['thorax']) @ tU + (P['rclavicle'] - P['thorax']) @ tU) * UNIT_M
        out['bassin_x'][i] = float(P['root'] @ Rs) * UNIT_M; out['bassin_y'][i] = -float(P['root'][1]) * UNIT_M
        out['bassin_z'][i] = float(P['root'] @ Fs) * UNIT_M
        for s in 'lr':
            ep, co, po = P[s + 'clavicle'], P[s + 'humerus'], P[s + 'radius']   # épaule, coude, poignet (fins d'os)
            f = _u(po - co); a = _u(co - ep)
            out[f'lever_{s}'][i] = math.degrees(math.acos(float(np.clip(f @ -tU, -1, 1))))   # 0 = pend, 90 = horizontal, 180 = levé
            out[f'avance_{s}'][i] = float(f @ Fs)                                            # vers la caméra : +1
            out[f'coude_{s}'][i] = math.degrees(math.acos(float(np.clip(a @ -tU, -1, 1))))
            w = (po - P['thorax']) * UNIT_M; poignet[s][i] = [w @ Rs, -w[1], w @ Fs]
    for k in ('buste', 'buste_tangage', 'buste_lacet', 'tete', 'tete_tangage', 'tete_lacet'):
        out[k] = np.degrees(np.unwrap(np.radians(out[k])))
    # marche : vitesse horizontale du bassin (m/s) ; apex des gestes et des hochements
    vb = np.r_[0, np.hypot(np.diff(out['bassin_x']), np.diff(out['bassin_z']))] * FPS
    out['marche'] = _lisse(vb, 15)
    apx, force = _apex(poignet, out['tete_tangage'])
    out['apex'] = np.asarray(apx, np.float64); out['apex_force'] = np.asarray(force, np.float64)
    out['n'] = np.array(n)
    out = {k: np.asarray(v, np.float32) for k, v in out.items()}
    np.savez_compressed(p, **out)
    return out


def _apex(poignet, tangage):
    """rangs des apex : fin d'un coup de main (vitesse du poignet qui retombe sous la moitié de son pic dans les 0,3 s) et
    bas d'un hochement (vitesse de tangage qui s'annule après un pic) ; force = vitesse du pic (m/s, ou °/s ÷ 100)."""
    ev = []
    for s in 'lr':
        w = poignet[s]; v = _lisse(np.r_[0, np.linalg.norm(np.diff(w, axis=0), axis=1)] * FPS, 3)
        seuil = max(0.25, float(np.percentile(v, 70)))
        for i in range(1, len(v) - 1):
            if v[i] >= seuil and v[i] >= v[i - 1] and v[i] > v[i + 1]:
                j = i + int(np.argmin(v[i:i + 10]))
                if v[j] < 0.5 * v[i]: ev.append((j, float(v[i])))
    vt = _lisse(np.r_[0, np.diff(tangage)] * FPS, 3)
    seuil_t = max(25.0, float(np.percentile(np.abs(vt), 75)))
    for i in range(1, len(vt) - 1):
        if vt[i] >= seuil_t and vt[i] >= vt[i - 1] and vt[i] > vt[i + 1]:   # la tête descend vite puis s'arrête : hochement
            j = i + int(np.argmin(np.abs(vt[i:i + 10]))); ev.append((j, float(vt[i]) / 100.0))
    ev.sort(); fus = []
    for j, f in ev:   # deux apex à moins de 0,2 s : un seul temps fort
        if fus and j - fus[-1][0] < 0.2 * FPS:
            if f > fus[-1][1]: fus[-1] = (j, f)
        else: fus.append((j, f))
    return [j for j, _ in fus], [f for _, f in fus]


def _mauvais(c):
    """images inutilisables : le sujet marche, se détourne de la caméra au point que la projection n'a plus de sens, ou se
    plie en deux (rire, 14_19 : le buste passe à l'horizontale, les angles de face n'existent plus)."""
    ecart = lambda k, lim: np.abs(c[k] - np.median(c[k])) > lim
    return ((c['marche'] > 0.35) | ecart('tete_lacet', 55) | ecart('buste_lacet', 45) | ecart('buste', 25) | ecart('tete', 40)
            | ecart('buste_tangage', 35) | ecart('tete_tangage', 45))


def _repos(c, s):
    """angle de lever « bras au repos » de la prise (bas de la distribution)."""
    return float(np.percentile(c[f'lever_{s}'], 10))


def choisir(prises, duree, cibles, deja=(), graine=0, tempos=(0.85, 1.0, 1.18)):
    """meilleure (prise, début, tempo) pour une réplique de `duree` s dont les syllabes accentuées sont à `cibles` (s)."""
    best = None; rng = np.random.default_rng(graine)
    for trial in prises:
        c = extraire(trial); n = int(c['n']); bad = _mauvais(c); apx = c['apex']
        for k in tempos:
            L = int(round((duree + PRE + POST) * FPS * k))
            if L >= n: continue
            okc = np.r_[0, np.cumsum(bad)]
            for s in range(0, n - L, 3):
                if okc[s + L] - okc[s] > 0: continue
                a = (apx[(apx >= s) & (apx < s + L)] - s) / (k * FPS) - PRE        # apex en temps de la réplique
                if len(cibles):
                    dist = [min(0.35, float(np.min(np.abs(a - t)))) if len(a) else 0.35 for t in cibles]
                    cout = float(np.mean(dist))
                else:
                    cout = 0.0
                orphelins = sum(1 for x in a if 0 <= x <= duree and (not len(cibles) or np.min(np.abs(np.asarray(cibles) - x)) > 0.3))
                recouvre = max([max(0, min(s + L, b1) - max(s, a1)) / L for (t1, a1, b1) in deja if t1 == trial] + [0.0])
                cout += 0.04 * orphelins + 0.15 * abs(math.log(k)) + 0.8 * recouvre + 0.01 * rng.random()   # jamais deux fois le même geste
                if best is None or cout < best[0]: best = (cout, trial, s, k)
    return best


def _recale(c, s, k, nf, duree, cibles):
    """temps de la réplique (−PRE … duree+POST, nf images) → rang fractionnaire dans la prise : linéaire au tempo k, puis
    chaque syllabe attire l'apex le plus proche (≤ 0,35 s) ; pente bornée 0,7–1,45 × k."""
    t = np.arange(nf) / FPS - PRE
    base = lambda tt: s + (tt + PRE) * k * FPS
    xs, ys = [-PRE, duree + POST], [base(-PRE), base(duree + POST)]
    apx = c['apex'][(c['apex'] >= s) & (c['apex'] < s + (duree + PRE + POST) * k * FPS)]
    for tc in sorted(cibles):
        if not len(apx): break
        ta = (apx - s) / (k * FPS) - PRE; j = int(np.argmin(np.abs(ta - tc)))
        if abs(ta[j] - tc) <= 0.35: xs.append(tc); ys.append(float(apx[j]))
    o = np.argsort(xs); xs, ys = list(np.asarray(xs)[o]), list(np.asarray(ys)[o])
    gx, gy = [xs[0]], [ys[0]]
    for x, y in zip(xs[1:], ys[1:]):
        if x - gx[-1] < 0.12: continue
        pente = (y - gy[-1]) / ((x - gx[-1]) * FPS)
        if 0.7 * k <= pente <= 1.45 * k: gx.append(x); gy.append(y)
    if gx[-1] < duree + POST - 1e-6:   # la fin, sans casser la pente : prolongée au tempo k
        gx.append(duree + POST); gy.append(gy[-1] + (duree + POST - gx[-2]) * k * FPS)
    return np.interp(t, gx, gy)


def _echantillonne(a, r):
    r = np.clip(r, 0, len(a) - 1.001); i = np.floor(r).astype(int); f = r - i
    return a[i] * (1 - f) + a[np.minimum(i + 1, len(a) - 1)] * f


def couche(L, cibles, fps, nf, jeu='', graine=0, ecoute=False, echelle=400.0, cote=0.0, deja=None, bras=()):
    """canaux (unités du moteur) pour la fenêtre [t0 − PRE, t0 + dur + POST] de la réplique L (nf images à fps = 30),
    centrés sur la pose du dessin et fondus aux bords. echelle : pixels par mètre du personnage ; cote : signe du
    partenaire à l'écran (+1 à droite) ; bras : côtés ('l'/'r') des calques d'avant-bras du personnage, dans l'ordre."""
    assert fps == FPS
    tags = ECOUTE if ecoute else INTENTION.get(jeu, INTENTION[''])
    prises = [c for t_ in tags for c in _disponibles(t_)]
    if not prises: return {}, None
    duree = max(0.2, nf / FPS - PRE - POST); deja = set() if deja is None else deja
    ch = choisir(prises, duree, [] if ecoute else list(cibles), deja, graine)
    if ch is None: return {}, None
    _, trial, s, k = ch; c = extraire(trial); deja.add((trial, s, s + int(round((duree + PRE + POST) * FPS * k))))
    r = _recale(c, s, k, nf, duree, [] if ecoute else cibles)
    # miroir : le bras le plus actif de la fenêtre du côté du partenaire (bras gauche du sujet = droite de l'écran)
    act = {x: float(np.ptp(_echantillonne(c[f'lever_{x}'], r))) for x in 'lr'}
    miroir = bool(cote) and ((act['l'] >= act['r']) != (cote > 0))
    sg = -1.0 if miroir else 1.0
    g = 0.45 if ecoute else 1.0
    env = np.ones(nf); a_ = int(0.25 * FPS); b_ = int(0.35 * FPS)
    env[:a_] = 0.5 - 0.5 * np.cos(np.pi * np.arange(a_) / a_); env[-b_:] = np.minimum(env[-b_:], 0.5 + 0.5 * np.cos(np.pi * np.arange(1, b_ + 1) / b_))
    pris = lambda k_: _echantillonne(c[k_], r)
    centre = lambda x: x - float(np.mean(x))
    out = {'buste': sg * g * centre(pris('buste')), 'buste_lacet': sg * g * centre(pris('buste_lacet')),
           'tete': sg * g * centre(pris('tete')), 'tete_tangage': g * centre(pris('tete_tangage')),
           'tete_lacet': sg * g * centre(pris('tete_lacet')),
           'epaules': g * echelle * np.maximum(0.0, pris('epaules') - float(np.percentile(c['epaules'], 20))),
           'bassin_x': sg * g * echelle * centre(pris('bassin_x') - _lisse(pris('bassin_x'), 61))}
    if not ecoute:
        for i, s_ in enumerate(bras):
            src = ('r' if s_ == 'l' else 'l') if miroir else s_
            lev = np.maximum(0.0, pris(f'lever_{src}') - _repos(c, src))
            out[f'geste_{i}'] = np.clip(lev / 75.0, 0, 1) ** 0.9
    out = {k_: (v * env).astype(np.float32) for k_, v in out.items()}
    return out, {'prise': trial, 'debut_s': round(s / FPS, 2), 'tempo': k, 'miroir': miroir, 'cout': round(float(ch[0]), 3)}


_NODS = None


def hochements(prises=('19_08', '18_08', '80_48', '19_10', '18_10', '13_05', '13_06', '141_21')):
    """VRAIS hochements de tête (tangage, degrés, −0,25 s … +0,45 s autour du bas du hochement), découpés dans les prises
    de conversation : l'auditeur acquiesce avec la courbe d'un humain, jamais avec une bosse de synthèse."""
    global _NODS
    if _NODS is None:
        _NODS = []; a, b = int(0.25 * FPS), int(0.45 * FPS)
        for t_ in prises:
            if not os.path.isfile(os.path.join(mocap._cache_dir(), f'{t_}.amc')): continue
            c = extraire(t_); tg = c['tete_tangage']; bad = _mauvais(c)
            vt = _lisse(np.r_[0, np.diff(tg)] * FPS, 3)
            for j in c['apex'].astype(int):
                if a <= j < len(tg) - b and not bad[j - a:j + b].any() and vt[max(0, j - 6):j].max() > 25:
                    seg = tg[j - a:j + b] - tg[j - a]; seg = seg - np.linspace(0, seg[-1], len(seg))   # revient à son point de départ
                    if 2.0 <= np.ptp(seg) <= 14.0: _NODS.append(seg.astype(np.float32))
    return _NODS


def inventaire():
    tags = sorted({t for v in INTENTION.values() for t in v} | set(ECOUTE))
    for t in tags:
        for trial in _disponibles(t):
            c = extraire(trial); n = int(c['n']); bad = _mauvais(c)
            print(f"{t:11s} {trial:7s} {n / FPS:5.1f} s, utile {100 * (1 - bad.mean()):3.0f} %, apex {len(c['apex']) / (n / FPS):.2f}/s, "
                  f"lever g/d {np.ptp(c['lever_l']):.0f}°/{np.ptp(c['lever_r']):.0f}°, tête ±{np.std(c['tete']):.1f}° tangage ±{np.std(c['tete_tangage']):.1f}° "
                  f"lacet ±{np.std(c['tete_lacet']):.1f}°, buste ±{np.std(c['buste']):.1f}°, torsion ±{np.std(c['buste_lacet']):.1f}°, "
                  f"bassin ±{100 * np.std(c['bassin_x'] - _lisse(c['bassin_x'], 61)):.1f} cm", flush=True)


if __name__ == '__main__':
    inventaire()
