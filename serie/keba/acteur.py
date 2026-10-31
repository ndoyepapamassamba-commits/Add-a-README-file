"""Les acteurs : le metteur en scène déplace un personnage, l'acteur en déduit tout le jeu du corps.

- La marche et la course viennent de la vitesse : foulée, balancement des bras, flexion des genoux, penché de la
  course ; la phase du pas avance avec la distance parcourue (pas de pieds qui glissent en rythme faux).
- Le personnage se tourne dans le sens où il va ; immobile, il respire (aucune image figée).
- Les gestes (bras levé, tête qui se tourne…) sont des pistes qui s'ajoutent au cycle de marche.
Repère des angles : radians, sens horaire à l'écran, personnage tourné vers la droite (le miroir est fait au placement).
"""
import math
from bisect import bisect_right

import numpy as np

from .pistes import Pistes

V_MARCHE = 260.0          # px/s : foulée pleine
V_COURSE = 620.0          # px/s : course pleine
HZ = 240

OS_GESTES = ("torse", "tete", "bras_av", "avbras_av", "main_av", "bras_ar", "avbras_ar", "main_ar",
             "cuisse_av", "tibia_av", "pied_av", "cuisse_ar", "tibia_ar", "pied_ar")
DEFAUTS = {"x": 0.0, "y": 0.0, "saut": 0.0, "penche": 0.0, "ecrase": 1.0, "sens_force": 0.0,
           **{nom: 0.0 for nom in OS_GESTES}}


def _amplitude_hanche(course):
    return 0.42 + 0.33 * course


class Acteur:
    def __init__(self, nom: str, jambe: float, graine: int = 0):
        self.nom = nom
        self.jambe = jambe
        self.graine = graine
        self.pistes = Pistes(DEFAUTS)
        self.expressions: list[tuple[float, str]] = []
        self._t = None

    def expression(self, t: float, nom: str):
        self.expressions.append((float(t), nom))
        self.expressions.sort(key=lambda e: e[0])

    def longueur_cycle(self, foulee: float, course: float) -> float:
        """Distance parcourue pendant un cycle complet (deux pas)."""
        return 4.0 * self.jambe * math.sin(_amplitude_hanche(course) * max(foulee, 0.35)) * (1.0 + 0.5 * course)

    # --- préparation (après la mise en scène) ---------------------------------------------------------------------

    def preparer(self, duree: float):
        n = int(math.ceil(duree * HZ)) + 2
        t = np.arange(n) / HZ
        x = np.array([self.pistes.valeur("x", ti) for ti in t])
        vx = np.gradient(x, 1.0 / HZ)
        lisse = np.empty(n)
        k = 1.0 - math.exp(-1.0 / (HZ * 0.08))
        acc = 0.0
        for i, v in enumerate(vx):
            acc += (v - acc) * k
            lisse[i] = acc
        vitesse = np.abs(lisse)
        foulee = np.clip(vitesse / V_MARCHE, 0.0, 1.0)
        course = np.clip((vitesse - 1.3 * V_MARCHE) / (V_COURSE - 1.3 * V_MARCHE), 0.0, 1.0)
        phase = np.zeros(n)
        dx = np.abs(np.diff(x, prepend=x[0]))
        for i in range(1, n):
            phase[i] = phase[i - 1] + 2 * math.pi * dx[i] / self.longueur_cycle(foulee[i], course[i]) \
                if foulee[i] > 0.02 else phase[i - 1]
        sens = np.empty(n)
        courant = 1.0
        for i in range(n):
            if abs(lisse[i]) > 30.0:
                courant = 1.0 if lisse[i] > 0 else -1.0
            sens[i] = courant
        self._t, self._foulee, self._course, self._phase, self._sens = t, foulee, course, phase, sens

    def _interp(self, tableau, t):
        i = min(max(t * HZ, 0.0), len(tableau) - 1.001)
        j = int(i)
        k = i - j
        return tableau[j] * (1 - k) + tableau[j + 1] * k

    def phase(self, t: float) -> float:
        return float(self._interp(self._phase, t))

    # --- la pose à l'instant t ------------------------------------------------------------------------------------

    def pose(self, t: float) -> dict:
        if self._t is None:
            raise RuntimeError("acteur non préparé : appeler preparer(duree) après la mise en scène")
        f = float(self._interp(self._foulee, t))
        c = float(self._interp(self._course, t))
        phi = self.phase(t)
        s, co = math.sin(phi), math.cos(phi)
        A = _amplitude_hanche(c) * f
        K = (0.55 + 0.75 * c) * f
        B = (0.32 + 0.30 * c) * f
        angles = {
            "cuisse_av": -A * s, "cuisse_ar": A * s,
            "tibia_av": K * max(0.0, co), "tibia_ar": K * max(0.0, -co),
            "bras_av": B * s, "bras_ar": -B * s,
            "avbras_av": -1.25 * c, "avbras_ar": -1.25 * c,
            "torse": 0.16 * c, "tete": -0.08 * c,
        }
        angles["pied_av"] = -0.7 * (angles["cuisse_av"] + angles["tibia_av"])
        angles["pied_ar"] = -0.7 * (angles["cuisse_ar"] + angles["tibia_ar"])
        souffle = 2 * math.pi * t / 3.2 + self.graine
        angles["torse"] += 0.013 * math.sin(souffle)
        angles["tete"] += 0.022 * math.sin(souffle + 1.1)
        etat = self.pistes.etat(t)
        for nom in OS_GESTES:
            angles[nom] = angles.get(nom, 0.0) + etat[nom]
        sens = etat["sens_force"] if abs(etat["sens_force"]) > 0.5 else float(self._interp(self._sens, t))
        sens = 1.0 if sens >= 0 else -1.0
        rebond = -0.07 * self.jambe * f * (1 + 0.6 * c) * (1 + math.cos(2 * phi)) / 2
        i = bisect_right([e[0] for e in self.expressions], t)
        expression = self.expressions[i - 1][1] if i > 0 else "neutre"
        return {"angles": angles, "placement": {"x": etat["x"], "y": etat["y"], "sens": sens, "penche": etat["penche"],
                                                "ecrase": etat["ecrase"], "saut": etat["saut"]},
                "rebond": rebond, "foulee": f, "course": c, "phase": phi, "expression": expression}
