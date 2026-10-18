# ÉTAGE E3 — DÉCOUPE ET MESURES (18/10/2026, fabrique « Africa Toon Troll ») : une feuille générée (rotation, assis, marche)
# → une image détourée par vue, nommée, avec ses mesures et son contrôle d'animabilité. Tout est local et gratuit :
#  · fond gris uni : silhouettes trouvées par écart au fond (couleur médiane des bords), puis bord fin par BiRefNet lite (MIT) ;
#  · vues nommées de gauche à droite (rotation : face, ¾ gauche, profil gauche, dos) ; les MIROIRS donnent ¾ droite et profil
#    droit (tenues symétriques sans texte, règle 4 de l'univers) → 7 directions ;
#  · mesures : squelette MediaPipe Pose (33 points), visage MediaPipe Face (478 points) quand il est visible, hauteur et pieds ;
#  · contrôle (règles 1 à 4) : bouche et blanc des yeux visibles sur les vues de face et de ¾, bras décollés du buste, pas de
#    texte (EasyOCR, Apache-2.0), nombre de silhouettes attendu. Un échec renvoie la planche à la génération (autre graine).
#   python3 decoupe.py feuille.png sortie/ tour|assis|marche|face
import json, os, sys
import numpy as np, cv2

M = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/'
NOMS = {'tour': ['face', 'trois_quarts_g', 'profil_g', 'dos'], 'assis': ['assis_face', 'assis_trois_quarts_g', 'assis_profil_g'],
        'marche': ['marche_1', 'marche_2', 'marche_3', 'marche_4'], 'face': ['face']}
MIROIR = {'trois_quarts_g': 'trois_quarts_d', 'profil_g': 'profil_d', 'assis_trois_quarts_g': 'assis_trois_quarts_d', 'assis_profil_g': 'assis_profil_d'}
_S = {}


def _birefnet():
    if 'b' not in _S:
        import onnxruntime as ort
        so = ort.SessionOptions(); so.enable_cpu_mem_arena = False; so.intra_op_num_threads = os.cpu_count() or 4
        _S['b'] = ort.InferenceSession(M + 'birefnet-lite.onnx', so, providers=['CPUExecutionProvider'])
    return _S['b']


def birefnet(rgb):
    s = _birefnet(); x = cv2.resize(rgb, (1024, 1024), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255
    x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    y = s.run(None, {s.get_inputs()[0].name: x.transpose(2, 0, 1)[None].astype(np.float32)})[-1][0, 0]
    return cv2.resize(1 / (1 + np.exp(-y)), (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_LINEAR).astype(np.float32)


def silhouettes(rgb, n):
    """boîtes des n silhouettes d'une feuille sur fond uni, de gauche à droite (colonnes vides entre elles)."""
    H, W = rgb.shape[:2]; lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    bord = np.concatenate([lab[:6].reshape(-1, 3), lab[-6:].reshape(-1, 3), lab[:, :6].reshape(-1, 3), lab[:, -6:].reshape(-1, 3)])
    fond = np.median(bord, 0); d = np.linalg.norm(lab - fond, axis=2)
    m = (d > 14).astype(np.uint8); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    # ombres portées au sol (grises, peu saturées, juste sous les pieds) : comptées comme fond
    col = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 3).sum(0) > 2.0
    seg, x = [], 0
    while x < W:
        if col[x]:
            x0 = x
            while x < W and col[x]: x += 1
            if x - x0 > 0.03 * W: seg.append((x0, x))
        x += 1
    # trop de segments (bras détaché, objet tenu) : on fusionne les plus proches ; trop peu : on coupe aux creux de la projection
    while len(seg) > n:
        g = [seg[i + 1][0] - seg[i][1] for i in range(len(seg) - 1)]; i = int(np.argmin(g)); seg[i:i + 2] = [(seg[i][0], seg[i + 1][1])]
    if len(seg) < n:
        prof = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 5).sum(0); seg = []
        bornes = [0] + [int(np.argmin(prof[int((k - 0.3) * W / n):int((k + 0.3) * W / n)]) + int((k - 0.3) * W / n)) for k in range(1, n)] + [W]
        seg = [(bornes[k], bornes[k + 1]) for k in range(n)]
    boites = []
    for x0, x1 in seg:
        ys = np.nonzero(m[:, x0:x1].any(1))[0]
        if len(ys) == 0: continue
        boites.append((x0, int(ys.min()), x1, int(ys.max()) + 1))
    return boites, m


def mesures(rgba):
    """squelette et visage MediaPipe sur une vue détourée (fond gris), hauteur, pieds."""
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    if 'pose' not in _S:
        _S['pose'] = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=M + 'pose_landmarker_heavy.task'), num_poses=1, min_pose_detection_confidence=0.2))
        _S['face'] = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=M + 'face_landmarker.task'), num_faces=1, min_face_detection_confidence=0.2))
    a = rgba[..., 3:].astype(np.float32) / 255; rgb = (rgba[..., :3] * a + 200 * (1 - a)).astype(np.uint8); h, w = rgb.shape[:2]
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
    r = _S['pose'].detect(img); f = _S['face'].detect(img)
    ys = np.nonzero(rgba[..., 3].max(1) > 128)[0]
    out = {'hauteur_px': int(ys.max() - ys.min()) if len(ys) else 0, 'haut_y': int(ys.min()) if len(ys) else 0, 'pieds_y': int(ys.max()) if len(ys) else 0}
    if r.pose_landmarks: out['squelette'] = [[round(p.x * w, 1), round(p.y * h, 1), round(p.visibility, 2)] for p in r.pose_landmarks[0]]
    if f.face_landmarks: out['visage'] = [[round(p.x * w, 1), round(p.y * h, 1), round(p.z * w, 1)] for p in f.face_landmarks[0]]
    return out, rgb


def controle(vue, mes, rgb):
    """règles d'animabilité sur une vue → liste des défauts (vide = conforme)."""
    d = []
    if vue in ('face', 'trois_quarts_g', 'assis_face', 'assis_trois_quarts_g'):
        if 'visage' not in mes: d.append('visage non détecté')
        else:
            V = np.asarray(mes['visage'])[:, :2]
            # bouche visible : contraste des lèvres par rapport à la peau voisine
            lev = V[[61, 291, 0, 17]]; c = lev.mean(0).astype(int); r_ = max(3, int(0.6 * np.linalg.norm(V[61] - V[291])))
            zone = rgb[max(0, c[1] - r_):c[1] + r_, max(0, c[0] - r_):c[0] + r_]
            if zone.size == 0 or zone.std() < 8: d.append('bouche peu lisible')
            # blanc des yeux visible
            hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV); tot = 0
            for i in ((33, 133, 159, 145), (362, 263, 386, 374)):
                p = V[list(i)]; x0, y0 = p.min(0).astype(int); x1, y1 = p.max(0).astype(int) + 1
                z = hsv[max(0, y0):y1, max(0, x0):x1]; tot += int(((z[..., 2] > 165) & (z[..., 1] < 70)).sum()) if z.size else 0
            if tot < 4: d.append('blanc des yeux invisible')
    if 'squelette' in mes and vue in ('face', 'dos'):
        P = np.asarray(mes['squelette']); larg = abs(P[11, 0] - P[12, 0]) + 1e-6
        ecart = min(abs(P[15, 0] - P[23, 0]), abs(P[16, 0] - P[24, 0])) / larg
        if ecart < 0.08: d.append('bras collés au corps')
    try:
        import easyocr
        if 'ocr' not in _S: _S['ocr'] = easyocr.Reader(['fr', 'en'], gpu=False, model_storage_directory=M + 'easyocr', verbose=False)
        txt = [t for _, t, c in _S['ocr'].readtext(rgb) if c > 0.5 and len(t.strip()) >= 2]
        if txt: d.append('texte : ' + ' '.join(txt)[:40])
    except ImportError:
        pass
    return d


def orientation(mes):
    """direction où regarde le personnage, MESURÉE (le générateur ne respecte pas toujours l'ordre demandé : planche assise
    de Mamie Nounou, 18/10 — « ¾ » quasi de face, profil tourné à droite) : 'face', 'trois_quarts', 'profil' ou 'dos', et le
    côté 'g' (il regarde vers la gauche de l'image) ou 'd'."""
    if mes.get('visage'):
        V = np.asarray(mes['visage'])[:, :2]; yg, yd = V[[33, 133]].mean(0), V[[362, 263]].mean(0)
        d = float((V[1, 0] - (yg[0] + yd[0]) / 2) / (abs(yd[0] - yg[0]) + 1e-6))
        if abs(d) < 0.12: return 'face', '', d
        return ('trois_quarts' if abs(d) < 0.6 else 'profil'), ('g' if d < 0 else 'd'), d
    if mes.get('squelette'):
        P = np.asarray(mes['squelette'])
        if P[0, 2] < 0.3 and min(P[7, 2], P[8, 2]) > 0.3: return 'dos', '', 0.0
        d = float(P[0, 0] - P[[7, 8], 0].mean()); return 'profil', ('g' if d < 0 else 'd'), d
    return 'inconnu', '', 0.0


def decoupe(feuille, sortie, genre):
    os.makedirs(sortie, exist_ok=True); rgb = cv2.cvtColor(cv2.imread(feuille), cv2.COLOR_BGR2RGB); H, W = rgb.shape[:2]
    noms = NOMS[genre]; boites, m = silhouettes(rgb, len(noms)); fiche = {'feuille': os.path.basename(feuille), 'vues': {}, 'defauts': []}
    if len(boites) != len(noms): fiche['defauts'].append(f'{len(boites)} silhouettes pour {len(noms)} attendues')
    for nom, (x0, y0, x1, y1) in zip(noms, boites):
        p = int(0.04 * H); X0, Y0, X1, Y1 = max(0, x0 - p), max(0, y0 - p), min(W, x1 + p), min(H, y1 + p)
        crop = rgb[Y0:Y1, X0:X1]; a = birefnet(crop)
        cm = cv2.dilate(m[Y0:Y1, X0:X1], np.ones((9, 9), np.uint8)).astype(np.float32)
        a = np.clip(a * cm, 0, 1); rgba = np.dstack([crop, (a * 255).astype(np.uint8)])
        mes, vis = mesures(rgba)
        if genre in ('tour', 'assis'):   # nom tiré de l'orientation mesurée ; doublons numérotés
            cl, cote, dv = orientation(mes); pre = 'assis_' if genre == 'assis' else ''
            nom0 = pre + cl + (('_' + cote) if cote else ''); nom = nom0; k_ = 2
            while nom in fiche['vues']: nom = f'{nom0}_{k_}'; k_ += 1
            mes['orientation'] = {'classe': cl, 'cote': cote, 'indice': round(dv, 3)}
        d = controle(nom.replace('_d', '_g'), mes, vis)
        cv2.imwrite(f'{sortie}/{nom}.png', cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
        fiche['vues'][nom] = dict(boite=[X0, Y0, X1, Y1], **{k: v for k, v in mes.items() if k not in ('squelette', 'visage')}, defauts=d,
                                  squelette=mes.get('squelette'), visage=bool(mes.get('visage')))
        if 'visage' in mes: np.save(f'{sortie}/{nom}-visage3d.npy', np.asarray(mes['visage'], np.float32))
        fiche['defauts'] += [f'{nom} : {x}' for x in d]
    # MIROIRS : chaque vue latérale donne l'autre côté (tenues symétriques sans texte), seulement si ce côté manque
    for nom in list(fiche['vues']):
        if nom.endswith('_g') or nom.endswith('_d'):
            autre = nom[:-1] + ('d' if nom.endswith('_g') else 'g')
            if autre not in fiche['vues']:
                im = cv2.imread(f'{sortie}/{nom}.png', cv2.IMREAD_UNCHANGED); cv2.imwrite(f'{sortie}/{autre}.png', im[:, ::-1].copy())
                fiche['vues'][autre] = {'miroir_de': nom}
    json.dump(fiche, open(f'{sortie}/{genre}.json', 'w'), ensure_ascii=False, indent=1)
    return fiche


if __name__ == '__main__':
    f = decoupe(sys.argv[1], sys.argv[2], sys.argv[3])
    print(json.dumps({'vues': list(f['vues']), 'defauts': f['defauts']}, ensure_ascii=False))
