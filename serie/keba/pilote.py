"""Épisode pilote : « La pyramide de Tonton Bara ».

1. Accroche : Tonton Bara n'arrive pas à poser la dernière boîte en haut de sa pyramide. Kéba accourt, saute, la pose.
2. Faux soulagement ; en repartant, sa claquette s'envole et touche la pyramide. Silence… tout s'écroule sur Bara.
3. Tata Coumba sort, la bassine sur la tête, glisse sur une boîte : la bassine atterrit sur Bara.
4. Gaïndé, réveillé, charge ; Kéba saute par-dessus ; le mouton percute le poteau : la tôle tombe sur Bara.
5. Silence : tous se tournent vers Kéba, qui sourit, gêné. Poursuite.
6. Gag final : rue vide, Gaïndé revient, mange la claquette perdue, regarde la caméra. Coupure (boucle de replay).
La physique (pymunk) décide de la chute réelle des boîtes ; le metteur en scène réagit à ce qui s'est passé.
"""
import json
import math
from pathlib import Path

import numpy as np

from .elements import ElementActeur, ElementDecor, ElementObjet, ElementPorte, charger_image, image_rgba
from .mise_en_scene import Plateau
from .pantin import Pantin

BIBLE_PNG = Path(__file__).resolve().parents[1] / "bible" / "png"
DUREE = 56.0

# Hauteur à l'écran (px, image 1080×1920 à zoom 1) de chaque personnage
TAILLES = {"keba": 400.0, "bara": 560.0, "coumba": 700.0, "gainde": 330.0}

# Géométrie du décor « rue-boutique », en fractions de l'image (réglée en regardant le décor)
LIEU = {"largeur_monde": 1460.0, "sol": 0.89, "comptoir": (0.21, 0.705, 0.25), "poteau": 0.40,
        "auvent": (0.03, 0.47, 0.40), "porte_coumba": 0.80, "mouton": 0.93}


def _rgba(chemin):
    from PIL import Image
    return np.asarray(Image.open(chemin).convert("RGBA"))


def pantin_humain(ident: str) -> Pantin:
    d = BIBLE_PNG / ident
    planche = d / "planche.png" if (d / "planche.png").exists() else d / "essai1.png"
    art = d / (planche.stem + "-articulations.json")
    rgba = _rgba(planche)
    if planche.name == "essai1.png":
        from .detourage import detourer
        rgba = detourer(rgba[:, :, :3])
    return Pantin.depuis_image(rgba, json.loads(art.read_text()), pas=9)


class Acteurs:
    """Le casting chargé : pantins, échelles, éléments de scène."""

    def __init__(self):
        self.pantins = {i: pantin_humain(i) for i in ("keba", "bara", "coumba")}
        self.echelles = {i: TAILLES[i] / p.hauteur for i, p in self.pantins.items()}


def ecrire(plateau: Plateau, lieu: dict):
    """La chorégraphie du pilote. Les positions viennent du décor ; les temps sont ceux du montage."""
    p = plateau
    sol = p.sol_y
    xc, yc, wc = lieu["comptoir"]
    x_porte, x_poteau, x_mouton = lieu["porte_coumba"], lieu["poteau"], lieu["mouton"]

    # --- objets : comptoir, pyramide (4-3-2 ; la dernière boîte est dans la main de Bara), oranges, tôle ----------
    m = p.monde
    m.ajouter("comptoir", forme="boite", taille=(wc, 24), masse=50, position=(xc, yc + 12), fige=True)
    bw, bh = 46.0, 58.0
    boites = []
    for rang, n in enumerate((4, 3, 2)):
        for k in range(n):
            nom = f"boite{rang}{k}"
            x = xc + (k - (n - 1) / 2) * (bw + 3)
            m.ajouter(nom, forme="boite", taille=(bw, bh), masse=0.6, position=(x, yc - bh / 2 - rang * (bh + 1)),
                      friction=0.85, elasticite=0.2)
            boites.append(nom)
    for k in range(5):
        m.ajouter(f"orange{k}", forme="rond", taille=17, masse=0.25,
                  position=(xc + wc / 2 + 30 + (k % 3) * 34, sol - 17 - (k // 3) * 33), elasticite=0.45)
    ax, ay, aw = lieu["auvent"]
    m.ajouter("tole", forme="boite", taille=(aw, 22), masse=7.0, position=(ax + aw / 2, ay), fige=True)

    # --- distribution --------------------------------------------------------------------------------------------
    p.acteur("bara", jambe=150.0, x=xc + wc * 0.62)
    p.acteur("keba", jambe=105.0, x=-260.0)
    p.acteur("coumba", jambe=230.0, x=x_porte + 400.0)
    p.acteur("gainde", jambe=110.0, x=x_mouton)

    # 0-4 s : Bara sur la pointe des pieds, la boîte au bout du bras ; Kéba accourt
    p.humeur(0.0, "malice")
    p.cadrer(0.0, xc + 120, sol - 620, 1.25)
    p.expression("bara", 0.0, "determine")
    for k, t in enumerate((0.3, 1.1, 1.9)):
        p.geste("bara", "bras_av", t, -2.6, 0.35, "anticipe_depasse")
        p.sauter("bara", t + 0.05, hauteur=28, duree=0.4)
        p.geste("bara", "bras_av", t + 0.6, -2.2, 0.2)
    t_arrivee = p.courir("keba", 1.8, xc - wc * 0.75)
    p.cadrer(2.2, xc, sol - 640, 1.0)
    p.expression("keba", 1.8, "joie")
    p.humeur(2.0, "calme")

    # 4-6 s : Kéba prend la boîte, saute, la pose en haut
    t = t_arrivee + 0.3
    t_prend = t + 0.2
    p.geste("bara", "bras_av", t, -1.2, 0.3)
    p.geste("keba", "bras_av", t, -2.4, 0.25)
    t_saut = t + 0.45
    fin_saut = p.sauter("keba", t_saut, hauteur=200, duree=0.85)
    p.aller("keba", t_saut, xc - bw * 0.2, vitesse=420)
    p.son(t_saut + 0.1, "montee", 0.5)
    t_pose = t_saut + 0.12 + 0.42
    sommet_y = yc - 3 * (bh + 1) - bh / 2
    m.avancer_jusqua(t_pose)
    m.ajouter("boite_haut", forme="boite", taille=(bw, bh), masse=0.6, position=(xc, sommet_y), friction=0.85,
              elasticite=0.2)
    boites.append("boite_haut")
    p.son(t_pose, "tink", 0.4)
    p.aller("keba", fin_saut, xc - wc * 0.8, vitesse=300)
    p.son(fin_saut, "pouf", 0.6)
    p.particules.bouffee(fin_saut, (xc - bw * 0.2, sol), nombre=10, vitesse=180, gravite=-60)

    # 6-8,2 s : triomphe (faux soulagement)
    t = fin_saut + 0.4
    for nom in ("keba", "bara"):
        p.expression(nom, t, "joie")
    p.geste("bara", "bras_av", t, -2.9, 0.3, "depasse")
    p.geste("bara", "bras_ar", t, 2.9, 0.3, "depasse")
    p.geste("keba", "bras_av", t + 0.6, -2.8, 0.3, "depasse")
    for k in range(4):
        p.geste("keba", "avbras_av", t + 0.9 + 0.22 * k, -0.6 if k % 2 == 0 else 0.4, 0.22)
    p.geste("bara", "bras_av", t + 1.4, 0.0, 0.4)
    p.geste("bara", "bras_ar", t + 1.4, 0.0, 0.4)
    p.geste("keba", "bras_av", t + 1.8, 0.0, 0.3)
    p.son(t, "kling", 0.5)

    # 8,2 s : Kéba repart… sa claquette s'envole vers la pyramide
    t_depart = t + 2.1
    p.aller("keba", t_depart, -150.0, vitesse=340)
    t_claque = t_depart + 0.35
    m.avancer_jusqua(t_claque)
    pied_x = p.acteurs["keba"].pistes.valeur("x", t_claque)
    m.ajouter("claquette", forme="boite", taille=(50, 18), masse=0.15, position=(pied_x + 15, sol - 14))
    cible = (xc, sommet_y)
    duree_vol = 0.55
    vx = (cible[0] - (pied_x + 15)) / duree_vol
    vy = (cible[1] - (sol - 14) - 0.5 * 2600 * duree_vol ** 2) / duree_vol
    m.impulsion("claquette", (0.15 * vx, 0.15 * vy))
    p.son(t_claque, "clac", 0.9)
    p.son(t_claque + 0.05, "whoosh", 0.7)
    p.expression("keba", t_claque + 0.2, "surprise")
    p.cadrer(t_claque + 0.2, xc, yc - 120, 1.45)

    # la claquette touche la pyramide : SILENCE… elle tient… puis tout s'écroule
    m.avancer_jusqua(t_claque + 1.0)
    impact = next((c.t for c in m.chocs if "claquette" in (c.a, c.b) and any(n.startswith("boite") for n in (c.a, c.b))),
                  t_claque + duree_vol)
    p.humeur(impact, "silence")
    p.expression("bara", impact + 0.1, "peur")
    p.geste("bara", "tete", impact + 0.1, -0.15, 0.4)
    t_soulage = impact + 1.3
    p.expression("bara", t_soulage, "soulagement")
    p.son(t_soulage, "glissade", 0.0)
    t_chute = t_soulage + 0.9
    m.avancer_jusqua(t_chute)
    m.impulsion("boite01", (60.0, -20.0))
    m.impulsion("boite02", (-60.0, -20.0))
    for i, nom in enumerate(boites):
        if nom.startswith("boite2") or nom == "boite_haut":
            m.impulsion(nom, ((-1) ** i * 45.0, -30.0))
    p.coup(t_chute)
    p.humeur(t_chute, "chaos")
    p.expression("bara", t_chute + 0.15, "choc")
    p.cadrer(t_chute + 0.3, xc + 80, sol - 600, 1.05)
    x_bara = p.acteurs["bara"].pistes.valeur("x", t_chute)
    m.ajouter_pilote("tete_bara", forme="rond", taille=70.0,
                     trajectoire=lambda tt: (p.acteurs["bara"].pistes.valeur("x", tt),
                                             sol - TAILLES["bara"] * 0.84 * p.acteurs["bara"].pistes.valeur("ecrase", tt)
                                             - p.acteurs["bara"].pistes.valeur("saut", tt), 0.0))
    for nom in boites[:]:
        x, y, _ = m.etat(nom, t_chute)
        m.impulsion(nom, (0.6 * (x_bara - x) + 120.0, -80.0))
    m.avancer_jusqua(t_chute + 2.5)
    p.expression("bara", t_chute + 1.2, "douleur")
    p.expression("bara", t_chute + 2.3, "fureur")
    p.expression("keba", t_chute + 0.4, "choc")
    p.expression("keba", t_chute + 1.6, "gene")
    p.geste("keba", "sens_force", t_chute + 0.3, 1.0, 0.01, "maintien")

    # Tata Coumba sort, la bassine sur la tête, et glisse sur une boîte
    t_c = t_chute + 2.8
    p.humeur(t_c, "malice")
    p.expression("coumba", t_c, "fierte")
    x_glisse = xc + wc * 0.9 + 190
    t_glisse = p.aller("coumba", t_c, x_glisse, vitesse=230)
    p.cadrer(t_c, (xc + x_porte) / 2 + 60, sol - 680, 0.92)
    p.son(t_glisse - 0.05, "glissade", 0.9)
    p.son(t_glisse, "boing", 0.6)
    p.regle("coumba", "penche", t_glisse, -1.25, 0.28, "sortie")
    p.sauter("coumba", t_glisse, hauteur=160, duree=0.65)
    p.geste("coumba", "cuisse_av", t_glisse, -1.4, 0.25)
    p.geste("coumba", "cuisse_ar", t_glisse, -1.1, 0.25)
    p.geste("coumba", "bras_av", t_glisse, -2.4, 0.2)
    p.geste("coumba", "bras_ar", t_glisse, 2.4, 0.2)
    p.expression("coumba", t_glisse + 0.05, "choc")
    t_assise = t_glisse + 0.12 + 0.65
    p.regle("coumba", "penche", t_assise, -0.25, 0.25, "rebond")
    p.son(t_assise, "pouf", 0.8)
    p.particules.bouffee(t_assise, (x_glisse, sol), nombre=12, vitesse=220, gravite=-50)
    p.expression("coumba", t_assise + 0.6, "fureur")
    # la bassine part en vol vers Bara
    m.avancer_jusqua(t_glisse + 0.1)
    xb = p.acteurs["bara"].pistes.valeur("x", t_glisse)
    m.ajouter("bassine", forme="boite", taille=(120, 60), masse=1.2,
              position=(x_glisse, sol - TAILLES["coumba"] - 40), elasticite=0.2)
    vol = 1.05
    m.impulsion("bassine", (1.2 * (xb - x_glisse) / vol,
                            1.2 * (sol - TAILLES["bara"] - 30 - (sol - TAILLES["coumba"] - 40) - 0.5 * 2600 * vol ** 2) / vol))
    p.son(t_glisse + 0.1, "whoosh", 0.8)
    t_eclabousse = t_glisse + 0.1 + vol
    m.avancer_jusqua(t_eclabousse + 0.5)
    p.son(t_eclabousse, "splash", 1.0)
    p.particules.bouffee(t_eclabousse, (xb, sol - TAILLES["bara"] - 20), nombre=40, couleur="#9ED8F5", vitesse=520,
                         duree=0.9, gravite=1800, rayon=(5, 11))
    p.expression("bara", t_eclabousse + 0.1, "choc")
    p.expression("bara", t_eclabousse + 1.0, "fureur")
    p.cadrer(t_eclabousse - 0.3, xb + 150, sol - 640, 1.0)

    # Gaïndé se réveille, gratte le sol, charge ; Kéba saute par-dessus ; le mouton percute le poteau
    t_g = t_eclabousse + 1.4
    p.humeur(t_g, "suspense")
    p.son(t_g, "bee", 0.9)
    p.cadrer(t_g, x_mouton - 260, sol - 560, 1.15)
    for k in range(3):
        p.son(t_g + 0.9 + 0.3 * k, "toc", 0.6)
        p.particules.bouffee(t_g + 0.9 + 0.3 * k, (x_mouton - 40, sol), nombre=6, vitesse=160, gravite=-40)
    p.geste("gainde", "tete", t_g + 0.8, 0.5, 0.3)
    t_charge = t_g + 2.0
    p.humeur(t_charge, "poursuite")
    p.coup(t_charge)
    p.cadrer(t_charge, (x_poteau + x_mouton) / 2, sol - 620, 0.95)
    p.aller("keba", t_charge - 0.8, x_poteau + 220, vitesse=420)
    t_impact = p.aller("gainde", t_charge, x_poteau + 60, vitesse=900, courbe="entree")
    p.son(t_charge, "whoosh", 0.9)
    p.sauter("keba", t_impact - 0.55, hauteur=230, duree=0.7)
    p.expression("keba", t_impact - 0.6, "peur")
    p.son(t_impact, "fracas", 1.0)
    p.camera.secouer(t_impact, 30.0)
    p.regle("gainde", "ecrase", t_impact, 0.7, 0.06, "sortie")
    p.regle("gainde", "ecrase", t_impact + 0.06, 1.0, 0.5, "elastique")
    p.aller("gainde", t_impact + 0.05, x_poteau + 160, vitesse=500)
    m.avancer_jusqua(t_impact + 0.25)
    m.liberer("tole")
    m.impulsion("tole", (0.0, 200.0))
    m.avancer_jusqua(t_impact + 2.0)
    t_tole = next((c.t for c in m.chocs if "tole" in (c.a, c.b) and c.t > t_impact), t_impact + 0.6)
    p.coup(t_tole)
    p.regle("bara", "ecrase", t_tole, 0.55, 0.08, "sortie")
    p.regle("bara", "ecrase", t_tole + 0.9, 1.0, 0.6, "elastique")
    p.expression("bara", t_tole, "douleur")
    p.son(t_tole + 0.3, "etoiles", 0.7)
    p.particules.bouffee(t_tole + 0.2, (xb, sol - TAILLES["bara"] * 0.9), nombre=5, couleur="#FFD54A",
                         vitesse=90, duree=1.6, gravite=0, rayon=(12, 18), forme="etoile")
    p.expression("gainde", t_impact, "douleur")
    p.cadrer(t_tole, xb + 200, sol - 640, 0.9)

    # Silence : tous se tournent vers Kéba, qui sourit, gêné
    t_s = t_tole + 2.2
    p.humeur(t_s, "silence")
    x_keba = p.acteurs["keba"].pistes.valeur("x", t_s)
    for k, nom in enumerate(("bara", "coumba", "gainde")):
        tt = t_s + 0.35 * k
        sens = 1.0 if x_keba > p.acteurs[nom].pistes.valeur("x", tt) else -1.0
        p.geste(nom, "sens_force", tt, sens, 0.01, "maintien")
        p.expression(nom, tt, "fureur")
    p.cadrer(t_s, x_keba, sol - 560, 1.6)
    p.expression("keba", t_s + 1.0, "gene")
    p.geste("keba", "bras_av", t_s + 1.4, -2.0, 0.3, "depasse")
    p.son(t_s + 1.4, "kling", 0.4)

    # Poursuite
    t_p = t_s + 2.6
    p.humeur(t_p, "poursuite")
    p.geste("keba", "bras_av", t_p, 0.0, 0.2)
    p.geste("keba", "sens_force", t_p, 0.0, 0.01, "maintien")
    for nom in ("bara", "coumba", "gainde"):
        p.geste(nom, "sens_force", t_p + 0.3, 0.0, 0.01, "maintien")
    p.regle("coumba", "penche", t_p, 0.0, 0.3)
    p.geste("coumba", "cuisse_av", t_p, 0.0, 0.3)
    p.geste("coumba", "cuisse_ar", t_p, 0.0, 0.3)
    p.geste("coumba", "bras_av", t_p, 0.0, 0.3)
    p.geste("coumba", "bras_ar", t_p, 0.0, 0.3)
    loin = lieu["largeur_monde"] + 500
    p.courir("keba", t_p, loin, vitesse=700)
    p.expression("keba", t_p, "peur")
    for k, nom in enumerate(("gainde", "bara", "coumba")):
        p.courir(nom, t_p + 0.5 + 0.35 * k, loin, vitesse=640)
    p.cadrer(t_p, lieu["largeur_monde"] * 0.6, sol - 640, 0.9)
    # ils repassent de gauche à droite (ils ont fait le tour du pâté de maisons)
    t_r = t_p + 4.2
    for nom in ("keba", "gainde", "bara", "coumba"):
        a = p.acteurs[nom].pistes
        a.cle("x", t_r, -500.0, "maintien")
    p.courir("keba", t_r + 0.1, loin, vitesse=700)
    for k, nom in enumerate(("gainde", "bara", "coumba")):
        p.courir(nom, t_r + 0.5 + 0.35 * k, loin, vitesse=640)
    p.cadrer(t_r, lieu["largeur_monde"] * 0.5, sol - 640, 0.9)

    # Gag final : rue vide, Gaïndé revient, mange la claquette, regarde la caméra
    t_f = t_r + 3.6
    p.humeur(t_f, "malice")
    x_cl, _, _ = m.etat("claquette", t_f)
    p.acteurs["gainde"].pistes.cle("x", t_f, loin, "maintien")
    t_g2 = p.aller("gainde", t_f + 0.4, x_cl + 90, vitesse=330)
    p.cadrer(t_f + 0.4, x_cl, sol - 520, 1.3)
    p.geste("gainde", "tete", t_g2, 0.55, 0.3)
    p.son(t_g2 + 0.35, "bonk", 0.4)
    p.son(t_g2 + 0.7, "bonk", 0.35)
    t_mange = t_g2 + 0.45
    p.geste("gainde", "tete", t_g2 + 1.1, 0.0, 0.3)
    p.son(t_g2 + 1.4, "bee", 0.8)
    p.cadrer(t_g2 + 1.3, x_cl + 60, sol - 420, 1.9, "depasse")
    p.duree = min(DUREE, t_g2 + 2.4)
    m.avancer_jusqua(p.duree + 0.5)
    p.sons_des_chocs()
    return {"t_mange": t_mange, "t_prend": t_prend, "t_pose": t_pose, "t_lance": t_glisse + 0.1,
            "apparitions": dict(m.apparitions), "boites": boites}


def visible(info: dict, nom: str):
    debut = info["apparitions"].get(nom, 0.0)
    if nom == "claquette":
        return lambda t: debut <= t < info["t_mange"]
    return lambda t: t >= debut


def objets_portes(info: dict, acteurs: dict) -> list[dict]:
    """La boîte passe de la main de Bara à celle de Kéba ; la bassine reste sur la tête de Coumba jusqu'à la glissade."""
    def boite(t):
        if t < info["t_prend"]:
            x, y = acteurs["bara"].point(t, "main_av")
        elif t < info["t_pose"]:
            x, y = acteurs["keba"].point(t, "main_av")
        else:
            return None
        return (x, y - 22.0, 0.0)

    def bassine(t):
        if t >= info["t_lance"]:
            return None
        x, y = acteurs["coumba"].point(t, "tete")
        return (x, y - 30.0, 0.0)

    return [{"image": "boite", "taille": (52, 62), "position": boite, "ordre": 13},
            {"image": "bassine", "taille": (150, 100), "position": bassine, "ordre": 12}]
