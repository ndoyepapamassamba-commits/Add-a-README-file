"""Vue 3D du portefeuille (Blender, sans interface) à partir de sortie/resultats.json.

  - une colonne par dossier, dans la rangée de son Stage IFRS9 (1 devant, 3 au fond) ;
  - hauteur = score d'alerte TypeSafe, section = encours (racine carrée) ;
  - couleur = niveau d'alerte, anneau doré = dossier à confirmer par un analyste.

Produit sortie/portefeuille_3d.png (rendu Cycles), .glb (visionneuse 3D web) et .blend.

Usage : python pre_comite.py  puis  python blender_3d.py   (Python avec le module bpy)
"""

import json
import math
from pathlib import Path

import bpy

ICI = Path(__file__).resolve().parent
SORTIE = ICI / "sortie"
resultats = json.loads((SORTIE / "resultats.json").read_text(encoding="utf-8"))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def materiau(nom, couleur, emission=0.0, rugosite=0.4, metal=0.0):
    m = bpy.data.materials.new(nom)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*couleur, 1)
    bsdf.inputs["Roughness"].default_value = rugosite
    bsdf.inputs["Metallic"].default_value = metal
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*couleur, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    return m


def srgb(hexa):
    c = [int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


MAT = {
    "haut": materiau("alerte_haute", srgb("#C62828")),
    "moyen": materiau("alerte_moyenne", srgb("#EF8F00")),
    "bas": materiau("alerte_basse", srgb("#2E7D32")),
    "sol": materiau("sol", srgb("#E9EFF6"), rugosite=0.8),
    "couloir": [materiau(f"couloir_{i}", srgb(c), rugosite=0.9)
                for i, c in enumerate(("#D5E8D4", "#FCE9C8", "#F6D2D2"))],
    "texte": materiau("texte", srgb("#003A70")),
    "revue": materiau("revue", srgb("#E0B000"), emission=2.0, metal=0.6),
}


def texte(contenu, position, taille, rotation=(math.radians(60), 0, 0), vers=None):
    bpy.ops.object.text_add(location=position, rotation=rotation)
    t = bpy.context.object
    if vers is not None:            # étiquette toujours lisible depuis la caméra
        c = t.constraints.new("TRACK_TO")
        c.target, c.track_axis, c.up_axis = vers, "TRACK_Z", "UP_Y"
    t.data.body = contenu
    t.data.size = taille
    t.data.align_x = "CENTER"
    t.data.extrude = 0.02
    t.data.materials.append(MAT["texte"])
    return t


# Sol et rangées par Stage IFRS9 (Stage 1 devant, Stage 3 au fond) ---------- #
PAS, ECART_RANGEE = 3.6, 6.0
par_stage = {1: [], 2: [], 3: []}
for r in resultats:
    par_stage[r["stage_ifrs9"]].append(r)
largeur = max(len(v) for v in par_stage.values()) * PAS + 2

bpy.ops.mesh.primitive_plane_add(size=1, location=(0, ECART_RANGEE, -0.01))
sol = bpy.context.object
sol.scale = (largeur + 14, ECART_RANGEE * 3 + 10, 1)
sol.data.materials.append(MAT["sol"])

# Caméra (avant les étiquettes, qui s'orientent vers elle) ------------------ #
bpy.ops.object.empty_add(location=(0, ECART_RANGEE * 1.1, 3.2))
cible = bpy.context.object
bpy.ops.object.camera_add(location=(0, -24, 25))
camera = bpy.context.object
camera.data.lens = 33
contrainte = camera.constraints.new("TRACK_TO")
contrainte.target = cible
scene.camera = camera

for i, stage in enumerate((1, 2, 3)):
    y = i * ECART_RANGEE
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, y, 0))
    c = bpy.context.object
    c.scale = (largeur, ECART_RANGEE - 0.6, 1)
    c.data.materials.append(MAT["couloir"][i])
    texte(f"Stage {stage}", (-largeur / 2 - 2.2, y, 0.05), 0.9, rotation=(0, 0, 0))

# Colonnes ------------------------------------------------------------------ #
encours_max = max(r["encours_fcfa"] for r in resultats)
for stage, dossiers in par_stage.items():
    y = (stage - 1) * ECART_RANGEE
    tries = sorted(dossiers, key=lambda r: -r["alerte"])
    for j, r in enumerate(tries):
        x = (j - (len(tries) - 1) / 2 + (stage - 2) * 0.5) * PAS   # rangées décalées : pas de masquage
        hauteur = max(r["alerte"], 3) / 7
        cote = 0.7 + 1.5 * math.sqrt(r["encours_fcfa"] / encours_max)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, hauteur / 2))
        col = bpy.context.object
        col.name = r["id_dossier"]
        col.scale = (cote, cote, hauteur)
        bpy.ops.object.transform_apply(scale=True)
        biseau = col.modifiers.new("biseau", "BEVEL")
        biseau.width, biseau.segments = 0.06, 3
        niveau = "haut" if r["alerte"] >= 60 else "moyen" if r["alerte"] >= 40 else "bas"
        col.data.materials.append(MAT[niveau])
        if r["revue_analyste"]:
            bpy.ops.mesh.primitive_torus_add(location=(x, y, 0.08), major_radius=cote * 0.85,
                                             minor_radius=0.07)
            bpy.context.object.data.materials.append(MAT["revue"])
        texte(f"{r['id_dossier']} · {r['alerte']}", (x, y, hauteur + 0.5), 0.45, vers=camera)

# Lumières et rendu --------------------------------------------------- #
monde = bpy.data.worlds.new("monde")
monde.use_nodes = True
monde.node_tree.nodes["Background"].inputs["Color"].default_value = (*srgb("#F4F7FB"), 1)
monde.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
scene.world = monde

bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), math.radians(15), math.radians(-35)))
bpy.context.object.data.energy = 3.5
bpy.context.object.data.angle = math.radians(8)
bpy.ops.object.light_add(type="AREA", location=(-12, -10, 14))
bpy.context.object.data.energy = 2500
bpy.context.object.data.size = 10


scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1600, 900
scene.view_settings.view_transform = "AgX"
scene.render.filepath = str(SORTIE / "portefeuille_3d.png")
bpy.ops.render.render(write_still=True)

bpy.ops.export_scene.gltf(filepath=str(SORTIE / "portefeuille_3d.glb"), export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SORTIE / "portefeuille_3d.blend"))
print("Rendu :", SORTIE / "portefeuille_3d.png")
