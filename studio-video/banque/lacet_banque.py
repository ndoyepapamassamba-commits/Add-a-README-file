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
GAIN = float(os.environ.get('LACET_GAIN', '1.0'))   # VERSION 5 : gain par défaut du champ gaussien (1,6 pour le polynôme)
T = 128                                               # grille du champ (carré du visage)
VERSION = 6   # 2 : orientation déjà dessinée gardée (gain) ; 3 : un champ par côté (le champ retourné ne tournait vers la gauche que de 5°) ; 6 : marge de 4°
# 4 : gain ÉTALONNÉ par personnage et par côté (21/10/2026, épisode banque 1 : regards 0,167 contre 0,846 pour la V1). Mesuré
# comme niveau_v1 (FaceLandmarker, lacet lu sur la tête agrandie) : un même gain donne +8,2° à Tiékoro et +15,5° à Patron Séry,
# −5,5° à Mamie Bintou et −11,9° à Tata Prisca ; le gain qui tourne le plus est gardé (1,2 à 2,0 ; au-delà la coiffure se tord).
# 5 : champ lissé en GAUSSIEN, plus en polynôme (21/10/2026, épisode banque 1 v4-v5 : regards 0,087 puis 0,048 ; Patron Séry,
# dessiné de face, lu à −2° dans le film). Mesuré sur la 1re image de son clip, lacet lu comme niveau_v1 : rendu LivePortrait
# direct ±25° → ±23° lus (mais 6,5 s par image : impossible à l'échelle de la banque) ; champ du rendu ±20° lissé en polynôme
# de degré 3 → −4,9 / +5,4° (le polynôme, ajusté sur toute la tête, efface le glissement du nez entre les yeux) ; degré 5 →
# ±12° ; gaussien σ 4 (grille 128) → −15,5 / +16,9° (Tata Prisca −13,6 / +12,0°) sans torsion visible (planche de
# comparaison à ±18 et ±25°) ; σ 2 ou ±30° : joue et bouche tordues. Gain étalonné : le plus PETIT qui atteint
# CIBLE (12°, bas de la V1), sinon celui qui tourne le plus — au-delà, le visage se tord.
GAINS = (0.8, 1.0, 1.25)
SIGMA = float(os.environ.get('LACET_SIGMA', '4'))     # lissage du champ (pixels de la grille T)
CIBLE = 12.0
# MARGE (21/10/2026, épisode banque 1 v20 : regards 0,968 → 0,857, la V1 0,846) : étalonné à 12° sur la 1re image du clip, le
# Patron Sery (dessiné presque de face, 3,4°) recevait le gain 0,8 (−14,5°) ; en plein jeu sa tête ne tournait plus que de 5
# à 11° — sous le seuil de 8° de la mesure, une seconde sur trois au maquis. Le gain retenu est désormais le plus petit qui
# atteint CIBLE + MARGE (16°), dans les gains déjà jugés sans torsion (≤ 1,25).
MARGE = 4.0


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
    trois quarts », sinon le menton s'étire) ; un visage de face ou tourné de l'autre côté reçoit le gain étalonné de ce côté."""
    lp = float(C.get('peint', 0.0)) * (1 if sens >= 0 else -1) if C else 0.0
    g = float(C.get('gd' if sens >= 0 else 'gg', GAIN)) if C else GAIN
    return g if lp < 6 else max(0.3, g * (1 - (lp - 6) / 14))


def _lu(rgba):
    """lacet du visage (degrés, + : vers la droite de l'image) lu comme niveau_v1 : haut de l'image agrandi, FaceLandmarker."""
    import niveau_v1 as N
    if _OUT.get('pid') != os.getpid(): _OUT.clear(); _OUT['pid'] = os.getpid()   # un détecteur par processus (fork)
    if '_N' not in _OUT: _OUT['_N'] = N._outils()
    mp, _, fl = _OUT['_N']; t = _sur_gris(rgba)[:int(rgba.shape[0] * 0.45)]
    return N._lacet(mp, fl, cv2.cvtColor(cv2.resize(t, (384, int(384 * t.shape[0] / t.shape[1]))), cv2.COLOR_RGB2BGR))


_OUT = {}


def _tourne_une(F0, boite, Fc, w, g):
    x, y, s = boite; H, W = F0.shape[:2]; out = F0.copy()
    x0, y0, x1, y1 = max(0, int(np.floor(x))), max(0, int(np.floor(y))), min(W, int(np.ceil(x + s))), min(H, int(np.ceil(y + s)))
    Mi = np.float32([[s / T, 0, x - x0], [0, s / T, y - y0]]); tr = (x1 - x0, y1 - y0)
    Fr = cv2.warpAffine(np.ascontiguousarray(Fc), Mi, tr, flags=cv2.INTER_LINEAR) * np.float32(s / T * g)
    wr = cv2.warpAffine(w, Mi, tr, flags=cv2.INTER_LINEAR)
    gx, gy = np.meshgrid(np.arange(tr[0], dtype=np.float32), np.arange(tr[1], dtype=np.float32))
    out[y0:y1, x0:x1] = cv2.remap(np.ascontiguousarray(F0[y0:y1, x0:x1]), gx + Fr[..., 0] * wr, gy + Fr[..., 1] * wr,
                                  cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return out


def etalonne(F0, boite, F, Fg, w):
    """(gain vers la droite, gain vers la gauche, lacets obtenus) : pour chaque côté, le plus petit gain de GAINS dont la tête
    lue tourne d'au moins CIBLE degrés (le lacet neutre en référence), sinon celui qui la tourne le plus ; 1 si le visage n'est
    plus lu."""
    n0 = _lu(F0) or 0.0; res = {}
    for cote, Fc, sg in (('gd', F, 1.0), ('gg', Fg, -1.0)):
        mes = [(sg * (v - n0), g, v) for g in GAINS for v in [_lu(_tourne_une(F0, boite, Fc, w, g))] if v is not None]
        ok = [m for m in mes if m[0] >= CIBLE + MARGE]; ch = min(ok, key=lambda m: m[1]) if ok else (max(mes) if mes else None)
        res[cote] = ch[1] if ch else 1.0; res['l' + cote[1]] = round(ch[2], 1) if ch else None
    return res


def champ(perso, mov, F0=None):
    """champ de rotation de la tête du personnage (+ANGLE : vers la droite de l'image), en cache à côté de ses clips."""
    f = os.path.join(os.path.dirname(mov), f'{perso}.lacet.npz'); cle = json.dumps([VERSION, ANGLE, T, SIGMA, os.path.basename(mov)])
    if os.path.isfile(f):
        z = np.load(f)
        if str(z['cle']) == cle: return {'F': z['F'].astype(np.float32), 'Fg': z['Fg'].astype(np.float32), 'w': z['w'].astype(np.float32),
                                         'peint': float(z['peint']), 'gd': float(z['gd']), 'gg': float(z['gg'])}
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
    lisse = lambda Fl: cv2.GaussianBlur(Fl, (0, 0), SIGMA)   # VERSION 5 : plus de polynôme (voir GAINS)
    F = lisse(dis.calc(rend(signe * ANGLE), n0, None)); Fg = lisse(dis.calc(rend(-signe * ANGLE), n0, None))
    lp = lacet_peint(v3); et = etalonne(F0, LP.recadre(None, v3), F, Fg, w)
    tmp = f'{f}.{os.getpid()}.npz'   # écriture atomique : les répliques sont rendues en parallèle
    np.savez_compressed(tmp, cle=np.array(cle), F=F.astype(np.float16), Fg=Fg.astype(np.float16), w=w.astype(np.float16), peint=np.array(lp),
                        gd=np.array(et['gd']), gg=np.array(et['gg']), ld=np.array(et['ld'] if et['ld'] is not None else np.nan),
                        lg=np.array(et['lg'] if et['lg'] is not None else np.nan))
    os.replace(tmp, f)
    return {'F': F, 'Fg': Fg, 'w': w, 'peint': lp, 'gd': et['gd'], 'gg': et['gg']}


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
