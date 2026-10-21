# SYNCHRO LABIALE PAR CHOIX D'IMAGES (21/10/2026) — défaut qui se verrait sur 10 000 vidéos : le clip « parler » de la banque
# était joué en boucle aller-retour sans rapport avec la voix, la bouche s'ouvrait au hasard des syllabes. Sans nouveau modèle :
#  1. ouverture des lèvres sur chaque image du clip, mesurée une fois (MediaPipe FaceLandmarker, Apache-2.0, déjà en cache :
#     points 13/14 rapportés à la hauteur du visage, moteur-troupe/visage_mesure.py) → <clip>.bouche.json ;
#  2. enveloppe de la voix de la réplique (énergie par image de sortie, lissée, ramenée entre 0 et 1) ;
#  3. programmation dynamique sur l'aller-retour du clip : pour chaque image de sortie, l'image du clip dont la bouche suit la
#     voix, en avançant à vitesse normale de préférence (pause, ×2 ou ×3 permis mais pénalisés) — le corps garde son mouvement
#     continu, la bouche s'ouvre sur les syllabes et se ferme dans les silences.
# Mesure : corrélation entre ouverture des lèvres montrée et énergie de la voix, avant/après (ordre_mesure).
import json, os, subprocess, sys
import numpy as np

ICI = os.path.dirname(os.path.abspath(__file__))
FPS_CLIP = 16
PENALITE = {0: 0.35, 1: 0.0, 2: 0.25, 3: 0.6}   # pause, vitesse normale, ×2, ×3 (en unités d'écart d'ouverture au carré)
# MOUVEMENT DU CORPS ESCAMOTÉ (21/10/2026, épisode banque 1 v8 : 9 sautes dans les scènes, contre 0 dans celles de la V1 —
# vues image par image : la main de l'Agent Doumbia apparaît ou disparaît d'une image à l'autre, à 40,97 → 41,03 s, 43,03 →
# 43,10 s et 46,37 → 46,50 s). Un pas ×2 ou ×3 pris pendant un geste du bras fait parcourir en 2 images ce qui en demande 6 ;
# une pause pendant un geste le fige. Comme les « Video Textures » (Schödl, Szeliski, Salesin, Essa, SIGGRAPH 2000), où une
# transition coûte l'écart visuel qu'elle crée, chaque pas paie le mouvement du corps qu'il escamote (pas ×2, ×3) ou retient
# (pause), mesuré une fois par clip ; la bouche suit toujours la voix, mais le corps n'accélère que quand il est calme.
# MESURÉ SUR L'ÉPISODE (v9, 21/10/2026) : sautes 17,2 → 20,2 par minute, corps qui bouge 0,180 → 0,171 — la cause n'était pas
# là (voir boucle()) ; la pénalité reste disponible (LEVRES_CORPS=1) mais n'est plus appliquée par défaut.
CORPS = float(os.environ.get('LEVRES_CORPS', '0'))


def ouverture(mp4):
    """ouverture des lèvres par image du clip (cache <clip>.bouche.json) ; None si aucun visage n'est lu."""
    cache = mp4[:-4] + '.bouche.json'
    if os.path.isfile(cache): return np.array(json.load(open(cache)), float)
    try:
        import cv2
        sys.path.insert(0, os.path.join(ICI, '..', 'moteur-troupe')); import visage_mesure as V
    except Exception:
        return None
    cap = cv2.VideoCapture(mp4); L = []
    while True:
        ok, im = cap.read()
        if not ok: break
        haut = cv2.resize(im[:int(im.shape[0] * 0.32)], None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)   # tête agrandie
        m = V.mesure(haut); L.append(m['levres'] if m else np.nan)
    q = np.array(L, float)
    if np.isnan(q).all(): return None
    i = np.arange(len(q)); q = np.interp(i, i[~np.isnan(q)], q[~np.isnan(q)])   # image sans visage lu : interpolée
    json.dump([round(float(x), 4) for x in q], open(cache, 'w'))
    return q


def mouvement(mp4):
    """mouvement du corps d'une image du clip à la suivante (écart moyen des images réduites à 48 × 80, gris), longueur N ;
    cache <clip>.corps.json ; None si le clip ne se lit pas."""
    cache = mp4[:-4] + '.corps.json'
    if os.path.isfile(cache): return np.array(json.load(open(cache)), float)
    try:
        import cv2
    except Exception:
        return None
    cap = cv2.VideoCapture(mp4); prev = None; M = []
    while True:
        ok, im = cap.read()
        if not ok: break
        g = cv2.resize(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), (48, 80), interpolation=cv2.INTER_AREA).astype(np.float32)
        if prev is not None: M.append(float(np.abs(g - prev).mean()))
        prev = g
    if not M: return None
    M.append(M[-1]); tmp = f'{cache}.{os.getpid()}'
    json.dump([round(x, 3) for x in M], open(tmp, 'w')); os.replace(tmp, cache)
    return np.array(M, float)


def enveloppe(wav, n, fps):
    """énergie de la voix par image de sortie, lissée sur ±1 image, ramenée à [0, 1] (silence → 0)."""
    from scipy.io import wavfile
    sr, y = wavfile.read(wav); y = y.astype(float)
    if y.ndim > 1: y = y.mean(1)
    pas = sr / fps; e = np.zeros(n)
    for t in range(n):
        s = y[int(t * pas):int((t + 1) * pas)]
        e[t] = np.sqrt(np.mean(s * s)) if len(s) else 0.0
    e = np.convolve(e, [0.25, 0.5, 0.25], mode='same')
    bas, haut = np.percentile(e, 10), np.percentile(e, 95)
    return np.clip((e - bas) / max(haut - bas, 1e-9), 0, 1)


def aller_retour(N):
    """aller-retour du clip qui RALENTIT avant chaque retournement (21/10/2026 : le retournement sec à pleine vitesse était un
    à-coup mesuré, 2,3 par minute contre 0,8 sur la V1) : les deux dernières images de chaque bout sont tenues un peu."""
    if N < 6: return list(range(N)) + list(range(N - 2, 0, -1))
    aller = list(range(N - 2)) + [N - 2, N - 2, N - 1, N - 1, N - 1]
    retour = list(range(N - 3, 1, -1)) + [1, 1, 0, 0, 0]
    return aller + retour


def boucle(m, N):
    """(g0, c0) du clip : début du grand geste et début de la pose tenue de fin (images c0 … N-1), lus sur son mouvement
    (mouvement()) ; None si le clip bouge d'égal à égal du début à la fin, ou sans pose tenue d'au moins 6 images.
    GESTE JOUÉ UNE FOIS (21/10/2026, épisode banque 1 v9 : 25 sautes et 4 à-coups, vus image par image) : 17 clips de la banque
    sur 19 ont la même forme — départ calme, grand geste rapide au milieu (mains vers la casquette, main au visage), pose tenue
    à la fin. L'aller-retour rejouait chaque geste À L'ENVERS (la main redescend par le chemin de la montée, 40,9 s et 47,6 s),
    et la synchro labiale l'accélérait : un retour en arrière est l'à-coup même que mesure la V1. Comme les « Video Textures »
    (Schödl et al., SIGGRAPH 2000), on ne boucle que là où la boucle ne se voit pas : la pose tenue."""
    if m is None or len(m) != N or N < 12: return None
    m = np.asarray(m, float); p10, p90 = np.percentile(m, 10), np.percentile(m, 90)
    if p90 < 2.0 * p10: return None
    vif = m > 0.5 * (p10 + p90)                   # m[i] : de l'image i à i+1
    i, n = N - 1, 0                                # pose tenue : remonte la fin calme, sursauts de 2 images au plus compris
    while i >= 0 and n < 3:
        n = n + 1 if vif[i] else 0; i -= 1
    c0 = i + 4 if n >= 3 else 0
    while c0 < N and vif[c0]: c0 += 1
    if N - c0 < 6 or c0 == 0: return None
    g0, i, trou = c0 - 1, c0 - 1, 0                # geste : la suite d'images vives avant la pose, trous de 2 images au plus
    while i > 0 and trou <= 2:
        i -= 1
        if vif[i]: g0, trou = i, 0
        else: trou += 1
    return g0, c0


def parcours(N, bc, n_min):
    """images du clip : le clip une fois en entier (geste compris, fin tenue un peu), puis aller-retour lent sur la pose
    tenue c0 … N-1, jusqu'à n_min images au moins."""
    g0, c0 = bc; L = N - c0; ar = aller_retour(L); h = len(ar) // 2
    Q = list(range(N - 2)) + [N - 2, N - 2, N - 1, N - 1, N - 1]; cycle = [c0 + x for x in ar[h:] + ar[:h]]
    while len(Q) < n_min: Q += cycle
    return Q


LIBRES = ('parler', 'ecouter')   # clips de fond de jeu : la bouche choisit de montrer le geste ou la pose tenue


def impose(mov):
    """le geste du clip est-il l'intention de jeu de la réplique (choc, mentir, montrer…) ? Il est alors toujours joué ; pour
    « parler » et « écouter », la synchro labiale choisit (mesuré sur 19 clips × 8 voix, 21/10/2026 : geste imposé partout,
    lèvres/voix 0,39 ; jamais imposé, 0,53 mais geste montré 30 % du temps)."""
    return os.path.basename(mov).split('--')[-1].split('@')[0].split('.')[0] not in LIBRES


def ordre(q, e, fps, poids=None, m=None, impose=True):
    """indices d'images du clip (geste joué une fois puis boucle sur la pose tenue — boucle() — sinon aller-retour) pour chaque
    image de sortie, la bouche suivant l'enveloppe e. poids (par image
    de sortie, 21/10/2026) : force de la contrainte de bouche — faible quand l'acteur écoute (le corps garde sa vitesse
    normale au lieu de s'arrêter sur les images bouche fermée). m : mouvement du corps du clip (mouvement()) — les pas qui
    l'escamotent ou le retiennent sont pénalisés (CORPS)."""
    N = len(q); n = len(e); bc = boucle(m, N)
    Q = parcours(N, bc, int(3.5 * n * FPS_CLIP / fps) + 2 * N) if bc else aller_retour(N)
    K = max(1, round(len(Q) * fps / FPS_CLIP)); pos = [min(len(Q) - 1, int(k * FPS_CLIP / fps)) for k in range(K)]
    # POSITION EXACTE (21/10/2026, épisode banque 1 v9) : le clip à 16 images/s passait à 30 en tenant une image puis en sautant,
    # et une image d'échantillon sur 15 avançait de deux images du clip — en plein geste rapide, une saute. Chaque image de
    # sortie montre maintenant l'instant exact du clip (fractionnaire), rendu par interpolation de flux (camera_v1.image_a)
    def exacte(k):
        x = k * FPS_CLIP / fps; i = pos[k]; a, b = Q[i], Q[min(i + 1, len(Q) - 1)]
        return a + (x - i) * (b - a) if abs(b - a) == 1 else float(a)
    R = [round(exacte(k), 3) for k in range(K)]
    qr = np.interp(R, np.arange(N), q); lo, hi = np.percentile(q, 10), np.percentile(q, 90); ech = max(hi - lo, 1e-4)
    cible = lo + e * (hi - lo)
    cout = ((qr[None, :] - cible[:, None]) / ech) ** 2                   # n × K
    if poids is not None: cout = cout * np.asarray(poids, float)[:, None]
    pen = dict(PENALITE)
    if m is not None and len(m) == N and CORPS > 0:
        a = np.array(R); b = np.roll(a, -1)
        mR = np.where(a == b, 0.0, np.asarray(m, float)[np.floor(np.minimum(a, b)).astype(int)] * np.abs(a - b))   # de R[k] à R[k+1]
        ech = max(float(np.percentile(mR[mR > 0], 90)) if (mR > 0).any() else 0.0, 1e-3)
        sup = {0: np.roll(mR, 1), 1: np.zeros(K), 2: np.roll(mR, 2), 3: np.roll(mR, 2) + np.roll(mR, 3)}   # escamoté / retenu
        pen = {d: p + CORPS * (sup[d] / ech) ** 2 for d, p in PENALITE.items()}
    D = cout[0].copy(); arr = np.zeros((n, K), int)
    if bc:   # parcours sans retour : départ avant le geste ; pendant le geste, sa vitesse propre (ni pause, ni saut)
        un = np.array([p < N + 3 for p in pos]); R_ = np.array(R)
        depart = un & (R_ <= bc[0])
        if not impose: depart |= ~un & (np.array(pos) < N + 3 + 2 * (N - bc[1]))   # ou dans la pose tenue
        D[~depart] = np.inf
        geste = un & (R_ >= bc[0]) & (R_ < bc[1]); pen = {d: p + np.where(geste, 1e9, 0.0) if d != 1 else p for d, p in pen.items()}
    for t in range(1, n):
        best = np.full(K, np.inf); arg = np.zeros(K, int)
        for d, p in pen.items():
            Dd = np.roll(D, d)
            if bc and d: Dd[:d] = np.inf                                     # pas de retour au début du parcours
            c = Dd + p                                                       # venir de k-d avec un pas d
            m = c < best; best[m] = c[m]; arg[m] = d
        D = best + cout[t]; arr[t] = arg
    k = int(np.argmin(D)); chemin = [k]
    for t in range(n - 1, 0, -1):
        k = (k - arr[t, k]) % K; chemin.append(k)
    return [R[k] for k in chemin[::-1]]


def ordre_mesure(q, e, fps):
    """(corrélation avant, après) entre ouverture montrée et énergie de la voix ; avant = aller-retour à vitesse normale."""
    N = len(q); Q = aller_retour(N)
    avant = [Q[int(t * FPS_CLIP / fps) % len(Q)] for t in range(len(e))]
    apres = ordre(q, e, fps)
    c = lambda s: (lambda v: float(np.corrcoef(v, e)[0, 1]) if np.std(v) > 0 and np.std(e) > 0 else 0.0)(np.interp(s, np.arange(N), q))
    return round(c(avant), 3), round(c(apres), 3), apres


def images(mov):
    """images RGBA du clip détouré, extraites une fois (<mov>.images/0001.png …)."""
    d = mov[:-4] + '.images'
    if not os.path.isdir(d) or not os.listdir(d):
        os.makedirs(d, exist_ok=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mov, '-vsync', '0', '-pix_fmt', 'rgba', os.path.join(d, '%04d.png')], check=True)
    return sorted(os.path.join(d, f) for f in os.listdir(d) if f.endswith('.png'))


def ordre_voix(mov, mp4, wav, dur, fps, n_images):
    """indices des images du clip (n_images) pour chaque image de sortie, la bouche suivant la voix ; None si la mesure est
    impossible (rendu image par image de camera_v1)."""
    q = ouverture(mp4)
    if q is None or len(q) != n_images: return None
    n = max(1, int(round(dur * fps))); return ordre(q, enveloppe(wav, n, fps), fps, m=mouvement(mp4), impose=impose(mov))


def liste_concat(mov, mp4, wav, dur, fps, chemin_liste):
    """liste ffmpeg (concat) des images du clip dans l'ordre qui suit la voix ; None si la mesure est impossible."""
    q = ouverture(mp4); ims = images(mov)
    if q is None or len(q) != len(ims): return None
    n = max(1, int(round(dur * fps))); e = enveloppe(wav, n, fps); s = ordre(q, e, fps, m=mouvement(mp4), impose=impose(mov))
    with open(chemin_liste, 'w') as f:
        for i in s: f.write(f"file '{ims[int(round(i))]}'\nduration {1 / fps:.6f}\n")
        f.write(f"file '{ims[int(round(s[-1]))]}'\n")   # le démultiplexeur concat ignore la durée de la dernière entrée
    return chemin_liste
