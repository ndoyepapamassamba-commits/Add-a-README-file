"""
PLAUSIBILITÉ — ce qui est physiquement et humainement possible, calculé avant de générer, vérifié ensuite.

Les personnages sont des dessins posés dans un espace en 3D : rien n'empêche, techniquement, deux cartes de se
couvrir, un figurant de « flotter » ou de traverser la scène à 6 m/s. Ce module ramène chaque placement et chaque
mouvement à des lois mesurables :

  • Impénétrabilité : deux corps n'occupent jamais le même volume (emprise au sol d'un adulte ≈ largeur d'épaules
    × épaisseur du corps, ordres de grandeur anthropométriques : 0,40–0,46 m × 0,25–0,30 m).
  • Proxémie (E. T. Hall, The Hidden Dimension, 1966) : intime < 0,45 m ; personnelle 0,45–1,2 m (conversation
    entre proches) ; sociale 1,2–3,6 m ; publique au-delà. Deux personnes qui se parlent se tiennent dans la zone
    personnelle, face à face ; un inconnu ne se tient pas dans la zone personnelle d'une conversation.
  • Lisibilité à l'écran : deux interlocuteurs ne se superposent pas (chacun garde sa silhouette) ; deux personnes
    au même plan ne se recouvrent pas.
  • Gravité (g = 9,81 m/s²) : un saut de hauteur h dure 2·√(2h/g) — 6 cm de saut = 0,22 s en l'air, pas 0,5 s.
    Les pieds restent au sol en marchant : le corps se balance, il ne décolle pas.
  • Vitesse humaine : marche d'un adulte ≈ 1,2–1,4 m/s, marche rapide ≈ 2 m/s ; un enfant qui court ≈ 3–4 m/s.
  • Portée du bras ≈ 0,44 × la taille : un geste vers le partenaire s'arrête avant son visage (scene.calibrate_stage).
"""
import math
import os

G = 9.81
HALL = {'intime': 0.45, 'personnelle': 1.2, 'sociale': 3.6}
TALK = (0.75, 1.2)          # casual conversation, inside the personal zone
BODY_DEPTH = 0.28           # thickness of a standing adult (m)
CORE = 0.35                 # half-width of the body core as a share of the drawn width (the drawing includes arms)
WALK_MAX, RUN_MAX = 2.2, 4.0
SAME_PLANE = 0.6            # two people closer than this in depth stand « on the same plane »
BACKGROUND = 0.5            # apparent size (vs the actors) under which a person reads as « far behind »
HEAD = 0.13                 # half-width of a head (m)


def airtime(h):
    """Time in the air of a jump of height h (m)."""
    return 2.0 * math.sqrt(max(0.0, 2.0 * h / G))


def hop(t, h):
    """Height at time t (s) of a jump of height h — a true parabola, 0 outside the flight."""
    T = airtime(h)
    if t < 0 or t > T:
        return 0.0
    v = math.sqrt(2 * G * h)
    return max(0.0, v * t - G * t * t / 2)


def zone(d):
    """Hall's zone of a distance between two people."""
    if d < HALL['intime']:
        return 'intime'
    if d <= HALL['personnelle']:
        return 'personnelle'
    if d <= HALL['sociale']:
        return 'sociale'
    return 'publique'


def core(x, w):
    return x - CORE * w, x + CORE * w


def gap1d(a, b):
    """Free space between two intervals (negative = overlap length)."""
    return max(b[0] - a[1], a[0] - b[1])


def talk_spacing(wa, wb):
    """Centre distance of two people talking: inside the personal zone, never closer than their bodies allow."""
    need = CORE * (wa + wb) + 0.06  # the two body cores side by side, a hand's breadth apart
    return max(need, TALK[0])


def box_overlap(a, b):
    """Overlap of two screen boxes (x0, y0, x1, y1) as a share of the smaller one."""
    ix = min(a[2], b[2]) - max(a[0], b[0])
    iy = min(a[3], b[3]) - max(a[1], b[1])
    if ix <= 0 or iy <= 0:
        return 0.0
    sa = (a[2] - a[0]) * (a[3] - a[1])
    sb = (b[2] - b[0]) * (b[3] - b[1])
    return ix * iy / max(1e-9, min(sa, sb))


def screen_box(project, cam, th, tv, x, y, w, h, z0=0.0):
    """Screen box of a standing body core (x centre, y depth, drawn width w, height h, feet at z0) seen by a camera."""
    pts = [project(cam, th, tv, (cx, y, z)) for cx in core(x, w) for z in (z0, z0 + h)]
    if any(p[0] is None for p in pts):
        return None
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def hidden_share(iv, occluders):
    """Share of a screen interval covered by the union of occluding intervals."""
    w = iv[1] - iv[0]
    if w <= 0:
        return 0.0
    cuts = sorted((max(iv[0], a), min(iv[1], b)) for a, b in occluders if min(iv[1], b) > max(iv[0], a))
    cov, end = 0.0, iv[0]
    for a, b in cuts:
        a = max(a, end)
        if b > a:
            cov += b - a
            end = b
    return cov / w


def face_conflict(face, actor_faces, r, far, size=1.0, bodies=(), frame=None):
    """Screen laws of a background FACE against the faces of the actors (all in frame-height units, r = an actor's
    head radius on screen, size = the background person's apparent size): hidden behind a head (fine); « merger » —
    the outlines of the two heads closer than one head radius, two heads reading as one; in the EYELINE — within one
    head of the segment joining two speakers' eyes. A far, small face is free. Returns '' or the broken law."""
    if far:
        return ''
    fu, fv = face
    if frame and not (frame[0] <= fu <= frame[2] and frame[1] <= fv <= frame[3]):
        return ''  # out of the frame: not seen
    if any(b[0] <= fu <= b[2] and b[1] <= fv <= b[3] for b in bodies):
        return ''  # behind an actor's body (below the shoulders): not seen
    for au, av in actor_faces:
        if math.hypot(fu - au, fv - av) < 0.85 * r:
            return ''  # behind that head: not seen
    for au, av in actor_faces:
        if math.hypot(fu - au, fv - av) < r + size * r + r:
            return 'fusion'
    for (au, av), (bu, bv) in zip(actor_faces, actor_faces[1:]):
        du, dv = bu - au, bv - av
        L2 = du * du + dv * dv
        if L2 <= 1e-12:
            continue
        t = ((fu - au) * du + (fv - av) * dv) / L2
        if 0 < t < 1 and abs((fu - au) * dv - (fv - av) * du) / math.sqrt(L2) < r:
            return 'regard'
    return ''


def layout(people, fixed, x_range, min_depth, lanes_step=0.35, proj=None, frame_half=None, stand=None, report=None):
    """Places the static extras so that the laws hold — groups that talk at conversation distance facing each other,
    nobody on top of anybody on the same plane, nobody inside the personal zone of the actors' conversation.
    people: [{'id','w','x','y','group','talk'}] (x, y metres; y = depth behind the actors); fixed: the actors
    [{'x','y','w'}]; x_range(y) → (xmin, xmax) visible at that depth; stand(x, y, height) → the walkable-floor law
    (ground.py: feet on a floor, or hidden behind the set with the head in view). Returns {id: (x, y, face)} — face +1
    looks right."""
    out = {}
    placed = [dict(p) for p in fixed]
    groups = {}
    for p in people:
        groups.setdefault(p['group'], []).append(p)
    for g, members in groups.items():
        members = sorted(members, key=lambda p: p['x'])
        y = max(min_depth, min(p['y'] for p in members))
        # Offsets of the members inside the group: talking pairs at conversation distance (the casual 0.75 m first,
        # then the closest the personal zone and their bodies allow), others side by side.
        def offsets(tight):
            o_ = [0.0]
            for a, b in zip(members, members[1:]):
                if a.get('talk'):
                    step = max(HALL['intime'], CORE * (a['w'] + b['w']) + 0.06) if tight else talk_spacing(a['w'], b['w'])
                else:
                    step = CORE * (a['w'] + b['w']) + 0.1
                o_.append(o_[-1] + step)
            m_ = (o_[0] + o_[-1]) / 2
            return [v - m_ for v in o_]
        variants = [offsets(False), offsets(True)]
        offs = variants[0]
        x0 = sum(p['x'] for p in members) / len(members)
        # Screen intervals of the actors' bodies in the wide shot (what hides the background).
        # Every view the wide shots can take (their moves: push, pull, drift): the rule must hold in all of them.
        views = proj or []
        pjs = [(lambda x, y, v=v: (x - v.get('camx', v['cx'])) / (y + v['d']) - (v['cx'] - v.get('camx', v['cx'])) / v['d']) for v in views]
        occs, gaps = [], []
        for v, pj in zip(views, pjs):
            oc = [(pj(f['x'] - CORE * f['w'], f['y']), pj(f['x'] + CORE * f['w'], f['y'])) for f in fixed]
            oc += [(-1e9, -v['half']), (v['half'], 1e9)]  # outside the frame = not seen either
            occs.append(oc)
            # Screen positions (frame-height units) of the actors' faces, and an actor's head radius on screen.
            ph = lambda x, y, z, v=v: ((x - v['camx']) / (y + v['d']) - (v['cx'] - v['camx']) / v['d'],
                                       -((z - v['camz']) / (y + v['d']) - (v['cz'] - v['camz']) / v['d']))
            sc = 1.0 / (2 * v['hh'] / v['d'])
            af = sorted(((ph(f['fx'], f['y'], f['fz'])[0] * sc, ph(f['fx'], f['y'], f['fz'])[1] * sc) for f in fixed if 'fx' in f))
            # every face position an actor's poses can take (a laugh bends the head, a mirrored pose moves it)
            allf = [(ph(f['x'] + dx, f['y'], dz)[0] * sc, ph(f['x'] + dx, f['y'], dz)[1] * sc) for f in fixed for dx, dz in f.get('faces', [])] or af
            bodies = [(pj(f['x'] - CORE * f['w'], f['y']) * sc, ph(f['x'], f['y'], f['fz'] - 0.2)[1] * sc,
                       pj(f['x'] + CORE * f['w'], f['y']) * sc, ph(f['x'], f['y'], 0.0)[1] * sc) for f in fixed if 'fz' in f]
            frame = (-v['half'] * sc, -0.5, v['half'] * sc, 0.5)
            gaps.append((ph, sc, af, HEAD / (2 * v['hh']), bodies, frame, allf))
        talk = len(members) > 1 and any(p.get('talk') for p in members)
        best, best_score = None, None
        for tries in range(10 if stand is not None else 4):
            lo, hi = x_range(y)
            span = (offs[-1] - offs[0]) / 2 + CORE * max(p['w'] for p in members)
            for k, offs in ((k, v) for k in range(0, 120) for v in variants):
                dx = 0.05 * ((k + 1) // 2) * (1 if k % 2 else -1)
                span = (offs[-1] - offs[0]) / 2 + CORE * max(p['w'] for p in members)
                xc = min(max(x0 + dx, lo + span), hi - span) if hi - lo > 2 * span else (lo + hi) / 2
                ok = True
                for p, o in zip(members, offs):
                    c = core(xc + o, p['w'])
                    for q in placed:
                        if abs(q['y'] - y) < SAME_PLANE and gap1d(c, core(q['x'], q['w'])) < 0.05:
                            ok = False
                            break
                    if not ok:
                        break
                if not ok:
                    continue
                if stand is not None and not all(stand(xc + o, y, p.get('h', 1.7)) for p, o in zip(members, offs)):
                    continue  # standing on the produce, on a table… — or swallowed whole by the set
                # A conversation is seen whole or hidden whole — never one face visible and the other behind an actor.
                split, hsum, eye = False, 0.0, False
                for v, pj, oc, gp in zip(views, pjs, occs, gaps):
                    ivs = [(pj(xc + o - CORE * p['w'], y), pj(xc + o + CORE * p['w'], y)) for p, o in zip(members, offs)]
                    hid = [hidden_share(iv, oc) for iv in ivs]
                    split = split or (talk and max(hid) - min(hid) > 0.3)
                    hsum += sum(hid) / len(hid)
                    # A FACE glued to an actor's face or in the eyeline of the conversation, unless clearly far behind.
                    ph, sc, af, r, bodies, frame, allf = gp
                    far = v['d'] / (v['d'] + y) <= BACKGROUND
                    if not far and len(af) >= 1:
                        for p, o in zip(members, offs):
                            # (the face may sit off the card centre: test it either way the card is turned)
                            for dfx in {0.0, p.get('fdx', 0.0), -p.get('fdx', 0.0)}:
                                fu, fv = ph(xc + o + dfx, y, p.get('fz', 1.45))
                                # merger against EACH pose's face on its own (a head that hides it in one pose — the
                                # neutral one — may reveal it, glued, when the actor bends to laugh), eyeline between the
                                # speakers' faces
                                sz_ = v['d'] / (v['d'] + y)
                                if (any(face_conflict((fu * sc, fv * sc), [pf], r, False, sz_, bodies, frame) == 'fusion' for pf in allf)
                                        or face_conflict((fu * sc, fv * sc), af, r, False, sz_, bodies, frame)):
                                    eye = True
                hmean = hsum / max(1, len(views))
                score = (10.0 if split else 0.0) + (4.0 if eye else 0.0) + 0.5 * abs(dx) + 0.6 * hmean + 0.3 * tries + (0.1 if offs is variants[1] else 0.0)
                if os.environ.get('MASSAMBA_DEBUG_LAYOUT') and k == 0 and tries == 0:
                    v0, (ph0, sc0, af0, r0, _b0, _f0, _a0) = views[0], gaps[0]
                    print('[layout-v]', {k_: round(val, 3) for k_, val in v0.items()}, 'af', [tuple(round(c, 3) for c in a) for a in af0], 'r', round(r0, 3), flush=True)
                    for p_, o_ in zip(members, offs):
                        fu, fv = ph0(xc + o_, y, p_.get('fz', 1.45))
                        print('[layout-f]', p_['id'], 'fz', round(p_.get('fz', 1.45), 3), 'fdx', round(p_.get('fdx', 0), 3), 'face', round(fu * sc0, 3), round(fv * sc0, 3),
                              'law', face_conflict((fu * sc0, fv * sc0), af0, r0, False, v0['d'] / (v0['d'] + y)), flush=True)
                if os.environ.get('MASSAMBA_DEBUG_LAYOUT') and k % 10 == 0:
                    print('[layout]', g, 'try', tries, 'x', round(xc, 3), 'y', round(y, 2), 'split', split, 'eye', eye, 'hid', round(hmean, 2), 'score', round(score, 2), flush=True)
                if best_score is None or score < best_score:
                    best, best_score, best_offs = (xc, y), score, offs
                if score < 0.05:
                    break
            if best_score is not None and best_score < 1.0:
                break
            y += lanes_step  # no clean room on this plane: one step further back
        xc, y = best or (x0, y + lanes_step)
        offs = best_offs if best else variants[0]
        if report is not None:
            # The laws the best place still breaks (None = no legal place at all): the caller decides (an extra who
            # cannot stand anywhere lawful is not shown).
            report[g] = None if best is None else best_score
        if os.environ.get('MASSAMBA_DEBUG_LAYOUT'):
            print('[layout-best]', g, 'x', round(xc, 3), 'y', round(y, 2), 'score', round(best_score or -1, 2), flush=True)
        n = len(members)
        for i, (p, o) in enumerate(zip(members, offs)):
            face = None
            if p.get('talk') and n >= 2:
                face = 1 if i < n / 2 else -1  # they face each other
            out[p['id']] = (xc + o, y, face)
            placed.append({'x': xc + o, 'y': y, 'w': p['w']})
    return out


def lane(depth, taken, step=0.35, lo=1.25):
    """A walking lane for a passer-by: a depth at least one body (+ margin) away from everybody standing or walking."""
    y = max(lo, depth)
    for _ in range(12):
        if all(abs(y - t) >= step for t in taken):
            return round(y, 2)
        y += step / 2
    return round(y, 2)
