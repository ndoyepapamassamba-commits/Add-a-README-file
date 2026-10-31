"""Fabrication d'un épisode, de la chorégraphie au MP4 avec son, plus la fiche TikTok.

    python3 -m keba.episode --sortie sorties/ep0001 [--apercu] [--graine 1]     (depuis serie/)

--apercu : 540×960 à 30 i/s (pour itérer vite) ; sinon 1080×1920 à 60 i/s (publication).
"""
import argparse
import json
import math
import os
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np

from . import pilote, son
from .elements import (ElementActeur, ElementDecor, ElementObjet, ElementPorte, charger_image, image_rgba)
from .pantin import Pantin, articulations_quadrupede, pose_de_repos
from .controle import controler
from .rendu import Scene, rendre_video

FICHE_TIKTOK = """KÉBA — La pyramide de Tonton Bara 🥫🐏

Kéba voulait juste aider… 😅 Qui a déjà vécu ça dans son quartier ? 👇

#keba #dessinanime #drole #comedy #humourafricain #dakar #senegal #pourtoi #fyp
"""

BIBLE_PNG = Path(__file__).resolve().parents[1] / "bible" / "png"
MODELES = {"keba": "humain", "bara": "humain", "coumba": "robe", "gainde": "quadrupede"}
ORDRES = {"gainde": 8, "bara": 10, "coumba": 11, "keba": 12}
PAS_SONORES = {"keba": ("clac", 0.32), "coumba": ("toc", 0.38), "bara": ("pouf", 0.22), "gainde": ("toc", 0.3)}
IMAGES_OBJETS = {"boite": "boite-tomate", "orange": "orange", "claquette": "claquette", "bassine": "bassine",
                 "tole": "auvent"}


def _rgba(chemin):
    from PIL import Image
    return np.asarray(Image.open(chemin).convert("RGBA"))


def charger_personnage(ident: str):
    d = BIBLE_PNG / ident
    planche = d / "planche.png"
    if not planche.exists():                         # planche pas encore livrée par l'atelier : image de travail
        planche = BIBLE_PNG / "keba" / "essai1.png"
        art = json.loads((BIBLE_PNG / "keba" / "essai1-articulations.json").read_text())
        from .detourage import detourer
        rgba, modele = detourer(_rgba(planche)[:, :, :3]), "humain"
    else:
        rgba, modele = _rgba(planche), MODELES[ident]
        f_art = d / "planche-articulations.json"
        art = articulations_quadrupede(rgba) if modele == "quadrupede" else json.loads(f_art.read_text())
    pantin = Pantin.depuis_image(rgba, art, pas=9, modele=modele)
    pantin.repos = pose_de_repos(art) if modele != "quadrupede" else {}
    textures = {f.stem[len("expr-"):]: pantin.texture(_rgba(f)) for f in sorted(d.glob("expr-*.png"))
                if not f.stem.endswith("-brut")}
    return pantin, textures, modele


def _traduction_quadrupede(a):
    return {"corps": 0.5 * a["torse"], "tete": a["tete"],
            "patte_av_pres": a["cuisse_av"], "patte_ar_loin": a["cuisse_av"],
            "patte_av_loin": a["cuisse_ar"], "patte_ar_pres": a["cuisse_ar"]}


def pas_sonores(plateau, nom, son_nom, volume):
    a = plateau.acteurs[nom]
    precedent = None
    for i in range(int(plateau.duree * 120)):
        t = i / 120
        p = a.pose(t)
        k = math.floor(p["phase"] / math.pi)
        if precedent is not None and k != precedent and p["foulee"] > 0.25 and p["placement"]["saut"] < 5:
            plateau.son(t, son_nom, volume * (0.7 + 0.3 * p["foulee"]))
        precedent = k


def construire(graine: int = 1):
    decor = charger_image(BIBLE_PNG / "decors" / "rue-boutique.png") if (BIBLE_PNG / "decors" / "rue-boutique.png").exists() else None
    lw = pilote.LIEU["largeur_monde"]
    dw, dh = (decor.width(), decor.height()) if decor else (768, 1344)
    E = lw / dw
    L = pilote.LIEU
    lieu = {"largeur_monde": lw, "comptoir": (L["comptoir"][0] * lw, L["comptoir"][1] * dh * E, L["comptoir"][2] * lw),
            "poteau": L["poteau"] * lw, "auvent": (L["auvent"][0] * lw, L["auvent"][1] * dh * E, L["auvent"][2] * lw),
            "porte_coumba": L["porte_coumba"] * lw, "mouton": L["mouton"] * lw}
    plateau = pilote.Plateau(pilote.DUREE, sol_y=L["sol"] * dh * E, graine=graine)
    info = pilote.ecrire(plateau, lieu)
    plateau.preparer()
    for nom, (s, v) in PAS_SONORES.items():
        pas_sonores(plateau, nom, s, v)

    elements = []
    if decor:
        elements.append(ElementDecor(decor, 0.0, 0.0, E, ordre=0))
    acteurs = {}
    for nom in ("keba", "bara", "coumba", "gainde"):
        pantin, textures, modele = charger_personnage(nom)
        echelle = pilote.TAILLES[nom] / pantin.hauteur
        e = ElementActeur(plateau.acteurs[nom], pantin, echelle, ordre=ORDRES[nom], textures=textures,
                          traduction=_traduction_quadrupede if modele == "quadrupede" else None, repos=pantin.repos)
        if nom == "coumba":
            plateau.acteurs[nom].amplitude_jambes = 0.3
        acteurs[nom] = e
        elements.append(e)
    images = {k: charger_image(BIBLE_PNG / "objets" / f"{v}.png") for k, v in IMAGES_OBJETS.items()}
    m = plateau.monde
    tailles = {"boite": (52, 62), "orange": 40, "claquette": (66, 34), "bassine": (150, 100), "tole": None}
    for nom in m.corps:
        famille = next((f for f in IMAGES_OBJETS if nom.startswith(f)), None)
        if famille is None:
            continue
        taille = tailles[famille] or (lieu["auvent"][2] * 1.04, 70)
        elements.append(ElementObjet(m, nom, images[famille], taille, ordre=20 if famille != "tole" else 9,
                                     visible=pilote.visible(info, nom)))
    for porte in pilote.objets_portes(info, acteurs):
        elements.append(ElementPorte(images[porte["image"]], porte["taille"], porte["position"], ordre=porte["ordre"]))
    elements.append(plateau.particules)
    return plateau, elements


def fabriquer(sortie: Path, apercu: bool = False, graine: int = 1, parts: int | None = None):
    sortie = Path(sortie)
    sortie.mkdir(parents=True, exist_ok=True)
    debut = time.time()
    plateau, elements = construire(graine)
    duree = plateau.duree
    fps, echelle = (30, 0.5) if apercu else (60, 1.0)
    scene = Scene(int(1080 * echelle), int(1920 * echelle), plateau.camera, fond="#F6E7C8", elements=elements,
                  echelle_sortie=echelle)
    with tempfile.TemporaryDirectory(dir=sortie) as tmp:
        tmp = Path(tmp)
        notes = son.composer(plateau.sections(), plateau.coups, graine=graine)
        musique = son.lire_wav(son.jouer(notes, duree, tmp / "musique.wav"))
        son.ecrire_wav(son.mixer(duree, plateau.sons, musique, graine=graine), tmp / "son.wav")
        rendre_video(lambda: scene, duree, fps, tmp / "image.mp4", parts=parts)
        nom = sortie / f"{sortie.name}{'-apercu' if apercu else ''}.mp4"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(tmp / "image.mp4"), "-i", str(tmp / "son.wav"),
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
                        str(nom)], check=True)
    controle = controler(nom, largeur=scene.largeur, hauteur=scene.hauteur, fps=fps, duree=(30.0, 65.0))
    (sortie / "fiche-tiktok.txt").write_text(FICHE_TIKTOK, encoding="utf-8")
    rapport = {"fichier": nom.name, "duree": round(duree, 2), "fps": fps, "taille": [scene.largeur, scene.hauteur],
               "secondes_fabrication": round(time.time() - debut, 1), "sons": len(plateau.sons),
               "chocs": len(plateau.monde.chocs), "sections": plateau.sections(), "controle": controle}
    (sortie / "rapport.json").write_text(json.dumps(rapport, ensure_ascii=False, indent=1), encoding="utf-8")
    return nom, rapport


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--sortie", default="sorties/ep0001")
    a.add_argument("--apercu", action="store_true")
    a.add_argument("--graine", type=int, default=1)
    args = a.parse_args()
    print(fabriquer(Path(args.sortie), args.apercu, args.graine))
