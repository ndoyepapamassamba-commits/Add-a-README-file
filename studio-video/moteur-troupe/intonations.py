# SONS INTERMÉDIAIRES D'INTONATION (18/10/2026) — « gérer les sons intermédiaires d'intonation et autres ». Mesure YAMNet
# (oreille.py) des 12 TikTok de l'utilisateur : 4,9 fenêtres par minute (médiane, 3,9 à 6,9) de sons vocaux HORS paroles —
# cris (Shout 28, Yell 14, Screaming 13), grognements (Groan 27), soupirs (Sigh 6), halètements (Gasp 3) ; notre film v2 : 0.
# Les interjections lues par Piper (« Eeeh ! », « Hmm ? ») restent classées « Speech » par YAMNet et le vocodeur seul ne
# sait pas crier : on part de VRAIES interjections humaines (Mixkit, usage gratuit en vidéo ; fichiers bruts jamais
# redistribués, cache hors dépôt) classées par YAMNet comme celles des TikTok, puis passées dans la VOIX DU PERSONNAGE par
# la même transformation WORLD que ses répliques (voix.shape : hauteur, étendue, timbre).
#   — grognement d'écoute (« hmm » bouche fermée) : celui à qui l'on fait une réplique de frime ou d'excuse le dit APRÈS
#     elle, avant de répondre (inséré dans le minutage par voix.py : rien n'est couvert) — au plus un par sketch ;
#   — souffle de choc sur la prise de choc de fin de sketch (jeu.prise_t), bouche bée déjà ouverte à l'image.
import json, os, subprocess
import numpy as np

CACHE = os.path.expanduser(os.environ.get('INTONATIONS_CACHE', '~/.cache/massamba-models/intonations'))
# sons choisis par YAMNet (classes les plus fortes, 18/10/2026) : grognements 2768 (Groan 0,74), 966 (Groan 0,74, Sigh
# 0,67), 965 (Groan 0,59) ; souffles de choc 964 (Groan 0,67, Sigh 0,59, Gasp 0,59), 968 (Sigh 0,74, Groan 0,59, Gasp 0,41)
SONS = {'grogne': [2768, 966, 965], 'choc': [964, 968]}
NIVEAU = {'grogne': -19.0, 'choc': -19.0}   # LUFS : les répliques sont à −16 ; grognement et souffle un cran dessous
# 18/10/2026 (« le son est aigu par moments ») : les souffles de choc de la v3 portaient 8 à 10 % de leur énergie au-dessus de
# 5 kHz (la parole : 0,3 à 6 %), au niveau des voix — un sifflement. Passe-bas (Butterworth ordre 4) et niveau −19 LUFS.
PASSE_BAS = {'grogne': 3800.0, 'choc': 4200.0}
DUREE_MAX = {'grogne': 0.75, 'choc': 1.1}
JEUX_GROGNE = ('frime', 'innocent')         # réplique qui appelle le « hmm… » sceptique de celui à qui elle s'adresse


def _brut(i, sr):
    os.makedirs(CACHE, exist_ok=True); f = f'{CACHE}/{i}.mp3'
    if not os.path.isfile(f): subprocess.run(['curl', '-s', '-L', '-m', '60', '-o', f, f'https://assets.mixkit.co/active_storage/sfx/{i}/{i}-preview.mp3'], check=True)
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.int16)


def son(qui, sorte, k=0):
    """interjection `sorte` dans la voix de `qui` (int16 à voix.SR) : la première des variantes (à partir de k) que le contrôle
    de hauteur (sonie.aigus) accepte — 19/10/2026, 17 variantes sur 18 passaient, le grognement 3 de Coumba restait à 245 Hz
    pour 215 visés ; aucune ne passe : celle dont la médiane est la plus proche de la cible."""
    import voix, sonie
    n = len(SONS[sorte]); essais = []
    for d in range(n):
        y = _son1(qui, sorte, k + d)
        f = [x for x in sonie.aigus(y.astype(np.float64) / 32768, voix.SR, [{'qui': qui, 't0': 0.0, 'dur': len(y) / voix.SR}], {qui: voix.CAST[qui][2]}) if x.get('sorte') == 'hauteur']
        if not f: return y
        essais.append((abs(f[0]['mediane_hz'] / f[0]['cible_hz'] - 1), d, y))
    return min(essais, key=lambda e: e[:2])[2]


def _son1(qui, sorte, k=0):
    """une variante : silences de tête et de queue retirés, hauteur à la norme, sonie réglée."""
    import voix, pyloudnorm as pyln
    sr = voix.SR; i = SONS[sorte][k % len(SONS[sorte])]; x = _brut(i, sr)
    e = np.abs(x.astype(np.float32)); thr = 0.03 * (e.max() + 1)
    a = max(0, int(np.argmax(e > thr)) - int(0.02 * sr)); b = min(len(x), len(x) - int(np.argmax(e[::-1] > thr)) + int(0.05 * sr))
    x = x[a:b][:int(DUREE_MAX[sorte] * sr)]
    _, _, f0t, spread, _, fm = voix.CAST[qui]
    # NORME DE HAUTEUR (19/10/2026, « la voix est encore aiguë par moments ») : le souffle de choc de Maman montait à 1,24 fois
    # sa hauteur (p95 1,32) — même boucle mesurée que les répliques (voix.forme_mesuree), sans la bosse d'exclamation
    y = voix.forme_mesuree(x, sr, f0t, min(spread, 1.2), fm, False, False).astype(np.float64) / 32768
    import scipy.signal as ss_
    y = ss_.sosfiltfilt(ss_.butter(4, PASSE_BAS[sorte], 'low', fs=sr, output='sos'), y)
    n = len(y); y *= np.minimum(1, np.arange(n) / (0.01 * sr)) * np.minimum(1, (n - np.arange(n)) / (0.12 * sr))   # fondus
    m = pyln.Meter(sr); probe = np.tile(y, int(np.ceil(0.8 * sr / max(1, n))) + 1) if n < 0.8 * sr else y
    lo = m.integrated_loudness(probe); y = y * 10 ** ((NIVEAU[sorte] - lo) / 20)
    return (np.clip(y, -1, 1) * 32767).astype(np.int16)


def grognement(L, suivante, deja):
    """après la réplique L, celui à qui elle s'adresse grogne-t-il (et répond-il juste après) ? → nom ou None."""
    a = L.get('a')
    if L.get('chute') or L.get('jeu') not in JEUX_GROGNE or not a or a in deja: return None
    if not suivante or suivante.get('qui') != a: return None   # il répond juste après : le « hmm » ouvre sa réplique
    return a
