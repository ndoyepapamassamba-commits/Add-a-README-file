"""Le plateau du metteur en scène : des ordres simples, traduits en pistes, en physique, en sons et en musique.

Un épisode s'écrit comme une suite d'ordres datés : aller, courir, sauter, faire un geste, changer d'expression,
cadrer, jouer un son, poser une humeur musicale. La physique avance au fil de l'écriture (`monde.avancer_jusqua`) :
le metteur en scène peut donc réagir à ce qui s'est réellement passé (l'heure exacte où la première boîte touche
le sol). À la fin, chaque choc devient un son dosé selon sa force, et les gros chocs secouent la caméra.
"""
import math

from .acteur import V_COURSE, V_MARCHE, Acteur
from .camera import Camera
from .elements import Particules
from .simulation import Monde

SONS_DES_OBJETS = {"boite": "tink", "orange": "bonk", "tete": "bonk", "tole": "fracas", "auvent": "fracas",
                   "bassine": "toc", "seau": "toc", "claquette": "clac", "pied": "toc"}


class Plateau:
    def __init__(self, duree: float, sol_y: float, largeur: int = 1080, hauteur: int = 1920, graine: int = 1):
        self.duree, self.sol_y, self.graine = duree, sol_y, graine
        self.monde = Monde(sol_y=sol_y)
        self.camera = Camera(largeur, hauteur)
        self.particules = Particules(graine)
        self.acteurs: dict[str, Acteur] = {}
        self.sons: list[tuple] = []
        self.coups: list[float] = []
        self._humeurs: list[tuple[float, str]] = []

    # --- distribution ---------------------------------------------------------------------------------------------

    def acteur(self, nom: str, jambe: float, x: float, y: float | None = None) -> Acteur:
        a = Acteur(nom, jambe=jambe, graine=len(self.acteurs) * 7 + self.graine)
        a.pistes.cle("x", 0.0, float(x))
        a.pistes.cle("y", 0.0, float(self.sol_y if y is None else y))
        self.acteurs[nom] = a
        return a

    # --- ordres ---------------------------------------------------------------------------------------------------

    def aller(self, nom: str, t0: float, x1: float, vitesse: float = V_MARCHE, courbe: str = "douce") -> float:
        a = self.acteurs[nom]
        x0 = a.pistes.valeur("x", t0)
        t1 = t0 + max(0.15, abs(x1 - x0) / vitesse * 1.12)
        a.pistes.cle("x", t0, x0, "lin")
        a.pistes.cle("x", t1, float(x1), courbe)
        return t1

    def courir(self, nom: str, t0: float, x1: float, vitesse: float = V_COURSE) -> float:
        return self.aller(nom, t0, x1, vitesse, courbe="douce")

    def sauter(self, nom: str, t0: float, hauteur: float = 120.0, duree: float = 0.7) -> float:
        p = self.acteurs[nom].pistes
        envol = t0 + 0.12
        fin = envol + duree
        p.cle("ecrase", t0, 1.0, "lin").cle("ecrase", envol, 0.78, "sortie").cle("ecrase", envol + 0.08, 1.15, "sortie")
        p.cle("ecrase", envol + duree * 0.5, 1.0, "douce").cle("ecrase", fin - 0.02, 1.0, "lin")
        p.cle("ecrase", fin + 0.06, 0.75, "sortie").cle("ecrase", fin + 0.4, 1.0, "elastique")
        p.cle("saut", envol, 0.0, "lin").cle("saut", envol + duree / 2, float(hauteur), "sortie")
        p.cle("saut", fin, 0.0, "entree")
        return fin

    def geste(self, nom: str, os: str, t0: float, valeur: float, duree: float = 0.3, courbe: str = "douce") -> float:
        p = self.acteurs[nom].pistes
        p.cle(os, t0, p.valeur(os, t0), "lin")
        p.cle(os, t0 + duree, float(valeur), courbe)
        return t0 + duree

    def regle(self, nom: str, piste: str, t0: float, valeur: float, duree: float = 0.3, courbe: str = "douce"):
        return self.geste(nom, piste, t0, valeur, duree, courbe)

    def expression(self, nom: str, t: float, expr: str):
        self.acteurs[nom].expression(t, expr)

    def son(self, t: float, nom: str, volume: float = 1.0, pan: float = 0.0):
        self.sons.append((float(t), nom, float(volume), float(pan)))

    def coup(self, t: float):
        self.coups.append(float(t))

    def humeur(self, t0: float, nom: str):
        self._humeurs.append((float(t0), nom))

    def sections(self):
        h = sorted(self._humeurs)
        return [(t0, h[i + 1][0] if i + 1 < len(h) else self.duree, nom) for i, (t0, nom) in enumerate(h)]

    def cadrer(self, t: float, cx: float, cy: float, zoom: float = 1.0, courbe: str = "douce"):
        for k, v in (("cx", cx), ("cy", cy), ("zoom", zoom)):
            self.camera.pistes.cle(k, t, float(v), courbe)

    # --- après l'écriture -----------------------------------------------------------------------------------------

    def sons_des_chocs(self, largeur_ecran: float = 1080.0):
        dernier = {}
        for c in sorted(self.monde.chocs, key=lambda c: c.t):
            for nom in (c.a, c.b):
                if nom == "sol":
                    continue
                famille = next((f for f in SONS_DES_OBJETS if nom.startswith(f)), None)
                if famille is None or c.t - dernier.get(nom, -1.0) < 0.07:
                    continue
                dernier[nom] = c.t
                volume = min(1.0, max(0.05, (math.log10(max(c.force, 1.0)) - 1.8) / 1.8))
                cx = self.camera.pistes.valeur("cx", c.t)
                pan = max(-0.8, min(0.8, (c.point[0] - cx) / (largeur_ecran * 0.75)))
                self.son(c.t, SONS_DES_OBJETS[famille], volume, pan)
                if c.force > 8000:
                    self.camera.secouer(c.t, min(40.0, c.force / 800.0))
                break

    def preparer(self):
        for a in self.acteurs.values():
            a.preparer(self.duree + 0.5)
        self.camera.preparer(self.duree + 0.5)
