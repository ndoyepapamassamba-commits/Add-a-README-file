"""VRAI MOUVEMENT HUMAIN sur nos cartes — capture de mouvement CMU (« free for all uses », produits commerciaux permis,
revente des données interdite : on ne redistribue jamais les fichiers, seulement les films rendus).

Un prompt (« elle éclate de rire », « il hausse les épaules ») choisit un clip de la bibliothèque indexée par texte ; ce
module lit le clip (ASF/AMC, 120 i/s), calcule la colonne et la tête par cinématique directe, puis les ramène dans le
PLAN de nos cartes (vues de face) : inclinaison du buste, inclinaison de la tête, rebond du bassin. Pur numpy, testable.

    python blender/film/mocap.py <sujet.asf> <clip.amc>      # résumé des courbes (amplitudes, durée)
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


def trial_of(kind):
    """'cmu:13_14' or a LIBRARY key → (subject, trial)."""
    if kind.startswith('cmu:'):
        trial = kind[4:]
        return trial.split('_')[0], trial
    e = LIBRARY[kind]
    return e['subject'], e['trial']


def ensure_clip(kind):
    """Local paths of the clip of `kind` (downloaded once from mocap.cs.cmu.edu — a handful of files, never a crawl)."""
    import os
    import urllib.request
    subject, trial = trial_of(kind)
    e = {'subject': subject, 'trial': trial}
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
        if kind.startswith('bvh:'):
            skel, frames, src_fps = parse_bvh(ensure_bvh(kind))
            _CURVES[key] = card_curves_bvh(skel, frames, fps=fps, src_fps=src_fps, height_m=height_m)
        else:
            asf, amc = ensure_clip(kind)
            _CURVES[key] = card_curves(parse_asf(asf), parse_amc(amc), fps=fps, height_m=height_m)
    return _CURVES[key]


def overlay(kind, n, fps=25, height_m=1.6, ease_s=0.25, gain=1.0):
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
        # The director's energy scales the clip, the cartoon limit still wins (a gain > 1 only unlocks a clamped clip).
        return a * min(gain, lim / peak)
    k = max(1, int(ease_s * fps))
    env = np.ones(n)
    env[:k] = np.linspace(0, 1, min(k, n))
    env[-k:] = np.minimum(env[-k:], np.linspace(1, 0, min(k, n)))
    squash = np.clip(1 - np.cos(np.clip(np.asarray(c['bend'][sl], float), -1.2, 1.2)), 0, None)
    squash = tail(squash)
    return {'spine': fit(c['spine'], LIMITS['spine']) * env, 'head': fit(c['head'], LIMITS['head']) * env,
            'root': fit(c['root'], LIMITS['root']) * env, 'lift': fit(c['bob'], LIMITS['lift']) * env,
            'squash': np.minimum(squash * min(gain, 1.0), LIMITS['squash']) * env}


# ── Gestes par ÉTIQUETTE (direction-vocab.json) : le réalisateur choisit « dispute », le moteur prend un clip CMU ─────
_VOCAB = None


def vocab():
    global _VOCAB
    if _VOCAB is None:
        import json
        import os
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'direction-vocab.json'), encoding='utf-8') as f:
            _VOCAB = json.load(f)
    return _VOCAB


def gesture_clip(tag, seed=0):
    """The 'cmu:…' kind for a gesture tag (one of its clips, chosen by `seed` so the same line always gets the same
    clip and two lines with the same gesture differ), or None for 'aucun' / an unknown tag."""
    g = vocab()['gestes'].get(tag)
    if not g or not g['clips']:
        return None
    return 'cmu:' + g['clips'][int(seed) % len(g['clips'])]


def _fold(s):
    import unicodedata
    return ''.join(ch for ch in unicodedata.normalize('NFD', (s or '').lower()) if unicodedata.category(ch) != 'Mn')


def search(text):
    """The gesture tag a line calls for, from its words (« je ne sais pas, bof » → 'haussement'), or 'aucun'.
    The longest matching cue wins (« c'est pas possible » beats « non ! »); ties go to the first tag of the vocabulary."""
    import re
    t = _fold(text)
    best = ('aucun', 0)
    for tag, g in vocab()['gestes'].items():
        for w in g.get('mots') or []:
            w_ = _fold(w)
            # Whole words only (« toi » must not fire inside « toiture »); punctuation inside a cue is kept literal.
            if w_ and re.search(r'(?<![a-z0-9])' + re.escape(w_) + r'(?![a-z0-9])', t) and len(w_) > best[1]:
                best = (tag, len(w_))
    return best[0]


# ── BVH (100STYLE, CC BY 4.0 — « The 100STYLE Dataset - Ian Mason ») : 100 styles de marche et d'attente ──────────────
# Zenodo 8127870 publie un seul zip de 1,47 Go ; on ne le télécharge jamais entier : lecture du répertoire central par
# requêtes HTTP Range (≈ 0,5 Mo) puis extraction du seul membre demandé (2–11 Mo), gardé dans le cache des modèles.
ZENODO_100STYLE = 'https://zenodo.org/api/records/8127870/files/100STYLE.zip/content'


class _RangeFile:
    """A seekable, read-only view of a remote file (HTTP Range), 1 Mo blocks, retried on a dropped connection."""

    def __init__(self, url, block=1 << 20):
        import urllib.request
        self.url, self.block, self.pos, self.cache = url, block, 0, {}
        with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=60) as r:
            self.size = int(r.headers['Content-Length'])

    def _chunk(self, i):
        import time
        import urllib.request
        if i not in self.cache:
            a, b = i * self.block, min(self.size, (i + 1) * self.block) - 1
            for attempt in range(5):
                try:
                    req = urllib.request.Request(self.url, headers={'Range': f'bytes={a}-{b}'})
                    with urllib.request.urlopen(req, timeout=120) as r:
                        self.cache[i] = r.read()
                    break
                except Exception:  # noqa: BLE001 — dropped or truncated connection (IncompleteRead is not an OSError): retry
                    if attempt == 4:
                        raise
                    time.sleep(2 + 3 * attempt)
        return self.cache[i]

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def read(self, n=-1):
        n = self.size - self.pos if n is None or n < 0 else min(n, self.size - self.pos)
        out = bytearray()
        while len(out) < n:
            i, o = divmod(self.pos + len(out), self.block)
            c = self._chunk(i)
            out += c[o:o + (n - len(out))]
        self.pos += n
        return bytes(out)


def ensure_bvh(kind):
    """Local path of a BVH clip: 'bvh:100style/Angry_FW' → ~/.cache/massamba-models/100style/Angry_FW.bvh, fetched
    once from the Zenodo zip (member '100STYLE/Angry/Angry_FW.bvh') without downloading the archive."""
    import os
    import zipfile
    lib, name = kind[4:].split('/', 1)
    if lib != '100style':
        raise ValueError(f'bibliothèque BVH inconnue : {lib}')
    d = os.path.join(os.path.dirname(_cache_dir()), '100style')
    os.makedirs(d, exist_ok=True)
    out = os.path.join(d, name + '.bvh')
    if not os.path.isfile(out):
        style = name.split('_')[0]
        z = zipfile.ZipFile(_RangeFile(ZENODO_100STYLE))
        data = z.read(f'100STYLE/{style}/{name}.bvh')
        with open(out, 'wb') as f:
            f.write(data)
    return out


def parse_bvh(path):
    """Minimal BVH reader: skeleton (joint names, parents, offsets, channel lists) + motion frames + frame rate."""
    import re
    with open(path, encoding='utf-8', errors='replace') as f:
        txt = f.read()
    head, motion = txt.split('MOTION', 1)
    joints, parents, offsets, channels = [], [], [], []
    stack = []
    tokens = head.replace('{', ' { ').replace('}', ' } ').split()
    i = 0
    while i < len(tokens):
        tk = tokens[i]
        if tk in ('ROOT', 'JOINT'):
            joints.append(tokens[i + 1])
            parents.append(stack[-1] if stack else -1)
            offsets.append([0.0, 0.0, 0.0])
            channels.append([])
            i += 2
        elif tk == 'End':  # End Site: an offset only, no channels — kept as a leaf named <parent>_end
            joints.append(joints[stack[-1]] + '_end')
            parents.append(stack[-1])
            offsets.append([0.0, 0.0, 0.0])
            channels.append([])
            i += 2
        elif tk == '{':
            stack.append(len(joints) - 1)
            i += 1
        elif tk == '}':
            stack.pop()
            i += 1
        elif tk == 'OFFSET':
            offsets[len(joints) - 1] = [float(tokens[i + 1]), float(tokens[i + 2]), float(tokens[i + 3])]
            i += 4
        elif tk == 'CHANNELS':
            n = int(tokens[i + 1])
            channels[len(joints) - 1] = tokens[i + 2:i + 2 + n]
            i += 2 + n
        else:
            i += 1
    m = re.search(r'Frame Time:\s*([0-9.eE+-]+)', motion)
    frame_time = float(m.group(1)) if m else 1 / 60
    rows = [ln.split() for ln in motion.split('\n') if ln.strip() and not ln.startswith('Frame')]
    frames = np.array([[float(v) for v in r] for r in rows if len(r) > 6], dtype=float)
    skel = {'joints': joints, 'parents': parents, 'offsets': np.array(offsets), 'channels': channels}
    return skel, frames, round(1 / frame_time)


def forward_bvh(skel, row):
    """Global rotation and position of every joint for one frame (channel order honoured: the first listed rotation
    is the outermost)."""
    G, P = {}, {}
    c = 0
    for j, name in enumerate(skel['joints']):
        R = np.eye(3)
        pos = np.array(skel['offsets'][j], float)
        for ch in skel['channels'][j]:
            v = row[c]
            c += 1
            if ch == 'Xposition':
                pos[0] = v
            elif ch == 'Yposition':
                pos[1] = v
            elif ch == 'Zposition':
                pos[2] = v
            elif ch.endswith('rotation'):
                R = R @ _rot(ch[0].lower(), v)
        par = skel['parents'][j]
        if par < 0:
            G[name], P[name] = R, pos
        else:
            pn = skel['joints'][par]
            G[name] = G[pn] @ R
            P[name] = P[pn] + G[pn] @ pos
    return G, P


def card_curves_bvh(skel, frames, fps=25, src_fps=60, height_m=1.6, names=None):
    """Same output as card_curves (spine / head / root tilts, bob, bend, seconds) from a BVH clip. Default joint
    names are 100STYLE's (Hips, Chest…Chest4, Neck, Head, LeftToe / RightToe); units are read from the body height."""
    names = names or {'root': 'Hips', 'chest': 'Chest4', 'neck': 'Neck', 'head': 'Head', 'ltoes': 'LeftToe', 'rtoes': 'RightToe'}
    idx = np.arange(0, len(frames), max(1e-6, src_fps / fps)).astype(int)
    spine, head, rootr, bob, h_sub, fwd_bend = [], [], [], [], [], []
    for i in idx:
        G, P = forward_bvh(skel, frames[i])
        fwd = G[names['root']] @ np.array([0, 0, 1.0])
        yaw = math.atan2(fwd[0], fwd[2])
        Ry = _rot('y', -math.degrees(yaw))

        def tilt(v):
            v = Ry @ v
            return math.asin(max(-1.0, min(1.0, v[0] / max(1e-9, float(np.linalg.norm(v))))))

        def bend(v):
            v = Ry @ v
            return math.asin(max(-1.0, min(1.0, v[2] / max(1e-9, float(np.linalg.norm(v))))))
        top, bottom = P[names['chest']], P[names['root']]
        neck, headp = P[names['neck']], P[names['head']]
        spine.append(tilt(top - bottom))
        fwd_bend.append(bend(top - bottom))
        head.append(tilt(headp - neck) - spine[-1])
        rootr.append(tilt(G[names['root']] @ np.array([0, 1.0, 0])))
        bob.append(P[names['root']][1])
        h_sub.append(headp[1] - min(P[names['ltoes']][1], P[names['rtoes']][1]))
    spine, head, rootr, fwd_bend = (np.array(a) for a in (spine, head, rootr, fwd_bend))
    unit = height_m / max(1e-6, float(np.median(h_sub)))  # metres per BVH unit (the subject's own height)
    bob = (np.array(bob) - np.median(bob)) * unit
    return {'spine': spine - np.median(spine), 'head': head - np.median(head), 'root': rootr - np.median(rootr),
            'bob': bob, 'bend': fwd_bend - np.median(fwd_bend), 'seconds': len(idx) / fps}


def entrance_clip(tag):
    """'entre_colere' → 'bvh:100style/Angry_FW' (direction-vocab.json 'entrees'), None for an unknown tag."""
    e = vocab().get('entrees', {}).get(tag)
    return 'bvh:' + e['clip'] if isinstance(e, dict) and e.get('clip') else None


def search_entrance(text):
    """The entrance style a line (or a character sheet) calls for, 'entre_normal' otherwise — same whole-word rule
    as search()."""
    import re
    t = _fold(text)
    best = ('entre_normal', 0)
    for tag, e in vocab().get('entrees', {}).items():
        if not isinstance(e, dict):
            continue
        for w in e.get('mots') or []:
            w_ = _fold(w)
            if w_ and re.search(r'(?<![a-z0-9])' + re.escape(w_) + r'(?![a-z0-9])', t) and len(w_) > best[1]:
                best = (tag, len(w_))
    return best[0]
