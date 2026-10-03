#!/usr/bin/env python3
"""Visuels 3D Blender pour les exports ECOBANK BLUE PREMIUM (couverture et bandeau).

Scène : une « skyline » de données en verre bleu Ecobank sur un sol miroir bleu nuit,
un anneau or en lévitation (signature premium), lumières douces.
Produit sortie/art_hero.jpg (1920×1080, couverture PowerPoint / PDF) et
sortie/art_banner.jpg (2400×560, bandeau Word / PDF), embarqués ensuite dans APEX.

Usage : python3 blender_export_art.py   (module bpy, Python 3.11)
"""
import math
import random
import sys
from pathlib import Path

import bpy

SORTIE = Path(__file__).resolve().parent / "sortie"
SORTIE.mkdir(exist_ok=True)
SAMPLES = int(sys.argv[1]) if len(sys.argv) > 1 else 96


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mat(nom, col, rough=0.25, metal=0.0, trans=0.0, emis=0.0, coat=0.0):
    m = bpy.data.materials.new(nom)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*srgb(col), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if trans:
        b.inputs["Transmission Weight"].default_value = trans
        b.inputs["IOR"].default_value = 1.45
    if coat:
        b.inputs["Coat Weight"].default_value = coat
    if emis:
        b.inputs["Emission Color"].default_value = (*srgb(col), 1)
        b.inputs["Emission Strength"].default_value = emis
    return m


def scene_skyline(seed=7):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    w = bpy.data.worlds.new("Monde")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (*srgb("001B4D"), 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.5
    # liseré cyan à l'horizon (lumière d'ambiance)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(4, 38, 2.2), rotation=(math.radians(90), 0, 0))
    o = bpy.context.object
    o.scale = (60, 0.12, 1)
    o.data.materials.append(mat("Horizon", "06B6D4", emis=6))

    # sol miroir bleu nuit
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    bpy.context.object.data.materials.append(mat("Sol", "06163A", rough=0.08, metal=0.4))

    verres = [mat("Eco", "003DA5", rough=0.12, trans=0.35, coat=1.0), mat("Bright", "2563EB", rough=0.1, trans=0.45, coat=1.0),
              mat("Cyan", "06B6D4", rough=0.1, trans=0.5, coat=1.0), mat("Deep", "002B73", rough=0.18, coat=1.0)]
    or_ = mat("Or", "C8A951", rough=0.18, metal=1.0)
    rnd = random.Random(seed)
    # skyline : colonnes arrondies, hauteur croissante vers le centre droit (tendance)
    for i in range(-6, 9):
        for j in range(0, 6):
            if rnd.random() < 0.18:
                continue
            h = 0.6 + 4.2 * math.exp(-((i - 4) ** 2) / 30) * (1 - j * 0.12) * rnd.uniform(0.55, 1.15)
            x, y = i * 1.05 + 5, j * 1.15 + 2
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, h / 2))
            o = bpy.context.object
            o.scale = (0.42, 0.42, h / 2)
            bev = o.modifiers.new("Biseau", "BEVEL")
            bev.width = 0.06
            bev.segments = 4
            o.data.materials.append(verres[(i + j) % len(verres)] if rnd.random() > 0.12 else or_)
    # anneau or en lévitation (signature)
    bpy.ops.mesh.primitive_torus_add(major_radius=2.1, minor_radius=0.08, location=(9.4, 3.6, 5.6), rotation=(math.radians(72), 0, math.radians(18)))
    bpy.context.object.data.materials.append(or_)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.26, location=(9.4, 3.6, 5.6))
    bpy.context.object.data.materials.append(mat("Coeur", "C8A951", rough=0.05, metal=1.0, emis=0.6))

    # lumières
    for loc, en, col in [((-8, -6, 10), 1800, "BFD3FF"), ((10, -4, 8), 1400, "FFF3D6"), ((0, 12, 6), 900, "06B6D4")]:
        bpy.ops.object.light_add(type="AREA", location=loc)
        l = bpy.context.object
        l.data.energy = en
        l.data.size = 6
        l.data.color = srgb(col)
        l.rotation_euler = (math.atan2(math.hypot(loc[0], loc[1]), loc[2]), 0, math.atan2(loc[1], loc[0]) + math.pi / 2)
    # caméra
    bpy.ops.object.camera_add(location=(-3.5, -15.5, 5.2))
    cam = bpy.context.object
    sc.camera = cam
    cam.data.lens = 38
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = 17
    cam.data.dof.aperture_fstop = 4.5
    d = (4.2 - cam.location.x, 4 - cam.location.y, 2.6 - cam.location.z)
    cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
    return sc


def rendre(sc, fichier, w, h, cam_shift=0.0):
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.camera.data.shift_y = cam_shift
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 82
    sc.render.filepath = str(SORTIE / fichier)
    bpy.ops.render.render(write_still=True)
    print("→", SORTIE / fichier)


sc = scene_skyline()
rendre(sc, "art_hero.jpg", 1920, 1080)
rendre(sc, "art_banner.jpg", 2400, 560, cam_shift=0.08)
# emblème : gros plan sur l'anneau or et le cœur (cartes, en-têtes de salles)
cam = sc.camera
cam.location = (6.2, -2.2, 5.4)
d = (9.4 - 6.2, 3.6 + 2.2, 5.6 - 5.4)
cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
cam.data.lens = 50
cam.data.dof.focus_distance = 6.5
rendre(sc, "art_emblem.jpg", 900, 900)

# vignette 3:1 pour la navigation et les documents : partie droite du bandeau
try:
    from PIL import Image
    im = Image.open(SORTIE / "art_banner.jpg")
    w, h = im.size
    im.crop((w - 3 * h, 0, w, h)).resize((1200, 400), Image.LANCZOS).save(SORTIE / "art_tile.jpg", quality=80, optimize=True)
    print("→", SORTIE / "art_tile.jpg")
except ImportError:
    print("Pillow absent : art_tile.jpg non régénérée (pip install pillow)")
