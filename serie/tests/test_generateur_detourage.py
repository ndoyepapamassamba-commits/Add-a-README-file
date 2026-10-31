import json

import numpy as np
import pytest
import skia

from keba import detourage
from keba.generateur import Generateur, MODELE


class FauxClient:
    """Remplace la démonstration Hugging Face : écrit une image blanche avec un disque orange."""

    def __init__(self, dossier):
        self.appels = []
        self.dossier = dossier

    def predict(self, prompt, refs, mode, graine, aleatoire, largeur, hauteur, etapes, guidage, enrichir, api_name):
        self.appels.append({"prompt": prompt, "refs": refs, "graine": graine, "taille": (largeur, hauteur)})
        s = skia.Surface(int(largeur), int(hauteur))
        c = s.getCanvas()
        c.clear(skia.ColorWHITE)
        c.drawCircle(largeur / 2, hauteur / 2, largeur / 4, skia.Paint(AntiAlias=True, Color=skia.Color(255, 140, 30)))
        chemin = self.dossier / f"faux{len(self.appels)}.png"
        s.makeImageSnapshot().save(str(chemin), skia.kPNG)
        return {"path": str(chemin)}, graine


@pytest.fixture
def gen(tmp_path):
    client = FauxClient(tmp_path)
    return Generateur(tmp_path / "cache", fabrique_client=lambda: client), client


def test_genere_une_image_et_note_sa_provenance(gen):
    g, client = gen
    chemin = g.generer("un gamin", largeur=256, hauteur=320, graine=7)
    assert chemin.exists() and chemin.suffix == ".png"
    prov = json.loads(chemin.with_suffix(".json").read_text())
    assert prov["modele"] == MODELE["nom"] and prov["licence"] == "Apache-2.0"
    assert prov["graine"] == 7 and prov["prompt"] == "un gamin"


def test_la_meme_demande_ne_rappelle_pas_le_service(gen):
    g, client = gen
    a = g.generer("un gamin", largeur=256, hauteur=320, graine=7)
    b = g.generer("un gamin", largeur=256, hauteur=320, graine=7)
    assert a == b and len(client.appels) == 1


def test_les_references_sont_transmises(gen, tmp_path):
    g, client = gen
    ref = g.generer("un gamin", largeur=256, hauteur=320, graine=7)
    g.generer("le même gamin en colère", refs=[ref], largeur=256, hauteur=320, graine=8)
    assert len(client.appels[-1]["refs"]) == 1


def test_reessaie_quand_le_service_echoue(tmp_path):
    client = FauxClient(tmp_path)
    echecs = {"n": 0}
    vrai = client.predict

    def capricieux(*a, **k):
        if echecs["n"] < 2:
            echecs["n"] += 1
            raise RuntimeError("file d'attente pleine")
        return vrai(*a, **k)

    client.predict = capricieux
    g = Generateur(tmp_path / "cache", fabrique_client=lambda: client, pause=0.0)
    assert g.generer("un gamin", largeur=256, hauteur=256, graine=1).exists()
    assert echecs["n"] == 2


def _image_test():
    s = skia.Surface(200, 200)
    c = s.getCanvas()
    c.clear(skia.ColorWHITE)
    contour = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=6, Color=skia.Color(40, 20, 10))
    c.drawCircle(100, 100, 60, skia.Paint(AntiAlias=True, Color=skia.Color(255, 140, 30)))
    c.drawCircle(100, 100, 20, skia.Paint(AntiAlias=True, Color=skia.ColorWHITE))   # blanc intérieur (œil)
    c.drawCircle(100, 100, 60, contour)
    c.drawCircle(100, 100, 20, contour)
    return s.makeImageSnapshot().toarray()


def test_detourage_rend_le_fond_transparent_mais_garde_les_blancs_interieurs():
    rgba = detourage.detourer(_image_test())
    assert rgba[5, 5, 3] == 0
    assert rgba[100, 100, 3] == 255          # le blanc de l'œil est entouré d'un contour : il reste
    assert rgba[100, 60, 3] == 255           # le corps orange reste opaque


def test_detourage_enleve_l_ombre_au_sol_et_le_blanc_entre_les_jambes():
    s = skia.Surface(200, 200)
    c = s.getCanvas()
    c.clear(skia.ColorWHITE)
    c.drawOval(skia.Rect(40, 170, 160, 190), skia.Paint(AntiAlias=True, Color=skia.Color(205, 205, 205)))
    jambe = skia.Paint(AntiAlias=True, Color=skia.Color(120, 70, 40))
    c.drawRect(skia.Rect(60, 80, 140, 110), jambe)          # le short relie les deux jambes en haut
    c.drawRect(skia.Rect(60, 110, 85, 180), jambe)
    c.drawRect(skia.Rect(115, 110, 140, 180), jambe)
    rgba = detourage.detourer(s.makeImageSnapshot().toarray())
    assert rgba[140, 100, 3] == 0          # entre les jambes
    assert rgba[186, 100, 3] == 0          # l'ombre grise
    assert rgba[140, 70, 3] == 255         # la jambe


def test_detourage_donne_des_bords_doux():
    rgba = detourage.detourer(_image_test())
    bord = rgba[100, 160:170, 3]
    assert bord.max() == 255 and bord.min() == 0
