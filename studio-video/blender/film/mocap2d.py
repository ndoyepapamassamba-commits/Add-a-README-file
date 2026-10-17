# MOCAP → OS 2D (greffe du 16/10, à la manière d'Animated Drawings de Meta, MIT : capture de mouvement retargetée sur un
# dessin) : un clip CMU (ASF/AMC) est vu DE FACE, dans le plan du dessin, le cap du sujet retiré image par image ; chaque
# os de notre squelette (noms de bonesFromBody, app) reçoit sa rotation 2D. On garde la VARIATION autour de la pose
# moyenne du clip (le dessin porte déjà la pose : la capture apporte le mouvement vrai — balancements, accents, rire
# qui secoue), à 30 i/s, avec des bornes de dessin animé. Sortie : clips au format des pistes du moteur (armature2d.ts).
#   python3 mocap2d.py 19_08 13_14 141_21 …  > clips.json
import json, math, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mocap  # noqa: E402  (parse_asf, parse_amc, forward — même lecteur que le film Blender)

# os du dessin → (début, fin) dans le squelette CMU (positions des FINS d'os de forward())
CHAIN = {
    'Spine': ('root', 'thorax'), 'Neck': ('thorax', 'upperneck'), 'Head': ('upperneck', 'head'),
    'LeftShoulder': ('thorax', 'lclavicle'), 'LeftArm': ('lclavicle', 'lhumerus'), 'LeftForeArm': ('lhumerus', 'lradius'), 'LeftHand': ('lradius', 'lhand'),
    'RightShoulder': ('thorax', 'rclavicle'), 'RightArm': ('rclavicle', 'rhumerus'), 'RightForeArm': ('rhumerus', 'rradius'), 'RightHand': ('rradius', 'rhand'),
}
PARENT = {'Spine': None, 'Neck': 'Spine', 'Head': 'Neck', 'LeftShoulder': 'Spine', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm',
          'RightShoulder': 'Spine', 'RightArm': 'RightShoulder', 'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm'}
# bornes de dessin animé (radians, crête autour de la moyenne) : une carte dessinée ne se plie pas comme un corps
LIM = {'Spine': 0.16, 'Neck': 0.15, 'Head': 0.22, 'LeftShoulder': 0.12, 'RightShoulder': 0.12, 'LeftArm': 0.6, 'RightArm': 0.6,
       'LeftForeArm': 0.7, 'RightForeArm': 0.7, 'LeftHand': 0.4, 'RightHand': 0.4}
UNIT_M = 0.0254 / 0.45  # unités ASF de la CMU (longueur 0,45) → mètres


def clip2d(trial, fps=30, src_fps=120):
    subj = trial.split('_')[0]
    d = mocap._cache_dir()
    skel = mocap.parse_asf(os.path.join(d, f'{subj}.asf'))
    frames = mocap.parse_amc(os.path.join(d, f'{trial}.amc'))
    step = src_fps / fps
    idx = [int(round(i * step)) for i in range(int(len(frames) / step))]
    ang = {k: [] for k in CHAIN}
    hx, hy = [], []
    for i in idx:
        _, P = mocap.forward(skel, frames[i])
        # repère du sujet : gauche = de la hanche droite à la gauche (horizontale), haut = y de la CMU
        Lv = P['lhipjoint'] - P['rhipjoint']
        Lv[1] = 0
        Lv /= max(1e-9, np.linalg.norm(Lv))
        up = np.array([0.0, 1.0, 0.0])
        sx = lambda p: float(np.dot(p, Lv))
        sy = lambda p: -float(np.dot(p, up))  # y vers le bas, comme l'image
        for k, (a, b) in CHAIN.items():
            pa, pb = P[a], P[b]
            ang[k].append(math.atan2(sy(pb) - sy(pa), sx(pb) - sx(pa)))
        hx.append(sx(P['root']) * UNIT_M)
        hy.append(sy(P['root']) * UNIT_M)
    world = {k: np.unwrap(np.array(v)) for k, v in ang.items()}
    # FENÊTRE DE JEU (comme un monteur de capture) : 5 s les plus expressives (bras et tête qui bougent) où aucun membre
    # ne se retourne vers la caméra (variation d'angle projeté < 1,3 rad : au-delà, c'est la projection qui saute)
    n0 = len(idx)
    W = min(n0, 5 * fps)
    best, bs = 0, -1.0
    for a in range(0, n0 - W + 1, fps // 2):
        sl = slice(a, a + W)
        if any(np.ptp(world[k][sl]) > 1.3 for k in ('LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'Head')):
            continue
        sc = float(np.mean([np.mean(np.abs(np.diff(world[k][sl]))) for k in ('LeftForeArm', 'RightForeArm', 'LeftArm', 'RightArm', 'Head', 'Spine')]))
        if sc > bs:
            bs, best = sc, a
    sl = slice(best, best + W)
    world = {k: v[sl] for k, v in world.items()}
    hx, hy = np.array(hx)[sl], np.array(hy)[sl]
    n = W
    # variation autour de la moyenne de la fenêtre, lissée (3 images), bornée en douceur (tanh : pas de plateau)
    out = {}
    sm = lambda a: np.convolve(np.pad(a, 1, mode='edge'), np.ones(3) / 3, mode='valid')
    dworld = {k: sm(w - w.mean()) for k, w in world.items()}
    for k in CHAIN:
        p = PARENT[k]
        loc = dworld[k] - (dworld[p] if p else 0)
        loc = LIM[k] * np.tanh(loc / LIM[k])
        out[k] = [round(float(v), 4) for v in loc]
    out['hipsX'] = [round(float(v), 4) for v in sm(hx - hx.mean())]
    out['hipsY'] = [round(float(v), 4) for v in sm(hy - hy.mean())]
    energy = float(np.mean([np.mean(np.abs(np.diff(world[k]))) for k in ('LeftForeArm', 'RightForeArm', 'Head')])) * fps
    return {'trial': trial, 'fps': fps, 'n': n, 'seconds': round(n / fps, 2), 'window': [round(best / fps, 2), round((best + W) / fps, 2)], 'energy': round(energy, 3), 'tracks': out}


if __name__ == '__main__':
    res = {}
    for t in sys.argv[1:]:
        try:
            res[t] = clip2d(t)
            c = res[t]
            amp = {k: round(math.degrees(max(map(abs, v))), 1) for k, v in c['tracks'].items() if k in LIM}
            print(f"{t} : {c['seconds']} s, énergie {c['energy']} rad/s, crêtes (°) {amp}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f'{t} : impossible ({e})', file=sys.stderr)
    json.dump(res, sys.stdout)
