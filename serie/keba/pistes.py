"""Pistes d'images clés : chaque paramètre d'un personnage (position, penché, sourire…) est une piste.

Une clé dit « à l'instant t, ce paramètre vaut v, et on y arrive avec telle courbe ». Le moteur échantillonne
les pistes à n'importe quel instant : aucune image n'est dessinée à la main, toutes sont calculées.
"""
from bisect import bisect_right

from .courbes import adoucir


def _melange(a, b, k):
    if isinstance(a, tuple):
        return tuple(x + (y - x) * k for x, y in zip(a, b))
    return a + (b - a) * k


class Piste:
    def __init__(self, defaut):
        self.defaut = defaut
        self.cles: list[tuple[float, object, str]] = []

    def cle(self, t: float, valeur, courbe: str = "douce") -> "Piste":
        t = float(t)
        i = bisect_right([c[0] for c in self.cles], t)
        if i > 0 and abs(self.cles[i - 1][0] - t) < 1e-9:
            self.cles[i - 1] = (t, valeur, courbe)
        else:
            self.cles.insert(i, (t, valeur, courbe))
        return self

    def maintenir(self, t: float) -> "Piste":
        """Garde la valeur courante jusqu'à t (une pause, un « temps » comique)."""
        return self.cle(t, self.valeur(t), "lin")

    def valeur(self, t: float):
        cles = self.cles
        if not cles:
            return self.defaut
        if t <= cles[0][0]:
            return cles[0][1]
        if t >= cles[-1][0]:
            return cles[-1][1]
        i = bisect_right([c[0] for c in cles], t)
        t0, v0, _ = cles[i - 1]
        t1, v1, courbe = cles[i]
        k = adoucir(courbe, (t - t0) / (t1 - t0))
        return _melange(v0, v1, k)

    def fin(self) -> float:
        return self.cles[-1][0] if self.cles else 0.0


class Pistes:
    """Toutes les pistes d'un personnage ou d'un objet animé ; les noms autorisés sont fixés à la création."""

    def __init__(self, defauts: dict):
        self.pistes = {nom: Piste(v) for nom, v in defauts.items()}

    def cle(self, nom: str, t: float, valeur, courbe: str = "douce") -> "Pistes":
        self.pistes[nom].cle(t, valeur, courbe)
        return self

    def valeur(self, nom: str, t: float):
        return self.pistes[nom].valeur(t)

    def maintenir(self, nom: str, t: float) -> "Pistes":
        self.pistes[nom].maintenir(t)
        return self

    def etat(self, t: float) -> dict:
        return {nom: p.valeur(t) for nom, p in self.pistes.items()}

    def fin(self) -> float:
        return max((p.fin() for p in self.pistes.values()), default=0.0)
