# NIVEAU DE LA V1 (20/10/2026) — consignes de l'utilisateur : « en termes d'animation la V1 est très loin devant » ; « je ne peux pas
# publier cette vidéo qui n'est pas du niveau de la V1 » ; « même le type de personnage ne ressemble pas à la V1 ».
# Le juge (9 portes) avait laissé passer la vidéo 2 : il ne compare rien à la V1. Ce contrôle le fait, sans tolérance :
#   1. ANIMATION : part de l'image qui bouge (flux optique Farneback d'OpenCV, BSD, sur la bande image sans titres ni sous-titres),
#      moyenne et 9e décile, au moins celles de la V1 publiée (mesurées le 20/10/2026 : 24,3 % et 66,4 % ; vidéo 2 : 20,4 % et 45,8 %) ;
#   2. TROUPE : seuls les 7 personnages de la V1 ont un rendu validé (dessinés dans leurs décors, marionnettes peintes). Tout autre
#      personnage n'est admis qu'une fois son rendu validé par l'utilisateur (VALIDES, rempli à sa validation) : la vidéo 2 collait
#      des figures de galerie sur le décor (échelle, sol, poses de fiche, style différent).
import cv2, numpy as np

REF = {'surface': 0.243, 'p90': 0.664}
TROUPE_V1 = {'KOFFI', 'COUMBA', 'BAYE NDIAYE', 'MAMAN NOUNOU', 'PETIT MAMADOU', 'TANTIE AWA', 'MODOU'}
VALIDES = set()   # personnages dont le rendu a été validé au niveau de la V1 (images montrées à l'utilisateur)


def mesure(video, pas=3):
    c = cv2.VideoCapture(video); prev = None; fl = []; i = 0
    while True:
        ok, f = c.read()
        if not ok: break
        h, w = f.shape[:2]; z = f[int(h * 0.27):int(h * 0.62), :]
        g = cv2.cvtColor(cv2.resize(z, (180, int(180 * z.shape[0] / z.shape[1]))), cv2.COLOR_BGR2GRAY)
        if prev is not None and np.abs(g.astype(np.int16) - prev.astype(np.int16)).mean() < 25 and i % pas == 0:   # hors coupes
            m = np.linalg.norm(cv2.calcOpticalFlowFarneback(prev, g, None, 0.5, 3, 15, 3, 5, 1.2, 0), axis=2)
            fl.append(float((m > 0.3).mean()))
        prev = g; i += 1
    fl = np.array(fl or [0.0])
    return {'surface': round(float(fl.mean()), 3), 'p90': round(float(np.percentile(fl, 90)), 3)}


def motifs(video, acteurs):
    """liste vide = au niveau de la V1 ; sinon, les raisons (la vidéo part en « à corriger », jamais supprimée)."""
    m = mesure(video); out = []
    if m['surface'] < REF['surface'] or m['p90'] < REF['p90']:
        out.append(f"animation sous la V1 : surface en mouvement {m['surface']:.1%} (V1 {REF['surface']:.1%}), 9e décile {m['p90']:.1%} (V1 {REF['p90']:.1%})")
    hors = sorted(set(acteurs) - TROUPE_V1 - VALIDES)
    if hors: out.append(f"personnages au rendu pas encore validé au niveau de la V1 : {', '.join(hors)}")
    return out, m


# ── PROFIL COMPLET CONTRE LA V1 (21/10/2026) — consignes de l'utilisateur : « la V1 publiée sur TikTok est plus fluide, les personnages
# sont plus animés, les mouvements plus fluides, les personnages se regardent, […] la V1 anime bien les arrière-plans » ; « toutes les
# vidéos devront avoir ou dépasser les mesures de la V1. Même l'humour. » La V1 = l'épisode publié sur son TikTok le 20/10/2026
# (troupe2/ep01/v17/film.mp4, 3 sketchs). Chaque critère est une MESURE sur les pixels, la même pour la V1 et pour chaque vidéo :
#   personnages : part du corps qui bouge et vitesse du jeu (flux optique DIS d'OpenCV, BSD, caméra retirée par la médiane), sur
#                 les personnes découpées par le segmenteur MediaPipe selfie_multiclass (Apache-2.0, déjà en cache) ;
#   taille      : part de la scène occupée par les personnages (plan rapproché ou plan large) ;
#   arrière-plan: part du décor qui bouge (hors personnages) ;
#   regards     : têtes découpées, agrandies, lacet du visage par FaceLandmarker (Apache-2.0) — le personnage de gauche tourné vers la
#                 droite et celui de droite vers la gauche (vérifié sur la V1 : Coumba, à droite, regarde Koffi à −52°) ;
#   fluidité    : à-coups (le mouvement du corps repart en sens inverse d'une image à l'autre : boucle aller-retour) et sautes (ce que
#                 le flux n'explique pas bondit au-dessus de 3 fois sa médiane : dessin qui « pope ») par minute — moins = mieux ;
#   montage     : plans par minute, coupes trouvées par PySceneDetect 0.7.2 (BSD-3, ContentDetector, réglages d'origine) ;
#   humour      : pas une mesure de pixels — chaque sketch doit battre ou égaler la V1 au duel du juge (plancher V17 ≥ 0,5).
# Aucune tolérance : chaque critère au moins égal à la V1 (au plus, pour les à-coups et les sautes). Une vidéo sous la V1 va « à
# corriger » avec la liste des écarts, jamais supprimée.
#   python3 niveau_v1.py profil VIDEO.mp4 [y0:y1] → profil JSON      python3 niveau_v1.py compare VIDEO.mp4 [y0:y1] → écarts à la V1
import json as _json, os as _os
_ICI = _os.path.dirname(_os.path.abspath(__file__))
BANDE_V1 = (282 / 1024, 742 / 1024)     # bande image du format V1 (titre au-dessus, mots en dessous ; jev_regard.CLIP)
REF_PROFIL = _os.path.join(_ICI, 'niveau_v1_ref.json')
PLUS = ('persos_bouge', 'persos_vitesse', 'taille_persos', 'fond_bouge', 'regards', 'plans_min')
MOINS = ('acoups_min', 'sautes_min')
TEINT = ('teint_L', 'teint_b')   # pas « mieux » : dans la gamme de la V1 (pas plus clair, pas plus orangé)
NOMS = {'persos_bouge': 'part du corps des personnages qui bouge', 'persos_vitesse': 'vitesse du jeu (px/s)',
        'taille_persos': 'place des personnages dans la scène', 'fond_bouge': "part de l'arrière-plan qui bouge",
        'regards': 'personnages qui se regardent', 'plans_min': 'plans par minute',
        'acoups_min': 'à-coups par minute (aller-retour)', 'sautes_min': 'sautes par minute', 'humour': 'humour (duel contre la V1)',
        'teint_L': 'clarté de la peau du personnage le plus clair (L*)', 'teint_b': 'teinte orangée de la peau (b*)'}


def _outils():
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    C = _os.path.expanduser(_os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/'
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=C + 'selfie_multiclass_256x256.tflite'), output_category_mask=True))
    fl = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=C + 'face_landmarker.task'), num_faces=1, output_facial_transformation_matrixes=True,
        min_face_detection_confidence=0.3))
    return mp, seg, fl


def _lacet(mp, fl, img):
    r = fl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))))
    if not r.facial_transformation_matrixes: return None
    R = np.array(r.facial_transformation_matrixes[0])[:3, :3]; return float(np.degrees(np.arctan2(R[0, 2], R[2, 2])))


def teint(img, m=None, seg=None, mp=None):
    """peau de chaque personnage de l'image (classes peau du corps et du visage du segmenteur) → [(L*, b*)] médians (CIELAB).
    21/10/2026, consigne : « même le teint des personnages, nous sommes en Afrique de l'Ouest » — V1 : L* ≈ 32, b* ≈ 24 ;
    usine (« L'autre moitié ») : L* 50 à 54, b* 48 à 55 (peau plus claire et orangée)."""
    if m is None:
        r = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))))
        m = np.squeeze(r.category_mask.numpy_view())
    m = cv2.resize(m, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST) if m.shape[:2] != img.shape[:2] else m
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32); n, cc, st, _ = cv2.connectedComponentsWithStats((m > 0).astype(np.uint8))
    out = []
    for j in range(1, n):
        if st[j, 4] < 0.02 * m.size: continue
        peau = (cc == j) & ((m == 2) | (m == 3))
        if peau.sum() < 150: continue
        out.append((float(np.median(lab[..., 0][peau]) * 100 / 255), float(np.median(lab[..., 2][peau]) - 128)))
    return out


def profil(video, bande=None, cadence=15):
    """mesures de la vidéo, dans la bande image (fractions de la hauteur) ; mêmes unités pour toutes les vidéos."""
    mp, seg, fl = _outils(); y0, y1 = bande or BANDE_V1
    c = cv2.VideoCapture(video); fps = c.get(cv2.CAP_PROP_FPS) or 30; pas = max(1, int(round(fps / cadence))); fe = fps / pas
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    prev = masque = None; i = k = 0; pb, pv, ta, fb, resid, peaux = [], [], [], [], [], []; vprec = None; acoups = 0; reg = [0, 0]
    while True:
        ok, f = c.read()
        if not ok: break
        i += 1
        if (i - 1) % pas: continue
        H = f.shape[0]; b = f[int(H * y0):int(H * y1)]; k += 1
        g = cv2.cvtColor(cv2.resize(b, (288, int(288 * b.shape[0] / b.shape[1])), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        if masque is None or k % 3 == 0:   # personnes découpées 5 fois par seconde
            m = np.squeeze(seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB,
                                                data=np.ascontiguousarray(cv2.cvtColor(b, cv2.COLOR_BGR2RGB)))).category_mask.numpy_view())
            masque = cv2.resize((m > 0).astype(np.uint8), (g.shape[1], g.shape[0]), interpolation=cv2.INTER_NEAREST).astype(bool)
            peaux.extend(teint(b, m))
            if k % int(cadence) == 0:     # regards, une fois par seconde : les deux personnages des bords, tête agrandie
                n, lab, st, _ = cv2.connectedComponentsWithStats((m > 0).astype(np.uint8))
                gros = sorted([s for s in st[1:] if s[4] > 0.02 * m.size], key=lambda s: s[0])
                if len(gros) >= 2:
                    sx, sy = b.shape[1] / m.shape[1], b.shape[0] / m.shape[0]; L = []
                    for s in (gros[0], gros[-1]):
                        x, y, w, h = s[0] * sx, s[1] * sy, s[2] * sx, s[3] * sy
                        t = b[int(max(0, y - 0.05 * h)):int(y + 0.35 * h), int(max(0, x - 0.1 * w)):int(x + 1.1 * w)]
                        L.append(_lacet(mp, fl, cv2.resize(t, (384, int(384 * t.shape[0] / max(1, t.shape[1]))))) if t.size else None)
                    if None not in L:
                        reg[1] += 1; reg[0] += int(L[0] > 8 and L[1] < -8)
        ta.append(float(masque.mean()))
        if prev is not None and np.abs(g.astype(np.int16) - prev.astype(np.int16)).mean() < 25:   # hors coupes
            flo = dis.calc(prev, g, None); md = np.median(flo.reshape(-1, 2), 0); r = flo - md; a = np.hypot(r[..., 0], r[..., 1]) * fe
            if masque.any():
                pb.append(float((a[masque] > 9).mean())); pv.append(float(np.median(a[masque])))
                v = r[masque].mean(0) * fe
                if vprec is not None and np.hypot(*v) > 3 and np.hypot(*vprec) > 3 and np.dot(v, vprec) / (np.hypot(*v) * np.hypot(*vprec)) < -0.5:
                    acoups += 1
                vprec = v
            if (~masque).any(): fb.append(float((a[~masque] > 9).mean()))
            M = np.dstack(np.meshgrid(np.arange(g.shape[1]), np.arange(g.shape[0]))).astype(np.float32) - flo
            w = cv2.remap(prev, M[..., 0], M[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            resid.append(float(np.abs(w.astype(np.float32) - g.astype(np.float32)).mean()))
        else:
            vprec = None
        prev = g
    duree = i / fps; mn = max(duree / 60, 1e-9)
    rs = np.array(resid or [0.0]); med = np.array([np.median(rs[max(0, j - 15):j + 1]) for j in range(len(rs))])
    sautes = int(((rs > 3 * np.maximum(med, 0.5)) & (rs > 2)).sum())
    try:   # PySceneDetect 0.7.2 (BSD-3), réglages d'origine, sur la BANDE de la scène (21/10/2026 : sur l'image entière, le
        # fond flou et les sous-titres, identiques d'un plan à l'autre, noyaient les coupes de la scène — 0 coupe vue sur
        # 4 réelles dans « L'autre moitié » ; la V1 est remesurée de la même façon)
        import subprocess, tempfile
        from scenedetect import detect, ContentDetector
        with tempfile.TemporaryDirectory() as d_:
            b_ = _os.path.join(d_, 'bande.mp4'); h0 = f'trunc(ih*{y0:.6f}/2)*2'; hh = f'trunc(ih*{y1 - y0:.6f}/2)*2'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-an', '-vf', f'crop=iw:{hh}:0:{h0},scale=480:-2',
                            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', b_], check=True)
            plans = max(1, len(detect(b_, ContentDetector())))
    except Exception:
        plans = None
    moy = lambda x: round(float(np.mean(x)), 3) if x else 0.0
    return {'duree_s': round(duree, 1), 'persos_bouge': moy(pb), 'persos_vitesse': round(float(np.median(pv)), 1) if pv else 0.0,
            'taille_persos': moy(ta), 'fond_bouge': moy(fb), 'regards': round(reg[0] / reg[1], 3) if reg[1] else 0.0,
            'regards_images': reg[1], 'acoups_min': round(acoups / mn, 1), 'sautes_min': round(sautes / mn, 1),
            'plans_min': round(plans / mn, 1) if plans else None,
            # teint : 9e décile des personnages-images (le plus clair compte, pas la moyenne)
            'teint_L': round(float(np.percentile([x[0] for x in peaux], 90)), 1) if peaux else None,
            'teint_b': round(float(np.percentile([x[1] for x in peaux], 90)), 1) if peaux else None}


def reference():
    return _json.load(open(REF_PROFIL, encoding='utf-8'))


def ecarts(p, ref=None, humour=None):
    """critères où la vidéo NE DÉPASSE PAS la V1 (vide = elle la dépasse partout). Consignes du 21/10/2026 : « toutes les vidéos
    devront avoir ou dépasser les mesures de la V1. Même l'humour », puis « tes nouvelles vidéos devront même dépasser V1 » :
    strictement plus (personnages, taille, décor, regards, plans), strictement moins (à-coups, sautes), teint dans la gamme de la V1
    (pas plus clair ni plus orangé que son personnage le plus clair), humour : duel contre la V1 strictement au-dessus de 0,5."""
    ref = ref or reference(); out = []
    for k in PLUS:
        if p.get(k) is None or p[k] <= ref[k]: out.append(f"{NOMS[k]} : {p.get(k)} (V1 {ref[k]}, à dépasser)")
    for k in MOINS:
        if p.get(k) is None or p[k] >= ref[k]: out.append(f"{NOMS[k]} : {p.get(k)} (V1 {ref[k]}, à faire descendre en dessous)")
    for k in TEINT:
        if p.get(k) is None or p[k] > ref[k]: out.append(f"{NOMS[k]} : {p.get(k)} (V1 {ref[k]} au plus, Afrique de l'Ouest)")
    if humour is None or humour <= 0.5: out.append(f"{NOMS['humour']} : {humour if humour is not None else 'non jugé'} (au-dessus de 0,5)")
    return out


def regressions(nouveau, ancien):
    """21/10/2026, consigne : « les améliorer sans régression » — critères où la nouvelle version recule par rapport à la précédente
    (moins de mouvement, de place, de décor vivant, de regards, de plans ; plus d'à-coups, de sautes ; peau plus claire ou plus
    orangée). Liste vide = aucune régression."""
    out = []
    for k in PLUS:
        if ancien.get(k) is not None and (nouveau.get(k) is None or nouveau[k] < ancien[k]): out.append(f"{NOMS[k]} : {nouveau.get(k)} (avant {ancien[k]})")
    for k in MOINS + TEINT:
        if ancien.get(k) is not None and (nouveau.get(k) is None or nouveau[k] > ancien[k]): out.append(f"{NOMS[k]} : {nouveau.get(k)} (avant {ancien[k]})")
    return out

if __name__ == '__main__':
    import sys
    a = sys.argv[1:]; bd = tuple(float(x) for x in a[2].split(':')) if len(a) > 2 else None
    if a[0] == 'profil': print(_json.dumps(profil(a[1], bd), ensure_ascii=False))
    elif a[0] == 'reference':
        p = profil(a[1], bd); p['video'] = 'troupe2/ep01/v17/film.mp4 (publiée sur TikTok le 20/10/2026)'
        _json.dump(p, open(REF_PROFIL, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); print(_json.dumps(p, ensure_ascii=False))
    elif a[0] == 'compare':
        p = profil(a[1], bd); print(_json.dumps({'profil': p, 'sous_la_V1': ecarts(p)}, ensure_ascii=False, indent=1))
