"""Courbes d'adoucissement : la « respiration » de chaque mouvement.

Chaque courbe reçoit u dans [0, 1] (avancement du temps) et rend l'avancement du mouvement (0 au départ, 1 à
l'arrivée). « anticipe » recule avant de partir, « depasse » dépasse puis revient : deux principes de l'animation
classique, calculés au lieu d'être dessinés.
"""
import math

_C1 = 1.70158
_C2 = _C1 * 1.525
_C3 = _C1 + 1.0


def _rebond(u: float) -> float:
    n1, d1 = 7.5625, 2.75
    if u < 1 / d1:
        return n1 * u * u
    if u < 2 / d1:
        u -= 1.5 / d1
        return n1 * u * u + 0.75
    if u < 2.5 / d1:
        u -= 2.25 / d1
        return n1 * u * u + 0.9375
    u -= 2.625 / d1
    return n1 * u * u + 0.984375


def _elastique(u: float) -> float:
    if u <= 0.0 or u >= 1.0:
        return u
    return 2 ** (-10 * u) * math.sin((u * 10 - 0.75) * (2 * math.pi / 3)) + 1


def _anticipe_depasse(u: float) -> float:
    if u < 0.5:
        return ((2 * u) ** 2 * ((_C2 + 1) * 2 * u - _C2)) / 2
    return ((2 * u - 2) ** 2 * ((_C2 + 1) * (u * 2 - 2) + _C2) + 2) / 2


COURBES = {
    "lin": lambda u: u,
    "entree": lambda u: u ** 3,
    "sortie": lambda u: 1 - (1 - u) ** 3,
    "douce": lambda u: 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2,
    "depasse": lambda u: 1 + _C3 * (u - 1) ** 3 + _C1 * (u - 1) ** 2,
    "anticipe": lambda u: _C3 * u ** 3 - _C1 * u ** 2,
    "anticipe_depasse": _anticipe_depasse,
    "elastique": _elastique,
    "rebond": _rebond,
    "maintien": lambda u: 1.0 if u >= 1.0 else 0.0,
}


def adoucir(nom: str, u: float) -> float:
    """Avancement adouci du mouvement pour un avancement du temps u (borné à [0, 1])."""
    u = 0.0 if u < 0.0 else 1.0 if u > 1.0 else u
    return COURBES[nom](u)
