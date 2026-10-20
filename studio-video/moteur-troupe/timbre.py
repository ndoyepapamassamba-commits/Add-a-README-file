# TIMBRE DES VOIX CALÉ SUR LES TIKTOK DE L'UTILISATEUR (18/10/2026) — « la sortie son trop aiguë ». Mesure (outils/ltas.py,
# courbe spectrale moyenne en tiers d'octave) : la HAUTEUR était déjà naturelle (hommes 119–127 Hz, femmes 209–225 Hz), mais
# le TIMBRE était trop brillant : 12 à 15 dB de trop vers 8–10 kHz (souffle, sifflantes de la resynthèse) et 3 à 6 dB vers
# 4–6 kHz par rapport aux voix des TikTok (part d'énergie au-dessus de 3 kHz : 10–30 % chez nous, 3–4 % chez elles).
# Remède : égaliseur « d'appariement » par personnage (principe des égaliseurs de mastering « match EQ ») — gain par tiers
# d'octave = courbe des TikTok du même registre − courbe du personnage (sur toutes ses répliques), entier au-dessus de 1,5 kHz
# (borné à −15 / +4 dB), à moitié en dessous (le corps de la voix et son caractère restent), lissé, appliqué par un filtre
# FIR à phase linéaire ; sonie remise à −16 LUFS.   python3 timbre.py timeline.json  (refait voix/*.wav et voix/mix.wav)
import json, os, sys, wave
import numpy as np, scipy.signal as ss, pyloudnorm as pyln

REF = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'timbre_ref.json')))
FC = np.asarray(REF['fc'], np.float64)


def lire(f):
    with wave.open(f) as w: return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768, w.getframerate()


def ecrire(f, y, sr):
    with wave.open(f, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())


def courbe(ys, sr):
    """courbe spectrale moyenne (dB relatifs, tiers d'octave) des passages parlés d'un ensemble de prises."""
    n = 2048; h = np.hanning(n); P = np.zeros(n // 2 + 1); m = 0
    for a in ys:
        for i in range(0, len(a) - n, n // 2):
            f = a[i:i + n]
            if np.sqrt(np.mean(f ** 2)) < 0.01: continue
            P += np.abs(np.fft.rfft(f * h)) ** 2; m += 1
    fr = np.fft.rfftfreq(n, 1 / sr); b = np.array([P[(fr >= c / 2 ** (1 / 6)) & (fr < c * 2 ** (1 / 6))].sum() for c in FC]) / max(1, m)
    return 10 * np.log10(b / b.sum() + 1e-12)


def gains(propre, registre):
    """gain (dB) par bande pour amener la courbe du personnage sur celle des TikTok du même registre."""
    d = np.asarray(REF['tiktok'][registre]) - propre
    g = np.where(FC >= 1500, np.clip(d, -15, 4), np.clip(0.5 * d, -4, 4))
    g = np.convolve(np.r_[g[0], g, g[-1]], np.ones(3) / 3, 'valid')   # lissé sur trois bandes
    return g - g[(FC >= 300) & (FC <= 1000)].mean()                     # médium de référence à 0 dB


def filtre(g, sr, n=513):
    f = np.r_[0.0, FC / (sr / 2), 1.0]; f = np.clip(f, 0, 1); f[-2] = min(f[-2], 0.999)
    a = 10 ** (np.r_[g[0], g, g[-1]] / 20)
    return ss.firwin2(n, f, a)


def applique(prises, registre, sr):
    """prises : signaux (float) d'UN personnage → mêmes prises égalisées, sonie −16 LUFS ; et les gains (dB) appliqués."""
    g = gains(courbe(prises, sr), registre); h = filtre(g, sr); meter = pyln.Meter(sr); out = []
    for y in prises:
        z = ss.fftconvolve(y, h, mode='same')
        pr = np.tile(z, int(np.ceil(0.8 * sr / max(1, len(z)))) + 1) if len(z) < 0.8 * sr else z
        lo = meter.integrated_loudness(pr); out.append(z * 10 ** ((-16.0 - lo) / 20) if np.isfinite(lo) else z)
    return out, g


def registre(f0):
    return 'femmes' if f0 >= 170 else 'hommes'


if __name__ == '__main__':
    TL = sys.argv[1]; T = json.load(open(TL)); base = os.path.dirname(os.path.abspath(TL))
    from voix import CAST
    par = {}
    for L in T['lines']: par.setdefault(L['qui'], []).append(L)
    sr0 = None
    for q, Ls in par.items():
        ys = []
        for L in Ls: y, sr0 = lire(os.path.join(base, L['wav'])); ys.append(y)
        zs, g = applique(ys, registre(CAST[q][2]), sr0)
        for L, z in zip(Ls, zs): ecrire(os.path.join(base, L['wav']), z, sr0)
        print(q, registre(CAST[q][2]), 'gains dB (4 k, 6,3 k, 8 k, 10 k) :', [round(float(g[list(FC).index(c)]), 1) for c in (4000, 6350, 8000, 10079)])
    mix = np.zeros(int(T['total'] * sr0) + 1)
    for L in T['lines']:
        y, _ = lire(os.path.join(base, L['wav'])); i = int(L['t0'] * sr0); mix[i:i + len(y)] += y[:len(mix) - i]
    ecrire(os.path.join(base, 'voix/mix.wav'), mix, sr0); print('voix/mix.wav refait')
