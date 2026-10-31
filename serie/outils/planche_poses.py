# Planche de poses d'un pantin PNG (essai visuel) : PYTHONPATH=serie python3 serie/outils/planche_poses.py DOSSIER
import json, math, sys, time, skia
from keba.pantin import Pantin, pose_de_repos
E = sys.argv[1]
im = skia.Image.open(sys.argv[2] if len(sys.argv) > 2 else f"{E}/keba_detoure.png").convert(alphaType=skia.kUnpremul_AlphaType, colorType=skia.kRGBA_8888_ColorType)
art = json.load(open(sys.argv[3] if len(sys.argv) > 3 else f"{E}/keba_articulations.json"))
t = time.time(); p = Pantin.depuis_image(im.toarray(), art, pas=9, modele=sys.argv[5] if len(sys.argv) > 5 else "humain"); print("pantin", round(time.time() - t, 2), "s")
r = math.radians
poses = [
 ("repos", {}, 0),
 ("marche", {"cuisse_av": r(-24), "tibia_av": r(10), "cuisse_ar": r(22), "tibia_ar": r(-28), "bras_av": r(22), "bras_ar": r(-20), "avbras_ar": r(-15)}, 0),
 ("salut", {"bras_ar": r(-150), "avbras_ar": r(-25), "main_ar": r(-10), "tete": r(-8)}, 0),
 ("saut", {"cuisse_av": r(-40), "tibia_av": r(70), "cuisse_ar": r(35), "tibia_ar": r(-60), "bras_av": r(70), "bras_ar": r(-70), "avbras_av": r(30), "avbras_ar": r(-30)}, 60),
 ("course", {"torse": r(10), "tete": r(-8), "cuisse_av": r(-45), "tibia_av": r(40), "cuisse_ar": r(35), "tibia_ar": r(-75), "bras_av": r(-50), "avbras_av": r(-70), "bras_ar": r(50), "avbras_ar": r(-60)}, 0),
]
s = skia.Surface(560 * len(poses), 1040); c = s.getCanvas(); c.clear(skia.Color(250, 236, 214))
repos = pose_de_repos(art) if "epaule_av" in art else {}
for i, (nom, ang, saut) in enumerate(poses):
    ang = {k: ang.get(k, 0.0) + repos.get(k, 0.0) for k in set(ang) | set(repos)}
    p.dessiner(c, p.poser(ang, x=280 + 560 * i, y=1000, echelle=0.95, saut=saut))
s.makeImageSnapshot().save(sys.argv[4] if len(sys.argv) > 4 else f"{E}/keba_poses.png", skia.kPNG)
