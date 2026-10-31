"""Outils de dessin : formes éclairées, membres « en caoutchouc », ombres au sol, motifs wax.

Toute la qualité visuelle passe par ici : chaque forme reçoit un contour d'épaisseur variable (plus épais du côté
de l'ombre), une ombre en croissant à l'opposé de la lumière et un reflet du côté de la lumière.
Greffe : skia-python 144.1 (BSD) — Paint.getFillPath, ClipOp.kDifference, Picture.makeShader (sondés le 31/10/2026).
"""
import math
import random
from bisect import bisect_left

import skia

LUMIERE = (-0.55, -0.83)            # direction vers la lumière (soleil en haut à gauche)
CONTOUR = "#2A1810"                 # brun très sombre, plus chaud que le noir
OMBRE = (34, 18, 64)                # ombre froide, violacée : plus « peinte » qu'un simple noir


def _rvb(hexa: str) -> tuple[int, int, int]:
    h = hexa.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def teinte(hexa: str, alpha: float = 1.0) -> int:
    r, v, b = _rvb(hexa)
    return skia.Color(r, v, b, max(0, min(255, round(alpha * 255))))


def melanger(c1: str, c2: str, k: float) -> str:
    a, b = _rvb(c1), _rvb(c2)
    return "#" + "".join(f"{round(x + (y - x) * k):02X}" for x, y in zip(a, b))


def assombrir(c: str, k: float) -> str:
    return melanger(c, "#1A1030", k)


def eclaircir(c: str, k: float) -> str:
    return melanger(c, "#FFFFFF", k)


def _decale(chemin: skia.Path, dx: float, dy: float) -> skia.Path:
    p = skia.Path(chemin)
    p.offset(dx, dy)
    return p


def forme_eclairee(canvas, chemin: skia.Path, couleur: str, contour: float = 5.0, ombre: float = 0.30,
                   reflet: float = 0.22, shader=None, couleur_contour: str = CONTOUR, lumiere=LUMIERE):
    """Remplit une forme avec contour pondéré, ombre en croissant et reflet."""
    b = chemin.getBounds()
    taille = max(4.0, min(b.width(), b.height()))
    if contour > 0:
        trait = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=2 * contour,
                           StrokeJoin=skia.Paint.kRound_Join, Color=teinte(couleur_contour))
        canvas.drawPath(_decale(chemin, -lumiere[0] * contour * 0.45, -lumiere[1] * contour * 0.45), trait)
        canvas.drawPath(chemin, trait)
    fond = skia.Paint(AntiAlias=True, Color=teinte(couleur))
    if shader is not None:
        fond.setShader(shader)
    canvas.drawPath(chemin, fond)
    zone = skia.Rect(b.left() - 2, b.top() - 2, b.right() + 2, b.bottom() + 2)
    if ombre > 0:
        d = taille * 0.20
        canvas.save()
        canvas.clipPath(chemin, skia.ClipOp.kIntersect, True)
        canvas.clipPath(_decale(chemin, lumiere[0] * d, lumiere[1] * d), skia.ClipOp.kDifference, True)
        canvas.drawRect(zone, skia.Paint(AntiAlias=True, Color=skia.Color(*OMBRE, round(ombre * 255))))
        canvas.restore()
    if reflet > 0:
        d = taille * 0.07
        canvas.save()
        canvas.clipPath(chemin, skia.ClipOp.kIntersect, True)
        canvas.clipPath(_decale(chemin, -lumiere[0] * d, -lumiere[1] * d), skia.ClipOp.kDifference, True)
        canvas.drawRect(zone, skia.Paint(AntiAlias=True, Color=skia.Color(255, 250, 235, round(reflet * 255))))
        canvas.restore()


# --- Membres « en caoutchouc » : un arc qui garde sa longueur, le coude se plie tout seul ---------------------------

def point_quad(a, c, b, u):
    v = 1 - u
    return (v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1])


def _table_fleche():
    """Rapport longueur d'arc / corde d'une courbe de Bézier quadratique selon le décalage du point de contrôle."""
    table = []
    for i in range(0, 241):
        k = i / 160.0                       # décalage du contrôle / corde, de 0 à 1,5
        a, c, b = (0.0, 0.0), (0.5, k), (1.0, 0.0)
        pts = [point_quad(a, c, b, j / 64) for j in range(65)]
        long = sum(math.dist(pts[j], pts[j + 1]) for j in range(64))
        table.append((long, k))
    return table


_TABLE = _table_fleche()
_RAPPORTS = [r for r, _ in _TABLE]


def coude(a, b, longueur: float, sens: int = 1):
    """Point de contrôle qui donne au membre a→b la longueur voulue (plié du côté `sens`)."""
    d = math.dist(a, b)
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    if d < 1e-6:
        return (mx, my - longueur / 2 * sens)
    rapport = longueur / d
    if rapport <= 1.0:
        return (mx, my)
    i = min(bisect_left(_RAPPORTS, rapport), len(_TABLE) - 1)
    if i == 0:
        k = 0.0
    else:
        (r0, k0), (r1, k1) = _TABLE[i - 1], _TABLE[i]
        k = k0 + (k1 - k0) * ((rapport - r0) / (r1 - r0) if r1 > r0 else 0)
    nx, ny = -(b[1] - a[1]) / d, (b[0] - a[0]) / d
    return (mx + nx * k * d * sens, my + ny * k * d * sens)


def chemin_membre(a, b, longueur, epaisseur, sens=1):
    c = coude(a, b, longueur, sens)
    trace = skia.Path()
    trace.moveTo(*a)
    trace.quadTo(c[0], c[1], b[0], b[1])
    p = skia.Paint(Style=skia.Paint.kStroke_Style, StrokeWidth=epaisseur, StrokeCap=skia.Paint.kRound_Cap,
                   StrokeJoin=skia.Paint.kRound_Join)
    plein = skia.Path()
    p.getFillPath(trace, plein)
    return plein, c


def membre(canvas, a, b, longueur, epaisseur, couleur, contour=4.0, sens=1, ombre=0.30):
    plein, c = chemin_membre(a, b, longueur, epaisseur, sens)
    forme_eclairee(canvas, plein, couleur, contour=contour, ombre=ombre, reflet=0.15)
    return c


def ombre_sol(canvas, x, y, largeur, alpha=0.28):
    p = skia.Paint(AntiAlias=True, Color=skia.Color(*OMBRE, round(alpha * 255)),
                   MaskFilter=skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, max(1.0, largeur * 0.08)))
    canvas.drawOval(skia.Rect(x - largeur / 2, y - largeur * 0.09, x + largeur / 2, y + largeur * 0.09), p)


# --- Motifs wax : un carreau dessiné une fois, répété sur tout le tissu ---------------------------------------------

_CACHE_WAX: dict = {}


def motif_wax(couleurs, echelle: float = 1.0, graine: int = 0):
    cle = (tuple(couleurs), round(echelle, 3), graine)
    if cle in _CACHE_WAX:
        return _CACHE_WAX[cle]
    alea = random.Random(graine)
    T = 72.0 * echelle
    rec = skia.PictureRecorder()
    c = rec.beginRecording(skia.Rect(0, 0, T, T))
    fond, c1, c2 = couleurs[0], couleurs[1], couleurs[2 % len(couleurs)]
    c.drawRect(skia.Rect(0, 0, T, T), skia.Paint(Color=teinte(fond)))
    p1 = skia.Paint(AntiAlias=True, Color=teinte(c1))
    p2 = skia.Paint(AntiAlias=True, Color=teinte(c2))
    anneau = skia.Paint(AntiAlias=True, Color=teinte(c2), Style=skia.Paint.kStroke_Style, StrokeWidth=3.2 * echelle)
    style = alea.choice(("cercles", "feuilles", "losanges"))
    for gx in (0.25, 0.75):
        for gy in (0.25, 0.75):
            x, y = gx * T, gy * T
            if (gx == 0.75) == (gy == 0.75):
                if style == "cercles":
                    c.drawCircle(x, y, T * 0.17, p1)
                    c.drawCircle(x, y, T * 0.17, anneau)
                    c.drawCircle(x, y, T * 0.06, p2)
                elif style == "feuilles":
                    f = skia.Path()
                    f.moveTo(x, y - T * 0.2)
                    f.quadTo(x + T * 0.16, y, x, y + T * 0.2)
                    f.quadTo(x - T * 0.16, y, x, y - T * 0.2)
                    c.drawPath(f, p1)
                    c.drawLine(x, y - T * 0.17, x, y + T * 0.17, anneau)
                else:
                    f = skia.Path()
                    f.moveTo(x, y - T * 0.2)
                    f.lineTo(x + T * 0.18, y)
                    f.lineTo(x, y + T * 0.2)
                    f.lineTo(x - T * 0.18, y)
                    f.close()
                    c.drawPath(f, p1)
                    c.drawCircle(x, y, T * 0.05, p2)
            else:
                for _ in range(3):
                    c.drawCircle(x + alea.uniform(-0.12, 0.12) * T, y + alea.uniform(-0.12, 0.12) * T,
                                 T * 0.035, p2)
    shader = rec.finishRecordingAsPicture().makeShader(skia.TileMode.kRepeat, skia.TileMode.kRepeat,
                                                       skia.FilterMode.kLinear)
    _CACHE_WAX[cle] = shader
    return shader
