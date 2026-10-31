"""Les éléments d'une scène : décor, acteurs (pantins PNG), objets simulés, particules.

Chaque élément a un `ordre` (plan de dessin), éventuellement une `parallaxe` (< 1 : plan lointain), et une méthode
`dessiner(canvas, t)` qui dessine dans le repère du monde (la caméra est appliquée par la scène).
"""
import math
import random

import numpy as np
import skia

from .dessin import ombre_sol, teinte

ECHANTILLONNAGE = skia.SamplingOptions(skia.FilterMode.kLinear, skia.MipmapMode.kLinear)


def image_rgba(tableau: np.ndarray) -> skia.Image:
    """Tableau H×W×4 RVBA non prémultiplié → image skia avec mipmaps (nette quand on la réduit)."""
    return skia.Image.fromarray(np.ascontiguousarray(tableau), colorType=skia.kRGBA_8888_ColorType,
                                alphaType=skia.kUnpremul_AlphaType).withDefaultMipmaps()


def charger_image(chemin) -> skia.Image:
    im = skia.Image.open(str(chemin)).convert(alphaType=skia.kUnpremul_AlphaType,
                                              colorType=skia.kRGBA_8888_ColorType)
    return image_rgba(im.toarray())


class ElementDecor:
    def __init__(self, image: skia.Image, x: float = 0.0, y: float = 0.0, echelle: float = 1.0,
                 parallaxe: float = 1.0, ordre: int = 0):
        self.image, self.x, self.y, self.echelle, self.parallaxe, self.ordre = image, x, y, echelle, parallaxe, ordre

    def dessiner(self, canvas, t):
        w, h = self.image.width() * self.echelle, self.image.height() * self.echelle
        canvas.drawImageRect(self.image, skia.Rect(self.x, self.y, self.x + w, self.y + h), ECHANTILLONNAGE)


class ElementActeur:
    """Un pantin PNG qui joue la pose calculée par l'acteur, avec son ombre au sol."""

    def __init__(self, acteur, pantin, echelle: float, ordre: int = 10, largeur_ombre: float | None = None,
                 textures: dict | None = None):
        self.acteur, self.pantin, self.echelle, self.ordre = acteur, pantin, echelle, ordre
        self.largeur_ombre = largeur_ombre or 0.55 * pantin.hauteur * echelle
        self.textures = textures or {}

    def dessiner(self, canvas, t):
        p = self.acteur.pose(t)
        pl = p["placement"]
        vol = min(1.0, pl["saut"] / 250.0)
        ombre_sol(canvas, pl["x"], pl["y"], self.largeur_ombre * (1 - 0.5 * vol), 0.32 * (1 - 0.6 * vol))
        pos = self.pantin.poser(p["angles"], x=pl["x"], y=pl["y"], echelle=self.echelle, sens=pl["sens"],
                                penche=pl["penche"], ecrase=pl["ecrase"], saut=pl["saut"],
                                bassin=(0.0, p["rebond"] / self.echelle))
        self.pantin.dessiner(canvas, pos, texture=self.textures.get(p["expression"]))


class ElementObjet:
    """L'image d'un objet, posée sur la trajectoire que la physique lui a calculée."""

    def __init__(self, monde, nom: str, image: skia.Image, taille, ordre: int = 20, visible=None):
        self.monde, self.nom, self.image, self.ordre = monde, nom, image, ordre
        self.w, self.h = (taille, taille) if np.isscalar(taille) else taille
        self.visible = visible or (lambda t: True)

    def dessiner(self, canvas, t):
        if not self.visible(t):
            return
        x, y, a = self.monde.etat(self.nom, t)
        canvas.save()
        canvas.translate(x, y)
        canvas.rotate(math.degrees(a))
        canvas.drawImageRect(self.image, skia.Rect(-self.w / 2, -self.h / 2, self.w / 2, self.h / 2), ECHANTILLONNAGE)
        canvas.restore()


class Particules:
    """Poussière, gouttes, étoiles : chaque bouffée est tirée une fois (graine), puis calculée à l'instant t."""
    ordre = 30

    def __init__(self, graine: int = 0):
        self.alea = random.Random(graine)
        self.grains = []        # (t0, x, y, vx, vy, gravite, duree, rayon, couleur, forme)

    def bouffee(self, t0, position, nombre=10, couleur="#D9B98A", vitesse=200.0, duree=0.7, gravite=300.0,
                rayon=(6.0, 16.0), angle=(0.0, 2 * math.pi), forme="rond"):
        for _ in range(nombre):
            a = self.alea.uniform(*angle)
            v = vitesse * self.alea.uniform(0.4, 1.0)
            self.grains.append((t0, position[0], position[1], math.cos(a) * v, math.sin(a) * v, gravite,
                                duree * self.alea.uniform(0.7, 1.2), self.alea.uniform(*rayon), couleur, forme))

    def dessiner(self, canvas, t):
        for t0, x, y, vx, vy, g, d, r, c, forme in self.grains:
            u = t - t0
            if u < 0 or u > d:
                continue
            k = u / d
            px, py = x + vx * u, y + vy * u + 0.5 * g * u * u
            alpha = (1 - k) ** 1.5
            if forme == "etoile":
                p = skia.Path()
                for i in range(10):
                    rr = r if i % 2 == 0 else r * 0.45
                    aa = -math.pi / 2 + i * math.pi / 5 + u * 6
                    (p.moveTo if i == 0 else p.lineTo)(px + rr * math.cos(aa), py + rr * math.sin(aa))
                p.close()
                canvas.drawPath(p, skia.Paint(AntiAlias=True, Color=teinte(c, alpha)))
            else:
                canvas.drawCircle(px, py, r * (0.6 + 0.8 * k), skia.Paint(AntiAlias=True, Color=teinte(c, alpha * 0.85)))
