"""La caméra : un cadre (centre, zoom) posé par le metteur en scène, adouci par un ressort, secoué par les chocs.

Le ressort est « critiquement amorti » : il rejoint la cible le plus vite possible sans jamais la dépasser ni osciller
— aucun à-coup d'une image à l'autre, même quand le metteur en scène change brutalement de cadre.
"""
import math

import numpy as np
import skia

from .pistes import Pistes

HZ = 240
OMEGA = 9.0               # raideur du ressort (rad/s) : ~0,4 s pour rejoindre un nouveau cadre


class Camera:
    def __init__(self, largeur: int = 1080, hauteur: int = 1920):
        self.largeur, self.hauteur = largeur, hauteur
        self.pistes = Pistes({"cx": largeur / 2.0, "cy": hauteur / 2.0, "zoom": 1.0, "roulis": 0.0})
        self.secousses: list[tuple[float, float]] = []
        self._t = None

    def secouer(self, t: float, amplitude: float):
        self.secousses.append((float(t), float(amplitude)))

    def preparer(self, duree: float):
        n = int(math.ceil(duree * HZ)) + 2
        t = np.arange(n) / HZ
        cibles = {k: np.array([self.pistes.valeur(k, ti) for ti in t]) for k in ("cx", "cy", "zoom", "roulis")}
        dt = 1.0 / HZ
        lisses = {}
        for k, cible in cibles.items():
            x, v = float(cible[0]), 0.0
            sortie = np.empty(n)
            for i in range(n):
                a = OMEGA * OMEGA * (cible[i] - x) - 2.0 * OMEGA * v
                v += a * dt
                x += v * dt
                sortie[i] = x
            lisses[k] = sortie
        dx, dy, rot = np.zeros(n), np.zeros(n), np.zeros(n)
        for t0, amp in self.secousses:
            i0 = int(t0 * HZ)
            if i0 >= n:
                continue
            u = t[i0:] - t0
            env = amp * np.exp(-u * 4.5)
            dx[i0:] += env * np.sin(u * 61.0 + amp)
            dy[i0:] += env * np.sin(u * 47.0 + 1.3 * amp)
            rot[i0:] += env * 0.0012 * np.sin(u * 37.0)
        self._t, self._l, self._dx, self._dy, self._rot = t, lisses, dx, dy, rot

    def _interp(self, tableau, t):
        i = min(max(t * HZ, 0.0), len(tableau) - 1.001)
        j = int(i)
        k = i - j
        return float(tableau[j] * (1 - k) + tableau[j + 1] * k)

    def etat(self, t: float):
        l = self._l
        return (self._interp(l["cx"], t), self._interp(l["cy"], t), self._interp(l["zoom"], t),
                self._interp(self._dx, t), self._interp(self._dy, t),
                self._interp(self._rot, t) + self._interp(l["roulis"], t))

    def matrice(self, t: float, parallaxe: float = 1.0) -> skia.Matrix:
        """Monde → écran. `parallaxe` < 1 pour les plans lointains (ils bougent moins que la caméra)."""
        cx, cy, zoom, dx, dy, rot = self.etat(t)
        z = 1.0 + (zoom - 1.0) * parallaxe
        m = skia.Matrix()
        m.setTranslate(self.largeur / 2.0, self.hauteur / 2.0)
        m.preRotate(math.degrees(rot))
        m.preScale(z, z)
        base_x, base_y = self.largeur / 2.0, self.hauteur / 2.0
        m.preTranslate(-(base_x + (cx - base_x) * parallaxe) - dx, -(base_y + (cy - base_y) * parallaxe) - dy)
        return m
