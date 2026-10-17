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


def pistes(lignes, sketch, acteurs, position, assis, enveloppes, nf, fps, bras=None):
    """pistes de jeu du sketch. acteurs : noms ; position : {nom: x écran} ; assis : {nom: bool} ;
    enveloppes : {nom: {buste, tete, epaules, bassin_x}} ; bras : {nom: nombre de calques de bras}. → {nom: {canal: array}}"""
    T = np.arange(nf) / fps; L_sk = [L for L in lignes if L['sketch'] == sketch]
    a_qui = {id(L): interlocuteur(L, lignes, acteurs) for L in L_sk}
    out = {}
    for nom in acteurs:
        g = (zlib.crc32(nom.encode()) % 1000) / 100.0; env = enveloppes.get(nom, {}); x_me = position[nom]
        C = {k: np.zeros(nf, np.float32) for k in OMEGA}; E = {e: np.zeros(nf, np.float32) for e in EMOS}
        cote = lambda autre: float(np.sign(position.get(autre, x_me) - x_me)) if autre else 0.0
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
            C['tete_lacet'][i] = sd * (18.0 if parle else 12.0)
            C['regard_x'][i] = sd * (0.85 if parle else 0.95)
            C['buste_lacet'][i] = sd * (7.0 if parle else 4.0)
            roll = 1.2 * _bruit(0.6 * t, g + 1); tang = 0.8 * _bruit(0.7 * t, g + 2); buste = 0.8 * _bruit(0.35 * t, g + 3)
            souffle = 0.006 * math.sin(2 * math.pi * 0.25 * t + g); ep = 0.0; bx = 1.5 * _bruit(0.12 * t, g + 4); by = 0.0
            if parle:
                u = t - L['t0']; e = L['env'][min(len(L['env']) - 1, max(0, int(u * 100)))]
                e2 = L['env'][min(len(L['env']) - 1, max(0, int((u - 0.08) * 100)))]
                tang += 5.0 * max(0.0, e - e2) * 6 + 1.5 * e          # hochements sur les attaques de syllabes
                roll += 2.4 * e * _bruit(2.3 * u, g + 7)              # la tête accompagne la phrase, sans balancier régulier (17/10)
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
                        # jamais à intervalle fixe — l'ancien sinus à 0,8 Hz faisait « automate » (remarque du 17/10)
                    roll += 2.0 * sd; uS = t - S['t0']
                    tang += 3.0 * sum(bosse(uS - (a_ + 0.25)) for a_ in ATT[(nom, id(S))])
            # silence avant la chute (0,5 s) : tout le monde se fige, le souffle reste
            for x in L_sk:
                if x.get('chute') and -0.5 <= t - x['t0'] < 0: roll *= 0.3; tang *= 0.3; buste *= 0.3
            C['regard_y'][i] = 0.5 * E['tristesse'][i] + 0.25 * E['emu'][i] - 0.45 * E['innocent'][i]   # + = vers le bas
            tang += 3.0 * E['tristesse'][i] - 2.0 * E['innocent'][i]   # la tête suit le regard
            C['tete'][i] = roll; C['tete_tangage'][i] = tang; C['buste'][i] = buste; C['souffle'][i] = souffle; C['epaules'][i] = ep
            C['bassin_x'][i] = 0.0 if assis.get(nom) else bx; C['bassin_y'][i] = by
            # gestes : le bras du côté de l'interlocuteur se lève sur ma réplique, retombe en fin de phrase
            if parle and bras and bras.get(nom):
                u = t - L['t0']; k = min(1.0, max(0.0, (u - 0.08) / 0.3)) * (1 - max(0.0, min(1.0, (u - L['dur'] + 0.1) / 0.45)))
                mes = [x for x in L_sk if x['qui'] == nom]; rang = mes.index(L) if L in mes else 0
                b = rang % bras[nom]; amp = {'accuse': 1.0, 'marchande': 0.8, 'choc': 0.9, 'panique': 0.7, 'frime': 0.7}.get(L.get('jeu', ''), 0.6)
                C[f'geste_{b}'][i] = amp * k
            # réaction des mains au ressenti (sursaut, peur, colère), même sans parler : le bras le plus libre se lève un peu
            if bras and bras.get(nom):
                r_ = min(1.0, 0.6 * E['surprise'][i] + 0.5 * E['peur'][i] + 0.4 * E['colere'][i] + 0.3 * E['rire'][i])
                C['geste_0'][i] = max(C['geste_0'][i], 0.55 * r_)
        # ── ressorts, puis bornes de l'enveloppe du personnage
        R = {k: ressort(v, fps, OMEGA[k]) for k, v in C.items()}
        R['buste'] = borne(R['buste'], env.get('buste', 3.0)); R['tete'] = borne(R['tete'], env.get('tete', 6.0))
        R['epaules'] = borne(R['epaules'], env.get('epaules', 3.0)); R['bassin_x'] = borne(R['bassin_x'], env.get('bassin_x', 4.0))
        R['souffle'] = np.clip(R['souffle'], -env.get('souffle', 0.02), env.get('souffle', 0.02)); R['tete_lacet'] = borne(R['tete_lacet'], env.get('tete_lacet', 20.0)); R['tete_tangage'] = borne(R['tete_tangage'], 9.0); R['buste_lacet'] = borne(R['buste_lacet'], env.get('buste_lacet', 9.0))
        R['regard_x'] = np.clip(R['regard_x'], -1, 1); R['regard_y'] = np.clip(R['regard_y'], -1, 1)
        for e in EMOS: R['emo_' + e] = ressort(np.clip(E[e], 0, 1), fps, 10.0)
        out[nom] = R
    return out
