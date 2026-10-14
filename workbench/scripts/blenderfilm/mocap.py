"""VRAI MOUVEMENT HUMAIN sur nos cartes — capture de mouvement CMU (« free for all uses », produits commerciaux permis,
revente des données interdite : on ne redistribue jamais les fichiers, seulement les films rendus).

Un prompt (« elle éclate de rire », « il hausse les épaules ») choisit un clip de la bibliothèque indexée par texte ; ce
module lit le clip (ASF/AMC, 120 i/s), calcule la colonne et la tête par cinématique directe, puis les ramène dans le
PLAN de nos cartes (vues de face) : inclinaison du buste, inclinaison de la tête, rebond du bassin. Pur numpy, testable.

    python scripts/blenderfilm/mocap.py <sujet.asf> <clip.amc>      # résumé des courbes (amplitudes, durée)
"""
import math
import sys

import numpy as np

INCH = 0.0254


def _rot(axis, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    if axis == 'x':
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if axis == 'y':
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def _euler(vals, order):
    """Rotation of Euler angles applied in `order` (ASF convention: the matrix is R = Rz·Ry·Rx for order XYZ)."""
    R = np.eye(3)
    for ax, v in zip(order, vals):
        R = _rot(ax.lower(), v) @ R
    return R


def parse_asf(path):
    """Bones of an ASF skeleton: name → {dir, len, axis (3×3), dof, parent}; plus the root order/orientation and units."""
    txt = open(path, encoding='latin-1').read()
    bones, hier, unit_len = {}, {}, 1.0
    root = {'order': ['RX', 'RY', 'RZ'], 'axis': 'XYZ', 'orientation': [0, 0, 0], 'position': [0, 0, 0]}
    sec = None
    cur = None
    for raw in txt.splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith(':'):
            sec = line.split()[0][1:]
            if sec == 'units':
                pass
            continue
        tok = line.split()
        if sec == 'units' and tok[0] == 'length':
            unit_len = float(tok[1])
        elif sec == 'root':
            if tok[0] == 'order':
                root['order'] = tok[1:]
            elif tok[0] == 'axis':
                root['axis'] = tok[1]
            elif tok[0] in ('orientation', 'position'):
                root[tok[0]] = [float(v) for v in tok[1:4]]
        elif sec == 'bonedata':
            if tok[0] == 'begin':
                cur = {'dof': []}
            elif tok[0] == 'end':
                bones[cur['name']] = cur
                cur = None
            elif cur is not None:
                if tok[0] == 'name':
                    cur['name'] = tok[1]
                elif tok[0] == 'direction':
                    cur['dir'] = np.array([float(v) for v in tok[1:4]])
                elif tok[0] == 'length':
                    cur['len'] = float(tok[1])
                elif tok[0] == 'axis':
                    cur['axis'] = _euler([float(v) for v in tok[1:4]], tok[4] if len(tok) > 4 else 'XYZ')
                elif tok[0] == 'dof':
                    cur['dof'] = [t.lower() for t in tok[1:]]
        elif sec == 'hierarchy':
            if tok[0] in ('begin', 'end'):
                continue
            for child in tok[1:]:
                hier[child] = tok[0]
    for n, b in bones.items():
        b['parent'] = hier.get(n, 'root')
    return {'bones': bones, 'root': root, 'unit': unit_len}


def parse_amc(path):
    """Frames of an AMC clip: list of {bone: [values…]}."""
    frames, cur = [], None
    for raw in open(path, encoding='latin-1'):
        line = raw.strip()
        if not line or line.startswith('#') or line.startswith(':'):
            continue
        tok = line.split()
        if len(tok) == 1 and tok[0].isdigit():
            cur = {}
            frames.append(cur)
        elif cur is not None:
            cur[tok[0]] = [float(v) for v in tok[1:]]
    return frames


def forward(skel, frame):
    """Global rotation and END position of every bone for one frame (ASF/AMC forward kinematics, in ASF units)."""
    bones, root = skel['bones'], skel['root']
    rv = frame.get('root', [0] * 6)
    pos = dict(zip([o.lower() for o in root['order']], rv))
    Rroot = _euler([pos.get('rx', 0), pos.get('ry', 0), pos.get('rz', 0)], 'XYZ')
    G = {'root': Rroot}
    P = {'root': np.array([pos.get('tx', 0), pos.get('ty', 0), pos.get('tz', 0)])}
    order = []
    seen = {'root'}
    pending = list(bones)
    while pending:  # parents before children
        nxt = [n for n in pending if bones[n]['parent'] in seen]
        for n in nxt:
            order.append(n)
            seen.add(n)
        pending = [n for n in pending if n not in seen]
        if not nxt:
            break
    for n in order:
        b = bones[n]
        C = b.get('axis', np.eye(3))
        vals = frame.get(n, [])
        rx = ry = rz = 0.0
        for d, v in zip(b['dof'], vals):
            if d == 'rx':
                rx = v
            elif d == 'ry':
                ry = v
            elif d == 'rz':
                rz = v
        M = _euler([rx, ry, rz], 'XYZ')
        L = C @ M @ C.T
        G[n] = G[b['parent']] @ L
        P[n] = P[b['parent']] + G[n] @ (b['dir'] * b['len']) if b['parent'] in P else P['root']
    return G, P


def card_curves(skel, clip, fps=25, src_fps=120, height_m=1.6):
    """The clip seen FROM THE FRONT, in the plane of our cards (the subject's own heading, yaw removed):
    spine = tilt of the chest (lowerback → thorax) from vertical, head = tilt of the head relative to the chest,
    root = tilt of the pelvis, bob = vertical motion of the pelvis in metres (scaled to the character's height).
    Positive tilt = the top goes to the subject's LEFT. Resampled to `fps`."""
    idx = np.arange(0, len(clip), src_fps / fps).astype(int)
    unit = INCH / max(1e-6, skel['unit'])
    spine, head, rootr, bob, h_sub, fwd_bend = [], [], [], [], [], []
    for i in idx:
        G, P = forward(skel, clip[i])
        fwd = G['root'] @ np.array([0, 0, 1.0])
        yaw = math.atan2(fwd[0], fwd[2])
        Ry = _rot('y', -math.degrees(yaw))
        def tilt(v):
            # Lateral lean only: asin of the sideways share — stable when the subject bends forward (a laugh doubles
            # over: the frontal projection of a near-horizontal head flipped by 360°).
            v = Ry @ v
            return math.asin(max(-1.0, min(1.0, v[0] / max(1e-9, float(np.linalg.norm(v))))))

        def bend(v):
            v = Ry @ v
            return math.asin(max(-1.0, min(1.0, v[2] / max(1e-9, float(np.linalg.norm(v))))))
        top = P.get('thorax', P.get('upperback'))
        bottom = P.get('root')
        neck = P.get('upperneck', P.get('lowerneck', top))
        headp = P.get('head', neck)
        spine.append(tilt(top - bottom))
        fwd_bend.append(bend(top - bottom))
        head.append(tilt(headp - neck) - spine[-1])
        rootr.append(tilt(G['root'] @ np.array([0, 1.0, 0])))
        bob.append(P['root'][1])
        h_sub.append((headp[1] - min(P.get('ltoes', P['root'])[1], P.get('rtoes', P['root'])[1])))
    spine, head, rootr, fwd_bend = (np.array(a) for a in (spine, head, rootr, fwd_bend))
    scale = height_m / max(1e-6, float(np.median(h_sub)) * unit)
    bob = (np.array(bob) - np.median(bob)) * unit * scale
    # Remove the subject's standing offsets: we keep the MOTION (our drawings already carry their pose).
    return {'spine': spine - np.median(spine), 'head': head - np.median(head), 'root': rootr - np.median(rootr),
            'bob': bob, 'bend': fwd_bend - np.median(fwd_bend), 'seconds': len(idx) / fps}


def main():
    skel, clip = parse_asf(sys.argv[1]), parse_amc(sys.argv[2])
    c = card_curves(skel, clip)
    d = lambda a: f'{math.degrees(float(np.ptp(a))):.1f}°'
    print(f"{sys.argv[2]} : {c['seconds']:.1f} s · buste {d(c['spine'])} · tête {d(c['head'])} · bassin {d(c['root'])} · "
          f"flexion avant {d(c['bend'])} · rebond {100 * float(np.ptp(c['bob'])):.1f} cm (amplitudes crête à crête)")


if __name__ == '__main__':
    main()


# ── Bibliothèque indexée par texte (prompt / pose jouée → clip) ────────────────────────────────────────────────────────
# Clips CMU choisis à la main (descriptions officielles de la base) ; téléchargés une fois dans le cache des modèles,
# jamais redistribués. Les poses de nos dessins portent déjà le sens : la pose jouée choisit le clip.
LIBRARY = {
    'rire': {'subject': '13', 'trial': '13_14', 'desc': 'laugh (subject 13, various everyday behaviors)',
             'words': ('rire', 'rit', 'éclate', 'fou rire', 'se plie', 'laugh')},
    'haussement': {'subject': '141', 'trial': '141_21', 'desc': 'Shrug (subject 141)',
                   'words': ('hausse', 'haussement', 'épaules', 'sais pas', 'shrug')},
    'accuse': {'subject': '22', 'trial': '22_21', 'desc': 'conversation - B pounds high stool, points at A (subject A)',
               'words': ('pointe', 'accuse', 'montre du doigt', 'dispute', 'point')},
}
# Cartoon limits: the drawing stays clean (a 2D card cannot fold at 70° like a body).
LIMITS = {'spine': math.radians(9), 'head': math.radians(12), 'root': math.radians(4), 'lift': 0.05, 'squash': 0.07}
CACHE = None


def _cache_dir():
    import os
    d = os.path.join(os.path.expanduser('~'), '.cache', 'massamba-models', 'cmu-mocap')
    os.makedirs(d, exist_ok=True)
    return d


def ensure_clip(kind):
    """Local paths of the clip of `kind` (downloaded once from mocap.cs.cmu.edu — a handful of files, never a crawl)."""
    import os
    import urllib.request
    e = LIBRARY[kind]
    d = _cache_dir()
    out = []
    for name in (f"{e['subject']}.asf", f"{e['trial']}.amc"):
        p = os.path.join(d, name)
        if not os.path.isfile(p):
            urllib.request.urlretrieve(f"http://mocap.cs.cmu.edu/subjects/{e['subject']}/{name}", p)
        out.append(p)
    return out


def from_prompt(text):
    """The library clip a prompt asks for (« elle se plie de rire » → 'rire'), or None."""
    t = (text or '').lower()
    best = None
    for kind, e in LIBRARY.items():
        hits = sum(1 for w in e['words'] if w in t)
        if hits and (best is None or hits > best[0]):
            best = (hits, kind)
    return best[1] if best else None


_CURVES = {}


def clip_curves(kind, fps=25, height_m=1.6):
    key = (kind, fps, round(height_m, 2))
    if key not in _CURVES:
        asf, amc = ensure_clip(kind)
        _CURVES[key] = card_curves(parse_asf(asf), parse_amc(amc), fps=fps, height_m=height_m)
    return _CURVES[key]


def overlay(kind, n, fps=25, height_m=1.6, ease_s=0.25):
    """`n` frames of the clip's most EXPRESSIVE stretch (sliding window of maximal motion energy), clamped to the
    cartoon limits and eased in/out over `ease_s`: {'spine','head','root' (rad), 'lift' (m), 'squash' (share)}."""
    c = clip_curves(kind, fps, height_m)
    m = len(c['spine'])
    energy = (np.abs(np.diff(c['spine'], prepend=c['spine'][0])) + np.abs(np.diff(c['head'], prepend=c['head'][0]))
              + 5 * np.abs(np.diff(c['bob'], prepend=c['bob'][0])))
    if m <= n:
        s0 = 0
    else:
        cs = np.concatenate([[0], np.cumsum(energy)])
        s0 = int(np.argmax(cs[n:] - cs[:-n]))
    sl = slice(s0, s0 + n)
    def tail(a):
        # A span longer than the clip: the clip plays once, then the body settles back over 0.5 s (no frozen offset).
        r = max(0, n - len(a))
        if not r:
            return a
        last = a[-1] if len(a) else 0.0
        return np.concatenate([a, last * np.clip(1 - np.arange(1, r + 1) / max(1, 0.5 * fps), 0, 1)])

    def fit(a, lim):
        a = np.asarray(a[sl], float)
        a = a - (a[0] if len(a) else 0.0)  # start from our drawing's pose
        a = tail(a)
        peak = float(np.max(np.abs(a))) or 1.0
        return a * min(1.0, lim / peak)
    k = max(1, int(ease_s * fps))
    env = np.ones(n)
    env[:k] = np.linspace(0, 1, min(k, n))
    env[-k:] = np.minimum(env[-k:], np.linspace(1, 0, min(k, n)))
    squash = np.clip(1 - np.cos(np.clip(np.asarray(c['bend'][sl], float), -1.2, 1.2)), 0, None)
    squash = tail(squash)
    return {'spine': fit(c['spine'], LIMITS['spine']) * env, 'head': fit(c['head'], LIMITS['head']) * env,
            'root': fit(c['root'], LIMITS['root']) * env, 'lift': fit(c['bob'], LIMITS['lift']) * env,
            'squash': np.minimum(squash, LIMITS['squash']) * env}
