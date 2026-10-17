# SONIE ET CRÊTE DU FILM (17/10/2026, v25) — la porte H exige, sur le FICHIER livré, −14 ± 1 LUFS et une crête vraie
# ≤ −0,9 dBTP (consensus TikTok / EBU R128). Le loudnorm d'ffmpeg en une passe laissait −15,3 LUFS et −0,7 dBTP : la
# parole crête 17 dB au-dessus de sa sonie, un gain seul ne peut pas tenir les deux. Ici, en boucle jusqu'à la cible :
#   1. gain vers −14 LUFS (sonie BS.1770-4 mesurée par ffmpeg ebur128, la même mesure que le contrôle) ;
#   2. limiteur à CRÊTE VRAIE : crêtes cherchées entre les échantillons (suréchantillonnage ×4), gain baissé 3 ms avant
#      la crête (anticipation, sans clic), remonté en 40 ms (relâche : il revient entre deux syllabes) ; plafond −2,3 dBTP, soit 1,4 dB de marge pour l'AAC.
#   python3 sonie.py entree.wav sortie.wav   → bande à 48 kHz prête à encoder (aucun loudnorm ensuite)
import re, subprocess, sys, tempfile, wave
import numpy as np
from scipy.ndimage import minimum_filter1d, uniform_filter1d
from scipy.signal import resample_poly

SR = 48000


def lit(f):
    with wave.open(f) as w:
        sr, n, c = w.getframerate(), w.getnframes(), w.getnchannels()
        y = np.frombuffer(w.readframes(n), np.int16).astype(np.float64) / 32768
    return (y.reshape(-1, c).mean(1) if c > 1 else y), sr


def ecrit(f, y, sr=SR):
    with wave.open(f, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())


def mesure(y, sr=SR):
    """(sonie intégrée LUFS, crête vraie dBTP) par ffmpeg ebur128."""
    with tempfile.NamedTemporaryFile(suffix='.wav') as f:
        ecrit(f.name, y, sr)
        e = subprocess.run(['ffmpeg', '-nostats', '-i', f.name, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'],
                           capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', e)[-1]), float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', e)[-1])


def limiteur(y, sr=SR, plafond_db=-2.0, anticipation=0.003, relache=0.04):
    lim = 10 ** (plafond_db / 20); n = len(y)
    up = np.abs(resample_poly(y, 4, 1))[:4 * n]
    pk = np.pad(up, (0, 4 * n - len(up))).reshape(n, 4).max(1)            # crête vraie autour de chaque échantillon
    g = np.minimum(1.0, lim / np.maximum(pk, 1e-9))
    a = max(1, int(anticipation * sr))
    g = np.minimum(uniform_filter1d(minimum_filter1d(g, 2 * a + 1), a), g)  # baisse étalée sur 3 ms avant la crête
    r = np.exp(-1.0 / (relache * sr)); out = np.empty_like(g); c = 1.0
    for i, v in enumerate(g):
        c = v if v < c else r * c + (1 - r) * v; out[i] = c
    return y * out


def masterise(y, sr_in, cible=-14.0, plafond=-2.3, journal=print):
    """gain avant limiteur cherché sur la bande D'ORIGINE (le limiteur mange de la sonie : on la mesure après lui)."""
    y0 = resample_poly(y, SR, sr_in) if sr_in != SR else y
    g, y, vus = 0.0, y0, []   # gain en dB ; le limiteur rend la sonie moins que proportionnelle au gain : pas de la sécante
    for k in range(8):
        I, tp = mesure(y); vus.append((g, I))
        journal(f'  passe {k}: gain {g:+.2f} dB → {I:.2f} LUFS, crête {tp:.2f} dBTP')
        if abs(I - cible) <= 0.15 and tp <= plafond + 0.1: break
        pente = 1.0 if len(vus) < 2 else max(0.15, (vus[-1][1] - vus[-2][1]) / max(1e-3, vus[-1][0] - vus[-2][0]))
        g += (cible - I) / pente; y = limiteur(y0 * 10 ** (g / 20), SR, plafond)
    G = 10 ** (g / 20)
    gr = 20 * np.log10(np.maximum(np.abs(y), 1e-9) / np.maximum(np.abs(y0 * G), 1e-9))
    journal(f'  limiteur : réduction > 3 dB sur {100 * float((gr[np.abs(y0 * G) > 0.05] < -3).mean()):.1f} % de la parole')
    return y


if __name__ == '__main__':
    y, sr = lit(sys.argv[1]); ecrit(sys.argv[2], masterise(y, sr))
