# MUSIQUE, EFFETS ET SON JUGÉS PAR JEV (17/10/2026). Consigne : « le ton de l'humour, la musique, les effets, les
# écritures, tout doit être soumis à JEV ». JEV n'entend pas : le son lui est montré MESURÉ — feuille de son (répliques,
# chutes, musique et jingles avec leurs niveaux, silences, sauts de niveau, sonie et crête du fichier livré) et
# spectrogramme annoté (répliques en vert, musique en orange) — et il juge le montage sonore comme un monteur son.
# Aucune tolérance : chaque décision doit être « conforme ».
#   python3 jev_son.py timeline.json voix/mix.wav voix/mix-musique.wav bande.wav sortie.json
import json, sys, uuid, wave
import numpy as np, cv2
import jev_api, sonie

Q = {'musique_couvre': (False, 'Read `feuille`. Does any music or jingle play during a spoken line at a level less than 10 dB below the voice, so that it could cover the words?'),
     'jingle_place': (True, 'Read `feuille`. Does each jingle start right after the punchline of a sketch (within about 1.5 s) without overlapping any spoken line?'),
     'silence': (False, 'Read `feuille`. Inside a sketch, is there an awkward silence longer than 1.5 s between two lines?'),
     'saut': (False, 'Read `feuille`. Does the loudness of the voices jump abruptly (more than 6 dB) from one line to the next?'),
     'rythme': (True, 'Read `feuille` and look at `spectre` (green = spoken lines, orange = music). Does the sound timing support the comedy like a '
                'professional TikTok sketch: tight dialogue, a short beat before each punchline, a jingle as a sting after it?'),
     'technique': (True, 'Read `feuille`. Is the delivered sound technically correct for TikTok: integrated loudness between -16 and -12 LUFS and true '
                   'peak at or below -1 dBTP?')}


def lit(f):
    with wave.open(f) as w:
        sr = w.getframerate(); n = w.getnframes(); ch = w.getnchannels(); x = np.frombuffer(w.readframes(n), np.int16).astype(np.float32) / 32768
    return (x.reshape(-1, ch).mean(1) if ch > 1 else x), sr


def db(x): return float(20 * np.log10(max(1e-6, float(np.sqrt(np.mean(np.square(x))) if len(x) else 0.0))))


if __name__ == '__main__':
    TL, DIA, MUS, BANDE, OUT = sys.argv[1:6]
    T = json.load(open(TL)); d, sr = lit(DIA); m_, sr2 = lit(MUS); n = min(len(d), len(m_)); d, m_ = d[:n], m_[:n]; mus = m_ - d
    hop = sr // 10; fr = np.array([db(mus[i:i + hop]) for i in range(0, n - hop, hop)])
    seg, on = [], None
    for k, v in enumerate(fr):
        if v > -45 and on is None: on = k
        if (v <= -45 or k == len(fr) - 1) and on is not None:
            if k - on >= 2: seg.append({'debut': round(on / 10, 2), 'fin': round(k / 10, 2), 'niveau_db': round(float(fr[on:k].max()), 1)})
            on = None
    lignes = []
    for L in T['lines']:
        a, b = int(L['t0'] * sr), int((L['t0'] + L['dur']) * sr); v_ = db(d[a:b]); mu = db(mus[a:b])
        lignes.append({'sketch': L['sketch'], 'personnage': L['qui'].title(), 'debut': round(L['t0'], 2), 'fin': round(L['t0'] + L['dur'], 2),
                       'voix_db': round(v_, 1), 'musique_pendant_db': round(mu, 1), 'ecart_voix_musique_db': round(v_ - mu, 1), 'chute': bool(L.get('chute'))})
    silences = [{'sketch': a['sketch'], 'apres': a['fin'], 'duree_s': round(b['debut'] - a['fin'], 2)} for a, b in zip(lignes, lignes[1:]) if a['sketch'] == b['sketch'] and b['debut'] - a['fin'] > 0.8]
    sauts = [{'de': a['debut'], 'a': b['debut'], 'saut_db': round(b['voix_db'] - a['voix_db'], 1)} for a, b in zip(lignes, lignes[1:]) if a['sketch'] == b['sketch']]
    yb_, srb_ = sonie.lit(BANDE); I, TP = sonie.mesure(yb_, srb_)
    feuille = {'repliques': lignes, 'musique_et_jingles': seg, 'silences_entre_repliques_plus_de_0_8_s': silences,
               'ecarts_de_niveau_entre_repliques_db': sauts, 'fichier_livre': {'sonie_integree_lufs': round(I, 1), 'crete_vraie_dbtp': round(TP, 1)}}
    # spectrogramme annoté (log-fréquence, 0–8 kHz), répliques en vert, musique en orange
    x = m_[::max(1, sr // 16000)]; srx = sr // max(1, sr // 16000); win = 512; hopx = srx // 50
    S = np.array([np.abs(np.fft.rfft(x[i:i + win] * np.hanning(win))) for i in range(0, len(x) - win, hopx)]).T
    S = 20 * np.log10(S + 1e-6); S = np.clip((S - S.max() + 70) / 70, 0, 1)
    img = cv2.applyColorMap((cv2.resize(S[::-1], (1400, 300)) * 255).astype(np.uint8), cv2.COLORMAP_MAGMA)
    big = np.zeros((360, 1400, 3), np.uint8); big[:300] = img; W_ = 1400 / (n / sr)
    for L in lignes: cv2.rectangle(big, (int(L['debut'] * W_), 305), (int(L['fin'] * W_), 325), (60, 200, 60), -1)
    for s_ in seg: cv2.rectangle(big, (int(s_['debut'] * W_), 330), (int(s_['fin'] * W_), 350), (0, 140, 255), -1)
    cv2.imwrite(OUT.replace('.json', '_spectre.jpg'), big)
    ids = {'spectre': f'spectre-{uuid.uuid4().hex[:8]}'}
    a = jev_api.demande({'feuille': feuille, **ids}, {k: {'type': 'noul', 'instructions': t} for k, (_, t) in Q.items()},
                        {ids['spectre']: {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(big)}}, outil='jev_son')
    r = {k: round(float(a[k]['noul']), 3) for k in Q}; defauts = sorted(k for k, (att, _) in Q.items() if (r[k] <= 0.5 if att else r[k] >= 0.5))
    json.dump({'synthese': {'ok': not defauts, 'defauts': defauts, 'reponses': r}, 'feuille': feuille}, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print('jev_son', 'OK' if not defauts else 'À REPRENDRE', defauts, r)
