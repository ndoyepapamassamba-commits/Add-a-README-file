# PISTES DE JEU ET RESSENTI (17/10/2026) — demandes : « des mouvements qui ne sont pas fluides, des mouvements statiques,
# des personnages qui ne parlent pas » ; « Petit Mamadou face à la caméra qui parle, ça n'a pas de sens : il devrait faire
# face à ses parents » ; « toutes les expressions du visage… par rapport à ce que l'on ressent ».
# Pour chaque personnage et pour tout le film, une valeur par image et par canal : buste (roulis, lacet), tête (roulis,
# lacet, tangage), regard, souffle, épaules, bassin (pieds plantés), gestes des bras, émotions du visage.
#   1. À QUI je parle : l'interlocuteur nommé dans la réplique (« a »), sinon celui qui vient de parler, sinon le suivant ;
#      tête, regard et buste se tournent vers lui ; celui qui écoute regarde celui qui parle (« camera » : aparté au public).
#   2. RESSENTI (modèle d'évaluation des événements d'Ortony, Clore & Collins 1988, réécrit pour la comédie) : chaque réplique
#      fait naître une émotion chez celui qui parle (son jeu), chez celui à qui elle s'adresse (l'accusé prend peur) et chez
#      les témoins ; l'émotion monte en 0,25 s, tient pendant la réplique, retombe avec une demi-vie de 2 s ; elle se lève
#      0,4 s AVANT qu'un personnage ne parle (il réagit d'abord) ; la chute surprend tout le monde.
#   3. FLUIDITÉ : chaque canal suit sa cible par un ressort à amortissement critique (second ordre) — aucune vitesse ne saute,
#      l'accélération est bornée ; amplitudes bornées par l'ENVELOPPE mesurée du personnage (rig2d.enveloppe).
import json, math, os, re, zlib
import numpy as np

OMEGA = {'buste': 7.0, 'buste_lacet': 6.0, 'tete': 10.0, 'tete_lacet': 9.0, 'tete_tangage': 12.0, 'regard_x': 24.0, 'regard_y': 24.0,
         'souffle': 9.0, 'epaules': 14.0, 'bassin_x': 5.0, 'bassin_y': 6.0, 'geste_0': 9.0, 'geste_1': 9.0}
EMOS = ['joie', 'rire', 'tristesse', 'mecontent', 'colere', 'frustration', 'surprise', 'peur', 'malice', 'soupcon', 'innocent', 'frime', 'emu', 'degout', 'haussement']
JEU_EMO = {'accuse': {'colere': 0.8, 'soupcon': 0.3}, 'innocent': {'innocent': 1.0}, 'malice': {'malice': 1.0}, 'panique': {'peur': 1.0},
           'marchande': {'malice': 0.6, 'soupcon': 0.4}, 'choc': {'surprise': 1.0}, 'rire': {'rire': 1.0}, 'frime': {'frime': 1.0},
           'soupcon': {'soupcon': 1.0}, 'camera': {'malice': 0.7, 'frime': 0.3}, 'colere': {'colere': 1.0}, 'tristesse': {'tristesse': 1.0},
           'emu': {'emu': 1.0}, 'degout': {'degout': 1.0}, 'frustration': {'frustration': 1.0}, 'boude': {'mecontent': 1.0}}
REACTION_CIBLE = {'accuse': {'peur': 0.6, 'innocent': 0.4}, 'malice': {'surprise': 0.5, 'peur': 0.4}, 'panique': {'soupcon': 0.6, 'malice': 0.3},
                  'marchande': {'malice': 0.6}, 'choc': {'surprise': 0.6}, 'rire': {'frustration': 0.7}, 'frime': {'soupcon': 0.6},
                  'soupcon': {'peur': 0.4, 'innocent': 0.5}, 'innocent': {'soupcon': 0.8}, 'camera': {'surprise': 0.3},
                  'tristesse': {'emu': 0.6}, 'emu': {'emu': 0.6}, 'colere': {'peur': 0.5, 'innocent': 0.3}, 'degout': {'degout': 0.5}}
REACTION_TEMOIN = {'accuse': {'soupcon': 0.4, 'malice': 0.2}, 'malice': {'malice': 0.4, 'surprise': 0.3}, 'panique': {'malice': 0.5},
                   'marchande': {'soupcon': 0.4}, 'choc': {'surprise': 0.5}, 'rire': {'joie': 0.6}, 'frime': {'soupcon': 0.5},
                   'soupcon': {'soupcon': 0.3}, 'innocent': {'soupcon': 0.5}}


def _souffle(t, graine):
    """respiration irrégulière (18/10/2026, « animation trop procédurale, pas naturelle » ; REA sur @met4citizen/talkinghead,
    MIT, preuve ev_c88db888…, talkinghead.mjs l. 409-414) : inspiration 1,2 s, pause 0,5 s, expiration 1,0 s, repos 1,5 s,
    chaque cycle allongé ou raccourci de ±20 % (au lieu d'une sinusoïde régulière à 0,25 Hz) → −1 (expiré) … 1 (inspiré)."""
    k, t0 = 0, -((graine * 0.37) % 4.2)
    while True:
        j = 0.8 + 0.4 * ((math.sin(12.9898 * k + 78.233 * graine) * 43758.5453) % 1.0)
        d = (1.2 * j, 0.5 * j, 1.0 * j, 1.5 * j)
        if t < t0 + sum(d): break
        t0 += sum(d); k += 1
    u = t - t0
    if u < d[0]: v = 0.5 - 0.5 * math.cos(math.pi * u / d[0])
    elif u < d[0] + d[1]: v = 1.0
    elif u < d[0] + d[1] + d[2]: v = 0.5 + 0.5 * math.cos(math.pi * (u - d[0] - d[1]) / d[2])
    else: v = 0.0
    return 2.0 * v - 1.0


def _bruit(t, graine):   # bruit doux (somme de sinus incommensurables, Perlin 1995)
    return 0.5 * math.sin(1.31 * t + graine) + 0.3 * math.sin(2.17 * t + 1.7 * graine) + 0.2 * math.sin(3.73 * t + 0.3 * graine)


def attaques(L, graine, garder=0.45):
    """instants (s, depuis le début de la réplique) des attaques de syllabes FORTES de la réplique L (énergie à 100 Hz),
    dont on garde une part au hasard (graine) : de quoi placer des hochements qui suivent la voix sans jamais se répéter."""
    e = np.asarray(L.get('env') or [0.0], np.float32)
    if len(e) < 10: return []
    d = e[8:] - e[:-8]; seuil = max(0.08, float(np.percentile(d, 85)))
    pics = [i + 8 for i in range(1, len(d) - 1) if d[i] >= seuil and d[i] >= d[i - 1] and d[i] >= d[i + 1]]
    rng = np.random.default_rng(int(graine * 1000) + len(e)); out, dernier = [], -1.0
    for i in pics:
        t = i / 100.0
        if t - dernier >= 0.45 and rng.random() < garder: out.append(t); dernier = t
    return out


def bosse(u, duree=0.38):
    """un hochement : creux doux (0 → 1 → 0) de `duree` secondes ; 0 hors de la fenêtre."""
    return math.sin(math.pi * u / duree) ** 2 if 0.0 <= u <= duree else 0.0


def ressort(cible, fps, omega, x0=None):
    """filtre à amortissement critique (x'' = ω²(c − x) − 2ω x'), quatre sous-pas par image."""
    x = float(cible[0] if x0 is None else x0); v = 0.0; out = np.empty(len(cible), np.float32); h = 1.0 / fps / 4
    for i, c in enumerate(cible):
        for _ in range(4):
            a = omega * omega * (c - x) - 2 * omega * v; v += a * h; x += v * h
        out[i] = x
    return out


def borne(x, lim):
    """borne douce (tanh) : rien ne dépasse l'enveloppe, sans coin."""
    return lim * np.tanh(np.asarray(x) / lim) if lim > 1e-6 else np.zeros_like(np.asarray(x, np.float32))


RESERVE_VIVE, RESERVE_HZ = 0.5, 0.3


def borne_vive(x, lim, fps, RG=None):
    """BORNE QUI GARDE LA VIE (19/10/2026) : la tête tournée vers celui qui parle (15° voulus pour 6° d'enveloppe chez Maman)
    saturait la borne douce — tanh à plat, chaque mouvement autour de cette position écrasé ×0,07 : lacet d'écoute 0,8° par
    seconde, buste 0,1°, contre 3,8° et 3,2° chez l'humain (BEAT2). La position lente (sous RESERVE_HZ) ne prend plus que
    RESERVE_VIVE de l'enveloppe (le visage LivePortrait porte le reste du regard vers l'autre) ; le mouvement rapide garde
    l'autre part, des deux côtés. Rien ne dépasse l'enveloppe."""
    x = np.asarray(x, np.float64); r = (RG or {}).get('reserve_vive', RESERVE_VIVE)
    if r >= 1.0 or len(x) < 16 or lim <= 1e-6: return borne(x, lim)
    from scipy.signal import butter, filtfilt
    lent = filtfilt(*butter(2, RESERVE_HZ / (fps / 2.0)), x)
    return borne(borne(lent, r * lim) + (x - lent), lim)


GAIN_VIF_MAX = 3.0   # l'ampleur rendue au mouvement rapide ne dépasse pas ×3 (au-delà, c'est du bruit qu'on grossirait)
GAIN_VIF_MIN = 0.6   # ni ne descend sous ×0,6 (les virages vers l'interlocuteur restent francs)
TOURS_AMPLEUR = 2    # ampleur rendue puis garde de souplesse, deux fois : la garde rabote, le second tour rend


def ampleur_humaine(x, parle, fps, c, lim, RG=None, scene=None):
    """AMPLEUR HUMAINE APRÈS LA SOUPLESSE (19/10/2026) : les gardes de souplesse (filtre, garde SPARC de la porte Q) rendent
    la forme du mouvement aussi souple que l'humain mais en rabotent l'ampleur — mesuré sur les 7 acteurs de l'ep01 : buste
    3,2° par seconde de parole avant les gardes, 1,0° après, contre 3,7° chez l'humain (BEAT2). L'indice SPARC ne dépend
    pas de l'ampleur : la part rapide (au-dessus de RESERVE_HZ) est remise à la médiane humaine par seconde (NORME_SECONDE ×
    MARGE_DESSIN, parole et écoute séparées, fondues en 0,3 s), entre ×GAIN_VIF_MIN et ×GAIN_VIF_MAX, puis bornée
    dans l'enveloppe (borne_vive), passée à la garde d'à-coups, puis à la garde de souplesse SANS marge : seules les fenêtres
    plus raides que les 10 % les plus raides des humains sont lissées (une petite enveloppe, roulis à 2°, se déforme contre sa
    borne : SPARC p10 −5,71 contre −5,51 ; au tournage du bulletin, buste −5,29 contre −5,05 sans cette garde). La garde
    rabotant l'ampleur, le tout est fait TOURS_AMPLEUR fois."""
    x = np.asarray(x, np.float64)
    if len(x) < 2 * fps or lim <= 1e-6: return x.astype(np.float32)
    from scipy.signal import butter, filtfilt
    n1 = int(fps); pa = np.asarray(parle, bool)[:len(x)]; sc = np.ones(len(x), bool) if scene is None else np.asarray(scene, bool)[:len(x)]
    bornes = ((RG or {}).get('gain_vif_min', GAIN_VIF_MIN), (RG or {}).get('gain_vif_max', GAIN_VIF_MAX))
    k_ = max(1, int(0.3 * fps)); w = np.clip(np.convolve(pa.astype(float), np.ones(k_) / k_, 'same'), 0, 1)
    y = x
    for tour in range(int((RG or {}).get('tours_ampleur', TOURS_AMPLEUR))):   # la garde rabote l'ampleur : on la rend, on regarde
        lent = filtfilt(*butter(2, RESERVE_HZ / (fps / 2.0)), y); vif = y - lent; g = np.ones(2)
        for k, m in ((0, pa & sc), (1, ~pa & sc)):
            js = [j for j in range(0, len(x) - n1 + 1, n1) if m[j:j + n1].mean() > 0.5]
            if not js: continue
            for _ in range(4):   # médiane par seconde du signal ENTIER (comme la norme humaine et la porte), ajustée sur la part rapide
                med = float(np.median([np.ptp(lent[j:j + n1] + g[k] * vif[j:j + n1]) for j in js]))
                if med <= 1e-3: break
                g[k] = float(np.clip(g[k] * MARGE_DESSIN * NORME_SECONDE[c][k] / med, *bornes))
        y = lisse_acc(borne_vive(lent + (w * g[0] + (1 - w) * g[1]) * vif, lim, fps, RG), fps)
        # seules les fenêtres plus raides que les 10 % les plus raides des humains sont lissées (garde sans marge)
        if (RG or {}).get('garde_souplesse', 1): y = garde_souplesse(y, fps, c, marge=0.0)
    return y


ACC_FLUIDE = 2.2   # à-coup maximal d'une piste de pose (2e différence, degrés par image²) ; la porte I du film admet 2,5


def lisse_acc(x, fps, acc=ACC_FLUIDE):
    """GARDE DE FLUIDITÉ (18/10/2026) — porte I de la v28 : seul le tangage de la tête dépassait (2e différence 2,6 à 4,9
    pour 2,5 admis), à cause des hochements captés ajoutés sans filtre. Le ressort critique est passé dans les deux sens
    (aucun retard sur la parole), du plus raide au plus doux, jusqu'à ce que l'à-coup tienne sous `acc` ; une piste déjà
    fluide n'est pas touchée et le hochement garde son ampleur, seule sa pointe d'accélération est arrondie."""
    x = np.asarray(x, np.float32)
    pire = lambda y: float(np.abs(y[2:] - 2 * y[1:-1] + y[:-2]).max()) if len(y) > 2 else 0.0
    if pire(x) <= acc: return x
    for om in (60.0, 45.0, 34.0, 26.0, 20.0, 15.0, 11.0):
        y = ressort(ressort(x, fps, om)[::-1], fps, om)[::-1]
        if pire(y) <= acc: break
    return np.ascontiguousarray(y, np.float32)


# SOUPLESSE MESURÉE CONTRE DE VRAIS HUMAINS (18/10/2026) — remarque de l'utilisateur : « Affine les mouvements en les rendant
# plus souples ». Indice SPARC (Balasubramanian et al., 2015, arc spectral de la vitesse : plus proche de 0 = plus souple)
# par fenêtre de 4 s, sur les pistes des ep01 v5 et ep02 v1 contre 39 prises de capture CMU (vrais corps) : tête tournée
# −4,17 contre −3,58 (10 % les plus raides −6,61 contre −5,14), buste tourné −3,99 contre −3,73 (−7,30 contre −5,16).
# Lissage SANS DÉPHASAGE (Butterworth d'ordre 2, aller-retour) à la coupure qui ramène chaque articulation au niveau humain
# ou mieux, médiane ET 10 % les plus raides, en gardant 94 à 96 % de l'ampleur du jeu de moins de 2 s : rotations 2 Hz,
# hochements, inclinaisons et buste 2,5 Hz (le hochement garde plus de vivacité). La prise de choc (take comique) garde
# son claquement : là où elle joue, la piste brute est reprise en fondu.
SUIVI_TETE_HZ = 4.5   # action décalée tête/buste au retard humain mesuré (33 ms CMU ; 35 ms ici)
PRISE_HZ = 3.0
SOUPLESSE = {'tete_lacet': 2.0, 'buste_lacet': 2.0, 'lacet_visage': 2.0, 'tete': 2.5, 'tete_tangage': 2.5, 'buste': 2.5}


def souple(x, fps, fc, garde=None):
    from scipy.signal import butter, filtfilt
    x = np.asarray(x, np.float64)
    if len(x) < 16 or fc >= 0.45 * fps: return x.astype(np.float32)
    y = filtfilt(*butter(2, fc / (fps / 2.0)), x)
    y = np.clip(y, x.min(), x.max())                       # aucun extrême nouveau : les bornes de l'enveloppe tiennent
    if garde is not None:
        # PRISE DE CHOC VIVE MAIS SANS TREMBLEMENT (18/10/2026, mesuré sur la v7) : la piste brute reprise pendant la prise
        # laissait les 10 % de fenêtres les plus raides sous le niveau humain (tête tournée −5,22 contre −5,15 ; tête −5,60
        # contre −5,51). Lissée à PRISE_HZ (3 Hz, plus vive que le jeu à 2–2,5 Hz), simulation sur les pistes de la v7 :
        # −5,01 et −5,19, toutes les articulations au niveau humain, ampleur gardée à 99,3–100,4 %.
        xr = np.clip(filtfilt(*butter(2, min(PRISE_HZ, 0.45 * fps) / (fps / 2.0)), x), x.min(), x.max())
        y = y * (1 - garde) + xr * garde
    return y.astype(np.float32)


# ── GARDE DE SOUPLESSE (19/10/2026) — porte Q de l'épisode 1 v10 : les 10 % de fenêtres les plus raides de la tête (roulis)
#    passaient sous le niveau humain (−5,97 contre −5,51), selon les prises de capture tirées pour chaque nouvelle frise ; le
#    filtre fixe (souple) ne regarde pas le résultat. La garde calcule EXACTEMENT la mesure de la porte (SPARC sur fenêtres de
#    4 s où l'articulation bouge, fluidite.sparc) et n'adoucit que les fenêtres plus raides que le seuil humain (+ marge),
#    par un ressort critique passé dans les deux sens, fondu en cosinus sur la fenêtre : l'ampleur du reste est intacte.
SOUPLESSE_MARGE = 0.2


def garde_souplesse(x, fps, c, marge=SOUPLESSE_MARGE):
    import fluidite as FL
    try: seuil = json.load(open(FL.SEUILS))['souplesse'][c]['p10'] + marge
    except Exception: return np.asarray(x, np.float32)
    y = np.asarray(x, np.float64).copy(); fen = int(round(4.0 * fps)); n = len(y)
    if n <= fen: return y.astype(np.float32)
    def raides(z):
        out = []
        for i in range(0, n - fen, max(1, fen // 24)):   # pas fin : les fenêtres de la porte partent du début de chaque plan
            v = np.abs(np.gradient(z[i:i + fen])) * fps
            if v.mean() > 1.0 and FL.sparc(v, fps) < seuil: out.append(i)
        return out
    for om in (14.0, 10.0, 7.0, 5.0):
        bad = raides(y)
        if not bad: break
        lisse = ressort(ressort(y, fps, om)[::-1], fps, om)[::-1].astype(np.float64)
        w = np.zeros(n)
        for i in bad:
            a, b = max(0, i - fen // 4), min(n, i + fen + fen // 4); k = np.arange(b - a)
            w[a:b] = np.maximum(w[a:b], 0.5 - 0.5 * np.cos(2 * np.pi * (k + 0.5) / (b - a)))
        y = y * (1 - w) + lisse * w
    return y.astype(np.float32)


# ── MOTEUR IMAGE → VIDÉO (17/10/2026) : DYNAMIQUE DU SECOND ORDRE, avec anticipation et dépassement. Les ressorts critiques
# (ci-dessus) n'ont ni l'un ni l'autre : les mouvements démarrent et s'arrêtent « sans poids » (avis de JEV : « aucune
# anticipation, aucun dépassement, aucun mouvement qui suit », vrai à 0,74–0,75). Système y + k1·y' + k2·y'' = x + k3·x'
# (k1 = ζ/(π f), k2 = 1/(2π f)², k3 = r·ζ/(2π f)), intégré par Euler semi-implicite avec la borne de stabilité
# k2 ≥ max(T²/2 + T·k1/2, T·k1) (méthode publiée par t3ssel8r, 2022, « Giving Personality to Procedural Animations using
# Math », réécrite) : f = fréquence propre (Hz, vitesse de réaction), ζ < 1 = dépassement puis retour (le « follow-through »
# des animateurs de Disney), r < 0 = ANTICIPATION (le mouvement part d'abord un peu à l'envers, comme l'élan avant un geste).
DYN = {'buste': (1.4, 0.75, 0.0), 'buste_lacet': (1.2, 0.70, -0.15), 'tete': (2.2, 0.60, 0.0), 'tete_lacet': (2.0, 0.62, -0.25),
       'tete_tangage': (2.6, 0.55, 0.0), 'regard_x': (14.0, 1.0, 0.0), 'regard_y': (14.0, 1.0, 0.0), 'souffle': (1.5, 1.0, 0.0),
       'epaules': (2.5, 0.55, 0.0), 'bassin_x': (0.9, 0.70, 0.0), 'bassin_y': (1.2, 0.80, 0.0), 'geste_0': (2.0, 0.60, -0.3),
       'geste_1': (2.0, 0.60, -0.3)}


def dynamique(x, fps, f, zeta, r, sous_pas=4):
    """réponse du système du second ordre (f Hz, ζ, r) au signal x (une valeur par image), partie au repos sur x[0]."""
    x = np.asarray(x, np.float64); k1 = zeta / (math.pi * f); k2 = 1.0 / (2 * math.pi * f) ** 2; k3 = r * zeta / (2 * math.pi * f)
    T = 1.0 / fps / sous_pas; k2s = max(k2, T * T / 2 + T * k1 / 2, T * k1)
    y = float(x[0]); yd = 0.0; xp = float(x[0]); out = np.empty(len(x), np.float32)
    for i, xn in enumerate(x):
        xd = (xn - xp) * fps; xp = xn
        for _ in range(sous_pas):
            y += T * yd; yd += T * (xn + k3 * xd - y - k1 * yd) / k2s
        out[i] = y
    return out


# ── REGARD VIVANT (moteur image → vidéo, 17/10/2026 ; avis de JEV : « yeux morts », vrai à 0,69–0,75). Méthode publiée,
# réécrite : Lee, Badler & Badler, « Eyes Alive », SIGGRAPH 2002 — deux régimes, celui qui PARLE et celui qui ÉCOUTE :
# l'auditeur regarde son partenaire bien plus longtemps (regard mutuel ~75 % du temps contre ~41 % pour le locuteur, valeurs
# reprises par SmartBody) ; le locuteur détourne les yeux en commençant une phrase (charge de pensée) et revient vers
# l'autre en la finissant (Kendon 1967). Saccades rapides (25 ms + 2,4 ms par degré), micro-fixations sur le visage du
# partenaire (yeux ↔ bouche), la tête suit les grands déplacements du regard (~30 %, 80 ms après les yeux). CLIGNEMENTS :
# ~26 par minute en conversation, un tiers de plus en écoutant qu'en parlant ; un clignement accompagne souvent un grand
# changement de regard et la fin d'une phrase ; fermeture 75 ms, tenue 25 ms, ouverture 150 ms (la paupière remonte plus
# lentement qu'elle ne tombe).
def yeux(T, parle, debut_phrase, fin_phrase, vers, fps, graine, vers_y=None, peint=(0.0, 0.0), vise=None):
    """→ (regard_x, regard_y, apport au lacet de tête en degrés, clignement 0..1), une valeur par image.
    parle : bool par image ; debut_phrase / fin_phrase : instants (s) de mes répliques ; vers : direction du partenaire
    (−1 … 1, 0 = caméra) par image ; vers_y : hauteur de son visage (> 0 = plus bas que mes yeux) ; peint : direction
    du regard déjà peinte dans le dessin (fraction de la course de l'iris) ; vise : bool par image (quelqu'un à regarder).
    REGARD DANS L'AXE (v36) : la cible est le VISAGE du partenaire (côté ET hauteur), moins ce que le dessin regarde déjà —
    « Mamie ne regarde pas Baye » : iris peint en haut de l'œil, Baye assis plus bas, le moteur ne visait que le côté."""
    n = len(T); rng = np.random.default_rng(int(graine * 1000) + 7)
    vy = np.zeros(n) if vers_y is None else np.asarray(vers_y, np.float64)
    ok = (np.abs(np.asarray(vers, np.float64)) > 0) if vise is None else np.asarray(vise, bool)
    bx_ = np.where(ok, 0.88 * np.asarray(vers, np.float64) - peint[0], 0.0); by_ = np.where(ok, 0.88 * vy - peint[1], 0.0)
    gx = np.zeros(n); gy = np.zeros(n); i = 0; cible = (0.0, 0.0); depart = (0.0, 0.0); d_sac = 1; sacc = []
    debuts = sorted(debut_phrase); i_debuts = [int(round(d * fps)) for d in debuts]
    # QUAND UN AUTRE PREND LA PAROLE, le regard le rejoint ~150 ms après (porte D de la v28 : Maman Nounou fixait encore Baye
    # pendant les répliques de Petit Mamadou, 28 % des images d'écoute ; les auditeurs suivent le changement de locuteur au
    # moment de la prise de parole — Holler & Kendrick 2015) : la fixation en cours est interrompue, la suivante est mutuelle
    i_vers = sorted({min(n - 1, k + int(round(0.15 * fps))) for k in range(1, n) if abs(float(vers[k]) - float(vers[k - 1])) > 0.5})
    rejoint = set(i_vers)
    while i < n:
        t = T[i]; p = bool(parle[i]); base = float(bx_[i]); base_y = float(by_[i])
        d0 = next((d for d in debuts if 0 <= t - d < 0.25), None)
        # CELUI QUI PARLE S'ADRESSE À SON PARTENAIRE (18/10/2026, porte D « regards vers le partenaire ») : avec les chiffres de
        # la conversation réelle (Kendon : l'orateur regarde ~40 % du temps, détourne les yeux en prenant la parole), ceux qui
        # parlent étaient sous ceux qui écoutent sur les trois versions mesurées (JEV, moyenne 0,62–0,65 contre 0,67–0,71) ;
        # en ep01 v3 les 4 fautes étaient des orateurs, en ep02 v1 Tantie Awa « parle à » Modou 0,33–0,50 et l'écoute 0,62–0,66.
        # Dans un sketch filmé, on parle EN REGARDANT l'autre : détour bref et rare en prenant la parole, fixation majoritaire
        if d0 is not None and rng.random() < 0.3:    # je commence à parler : je détourne brièvement les yeux le temps de penser
            ax = -np.sign(base or 1.0) * rng.uniform(0.2, 0.35); ay = rng.choice([0.25, -0.15, 0.35]) * rng.uniform(0.5, 1.0)
            nouveau = (base * 0.5 + ax, base_y * 0.5 + ay); duree = rng.uniform(0.3, 0.5)
        elif i in rejoint or rng.random() < (0.7 if p else 0.75):   # regard mutuel : micro-fixation sur le visage du partenaire
            nouveau = (base + rng.normal(0, 0.05), base_y + rng.normal(0.04, 0.035)); duree = rng.gamma(2.0, (0.85 if p else 1.4) / 2.0)
        else:                                          # ailleurs : amplitude exponentielle, souvent de côté ou vers le bas
            A_ = float(np.clip(rng.exponential(0.3), 0.12, 0.6)); a = rng.choice([0.0, np.pi, 0.5 * np.pi, 0.75 * np.pi, 0.25 * np.pi, -0.5 * np.pi], p=[0.25, 0.25, 0.2, 0.1, 0.1, 0.1])
            nouveau = (base * 0.5 + A_ * math.cos(a), base_y * 0.5 + A_ * math.sin(a) * 0.7); duree = rng.gamma(2.0, (0.45 if p else 0.5) / 2.0)
        nouveau = (float(np.clip(nouveau[0], -2.2, 2.2)), float(np.clip(nouveau[1], -2.2, 2.2)))   # bornes finales : regard.applique
        amp = math.hypot(nouveau[0] - cible[0], nouveau[1] - cible[1]); depart = (gx[i - 1], gy[i - 1]) if i else cible
        d_sac = max(1, int(round((0.025 + 0.0024 * 30.0 * amp) * fps)))   # course complète des yeux ≈ 30°
        sacc.append((i, amp)); cible = nouveau
        j1 = min(n, i + max(d_sac + 1, int(duree * fps)))
        j1 = min([j1] + [k for k in i_debuts + i_vers if i + d_sac < k < j1])   # une phrase qui commence interrompt la fixation
        for j in range(i, j1):
            u = min(1.0, (j - i + 1) / d_sac); e = u * u * (3 - 2 * u)
            gx[j] = depart[0] + (cible[0] - depart[0]) * e; gy[j] = depart[1] + (cible[1] - depart[1]) * e
        i = j1
    # la tête accompagne les grands déplacements du regard (≈ 30 % au-delà de la position de base, 80 ms après les yeux)
    lacet = 0.3 * 25.0 * np.r_[np.zeros(int(0.08 * fps)), (gx - bx_)[:n - int(0.08 * fps)]]
    # clignements : processus de Poisson (18/min en parlant, 26/min en écoutant), réfractaire 0,6 s, + regard et fin de phrase
    cl = np.zeros(n); dernier = -9.0; evts = []
    for k in range(n):
        t = T[k]; taux = (18.0 if parle[k] else 26.0) / 60.0 / fps
        if t - dernier > 0.6 and rng.random() < taux: evts.append(t); dernier = t
    for (k, amp) in sacc:
        if amp > 0.3 and rng.random() < 0.5 and T[k] - dernier > 0.6: evts.append(T[k]); dernier = T[k]
    for tf in fin_phrase:
        if rng.random() < 0.5: evts.append(tf + rng.uniform(0.0, 0.15))
    for tb in evts:
        u = T - tb
        prof = np.where(u < 0, 0.0, np.where(u < 0.075, (u / 0.075) ** 2, np.where(u < 0.1, 1.0, np.where(u < 0.25, 1 - np.clip((u - 0.1) / 0.15, 0, 1) ** 1.5, 0.0))))
        cl = np.maximum(cl, prof)
    return gx.astype(np.float32), gy.astype(np.float32), lacet.astype(np.float32), np.clip(cl, 0, 1).astype(np.float32)


def interlocuteur(L, lignes, acteurs):
    """à qui s'adresse la réplique : champ « a », sinon un nom dit dans la phrase, sinon le précédent, sinon le suivant."""
    if L.get('a') in acteurs: return L['a']
    autres = [a for a in acteurs if a != L['qui']]
    txt = ' ' + re.sub(r"[^\w']+", ' ', L.get('texte', L.get('txt', ''))).lower() + ' '
    for a in autres:
        for mot in a.lower().split():
            if len(mot) > 2 and mot not in ('petit', 'grand', 'maman', 'papa') and f' {mot} ' in txt: return a
    meme = [x for x in lignes if x['sketch'] == L['sketch']]
    i = meme.index(L) if L in meme else -1
    for j in range(i - 1, -1, -1):
        if meme[j]['qui'] != L['qui']: return meme[j]['qui']
    for j in range(i + 1, len(meme)):
        if meme[j]['qui'] != L['qui']: return meme[j]['qui']
    return autres[0] if autres else None


# AMPLEUR DU JEU (18/10/2026, « l'animation des personnages, les mouvements des personnages ») : mesurés contre 39 prises de
# conversation captées (CMU), nos personnages bougeaient ~10 fois moins que des humains (tête tournée : vitesse médiane
# 0,9 °/s contre 18,8 ; ampleur sur 3 s 1,7° contre 17,9). La capture humaine n'utilisait que 45 à 80 % de l'enveloppe
# validée contre l'étirement des dessins : la TÊTE (hors mesure d'étirement du corps) en prend désormais 90 à 100 % — les
# extrêmes restent bornés par l'enveloppe ; le buste, déjà à la limite d'étirement (Maman Nounou 0,06), ne change pas
FRAC = {'buste': 0.8, 'buste_lacet': 0.8, 'tete': 1.0, 'tete_lacet': 0.9, 'tete_tangage': 0.9, 'bassin_x': 0.8}
LACET_ECOUTE = 4.0   # degrés : lacet minimal de l'écouteur vers celui qui parle (porte D : > 2° dans 75 % des images)
PRISE_TEMPS = 0.25   # s : temps où l'on « encaisse » la chute avant la prise (le gros plan de réaction commence 0,05 s après la fin
                     # de la chute : la prise se voit EN ENTIER à l'écran au lieu d'arriver avant la coupe, comme dans la v2)
def prise_t(L): return L['t0'] + L['dur'] + 0.05 + PRISE_TEMPS
BOUCHE_BEE = 0.6   # commande de mâchoire au sommet de la prise de choc (0,6 : bouche franchement ouverte sans crier)
BUSTE_SUIT, BUSTE_SUIT_OMEGA = 0.32, 6.0   # part de la rotation de la tête reprise par le buste ; vitesse du ressort (rad/s)
LACET_3S_HUMAIN = 11.0   # ° : lacet de tête crête à crête sur 3 s, médiane humaine 9,3° (BEAT2) × 1,2 de marge dessin animé
NORME_SECONDE = {'tete_lacet': (4.7, 3.8), 'tete_tangage': (4.1, 3.6), 'tete': (3.0, 2.5), 'buste': (1.4, 1.2), 'buste_lacet': (3.7, 3.2)}
# ° crête à crête par seconde, médiane humaine (parole, écoute) : BEAT2, 204 enregistrements, 19/10/2026 (tête : lacet, tangage,
# roulis ; buste : penché, lacet) ; tête entière ≥ 3° sur 85 % des secondes de parole et 78 % d'écoute, buste ≥ 2° sur 74 % / 67 %
MARGE_DESSIN = 1.2   # le dessin animé joue un peu plus grand que nature (même marge que LACET_3S_HUMAIN)
VISAGE_PART = float(os.environ.get('VISAGE_PART', 0.5))   # part de la rotation du visage (LACET_VISAGE) donnée à la capture humaine
LACET_VISAGE = 18.0   # 18/10/2026 : champ de rotation lissé (expressions_lp._lisse_flux) ; A/B JEV du plan de Baye (47 images) : 18° → 24 fautives, 0 déformée, rendu moyen 0,46 ; 14° → 25 et 0 (regard trop faible, porte D : Maman → Baye 0,36) ; 22° brut → 40 et 3
PENCHE_FRAC = 0.6   # part de l'enveloppe du buste prise par le penché d'engagement de l'orateur (19/10/2026)
PENCHE_JEU = {'accuse': 1.0, 'marchande': 0.9, 'soupcon': 0.85, 'panique': 0.6, 'innocent': 0.5, 'choc': -0.7, 'rire': -0.5, 'frime': -0.6}   # < 0 : se redresse, recule
ECOUTE_CENTRE = 4.0     # degrés : position lente de l'auditeur vers l'orateur après les normes humaines (oscillations ±2° par-dessus)
LACET_ECOUTE_MIN = 3.5   # degrés : plancher d'écoute après toutes les couches (porte D : > 2° dans 75 % des images)
NEGATIFS = ('tristesse', 'mecontent', 'colere', 'frustration', 'peur', 'soupcon', 'degout')
GAIN_HAUSSE, GAIN_SOURIRE = 1.0, 0.6   # sourire capté joué à 60 % de la « joie » dessinée : sourire de parole, pas éclat de joie
LIM = {'buste': 3.0, 'buste_lacet': 9.0, 'tete': 6.0, 'tete_lacet': 20.0, 'tete_tangage': 9.0, 'bassin_x': 4.0}


def _poser(dst, src, i0, mode='add'):
    """pose src dans dst à partir de l'image i0 (bords du film coupés) : somme, ou maximum (gestes)."""
    a, b = max(0, i0), min(len(dst), i0 + len(src))
    if b <= a: return
    if mode == 'max': dst[a:b] = np.maximum(dst[a:b], src[a - i0:b - i0])
    else: dst[a:b] += src[a - i0:b - i0]


def couche_humaine(nom, L_sk, a_qui, cote, nf, fps, echelle, cotes_bras, graine, journal, visage=None):
    """couche « vrai humain » (mocap_jeu) du personnage pour tout le sketch : une prise par réplique (geste calé sur ses
    syllabes accentuées), une prise calme pour chaque temps d'écoute (≤ 6 s), fondues entre elles. Valeurs brutes
    (degrés, pixels), mises à l'échelle de l'enveloppe par pistes()."""
    import mocap_jeu as mj
    M = {c: np.zeros(nf) for c in FRAC}; G = [np.zeros(nf) for _ in cotes_bras]; deja = set(); occupe = np.zeros(nf, bool)
    mes = [x for x in L_sk if x['qui'] == nom]
    try:   # doublures BEAT2 : le style gestuel du personnage reste le même d'une réplique et d'un épisode à l'autre
        import dictionnaire_humain as dh, controle_troupe as ct
        dbl = dh.doublures(nom, ct.carte(nom)[0])
    except Exception:
        dbl = None
    vh = None   # visage du même humain (visage_humain) : rempli dans `visage` si demandé
    if visage is not None:
        try: import visage_humain as vh
        except Exception: vh = None
        visage.update(haussement=np.zeros(nf, np.float32), sourire=np.zeros(nf, np.float32)); v_occ = np.zeros(nf, bool)
    for k, L in enumerate(mes):
        cib = attaques(L, graine + 0.11 * k, garder=1.0)
        i0 = int(round((L['t0'] - mj.PRE) * fps)); n_ = int(round((L['dur'] + mj.PRE + mj.POST) * fps))
        lay, info = mj.couche(L, cib, fps, n_, L.get('jeu', ''), graine=int(graine * 100) + k, echelle=echelle,
                              cote=cote(a_qui[id(L)]), deja=deja, bras=cotes_bras, doublures=dbl)
        if not lay: continue
        rangs = info.pop('_rangs', None)
        for c in M: _poser(M[c], lay.get(c, np.zeros(n_)), i0)
        for b in range(len(cotes_bras)): _poser(G[b], lay.get(f'geste_{b}', np.zeros(n_)), i0, 'max')
        occupe[max(0, i0):max(0, i0 + n_)] = True
        if vh is not None:   # sourcils et sourire de la MÊME prise aux MÊMES rangs ; sinon une vraie parole de ses doublures
            fv = vh.fenetre(info['prise'], rangs) if rangs is not None else None
            if fv is None: fv = vh.segment(dbl, n_, graine=int(graine * 100) + k, parole=True); info['visage'] = 'BEAT v1, parole d\'une doublure'
            else: info['visage'] = 'BEAT v1, même prise'
            if fv is not None:
                for c in visage: _poser(visage[c], fv[c], i0, 'max')
                v_occ[max(0, i0):max(0, i0 + n_)] = True
        journal.append({'qui': nom, 't0': round(L['t0'], 2), 'role': 'parle', **info})
    if not L_sk: return M, G, occupe
    t_deb = min(x['t0'] for x in L_sk) - 0.8; t_fin = max(x['t0'] + x['dur'] for x in L_sk) + 2.5
    i, b_ = max(0, int(t_deb * fps)), min(nf, int(t_fin * fps)); s_ = 0
    while i < b_:   # temps d'écoute : prises calmes, à cheval sur les fondus des répliques voisines
        if occupe[i]: i += 1; continue
        j = i
        while j < b_ and not occupe[j] and j - i < 6 * fps: j += 1
        i0 = max(0, i - int(0.25 * fps)); n_ = min(nf, j + int(0.35 * fps)) - i0
        if n_ >= int(0.8 * fps):
            lay, info = mj.couche(None, [], fps, n_, '', graine=int(graine * 100) + 50 + s_, ecoute=True, echelle=echelle, deja=deja,
                                  doublures=dbl)
            if info: info.pop('_rangs', None)
            for c in M:
                if lay: _poser(M[c], lay.get(c, np.zeros(n_)), i0)
            if info: journal.append({'qui': nom, 't0': round(i0 / fps, 2), 'role': 'ecoute', **info})
            s_ += 1
        i = j
    if vh is not None:   # temps d'écoute : le visage d'un humain qui écoute (silences des conversations de ses doublures)
        i, b_ = max(0, int(t_deb * fps)), min(nf, int(t_fin * fps)); s_ = 0; f_ = max(1, int(0.3 * fps))
        while i < b_:
            if v_occ[i]: i += 1; continue
            j = i
            while j < b_ and not v_occ[j]: j += 1
            i0 = max(0, i - f_); n_ = min(nf, j + f_) - i0
            fv = vh.segment(dbl, n_, graine=int(graine * 100) + 70 + s_, parole=False); s_ += 1
            if fv is not None:
                w = np.ones(n_, np.float32); w[:f_] = np.linspace(0, 1, f_); w[-f_:] = np.minimum(w[-f_:], np.linspace(1, 0, f_))
                for c in visage: _poser(visage[c], fv[c] * w, i0, 'max')
            i = j
    return M, G, occupe


def pistes(lignes, sketch, acteurs, position, assis, enveloppes, nf, fps, bras=None, echelles=None, cotes_bras=None, reglages=None, journal=None,
           visee=None, peints=None):
    """pistes de jeu du sketch. acteurs : noms ; position : {nom: x écran} ; assis : {nom: bool} ;
    enveloppes : {nom: {buste, tete, epaules, bassin_x}} ; bras : {nom: nombre de calques de bras} ; echelles : {nom: pixels
    par mètre} ; cotes_bras : {nom: ['l'|'r', …] par calque} ; reglages : {mocap (gain max, 0 = sans), dyn, yeux, suivi_tete}
    → {nom: {canal: array}} (+ « cligne » quand le regard vivant est actif). visee : {nom: {autre: (hauteur de regard en
    fraction de course, inclinaison en degrés)}} — où est le VISAGE de l'autre vu de mes yeux ; peints : {nom: (x, y)}
    direction du regard peint dans le dessin (v36)."""
    RG = {'mocap': 1.0, 'dyn': 1, 'yeux': 1, 'suivi_tete': 1, 'ampleur': 1.0, 'lacet_visage': LACET_VISAGE}; RG.update(reglages or {})
    if RG['ampleur'] != 1.0:   # essai de diagnostic (JEV) : enveloppes agrandies — le corps peut-il jouer plus grand ?
        enveloppes = {n: {k: (v * RG['ampleur'] if isinstance(v, (int, float)) and k != 'lacet_peint' else v) for k, v in e.items()} for n, e in enveloppes.items()}
    T = np.arange(nf) / fps; L_sk = [L for L in lignes if L['sketch'] == sketch]
    a_qui = {id(L): interlocuteur(L, lignes, acteurs) for L in L_sk}
    out = {}; journal = [] if journal is None else journal
    for nom in acteurs:
        g = (zlib.crc32(nom.encode()) % 1000) / 100.0; env = enveloppes.get(nom, {}); x_me = position[nom]
        C = {k: np.zeros(nf, np.float32) for k in OMEGA}; E = {e: np.zeros(nf, np.float32) for e in EMOS}
        cote = lambda autre: float(np.sign(position.get(autre, x_me) - x_me)) if autre else 0.0
        # « Je ne veux rien de procédural, je veux que tout soit naturel » (17/10) : avec la capture, plus aucun bruit de
        # synthèse — balancements, hochements et gestes viennent tous de vrais humains
        humain = RG['mocap'] > 0; kb = 0.0 if humain else 1.0
        vers = np.zeros(nf); parle_ = np.zeros(nf, bool); vers_y = np.zeros(nf); vise = np.zeros(nf, bool); VI = (visee or {}).get(nom, {})
        # ── ressenti : événements (rise 0,25 s, tient, demi-vie 2 s), anticipation 0,4 s avant ma réplique
        def evenement(t0, t1, emo, k):
            for e, v in emo.items():
                if e not in E: continue
                u = T - t0; montee = np.clip(u / 0.25, 0, 1); apres = np.where(T > t1, 0.5 ** ((T - t1) / 2.0), 1.0)
                E[e] = np.maximum(E[e], (k * v * montee * apres * (T >= t0 - 1e-6)).astype(np.float32))
        for L in L_sk:
            t0, t1 = L['t0'], L['t0'] + L['dur']; j = L.get('jeu', '')
            if L['qui'] == nom: evenement(t0 - 0.4, t1, JEU_EMO.get(j, {}), 1.0)
            elif a_qui[id(L)] == nom: evenement(t0 + 0.3, t1, REACTION_CIBLE.get(j, {}), 0.85)
            else: evenement(t0 + 0.4, t1, REACTION_TEMOIN.get(j, {}), 0.6)
        # ── PRISE DE CHOC (« take » des animateurs) sur la chute, pour ceux qui la subissent (18/10/2026 : « revoir le visage
        #    du choc de la fin — Maman, la femme du maquis, la dame du loyer sont choquées ») : la v2 posait bien la surprise
        #    (0,91–0,94 mesurés au début du gros plan) mais rien ne se voyait — bouche close (aucune réplique : lèvres jointes)
        #    et sourcils haussés annulés par la colère et le soupçon mêlés. La prise : la surprise domine (les autres ressentis
        #    s'effacent), la mâchoire tombe (bouche bée), dépassement puis tenue vivante qui retombe doucement.
        prise = np.zeros(nf, np.float32)
        for L in L_sk:
            if L.get('chute') and L['qui'] != nom:
                u = T - prise_t(L)
                attaque = np.clip(u / 0.18, 0, 1); attaque = attaque * attaque * (3 - 2 * attaque)
                retombe = np.clip((u - 0.18) / 0.3, 0, 1); retombe = retombe * retombe * (3 - 2 * retombe)
                tenue = 1.0 - 0.18 * np.clip((u - 0.48) / 3.0, 0, 1)
                prise = np.maximum(prise, np.where(u < 0, 0.0, attaque * (1.12 - 0.17 * retombe) * tenue).astype(np.float32))
        if prise.any():
            for e in EMOS:
                if e != 'surprise': E[e] = (E[e] * (1 - 0.85 * np.clip(prise, 0, 1))).astype(np.float32)
            E['surprise'] = np.maximum(E['surprise'], np.clip(prise, 0, 1)).astype(np.float32)
        ATT = {(nom, id(x)): attaques(x, g + 0.37 * k) for k, x in enumerate(L_sk) if x['qui'] != nom}
        MOI = {id(x): attaques(x, g + 0.11 * k, garder=0.6) for k, x in enumerate(L_sk) if x['qui'] == nom}   # mes syllabes fortes
        # ── cibles des canaux, image par image
        for i, t in enumerate(T):
            L = next((x for x in L_sk if x['t0'] <= t <= x['t0'] + x['dur'] and x['qui'] == nom), None)
            S = next((x for x in L_sk if x['t0'] <= t <= x['t0'] + x['dur'] and x['qui'] != nom), None)
            avant = [x for x in L_sk if x['t0'] + x['dur'] < t]; apres_ = [x for x in L_sk if x['t0'] > t]
            if L: focus = a_qui[id(L)]
            elif S: focus = S['qui']
            else: focus = (avant[-1]['qui'] if avant and avant[-1]['qui'] != nom else (apres_[0]['qui'] if apres_ and apres_[0]['qui'] != nom else None))
            sd = cote(focus); aparte = L is not None and L.get('jeu') == 'camera'
            parle = L is not None
            if aparte: sd = 0.0
            vers[i] = sd; parle_[i] = parle
            vy_, incl_ = VI.get(focus, (0.0, 0.0)) if (focus and not aparte) else (0.0, 0.0); vers_y[i] = vy_; vise[i] = bool(focus) or aparte
            # ce qui manque au visage peint — mais l'écouteur tourne TOUJOURS un peu la tête vers celui qui parle (18/10, v33 :
            # visage déjà peint de trois quarts → lacet ajouté nul, l'écoute ne se voyait plus ; porte D 0,00–0,54 au lieu de ≥ 0,75)
            C['tete_lacet'][i] = sd * max(0.0 if parle else LACET_ECOUTE, (18.0 if parle else 12.0) - sd * env.get('lacet_peint', 0.0))
            pk = (peints or {}).get(nom, (0.0, 0.0)) if vise[i] else (0.0, 0.0)
            C['regard_x'][i] = sd * (0.85 if parle else 0.95) - pk[0]
            C['buste_lacet'][i] = sd * (7.0 if parle else 4.0)
            roll = kb * 1.2 * _bruit(0.6 * t, g + 1); tang = kb * 0.8 * _bruit(0.7 * t, g + 2); buste = kb * 0.8 * _bruit(0.35 * t, g + 3)
            souffle = 0.006 * _souffle(t, g); ep = 0.0; bx = kb * 1.5 * _bruit(0.12 * t, g + 4); by = 0.0
            if parle:
                u = t - L['t0']; e = L['env'][min(len(L['env']) - 1, max(0, int(u * 100)))]
                # hochements sur MES syllabes fortes : une bosse douce de 0,34 s par attaque retenue (v25). L'ancienne cible
                # 30 × (montée d'énergie en 80 ms) sautait de 20° en une image : 2,5°/image² mesurés (porte I), la tête tressautait
                # (avec la capture, ses propres hochements calés sur les mêmes syllabes font l'essentiel : moitié moins ici)
                tang += (0.0 if humain else 1.0) * (3.5 * sum(bosse(u - a_, 0.34) for a_ in MOI[id(L)]) + 1.5 * e)
                roll += kb * 2.4 * e * _bruit(2.3 * u, g + 7)              # la tête accompagne la phrase, sans balancier régulier (17/10)
                souffle += 0.006 * (1 - min(1.0, u / max(0.5, L['dur'])))   # on parle en expirant
                j = L.get('jeu', ''); k = min(1.0, u / 0.3) * (1 - max(0.0, min(1.0, (u - L['dur'] + 0.3) / 0.4)))
                if j in ('accuse', 'marchande', 'soupcon'): buste += 2.5 * sd * k; bx += 3.0 * sd * k
                if j == 'choc': buste -= 2.0 * (sd or 1) * k; tang -= 4.0 * k; bx -= 2.0 * (sd or 1) * k
                if j == 'panique': buste += 0.9 * math.sin(2 * math.pi * 2.6 * u) * k; ep += 2.0 * k
                if j == 'rire': ep += 2.5 * (0.5 + 0.5 * math.sin(2 * math.pi * 4.5 * u)) * k; tang -= 3.0 * k
                if j in ('frime', 'camera'): tang -= 2.0 * k; buste -= 1.0 * (sd or 1) * k
            else:
                prochaine = next((x for x in apres_ if x['qui'] == nom), None)
                if prochaine and 0 <= prochaine['t0'] - t < 0.4: souffle += 0.012 * (1 - (prochaine['t0'] - t) / 0.4)   # inspiration avant de parler
                if S:   # ON ÉCOUTE : la tête penche vers celui qui parle et HOCHE sur ses syllabes fortes, 0,25 s après (réaction),
                        # jamais à intervalle fixe — l'ancien sinus à 0,8 Hz faisait « automate » (remarque du 17/10) ; avec la
                        # capture, les hochements sont de VRAIS hochements humains, posés après la boucle
                    roll += 2.0 * sd; uS = t - S['t0']
                    if not humain: tang += 3.0 * sum(bosse(uS - (a_ + 0.25)) for a_ in ATT[(nom, id(S))])
            # silence avant la chute (0,5 s) : MAINTIEN VIVANT (« moving hold » des animateurs de Disney) — la v32 y figeait tout
            # (× 0,3) : 0,8 s figée mesurée, seconde 62 jugée « figée » par JEV (18/10). On garde 60 % du jeu ; celui qui va
            # lancer la chute l'anticipe : il inspire et se penche vers l'autre.
            for x in L_sk:
                if x.get('chute') and -0.5 <= t - x['t0'] < 0:
                    roll *= 0.6; tang *= 0.6; buste *= 0.6
                    if x['qui'] == nom:
                        u_ = (t - x['t0'] + 0.5) / 0.5; buste += 1.5 * (sd or 1.0) * u_; tang += 1.0 * u_; souffle += 0.008 * u_
            C['regard_y'][i] = 0.5 * E['tristesse'][i] + 0.25 * E['emu'][i] - 0.45 * E['innocent'][i]   # + = vers le bas
            if not RG['yeux']: C['regard_y'][i] += 0.9 * vers_y[i] - pk[1]   # sans regard vivant : droit sur le visage visé
            tang += 3.0 * E['tristesse'][i] - 2.0 * E['innocent'][i]   # la tête suit le regard
            if prise[i] > 0: tang -= 5.0 * prise[i]; buste -= 1.5 * (sd or 1.0) * prise[i]   # la prise : la tête recule et monte
            for x in L_sk:   # anticipation de la prise : la tête s'abaisse un peu pendant le temps où l'on « encaisse » (0,25 s)
                if x.get('chute') and x['qui'] != nom and -PRISE_TEMPS <= t - prise_t(x) < 0: tang += 2.0 * bosse(t - prise_t(x) + PRISE_TEMPS, PRISE_TEMPS)
            # v36 : la tête s'incline vers le visage visé (un assis : vers le bas), les yeux font le reste. HAUTEUR PARTAGÉE
            # (18/10/2026, porte D : Tantie Awa → Modou 0,30–0,47 ; JEV : « elle regarde au-dessus de lui » 0,55 sur l'image
            # d'origine → 0,88 animée) : l'iris peint regardait déjà vers le haut (−0,38 de course) et la tête montait EN PLUS
            # de 6° — la tête ne prend que 60 % de ce que le dessin ne regarde pas encore, les yeux le reste (pas de double compte)
            reste_ = incl_ - 30.0 * pk[1] if vise[i] else 0.0
            part_ = float(np.clip(0.6 * reste_, -env.get('tete_tangage', 9.0), env.get('tete_tangage', 9.0)))   # ce que la tête PEUT faire
            tang += part_; vers_y[i] = vers_y[i] - part_ / 30.0
            if focus and not aparte: roll += 0.12 * incl_ * sd   # et penche un peu de son côté (écoute attentive)
            C['tete'][i] = roll; C['tete_tangage'][i] = tang; C['buste'][i] = buste; C['souffle'][i] = souffle; C['epaules'][i] = ep
            C['bassin_x'][i] = 0.0 if assis.get(nom) else bx; C['bassin_y'][i] = by
            # gestes : le bras du côté de l'interlocuteur se lève sur ma réplique, retombe en fin de phrase (sans capture
            # seulement : avec elle, ce sont les gestes du vrai humain, coup par coup, qui jouent)
            if parle and bras and bras.get(nom) and not humain:
                u = t - L['t0']; k = min(1.0, max(0.0, (u - 0.08) / 0.3)) * (1 - max(0.0, min(1.0, (u - L['dur'] + 0.1) / 0.45)))
                mes = [x for x in L_sk if x['qui'] == nom]; rang = mes.index(L) if L in mes else 0
                b = rang % bras[nom]; amp = {'accuse': 1.0, 'marchande': 0.8, 'choc': 0.9, 'panique': 0.7, 'frime': 0.7}.get(L.get('jeu', ''), 0.6)
                C[f'geste_{b}'][i] = amp * k
            # réaction des mains au ressenti (sursaut, peur, colère), même sans parler : le bras le plus libre se lève un peu
            if bras and bras.get(nom):
                r_ = min(1.0, 0.6 * E['surprise'][i] + 0.5 * E['peur'][i] + 0.4 * E['colere'][i] + 0.3 * E['rire'][i])
                C['geste_0'][i] = max(C['geste_0'][i], 0.55 * r_)
        # ── l'auditeur acquiesce avec de VRAIS hochements (courbes de tangage découpées dans la capture de conversation),
        #    0,25 s après une syllabe forte de celui qui parle, un sur deux, jamais deux à moins de 0,9 s
        hoche = np.zeros(nf)
        if humain:
            import mocap_jeu as mj
            nods = mj.hochements(); rng_ = np.random.default_rng(int(g * 1000) + 3); dernier = -9.0
            if nods:
                for S in [x for x in L_sk if x['qui'] != nom]:
                    for a_ in ATT[(nom, id(S))]:
                        tn = S['t0'] + a_ + 0.25
                        if tn - dernier < 0.9 or rng_.random() < 0.5: continue
                        nd = nods[int(rng_.integers(len(nods)))]; _poser(hoche, 0.6 * nd, int(round((tn - 0.25) * fps))); dernier = tn
        # ── regard vivant (saccades, regards détournés, micro-fixations) et clignements ; la tête suit les grands regards
        cl = None
        if RG['yeux']:
            mes = [x for x in L_sk if x['qui'] == nom]
            gx, gy, lac, cl = yeux(T, parle_, [x['t0'] for x in mes], [x['t0'] + x['dur'] for x in mes], vers, fps, g, vers_y, (peints or {}).get(nom, (0.0, 0.0)), vise)
            C['regard_x'] = gx; C['regard_y'] = C['regard_y'] + gy; C['tete_lacet'] = C['tete_lacet'] + lac
        # ── dynamique du second ordre (anticipation, dépassement) ou ressorts critiques (réglage dyn = 0 : moteur v27)
        if RG['dyn']: R = {k: dynamique(v, fps, *DYN[k]) for k, v in C.items()}
        else: R = {k: ressort(v, fps, OMEGA[k]) for k, v in C.items()}
        if RG['yeux']: R['regard_x'], R['regard_y'] = C['regard_x'].astype(np.float32), C['regard_y'].astype(np.float32)   # saccades : déjà leur propre dynamique
        R['tete_tangage'] = (R['tete_tangage'] + hoche).astype(np.float32)   # vrais hochements : tels que captés, sans filtre
        # ── couche « vrai humain » : capture de mouvement CMU calée sur les syllabes, à l'échelle de l'enveloppe
        if humain:
            ech = (echelles or {}).get(nom, 400.0); cb = (cotes_bras or {}).get(nom, [])
            VF_ = {} if RG.get('visage_humain', 1) else None
            M, Gm, occ = couche_humaine(nom, L_sk, a_qui, cote, nf, fps, ech, cb, g, journal, VF_)
            # VISAGE DU MÊME HUMAIN (19/10/2026, « les expressions du visage […] ne sont pas encore exploitées ») : BEAT v1 a capté
            # le visage des locuteurs de BEAT2 sur la même horloge ; haussements de sourcils et sourires de la prise qui donne les
            # gestes (normes mesurées sur 182 conversations, 1 834 min : 6,5 haussements nets par minute, 3,4 sourires francs).
            # Le haussement se joue avec l'entrée « haussement » (sourcils seuls) de la bibliothèque du personnage ; le sourire
            # s'ajoute à la joie, jamais sur un ressenti négatif ni pendant la prise de choc
            if VF_:
                neg_ = np.clip(sum(E[e] for e in NEGATIFS if e in E), 0, 1); calme_ = 1 - np.clip(prise, 0, 1)
                E['haussement'] = np.maximum(E['haussement'], (VF_['haussement'] * RG.get('gain_hausse', GAIN_HAUSSE) * calme_).astype(np.float32))
                E['joie'] = np.maximum(E['joie'], (VF_['sourire'] * GAIN_SOURIRE * (1 - neg_) * calme_).astype(np.float32))
            # ÉCOUTE DÉCOUPLÉE DE LA PAROLE (19/10/2026) : un seul gain par canal, réglé sur les pics (95e centile) de toute la piste,
            # faisait payer à l'écoute les pics des répliques — mesuré sur Baye (bulletin) : gain du lacet 0,98 → 0,66 dès que ses
            # deux répliques prennent des gestes BEAT2, écoute identique mais 30 % plus petite. Gain de la parole et gain de l'écoute
            # calculés chacun sur sa part, fondus en 0,3 s aux frontières
            k_ = max(1, int(0.3 * fps)); w_occ = np.clip(np.convolve(occ.astype(float), np.ones(k_) / k_, 'same'), 0, 1)
            for c_, v_ in M.items():
                lim = 0.0 if (c_ == 'bassin_x' and assis.get(nom)) else env.get(c_, LIM[c_])
                # TÊTE QUI TOURNE COMME UN HUMAIN (18/10/2026, mesuré sur la v7, crête à crête sur 3 s contre 39 conversations
                # CMU) : 6,1° au squelette, 10,8° avec le visage, contre 40,3° chez l'humain. La capture était réduite pour tenir
                # dans l'enveloppe du SQUELETTE (6° pour un dessin de trois quarts) et le visage (LivePortrait, 18°) ne recevait
                # que le peu qui dépassait. Elle est désormais dimensionnée sur le squelette + VISAGE_PART du visage : le
                # squelette reste borné (aucun étirement nouveau), le visage porte le reste
                if c_ == 'tete_lacet' and RG.get('lacet_visage', 0) > 0: lim = lim + VISAGE_PART * RG['lacet_visage']
                def gain_(x):
                    nz = np.abs(x[np.abs(x) > 1e-6]); p95 = float(np.percentile(nz, 95)) if len(nz) else 0.0
                    return min(RG['mocap'], FRAC[c_] * lim / p95) if p95 > 1e-6 else 0.0
                if RG.get('gain_ecoute', 1) and occ.any() and (~occ).any():
                    gain = w_occ * gain_(v_[occ]) + (1 - w_occ) * gain_(v_[~occ])
                else: gain = gain_(v_)
                # TÊTE AUX NORMES HUMAINES (19/10/2026, « la tête doit se tourner selon les normes humaines ») : le lacet de la
                # capture remplissait l'enveloppe à ses pics (réglage du 18/10 sur le jeu d'acteur CMU, 38° crête à crête sur 3 s)
                # — mesuré sur le bulletin : 12,6 à 24° sur 3 s et tête immobile 36 à 58 % du temps, contre 9,3° et 50 % chez
                # l'humain en conversation (BEAT2, 250 enregistrements). Le lacet capté est ramené à LACET_3S_HUMAIN (médiane de
                # ses crêtes à crête sur 3 s), marge dessin animé comprise ; les virages vers l'interlocuteur s'y ajoutent
                if c_ == 'tete_lacet' and RG.get('lacet_humain', 1):
                    act_ = np.flatnonzero(np.abs(v_) > 1e-6)
                    if len(act_) > 3 * fps:
                        g_ = np.asarray(gain, np.float64) * np.ones(len(v_)); y_ = (g_ * v_)[act_[0]:act_[-1] + 1]; n3 = int(3 * fps)
                        m3 = float(np.median([np.ptp(y_[j:j + n3]) for j in range(0, len(y_) - n3, n3 // 2)]))
                        if m3 > LACET_3S_HUMAIN: gain = g_ * (LACET_3S_HUMAIN / m3)
                R[c_] = R[c_] + (gain * v_).astype(np.float32)
            for b, gm in enumerate(Gm):
                if f'geste_{b}' in R: R[f'geste_{b}'] = (1 - (1 - np.clip(R[f'geste_{b}'], 0, 1)) * (1 - np.clip(RG['mocap'] * gm, 0, 1))).astype(np.float32)
        # ── PENCHÉ D'ENGAGEMENT (19/10/2026) : « les personnages ne sont pas encore fluides dans leurs mouvements ». Mesuré sur la
        #    v9 : buste 1,4° crête à crête par seconde (porte « buste » sous 2° dans 21 secondes sur 66) alors que l'enveloppe sans
        #    étirement en permet 4 à 6° assis — la capture, mise à l'échelle sur ses PICS (95e centile), joue presque tout le temps
        #    au tiers de l'enveloppe. Les conversants réels se penchent vers celui à qui ils parlent et se redressent ou reculent
        #    sur la surprise et le rire (Hladek et al. 2025 : le penché avant est le mouvement du tronc qui accompagne l'effort de
        #    se faire comprendre) : l'orateur se penche vers son interlocuteur 0,25 s avant sa réplique (anticipation), tient en
        #    battant légèrement sur ses syllabes fortes, se redresse 0,6 s après ; PENCHE_FRAC de l'enveloppe, signe selon le jeu
        if RG.get('penche', 1) and env.get('buste', 0) > 0:
            pen = np.zeros(nf)
            for x_ in [x for x in L_sk if x['qui'] == nom]:
                sd_ = cote(a_qui[id(x_)])
                if not sd_ or x_.get('jeu') == 'camera': continue
                u_ = T - x_['t0']; at_ = np.clip((u_ + 0.25) / 0.45, 0, 1); re_ = np.clip((u_ - x_['dur']) / 0.6, 0, 1)
                k_ = at_ * at_ * (3 - 2 * at_) * (1 - re_ * re_ * (3 - 2 * re_))
                bat_ = sum(np.where((u_ - a_ >= 0) & (u_ - a_ <= 0.34), np.sin(np.pi * (u_ - a_) / 0.34) ** 2, 0.0) for a_ in MOI.get(id(x_), [])) if MOI.get(id(x_)) else 0.0
                s_ = PENCHE_JEU.get(x_.get('jeu', ''), 0.7)
                pen += sd_ * s_ * k_ * (1.0 + 0.25 * np.clip(bat_, 0, 1.5))
            R['buste'] = (R['buste'] + PENCHE_FRAC * env['buste'] * pen).astype(np.float32)
        # ── ÉCOUTE GARANTIE (v34) : v33, porte D — Coumba écoutait Koffi la tête tournée du bon côté mais de 0,4° à 2° seulement
        # (34,9–35,5 s et 39,9–41,1 s, 0,676 au lieu de 0,75) : la capture de mouvement et les regards détournés, ajoutés APRÈS la
        # cible d'écoute, la rognaient. Plancher doux appliqué après toutes les couches : vers celui qui parle, au moins
        # LACET_ECOUTE_MIN, qui monte et descend avec l'écoute (ressort), sans marche ni coin (max adouci)
        ecoute_ = np.array([0.0 if parle_[i] else float(vers[i]) for i in range(nf)], np.float32)
        Fs = ressort(ecoute_ * LACET_ECOUTE_MIN, fps, 6.0); w_ = np.clip(np.abs(Fs) / LACET_ECOUTE_MIN, 0, 1); s_ = np.sign(Fs)
        x_ = s_ * (Fs - R['tete_lacet']); pousse_ = 0.5 * (x_ + np.sqrt(x_ * x_ + 0.25)) - 0.25   # ≈ max(0, x), lisse en 0
        R['tete_lacet'] = (R['tete_lacet'] + w_ * s_ * pousse_).astype(np.float32)
        # ── action décalée : la tête traîne derrière le buste et le rattrape avec un léger dépassement (follow-through)
        if RG['suivi_tete']:
            # ACTION DÉCALÉE AU RETARD HUMAIN (18/10/2026) : corrélation croisée des vitesses buste → tête, 39 prises CMU : la
            # tête suit à 33 ms ; nos pistes : 150 ms (tête qui « flotte » derrière le corps, effet marionnette). Retard d'un
            # ressort amorti ≈ ζ / (π f) : 61 ms à 2,6 Hz, 35 ms à 4,5 Hz — le léger dépassement (ζ = 0,5) reste
            monde = R['buste'] + R['tete']; R['tete'] = (dynamique(monde, fps, SUIVI_TETE_HZ, 0.5, 0.0) - R['buste']).astype(np.float32)
        # ── bornes de l'enveloppe du personnage
        R['buste'] = borne_vive(R['buste'], env.get('buste', 3.0), fps, RG); R['tete'] = borne_vive(R['tete'], env.get('tete', 6.0), fps, RG)
        R['epaules'] = borne(R['epaules'], env.get('epaules', 3.0)); R['bassin_x'] = borne(R['bassin_x'], env.get('bassin_x', 4.0))
        # TÊTE QUI TOURNE AU-DELÀ DU SQUELETTE (18/10/2026, « Maman ne tourne pas la tête vers Baye ») : ce que l'enveloppe du
        # squelette refuse (6° pour un visage peint de trois quarts) est confié au visage, que LivePortrait fait tourner dans
        # son carré (expressions_lp.tourne) ; la moitié de ce que fait déjà le squelette est retranchée (pas de double rotation)
        voulu_ = R['tete_lacet'].copy()
        R['souffle'] = np.clip(R['souffle'], -env.get('souffle', 0.02), env.get('souffle', 0.02)); R['tete_lacet'] = borne_vive(R['tete_lacet'], env.get('tete_lacet', 20.0), fps, RG); R['tete_tangage'] = borne_vive(R['tete_tangage'], env.get('tete_tangage', 9.0), fps, RG); R['buste_lacet'] = borne_vive(R['buste_lacet'], env.get('buste_lacet', 9.0), fps, RG)
        # v36 : la commande peut dépasser ±1 (regard peint compensé) ; regard.applique borne la position FINALE de l'iris dans l'œil
        R['regard_x'] = np.clip(R['regard_x'], -2.2, 2.2); R['regard_y'] = np.clip(R['regard_y'], -2.2, 2.2)
        for k_ in [k_ for k_ in R if k_.startswith('geste_')]: R[k_] = np.clip(R[k_], 0, 1)
        for c_ in ('tete_tangage', 'tete', 'tete_lacet', 'buste', 'buste_lacet'): R[c_] = lisse_acc(R[c_], fps)   # garde de fluidité
        R['lacet_visage'] = lisse_acc(borne(voulu_ - 0.5 * R['tete_lacet'], RG['lacet_visage']), fps)
        # LE BUSTE SUIT LA TÊTE (19/10/2026, normes humaines) : sur les virages de tête de 15° et plus, le buste tourne d'un
        # tiers de la tête chez l'humain (BEAT2, 2 490 virages : médiane 0,32) ; mesuré sur le bulletin : 0,00 à 0,09. Le buste
        # suit la tête entière (squelette + visage) en retard (ressort critique), dans son enveloppe sans étirement
        if RG.get('buste_suit', 1):
            suit_ = ressort((R['tete_lacet'] + R['lacet_visage']).astype(np.float64), fps, BUSTE_SUIT_OMEGA)
            R['buste_lacet'] = borne_vive(R['buste_lacet'] + BUSTE_SUIT * suit_, env.get('buste_lacet', 9.0), fps, RG).astype(np.float32)
        if RG.get('souple', 1):   # souplesse au niveau humain (SPARC), prise de choc gardée vive
            k_ = max(1, int(0.2 * fps)); garde_ = np.clip(np.convolve(np.clip(prise, 0, 1), np.ones(k_) / k_, 'same'), 0, 1)
            for c_, fc_ in SOUPLESSE.items():
                if c_ in R: R[c_] = souple(R[c_], fps, fc_, garde_)
        if RG.get('garde_souplesse', 1):   # chaque articulation mesurée par la porte Q, au niveau humain sur toutes ses fenêtres
            for c_ in ('tete_lacet', 'tete_tangage', 'tete', 'buste', 'buste_lacet'):
                if c_ in R: R[c_] = garde_souplesse(R[c_], fps, c_)
        if RG.get('ampleur_humaine', 1) and humain:
            scene_ = np.zeros(nf, bool)   # le sketch du personnage : hors de lui, la piste est au repos (sinon médianes faussées)
            if L_sk: scene_[max(0, int((min(x['t0'] for x in L_sk) - 0.8) * fps)):min(nf, int((max(x['t0'] + x['dur'] for x in L_sk) + 2.5) * fps))] = True
            for c_ in NORME_SECONDE:
                if c_ in R: R[c_] = ampleur_humaine(R[c_], parle_, fps, c_, env.get(c_, LIM[c_]), RG, scene_)
        # ── ÉCOUTE GARANTIE APRÈS LES NORMES (19/10/2026, v11, porte D 0,23–0,50 au lieu de ≥ 0,75 ; v10 : 0,93–1,00). Le plancher
        #    d'écoute ci-dessus précède la réserve vive (moitié de l'enveloppe au mouvement lent) et l'ampleur humaine, qui
        #    rabotent la position tournée vers celui qui parle et y ajoutent des oscillations de ±2° : la tête repassait sous 2°.
        #    En dernier, seule la composante LENTE est remontée à ECOUTE_CENTRE vers l'orateur ; les oscillations restent intactes
        if RG.get('ecoute_finale', 1) and RG.get('yeux', 1):
            Fe = ressort(ecoute_ * 1.0, fps, 6.0); we = np.clip(np.abs(Fe), 0, 1); se = np.sign(Fe)
            from scipy.signal import butter, filtfilt
            y_ = R['tete_lacet'].astype(np.float64); ba_, aa_ = butter(2, RESERVE_HZ / (fps / 2.0))
            manque = np.clip(we * RG.get('ecoute_centre', ECOUTE_CENTRE) - se * filtfilt(ba_, aa_, y_), 0, None)
            manque = np.clip(filtfilt(*butter(2, 0.6 / (fps / 2.0)), manque), 0, None)   # remontée lente, sans coin
            lim_ = env.get('tete_lacet', 20.0)   # seule la remontée est bornée : la parole garde son ampleur (pas de borne douce globale)
            R['tete_lacet'] = np.clip(y_ + se * manque, -max(lim_, np.abs(y_).max()), max(lim_, np.abs(y_).max())).astype(np.float32)
        for e in EMOS: R['emo_' + e] = ressort(np.clip(E[e], 0, 1), fps, 10.0)
        if cl is not None: R['cligne'] = cl * (1 - 0.7 * np.clip(prise, 0, 1))   # yeux écarquillés : on cligne peu pendant la prise
        # bouche bée de la prise (commande de mâchoire 0..1, prise au maximum avec celle de la parole) ; fermée dès que le
        # personnage reparle, avec un fondu de 0,2 s
        pb = np.clip(prise, 0, 1) * BOUCHE_BEE
        if parle_.any():
            idx = np.flatnonzero(parle_)
            pos = np.searchsorted(idx, np.arange(nf)); g_ = np.minimum(np.abs(np.arange(nf) - idx[np.clip(pos - 1, 0, len(idx) - 1)]), np.abs(np.arange(nf) - idx[np.clip(pos, 0, len(idx) - 1)]))
            pb = pb * np.clip(g_ / max(1.0, 0.2 * fps), 0, 1)
        R['bouche_bee'] = pb.astype(np.float32)
        out[nom] = R
    return out
