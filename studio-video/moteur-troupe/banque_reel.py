# BANQUE DU RÉEL (17/10/2026). Consignes : « je ne veux rien de procédural, tout doit être naturel » ; « tout ce qu'un humain
# peut faire, nos personnages doivent pouvoir le faire » ; « cherche des vidéos dans tous les domaines afin de couvrir tous les
# mouvements possibles et imaginables, comme si tu entraînais une intelligence artificielle ».
# Comme pour constituer le jeu d'entraînement d'un modèle vidéo, la banque rassemble des VIDÉOS RÉELLES de tous les domaines
# (corps, visages, animaux, nature, objets, villes, caméra) — vidéos libres de droits (Mixkit : utilisation gratuite, sans
# filigrane) — et n'en garde que le MOUVEMENT MESURÉ, jamais l'image (la vidéo est effacée après mesure ; rien n'est
# redistribué) :
#   · corps  : squelette 3D image par image (MediaPipe Pose Landmarker « heavy », Apache-2.0 : 33 points en mètres) ;
#   · visage : pose de la tête, regard, clignements, expressions (Face Landmarker, 52 blendshapes + matrice de la tête) ;
#   · le reste (nature, animaux, objets, foules) : champ de mouvement dense (flux optique DIS, OpenCV) sur une grille 48 × 27,
#     mouvement de caméra séparé (médiane du champ) — c'est la « texture de mouvement » de Generative Image Dynamics, mesurée ;
#   · caméra : trajectoire réelle d'une caméra tenue à la main (translation, zoom, rotation) pour des plans vivants.
# Chaque prise est d'abord VUE PAR JEV (une image du milieu) : quelle chose bouge, un seul plan continu ou non, caméra fixe
# ou non — une prise mal classée ou coupée est rejetée. Le moteur choisit ensuite dans la banque par étiquette et par mesure
# (comme le « motion matching » des jeux vidéo : la meilleure séquence réelle pour la situation, jamais une courbe inventée).
#   python3 banque_reel.py [étiquettes…]     (sans argument : toute la taxonomie ; reprend là où il s'est arrêté)
import json, os, re, subprocess, sys, time, uuid
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
BANQUE = os.path.join(os.path.expanduser('~'), '.cache', 'massamba-models', 'banque-reel')
MODELES = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models'))
TMP = os.path.join(BANQUE, '_tmp')
# taxonomie : domaine → étiquettes Mixkit (pages « free-stock-video/<étiquette>/ ») et ce qu'on mesure
TAXO = {
    'corps':   ('pose', ['talking', 'conversation', 'man-talking', 'woman-talking', 'explaining', 'arguing', 'laughing', 'gesture',
                         'walking', 'running', 'sitting', 'standing-up', 'dancing', 'african-dance', 'celebrating', 'football',
                         'cooking', 'sweeping', 'carrying', 'children-playing', 'old-man', 'hugging', 'handshake', 'waving',
                         'clapping', 'pointing', 'thinking', 'shrugging', 'crying', 'angry', 'surprised', 'jumping', 'stretching']),
    'visage':  ('visage', ['talking-to-camera', 'face-close-up', 'portrait', 'listening', 'smiling', 'blinking', 'video-call']),
    'animaux': ('flux', ['chicken', 'rooster', 'goat', 'dog', 'cat', 'birds', 'bird-flying', 'cow', 'sheep', 'fish', 'insects', 'butterfly']),
    'nature':  ('flux', ['wind', 'leaves', 'palm-tree', 'grass', 'tree', 'flowers', 'waves', 'river', 'rain', 'water-drops', 'waterfall',
                         'fire', 'campfire', 'candle', 'smoke', 'steam', 'clouds', 'fog', 'sunset', 'storm', 'snow', 'sand']),
    'objets':  ('flux', ['flag', 'curtain', 'laundry', 'fabric', 'fan', 'traffic', 'market', 'crowd', 'motorcycle', 'bicycle', 'street',
                         'city', 'kitchen', 'grill', 'bus', 'boat', 'lantern', 'lights']),
    'camera':  ('camera', ['handheld', 'walking-pov', 'drone', 'travel']),
}
LICENCE = 'Mixkit License (vidéos gratuites, sans filigrane ; seul le mouvement mesuré est gardé, la vidéo est effacée)'


def _get(url, out=None, timeout=120):
    r = subprocess.run(['curl', '-sS', '-f', '-L', '--max-time', str(timeout), '-A', 'Mozilla/5.0 (X11; Linux x86_64)'] + (['-o', out] if out else []) + [url],
                       capture_output=True, text=out is None)
    return r.returncode == 0 and (r.stdout if out is None else True)


def lister(etiquette, page=1, maxi=6):
    """identifiants Mixkit (id, titre) d'une page d'étiquette."""
    h = _get(f'https://mixkit.co/free-stock-video/{etiquette}/' + (f'?page={page}' if page > 1 else ''))
    if not h: return []
    vus, out = set(), []
    for slug, i in re.findall(r'/free-stock-video/([a-z0-9-]+)-(\d+)/', h):
        if i not in vus: vus.add(i); out.append((i, slug.replace('-', ' ')))
    return out[:maxi]


def _images(fichier, fps_max=30, largeur=640):
    cap = cv2.VideoCapture(fichier); fps = cap.get(cv2.CAP_PROP_FPS) or 30.0; pas = max(1, int(round(fps / fps_max))); ims = []; i = 0
    while True:
        ok, im = cap.read()
        if not ok: break
        if i % pas == 0:
            k = largeur / im.shape[1]; ims.append(cv2.resize(im, None, fx=k, fy=k, interpolation=cv2.INTER_AREA))
        i += 1
    return ims, fps / pas


def mesure_flux(ims, grille=(48, 27)):
    """champ de mouvement image → image suivante (fractions de la largeur / hauteur), caméra séparée."""
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_FAST); g = [cv2.cvtColor(i, cv2.COLOR_BGR2GRAY) for i in ims]
    h, w = g[0].shape; out = np.zeros((len(g) - 1, grille[1], grille[0], 2), np.float32); cam = np.zeros((len(g) - 1, 2), np.float32)
    for t in range(len(g) - 1):
        f = dis.calc(g[t], g[t + 1], None); m = np.median(f.reshape(-1, 2), 0); cam[t] = m / [w, h]
        out[t] = cv2.resize(f - m, grille, interpolation=cv2.INTER_AREA) / np.array([w, h], np.float32)
    return {'champ': out, 'camera': cam}


def mesure_pose(ims):
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    det = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=f'{MODELES}/pose_landmarker_heavy.task'), running_mode=vision.RunningMode.VIDEO, num_poses=1))
    monde = np.full((len(ims), 33, 4), np.nan, np.float32); image = np.full((len(ims), 33, 3), np.nan, np.float32)
    for t, im in enumerate(ims):
        r = det.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(im, cv2.COLOR_BGR2RGB)), int(t * 1000 / 30))
        if r.pose_world_landmarks:
            monde[t] = [[p.x, p.y, p.z, p.visibility] for p in r.pose_world_landmarks[0]]
            image[t] = [[p.x, p.y, p.z] for p in r.pose_landmarks[0]]
    det.close()
    return {'monde': monde, 'image': image, 'vu': np.isfinite(monde[:, 0, 0])}


def mesure_visage(ims):
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    det = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=f'{MODELES}/face_landmarker.task'), running_mode=vision.RunningMode.VIDEO, num_faces=1,
        output_face_blendshapes=True, output_facial_transformation_matrixes=True))
    bs = np.full((len(ims), 52), np.nan, np.float32); tete = np.full((len(ims), 4, 4), np.nan, np.float32); noms = None
    for t, im in enumerate(ims):
        r = det.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(im, cv2.COLOR_BGR2RGB)), int(t * 1000 / 30))
        if r.face_blendshapes:
            bs[t] = [c.score for c in r.face_blendshapes[0]]; noms = noms or [c.category_name for c in r.face_blendshapes[0]]
            tete[t] = np.asarray(r.facial_transformation_matrixes[0], np.float32)
    det.close()
    return {'blendshapes': bs, 'tete': tete, 'noms': np.array(noms or []), 'vu': np.isfinite(bs[:, 0])}


def vu_par_jev(im, domaine, etiquette, titre):
    """JEV regarde l'image du milieu : la prise montre-t-elle bien ce qu'on cherche, en un seul plan exploitable ?"""
    import jev_api
    ids = {'image': f'image-{uuid.uuid4().hex[:8]}'}
    q = {'conforme': {'type': 'noul', 'instructions': f'`image` is a frame from a stock video titled "{titre}". Does it clearly show '
                      f'{etiquette.replace("-", " ")} ({domaine}) as the main moving subject, in a real (not animated) shot?'},
         'personne_entiere': {'type': 'noul', 'instructions': 'In `image`, is there one main person whose head, torso and arms are visible?'},
         'gros_plan_visage': {'type': 'noul', 'instructions': 'In `image`, is there a face large enough to see the eyes and mouth clearly?'}}
    a = jev_api.demande(ids, q, {ids['image']: {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(im)}}, outil='banque_reel')
    return {k: round(float(a[k]['noul']), 3) for k in q}


def collecter(etiquettes=None, maxi=4):
    os.makedirs(TMP, exist_ok=True); ip = os.path.join(BANQUE, 'index.json')
    index = json.load(open(ip)) if os.path.isfile(ip) else {}
    for dom, (mode, tags) in TAXO.items():
        for tag in tags:
            if etiquettes and tag not in etiquettes and dom not in etiquettes: continue
            for i, titre in lister(tag, maxi=maxi):
                cle = f'mixkit-{i}'
                if cle in index: continue
                f = os.path.join(TMP, f'{i}.mp4'); t0 = time.time()
                if not _get(f'https://assets.mixkit.co/videos/{i}/{i}-720.mp4', f, 240): index[cle] = {'rejet': 'téléchargement'}; continue
                try:
                    ims, fps = _images(f, 30 if mode != 'flux' else 15)
                    if len(ims) < 20: raise ValueError('trop court')
                    avis = vu_par_jev(ims[len(ims) // 2], dom, tag, titre)
                    if avis['conforme'] <= 0.5: index[cle] = {'rejet': 'JEV', 'avis': avis, 'titre': titre, 'etiquette': tag}; continue
                    m = mode
                    if mode == 'pose' and avis['personne_entiere'] <= 0.5: m = 'flux'
                    if mode == 'visage' and avis['gros_plan_visage'] <= 0.5: m = 'pose' if avis['personne_entiere'] > 0.5 else 'flux'
                    data = mesure_pose(ims) if m == 'pose' else mesure_visage(ims) if m == 'visage' else mesure_flux(ims)
                    if m == 'camera': data = mesure_flux(ims)
                    vu = float(np.mean(data['vu'])) if 'vu' in data else 1.0
                    if vu < 0.6: index[cle] = {'rejet': f'sujet visible {vu:.0%}', 'titre': titre, 'etiquette': tag}; continue
                    d = os.path.join(BANQUE, dom); os.makedirs(d, exist_ok=True)
                    np.savez_compressed(os.path.join(d, f'{cle}.npz'), fps=np.array(fps, np.float32), **data)
                    index[cle] = {'domaine': dom, 'etiquette': tag, 'titre': titre, 'mesure': m, 'images': len(ims), 'fps': round(fps, 2),
                                  'duree_s': round(len(ims) / fps, 1), 'vu': round(vu, 3), 'avis_jev': avis, 'source': f'https://mixkit.co/free-stock-video/{i}/',
                                  'licence': LICENCE, 'mesure_s': round(time.time() - t0, 1)}
                    print(f"{dom}/{tag} {cle} « {titre} » → {m}, {len(ims)} images, {time.time() - t0:.0f} s", flush=True)
                except Exception as e:
                    index[cle] = {'rejet': f'erreur {e}', 'titre': titre, 'etiquette': tag}
                finally:
                    if os.path.isfile(f): os.remove(f)
                    json.dump(index, open(ip, 'w'), ensure_ascii=False, indent=1)
    gardes = [v for v in index.values() if 'domaine' in v]
    print(f'banque : {len(gardes)} prises gardées ({len(index) - len(gardes)} rejetées) —',
          {d: sum(1 for v in gardes if v['domaine'] == d) for d in TAXO})


if __name__ == '__main__':
    collecter(sys.argv[1:] or None)
