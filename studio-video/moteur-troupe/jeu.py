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
import math, re, zlib
import numpy as np

OMEGA = {'buste': 7.0, 'buste_lacet': 6.0, 'tete': 10.0, 'tete_lacet': 9.0, 'tete_tangage': 12.0, 'regard_x': 24.0, 'regard_y': 24.0,
         'souffle': 9.0, 'epaules': 14.0, 'bassin_x': 5.0, 'bassin_y': 6.0, 'geste_0': 9.0, 'geste_1': 9.0}
EMOS = ['joie', 'rire', 'tristesse', 'mecontent', 'colere', 'frustration', 'surprise', 'peur', 'malice', 'soupcon', 'innocent', 'frime', 'emu', 'degout']
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
def yeux(T, parle, debut_phrase, fin_phrase, vers, fps, graine):
    """→ (regard_x, regard_y, apport au lacet de tête en degrés, clignement 0..1), une valeur par image.
    parle : bool par image ; debut_phrase / fin_phrase : instants (s) de mes répliques ; vers : direction du partenaire
    (−1 … 1, 0 = caméra) par image."""
    n = len(T); rng = np.random.default_rng(int(graine * 1000) + 7)
    gx = np.zeros(n); gy = np.zeros(n); i = 0; cible = (0.0, 0.0); depart = (0.0, 0.0); d_sac = 1; sacc = []
    debuts = sorted(debut_phrase); i_debuts = [int(round(d * fps)) for d in debuts]
    # QUAND UN AUTRE PREND LA PAROLE, le regard le rejoint ~150 ms après (porte D de la v28 : Maman Nounou fixait encore Baye
    # pendant les répliques de Petit Mamadou, 28 % des images d'écoute ; les auditeurs suivent le changement de locuteur au
    # moment de la prise de parole — Holler & Kendrick 2015) : la fixation en cours est interrompue, la suivante est mutuelle
    i_vers = sorted({min(n - 1, k + int(round(0.15 * fps))) for k in range(1, n) if abs(float(vers[k]) - float(vers[k - 1])) > 0.5})
    rejoint = set(i_vers)
    while i < n:
        t = T[i]; p = bool(parle[i]); base = 0.88 * float(vers[i])
        d0 = next((d for d in debuts if 0 <= t - d < 0.25), None)
        if d0 is not None and rng.random() < 0.6:    # je commence à parler : je détourne les yeux le temps de penser
            ax = -np.sign(base or 1.0) * rng.uniform(0.25, 0.5); ay = rng.choice([0.25, -0.15, 0.35]) * rng.uniform(0.5, 1.0)
            nouveau = (base * 0.3 + ax, ay); duree = rng.uniform(0.45, 0.9)
        elif i in rejoint or rng.random() < (0.41 if p else 0.75):   # regard mutuel : micro-fixation sur le visage du partenaire
            nouveau = (base + rng.normal(0, 0.05), rng.normal(0.04, 0.035)); duree = rng.gamma(2.0, (0.85 if p else 1.4) / 2.0)
        else:                                          # ailleurs : amplitude exponentielle, souvent de côté ou vers le bas
            A_ = float(np.clip(rng.exponential(0.3), 0.12, 0.6)); a = rng.choice([0.0, np.pi, 0.5 * np.pi, 0.75 * np.pi, 0.25 * np.pi, -0.5 * np.pi], p=[0.25, 0.25, 0.2, 0.1, 0.1, 0.1])
            nouveau = (base * 0.5 + A_ * math.cos(a), A_ * math.sin(a) * 0.7); duree = rng.gamma(2.0, (0.75 if p else 0.5) / 2.0)
        nouveau = (float(np.clip(nouveau[0], -1, 1)), float(np.clip(nouveau[1], -0.6, 0.8)))
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
    lacet = 0.3 * 25.0 * np.r_[np.zeros(int(0.08 * fps)), (gx - 0.88 * np.asarray(vers, np.float64))[:n - int(0.08 * fps)]]
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


FRAC = {'buste': 0.8, 'buste_lacet': 0.6, 'tete': 0.8, 'tete_lacet': 0.45, 'tete_tangage': 0.7, 'bassin_x': 0.8}
LACET_ECOUTE = 4.0   # degrés : lacet minimal de l'écouteur vers celui qui parle (porte D : > 2° dans 75 % des images)
LACET_ECOUTE_MIN = 3.5   # degrés : plancher d'écoute après toutes les couches (porte D : > 2° dans 75 % des images)
LIM = {'buste': 3.0, 'buste_lacet': 9.0, 'tete': 6.0, 'tete_lacet': 20.0, 'tete_tangage': 9.0, 'bassin_x': 4.0}


def _poser(dst, src, i0, mode='add'):
    """pose src dans dst à partir de l'image i0 (bords du film coupés) : somme, ou maximum (gestes)."""
    a, b = max(0, i0), min(len(dst), i0 + len(src))
    if b <= a: return
    if mode == 'max': dst[a:b] = np.maximum(dst[a:b], src[a - i0:b - i0])
    else: dst[a:b] += src[a - i0:b - i0]


def couche_humaine(nom, L_sk, a_qui, cote, nf, fps, echelle, cotes_bras, graine, journal):
    """couche « vrai humain » (mocap_jeu) du personnage pour tout le sketch : une prise par réplique (geste calé sur ses
    syllabes accentuées), une prise calme pour chaque temps d'écoute (≤ 6 s), fondues entre elles. Valeurs brutes
    (degrés, pixels), mises à l'échelle de l'enveloppe par pistes()."""
    import mocap_jeu as mj
    M = {c: np.zeros(nf) for c in FRAC}; G = [np.zeros(nf) for _ in cotes_bras]; deja = set(); occupe = np.zeros(nf, bool)
    mes = [x for x in L_sk if x['qui'] == nom]
    for k, L in enumerate(mes):
        cib = attaques(L, graine + 0.11 * k, garder=1.0)
        i0 = int(round((L['t0'] - mj.PRE) * fps)); n_ = int(round((L['dur'] + mj.PRE + mj.POST) * fps))
        lay, info = mj.couche(L, cib, fps, n_, L.get('jeu', ''), graine=int(graine * 100) + k, echelle=echelle,
                              cote=cote(a_qui[id(L)]), deja=deja, bras=cotes_bras)
        if not lay: continue
        for c in M: _poser(M[c], lay.get(c, np.zeros(n_)), i0)
        for b in range(len(cotes_bras)): _poser(G[b], lay.get(f'geste_{b}', np.zeros(n_)), i0, 'max')
        occupe[max(0, i0):max(0, i0 + n_)] = True
        journal.append({'qui': nom, 't0': round(L['t0'], 2), 'role': 'parle', **info})
    if not L_sk: return M, G
    t_deb = min(x['t0'] for x in L_sk) - 0.8; t_fin = max(x['t0'] + x['dur'] for x in L_sk) + 2.5
    i, b_ = max(0, int(t_deb * fps)), min(nf, int(t_fin * fps)); s_ = 0
    while i < b_:   # temps d'écoute : prises calmes, à cheval sur les fondus des répliques voisines
        if occupe[i]: i += 1; continue
        j = i
        while j < b_ and not occupe[j] and j - i < 6 * fps: j += 1
        i0 = max(0, i - int(0.25 * fps)); n_ = min(nf, j + int(0.35 * fps)) - i0
        if n_ >= int(0.8 * fps):
            lay, info = mj.couche(None, [], fps, n_, '', graine=int(graine * 100) + 50 + s_, ecoute=True, echelle=echelle, deja=deja)
            for c in M:
                if lay: _poser(M[c], lay.get(c, np.zeros(n_)), i0)
            if info: journal.append({'qui': nom, 't0': round(i0 / fps, 2), 'role': 'ecoute', **info})
            s_ += 1
        i = j
    return M, G


def pistes(lignes, sketch, acteurs, position, assis, enveloppes, nf, fps, bras=None, echelles=None, cotes_bras=None, reglages=None, journal=None):
    """pistes de jeu du sketch. acteurs : noms ; position : {nom: x écran} ; assis : {nom: bool} ;
    enveloppes : {nom: {buste, tete, epaules, bassin_x}} ; bras : {nom: nombre de calques de bras} ; echelles : {nom: pixels
    par mètre} ; cotes_bras : {nom: ['l'|'r', …] par calque} ; reglages : {mocap (gain max, 0 = sans), dyn, yeux, suivi_tete}
    → {nom: {canal: array}} (+ « cligne » quand le regard vivant est actif)."""
    RG = {'mocap': 1.0, 'dyn': 1, 'yeux': 1, 'suivi_tete': 1, 'ampleur': 1.0}; RG.update(reglages or {})
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
        vers = np.zeros(nf); parle_ = np.zeros(nf, bool)
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
            if L.get('chute') and L['qui'] != nom:
                tc = t0 + 0.7 * L['dur']; evenement(tc, tc + 0.6, {'surprise': 1.0}, 1.0)
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
            # ce qui manque au visage peint — mais l'écouteur tourne TOUJOURS un peu la tête vers celui qui parle (18/10, v33 :
            # visage déjà peint de trois quarts → lacet ajouté nul, l'écoute ne se voyait plus ; porte D 0,00–0,54 au lieu de ≥ 0,75)
            C['tete_lacet'][i] = sd * max(0.0 if parle else LACET_ECOUTE, (18.0 if parle else 12.0) - sd * env.get('lacet_peint', 0.0))
            C['regard_x'][i] = sd * (0.85 if parle else 0.95)
            C['buste_lacet'][i] = sd * (7.0 if parle else 4.0)
            roll = kb * 1.2 * _bruit(0.6 * t, g + 1); tang = kb * 0.8 * _bruit(0.7 * t, g + 2); buste = kb * 0.8 * _bruit(0.35 * t, g + 3)
            souffle = 0.006 * math.sin(2 * math.pi * 0.25 * t + g); ep = 0.0; bx = kb * 1.5 * _bruit(0.12 * t, g + 4); by = 0.0
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
            tang += 3.0 * E['tristesse'][i] - 2.0 * E['innocent'][i]   # la tête suit le regard
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
            gx, gy, lac, cl = yeux(T, parle_, [x['t0'] for x in mes], [x['t0'] + x['dur'] for x in mes], vers, fps, g)
            C['regard_x'] = gx; C['regard_y'] = C['regard_y'] + gy; C['tete_lacet'] = C['tete_lacet'] + lac
        # ── dynamique du second ordre (anticipation, dépassement) ou ressorts critiques (réglage dyn = 0 : moteur v27)
        if RG['dyn']: R = {k: dynamique(v, fps, *DYN[k]) for k, v in C.items()}
        else: R = {k: ressort(v, fps, OMEGA[k]) for k, v in C.items()}
        if RG['yeux']: R['regard_x'], R['regard_y'] = C['regard_x'].astype(np.float32), C['regard_y'].astype(np.float32)   # saccades : déjà leur propre dynamique
        R['tete_tangage'] = (R['tete_tangage'] + hoche).astype(np.float32)   # vrais hochements : tels que captés, sans filtre
        # ── couche « vrai humain » : capture de mouvement CMU calée sur les syllabes, à l'échelle de l'enveloppe
        if humain:
            ech = (echelles or {}).get(nom, 400.0); cb = (cotes_bras or {}).get(nom, [])
            M, Gm = couche_humaine(nom, L_sk, a_qui, cote, nf, fps, ech, cb, g, journal)
            for c_, v_ in M.items():
                lim = 0.0 if (c_ == 'bassin_x' and assis.get(nom)) else env.get(c_, LIM[c_])
                nz = np.abs(v_[np.abs(v_) > 1e-6]); p95 = float(np.percentile(nz, 95)) if len(nz) else 0.0
                gain = min(RG['mocap'], FRAC[c_] * lim / p95) if p95 > 1e-6 else 0.0
                R[c_] = R[c_] + (gain * v_).astype(np.float32)
            for b, gm in enumerate(Gm):
                if f'geste_{b}' in R: R[f'geste_{b}'] = (1 - (1 - np.clip(R[f'geste_{b}'], 0, 1)) * (1 - np.clip(RG['mocap'] * gm, 0, 1))).astype(np.float32)
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
            monde = R['buste'] + R['tete']; R['tete'] = (dynamique(monde, fps, 2.6, 0.5, 0.0) - R['buste']).astype(np.float32)
        # ── bornes de l'enveloppe du personnage
        R['buste'] = borne(R['buste'], env.get('buste', 3.0)); R['tete'] = borne(R['tete'], env.get('tete', 6.0))
        R['epaules'] = borne(R['epaules'], env.get('epaules', 3.0)); R['bassin_x'] = borne(R['bassin_x'], env.get('bassin_x', 4.0))
        R['souffle'] = np.clip(R['souffle'], -env.get('souffle', 0.02), env.get('souffle', 0.02)); R['tete_lacet'] = borne(R['tete_lacet'], env.get('tete_lacet', 20.0)); R['tete_tangage'] = borne(R['tete_tangage'], env.get('tete_tangage', 9.0)); R['buste_lacet'] = borne(R['buste_lacet'], env.get('buste_lacet', 9.0))
        R['regard_x'] = np.clip(R['regard_x'], -1, 1); R['regard_y'] = np.clip(R['regard_y'], -1, 1)
        for k_ in [k_ for k_ in R if k_.startswith('geste_')]: R[k_] = np.clip(R[k_], 0, 1)
        for c_ in ('tete_tangage', 'tete', 'tete_lacet', 'buste', 'buste_lacet'): R[c_] = lisse_acc(R[c_], fps)   # garde de fluidité
        for e in EMOS: R['emo_' + e] = ressort(np.clip(E[e], 0, 1), fps, 10.0)
        if cl is not None: R['cligne'] = cl
        out[nom] = R
    return out
