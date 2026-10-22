# Voix off générée EN LOCAL pour AI Motion Studio (22/10/2026) : Piper (MIT) avec les voix françaises du moteur de la troupe
# (siwis CC-BY, gilles CC0), sans Internet ni compte.   python3 voix_piper.py <texte.txt> <sortie.wav> [siwis|gilles]
import os, sys, wave
from piper import PiperVoice

P = os.environ.get('PIPER_VOICES', os.path.expanduser('~/.cache/massamba-models/piper/'))
MODELES = {'siwis': 'fr_FR-siwis-medium', 'gilles': 'fr_FR-gilles-low'}
texte = open(sys.argv[1], encoding='utf-8').read().strip()[:2000]
v = PiperVoice.load(os.path.join(P, MODELES.get(sys.argv[3] if len(sys.argv) > 3 else 'siwis', 'fr_FR-siwis-medium') + '.onnx'))
with wave.open(sys.argv[2], 'wb') as w:
    v.synthesize_wav(texte, w)
print(os.path.getsize(sys.argv[2]))
