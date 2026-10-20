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
import dictionnaire_humain as dh  # noqa: E402

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
# DICTIONNAIRE HUMAIN (19/10/2026, « intégrer toute la bibliothèque BEAT2 pour résoudre enfin tous les soucis de mouvements ») :
# en plus des 39 prises CMU, chaque réplique examine BEAT_PAR_REPLIQUE enregistrements de conversation BEAT2 (1 428, 4 langues,
# dictionnaire_humain.py) tirés selon l'émotion de son jeu ; l'écoute se prend dans les vrais silences des conversations.
# MOCAP_SOURCE=cmu revient à l'ancienne bibliothèque seule (comparaison A/B)
SOURCE = os.environ.get('MOCAP_SOURCE', 'beat2+cmu')
BEAT_PAR_REPLIQUE = int(os.environ.get('MOCAP_BEAT_N', '40'))
# ÉCHELLE DESSIN ANIMÉ : la conversation naturelle de BEAT2 est 2,4 à 5 fois plus petite que le jeu d'acteur CMU sur lequel le
# moteur est réglé (crête à crête médiane sur 3 s, 38 prises CMU du vocabulaire contre 200 enregistrements BEAT2 pendant la
# parole, mesuré le 19/10/2026 : buste 11,8° / 2,7°, torsion 21,5° / 6,4°, roulis de tête 18,4° / 5,5°, tangage 34,5° / 6,9°,
# lacet 38,5° / 9,1°, avant-bras 68,5° / 28,4°). Le geste BEAT2 garde son rythme et sa forme, son ampleur est portée à celle
# du jeu d'acteur (exagération des animateurs) ; la souplesse (SPARC) ne dépend pas de l'ampleur
# vivacité pleine (°/s, vitesses lissées sur 0,3 s, fenêtres de 3 s) = 3e quartile des prises CMU : parole (avant-bras + ½ tête)
# 155 (médiane 102 ; BEAT2 exagéré : 124), écoute (tête) 64 (médiane 55)
VIVACITE, VIVACITE_ECOUTE = 155.0, 64.0
EXAG_BEAT2 = {'buste': 4.44, 'buste_lacet': 3.36, 'tete': 3.34, 'tete_tangage': 5.02, 'tete_lacet': 4.23, 'lever': 2.41}
EXAG_TETE = (EXAG_BEAT2['tete'] + EXAG_BEAT2['tete_tangage'] + EXAG_BEAT2['tete_lacet']) / 3
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
    if dh.est_cle(trial): return dh.charge(trial)
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


_MAUV = {}


def _mauvais_cache(trial, c):
    if trial not in _MAUV:
        if len(_MAUV) > 600: _MAUV.clear()
        _MAUV[trial] = _mauvais(c)
    return _MAUV[trial]


def _repos(c, s):
    """angle de lever « bras au repos » de la prise (bas de la distribution)."""
    return float(np.percentile(c[f'lever_{s}'], 10))


def choisir(prises, duree, cibles, deja=(), graine=0, tempos=(0.85, 1.0, 1.18), ecoute=False, types=()):
    """meilleure (prise, début, tempo) pour une réplique de `duree` s dont les syllabes accentuées sont à `cibles` (s).
    Calcul vectorisé (toutes les fenêtres d'une prise d'un coup) : les enregistrements BEAT2 durent des minutes. Coût :
    écart moyen syllabe → apex (≤ 0,35 s), apex orphelins pendant la parole, tempo, reprise d'un passage déjà joué ; BEAT2 :
    le locuteur doit PARLER pendant la réplique (sinon ses gestes ne sont pas des gestes de parole), bonus quand un geste
    annoté du type voulu (déictique pour accuser…) la couvre ; écoute : seulement des temps où il se tait."""
    best = None; rng = np.random.default_rng(graine); cib = np.asarray(sorted(cibles), np.float64)
    zones = []   # voisinage (± 0,3 s) des syllabes, fusionné, en temps de la réplique
    for t in cib:
        za, zb = max(0.0, t - 0.3), min(duree, t + 0.3)
        if zones and za <= zones[-1][1]: zones[-1][1] = max(zones[-1][1], zb)
        elif za <= zb: zones.append([za, zb])
    codes = [dh.CODE_TYPE[t] for t in types if t in dh.CODE_TYPE]
    for trial in prises:
        c = extraire(trial); n = int(c['n']); bad = _mauvais_cache(trial, c)
        if ecoute and 'parole' in c: bad = bad | c['parole']
        apx = np.sort(np.asarray(c['apex'], np.float64)); okc = np.r_[0, np.cumsum(bad)]
        par = np.r_[0, np.cumsum(c['parole'])] if ('parole' in c and not ecoute) else None
        d_ = lambda k_: np.abs(np.diff(_lisse(c[k_], 9)))   # vitesse lissée (0,3 s) : le tremblé fin, que les filtres retirent, ne compte pas
        if not ecoute:   # vivacité : vitesse des avant-bras et de la tête pendant la parole (°/s)
            v_ = d_('lever_l') + d_('lever_r') + 0.5 * (d_('tete_tangage') + d_('tete_lacet'))
            ex = EXAG_BEAT2['lever'] if dh.est_cle(trial) else 1.0; viv = VIVACITE
        else:            # écoute : l'auditeur garde les mains au repos mais hoche, penche, tourne la tête (Hladek et al. 2025)
            v_ = d_('tete_tangage') + d_('tete_lacet') + d_('tete')
            ex = EXAG_TETE if dh.est_cle(trial) else 1.0; viv = VIVACITE_ECOUTE
        act = np.r_[0, np.cumsum(np.r_[v_, 0.0] * FPS * ex)]
        sem = None
        if codes and 'sem_type' in c and np.any(np.isin(c['sem_type'], codes)):
            sem = np.r_[0, np.cumsum(np.where(np.isin(c['sem_type'], codes), c['sem_force'], 0.0))]
        for k in tempos:
            L = int(round((duree + PRE + POST) * FPS * k)); kF = k * FPS
            if L >= n: continue
            S = np.arange(0, n - L, 3); S = S[okc[S + L] - okc[S] == 0]
            if not len(S): continue
            Sf = S.astype(np.float64)
            if len(cib):
                if len(apx):
                    T = Sf[:, None] + (cib[None, :] + PRE) * kF; i = np.searchsorted(apx, T)
                    dr = np.where(i < len(apx), apx[np.minimum(i, len(apx) - 1)] - T, np.inf)
                    dr = np.where(T + dr < Sf[:, None] + L, dr, np.inf)
                    dl = np.where(i > 0, T - apx[np.maximum(i - 1, 0)], np.inf)
                    dl = np.where(T - dl >= Sf[:, None], dl, np.inf)
                    cout = np.minimum(0.35, np.minimum(dr, dl) / kF).mean(1)
                else: cout = np.full(len(S), 0.35)
            else: cout = np.zeros(len(S))
            lo, hi = Sf + PRE * kF, Sf + (PRE + duree) * kF
            orph = (np.searchsorted(apx, hi, 'right') - np.searchsorted(apx, lo, 'left')).astype(np.float64)
            for za, zb in zones:
                orph -= np.searchsorted(apx, Sf + (zb + PRE) * kF, 'right') - np.searchsorted(apx, Sf + (za + PRE) * kF, 'left')
            rec = np.zeros(len(S))
            for (t1, a1, b1) in deja:
                if t1 == trial: rec = np.maximum(rec, np.maximum(0, np.minimum(Sf + L, b1) - np.maximum(Sf, a1)) / L)
            # écoute : pas de pénalité d'apex (ses apex sont des hochements, bienvenus) — elle choisissait les fenêtres figées
            cout = cout + (0.0 if ecoute else 0.04) * orph + 0.15 * abs(math.log(k)) + 0.8 * rec + 0.01 * rng.random(len(S))
            ilo, ihi = lo.astype(int), np.minimum(hi.astype(int), n)
            if par is not None: cout += 0.25 * (1.0 - (par[ihi] - par[ilo]) / np.maximum(1, ihi - ilo))
            if sem is not None: cout -= 0.12 * np.minimum(1.0, 2.0 * (sem[ihi] - sem[ilo]) / np.maximum(1, ihi - ilo))
            if ecoute: ilo, ihi = Sf.astype(int), np.minimum((Sf + L).astype(int), n)
            cout -= (0.15 if ecoute else 0.10) * np.minimum(1.0, (act[ihi] - act[ilo]) / np.maximum(1, ihi - ilo) / viv)
            j = int(np.argmin(cout))
            if best is None or cout[j] < best[0]: best = (float(cout[j]), trial, int(S[j]), k)
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


def couche(L, cibles, fps, nf, jeu='', graine=0, ecoute=False, echelle=400.0, cote=0.0, deja=None, bras=(), doublures=None):
    """canaux (unités du moteur) pour la fenêtre [t0 − PRE, t0 + dur + POST] de la réplique L (nf images à fps = 30),
    centrés sur la pose du dessin et fondus aux bords. echelle : pixels par mètre du personnage ; cote : signe du
    partenaire à l'écran (+1 à droite) ; bras : côtés ('l'/'r') des calques d'avant-bras du personnage, dans l'ordre."""
    assert fps == FPS
    tags = ECOUTE if ecoute else INTENTION.get(jeu, INTENTION[''])
    prises = [c for t_ in tags for c in _disponibles(t_)] if 'cmu' in SOURCE else []
    # écoute : BEAT2 seulement si demandé (MOCAP_SOURCE=…+ecoute). Mesuré le 19/10/2026 sur le sketch du bulletin (tête crête à
    # crête par seconde d'écoute, après tout le moteur) : Baye 3,0° avec les prises CMU d'écoute contre 2,6° avec les silences
    # BEAT2, Petit Mamadou 6,3° contre 4,0° ; l'auditeur garde ses vrais hochements BEAT2 (hochements())
    if 'beat2' in SOURCE and (not ecoute or 'ecoute' in SOURCE): prises += dh.candidats(jeu, ecoute, graine, BEAT_PAR_REPLIQUE, doublures)
    if not prises: return {}, None
    duree = max(0.2, nf / FPS - PRE - POST); deja = set() if deja is None else deja
    ch = choisir(prises, duree, [] if ecoute else list(cibles), deja, graine, ecoute=ecoute,
                 types=() if ecoute else dh.JEU_TYPE.get(jeu, dh.JEU_TYPE['']))
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
    bt = dh.est_cle(trial); ex = lambda k_: EXAG_BEAT2.get(k_, 1.0) if bt else 1.0
    pris = lambda k_: _echantillonne(c[k_], r) * ex(k_)
    centre = lambda x: x - float(np.mean(x))
    out = {'buste': sg * g * centre(pris('buste')), 'buste_lacet': sg * g * centre(pris('buste_lacet')),
           'tete': sg * g * centre(pris('tete')), 'tete_tangage': g * centre(pris('tete_tangage')),
           'tete_lacet': sg * g * centre(pris('tete_lacet')),
           'epaules': g * echelle * np.maximum(0.0, pris('epaules') - float(np.percentile(c['epaules'], 20))),
           'bassin_x': sg * g * echelle * centre(pris('bassin_x') - _lisse(pris('bassin_x'), 61))}
    if not ecoute:
        for i, s_ in enumerate(bras):
            src = ('r' if s_ == 'l' else 'l') if miroir else s_
            lv = _echantillonne(c[f'lever_{src}'], r)
            # BEAT2 : l'orateur garde souvent les mains levées devant lui pendant toute la phrase ; mesuré au repos de toute la
            # prise, le geste saturerait (bras figé en haut). Repos pris DANS la fenêtre : le bras part du dessin, bat, revient
            rep = max(_repos(c, src), float(np.percentile(lv, 10))) if bt else _repos(c, src)
            lev = np.maximum(0.0, lv - rep) * ex('lever')
            out[f'geste_{i}'] = np.clip(lev / 75.0, 0, 1) ** 0.9
    out = {k_: (v * env).astype(np.float32) for k_, v in out.items()}
    info = {'prise': trial, 'debut_s': round(s / FPS, 2), 'tempo': k, 'miroir': miroir, 'cout': round(float(ch[0]), 3)}
    if dh.est_cle(trial):
        I = dh.index().get(trial, {}); info.update(source='BEAT2', locuteur=I.get('locuteur'), emotion=dh.emotion(I))
        info['_rangs'] = r   # rangs de la prise lus image par image : le visage du même humain y est lu (visage_humain.fenetre)
    return out, info


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
        if 'beat2' in SOURCE:   # + vrais hochements d'AUDITEURS : silences des conversations BEAT2 (le locuteur écoute)
            n_cmu = len(_NODS); I = dh.index(); conv = sorted(k for k, c in I.items() if c.get('sorte') is not None and c['sorte'] % 2 == 1 and c.get('n_mots', 0) > 0)
            for t_ in conv:
                if len(_NODS) >= 600: break
                c = dh.charge(t_); tg = c['tete_tangage']; bad = _mauvais_cache(t_, c) | c['parole']
                vt = _lisse(np.r_[0, np.diff(tg)] * FPS, 3)
                for j in c['apex'].astype(int):
                    if a <= j < len(tg) - b and not bad[max(0, j - a - 15):j + b + 15].any() and vt[max(0, j - 6):j].max() > 25:
                        seg = tg[j - a:j + b] - tg[j - a]; seg = seg - np.linspace(0, seg[-1], len(seg))
                        if 2.0 <= np.ptp(seg) <= 14.0: _NODS.append(seg.astype(np.float32))
            # hochement naturel plus discret que celui des acteurs (19/10/2026 : crête médiane 4,8° contre 7,1°) : porté à
            # l'ampleur médiane CMU, forme intacte, jamais au-delà de 14°
            if 0 < n_cmu < len(_NODS):
                k_ = float(np.median([np.ptp(x) for x in _NODS[:n_cmu]]) / np.median([np.ptp(x) for x in _NODS[n_cmu:]]))
                _NODS[n_cmu:] = [(x * min(k_, 14.0 / float(np.ptp(x)))).astype(np.float32) for x in _NODS[n_cmu:]]
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
