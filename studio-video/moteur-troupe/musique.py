# JINGLE DE LA TROUPE (17/10/2026) — vos TikTok : dialogue sec, puis un jingle sur la carte émoji entre deux blagues. Le
# jingle est SYNTHÉTISÉ par ce code (aucun échantillon, aucun droit) dans l'esprit d'Abidjan : balafon pentatonique
# (lame de bois : partiels inharmoniques ≈ 1 : 3,9 : 9,6 qui s'éteignent d'autant plus vite qu'ils sont aigus, bourdonnement
# de la calebasse) sur un appel de djembé (claqué, tonique, basse). Chaque carte a sa variante (graine), même signature.
#   python3 musique.py timeline.json voix/mix.wav voix/mix-musique.wav   → la bande dialogue + les jingles aux cartes et en fin
import json, sys, wave
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


if __name__ == '__main__':
    T = json.load(open(sys.argv[1])); src, dst = sys.argv[2], sys.argv[3]
    with wave.open(src) as w: sr = w.getframerate(); y = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    assert sr == SR, 'la bande dialogue doit être à 22 050 Hz (voix.py)'
    instants = [c['t0'] + 0.05 for c in T.get('cartes', [])]
    fin = max(L['t0'] + L['dur'] for L in T['lines']) + 0.35                # sur la dernière réaction, avant le fondu
    if fin + 1.2 < len(y) / SR + 1.5: instants.append(fin)
    y = np.concatenate([y, np.zeros(int(1.5 * SR), np.float32)])
    for k, t0 in enumerate(instants):
        j = jingle(graine=k).astype(np.float32) * 0.5      # ≈ −8 dB sous la crête des voix : un jingle, pas un tapis
        i = int(t0 * SR); y[i:i + len(j)] += j[:len(y) - i]
    y = y[:int((T['total'] + 0.0) * SR)] if T.get('total') else y
    with wave.open(dst, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    print(f'{len(instants)} jingles posés à', [round(t, 2) for t in instants])
