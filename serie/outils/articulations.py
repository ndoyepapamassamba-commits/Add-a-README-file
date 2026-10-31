"""Articulations d'une planche de personnage → JSON dans la bible :
    python3 serie/outils/articulations.py PLANCHE.png MODELE.task [SORTIE.json]

MediaPipe Pose Landmarker heavy (Apache-2.0), fiable sur nos dessins (visibilité 0,92 à 1,00 sur Kéba, 31/10/2026).
Côté droit de la personne (à gauche de l'image) = côté « av » (près de nous) ; le personnage regarde vers la droite.
Le résultat est rangé à côté de la planche : le rendu des épisodes n'a jamais besoin de MediaPipe.
"""
import json
import sys
from pathlib import Path

import numpy as np

POINTS = {0: "nez", 12: "epaule_av", 14: "coude_av", 16: "poignet_av", 11: "epaule_ar", 13: "coude_ar",
          15: "poignet_ar", 24: "hanche_av", 26: "genou_av", 28: "cheville_av", 32: "orteil_av",
          23: "hanche_ar", 25: "genou_ar", 27: "cheville_ar", 31: "orteil_ar"}


def detecter(chemin_png: Path, modele: Path) -> dict:
    import mediapipe as mp
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision
    from PIL import Image
    rgb = np.ascontiguousarray(np.asarray(Image.open(chemin_png).convert("RGB")))
    h, w = rgb.shape[:2]
    opts = vision.PoseLandmarkerOptions(base_options=mpt.BaseOptions(model_asset_path=str(modele)), num_poses=1)
    with vision.PoseLandmarker.create_from_options(opts) as det:
        r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if not r.pose_landmarks:
        raise RuntimeError(f"aucune pose détectée dans {chemin_png}")
    lm = r.pose_landmarks[0]
    art = {nom: (round(lm[i].x * w, 1), round(lm[i].y * h, 1)) for i, nom in POINTS.items()}
    art["_visibilite_min"] = round(min(lm[i].visibility for i in POINTS), 3)
    return art


if __name__ == "__main__":
    planche, modele = Path(sys.argv[1]), Path(sys.argv[2])
    sortie = Path(sys.argv[3]) if len(sys.argv) > 3 else planche.with_name(planche.stem + "-articulations.json")
    art = detecter(planche, modele)
    sortie.write_text(json.dumps(art, ensure_ascii=False, indent=1), encoding="utf-8")
    print(sortie, "visibilité min", art["_visibilite_min"])
