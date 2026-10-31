"""Le pantin : un squelette posé sur une illustration PNG, qui la déforme comme une feuille de caoutchouc.

Technique des studios de 2D (Spine, Moho, « Puppet » d'After Effects) : l'illustration est découpée en un maillage de
petits triangles ; chaque sommet suit un ou plusieurs os (poids calculés par distance « géodésique », c'est-à-dire
en restant à l'intérieur du dessin : un bras collé au torse ne lui appartient pas) ; les triangles sont dessinés par
couches (bras du fond, jambes, torse, tête, bras de devant). Aucune couture : les coudes et les genoux plient en douceur.
Greffes : scipy (BSD) — Delaunay, Dijkstra ; skia-python (BSD) — Vertices + Image.makeShader avec mipmaps.
"""
from dataclasses import dataclass

import numpy as np
import skia
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import Delaunay

# nom, début, fin, parent, couche de dessin, portion de l'os qui « tient » la chair (début, fin)
OS_HUMAIN = [
    ("torse", "bassin", "cou", None, 3, (0.10, 0.85)),
    ("tete", "cou", "tete_haut", "torse", 4, (0.25, 1.00)),
    ("bras_ar", "epaule_ar", "coude_ar", "torse", 0, (0.15, 0.85)),
    ("avbras_ar", "coude_ar", "poignet_ar", "bras_ar", 0, (0.15, 0.90)),
    ("main_ar", "poignet_ar", "main_ar_bout", "avbras_ar", 0, (0.10, 1.00)),
    ("cuisse_ar", "hanche_ar", "genou_ar", None, 1, (0.15, 0.85)),
    ("tibia_ar", "genou_ar", "cheville_ar", "cuisse_ar", 1, (0.15, 0.85)),
    ("pied_ar", "cheville_ar", "orteil_ar", "tibia_ar", 1, (0.00, 1.00)),
    ("cuisse_av", "hanche_av", "genou_av", None, 2, (0.15, 0.85)),
    ("tibia_av", "genou_av", "cheville_av", "cuisse_av", 2, (0.15, 0.85)),
    ("pied_av", "cheville_av", "orteil_av", "tibia_av", 2, (0.00, 1.00)),
    ("bras_av", "epaule_av", "coude_av", "torse", 5, (0.15, 0.85)),
    ("avbras_av", "coude_av", "poignet_av", "bras_av", 5, (0.15, 0.90)),
    ("main_av", "poignet_av", "main_av_bout", "avbras_av", 5, (0.10, 1.00)),
]


@dataclass
class Os:
    nom: str
    debut: np.ndarray
    fin: np.ndarray
    parent: str | None
    couche: int
    plage: tuple


def _points_derives(a: dict) -> dict:
    p = {k: np.asarray(v, dtype=float) for k, v in a.items()}
    p["bassin"] = (p["hanche_av"] + p["hanche_ar"]) / 2
    p["chevilles"] = (p["cheville_av"] + p["cheville_ar"]) / 2
    epaules = (p["epaule_av"] + p["epaule_ar"]) / 2
    p["cou"] = epaules + (p["nez"] - epaules) * 0.25
    p["tete_haut"] = p["nez"] + (p["nez"] - p["cou"]) * 1.4
    for c in ("av", "ar"):
        p[f"main_{c}_bout"] = p[f"poignet_{c}"] + (p[f"poignet_{c}"] - p[f"coude_{c}"]) * 0.45
    return p


PENALITE_TRAIT = 14.0

# pièces du pantin (os qui bougent ensemble sans couture) et articulations où deux pièces restent reliées
PIECES_HUMAIN = {"torse": "torse", "tete": "tete",
                 "bras_av": "bras_av", "avbras_av": "bras_av", "main_av": "bras_av",
                 "bras_ar": "bras_ar", "avbras_ar": "bras_ar", "main_ar": "bras_ar",
                 "cuisse_av": "jambe_av", "tibia_av": "jambe_av", "pied_av": "jambe_av",
                 "cuisse_ar": "jambe_ar", "tibia_ar": "jambe_ar", "pied_ar": "jambe_ar"}
JOINTURES_HUMAIN = {frozenset(("torse", "tete")): "cou",
                    frozenset(("torse", "bras_av")): "epaule_av", frozenset(("torse", "bras_ar")): "epaule_ar",
                    frozenset(("torse", "jambe_av")): "hanche_av", frozenset(("torse", "jambe_ar")): "hanche_ar"}


# Robe longue (boubou) : la robe appartient au torse ; sous elle, l'os de chaque jambe ne tient aucune chair (plage
# None) et ne sert qu'à porter le pied, dont la chair est prise vers les orteils, hors de la robe : démarche glissée.
OS_ROBE = [o for o in OS_HUMAIN if not o[0].startswith(("cuisse", "tibia", "pied"))] + [
    ("cuisse_ar", "hanche_ar", "cheville_ar", None, 1, None),          # porte le pied, ne tient aucune chair
    ("pied_ar", "cheville_ar", "orteil_ar", "cuisse_ar", 1, (0.45, 1.00)),  # la chair vers les orteils, hors robe
    ("cuisse_av", "hanche_av", "cheville_av", None, 2, None),
    ("pied_av", "cheville_av", "orteil_av", "cuisse_av", 2, (0.45, 1.00)),
    ("robe", "bassin", "chevilles", "torse", 3, (0.00, 0.97)),        # toute la robe, jusqu'à l'ourlet, suit le torse
]
PIECES_ROBE = {**{k: v for k, v in PIECES_HUMAIN.items() if not k.startswith("tibia")}, "robe": "torse"}
JOINTURES_ROBE = {k: v for k, v in JOINTURES_HUMAIN.items() if "jambe_av" not in k and "jambe_ar" not in k}
MODELES = {"humain": (OS_HUMAIN, PIECES_HUMAIN, JOINTURES_HUMAIN), "robe": (OS_ROBE, PIECES_ROBE, JOINTURES_ROBE)}


def _carte_traits(rgba: np.ndarray) -> np.ndarray:
    """1 sur les traits du dessin (pixels nettement plus sombres que leur voisinage, pas les aplats sombres) et sur la
    bordure transparente autour du dessin : elle ne doit pas servir de raccourci d'une pièce à l'autre."""
    alpha = rgba[:, :, 3].astype(float) / 255.0
    lum = (0.299 * rgba[:, :, 0] + 0.587 * rgba[:, :, 1] + 0.114 * rgba[:, :, 2]) * alpha + 255.0 * (1 - alpha)
    voisinage = ndimage.gaussian_filter(lum, 4.0)
    return (((lum < voisinage - 28.0) & (alpha > 0.4)) | (alpha < 0.4)).astype(float)


def _decouper(sommets, triangles, os_liste, poids, points, rayon, pieces=PIECES_HUMAIN, jointures=JOINTURES_HUMAIN):
    """Sépare le maillage en pièces (comme un pantin en carton) ; deux pièces ne restent cousues que près de leur
    articulation (dans `rayon`), où le dessin s'étire en douceur. Ailleurs, la couture est ouverte : quand le bras
    s'écarte du torse, aucun triangle ne s'étire en traînée."""
    noms = [o.nom for o in os_liste]
    piece_os = np.array([pieces[n] for n in noms])
    couche_piece = {pieces[o.nom]: o.couche for o in os_liste}
    dominant = piece_os[np.argmax(poids, axis=1)]
    centres = {cle: np.asarray(points[nom], float) for cle, nom in jointures.items()}

    # 1. triangles cousus : à cheval sur deux pièces articulées, tout près de leur articulation
    cousu = {}                                   # index du triangle → jointure
    partage = {}                                 # sommet → jointure dont il fait partie de la couture
    for i, tri in enumerate(triangles):
        presentes = frozenset(dominant[tri].tolist())
        if len(presentes) == 2 and presentes in jointures:
            if (np.linalg.norm(sommets[tri] - centres[presentes], axis=1) < rayon).all():
                cousu[i] = presentes
                for v in tri:
                    partage[int(v)] = presentes

    nouveaux, nouveaux_poids, index = [], [], {}

    def restreint(v, garder):
        w = np.where(np.isin(piece_os, list(garder)), poids[v], 0.0)
        if w.sum() < 1e-9:                       # sommet de couture : on le donne à l'os le plus proche de la pièce
            d = [np.linalg.norm(sommets[v] - (o.debut + o.fin) / 2) if piece_os[j] in garder else np.inf
                 for j, o in enumerate(os_liste)]
            w[int(np.argmin(d))] = 1.0
        return w / w.sum()

    def copie(v, piece):
        j = partage.get(v)
        cle = (v, j) if j is not None and piece in j else (v, piece)
        if cle not in index:
            index[cle] = len(nouveaux)
            nouveaux.append(sommets[v])
            nouveaux_poids.append(restreint(v, j if cle[1] is j else {piece}))
        return index[cle]

    # 2. chaque pièce reçoit ses triangles ; ceux qui chevauchent une couture ouverte sont copiés dans chaque pièce,
    #    pour que chacune garde son bord entier (avec le trait du dessin)
    tris, couches = [], []
    for i, tri in enumerate(triangles):
        if i in cousu:
            j = cousu[i]
            principale = max(j, key=lambda pc: couche_piece[pc])
            tris.append([copie(int(v), principale) for v in tri])
            couches.append(couche_piece[principale])
            continue
        for piece in sorted(set(dominant[tri].tolist())):     # trié : même maillage dans tous les processus
            tris.append([copie(int(v), piece) for v in tri])
            couches.append(couche_piece[piece])
    return np.array(nouveaux), np.array(tris), np.array(nouveaux_poids), np.array(couches)


def _rotation(theta):
    c, s = np.cos(theta), np.sin(theta)
    return np.array([[c, -s], [s, c]])


def _distance_segment(pts, a, b):
    ab = b - a
    t = np.clip(((pts - a) @ ab) / max(ab @ ab, 1e-9), 0.0, 1.0)
    proj = a + t[:, None] * ab
    return np.linalg.norm(pts - proj, axis=1), t


class Pantin:
    def __init__(self, image_rgba, sommets, triangles, os_liste, poids, couches_tri=None):
        self.image_rgba = image_rgba
        self.sommets = sommets
        self.triangles = triangles
        self.os = os_liste
        self.index_os = {o.nom: i for i, o in enumerate(os_liste)}
        self.poids = poids
        self.ancre = np.array([float(np.mean([o.debut[0] for o in os_liste if o.parent is None])),
                               float(sommets[:, 1].max())])
        self.hauteur = float(sommets[:, 1].max() - sommets[:, 1].min())
        if couches_tri is None:
            couches_tri = np.array([os_liste[int(np.argmax(poids[tri].sum(axis=0)))].couche for tri in triangles])
        couches_tri = np.asarray(couches_tri)
        self.couches = {c: triangles[couches_tri == c].ravel().tolist() for c in sorted(set(couches_tri.tolist()))}
        img = skia.Image.fromarray(np.ascontiguousarray(image_rgba), colorType=skia.kRGBA_8888_ColorType,
                                   alphaType=skia.kUnpremul_AlphaType).withDefaultMipmaps()
        self._image = img
        self._shader = img.makeShader(skia.TileMode.kClamp, skia.TileMode.kClamp,
                                      skia.SamplingOptions(skia.FilterMode.kLinear, skia.MipmapMode.kLinear))
        self._texs = [skia.Point(float(x), float(y)) for x, y in sommets]

    # --- construction ------------------------------------------------------------------------------------------

    @classmethod
    def depuis_image(cls, rgba: np.ndarray, articulations: dict, pas: int = 10, modele: str = "humain"):
        """modele : « humain » (jambes articulées) ou « robe » (la robe suit le torse, seuls les pieds bougent)."""
        os_def, pieces, jointures = MODELES[modele]
        alpha = rgba[:, :, 3]
        masque = ndimage.binary_dilation(alpha > 10, iterations=2)
        # test d'appartenance plus large : dans les creux de la silhouette, les triangles du bord restent
        masque_test = ndimage.binary_dilation(alpha > 10, iterations=2 + max(1, pas // 3))
        h, w = masque.shape
        ys, xs = np.mgrid[pas / 2:h:pas, pas / 2:w:pas]
        grille = np.stack([xs.ravel(), ys.ravel()], axis=1)
        grille = grille[masque[grille[:, 1].astype(int), grille[:, 0].astype(int)]]
        bord = masque & ~ndimage.binary_erosion(masque)
        by, bx = np.nonzero(bord)
        cle = (bx // max(1, pas // 2)) * 100000 + (by // max(1, pas // 2))
        _, uniques = np.unique(cle, return_index=True)
        bords = np.stack([bx[uniques], by[uniques]], axis=1).astype(float) + 0.5
        pts = np.vstack([grille, bords])
        tri = Delaunay(pts).simplices

        def dedans(p):
            xi = np.clip(p[:, 0].astype(int), 0, w - 1)
            yi = np.clip(p[:, 1].astype(int), 0, h - 1)
            return masque_test[yi, xi]

        a, b, c = pts[tri[:, 0]], pts[tri[:, 1]], pts[tri[:, 2]]
        cotes = np.stack([np.linalg.norm(a - b, axis=1), np.linalg.norm(b - c, axis=1), np.linalg.norm(c - a, axis=1)], 1)
        garde = (cotes.max(axis=1) <= 2.4 * pas) & dedans((a + b + c) / 3) & dedans((a + b) / 2) \
            & dedans((b + c) / 2) & dedans((c + a) / 2)
        tri = tri[garde]
        utilises = np.unique(tri)
        renum = -np.ones(len(pts), dtype=int)
        renum[utilises] = np.arange(len(utilises))
        sommets = pts[utilises]
        triangles = renum[tri]

        p = _points_derives(articulations)
        os_liste = [Os(n, p[d], p[f], par, couche, plage) for n, d, f, par, couche, plage in os_def]
        poids = cls._poids(sommets, triangles, os_liste, pas, _carte_traits(rgba))
        hauteur = float(sommets[:, 1].max() - sommets[:, 1].min())
        rayon = max(2.0 * pas, 0.035 * hauteur)
        sommets, triangles, poids, couches = _decouper(sommets, triangles, os_liste, poids, p, rayon, pieces, jointures)
        return cls(rgba, sommets, triangles, os_liste, poids, couches)

    @staticmethod
    def _poids(sommets, triangles, os_liste, pas, traits=None):
        n = len(sommets)
        aretes = np.vstack([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
        longueurs = np.linalg.norm(sommets[aretes[:, 0]] - sommets[aretes[:, 1]], axis=1)
        if traits is not None:
            # traverser un trait du dessin (couture de manche, haut du short) coûte cher : on découpe où l'artiste a tracé
            h, w = traits.shape
            a, b = sommets[aretes[:, 0]], sommets[aretes[:, 1]]
            sur_trait = np.zeros(len(aretes))
            for u in (0.1, 0.3, 0.5, 0.7, 0.9):
                q = a + (b - a) * u
                xi = np.clip(q[:, 0].astype(int), 0, w - 1)
                yi = np.clip(q[:, 1].astype(int), 0, h - 1)
                sur_trait = np.maximum(sur_trait, traits[yi, xi])
            longueurs = longueurs * (1.0 + PENALITE_TRAIT * sur_trait)
        graphe = coo_matrix((np.concatenate([longueurs, longueurs]),
                             (np.concatenate([aretes[:, 0], aretes[:, 1]]), np.concatenate([aretes[:, 1], aretes[:, 0]]))),
                            shape=(n, n)).tocsr()
        distances = np.empty((n, len(os_liste)))
        euclide = np.empty((n, len(os_liste)))
        for j, o in enumerate(os_liste):
            d, t = _distance_segment(sommets, o.debut, o.fin)
            if o.plage is None:                  # os porteur sans chair (jambe sous une robe)
                euclide[:, j] = np.inf
                distances[:, j] = np.inf
                continue
            euclide[:, j] = d
            graines = np.nonzero((d < 1.5 * pas) & (t >= o.plage[0]) & (t <= o.plage[1]))[0]
            if len(graines) == 0:
                milieu = o.debut + (o.fin - o.debut) * (o.plage[0] + o.plage[1]) / 2
                graines = [int(np.argmin(np.linalg.norm(sommets - milieu, axis=1)))]
            distances[:, j] = dijkstra(graphe, indices=graines, min_only=True)
        isoles = ~np.isfinite(distances).any(axis=1)
        distances[isoles] = euclide[isoles]
        distances = np.where(np.isfinite(distances), distances, 1e9)
        sigma = 1.6 * pas
        ecart = distances - distances.min(axis=1, keepdims=True)
        poids = np.where(ecart < 4 * sigma, np.exp(-ecart / sigma), 0.0)
        return poids / poids.sum(axis=1, keepdims=True)

    # --- pose ----------------------------------------------------------------------------------------------------

    def cinematique(self, angles: dict, bassin=(0.0, 0.0)) -> dict:
        etat = {}
        decalage = np.asarray(bassin, dtype=float)
        for o in self.os:
            delta = float(angles.get(o.nom, 0.0))
            if o.parent is None:
                debut = o.debut + decalage
                rot = delta
            else:
                P = etat[o.parent]
                debut = P["R"] @ o.debut + P["t"]
                rot = P["rot"] + delta
            R = _rotation(rot)
            t = debut - R @ o.debut
            etat[o.nom] = {"debut": debut, "fin": R @ o.fin + t, "rot": rot, "R": R, "t": t}
        return etat

    def deformer(self, angles: dict, bassin=(0.0, 0.0)) -> np.ndarray:
        etat = self.cinematique(angles, bassin)
        sortie = np.zeros_like(self.sommets)
        for j, o in enumerate(self.os):
            e = etat[o.nom]
            sortie += self.poids[:, j:j + 1] * (self.sommets @ e["R"].T + e["t"])
        return sortie

    def poser(self, angles: dict, x=None, y=None, echelle=1.0, sens=1.0, penche=0.0, ecrase=1.0, saut=0.0,
              bassin=(0.0, 0.0)) -> np.ndarray:
        v = self.deformer(angles, bassin) - self.ancre
        e = max(0.4, ecrase)
        v[:, 0] *= e ** -0.6
        v[:, 1] *= e
        if penche:
            v = v @ _rotation(penche).T
        v *= echelle
        v[:, 0] *= sens
        x = self.ancre[0] if x is None else x
        y = self.ancre[1] if y is None else y
        return v + np.array([x, y - saut])

    # --- dessin --------------------------------------------------------------------------------------------------

    def texture(self, image_rgba: np.ndarray):
        """Une variante de l'illustration (même cadrage : autre expression, yeux fermés…) à poser sur le même maillage."""
        img = skia.Image.fromarray(np.ascontiguousarray(image_rgba), colorType=skia.kRGBA_8888_ColorType,
                                   alphaType=skia.kUnpremul_AlphaType).withDefaultMipmaps()
        return img.makeShader(skia.TileMode.kClamp, skia.TileMode.kClamp,
                              skia.SamplingOptions(skia.FilterMode.kLinear, skia.MipmapMode.kLinear))

    def dessiner(self, canvas, positions: np.ndarray, alpha: float = 1.0, texture=None):
        pts = [skia.Point(float(px), float(py)) for px, py in positions]
        peinture = skia.Paint(Shader=texture if texture is not None else self._shader, AntiAlias=True)
        if alpha < 1.0:
            peinture.setAlphaf(alpha)
        for couche, indices in self.couches.items():
            if not indices:
                continue
            v = skia.Vertices.MakeCopy(skia.Vertices.kTriangles_VertexMode, pts, self._texs, None, indices)
            canvas.drawVertices(v, peinture)
