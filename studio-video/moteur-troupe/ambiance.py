# AMBIANCE SONORE RÉELLE (17/10/2026) — « le bruit de l'arrière-plan est mal géré : les coqs, le vent et tout ça ».
# De VRAIS enregistrements (Mixkit : usage gratuit dans des vidéos, commerciales comprises, attribution facultative ; les
# fichiers bruts ne sont jamais redistribués — cache local hors du dépôt), posés selon le LIEU du sketch :
#   cour   : oiseaux dans les arbres + vent (lit continu) ; poules qui caquettent dans les SILENCES ; un coq qui chante à
#            l'ouverture du sketch — jamais sur une réplique ni sur une chute ;
#   maquis : brouhaha de restaurant + grésillement du grill (lit) ; un tintement de verres dans un silence.
# Mixage : lit à 22 dB sous les voix (sonie BS.1770 mesurée, pyloudnorm), abaissé de 7 dB quand quelqu'un parle
# (enveloppe de la voix lissée sur 150 ms), fondus de 0,6 s aux cartes de titre ; l'ambiance se tait 0,35 s avant chaque
# chute (le silence fait claquer la réplique) et revient en 0,8 s.
#   python3 ambiance.py timeline.json voix/mix-musique.wav voix/mix-ambiance.wav
import json, os, subprocess, sys
import numpy as np, pyloudnorm as pyln

CACHE = os.path.expanduser(os.environ.get('AMBIANCE_CACHE', '~/.cache/massamba-models/ambiance'))
URL = 'https://assets.mixkit.co/active_storage/sfx/{i}/{i}-preview.mp3'
SONS = {'oiseaux': [17, 2472], 'vent': [2658], 'poules': [1772, 1769], 'coq': [2462, 2470],
        'resto': [444, 366], 'grill': [123], 'verres': [154, 2936]}
LIEUX = {'Cour': dict(lit=['oiseaux', 'vent'], silences=['poules'], ouverture=['coq']),
         'Maquis': dict(lit=['resto', 'grill'], silences=['verres'], ouverture=[])}
SOUS_VOIX_DB, DUCK_DB = 22.0, 7.0


def son(i, sr):
    os.makedirs(CACHE, exist_ok=True); f = f'{CACHE}/{i}.mp3'
    if not os.path.isfile(f): subprocess.run(['curl', '-s', '-L', '-m', '60', '-o', f, URL.format(i=i)], check=True)
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768


def boucle(x, n, sr, rng):
    """lit continu de n échantillons : la prise rejouée à des départs variés, raccords en fondu de 0,5 s."""
    out = np.zeros(n, np.float32); f = int(0.5 * sr); pos = 0
    while pos < n:
        d = int(rng.integers(0, max(1, len(x) // 3))); seg = x[d:].copy()
        if len(seg) < 2 * f: seg = x.copy()
        seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
        m = min(len(seg), n - pos); out[pos:pos + m] += seg[:m]; pos += max(1, len(seg) - f)
    return out


def enveloppe(v, sr, fen=0.15):
    k = int(fen * sr); e = np.sqrt(np.convolve(v * v, np.ones(k) / k, 'same')); return e / (e.max() + 1e-9)


if __name__ == '__main__':
    TL, ENTREE, SORTIE = sys.argv[1:4]
    T = json.load(open(TL)); rng = np.random.default_rng(28)
    p = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', ENTREE], capture_output=True, text=True)
    sr = int(p.stdout.strip().splitlines()[0])
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', ENTREE, '-ac', '1', '-f', 's16le', '-'], capture_output=True, check=True).stdout
    voix = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768; N = len(voix)
    mesure = pyln.Meter(sr); L_voix = mesure.integrated_loudness(voix.astype(np.float64))
    amb = np.zeros(N, np.float32); journal = []
    parle = np.zeros(N, np.float32)
    for L in T['lines']: parle[int(L['t0'] * sr):int((L['t0'] + L['dur']) * sr)] = 1
    for S in T['sketchs']:
        lieu = LIEUX.get(str(S.get('lieu') or '').strip().capitalize())   # « cour » (ep02, ep03, troupe élargie) = « Cour »
        if not lieu: continue
        a, b = int(S['t0'] * sr), min(N, int(S['t1'] * sr)); n = b - a
        if n <= sr: continue
        lit = np.zeros(n, np.float32)
        for nom in lieu['lit']:
            x = boucle(son(int(rng.choice(SONS[nom])), sr), n, sr, rng)
            Lx = mesure.integrated_loudness(x.astype(np.float64)); g = 10 ** ((L_voix - SOUS_VOIX_DB - Lx) / 20) if np.isfinite(Lx) else 0.05
            lit += x * g * (1.0 if nom in ('oiseaux', 'resto') else 0.7)
        # ponctuations dans les silences (≥ 1,2 s sans réplique), jamais à moins de 1 s d'une chute
        chutes = [L['t0'] for L in T['lines'] if L.get('chute') and L.get('sketch') == S['id']]
        silences = []; t = S['t0'] + 0.4
        for L in sorted((L for L in T['lines'] if L.get('sketch') == S['id']), key=lambda L: L['t0']):
            if L['t0'] - t >= 1.2: silences.append((t, L['t0']))
            t = max(t, L['t0'] + L['dur'])
        for nom in lieu['silences']:
            for (u0, u1) in silences[:3]:
                if any(abs(u0 - c) < 1.0 or u0 <= c <= u1 for c in chutes): continue
                x = son(int(rng.choice(SONS[nom])), sr)[: int(min(u1 - u0 - 0.3, 2.5) * sr)]
                if len(x) < int(0.3 * sr): continue
                x[-int(0.2 * sr):] *= np.linspace(1, 0, int(0.2 * sr)); i0 = int((u0 + 0.15 - S['t0']) * sr)
                lit[i0:i0 + len(x)] += x[:max(0, n - i0)] * 0.55; journal.append((nom, round(u0 + 0.15, 2)))
        for nom in lieu['ouverture']:   # le coq ouvre la scène, avant la première réplique
            premiere = min((L['t0'] for L in T['lines'] if L.get('sketch') == S['id']), default=S['t0'] + 1)
            x = son(int(rng.choice(SONS[nom])), sr)[: int(max(0.4, premiere - S['t0'] - 0.1) * sr)]
            if len(x) >= int(0.4 * sr):
                x[-int(0.25 * sr):] *= np.linspace(1, 0, int(0.25 * sr)); lit[:len(x)] += x * 0.6; journal.append((nom, round(S['t0'], 2)))
        f = int(0.6 * sr); lit[:f] *= np.linspace(0, 1, f); lit[-f:] *= np.linspace(1, 0, f)
        for c in chutes:   # silence avant la chute, retour en 0,8 s
            i = int((c - 0.35 - S['t0']) * sr); j = int((c + 0.8 - S['t0']) * sr)
            if 0 <= i < n: lit[i:min(n, j)] *= np.linspace(0, 1, min(n, j) - i) ** 2
        amb[a:b] += lit
    duck = 10 ** (-DUCK_DB * np.convolve(parle, np.ones(int(0.15 * sr)) / int(0.15 * sr), 'same') / 20)
    sortie = voix + amb * duck.astype(np.float32)
    pk = np.abs(sortie).max(); sortie = sortie / pk * 0.98 if pk > 0.98 else sortie
    L_amb = mesure.integrated_loudness((amb * duck).astype(np.float64)) if np.abs(amb).max() > 0 else float('-inf')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(sr), '-ac', '1', '-i', '-', SORTIE],
                   input=(np.clip(sortie, -1, 1) * 32767).astype(np.int16).tobytes(), check=True)
    rapport = {'voix_lufs': round(L_voix, 1), 'ambiance_lufs': round(L_amb, 1), 'ecart_db': round(L_voix - L_amb, 1), 'ponctuations': journal}
    json.dump(rapport, open(os.path.splitext(SORTIE)[0] + '.json', 'w'), ensure_ascii=False, indent=1)
    print('ambiance réelle :', json.dumps(rapport, ensure_ascii=False))
