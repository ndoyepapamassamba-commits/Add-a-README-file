# L'OREILLE : SONS RECONNUS PAR YAMNET (18/10/2026) — « le son d'accompagnement du film, il faut le revoir et le caler sur mes vidéos TikTok ;
# après le choc de fin de chaque sketch, ça doit être accompagné de rire comme dans mes TikTok ». YAMNet (Google, Apache-2.0,
# 4 Mo, classes AudioSet) par MediaPipe : toutes les 0,48 s, la probabilité de parole, de musique, de rire, d'applaudissement,
# de bruit de foule. Mesure nos films ET les TikTok de l'utilisateur avec le même outil (règle : mêmes mesures que les références).
#   python3 oreille.py fichier.(mp4|wav) [...]  → JSON par fichier : courbes et synthèse
import json, os, subprocess, sys
import numpy as np

MODELE = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/audio/yamnet.tflite'
SR = 16000
CLASSES = {'parole': ('Speech', 'Conversation', 'Narration, monologue', 'Male speech, man speaking', 'Female speech, woman speaking',
                      'Child speech, kid speaking'),
           'rire': ('Laughter', 'Giggle', 'Chuckle, chortle', 'Belly laugh', 'Snicker', 'Baby laughter'),
           'musique': ('Music', 'Musical instrument', 'Drum', 'Percussion', 'Piano', 'Guitar', 'Synthesizer', 'Pop music',
                       'Hip hop music', 'Electronic music', 'Music of Africa', 'Afrobeat', 'Funny music', 'Happy music', 'Background music',
                       'Jingle (music)', 'Theme music'),
           'foule': ('Crowd', 'Applause', 'Cheering', 'Chatter', 'Hubbub, speech noise, babble'),
           'effet': ('Boing', 'Whoosh, swoosh, swish', 'Cartoon', 'Sound effect', 'Slap, smack', 'Ding', 'Bell', 'Gasp')}


def pcm(f):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.int16).astype(np.float32) / 32768.0


_CL = None
def classe(x):
    """→ (temps, {famille: proba}, {classe: proba} les plus fortes) toutes les 0,48 s."""
    global _CL
    from mediapipe.tasks.python import audio, BaseOptions
    from mediapipe.tasks.python.components.containers import audio_data
    if _CL is None:
        _CL = audio.AudioClassifier.create_from_options(audio.AudioClassifierOptions(base_options=BaseOptions(model_asset_path=MODELE),
                                                                                       max_results=-1, running_mode=audio.RunningMode.AUDIO_CLIPS))
    d = audio_data.AudioData.create_from_array(x, SR); res = _CL.classify(d)
    T, F, top = [], [], []
    for r in res:
        sc = {c.category_name: float(c.score) for c in r.classifications[0].categories}
        T.append(r.timestamp_ms / 1000.0); F.append({k: max(sc.get(c, 0.0) for c in v) for k, v in CLASSES.items()})
        top.append(sorted(sc.items(), key=lambda kv: -kv[1])[:4])
    return np.array(T), F, top


def niveau(x, t, d=0.48):
    """niveau RMS (dBFS) de la fenêtre [t, t + d]."""
    s = x[int(t * SR):int((t + d) * SR)]
    return float(20 * np.log10(np.sqrt(np.mean(s * s)) + 1e-9)) if len(s) else -120.0


def analyse(f):
    x = pcm(f); T, F, top = classe(x)
    L = np.array([niveau(x, t) for t in T]); P = {k: np.array([f_[k] for f_ in F]) for k in CLASSES}
    actif = L > L.max() - 45
    synth = {k: round(float(np.mean(P[k][actif] > 0.3)), 3) for k in CLASSES}   # part du temps où la famille est entendue
    # musique SOUS la parole : fenêtres où l'on parle ET où la musique est détectée
    parle = P['parole'] > 0.5
    synth['musique_sous_parole'] = round(float(np.mean(P['musique'][parle] > 0.2)) if parle.any() else 0.0, 3)
    rires = [(round(float(t), 2), round(float(p), 2)) for t, p in zip(T, P['rire']) if p > 0.3]
    return {'fichier': os.path.basename(f), 'duree': round(len(x) / SR, 2), 'synthese': synth, 'rires': rires,
            'courbes': {'t': [round(float(t), 2) for t in T], 'db': [round(float(v), 1) for v in L], **{k: [round(float(v), 3) for v in P[k]] for k in CLASSES}},
            'top': [[t, [(n, round(s, 2)) for n, s in tp]] for t, tp in zip([round(float(t), 2) for t in T], top)]}


if __name__ == '__main__':
    for f in sys.argv[1:]:
        a = analyse(f); json.dump(a, open(f + '.oreille.json', 'w'), ensure_ascii=False)
        print(a['fichier'], a['duree'], 's', json.dumps(a['synthese'], ensure_ascii=False), 'rires :', len(a['rires']), flush=True)
