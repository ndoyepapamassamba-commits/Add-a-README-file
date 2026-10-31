import json
import subprocess

import numpy as np
import skia

from keba.camera import Camera
from keba.rendu import Scene, rendre_video


class Balle:
    """Un élément de scène minimal : un disque qui traverse l'écran."""
    ordre = 1

    def dessiner(self, canvas, t):
        canvas.drawCircle(100 + 300 * t, 200, 40, skia.Paint(AntiAlias=True, Color=skia.Color(230, 120, 30)))


def _scene():
    cam = Camera(360, 640)
    cam.preparer(1.0)
    return Scene(largeur=360, hauteur=640, camera=cam, fond="#F2E3C6", elements=[Balle()])


def test_une_image_de_scene_montre_les_elements_au_bon_endroit():
    s = _scene()
    surface = skia.Surface(360, 640)
    s.dessiner(surface.getCanvas(), 0.5)
    px = surface.makeImageSnapshot().toarray()
    assert tuple(px[200, 250][:3]) != tuple(px[600, 10][:3])     # la balle à x = 250 à t = 0,5 s
    assert abs(int(px[600, 10][2]) - 0xF2) < 3                    # le fond (BGRA : rouge en dernier)


def test_rendu_video_parallele_donne_un_mp4_complet(tmp_path):
    sortie = tmp_path / "essai.mp4"
    rendre_video(_scene, duree=1.0, fps=30, sortie=sortie, parts=2)
    info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(sortie)],
                                     capture_output=True, text=True).stdout)
    v = info["streams"][0]
    assert (v["width"], v["height"]) == (360, 640)
    assert int(v["nb_frames"]) == 30
    assert v["r_frame_rate"] == "30/1"
