"""Jeu de données procédural : des « marionnettes » de la troupe en 32x32.

Les vrais moteurs (Wan, Veo, Kling) apprennent sur des dizaines de millions de
clips filmés et légendés. Ici, budget zéro : on fabrique nous-mêmes les clips.
Chaque clip montre UN personnage de la troupe, simplifié en marionnette de
quelques pixels, qui fait UNE action dans UN décor, avec sa légende :

    « MODOU saute dans la Cour », « COUMBA parle dans le Salon », ...

* Personnages : les 7 personnages dessinés « planche » de ``troupe.json``.
  Leur palette (2-3 couleurs) est tirée de leur description « visuel »
  (ex. MODOU : t-shirt vert délavé + pantalon cargo marron) et leur taille
  relative de « taille_m ». La tête est toujours une peau brune.
* Actions (5) : « saute », « marche vers la droite », « marche vers la gauche »,
  « parle » (bouche + geste du bras + tête qui bouge), « tombe ».
* Décors (4) : Marché, Salon, Cour, Maquis (couleur + motif simple).
* Légende : « {NOM} {action} {décor avec article} » où l'article est fixe :
  « au Marché », « dans le Salon », « dans la Cour », « au Maquis ».

Le rendu est déterministe pour une graine donnée (numpy uniquement), avec un
anti-crénelage par sur-échantillonnage (rendu 3x plus grand puis moyenné).

Généralisation compositionnelle : 20 triplets (personnage, action, décor) sur
140 (~14 %) ne sont JAMAIS montrés à l'entraînement. Chaque paire (personnage,
action), (personnage, décor) et (action, décor) reste vue à l'entraînement :
le modèle doit recombiner des éléments connus.
"""

from __future__ import annotations

import json
import math
import os
import warnings
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np

from .config import RUNS_DIR, TROUPE_JSON

DATA_VERSION = 1  # à incrémenter si le rendu change (invalide le cache)

# ---------------------------------------------------------------------------
# Vocabulaire fermé
# ---------------------------------------------------------------------------
PERSONNAGES: tuple[str, ...] = (
    "MAMAN NOUNOU",
    "BAYE NDIAYE",
    "COUMBA",
    "PETIT MAMADOU",
    "MODOU",
    "TANTIE AWA",
    "KOFFI",
)
ACTIONS: tuple[str, ...] = (
    "saute",
    "marche vers la droite",
    "marche vers la gauche",
    "parle",
    "tombe",
)
DECORS: tuple[str, ...] = ("Marché", "Salon", "Cour", "Maquis")
# Articles fixes (un seul choix par décor, pour que le vocabulaire reste fermé).
DECOR_PHRASE: dict[str, str] = {
    "Marché": "au Marché",
    "Salon": "dans le Salon",
    "Cour": "dans la Cour",
    "Maquis": "au Maquis",
}

GROUND_Y = 29.0  # ligne des pieds (en pixels, axe y vers le bas)

# Tailles de repli si troupe.json est introuvable (mêmes valeurs que la bible).
_TAILLES_REPLI = {
    "MAMAN NOUNOU": 1.60,
    "BAYE NDIAYE": 1.72,
    "COUMBA": 1.70,
    "PETIT MAMADOU": 1.15,
    "MODOU": 1.76,
    "TANTIE AWA": 1.62,
    "KOFFI": 1.78,
}

# ---------------------------------------------------------------------------
# Couleurs (RGB 0-255) et mots-clés de la bible dont elles sont tirées
# ---------------------------------------------------------------------------
COULEURS: dict[str, tuple[int, int, int]] = {
    "peau": (128, 82, 54),
    "rouge": (205, 38, 42),
    "jaune": (246, 208, 46),
    "vert": (40, 150, 70),
    "blanc": (240, 240, 232),
    "bleu_roi": (36, 70, 196),
    "or": (220, 174, 52),
    "gris": (168, 168, 172),
    "rose": (240, 120, 186),
    "violet": (126, 50, 170),
    "noir": (24, 22, 26),
    "bleu_short": (80, 150, 240),
    "vert_delave": (122, 160, 106),
    "brun_cargo": (156, 110, 60),
    "orange": (244, 128, 26),
    "bordeaux": (142, 30, 64),
    "bouche": (92, 22, 28),
}


def _rgb(nom: str) -> np.ndarray:
    return np.asarray(COULEURS[nom], dtype=np.float32) / 255.0


@dataclass(frozen=True)
class Costume:
    """Description d'une marionnette, dérivée du champ « visuel » de la bible."""

    tenue: str  # "robe" | "boubou" | "pantalon" | "short"
    haut: str  # couleur du haut / de la robe
    bas: str  # couleur du pantalon / short (= haut pour une robe)
    motif: str | None  # couleur du motif
    type_motif: str  # "pois" | "rayures" | "damier" | "aucun"
    coiffure: str  # "foulard" | "gris" | "tresses" | "court"
    couleur_coiffure: str
    morpho: str  # "ronde" | "mince" | "normale" | "enfant"
    manches: str  # "longues" | "courtes"
    tablier: bool = False
    lunettes: bool = False
    barbe: bool = False
    col: str | None = None
    centre: str | None = None  # bande centrale (chemise sous un blazer)
    mots_cles: tuple[str, ...] = ()  # mots de « visuel » qui justifient le costume


COSTUMES: dict[str, Costume] = {
    # « red and yellow sunflower wax-print dress with matching red wax head-wrap,
    #   green-and-white gingham apron » ; « plump, round »
    "MAMAN NOUNOU": Costume(
        tenue="robe", haut="rouge", bas="rouge", motif="jaune", type_motif="pois",
        coiffure="foulard", couleur_coiffure="rouge", morpho="ronde", manches="courtes",
        tablier=True, mots_cles=("red and yellow", "head-wrap", "gingham apron", "plump"),
    ),
    # « grey-haired ... short grey beard, shiny royal-blue boubou with gold embroidery » ; « plump »
    "BAYE NDIAYE": Costume(
        tenue="boubou", haut="bleu_roi", bas="bleu_roi", motif=None, type_motif="aucun",
        coiffure="gris", couleur_coiffure="gris", morpho="ronde", manches="longues",
        barbe=True, col="or", mots_cles=("royal-blue boubou", "gold embroidery", "grey beard"),
    ),
    # « long braids, off-shoulder pink-and-purple wax-print fitted long dress »
    "COUMBA": Costume(
        tenue="robe", haut="rose", bas="rose", motif="violet", type_motif="rayures",
        coiffure="tresses", couleur_coiffure="noir", morpho="normale", manches="courtes",
        mots_cles=("long braids", "pink-and-purple", "long dress"),
    ),
    # « oversized yellow football jersey number 10 with green collar, blue shorts »
    "PETIT MAMADOU": Costume(
        tenue="short", haut="jaune", bas="bleu_short", motif=None, type_motif="aucun",
        coiffure="court", couleur_coiffure="noir", morpho="enfant", manches="courtes",
        col="vert", mots_cles=("yellow football jersey", "green collar", "blue shorts"),
    ),
    # « thin lanky ... faded worn green t-shirt, brown cargo trousers »
    "MODOU": Costume(
        tenue="pantalon", haut="vert_delave", bas="brun_cargo", motif=None, type_motif="aucun",
        coiffure="court", couleur_coiffure="noir", morpho="mince", manches="courtes",
        mots_cles=("thin lanky", "faded worn green t-shirt", "brown cargo trousers"),
    ),
    # « orange-and-yellow floral wax dress ... matching orange head-wrap » ; « large, plump »
    "TANTIE AWA": Costume(
        tenue="robe", haut="orange", bas="orange", motif="jaune", type_motif="pois",
        coiffure="foulard", couleur_coiffure="orange", morpho="ronde", manches="courtes",
        mots_cles=("orange-and-yellow", "orange head-wrap", "plump"),
    ),
    # « sunglasses, black shirt under a patterned blazer, gold chains, black trousers »
    # (le blazer est « patterned » sans couleur : on choisit bordeaux à damier or)
    "KOFFI": Costume(
        tenue="pantalon", haut="bordeaux", bas="noir", motif="or", type_motif="damier",
        coiffure="court", couleur_coiffure="noir", morpho="normale", manches="longues",
        lunettes=True, centre="noir",
        mots_cles=("sunglasses", "black shirt", "patterned blazer", "gold chains", "black trousers"),
    ),
}

_LARGEUR = {"ronde": 0.42, "mince": 0.27, "normale": 0.33, "enfant": 0.40}


def palette(nom: str) -> list[str]:
    """Couleurs principales (hors peau) d'un personnage, par ordre d'importance."""
    c = COSTUMES[nom]
    out: list[str] = [c.haut]
    for extra in (c.bas, c.motif, c.couleur_coiffure if c.coiffure != "court" else None,
                  "vert" if c.tablier else None, "blanc" if c.tablier else None, c.col, c.centre):
        if extra and extra not in out:
            out.append(extra)
    return out


# ---------------------------------------------------------------------------
# Lecture de la bible
# ---------------------------------------------------------------------------
@lru_cache(maxsize=1)
def load_troupe(path: str | None = None) -> dict[str, dict]:
    """Charge les personnages « planche » de troupe.json (nom -> fiche)."""
    p = Path(path) if path else TROUPE_JSON
    fiches: dict[str, dict] = {}
    if p.exists():
        data = json.loads(p.read_text(encoding="utf-8"))
        for perso in data.get("personnages", []):
            if perso.get("dessin") == "planche" and perso.get("nom") in COSTUMES:
                fiches[perso["nom"]] = perso
    for nom in PERSONNAGES:
        if nom not in fiches:
            fiches[nom] = {"nom": nom, "visuel": "", "taille_m": _TAILLES_REPLI[nom]}
            if p.exists():
                warnings.warn(f"{nom} absent de {p} : taille de repli utilisée", stacklevel=2)
    # Vérifie que le costume est bien justifié par la description de la bible.
    for nom, fiche in fiches.items():
        visuel = fiche.get("visuel", "").lower()
        if not visuel:
            continue
        manquants = [m for m in COSTUMES[nom].mots_cles if m.lower() not in visuel]
        if manquants:
            warnings.warn(f"{nom} : mots-clés absents du visuel {manquants}", stacklevel=2)
    return fiches


def hauteur_px(nom: str) -> float:
    """Hauteur de la marionnette en pixels (1,78 m -> ~20,5 px sur 32)."""
    return 11.5 * float(load_troupe()[nom].get("taille_m", _TAILLES_REPLI[nom]))


# ---------------------------------------------------------------------------
# Légendes
# ---------------------------------------------------------------------------
def prompt_for(nom: str, action: str, decor: str) -> str:
    return f"{nom} {action} {DECOR_PHRASE[decor]}"


def parse_prompt(text: str) -> tuple[str, str, str]:
    """Retrouve (personnage, action, décor) dans un prompt du vocabulaire fermé."""
    t = " ".join(text.lower().replace("’", "'").split())
    nom = next((n for n in sorted(PERSONNAGES, key=len, reverse=True) if n.lower() in t), None)
    action = next((a for a in sorted(ACTIONS, key=len, reverse=True) if a in t), None)
    decor = next((d for d in DECORS if d.lower() in t.split() or d.lower() in t), None)
    if nom is None or action is None or decor is None:
        raise ValueError(
            f"prompt non reconnu : {text!r}. Personnages : {', '.join(PERSONNAGES)} ; "
            f"actions : {', '.join(ACTIONS)} ; décors : {', '.join(DECORS)}"
        )
    return nom, action, decor


def all_prompts() -> list[str]:
    return [prompt_for(*tr) for tr in all_triples()]


# ---------------------------------------------------------------------------
# Triplets vus / tenus à l'écart
# ---------------------------------------------------------------------------
Triple = tuple[str, str, str]


def all_triples() -> list[Triple]:
    return [(n, a, d) for n in PERSONNAGES for a in ACTIONS for d in DECORS]


def is_heldout(nom: str, action: str, decor: str) -> bool:
    """Règle fixe : (i_perso + 2 i_action + 3 i_décor) mod 7 == 0.

    Pour chaque paire (action, décor) exactement 1 personnage sur 7 est tenu à
    l'écart, et chaque paire (personnage, action) ou (personnage, décor) perd au
    plus une combinaison : toutes les paires restent vues à l'entraînement.
    """
    c, a, s = PERSONNAGES.index(nom), ACTIONS.index(action), DECORS.index(decor)
    return (c + 2 * a + 3 * s) % 7 == 0


def heldout_triples() -> list[Triple]:
    return [tr for tr in all_triples() if is_heldout(*tr)]


def train_triples() -> list[Triple]:
    return [tr for tr in all_triples() if not is_heldout(*tr)]


# ---------------------------------------------------------------------------
# Rendu : toile sur-échantillonnée + primitives en coordonnées du corps
# ---------------------------------------------------------------------------
class _Toile:
    """Toile RGB + alpha, sur-échantillonnée ``ss`` fois."""

    def __init__(self, size: int, ss: int):
        self.size, self.ss = size, ss
        n = size * ss
        coords = (np.arange(n, dtype=np.float32) + 0.5) / ss
        self.X, self.Y = np.meshgrid(coords, coords)  # X : colonnes, Y : lignes (vers le bas)
        self.rgb = np.zeros((n, n, 3), np.float32)
        self.alpha = np.zeros((n, n), np.float32)

    def clear(self) -> None:
        self.rgb.fill(0.0)
        self.alpha.fill(0.0)

    def paint(self, mask: np.ndarray, color: np.ndarray) -> None:
        self.rgb[mask] = color
        self.alpha[mask] = 1.0

    def reduce(self) -> tuple[np.ndarray, np.ndarray]:
        """Moyenne par blocs ss x ss -> (couleur pré-multipliée, couverture)."""
        s, ss = self.size, self.ss
        a = self.alpha.reshape(s, ss, s, ss).mean(axis=(1, 3))
        c = (self.rgb * self.alpha[..., None]).reshape(s, ss, s, ss, 3).mean(axis=(1, 3))
        return c, a


def _rect(u, v, u0, u1, v0, v1):
    return (u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)


def _ellipse(u, v, cu, cv, ru, rv):
    return ((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2 <= 1.0


def _trapeze(u, v, v0, v1, hw0, hw1):
    k = np.clip((v - v0) / max(v1 - v0, 1e-6), 0.0, 1.0)
    return (v >= v0) & (v <= v1) & (np.abs(u) <= hw0 + (hw1 - hw0) * k)


def _segment(u, v, su, sv, du, dv, length, hw):
    du_, dv_ = u - su, v - sv
    along = du_ * du + dv_ * dv
    perp = -du_ * dv + dv_ * du
    return (along >= 0) & (along <= length) & (np.abs(perp) <= hw)


@dataclass
class Pose:
    """Pose d'une image. (x, y) = milieu des pieds (pivot), y vers le bas."""

    x: float
    y: float
    angle: float = 0.0  # rotation autour des pieds (+ = tombe vers la droite)
    jambe: float = 0.0  # écart des jambes (marche)
    bras_g: float = 0.2  # angle du bras gauche (0 = le long du corps, pi = levé)
    bras_d: float = 0.2
    bouche: float = 0.0  # ouverture 0..1
    tete_dy: float = 0.0  # petit hochement de tête
    regard: float = 0.0  # -1 gauche, 0 face, +1 droite


def _dessine_marionnette(toile: _Toile, costume: Costume, H: float, pose: Pose) -> None:
    ca, sa = math.cos(pose.angle), math.sin(pose.angle)
    dx = toile.X - pose.x
    dy = pose.y - toile.Y  # vers le haut
    u = dx * ca - dy * sa  # coordonnées du corps (u à droite, v vers le haut)
    v = dx * sa + dy * ca

    enfant = costume.morpho == "enfant"
    r = (0.15 if enfant else 0.115) * H  # rayon de la tête
    b = _LARGEUR[costume.morpho] * H / 2  # demi-largeur du corps
    v_tete = H - r + pose.tete_dy
    v_epaule = H - 2 * r - 0.3
    v_hanche = 0.47 * H
    peau, noir = _rgb("peau"), _rgb("noir")
    haut, bas = _rgb(costume.haut), _rgb(costume.bas)

    # Tresses (derrière le corps)
    if costume.coiffure == "tresses":
        for s in (-1, 1):
            toile.paint(_rect(u, v, s * 0.95 * r - 0.45 * r, s * 0.95 * r + 0.45 * r,
                              v_epaule - 0.2 * H, v_tete + 0.4 * r), _rgb(costume.couleur_coiffure))

    # Jambes / bas du corps
    j = pose.jambe
    if costume.tenue == "pantalon":
        for s in (-1, 1):
            cu = s * 0.5 * b + s * j
            toile.paint(_rect(u, v, cu - 0.42 * b, cu + 0.42 * b, 0.0, v_hanche + 0.5), bas)
    elif costume.tenue == "short":
        v_short = v_hanche - 0.17 * H
        for s in (-1, 1):
            cu = s * 0.5 * b + s * j
            toile.paint(_rect(u, v, cu - 0.3 * b, cu + 0.3 * b, 0.0, v_short + 0.2), peau)
            toile.paint(_rect(u, v, cu - 0.48 * b, cu + 0.48 * b, v_short, v_hanche + 0.5), bas)
    else:  # robe / boubou : seules les chevilles dépassent
        for s in (-1, 1):
            cu = s * 0.45 * b + s * j
            toile.paint(_rect(u, v, cu - 0.28 * b, cu + 0.28 * b, 0.0, 0.2 * H), peau)

    # Torse / robe
    if costume.tenue == "robe":
        corps = _trapeze(u, v, 0.1 * H if costume.morpho != "normale" else 0.06 * H, v_epaule, 1.18 * b, 0.85 * b)
    elif costume.tenue == "boubou":
        corps = _trapeze(u, v, 0.05 * H, v_epaule, 1.35 * b, 1.05 * b)
    else:
        corps = _rect(u, v, -b, b, v_hanche, v_epaule)
    if costume.morpho == "ronde":
        corps |= _ellipse(u, v, 0.0, (v_hanche + v_epaule) / 2, 1.12 * b, (v_epaule - v_hanche) / 2 * 1.05)
    toile.paint(corps, haut)

    # Motif
    if costume.motif is not None:
        m = _rgb(costume.motif)
        if costume.type_motif == "pois":
            pois = ((np.mod(u, 2.0) - 1.0) ** 2 + (np.mod(v, 2.0) - 1.0) ** 2) <= 0.42 ** 2
            toile.paint(corps & pois, m)
        elif costume.type_motif == "rayures":
            toile.paint(corps & (np.mod(v, 2.4) < 1.0), m)
        elif costume.type_motif == "damier":
            dam = (np.floor(u / 1.1) + np.floor(v / 1.1)) % 2 == 0
            toile.paint(corps & dam, m)
    if costume.centre is not None:
        toile.paint(_rect(u, v, -0.32 * b, 0.32 * b, v_hanche, v_epaule), _rgb(costume.centre))
        toile.paint(_rect(u, v, -0.32 * b, 0.32 * b, v_epaule - 1.6, v_epaule - 1.0), _rgb("or"))  # chaîne
    if costume.tablier:
        tab = _rect(u, v, -0.62 * b, 0.62 * b, 0.22 * H, v_epaule - 1.4)
        vichy = (np.floor(u / 0.9) + np.floor(v / 0.9)) % 2 == 0
        toile.paint(tab & vichy, _rgb("vert"))
        toile.paint(tab & ~vichy, _rgb("blanc"))
    if costume.col is not None:
        toile.paint(_rect(u, v, -0.45 * b, 0.45 * b, v_epaule - 0.9, v_epaule + 0.1), _rgb(costume.col))

    # Bras (segments depuis les épaules)
    longueur, demi = 0.36 * H, max(0.09 * H, 0.65)
    manche = 1.0 if costume.manches == "longues" else 0.4
    for s, theta in ((-1, pose.bras_g), (1, pose.bras_d)):
        su, sv = s * (b + 0.3 * demi), v_epaule - 0.4
        du, dv = s * math.sin(theta), -math.cos(theta)
        toile.paint(_segment(u, v, su, sv, du, dv, longueur, demi), peau)
        toile.paint(_segment(u, v, su, sv, du, dv, longueur * manche, demi * 1.1), haut)

    # Tête
    toile.paint(_ellipse(u, v, 0.0, v_tete, 0.92 * r, r), peau)
    cc = _rgb(costume.couleur_coiffure)
    if costume.coiffure == "foulard":
        toile.paint(_ellipse(u, v, 0.0, v_tete + 0.75 * r, 1.12 * r, 0.85 * r) & (v >= v_tete + 0.1 * r), cc)
    else:
        toile.paint(_ellipse(u, v, 0.0, v_tete + 0.3 * r, 0.98 * r, 0.75 * r) & (v >= v_tete + 0.25 * r), cc)
    if costume.barbe:
        toile.paint(_ellipse(u, v, 0.0, v_tete - 0.6 * r, 0.78 * r, 0.5 * r), cc)
    # Visage
    ru = pose.regard * 0.25 * r
    if costume.lunettes:
        toile.paint(_rect(u, v, ru - 0.85 * r, ru + 0.85 * r, v_tete - 0.05 * r, v_tete + 0.38 * r), noir)
    else:
        for s in (-1, 1):
            toile.paint(_rect(u, v, ru + s * 0.4 * r - 0.3, ru + s * 0.4 * r + 0.3,
                              v_tete + 0.05 * r - 0.3, v_tete + 0.05 * r + 0.3), noir)
    hb = 0.18 + 0.5 * pose.bouche
    toile.paint(_rect(u, v, ru - 0.38 * r, ru + 0.38 * r, v_tete - 0.5 * r - hb, v_tete - 0.5 * r + 0.15),
                _rgb("bouche"))


# ---------------------------------------------------------------------------
# Décors
# ---------------------------------------------------------------------------
def _c(*rgb) -> np.ndarray:
    return np.asarray(rgb, dtype=np.float32) / 255.0


@lru_cache(maxsize=32)
def _background_cached(decor: str, size: int, ss: int) -> np.ndarray:
    n = size * ss
    coords = (np.arange(n, dtype=np.float32) + 0.5) / ss * (32.0 / size)  # coordonnées « 32 px »
    X, Y = np.meshgrid(coords, coords)
    img = np.zeros((n, n, 3), np.float32)

    def put(mask, col):
        img[mask] = col

    if decor == "Marché":
        put(Y < 21, _c(150, 205, 240))  # ciel
        for cx, col in ((5, _c(225, 70, 60)), (16, _c(60, 170, 95)), (27, _c(70, 110, 220))):
            put((X - cx) ** 2 + (Y - 9.5) ** 2 <= 5.5 ** 2, col)  # parasols
            put(Y > 9.5, _c(150, 205, 240)) if False else None
        put((Y > 9.5) & (Y < 21), _c(150, 205, 240))
        for cx, col in ((5, _c(225, 70, 60)), (16, _c(60, 170, 95)), (27, _c(70, 110, 220))):
            dome = ((X - cx) ** 2 + (Y - 9.5) ** 2 <= 5.5 ** 2) & (Y <= 9.5)
            put(dome & (np.mod(X - cx + 50, 2.2) < 1.1), col)
            put(dome & ~(np.mod(X - cx + 50, 2.2) < 1.1), _c(245, 235, 210))
            put((np.abs(X - cx) < 0.4) & (Y > 9.5) & (Y < 17), _c(90, 70, 50))  # mâts
        put((Y >= 17) & (Y < 21), _c(170, 120, 70))  # étals en bois
        tomates = ((np.mod(X, 3.0) - 1.5) ** 2 + (Y - 16.6) ** 2) <= 0.9 ** 2
        put(tomates & (np.mod(X, 6.0) < 3.0), _c(215, 45, 35))
        put(tomates & (np.mod(X, 6.0) >= 3.0), _c(190, 120, 160))  # oignons
        put(Y >= 21, _c(222, 186, 128))  # sol de terre ocre
    elif decor == "Salon":
        put(Y < 22, _c(38, 128, 132))  # murs bleu-vert
        put((X >= 3) & (X < 11) & (Y >= 3) & (Y < 10), _c(150, 110, 50))  # cadre photo
        put((X >= 4) & (X < 10) & (Y >= 4) & (Y < 9), _c(222, 210, 188))
        put((X - 24) ** 2 + (Y - 6) ** 2 <= 2.8 ** 2, _c(40, 40, 40))  # horloge
        put((X - 24) ** 2 + (Y - 6) ** 2 <= 2.2 ** 2, _c(236, 236, 236))
        put((X >= 13) & (Y >= 14) & (Y < 22), _c(125, 85, 45))  # canapé
        put((X >= 13) & (Y >= 14) & (Y < 16), _c(185, 145, 60))
        put(Y >= 22, _c(196, 176, 146))  # carrelage
        put((Y >= 22) & ((np.mod(X, 4.0) < 0.35) | (np.mod(Y - 22, 4.0) < 0.35)), _c(165, 145, 118))
    elif decor == "Cour":
        put(Y < 4, _c(178, 182, 188))  # tôle ondulée
        put((Y < 4) & (np.mod(X, 2.0) < 1.0), _c(132, 137, 145))
        put((Y >= 4) & (Y < 21), _c(150, 150, 146))  # parpaings
        rangee = np.floor((Y - 4) / 3.0)
        joint_h = np.mod(Y - 4, 3.0) < 0.4
        joint_v = np.mod(X + 3.0 * np.mod(rangee, 2), 6.0) < 0.4
        put((Y >= 4) & (Y < 21) & (joint_h | joint_v), _c(182, 182, 176))
        put((X >= 20) & (X < 27) & (Y >= 8) & (Y < 21), _c(232, 196, 60))  # rideau jaune
        put((X >= 20) & (X < 27) & (Y >= 8) & (Y < 21) & (np.mod(X, 2.0) < 0.6), _c(205, 165, 40))
        put((Y > 6.0) & (Y < 6.4) & (X < 17), _c(60, 60, 60))  # corde à linge
        put((X >= 3) & (X < 6) & (Y >= 6.4) & (Y < 10), _c(240, 240, 240))
        put((X >= 9) & (X < 13) & (Y >= 6.4) & (Y < 9), _c(120, 190, 220))
        put(Y >= 21, _c(196, 180, 150))  # sable
    elif decor == "Maquis":
        put(Y < 21, _c(30, 36, 82))  # nuit
        fil = 3.0 + 1.4 * np.sin(X / 32.0 * 2 * np.pi)
        put(np.abs(Y - fil) < 0.25, _c(70, 70, 80))
        bulbes = ((np.mod(X, 4.0) - 2.0) ** 2 + (Y - fil - 0.6) ** 2) <= 0.85 ** 2
        put(bulbes, _c(252, 222, 120))  # guirlande
        put((X >= 2) & (X < 10) & (Y >= 7) & (Y < 14), _c(36, 56, 46))  # ardoise
        put((X >= 3) & (X < 9) & (Y >= 8) & (Y < 13) & (np.mod(Y, 2.0) < 0.5), _c(220, 220, 210))
        put((X >= 19) & (X < 30) & (Y >= 6) & (Y < 13), _c(15, 15, 18))  # télé
        put((X >= 20) & (X < 29) & (Y >= 7) & (Y < 12), _c(50, 140, 62))
        for x0 in (1.0, 24.0):  # tables en plastique bleu
            put((X >= x0) & (X < x0 + 7) & (Y >= 16) & (Y < 17.5), _c(40, 90, 205))
            put((X >= x0 + 0.5) & (X < x0 + 1.5) & (Y >= 17.5) & (Y < 21), _c(40, 90, 205))
            put((X >= x0 + 5.5) & (X < x0 + 6.5) & (Y >= 17.5) & (Y < 21), _c(40, 90, 205))
        put(Y >= 21, _c(92, 54, 42))  # sol en terre cuite
    else:
        raise ValueError(f"décor inconnu : {decor}")
    return img.reshape(size, ss, size, ss, 3).mean(axis=(1, 3))


def render_background(decor: str, size: int = 32, supersample: int = 3) -> np.ndarray:
    """Décor vide, float32 (H, W, 3) dans [0, 1]."""
    return _background_cached(decor, size, supersample).copy()


# ---------------------------------------------------------------------------
# Actions -> suite de poses
# ---------------------------------------------------------------------------
def _poses(action: str, nom: str, rng: np.random.Generator, T: int, size: int) -> list[Pose]:
    H = hauteur_px(nom)
    b = _LARGEUR[COSTUMES[nom].morpho] * H / 2
    marge = 1.2 * b + 1.5
    sol = GROUND_Y * size / 32.0
    poses: list[Pose] = []
    if action == "saute":
        x0 = rng.uniform(marge + 2, size - marge - 2)
        n_sauts = int(rng.integers(1, 3))
        amp = rng.uniform(4.0, 6.5)
        debut = int(rng.integers(0, 3))
        duree = (T - 1 - debut) / n_sauts
        derive = rng.uniform(-0.08, 0.08)
        for i in range(T):
            k = (i - debut) / duree
            en_l_air = 0 <= k < n_sauts
            frac = k - math.floor(k) if en_l_air else 0.0
            h = amp * math.sin(math.pi * frac) if en_l_air else 0.0
            bras = 0.3 + 2.0 * math.sin(math.pi * frac) if en_l_air else 0.3
            poses.append(Pose(x=x0 + derive * i, y=sol - h, bras_g=bras, bras_d=bras,
                              bouche=0.4 if en_l_air else 0.0))
    elif action in ("marche vers la droite", "marche vers la gauche"):
        sens = 1.0 if action.endswith("droite") else -1.0
        vitesse = rng.uniform(0.7, 0.95)
        dist = vitesse * (T - 1)
        x0 = rng.uniform(marge, size - marge - dist) if sens > 0 else rng.uniform(marge + dist, size - marge)
        periode = rng.uniform(5.5, 7.5)
        phase = rng.uniform(0, 2 * math.pi)
        for i in range(T):
            s = math.sin(2 * math.pi * i / periode + phase)
            poses.append(Pose(x=x0 + sens * vitesse * i, y=sol - 0.35 * abs(s), jambe=0.55 * b * s,
                              bras_g=max(0.05, 0.3 - 0.3 * s), bras_d=max(0.05, 0.3 + 0.3 * s), regard=sens))
    elif action == "parle":
        x0 = rng.uniform(marge + 2, size - marge - 2)
        p_bouche = rng.uniform(2.2, 3.4)
        p_geste = rng.uniform(5.0, 8.0)
        p_tete = rng.uniform(4.0, 7.0)
        ph1, ph2, ph3 = rng.uniform(0, 2 * math.pi, size=3)
        cote = 1 if rng.random() < 0.5 else -1
        for i in range(T):
            geste = 0.4 + 1.2 * (0.5 + 0.5 * math.sin(2 * math.pi * i / p_geste + ph2))
            calme = 0.2 + 0.15 * (0.5 + 0.5 * math.sin(2 * math.pi * i / p_geste + ph2 + 1.0))
            bras_g, bras_d = (calme, geste) if cote > 0 else (geste, calme)
            poses.append(Pose(x=x0, y=sol, bras_g=bras_g, bras_d=bras_d,
                              bouche=0.5 + 0.5 * math.sin(2 * math.pi * i / p_bouche + ph1),
                              tete_dy=0.35 * math.sin(2 * math.pi * i / p_tete + ph3)))
    elif action == "tombe":
        sens = 1.0 if rng.random() < 0.5 else -1.0
        couche = 1.1 * H + 1.0  # longueur une fois allongé
        if sens > 0:
            x0 = rng.uniform(marge, max(marge, size - 1.0 - couche))
        else:
            x0 = rng.uniform(min(size - marge, couche + 1.0), size - marge)
        debut = int(rng.integers(1, 5))
        duree = rng.uniform(4.0, 6.0)
        for i in range(T):
            k = min(max((i - debut) / duree, 0.0), 1.0)
            ang = sens * (math.pi / 2) * k * k
            bras = 0.25 + 1.6 * k
            poses.append(Pose(x=x0, y=sol - 1.1 * b * abs(math.sin(ang)), angle=ang, bras_g=bras, bras_d=bras,
                              bouche=1.0 if 0 < k < 1 else 0.3 * k, regard=sens * (k > 0)))
    else:
        raise ValueError(f"action inconnue : {action}")
    return poses


def render_clip(nom: str, action: str, decor: str, seed: int | Sequence[int] = 0, *,
                n_frames: int = 17, size: int = 32, supersample: int = 3) -> np.ndarray:
    """Rend un clip déterministe : uint8 (T, H, W, 3)."""
    rng = np.random.default_rng(seed)
    poses = _poses(action, nom, rng, n_frames, size)
    fond = _background_cached(decor, size, supersample)
    toile = _Toile(size, supersample)
    echelle = size / 32.0
    H = hauteur_px(nom) * echelle
    costume = COSTUMES[nom]
    out = np.empty((n_frames, size, size, 3), np.uint8)
    for i, pose in enumerate(poses):
        toile.clear()
        _dessine_marionnette(toile, costume, H, pose)
        c, a = toile.reduce()
        img = fond * (1.0 - a[..., None]) + c
        out[i] = np.clip(img * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return out


def render_first_frame(prompt: str, seed: int = 0, supersample: int = 3) -> np.ndarray:
    """Image 0 du clip de référence d'un prompt (pour l'image->vidéo)."""
    nom, action, decor = parse_prompt(prompt)
    return render_clip(nom, action, decor, seed, supersample=supersample)[0]


# ---------------------------------------------------------------------------
# Jeux de données
# ---------------------------------------------------------------------------
SPLITS = {"train": 0, "heldout": 1, "seen": 2}


def split_triples(split: str) -> list[Triple]:
    if split == "heldout":
        return heldout_triples()
    if split in ("train", "seen"):
        return train_triples()
    raise ValueError(f"split inconnu : {split}")


def clip_seed(base_seed: int, split: str, i: int) -> list[int]:
    return [int(base_seed), SPLITS[split], int(i)]


def _render_job(args):
    nom, action, decor, seed, ss = args
    return render_clip(nom, action, decor, seed, supersample=ss)


@dataclass
class ClipDataset:
    """Clips uint8 (N, T, H, W, 3) + triplets + légendes."""

    clips: np.ndarray
    triples: list[Triple]
    prompts: list[str]

    def __len__(self) -> int:
        return len(self.triples)


def build_dataset(split: str, n: int, seed: int = 1234, supersample: int = 3, *,
                  cache: bool = True, workers: int | None = None) -> ClipDataset:
    """Construit (ou relit depuis runs/cache) ``n`` clips du split demandé.

    * ``train``   : triplets vus, graines (seed, 0, i)
    * ``seen``    : triplets vus, autres graines (seed, 2, i) -> évaluation « vu »
    * ``heldout`` : triplets jamais vus, graines (seed, 1, i)
    Les triplets sont parcourus en tourniquet : chaque triplet a ~n/len clips.
    """
    triples = split_triples(split)
    chosen = [triples[i % len(triples)] for i in range(n)]
    prompts = [prompt_for(*tr) for tr in chosen]
    path = RUNS_DIR / "cache" / f"clips_{split}_{n}_s{seed}_ss{supersample}_v{DATA_VERSION}.npz"
    if cache and path.exists():
        clips = np.load(path)["clips"]
        if clips.shape[0] == n:
            return ClipDataset(clips, chosen, prompts)
    jobs = [(*tr, clip_seed(seed, split, i), supersample) for i, tr in enumerate(chosen)]
    workers = workers if workers is not None else min(4, os.cpu_count() or 1)
    if n >= 64 and workers > 1:
        import multiprocessing as mp

        with mp.get_context("fork").Pool(workers) as pool:
            clips_list = pool.map(_render_job, jobs, chunksize=16)
    else:
        clips_list = [_render_job(j) for j in jobs]
    clips = np.stack(clips_list) if clips_list else np.zeros((0, 17, 32, 32, 3), np.uint8)
    if cache:
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(path, clips=clips)
    return ClipDataset(clips, chosen, prompts)


def to_model_space(clips_uint8: np.ndarray):
    """uint8 (..., T, H, W, 3) -> torch float (..., 3, T, H, W) dans [-1, 1]."""
    import torch

    x = torch.from_numpy(np.ascontiguousarray(clips_uint8)).float() / 127.5 - 1.0
    return x.movedim(-1, -4)


def from_model_space(x) -> np.ndarray:
    """torch float (..., 3, T, H, W) dans [-1, 1] -> uint8 (..., T, H, W, 3)."""
    x = x.detach().float().clamp(-1, 1).movedim(-4, -1)
    return ((x + 1.0) * 127.5 + 0.5).clamp(0, 255).to("cpu").numpy().astype(np.uint8)


def iter_vocabulary() -> Iterable[str]:
    """Tous les mots des légendes (pour le tokenizer)."""
    seen: dict[str, None] = {}
    for p in all_prompts():
        for w in p.split():
            seen.setdefault(w, None)
    return list(seen)
