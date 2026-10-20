# JUGE LOCAL DU VISAGE RENDU (19/10/2026, portes B et P sans JEV) — MediaPipe FaceLandmarker (Apache-2.0) lit l'IMAGE du film,
# jamais l'intention du moteur : écart des lèvres (rapporté à la hauteur du visage, front 10 → menton 152), hauteur des
# sourcils et ouverture des yeux (rapportées à l'écart des coins des yeux), comparés au dessin neutre de l'acteur.
# Étalonnage mesuré sur la v14 (22 répliques, gros plans de la bouche) : lèvres aux voyelles ouvertes 0,07–0,22 ; aux
# consonnes fermées (m, b, p) 0,0006–0,026 ; dessin neutre 0,004–0,034 — les deux familles ne se recouvrent pas.
import os
import numpy as np, cv2

OUVERTE_MIN = 0.05     # écart des lèvres / hauteur du visage : bouche ouverte sur une voyelle ouverte
FERMEE_MAX = 0.035     # bouche fermée (ou presque) sur m, b, p
_FL = []


def _fl():
    if not _FL:
        import mediapipe as mp
        from mediapipe.tasks.python import vision, BaseOptions
        m = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/face_landmarker.task'
        _FL.append((mp, vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=m), num_faces=1, min_face_detection_confidence=0.2,
            output_face_blendshapes=True, running_mode=vision.RunningMode.IMAGE))))
        import atexit
        atexit.register(_FL[0][1].close)   # fermé avant l'arrêt de l'interpréteur (sinon TypeError dans le destructeur MediaPipe)
    return _FL[0]


def mesure(im):
    """{'levres', 'sourcils', 'yeux', 'machoire'} d'une image BGR (gros plan d'un visage), ou None si aucun visage n'est vu."""
    if im is None: return None
    mp, fl = _fl()
    r = fl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(im, cv2.COLOR_BGR2RGB))))
    if not r.face_landmarks: return None
    P = np.array([[p.x * im.shape[1], p.y * im.shape[0]] for p in r.face_landmarks[0]])
    h = float(np.linalg.norm(P[10] - P[152])) + 1e-6
    # SOURCILS ET YEUX RAPPORTÉS À L'ÉCART DES COINS EXTERNES DES YEUX (33–263) (20/10/2026, porte P de l'épisode « cour-n1 ») :
    # rapportés à la hauteur front → menton, ils baissaient dès que la mâchoire tombe — précisément le choc jugé. Mesuré sur
    # les bibliothèques (surprise bouche ouverte contre neutre) : Coumba ×1,16 → ×1,31, Maman Nounou ×0,97 → ×1,16 ; Maître
    # Koné au choc de la v3 (mâchoire 0,52–0,58) : ×0,78. Les lèvres restent rapportées à la hauteur (étalonnage de la porte B).
    iod = float(np.linalg.norm(P[33] - P[263])) + 1e-6
    bs = {b.category_name: float(b.score) for b in r.face_blendshapes[0]} if r.face_blendshapes else {}
    return {'levres': round(float(np.linalg.norm(P[13] - P[14])) / h, 4),
            'sourcils': round(float(np.linalg.norm(P[105] - P[159]) + np.linalg.norm(P[334] - P[386])) / (2 * iod), 4),   # sourcil → paupière haute
            'yeux': round(float(np.linalg.norm(P[159] - P[145]) + np.linalg.norm(P[386] - P[374])) / (2 * iod), 4),       # ouverture des yeux
            'machoire': round(bs.get('jawOpen', 0.0), 3)}


def proba(marge, echelle):
    """marge > 0 : conforme ; probabilité logistique (0,5 exactement au seuil), comme une décision « noul »."""
    return round(float(1.0 / (1.0 + np.exp(-marge / echelle))), 3)


def p_ouverte(m):
    return 0.0 if m is None else proba(m['levres'] - OUVERTE_MIN, 0.008)


def p_fermee(m):
    return 0.0 if m is None else proba(FERMEE_MAX - m['levres'], 0.006)


def p_choc(m, neutre):
    """CHOC LISIBLE : bouche tombée ET (sourcils levés OU yeux écarquillés) par rapport au dessin neutre de l'acteur."""
    if m is None or neutre is None: return 0.0
    bouche = proba(m['levres'] - OUVERTE_MIN, 0.008)
    sourcils = proba(m['sourcils'] / max(neutre['sourcils'], 1e-4) - 1.12, 0.03)
    yeux = proba(m['yeux'] / max(neutre['yeux'], 1e-4) - 1.10, 0.03)
    return round(min(bouche, max(sourcils, yeux)), 3)
