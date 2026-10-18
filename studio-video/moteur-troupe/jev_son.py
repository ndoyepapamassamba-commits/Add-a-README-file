# MUSIQUE, EFFETS ET SON JUGÉS PAR JEV (17/10/2026). Consigne : « le ton de l'humour, la musique, les effets, les
# écritures, tout doit être soumis à JEV ». JEV n'entend pas : le son lui est montré MESURÉ — feuille de son (répliques,
# chutes, musique et jingles avec leurs niveaux, silences, sauts de niveau, sonie et crête du fichier livré) et
# spectrogramme annoté (répliques en vert, musique en orange) — et il juge le montage sonore comme un monteur son.
# Aucune tolérance : chaque décision doit être « conforme ».
#   python3 jev_son.py timeline.json voix/mix.wav voix/mix-musique.wav bande.wav sortie.json
import json, os, sys, uuid, wave
import numpy as np, cv2
import jev_api, sonie

Q = {'musique_couvre': (False, 'Read `feuille`. Does any music, jingle or laughter play during a spoken line at a level less than 10 dB below the voice, so that it could cover the words?'),
     # RIRES CALÉS SUR LES TIKTOK (18/10/2026) : « après le choc de fin de chaque sketch, ça doit être accompagné de rire comme
     # dans mes TikTok » — mesure YAMNet des 12 TikTok : aucune musique sous les dialogues, une salve de rires après chaque
     # blague au niveau des voix. La question des jingles (« jingle_place ») devient celle des rires de fin de sketch.
     'rires_place': (True, 'Read `feuille.rires_mesures`, `feuille.rires_entendus_yamnet` and `feuille.reference_tiktok`. Like the reference TikTok '
                     'sketches, does EACH sketch end with a burst of audience laughter that starts less than 1 s after its final shock '
                     '(`ecart_apres_la_prise_de_choc_s`), lasts 1 to 3.5 s (`duree_s`), is within 3 dB of the voices (`ecart_rire_moins_voix_db`), '
                     'is heard as laughter (`entendu`) and does not overlap a spoken line (`chevauche_une_replique` false)?'),
     'silence': (False, 'Read `feuille`. Inside a sketch, is there an awkward silence longer than 1.5 s between two lines?'),
     'saut': (False, 'Read `feuille`. Does the loudness of the voices jump abruptly (more than 6 dB) from one line to the next?'),
     'rythme': (True, 'Read `feuille` and look at `spectre` (green = spoken lines, orange = laughter or music). Does the sound timing support the comedy like '
                'the reference TikTok sketches (`reference_tiktok`): tight dialogue with no music under it, a short beat before each punchline (`chute`), and '
                'a burst of laughter after the final shock of each sketch?'),
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
                       'voix_db': round(v_, 1), 'musique_pendant_db': round(mu, 1), 'ecart_voix_musique_db': round(v_ - mu, 1), 'chute': bool(L.get('chute')),
                       'derniere': L is max((x for x in T['lines'] if x['sketch'] == L['sketch']), key=lambda x: x['t0'])})
    silences = [{'sketch': a['sketch'], 'apres': a['fin'], 'duree_s': round(b['debut'] - a['fin'], 2)} for a, b in zip(lignes, lignes[1:]) if a['sketch'] == b['sketch'] and b['debut'] - a['fin'] > 0.8]
    sauts = [{'de': a['debut'], 'a': b['debut'], 'saut_db': round(b['voix_db'] - a['voix_db'], 1)} for a, b in zip(lignes, lignes[1:]) if a['sketch'] == b['sketch']]
    yb_, srb_ = sonie.lit(BANDE); I, TP = sonie.mesure(yb_, srb_)
    # MESURES DÉRIVÉES (18/10/2026) : JEV n'entend pas et ne calcule pas — v30, les jingles tombaient 0,3–1,2 s après la fin
    # de chaque sketch mais il fallait le déduire de dizaines de bornes (« jingle bien placé » 0,35–0,45) ; chaque grandeur
    # que juge une question est désormais mesurée et écrite telle quelle
    fins = {}
    for L in lignes: fins[L['sketch']] = max(fins.get(L['sketch'], 0.0), L['fin'])
    jingles = []
    for s_ in seg:
        avant = [(f_, sk) for sk, f_ in fins.items() if f_ <= s_['debut'] + 0.05]
        f_, sk = max(avant) if avant else (None, None)
        jingles.append({'debut': s_['debut'], 'fin': s_['fin'], 'apres_le_sketch': sk, 'fin_de_sa_derniere_replique': f_,
                        'ecart_apres_la_derniere_replique_s': None if f_ is None else round(s_['debut'] - f_, 2),
                        'chevauche_une_replique': any(L['debut'] < s_['fin'] and s_['debut'] < L['fin'] for L in lignes)})
    ecarts = [round(b['debut'] - a['fin'], 2) for a, b in zip(lignes, lignes[1:]) if a['sketch'] == b['sketch']]
    rythme = {'ecart_median_entre_repliques_s': float(np.median(ecarts)) if ecarts else None,
              'pause_avant_chaque_chute_s': [round(b['debut'] - a['fin'], 2) for a, b in zip(lignes, lignes[1:]) if a['sketch'] == b['sketch'] and b['chute']]}
    # accompagnement posé (musique.py) et rires ENTENDUS dans la bande livrée : YAMNet, même outil que pour les TikTok
    acc = json.load(open(MUS + '.json')) if os.path.isfile(MUS + '.json') else {}
    entendus = []
    try:
        import oreille as ecoute
        a_ = ecoute.analyse(BANDE)
        for r_ in acc.get('rires', []):
            fen = [(t_, tp_) for t_, tp_ in a_['top'] if r_['debut'] - 0.3 <= t_ <= r_['fin']]
            oui = [t_ for t_, tp_ in fen if any(n_ in ('Laughter', 'Giggle', 'Snicker', 'Chuckle, chortle', 'Belly laugh') for n_, _ in tp_[:3])]
            entendus.append({'sketch': r_['sketch'], 'fenetres': len(fen), 'fenetres_avec_rire': len(oui), 'entendu': bool(oui)})
    except Exception as e_:
        entendus = [{'erreur': str(e_)[:120]}]
    voix_med = float(np.median([L['voix_db'] for L in lignes])) if lignes else -20.0
    rires_mesures = []
    for r_ in acc.get('rires', []):
        a_, b_ = int(r_['debut'] * sr), int(r_['fin'] * sr); seg_ = mus[a_:b_]; act_ = seg_[np.abs(seg_) > 0.02 * (np.abs(seg_).max() + 1e-9)]
        rires_mesures.append({'sketch': r_['sketch'], 'prise_de_choc': r_['prise_de_choc'], 'debut': r_['debut'],
                              'ecart_apres_la_prise_de_choc_s': round(r_['debut'] - r_['prise_de_choc'], 2), 'duree_s': round(r_['fin'] - r_['debut'], 2),
                              'niveau_rire_db': round(db(act_), 1), 'niveau_median_des_voix_db': round(voix_med, 1),
                              'ecart_rire_moins_voix_db': round(db(act_) - voix_med, 1),
                              'chevauche_une_replique': any(L['debut'] < r_['fin'] and r_['debut'] < L['fin'] for L in lignes)})
    # AIGUS MESURÉS (18/10/2026, « le son est aigu par moments ») : sifflantes au-dessus de 5 kHz et pointes de hauteur au-delà
    # de 1,6 × la voix visée de chaque personnage, sur la bande livrée — contrôle dur
    try:
        import sonie, voix as voix_
        b_, sr_b = lit(BANDE) if os.path.isfile(BANDE) else (m_, sr)   # la bande LIVRÉE (après dé-esseur et mastering), plus le mixage brut
        aigus_ = sonie.aigus(b_, sr_b, T['lines'], {k_: c_[2] for k_, c_ in voix_.CAST.items()})
    except Exception as e_:
        aigus_ = [{'erreur': str(e_)[:120]}]
    feuille = {'repliques': lignes, 'rires_mesures': rires_mesures, 'aigus_mesures': aigus_, 'accompagnement': {k_: acc.get(k_) for k_ in ('rires', 'jingles')}, 'rires_entendus_yamnet': entendus,
               'reference_tiktok': acc.get('reference_tiktok'), 'musique_rires_et_jingles': seg, 'jingles_mesures': jingles, 'rythme_mesure': rythme,
               'silences_entre_repliques_plus_de_0_8_s': silences,
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
    if acc.get('rires') is not None and (len(acc['rires']) < len(T['sketchs']) or not all(e_.get('entendu') for e_ in entendus)):
        defauts = sorted(set(defauts) | {'rires_absents'})   # contrôle dur (mesuré) : chaque sketch finit sur des rires entendus
    if aigus_: defauts = sorted(set(defauts) | {'son_aigu'})
    json.dump({'synthese': {'ok': not defauts, 'defauts': defauts, 'reponses': r}, 'feuille': feuille}, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print('jev_son', 'OK' if not defauts else 'À REPRENDRE', defauts, r)
