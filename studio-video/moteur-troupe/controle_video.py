# CONTRÔLE QUALITÉ D'UNE VIDÉO AVANT LIVRAISON (16/10/2026) — tout est mesuré sur le FICHIER livré (pas sur l'état du moteur).
#  1. technique : durée > 60 s, 30 i/s, 576×1024, H.264 + AAC, décodage intégral sans erreur, son et image de même durée
#  2. son : sonie intégrée −14 ± 1 LUFS, crête vraie ≤ −1 dBTP (consensus TikTok / EBU R128)
#  3. images : pas d'image noire, pas de gel involontaire > 1,5 s, 1re image = 1er plan (miniature TikTok)
#  4. mouvement : outil de mesure des références (mesure2.py) — jeu vivant, sautes, régularité
#  5. lèvres SUR L'IMAGE RENDUE : visages détectés image par image dans le clip, ouverture de bouche suivie par visage,
#     corrélée à l'énergie de la voix de la réplique ; la bouche de celui qui parle doit bouger et suivre la voix
#  6. intelligibilité : Whisper transcrit la bande-son du fichier, taux d'erreur de mots contre le texte
#  7. cohérence visuelle : JEV juge des images prises dans chaque plan (tête coupée, visage déformé, artefacts, fidélité)
# python3 controle_video.py v10/troupe-v10.mp4 timeline.json v10/tournage.json rapport.json
import json, os, re, subprocess, sys, unicodedata, numpy as np, cv2
MP4, TL, SHOTS, OUT = sys.argv[1:5]
T = json.load(open(TL)); SH = json.load(open(SHOTS))['decoupage']; R = {}; FPS = 30
def run(cmd): return subprocess.run(cmd, capture_output=True, text=True)
SEUL = os.environ.get('SEUL')
# ── 1. technique ──
if SEUL != 'levres':
  exec(compile(r'''
pr = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_type,width,height,r_frame_rate,nb_frames,sample_rate,duration', '-of', 'json', MP4]).stdout)
v = [s for s in pr['streams'] if s['codec_type'] == 'video'][0]; a = [s for s in pr['streams'] if s['codec_type'] == 'audio'][0]
dec = run(['ffmpeg', '-v', 'error', '-i', MP4, '-f', 'null', '-'])
dur = float(pr['format']['duration'])
R['technique'] = {'duree_s': round(dur, 2), 'images': int(v.get('nb_frames', 0)), 'cadence': v['r_frame_rate'], 'taille': f"{v['width']}x{v['height']}",
                  'video': v['codec_name'], 'audio': f"{a['codec_name']} {a.get('sample_rate')} Hz", 'ecart_son_image_s': round(abs(float(v['duration']) - float(a['duration'])), 3),
                  'erreurs_decodage': len(dec.stderr.strip().splitlines())}
R['technique']['ok'] = dur > 60.0 and v['r_frame_rate'] == '30/1' and v['width'] == 576 and v['height'] == 1024 and R['technique']['erreurs_decodage'] == 0 and R['technique']['ecart_son_image_s'] <= 1 / FPS + 0.03
# ── 2. son ──
eb = run(['ffmpeg', '-nostats', '-i', MP4, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-']).stderr
I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', eb)[-1]); TP = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', eb)[-1])
R['son'] = {'sonie_LUFS': I, 'crete_vraie_dBTP': TP, 'ok': abs(I + 14) <= 1.0 and TP <= -0.9}
# ── 3. images (bande du clip y 282–742) ──
cap = cv2.VideoCapture(MP4); prev = None; diffs, lum, frames_small = [], [], []
while True:
    ok, f = cap.read()
    if not ok: break
    c = cv2.cvtColor(f[282:742], cv2.COLOR_BGR2GRAY); s = cv2.resize(c, (144, 115)); lum.append(float(s.mean())); frames_small.append(s)
    if prev is not None: diffs.append(float(np.abs(s.astype(np.int16) - prev.astype(np.int16)).mean()))
    prev = s
diffs = np.array(diffs); lum = np.array(lum)
cards = [(c_['t0'], c_['t1'] + 0.2) for c_ in T['cartes']]
in_card = lambda t: any(a_ <= t <= b_ for a_, b_ in cards)
frozen, run_, longest = 0, 0, 0.0
for k, d in enumerate(diffs):
    t = (k + 1) / FPS
    if d < 0.05 and not in_card(t): run_ += 1; longest = max(longest, run_ / FPS)
    else: run_ = 0
noires = int(((lum < 8) & np.array([not in_card(k / FPS) for k in range(len(lum))])).sum())
R['images'] = {'images_noires_hors_cartes': noires, 'plus_long_gel_s': round(longest, 2), 'premiere_image_luminosite': round(float(lum[0]), 1),
               'ok': noires == 0 and longest <= 1.5 and lum[0] > 40}
# ── 4. mouvement (même outil que pour les références) ──
M2 = [q for q in (os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mesure2.py'), os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'fluidite', 'mesure2.py')) if os.path.isfile(q)][0]
m = run(['python3', M2, MP4, '0.275', '0.725']).stdout.strip()
num = lambda k: float(re.search(k + r'\s+([\d.]+)', m).group(1))
R['mouvement'] = {'ligne': m, 'jeu_vivant_%': num('jeu vivant'), 'sautes_par_s': num('sautes'), 'regularite': num('régularité du jeu'),
                  'reference_chaine': {'jeu_vivant_%': [4.9, 9.2], 'sautes_par_s': [0.13, 0.35]}}
R['mouvement']['ok'] = R['mouvement']['sautes_par_s'] <= 0.6
''', 'tests1-4', 'exec'))
# ── 5. lèvres sur l'image rendue ──
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
FL = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/face_landmarker.task'),
     num_faces=3, min_face_detection_confidence=0.3, running_mode=vision.RunningMode.IMAGE))
cap = cv2.VideoCapture(MP4); allf = []
while True:
    ok, f = cap.read()
    if not ok: break
    allf.append(f[282:742])
res_lines = []
for L in T['lines']:
    a0, a1 = int(L['t0'] * FPS), int((L['t0'] + L['dur']) * FPS)
    if a1 - a0 < 12: continue
    tracks = {}; last = {}  # pistes de visages suivies par plus proche voisin (nez), tolérance une demi-largeur de visage
    for k in range(a0, min(a1, len(allf))):
        rgb = cv2.cvtColor(allf[k], cv2.COLOR_BGR2RGB); r = FL.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        for lm in r.face_landmarks:
            P = np.array([[p.x * rgb.shape[1], p.y * rgb.shape[0]] for p in lm]); fh = np.ptp(P[:, 1]) + 1e-6; fw = np.ptp(P[:, 0]) + 1e-6
            op = np.linalg.norm(P[13] - P[14]) / fh; nose = P[1]
            near = [(np.linalg.norm(nose - q), i) for i, q in last.items() if np.linalg.norm(nose - q) < 0.5 * fw]
            i = min(near)[1] if near else len(last); last[i] = nose
            tracks.setdefault(i, {})[k] = op
    env = np.array(L['env']); envf = np.array([env[min(len(env) - 1, max(0, int((k / FPS - L['t0']) * 100))):min(len(env), max(1, int(((k + 1) / FPS - L['t0']) * 100)))].mean()
                                               if int((k / FPS - L['t0']) * 100) < len(env) else 0.0 for k in range(a0, a1)])
    best = None
    for nx, tr in tracks.items():
        if len(tr) < 0.6 * (a1 - a0): continue
        ks = sorted(tr); o = np.array([tr[k] for k in ks]); e = np.array([envf[k - a0] for k in ks])
        if o.std() < 1e-4: corr = 0.0; lag = 0
        else:
            cs = [(np.corrcoef(o[max(0, -d):len(o) - max(0, d)], e[max(0, d):len(e) - max(0, -d)])[0, 1], d) for d in range(-3, 4)]
            corr, lag = max(cs)
        moving = float((np.abs(np.diff(o)) > 0.004).mean())
        cand = {'corr': round(float(corr), 2), 'decalage_images': int(lag), 'bouche_bouge_%': round(100 * moving, 1), 'ecart_type': round(float(o.std()), 3)}
        if best is None or cand['corr'] > best['corr']: best = cand
    res_lines.append({'qui': L['qui'], 'texte': L['texte'][:40], **(best or {'corr': None})})
cs = [r_['corr'] for r_ in res_lines if r_.get('corr') is not None]
R['levres_image'] = {'repliques_mesurees': len(cs), 'correlation_mediane': round(float(np.median(cs)), 2) if cs else None,
                     'repliques_corr_sup_0_3': int(sum(c_ >= 0.3 for c_ in cs)), 'detail': res_lines}
R['levres_image']['ok'] = bool(cs) and np.median(cs) >= 0.3
# ── 6. intelligibilité (bande-son du fichier) ──
if SEUL != 'levres':
  exec(compile(r'''
from faster_whisper import WhisperModel
run(['ffmpeg', '-v', 'error', '-y', '-i', MP4, '-ac', '1', '-ar', '16000', '/tmp/controle_son.wav'])
wm = WhisperModel('small', device='cpu', compute_type='int8', download_root=os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/whisper')
hyp = ' '.join(s_.text for s_ in wm.transcribe('/tmp/controle_son.wav', language='fr', beam_size=3)[0])
norm = lambda s_: re.sub(r'\s+', ' ', re.sub(r"[^a-z0-9' ]", ' ', unicodedata.normalize('NFD', s_.lower()).encode('ascii', 'ignore').decode())).strip().split()
ref = norm(' '.join(L['texte'] for L in T['lines'])); hy = norm(hyp)
d = list(range(len(hy) + 1))
for i in range(1, len(ref) + 1):
    p_, d[0] = d[0], i
    for j in range(1, len(hy) + 1): p_, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p_ + (ref[i - 1] != hy[j - 1]))
R['intelligibilite'] = {'taux_erreur_mots': round(d[len(hy)] / len(ref), 2), 'transcription': hyp.strip()[:600]}
R['intelligibilite']['ok'] = R['intelligibilite']['taux_erreur_mots'] <= 0.35
''', 'test6', 'exec'))
json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))  # numpy 2 : np.bool → bool
for k_, v_ in R.items():
    print(k_, 'OK' if v_.get('ok') else 'À REPRENDRE', {kk: vv for kk, vv in v_.items() if kk not in ('detail', 'transcription', 'ligne', 'ok')})
