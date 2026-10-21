# TÊTES TOURNÉES VERS LE PARTENAIRE, POUR TOUTE LA BANQUE (21/10/2026) — « les personnages se regardent » (V1 : 85 % des images
# où les deux personnages des bords se font face ; vidéos de la banque : 0 %, visages de face, seulement retournés en miroir).
# Même technique que la V1 (moteur-troupe/expressions_lp.lacets, 18/10/2026) : une fois par PERSONNAGE, sa tête neutre (1re image
# de son clip « écouter ») est rendue tournée par LivePortrait (KwaiVGI, MIT, ONNX déjà en cache) ; le flux du rendu tourné vers
# le neutre, lissé en polynôme (expressions_lp._lisse_flux), devient un champ de rotation de la tête. Ce champ est ensuite
# appliqué à CHAQUE image de CHAQUE clip du personnage, sur la boîte de son visage suivie image par image (MediaPipe
# FaceLandmarker, Apache-2.0), pondéré par la tête entière (expressions_lp.poids_tete) ; la découpe (alpha) suit.
# Le geste reste celui de la banque : seule la tête se tourne vers celui à qui il parle.
#   champ(perso, mov_ecouter) → {'t', 'F', 'w'} (cache <banque>/<perso>.lacet.npz) ; tourne(F_rgba, mov, champ, sens) → images
import json, os, sys
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(ICI, '..', 'moteur-troupe'))
ANGLE = float(os.environ.get('LACET_BANQUE', '20'))   # degrés vers le partenaire (la V1 tourne de 12 à 24°)
# GAIN mesuré le 21/10/2026 (lacet lu par FaceLandmarker comme niveau_v1) : à 20° rendus, Le Frimeur 0,4 → 6,6°, Tata Prisca
# −0,2 → 6,7° — sous le seuil des regards (8°) ; rendre 30 ou 38° n'aide pas (le flux du rendu se brouille : 5,5° et 4,4°) ;
# le champ lissé de 20° amplifié ×1,6 : 8,8 à 13,1° et 9,9 à 13,4°, tête entière tournée, coiffure intacte (×2,2 tord l'afro)
GAIN = float(os.environ.get('LACET_GAIN', '1.6'))
T = 128                                               # grille du champ (carré du visage)
VERSION = 3   # 2 : orientation déjà dessinée gardée (gain) ; 3 : un champ par côté (le champ retourné ne tournait vers la gauche que de 5°)


def _fl():
    import visage_mesure
    return visage_mesure._fl()


def reperes(rgb, haut=0.45, k=2.5):
    """478 repères du visage (pixels de l'image), lus sur le haut de l'image agrandi ; None si aucun visage."""
    mp, fl = _fl(); h = int(rgb.shape[0] * haut)
    g = cv2.resize(rgb[:h], None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
    r = fl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(g)))
    if not r.face_landmarks: return None
    return np.array([[p.x * g.shape[1] / k, p.y * g.shape[0] / k, p.z * g.shape[1] / k] for p in r.face_landmarks[0]], np.float32)


def _sur_gris(f):
    a = f[..., 3:4] / 255.0; return np.clip(f[..., :3] * a + 128 * (1 - a), 0, 255).astype(np.uint8)


def _poids():
    import expressions_lp as E
    m = np.zeros((T, T), np.float32); cv2.ellipse(m, (T // 2, int(0.56 * T)), (int(0.27 * T), int(0.34 * T)), 0, 0, 360, 1.0, -1)
    m = cv2.GaussianBlur(m, (0, 0), 3); return m, E.poids_tete({'taille': T, 'masque': m})


def lacet_peint(v3):
    """orientation déjà dessinée du visage (degrés, + : vers la droite de l'image), nez entre les coins des yeux (tourne.py)."""
    r = (v3[1, 0] - v3[33, 0]) / max(1e-3, v3[263, 0] - v3[33, 0]); return float(np.degrees(np.arctan(1.8 * (r - 0.5))))


def gain(C, sens=1.0):
    """un visage déjà dessiné de trois quarts du côté voulu est peu tourné en plus (V1 : « lacet au plus 6° pour les visages de
    trois quarts », sinon le menton s'étire) ; un visage de face ou tourné de l'autre côté reçoit le gain plein."""
    lp = float(C.get('peint', 0.0)) * (1 if sens >= 0 else -1) if C else 0.0
    return GAIN if lp < 6 else max(0.3, GAIN * (1 - (lp - 6) / 14))


def champ(perso, mov, F0=None):
    """champ de rotation de la tête du personnage (+ANGLE : vers la droite de l'image), en cache à côté de ses clips."""
    f = os.path.join(os.path.dirname(mov), f'{perso}.lacet.npz'); cle = json.dumps([VERSION, ANGLE, T, os.path.basename(mov)])
    if os.path.isfile(f):
        z = np.load(f)
        if str(z['cle']) == cle: return {'F': z['F'].astype(np.float32), 'Fg': z['Fg'].astype(np.float32), 'w': z['w'].astype(np.float32), 'peint': float(z['peint'])}
    import lp_onnx as LP, expressions_lp as E
    if F0 is None:
        raw = __import__('subprocess').run(['ffmpeg', '-v', 'error', '-i', mov, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
                                           capture_output=True, check=True).stdout
        F0 = np.frombuffer(raw, np.uint8).reshape(640, 384, 4).astype(np.float32)
    rgb = _sur_gris(F0); v3 = reperes(rgb)
    if v3 is None: return None
    src = LP.Source(rgb, v3); dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    rend = lambda a: E._gris(cv2.resize(src.rendu(E._commande({}, 0), dpose=(0.0, a, 0.0)), (T, T), interpolation=cv2.INTER_AREA))
    m, w = _poids(); n0 = rend(0.0); mm = m > 0.5
    essai = dis.calc(rend(-12.0), n0, None); signe = -1.0 if float(essai[..., 0][mm].mean()) < 0 else 1.0   # sens mesuré (expressions_lp.lacets)
    F = E._lisse_flux(dis.calc(rend(signe * ANGLE), n0, None), w); Fg = E._lisse_flux(dis.calc(rend(-signe * ANGLE), n0, None), w)
    lp = lacet_peint(v3)
    tmp = f'{f}.{os.getpid()}.npz'   # écriture atomique : les répliques sont rendues en parallèle
    np.savez_compressed(tmp, cle=np.array(cle), F=F.astype(np.float16), Fg=Fg.astype(np.float16), w=w.astype(np.float16), peint=np.array(lp))
    os.replace(tmp, f)
    return {'F': F, 'Fg': Fg, 'w': w, 'peint': lp}


def clip_ecoute(mov):
    """le clip « écouter » du personnage (version la plus haute), source de son champ ; à défaut le clip lui-même."""
    import glob
    perso = os.path.basename(mov).split('--')[0]
    c = sorted(glob.glob(os.path.join(os.path.dirname(mov), f'{perso}--ecouter*.mov')),
               key=lambda x: int(x.rsplit('@', 1)[1][:-4]) if '@' in os.path.basename(x) else 1)
    return perso, (c[-1] if c else mov)


def boites(mov, F):
    """boîte (x, y, s) du visage à chaque image du clip, lissée dans le temps (cache <clip>.visage.json)."""
    import lp_onnx as LP
    f = mov[:-4] + '.visage.json'
    if os.path.isfile(f):
        b = json.load(open(f))
        if len(b) == len(F): return np.array(b, np.float32)
    B = []
    for im in F:
        v3 = reperes(_sur_gris(im)); B.append(LP.recadre(None, v3) if v3 is not None else (np.nan, np.nan, np.nan))
    B = np.array(B, np.float64)
    if np.isnan(B[:, 0]).all(): return None
    i = np.arange(len(B))
    for k in range(3): ok = ~np.isnan(B[:, k]); B[:, k] = np.interp(i, i[ok], B[ok, k])
    L = np.array([B[max(0, j - 2):j + 3].mean(0) for j in range(len(B))])   # moyenne glissante sur 5 images : pas de tremblement
    tmp = f'{f}.{os.getpid()}'; json.dump([[round(float(v), 2) for v in b] for b in L], open(tmp, 'w')); os.replace(tmp, f)
    return L.astype(np.float32)


def tourne(F, mov, C, sens=1.0):
    """images RGBA (float32, taille d'origine du clip) avec la tête tournée de sens × ANGLE (+ : vers la droite de l'image)."""
    if C is None or not sens: return F
    B = boites(mov, F)
    if B is None: return F
    out = F.copy(); H, W = F.shape[1:3]
    for i, (x, y, s) in enumerate(B):
        x0, y0, x1, y1 = max(0, int(np.floor(x))), max(0, int(np.floor(y))), min(W, int(np.ceil(x + s))), min(H, int(np.ceil(y + s)))
        if x1 - x0 < 8 or y1 - y0 < 8: continue
        Mi = np.float32([[s / T, 0, x - x0], [0, s / T, y - y0]]); tr = (x1 - x0, y1 - y0)
        Fc = C['F'] if sens > 0 else C.get('Fg', -C['F'])   # champ du côté voulu (vers la gauche : rendu à −ANGLE)
        Fr = cv2.warpAffine(np.ascontiguousarray(Fc), Mi, tr, flags=cv2.INTER_LINEAR, borderValue=0) * np.float32(s / T * abs(sens))
        wr = cv2.warpAffine(C['w'], Mi, tr, flags=cv2.INTER_LINEAR, borderValue=0)
        gx, gy = np.meshgrid(np.arange(tr[0], dtype=np.float32), np.arange(tr[1], dtype=np.float32))
        out[i, y0:y1, x0:x1] = cv2.remap(np.ascontiguousarray(F[i, y0:y1, x0:x1]), gx + Fr[..., 0] * wr, gy + Fr[..., 1] * wr,
                                         cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return np.clip(out, 0, 255)
