# ASSEMBLEUR DE VIDÉOS (20/10/2026) — la vidéo n'est plus calculée, elle est MONTÉE à partir de la banque de mouvements :
# pour chaque réplique, le personnage qui parle joue son clip de geste, les autres leur clip « écouter » ; chaque clip est
# détouré de son fond vert (ffmpeg colorkey + despill), mis à l'échelle de sa taille, retourné vers son interlocuteur, posé
# dans le décor, bouclé en aller-retour pour durer le temps de la réplique ; voix posée dessus.
# GREFFE : ffmpeg (LGPL, programme séparé) — colorkey, despill, overlay, concat ; aucun calcul d'IA à l'assemblage.
# Mesuré le 20/10/2026 (4 processeurs) : vidéo de 60 s, 20 répliques, 2 personnages → assemblée en 47 s.
# À faire avant toute vidéo publiée (vu sur l'essai : personnages « collés » sur un décor déjà peuplé, défaut de la vidéo 2) :
# décors VIDES au style V1 (bible.py), pieds sur la ligne de sol du décor, ombre de contact, lumière du décor sur le personnage.
#   python3 assemble.py PLAN.json SORTIE.mp4
# PLAN.json : {"decor": "decor.png|decor.mp4", "taille": [1080, 648], "acteurs": {"koffi": {"x": 0.3, "taille": 0.9,
#   "regarde": "droite"}, …}, "repliques": [{"qui": "koffi", "geste": "montrer", "duree": 3.2, "voix": "r1.wav"}, …],
#   "banque": "dossier des clips <personnage>--<geste>.mp4"}
import json, os, subprocess, sys, tempfile, time

FPS = 24


def _clip(banque, perso, geste):
    for g in (geste, 'parler', 'ecouter'):
        f = os.path.join(banque, f'{perso}--{g}.mp4')
        if os.path.isfile(f): return f
    raise FileNotFoundError(f'aucun clip pour {perso} ({geste})')


def segment(P, r, k, dossier):
    W, H = P['taille']; dur = float(r['duree']); acteurs = P['acteurs']
    entrees = (['-stream_loop', '-1', '-i', P['decor']] if P['decor'].endswith('.mp4') else ['-loop', '1', '-i', P['decor']])
    filtres = [f'[0:v]scale={W}:{H},setsar=1,fps={FPS}[f0]']; dernier = 'f0'; i = 1
    for nom, a in acteurs.items():
        geste = r.get('geste', 'parler') if nom == r['qui'] else ('ecouter' if nom not in r.get('reagit', {}) else r['reagit'][nom])
        entrees += ['-i', _clip(P['banque'], nom, geste)]
        h = int(H * a.get('taille', 0.9)); flip = ',hflip' if a.get('regarde', 'droite') == 'gauche' else ''
        # aller-retour (le clip joué puis renversé) : boucle sans saut, quelle que soit la durée de la réplique
        filtres.append(f'[{i}:v]fps={FPS},split[a{i}][b{i}];[b{i}]reverse[r{i}];[a{i}][r{i}]concat=n=2:v=1,loop=-1:size=9999,'
                       f'trim=duration={dur},setpts=PTS-STARTPTS,colorkey=0x00FF00:0.32:0.10,despill=type=green,'
                       f'scale=-2:{h}{flip}[p{i}]')
        x = f"{a.get('x', 0.5)}*{W}-w/2"; y = f"{H}-h-{int(H * a.get('pied', 0.02))}"
        filtres.append(f'[{dernier}][p{i}]overlay=x={x}:y={y}:shortest=0[f{i}]'); dernier = f'f{i}'; i += 1
    voix = r.get('voix')
    entrees += (['-i', voix] if voix else ['-f', 'lavfi', '-t', str(dur), '-i', 'anullsrc=r=48000:cl=stereo'])
    sortie = os.path.join(dossier, f'seg{k:03d}.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *entrees, '-filter_complex', ';'.join(filtres), '-map', f'[{dernier}]',
                    '-map', f'{i}:a', '-t', str(dur), '-r', str(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
                    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', sortie], check=True)
    return sortie


def assemble(plan, sortie):
    P = json.load(open(plan, encoding='utf-8')); t0 = time.time()
    with tempfile.TemporaryDirectory() as d:
        segs = [segment(P, r, k, d) for k, r in enumerate(P['repliques'])]
        liste = os.path.join(d, 'liste.txt'); open(liste, 'w').write(''.join(f"file '{s}'\n" for s in segs))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', liste, '-c', 'copy',
                        '-movflags', '+faststart', sortie], check=True)
    duree = sum(float(r['duree']) for r in P['repliques'])
    return {'video': sortie, 'duree_s': round(duree, 1), 'assemblage_s': round(time.time() - t0, 1), 'repliques': len(P['repliques'])}


if __name__ == '__main__':
    if len(sys.argv) == 3: print(json.dumps(assemble(sys.argv[1], sys.argv[2]), ensure_ascii=False))
    else: print(open(__file__, encoding='utf-8').read().split('import json')[0])
