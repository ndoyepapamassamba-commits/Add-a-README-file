"""
GESTE ET RÉCIT — un geste que le dessin ne peut pas jouer change l'histoire AVANT que les voix soient enregistrées.

Le moteur de scène applique la loi du pointage (scene.aim_points) : le prolongement coude → bout du doigt doit rencontrer
le visage désigné. Un dessin qui pointe ailleurs est joué par la pose la plus proche par intention (une accusation
devient une indignation). Si ce choix n'arrivait qu'au rendu, la réplique, ses sous-titres et son intention resteraient
ceux d'un geste qui n'existe plus. Ici, la même loi est appliquée dès le PLAN (points du corps et du visage de la planche
de la troupe, positions des acteurs), et le récit est réadapté :
  • la pose de la réplique et les réactions demandées ;
  • le texte quand il s'appuyait sur le geste (« Toi, là ! » sans doigt tendu → on nomme la personne) ;
  • une note d'adaptation gardée dans l'histoire (le rapport et l'interface la montrent).
Pur Python (+ numpy / PIL pour lire l'alpha de la planche) : testable sans Blender.
"""
import math
import os
import re

POINTING = ('accuse', 'pointe', 'montre', 'designe')
# The closest poses by INTENT, in order (same table as scene.SUBSTITUTES).
SUBSTITUTES = {'accuse': ('haussement', 'choc', 'neutre'), 'pointe': ('haussement', 'neutre'), 'montre': ('haussement', 'neutre'),
               'designe': ('haussement', 'neutre')}
INTENT = {'accuse': 'accuse', 'haussement': "s'indigne", 'choc': 'est choqué(e)', 'neutre': 'répond', 'pointe': 'désigne', 'montre': 'montre'}
# Words that only make sense WITH a gesture toward someone or something.
DEIXIS = re.compile(r"\b(toi,? là|vous,? là|celui-là|celle-là|ceux-là|regarde[sz]? (ça|là|lui|elle)|lui,? là|elle,? là)\b", re.I)


def _alpha_rows(png):
    from PIL import Image
    import numpy as np
    a = np.asarray(Image.open(png).convert('RGBA'))[..., 3] > 77
    rows = np.nonzero(a.max(1))[0]
    return a, (int(rows[0]) if len(rows) else 0), (int(rows[-1]) if len(rows) else a.shape[0] - 1)


def look(pose):
    """+1 when the drawing looks to the right of the picture (nose right of the eyes), else -1 (scene.look)."""
    f = pose.get('face') or {}
    eyes = f.get('eyes') or []
    if f.get('nose') and eyes:
        cx = sum(e['c'][0] for e in eyes) / len(eyes)
        return 1 if f['nose'][0] >= cx else -1
    return 1


def geometry(pose, png, height, mirror):
    """Pointing line (elbow → fingertip) and face of a pose, in metres from the feet (same maths as scene.build_pose)."""
    a, top_y, foot_y = _alpha_rows(png)
    h = a.shape[0]
    b, f = pose.get('body') or {}, pose.get('face') or {}
    if b.get('anL') and b.get('anR'):
        ax = (b['anL'][0] + b['anR'][0]) / 2
    else:
        import numpy as np
        cols = np.nonzero(a[int(foot_y * 0.95):].max(0))[0]
        ax = float(cols.mean()) if len(cols) else a.shape[1] / 2
    scale = height / max(1, pose.get('h', h) - 8)
    sx = -1 if mirror else 1
    P = lambda x, y: ((x - ax) * scale * sx, (foot_y - y) * scale)
    hip = [(b['hipL'][0] + b['hipR'][0]) / 2, (b['hipL'][1] + b['hipR'][1]) / 2] if b.get('hipL') else [ax, top_y + (foot_y - top_y) * 0.5]
    chin = f.get('chin') or [ax, top_y + (foot_y - top_y) * 0.14]
    face = P(*(f.get('nose') or chin))
    best = None
    if pose.get('kind') in POINTING and b:
        for sd in ('L', 'R'):
            s_, e_, r_ = b.get('sh' + sd), b.get('el' + sd), b.get('wr' + sd)
            if not (s_ and e_ and r_) or min((v[2] if len(v) > 2 else 1) for v in (s_, e_, r_)) <= 0.5 or r_[1] >= hip[1]:
                continue
            upper = math.hypot(e_[0] - s_[0], e_[1] - s_[1])
            fore = math.hypot(r_[0] - e_[0], r_[1] - e_[1])
            away = (r_[0] - e_[0]) * (1 if r_[0] >= hip[0] else -1)
            if fore >= 0.10 * (foot_y - top_y) and fore >= 0.7 * upper and away >= 0.5 * fore and (best is None or r_[1] < best[0]):
                best = (r_[1], e_[:2], r_[:2])
    point = None
    if best:
        _, E, Wr = best
        T = (Wr[0] + 0.55 * (Wr[0] - E[0]), Wr[1] + 0.55 * (Wr[1] - E[1]))
        point = {'E': P(*E), 'T': P(*T)}
    return {'face': face, 'point': point}


def pointing_ok(a_geo, xa, b_face, xb, tol=0.15):
    """The pointing law as the viewer reads it: the elbow → fingertip line, prolonged, meets the partner's face."""
    p = a_geo.get('point')
    if not p:
        return True, 0.0
    tx, tz = xb - xa + b_face[0], b_face[1] - 0.03
    E, T = p['E'], p['T']
    dx, dz = T[0] - E[0], T[1] - E[1]
    L = math.hypot(dx, dz) or 1e-6
    ux, uz = dx / L, dz / L
    ahead = (tx - E[0]) * ux + (tz - E[1]) * uz > L
    perp = abs((tx - E[0]) * uz - (tz - E[1]) * ux)
    return ahead and perp <= tol, perp


def adapt_story(story, rig, rig_dir, heights=None, gap=0.81):
    """Checks every pointing pose of the story against the drawings and the actors' places, and REWRITES the story when
    a gesture cannot be played: the pose (and the reactions) becomes the closest playable one, a line that relied on the
    gesture names its target instead, and an adaptation note is kept. Returns the list of adaptations."""
    heights = heights or {}
    cast = {c['id']: c for c in story['cast']}
    ids = list(cast)
    if len(ids) < 2:
        return []
    xs = {c: (i - (len(ids) - 1) / 2) * gap for i, c in enumerate(ids)}  # the stage calibration (scene.calibrate_stage)
    out = []
    memo = {}

    def geo(cid, kind):
        key = (cid, kind)
        if key in memo:
            return memo[key]
        c = cast[cid]
        ch = rig['cast'][c['name']]
        pose = next((p for p in ch['poses'] if p['kind'] == kind), None)
        if pose is None:
            memo[key] = None
            return None
        others = [o for o in ids if o != cid]
        want = 1 if xs[cid] <= min(xs[o] for o in others) else -1
        mirror = look(pose) != want
        g = geometry(pose, os.path.join(rig_dir, pose['png']), heights.get(c['name'], c.get('height', 1.7)), mirror)
        g['look'] = look(pose) * (-1 if mirror else 1)
        memo[key] = g
        return g

    for i, b in enumerate(story['beats']):
        kind = b.get('pose')
        if kind not in POINTING:
            continue
        who = b['who']
        target = min((o for o in ids if o != who), key=lambda o: abs(xs[o] - xs[who]))
        ga, gb = geo(who, kind), geo(target, 'neutre')
        if not ga or not gb:
            continue
        ok, perp = pointing_ok(ga, xs[who], gb['face'], xs[target])
        if ok:
            continue
        want = 1 if xs[target] > xs[who] else -1
        cands = [k for k in SUBSTITUTES.get(kind, ('neutre',)) if geo(who, k) and not geo(who, k).get('point')]
        good = [k for k in cands if geo(who, k)['look'] == want]
        repl = (good or cands or ['neutre'])[0]
        before = b['text']
        b['pose'] = repl
        name = cast[target].get('label') or cast[target]['name'].title()
        if DEIXIS.search(b['text']):
            # The words pointed: without the finger, the line names the person.
            b['text'] = DEIXIS.sub(lambda m: f'{m.group(0)}, {name}', b['text'], count=1)
        note = (f"Réplique {i + 1} ({who}) : le geste « {kind} » n'est pas jouable par ce dessin (le doigt viserait {perp * 100:.0f} cm à côté "
                f"du visage de {target}) — joué « {repl} » ({who} {INTENT.get(repl, repl)})" + (f" ; texte réadapté : « {b['text']} »" if b['text'] != before else ''))
        b.setdefault('adaptation', note)
        out.append({'beat': i, 'qui': who, 'cible': target, 'pose': kind, 'jouee': repl, 'ecart_cm': round(perp * 100), 'avant': before, 'apres': b['text']})
    # Reactions asked by a line (« react »: {who: pose}) obey the same law.
    for i, b in enumerate(story['beats']):
        for who, kind in list((b.get('react') or {}).items()):
            if kind not in POINTING or who not in cast:
                continue
            target = min((o for o in ids if o != who), key=lambda o: abs(xs[o] - xs[who]))
            ga, gb = geo(who, kind), geo(target, 'neutre')
            if not ga or not gb:
                continue
            ok, perp = pointing_ok(ga, xs[who], gb['face'], xs[target])
            if ok:
                continue
            want = 1 if xs[target] > xs[who] else -1
            cands = [k for k in SUBSTITUTES.get(kind, ('neutre',)) if geo(who, k) and not geo(who, k).get('point')]
            good = [k for k in cands if geo(who, k)['look'] == want]
            repl = (good or cands or ['neutre'])[0]
            b['react'][who] = repl
            out.append({'beat': i, 'qui': who, 'cible': target, 'pose': kind, 'jouee': repl, 'ecart_cm': round(perp * 100), 'reaction': True,
                        'avant': b['text'], 'apres': b['text']})
    if out:
        story.setdefault('adaptations', []).extend(o['beat'] for o in out)
    return out
