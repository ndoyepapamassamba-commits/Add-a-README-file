# -*- coding: utf-8 -*-
"""Scène de banc « vitesse » : une scène 2.5D peinte, représentative et déterministe.

Ce qu'elle contient (comme les vrais plans de la troupe) :
  * une caméra orthographique fixe qui cadre l'image au pixel près (1 px = ECHELLE unité Blender) ;
  * un décor peint (plaque privée du kit, rééchantillonnée UNE fois au format exact de l'image,
    lue en « Closest » : 1 texel = 1 pixel, couleurs intactes) ;
  * 2 personnages = textures peintes RGBA (≈ 1000×2000 px, alpha droit) posées sur un maillage
    construit depuis l'alpha (cellules d'une grille qui contiennent de l'alpha, ≈ 3 à 5 k sommets),
    déformé par une armature de ~20 os (bassin, torse, cou, tête, bras, avant-bras, mains, jambes…)
    avec des poids par distance aux os, animée de façon procédurale et déterministe
    (balancement des bras, roulis du buste, hochements de tête). Image 1 = pose de repos exacte ;
  * une ombre de contact douce (plan à alpha) sous chaque personnage ;
  * flou de mouvement optionnel (--flou 0.5 = obturateur d'une demi-image, comme le moteur 2D).

Matériaux : texture image (alpha « Straight ») → Cycles/EEVEE : Émission mélangée à Transparent par
l'alpha ; Workbench : éclairage FLAT, couleur TEXTURE. Gestion des couleurs : vue « Standard »,
look « None », exposition 0, gamma 1, tramage (dither) 0.

Utilisation (Blender 4.5, sans affichage) :
  blender -b --factory-startup --python scene_banc.py -- --moteur {workbench|eevee|cycles} \
      --largeur 1080 --hauteur 864 --images 60 [--fichier scene.blend] \
      [--rendre DOSSIER [--trames 1,15,30]] [--profil defaut|apercu|reference|masque] \
      [--reglage cycles.samples=16 --reglage render.filter_size=1.0 ...] [--flou 0.5] \
      [--fond plaque|transparent] [--ombres 1|0] [--melange lineaire|srgb] [--interp Closest|Linear] \
      [--profondeur 8|16] [--texture-px 2000] [--decor abobo] [--masque-statique masque.png]

Depuis un autre script Blender :
  import sys; sys.path.insert(0, ".../blender/vitesse"); import scene_banc
  info = scene_banc.construire("cycles", 1080, 864, 60)
  scene_banc.regler("cycles", "apercu")

Les actifs privés (textures des personnages, plaques) ne sont JAMAIS copiés dans le dépôt : les
versions rééchantillonnées vont dans le dossier de travail (variable VITESSE_TRAVAIL, sinon le
scratchpad de la session, sinon /tmp/vitesse-banc), sous actifs/.
"""
import ast
import json
import math
import os
import sys
import tempfile
import time

import bpy
import numpy as np
from mathutils import Vector

# ---------------------------------------------------------------------------------------------
# Chemins
# ---------------------------------------------------------------------------------------------
ICI = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.abspath(os.path.join(ICI, "..", ".."))
_SCRATCH = "/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad"


def dossier_travail():
    d = os.environ.get("VITESSE_TRAVAIL")
    if not d:
        d = os.path.join(_SCRATCH, "vitesse") if os.path.isdir(_SCRATCH) else os.path.join(
            tempfile.gettempdir(), "vitesse-banc")
    os.makedirs(d, exist_ok=True)
    return d


def dossier_actifs():
    d = os.path.join(dossier_travail(), "actifs")
    os.makedirs(d, exist_ok=True)
    return d


ECHELLE = 0.01          # unités Blender par pixel
IPS = 30                # images par seconde
Z_DECOR, Z_OMBRE, Z_PERSO = -5.0, -4.0, -1.0

# Personnages privés (réalistes). Repli procédural si absents.
PERSOS_PRIVES = [
    {"id": "modou",
     "texture": os.path.join(STUDIO, "sorties/cache/personnages/modou/modou.texture.png"),
     "rig": os.path.join(STUDIO, "sorties/cache/personnages/modou/rig.json")},
    {"id": "aminata",
     "texture": os.path.join(STUDIO, ".private/personnages/aminata/rgba.png"),
     "rig": os.path.join(STUDIO, ".private/personnages/aminata/rig.json")},
]
DECORS = os.path.join(STUDIO, ".private/kit/decors")

# 20 os : (nom, articulation tête, articulation queue, parent)
OS = [
    ("racine", "sol", "sol_haut", None),
    ("bassin", "bassin", "taille", "racine"),
    ("torse", "taille", "milieu", "bassin"),
    ("poitrine", "milieu", "baseCou", "torse"),
    ("cou", "baseCou", "baseTete", "poitrine"),
    ("tete", "baseTete", "sommetTete", "cou"),
    ("epauleG", "baseCou", "epauleG", "poitrine"),
    ("brasG", "epauleG", "coudeG", "epauleG"),
    ("avantBrasG", "coudeG", "poignetG", "brasG"),
    ("mainG", "poignetG", "boutMainG", "avantBrasG"),
    ("epauleD", "baseCou", "epauleD", "poitrine"),
    ("brasD", "epauleD", "coudeD", "epauleD"),
    ("avantBrasD", "coudeD", "poignetD", "brasD"),
    ("mainD", "poignetD", "boutMainD", "avantBrasD"),
    ("cuisseG", "hancheG", "genouG", "racine"),
    ("jambeG", "genouG", "chevilleG", "cuisseG"),
    ("piedG", "chevilleG", "boutPiedG", "jambeG"),
    ("cuisseD", "hancheD", "genouD", "racine"),
    ("jambeD", "genouD", "chevilleD", "cuisseD"),
    ("piedD", "chevilleD", "boutPiedD", "jambeD"),
]

# Mouvement procédural : amplitude (rad), période (s). Angle(t) = A·(sin(2πt/T + φ) − sin φ) → 0 à t = 0.
MOUVEMENT = {
    "bassin": (0.035, 2.4), "torse": (0.05, 1.9), "poitrine": (0.04, 1.6),
    "cou": (0.08, 1.1), "tete": (0.13, 0.85),
    "epauleG": (0.06, 1.5), "brasG": (0.55, 1.3), "avantBrasG": (0.45, 1.05), "mainG": (0.35, 0.8),
    "epauleD": (0.06, 1.7), "brasD": (0.50, 1.45), "avantBrasD": (0.40, 1.15), "mainD": (0.30, 0.9),
    "cuisseG": (0.04, 2.0), "jambeG": (0.04, 2.0), "piedG": (0.03, 2.0),
    "cuisseD": (0.04, 2.2), "jambeD": (0.04, 2.2), "piedD": (0.03, 2.2),
}


def angle_os(nom, t, perso_index):
    if nom not in MOUVEMENT:
        return 0.0
    a, periode = MOUVEMENT[nom]
    i = [o[0] for o in OS].index(nom)
    phi = (0.71 * i + 1.9 * perso_index) % (2.0 * math.pi)
    signe = -1.0 if perso_index % 2 else 1.0
    return signe * a * (math.sin(2.0 * math.pi * t / periode + phi) - math.sin(phi))


# ---------------------------------------------------------------------------------------------
# Lecture / écriture d'images (numpy, sans PIL : on est dans le Python de Blender)
# ---------------------------------------------------------------------------------------------
def lire_image(chemin):
    """→ tableau float32 (h, w, 4) de haut en bas, valeurs = octets stockés / 255 (aucune conversion)."""
    img = bpy.data.images.load(chemin, check_existing=False)
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return np.flipud(a.reshape(h, w, 4)).copy()


def ecrire_png(chemin, arr):
    """arr float (h, w, 4) de haut en bas, 0..1 → PNG RGBA 8 bits (arrondi au plus proche)."""
    h, w = arr.shape[:2]
    img = bpy.data.images.new("_ecr", w, h, alpha=True, float_buffer=False)
    img.pixels.foreach_set(np.ascontiguousarray(np.flipud(np.clip(arr, 0, 1)), np.float32).ravel())
    img.filepath_raw = chemin
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def quantifier(x):
    return np.round(np.clip(x, 0.0, 1.0) * 255.0) / 255.0


def matrice_reechantillonnage(n_in, n_out, echelle, decalage=0.0, a=2):
    """Poids Lanczos-a (n_out, n_in). Le pixel de sortie i (centre i+0.5) lit l'entrée à
    x = (i + 0.5) / echelle + decalage (coordonnées continues, bord gauche = 0)."""
    centres = (np.arange(n_out) + 0.5) / echelle + decalage
    s = max(1.0 / echelle, 1.0)
    j = np.arange(n_in) + 0.5
    d = (j[None, :] - centres[:, None]) / s
    w = np.sinc(d) * np.sinc(d / a) * (np.abs(d) < a)
    somme = w.sum(axis=1, keepdims=True)
    somme[somme == 0] = 1.0
    return (w / somme).astype(np.float32)


def reechantillonner(img, Wy, Wx):
    t = np.tensordot(Wy, img, axes=(1, 0))            # (H, w, C)
    t = np.tensordot(t, Wx, axes=(1, 1))              # (H, C, W)
    return np.ascontiguousarray(t.transpose(0, 2, 1))


def saigner_couleurs(rgb, a):
    """Remplit la couleur des texels transparents (alpha 0) par « pull-push » : invisible dans un
    pipeline prémultiplié, mais supprime les liserés sombres si un moteur interpole en alpha droit."""
    p, q = rgb * a[..., None], a.copy()
    pile = []
    while min(q.shape) > 1:
        pile.append((p, q))
        h, w = q.shape
        hp, wp = h + (h % 2), w + (w % 2)
        P = np.zeros((hp, wp, 3), np.float32); P[:h, :w] = p
        Q = np.zeros((hp, wp), np.float32); Q[:h, :w] = q
        p = P.reshape(hp // 2, 2, wp // 2, 2, 3).mean(axis=(1, 3))
        q = Q.reshape(hp // 2, 2, wp // 2, 2).mean(axis=(1, 3))
    col = np.where(q[..., None] > 0, p / np.maximum(q[..., None], 1e-12), 0.5)
    for p, q in reversed(pile):
        h, w = q.shape
        haut = np.repeat(np.repeat(col, 2, axis=0), 2, axis=1)[:h, :w]
        col = np.where(q[..., None] > 0, p / np.maximum(q[..., None], 1e-12), haut)
    return np.where(a[..., None] > 0, rgb, col)


# ---------------------------------------------------------------------------------------------
# Actifs (mis en cache dans le dossier de travail, jamais dans le dépôt)
# ---------------------------------------------------------------------------------------------
def articulations_depuis_rig(rig, tex_w):
    """Articulations (coordonnées texels de la texture source) depuis un rig.json du studio."""
    if "articulations" in rig:
        j = {k: (float(v["x"]), float(v["y"])) for k, v in rig["articulations"].items()}
        e = 1.0
    else:
        e = tex_w / float(rig["image"]["largeur"])
        os_ = {o["nom"]: o for o in rig["squelette"]["os"]}

        def piv(n):
            return (os_[n]["pivot"]["x"], os_[n]["pivot"]["y"])

        def bout(n):
            o = os_[n]
            return (o["pivot"]["x"] + o["longueur"] * math.cos(o["angleRepos"]),
                    o["pivot"]["y"] + o["longueur"] * math.sin(o["angleRepos"]))
        j = {"bassin": piv("bassin"), "taille": piv("torse"), "baseCou": piv("cou"),
             "baseTete": piv("tete"), "sommetTete": bout("tete")}
        for c in "GD":
            j["epaule" + c] = piv("bras" + c); j["coude" + c] = piv("avantBras" + c)
            j["poignet" + c] = piv("main" + c); j["boutMain" + c] = bout("main" + c)
            j["hanche" + c] = piv("cuisse" + c); j["genou" + c] = piv("jambe" + c)
            j["cheville" + c] = piv("pied" + c); j["boutPied" + c] = bout("pied" + c)
    sol = rig.get("ancrageSol") or {"x": j["bassin"][0], "y": max(v[1] for v in j.values())}
    j["sol"] = (float(sol["x"]), float(sol["y"]))
    return {k: (x * e, y * e) for k, (x, y) in j.items()}


def articulations_generiques(x0, y0, x1, y1):
    cx, H, L = 0.5 * (x0 + x1), (y1 - y0), (x1 - x0)
    def P(dx, dy):
        return (cx + dx * L, y0 + dy * H)
    return {"sommetTete": P(0, 0.0), "baseTete": P(0, 0.14), "baseCou": P(0, 0.19),
            "taille": P(0, 0.43), "bassin": P(0, 0.50), "sol": P(0, 1.0),
            "epauleG": P(0.17, 0.21), "coudeG": P(0.27, 0.36), "poignetG": P(0.32, 0.50),
            "boutMainG": P(0.34, 0.57), "epauleD": P(-0.17, 0.21), "coudeD": P(-0.27, 0.36),
            "poignetD": P(-0.32, 0.50), "boutMainD": P(-0.34, 0.57),
            "hancheG": P(0.08, 0.52), "genouG": P(0.09, 0.74), "chevilleG": P(0.10, 0.95),
            "boutPiedG": P(0.18, 0.99), "hancheD": P(-0.08, 0.52), "genouD": P(-0.09, 0.74),
            "chevilleD": P(-0.10, 0.95), "boutPiedD": P(-0.18, 0.99)}


def perso_procedural(index, th):
    """Personnage de repli : silhouette peinte (capsules + tête) avec bords antialiasés."""
    tw = th // 2
    rng = np.random.default_rng(100 + index)
    j = articulations_generiques(0.25 * tw, 0.02 * th, 0.75 * tw, 0.98 * th)
    yy, xx = np.mgrid[0:th, 0:tw].astype(np.float32) + 0.5
    cov = np.zeros((th, tw), np.float32)
    rgb = np.zeros((th, tw, 3), np.float32)
    teintes = rng.uniform(0.15, 0.9, size=(8, 3)).astype(np.float32)
    segs = [("baseCou", "bassin", 0.075, 0), ("epauleG", "coudeG", 0.035, 1), ("coudeG", "poignetG", 0.03, 1),
            ("epauleD", "coudeD", 0.035, 1), ("coudeD", "poignetD", 0.03, 1), ("poignetG", "boutMainG", 0.025, 2),
            ("poignetD", "boutMainD", 0.025, 2), ("hancheG", "genouG", 0.04, 3), ("genouG", "chevilleG", 0.035, 3),
            ("hancheD", "genouD", 0.04, 3), ("genouD", "chevilleD", 0.035, 3), ("chevilleG", "boutPiedG", 0.02, 4),
            ("chevilleD", "boutPiedD", 0.02, 4), ("baseTete", "sommetTete", 0.06, 5)]
    for a, b, r, t in segs:
        (ax, ay), (bx, by) = j[a], j[b]
        dx, dy = bx - ax, by - ay
        tt = np.clip(((xx - ax) * dx + (yy - ay) * dy) / max(dx * dx + dy * dy, 1e-6), 0, 1)
        d = np.hypot(xx - ax - tt * dx, yy - ay - tt * dy)
        c = np.clip(r * th - d + 0.5, 0, 1)
        motif = 0.85 + 0.15 * np.sin(xx * 0.05 + t) * np.sin(yy * 0.031)
        rgb = rgb * (1 - c[..., None]) + (teintes[t] * motif[..., None]) * c[..., None]
        cov = np.maximum(cov, c)
    img = np.dstack([rgb, cov]).astype(np.float32)
    return img, j


def plaque_procedurale(W, H):
    rng = np.random.default_rng(7)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ciel = np.stack([0.55 + 0.3 * yy / H, 0.7 + 0.2 * yy / H, 0.95 - 0.1 * yy / H], -1)
    sol = np.stack([0.55 + 0.0 * yy, 0.42 + 0.0 * yy, 0.3 + 0.0 * yy], -1)
    t = np.clip((yy - 0.62 * H) / 4.0, 0, 1)[..., None]
    img = ciel * (1 - t) + sol * t
    for _ in range(40):
        cx, cy, r = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(10, 80)
        c = rng.uniform(0, 1, 3)
        m = np.clip(r - np.hypot(xx - cx, yy - cy), 0, 1)[..., None] * 0.5
        img = img * (1 - m) + c * m
    return np.dstack([img, np.ones((H, W))]).astype(np.float32)


def preparer_plaque(W, H, decor):
    """Plaque du décor rééchantillonnée (couverture, centrée) au format EXACT de l'image."""
    src = None
    if decor:
        for nom in (decor + ".plate.jpg", decor + ".src.jpg"):
            p = os.path.join(DECORS, nom)
            if os.path.isfile(p):
                src = p
                break
    cle = (decor if src else "procedural")
    chemin = os.path.join(dossier_actifs(), "plaque_%s_%dx%d.png" % (cle, W, H))
    if os.path.isfile(chemin):
        return chemin, cle
    if src:
        img = lire_image(src)[..., :3]
        h, w = img.shape[:2]
        e = max(W / w, H / h)
        Wx = matrice_reechantillonnage(w, W, e, (w - W / e) / 2.0)
        Wy = matrice_reechantillonnage(h, H, e, (h - H / e) / 2.0)
        out = reechantillonner(img, Wy, Wx)
        out = np.dstack([out, np.ones((H, W), np.float32)])
    else:
        out = plaque_procedurale(W, H)
    ecrire_png(chemin, quantifier(out))
    return chemin, cle


def preparer_perso(index, texture_px):
    """Texture du personnage rééchantillonnée (Lanczos prémultiplié) à texture_px de haut,
    couleurs saignées sous l'alpha nul, + articulations à la même échelle."""
    spec = PERSOS_PRIVES[index] if index < len(PERSOS_PRIVES) else None
    prive = bool(spec and os.path.isfile(spec["texture"]) and os.path.isfile(spec["rig"]))
    pid = spec["id"] if prive else "procedural%d" % index
    th_cible = texture_px or 2000
    chemin = os.path.join(dossier_actifs(), "perso_%s_%d.png" % (pid, th_cible))
    chemin_j = chemin[:-4] + ".json"
    if os.path.isfile(chemin) and os.path.isfile(chemin_j):
        return pid, chemin, json.load(open(chemin_j))
    if prive:
        src = lire_image(spec["texture"])
        h, w = src.shape[:2]
        j = articulations_depuis_rig(json.load(open(spec["rig"])), w)
        if texture_px and texture_px != h:
            e = texture_px / float(h)
            W2 = int(round(w * e))
            pm = src.copy(); pm[..., :3] *= pm[..., 3:4]
            out = reechantillonner(pm, matrice_reechantillonnage(h, texture_px, e),
                                   matrice_reechantillonnage(w, W2, W2 / float(w)))
            out = np.clip(out, 0, 1)
            a = quantifier(out[..., 3])
            rgb = np.where(out[..., 3:4] > 1e-6, out[..., :3] / np.maximum(out[..., 3:4], 1e-6), 0)
            src = np.dstack([np.clip(rgb, 0, 1), a]).astype(np.float32)
            j = {k: (x * W2 / float(w), y * e) for k, (x, y) in j.items()}
    else:
        src, j = perso_procedural(index, th_cible)
        src[..., 3] = quantifier(src[..., 3])
    rgb = saigner_couleurs(src[..., :3], src[..., 3])
    ecrire_png(chemin, quantifier(np.dstack([rgb, src[..., 3]])))
    json.dump(j, open(chemin_j, "w"))
    return pid, chemin, j


def preparer_ombre():
    chemin = os.path.join(dossier_actifs(), "ombre_512x128.png")
    if not os.path.isfile(chemin):
        yy, xx = np.mgrid[0:128, 0:512].astype(np.float32) + 0.5
        r = np.hypot((xx - 256) / 256.0, (yy - 64) / 64.0)
        a = 0.55 * np.exp(-3.0 * r * r) * np.clip((1.0 - r) / 0.25, 0, 1)
        ecrire_png(chemin, quantifier(np.dstack([np.zeros((128, 512, 3)), a])))
    return chemin


# ---------------------------------------------------------------------------------------------
# Construction de la scène
# ---------------------------------------------------------------------------------------------
def vider_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.cameras,
                 bpy.data.lights, bpy.data.images, bpy.data.actions):
        for d in list(coll):
            coll.remove(d)


def pix_vers_monde(px, py, W, H):
    return ((px - W / 2.0) * ECHELLE, (H / 2.0 - py) * ECHELLE)


def materiau(nom, chemin_img, interp, extension, opaque, melange):
    img = bpy.data.images.load(chemin_img, check_existing=True)
    img.alpha_mode = "STRAIGHT"
    img.colorspace_settings.name = "Non-Color" if melange == "srgb" else "sRGB"
    mat = bpy.data.materials.new(nom)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image, tex.interpolation, tex.extension = img, interp, extension
    emi = nt.nodes.new("ShaderNodeEmission")
    emi.inputs["Strength"].default_value = 1.0
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tex.outputs["Color"], emi.inputs["Color"])
    if opaque:
        nt.links.new(emi.outputs[0], out.inputs["Surface"])
    else:
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(tex.outputs["Alpha"], mix.inputs[0])
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(emi.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs["Surface"])
        mat.surface_render_method = "BLENDED"       # EEVEE Next : vrai mélange alpha
        mat.blend_method = "BLEND"                   # (ancien réglage, lu par Workbench)
    mat.use_backface_culling = False
    nt.nodes.active = tex                            # Workbench « TEXTURE » lit le nœud actif
    return mat, img


def objet_plan(nom, x0, y0, x1, y1, z, mat):
    me = bpy.data.meshes.new(nom)
    me.from_pydata([(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UV")
    uv.data.foreach_set("uv", [0, 0, 1, 0, 1, 1, 0, 1])
    me.materials.append(mat)
    ob = bpy.data.objects.new(nom, me)
    ob.location.z = z
    bpy.context.scene.collection.objects.link(ob)
    return ob


def grille_alpha(alpha, cible):
    """Cellules d'une grille (pas c texels) qui touchent de l'alpha (marge 1 texel), dilatées d'une cellule."""
    th, tw = alpha.shape
    ys, xs = np.nonzero(alpha > 0)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    aire = float((alpha > 0).sum())
    meilleur = None
    for c in range(max(3, int(math.sqrt(aire / cible) * 0.6)), int(math.sqrt(aire / cible) * 1.6) + 2):
        gx0, gy0 = x0 - c, y0 - c
        nx, ny = int(math.ceil((x1 + c - gx0) / c)), int(math.ceil((y1 + c - gy0) / c))
        A = np.zeros((ny * c + 2, nx * c + 2), np.float32)
        sx0, sy0 = max(gx0 - 1, 0), max(gy0 - 1, 0)
        sx1, sy1 = min(gx0 - 1 + nx * c + 2, tw), min(gy0 - 1 + ny * c + 2, th)
        A[sy0 - (gy0 - 1):sy1 - (gy0 - 1), sx0 - (gx0 - 1):sx1 - (gx0 - 1)] = alpha[sy0:sy1, sx0:sx1]
        occ = np.zeros((ny, nx), bool)
        for dy in (0, 1, 2):
            for dx in (0, 1, 2):
                blk = A[dy:dy + ny * c, dx:dx + nx * c].reshape(ny, c, nx, c).max(axis=(1, 3))
                occ |= blk > 0
        dil = occ.copy()
        dil[1:] |= occ[:-1]; dil[:-1] |= occ[1:]; dil[:, 1:] |= occ[:, :-1]; dil[:, :-1] |= occ[:, 1:]
        vm = np.zeros((ny + 1, nx + 1), bool)
        vm[:-1, :-1] |= dil; vm[1:, :-1] |= dil; vm[:-1, 1:] |= dil; vm[1:, 1:] |= dil
        n = int(vm.sum())
        if meilleur is None or abs(n - cible) < abs(meilleur[0] - cible):
            meilleur = (n, c, gx0, gy0, dil, vm)
    return meilleur


def distance_segments(P, A, B):
    """P (n,2), A/B (m,2) → distances (n,m) point–segment."""
    AB = B - A
    L2 = np.maximum((AB ** 2).sum(1), 1e-9)
    t = np.clip(((P[:, None, :] - A[None]) * AB[None]).sum(-1) / L2[None], 0, 1)
    Q = A[None] + t[..., None] * AB[None]
    return np.sqrt(((P[:, None, :] - Q) ** 2).sum(-1))


def construire_perso(index, pid, chemin_tex, joints, place, W, H, interp, melange, cible_sommets=4000):
    """place = dict(ox, oy, k) : pixel = (ox + u·k, oy + v·k) pour le texel (u, v)."""
    texture = lire_image(chemin_tex)
    alpha = texture[..., 3]
    th, tw = alpha.shape
    n, c, gx0, gy0, occ, vm = grille_alpha(alpha, cible_sommets)
    idx = -np.ones(vm.shape, np.int64)
    idx[vm] = np.arange(int(vm.sum()))
    jj, ii = np.nonzero(vm)
    u = (gx0 + ii * c).astype(np.float64)
    v = (gy0 + jj * c).astype(np.float64)
    ox, oy, k = place["ox"], place["oy"], place["k"]
    X, Y = pix_vers_monde(ox + u * k, oy + v * k, W, H)
    verts = np.stack([X, Y, np.zeros_like(X)], 1)
    cj, ci = np.nonzero(occ)
    faces = np.stack([idx[cj, ci], idx[cj + 1, ci], idx[cj + 1, ci + 1], idx[cj, ci + 1]], 1)
    z = Z_PERSO + 0.5 * index
    nom = "perso_%s" % pid
    me = bpy.data.meshes.new(nom)
    me.from_pydata(verts.tolist(), [], faces.tolist())
    uvl = me.uv_layers.new(name="UV")
    lv = np.empty(len(me.loops), np.int64)
    me.loops.foreach_get("vertex_index", lv)
    uvs = np.stack([u[lv] / tw, 1.0 - v[lv] / th], 1)
    uvl.data.foreach_set("uv", uvs.ravel())
    mat, _ = materiau("mat_" + nom, chemin_tex, interp, "CLIP", False, melange)
    me.materials.append(mat)
    ob = bpy.data.objects.new(nom, me)
    ob.location.z = z
    scene = bpy.context.scene
    scene.collection.objects.link(ob)

    # Armature : ~20 os dans le plan de l'image, axe Z local = axe de vue.
    j = dict(joints)
    j["milieu"] = tuple(0.5 * (np.array(j["taille"]) + np.array(j["baseCou"])))
    hs = 0.06 * (j["sol"][1] - j["sommetTete"][1])
    j["sol_haut"] = (j["sol"][0], j["sol"][1] - hs)

    def monde(pt):
        x, y = pix_vers_monde(ox + pt[0] * k, oy + pt[1] * k, W, H)
        return Vector((x, y, 0.0))
    arm = bpy.data.armatures.new("arm_" + pid)
    aob = bpy.data.objects.new("arm_" + pid, arm)
    aob.location.z = z
    scene.collection.objects.link(aob)
    bpy.context.view_layer.objects.active = aob
    bpy.ops.object.mode_set(mode="EDIT")
    for nom_os, a, b, parent in OS:
        eb = arm.edit_bones.new(nom_os)
        eb.head, eb.tail = monde(j[a]), monde(j[b])
        if (eb.tail - eb.head).length < 1e-4:
            eb.tail = eb.head + Vector((0, 0.05, 0))
        eb.align_roll(Vector((0, 0, 1)))
        eb.use_deform = nom_os != "racine"
        if parent:
            eb.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")

    # Poids : inverse de la distance aux segments (texels), 3 os au plus, normalisés.
    noms = [o[0] for o in OS if o[0] != "racine"]
    A = np.array([j[o[1]] for o in OS if o[0] != "racine"], np.float64)
    B = np.array([j[o[2]] for o in OS if o[0] != "racine"], np.float64)
    D = distance_segments(np.stack([u, v], 1), A, B)
    wts = 1.0 / (D / c + 0.5) ** 4
    ordre = np.argsort(-wts, axis=1)[:, :3]
    garde = np.take_along_axis(wts, ordre, 1)
    garde /= garde.sum(1, keepdims=True)
    groupes = [ob.vertex_groups.new(name=nm) for nm in noms]
    for vi in range(len(u)):
        for r in range(3):
            if garde[vi, r] > 0.02:
                groupes[ordre[vi, r]].add([vi], float(garde[vi, r]), "REPLACE")
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = aob

    # Animation : une clé par image (Bézier auto-bornée → sous-images lisses pour le flou).
    for pb in aob.pose.bones:
        pb.rotation_mode = "XYZ"
    nb = scene.frame_end
    for pb in aob.pose.bones:
        if pb.name not in MOUVEMENT:
            continue
        pb.rotation_euler[2] = 0.0
        pb.keyframe_insert("rotation_euler", index=2, frame=1)
    act = aob.animation_data.action
    for fc in act.fcurves:
        nom_os = fc.data_path.split('"')[1]
        f = np.arange(1, nb + 1, dtype=np.float64)
        vals = np.array([angle_os(nom_os, (fi - 1) / IPS, index) for fi in f])
        fc.keyframe_points.add(nb - 1)
        fc.keyframe_points.foreach_set("co", np.stack([f, vals], 1).ravel().astype(np.float32))
        fc.update()
    disposition = {"nom": nom, "texture": chemin_tex, "tw": tw, "th": th, "ox": ox, "oy": oy,
                   "kx": k, "ky": k, "interp": interp, "opaque": False, "z": z,
                   "sommets": int(len(u)), "faces": int(len(faces)), "cellule_texels": int(c),
                   "os": len(OS)}
    return ob, aob, disposition


def regler_couleurs(scene, melange):
    vs = scene.view_settings
    scene.display_settings.display_device = "sRGB"
    vs.view_transform = "Raw" if melange == "srgb" else "Standard"
    vs.look = "None"
    vs.exposure = 0.0
    vs.gamma = 1.0
    vs.use_curve_mapping = False
    scene.render.dither_intensity = 0.0


MOTEURS = {"workbench": "BLENDER_WORKBENCH", "eevee": "BLENDER_EEVEE_NEXT", "cycles": "CYCLES"}


def construire(moteur="cycles", largeur=1080, hauteur=864, images=60, flou=0.0, fond="plaque",
               ombres=True, melange="lineaire", interp="Closest", texture_px=2000, decor="abobo",
               profondeur=8, cible_sommets=4000):
    """Construit la scène de banc et renvoie un dict d'informations (dont la « disposition »
    qui permet de recalculer analytiquement l'image 1)."""
    t0 = time.time()
    W, H = int(largeur), int(hauteur)
    vider_scene()
    scene = bpy.context.scene
    r = scene.render
    r.engine = MOTEURS[moteur]
    r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
    r.pixel_aspect_x = r.pixel_aspect_y = 1.0
    r.fps, r.fps_base = IPS, 1.0
    scene.frame_start, scene.frame_end = 1, int(images)
    scene.frame_set(1)
    r.film_transparent = (fond == "transparent")
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA" if fond == "transparent" else "RGB"
    r.image_settings.color_depth = str(profondeur)
    r.image_settings.compression = 15
    r.use_motion_blur = flou > 0
    if flou > 0:
        r.motion_blur_shutter = float(flou)
        r.motion_blur_position = "CENTER"
    regler_couleurs(scene, melange)
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Monde")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0, 0, 0, 1)
        bg.inputs["Strength"].default_value = 0.0
    if moteur == "workbench":
        sh = scene.display.shading
        sh.light, sh.color_type = "FLAT", "TEXTURE"
        sh.show_shadows = sh.show_cavity = sh.show_object_outline = sh.show_specular_highlight = False
        sh.use_dof = False
    if moteur == "cycles":
        scene.cycles.device = "CPU"

    # Caméra orthographique : l'image fait exactement W×H px de ECHELLE unités.
    cam = bpy.data.cameras.new("Camera")
    cam.type = "ORTHO"
    cam.ortho_scale = max(W, H) * ECHELLE
    cam.sensor_fit = "AUTO"
    cam.clip_start, cam.clip_end = 0.1, 100.0
    cob = bpy.data.objects.new("Camera", cam)
    cob.location = (0, 0, 10)
    scene.collection.objects.link(cob)
    scene.camera = cob

    couches = []
    # Décor
    chemin_plaque, cle_decor = preparer_plaque(W, H, decor)
    mat_d, _ = materiau("mat_decor", chemin_plaque, "Closest", "EXTEND", True, melange)
    (x0, y0), (x1, y1) = pix_vers_monde(0, H, W, H), pix_vers_monde(W, 0, W, H)
    od = objet_plan("decor", x0, y0, x1, y1, Z_DECOR, mat_d)
    od.hide_render = (fond != "plaque")
    couches.append({"nom": "decor", "texture": chemin_plaque, "tw": W, "th": H, "ox": 0.0, "oy": 0.0,
                    "kx": 1.0, "ky": 1.0, "interp": "Closest", "opaque": True, "z": Z_DECOR,
                    "visible": fond == "plaque"})

    # Personnages : bande de scène = W × min(H, 0.8·W) centrée verticalement.
    bande_h = min(H, int(round(0.8 * W)))
    bande_y = (H - bande_h) / 2.0
    persos = []
    chemin_ombre = preparer_ombre()
    mat_o, _ = materiau("mat_ombre", chemin_ombre, "Linear", "CLIP", False, melange)
    for i, cx in enumerate((0.30, 0.72)):
        pid, chemin_tex, joints = preparer_perso(i, texture_px)
        a = lire_image(chemin_tex)[..., 3]
        ys, xs = np.nonzero(a > 0)
        hpx = 0.80 * bande_h
        k = hpx / float(ys.max() + 1 - ys.min())
        sol = joints["sol"]
        sol_px = (cx * W, bande_y + 0.94 * bande_h)
        place = {"ox": sol_px[0] - sol[0] * k, "oy": sol_px[1] - sol[1] * k, "k": k}
        # ombre de contact (statique) centrée sur l'ancrage au sol
        larg = 1.15 * (xs.max() + 1 - xs.min()) * k
        haut = 0.16 * larg
        ox_o, oy_o = sol_px[0] - larg / 2.0, sol_px[1] - 0.55 * haut
        (a0, b0), (a1, b1) = pix_vers_monde(ox_o, oy_o + haut, W, H), pix_vers_monde(ox_o + larg, oy_o, W, H)
        oo = objet_plan("ombre_%s" % pid, a0, b0, a1, b1, Z_OMBRE + 0.1 * i, mat_o)
        oo.hide_render = not ombres
        couches.append({"nom": "ombre_%s" % pid, "texture": chemin_ombre, "tw": 512, "th": 128,
                        "ox": ox_o, "oy": oy_o, "kx": larg / 512.0, "ky": haut / 128.0, "interp": "Linear",
                        "opaque": False, "z": Z_OMBRE + 0.1 * i, "visible": bool(ombres)})
        persos.append((i, pid, chemin_tex, joints, place))
    objets = []
    for i, pid, chemin_tex, joints, place in persos:
        ob, aob, disp = construire_perso(i, pid, chemin_tex, joints, place, W, H, interp, melange, cible_sommets)
        disp["visible"] = True
        couches.append(disp)
        objets.append((ob, aob))
    couches.sort(key=lambda c: c["z"])
    disposition = {"largeur": W, "hauteur": H, "echelle": ECHELLE, "ips": IPS, "melange": melange,
                   "decor": cle_decor, "texture_px": texture_px, "fond": fond, "flou": flou,
                   "bande": [0, bande_y, W, bande_h], "couches": couches,
                   "note": "image 1 = pose de repos ; pixel = (ox + u*kx, oy + v*ky) pour le texel (u, v)"}
    chemin_disp = os.path.join(dossier_actifs(), "disposition_%dx%d_%s.json" % (W, H, melange))
    json.dump(disposition, open(chemin_disp, "w"), indent=1)
    regler(moteur, "defaut")
    info = {"scene": scene, "disposition": disposition, "chemin_disposition": chemin_disp,
            "objets": objets, "duree_construction_s": round(time.time() - t0, 3)}
    print("BANC construit : %s %dx%d, %d images, sommets=%s, os=%d, %.2f s" % (
        moteur, W, H, images, [c.get("sommets") for c in couches if "sommets" in c], len(OS),
        info["duree_construction_s"]))
    return info


# ---------------------------------------------------------------------------------------------
# Réglages des moteurs
# ---------------------------------------------------------------------------------------------
PROFILS = {
    # Réglages de base (point de départ commun, PAS une recommandation de vitesse).
    "defaut": {
        "cycles": {"cycles.samples": 32, "cycles.use_adaptive_sampling": False, "cycles.use_denoising": False,
                   "cycles.pixel_filter_type": "BOX", "cycles.filter_width": 1.0, "cycles.seed": 0,
                   "cycles.use_animated_seed": False},
        "eevee": {"eevee.taa_render_samples": 16},
        "workbench": {"display.render_aa": "8"},
    },
    "apercu": {
        "cycles": {"cycles.samples": 16},
        "eevee": {"eevee.taa_render_samples": 4},
        "workbench": {"display.render_aa": "5"},
    },
    # Référence : intégration exacte de l'aire du pixel (filtre Boîte 1 px), sans débruitage.
    "reference": {
        "cycles": {"cycles.samples": 512, "cycles.use_adaptive_sampling": False, "cycles.use_denoising": False,
                   "cycles.pixel_filter_type": "BOX", "cycles.filter_width": 1.0, "cycles.seed": 0,
                   "cycles.use_animated_seed": False},
    },
    "masque": {
        "cycles": {"cycles.samples": 64, "cycles.use_adaptive_sampling": False, "cycles.use_denoising": False,
                   "cycles.pixel_filter_type": "BOX", "cycles.filter_width": 1.0},
    },
}


def valeur(txt):
    try:
        return ast.literal_eval(txt)
    except Exception:
        return txt


def appliquer_reglages(reglages, scene=None):
    """reglages : dict ou liste de 'chemin=valeur' relatifs à la scène
    (ex. 'cycles.samples=16', 'render.filter_size=1.0', 'display.render_aa=8', 'eevee.taa_render_samples=8',
    'render.threads_mode=FIXED', 'render.threads=3', 'render.use_persistent_data=True')."""
    scene = scene or bpy.context.scene
    if isinstance(reglages, dict):
        items = list(reglages.items())
    else:
        items = [(s.split("=", 1)[0].strip(), valeur(s.split("=", 1)[1].strip())) for s in reglages]
    for chemin, v in items:
        cible = scene
        parties = chemin.split(".")
        for p in parties[:-1]:
            cible = getattr(cible, p)
        prop = cible.bl_rna.properties.get(parties[-1]) if hasattr(cible, "bl_rna") else None
        if prop is not None and prop.type == "ENUM" and not isinstance(v, str):
            v = str(v)
        setattr(cible, parties[-1], v)
        print("BANC reglage %s = %r" % (chemin, getattr(cible, parties[-1])))


def regler(moteur, profil, scene=None):
    """Applique un profil nommé de PROFILS (les autres bancs y ajoutent leurs profils)."""
    if not profil:
        return
    if profil not in PROFILS:
        raise KeyError("profil inconnu : %s (connus : %s)" % (profil, ", ".join(PROFILS)))
    appliquer_reglages(PROFILS[profil].get(moteur, {}), scene)


# ---------------------------------------------------------------------------------------------
# Masque des zones statiques (pour mesurer le scintillement)
# ---------------------------------------------------------------------------------------------
def dilater(m, r):
    """Dilatation carrée (2r+1) d'un masque booléen, séparable."""
    out = m.copy()
    for s in range(1, r + 1):
        out[s:] |= m[:-s]
        out[:-s] |= m[s:]
    m2 = out.copy()
    for s in range(1, r + 1):
        out[:, s:] |= m2[:, :-s]
        out[:, :-s] |= m2[:, s:]
    return out


def masque_statique(chemin, info, marge_px=None):
    """Pixels jamais couverts par un personnage sur toutes les images (sous-images comprises si flou)
    → blanc. Construit depuis les sommets déformés, dilatés d'une marge ≥ taille de cellule."""
    scene = info["scene"]
    disp = info["disposition"]
    W, H = disp["largeur"], disp["hauteur"]
    couv = np.zeros((H, W), bool)
    dg = bpy.context.evaluated_depsgraph_get()
    pas = [0.0] if disp["flou"] <= 0 else [-disp["flou"] / 2, 0.0, disp["flou"] / 2]
    for f in range(scene.frame_start, scene.frame_end + 1):
        for sf in pas:
            fi = f + sf
            scene.frame_set(int(math.floor(fi)), subframe=fi - math.floor(fi))
            for ob, _ in info["objets"]:
                ev = ob.evaluated_get(dg)
                me = ev.to_mesh()
                co = np.empty(len(me.vertices) * 3, np.float32)
                me.vertices.foreach_get("co", co)
                ev.to_mesh_clear()
                co = co.reshape(-1, 3)
                px = np.clip((co[:, 0] / ECHELLE + W / 2.0).astype(int), 0, W - 1)
                py = np.clip((H / 2.0 - co[:, 1] / ECHELLE).astype(int), 0, H - 1)
                couv[py, px] = True
    scene.frame_set(1)
    cell = max(c["cellule_texels"] * c["kx"] for c in disp["couches"] if "cellule_texels" in c)
    r = int(math.ceil(marge_px if marge_px is not None else 2.0 * cell + 4))
    d = dilater(couv, r)
    statique = (~d).astype(np.float32)
    ecrire_png(chemin, np.dstack([statique, statique, statique, np.ones_like(statique)]))
    print("BANC masque statique : %s (%.1f %% statique, marge %d px)" % (chemin, 100 * statique.mean(), r))


# ---------------------------------------------------------------------------------------------
# Ligne de commande
# ---------------------------------------------------------------------------------------------
def _arguments(argv):
    import argparse
    p = argparse.ArgumentParser(prog="scene_banc.py", description="Scène de banc vitesse (Blender)")
    p.add_argument("--moteur", choices=sorted(MOTEURS), default="cycles")
    p.add_argument("--largeur", type=int, default=1080)
    p.add_argument("--hauteur", type=int, default=864)
    p.add_argument("--images", type=int, default=60)
    p.add_argument("--fichier", help="enregistre la scène .blend")
    p.add_argument("--rendre", help="dossier de sortie : rend f_####.png")
    p.add_argument("--trames", help="liste d'images à rendre (ex. 1,15,30) au lieu de 1..N")
    p.add_argument("--debut", type=int, default=1)
    p.add_argument("--profil", default="defaut")
    p.add_argument("--reglage", action="append", default=[], help="chemin=valeur relatif à la scène")
    p.add_argument("--flou", type=float, default=0.0, help="obturateur en images (0 = pas de flou)")
    p.add_argument("--fond", choices=["plaque", "transparent"], default="plaque")
    p.add_argument("--ombres", type=int, default=1)
    p.add_argument("--melange", choices=["lineaire", "srgb"], default="lineaire")
    p.add_argument("--interp", choices=["Closest", "Linear", "Cubic", "Smart"], default="Closest")
    p.add_argument("--profondeur", type=int, choices=[8, 16], default=8)
    p.add_argument("--texture-px", type=int, default=2000)
    p.add_argument("--decor", default="abobo")
    p.add_argument("--sommets", type=int, default=4000)
    p.add_argument("--masque-statique", help="écrit le masque des zones jamais couvertes (PNG)")
    return p.parse_args(argv)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    a = _arguments(argv)
    info = construire(a.moteur, a.largeur, a.hauteur, a.images, flou=a.flou, fond=a.fond,
                      ombres=bool(a.ombres), melange=a.melange, interp=a.interp, texture_px=a.texture_px,
                      decor=a.decor, profondeur=a.profondeur, cible_sommets=a.sommets)
    scene = info["scene"]
    regler(a.moteur, a.profil, scene)
    if a.reglage:
        appliquer_reglages(a.reglage, scene)
    if a.masque_statique:
        masque_statique(a.masque_statique, info)
    if a.fichier:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.fichier), compress=False)
        print("BANC enregistré : %s" % a.fichier)
    if a.rendre:
        os.makedirs(a.rendre, exist_ok=True)
        if a.trames:
            for f in [int(x) for x in a.trames.split(",") if x.strip()]:
                t = time.time()
                scene.frame_set(f)
                scene.render.filepath = os.path.join(os.path.abspath(a.rendre), "f_%04d" % f)
                bpy.ops.render.render(write_still=True)
                print("BANC_TRAME %d %.3f s" % (f, time.time() - t))
        else:
            scene.frame_start = a.debut
            scene.render.filepath = os.path.join(os.path.abspath(a.rendre), "f_####")
            bpy.ops.render.render(animation=True)


if __name__ == "__main__":
    main()
