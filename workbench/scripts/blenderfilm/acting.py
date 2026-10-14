"""LE CORPS JOUE LA VOIX — courbes de jeu d'un acteur, sans Blender (testables).

Audit du film 5 (« acteurs statiques ») : respiration ±1 %, balancement ±0,7°, hochement 1,2 cm — invisibles. Ici le
corps joue la voix : en parlant, le buste se penche vers le partenaire et la tête le suit (mesuré dans Blender : ≈ 5 cm
au sommet de la tête ; une tête qui tournait contre le buste annulait le penché, ≈ 1 cm) ; la tête bat les syllabes ;
toujours, une respiration visible et un report du poids toutes les 2,5 à 4,5 s ; en écoutant, de petits hochements sur
les mots forts du partenaire.

Signe mesuré sur le squelette de la troupe : une rotation positive (rotation_euler[2]) envoie le haut de l'os vers −x.
"""
import math

import numpy as np


def smooth(a, n):
    n = max(1, int(n))
    return np.convolve(np.asarray(a, float), np.ones(n) / n, mode='same')


def weight_shifts(nF, fps, seed):
    """A weight shift every 2.5–4.5 s, eased over 0.6 s (−1 … 1)."""
    rng = np.random.default_rng(seed)
    ws, f, cur = np.zeros(nF + 1), 0, 0.0
    while f < nF + 1:
        nxt, dur = rng.uniform(-1, 1), int(rng.uniform(2.5, 4.5) * fps)
        ramp = int(0.6 * fps)
        seg = cur + (nxt - cur) * (0.5 - 0.5 * np.cos(np.pi * np.clip(np.arange(dur) / ramp, 0, 1)))
        ws[f:f + dur] = seg[: max(0, nF + 1 - f)]
        cur, f = nxt, f + dur
    return ws


# Acting for the camera: the same lean covers ≈ 5 % of a two-shot but ≈ 23 % of a 30 cm close-up. Scaled by the shot
# the actor is framed in, the motion keeps the same size ON SCREEN (measured on film 6: close shots moved ≈ 60 % of the
# picture against ≤ 29 % on the channel's videos).
SHOT_SCALE = {'cu': 0.45, 'mcu': 0.65, 'two': 1.0}


def shot_scale(shots, aid, nF, fps):
    """Per-frame amplitude of the acting of `aid` from the shots that frame it (eased over 0.2 s around the cuts)."""
    sc = np.ones(nF + 1)
    for s in shots:
        if s.get('target') == aid and s['type'] in SHOT_SCALE:
            sc[s['start']:min(nF + 1, s['end'] + 1)] = SHOT_SCALE[s['type']]
    n = max(1, int(0.2 * fps))
    padded = np.pad(sc, (n, n), mode='edge')  # no fade toward 0 at the film's two ends
    return np.clip(np.convolve(padded, np.ones(n) / n, mode='same')[n:-n], 0.0, 1.0)


def mocap_spans(poses, nF, kinds):
    """(start, end, kind) of every span where the actor plays a pose that has a captured clip (track poses are
    (frame, kind) changes; the pose shows from frame + 1)."""
    spans = []
    for i, (f, kind) in enumerate(poses):
        end = poses[i + 1][0] if i + 1 < len(poses) else nF
        if kind in kinds and end - f >= 4:
            spans.append((f, end, kind))
    return spans


def curves(jaw, partner_nods, x, nF, fps, seed, on=True, scale=None, clips=None, height_m=1.6):
    """Per-frame acting curves of one actor (index = frame − 1).
    jaw: the actor's mouth opening track; partner_nods: the other actors' emphasis nods; x: the actor's place on the
    stage (≤ 0 = left, its partner on the right). Returns radians for head / spine / root rotations, the breath (−1…1)
    and the listening nods; on=False gives the old idle only (A/B check)."""
    tt = np.arange(nF + 1) / fps
    breath = np.sin(tt * 2 * math.pi / 3.6 + seed % 7)
    sway = np.sin(tt * 2 * math.pi / 5.3 + seed % 5)
    jz = np.concatenate([np.asarray(jaw, float), np.zeros(max(0, nF + 1 - len(jaw)))])[: nF + 1]
    speak = np.clip(smooth(jz > 0.05, 0.4 * fps), 0, 1)
    energy = smooth(jz, 0.12 * fps)
    lean = np.clip(smooth(jz > 0.05, 0.6 * fps), 0, 1)
    listen = np.zeros(nF + 1)
    for on_ in partner_nods:
        sh = np.concatenate([np.zeros(5), np.asarray(on_, float)])[: nF + 1]
        listen[: len(sh)] = np.maximum(listen[: len(sh)], 0.5 * sh)
    listen *= 1 - speak
    toward = -1.0 if x <= 0 else 1.0  # positive rotation sends the top to −x: the partner on the right needs −
    bob = np.sin(tt * 2 * math.pi * 4.2 + seed % 3)
    if not on:
        z = np.zeros(nF + 1)
        return {'head': z, 'spine': z, 'root': math.radians(0.7) * sway, 'breath': breath, 'breath_amp': 0.010,
                'listen': z, 'bob': z, 'toward': toward, 'speak': speak, 'lift': z, 'squash': z}
    k = np.ones(nF + 1) if scale is None else np.asarray(scale, float)[: nF + 1]
    head = k * (math.radians(1.5) * np.sin(tt * 2 * math.pi / 4.1 + seed % 4)
            + math.radians(2.0) * energy * np.sin(tt * 2 * math.pi * 2.1 + seed % 6)
            + toward * math.radians(1.2) * lean)
    spine = k * (math.radians(0.8) * sway + toward * math.radians(4.5) * lean)
    root = k * (math.radians(1.2) * weight_shifts(nF, fps, seed) + math.radians(0.6) * sway)
    lift = np.zeros(nF + 1)
    squash = np.zeros(nF + 1)
    # REAL HUMAN MOTION on the poses that have a captured clip (CMU mocap, mocap.py): a laugh doubles over, a shrug
    # lifts, a pointing argument leans in — the clip's most expressive stretch, in the plane of our cards.
    for span in clips or []:
        # (start, end, kind) or (start, end, kind, gain): the director's energy scales the clip (0,5 … 1,3).
        a, b, kind = span[0], span[1], span[2]
        gain = float(span[3]) if len(span) > 3 else 1.0
        import mocap
        o = mocap.overlay(kind, b - a, fps, height_m, gain=gain)
        kk = k[a:b]
        mirror = toward  # the clip's lean toward its partner follows ours
        head[a:b] += kk * o['head'] * mirror
        spine[a:b] += kk * o['spine'] * mirror
        root[a:b] += kk * o['root'] * mirror
        lift[a:b] += kk * o['lift']
        squash[a:b] = np.maximum(squash[a:b], kk * o['squash'])
    return {'head': head, 'spine': spine, 'root': root, 'breath': breath * k, 'breath_amp': 0.022, 'listen': listen,
            'bob': 0.004 * energy * bob * k, 'toward': toward, 'speak': speak, 'lift': lift, 'squash': squash}
