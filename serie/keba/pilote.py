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
DUREE = 58.0

# Hauteur à l'écran (px, image 1080×1920 à zoom 1) de chaque personnage
TAILLES = {"keba": 400.0, "bara": 560.0, "coumba": 700.0, "gainde": 330.0}

# Géométrie du décor « rue-boutique », en fractions de l'image (réglée en regardant le décor)
# (mesurée le 31/10/2026 sur rue-boutique 768×1344 : comptoir en y = 805, poteau en x = 258, porte en x = 578)
LIEU = {"largeur_monde": 1460.0, "sol": 0.714, "comptoir": (0.182, 0.599, 0.26), "poteau": 0.336,
        "auvent": (0.03, 0.487, 0.33), "porte_coumba": 0.753, "mouton": 0.885}


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
    bw, bh = 90.0, 110.0
    boites = []
    for rang, n in enumerate((3, 2)):
        for k in range(n):
            nom = f"boite{rang}{k}"
            x = xc + (k - (n - 1) / 2) * (bw + 3)
            m.ajouter(nom, forme="boite", taille=(bw, bh), masse=0.9, position=(x, yc - bh / 2 - rang * (bh + 1)),
                      friction=0.85, elasticite=0.2, fige=True)   # figée jusqu'à la chute décidée par le scénario
            boites.append(nom)
    for k in range(5):
        m.ajouter(f"orange{k}", forme="rond", taille=17, masse=0.25,
                  position=(xc + wc / 2 + 30 + (k % 3) * 34, sol - 17 - (k // 3) * 33), elasticite=0.45)
    ax, ay, aw = lieu["auvent"]
    m.ajouter("tole", forme="boite", taille=(aw, 22), masse=7.0, position=(ax + aw / 2, ay), fige=True)

    # --- distribution --------------------------------------------------------------------------------------------
    p.acteur("bara", jambe=150.0, x=xc + wc * 0.62)
    p.acteur("keba", jambe=105.0, x=-260.0)
    p.acteur("coumba", jambe=230.0, x=x_porte + 520.0)
    p.acteur("gainde", jambe=110.0, x=x_mouton)

    # 0-4 s : Bara sur la pointe des pieds, la boîte au bout du bras ; Kéba accourt
    p.humeur(0.0, "malice")
    p.cadrer(0.0, xc + 140, sol - 560, 1.45)
    p.expression("bara", 0.0, "determine")
    for k, t in enumerate((0.3, 1.1, 1.9, 2.7, 3.5, 4.3)):
        p.geste("bara", "bras_av", t, -2.6, 0.35, "anticipe_depasse")
        p.sauter("bara", t + 0.05, hauteur=28, duree=0.4)
        p.geste("bara", "bras_av", t + 0.6, -2.2, 0.2)
    p.expression("bara", 2.6, "colere")
    t_arrivee = p.courir("keba", 3.8, xc - 40)
    p.cadrer(4.2, xc + 100, sol - 600, 1.25)
    p.expression("keba", 4.2, "joie")
    p.humeur(4.4, "calme")

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
    sommet_y = yc - 2 * (bh + 1) - bh / 2
    m.avancer_jusqua(t_pose)
    # posée sur la rangée du dessous TELLE QU'ELLE EST (les boîtes se sont tassées de quelques pixels), avec 3 px de
    # marge : sinon la physique écarte violemment deux boîtes qui s'interpénètrent et la pyramide s'écroule trop tôt
    haut_rangee = min(m.etat(n, t_pose)[1] for n in boites if n.startswith("boite1")) - bh / 2
    sommet_y = haut_rangee - bh / 2 - 1.0
    m.ajouter("boite_haut", forme="boite", taille=(bw, bh), masse=0.9, position=(xc, sommet_y), friction=0.85,
              elasticite=0.2, fige=True)
    boites.append("boite_haut")
    p.son(t_pose, "tink", 0.4)
    p.aller("keba", fin_saut, xc + 40, vitesse=300)
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
    p.cadrer(t_claque + 0.2, xc + 20, yc - 160, 1.6)

    # la claquette touche la pyramide : SILENCE… elle tient… puis tout s'écroule
    m.avancer_jusqua(t_claque + 1.0)
    impact = next((c.t for c in m.chocs if "claquette" in (c.a, c.b) and any(n.startswith("boite") for n in (c.a, c.b))),
                  t_claque + duree_vol)
    p.humeur(impact, "silence")
    p.expression("bara", impact + 0.1, "peur")
    p.geste("bara", "tete", impact + 0.1, -0.15, 0.4)
    # Bara s'approche sur la pointe des pieds, bras écartés pour « retenir » la pyramide
    x_bara0 = p.acteurs["bara"].pistes.valeur("x", impact)
    p.aller("bara", impact + 0.5, x_bara0 - 70, vitesse=60)
    p.geste("bara", "bras_av", impact + 0.5, -1.4, 0.5)
    p.geste("bara", "bras_ar", impact + 0.5, 1.4, 0.5)
    t_soulage = impact + 3.0
    p.expression("bara", t_soulage, "soulagement")
    p.geste("bara", "bras_av", t_soulage, 0.0, 0.4)
    p.geste("bara", "bras_ar", t_soulage, 0.0, 0.4)
    p.son(t_soulage, "glissade", 0.0)
    t_chute = t_soulage + 1.2
    m.avancer_jusqua(t_chute)
    for nom in boites:
        m.liberer(nom)
    m.impulsion("boite00", (-160.0, -60.0))
    m.impulsion("boite02", (160.0, -60.0))
    m.impulsion("boite01", (40.0, -40.0))
    for i, nom in enumerate(boites):
        if nom.startswith("boite1") or nom == "boite_haut":
            m.impulsion(nom, ((-1) ** i * 90.0, -50.0))
    p.coup(t_chute)
    p.humeur(t_chute, "chaos")
    p.expression("bara", t_chute + 0.15, "choc")
    p.cadrer(t_chute + 0.3, xc + 120, sol - 580, 1.2)
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
    t_sortie = p.aller("coumba", t_c, x_porte, vitesse=260)
    p.geste("coumba", "bras_av", t_sortie, -2.5, 0.35)          # elle ajuste son foulard, très digne
    p.geste("coumba", "bras_av", t_sortie + 1.4, 0.0, 0.35)
    x_glisse = xc + wc * 0.9 + 190
    t_glisse = p.aller("coumba", t_sortie + 1.8, x_glisse, vitesse=190)
    p.cadrer(t_c, (xc + x_porte) / 2 + 80, sol - 620, 1.05)
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
    t_debout = t_assise + 1.4                                   # elle se relève, furieuse
    p.regle("coumba", "penche", t_debout, 0.0, 0.45, "anticipe_depasse")
    for os_ in ("cuisse_av", "cuisse_ar", "bras_av", "bras_ar"):
        p.geste("coumba", os_, t_debout, 0.0, 0.4)
    p.son(t_debout, "pouf", 0.4)
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
    p.cadrer(t_eclabousse - 0.3, xb + 150, sol - 600, 1.15)

    # Gaïndé se réveille, gratte le sol, charge ; Kéba saute par-dessus ; le mouton percute le poteau
    t_g = t_eclabousse + 1.4
    p.humeur(t_g, "suspense")
    p.son(t_g, "bee", 0.9)
    p.cadrer(t_g, x_mouton - 240, sol - 520, 1.3)
    for k in range(3):
        p.son(t_g + 0.9 + 0.3 * k, "toc", 0.6)
        p.particules.bouffee(t_g + 0.9 + 0.3 * k, (x_mouton - 40, sol), nombre=6, vitesse=160, gravite=-40)
    p.geste("gainde", "tete", t_g + 0.8, 0.5, 0.3)
    t_charge = t_g + 2.0
    p.humeur(t_charge, "poursuite")
    p.coup(t_charge)
    p.cadrer(t_charge, (x_poteau + x_mouton) / 2, sol - 600, 1.05)
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
    m.avancer_jusqua(t_tole + 0.45)
    m.impulsion("tole", (2600.0, -400.0))                      # elle glisse de la tête de Bara jusqu'au sol
    p.coup(t_tole)
    p.regle("bara", "ecrase", t_tole, 0.55, 0.08, "sortie")
    p.regle("bara", "ecrase", t_tole + 0.9, 1.0, 0.6, "elastique")
    p.expression("bara", t_tole, "douleur")
    p.son(t_tole + 0.3, "etoiles", 0.7)
    p.particules.bouffee(t_tole + 0.2, (xb, sol - TAILLES["bara"] * 0.9), nombre=5, couleur="#FFD54A",
                         vitesse=90, duree=1.6, gravite=0, rayon=(12, 18), forme="etoile")
    p.expression("gainde", t_impact, "douleur")
    p.cadrer(t_tole, xb + 200, sol - 600, 1.1)

    # Silence : tous se tournent vers Kéba, qui sourit, gêné
    t_s = t_tole + 2.2
    p.humeur(t_s, "silence")
    x_keba = p.acteurs["keba"].pistes.valeur("x", t_s)
    for k, nom in enumerate(("bara", "coumba", "gainde")):
        tt = t_s + 0.35 * k
        sens = 1.0 if x_keba > p.acteurs[nom].pistes.valeur("x", tt) else -1.0
        p.geste(nom, "sens_force", tt, sens, 0.01, "maintien")
        p.expression(nom, tt, "fureur")
    p.cadrer(t_s, x_keba, sol - 520, 1.7)
    p.expression("keba", t_s + 1.0, "gene")
    p.geste("keba", "bras_av", t_s + 1.4, -2.0, 0.3, "depasse")
    p.son(t_s + 1.4, "kling", 0.4)

    # Poursuite
    t_p = t_s + 4.0
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
    p.cadrer(t_p, lieu["largeur_monde"] * 0.6, sol - 600, 1.0)
    # ils repassent de gauche à droite (ils ont fait le tour du pâté de maisons)
    t_r = t_p + 5.2
    for nom in ("keba", "gainde", "bara", "coumba"):
        a = p.acteurs[nom].pistes
        a.cle("x", t_r, -500.0, "maintien")
    # Kéba s'arrête au milieu de la rue ; Bara et Coumba passent sans le voir ; il s'essuie le front…
    x_milieu = lieu["largeur_monde"] * 0.55
    t_stop = p.courir("keba", t_r + 0.1, x_milieu, vitesse=700)
    for k, nom in enumerate(("bara", "coumba")):
        p.courir(nom, t_r + 0.9 + 0.35 * k, loin, vitesse=640)
    p.cadrer(t_r, x_milieu, sol - 560, 1.15)
    p.expression("keba", t_stop + 0.3, "soulagement")
    p.geste("keba", "bras_av", t_stop + 0.5, -2.7, 0.3)            # il s'essuie le front
    p.geste("keba", "avbras_av", t_stop + 0.5, -0.9, 0.3)
    p.geste("keba", "bras_av", t_stop + 1.4, 0.0, 0.3)
    p.geste("keba", "avbras_av", t_stop + 1.4, 0.0, 0.3)
    p.humeur(t_stop, "silence")
    # … et se retourne : Gaïndé est juste derrière lui et le fixe
    p.aller("gainde", t_r + 0.6, x_milieu + 170, vitesse=520)
    p.geste("gainde", "sens_force", t_stop, -1.0, 0.01, "maintien")
    t_tourne = t_stop + 2.0
    p.geste("keba", "sens_force", t_tourne, 1.0, 0.01, "maintien")
    p.expression("keba", t_tourne + 0.15, "choc")
    p.cadrer(t_tourne, x_milieu + 80, sol - 480, 1.6, "depasse")
    p.son(t_tourne + 0.15, "bee", 1.0)
    p.coup(t_tourne + 0.15)
    p.expression("gainde", t_tourne, "colere")
    t_fuite = t_tourne + 1.1
    p.humeur(t_fuite, "poursuite")
    p.geste("keba", "sens_force", t_fuite, 0.0, 0.01, "maintien")
    p.geste("gainde", "sens_force", t_fuite + 0.2, 0.0, 0.01, "maintien")
    p.expression("keba", t_fuite, "peur")
    p.courir("keba", t_fuite, -500.0, vitesse=760)
    p.courir("gainde", t_fuite + 0.35, -500.0, vitesse=700)
    p.cadrer(t_fuite, x_milieu - 150, sol - 600, 1.05)

    # Gag final : rue vide, Gaïndé revient, mange la claquette, regarde la caméra
    t_f = t_fuite + 2.2
    p.humeur(t_f, "malice")
    x_cl, _, _ = m.etat("claquette", t_f)
    p.acteurs["gainde"].pistes.cle("x", t_f, -500.0, "maintien")
    t_g2 = p.aller("gainde", t_f + 0.4, x_cl + 90, vitesse=210)
    p.cadrer(t_f + 0.4, x_cl, sol - 520, 1.3)
    for k in range(2):                                          # il renifle la claquette
        p.geste("gainde", "tete", t_g2 - 0.2 + 0.7 * k, 0.45, 0.25)
        p.geste("gainde", "tete", t_g2 + 0.15 + 0.7 * k, 0.15, 0.25)
    t_g2 += 1.4
    p.geste("gainde", "tete", t_g2, 0.55, 0.3)
    p.son(t_g2 + 0.35, "bonk", 0.4)
    p.son(t_g2 + 0.7, "bonk", 0.35)
    t_mange = t_g2 + 0.45
    p.geste("gainde", "tete", t_g2 + 1.1, 0.0, 0.3)
    p.son(t_g2 + 1.4, "bee", 0.8)
    p.cadrer(t_g2 + 1.3, x_cl + 60, sol - 420, 1.9, "depasse")
    p.son(t_g2 + 2.6, "bee", 0.6)
    p.geste("gainde", "sens_force", t_g2 + 2.0, -1.0, 0.01, "maintien")      # il se tourne vers la caméra
    p.duree = min(DUREE + 6.0, t_g2 + 7.0)
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

    return [{"image": "boite", "taille": (98, 120), "position": boite, "ordre": 13},
            {"image": "bassine", "taille": (150, 100), "position": bassine, "ordre": 12}]
