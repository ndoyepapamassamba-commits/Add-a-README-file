# DÉCOR : MOUVEMENT RÉEL TRANSFÉRÉ (17/10/2026). Consignes : « je ne veux rien de procédural, je veux que tout soit
# naturel » ; avis de JEV sur la v27 (« décor mort » : trop peu d'éléments bougent, 0,57–0,63 ; remèdes au plus fort gain :
# vent naturel 2,2–2,4, plus d'ampleur 2,1–2,2). Les sinusoïdes de decor_vivant.py (2 à 3 fréquences par couche) sont
# remplacées par le mouvement de VRAIES vidéos de vent (linge sur une corde, palmes, branches, herbes — vidéos libres Mixkit,
# jamais redistribuées : seul leur mouvement mesuré est gardé).
# Méthode (publiée, réécrite) : comme Generative Image Dynamics (Li, Tucker, Snavely, Holynski, CVPR 2024, prix du meilleur
# article), le mouvement naturel d'une chose qui oscille est appris de vraies vidéos sous forme de trajectoires de pixels ;
# nous ne générons pas ces trajectoires par un réseau : nous les MESURONS (flux optique DIS, Kroeger et al. 2016, OpenCV) sur
# la zone choisie de la vidéo réelle, par rapport à son image « au repos » (celle qui ressemble le plus à toutes les autres),
# en unités de la zone (fraction de sa largeur et de sa hauteur), puis nous les reportons sur la zone peinte (linge, feuillage)
# avec la même géométrie (ancrage en haut : la corde, la branche). Durées plus longues que la vidéo : la prise est jouée en
# aller-retour fondu sur ses moments les plus semblables (pas de saut).
#   extraire(video, zone=(x0,y0,x1,y1) en fractions, grille=(48, 32)) → cache npz {d: (T, gh, gw, 2), fps}
#   champ(prise, t, H, W) → (dx, dy) en fractions de la zone ; poser(...) dans decor_vivant
import os
import numpy as np, cv2

CACHE = os.path.join(os.path.expanduser('~'), '.cache', 'massamba-models', 'vent-reel')
# prises de référence : fichier, zone utile (fractions de l'image), nature — choisies à l'œil sur la planche des vidéos
PRISES = {'linge': ('29445.mp4', (0.40, 0.05, 1.00, 0.60), 'linge sur une corde dans le vent (Mixkit 29445)'),
          'palme': ('4645.mp4', (0.00, 0.00, 0.60, 0.75), 'palmes de cocotier au soleil (Mixkit 4645)'),
          'branches': ('1188.mp4', (0.05, 0.05, 0.95, 0.95), 'branches et feuilles dans la brise (Mixkit 1188)'),
          'herbes': ('95.mp4', (0.05, 0.05, 0.95, 0.95), 'herbes hautes dans le vent (Mixkit 95)')}
SOURCES = os.environ.get('VENT_REEL', '/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/vent-reel')


def extraire(nom, grille=(48, 32), largeur=640):
    """trajectoires mesurées de la prise `nom` : d[t, y, x] = déplacement (fractions de la zone) du point (x, y) de la grille
    entre l'image de repos et l'image t."""
    os.makedirs(CACHE, exist_ok=True); p = os.path.join(CACHE, f'{nom}.npz')
    if os.path.isfile(p):
        z = np.load(p); return {k: z[k] for k in z.files}
    fichier, (a, b, c, d), _ = PRISES[nom]
    cap = cv2.VideoCapture(os.path.join(SOURCES, fichier)); fps = cap.get(cv2.CAP_PROP_FPS) or 30.0; ims = []
    while True:
        ok, im = cap.read()
        if not ok: break
        H, W = im.shape[:2]; im = im[int(b * H):int(d * H), int(a * W):int(c * W)]
        k = largeur / im.shape[1]; ims.append(cv2.cvtColor(cv2.resize(im, None, fx=k, fy=k, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY))
    G = np.stack(ims).astype(np.float32); h, w = G.shape[1:]
    # image de repos : la plus proche de la moyenne temporelle (la pose « moyenne » du tissu, sans flou)
    moy = G.mean(0); r = int(np.argmin([np.abs(g - moy).mean() for g in G])); ref = G[r].astype(np.uint8)
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    gw, gh = grille; out = np.zeros((len(G), gh, gw, 2), np.float32)
    for t, g in enumerate(G):
        f = dis.calc(ref, g.astype(np.uint8), None)                      # repos → image t (où est passé chaque point)
        f = cv2.GaussianBlur(f, (0, 0), 2.0)
        out[t] = cv2.resize(f, (gw, gh), interpolation=cv2.INTER_AREA) / np.array([w, h], np.float32)
    # le repos n'est pas fixe dans une vraie vidéo (caméra tenue à la main) : on retire le mouvement d'ensemble de la zone
    out -= np.median(out.reshape(len(G), -1, 2), axis=1)[:, None, None, :]
    res = {'d': out, 'fps': np.array(fps, np.float32), 'repos': np.array(r)}
    np.savez_compressed(p, **res)
    return res


def _boucle(T, n, fps_src, t):
    """rang (fractionnaire) dans la prise pour l'instant t (s) : aller-retour fondu, sans jamais sauter."""
    u = (t * fps_src) % (2 * (n - 1))
    return u if u <= n - 1 else 2 * (n - 1) - u


def champ(nom, t, gh, gw, decalage=0.0):
    """déplacement (fractions de la zone) sur une grille (gh, gw) à l'instant t ; `decalage` (s) désynchronise deux objets."""
    P = extraire(nom); d = P['d']; n = len(d); fps = float(P['fps'])
    r = _boucle(None, n, fps, t + decalage); i = int(np.floor(r)); f = r - i; j = min(n - 1, i + 1)
    m = d[i] * (1 - f) + d[j] * f
    return cv2.resize(m, (gw, gh), interpolation=cv2.INTER_LINEAR)


def amplitude(nom):
    """ampleur mesurée de la prise (95e centile du déplacement, fractions de zone) — pour comparer au décor peint."""
    d = extraire(nom)['d']; return float(np.percentile(np.linalg.norm(d, axis=-1), 95))


if __name__ == '__main__':
    import sys, time
    for nom in (sys.argv[1:] or PRISES):
        t0 = time.time(); P = extraire(nom)
        print(nom, f"{len(P['d'])} images à {float(P['fps']):.1f} i/s, ampleur p95 {amplitude(nom):.4f} de la zone, {time.time() - t0:.1f} s", flush=True)
