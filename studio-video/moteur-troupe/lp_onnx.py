# LIVEPORTRAIT SANS CARTE GRAPHIQUE (17/10/2026) — LivePortrait (KwaiVGI, MIT, code et poids) en ONNX Runtime (CPU) :
# extraction d'apparence, de mouvement (pose + 21 points implicites + expression), rendu par déformation + SPADE.
# Sert à DESSINER de vraies expressions (« on ne voit pas de visage fâché, qui sourit, ému, qui a peur ») : les commandes
# d'édition sont celles de l'éditeur des auteurs (src/gradio_pipeline.py : sourire, sourcils, clin d'œil, regard, lèvres),
# combinées en émotions ; seules les zones expressives (sourcils, yeux, bouche) sont greffées sur le dessin d'origine.
import os
import numpy as np, cv2
import onnxruntime as ort

D = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/liveportrait/onnx/liveportrait_onnx/'
_S = {}


def _sess(nom):
    if nom not in _S:
        so = ort.SessionOptions(); so.intra_op_num_threads = int(os.environ.get('LP_THREADS', os.cpu_count() or 4))
        _S[nom] = ort.InferenceSession(D + nom + '.onnx', so, providers=['CPUExecutionProvider'])
    return _S[nom]


def _deg(pred):
    p = np.exp(pred - pred.max(1, keepdims=True)); p /= p.sum(1, keepdims=True)
    return float((p * np.arange(66)).sum() * 3 - 97.5)


def rotation(pitch, yaw, roll):
    x, y, z = np.radians([pitch, yaw, roll])
    rx = np.array([[1, 0, 0], [0, np.cos(x), -np.sin(x)], [0, np.sin(x), np.cos(x)]])
    ry = np.array([[np.cos(y), 0, np.sin(y)], [0, 1, 0], [-np.sin(y), 0, np.cos(y)]])
    rz = np.array([[np.cos(z), -np.sin(z), 0], [np.sin(z), np.cos(z), 0], [0, 0, 1]])
    return (rz @ ry @ rx).T


def recadre(img, v3, echelle=2.3, vy=-0.125):
    """carré du visage comme LivePortrait (côté = 2,3 × le visage, centre un peu remonté), depuis les 478 repères."""
    L = np.asarray(v3[:468, :2]); x0, y0 = L.min(0); x1, y1 = L.max(0)
    c = np.array([(x0 + x1) / 2, (y0 + y1) / 2]); s = max(x1 - x0, y1 - y0) * echelle; c[1] += vy * s
    return (float(c[0] - s / 2), float(c[1] - s / 2), float(s))


def extrait(img, box):
    x, y, s = box; M = np.float32([[256 / s, 0, -x * 256 / s], [0, 256 / s, -y * 256 / s]])
    return cv2.warpAffine(img, M, (256, 256), flags=cv2.INTER_AREA if s > 256 else cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


class Source:
    def __init__(self, img, v3):
        self.box = recadre(img, v3); c = extrait(img, self.box)
        x = (c.astype(np.float32) / 255).transpose(2, 0, 1)[None]
        self.feat = _sess('appearance_feature_extractor').run(None, {'img': x})[0]
        m = dict(zip(['pitch', 'yaw', 'roll', 't', 'exp', 'scale', 'kp'], _sess('motion_extractor').run(None, {'img': x})))
        self.pose = (_deg(m['pitch']), _deg(m['yaw']), _deg(m['roll']))
        self.kp = m['kp'].reshape(21, 3); self.exp = m['exp'].reshape(21, 3); self.t = m['t'].reshape(3); self.scale = float(m['scale'].reshape(-1)[0])
        self.R = rotation(*self.pose); self.xs = self._x(self.exp, self.R)
        # ouverture des yeux du dessin (hauteur / largeur de la fente, repères MediaPipe), entrée du module de reciblage des yeux
        V = np.asarray(v3)[:, :2]; r_ = lambda h, b_, g, d: float(np.linalg.norm(V[h] - V[b_]) / (np.linalg.norm(V[g] - V[d]) + 1e-6))
        self.oeil = (r_(159, 145, 33, 133), r_(386, 374, 362, 263))
        # ouverture des lèvres du dessin (lèvres intérieures 13-14 / coins 61-291), entrée du module de reciblage des lèvres
        # (les auteurs : repères 90-102 / 48-66 de leur détecteur à 203 points, retargeting_utils.calc_lip_close_ratio)
        self.levre = r_(13, 14, 61, 291)

    def _x(self, exp, R):
        x = self.scale * (self.kp @ R + exp); x[:, :2] += self.t[:2]; return x

    def rendu(self, edits=None, dpose=(0.0, 0.0, 0.0), couture=True, yeux=None, levres=None):
        """image 512 × 512 du carré du visage avec l'expression demandée (edits : delta d'expression 21 × 3), la tête
        tournée de dpose (tangage, lacet, roulis en degrés ; tangage > 0 : la tête baisse) et les yeux ouverts à yeux
        (rapport hauteur / largeur de la fente ; 0 = fermés ; None = ceux du dessin).
        PAUPIÈRES (18/10/2026, « aucun clignement des yeux ») : la commande « regard vers le bas » ne fermait les yeux d'aucun
        des 7 personnages (planche essai-gen/v36/clos.jpg) ; les auteurs ferment les paupières avec leur module de reciblage
        des yeux (live_portrait_wrapper.retarget_eye : [x_s, ouverture source gauche, droite, ouverture voulue] → delta des
        21 points, ajouté avant la couture), présent dans nos poids (stitching_eye.onnx)."""
        exp = self.exp + (edits if edits is not None else 0)
        R = rotation(*(np.array(self.pose) + np.array(dpose)))
        xd = self._x(exp, R)
        if yeux is not None:
            f = np.concatenate([self.xs.reshape(-1), [self.oeil[0], self.oeil[1], float(yeux)]])[None].astype(np.float32)
            xd = xd + _sess('stitching_eye').run(None, {'input': f})[0].reshape(21, 3)
        # LÈVRES JOINTES (20/10/2026) : un dessin qui sourit dents visibles (galerie : Sœur Awa, Maître Koné) garde la bouche
        # entrouverte avec la seule commande « lèvres 3 » (écart 0,088–0,099 du visage à −25 ; fermé ≤ 0,035). Les auteurs
        # ferment la bouche avant d'animer (flag_normalize_lip : live_portrait_wrapper.retarget_lip, [x_s, ouverture source,
        # ouverture voulue] → delta des 21 points, ajouté avant la couture), présent dans nos poids (stitching_lip.onnx).
        # levres : ouverture voulue (0 = jointes) ; None = celle du dessin.
        if levres is not None:
            f = np.concatenate([self.xs.reshape(-1), [self.levre, float(levres)]])[None].astype(np.float32)
            xd = xd + _sess('stitching_lip').run(None, {'input': f})[0].reshape(21, 3)
        if couture:   # recousu au reste de la tête (module « stitching » des auteurs)
            d = _sess('stitching').run(None, {'input': np.concatenate([self.xs.reshape(-1), xd.reshape(-1)])[None].astype(np.float32)})[0][0]
            xd = xd + d[:63].reshape(21, 3); xd[:, :2] += d[63:65]
        out = _sess('warping_spade').run(None, {'feature_3d': self.feat, 'kp_driving': xd[None].astype(np.float32), 'kp_source': self.xs[None].astype(np.float32)})[0][0]
        return np.clip(out.transpose(1, 2, 0) * 255, 0, 255).astype(np.uint8)


# commandes de l'éditeur des auteurs (LivePortrait, gradio_pipeline.py, MIT) → delta d'expression
def edits(sourire=0.0, sourcils=0.0, clin=0.0, regard_x=0.0, regard_y=0.0, levre0=0.0, levre1=0.0, levre2=0.0, levre3=0.0,
          froncer=0.0, inquiet=0.0, hausser=0.0):
    d = np.zeros((21, 3), np.float32)
    # nos commandes de sourcils (balayage des points 1 et 2 le 17/10/2026, mêmes effets sur Petit Mamadou et Maman Nounou) :
    # le curseur « sourcils » des auteurs ne fait que hausser (> 0) ou relever l'intérieur (< 0, air inquiet) ; il manquait le
    # « V » de la colère (AU4, sourcils abaissés et rapprochés).
    d[1, 0] += -0.05 * froncer + 0.03 * inquiet; d[2, 0] += 0.05 * froncer - 0.03 * inquiet
    d[1, 1] += -0.025 * froncer + 0.03 * hausser; d[2, 1] += 0.025 * froncer - 0.03 * hausser
    if regard_x > 0: d[11, 0] += regard_x * 0.0007; d[15, 0] += regard_x * 0.001
    else: d[11, 0] += regard_x * 0.001; d[15, 0] += regard_x * 0.0007
    d[11, 1] += regard_y * -0.001; d[15, 1] += regard_y * -0.001; b = -regard_y / 2.0
    d[11, 1] += b * -0.001; d[13, 1] += b * 0.0003; d[15, 1] += b * -0.001; d[16, 1] += b * 0.0003
    d[20, 1] += sourire * -0.01; d[14, 1] += sourire * -0.02; d[17, 1] += sourire * 0.0065; d[17, 2] += sourire * 0.003
    d[13, 1] += sourire * -0.00275; d[16, 1] += sourire * -0.00275; d[3, 1] += sourire * -0.0035; d[7, 1] += sourire * -0.0035
    d[11, 1] += clin * 0.001; d[13, 1] += clin * -0.0003; d[17, 0] += clin * 0.0003; d[17, 1] += clin * 0.0003; d[3, 1] += clin * -0.0003
    if sourcils > 0: d[1, 1] += sourcils * 0.001; d[2, 1] += sourcils * -0.001
    else: d[1, 0] += sourcils * -0.001; d[2, 0] += sourcils * 0.001; d[1, 1] += sourcils * 0.0003; d[2, 1] += sourcils * -0.0003
    d[19, 0] += levre0
    d[14, 1] += levre1 * 0.001; d[3, 1] += levre1 * -0.0005; d[7, 1] += levre1 * -0.0005; d[17, 2] += levre1 * -0.0005
    d[20, 2] += levre2 * -0.001; d[20, 1] += levre2 * -0.001; d[14, 1] += levre2 * -0.001
    d[19, 1] += levre3 * 0.001; d[19, 2] += levre3 * 0.0001; d[17, 1] += levre3 * -0.0001
    return d
