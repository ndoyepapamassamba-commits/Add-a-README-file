#!/usr/bin/env python3
"""
QUI PARLE ? — le genre de chaque voix des vidéos de la chaîne, pour mesurer les voix des HOMMES et des FEMMES séparément
(la hauteur seule ne les sépare pas : les hommes de la chaîne parlent entre 170 et 260 Hz, comme des femmes).

Pour chaque réplique (étude de scripts/voice-study.py) :
  1. GENRE PAR LA VOIX : wav2vec2 XLSR-53 affiné pour le genre (alefiury, Apache-2.0) — validé avant usage : 5/5 voix
     Piper de genre connu, et les répliques dont le genre se lit dans la phrase (« je suis belle », « ma femme »…, fichier
     genre-verite.json de l'étude, privé) ;
  2. EMPREINTE VOCALE : ECAPA-TDNN (SpeechBrain, Apache-2.0) — les répliques d'une même voix se regroupent d'une vidéo à
     l'autre, et chaque groupe vote son genre (une réplique isolée mal classée est corrigée) ;
  3. MESURES PAR GENRE : hauteur, étendue de mélodie, débit — écrites dans l'étude (voix_genre), reprises par tone.py.
Une première version cherchait le locuteur à l'IMAGE (OWLv2 + mouvement de la tête) : rejetée au contrôle visuel
(≈ 4 bons sur 16 — adultes dessinés pris pour des enfants, détections dans les bandes floues des sous-titres).
Tout reste dans le dossier privé de l'étude (jamais commité). Usage :
    python3 scripts/speaker-types.py <dossier des vidéos> --etude <dossier de l'étude>
"""
import argparse
import json
import os
import sys

import numpy as np

MODELS = os.path.expanduser('~/.cache/massamba-models')
SR = 16000
GENDER = 'alefiury/wav2vec2-large-xlsr-53-gender-recognition-librispeech'


def ecapa():
    from speechbrain.inference.speaker import EncoderClassifier
    return EncoderClassifier.from_hparams(source='speechbrain/spkrec-ecapa-voxceleb', savedir=os.path.join(MODELS, 'ecapa'), run_opts={'device': 'cpu'})


def gender_model():
    from transformers import AutoFeatureExtractor, AutoModelForAudioClassification
    kw = {'cache_dir': os.path.join(MODELS, 'hf')}
    fe = AutoFeatureExtractor.from_pretrained(GENDER, **kw)
    m = AutoModelForAudioClassification.from_pretrained(GENDER, **kw).eval()
    fem = [int(i) for i, l in m.config.id2label.items() if str(l).lower().startswith('f')][0]
    return fe, m, fem


def p_female(gm, x):
    import torch
    fe, m, fem = gm
    with torch.no_grad():
        return float(m(**fe(x, sampling_rate=SR, return_tensors='pt')).logits[0].softmax(-1)[fem])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('videos')
    ap.add_argument('--etude', required=True)
    ap.add_argument('--seuil-voix', type=float, default=0.55, help='distance cosinus maximale entre deux répliques d’une même voix')
    A = ap.parse_args()
    import wave
    import torch
    from scipy.cluster.hierarchy import fcluster, linkage
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blenderfilm'))
    import tone
    etude_p = os.path.join(A.etude, 'etude.json')
    etude = json.load(open(etude_p, encoding='utf-8'))
    enc, gm = ecapa(), gender_model()
    rows, embs = [], []
    for v in etude['videos']:
        with wave.open(os.path.join(A.videos, v['video']) + '.16k.wav') as w:
            audio = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        for j, l in enumerate(v['repliques']):
            if l['genre'] not in ('replique', 'reaction') or l['fin'] - l['debut'] < 0.5:
                continue
            x = audio[int(l['debut'] * SR):int(l['fin'] * SR)]
            with torch.no_grad():
                e = enc.encode_batch(torch.tensor(x)[None]).squeeze().numpy()
            pf = p_female(gm, x)
            f0 = tone.f0_track(x)
            rows.append({'video': v['video'], 'ligne': j, 'texte': l['texte'], 'p_femme': round(pf, 3), 'f0': float(np.median(f0)) if len(f0) > 5 else None,
                         'etendue': tone.spread(f0) if len(f0) > 5 else None, 'syllabes': l['syllabes'], 'duree': l['fin'] - l['debut']})
            embs.append(e / (np.linalg.norm(e) + 1e-9))
    lab = fcluster(linkage(np.array(embs), 'average', metric='cosine'), t=A.seuil_voix, criterion='distance')
    groups = {}
    for r, c in zip(rows, lab):
        r['voix'] = int(c)
        groups.setdefault(int(c), []).append(r)
    for c, L in groups.items():
        g = 'femme' if np.mean([r['p_femme'] for r in L]) >= 0.5 else 'homme'
        for r in L:
            r['genre_voix'] = g
    # Validation against the lines whose speaker's sex is written in the sentence.
    truth_p = os.path.join(A.etude, 'genre-verite.json')
    if os.path.exists(truth_p):
        truth = json.load(open(truth_p, encoding='utf-8'))
        ok = n = 0
        for r in rows:
            g = next((g for t, g in truth.items() if r['texte'].startswith(t)), None)
            if g:
                n += 1
                ok += (r['genre_voix'] == ('femme' if g == 'F' else 'homme'))
        print(f'validation (genre écrit dans la phrase) : {ok}/{n} après vote des groupes de voix', flush=True)
    out = {}
    for g in ('homme', 'femme'):
        L = [r for r in rows if r['genre_voix'] == g and r['f0']]
        if not L:
            continue
        out[g] = {'f0': round(float(np.median([r['f0'] for r in L])), 1),
                  'etendue_relative': round(float(np.median([r['etendue'] / r['f0'] for r in L if r['etendue']])), 3),
                  'debit_syll_s': round(float(sum(r['syllabes'] for r in L) / max(0.1, sum(r['duree'] for r in L))), 2),
                  'repliques': len(L), 'voix': len({r['voix'] for r in L})}
        print(f"{g}s : {out[g]}", flush=True)
    etude['voix_genre'] = out
    json.dump(etude, open(etude_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump({'repliques': rows}, open(os.path.join(A.etude, 'locuteurs.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
