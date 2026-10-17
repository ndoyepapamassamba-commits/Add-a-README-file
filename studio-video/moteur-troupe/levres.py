# VISÈMES DEPUIS L'AUDIO (16/10/2026) — les voix Piper « siwis » et « gilles » ne donnent pas d'alignement de phonèmes
# (champ vide, mesuré dans la v10 : bouches presque fermées, corrélation lèvres/voix 0,24). Rhubarb Lip Sync (MIT),
# reconnaissance PHONÉTIQUE (indépendante de la langue), lit chaque réplique et rend les formes de bouche de Preston
# Blair (A–H, X) avec leurs temps ; on les traduit en ouverture de mâchoire pour le moteur de tournage.
# python3 levres.py timeline.json
import json, subprocess, sys, os
from concurrent.futures import ThreadPoolExecutor
RH = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/rhubarb/Rhubarb-Lip-Sync-1.14.0-Linux/rhubarb'
# ouverture (0 = fermée, 1 = grande ouverte) de chaque forme, d'après la documentation de Rhubarb
OUV = {'A': 0.0, 'B': 0.3, 'C': 0.65, 'D': 1.0, 'E': 0.55, 'F': 0.3, 'G': 0.15, 'H': 0.45, 'X': 0.0}
TL = sys.argv[1]; T = json.load(open(TL))
def cues(L):
    out = f"/tmp/rh_{os.path.basename(L['wav'])}.json"
    subprocess.run([RH, '-r', 'phonetic', '-f', 'json', '--extendedShapes', 'GHX', '-q', L['wav'], '-o', out], check=True)
    return json.load(open(out))['mouthCues']
with ThreadPoolExecutor(4) as ex: allc = list(ex.map(cues, T['lines']))
for L, cs in zip(T['lines'], allc):
    L['visemes'] = [{'v': c['value'], 't0': c['start'], 't1': c['end']} for c in cs]
    L['phonemes'] = [{'ph': c['value'], 't0': c['start'], 't1': c['end'], 'open': 4 * OUV[c['value']]} for c in cs]
json.dump(T, open(TL, 'w'), ensure_ascii=False)
ouv = [p['open'] / 4 for L in T['lines'] for p in L['phonemes'] for _ in range(max(1, int((p['t1'] - p['t0']) * 100)))]
print(f"{len(T['lines'])} répliques, {sum(len(L['visemes']) for L in T['lines'])} visèmes ; ouverture moyenne pendant la parole {sum(ouv) / len(ouv):.2f}")
