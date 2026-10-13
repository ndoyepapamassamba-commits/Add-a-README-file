#!/usr/bin/env python3
"""TOURNER UN FILM AVEC BLENDER — une commande, de l'histoire au MP4 :
  1. découpe des planches de la troupe (une fois, mise en cache) ;
  2. plan : voix, minutage, bouche, jeu, plans, sous-titres ;
  3. scène Blender + rendu de TOUTES les images d'un seul tenant (EEVEE/GPU sur votre machine, Cycles sinon) ;
  4. montage (bandeaux, sous-titres, emoji, son) + contrôle qualité.

  python3 scripts/blenderfilm/film.py --story histoire.json --troupe .private/troupe --out ~/massamba-blender/film1 \
      [--blender "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe"] [--engine EEVEE] [--samples 10]

Sans --blender : le module Python `bpy` (pip install bpy) — rendu CPU (Cycles), plus lent.
Les images déjà rendues sont gardées : relancer la commande reprend là où le rendu s'était arrêté.
"""
import argparse, json, os, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))


def run(cmd, log=None):
    print('[film] $', ' '.join(str(c) for c in cmd[:6]), '…' if len(cmd) > 6 else '', flush=True)
    p = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT if log else None)
    if p.returncode != 0:
        raise SystemExit(f'étape en échec ({p.returncode}) : {cmd[1] if len(cmd) > 1 else cmd[0]}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--story', required=True)
    ap.add_argument('--troupe', required=True, help='kit troupe : manifest.json + planches + hd/')
    ap.add_argument('--out', required=True)
    ap.add_argument('--voices', default=os.environ.get('PIPER_VOICES', os.path.expanduser('~/piper')))
    ap.add_argument('--blender', default=os.environ.get('BLENDER') or shutil.which('blender'))
    ap.add_argument('--engine', default='')
    ap.add_argument('--samples', type=int, default=10)
    ap.add_argument('--seconds', type=float, default=64, help='durée visée (> 60 s : programme de rémunération TikTok ; vos vidéos : 60,6 à 70,6 s)')
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    cut = os.path.join(out, 'troupe')
    if not os.path.isfile(os.path.join(cut, 'rig.json')):
        run([sys.executable, os.path.join(HERE, 'cutout.py'), '--troupe', a.troupe, '--out', cut])
    if not os.path.isfile(os.path.join(out, 'plan.json')):
        run([sys.executable, os.path.join(HERE, 'plan.py'), '--story', a.story, '--rig', os.path.join(cut, 'rig.json'), '--voices', a.voices, '--out', out, '--seconds', str(a.seconds)])
    engine = a.engine or ('EEVEE' if a.blender else 'CYCLES')
    scene = [os.path.join(HERE, 'scene.py'), '--plan', os.path.join(out, 'plan.json'), '--out', os.path.join(out, 'frames'), '--engine', engine, '--samples', str(a.samples)]
    with open(os.path.join(out, 'render.log'), 'a', encoding='utf-8') as log:
        if a.blender:
            run([a.blender, '-b', '--python', scene[0], '--'] + scene[1:], log)
        else:
            run([sys.executable] + scene, log)
    film = os.path.join(out, 'film.mp4')
    run([sys.executable, os.path.join(HERE, 'finish.py'), '--plan', os.path.join(out, 'plan.json'), '--frames', os.path.join(out, 'frames'), '--out', film])
    qa = json.load(open(os.path.join(out, 'film.qa.json')))
    qa['total_s'] = round(time.time() - t0)
    qa['engine'] = engine
    json.dump(qa, open(os.path.join(out, 'film.qa.json'), 'w'), indent=1)
    print(f"[film] OK → {film} · {qa['frames_encoded']}/{qa['frames_expected']} images · image/son {qa['video_s']}/{qa['audio_s']} s · {qa['total_s']} s au total")
    # The quality gate (technique, TikTok rhythm of the channel, hook): the verdict and every check in film.gate.json.
    subprocess.run([sys.executable, os.path.join(HERE, 'gate.py'), film])
    print(f"[film] couverture, sous-titres et texte de publication : {os.path.splitext(film)[0]}.cover.jpg / .srt / .post.txt")


if __name__ == '__main__':
    main()
