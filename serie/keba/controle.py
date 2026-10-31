"""Contrôles automatiques d'un épisode : un épisode qui échoue n'est pas publié, le rapport dit pourquoi.

- format : largeur, hauteur, images par seconde, durée ;
- son : piste audio présente et audible (niveau moyen mesuré par ffmpeg volumedetect) ;
- fluidité : aucune image figée plus d'une demi-seconde (filtre freezedetect de ffmpeg).
"""
import json
import re
import subprocess
from fractions import Fraction


def _sonde(chemin):
    sortie = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(chemin)],
                            capture_output=True, text=True, check=True).stdout
    return json.loads(sortie)


def controler(chemin, largeur: int = 1080, hauteur: int = 1920, fps: int = 60, duree=(30.0, 65.0),
              fige_max: float = 0.5, niveau_min_db: float = -40.0) -> dict:
    info = _sonde(chemin)
    video = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    audio = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    problemes = []
    mesures = {}
    if video is None:
        return {"ok": False, "problemes": ["pas de piste vidéo"], "mesures": {}}
    w, h = video["width"], video["height"]
    f = float(Fraction(video["r_frame_rate"]))
    d = float(info["format"]["duration"])
    mesures.update(largeur=w, hauteur=h, fps=f, duree=round(d, 2))
    if (w, h) != (largeur, hauteur) or abs(f - fps) > 0.01:
        problemes.append(f"format {w}×{h} à {f:g} i/s au lieu de {largeur}×{hauteur} à {fps} i/s")
    if not duree[0] <= d <= duree[1]:
        problemes.append(f"durée {d:.1f} s hors de [{duree[0]}, {duree[1]}]")
    if audio is None:
        problemes.append("pas de son")
    else:
        r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(chemin), "-map", "0:a", "-af", "volumedetect",
                            "-f", "null", "-"], capture_output=True, text=True)
        m = re.search(r"mean_volume: (-?[\d.]+) dB", r.stderr)
        niveau = float(m.group(1)) if m else -99.0
        mesures["son_moyen_db"] = niveau
        if niveau < niveau_min_db:
            problemes.append(f"son trop faible ({niveau:.1f} dB)")
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(chemin), "-map", "0:v", "-vf",
                        f"freezedetect=n=0.0005:d={fige_max}", "-f", "null", "-"], capture_output=True, text=True)
    figees = re.findall(r"freeze_start: ([\d.]+)", r.stderr)
    mesures["images_figees"] = [float(x) for x in figees]
    if figees:
        problemes.append(f"image figée à {', '.join(figees)} s")
    return {"ok": not problemes, "problemes": problemes, "mesures": mesures}
