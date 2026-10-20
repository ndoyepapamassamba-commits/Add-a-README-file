import sys, os, json, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from piper import PiperVoice, SynthesisConfig
from f0 import f0_median
P = os.environ.get('PIPER_VOICES', os.path.expanduser('~/.cache/massamba-models/piper/'))  # voix Piper (.onnx + .json)
v = PiperVoice.load(P + 'fr_FR-mls-medium.onnx')
txt = "Quel argent ? Je suis un pauvre homme, je te dis la vérité."
res = []
for sid in range(125):
    ch = list(v.synthesize(txt, syn_config=SynthesisConfig(speaker_id=sid)))
    a = np.frombuffer(b''.join(c.audio_int16_bytes for c in ch), np.int16); sr = ch[0].sample_rate
    f, n = f0_median(a, sr); res.append((sid, round(f, 1), n, round(len(a) / sr, 2)))
json.dump(res, open('voix-mls.json', 'w'))
for r in sorted(res, key=lambda r: r[1]): print(r)
