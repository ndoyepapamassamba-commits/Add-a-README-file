# Contrôle d'intelligibilité : chaque réplique transcrite par Whisper small (faster-whisper, MIT) et comparée au texte (taux d'erreur de mots).
import json, re, sys, unicodedata
from faster_whisper import WhisperModel
m = WhisperModel('small', device='cpu', compute_type='int8', download_root='/root/.cache/massamba-models/whisper')
norm = lambda s: re.sub(r'\s+', ' ', re.sub(r"[^a-z0-9' ]", ' ', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode())).strip().split()
def wer(r, h):
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        p, d[0] = d[0], i
        for j in range(1, len(h) + 1): p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (r[i - 1] != h[j - 1]))
    return d[len(h)] / max(1, len(r))
T = json.load(open('timeline.json')); out = []
for L in T['lines']:
    segs, _ = m.transcribe(L['wav'], language='fr', beam_size=3)
    hyp = ' '.join(s.text for s in segs).strip()
    w = wer(norm(L['texte']), norm(hyp)); out.append(w)
    print(f"{w:4.2f} {L['qui'][:12]:12s} | {L['texte'][:48]:48s} | {hyp[:60]}")
print('WER médian', sorted(out)[len(out) // 2], 'max', max(out))
