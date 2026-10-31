"""Le rendu : une scène est dessinée image par image, en parallèle sur tous les cœurs, puis encodée par ffmpeg.

Mesure de départ (31/10/2026, 1 cœur) : 76 ms par image 1080×1920 dessinée + encodée. Chaque processus rend une
tranche continue d'images et l'encode avec les mêmes réglages ; les tranches sont ensuite assemblées SANS ré-encodage
(démultiplexeur « concat » de ffmpeg). Les processus naissent par fork APRÈS la construction de la scène : ils
héritent de tout (images, maillages, trajectoires simulées) sans rien recalculer.
Greffes : skia-python (BSD) pour le dessin, ffmpeg (outil externe) pour l'encodage H.264.
"""
import multiprocessing as mp
import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import skia

from .dessin import teinte


@dataclass
class Scene:
    largeur: int
    hauteur: int
    camera: object
    fond: str = "#000000"
    elements: list = field(default_factory=list)       # objets ayant .ordre et .dessiner(canvas, t)
    ecran: list = field(default_factory=list)          # éléments dessinés après la caméra (titres, vignettage)

    def dessiner(self, canvas, t: float):
        canvas.clear(teinte(self.fond))
        for e in sorted(self.elements, key=lambda e: e.ordre):
            canvas.save()
            canvas.concat(self.camera.matrice(t, getattr(e, "parallaxe", 1.0)))
            e.dessiner(canvas, t)
            canvas.restore()
        for e in self.ecran:
            e.dessiner(canvas, t)


def _ffmpeg(largeur, hauteur, fps, chemin):
    return subprocess.Popen(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", f"{largeur}x{hauteur}",
         "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
         "-g", str(fps * 2), "-threads", "2", "-movflags", "+faststart", str(chemin)],
        stdin=subprocess.PIPE)


_SCENE = None


def _tranche(args):
    debut, fin, fps, chemin = args
    s = _SCENE
    surface = skia.Surface(s.largeur, s.hauteur)
    canvas = surface.getCanvas()
    ff = _ffmpeg(s.largeur, s.hauteur, fps, chemin)
    for i in range(debut, fin):
        s.dessiner(canvas, i / fps)
        ff.stdin.write(surface.makeImageSnapshot().tobytes())
    ff.stdin.close()
    if ff.wait() != 0:
        raise RuntimeError(f"ffmpeg a échoué sur la tranche {debut}-{fin}")
    return chemin


def rendre_video(fabrique_scene, duree: float, fps: int, sortie, parts: int | None = None, progression=None):
    """Rend `duree` secondes à `fps` images/s dans `sortie` (MP4 H.264 sans son)."""
    global _SCENE
    _SCENE = fabrique_scene()
    total = int(round(duree * fps))
    parts = max(1, min(parts or os.cpu_count() or 1, total))
    bornes = [round(total * k / parts) for k in range(parts + 1)]
    sortie = Path(sortie)
    with tempfile.TemporaryDirectory(dir=sortie.parent) as tmp:
        morceaux = [(bornes[k], bornes[k + 1], fps, os.path.join(tmp, f"t{k:03d}.mp4")) for k in range(parts)]
        if parts == 1:
            _tranche(morceaux[0])
        else:
            with mp.get_context("fork").Pool(parts) as pool:
                for _ in pool.imap_unordered(_tranche, morceaux):
                    if progression:
                        progression()
        liste = os.path.join(tmp, "liste.txt")
        Path(liste).write_text("".join(f"file '{m[3]}'\n" for m in morceaux))
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", liste,
                        "-c", "copy", "-movflags", "+faststart", str(sortie)], check=True)
    return sortie
