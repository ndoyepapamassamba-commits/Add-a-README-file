# ASSEMBLEUR DE VIDÉOS (20/10/2026) — la vidéo n'est plus calculée, elle est MONTÉE à partir de la banque de mouvements :
# pour chaque réplique, le personnage qui parle joue son clip de geste, les autres leur clip « écouter » (ou la réaction écrite
# dans « reagit ») ; chaque clip, détouré une fois pour toutes (detoure.py : alpha propre, liseré vert ôté, ombre de contact
# cuite), est mis à l'échelle, ses PIEDS posés sur la ligne de sol du décor, sa couleur accordée à la lumière du décor autour
# de lui, retourné vers son interlocuteur, bouclé en aller-retour pour durer le temps de la réplique ; voix posée dessus.
# Cadre de la V1 (TikTok vertical 1080×1920) : la scène en bandeau au milieu, le décor flouté et assombri derrière, le titre
# au-dessus, le nom de celui qui parle et sa réplique en dessous.
# OCCULTATION : profondeur du décor (Depth Anything V2 Small, Apache-2.0) et sol (UperNet ADE20K, MIT), modèles ONNX déjà en cache,
# calculés une fois par décor : ce qui est plus proche que les pieds de l'acteur (table, chaise, comptoir) repasse devant lui.
# GREFFE : ffmpeg (LGPL, programme séparé) — overlay, colorchannelmixer, boxblur, drawtext, concat.
# Mesuré le 20/10/2026 (4 processeurs) : 1re version (colorkey) — vidéo de 60 s, 20 répliques, 2 personnages → 47 s.
#   python3 assemble.py PLAN.json SORTIE.mp4
# PLAN.json : {"decor": "decor.png", "titre": "…", "lieu": "cour|maquis" (ambiance réelle, facultatif), "acteurs": {"koffi": {"x": 0.25, "sol": 0.97, "taille": 0.95,
#   "regarde": "droite", "occultation": true}, …}, "repliques": [{"qui": "koffi", "geste": "montrer", "voix": "r1.wav", "texte": "…",
#   "reagit": {"coumba": "choc"}, "chute": false}, {"duree": 1.6, "reagit": {…}}, …], "banque": "dossier des clips <personnage>--<geste>.mp4"}
import json, os, subprocess, sys, tempfile, textwrap, time
import numpy as np

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
FPS = 24
L, H_ = 1080, 1920            # cadre vertical
BW, BH, BY = 1080, 630, 560   # bandeau de la scène (format des décors de la bible, 768×448 → 1080×630) et sa hauteur dans le cadre
POLICE = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
NOMS = {'koffi': 'KOFFI', 'coumba': 'COUMBA', 'baye-ndiaye': 'BAYE NDIAYE', 'maman-nounou': 'MAMAN NOUNOU',
        'petit-mamadou': 'PETIT MAMADOU', 'tantie-awa': 'TANTIE AWA', 'modou': 'MODOU'}
if os.path.isfile(os.path.join(ICI, 'troupe.json')):   # noms des personnages entrés par la bible (relais.py)
    NOMS.update(json.load(open(os.path.join(ICI, 'troupe.json'), encoding='utf-8')).get('noms', {}))


def _clip(banque, perso, geste):
    """Clip détouré (.mov ARGB) du geste, détouré à la première demande ; repli sur parler, écouter, puis un autre geste."""
    import detoure
    import glob
    def version(x): return int(x.rsplit('@', 1)[1][:-4]) if '@' in os.path.basename(x) else 1
    autres = sorted({os.path.basename(x)[len(perso) + 2:-4].split('@')[0] for x in glob.glob(os.path.join(banque, f'{perso}--*.mp4'))})
    for g in (geste, 'parler', 'ecouter', *autres):   # en dernier recours, un autre geste du même personnage
        vs = glob.glob(os.path.join(banque, f'{perso}--{g}.mp4')) + glob.glob(os.path.join(banque, f'{perso}--{g}@*.mp4'))
        f = max(vs, key=version) if vs else ''   # clip refait (banque.VERSIONS) : la version la plus haute
        if os.path.isfile(f):
            mov = f[:-4] + '.mov'
            if not os.path.isfile(mov) or not os.path.isfile(f[:-4] + '.pieds.json'): detoure.detoure(f)
            return mov, json.load(open(f[:-4] + '.pieds.json'))
    raise FileNotFoundError(f'aucun clip pour {perso} ({geste})')


def _image_rgba(mov):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', mov, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(640, 384, 4)


def lumiere(decor, a, mov, pieds):
    """Gains R, V, B qui teintent le personnage de la lumière du décor là où il se tient : dominante de couleur de la zone
    et luminosité (repère 140), à la puissance 0,3 pour que le dessin garde ses couleurs ; bornés à 0,8–1,15. (1re version :
    rapport décor / costume — une robe rose recevait une dominante verte, mesuré sur l'essai du 20/10.)"""
    from PIL import Image
    d = np.asarray(Image.open(decor).convert('RGB').resize((BW, BH)), np.float32)
    h = a.get('taille', 0.95) * BH; x = a.get('x', 0.5) * BW; y1 = a.get('sol', 0.97) * BH
    zone = d[int(max(0, y1 - 0.9 * h)):int(y1), int(max(0, x - 0.15 * BW)):int(min(BW, x + 0.15 * BW))].reshape(-1, 3)
    if len(zone) == 0: return 1.0, 1.0, 1.0
    zd = zone.mean(0); g = (zd / zd.mean()) ** 0.3 * (zd.mean() / 140) ** 0.3
    return tuple(float(np.clip(g[c], 0.8, 1.15)) for c in range(3))


SOL = [3, 6, 9, 11, 13, 28, 29, 46, 52]   # ADE20K : sol, route, herbe, trottoir, terre, tapis, champ, sable, chemin


def couches(decor):
    """Profondeur (Depth Anything V2 Small, Apache-2.0) et classes ADE20K (UperNet ConvNeXt, MIT) du décor, par les modèles
    ONNX déjà en cache (outils/scene_layers.py) ; calculées une fois, gardées à côté du décor (.couches.npz)."""
    import cv2
    from PIL import Image
    cache = os.path.splitext(decor)[0] + '.couches.npz'
    if not os.path.isfile(cache):
        sys.path.insert(0, os.path.join(ICI, '..', 'outils')); import scene_layers as SL
        im = Image.open(decor).convert('RGB')
        d = np.asarray(SL.depth(im).resize((BW, BH), Image.BICUBIC), np.float32) / 255
        seg = SL.segment(im); seg = cv2.resize(seg, (BW, BH), interpolation=cv2.INTER_NEAREST) if seg is not None else np.zeros((BH, BW), np.uint8)
        np.savez_compressed(cache, d=d, seg=seg)
    z = np.load(cache); return z['d'], z['seg']


def profondeur_pieds(d, seg, x, y):
    """Profondeur du sol là où se tiennent les pieds, même cachés (derrière une table) : droite profondeur = f(ligne) ajustée
    sur les pixels de sol du décor ; sans sol visible, la profondeur relevée au point des pieds."""
    sol = np.isin(seg, SOL); ys = [r for r in range(BH) if sol[r].sum() >= 20]
    if len(ys) >= 10:
        a, b = np.polyfit(ys, [float(np.median(d[r][sol[r]])) for r in ys], 1); return float(a * y + b)
    x, y = int(np.clip(x, 4, BW - 5)), int(np.clip(y, 4, BH - 5)); return float(np.median(d[y - 4:y + 5, x - 4:x + 5]))


def occultant(decor, d, seg, prof, boite, dossier, nom):
    """Calque du décor qui passe DEVANT l'acteur : pixels plus proches que ses pieds (hors sol), dans sa boîte, bords adoucis."""
    import cv2
    from PIL import Image
    x0, y0, x1, y1 = boite; m = np.zeros((BH, BW), np.float32)
    zone = (d > prof + 0.04) & ~np.isin(seg, SOL)
    m[max(0, y0):min(BH, y1), max(0, x0):min(BW, x1)] = zone[max(0, y0):min(BH, y1), max(0, x0):min(BW, x1)]
    m = cv2.GaussianBlur(m, (0, 0), 1.2)
    im = np.asarray(Image.open(decor).convert('RGB').resize((BW, BH), Image.LANCZOS))
    f = os.path.join(dossier, f'devant-{nom}.png'); Image.fromarray(np.dstack([im, (m * 255).astype(np.uint8)])).save(f)
    return f, float(m.mean())


def _texte(dossier, nom, t, largeur):
    f = os.path.join(dossier, nom); open(f, 'w', encoding='utf-8').write('\n'.join(textwrap.wrap(t, largeur))); return f


def segment(P, r, k, dossier, gains):
    dur = float(r['duree']); acteurs = P['acteurs']; titre = P.get('titre', '')
    entrees = ['-loop', '1', '-i', P['decor']]
    f = [f'[0:v]split[d0][d1];[d0]scale={BW}:{BH},setsar=1,fps={FPS}[f0]',
         f'[d1]scale=-2:{H_},crop={L}:{H_},boxblur=28:2,eq=brightness=-0.16:saturation=0.75,setsar=1,fps={FPS}[fond]']
    dernier = 'f0'; i = 1; occ = P.get('_occultants', {})
    for nom, a in sorted(acteurs.items(), key=lambda kv: occ.get(kv[0], (None, 0))[1]):   # du plus loin au plus proche
        geste = r.get('geste', 'parler') if nom == r.get('qui') else r.get('reagit', {}).get(nom, 'ecouter')
        mov, pieds = _clip(P['banque'], nom, geste)
        h = int(BH * a.get('taille', 0.95)); w = int(h * 384 / 640) // 2 * 2
        flip = ',hflip' if a.get('regarde', 'droite') == 'gauche' else ''
        gr, gv, gb = gains[nom]; px = (1 - pieds['x']) if flip else pieds['x']
        liste = None
        if nom == r.get('qui') and r.get('voix') and os.environ.get('LEVRES_BANQUE', '1') == '1':
            try:   # 21/10 : celui qui parle — images du clip choisies pour que la bouche suive la voix (levres_banque.py)
                import levres_banque
                liste = levres_banque.liste_concat(mov, mov[:-4] + '.mp4', r['voix'], dur, FPS, os.path.join(dossier, f'levres{k:03d}-{nom}.txt'))
            except Exception as e:
                print(f'  synchro labiale non appliquée ({nom}) : {e}', file=sys.stderr)
        if liste:
            entrees += ['-f', 'concat', '-safe', '0', '-i', liste]
            f.append(f'[{i}:v]fps={FPS},format=rgba,trim=duration={dur},setpts=PTS-STARTPTS,scale={w}:{h},'
                     f'colorchannelmixer=rr={gr:.3f}:gg={gv:.3f}:bb={gb:.3f}{flip}[p{i}]')
        else:   # aller-retour (le clip joué puis renversé) : boucle sans saut, quelle que soit la durée de la réplique
            entrees += ['-i', mov]
            f.append(f'[{i}:v]fps={FPS},format=rgba,split[a{i}][b{i}];[b{i}]reverse[r{i}];[a{i}][r{i}]concat=n=2:v=1:a=0,'
                     f'loop=-1:size=9999,trim=duration={dur},setpts=PTS-STARTPTS,scale={w}:{h},'
                     f'colorchannelmixer=rr={gr:.3f}:gg={gv:.3f}:bb={gb:.3f}{flip}[p{i}]')
        x = int(a.get('x', 0.5) * BW - px * w); y = int(a.get('sol', 0.97) * BH - pieds['y'] * h)   # pieds sur la ligne de sol
        f.append(f'[{dernier}][p{i}]overlay=x={x}:y={y}:shortest=0[f{i}]'); dernier = f'f{i}'; i += 1
        if occ.get(nom) and occ[nom][0]:   # ce qui est devant lui dans le décor (table, chaise, comptoir) repasse par-dessus
            entrees += ['-loop', '1', '-i', occ[nom][0]]
            f.append(f'[{i}:v]format=rgba,fps={FPS}[o{i}];[{dernier}][o{i}]overlay=0:0:shortest=1[f{i}]'); dernier = f'f{i}'; i += 1
    f.append(f'[fond][{dernier}]overlay=0:{BY}[c0]'); c = 'c0'
    if titre:
        f.append(f"[{c}]drawtext=fontfile={POLICE}:textfile={_texte(dossier, 'titre.txt', titre, 22)}:fontsize=66:fontcolor=white:"
                 f"borderw=6:bordercolor=black:line_spacing=12:x=(w-tw)/2:y={BY - 300}[c1]"); c = 'c1'
    if r.get('texte'):
        f.append(f"[{c}]drawtext=fontfile={POLICE}:text='{NOMS.get(r['qui'], r['qui'].upper())}':fontsize=44:fontcolor=#FFD23F:"
                 f"borderw=4:bordercolor=black:x=(w-tw)/2:y={BY + BH + 60}[c2]")
        f.append(f"[c2]drawtext=fontfile={POLICE}:textfile={_texte(dossier, f'sous{k}.txt', r['texte'], 30)}:fontsize=54:"
                 f"fontcolor=white:borderw=5:bordercolor=black:line_spacing=10:x=(w-tw)/2:y={BY + BH + 125}[c3]"); c = 'c3'
    voix = r.get('voix')
    entrees += (['-i', voix] if voix else ['-f', 'lavfi', '-t', str(dur), '-i', 'anullsrc=r=48000:cl=stereo'])
    sortie = os.path.join(dossier, f'seg{k:03d}.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *entrees, '-filter_complex', ';'.join(f), '-map', f'[{c}]',
                    '-map', f'{i}:a', '-af', 'apad', '-t', str(dur), '-r', str(FPS), '-c:v', 'libx264', '-preset', 'veryfast',
                    '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', sortie], check=True)
    return sortie


def ambiance(P, brut, sortie, d):
    """Ambiance RÉELLE du lieu (moteur-troupe/ambiance.py : oiseaux et vent de la cour, poules dans les silences, coq à
    l'ouverture ; brouhaha et grill du maquis), 22 dB sous les voix, abaissée quand quelqu'un parle, silence avant la chute."""
    t = 0.0; lignes = []
    for r in P['repliques']:
        if r.get('voix'):
            p = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', r['voix']],
                               capture_output=True, text=True, check=True)
            lignes.append({'t0': round(t, 3), 'dur': round(float(p.stdout), 3), 'sketch': 's1', 'chute': bool(r.get('chute'))})
        t += float(r['duree'])
    tl = os.path.join(d, 'timeline.json')
    json.dump({'lines': lignes, 'sketchs': [{'id': 's1', 't0': 0, 't1': round(t, 3), 'lieu': P['lieu']}]}, open(tl, 'w'))
    voix, mix = os.path.join(d, 'voix.wav'), os.path.join(d, 'mix.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', brut, '-vn', '-ac', '1', '-ar', '48000', voix], check=True)
    subprocess.run([sys.executable, os.path.join(ICI, '..', 'moteur-troupe', 'ambiance.py'), tl, voix, mix], check=True,
                   capture_output=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', brut, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', sortie],
                   check=True)   # sonie des plateformes courtes (−14 LUFS)


def assemble(plan, sortie):
    P = json.load(open(plan, encoding='utf-8')); t0 = time.time()
    for r in P['repliques']:   # durée = voix + respiration avant la réplique suivante
        if 'duree' not in r:
            p = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', r['voix']],
                               capture_output=True, text=True, check=True)
            r['duree'] = round(float(p.stdout) + P.get('respiration', 0.35), 2)
    gains = {}
    with tempfile.TemporaryDirectory() as d:
        dp, seg = couches(P['decor']); P['_occultants'] = {}; info = {}
        for nom, a in P['acteurs'].items():
            mov, pieds = _clip(P['banque'], nom, 'ecouter'); gains[nom] = lumiere(P['decor'], a, mov, pieds)
            h = int(BH * a.get('taille', 0.95)); w = int(h * 384 / 640); X, Y = a.get('x', 0.5) * BW, a.get('sol', 0.97) * BH
            prof = profondeur_pieds(dp, seg, X, Y)
            boite = (int(X - w / 2) - 10, int(Y - h) - 10, int(X + w / 2) + 10, int(Y) + 30)
            fo, part = occultant(P['decor'], dp, seg, prof, boite, d, nom) if a.get('occultation', True) else (None, 0)
            P['_occultants'][nom] = (fo if part > 0 else None, prof); info[nom] = {'profondeur': round(prof, 3), 'cache': round(part, 4)}
        segs = [segment(P, r, k, d, gains) for k, r in enumerate(P['repliques'])]
        liste = os.path.join(d, 'liste.txt'); open(liste, 'w').write(''.join(f"file '{s}'\n" for s in segs))
        brut = os.path.join(d, 'brut.mp4') if P.get('lieu') else sortie
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', liste, '-c', 'copy',
                        '-movflags', '+faststart', brut], check=True)
        if P.get('lieu'): ambiance(P, brut, sortie, d)
    duree = sum(float(r['duree']) for r in P['repliques'])
    return {'video': sortie, 'duree_s': round(duree, 1), 'assemblage_s': round(time.time() - t0, 1),
            'repliques': len(P['repliques']), 'lumiere': {k: [round(g, 3) for g in v] for k, v in gains.items()}, 'occultation': info}


if __name__ == '__main__':
    if len(sys.argv) == 3: print(json.dumps(assemble(sys.argv[1], sys.argv[2]), ensure_ascii=False))
    else: print(open(__file__, encoding='utf-8').read().split('import json')[0])
