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
CACHE = os.path.expanduser(os.environ.get('MEMO_CACHE', '~/.cache/massamba-memo'))
def cues(L):
    # 19/10/2026 (« un film entier en 1 minute ») : formes de bouche mémorisées par empreinte de l'audio de la réplique
    import hashlib
    h = hashlib.sha1(open(L['wav'], 'rb').read() + open(RH, 'rb').read(65536)).hexdigest()[:24]; fc = f'{CACHE}/rhubarb-{h}.json'
    if os.path.isfile(fc): return json.load(open(fc))
    out = f"/tmp/rh_{os.path.basename(L['wav'])}.json"
    subprocess.run([RH, '-r', 'phonetic', '-f', 'json', '--extendedShapes', 'GHX', '-q', L['wav'], '-o', out], check=True)
    c = json.load(open(out))['mouthCues']; os.makedirs(CACHE, exist_ok=True); json.dump(c, open(fc, 'w')); return c
import visemes_fr
def cues_ou_piper(L):
    # PHONÈMES DU TEXTE D'ABORD (19/10/2026, greffe TalkingHead) : instants exacts de la voix Piper ; Rhubarb pour les voix sans
    # alignement (clones Qwen3) ou une timeline d'avant le 19/10
    if L.get('phonemes_piper') and os.environ.get('LEVRES_RHUBARB') != '1': return visemes_fr.depuis_piper(L['phonemes_piper'], L['dur'])
    return cues(L)
with ThreadPoolExecutor(4) as ex: allc = list(ex.map(cues_ou_piper, T['lines']))
for L, cs in zip(T['lines'], allc):
    L['visemes'] = [{'v': c['value'], 't0': c['start'], 't1': c['end']} for c in cs]
    L['phonemes'] = [{'ph': c['value'], 't0': c['start'], 't1': c['end'], 'open': 4 * OUV[c['value']]} for c in cs]
json.dump(T, open(TL, 'w'), ensure_ascii=False)
ouv = [p['open'] / 4 for L in T['lines'] for p in L['phonemes'] for _ in range(max(1, int((p['t1'] - p['t0']) * 100)))]
print(f"{len(T['lines'])} répliques, {sum(len(L['visemes']) for L in T['lines'])} visèmes ; ouverture moyenne pendant la parole {sum(ouv) / len(ouv):.2f}")
