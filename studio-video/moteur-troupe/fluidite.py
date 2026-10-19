# FLUIDITÉ MESURÉE (18/10/2026) — consignes : « je tiens sur la fluidité des mouvements, et l'animation de manière
# générale » ; « la vidéo de 18 heures doit respecter tous les critères de fluidité, de mouvement et d'animation à 100 % ;
# elle doit être au niveau de Pixar ». Juge local, sans JEV : chaque critère est une MESURE sur les pixels du film (flux
# optique DIS, OpenCV, Apache-2.0), et chaque seuil vient des animations 3D professionnelles de référence mesurées avec le
# MÊME outil, dans les mêmes unités physiques (pixels par seconde à 288 px de large) : « pas plus saccadé que l'animation
# pro » se vérifie image par image, sans avis.
#   1. images figées en plein mouvement (une image identique à la précédente entre deux images qui bougent : saccade) ;
#   2. sauts dans un plan (ce que le mouvement n'explique pas : l'image prédite par le flux depuis la précédente s'écarte
#      de la vraie — un membre, un visage ou un objet qui « pope ») ;
#   3. à-coups (accélération de l'image d'un coup : départ sec après un maintien, arrêt net) ;
#   4. secousses de caméra (variation brusque de l'accélération du cadrage : à-coup de travelling ou de zoom).
# Les coupes franches entre plans (et 3 images autour) ne comptent pas : un raccord n'est pas un mouvement.
#   python3 fluidite.py calibre <dossier de références .mp4> [seuils.json]   → seuils = 99,5e centile des références
#   python3 fluidite.py juge film.mp4 sortie.json [seuils.json] [--bande y0:y1]
import json, os, sys, glob
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__))
SEUILS = os.path.join(ICI, 'fluidite_seuils.json')
L = 288                 # largeur de mesure (px) : mêmes unités pour le film et les références
CENTILE = 99.5          # seuil = ce que les références pro ne dépassent que 0,5 % du temps
_DIS = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_FAST)


def _gris(f, bande=None):
    if bande: f = f[bande[0]:bande[1]]
    h = int(round(f.shape[0] * L / f.shape[1])); return cv2.cvtColor(cv2.resize(f, (L, h), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)


def series(mp4, bande=None):
    """→ (fps, dict de séries image par image) : écart moyen d, vitesse v (px/s), résidu du flux r (niveaux de gris),
    caméra c (médiane du flux, px/s, 2 composantes), coupe (bool)."""
    cap = cv2.VideoCapture(mp4); fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    prev = None; d, v, r, c, coupe = [], [], [], [], []
    h0 = None
    while True:
        ok, f = cap.read()
        if not ok: break
        g = _gris(f, bande)
        hist = cv2.calcHist([g], [0], None, [32], [0, 256]).ravel(); hist /= hist.sum() + 1e-9
        if prev is not None:
            fl = _DIS.calc(g, prev, None)                       # flux t → t−1 : où chaque pixel de t était en t−1
            hh, ww = g.shape; gx, gy = np.meshgrid(np.arange(ww, dtype=np.float32), np.arange(hh, dtype=np.float32))
            pred = cv2.remap(prev, gx + fl[..., 0], gy + fl[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            m = np.hypot(fl[..., 0], fl[..., 1])
            d.append(float(np.abs(g.astype(np.float32) - prev.astype(np.float32)).mean()))
            v.append(float(m.mean() * fps))
            r.append(float(np.abs(g.astype(np.float32) - pred).mean()))
            c.append((float(np.median(fl[..., 0]) * fps), float(np.median(fl[..., 1]) * fps)))
            coupe.append(bool(0.5 * np.abs(hist - h0).sum() > 0.35))   # changement de plan franc (histogramme)
        prev = g; h0 = hist
    r = np.array(r); coupe = np.array(coupe, bool)
    # raccords que l'histogramme ne voit pas (champ / contrechamp dans le même décor) : ce que le flux n'explique pas du tout
    if len(r): coupe |= r > max(8.0, 6.0 * float(np.median(r)))
    return fps, {'d': np.array(d), 'v': np.array(v), 'r': r, 'c': np.array(c).reshape(-1, 2), 'coupe': coupe}


def _hors_coupes(S, marge=3):
    ok = np.ones(len(S['d']), bool)
    for i in np.flatnonzero(S['coupe']): ok[max(0, i - marge):i + marge + 1] = False
    return ok


def grandeurs(fps, S):
    """grandeurs comparables entre cadences : accélération de l'image (px/s²), secousse caméra (px/s³), résidu."""
    v = S['v']; a = np.r_[0.0, np.abs(np.diff(v)) * fps]
    cam = S['c']; ca = np.vstack([np.zeros((1, 2)), np.diff(cam, axis=0) * fps]) if len(cam) > 1 else np.zeros((len(cam), 2))
    cj = np.r_[0.0, np.hypot(*(np.diff(ca, axis=0) * fps).T)] if len(ca) > 1 else np.zeros(len(cam))
    return {'acc': a, 'secousse': cj / fps, 'residu': S['r']}   # secousse ramenée par image (sinon elle croît comme fps³)


def calibre(dossier, sortie=SEUILS):
    tous = {'acc': [], 'secousse': [], 'residu': []}; n = 0
    for f in sorted(glob.glob(os.path.join(dossier, '*.mp4'))):
        fps, S = series(f); ok = _hors_coupes(S); G = grandeurs(fps, S); n += 1
        for k in tous: tous[k].extend(G[k][ok].tolist())
    s = {k: round(float(np.percentile(x, CENTILE)), 3) for k, x in tous.items()}
    s.update(references=n, images=len(tous['acc']), centile=CENTILE, dossier=os.path.basename(os.path.abspath(dossier)))
    json.dump(s, open(sortie, 'w'), indent=1); return s


def coupes_du_moteur(tournage, timeline=None):
    """instants des raccords écrits par le moteur (début de chaque plan, entrée et sortie des cartes de titre)"""
    T = json.load(open(tournage)); c = sorted({float(p[0]) for p in T.get('decoupage', [])} | {float(p[1]) for p in T.get('decoupage', [])})
    if timeline and os.path.isfile(timeline):
        for k in json.load(open(timeline)).get('cartes', []): c += [float(k['t0']), float(k['t1'])]
    return sorted(c)


def juge(mp4, sortie=None, seuils=SEUILS, bande=None, coupes=None):
    """coupes : instants (s) des raccords connus du moteur ; alors SEULS ces raccords sont exclus — un saut ailleurs est
    un défaut, même s'il ressemble à une coupe."""
    T = json.load(open(seuils)); fps, S = series(mp4, bande)
    if coupes is not None:
        S['coupe'] = np.zeros(len(S['d']), bool)
        for tc in coupes:
            i = int(round(tc * fps)) - 1
            if 0 <= i < len(S['d']): S['coupe'][i] = True
    ok = _hors_coupes(S); G = grandeurs(fps, S)
    d = S['d']; t = lambda i: round((i + 1) / fps, 3)
    figees = [t(i) for i in range(1, len(d) - 1) if ok[i] and d[i] < 0.05 and d[i - 1] > 0.3 and d[i + 1] > 0.3]
    def depasse(k):
        return [{'t': t(i), 'valeur': round(float(G[k][i]), 2)} for i in np.flatnonzero(ok & (G[k] > T[k]))]
    R = {'fps': round(fps, 2), 'images': int(len(d) + 1), 'seuils': {k: T[k] for k in ('acc', 'secousse', 'residu')}, 'reference': T.get('dossier'),
         'figees_en_mouvement': figees, 'sauts': depasse('residu'), 'a_coups': depasse('acc'), 'secousses_camera': depasse('secousse'),
         'centiles_99_5_film': {k: round(float(np.percentile(G[k][ok], CENTILE)), 3) for k in G}}
    R['defauts'] = {k: len(R[k]) for k in ('figees_en_mouvement', 'sauts', 'a_coups', 'secousses_camera')}
    R['ok'] = sum(R['defauts'].values()) == 0
    if sortie: json.dump(R, open(sortie, 'w'), ensure_ascii=False, indent=1)
    return R


# ── SOUPLESSE (18/10/2026, « affine les mouvements en les rendant plus souples ») : les pixels ne disent pas si un geste est
#    souple. Indice SPARC (Balasubramanian et al., 2015 : arc spectral du profil de vitesse, plus proche de 0 = plus souple,
#    indépendant de l'ampleur et de la durée) sur chaque articulation notée par le moteur (mesures-*.jsonl, 30 i/s), par
#    fenêtre de 4 s où l'articulation bouge vraiment ; référence : les MÊMES articulations de vrais corps en capture CMU.
#    Porte : pour chaque articulation, médiane ET 10 % les plus raides au moins aussi souples que les humains.
ARTICULATIONS = ('tete_lacet', 'tete_tangage', 'tete', 'buste', 'buste_lacet')
FEN, FSM = 120, 30.0


def sparc(v, fs, pad=4, fc=10.0, seuil=0.05):
    n = int(2 ** (np.ceil(np.log2(len(v))) + pad)); f = np.arange(n) * fs / n
    M = np.abs(np.fft.fft(v, n)); M = M / max(M.max(), 1e-12); s_ = f <= fc; f, M = f[s_], M[s_]; i = np.flatnonzero(M >= seuil)
    if len(i) < 2: return 0.0
    f, M = f[i[0]:i[-1] + 1], M[i[0]:i[-1] + 1]
    return float(-np.sum(np.sqrt((np.diff(f) / (f[-1] - f[0])) ** 2 + np.diff(M) ** 2)))


def sparc_lot(V, fs, pad=4, fc=10.0, seuil=0.05):
    """sparc() de chaque ligne de V (fenêtres de même longueur) en un seul calcul (19/10/2026, « un film entier en 1 minute » :
    64 538 appels un par un, 11 s par tournage) — mêmes valeurs que sparc(), contrôlées à 1e-9 près."""
    V = np.asarray(V, np.float64)
    if V.ndim != 2 or len(V) == 0: return np.zeros(len(V))
    n = int(2 ** (np.ceil(np.log2(V.shape[1])) + pad)); f = np.arange(n // 2 + 1) * fs / n; s_ = f <= fc
    M = np.abs(np.fft.rfft(V, n, axis=1)); M = M / np.maximum(M.max(1, keepdims=True), 1e-12)
    # le maximum du spectre complet = celui du demi-spectre (spectre d'un signal réel symétrique)
    f, M = f[s_], M[:, s_]; ok = M >= seuil
    i0 = np.argmax(ok, 1); i1 = M.shape[1] - 1 - np.argmax(ok[:, ::-1], 1); assez = ok.sum(1) >= 2
    k = np.arange(M.shape[1] - 1)[None, :]; dans = (k >= i0[:, None]) & (k < i1[:, None])
    largeur = np.where(assez, f[np.minimum(i1, len(f) - 1)] - f[i0], 1.0)
    seg = np.sqrt((np.diff(f)[None, :] / largeur[:, None]) ** 2 + np.diff(M, axis=1) ** 2)
    return np.where(assez, -np.sum(np.where(dans, seg, 0.0), 1), 0.0)


def _fenetres(x):
    out = []
    for i in range(0, len(x) - FEN, FEN // 2):
        v = np.abs(np.gradient(x[i:i + FEN])) * FSM
        if v.mean() > 1.0: out.append(sparc(v, FSM))   # au moins 1°/s en moyenne : un vrai mouvement
    return out


def calibre_souplesse(sortie=SEUILS, cmu=os.path.expanduser('~/.cache/massamba-models/cmu-pistes')):
    ref = {c: [] for c in ARTICULATIONS}
    for f in glob.glob(os.path.join(cmu, '*-v2.npz')):
        z = np.load(f)
        for c in ARTICULATIONS: ref[c] += _fenetres(z[c].astype(float))
    T = json.load(open(sortie)) if os.path.isfile(sortie) else {}
    T['souplesse'] = {c: {'mediane': round(float(np.median(v)), 3), 'p10': round(float(np.percentile(v, 10)), 3), 'fenetres': len(v)} for c, v in ref.items()}
    T['souplesse_reference'] = f'capture CMU ({len(glob.glob(os.path.join(cmu, "*-v2.npz")))} prises)'
    json.dump(T, open(sortie, 'w'), indent=1); return T['souplesse']


def souplesse(dossier, seuils=SEUILS):
    T = json.load(open(seuils))['souplesse']; par = {}
    for f in glob.glob(os.path.join(dossier, 'mesures-*.jsonl')):
        for l in open(f):
            e = json.loads(l)
            if 'pose' in e: par.setdefault(e['qui'], []).append(e)
    mot = {c: [] for c in ARTICULATIONS}
    for L in par.values():
        L.sort(key=lambda e: e['t']); t = np.array([e['t'] for e in L])
        for seg in np.split(np.arange(len(L)), np.flatnonzero(np.diff(t) > 0.1) + 1):
            if len(seg) <= FEN: continue
            for c in ARTICULATIONS: mot[c] += _fenetres(np.array([L[k]['pose'].get(c, 0.0) for k in seg], float))
    R = {}
    for c in ARTICULATIONS:
        if not mot[c]: R[c] = {'ok': True, 'fenetres': 0}; continue
        m, p = float(np.median(mot[c])), float(np.percentile(mot[c], 10))
        R[c] = {'mediane': round(m, 2), 'p10': round(p, 2), 'humains': T[c], 'fenetres': len(mot[c]),
                'ok': m >= T[c]['mediane'] and p >= T[c]['p10']}
    return {'ok': all(r['ok'] for r in R.values()), 'par_articulation': R}


# ── FLOU DE BOUGÉ PHYSIQUE (18/10/2026, « au niveau de Pixar ») : un film d'animation est rendu avec un obturateur (180° :
#    l'image intègre le mouvement pendant la moitié de l'intervalle — Unreal Movie Render Queue, RenderMan), notre moteur
#    rend des instants nets : un geste vif ou un panoramique « stroboscope ». Chaque image est intégrée le long de son flux
#    optique vers l'image précédente et la suivante (DIS, OpenCV), ±¼ d'intervalle à 60 i/s (obturateur 180°), en
#    OBTURATEUR échantillons ; là où rien ne bouge (moins de 0,3 px par image) l'image reste exactement la même (visages
#    immobiles, décor fixe nets), et jamais à travers un raccord.
OBTURATEUR = 7


def _flou_plage(fr, sortie, a, b, raccord, angle):
    """images [a, b) de fr floutées (chaque tranche lit elle-même ses voisines a − 1 et b : résultat identique au tour unique)."""
    import shutil
    cv2.setNumThreads(1)
    n = len(fr); dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_FAST)
    lire = lambda k: cv2.imread(fr[k])
    demi = lambda im: cv2.cvtColor(cv2.resize(im, (im.shape[1] // 2, im.shape[0] // 2), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    k_ = 0.5 * angle / 360.0; flous = 0; grille = {}
    prev = lire(a - 1) if a > 0 else None; g_prev = demi(prev) if prev is not None else None
    cur = lire(a); g_cur = demi(cur)
    for i in range(a, b):
        nxt = lire(i + 1) if i + 1 < n else None; g_nxt = demi(nxt) if nxt is not None else None
        h, w = cur.shape[:2]
        if (h, w) not in grille: grille[(h, w)] = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        gx, gy = grille[(h, w)]
        flux = []
        for voisin, g_v, coupe in ((prev, g_prev, i in raccord or (i - 1) in raccord), (nxt, g_nxt, (i + 1) in raccord or i in raccord)):
            if voisin is None or coupe or np.abs(g_cur.astype(np.int16) - g_v).mean() > 20: flux.append(None); continue
            f = cv2.resize(dis.calc(g_cur, g_v, None), (w, h)) * 2.0
            flux.append(f)
        out = cur
        if any(f is not None for f in flux):
            mag = np.max([np.hypot(f[..., 0], f[..., 1]) for f in flux if f is not None], axis=0)
            if mag.max() > 0.3:
                acc = np.zeros_like(cur, np.float32); m_ = 0
                for s in np.linspace(-k_, k_, OBTURATEUR):
                    f = flux[0] if s < 0 else flux[1]
                    if f is None or s == 0: acc += cur; m_ += 1; continue
                    # flou vectoriel : le contenu qui part vers le voisin de f(x) occupait, à la fraction s, la place x − s·f
                    a_ = np.float32(abs(s)); acc += cv2.remap(cur, gx - a_ * f[..., 0], gy - a_ * f[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).astype(np.float32); m_ += 1
                b_ = acc / m_; wgt = np.clip((mag - 0.3) / 0.7, 0, 1)[..., None]
                out = np.clip(cur * (1 - wgt) + b_ * wgt, 0, 255).astype(np.uint8); flous += 1
        dst = os.path.join(sortie, os.path.basename(fr[i]))
        if out is cur: shutil.copyfile(fr[i], dst)   # rien ne bouge : l'image d'origine, octet pour octet (pas de JPEG refait)
        else: cv2.imwrite(dst, out, [cv2.IMWRITE_JPEG_QUALITY, 95])
        prev, g_prev, cur, g_cur = cur, g_cur, nxt, g_nxt
    return flous


def _flou_tache(arg):
    return _flou_plage(*arg)


def flou_bouge(dossier, sortie=None, angle=180.0, coupes=(), fps=60.0, procs=None):
    """dossier/f*.jpg → sortie (défaut : dossier, les nettes gardées dans dossier + '-net') ; coupes : instants (s).
    EN PARALLÈLE (18/10/2026, v7 : 3 min 50 s sur un seul processus, 56 ms par image) : tranches confiées à `procs`
    processus (défaut : tous les cœurs), chacune lisant ses voisines ; résultat identique octet pour octet au tour unique."""
    import shutil
    from concurrent.futures import ProcessPoolExecutor
    fr = sorted(glob.glob(os.path.join(dossier, 'f*.jpg')))
    if not fr: return {'images': 0}
    if sortie is None:
        net = dossier.rstrip('/') + '-net'
        if not os.path.isdir(net): shutil.copytree(dossier, net)
        src, sortie = net, dossier
    else:
        src = dossier; os.makedirs(sortie, exist_ok=True)
    fr = sorted(glob.glob(os.path.join(src, 'f*.jpg'))); n = len(fr)
    raccord = {int(round(t * fps)) for t in coupes} | {int(round(t * fps)) - 1 for t in coupes}
    procs = max(1, min(procs or os.cpu_count() or 1, n // 24 or 1))
    bornes = [round(k * n / procs) for k in range(procs + 1)]
    taches = [(fr, sortie, a, b, raccord, angle) for a, b in zip(bornes, bornes[1:]) if b > a]
    if len(taches) == 1: flous = _flou_tache(taches[0])
    else:
        import multiprocessing as mp   # « spawn » : un fork après le démarrage des fils d'OpenCV se bloque sur leur verrou (vu le 18/10)
        with ProcessPoolExecutor(len(taches), mp_context=mp.get_context('spawn')) as ex: flous = sum(ex.map(_flou_tache, taches))
    return {'images': n, 'avec_flou': flous, 'obturateur_deg': angle, 'processus': len(taches)}

if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument('action', choices=['calibre', 'juge', 'souplesse']); ap.add_argument('entree'); ap.add_argument('sortie', nargs='?')
    ap.add_argument('--seuils', default=SEUILS); ap.add_argument('--bande'); ap.add_argument('--tournage'); ap.add_argument('--timeline')
    x = ap.parse_args()
    if x.action == 'calibre': print(json.dumps(calibre(x.entree, x.sortie or SEUILS), ensure_ascii=False)); print(json.dumps(calibre_souplesse(x.sortie or SEUILS)))
    elif x.action == 'souplesse': print(json.dumps(souplesse(x.entree, x.seuils), ensure_ascii=False))
    else:
        b = tuple(int(v) for v in x.bande.split(':')) if x.bande else None
        R = juge(x.entree, x.sortie, x.seuils, b, coupes_du_moteur(x.tournage, x.timeline) if x.tournage else None)
        print(json.dumps({k: R[k] for k in ('fps', 'images', 'defauts', 'ok', 'seuils', 'centiles_99_5_film')}, ensure_ascii=False))
