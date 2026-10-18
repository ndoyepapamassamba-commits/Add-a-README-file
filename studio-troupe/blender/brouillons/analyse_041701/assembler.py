"""Assemble analyse.json (toutes les mesures de 041701)."""
import json, math
import numpy as np
from scipy.ndimage import median_filter, uniform_filter1d

R = '/home/user/Add-a-README-file/studio-troupe/.private/references/041701'
W = R + '/travail'
A = '/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/ana041701'
FPS = 30.0
N = 301
Y0 = 531


def r(x, n=3):
    if isinstance(x, dict):
        return {k: r(v, n) for k, v in x.items()}
    if isinstance(x, (list, tuple, np.ndarray)):
        return [r(v, n) for v in x]
    if x is None or isinstance(x, (str, bool, np.bool_)):
        return bool(x) if isinstance(x, np.bool_) else x
    x = float(x)
    return round(x, n) if math.isfinite(x) else None


cam = json.load(open(W + '/camera.json'))
wh = json.load(open(W + '/whisper_small.json'))
mes = {k: json.load(open(f'{A}/{f}')) for k, f in [('image_entiere_12s', 'mes_full.json'), ('bande_scene_0_10s', 'mes_bande_scene.json'),
                                                     ('image_entiere_0_10s', 'mes_full_scene.json'), ('bande_0_12s', 'mes_bande_12s.json')]}
P = np.load(W + '/persos.npy', allow_pickle=True).item()
sil = json.load(open(W + '/silhouettes.json'))
dband = np.load(W + '/diff_band.npy')
f0 = np.load(W + '/f0.npy')
ecart = np.load(W + '/ecart_repos.npy')
env_db = np.load(W + '/enveloppe_audio.npy')
t = np.arange(N) / FPS

# ---------------------------------------------------------------- plans-poses (segments générés) et transitions
SEGMENTS = [
    {'id': 'S1', 'type': 'plan', 'i0': 0, 'i1': 60},
    {'id': 'T1', 'type': 'transition (morphing IA)', 'i0': 61, 'i1': 75},
    {'id': 'S2', 'type': 'plan', 'i0': 76, 'i1': 129},
    {'id': 'T2', 'type': 'transition (morphing IA)', 'i0': 130, 'i1': 141},
    {'id': 'S3', 'type': 'plan', 'i0': 142, 'i1': 267, 'note': 'micro-morphing de la tête du tonton 173–175 (5,77–5,83 s)'},
    {'id': 'T3', 'type': 'transition (pivot rapide)', 'i0': 268, 'i1': 276},
    {'id': 'S4', 'type': 'plan', 'i0': 277, 'i1': 300},
    {'id': 'FIN', 'type': 'carte de fin (émoji)', 'i0': 301, 'i1': 368},
]
for s in SEGMENTS:
    s['debut'] = r(s['i0'] / FPS, 3)
    s['fin'] = r((s['i1'] + 1) / FPS, 3)
    if s['i1'] <= 300:
        s['diff_moyenne_bande'] = r(dband[s['i0']:s['i1'] + 1].mean(), 2)

# ---------------------------------------------------------------- bouche
def norm01(x, lo=5, hi=95):
    a, b = np.nanpercentile(x, lo), np.nanpercentile(x, hi)
    return np.clip((x - a) / max(1e-6, b - a), 0, 1)


act = {'voisine': norm01(uniform_filter1d(P['V']['diff'], 3)), 'tonton': norm01(uniform_filter1d(P['T']['diff'], 3))}
ouv = {'voisine': np.clip(0.5 * norm01(uniform_filter1d(P['V']['ouv_rtmw'], 3)) + 0.5 * norm01(uniform_filter1d(P['V']['sombre'], 3)), 0, 1),
       'tonton': norm01(uniform_filter1d(ecart[1], 3))}
jaw = {'voisine': P['V']['jaw'], 'tonton': P['T']['jaw']}


def moyenne(serie, a, b):
    m = (t >= a) & (t < b)
    return float(np.nanmean(serie[m])) if m.any() else float('nan')


# ---------------------------------------------------------------- dialogue
segs = wh['vad_on']['segments']
lignes = [segs[0], segs[1], segs[2], {'start': segs[3]['start'], 'end': segs[4]['end'], 'text': segs[3]['text'] + segs[4]['text'],
                                      'words': segs[3]['words'] + segs[4]['words']}]
TEXTES = ['Ivrogne, c\'est comme ça que tu passes ton temps ?', 'Tais-toi ! Je suis déjà énervé contre moi-même !',
          'Et cela pourquoi donc ?', 'J\'ai bu toute la journée pour t\'oublier ! Et maintenant je te vois en double !']
lignes_out = []
for k, L in enumerate(lignes):
    a, b = L['start'], L['end']
    votes = {'voisine': 0, 'tonton': 0}
    for w in L['words']:
        if w['w'].strip() in ('?', '!', ',', '.'):
            continue
        sv, st = moyenne(act['voisine'], w['start'], w['end'] + 0.05), moyenne(act['tonton'], w['start'], w['end'] + 0.05)
        votes['voisine' if sv > st else 'tonton'] += 1
    loc = max(votes, key=votes.get)
    v = f0[1][(f0[0] >= a) & (f0[0] < b)]
    v = v[np.isfinite(v)]
    lignes_out.append({
        'n': k + 1, 'locuteur': loc, 'debut': r(a, 2), 'fin': r(b, 2), 'texte': TEXTES[k], 'texte_whisper': L['text'].strip(),
        'mots': [{'mot': w['w'].strip(), 'debut': r(w['start'], 2), 'fin': r(w['end'], 2), 'p': r(w['p'], 2)} for w in L['words']],
        'activite_bouche_moyenne': {c: r(moyenne(act[c], a, b), 2) for c in act},
        'ouverture_bouche_moyenne': {c: r(moyenne(ouv[c], a, b), 2) for c in ouv},
        'votes_mots_par_bouche': votes, 'f0_median_hz': r(np.median(v), 0) if len(v) else None,
    })

# ---------------------------------------------------------------- personnages
SEG_PLANS = [(0, 61, 'S1'), (76, 130, 'S2'), (142, 268, 'S3'), (277, 301, 'S4')]
persos = {}
for nm, cle in (('V', 'voisine'), ('T', 'tonton')):
    o = P[nm]
    K = o['K'][..., :2]
    Ks = np.stack([median_filter(K[:, j, c], 5, mode='nearest') for j in range(133) for c in range(2)], 1).reshape(N, 133, 2)
    vit = np.linalg.norm(np.diff(Ks, axis=0), axis=2) * FPS / o['torse_m']
    plans = []
    for a, b, s in SEG_PLANS:
        sl = slice(a, b)
        sil_s = [x[nm] for x in sil if a <= x['i'] < b and x[nm]]
        plans.append({
            'plan': s, 'debut': r(a / FPS), 'fin': r(b / FPS),
            'racine_pieds_bande': [r(np.median(o['pied'][sl, 0]), 0), r(np.median(o['sol'][sl]), 0)],
            'racine_pieds_image': [r(np.median(o['pied'][sl, 0]), 0), r(np.median(o['sol'][sl]) + Y0, 0)],
            'bassin_bande': [r(np.median(o['hanche'][sl, 0]), 0), r(np.median(o['hanche'][sl, 1]), 0)],
            'bassin_ecart_type_px': [r(o['hanche'][sl, 0].std(), 1), r(o['hanche'][sl, 1].std(), 1)],
            'nez_bande': [r(np.median(o['nez'][sl, 0]), 0), r(np.median(o['nez'][sl, 1]), 0)],
            'nez_ecart_type_px': [r(o['nez'][sl, 0].std(), 1), r(o['nez'][sl, 1].std(), 1)],
            'inclinaison_buste_deg': {'mediane': r(np.median(o['incl'][sl]), 1), 'min': r(o['incl'][sl].min(), 1), 'max': r(o['incl'][sl].max(), 1)},
            'orientation': max(['gauche', 'face', 'droite'], key=lambda k: int((o['regard'][sl] == k).sum())),
            'lacet_nez_oreilles': r(np.median(o['lacet'][sl]), 2),
            'silhouette_hauteur_px': r(np.median([x['hauteur'] for x in sil_s]), 0) if sil_s else None,
            'silhouette_largeur_px': r(np.median([x['largeur'] for x in sil_s]), 0) if sil_s else None,
            'silhouette_boite_bande': [r(np.median([x['boite'][j] for x in sil_s]), 0) for j in range(4)] if sil_s else None,
            'vitesse_torse_par_s': {nmk: {'mediane': r(np.median(vit[a:b - 1][:, idx]), 2), 'p90': r(np.percentile(vit[a:b - 1][:, idx], 90), 2)}
                                    for nmk, idx in (('nez', [0]), ('poignets', [9, 10]), ('bassin', [11, 12]), ('chevilles', [15, 16]))},
        })
    persos[cle] = {'torse_px': r(o['torse_m'], 0), 'tete_visage_px': r(o['tete'], 0), 'plans': plans,
                   'mediapipe_visage_detecte_pct': r(100 * o['mp_ok'].mean(), 0)}

# ---------------------------------------------------------------- séries par image (30 i/s, 0..300)
series = {'t': r(t, 4), 'diff_bande': r(dband, 2), 'enveloppe_audio_db': r(env_db, 1)}
for nm, cle in (('V', 'voisine'), ('T', 'tonton')):
    o = P[nm]
    series[cle] = {
        'pieds_xy_bande': r(o['pied'], 0), 'bassin_xy_bande': r(o['hanche'], 0), 'nez_xy_bande': r(o['nez'], 0),
        'inclinaison_buste_deg': r(o['incl'], 1), 'lacet': r(o['lacet'], 2),
        'bouche_ouverture_0_1': r(ouv[cle], 2), 'bouche_activite_0_1': r(act[cle], 2),
        'bouche_levres_rtmw': r(o['ouv_rtmw'], 3), 'bouche_cavite_sombre': r(o['sombre'], 3), 'bouche_ecart_repos': r(ecart[0 if nm == 'V' else 1], 2),
        'jawOpen_mediapipe': r(jaw[cle], 2),
    }

json.dump({'lignes': lignes_out, 'persos': persos, 'segments': SEGMENTS, 'series': series, 'mesures': mes, 'camera': cam},
          open(W + '/_parties.json', 'w'), ensure_ascii=False)
for L in lignes_out:
    print(L['n'], L['locuteur'], L['debut'], L['fin'], L['activite_bouche_moyenne'], L['ouverture_bouche_moyenne'], L['votes_mots_par_bouche'], L['f0_median_hz'])
for c, p in persos.items():
    for pl in p['plans']:
        print(c, pl['plan'], pl['racine_pieds_image'], pl['silhouette_hauteur_px'], pl['silhouette_boite_bande'], pl['orientation'], pl['inclinaison_buste_deg'])
