#!/usr/bin/env python3
"""
ÉTUDE DES VOIX ET DU TON — ce que les vidéos du compte (« blague du jour », sketchs) enseignent au moteur.

Pour chaque vidéo (fichiers locaux, jamais commités) :
  1. TRANSCRIPTION mot à mot, horodatée — faster-whisper (licence MIT), modèle Systran « small » (MIT) ;
  2. VOIX : chaque réplique reçoit sa hauteur (F0, autocorrélation sur 40 ms), son timbre (centroïde spectral) et son
     énergie ; les répliques sont regroupées en voix (k-moyennes, k choisi par la séparation la plus nette) ;
  3. PROFIL de chaque voix : hauteur médiane et étendue (expressivité), débit (syllabes / s), énergie, longueur des
     répliques — et son type probable (enfant, femme, homme, aîné) par la hauteur ;
  4. RYTHME COMIQUE : silence avant la chute (dernière réplique) comparé aux autres silences, durée des répliques,
     part de répliques exclamatives / interrogatives, expressions récurrentes (nouchi, interjections).

Sortie : <out>/etude.json (+ résumé lisible). Le moteur s'en sert pour régler les voix Piper (hauteur, débit) par type de
personnage et le minutage comique du plan (silence avant la chute, temps de réaction).
Usage : python3 outils/voice-study.py <dossier des vidéos> [--out <dossier>]
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
import wave

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'blender', 'film'))
import tone  # noqa: E402

SR = 16000
INTERJ = re.compile(r"\b(eh+[ée]*|ah+|oh+|hein|wah+|yako|walaï|wallah|mon dieu|ma?man|papa|ékié|ehé|haa+|tchrr+|djo|gars|vieux père|tantie|tonton|c'?est pas facile|c'?est comment)\b", re.I)


def audio(path):
    wav = path + '.16k.wav'
    if not os.path.exists(wav):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '1', '-ar', str(SR), wav], check=True)
    with wave.open(wav) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    return wav, a


def f0_track(x, sr=SR):
    """YIN pitch track — the engine's own implementation (blenderfilm/tone.py), one code for the study and the film."""
    return tone.f0_track(x, sr)


def centroid(x, sr=SR):
    if len(x) < 512:
        return 0.0
    sp = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    fr = np.fft.rfftfreq(len(x), 1 / sr)
    return float((sp * fr).sum() / (sp.sum() + 1e-9))


def syllables(text):
    return max(1, len(re.findall(r'[aeiouyéèêàâîïôûù]+', text.lower())))


def kind_of(f0):
    if f0 >= 255:
        return 'enfant'
    if f0 >= 165:
        return 'femme'
    if f0 >= 120:
        return 'homme'
    return 'homme grave / aîné'


def kmeans(X, k, iters=50, seed=0):
    rng = np.random.default_rng(seed)
    C = X[rng.choice(len(X), k, replace=False)]
    for _ in range(iters):
        lab = np.argmin(((X[:, None] - C[None]) ** 2).sum(-1), 1)
        C2 = np.array([X[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(k)])
        if np.allclose(C, C2):
            break
        C = C2
    return lab, C


def separation(X, lab):
    """Silhouette-like score (mean inter-centre distance / mean intra spread)."""
    ks = sorted(set(lab))
    if len(ks) < 2:
        return 0.0
    C = np.array([X[lab == k].mean(0) for k in ks])
    intra = np.mean([np.linalg.norm(X[lab == k] - C[i], axis=1).mean() for i, k in enumerate(ks)])
    inter = np.mean([np.linalg.norm(C[i] - C[j]) for i in range(len(ks)) for j in range(i + 1, len(ks))])
    return float(inter / (intra + 1e-6))


LAUGH = re.compile(r"^(?:\W*(?:h[aeiou]+|hi+|ha+)\W*){2,}$", re.I)
TCHIP = re.compile(r"^\W*tch\w*\W*$", re.I)
SKETCH_GAP = 1.5  # a silence this long separates two sketches of a compilation (measured: turns stay under 1.1 s)


def kind_of_line(text):
    t = text.strip()
    if LAUGH.match(t):
        return 'rire'
    if TCHIP.match(t):
        return 'tchip'
    if len(re.findall(r"[\w']+", t)) <= 3 and t[-1:] in '?!':
        return 'reaction'
    return 'replique'


def transcribe(wav, model, cache):
    if os.path.exists(cache):
        return json.load(open(cache, encoding='utf-8'))
    segs, _ = model.transcribe(wav, language='fr', word_timestamps=True, vad_filter=True, beam_size=1)
    out = []
    for sg in segs:
        w = [{'w': x.word, 'a': round(x.start, 2), 'b': round(x.end, 2)} for x in (sg.words or [])]
        out.append({'texte': sg.text.strip(), 'debut': round(w[0]['a'] if w else sg.start, 2), 'fin': round(w[-1]['b'] if w else sg.end, 2), 'mots': w})
    json.dump(out, open(cache, 'w', encoding='utf-8'), ensure_ascii=False)
    return out


def speech_mask(a):
    """Speech / non-speech every 10 ms by Silero VAD (MIT, shipped with faster-whisper): the music bed under the voices
    counts as silence. Whisper's word times are not used for pauses (they absorb the silence into the words)."""
    from faster_whisper.vad import VadOptions, get_speech_timestamps
    m = np.zeros(int(len(a) / SR * 100) + 1, bool)
    for t in get_speech_timestamps(a, VadOptions(min_silence_duration_ms=60, speech_pad_ms=0)):
        m[int(t['start'] / SR * 100):int(t['end'] / SR * 100) + 1] = True
    return m


def pause(mask, t_end, t_start, margin=0.35):
    """The real silence between two lines: the longest non-speech run around the boundary (s)."""
    lo, hi = int(max(0.0, min(t_end, t_start) - margin) * 100), int((max(t_end, t_start) + margin) * 100)
    best = run = 0
    for v in mask[lo:hi + 1]:
        run = 0 if v else run + 1
        best = max(best, run)
    return round(best / 100, 2)


def study(video, model, out):
    wav, a = audio(video)
    segs = transcribe(wav, model, os.path.join(out, os.path.basename(video) + '.mots.json'))
    mask = speech_mask(a)
    lines = []
    for sg in segs:
        x = a[int(sg['debut'] * SR):int(sg['fin'] * SR)]
        if len(x) < SR * 0.2:
            continue
        f0 = f0_track(x)
        lines.append({'debut': sg['debut'], 'fin': sg['fin'], 'texte': sg['texte'], 'genre': kind_of_line(sg['texte']),
                      'f0': float(np.median(f0)) if len(f0) > 5 else None,
                      'f0_etendue': tone.spread(f0) if len(f0) > 5 else None,
                      'timbre': centroid(x), 'energie': float(np.sqrt(np.mean(x * x))), 'syllabes': syllables(sg['texte'])})
    # Sketches (a compilation chains several jokes) and, in each, the PUNCHLINE = the last spoken line that is not a
    # laugh / tchip / one-word reaction; what precedes it (the silence, a reaction) and what follows it (laugh, tchip).
    sketches, cur = [], []
    for l in lines:
        if cur:
            l['pause_avant'] = pause(mask, cur[-1]['fin'], l['debut'])
        if cur and l['pause_avant'] >= SKETCH_GAP:
            sketches.append(cur)
            cur = []
        cur.append(l)
    if cur:
        sketches.append(cur)
    jokes = []
    for sk in sketches:
        spoken = [i for i, l in enumerate(sk) if l['genre'] == 'replique']
        if len(sk) < 2 or not spoken or spoken[-1] == 0:
            continue
        k = spoken[-1]
        after = sk[k + 1:]
        turns = [sk[i + 1]['pause_avant'] for i in range(len(sk) - 1) if i + 1 != k]
        jokes.append({'repliques': len(sk), 'duree_s': round(sk[-1]['fin'] - sk[0]['debut'], 2),
                      'silence_avant_chute_s': sk[k]['pause_avant'],
                      'reaction_avant_chute': sk[k - 1]['genre'] == 'reaction',
                      'chute_s': round(sk[k]['fin'] - sk[k]['debut'], 2),
                      'apres_chute': [x['genre'] for x in after], 'rire_s': round(sum(x['fin'] - x['debut'] for x in after if x['genre'] == 'rire'), 2),
                      'tours_s': [round(t, 2) for t in turns]})
    voiced = [l for l in lines if l['f0'] and l['genre'] in ('replique', 'reaction')]
    voix = []
    if len(voiced) >= 2:
        X = np.array([[np.log(l['f0']) * 4, l['timbre'] / 1000.0] for l in voiced])
        best = (0.0, np.zeros(len(voiced), int))
        for k in range(2, min(4, len(voiced)) + 1):
            lab, _ = kmeans(X, k)
            sc = separation(X, lab)
            if sc > best[0] * 1.15:
                best = (sc, lab)
        for l, v in zip(voiced, best[1]):
            l['voix'] = int(v)
        for v in sorted(set(best[1])):
            L = [l for l in voiced if l['voix'] == v]
            dur = sum(l['fin'] - l['debut'] for l in L)
            f0 = float(np.median([l['f0'] for l in L]))
            voix.append({'voix': int(v), 'type': kind_of(f0), 'f0_mediane': round(f0, 1),
                         'expressivite_hz': round(float(np.median([l['f0_etendue'] for l in L])), 1),
                         'debit_syll_s': round(float(sum(l['syllabes'] for l in L) / max(0.1, dur)), 2), 'energie': round(float(np.median([l['energie'] for l in L])), 4),
                         'repliques': len(L), 'duree_mediane_s': round(float(np.median([l['fin'] - l['debut'] for l in L])), 2)})
    text = ' '.join(l['texte'] for l in lines)
    turns = [t for j in jokes for t in j['tours_s']]
    between = [sk[0]['pause_avant'] for sk in sketches[1:]]
    laughs = [round(l['fin'] - l['debut'], 2) for l in lines if l['genre'] == 'rire']
    return {'video': os.path.basename(video), 'duree_s': round(len(a) / SR, 1), 'repliques': lines, 'voix': voix, 'blagues': jokes,
            'entre_blagues_s': between, 'rires_s': laughs, 'reactions': sum(l['genre'] == 'reaction' for l in lines),
            'rythme': {'tour_de_parole_s': round(float(np.median(turns)), 2) if turns else None,
                       'silence_avant_chute_s': round(float(np.median([j['silence_avant_chute_s'] for j in jokes])), 2) if jokes else None,
                       'replique_mediane_s': round(float(np.median([l['fin'] - l['debut'] for l in lines if l['genre'] == 'replique'])), 2) if lines else None,
                       'exclamations': round(sum('!' in l['texte'] for l in lines) / max(1, len(lines)), 2),
                       'questions': round(sum('?' in l['texte'] for l in lines) / max(1, len(lines)), 2)},
            'expressions': sorted({m.group(0).lower() for m in INTERJ.finditer(text)})}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dossier')
    ap.add_argument('--out', default='')
    ap.add_argument('--modele', default='small')
    A = ap.parse_args()
    from faster_whisper import WhisperModel
    model = WhisperModel(A.modele, device='cpu', compute_type='int8', download_root=os.path.expanduser('~/.cache/massamba-models/whisper'))
    out = A.out or A.dossier
    res = []
    for v in sorted(glob.glob(os.path.join(A.dossier, '*.mp4'))):
        r = study(v, model, out)
        res.append(r)
        print(f"{r['video']}: {len(r['repliques'])} répliques, {len(r['voix'])} voix {[ (x['type'], x['f0_mediane'], x['debit_syll_s']) for x in r['voix']]}, "
              f"{len(r['blagues'])} blague(s), tour de parole {r['rythme']['tour_de_parole_s']} s, silence avant la chute {r['rythme']['silence_avant_chute_s']} s", flush=True)
    # Across the videos: per voice type, the measured profile (median of the voices of that type).
    types = {}
    for r in res:
        for x in r['voix']:
            types.setdefault(x['type'], []).append(x)
    synth = {t: {k: round(float(np.median([x[k] for x in L])), 2) for k in ('f0_mediane', 'expressivite_hz', 'debit_syll_s', 'duree_mediane_s')} | {'voix_mesurees': len(L)}
             for t, L in types.items()}
    J = [j for r in res for j in r['blagues']]
    med = lambda v: round(float(np.median(v)), 2) if len(v) else None
    rythme = {'blagues_mesurees': len(J), 'tour_de_parole_s': med([t for j in J for t in j['tours_s']]),
              'silence_avant_chute_s': med([j['silence_avant_chute_s'] for j in J]),
              'silence_avant_chute_p75_s': round(float(np.percentile([j['silence_avant_chute_s'] for j in J], 75)), 2) if J else None,
              'reaction_avant_chute': round(sum(j['reaction_avant_chute'] for j in J) / max(1, len(J)), 2),
              'chute_s': med([j['chute_s'] for j in J]), 'blague_s': med([j['duree_s'] for j in J]),
              'repliques_par_blague': med([j['repliques'] for j in J]),
              'replique_mediane_s': med([r['rythme']['replique_mediane_s'] for r in res if r['rythme']['replique_mediane_s']]),
              'entre_blagues_s': med([x for r in res for x in r['entre_blagues_s']]),
              'entre_blagues_p75_s': round(float(np.percentile([x for r in res for x in r['entre_blagues_s']], 75)), 2) if any(r['entre_blagues_s'] for r in res) else None,
              'rires': sum(len(r['rires_s']) for r in res), 'rire_s': med([x for r in res for x in r['rires_s']]),
              'reactions_part': round(sum(r['reactions'] for r in res) / max(1, sum(len(r['repliques']) for r in res)), 2),
              'repliques_par_minute': round(60 * sum(len(r['repliques']) for r in res) / max(1, sum(r['duree_s'] for r in res)), 1),
              'exclamations': med([r['rythme']['exclamations'] for r in res]), 'questions': med([r['rythme']['questions'] for r in res])}
    json.dump({'videos': res, 'types_de_voix': synth, 'rythme': rythme,
               'expressions': sorted({e for r in res for e in r['expressions']})}, open(os.path.join(out, 'etude.json'), 'w'), ensure_ascii=False, indent=1)
    print('TYPES', json.dumps(synth, ensure_ascii=False))
    print('RYTHME', json.dumps(rythme, ensure_ascii=False))


if __name__ == '__main__':
    main()
