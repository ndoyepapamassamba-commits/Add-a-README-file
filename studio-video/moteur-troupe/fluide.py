# FLUIDITÉ DES PLANS GÉNÉRÉS (16/10/2026) — consigne : « calibrer la vidéo pour qu'il n'y ait aucune faille et que ce soit
# totalement fluide ». Les moteurs d'animation rendent 16 (Wan) ou 25 (EchoMimic) images par seconde ; le film est à 30.
# Jusqu'ici chaque image était DUPLIQUÉE pour combler (saccade visible une image sur deux à 16 i/s). Ici :
#   1. temps : chaque image du film (k / 30 s) est calculée à son instant exact entre deux images du moteur par RIFE
#      (Megvii, MIT ; poids TensorForger/RIFE-safetensors, MIT) — milieux successifs jusqu'à 1/8 d'intervalle ;
#      mesuré sur un plan réel : écart au vrai mouvement 7,4-8,9 contre 22,6-24,1 pour la duplication ;
#   2. couleur : un seul réglage par plan (moyenne et écart de chaque canal Lab) qui ramène la première image du moteur
#      sur l'image de départ du plan — même lumière que le reste du film, sans scintillement (réglage constant) ;
#   3. cadre : mise à l'échelle sans déformation puis recadrage au centre, au format exact du film (576 × 460).
import os, sys, numpy as np, cv2   # torch n'est chargé que pour RIFE (cadre, couleur et mesures s'en passent)
RIFE = os.environ.get('RIFE_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'rife'))
CW, CH, FPS = 576, 460, 30
_net = None

def reseau():
    global _net
    import torch
    if _net is None:
        sys.path.insert(0, RIFE)
        import interpolation_model as im
        im.dtype = torch.float32; im.device = torch.device('cpu')        # le module vise une carte en fp16 : ici processeur, fp32
        from safetensors.torch import load_file
        _net = im.IFNet(); _net.load_state_dict(load_file(f'{RIFE}/flownet.safetensors')); _net.eval()
        torch.set_num_threads(max(1, os.cpu_count() or 1))
    return _net

def lit(mp4):
    cap = cv2.VideoCapture(mp4); fps = cap.get(cv2.CAP_PROP_FPS) or 25; fr = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fr.append(f)
    return fr, fps

def cadre(f, w=CW, h=CH):
    fh, fw = f.shape[:2]; s = max(w / fw, h / fh)
    im = cv2.resize(f, (int(round(fw * s)), int(round(fh * s))), interpolation=cv2.INTER_CUBIC if s > 1 else cv2.INTER_AREA)
    y0, x0 = (im.shape[0] - h) // 2, (im.shape[1] - w) // 2
    return im[y0:y0 + h, x0:x0 + w]

def reglage_couleur(source, cible):
    """réglage Lab constant (moyenne/écart par canal) qui amène `source` sur `cible` ; renvoie une fonction image → image."""
    a = cv2.cvtColor(source, cv2.COLOR_BGR2LAB).astype(np.float32); b = cv2.cvtColor(cible, cv2.COLOR_BGR2LAB).astype(np.float32)
    ma, sa, mb, sb = a.mean((0, 1)), a.std((0, 1)) + 1e-3, b.mean((0, 1)), b.std((0, 1))
    g = np.clip(sb / sa, 0.8, 1.25)                                     # garde-fou : pas de réglage extrême
    def app(f):
        x = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(np.float32); x = (x - ma) * g + mb
        return cv2.cvtColor(np.clip(x, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    return app

def _t(f):                                    # RIFE travaille sur des côtés multiples de 64 : bord recopié, retiré après
    import torch
    h, w = f.shape[:2]; H, W = -(-h // 64) * 64, -(-w // 64) * 64
    f = cv2.copyMakeBorder(f, 0, H - h, 0, W - w, cv2.BORDER_REPLICATE)
    return torch.from_numpy(np.ascontiguousarray(f[:, :, ::-1])).permute(2, 0, 1).float()[None] / 255
def _f(x, h, w): return np.ascontiguousarray((x[0, :, :h, :w].permute(1, 2, 0).clamp(0, 1).numpy() * 255 + 0.5).astype(np.uint8)[:, :, ::-1])

def retime(fr, fps_src, n_out, fps_out=FPS, profondeur=3):
    """n_out images à fps_out à partir de fr (fps_src) : l'image du temps t est interpolée par RIFE entre les deux images
    du moteur qui l'encadrent, au 1/2^profondeur d'intervalle le plus proche (milieux successifs, mis en cache)."""
    import torch
    net = reseau(); cache = {}; q = 2 ** profondeur; out = []
    def noeud(i, a, b):                       # image à la position i + a/b (b puissance de 2), par bissection
        if a == 0: return fr[i]
        if a == b: return fr[min(i + 1, len(fr) - 1)]
        while a % 2 == 0 and b > 1: a //= 2; b //= 2
        cle = (i, a, b)
        if cle not in cache:
            g, d = noeud(i, a - 1, b), noeud(i, a + 1, b)               # voisins à ±1/b : leur milieu est a/b
            with torch.no_grad(): cache[cle] = _f(net(torch.cat([_t(g), _t(d)], 1)), *g.shape[:2])
        return cache[cle]
    for k in range(n_out):
        x = k / fps_out * fps_src; i = min(int(x), len(fr) - 1); a = int(round((x - i) * q))
        if i >= len(fr) - 1: out.append(fr[-1]); continue                # au-delà de la dernière image : on la tient
        if a == q: i, a = i + 1, 0
        out.append(noeud(i, a, q))
    return out, len(cache)

def retime_flux(fr, fps_src, n_out, fps_out=FPS):
    """RIFE absent (pas de PyTorch) : même principe par flux optique DIS d'OpenCV (BSD) — l'image du temps t est
    reconstruite entre les deux images du moteur qui l'encadrent, chacune déplacée vers t le long du flux puis mêlées
    au prorata de la distance (Baker et al. 2011, « A Database and Evaluation Methodology for Optical Flow », §
    interpolation). Jamais de duplication : une image différente à chaque instant du film."""
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM); flux = {}; out = []
    h, w = fr[0].shape[:2]; gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    gris = lambda f: cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
    for k in range(n_out):
        x = k / fps_out * fps_src; i = min(int(x), len(fr) - 1); a = x - i
        if i >= len(fr) - 1 or a < 1e-3: out.append(fr[i]); continue
        if i not in flux: flux[i] = (dis.calc(gris(fr[i]), gris(fr[i + 1]), None), dis.calc(gris(fr[i + 1]), gris(fr[i]), None))
        F01, F10 = flux[i]
        w0 = cv2.remap(fr[i], gx - a * F01[..., 0], gy - a * F01[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        w1 = cv2.remap(fr[i + 1], gx - (1 - a) * F10[..., 0], gy - (1 - a) * F10[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        out.append(cv2.addWeighted(w0, 1 - a, w1, a, 0))
    return out, len(flux)

def rife_present():
    try:
        import torch  # noqa: F401
        return os.path.exists(os.path.join(RIFE, 'flownet.safetensors'))
    except ImportError:
        return False

def saccade(frames):
    """mesure de fluidité : part des images identiques à la précédente (gel d'une image = saccade) et irrégularité du
    mouvement (écart-type / moyenne de la différence image à image) — plus bas = plus fluide."""
    g = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32) for f in frames]
    d = np.array([np.abs(g[i] - g[i - 1]).mean() for i in range(1, len(g))])
    return {'images_figees_%': round(float((d < 0.05).mean() * 100), 1), 'irregularite': round(float(d.std() / (d.mean() + 1e-6)), 2)}

def plan_fluide(mp4, ref_png, n_out):
    """plan du moteur → n_out images du film : couleur recalée, cadre exact, 30 i/s par RIFE. Renvoie (images, mesures)."""
    fr, fps = lit(mp4)
    if not fr: return [], {'erreur': 'vidéo vide'}
    ref = cv2.imread(ref_png); col = reglage_couleur(cadre(fr[0], ref.shape[1], ref.shape[0]), ref)
    fr = [col(f) for f in fr]                                            # interpolation à la définition du moteur, puis cadre
    avant = [cadre(fr[min(len(fr) - 1, int(k / FPS * fps))]) for k in range(n_out)]   # ce que faisait l'ancienne insertion
    rife = rife_present()
    apres, n_int = (retime if rife else retime_flux)(fr, fps, n_out); apres = [cadre(f) for f in apres]
    return apres, {'fps_moteur': round(fps, 2), 'interpolation': 'RIFE' if rife else 'flux DIS (OpenCV)', 'intervalles': n_int,
                   'avant': saccade(avant), 'apres': saccade(apres)}
