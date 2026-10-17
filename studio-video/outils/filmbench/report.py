#!/usr/bin/env python3
"""
FILM BENCH — the proof, measured the same way on the engine's film and on the reference films (Grok, TikTok):

  fluidity      fps (distinct pictures / s) and silhouette pops per minute
  living set    bgLife (motion of the background itself, camera move removed), livingArea
  integration   sharpGap (people vs background sharpness), shadow (ground darker under the feet)
  lip-sync      darkPeak (dark mouth vs voice at lag 0, minus far lags)
  identity      identityDrift (how far a face drifts from its own first picture)

usage:  python3 outils/filmbench/report.py <engine> <reference>... [--gate]
        (pictures, masks and faces prepared by extract.sh, masks.mjs pose, faces.mjs — work dir $FILMBENCH_DIR)
With --gate the engine must reach the references on every line (exit code 1 otherwise, with the reasons).
"""
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import faces_measures  # noqa: E402
import lipsync  # noqa: E402
import scene  # noqa: E402

B = os.environ.get('FILMBENCH_DIR', '.filmbench')


def measure(n: str) -> dict:
    out = dict(scene.analyse(n))
    d = os.path.join(B, n)
    if os.path.exists(os.path.join(d, 'faces.json')):
        faces = json.load(open(os.path.join(d, 'faces.json')))
        out['identityDrift'] = faces_measures.identity_drift(d, faces)[0]
        out.update({k: v for k, v in lipsync.dark_mouth(n).items() if k in ('darkPeak', 'darkSync0')})
    film = os.path.join(d, 'film.path')
    if os.path.exists(film):
        path = open(film).read().strip()
        pts = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.split()
        t = sorted(float(x) for x in pts if x)
        out['fps'] = round(len(t) / max(1e-6, t[-1] - t[0]), 2) if len(t) > 1 else None
    return out


# Each line: (measure, better is 'high'|'low', how the engine must compare with the references' median).
GATES = [
    ('bgLife', 'high', lambda e, r: e >= 0.6 * r, 'le décor doit vivre au moins à 60 % du niveau des références'),
    ('popsPerMin', 'low', lambda e, r: e <= max(2.0, 1.5 * r), 'pas plus de sauts de silhouette que les références'),
    ('sharpGap', 'low', lambda e, r: e <= r + 0.75, 'personnages et décor dans la même image (écart de netteté)'),
    ('darkPeak', 'high', lambda e, r: e >= r, 'lip-sync : la bouche suit la voix au moins autant'),
    ('identityDrift', 'low', lambda e, r: e <= r, 'les visages restent eux-mêmes'),
]


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    gate = '--gate' in sys.argv
    engine, refs = args[0], args[1:]
    rows = {n: measure(n) for n in [engine, *refs]}
    keys = ['fps', 'bgLife', 'livingArea', 'camMotion', 'sharpGap', 'shadow', 'popsPerMin', 'darkPeak', 'identityDrift']
    print('film'.ljust(18) + ''.join(k.rjust(14) for k in keys))
    for n, r in rows.items():
        print(n.ljust(18) + ''.join(('—' if r.get(k) is None else f'{r[k]:.4g}').rjust(14) for k in keys))
    json.dump(rows, open(os.path.join(B, 'report.json'), 'w'), indent=1)
    if not gate:
        return
    fails = []
    for k, _, ok, why in GATES:
        ref = [rows[n][k] for n in refs if rows[n].get(k) is not None]
        e = rows[engine].get(k)
        if e is None or not ref:
            continue
        med = float(np.median(ref))
        if not ok(e, med):
            fails.append(f'{k}: {e:.4g} contre {med:.4g} (références) — {why}')
    print('\n'.join(['PORTE DE QUALITÉ : OK'] if not fails else ['PORTE DE QUALITÉ : ÉCHEC', *fails]))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
