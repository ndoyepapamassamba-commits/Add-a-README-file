# DÉCORS 2D ASSORTIS AUX MARIONNETTES (20/10/2026, « une multitude de scènes adaptées ») : chaque lieu est dessiné avec le
# MÊME pinceau que les personnages (ombre au cel du côté opposé à la lumière, contour foncé de la même teinte) et expose sa
# lumière (direction + teinte), sa ligne de sol et son échelle (pixels par mètre selon la profondeur) : les marionnettes y
# sont posées avec la même lumière, la même ombre au sol et la bonne taille — elles coïncident avec la scène par
# construction. Lieux : cour, maquis, marché, salon, classe, dispensaire, boutique (rue), bureau ; trois heures (matin,
# midi, soir). Déterministe : (lieu, variante) donne toujours la même image.
import math, random
import numpy as np
import skia
from marionnette import Pinceau, P, ovale, poly, rvb, ombre, clair, motif_wax

W, H = 1152, 920
HEURES = {   # lumière : direction (vers le haut-gauche = soleil à gauche), teinte appliquée à tout (décor ET personnages)
    'matin': dict(lumiere=(-0.75, -0.55), teinte=(255, 240, 222), ciel=((150, 196, 236), (244, 214, 170))),
    'midi': dict(lumiere=(-0.45, -0.9), teinte=(255, 252, 244), ciel=((96, 164, 230), (196, 226, 248))),
    'soir': dict(lumiere=(0.75, -0.45), teinte=(255, 214, 178), ciel=((96, 92, 170), (246, 150, 92))),
}
LIEUX = ['cour', 'maquis', 'marche', 'salon', 'classe', 'dispensaire', 'boutique', 'bureau']


class Decor:
    def __init__(self, lieu, heure='midi', graine=0):
        assert lieu in LIEUX, lieu
        self.lieu, self.heure = lieu, heure; self.h = HEURES[heure]; self.rng = random.Random(f'{lieu}-{heure}-{graine}')
        self.interieur = lieu in ('salon', 'classe', 'dispensaire', 'bureau')
        self.sol_y = H * 0.92            # ligne des pieds au premier plan
        self.horizon = H * 0.42          # ligne d'horizon (perspective du sol)
        self.ppm0 = H * 0.30             # pixels par mètre sur la ligne des pieds : un adulte de 1,70 m ≈ 51 % de la hauteur
        self.lumiere = self.h['lumiere'] if not self.interieur else (-0.7, -0.6)
        self.teinte = self.h['teinte'] if not self.interieur else (255, 246, 232)

    def ppm(self, y):
        """échelle à la profondeur des pieds y (perspective linéaire depuis l'horizon)."""
        return self.ppm0 * (y - self.horizon) / (self.sol_y - self.horizon)

    def places(self, n):
        """abscisses des acteurs (face à face, au tiers) pour n personnages."""
        return {1: [0.5], 2: [0.36, 0.64], 3: [0.26, 0.5, 0.74], 4: [0.2, 0.4, 0.6, 0.8]}.get(n, [0.5])

    # ── rendu ──
    def dessine(self, c):
        B = Pinceau(c, self.lumiere, trait=2.2, teinte=self.teinte); getattr(self, '_' + self.lieu)(c, B)

    def image(self, echelle=2.0):
        s = skia.Surface(int(W * echelle), int(H * echelle)); c = s.getCanvas(); c.scale(echelle, echelle); self.dessine(c)
        return s.makeImageSnapshot()

    # ── éléments communs ──
    def _ciel(self, c, y1):
        y1 = max(y1, H * 0.70)   # le ciel descend jusqu'au sol : aucun vide derrière les arbres et les étals
        a, b = self.h['ciel']
        p = skia.Paint(Shader=skia.GradientShader.MakeLinear([(0, 0), (0, y1)], [rvb(a), rvb(b)]))
        c.drawRect(skia.Rect.MakeLTRB(0, 0, W, y1), p)
        for i in range(4):   # nuages doux
            x = self.rng.uniform(0, W); y = self.rng.uniform(30, y1 * 0.5); r = self.rng.uniform(40, 80)
            cp = skia.Paint(AntiAlias=True, Color=rvb((255, 255, 255), 150)); cp.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 10))
            for k in range(3): c.drawCircle(x + k * r * 0.8, y + (k % 2) * r * 0.2, r * (0.8 + 0.2 * (k == 1)), cp)

    def _sol(self, c, B, col, y0=None, carreaux=False):
        y0 = y0 if y0 is not None else self.horizon + (H - self.horizon) * 0.35
        p = skia.Paint(Shader=skia.GradientShader.MakeLinear([(0, y0), (0, H)], [rvb(B._t(ombre(col, 0.85))), rvb(B._t(col))]))
        c.drawRect(skia.Rect.MakeLTRB(0, y0, W, H), p)
        if carreaux:   # carrelage en perspective
            lp = skia.Paint(AntiAlias=True, Color=rvb(ombre(B._t(col), 0.8), 140), StrokeWidth=1.5)
            vx = W * 0.5
            for k in range(-14, 15): c.drawLine(vx + k * 22, y0, vx + k * 160, H, lp)
            y = y0; d = 10
            while y < H: c.drawLine(0, y, W, y, lp); y += d; d *= 1.35
        else:   # grain du sable / de la terre battue
            for i in range(260):
                x = self.rng.uniform(0, W); y = self.rng.uniform(y0, H); r = self.rng.uniform(1, 3.5) * (y - y0) / (H - y0) + 0.5
                c.drawCircle(x, y, r, skia.Paint(AntiAlias=True, Color=rvb(ombre(B._t(col), self.rng.uniform(0.8, 0.95)), 160)))
        return y0

    def _mur(self, c, B, col, y0, y1, x0=0, x1=W, taches=True):
        B.remplit(poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], False), col, decal=0, contour=False)
        if taches:   # enduit irrégulier
            for i in range(40):
                x = self.rng.uniform(x0, x1); y = self.rng.uniform(y0, y1); r = self.rng.uniform(10, 46)
                tp = skia.Paint(AntiAlias=True, Color=rvb(ombre(B._t(col), self.rng.uniform(0.86, 0.96)), 90))
                tp.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, r * 0.5)); c.drawCircle(x, y, r, tp)
        c.drawRect(skia.Rect.MakeLTRB(x0, y1 - 14, x1, y1), skia.Paint(Color=rvb(ombre(B._t(col), 0.7))))   # plinthe

    def _ombre_objet(self, c, x0, x1, y, h=10):
        sp = skia.Paint(AntiAlias=True, Color=rvb((20, 14, 10), 90)); sp.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 6))
        ox = -self.lumiere[0] * 24; c.drawOval(skia.Rect.MakeLTRB(x0 + ox, y - h, x1 + ox, y + h), sp)

    def _porte(self, c, B, x, y_bas, w, h, col):
        B.remplit(poly([(x - 8, y_bas - h - 10), (x + w + 8, y_bas - h - 10), (x + w + 8, y_bas), (x - 8, y_bas)], False), ombre(col, 0.6))
        B.remplit(poly([(x, y_bas - h), (x + w, y_bas - h), (x + w, y_bas), (x, y_bas)], False), col)
        for k in range(1, 4): B.trait_(self._ligne(x + 6, y_bas - h + k * h / 4, x + w - 6), ombre(col, 0.55), w=2)
        c.drawCircle(x + w * 0.82, y_bas - h * 0.48, 5, skia.Paint(AntiAlias=True, Color=rvb((214, 168, 52))))

    def _ligne(self, x0, y0, x1, y1=None):
        p = P(); p.moveTo(x0, y0); p.lineTo(x1, y0 if y1 is None else y1); return p

    def _fenetre(self, c, B, x, y, w, h, volets=(40, 120, 90), vitre=None):
        B.remplit(poly([(x - 6, y - 6), (x + w + 6, y - 6), (x + w + 6, y + h + 6), (x - 6, y + h + 6)], False), (230, 222, 206))
        if vitre:
            c.drawRect(skia.Rect.MakeLTRB(x, y, x + w, y + h), skia.Paint(Shader=skia.GradientShader.MakeLinear([(x, y), (x, y + h)], [rvb(vitre[0]), rvb(vitre[1])])))
            B.trait_(self._ligne(x + w / 2, y, x + w / 2, y + h), (230, 222, 206), w=5)
        else:
            for k in range(2):
                vx = x + k * w / 2; B.remplit(poly([(vx, y), (vx + w / 2, y), (vx + w / 2, y + h), (vx, y + h)], False), volets)
                for j in range(1, 8): B.trait_(self._ligne(vx + 4, y + j * h / 8, vx + w / 2 - 4), ombre(volets, 0.6), w=2)

    def _arbre(self, c, B, x, y_bas, h, palmier=False):
        B.remplit(poly([(x - h * 0.05, y_bas), (x - h * 0.03, y_bas - h * 0.55), (x + h * 0.03, y_bas - h * 0.55), (x + h * 0.05, y_bas)], False), (110, 72, 44))
        if palmier:
            for k in range(7):
                a = -math.pi / 2 + (k - 3) * 0.45; L = h * 0.42
                fe = P(); fe.moveTo(x, y_bas - h * 0.55); fe.quadTo(x + math.cos(a) * L * 0.6, y_bas - h * 0.55 + math.sin(a) * L * 0.9 - 20, x + math.cos(a) * L, y_bas - h * 0.55 + math.sin(a) * L * 0.5 + 30)
                B.trait_(fe, B._t((50, 130, 60)), w=h * 0.035)
        else:
            for dx, dy, r in ((0, -0.78, 0.30), (-0.22, -0.66, 0.22), (0.22, -0.64, 0.24), (0.05, -0.95, 0.2)):
                B.remplit(ovale(x + dx * h, y_bas + dy * h, r * h, r * h * 0.85), (56, 128, 58), decal=h * 0.04)

    def _table(self, c, B, x, y_bas, w, col=(150, 96, 56), nappe=None):
        self._ombre_objet(c, x - w * 0.55, x + w * 0.55, y_bas, 8)
        for s in (-1, 1): B.remplit(poly([(x + s * w * 0.42 - 5, y_bas - w * 0.42), (x + s * w * 0.42 + 5, y_bas - w * 0.42), (x + s * w * 0.42 + 5, y_bas), (x + s * w * 0.42 - 5, y_bas)], False), ombre(col, 0.8))
        top = poly([(x - w * 0.5, y_bas - w * 0.46), (x + w * 0.5, y_bas - w * 0.46), (x + w * 0.5, y_bas - w * 0.40), (x - w * 0.5, y_bas - w * 0.40)], False)
        B.remplit(top, nappe or col, motif=motif_wax([nappe, (246, 196, 40), (40, 150, 80)], 9) if nappe else None)

    def _chaise(self, c, B, x, y_bas, h, col=(220, 40, 46)):
        self._ombre_objet(c, x - h * 0.3, x + h * 0.3, y_bas, 6)
        B.remplit(poly([(x - h * 0.28, y_bas - h * 0.55), (x + h * 0.28, y_bas - h * 0.55), (x + h * 0.32, y_bas - h * 0.48), (x - h * 0.32, y_bas - h * 0.48)], False), col)
        B.remplit(poly([(x - h * 0.26, y_bas - h), (x + h * 0.26, y_bas - h), (x + h * 0.28, y_bas - h * 0.55), (x - h * 0.28, y_bas - h * 0.55)]), col)
        for s in (-1, 1): B.trait_(self._ligne(x + s * h * 0.28, y_bas - h * 0.5, x + s * h * 0.32, y_bas), ombre(col, 0.75), w=h * 0.05)

    def _enseigne(self, c, B, x, y, w, h, texte, fond=(246, 196, 40), encre=(180, 30, 40)):
        B.remplit(poly([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], False), fond)
        f = skia.Font(skia.Typeface('DejaVu Sans', skia.FontStyle.Bold()), h * 0.55)
        tw = f.measureText(texte); c.drawString(texte, x + (w - tw) / 2, y + h * 0.72, f, skia.Paint(AntiAlias=True, Color=rvb(B._t(encre))))

    # ── les lieux ──
    def _cour(self, c, B):
        self._ciel(c, self.horizon + 40)
        self._mur(c, B, (214, 150, 96), H * 0.20, H * 0.66)
        B.remplit(poly([(-20, H * 0.20), (W + 20, H * 0.20), (W + 20, H * 0.16), (-20, H * 0.13)], False), (150, 150, 156))   # tôle
        self._porte(c, B, W * 0.40, H * 0.66, 120, 230, (40, 110, 140))
        self._fenetre(c, B, W * 0.12, H * 0.32, 130, 110); self._fenetre(c, B, W * 0.72, H * 0.32, 130, 110, volets=(160, 60, 40))
        self._arbre(c, B, W * 0.90, H * 0.70, 520)
        # corde à linge avec pagnes
        fil = P(); fil.moveTo(W * 0.02, H * 0.38); fil.quadTo(W * 0.3, H * 0.44, W * 0.62, H * 0.38); B.trait_(fil, (60, 50, 44), w=2)
        for k, (x, col) in enumerate(((0.08, (206, 40, 46)), (0.2, (40, 96, 200)), (0.48, (246, 196, 40)))):
            B.remplit(poly([(W * x, H * 0.395), (W * x + 70, H * 0.405), (W * x + 66, H * 0.52), (W * x + 4, H * 0.51)]), col, motif=motif_wax([col, (246, 244, 240), (40, 150, 80)], 7))
        self._sol(c, B, (206, 168, 120), H * 0.66)
        B.remplit(poly([(W * 0.06, H * 0.72), (W * 0.24, H * 0.72), (W * 0.24, H * 0.745), (W * 0.06, H * 0.745)], False), (130, 84, 50))   # banc
        for s in (0.08, 0.22): B.remplit(poly([(W * s, H * 0.745), (W * s + 8, H * 0.745), (W * s + 8, H * 0.79), (W * s, H * 0.79)], False), (110, 70, 42))
        B.remplit(ovale(W * 0.84, H * 0.80, 38, 14), (40, 120, 200)); B.remplit(poly([(W * 0.84 - 38, H * 0.80), (W * 0.84 + 38, H * 0.80), (W * 0.84 + 30, H * 0.86), (W * 0.84 - 30, H * 0.86)]), (40, 120, 200))   # seau

    def _lointain(self, c, B, y):
        for k in range(9):
            x = k * W / 8 - 40 + self.rng.uniform(-20, 20); h = self.rng.uniform(70, 130)
            B.remplit(poly([(x, y - h), (x + 120, y - h), (x + 120, y), (x, y)], False), clair(self.rng.choice([(214, 150, 96), (226, 196, 150), (180, 120, 90)]), 0.35), contour=False)
            B.remplit(poly([(x - 10, y - h), (x + 130, y - h), (x + 120, y - h - 18), (x, y - h - 18)], False), clair((150, 150, 156), 0.3), contour=False)
        for k in range(14): B.remplit(ovale(k * W / 13, y - 10, 70, 46), clair((70, 140, 70), 0.3), contour=False)

    def _maquis(self, c, B):
        self._ciel(c, self.horizon + 40); self._lointain(c, B, H * 0.62)
        self._arbre(c, B, W * 0.08, H * 0.62, 460, palmier=True); self._arbre(c, B, W * 0.95, H * 0.62, 420, palmier=True)
        self._mur(c, B, (238, 214, 168), H * 0.30, H * 0.62, W * 0.18, W * 0.84)
        B.remplit(poly([(W * 0.12, H * 0.30), (W * 0.9, H * 0.30), (W * 0.82, H * 0.18), (W * 0.2, H * 0.18)], False), (180, 120, 60))   # paillote
        for k in range(14): B.trait_(self._ligne(W * (0.2 + k * 0.045), H * 0.18, W * (0.14 + k * 0.055), H * 0.30), (140, 90, 44), w=2)
        self._enseigne(c, B, W * 0.36, H * 0.33, 330, 62, 'MAQUIS CHEZ TANTIE', fond=(40, 150, 80), encre=(250, 244, 230))
        self._fenetre(c, B, W * 0.24, H * 0.44, 110, 90, volets=(206, 40, 46))
        fil = P(); fil.moveTo(W * 0.18, H * 0.31); fil.quadTo(W * 0.5, H * 0.36, W * 0.84, H * 0.31); B.trait_(fil, (40, 40, 40), w=1.5)
        for k in range(12):   # guirlande
            t = k / 11; x = W * (0.18 + 0.66 * t); y = H * (0.31 + 0.05 * 4 * t * (1 - t))
            c.drawCircle(x, y + 8, 7, skia.Paint(AntiAlias=True, Color=rvb([(246, 196, 40), (206, 40, 46), (40, 96, 200)][k % 3])))
        self._sol(c, B, (196, 158, 112), H * 0.62)
        self._table(c, B, W * 0.80, H * 0.80, 170, nappe=(206, 40, 46)); self._chaise(c, B, W * 0.94, H * 0.82, 120); self._chaise(c, B, W * 0.66, H * 0.82, 120, (40, 96, 200))

    def _marche(self, c, B):
        self._ciel(c, self.horizon + 40); self._lointain(c, B, H * 0.60)
        for k, (x, col) in enumerate(((0.12, (206, 40, 46)), (0.48, (40, 96, 200)), (0.86, (246, 196, 40)))):
            B.remplit(poly([(W * x - 170, H * 0.30), (W * x, H * 0.16), (W * x + 170, H * 0.30)], False), col)   # parasols
            B.trait_(self._ligne(W * x, H * 0.30, W * x, H * 0.60), (90, 90, 90), w=5)
            B.remplit(poly([(W * x - 150, H * 0.52), (W * x + 150, H * 0.52), (W * x + 150, H * 0.60), (W * x - 150, H * 0.60)], False), (150, 96, 56))   # étal
            for j in range(9):   # fruits
                fx = W * x - 130 + j * 32; fc = [(220, 60, 40), (246, 160, 40), (90, 160, 60)][(j + k) % 3]
                B.remplit(ovale(fx, H * 0.505, 15, 13), fc, decal=3)
        self._sol(c, B, (190, 160, 120), H * 0.60)
        for x in (0.3, 0.68): B.remplit(poly([(W * x - 40, H * 0.70), (W * x + 40, H * 0.70), (W * x + 34, H * 0.76), (W * x - 34, H * 0.76)], False), (150, 110, 60))   # cageots

    def _salon(self, c, B):
        self._mur(c, B, (232, 206, 150), 0, H * 0.64, taches=False)
        for k in range(12): c.drawRect(skia.Rect.MakeLTRB(k * W / 12, 0, k * W / 12 + 8, H * 0.64), skia.Paint(Color=rvb(ombre(B._t((232, 206, 150)), 0.95))))
        self._fenetre(c, B, W * 0.10, H * 0.14, 180, 170, vitre=((150, 200, 240), (230, 240, 250)))
        for s in (-1, 1): B.remplit(poly([(W * 0.10 + (90 + s * 120) - 30, H * 0.10), (W * 0.10 + 90 + s * 120 + 30, H * 0.10), (W * 0.10 + 90 + s * 110 + 34, H * 0.42), (W * 0.10 + 90 + s * 110 - 34, H * 0.42)]), (150, 40, 60), motif=motif_wax([(150, 40, 60), (246, 196, 40), (40, 150, 80)], 8))
        B.remplit(poly([(W * 0.62, H * 0.16), (W * 0.76, H * 0.16), (W * 0.76, H * 0.30), (W * 0.62, H * 0.30)], False), (110, 70, 42))   # cadre photo
        B.remplit(poly([(W * 0.635, H * 0.175), (W * 0.745, H * 0.175), (W * 0.745, H * 0.285), (W * 0.635, H * 0.285)], False), (220, 200, 170))
        B.remplit(poly([(W * 0.40, H * 0.36), (W * 0.58, H * 0.36), (W * 0.58, H * 0.50), (W * 0.40, H * 0.50)], False), (30, 30, 36))   # télé
        B.remplit(poly([(W * 0.38, H * 0.50), (W * 0.60, H * 0.50), (W * 0.60, H * 0.64), (W * 0.38, H * 0.64)], False), (120, 76, 44))
        self._sol(c, B, (196, 160, 130), H * 0.64, carreaux=True)
        B.remplit(ovale(W * 0.5, H * 0.86, 420, 60), (160, 40, 50), motif=motif_wax([(160, 40, 50), (246, 196, 40), (40, 96, 200)], 10))   # tapis
        B.remplit(poly([(W * 0.74, H * 0.52), (W * 0.98, H * 0.52), (W * 0.99, H * 0.74), (W * 0.73, H * 0.74)]), (60, 90, 150))   # canapé

    def _classe(self, c, B):
        self._mur(c, B, (236, 222, 180), 0, H * 0.64, taches=True)
        B.remplit(poly([(W * 0.22, H * 0.12), (W * 0.78, H * 0.12), (W * 0.78, H * 0.44), (W * 0.22, H * 0.44)], False), (40, 70, 56))   # tableau
        f = skia.Font(skia.Typeface('DejaVu Sans'), 30)
        for k, t in enumerate(('Dictée du jour', 'Le maître a toujours raison.', '20 / 20')):
            c.drawString(t, W * 0.25, H * 0.19 + k * 46, f, skia.Paint(AntiAlias=True, Color=rvb((240, 240, 236))))
        self._fenetre(c, B, W * 0.03, H * 0.16, 120, 160, vitre=((150, 200, 240), (230, 240, 250))); self._fenetre(c, B, W * 0.86, H * 0.16, 120, 160, vitre=((150, 200, 240), (230, 240, 250)))
        self._sol(c, B, (180, 160, 140), H * 0.64, carreaux=True)
        for x in (0.12, 0.88): self._table(c, B, W * x, H * 0.78, 160, col=(140, 96, 60))

    def _dispensaire(self, c, B):
        self._mur(c, B, (230, 240, 236), 0, H * 0.40, taches=False); self._mur(c, B, (110, 180, 160), H * 0.40, H * 0.64, taches=False)
        B.remplit(poly([(W * 0.08, H * 0.12), (W * 0.30, H * 0.12), (W * 0.30, H * 0.36), (W * 0.08, H * 0.36)], False), (250, 250, 248))   # affiche
        c.drawRect(skia.Rect.MakeXYWH(W * 0.17, H * 0.16, 24, 70), skia.Paint(Color=rvb((206, 40, 46)))); c.drawRect(skia.Rect.MakeXYWH(W * 0.17 - 23, H * 0.16 + 23, 70, 24), skia.Paint(Color=rvb((206, 40, 46))))
        f = skia.Font(skia.Typeface('DejaVu Sans', skia.FontStyle.Bold()), 18); c.drawString('VACCINEZ-VOUS', W * 0.095, H * 0.34, f, skia.Paint(AntiAlias=True, Color=rvb((40, 96, 200))))
        self._enseigne(c, B, W * 0.40, H * 0.08, 300, 50, 'DISPENSAIRE', fond=(250, 250, 248), encre=(40, 130, 100))
        B.remplit(poly([(W * 0.70, H * 0.10), (W * 0.96, H * 0.10), (W * 0.96, H * 0.62), (W * 0.70, H * 0.62)]), (170, 210, 230))   # rideau
        for k in range(6): B.trait_(self._ligne(W * (0.72 + k * 0.042), H * 0.12, W * (0.72 + k * 0.042), H * 0.6), (130, 170, 196), w=3)
        self._sol(c, B, (200, 210, 206), H * 0.64, carreaux=True)
        B.remplit(poly([(W * 0.04, H * 0.62), (W * 0.24, H * 0.62), (W * 0.24, H * 0.70), (W * 0.04, H * 0.70)], False), (250, 250, 248))   # lit d'examen
        for s in (0.05, 0.22): B.trait_(self._ligne(W * s, H * 0.70, W * s, H * 0.76), (150, 150, 156), w=6)

    def _boutique(self, c, B):
        self._ciel(c, self.horizon + 40)
        self._mur(c, B, (120, 170, 200), H * 0.14, H * 0.62)
        self._enseigne(c, B, W * 0.18, H * 0.16, 520, 70, 'BOUTIQUE LA GRÂCE DE DIEU', fond=(246, 196, 40))
        B.remplit(poly([(W * 0.22, H * 0.30), (W * 0.78, H * 0.30), (W * 0.78, H * 0.62), (W * 0.22, H * 0.62)], False), (70, 50, 40))   # ouverture
        for j in range(3):
            for k in range(10):
                col = [(206, 40, 46), (40, 96, 200), (246, 196, 40), (40, 150, 80), (250, 250, 248)][(j + k) % 5]
                B.remplit(poly([(W * 0.24 + k * 58, H * (0.33 + j * 0.095)), (W * 0.24 + k * 58 + 44, H * (0.33 + j * 0.095)), (W * 0.24 + k * 58 + 44, H * (0.40 + j * 0.095)), (W * 0.24 + k * 58, H * (0.40 + j * 0.095))], False), col, decal=2)
        B.remplit(poly([(W * 0.22, H * 0.52), (W * 0.78, H * 0.52), (W * 0.78, H * 0.62), (W * 0.22, H * 0.62)], False), (150, 96, 56))   # comptoir
        self._sol(c, B, (170, 160, 150), H * 0.62)
        self._arbre(c, B, W * 0.06, H * 0.66, 380)

    def _bureau(self, c, B):
        self._mur(c, B, (210, 220, 228), 0, H * 0.64, taches=False)
        self._enseigne(c, B, W * 0.32, H * 0.08, 420, 54, 'GUICHET N° 3', fond=(40, 70, 140), encre=(250, 250, 248))
        for k in range(4):   # étagères à dossiers
            B.remplit(poly([(W * 0.04, H * (0.20 + k * 0.1)), (W * 0.26, H * (0.20 + k * 0.1)), (W * 0.26, H * (0.21 + k * 0.1)), (W * 0.04, H * (0.21 + k * 0.1))], False), (120, 80, 50))
            for j in range(7): B.remplit(poly([(W * 0.045 + j * 34, H * (0.12 + k * 0.1)), (W * 0.045 + j * 34 + 26, H * (0.12 + k * 0.1)), (W * 0.045 + j * 34 + 26, H * (0.20 + k * 0.1)), (W * 0.045 + j * 34, H * (0.20 + k * 0.1))], False), [(206, 40, 46), (40, 96, 200), (246, 196, 40)][j % 3], decal=2)
        self._fenetre(c, B, W * 0.78, H * 0.16, 160, 150, vitre=((150, 200, 240), (230, 240, 250)))
        B.remplit(poly([(W * 0.40, H * 0.40), (W * 0.56, H * 0.40), (W * 0.56, H * 0.48), (W * 0.40, H * 0.48)], False), (250, 250, 248))   # horloge
        f = skia.Font(skia.Typeface('DejaVu Sans', skia.FontStyle.Bold()), 26); c.drawString('12:59', W * 0.43, H * 0.46, f, skia.Paint(AntiAlias=True, Color=rvb((206, 40, 46))))
        self._sol(c, B, (180, 186, 190), H * 0.64, carreaux=True)


if __name__ == '__main__':   # planche des décors avec deux marionnettes posées à la bonne échelle
    import sys, cv2, marionnette as M
    F = M.bible(); vign = []
    for lieu in LIEUX:
        for heure in ('midi',) if lieu not in ('cour', 'maquis') else ('matin', 'soir'):
            d = Decor(lieu, heure); img = d.image(1.0)
            s = skia.Surface(W, H); c = s.getCanvas(); c.drawImage(img, 0, 0)
            for nom, x, face in (('MAÎTRE KONÉ', 0.36, 1), ('SŒUR AWA', 0.64, -1)):
                M.marionnette(nom, F).dessine(c, W * x, d.sol_y, d.ppm(d.sol_y), dict(face=face, emotions={'joie': 0.5}), lumiere=d.lumiere, teinte=d.teinte)
            a = s.makeImageSnapshot().toarray(colorType=skia.ColorType.kRGBA_8888_ColorType)
            vign.append(cv2.resize(a, (W // 3, H // 3), interpolation=cv2.INTER_AREA))
    while len(vign) % 4: vign.append(np.zeros_like(vign[0]))
    rows = [np.concatenate(vign[i:i + 4], 1) for i in range(0, len(vign), 4)]
    cv2.imwrite(sys.argv[1] if len(sys.argv) > 1 else 'decors.jpg', cv2.cvtColor(np.concatenate(rows, 0), cv2.COLOR_RGBA2BGR))
