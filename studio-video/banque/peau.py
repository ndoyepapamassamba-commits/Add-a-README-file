# TEINT DE LA V1 POUR TOUTE LA BANQUE (21/10/2026) — « même le teint des personnages, nous sommes en Afrique de l'Ouest ».
# Mesuré image par image (niveau_v1.teint : peau découpée par MediaPipe selfie_multiclass, classes peau du corps et du visage,
# médiane CIELAB) : dans la V1 publiée, la peau des personnages est à L* 28–36 et b* 22–26 ; dans les vidéos de la banque,
# L* 45–56 et b* 36–48 — même Coumba, dessinée par l'utilisateur à L* 52,5 / b* 48 sur sa fiche, apparaît à L* ≈ 32 dans la V1
# (lumière des scènes peintes). La banque rend la fiche telle quelle, sous lumière plate.
# Remède généralisé : une fois par PERSONNAGE, la peau médiane de son clip « écouter » est mesurée ; chaque image de chacun de
# ses clips voit sa peau (masque du segmenteur, bords fondus) ramenée vers la peau de la V1 — clarté et saturation réduites
# d'un même facteur pour tout le personnage (ombres et modelé gardés, teinte gardée), jamais éclaircie. Masques en cache
# à côté du clip (<clip>.peau.npz), facteurs à côté de la banque (<perso>.peau.json).
import json, os, subprocess, sys
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(ICI, '..', 'moteur-troupe'))
CIBLE_L = float(os.environ.get('PEAU_L', '31'))    # V1 publiée : 28 à 36 (images mesurées), 35,3 au 9e décile (marge : 31)
CIBLE_B = float(os.environ.get('PEAU_B', '21'))    # V1 publiée : 22 à 26, 26,0 au 9e décile (marge : 21)
VERSION = 1
_SEG = []


def _seg():
    if _SEG and _SEG[0][2] != os.getpid(): _SEG.clear()   # un segmenteur par processus (hérité d'un fork : bloqué)
    if not _SEG:
        import mediapipe as mp
        from mediapipe.tasks.python import vision, BaseOptions
        C = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/'
        _SEG.append((mp, vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
            base_options=BaseOptions(model_asset_path=C + 'selfie_multiclass_256x256.tflite'), output_category_mask=True)), os.getpid()))
    return _SEG[0][:2]


def masques(mov, F):
    """masque de peau (0–1, bords fondus) de chaque image du clip, en cache."""
    f = mov[:-4] + '.peau.npz'
    if os.path.isfile(f):
        z = np.load(f)
        if int(z['v']) == VERSION and len(z['m']) == len(F): return z['m'].astype(np.float32) / 255
    mp, seg = _seg(); M = []
    for im in F:
        a = im[..., 3:4] / 255.0; rgb = np.clip(im[..., :3] * a + 128 * (1 - a), 0, 255).astype(np.uint8)
        c = np.squeeze(seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))).category_mask.numpy_view())
        c = cv2.resize(c, (im.shape[1], im.shape[0]), interpolation=cv2.INTER_NEAREST)
        m = (((c == 2) | (c == 3)) & (im[..., 3] > 128)).astype(np.float32)
        M.append(cv2.GaussianBlur(m, (0, 0), 1.5) * (im[..., 3] / 255))
    M = np.array(M); tmp = f'{f}.{os.getpid()}.npz'
    np.savez_compressed(tmp, v=np.array(VERSION), m=(M * 255).astype(np.uint8)); os.replace(tmp, f)
    return M


def _lab(im):
    return cv2.cvtColor(np.ascontiguousarray(im[..., :3] / 255.0).astype(np.float32), cv2.COLOR_RGB2LAB)


def facteurs(perso, mov, F, M):
    """(kL, kC) du personnage : clarté et saturation de sa peau ramenées vers la V1 (jamais au-dessus de 1)."""
    f = os.path.join(os.path.dirname(mov), f'{perso}.peau.json'); cle = [VERSION, CIBLE_L, CIBLE_B]
    if os.path.isfile(f):
        d = json.load(open(f))
        if d.get('cle') == cle: return d['kL'], d['kC'], d
    L, B = [], []
    for im, m in zip(F, M):
        if (m > 0.5).sum() < 50: continue
        lab = _lab(im); L.append(float(np.median(lab[..., 0][m > 0.5]))); B.append(float(np.median(lab[..., 2][m > 0.5])))
    if not L: return 1.0, 1.0, {}
    l0, b0 = float(np.median(L)), float(np.median(B))
    d = {'cle': cle, 'L': round(l0, 1), 'b': round(b0, 1), 'kL': round(min(1.0, CIBLE_L / max(l0, 1e-3)), 3),
         'kC': round(min(1.0, CIBLE_B / max(b0, 1e-3)), 3)}
    tmp = f'{f}.{os.getpid()}'; json.dump(d, open(tmp, 'w')); os.replace(tmp, f)
    return d['kL'], d['kC'], d


def teinte(F, mov, perso, ec=None):
    """images RGBA (float32) dont la peau est ramenée au teint de la V1."""
    if os.environ.get('PEAU_V1', '1') != '1': return F
    if ec and ec != mov:   # facteurs du personnage lus sur son clip « écouter »
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', ec, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], capture_output=True, check=True).stdout
        Fe = np.frombuffer(raw, np.uint8).reshape(-1, F.shape[1], F.shape[2], 4).astype(np.float32) if len(raw) % (F.shape[1] * F.shape[2] * 4) == 0 else F
        kL, kC, _ = facteurs(perso, ec, Fe, masques(ec, Fe))
    else:
        M0 = masques(mov, F); kL, kC, _ = facteurs(perso, mov, F, M0)
    if kL >= 0.995 and kC >= 0.995: return F
    M = masques(mov, F); out = F.copy()
    for i, (im, m) in enumerate(zip(F, M)):
        if m.max() < 0.05: continue
        lab = _lab(im); lab[..., 0] *= kL; lab[..., 1] *= kC; lab[..., 2] *= kC
        rgb = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB) * 255; w = m[..., None]
        out[i, ..., :3] = im[..., :3] * (1 - w) + rgb * w
    return np.clip(out, 0, 255)
