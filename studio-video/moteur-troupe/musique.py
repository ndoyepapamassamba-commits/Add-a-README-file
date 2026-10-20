# JINGLE DE LA TROUPE (17/10/2026) — vos TikTok : dialogue sec, puis un jingle sur la carte émoji entre deux blagues. Le
# jingle est SYNTHÉTISÉ par ce code (aucun échantillon, aucun droit) dans l'esprit d'Abidjan : balafon pentatonique
# (lame de bois : partiels inharmoniques ≈ 1 : 3,9 : 9,6 qui s'éteignent d'autant plus vite qu'ils sont aigus, bourdonnement
# de la calebasse) sur un appel de djembé (claqué, tonique, basse). Chaque carte a sa variante (graine), même signature.
#   python3 musique.py timeline.json voix/mix.wav voix/mix-musique.wav   → la bande dialogue + les jingles aux cartes et en fin
# CALÉ SUR LES TIKTOK DE L'UTILISATEUR (18/10/2026) — « le son d'accompagnement du film, il faut le revoir et le caler sur mes
# vidéos TikTok ; après le choc de fin de chaque sketch, ça doit être accompagné de rire comme dans mes TikTok ». Mesure des
# 12 TikTok par YAMNet (oreille.py, Apache-2.0) : AUCUNE musique sous les dialogues (musique entendue 0 à 1,6 % du temps), et
# après chaque blague une salve de RIRES (rire + ricanement, 0,5 à 1,5 s, jusqu'à 3,4 s) au niveau des voix (écart médian
# −0,7 dB). Donc : plus de jingle par défaut (MUSIQUE_JINGLES=1 les remet), et des rires de public après la prise de choc
# de chaque sketch (jeu.prise_t), choisis parmi les sons Mixkit dont le profil YAMNet est le plus proche des rires des TikTok
# (429, 460, 427, 424 : similarité × force du rire 0,41 à 0,67 ; usage gratuit en vidéo, fichiers bruts jamais redistribués, cache hors dépôt).
import json, os, subprocess, sys, wave
import numpy as np

SR = 22050
PENTA = [0, 2, 4, 7, 9]   # gamme pentatonique majeure (demi-tons)


def _balafon(f, dur, rng):
    t = np.arange(int(dur * SR)) / SR; y = np.zeros_like(t)
    for r, a, tau in ((1.0, 1.0, 0.30), (3.9, 0.35, 0.09), (9.6, 0.12, 0.035)):
        y += a * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6.28)) * np.exp(-t / tau)
    att = np.minimum(1.0, t / 0.002)                                   # attaque de la mailloche
    buzz = 1 + 0.18 * np.sign(np.sin(2 * np.pi * f * 0.5 * t)) * np.exp(-t / 0.12)   # mirliton de la calebasse
    return y * att * buzz


def _djembe(kind, rng):
    n = int(0.35 * SR); t = np.arange(n) / SR; bruit = rng.standard_normal(n)
    if kind == 'basse':
        f = 75 * (1 + 0.6 * np.exp(-t / 0.02)); y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18)
    elif kind == 'ton':
        y = np.sin(2 * np.pi * 260 * t) * np.exp(-t / 0.09) + 0.25 * bruit * np.exp(-t / 0.02)
    else:   # claqué : bruit coloré très bref
        b = np.convolve(bruit, np.ones(3) / 3, 'same') - np.convolve(bruit, np.ones(12) / 12, 'same')
        y = 1.4 * b * np.exp(-t / 0.035)
    return y


def jingle(graine=0, dur=1.0):
    """≈1 s : appel claqué-ton-ton-basse, puis arpège montant de balafon qui retombe sur la tonique (motif varié)."""
    rng = np.random.default_rng(graine); out = np.zeros(int((dur + 0.4) * SR))
    def pose(y, t0, g):
        i = int(t0 * SR); j = min(len(out), i + len(y)); out[i:j] += g * y[:j - i]
    for t0, k, g in ((0.0, 'claque', 0.55), (0.11, 'ton', 0.5), (0.22, 'ton', 0.45), (0.33, 'basse', 0.8)):
        pose(_djembe(k, rng), t0, g)
    base = 392.0 * 2 ** (rng.choice([-2, 0, 2]) / 12)                 # sol, légèrement transposé selon la variante
    degres = sorted(rng.choice(PENTA, 3, replace=False).tolist()) + [12]
    for k, d in enumerate(degres + [0]):
        pose(_balafon(base * 2 ** (d / 12), 0.45, rng), 0.36 + 0.09 * k + rng.uniform(-0.008, 0.008), 0.42)
    pose(_balafon(base / 2, 0.6, rng), 0.36 + 0.09 * len(degres) + 0.09, 0.3)   # tonique grave qui pose la fin
    out *= 0.6 / max(1e-6, np.abs(out).max())
    fin = np.linspace(1, 0, int(0.15 * SR)); out[-len(fin):] *= fin
    return out


RIRES = [460, 427, 424]   # 18/10/2026 (« aigu par moments ») : le 429 (hauteur médiane 466 Hz, pointes 753 Hz) est retiré ;
                          # gardés : rires reconnus par YAMNet (Laughter 0,13 à 0,16) aux hauteurs les plus basses mesurées
PASSE_BAS_RIRE = 5000.0
RIRES_CACHE = os.path.expanduser(os.environ.get('RIRES_CACHE', '~/.cache/massamba-models/rires'))
RIRE_VS_VOIX_DB = -2.0          # TikTok : rires au niveau des voix (écart médian −0,7 dB) ; −2 depuis le 18/10 (« aigu par moments »)
RIRE_APRES_PRISE = 0.2          # s : le public rit 0,2 s après la prise de choc (le visage a « encaissé »)
RIRE_FENETRES_MIN = 3           # fenêtres YAMNet « rire » exigées à la pose, par-dessus les voix : à 2 (mixkit-427), le rire
                                # disparaissait sous la musique et l'ambiance de la bande livrée (0 fenêtre, épisode « cour-n1 »)


def _rire(i):
    os.makedirs(RIRES_CACHE, exist_ok=True); f = f'{RIRES_CACHE}/{i}.mp3'
    if not os.path.isfile(f): subprocess.run(['curl', '-s', '-L', '-m', '60', '-o', f, f'https://assets.mixkit.co/active_storage/sfx/{i}/{i}-preview.mp3'], check=True)
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768


def _meilleur_passage(i, r, dur):
    """début (échantillons) du passage de `dur` s le plus RIEUR du son, choisi par YAMNet (oreille.py : même outil que pour
    les TikTok) — la v3 posait le début du son, parfois un brouhaha (« bulletin » : Laughter 0,08, Chatter 0,11). En cache."""
    f = f'{RIRES_CACHE}/passages.json'; P = json.load(open(f)) if os.path.isfile(f) else {}; cle = f'{i}:{dur:.1f}'
    if cle not in P:
        try:
            import oreille as ecoute
            x16 = ecoute.pcm(f'{RIRES_CACHE}/{i}.mp3'); T_, F_, _ = ecoute.classe(x16)
            rire = np.array([f_['rire'] for f_ in F_]); pas = float(T_[1] - T_[0]) if len(T_) > 1 else 0.975
            w = max(1, int(round(dur / pas))); sc = np.convolve(rire, np.ones(w) / w, 'valid') if len(rire) >= w else rire[:1]
            P[cle] = float(T_[int(np.argmax(sc))])
        except Exception:
            e = np.abs(r); n_ = int(0.05 * SR); env = np.convolve(e, np.ones(n_) / n_, 'same')
            P[cle] = max(0.0, float(np.argmax(env > 0.25 * env.max())) / SR - 0.03)
        json.dump(P, open(f, 'w'))
    return int(P[cle] * SR)


def _rms_db(x): return float(20 * np.log10(np.sqrt(np.mean(np.square(x))) + 1e-9)) if len(x) else -120.0


def _salve(ri, dur, ref_db):
    """salve de rire de `dur` s tirée du son mixkit `ri` (passage le plus rieur, passe-bas, fondus) et son gain au niveau des voix."""
    r = _rire(ri); i0 = _meilleur_passage(ri, r, dur)
    seg = r[i0:i0 + int(dur * SR)].copy(); m = len(seg)
    if m < int(0.5 * SR): return None, 0.0
    import scipy.signal as ss_; seg = ss_.sosfiltfilt(ss_.butter(4, PASSE_BAS_RIRE, 'low', fs=SR, output='sos'), seg).astype(np.float32)
    f_in = np.minimum(1.0, np.arange(m) / (0.06 * SR)); f_out = np.clip((m - np.arange(m)) / (0.7 * SR), 0, 1)
    seg *= f_in * f_out ** 1.5
    actif = seg[np.abs(seg) > 0.02 * np.abs(seg).max()] if np.abs(seg).max() > 0 else seg
    return seg, 10 ** ((ref_db + RIRE_VS_VOIX_DB - _rms_db(actif)) / 20)


def _rire_entendu(y, i, j, ajout):
    """fenêtres YAMNet (0,48 s) où un rire est dans les 3 classes les plus fortes, sur [i − 0,3 s, j] de la bande + `ajout`
    (même règle que jev_son)."""
    try:
        import oreille as ecoute, scipy.signal as ss_
        a = max(0, i - int(0.3 * SR)); x = y[a:j].copy(); x[i - a:i - a + len(ajout)] += ajout
        x16 = ss_.resample_poly(x, 16000, SR).astype(np.float32) if SR != 16000 else x
        _, _, top = ecoute.classe(x16)
        return sum(any(n in ('Laughter', 'Giggle', 'Snicker', 'Chuckle, chortle', 'Belly laugh') for n, _ in t[:3]) for t in top)
    except Exception:
        return 0


def rires(T, y):
    """pose une salve de rires de public après la prise de choc de chaque sketch ; → liste des rires posés (pour jev_son)."""
    voix = [_rms_db(y[int(L['t0'] * SR):int((L['t0'] + L['dur']) * SR)]) for L in T['lines']]
    ref_db = float(np.median([v for v in voix if v > -60])) if voix else -20.0
    poses = []; cartes = sorted(c['t0'] for c in T.get('cartes', []))
    for k, sk in enumerate(T['sketchs']):
        Ls = [L for L in T['lines'] if L['sketch'] == sk['id']]; ch = [L for L in Ls if L.get('chute')]
        if not ch: continue
        c = ch[-1]; t0 = jeu_prise_t(c) + RIRE_APRES_PRISE
        suivante = min([L['t0'] for L in T['lines'] if L['t0'] > c['t0']] + [x + 0.6 for x in cartes if x > t0] + [T.get('total', len(y) / SR)])
        dur = float(np.clip(suivante - t0, 1.0, 2.6))   # TikTok : 0,5 à 1,5 s le plus souvent, jusqu'à 3,4 s ; jamais sur la réplique suivante
        # RIRE ENTENDU, VÉRIFIÉ À LA POSE (20/10/2026) : épisode « cour-n1 », le rire mixkit-427 posé après « LA FAUTE » n'était
        # reconnu par YAMNet dans aucune fenêtre de la bande (les deux autres : 1 et 2 sur 3) et la porte N tombait. Chaque
        # échantillon est essayé (rotation par sketch pour varier) et écouté par la même oreille que la porte, par-dessus les
        # voix ; le mieux entendu est gardé
        essais = []
        for n_ in range(len(RIRES)):
            ri = RIRES[(k + n_) % len(RIRES)]; seg, g = _salve(ri, dur, ref_db)
            if seg is None: continue
            i = int(t0 * SR); j = min(len(y), i + len(seg)); h = _rire_entendu(y, i, j, g * seg[:j - i])
            essais.append((h, -n_, ri, seg, g))
            if h >= RIRE_FENETRES_MIN: break
        if not essais: continue
        h, _, ri, seg, g = max(essais, key=lambda e_: (e_[0], e_[1])); m = len(seg)
        i = int(t0 * SR); j = min(len(y), i + m); y[i:j] += g * seg[:j - i]
        poses.append({'sketch': sk['id'], 'debut': round(t0, 2), 'fin': round(t0 + m / SR, 2), 'son': f'mixkit-{ri}',
                      'prise_de_choc': round(jeu_prise_t(c), 2), 'niveau_vs_voix_db': RIRE_VS_VOIX_DB, 'fenetres_rire_yamnet': h})
    return poses


# ── MUSIQUE DE FOND COMIQUE (19/10/2026) — « une musique de fond comique doit accompagner le film sans nuire à l'écoute ;
# mettre plus de rythme dans le film ». Tapis SYNTHÉTISÉ ici (aucun échantillon, aucun droit), couleur d'Abidjan et code du
# dessin animé comique : basse pizzicato (corde pincée Karplus-Strong) racine-quinte en staccato, ostinato de balafon
# pentatonique en croches à trous, shaker en croches (accent à contretemps), claqué de djembé sur 2 et 4 ; grille I–IV–V–I,
# 104 à la noire. Code comique : « stop » — le tapis se tait 0,25 s avant la chute de chaque sketch (la chute tombe à sec),
# ponctuation pizzicato descendante + tonique grave de balafon à la prise de choc, puis les rires ; il reprend au sketch
# suivant. ÉCOUTE GARDÉE (WCAG 2.x, 1.4.7 « Low or No Background Audio » : fond au moins 20 dB sous la parole ; étude
# BBC/Salford : 20 LU recommandés) : compresseur à clé sur la voix (attaque 40 ms, relâche 350 ms), puis vérification
# fenêtre par fenêtre (0,1 s) — toute fenêtre de parole où le tapis n'est pas à −20 dB est rabaissée. TAPIS=0 pour s'en passer.
TAPIS_BPM = 104.0
TAPIS_SOUS_PAROLE_DB = -22.0    # visé pendant la parole (contrôle : ≤ −20 dB)
TAPIS_HORS_PAROLE_DB = -15.0    # dans les silences : présent, toujours en fond
TAPIS_ARRET_AVANT_CHUTE = 0.25  # s


def _pince(f, dur, rng, amort=0.996, eclat=0.5):
    """corde pincée (Karplus-Strong) : pizzicato court."""
    n = int(dur * SR); p = max(2, int(SR / f)); buf = rng.uniform(-1, 1, p) * eclat + rng.uniform(-1, 1, p) * (1 - eclat) * 0.3
    out = np.zeros(n, np.float32)
    for i in range(n):
        out[i] = buf[i % p]; buf[i % p] = amort * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return out * np.exp(-np.arange(n) / (0.18 * SR))


def _shaker(rng, fort=False):
    n = int(0.05 * SR); b = rng.standard_normal(n); b = b - np.convolve(b, np.ones(4) / 4, 'same')   # passe-haut grossier
    return (b * np.exp(-np.arange(n) / (0.012 * SR)) * (0.5 if fort else 0.3)).astype(np.float32)


def tapis(T, total, graine=0):
    """tapis comique continu sous tout le film (sans réglage de niveau) → (signal, journal des « stops » et ponctuations)."""
    rng = np.random.default_rng(graine); out = np.zeros(int((total + 1.0) * SR), np.float32)
    def pose(y, t0, g):
        i = int(t0 * SR)
        if i >= len(out) or i < 0: return
        j = min(len(out), i + len(y)); out[i:j] += g * y[:j - i]
    noire = 60.0 / TAPIS_BPM; croche = noire / 2; mesure = 4 * noire
    grille = [0, 5, 7, 0]   # I–IV–V–I (demi-tons)
    # zones muettes : de (chute − arrêt) jusqu'au sketch suivant (après les rires) ; ponctuation à la prise de choc
    muets, ponct = [], []
    for k, sk in enumerate(T['sketchs']):
        ch = [L for L in T['lines'] if L['sketch'] == sk['id'] and L.get('chute')]
        if not ch: continue
        c = ch[-1]; t_stop = c['t0'] - TAPIS_ARRET_AVANT_CHUTE
        suivants = [s_['t0'] for s_ in T['sketchs'] if s_['t0'] > c['t0']]
        reprise = min(suivants) if suivants else total + 1
        muets.append((t_stop, reprise)); ponct.append(jeu_prise_t(c))
    muet = lambda t: any(a <= t < b for a, b in muets)
    for k, sk in enumerate(T['sketchs']):
        base = 98.0 * 2 ** (int(rng.choice([-2, 0, 2, 3])) / 12)   # tonalité de chaque sketch (sol grave ± 1 ton)
        motif = [int(rng.choice(PENTA)) if rng.random() < 0.7 else None for _ in range(16)]   # 2 mesures de croches à trous
        t = float(sk['t0']); fin = float(sk.get('t1', total)); m = 0
        while t < fin:
            ra = grille[m % 4]
            for b in range(4):
                tb = t + b * noire
                if tb >= fin: break
                if not muet(tb):
                    if b in (0, 2):   # basse pizzicato racine / quinte, staccato
                        pose(_pince(base / 2 * 2 ** ((ra + (7 if b == 2 else 0)) / 12), 0.22, rng), tb, 0.9)
                    if b in (1, 3): pose(_djembe('claque', rng), tb, 0.18)
                for h in range(2):
                    th = tb + h * croche
                    if th >= fin or muet(th): continue
                    pose(_shaker(rng, fort=h == 1), th, 0.5)
                    d = motif[(m % 2) * 8 + b * 2 + h]
                    if d is not None: pose(_balafon(base * 2 * 2 ** ((ra + d) / 12), 0.25, rng) * np.exp(-np.arange(int(0.25 * SR)) / (0.06 * SR)), th, 0.22)
            t += mesure; m += 1
    for tp in ponct:   # ponctuation de la chute : « plonk » pizzicato descendant + tonique grave
        for j, d in enumerate((7, 4, 0)):
            pose(_pince(196.0 * 2 ** (d / 12), 0.3, rng, eclat=0.8), tp - 0.12 + 0.07 * j, 0.6)
        pose(_balafon(98.0, 0.6, rng), tp + 0.1, 0.5)
    out = out[:int(total * SR)]
    import scipy.signal as ss_
    out = ss_.sosfiltfilt(ss_.butter(2, 4500, 'low', fs=SR, output='sos'), out).astype(np.float32)   # rien dans la zone des sifflantes
    return out, {'arrets_avant_chute': [round(a, 2) for a, _ in muets], 'ponctuations': [round(p_, 2) for p_ in ponct], 'bpm': TAPIS_BPM}


def _env_db(x, w):
    n = len(x) // w; r = np.sqrt(np.mean(np.square(x[:n * w].reshape(n, w)), 1) + 1e-12); return 20 * np.log10(r)


def mixe_tapis(voix_seule, bed):
    """niveau du tapis réglé sur la voix (clé) : −22 dB sous la parole, −15 dB sous la parole médiane dans les silences ;
    puis garde fenêtre par fenêtre (0,1 s) : jamais au-dessus de −20 dB d'une fenêtre de parole. → (tapis réglé, mesure)."""
    w = int(0.1 * SR); n = min(len(voix_seule), len(bed)) // w
    v = _env_db(voix_seule[:n * w], w); b = _env_db(bed[:n * w], w)
    parole = v > (np.median(v[v > -60]) if (v > -60).any() else -30) - 15
    v_med = float(np.median(v[parole])) if parole.any() else -20.0
    cible = np.where(parole, v + TAPIS_SOUS_PAROLE_DB, v_med + TAPIS_HORS_PAROLE_DB)   # dB voulus pour le tapis
    # gain piloté par la VOIX seule, rapporté au niveau moyen du tapis (un gain fenêtre par fenêtre suivait aussi les notes du
    # tapis et l'écrasait : −35 dB sous la parole, inaudible) ; les pointes du tapis sont tenues par la garde dure ci-dessous
    b_ref = float(np.median(b[b > -60])) if (b > -60).any() else -30.0
    g_db = np.minimum(cible - b_ref, 30.0)
    # lissage asymétrique : on baisse vite (attaque 40 ms ≈ 0,4 fenêtre), on remonte lentement (relâche 350 ms)
    lis = g_db.copy()
    for i in range(1, n):
        a = 0.9 if lis[i] < lis[i - 1] else 0.25
        lis[i] = lis[i - 1] + a * (g_db[i] - lis[i - 1])
    lis = np.minimum(lis, g_db + 0.0)   # jamais au-dessus du gain voulu (la relâche ne mord pas une parole)
    k_ = int(0.02 * SR)
    for _ in range(6):   # GARDE DURE : chaque fenêtre de parole où le tapis dépasse −20,5 dB est rabaissée (et ses voisines)
        g = np.repeat(10 ** (lis / 20), w); g = np.convolve(g, np.ones(k_) / k_, 'same'); out = bed[:n * w] * g
        ecart = _env_db(out, w) - v; viol = parole & (ecart > -20.5)
        if not viol.any(): break
        exces = np.where(viol, ecart + 21.0, 0.0); exces = np.maximum(exces, np.maximum(np.r_[0, exces[:-1]], np.r_[exces[1:], 0]))
        lis = lis - exces
    present = (b > -60) & ~parole
    mesure = {'pire_ecart_tapis_moins_parole_db': round(float(ecart[parole].max()), 1) if parole.any() else None,
              'mediane_ecart_parole_db': round(float(np.median(ecart[parole])), 1) if parole.any() else None,
              'tapis_entre_les_repliques_vs_parole_mediane_db': round(float(np.median(_env_db(out, w)[present]) - v_med), 1) if present.any() else None,
              'part_du_film_avec_tapis': round(float((b > -60).mean()), 3)}
    return out, mesure


def jeu_prise_t(L):
    try:
        import jeu
        return jeu.prise_t(L)
    except Exception:
        return L['t0'] + L['dur'] + 0.30


if __name__ == '__main__':
    T = json.load(open(sys.argv[1])); src, dst = sys.argv[2], sys.argv[3]
    with wave.open(src) as w: sr = w.getframerate(); y = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    assert sr == SR, 'la bande dialogue doit être à 22 050 Hz (voix.py)'
    y = np.concatenate([y, np.zeros(int(1.5 * SR), np.float32)])
    instants = []
    if os.environ.get('MUSIQUE_JINGLES', '0') == '1':   # jingles aux cartes (avant le 18/10 : absents des TikTok de l'utilisateur)
        instants = [c['t0'] + 0.05 for c in T.get('cartes', [])]
        fin = max(L['t0'] + L['dur'] for L in T['lines']) + 0.35                # sur la dernière réaction, avant le fondu
        if fin + 1.2 < len(y) / SR: instants.append(fin)
        for k, t0 in enumerate(instants):
            j = jingle(graine=k).astype(np.float32) * 0.5      # ≈ −8 dB sous la crête des voix : un jingle, pas un tapis
            i = int(t0 * SR); y[i:i + len(j)] += j[:len(y) - i]
    tapis_info = None
    if os.environ.get('TAPIS', '1') == '1':   # musique de fond comique réglée sur la voix seule (avant les rires)
        bed, tapis_info = tapis(T, len(y) / SR)
        bed, mes = mixe_tapis(y.copy(), bed); tapis_info['ecoute'] = mes
        y[:len(bed)] += bed
    poses = rires(T, y)
    y = y[:int((T['total'] + 0.0) * SR)] if T.get('total') else y
    with wave.open(dst, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    json.dump({'rires': poses, 'jingles': [round(t, 2) for t in instants], 'tapis': tapis_info,
               'reference_tiktok': {'videos': 12, 'musique_du_temps': '0 à 1,6 %', 'rire_apres_chaque_blague': True, 'duree_rire_s': '0,5 à 1,5 (jusqu\'à 3,4)',
                                    'niveau_rire_vs_voix_db': -0.7, 'outil': 'YAMNet (oreille.py)'}}, open(dst + '.json', 'w'), ensure_ascii=False, indent=1)
    print(f'{len(poses)} rires posés', [(p_['sketch'], p_['debut'], p_['fin']) for p_ in poses], f'; {len(instants)} jingles ; tapis', (tapis_info or {}).get('ecoute'))
