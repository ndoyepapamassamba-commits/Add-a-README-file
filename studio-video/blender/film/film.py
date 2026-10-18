#!/usr/bin/env python3
"""TOURNER UN FILM AVEC BLENDER — une commande, de l'histoire au MP4 :
  1. découpe des planches de la troupe (une fois, mise en cache) ;
  2. plan : voix, minutage, bouche, jeu, plans, sous-titres ;
  3. scène Blender + rendu de TOUTES les images d'un seul tenant (EEVEE/GPU sur votre machine, Cycles sinon) ;
  4. montage (bandeaux, sous-titres, emoji, son) + contrôle qualité.

  python3 blender/film/film.py --story histoire.json --troupe .private/troupe --out ~/massamba-blender/film1 \
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
    # 3 échantillons (18/10/2026, « trouve une solution à la rapidité de génération via Blender ») : acteurs et décor sont des
    # peintures émissives, sans lumière à intégrer ; mesuré sur la cour : 2 échantillons = 0,4 s/image contre 5,75 s à 10
    # (×14), même netteté (PSNR 36 dB, aucun bruit visible) ; le 3e lisse les bords des découpes. 10 reste possible.
    ap.add_argument('--samples', type=int, default=3)
    ap.add_argument('--seconds', type=float, default=64, help='durée visée (> 60 s : programme de rémunération TikTok ; vos vidéos : 60,6 à 70,6 s)')
    ap.add_argument('--sans-realisateur', action='store_true',
                    help='sans le réalisateur (director.py : gestes, énergie, réactions, caméra par réplique) — comparaison A/B')
    ap.add_argument('--realisateur', default=os.environ.get('MASSAMBA_DIRECTOR', 'auto'),
                    help='auto | regles | local | openrouter (auto = OpenRouter gratuit si clé, sinon modèle local, sinon règles)')
    ap.add_argument('--apercu', action='store_true',
                    help='APERÇU RAPIDE (« processeur fictif ») : demi-résolution, 4 échantillons, une image sur trois — '
                         'pour valider histoire, lieux, cadrages et voix en quelques minutes ; le rendu final se fait sans')
    ap.add_argument('--pas', type=int, default=0,
                    help='aperçu : une image rendue sur N (3 par défaut) ; 1 = toutes les images à demi-résolution, pour MESURER le rythme '
                         '(un aperçu sur trois sous-estime mouvement et couverture de 14 à 20 %%, mesuré sur le film 9)')
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    cut = os.path.join(out, 'troupe')
    if not os.path.isfile(os.path.join(cut, 'rig.json')):
        run([sys.executable, os.path.join(HERE, 'cutout.py'), '--troupe', a.troupe, '--out', cut])
    # THE DIRECTOR (director.py): every line gets its gesture (CMU clip by tag), energy, the partners' reactions and a
    # camera hint — rules first, a free text model for the gaps; 0 $ of video. The directed story feeds the plan.
    story = a.story
    if not a.sans_realisateur:
        directed = os.path.join(out, 'story.directed.json')
        if not os.path.isfile(directed):
            run([sys.executable, os.path.join(HERE, 'director.py'), '--story', a.story, '--rig', os.path.join(cut, 'rig.json'), '--out', directed, '--mode', a.realisateur])
        story = directed
    if not os.path.isfile(os.path.join(out, 'plan.json')):
        run([sys.executable, os.path.join(HERE, 'plan.py'), '--story', story, '--rig', os.path.join(cut, 'rig.json'), '--voices', a.voices, '--out', out, '--seconds', str(a.seconds)])
    engine = a.engine or ('EEVEE' if a.blender else 'CYCLES')
    # The living faces (LivePortrait library, computed once per character pose and kept in the kit): ~0 s per film.
    lf = subprocess.run([os.environ.get('MASSAMBA_PY', sys.executable), os.path.join(HERE, 'liveface.py'), '--plan', os.path.join(out, 'plan.json'), '--kit', a.troupe])
    if lf.returncode != 0:
        print('[film] visages vivants indisponibles (LivePortrait non installé ?) : dessins fixes', flush=True)
    # The painted crowd, person by person (Mask R-CNN, once per view, kept in the kit): each painted person sways in
    # its own rhythm instead of the whole crowd sliding as one block.
    cr = subprocess.run([os.environ.get('MASSAMBA_PY', sys.executable), os.path.join(HERE, 'crowd.py'), '--plan', os.path.join(out, 'plan.json')])
    if cr.returncode != 0:
        print('[film] foule peinte non séparée (torchvision non installé ?) : une foule d’un seul bloc reste immobile', flush=True)
    frames_dir = os.path.join(out, 'apercu' if a.apercu else 'frames')
    scene = [os.path.join(HERE, 'scene.py'), '--plan', os.path.join(out, 'plan.json'), '--out', frames_dir, '--engine', engine,
             '--samples', str(4 if a.apercu else a.samples)] + (['--scale', '0.5', '--pas', str(a.pas or 3)] if a.apercu else [])
    # Several views of one place: each run of shots is rendered in its view (same actors, same sound — a cut).
    coupes = json.load(open(os.path.join(out, 'plan.json'), encoding='utf-8')).get('coupes') or [None]
    with open(os.path.join(out, 'render.log'), 'a', encoding='utf-8') as log:
        for c in coupes:
            part = scene + (['--decor', c['decor'], '--frames', f"{c['start'] + 1}-{c['end']}"] if c else [])
            if a.blender:
                run([a.blender, '-b', '--python', part[0], '--'] + part[1:], log)
            else:
                run([sys.executable] + part, log)
    film = os.path.join(out, 'apercu.mp4' if a.apercu else 'film.mp4')
    run([sys.executable, os.path.join(HERE, 'finish.py'), '--plan', os.path.join(out, 'plan.json'), '--frames', frames_dir, '--out', film])
    qa_p = os.path.splitext(film)[0] + '.qa.json'
    qa = json.load(open(qa_p))
    qa['total_s'] = round(time.time() - t0)
    qa['engine'] = engine
    json.dump(qa, open(qa_p, 'w'), indent=1)
    print(f"[film] OK → {film} · {qa['frames_encoded']}/{qa['frames_expected']} images · image/son {qa['video_s']}/{qa['audio_s']} s · {qa['total_s']} s au total")
    # The quality gate (technique, TikTok rhythm of the channel, hook): the verdict and every check in film.gate.json.
    subprocess.run([sys.executable, os.path.join(HERE, 'gate.py'), film])
    print(f"[film] couverture, sous-titres et texte de publication : {os.path.splitext(film)[0]}.cover.jpg / .srt / .post.txt")


if __name__ == '__main__':
    main()
