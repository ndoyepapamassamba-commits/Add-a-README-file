# GESTES DES BRAS (17/10/2026) — juge JEV : « jeu des personnages » 0,98 contre 1,63 pour vos TikTok (Grok) ; le moteur
# pliait le buste et la tête, jamais les bras. Méthode des papiers découpés (Live2D ; DragonBones, MIT), réécrite :
#   1. l'avant-bras et la main deviennent un CALQUE : la peau du corps (segmentation multiclasse MediaPipe, Apache-2.0)
#      qui touche le segment coude → poignet → main (repères MediaPipe Pose) ; manche longue (peu de peau sur
#      l'avant-bras) → seule la main est un calque et elle pivote au poignet ;
#   2. ce qu'il y avait sous le bras est reconstitué par LaMa (Suvorov et al. 2022, Apache-2.0, ONNX déjà dans nos
#      modèles) — Telea (OpenCV, BSD) laissait une bavure et l'ombre de la main (vu le 17/10 sur la table de Coumba) ;
#   3. à chaque image le calque pivote au coude (ou au poignet) de l'angle voulu par la réplique, fondu à l'articulation ;
#      le sens est choisi pour que la main MONTE (geste qui explique, accuse, marchande).
#   prepare(img, alpha, pts, visage_box) → bras ; applique(src, alpha, bras, angles) → (src', alpha')
import os, numpy as np, cv2
_LAMA = {}


def remplit(rgb, trou):
    """reconstitue les pixels du trou : LaMa sur une fenêtre carrée 512 × 512 autour, sinon Telea."""
    if 's' not in _LAMA:
        try:
            import onnxruntime as ort
            f = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/lama_fp32.onnx'
            _LAMA['s'] = ort.InferenceSession(f, providers=['CPUExecutionProvider']) if os.path.isfile(f) else None
        except Exception:
            _LAMA['s'] = None
    s = _LAMA['s']
    if s is None: return cv2.inpaint(rgb, trou, 7, cv2.INPAINT_TELEA)
    h, w = trou.shape; n = [i.name for i in s.get_inputs()]
    im = cv2.resize(rgb, (512, 512), interpolation=cv2.INTER_AREA if max(h, w) > 512 else cv2.INTER_CUBIC).astype(np.float32) / 255
    mk = (cv2.resize(trou, (512, 512), interpolation=cv2.INTER_NEAREST) > 0).astype(np.float32)
    r = s.run(None, {n[0]: im.transpose(2, 0, 1)[None], n[1]: mk[None, None]})[0][0].transpose(1, 2, 0)
    r = cv2.resize(np.clip(r if r.max() > 2 else r * 255, 0, 255).astype(np.uint8), (w, h), interpolation=cv2.INTER_CUBIC)
    out = rgb.copy(); out[trou > 0] = r[trou > 0]
    return out

BRAS = {'gauche': (11, 13, 15, 17, 19), 'droit': (12, 14, 16, 18, 20)}   # épaule, coude, poignet, auriculaire, index


def _segment(xs, ys, A, B):
    d = B - A; L2 = float(d @ d) + 1e-6
    s = ((xs - A[0]) * d[0] + (ys - A[1]) * d[1]) / L2
    sc = np.clip(s, 0, 1)
    return s, np.hypot(xs - (A[0] + sc * d[0]), ys - (A[1] + sc * d[1]))


_SEG = {}


def peau_corps(img, box):
    """probabilité « peau du corps » (bras, mains, jambes, cou) par la segmentation multiclasse de MediaPipe (Apache-2.0,
    selfie_multiclass_256x256 : 0 fond, 1 cheveux, 2 peau du corps, 3 visage, 4 vêtements, 5 accessoires) — vérifiée sur
    les 7 personnages 3D de la troupe le 17/10 ; remplace le modèle de couleur du visage, qui ratait les doigts dans l'ombre."""
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    if 's' not in _SEG:
        f = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/selfie_multiclass_256x256.tflite'
        _SEG['s'] = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=f), output_confidence_masks=True))
    H, W = img.shape[:2]; x0, y0, x1, y1 = [int(v) for v in box]; x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    r = _SEG['s'].segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img[y0:y1, x0:x1])))
    out = np.zeros((H, W), np.float32)   # peau du corps + accessoires (bracelets, bagues : ils suivent la main — vu le 17/10, Coumba)
    out[y0:y1, x0:x1] = np.clip(np.squeeze(r.confidence_masks[2].numpy_view()) + np.squeeze(r.confidence_masks[5].numpy_view()), 0, 1); return out


def personne(img, box):
    """probabilité « personne » (tout sauf le fond) par la même segmentation multiclasse : sert à retirer de la découpe
    d'un acteur le décor qui y était pris (le linge derrière Baye, vu le 17/10)."""
    peau_corps(img, box)   # crée le segmenteur si besoin
    import mediapipe as mp
    H, W = img.shape[:2]; x0, y0, x1, y1 = [int(v) for v in box]; x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    r = _SEG['s'].segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img[y0:y1, x0:x1])))
    out = np.zeros((H, W), np.float32); out[y0:y1, x0:x1] = 1 - np.squeeze(r.confidence_masks[0].numpy_view()); return out


def classes(img, box):
    """les 6 probabilités de la segmentation multiclasse (fond, cheveux, peau du corps, visage, vêtements, accessoires)."""
    peau_corps(img, box)
    import mediapipe as mp
    H, W = img.shape[:2]; x0, y0, x1, y1 = [int(v) for v in box]; x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    r = _SEG['s'].segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img[y0:y1, x0:x1])))
    out = np.zeros((6, H, W), np.float32)
    for k in range(6): out[k, y0:y1, x0:x1] = np.squeeze(r.confidence_masks[k].numpy_view())
    return out


def ferme():
    """libère le segmenteur MediaPipe une fois les bras préparés (sinon il se ferme mal à la sortie de Python)."""
    if 's' in _SEG: _SEG.pop('s').close()


def _lisse(x, a, b): x = np.clip((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x)


def details(fond, orig, trou, calque):
    """la reconstitution garde le grain du dessin : l'énergie des hautes fréquences du trou est ramenée à celle du même
    matériau autour (gain ≤ 2,5), sinon une zone reconstituée paraît plus lisse que le reste (mesuré : 0,3 à 0,7)."""
    f = fond.astype(np.float32); bas = cv2.GaussianBlur(f, (0, 0), 1.6); haut = f - bas
    o = orig.astype(np.float32); ho = o - cv2.GaussianBlur(o, (0, 0), 1.6)
    dedans = cv2.erode(trou, np.ones((5, 5), np.uint8)) > 0
    autour = (cv2.dilate(trou, np.ones((41, 41), np.uint8)) > 0) & (trou == 0) & (cv2.dilate((calque > 0.05).astype(np.uint8), np.ones((9, 9), np.uint8)) == 0)
    if not dedans.any() or autour.sum() < 50: return fond
    g = float(np.clip(np.sqrt(ho[autour].var() / max(1e-6, haut[dedans].var())), 1.0, 2.5))
    m = cv2.GaussianBlur((trou > 0).astype(np.float32), (0, 0), 2)[..., None]
    return np.clip(bas + haut * (1 + (g - 1) * m), 0, 255).astype(np.uint8)


def remplit_natif(img, trou_plein):
    """LaMa sur une fenêtre 512 × 512 prise à la résolution d'origine autour du trou (aucun rééchantillonnage : plus net)."""
    remplit(np.zeros((8, 8, 3), np.uint8), np.zeros((8, 8), np.uint8)); s = _LAMA['s']
    H, W = trou_plein.shape; ys, xs = np.nonzero(trou_plein)
    if s is None or not len(xs) or xs.max() - xs.min() > 470 or ys.max() - ys.min() > 470 or H < 512 or W < 512:
        return remplit(img, trou_plein)
    cx, cy = (xs.min() + xs.max()) // 2, (ys.min() + ys.max()) // 2; n = [i.name for i in s.get_inputs()]
    x0 = int(np.clip(cx - 256, 0, W - 512)); y0 = int(np.clip(cy - 256, 0, H - 512))
    win = img[y0:y0 + 512, x0:x0 + 512].astype(np.float32) / 255; mk = (trou_plein[y0:y0 + 512, x0:x0 + 512] > 0).astype(np.float32)
    r = s.run(None, {n[0]: win.transpose(2, 0, 1)[None], n[1]: mk[None, None]})[0][0].transpose(1, 2, 0)
    r = np.clip(r if r.max() > 2 else r * 255, 0, 255).astype(np.uint8); out = img.copy()
    sub = out[y0:y0 + 512, x0:x0 + 512]; sub[mk > 0] = r[mk > 0]; return out


def prepare(img, alpha, pts, visage_box, bbox=None):
    H, W = img.shape[:2]; p = np.asarray(pts, np.float32); out = []
    if visage_box is None: return out
    if bbox is None: ys_, xs_ = np.nonzero(alpha > 0.3); bbox = (xs_.min(), ys_.min(), xs_.max(), ys_.max())
    bx0, by0, bx1, by1 = [int(v) for v in bbox]; mgb = int(0.1 * max(bx1 - bx0, by1 - by0))
    pk_plein = peau_corps(img, (bx0 - mgb, by0 - mgb, bx1 + mgb, by1 + mgb)) * np.clip(alpha, 0, 1)   # la peau de CET acteur seulement
    for cote, (ie, ic, ip, iau, iin) in BRAS.items():
        E, P = p[ic, :2], p[ip, :2]; lf = float(np.hypot(*(P - E)))
        if lf < 18 or (p.shape[1] > 2 and min(p[ic, 2], p[ip, 2]) < 0.3): continue
        main = (p[iau, :2] + p[iin, :2]) / 2 if p.shape[1] < 3 or min(p[iau, 2], p[iin, 2]) >= 0.3 else P + 0.4 * (P - E)
        if np.hypot(*(main - P)) < 0.15 * lf: main = P + 0.4 * (P - E)
        Hc = (P + main) / 2; rh = max(0.6 * lf, 1.0 * float(np.hypot(*(main - P))))
        mg = 1.4 * lf + rh; pts_ = np.array([E, P, main])
        x0, y0 = [int(max(0, v - mg)) for v in pts_.min(0)]; x1, y1 = int(min(W, pts_[:, 0].max() + mg)), int(min(H, pts_[:, 1].max() + mg))
        if x1 - x0 < 8 or y1 - y0 < 8: continue
        ys, xs = np.mgrid[y0:y1, x0:x1].astype(np.float32); reg = np.ascontiguousarray(img[y0:y1, x0:x1])
        s, d = _segment(xs, ys, E, P)
        zone = np.maximum(_lisse(0.5 * lf + 4 - d, 0, 8) * (s > -0.1) * (s < 1.15), _lisse(rh + 4 - np.hypot(xs - Hc[0], ys - Hc[1]), 0, 8))
        pk = pk_plein[y0:y1, x0:x1] * zone
        # le bras = la (les) tache(s) de peau qui touche(nt) le segment coude → main ; les autres peaux (jambes, cou) restent
        n_, lab = cv2.connectedComponents((pk > 0.5).astype(np.uint8)); garde = np.zeros_like(pk, bool)
        axe = ((s > 0.35) & (s < 1.0) & (d < 0.2 * lf)) | (np.hypot(xs - Hc[0], ys - Hc[1]) < 0.35 * rh)
        for k in range(1, n_):
            if (axe & (lab == k)).any(): garde |= lab == k
        if garde.sum() < 40: continue
        bras_m = cv2.GaussianBlur(cv2.dilate(garde.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), 1.0)
        nue = float(garde[(s > 0.2) & (s < 0.9) & (d < 0.25 * lf)].mean()) if ((s > 0.2) & (s < 0.9) & (d < 0.25 * lf)).any() else 0.0
        if nue >= 0.4:   # avant-bras nu : le calque va du coude au bout des doigts, fondu au coude
            piv = E; fondu = np.where(s > 1.0, 1.0, _lisse(s, 0.06, 0.32))
        else:            # manche : seule la main pivote, au poignet
            piv = P; sh, _ = _segment(xs, ys, P, main); fondu = _lisse(sh, -0.3, 0.1)
        sil = (bras_m * np.clip(alpha[y0:y1, x0:x1], 0, 1)).astype(np.float32)   # silhouette (bord anticrénelé)
        calque = (sil * fondu).astype(np.float32)                                # × fondu à l'articulation
        if calque.sum() < 40: continue
        trou = cv2.dilate((calque > 0.04).astype(np.uint8), np.ones((15, 15), np.uint8))   # bord adouci et ombre portée de la main compris
        tp = np.zeros((H, W), np.uint8); tp[y0:y1, x0:x1] = trou
        fond = details(remplit_natif(img, tp)[y0:y1, x0:x1], reg, trou, calque)
        def main_apres(a):
            M = cv2.getRotationMatrix2D((float(piv[0]), float(piv[1])), a, 1.0); return M @ np.array([Hc[0], Hc[1], 1.0])
        sens = 1.0 if main_apres(20)[1] < main_apres(-20)[1] else -1.0
        # empreinte = le calque élargi de 2 px (bord adouci) EN GARDANT son fondu à l'articulation (dilatation en niveaux de gris) :
        # au coude, le bras ne quitte pas sa place, rien n'y est reconstitué
        empreinte = cv2.GaussianBlur(cv2.dilate(calque, np.ones((5, 5), np.uint8)), (0, 0), 1.0)
        bras_seul = (calque > 0.3).astype(np.uint8)   # le bras prolongé par SES couleurs : on ne connaît que lui, le reste est rempli depuis lui
        rgb_ext = cv2.inpaint(reg, (1 - bras_seul) * cv2.dilate(bras_seul, np.ones((11, 11), np.uint8)), 4, cv2.INPAINT_TELEA)
        calque_ext = cv2.GaussianBlur(cv2.dilate(calque, np.ones((9, 9), np.uint8)), (0, 0), 1.2)   # même fondu, 4 px de plus
        # tronc du personnage dans la boîte du bras : sa découpe sans ce bras, rognée d'un dixième d'avant-bras (bords tolérés)
        e_ = max(3, int(0.1 * lf)) | 1
        tronc = cv2.erode(((alpha[y0:y1, x0:x1] > 0.5) & ~(cv2.dilate((calque > 0.1).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0)).astype(np.uint8),
                          np.ones((e_, e_), np.uint8))
        b = dict(cote=cote, nu=nue >= 0.4, piv=piv.astype(np.float32), x=float(piv[0]), lf=lf, box=(x0, y0, x1, y1), tronc=tronc,
                 rgb=reg, calque=calque, sil=sil, fondu=fondu.astype(np.float32), fond=fond, trou=trou.astype(bool), sens=sens, Hc=Hc.astype(np.float32),
                 empreinte=empreinte, rgb_ext=rgb_ext, calque_ext=calque_ext)
        b.update(enveloppe(b)); out.append(b)
    return sans_doublon(out, (H, W))


# PAS DEUX CALQUES POUR UNE MÊME MAIN (19/10/2026, v11 : « dédoublement de main au maquis avec la femme »). Les repères RTMW ont
# trouvé le bras droit de Coumba, presque caché derrière son bras gauche : son calque (3 400 px) reprenait la main posée près
# de l'assiette, déjà dans le calque du bras gauche ; chaque calque la faisait pivoter de son côté — deux mains à l'image.
# Deux calques d'un même acteur qui se recouvrent au-delà de RECOUVRE_MAX (part du plus petit) : seul le plus visible reste.
RECOUVRE_MAX = 0.08


def sans_doublon(bras, forme):
    if len(bras) < 2: return bras
    def plein(b):
        m = np.zeros(forme, bool); x0, y0, x1, y1 = b['box']; m[y0:y1, x0:x1] = np.asarray(b['calque']) > 0.3; return m
    M = [plein(b) for b in bras]; aire = [max(1, int(m.sum())) for m in M]; garde = list(range(len(bras)))
    for i in range(len(bras)):
        for j in range(i + 1, len(bras)):
            if i not in garde or j not in garde: continue
            r = float((M[i] & M[j]).sum()) / min(aire[i], aire[j])
            if r > RECOUVRE_MAX:
                k = i if aire[i] < aire[j] else j; garde.remove(k)
                print(f"  calque de bras {bras[k]['cote']} retiré : il recouvre l'autre bras à {r:.0%} (même main peinte deux fois)", flush=True)
    return [bras[k] for k in garde]


VIDE_MAX = 0.01   # part de l'empreinte du bras qu'un geste peut laisser vide : le bruit du bord adouci, pas plus (« aucun défaut », 17/10)


def enveloppe(b):
    """le geste le plus ample que CE bras peut faire sans défaut : parmi (angle, avancée vers la caméra), celui qui déplace
    le plus la main en laissant au plus VIDE_MAX du bras à reconstituer. L'avancée (échelle autour du coude) fait venir la
    main vers la caméra comme en perspective : elle recouvre sa propre place (forme étoilée autour du coude)."""
    x0, y0, x1, y1 = b['box']; w, h = x1 - x0, y1 - y0; orig = b['empreinte'] > 0.5; n = max(1, int(orig.sum()))
    best = (0.0, 1.0, 0.0, 0.0)
    # borne anatomique : un avant-bras ne s'allonge pas (+10 % au plus, lu comme « vient vers la caméra ») ; une main seule
    # peut grossir de 20 % (elle avance) — au-delà, JEV voit un bras étiré (mesuré le 17/10 : Petit Mamadou ×1,3 → 0,92)
    for ech in np.arange(1.0, (1.10 if b['nu'] else 1.20) + 1e-6, 0.02):
        for ang in range(0, 38, 2):
            M = cv2.getRotationMatrix2D((float(b['piv'][0] - x0), float(b['piv'][1] - y0)), ang * b['sens'], ech)
            vide = float((orig & ~(cv2.warpAffine(b['calque_ext'], M, (w, h)) > 0.5)).sum()) / n
            if vide > VIDE_MAX: continue
            hc = M @ np.array([b['Hc'][0] - x0, b['Hc'][1] - y0, 1.0]); dep = float(np.hypot(hc[0] - (b['Hc'][0] - x0), hc[1] - (b['Hc'][1] - y0)))
            dep += 0.6 * (ech - 1) * b['lf']   # venir vers la caméra se voit aussi (la main grossit)
            if dep > best[2] + 0.5: best = (float(ang), round(float(ech), 3), dep, vide)
    return dict(amax=best[0], emax=best[1], deplacement=round(best[2], 1), vide=round(best[3], 3))


# GESTE QUI DÉCOUVRE SA PLACE (19/10/2026). L'utilisateur : « les personnages ne sont pas encore fluides dans leurs mouvements
# et gestes ». Mesure : l'enveloppe ci-dessus (le bras doit recouvrir sa propre place, VIDE_MAX = 1 %) bornait les gestes à
# 0–14° sur les 11 bras de l'épisode 1, et à 0° pour toute main posée (table, hanche) : des bras figés. Or le fond reconstitué
# sous chaque bras (LaMa + grain du dessin) est propre — planche du 19/10 : bras effacé, robe, table et cuisse redessinées,
# avant-bras levé de 25° lisible (Coumba lève sa fourchette, Tantie Awa décolle la main de la hanche). Comme chez les
# conversants réels (l'orateur quitte la position de repos des mains pour gesticuler, l'auditeur la garde — Hladek et al.
# 2025, arXiv 2512.03636), le bras peut désormais LAISSER VOIR sa place : jusqu'à ANGLE_REVELE quand le fond passe deux
# contrôles mesurés — pas de bras fantôme redessiné par LaMa (couleurs du bras retrouvées au cœur du trou) et pas de couleur
# étrangère au voisinage — et tant que le bras tourné reste dans sa boîte.
ANGLE_REVELE = (28.0, 20.0)   # degrés : avant-bras nu (pivot au coude), main seule (pivot au poignet, manche longue)
FANTOME_MAX, ETRANGER_MAX = 0.3, 0.15
TRONC_MAX = 0.06   # part de la surface du bras qui peut venir couvrir le tronc en tournant (bord adouci, pas plus)


def qualite_fond(b):
    """→ {fantome, etranger} : part du cœur du trou où le fond reconstitué garde la couleur du bras (ΔE Lab < 18), et part
    dont la couleur est loin (ΔE > 28) des 12 couleurs dominantes du voisinage."""
    rgb = np.asarray(b['rgb'], np.uint8); fond = np.asarray(b['fond'], np.uint8); t = np.asarray(b['trou'], np.uint8)
    coeur = (np.asarray(b['calque']) > 0.6) & (cv2.erode(t, np.ones((5, 5), np.uint8)) > 0)
    autour = (cv2.dilate(t, np.ones((31, 31), np.uint8)) > 0) & (t == 0)
    if coeur.sum() < 30 or autour.sum() < 50: return dict(fantome=1.0, etranger=1.0)
    lf = cv2.cvtColor(fond, cv2.COLOR_RGB2LAB).astype(np.float32); lo = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    fantome = float(np.mean(np.abs(lf[coeur] - lo[coeur]).sum(1) < 18))
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0); cv2.setRNGSeed(7)
    _, _, cen = cv2.kmeans(lo[autour].astype(np.float32), 12, None, crit, 2, cv2.KMEANS_PP_CENTERS)
    etranger = float(np.mean(np.min(np.linalg.norm(lf[coeur][:, None, :] - cen[None], axis=2), 1) > 28))
    return dict(fantome=round(fantome, 3), etranger=round(etranger, 3))


def enveloppe_revelee(b):
    """le geste le plus ample quand le bras peut découvrir sa place : angle (pas de 2°) jusqu'à ANGLE_REVELE, tant que 98 %
    du calque tourné reste dans la boîte du bras ; refusé (revele=False) si le fond reconstitué échoue à un contrôle."""
    q = qualite_fond(b)
    if q['fantome'] > FANTOME_MAX or q['etranger'] > ETRANGER_MAX: return dict(q, revele=False)
    x0, y0, x1, y1 = [int(v) for v in b['box']]; w, h = x1 - x0, y1 - y0; c = np.asarray(b['calque'], np.float32); n = max(1.0, float(c.sum()))
    best = float(b.get('amax', 0.0)); lim = ANGLE_REVELE[0] if b['nu'] else ANGLE_REVELE[1]
    tronc = np.asarray(b['tronc'], bool) if 'tronc' in b else None
    for ang in np.arange(2.0, lim + 1e-6, 2.0):
        M = cv2.getRotationMatrix2D((float(b['piv'][0] - x0), float(b['piv'][1] - y0)), float(ang * b['sens']), 1.0)
        r_ = cv2.warpAffine(c, M, (w, h))
        if float(r_.sum()) / n < 0.98: break
        # LA MAIN NE TRAVERSE PAS LE CORPS (19/10/2026, v11 : « la main de Tantie traverse son corps ») : le bras tourné ne vient
        # pas couvrir le tronc au-delà de TRONC_MAX de sa propre surface
        if tronc is not None and float(((r_ > 0.5) & tronc & ~(c > 0.5)).sum()) / n > TRONC_MAX: break
        best = max(best, float(ang))
    return dict(q, revele=True, amax=best)


def pose_geste(a):
    """(angle en degrés, échelle) d'un geste ; un nombre seul = angle, échelle 1."""
    return (float(a[0]), float(a[1])) if isinstance(a, (tuple, list)) else (float(a), 1.0)


def applique(src, alpha, bras, angles):
    """pose les bras : angle (degrés, positif = la main monte) et échelle (> 1 : la main vient vers la caméra, comme en
    perspective — elle recouvre alors sa propre place : presque rien à reconstituer). Ne copie l'image que s'il y a un geste."""
    actifs = [(b, *pose_geste(a)) for b, a in zip(bras, angles)]; actifs = [x for x in actifs if abs(x[1]) > 0.3 or abs(x[2] - 1) > 0.004]
    if not actifs: return src, alpha
    src = src.copy(); alpha = alpha.copy()
    for b, a, ech in actifs:
        x0, y0, x1, y1 = b['box']; w, h = x1 - x0, y1 - y0
        M = cv2.getRotationMatrix2D((float(b['piv'][0] - x0), float(b['piv'][1] - y0)), float(a * b['sens']), ech)
        rgb = cv2.warpAffine(b['rgb'], M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        al = cv2.warpAffine(b['calque'], M, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)[..., None]
        rgb_e = cv2.warpAffine(b['rgb_ext'], M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        al_e = cv2.warpAffine(b['calque_ext'], M, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)[..., None]
        reg = src[y0:y1, x0:x1].astype(np.float32); k = min(1.0, max(abs(a) / 4.0, abs(ech - 1) / 0.03))   # petit geste : presque l'original (pas de saut)
        libre = (b['empreinte'][..., None] * (1 - al)) * k                                  # seule la place que le bras a quittée
        reg = reg * (1 - libre) + b['fond'].astype(np.float32) * libre                     # … reconstituée (≤ 1 % de l'empreinte, voir enveloppe)
        bord = al_e * libre; reg = reg * (1 - bord) + rgb_e.astype(np.float32) * bord       # bande fine : recouverte par le bord du bras
        src[y0:y1, x0:x1] = np.clip(reg * (1 - al) + rgb.astype(np.float32) * al, 0, 255).astype(np.uint8)
        alpha[y0:y1, x0:x1] = np.maximum(alpha[y0:y1, x0:x1], np.maximum(al[..., 0], bord[..., 0]))
    return src, alpha
