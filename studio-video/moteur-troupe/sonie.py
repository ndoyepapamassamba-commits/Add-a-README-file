import os
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


# ADOUCISSEUR DES AIGUS (18/10/2026, « le son est aigu par moments, pas tout le temps ») : un dé-esseur spectral. Trame par
# trame (STFT 1 024 / 256), si la part d'énergie au-dessus de 5 kHz dépasse PART_AIGUS, les composantes au-dessus de 4,5 kHz
# (rampe douce 4 → 5 kHz) sont baissées juste assez pour la ramener au seuil (au plus −9 dB), gain lissé dans le temps
# (attaque immédiate, relâche ≈ 50 ms). Ailleurs, rien ne change. Mesure de contrôle : aigus().
PART_AIGUS = 0.06


def adoucit(y, sr, part=PART_AIGUS, plancher_db=-15.0):   # −15 dB (v4 à −9 : « celle » de Maman −9,7 dB ; v5 à −12 : une sifflante à −9,9 dB)
    from scipy.signal import stft, istft
    n = len(y); f, t, Z = stft(y, sr, nperseg=1024, noverlap=768); P = np.abs(Z) ** 2
    hf = f >= 5000; tot = P.sum(0) + 1e-12; r = P[hf].sum(0) / tot
    g = np.where(r > part, np.sqrt(part / np.maximum(r, 1e-9)), 1.0); g = np.maximum(g, 10 ** (plancher_db / 20))
    k = max(1, int(round(0.05 * sr / 256)))                      # relâche ≈ 50 ms : le gain remonte doucement
    g = minimum_filter1d(g, 3); g = np.minimum(g, uniform_filter1d(g, 2 * k + 1))
    rampe = np.clip((f - 4000.0) / 1000.0, 0, 1)[:, None]
    Z = Z * (1 - rampe + rampe * g[None, :])
    _, out = istft(Z, sr, nperseg=1024, noverlap=768)
    return np.pad(out, (0, max(0, n - len(out))))[:n]


def aigus(y, sr, lignes=None, cibles=None, seuil_db=-10.0, rapport_f0=1.6):
    """contrôle : fenêtres de 0,1 s où l'énergie au-dessus de 5 kHz (sifflantes, souffles) dépasse `seuil_db` sous le niveau
    médian de la parole (v3 : jusqu'à −2,7 dB, « aigu par moments » ; après adoucit() : −11,6 dB au pire), et répliques dont
    la hauteur p95 dépasse `rapport_f0` × la hauteur visée du personnage → liste des fautes (vide = conforme)."""
    import scipy.signal as ss_
    fautes = []; w = int(0.1 * sr)
    yh = ss_.sosfiltfilt(ss_.butter(4, 5000, 'high', fs=sr, output='sos'), y)
    r = np.array([np.sqrt(np.mean(y[i:i + w] ** 2)) for i in range(0, len(y) - w, w)])
    h = np.array([np.sqrt(np.mean(yh[i:i + w] ** 2)) for i in range(0, len(y) - w, w)])
    ref = float(np.median(r[r > 0.1 * r.max()])) if r.size and r.max() > 0 else 1.0
    for k, v in enumerate(20 * np.log10(h / ref + 1e-9)):
        if v > seuil_db: fautes.append({'t': round(k * w / sr, 2), 'sorte': 'sifflante', 'db_sous_la_parole': round(float(v), 1)})
    if lignes and cibles:
        import pyworld as pw
        for L in lignes:
            c = cibles.get(L['qui'])
            if not c: continue
            # la VOIX SEULE du personnage (fichier de la réplique) : dans la bande, la fin de la réplique précédente d'une autre
            # voix chevauche le début (v4 : Modou « à 266 Hz » = 80 ms de Tantie Awa ; sa propre voix : p95 180 Hz)
            if L.get('wav') and os.path.isfile(L['wav']):
                import soundfile as sf_; x, sr_l = sf_.read(L['wav']); x = (x.mean(1) if x.ndim > 1 else x).astype(np.float64)
            else:
                x, sr_l = y[int(L['t0'] * sr):int((L['t0'] + L['dur']) * sr)].astype(np.float64), sr
            if len(x) < sr_l // 5: continue
            # hauteur ROBUSTE : trames fortes (> 30 % du pic de la réplique) où deux estimateurs s'accordent à 15 % près —
            # Harvest seul prend l'octave au-dessus sur les attaques faibles (Modou « 266 Hz » : 179 Hz sur ces trames)
            f0, tf = pw.harvest(x, sr_l, f0_floor=60, f0_ceil=900, frame_period=10)
            fd, td = pw.dio(x, sr_l, f0_floor=60, f0_ceil=900, frame_period=10); fd = pw.stonemask(x, fd, td, sr_l)
            hp = int(0.01 * sr_l); e = np.array([np.sqrt(np.mean(x[max(0, int(t_ * sr_l) - hp):int(t_ * sr_l) + hp] ** 2)) for t_ in tf])
            m = min(len(f0), len(fd)); f0, fd, e = f0[:m], fd[:m], e[:m]
            v = f0[(f0 > 0) & (fd > 0) & (np.abs(np.log(np.maximum(fd, 1) / np.maximum(f0, 1))) < 0.15) & (e > 0.3 * (e.max() + 1e-12))]
            if len(v) > 10 and np.percentile(v, 95) > rapport_f0 * c:
                fautes.append({'t': round(L['t0'], 2), 'sorte': 'hauteur', 'qui': L['qui'], 'p95_hz': round(float(np.percentile(v, 95))), 'cible_hz': c})
    return fautes


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
