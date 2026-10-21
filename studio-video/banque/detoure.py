# DÉTOURAGE DES CLIPS DE LA BANQUE (20/10/2026) — fait UNE fois par clip, gardé à côté du clip (<clip>.mov, ARGB) :
# l'assemblage n'a plus qu'à poser des calques déjà propres (défaut vu sur l'essai du 20/10 : liseré vert et personnages
# « collés » sans contact avec le sol).
#  · alpha par DISTANCE à la couleur du fond, mesurée sur le bord du clip (≈ 0, 238, 5 : vert presque pur, R ≤ 15, B ≤ 39,
#    V ≥ 216 mesurés) : transparent sous 45, opaque au-delà de 95, fondu entre les deux. Une première version par dominance du
#    vert (V − max(R, B)) trouait le tee-shirt vert usé de Modou (taches à 74, 194, 12 : dominance 120, mais distance 86 au fond) ;
#    seules la grande silhouette et les morceaux importants sont gardés (taches isolées ôtées) ;
#  · débordement du vert sur les bords ramené (V plafonné à max(R, B) + 12 sur 4 px autour du fond) ;
#  · OMBRE DE CONTACT cuite dans le calque : ellipse sombre floue sous les pieds (ligne la plus basse de la silhouette sur tout le
#    clip), 60 % de la largeur des pieds, opacité 0,45 — le personnage touche le sol du décor.
#  · VERT RESTÉ DANS LES CREUX (21/10/2026, « Le cahier dans la tête ») : entre le bras et le corps, entre les doigts, le fond
#    est à l'ombre ou mêlé au costume par la compression (48,191,36 ; 15,69,12) — trop loin du vert pur pour la distance, il restait
#    opaque (6 % des pixels opaques de Monsieur Diarra) et la main virait au jaune. Quand la fiche du personnage ne porte AUCUN vert
#    (47 personnages sur 54), toute teinte proche de celle du fond, assez saturée, est rendue transparente et le vert est plafonné
#    au maximum de R et B sur toute l'image ; les 7 qui portent du vert (Modou, Coach Diabaté…) gardent la règle prudente.
# GREFFE : numpy + OpenCV (Apache-2.0) pour le calcul, ffmpeg (LGPL, programme séparé) pour lire et écrire ; rien d'IA.
#   python3 detoure.py CLIP.mp4 [...]      → CLIP.mov à côté, et ses pieds (x, y) en fraction du cadre dans CLIP.pieds.json
import json, os, re, subprocess, sys, unicodedata
from functools import lru_cache
import numpy as np

VERSION = 2   # 2 : creux verts rendus transparents (personnages sans vert) — un détourage plus ancien est refait


@lru_cache(maxsize=None)
def porte_du_vert(perso):
    """la fiche du personnage (slug) mentionne-t-elle du vert ? inconnu → oui (règle prudente)."""
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'images')); import bible
        for p in json.load(open(bible.PERSONNAGES, encoding='utf-8'))['personnages']:
            sl = re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', p['name']).encode('ascii', 'ignore').decode().lower()).strip('-')
            if sl == perso: return bool(re.search(r'\bvert|kaki|olive|émeraude|green', f"{p.get('tenue', '')} {p.get('apparence', '')}", re.I))
    except Exception:
        pass
    return True


def creux_verts(im, couleur):
    """probabilité (0-1) qu'un pixel soit du fond à l'ombre ou mêlé : teinte à ±28° de celle du fond, saturé, pas noir."""
    import cv2
    hsv = cv2.cvtColor(im, cv2.COLOR_RGB2HSV).astype(np.float32)
    hf = float(cv2.cvtColor(np.uint8([[couleur]]), cv2.COLOR_RGB2HSV)[0, 0, 0])
    dh = np.abs(hsv[..., 0] - hf); dh = np.minimum(dh, 180 - dh)
    return (np.clip((14 - dh) / 6, 0, 1) * np.clip((hsv[..., 1] - 70) / 40, 0, 1) * np.clip((hsv[..., 2] - 25) / 20, 0, 1))


def _images(f):
    p = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
                        '-of', 'json', f], capture_output=True, text=True, check=True)
    s = json.loads(p.stdout)['streams'][0]; w, h = s['width'], s['height']
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3), s['r_frame_rate']


def fond(im):
    b = np.concatenate([im[:8].reshape(-1, 3), im[:, :8].reshape(-1, 3), im[:, -8:].reshape(-1, 3)])
    return np.median(b, 0)


def alpha(im, couleur):
    import cv2
    dist = np.linalg.norm(im.astype(np.float32) - couleur, axis=2)
    al = np.clip((dist - 45) / 50.0, 0, 1)
    n, lab, st, _ = cv2.connectedComponentsWithStats((al > 0.5).astype(np.uint8))
    if n > 1:
        gros = st[1:, cv2.CC_STAT_AREA].max()
        garde = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= 0.02 * gros])
        al = al * cv2.dilate(garde.astype(np.uint8), np.ones((3, 3), np.uint8))
    return al


def detoure(clip):
    import cv2
    ims, fps = _images(clip); N, H, W, _ = ims.shape
    couleur = fond(ims[0]); als = np.stack([alpha(im, couleur) for im in ims])
    strict = not porte_du_vert(os.path.basename(clip).split('--')[0])
    if strict: als = np.stack([a * (1 - creux_verts(im, couleur)) for a, im in zip(als, ims)])
    bas = max(int(np.nonzero(a.max(1) > 0.5)[0].max()) for a in als)               # pieds : ligne la plus basse du clip
    lignes = als[:, max(0, bas - int(0.06 * H)):bas + 1].max(axis=(0, 1)) > 0.5; xs = np.nonzero(lignes)[0]   # les deux pieds
    cx, lp = (xs.min() + xs.max()) / 2, max(20, xs.max() - xs.min())
    ombre = np.zeros((H, W), np.float32)
    cv2.ellipse(ombre, (int(cx), int(bas)), (int(0.6 * lp / 2 + 10), int(max(5, 0.03 * H))), 0, 0, 360, 1.0, -1)
    ombre = cv2.GaussianBlur(ombre, (0, 0), 6) * 0.45
    sortie = os.path.splitext(clip)[0] + '.mov'
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-r', fps, '-i', '-',
                          '-c:v', 'qtrle', '-pix_fmt', 'argb', sortie], stdin=subprocess.PIPE)
    for im, a in zip(ims, als):
        c = im.astype(np.float32)
        bord = cv2.dilate((a < 0.5).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0   # 4 px autour du fond : le vert y déborde
        c[..., 1] = np.where(bord, np.minimum(c[..., 1], np.maximum(c[..., 0], c[..., 2]) + 12), c[..., 1])
        if strict: c[..., 1] = np.minimum(c[..., 1], np.maximum(c[..., 0], c[..., 2]))   # aucun vert chez ce personnage
        ao = a + ombre * (1 - a)                                                  # ombre sous le personnage (noire)
        c = c * (a / np.maximum(ao, 1e-6))[..., None]
        p.stdin.write(np.dstack([np.clip(c, 0, 255), np.clip(ao * 255, 0, 255)]).astype(np.uint8).tobytes())
    p.stdin.close(); p.wait()
    pieds = {'x': round(cx / W, 4), 'y': round(bas / H, 4), 'largeur': round(lp / W, 4), 'detourage': VERSION, 'strict': strict}
    json.dump(pieds, open(os.path.splitext(clip)[0] + '.pieds.json', 'w'))
    return sortie, pieds


if __name__ == '__main__':
    for c in sys.argv[1:]: print(json.dumps({'clip': c, **dict(zip(('mov', 'pieds'), detoure(c)))}, ensure_ascii=False))
