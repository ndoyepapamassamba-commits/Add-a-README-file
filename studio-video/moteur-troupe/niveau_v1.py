# NIVEAU DE LA V1 (20/10/2026) — consignes de l'utilisateur : « en termes d'animation la V1 est très loin devant » ; « je ne peux pas
# publier cette vidéo qui n'est pas du niveau de la V1 » ; « même le type de personnage ne ressemble pas à la V1 ».
# Le juge (9 portes) avait laissé passer la vidéo 2 : il ne compare rien à la V1. Ce contrôle le fait, sans tolérance :
#   1. ANIMATION : part de l'image qui bouge (flux optique Farneback d'OpenCV, BSD, sur la bande image sans titres ni sous-titres),
#      moyenne et 9e décile, au moins celles de la V1 publiée (mesurées le 20/10/2026 : 24,3 % et 66,4 % ; vidéo 2 : 20,4 % et 45,8 %) ;
#   2. TROUPE : seuls les 7 personnages de la V1 ont un rendu validé (dessinés dans leurs décors, marionnettes peintes). Tout autre
#      personnage n'est admis qu'une fois son rendu validé par l'utilisateur (VALIDES, rempli à sa validation) : la vidéo 2 collait
#      des figures de galerie sur le décor (échelle, sol, poses de fiche, style différent).
import cv2, numpy as np

REF = {'surface': 0.243, 'p90': 0.664}
TROUPE_V1 = {'KOFFI', 'COUMBA', 'BAYE NDIAYE', 'MAMAN NOUNOU', 'PETIT MAMADOU', 'TANTIE AWA', 'MODOU'}
VALIDES = set()   # personnages dont le rendu a été validé au niveau de la V1 (images montrées à l'utilisateur)


def mesure(video, pas=3):
    c = cv2.VideoCapture(video); prev = None; fl = []; i = 0
    while True:
        ok, f = c.read()
        if not ok: break
        h, w = f.shape[:2]; z = f[int(h * 0.27):int(h * 0.62), :]
        g = cv2.cvtColor(cv2.resize(z, (180, int(180 * z.shape[0] / z.shape[1]))), cv2.COLOR_BGR2GRAY)
        if prev is not None and np.abs(g.astype(np.int16) - prev.astype(np.int16)).mean() < 25 and i % pas == 0:   # hors coupes
            m = np.linalg.norm(cv2.calcOpticalFlowFarneback(prev, g, None, 0.5, 3, 15, 3, 5, 1.2, 0), axis=2)
            fl.append(float((m > 0.3).mean()))
        prev = g; i += 1
    fl = np.array(fl or [0.0])
    return {'surface': round(float(fl.mean()), 3), 'p90': round(float(np.percentile(fl, 90)), 3)}


def motifs(video, acteurs):
    """liste vide = au niveau de la V1 ; sinon, les raisons (la vidéo part en « à corriger », jamais supprimée)."""
    m = mesure(video); out = []
    if m['surface'] < REF['surface'] or m['p90'] < REF['p90']:
        out.append(f"animation sous la V1 : surface en mouvement {m['surface']:.1%} (V1 {REF['surface']:.1%}), 9e décile {m['p90']:.1%} (V1 {REF['p90']:.1%})")
    hors = sorted(set(acteurs) - TROUPE_V1 - VALIDES)
    if hors: out.append(f"personnages au rendu pas encore validé au niveau de la V1 : {', '.join(hors)}")
    return out, m
