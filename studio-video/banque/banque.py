# BANQUE DE MOUVEMENTS DE LA TROUPE (20/10/2026) — « trouve une solution aussi pour les animateurs vidéo, ça prend énormément
# de temps […] En quelques secondes, on a une vidéo prête. » (machines GitHub gratuites seulement, sans carte graphique).
# Méthode des studios à gros volume : on n'anime pas chaque vidéo, on anime UNE FOIS une bibliothèque de clips courts par
# personnage (parler, écouter, rire, choc, montrer du doigt, hausser les épaules…) et par décor (ambiance qui bouge) ; chaque
# vidéo s'ASSEMBLE ensuite à partir de ces clips (personnages détourés sur fond vert posés dans le décor, voix, sous-titres) :
# un assemblage, pas un calcul — quelques secondes à quelques minutes sur processeur.
# Point de départ de chaque clip : la pose de la planche du personnage qui correspond au geste (planches V1 : 5 poses sur fond
# vert — neutre, montre du doigt, choqué, hausse les épaules, rit), animée par Wan 2.2 TI2V-5B + FastWan (Apache-2.0).
#   python3 banque.py taches [SORTIE.json]                  → liste stable des clips (personnage × geste)
#   python3 banque.py poses PLANCHE.png DOSSIER             → découpe les 5 poses d'une planche (fond vert conservé)
#   python3 banque.py lot TACHES.json PART NB_PARTS         → les clips de la part PART (partage entre machines parallèles)
import json, os, sys

ICI = os.path.dirname(os.path.abspath(__file__))
V1 = ['koffi', 'coumba', 'baye-ndiaye', 'maman-nounou', 'petit-mamadou', 'tantie-awa', 'modou']
# 20/10/2026 — « on doit tourner 10 000 [vidéos], pas 7 personnages » : les planches des 47 autres personnages viennent de la bible
# V1 (images/bible_tourne.py) ; relais.py les vérifie (5 poses séparées sur le vert), les scelle pour les machines et les inscrit
# dans troupe.json — la banque tourne alors leurs gestes, sans refaire ceux déjà tournés.
TROUPE = os.path.join(ICI, 'troupe.json')


def personnages():
    return json.load(open(TROUPE, encoding='utf-8'))['personnages'] if os.path.isfile(TROUPE) else V1
GESTES = {   # geste → (pose de départ sur la planche, consigne de mouvement)
    'parler':   (0, 'talks animatedly with natural lip movement and small hand gestures, slight head nods'),
    'ecouter':  (0, 'listens attentively, blinks, nods slowly, small breathing movement, mouth closed'),
    'montrer':  (1, 'points firmly with the index finger while talking, leaning forward slightly, accusing expression'),
    'choc':     (2, 'freezes in shock, eyes wide open, jaw drops, then slowly shakes the head in disbelief'),
    'hausser':  (3, 'shrugs with open hands, raises the eyebrows, talks with an innocent face'),
    'rire':     (4, 'bursts out laughing, shoulders shaking, holds the belly, head thrown back'),
    'colere':   (1, 'gets angry, frowns, waves the arms, talks loudly'),
    'mentir':   (3, 'smiles too much, eyes darting left and right, nervous laugh, scratches the head'),
}
CONSIGNE = ("3D animated cartoon character, Pixar style, the same character exactly, full body, plain bright green background, "
            "static camera, smooth natural motion: the character {geste}.")


def taches(qui=None):
    return [{'id': f'{p}--{g}', 'personnage': p, 'geste': g, 'pose': po, 'prompt': CONSIGNE.format(geste=c)}
            for p in (qui or personnages()) for g, (po, c) in GESTES.items()]


def poses(planche, dossier):
    """Les 5 poses d'une planche, de gauche à droite, sur leur fond vert d'origine, au format vertical de Wan (384×640)."""
    import cv2, numpy as np
    im = cv2.imread(planche); hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV); vert_bgr = (0, 255, 0)
    vert = (hsv[..., 0] > 35) & (hsv[..., 0] < 85) & (hsv[..., 1] > 120) & (hsv[..., 2] > 80)
    col = (~vert).sum(0) > 3; segs = []; x = 0; W = len(col)
    while x < W:                                   # colonnes occupées → silhouettes (les écarts verts les séparent)
        if col[x]:
            s = x
            while x < W and col[x]: x += 1
            segs.append([s, x])
        x += 1
    segs = [s for s in segs if s[1] - s[0] > 25]
    while len(segs) > 5:                           # morceaux d'une même pose (main tendue) : on recolle les plus proches
        i = min(range(len(segs) - 1), key=lambda k: segs[k + 1][0] - segs[k][1]); segs[i] = [segs[i][0], segs[i + 1][1]]; del segs[i + 1]
    if len(segs) < 5:                              # poses qui se touchent : on coupe la planche en 5 parts égales
        segs = [[k * W // 5, (k + 1) * W // 5] for k in range(5)]
    os.makedirs(dossier, exist_ok=True); sorties = []
    for k, (a, b) in enumerate(segs[:5]):
        c = im[:, max(0, a - 12):min(W, b + 12)].copy()
        v = vert[:, max(0, a - 12):min(W, b + 12)]          # bouts des poses voisines : seule la grande silhouette reste
        n, lab, st, _ = cv2.connectedComponentsWithStats((~v).astype(np.uint8))
        if n > 1:
            gros = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); garde = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 0.15 * st[gros, cv2.CC_STAT_AREA]])
            c[~garde] = vert_bgr
            ys, xs = np.where(garde); c = c[max(0, ys.min() - 8):ys.max() + 8, max(0, xs.min() - 8):xs.max() + 8]
        h, w = c.shape[:2]
        r = min(600 / h, 360 / w); c = cv2.resize(c, (int(w * r), int(h * r)), interpolation=cv2.INTER_AREA)
        toile = np.full((640, 384, 3), vert_bgr, np.uint8); h, w = c.shape[:2]
        y0, x0 = 640 - h - 20, (384 - w) // 2; toile[y0:y0 + h, x0:x0 + w] = c
        f = os.path.join(dossier, f'pose{k}.png'); cv2.imwrite(f, toile); sorties.append(f)
    return sorties


if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == 'taches':
        T = taches()
        if len(a) > 1: json.dump(T, open(a[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(json.dumps({'clips': len(T), 'personnages': len(personnages()), 'gestes': len(GESTES)}))
    elif a and a[0] == 'poses': print(json.dumps(poses(a[1], a[2])))
    elif a and a[0] == 'lot':
        T = json.load(open(a[1], encoding='utf-8')); k, n = int(a[2]), int(a[3])
        print(json.dumps([t for i, t in enumerate(T) if i % n == k], ensure_ascii=False))
    else: print(open(__file__, encoding='utf-8').read().split('import json')[0])
