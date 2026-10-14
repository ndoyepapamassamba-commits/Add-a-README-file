"""LÈVRES SUR LA VOIX — Rhubarb Lip Sync (Daniel Wolf, licence MIT, hors ligne, processeur).

L'ouverture de la bouche suivait le VOLUME de la voix : les consonnes fermées (m, b, p) passaient bouche ouverte
quand elles sont fortes, et une voyelle douce restait fermée. Rhubarb reconnaît les sons (mode phonétique : toutes
langues, dont le français) et donne les formes de bouche du dessin animé (A … H, X), image par image. On en tire
les FERMETURES : sur m / b / p (forme A) les lèvres se touchent, quel que soit le volume. Les autres formes ne sont pas
reprises : mesurées sur les voix françaises (Piper) du film 6, elles ouvraient moins que la voix et fermaient moins
souvent — le mode phonétique de Rhubarb est appris sur l'anglais.

    python scripts/blenderfilm/lipsync.py --plan <film>/plan.json     # refait les pistes de bouche d'un plan existant

Mesuré dans le conteneur (4 cœurs) : 1,65 s de calcul pour une réplique de 1,78 s.
"""
import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

import numpy as np

VERSION = '1.14.0'
HOME = os.path.join(os.path.expanduser('~'), '.cache', 'massamba-models', 'rhubarb')


def binary():
    """Path of the rhubarb program: $RHUBARB, the PATH, or the official release unpacked in the models cache."""
    exe = 'rhubarb.exe' if os.name == 'nt' else 'rhubarb'
    for p in (os.environ.get('RHUBARB'), shutil.which('rhubarb')):
        if p and os.path.isfile(p):
            return p
    for root, _, files in os.walk(HOME):
        if exe in files:
            return os.path.join(root, exe)
    return None


def ensure():
    """The official release of Rhubarb (GitHub, MIT), downloaded once into the models cache."""
    b = binary()
    if b:
        return b
    osname = {'Windows': 'Windows', 'Darwin': 'macOS'}.get(platform.system(), 'Linux')
    url = f'https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v{VERSION}/Rhubarb-Lip-Sync-{VERSION}-{osname}.zip'
    os.makedirs(HOME, exist_ok=True)
    z = os.path.join(HOME, 'rhubarb.zip')
    print(f'[lèvres] téléchargement de Rhubarb {VERSION} ({osname}, licence MIT)…', flush=True)
    urllib.request.urlretrieve(url, z)
    with zipfile.ZipFile(z) as f:
        f.extractall(HOME)
    os.remove(z)
    b = binary()
    if b and os.name != 'nt':
        os.chmod(b, 0o755)
    return b


def cues(wav, exe=None):
    """Rhubarb mouth cues of one recording: [{'start': s, 'end': s, 'value': 'A'…'X'}]."""
    exe = exe or ensure()
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, 'cues.json')
        subprocess.run([exe, '-r', 'phonetic', '-f', 'json', '--extendedShapes', 'GHX', '-q', wav, '-o', out],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return json.load(open(out, encoding='utf-8'))['mouthCues']


def jaw_from_cues(cs, env, fps):
    """The loudness lips (lively, measured on the line) + the CLOSURES Rhubarb hears: on m / b / p (shape A) the lips
    meet, whatever the loudness. Measured on the 22 lines of film 6 (French Piper voices): 63 % of Rhubarb's A shapes
    fall in words with m/b/p, which are only 28 % of the speaking time — a real signal (×2,25) —, while its other shapes
    opened LESS than the voice (mean 0,32 vs 0,44) and closed less often: only the closures are kept."""
    out = np.asarray(env, float).copy()
    n = len(out)
    for c in cs:
        if c['value'] != 'A':
            continue
        a = int(round(c['start'] * fps))
        b = max(a + 1, int(round(c['end'] * fps)))
        out[a:min(n, b)] = np.minimum(out[a:min(n, b)], 0.03)
    return out


def line_jaw(wav, env, fps):
    """The line's lip track from Rhubarb when it is available, else the loudness envelope as before."""
    try:
        exe = binary() or ensure()
        if not exe or not os.path.isfile(wav):
            return env, False
        return jaw_from_cues(cues(wav, exe), env, fps), True
    except Exception as e:  # noqa: BLE001 — no network, unknown platform…: the film keeps the loudness lips
        print(f'[lèvres] Rhubarb indisponible ({e.__class__.__name__}) : bouche au volume de la voix', flush=True)
        return env, False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', required=True)
    a = ap.parse_args()
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import plan as P
    pl = json.load(open(a.plan, encoding='utf-8'))
    fps, nF = pl['fps'], pl['frames']
    vdir = os.path.join(os.path.dirname(os.path.abspath(a.plan)), 'voices')
    beats = pl['story']['beats']
    jaw = {c: np.zeros(nF) for c in pl['tracks']}
    used = 0
    for seg in pl['timeline']:
        i = seg['i']
        wav = os.path.join(vdir, f'line-{i:02d}.wav')
        env = P.envelope(P.read_wav(wav), fps)
        j, ok = line_jaw(wav, env, fps)
        used += ok
        w = beats[i]['who']
        f0 = int(round(seg['speak0'] * fps))
        jaw[w][f0:f0 + len(j)] = np.maximum(jaw[w][f0:f0 + len(j)], j[:max(0, nF - f0)])
    for c, tr in pl['tracks'].items():
        tr['jaw'] = [round(float(v), 3) for v in jaw[c]]
    pl['lipsync'] = f'volume de la voix + fermetures m/b/p (Rhubarb {VERSION})' if used else 'volume de la voix'
    json.dump(pl, open(a.plan, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'[lèvres] {used}/{len(pl["timeline"])} réplique(s) avec les fermetures m/b/p de Rhubarb', flush=True)


if __name__ == '__main__':
    main()
