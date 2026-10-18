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
        r = _rire(RIRES[k % len(RIRES)]); i0 = _meilleur_passage(RIRES[k % len(RIRES)], r, dur)
        seg = r[i0:i0 + int(dur * SR)].copy(); m = len(seg)
        import scipy.signal as ss_; seg = ss_.sosfiltfilt(ss_.butter(4, PASSE_BAS_RIRE, 'low', fs=SR, output='sos'), seg).astype(np.float32)
        if m < int(0.5 * SR): continue
        f_in = np.minimum(1.0, np.arange(m) / (0.06 * SR)); f_out = np.clip((m - np.arange(m)) / (0.7 * SR), 0, 1)
        seg *= f_in * f_out ** 1.5
        actif = seg[np.abs(seg) > 0.02 * np.abs(seg).max()] if np.abs(seg).max() > 0 else seg
        g = 10 ** ((ref_db + RIRE_VS_VOIX_DB - _rms_db(actif)) / 20)
        i = int(t0 * SR); j = min(len(y), i + m); y[i:j] += g * seg[:j - i]
        poses.append({'sketch': sk['id'], 'debut': round(t0, 2), 'fin': round(t0 + m / SR, 2), 'son': f'mixkit-{RIRES[k % len(RIRES)]}',
                      'prise_de_choc': round(jeu_prise_t(c), 2), 'niveau_vs_voix_db': RIRE_VS_VOIX_DB})
    return poses


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
    poses = rires(T, y)
    y = y[:int((T['total'] + 0.0) * SR)] if T.get('total') else y
    with wave.open(dst, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    json.dump({'rires': poses, 'jingles': [round(t, 2) for t in instants],
               'reference_tiktok': {'videos': 12, 'musique_du_temps': '0 à 1,6 %', 'rire_apres_chaque_blague': True, 'duree_rire_s': '0,5 à 1,5 (jusqu\'à 3,4)',
                                    'niveau_rire_vs_voix_db': -0.7, 'outil': 'YAMNet (oreille.py)'}}, open(dst + '.json', 'w'), ensure_ascii=False, indent=1)
    print(f'{len(poses)} rires posés', [(p_['sketch'], p_['debut'], p_['fin']) for p_ in poses], f'; {len(instants)} jingles')
