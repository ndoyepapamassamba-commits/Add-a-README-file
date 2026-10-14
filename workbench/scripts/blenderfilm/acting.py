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


def curves(jaw, partner_nods, x, nF, fps, seed, on=True):
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
                'listen': z, 'bob': z, 'toward': toward, 'speak': speak}
    head = (math.radians(1.5) * np.sin(tt * 2 * math.pi / 4.1 + seed % 4)
            + math.radians(2.0) * energy * np.sin(tt * 2 * math.pi * 2.1 + seed % 6)
            + toward * math.radians(1.2) * lean)
    spine = math.radians(0.8) * sway + toward * math.radians(4.5) * lean
    root = math.radians(1.2) * weight_shifts(nF, fps, seed) + math.radians(0.6) * sway
    return {'head': head, 'spine': spine, 'root': root, 'breath': breath, 'breath_amp': 0.022, 'listen': listen,
            'bob': 0.004 * energy * bob, 'toward': toward, 'speak': speak}
