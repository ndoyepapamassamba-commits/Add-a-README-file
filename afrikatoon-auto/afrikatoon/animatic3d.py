"""Aperçu 3D gratuit d'un kit, rendu avec Blender (Cycles, CPU) — sans aucune API payante.

Personnages « cartoon » construits en volumes simples, lumière solaire et ombres, bouches synchronisées
avec les voix de synthèse. Nécessite `pip install bpy` (Blender comme module Python).
"""
import math
import subprocess
from pathlib import Path

import bpy

from . import animatic

FPS = 12
RES = (540, 960)
SAMPLES = 6

LOOKS = {
    "MODOU": dict(h=1.75, w=0.34, top=(0.20, 0.45, 0.22), bottom=(0.35, 0.22, 0.12), hair=(0.02, 0.02, 0.02),
                  outfit="tshirt"),
    "BAYE": dict(h=1.70, w=0.56, top=(0.05, 0.15, 0.75), bottom=(0.05, 0.15, 0.75), hair=(0.55, 0.55, 0.55),
                 outfit="boubou", trim=(0.95, 0.70, 0.15)),
    "TANTIE AWA": dict(h=1.65, w=0.55, top=(0.95, 0.45, 0.05), bottom=(0.95, 0.80, 0.10),
                       hair=(0.95, 0.45, 0.05), outfit="boubou", headwrap=True),
    "PETIT MAMADOU": dict(h=1.10, w=0.26, top=(0.98, 0.80, 0.08), bottom=(0.08, 0.15, 0.50),
                          hair=(0.02, 0.02, 0.02), outfit="tshirt"),
    "COUMBA": dict(h=1.65, w=0.36, top=(0.85, 0.20, 0.55), bottom=(0.45, 0.15, 0.60), hair=(0.03, 0.02, 0.02),
                   outfit="boubou"),
    "TONTON DIENG": dict(h=1.72, w=0.40, top=(0.90, 0.40, 0.30), bottom=(0.20, 0.20, 0.25),
                         hair=(0.05, 0.05, 0.05), outfit="tshirt", cap=(0.30, 0.25, 0.18)),
}
DEFAULT_LOOK = dict(h=1.70, w=0.36, top=(0.7, 0.2, 0.2), bottom=(0.2, 0.2, 0.2), hair=(0.03, 0.03, 0.03),
                    outfit="tshirt")
SKIN = (0.28, 0.13, 0.06)

# rotations (x, y, z) en degrés des bras gauche / droit par émotion
ARM_POSES = {
    "neutral": ((0, 8, 0), (0, -8, 0)),
    "smug": ((0, 50, 0), (0, -50, 0)),
    "shock": ((0, 140, 0), (0, -140, 0)),
    "despair": ((0, -160, 0), (0, 160, 0)),
    "unimpressed": ((-80, 0, 60), (-80, 0, -60)),
    "laugh": ((-40, 0, 30), (-40, 0, -30)),
    "sweat": ((0, 15, 0), (0, -15, 0)),
}
BROWS = {"angry": 22, "despair": -20, "sweat": -15, "shock": -8}


# --- outils ----------------------------------------------------------------------

_mats = {}


def mat(rgb, rough=0.55, name=None, emission=0.0):
    key = (tuple(round(c, 3) for c in rgb), rough, name)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name or f"m{len(_mats)}")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    _mats[key] = m
    return m


def obj_add(kind, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), material=None, parent=None, **kw):
    getattr(bpy.ops.mesh, f"primitive_{kind}_add")(location=loc, rotation=[math.radians(r) for r in rot], **kw)
    o = bpy.context.object
    o.scale = scale
    if kind in ("uv_sphere", "cylinder", "cone", "torus"):
        bpy.ops.object.shade_smooth()
    if material:
        o.data.materials.append(material)
    if parent:
        o.parent = parent
    return o


def empty(loc=(0, 0, 0), parent=None):
    bpy.ops.object.empty_add(location=loc)
    e = bpy.context.object
    if parent:
        e.parent = parent
    return e


def sphere(loc, scale, material, parent=None):
    return obj_add("uv_sphere", loc, scale, material=material, parent=parent, segments=32, ring_count=16)


# --- décor -------------------------------------------------------------------------

def build_set(setting: str, prompt: str):
    scene = bpy.context.scene
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.35, 0.62, 1.0, 1)
    bg.inputs[1].default_value = 0.9

    sand = mat((0.85, 0.55, 0.28), 0.9, "sand")
    nt = sand.node_tree
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 18
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.45, 0.25, 0.10, 1)
    ramp.color_ramp.elements[1].color = (0.60, 0.38, 0.18, 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    obj_add("plane", (0, 2, 0), (14, 14, 1), material=sand)

    if setting == "plage":
        obj_add("plane", (0, 9, 0.02), (30, 6, 1), material=mat((0.05, 0.40, 0.65), 0.15, "sea"))
        return

    wall_rgb = {"salon": (0.08, 0.45, 0.45), "ceremonie": (0.85, 0.85, 0.90)}.get(setting, (0.78, 0.36, 0.12))
    wall = mat(wall_rgb, 0.95, "wall")
    if setting in ("cour", "marche", "village"):
        wt = wall.node_tree
        brick = wt.nodes.new("ShaderNodeTexBrick")
        brick.inputs["Color1"].default_value = (*wall_rgb, 1)
        brick.inputs["Color2"].default_value = (*(c * 0.82 for c in wall_rgb), 1)
        brick.inputs["Mortar"].default_value = (0.45, 0.28, 0.15, 1)
        brick.inputs["Scale"].default_value = 3.0
        brick.inputs["Mortar Size"].default_value = 0.015
        wt.links.new(brick.outputs["Color"], wt.nodes["Principled BSDF"].inputs["Base Color"])
    obj_add("cube", (0, 3.2, 1.5), (7, 0.15, 1.5), material=wall)
    obj_add("cube", (-4.2, 1.0, 1.25), (0.15, 2.4, 1.25), material=wall)
    if setting == "cour":
        line = mat((0.15, 0.15, 0.15), 0.5)
        obj_add("cylinder", (0, 2.6, 2.1), (0.01, 0.01, 3.2), (0, 90, 0), material=line)
        for x, c in ((-2.2, (0.85, 0.15, 0.15)), (-1.2, (0.15, 0.35, 0.85)), (0.3, (0.95, 0.80, 0.10)),
                     (1.6, (0.20, 0.65, 0.30))):
            obj_add("cube", (x, 2.6, 1.78), (0.28, 0.01, 0.32), material=mat(c, 0.8))
    if setting == "salon":
        obj_add("cube", (2.4, 2.8, 0.45), (0.9, 0.3, 0.45), material=mat((0.05, 0.05, 0.05), 0.3))

    p = prompt.lower()
    if "ram" in p or "mouton" in p:
        build_ram((1.25, 2.1, 0), "ribbon" in p)
    if "air conditioner" in p:
        box = obj_add("cube", (-2.6, 2.4, 0.45), (0.45, 0.35, 0.45), material=mat((0.92, 0.88, 0.78), 0.7))
        bpy.ops.object.text_add(location=(-2.95, 2.03, 0.55), rotation=(math.radians(90), 0, 0))
        t = bpy.context.object
        t.data.body = "CLIM"
        t.data.size = 0.25
        t.data.materials.append(mat((0.05, 0.15, 0.75), 0.4))
    if "chicken" in p:
        obj_add("cylinder", (-0.3, -0.6, 0.02), (0.25, 0.25, 0.02), material=mat((0.95, 0.95, 0.95), 0.3))
        sphere((-0.3, -0.6, 0.08), (0.14, 0.1, 0.07), mat((0.70, 0.35, 0.08), 0.4))


def build_ram(loc, ribbon):
    wool = mat((0.95, 0.94, 0.90), 0.95, "wool")
    dark = mat((0.12, 0.10, 0.09), 0.6)
    root = empty(loc)
    for dx, dy, dz in ((0, 0, 0.62), (0.25, 0.05, 0.66), (-0.25, 0.05, 0.64), (0.1, -0.12, 0.75),
                       (-0.12, 0.12, 0.76), (0.0, 0.1, 0.5)):
        sphere((dx, dy, dz), (0.3, 0.28, 0.26), wool, root)
    for lx, ly in ((-0.25, -0.12), (0.25, -0.12), (-0.25, 0.15), (0.25, 0.15)):
        obj_add("cylinder", (lx, ly, 0.22), (0.04, 0.04, 0.22), material=dark, parent=root)
    sphere((-0.48, -0.15, 0.85), (0.16, 0.22, 0.15), mat((0.90, 0.88, 0.84), 0.8), root)
    for side in (-1, 1):
        obj_add("torus", (-0.48 + side * 0.13, -0.08, 0.95), (0.08, 0.08, 0.08), (0, 90, 0),
                material=mat((0.55, 0.40, 0.25), 0.5), parent=root, major_radius=1, minor_radius=0.4)
        sphere((-0.48 + side * 0.07, -0.33, 0.9), (0.03, 0.02, 0.03), dark, root)
    if ribbon:
        obj_add("torus", (-0.35, -0.1, 0.72), (0.16, 0.16, 0.16), (0, 70, 0), material=mat((0.85, 0.05, 0.08), 0.5),
                parent=root, major_radius=1, minor_radius=0.15)
    obj_add("cylinder", (-0.95, 0.1, 0.7), (0.04, 0.04, 0.7), material=mat((0.35, 0.22, 0.12), 0.8), parent=root)
    root.rotation_euler[2] = math.radians(-20)


# --- personnages -------------------------------------------------------------------

def build_character(name, x, facing, prompt):
    L = LOOKS.get(name, DEFAULT_LOOK)
    h, w = L["h"], L["w"]
    skin = mat(SKIN, 0.45, "skin")
    top, bottom = mat(L["top"], 0.6), mat(L["bottom"], 0.7)
    white, black = mat((0.95, 0.95, 0.95), 0.2, "eyew"), mat((0.01, 0.01, 0.01), 0.15, "pupil")
    root = empty((x, 0, 0))
    root.rotation_euler[2] = math.radians(25 * facing)
    body = empty((0, 0, 0), root)

    shoulder = h * 0.62
    if L["outfit"] == "boubou":
        obj_add("cone", (0, 0, shoulder / 2), (w * 0.95, w * 0.62, shoulder / 2), material=top, parent=body,
                radius1=1, radius2=0.42, depth=2, vertices=48)
        if "trim" in L:
            gold = mat(L["trim"], 0.25, "gold")
            obj_add("torus", (0, 0, shoulder - 0.02), (w * 0.42, w * 0.32, 0.5), material=gold, parent=body,
                    major_radius=1, minor_radius=0.06)
            for k in range(4):
                sphere((0, -w * 0.47 + k * 0.012, shoulder - 0.15 - k * 0.12), (0.03, 0.02, 0.03), gold, body)
    else:
        leg_h = h * 0.38
        for sx in (-1, 1):
            obj_add("cylinder", (sx * w * 0.28, 0, leg_h / 2), (w * 0.2, w * 0.2, leg_h / 2), material=bottom,
                    parent=body)
            sphere((sx * w * 0.28, -0.06, 0.04), (w * 0.22, w * 0.38, 0.05), mat((0.08, 0.08, 0.08), 0.5), body)
        sphere((0, 0, (leg_h + shoulder) / 2 + 0.02), (w * 0.62, w * 0.45, (shoulder - leg_h) / 2 + 0.06), top, body)

    # tête (grosse, proportions cartoon)
    hr = h * 0.2 if h > 1.3 else h * 0.24
    head = empty((0, 0, shoulder + hr * 0.95), body)
    obj_add("cylinder", (0, 0, -hr * 0.9), (hr * 0.32, hr * 0.32, hr * 0.25), material=skin, parent=head)
    sphere((0, 0, 0), (hr, hr * 0.92, hr * 1.02), skin, head)
    for sx in (-1, 1):
        sphere((sx * hr * 0.97, 0, 0), (hr * 0.16, hr * 0.1, hr * 0.22), skin, head)
    sphere((0, -hr * 0.9, -hr * 0.05), (hr * 0.17, hr * 0.14, hr * 0.13), skin, head)  # nez
    if L.get("headwrap"):
        sphere((0, 0.05, hr * 0.75), (hr * 1.1, hr * 1.0, hr * 0.75), mat(L["hair"], 0.6), head)
    else:
        sphere((0, hr * 0.18, hr * 0.28), (hr * 1.04, hr * 0.9, hr * 0.8), mat(L["hair"], 0.8), head)
    if L.get("cap"):
        sphere((0, 0, hr * 0.7), (hr * 1.08, hr * 1.05, hr * 0.45), mat(L["cap"], 0.8), head)
        sphere((0, -hr * 0.9, hr * 0.55), (hr * 0.6, hr * 0.45, hr * 0.08), mat(L["cap"], 0.8), head)

    eyes, pupils, brows = [], [], []
    for sx in (-1, 1):
        e = sphere((sx * hr * 0.38, -hr * 0.8, hr * 0.18), (hr * 0.3, hr * 0.18, hr * 0.34), white, head)
        p = sphere((sx * hr * 0.38, -hr * 0.97, hr * 0.15), (hr * 0.13, hr * 0.05, hr * 0.14), black, head)
        sphere((0.25, -1.2, 0.35), (0.3, 0.3, 0.3), white, p)
        b = obj_add("cube", (sx * hr * 0.38, -hr * 0.9, hr * 0.62), (hr * 0.26, hr * 0.06, hr * 0.07),
                    material=mat((0.02, 0.01, 0.01), 0.6), parent=head)
        eyes.append(e), pupils.append(p), brows.append(b)
    mouth = sphere((0, -hr * 0.84, -hr * 0.48), (hr * 0.3, hr * 0.1, hr * 0.06), mat((0.35, 0.02, 0.04), 0.4),
                   head)
    teeth = obj_add("cube", (0, -hr * 0.9, -hr * 0.4), (hr * 0.2, hr * 0.02, hr * 0.04),
                    material=mat((0.98, 0.98, 0.95), 0.3), parent=head)
    teeth.hide_render = True

    arms = []
    for sx in (-1, 1):
        piv = empty((sx * w * 0.62, 0, shoulder - 0.06), body)
        alen = h * 0.33
        obj_add("cylinder", (0, 0, -alen / 2), (w * 0.17, w * 0.17, alen / 2), material=top, parent=piv)
        hand = sphere((0, 0, -alen - 0.02), (w * 0.17, w * 0.17, w * 0.17), skin, piv)
        arms.append(piv)
    if name == "BAYE":
        beads = obj_add("torus", (0, 0, -h * 0.33 - 0.1), (0.07, 0.07, 0.07), (90, 0, 0),
                        material=mat((0.35, 0.15, 0.05), 0.3), parent=arms[1], major_radius=1, minor_radius=0.15)
    if name == "PETIT MAMADOU" and "receipt" in prompt.lower():
        hand_side = arms[1] if facing <= 0 else arms[0]
        obj_add("cube", (0, -0.03, -h * 0.33 - 0.12), (0.09, 0.005, 0.13), material=mat((1, 1, 0.97), 0.6),
                parent=hand_side)
    marks = {}
    for key, txt, rgb in (("shock", "?!", (1.0, 0.85, 0.0)), ("angry", "!!", (0.95, 0.05, 0.05))):
        bpy.ops.object.text_add(location=(hr * 0.9 * (1 if facing <= 0 else -1), -hr * 0.4, hr * 1.25),
                                rotation=(math.radians(90), 0, 0))
        tx = bpy.context.object
        tx.data.body, tx.data.size, tx.data.extrude = txt, hr * 0.9, 0.02
        tx.data.align_x = "CENTER"
        tx.data.materials.append(mat(rgb, 0.3))
        tx.parent = head
        tx.hide_render = True
        marks[key] = tx
    sweat = []
    if True:
        for k in range(2):
            d = sphere((hr * (0.8 if k else -0.9), -hr * 0.5, hr * 0.5), (hr * 0.07, hr * 0.07, hr * 0.11),
                       mat((0.55, 0.80, 1.0), 0.05, "sweat"), head)
            d.hide_render = True
            sweat.append(d)
    return dict(root=root, body=body, head=head, eyes=eyes, pupils=pupils, brows=brows, mouth=mouth,
                teeth=teeth, arms=arms, hr=hr, facing=facing, sweat=sweat, h=h, x=x, marks=marks)


def pose(c, emotion, t, speaking, target_x=None, mouth=None):
    hr = c["hr"]
    bob = 0.02 * math.sin(t * 9) if speaking else 0.006 * math.sin(t * 2)
    if emotion == "laugh":
        bob = 0.03 * abs(math.sin(t * 12))
    c["body"].location.z = bob
    c["head"].rotation_euler = (math.radians(-12 if emotion == "laugh" else 0), 0,
                                math.radians(6 * math.sin(t * 4)) if speaking else 0)
    # bras
    left, right = ARM_POSES.get(emotion, ARM_POSES["neutral"])
    if emotion == "angry":
        point = (0, -90 + 6 * math.sin(t * 12), 0) if c["facing"] >= 0 else (0, 90 + 6 * math.sin(t * 12), 0)
        left, right = ((0, 8, 0), point) if c["facing"] >= 0 else (point, (0, -8, 0))
    for arm, r in zip(c["arms"], (left, right)):
        arm.rotation_euler = [math.radians(v) for v in r]
    # yeux
    big = emotion == "shock"
    lid = emotion in ("smug", "unimpressed")
    for e, p in zip(c["eyes"], c["pupils"]):
        e.scale = (hr * (0.4 if big else 0.3), hr * 0.18, hr * (0.46 if big else (0.17 if lid else 0.34)))
        p.scale = (hr * (0.08 if big else 0.13), hr * 0.05, hr * (0.08 if big else (0.09 if lid else 0.14)))
        p.location.x = e.location.x + c["facing"] * hr * 0.09
        p.location.z = hr * (0.1 if lid else 0.15)
        if emotion == "laugh":
            e.scale.z = hr * 0.04
            p.scale = (0.0001, 0.0001, 0.0001)
    for k, b in enumerate(c["brows"]):
        side = -1 if k == 0 else 1
        tilt = BROWS.get(emotion, 0) * side
        b.rotation_euler[1] = math.radians(tilt)
        b.location.z = hr * (0.78 if big else 0.6) + (hr * 0.12 if emotion == "unimpressed" and k == 1 else 0)
    # bouche
    if mouth is not None:  # volume réel de la voix → lèvres synchronisées
        open_amt = mouth if speaking else 0
        speaking = speaking and mouth > 0
    else:
        open_amt = (abs(math.sin(t * 15)) * 0.8 + 0.2) if speaking else 0
    m = c["mouth"]
    if emotion == "shock":
        m.scale = (hr * 0.22, hr * 0.1, hr * 0.3)
    elif emotion == "laugh":
        m.scale = (hr * 0.42, hr * 0.1, hr * 0.24)
    elif speaking:
        m.scale = (hr * 0.3, hr * 0.1, hr * (0.05 + 0.22 * open_amt))
    elif emotion in ("smug", "neutral"):
        m.scale = (hr * 0.34, hr * 0.08, hr * 0.045)
    else:
        m.scale = (hr * 0.24, hr * 0.08, hr * 0.035)
    c["teeth"].hide_render = emotion not in ("sweat", "laugh")
    for k, d in enumerate(c["sweat"]):
        d.hide_render = emotion != "sweat"
        d.location.z = hr * 0.5 - ((t * 0.4 + k * 0.2) % 0.35)
    for key, tx in c["marks"].items():
        tx.hide_render = emotion != key or (key == "angry" and not speaking)
        pop = 1 + 0.15 * abs(math.sin(t * 8))
        tx.scale = (pop, pop, pop)


from .animatic import SFX, add_sfx  # noqa: E402  (bruitages partagés)


# --- rendu d'une scène ---------------------------------------------------------------

def setup_render(frames_dir: Path):
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    try:  # carte graphique (ex. Google Colab) : rendu ~20x plus rapide
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for backend in ("OPTIX", "CUDA"):
            try:
                prefs.compute_device_type = backend
                prefs.get_devices()
                if any(d.type == backend for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type == backend
                    s.cycles.device = "GPU"
                    break
            except TypeError:
                continue
    except Exception:
        pass
    s.cycles.samples = SAMPLES
    s.cycles.use_denoising = True
    s.cycles.max_bounces = 3
    s.render.use_persistent_data = True
    s.render.resolution_x, s.render.resolution_y = RES
    s.render.image_settings.file_format = "PNG"
    s.view_settings.view_transform = "Standard"
    s.view_settings.look = "Medium High Contrast"


def render_clip(scene: dict, index: int, dest: Path, setting: str = "cour", is_last: bool = False,
                title: str = "", min_seconds: float = 8.0) -> Path:
    workdir = dest.parent
    lines = scene.get("dialogue") or []
    duration = animatic.needed_duration(lines, workdir, index, min_seconds)
    freeze = 1.6 if is_last else 0
    duration += freeze
    audio = animatic.build_audio(lines, workdir, index, duration)
    env = animatic.envelope(audio, FPS)
    events = []
    if scene.get("beat") == "twist":
        events.append(("dun", 0.0))
    if scene.get("beat") == "hook":
        events.append(("whoosh", 0.0))
    if is_last:
        events.append(("boing", duration - freeze))
    audio = add_sfx(audio, events, workdir / f"audio_fx_{index:02d}.wav", duration)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    frames_dir = workdir / f"frames_{index:02d}"
    frames_dir.mkdir(exist_ok=True)
    setup_render(frames_dir)
    build_set(setting, scene["image_prompt"])

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.2
    sun_data.angle = math.radians(6)
    sun_data.color = (1.0, 0.88, 0.70)
    sun = bpy.data.objects.new("sun", sun_data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), math.radians(-25), math.radians(-35))
    fill_data = bpy.data.lights.new("fill", "AREA")
    fill_data.energy = 150
    fill_data.size = 4
    fill = bpy.data.objects.new("fill", fill_data)
    bpy.context.collection.objects.link(fill)
    fill.location = (-1.5, -5, 3)
    fill.rotation_euler = (math.radians(60), 0, math.radians(-15))

    names = scene["characters"][:3]
    xs = {1: [0], 2: [-0.85, 0.85], 3: [-1.0, 0, 1.0]}.get(len(names), [])
    dist = -4.6 if len(names) < 3 else -5.4
    chars = {}
    for nm, x in zip(names, xs):
        facing = 1 if x < 0 else -1 if x > 0 else 0
        chars[nm] = build_character(nm, x, facing, scene["image_prompt"])
    emotions = {nm: animatic.emotion_for(nm, scene["image_prompt"]) for nm in names}

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 36
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    frames = int(duration * FPS)
    beat = scene.get("beat", "")
    for f in range(frames):
        t = f / FPS
        frozen = is_last and t >= duration - freeze
        speaker = next((l["speaker"] for l in lines if l.get("start", 0) <= t < l.get("end", 0)), None)
        for nm, c in chars.items():
            emo = emotions[nm]
            if frozen and nm == names[-1]:
                emo = "shock"
            pose(c, emo, 0 if frozen else t, speaker == nm and not frozen,
                 mouth=env[f] if f < len(env) else 0.0)
        if frozen:
            c = chars[names[-1]]
            k = min(1.0, (t - (duration - freeze)) / 0.3)
            head_z = c["h"] * 0.62 + c["hr"]
            c["root"].rotation_euler[2] = 0
            start, end = (0, dist, 1.3), (c["x"], -1.5, head_z)
            loc = [a + (b - a) * k for a, b in zip(start, end)]
            target = (c["x"] * k, 0, 1.0 + (head_z - 1.0) * k)
        else:
            push = 0.5 * t / duration + (1.2 * max(0, 1 - t / 0.35) if beat in ("twist", "chute") else 0)
            line = next((l for l in lines if l.get("start", 0) <= t < l.get("end", 0)), None)
            shake = 0.04 if line and "!" in line["text"] and t - line["start"] < 0.5 else 0
            loc = (shake * math.sin(t * 90), dist + push, 1.3 + shake * math.cos(t * 70))
            # caméra légèrement orientée vers celui qui parle
            sx = chars[speaker]["x"] * 0.25 if speaker in chars else 0
            target = (sx, 0, 1.15)
        cam.location = loc
        d = [target[i] - loc[i] for i in range(3)]
        cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
        bpy.context.scene.render.filepath = str(frames_dir / f"f_{f:04d}.png")
        bpy.ops.render.render(write_still=True)

    overlay = ("drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='@comedyvideos_100':"
               "fontcolor=white:fontsize=20:borderw=2:x=14:y=14")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i",
                    str(frames_dir / "f_%04d.png"), "-i", str(audio), "-vf", overlay, "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(dest)], check=True)
    return dest
