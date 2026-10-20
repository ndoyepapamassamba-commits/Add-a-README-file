# ANALYSE AU FIL DE L'EAU (18/10/2026) — « récupère les planches au fur et à mesure pour aller vite dans tes analyses » :
# guette le dossier du lot pendant que generer.py tourne ; chaque planche qui arrive est analysée tout de suite, en local :
#  · toute planche : censure du service (image noire « CENSORED » : faux positif d'AI Horde sur une simple chaise, 18/10) ;
#  · personnage : découpe des vues + orientation mesurée + miroirs (decoupe.py), contrôle d'animabilité, et « en pied »
#    (chevilles visibles : Petit Mamadou est sorti en gros plan, 18/10) ;
#  · décor : vide (aucune personne détectée), sans texte ;
#  · objet : détouré (BiRefNet), un seul objet.
# Une planche en défaut va dans rejets/ (generer.py la refait avec une autre graine) ; chaque analyse est journalisée
# (analyse.jsonl), annoncée sur une ligne « ANALYSE … » et ajoutée à la planche de contact (contact.jpg).
# Quand generer.py ne tourne plus et qu'il manque des planches, il est relancé (relances bornées).
#   python3 analyse_lot.py <dossier_du_lot> <dossier_des_vues> [relances_max]
import json, os, sys, time, glob, shutil, subprocess
import numpy as np, cv2
ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import decoupe, univers


def censuree(img):
    """image remplacée par le service (fond noir + texte de censure)."""
    if img.mean() > 40: return False
    try:
        import easyocr
        if 'ocr' not in decoupe._S: decoupe._S['ocr'] = easyocr.Reader(['en'], gpu=False, model_storage_directory=decoupe.M + 'easyocr', verbose=False)
        t = ' '.join(x[1] for x in decoupe._S['ocr'].readtext(img)).upper()
        return 'CENSOR' in t or 'NSFW' in t
    except Exception:
        return img.mean() < 15


def personnes(rgb):
    """nombre de personnes détectées (MediaPipe Pose) — un décor doit être vide."""
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    if 'pose3' not in decoupe._S:
        decoupe._S['pose3'] = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=decoupe.M + 'pose_landmarker_heavy.task'), num_poses=4, min_pose_detection_confidence=0.5))
    r = decoupe._S['pose3'].detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
    return sum(1 for lm in r.pose_landmarks if np.mean([p.visibility for p in lm[:13]]) > 0.6)


def analyse(f, i, vues):
    rgb = cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB); d = []; info = {}
    if censuree(rgb): return ['censurée par le service'], info
    genre = i.split('/')[0]
    if genre == 'perso':
        sorte = i.rsplit('-', 1)[1]; nom = i.split('/')[1].rsplit('-', 1)[0]
        fiche = decoupe.decoupe(f, f'{vues}/{nom}/{sorte}', sorte if sorte in decoupe.NOMS else 'face'); d += fiche['defauts']
        for v, x in fiche['vues'].items():
            if x.get('miroir_de') or sorte == 'marche': continue
            S_ = x.get('squelette')
            if not S_ or max(S_[27][2], S_[28][2]) < 0.5: d.append(f'{v} : pas en pied (chevilles invisibles)')
        info = {'vues': [v for v in fiche['vues']], 'orientations': {v: x.get('orientation') for v, x in fiche['vues'].items() if x.get('orientation')}}
    elif genre == 'decor':
        n = personnes(rgb)
        if n: d.append(f'{n} personne(s) dans le décor')
        try:
            t = [x[1] for x in decoupe._S['ocr'].readtext(rgb) if x[2] > 0.6 and len(x[1].strip()) >= 3] if 'ocr' in decoupe._S else []
            if t: d.append('texte : ' + ' '.join(t)[:40])
        except Exception: pass
    elif genre == 'objet':
        a = decoupe.birefnet(rgb); m = (a > 0.5).astype(np.uint8); n, lab, st, _ = cv2.connectedComponentsWithStats(m)
        grands = [k for k in range(1, n) if st[k, 4] > 0.02 * m.size]
        if not grands: d.append('objet introuvable')
        os.makedirs(f'{vues}/objets', exist_ok=True)
        cv2.imwrite(f"{vues}/objets/{i.split('/')[1]}.png", cv2.cvtColor(np.dstack([rgb, (a * 255).astype(np.uint8)]), cv2.COLOR_RGBA2BGRA))
        info = {'morceaux': len(grands)}
    return d, info


def contact(vues, sortie):
    """planche de contact : toutes les vues de personnages acceptées (fond vert), une ligne par personnage."""
    lignes = []
    for p in sorted(glob.glob(f'{vues}/*/')):
        ims = []
        for f in sorted(glob.glob(f'{p}*/*.png')):
            a = cv2.imread(f, cv2.IMREAD_UNCHANGED)
            if a is None or a.shape[2] < 4: continue
            al = a[..., 3:] / 255.0; c = (a[..., :3] * al + np.array([70, 150, 70]) * (1 - al)).astype(np.uint8)
            c = cv2.resize(c, (max(1, int(c.shape[1] * 220 / c.shape[0])), 220)); ims.append(c)
        if ims:
            l = np.hstack(ims)[:, :2400]; cv2.putText(l, os.path.basename(p[:-1]), (4, 16), 0, 0.5, (255, 255, 255), 1)
            lignes.append(np.pad(l, ((0, 0), (0, 2400 - l.shape[1]), (0, 0))))
    if lignes: cv2.imwrite(sortie, np.vstack(lignes[-12:]), [cv2.IMWRITE_JPEG_QUALITY, 85])


def guette(lot, vues, relances_max=4):
    os.makedirs(f'{lot}/rejets', exist_ok=True); fj = f'{lot}/analyse.jsonl'
    faites = {json.loads(l)['fichier'] for l in open(fj)} if os.path.isfile(fj) else set()
    ids = [j[0] for j in univers.catalogue()]; relances = 0; t_vu = time.time()
    while True:
        neuves = [i for i in ids if os.path.isfile(f'{lot}/{i}.png') and f'{lot}/{i}.png' not in faites]
        for i in neuves:
            f = f'{lot}/{i}.png'; time.sleep(1)   # fichier fini d'écrire
            try: d, info = analyse(f, i, vues)
            except Exception as ex: d, info = [f'analyse impossible : {repr(ex)[:80]}'], {}
            if d:
                n = len(glob.glob(f"{lot}/rejets/{i.replace('/', '__')}*")); shutil.move(f, f"{lot}/rejets/{i.replace('/', '__')}-{n}.png")
            else: faites.add(f)
            with open(fj, 'a') as o: o.write(json.dumps({'fichier': f, 'id': i, 'ok': not d, 'defauts': d, **info, 't': time.strftime('%H:%M:%S')}, ensure_ascii=False) + '\n')
            print(f"ANALYSE {i} : {'conforme' if not d else 'REJET → ' + ' ; '.join(d)[:160]}", flush=True)
            if not d and i.startswith('perso/'): contact(vues, f'{lot}/contact.jpg')
            t_vu = time.time()
        reste = [i for i in ids if not os.path.isfile(f'{lot}/{i}.png')]
        if not reste: print('ANALYSE TERMINÉE : toutes les planches sont conformes', flush=True); return
        en_cours = subprocess.run(['pgrep', '-f', f'generer.py {lot}'], capture_output=True).stdout.strip()
        if not en_cours and relances < relances_max:
            relances += 1; print(f'RELANCE {relances} de generer.py : {len(reste)} planches manquantes ou rejetées', flush=True)
            subprocess.Popen([sys.executable, f'{ICI}/generer.py', lot, '', '10'], stdout=open(f'{lot}/generer-relance{relances}.log', 'w'), stderr=subprocess.STDOUT, cwd=ICI)
        time.sleep(20)


if __name__ == '__main__':
    guette(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 4)
