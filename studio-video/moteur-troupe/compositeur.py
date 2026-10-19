# COMPOSITEUR DE SCÈNE (19/10/2026, « une solution globale ») : n'importe quels personnages de la troupe (figures découpées
# des planches et des galeries par blender/film/cutout.py) posés dans n'importe quel décor vide, au format que le moteur
# attend (prepare_scene.py lit ensuite l'image comme une scène peinte). Pour chaque personnage :
#   1. couleurs étendues sous la découpe (pas de liseré gris), agrandissement Swin2SR ×4 (Apache-2.0, déjà installé) quand
#      la figure est plus petite que sa taille à l'écran — les figures des galeries font ≈ 430 px de haut ;
#   2. taille réelle (bible : characters.json, mètres) × pixels par mètre du décor, pieds sur la ligne de sol ;
#   3. lumière accordée à la scène : transfert de Reinhard (Lab) partiel vers les acteurs déjà intégrés au décor (même
#      lumière), sinon vers le décor autour des pieds ;
#   4. ombre portée et ombre de contact par la loi du moteur (physique.ombre, soleil mesuré sur les ombres peintes du
#      décor), toutes les ombres posées avant les personnages ; bord adouci comme la peinture.
# python3 compositeur.py plaque.png sortie.png PX_PAR_M SOL_Y [--lumiere lumiere.json] [--ref image.png masque1.png …] "NOM|figure.png|taille_m|x_frac" …
import json, os, sys
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__))
SR = []


def _sr():
    if not SR:
        import onnxruntime as ort
        m = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/swin2sr.onnx'
        SR.append(ort.InferenceSession(m, providers=['CPUExecutionProvider']))
    return SR[0]


def etend_couleurs(rgb, a, n=24):
    """couleurs de la figure étendues sous la zone transparente (moyenne des voisins, n passes) : l'agrandissement et le flou
    du bord ne mélangent plus la figure avec un fond étranger (liseré)."""
    out = rgb.astype(np.float32); w = (a > 0.5).astype(np.float32)
    acc, poids = out * w[..., None], w.copy()
    k = np.ones((3, 3), np.float32)
    for _ in range(n):
        s = cv2.filter2D(acc, -1, k); p = cv2.filter2D(poids, -1, k)
        neuf = (poids == 0) & (p > 0)
        acc[neuf] = s[neuf] / p[neuf][:, None] * 1.0; poids[neuf] = 1.0
    acc[poids == 0] = out[poids == 0]
    return np.where((w > 0)[..., None], out, acc / np.maximum(poids, 1e-6)[..., None] * (poids > 0)[..., None] + out * (poids == 0)[..., None])


def agrandit(rgb):
    """Swin2SR ×4 par tuiles de 64 px recouvrantes (modèle real-world, sortie 0–1)."""
    s = _sr(); h, w = rgb.shape[:2]; T, M = 64, 8
    x = rgb.astype(np.float32) / 255.0; out = np.zeros((h * 4, w * 4, 3), np.float32); cnt = np.zeros((h * 4, w * 4, 1), np.float32)
    nom = s.get_inputs()[0].name
    for y0 in range(0, h, T - 2 * M):
        for x0 in range(0, w, T - 2 * M):
            y1, x1 = min(h, y0 + T), min(w, x0 + T); ya, xa = max(0, y1 - T), max(0, x1 - T)
            tile = x[ya:y1, xa:x1]; th, tw = tile.shape[:2]
            pad = np.pad(tile, ((0, T - th), (0, T - tw), (0, 0)), mode='reflect')
            r = s.run(None, {nom: pad.transpose(2, 0, 1)[None]})[0][0].transpose(1, 2, 0)[:th * 4, :tw * 4]
            wy = np.minimum(np.arange(th * 4) + 1, np.arange(th * 4)[::-1] + 1).clip(1, M * 4)[:, None, None].astype(np.float32)
            wx = np.minimum(np.arange(tw * 4) + 1, np.arange(tw * 4)[::-1] + 1).clip(1, M * 4)[None, :, None].astype(np.float32)
            out[ya * 4:y1 * 4, xa * 4:x1 * 4] += r * wy * wx; cnt[ya * 4:y1 * 4, xa * 4:x1 * 4] += wy * wx
    return np.clip(out / np.maximum(cnt, 1e-6) * 255.0, 0, 255)


def lab(x): return cv2.cvtColor(np.clip(x, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)


def accorde(rgb, a, ref_pixels, force=0.4):
    """transfert de Reinhard partiel (moyenne et écart de chaque canal Lab) vers les pixels de référence."""
    L = lab(rgb); m = a > 0.5
    if ref_pixels is None or len(ref_pixels) < 100 or not m.any(): return rgb
    R = lab(ref_pixels.reshape(-1, 1, 3)).reshape(-1, 3); S = L[m]
    for c in range(3):
        mu_s, sd_s, mu_r, sd_r = S[:, c].mean(), S[:, c].std() + 1e-6, R[:, c].mean(), R[:, c].std() + 1e-6
        cible = (L[..., c] - mu_s) * (sd_r / sd_s) ** 0.5 + (0.65 * mu_s + 0.35 * mu_r)
        L[..., c] = (1 - force) * L[..., c] + force * cible
    return cv2.cvtColor(np.clip(L, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32)


def lacet_peint(rgba):
    """orientation peinte du visage d'une figure, en degrés (+ = tourné vers la droite de l'écran), par la mesure du moteur
    (tourne.py : nez entre les coins des yeux, FaceLandmarker, tan θ = 1,8 (r − 0,5)) ; None si aucun visage n'est lu."""
    import visage_mesure as VM
    a = rgba[..., 3:4].astype(np.float32) / 255.0; im = (rgba[..., :3].astype(np.float32) * a + 128.0 * (1 - a)).astype(np.uint8)
    tete = im[:max(64, im.shape[0] // 3)]; k = max(1.0, 512.0 / tete.shape[1])
    tete = cv2.resize(tete, (int(tete.shape[1] * k), int(tete.shape[0] * k)), interpolation=cv2.INTER_CUBIC)
    mp, fl = VM._fl()
    r = fl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(tete)))
    if not r.face_landmarks: return None
    P = r.face_landmarks[0]; r_ = (P[1].x - P[33].x) / max(1e-6, P[263].x - P[33].x)
    return round(float(np.degrees(np.arctan(1.8 * (r_ - 0.5)))), 1)


# MIROIR DE CASTING (19/10/2026) — vu au premier essai de la troupe élargie : les figures des galeries sont presque toutes
# peintes de trois quarts vers la droite de l'écran ; Sœur Awa, posée à droite de Maître Koné, lui tournait le dos (porte des
# regards : 0,0 sur ses 6 répliques). Un visage peint tourné de plus de MIROIR_MIN degrés à l'opposé de ses partenaires est
# posé en miroir, comme un animateur retourne un personnage pour le champ-contrechamp. COMPOSE_MIROIR=0 coupe la règle.
MIROIR_MIN = 8.0


def compose(plaque, acteurs, ppm, sol_y, ref=None, L=None):
    """plaque : RGB ; acteurs : [(nom, rgba, taille_m, x_frac)] de gauche à droite ; L : lumière mesurée du décor
    (lumiere.json : direction, longueur et couleur des ombres peintes) → (image RGB uint8, placements).
    Deux passes : toutes les ombres sur le décor d'abord (physique.ombre, la loi du moteur), puis les personnages."""
    H, W = plaque.shape[:2]; out = plaque.astype(np.float32); places, poses, alphas_pleins = [], [], []
    for i, (nom, rgba, taille, xf) in enumerate(acteurs):
        a = rgba[..., 3].astype(np.float32) / 255.0; ys, xs = np.nonzero(a > 0.05)
        rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        autres = [z[3] for j, z in enumerate(acteurs) if j != i]; lp = miroir = None
        if autres and os.environ.get('COMPOSE_MIROIR', '1') == '1':
            lp = lacet_peint(rgba); vers = np.sign(np.mean(autres) - xf)
            if lp is not None and lp * vers < -MIROIR_MIN:   # le visage peint regarde à l'opposé de ses partenaires
                rgba = np.ascontiguousarray(rgba[:, ::-1]); a = np.ascontiguousarray(a[:, ::-1]); miroir = True
        rgb = etend_couleurs(rgba[..., :3], a)
        th = int(round(taille * ppm)); tw = int(round(rgb.shape[1] * th / rgb.shape[0]))
        if th > 1.15 * rgb.shape[0]:   # figure plus petite que sa taille à l'écran : détails rendus par Swin2SR
            rgb = agrandit(np.clip(rgb, 0, 255).astype(np.uint8)); a = cv2.resize(a, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_CUBIC)
        rgb = cv2.resize(rgb, (tw, th), interpolation=cv2.INTER_AREA); a = np.clip(cv2.resize(a, (tw, th), interpolation=cv2.INTER_AREA), 0, 1)
        cx = int(round(xf * W)); x0, y0 = cx - tw // 2, int(sol_y) - th
        if ref is not None: reg = ref
        else:
            zy0, zy1 = max(0, int(sol_y) - th), min(H, int(sol_y) + 10); zx0, zx1 = max(0, x0 - tw), min(W, x0 + 2 * tw)
            reg = plaque[zy0:zy1, zx0:zx1].reshape(-1, 3)
        rgb = accorde(rgb, a, reg); a = cv2.GaussianBlur(a, (0, 0), 0.6)
        X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(W, x0 + tw), min(H, y0 + th)
        full = np.zeros((H, W), np.float32); full[Y0:Y1, X0:X1] = a[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
        poses.append((rgb, a, x0, y0, X0, Y0, X1, Y1)); pied = (cx, int(sol_y)); alphas_pleins.append(full)
        if L is not None:   # ombre portée + contact, couleur des ombres peintes du décor (physique.py)
            import physique
            physique.applique_ombre(out, physique.ombre(full, pied, th, L, H, W), L)
        else:
            sh = np.zeros((H, W), np.float32)
            cv2.ellipse(sh, (cx, int(sol_y) - 2), (int(tw * 0.45), max(3, int(tw * 0.08))), 0, 0, 360, 1, -1)
            sh = cv2.GaussianBlur(sh, (0, 0), max(2.0, tw * 0.05)); out *= (1 - 0.42 * sh)[..., None]
        places.append({'nom': nom, 'bbox': [X0, Y0, X1, Y1], 'pieds_y': int(sol_y), 'x': cx, 'hauteur_px': th, 'taille_m': taille,
                       'lacet_peint': lp, 'miroir': bool(miroir)})
    fond = np.clip(out, 0, 255).astype(np.uint8)   # le décor avec les ombres, sans les personnages : la plaque exacte du moteur
    for k, (rgb, a, x0, y0, X0, Y0, X1, Y1) in enumerate(poses):
        aa = a[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0, None]
        for j in range(k): alphas_pleins[j] *= (1 - alphas_pleins[k])   # couverture exacte : ce que le suivant cache n'est plus visible
        out[Y0:Y1, X0:X1] = out[Y0:Y1, X0:X1] * (1 - aa) + rgb[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0] * aa
    for p_, al_ in zip(places, alphas_pleins): p_['_alpha'] = al_
    return np.clip(out, 0, 255).astype(np.uint8), places, fond


if __name__ == '__main__':
    args = sys.argv[1:]; ref = None; L = None
    if '--lumiere' in args:
        i = args.index('--lumiere'); L = json.load(open(args[i + 1])); args = args[:i] + args[i + 2:]
    if '--ref' in args:
        i = args.index('--ref'); j = i + 1
        while j < len(args) and args[j].endswith('.png') and '|' not in args[j]: j += 1
        im = cv2.cvtColor(cv2.imread(args[i + 1]), cv2.COLOR_BGR2RGB)
        ref = np.concatenate([im[cv2.imread(m, 0) > 127] for m in args[i + 2:j]]) if j > i + 2 else None
        args = args[:i] + args[j:]
    plaque_p, sortie, ppm, sol_y = args[0], args[1], float(args[2]), float(args[3])
    acteurs = []
    for s in args[4:]:
        nom, png, t, xf = s.split('|'); acteurs.append((nom, cv2.cvtColor(cv2.imread(png, cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA), float(t), float(xf)))
    acteurs.sort(key=lambda z: z[3])
    plaque = cv2.cvtColor(cv2.imread(plaque_p), cv2.COLOR_BGR2RGB)
    img, places, fond = compose(plaque, acteurs, ppm, sol_y, ref, L)
    cv2.imwrite(sortie, cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
    cv2.imwrite(os.path.splitext(sortie)[0] + '-fond.png', cv2.cvtColor(fond, cv2.COLOR_RGB2BGR))
    for k, p_ in enumerate(places):   # découpe EXACTE de chaque personnage (16 bits, de gauche à droite), lue ensuite par
        p_['alpha'] = os.path.basename(os.path.splitext(sortie)[0]) + f'-alpha-{k}.png'   # prepare_rig à la place d'une segmentation
        cv2.imwrite(os.path.join(os.path.dirname(os.path.abspath(sortie)), p_['alpha']), np.clip(p_.pop('_alpha') * 65535, 0, 65535).astype(np.uint16))
    json.dump({'plaque': os.path.abspath(plaque_p), 'px_par_m': ppm, 'sol_y': sol_y, 'acteurs': places}, open(os.path.splitext(sortie)[0] + '.json', 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(places, ensure_ascii=False))
