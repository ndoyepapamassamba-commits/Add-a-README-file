# ÉTAGE E5 — COMPOSITEUR DE SCÈNE (18/10/2026) : décor VIDE + objets + personnages détourés → scène prête à tourner.
# Chaque élément garde sa couche : un personnage n'emporte plus sa chaise (Baye), un plat ne suit plus une main (Koffi).
#  · perspective : la taille à l'écran d'un personnage debout vient de sa taille réelle (cm, fiche de l'univers) et de la
#    hauteur de ses pieds dans l'image (sol plan, caméra à hauteur d'homme : h_px = taille × (y_pieds − y_horizon) / 170) ;
#  · couches : du fond vers l'avant par la hauteur des pieds (plus bas dans l'image = plus près) ;
#  · ombre de contact : ellipse floue sous les pieds, plus une ombre portée douce dans la direction de la lumière du décor ;
#  · sorties : image.png (scène), plaque-pleine.png (décor + objets, sans personnage : la plaque EXACTE, plus de
#    reconstruction), alpha-<slug>.png par personnage, scene-fabrique.json (placements, boîtes, pieds).
#   python3 compose.py scene.json sortie/     (scene.json : {"decor": png, "horizon": 0.40, "lumiere": [dx, dy],
#                                              "elements": [{"png", "slug", "taille_cm", "x": 0..1, "pieds": 0..1, "miroir"}]})
import json, os, sys
import numpy as np, cv2


def charge_rgba(f, miroir=False):
    a = cv2.imread(f, cv2.IMREAD_UNCHANGED)
    if a.shape[2] == 3: a = np.dstack([a, np.full(a.shape[:2], 255, np.uint8)])
    a = cv2.cvtColor(a, cv2.COLOR_BGRA2RGBA)
    return a[:, ::-1].copy() if miroir else a


def rogne(a):
    ys, xs = np.nonzero(a[..., 3] > 8)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1] if len(ys) else a


def ombre(fond, a_pos, x0, y0, pieds_y, lumiere, force=0.45):
    """ombre de contact (ellipse serrée sous les pieds) + ombre portée douce, allongée sur le sol dans le sens de la lumière."""
    H, W = fond.shape[:2]; h, w = a_pos.shape[:2]; m = np.zeros((H, W), np.float32); cx = x0 + w / 2; dx = float(lumiere[0])
    cv2.ellipse(m, (int(cx), int(pieds_y)), (int(0.40 * w), max(3, int(0.045 * w))), 0, 0, 360, 1.0, -1)
    p = np.zeros((H, W), np.float32); L_ = 0.55 * h * abs(dx)
    cv2.ellipse(p, (int(cx + np.sign(dx) * 0.5 * L_), int(pieds_y - 0.01 * h)), (int(0.5 * L_ + 0.3 * w), max(3, int(0.06 * w))), 0, 0, 360, 0.55, -1)
    m = np.clip(cv2.GaussianBlur(m, (0, 0), max(2, 0.03 * w)) * 0.9 + cv2.GaussianBlur(p, (0, 0), max(3, 0.06 * w)), 0, 1)
    return (fond * (1 - force * m[..., None])).astype(np.float32)


def harmonise(a, fond, k=0.35):
    """le personnage (éclairé en studio) prend la couleur de la lumière du décor : teinte moyenne des parties claires du décor."""
    lum = fond.reshape(-1, 3); clair = lum[lum.sum(1) > np.percentile(lum.sum(1), 70)].mean(0)
    t = clair / max(1e-6, clair.mean()); b = a.astype(np.float32); b[..., :3] = np.clip(b[..., :3] * (1 - k + k * t), 0, 255)
    return b.astype(np.uint8)


def colle(fond, a, x0, y0):
    H, W = fond.shape[:2]; h, w = a.shape[:2]; xa, ya = max(0, x0), max(0, y0); xb, yb = min(W, x0 + w), min(H, y0 + h)
    if xb <= xa or yb <= ya: return fond, None
    p = a[ya - y0:yb - y0, xa - x0:xb - x0].astype(np.float32); al = p[..., 3:] / 255.0
    fond[ya:yb, xa:xb] = fond[ya:yb, xa:xb] * (1 - al) + p[..., :3] * al
    full = np.zeros((H, W), np.float32); full[ya:yb, xa:xb] = al[..., 0]
    return fond, full


def compose(sc, sortie):
    os.makedirs(sortie, exist_ok=True); fond = cv2.cvtColor(cv2.imread(sc['decor']), cv2.COLOR_BGR2RGB).astype(np.float32)
    H, W = fond.shape[:2]; yh = sc.get('horizon', 0.40) * H; lum = sc.get('lumiere', [0.35, 0.0]); plaque = fond.copy(); out = []
    elems = sorted(sc['elements'], key=lambda e: e['pieds'])   # du fond vers l'avant
    for e in elems:
        a = rogne(charge_rgba(e['png'], e.get('miroir', False))); yp = e['pieds'] * H
        hpx = e.get('taille_cm', 170) * (yp - yh) / 170.0 * sc.get('echelle', 1.0)
        s = hpx / a.shape[0]; a = cv2.resize(a, (max(1, int(a.shape[1] * s)), max(1, int(hpx))), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
        x0 = int(e['x'] * W - a.shape[1] / 2); y0 = int(yp - a.shape[0]); a = harmonise(a, fond)
        fond = ombre(fond, a, x0, y0, yp, lum)
        if e.get('objet'): plaque = ombre(plaque, a, x0, y0, yp, lum)
        fond, al = colle(fond, a, x0, y0)
        if e.get('objet'): plaque, _ = colle(plaque, a, x0, y0)
        elif al is not None: cv2.imwrite(f"{sortie}/alpha-{e['slug']}.png", (al * 65535).astype(np.uint16))
        out.append({'slug': e['slug'], 'objet': bool(e.get('objet')), 'boite': [x0, y0, x0 + a.shape[1], y0 + a.shape[0]], 'pieds': [int(e['x'] * W), int(yp)], 'hauteur_px': int(hpx)})
    cv2.imwrite(f'{sortie}/image.png', cv2.cvtColor(np.clip(fond, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
    cv2.imwrite(f'{sortie}/plaque-pleine.png', cv2.cvtColor(np.clip(plaque, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
    json.dump({'source': sc, 'elements': out, 'W': W, 'H': H}, open(f'{sortie}/scene-fabrique.json', 'w'), ensure_ascii=False, indent=1)
    return out


if __name__ == '__main__':
    print(json.dumps(compose(json.load(open(sys.argv[1])), sys.argv[2]), ensure_ascii=False))
