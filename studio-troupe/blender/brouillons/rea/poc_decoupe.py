"""Preuve de faisabilité REA : personnage peint -> maillage dense tiré de l'alpha -> squelette posé sur les repères
RTMW -> poids par chaleur (bone heat) en headless -> pose -> rendu Cycles CPU (émission exacte + ombre portée captée).

Usage : blender -b --factory-startup --python poc_decoupe.py -- <rgba.png> <kp.json> <fond.png> <sortie_dir> [pas_px]
Code écrit ici ; idées apprises dans COA Tools 2 (GPL-3, lu, non copié) : os ramenés dans le plan y=0 avant le
parentage automatique, objet décalé de 1e-5 en y.
"""
import bpy, bmesh, json, math, sys, time, os
import numpy as np
from mathutils import Vector, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:]
RGBA, KP, FOND, OUT = argv[:4]
PAS = int(argv[4]) if len(argv) > 4 else 6
os.makedirs(OUT, exist_ok=True)
journal = {}

def t():
    return time.perf_counter()

# ---------------------------------------------------------------- scène vierge
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ---------------------------------------------------------------- image + maillage tiré de l'alpha (grille dense)
t0 = t()
img = bpy.data.images.load(RGBA)
img.alpha_mode = 'STRAIGHT'
W, H = img.size
px = np.empty(W * H * 4, np.float32)
img.pixels.foreach_get(px)
alpha = px.reshape(H, W, 4)[::-1, :, 3]          # Blender stocke de bas en haut -> on remet v vers le bas
S = 2.0 / H                                       # 1 px = S m (image de 2 m de haut)
nu, nv = W // PAS, H // PAS
# cellule gardée si au moins un pixel de la cellule (élargie d'un pas) est opaque
a = alpha[:nv * PAS, :nu * PAS].reshape(nv, PAS, nu, PAS).max(axis=(1, 3)) > 0.05
k = np.zeros_like(a)
for dv in (-1, 0, 1):
    for du in (-1, 0, 1):
        k |= np.roll(np.roll(a, dv, 0), du, 1)
cells = np.argwhere(k)
idx = {}
verts, uvs, faces = [], [], []
def vid(i, j):
    key = (i, j)
    if key not in idx:
        u, v = j * PAS, i * PAS
        idx[key] = len(verts)
        verts.append(((u - W / 2) * S, 0.0, (H - v) * S))
        uvs.append((u / W, 1 - v / H))
    return idx[key]
for i, j in cells:
    faces.append((vid(i, j), vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1)))
me = bpy.data.meshes.new("perso")
me.from_pydata(verts, [], faces)
uvl = me.uv_layers.new(name="UV")
for poly in me.polygons:
    for li in poly.loop_indices:
        uvl.data[li].uv = uvs[me.loops[li].vertex_index]
ob = bpy.data.objects.new("perso", me)
sc.collection.objects.link(ob)
journal["maillage_s"] = round(t() - t0, 3)
journal["maillage_sommets"] = len(verts)
journal["maillage_faces"] = len(faces)

# matériau : émission exacte du dessin + transparence par l'alpha
mat = bpy.data.materials.new("peint")
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.interpolation = 'Cubic'
emi = nt.nodes.new("ShaderNodeEmission")
tr = nt.nodes.new("ShaderNodeBsdfTransparent")
mix = nt.nodes.new("ShaderNodeMixShader")
outn = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(tex.outputs["Color"], emi.inputs["Color"])
nt.links.new(tex.outputs["Alpha"], mix.inputs["Fac"])
nt.links.new(tr.outputs[0], mix.inputs[1])
nt.links.new(emi.outputs[0], mix.inputs[2])
nt.links.new(mix.outputs[0], outn.inputs["Surface"])
me.materials.append(mat)

# ---------------------------------------------------------------- squelette posé sur les repères RTMW
kp = json.load(open(KP))
def P(name):
    u, v = kp[name]
    return Vector(((u - W / 2) * S, 0.0, (H - v) * S))
def mid(a_, b_):
    return (P(a_) + P(b_)) / 2
hip_c, sho_c = mid("lhip", "rhip"), mid("lsho", "rsho")
nose = P("nose")
top = Vector((nose.x, 0, (H - 71) * S))
arm = bpy.data.armatures.new("rig")
rig = bpy.data.objects.new("rig", arm)
sc.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones
def bone(name, h, tl, parent=None, connect=False):
    b = eb.new(name)
    b.head, b.tail = h, tl
    b.roll = 0
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    return b
bone("hips", hip_c, hip_c + Vector((0, 0, -0.06)))
spine_mid = hip_c.lerp(sho_c, 0.5)
bone("spine", hip_c, spine_mid, "hips")
bone("chest", spine_mid, sho_c, "spine", True)
neck_t = sho_c.lerp(nose, 0.55)
bone("neck", sho_c, neck_t, "chest", True)
bone("head", neck_t, top, "neck", True)
for s_, side in (("l", "L"), ("r", "R")):
    bone(f"upper_arm.{side}", P(f"{s_}sho"), P(f"{s_}elb"), "chest")
    bone(f"forearm.{side}", P(f"{s_}elb"), P(f"{s_}wri"), f"upper_arm.{side}", True)
    bone(f"hand.{side}", P(f"{s_}wri"), P(f"{s_}mid"), f"forearm.{side}", True)
    bone(f"thigh.{side}", P(f"{s_}hip"), P(f"{s_}kne"), "hips")
    bone(f"shin.{side}", P(f"{s_}kne"), P(f"{s_}ank"), f"thigh.{side}", True)
    bone(f"foot.{side}", P(f"{s_}ank"), P(f"{s_}bigtoe"), f"shin.{side}", True)
bpy.ops.object.mode_set(mode='OBJECT')
journal["os"] = len(arm.bones)

# ---------------------------------------------------------------- poids par chaleur (headless)
t0 = t()
ob.location.y = 1e-5                     # astuce COA : maillage plat et os dans le même plan
bpy.ops.object.select_all(action='DESELECT')
ob.select_set(True); rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
ob.location.y = 0
journal["poids_chaleur_s"] = round(t() - t0, 3)
sans_poids = sum(1 for v in me.vertices if not any(g.weight > 1e-4 for g in v.groups))
journal["sommets_sans_poids"] = sans_poids
journal["groupes"] = len(ob.vertex_groups)

# ---------------------------------------------------------------- poses (rotation dans le plan image = autour de Y monde)
def rot_plan(pb, deg):
    q_rest = pb.bone.matrix_local.to_quaternion()
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = q_rest.inverted() @ Quaternion((0, 1, 0), math.radians(deg)) @ q_rest
pose = rig.pose.bones
sc.frame_start, sc.frame_end = 1, 6
for f in range(1, 7):
    ph = (f - 1) / 5
    rot_plan(pose["upper_arm.R"], -100 * ph)     # bras levé (pointer)
    rot_plan(pose["forearm.R"], -30 * ph)
    rot_plan(pose["upper_arm.L"], 35 * ph)      # main vers la hanche
    rot_plan(pose["forearm.L"], 70 * ph)
    rot_plan(pose["head"], 12 * ph)
    rot_plan(pose["chest"], -6 * ph)
    rot_plan(pose["thigh.L"], 10 * ph)
    for n in ("upper_arm.R", "forearm.R", "upper_arm.L", "forearm.L", "head", "chest", "thigh.L"):
        pose[n].keyframe_insert("rotation_quaternion", frame=f)

# ---------------------------------------------------------------- sol capteur d'ombre, lumière, caméra
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 4, (H - 981) * S))   # pieds (bbox alpha bas = 981 px)
sol = bpy.context.active_object
sol.is_shadow_catcher = True
sun = bpy.data.lights.new("soleil", 'SUN'); sun.energy = 3.0; sun.angle = math.radians(6)
so = bpy.data.objects.new("soleil", sun); sc.collection.objects.link(so)
so.rotation_euler = (math.radians(35), math.radians(-25), 0)       # lumière haute, devant-gauche
cam = bpy.data.cameras.new("cam"); cam.lens = 35
co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co)
co.location = (0.0, -5.2, 1.25); co.rotation_euler = (math.radians(86), 0, 0)
sc.camera = co

# ---------------------------------------------------------------- réglages Cycles CPU
sc.render.engine = 'CYCLES'
cy = sc.cycles
cy.device = 'CPU'
sc.render.threads_mode = 'FIXED'; sc.render.threads = 3
cy.max_bounces = 0; cy.diffuse_bounces = 0; cy.glossy_bounces = 0; cy.transmission_bounces = 0
cy.volume_bounces = 0; cy.transparent_max_bounces = 8
cy.caustics_reflective = False; cy.caustics_refractive = False
cy.use_adaptive_sampling = False
sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.render.use_persistent_data = False

# ---------------------------------------------------------------- compositeur : dessin + ombre sur le fond peint
sc.use_nodes = True
ct = sc.node_tree
for n in list(ct.nodes):
    ct.nodes.remove(n)
rl = ct.nodes.new("CompositorNodeRLayers")
fond = ct.nodes.new("CompositorNodeImage"); fond.image = bpy.data.images.load(FOND)
sca = ct.nodes.new("CompositorNodeScale"); sca.space = 'RENDER_SIZE'; sca.frame_method = 'CROP'
ao = ct.nodes.new("CompositorNodeAlphaOver")
comp = ct.nodes.new("CompositorNodeComposite")
ct.links.new(fond.outputs[0], sca.inputs[0])
ct.links.new(sca.outputs[0], ao.inputs[1])
ct.links.new(rl.outputs["Image"], ao.inputs[2])
ct.links.new(ao.outputs[0], comp.inputs[0])

def rendre(nom, rx, ry, spp, denoise, frame=6, compo=True):
    sc.render.resolution_x, sc.render.resolution_y = rx, ry
    sc.render.resolution_percentage = 100
    cy.samples = spp
    cy.use_denoising = denoise
    if denoise:
        cy.denoiser = 'OPENIMAGEDENOISE'
    sc.use_nodes = compo
    sc.frame_set(frame)
    sc.render.filepath = os.path.join(OUT, nom)
    t0 = t()
    bpy.ops.render.render(write_still=True)
    return round(t() - t0, 3)

res = {}
res["1080x860_spp1"] = rendre("r_1080_s1.png", 1080, 860, 1, False)
res["1080x860_spp4"] = rendre("r_1080_s4.png", 1080, 860, 4, False)
res["1080x860_spp16"] = rendre("r_1080_s16.png", 1080, 860, 16, False)
res["1080x860_spp16_oidn"] = rendre("r_1080_s16d.png", 1080, 860, 16, True)
res["540x430_spp8"] = rendre("r_540_s8.png", 540, 430, 8, False)
res["1080x860_spp4_sans_compo"] = rendre("r_1080_s4_nc.png", 1080, 860, 4, False, compo=False)
res["pose_f1_1080_spp4"] = rendre("r_1080_f1.png", 1080, 860, 4, False, frame=1)
journal["rendu_s"] = res

# animation 6 images : données persistantes non / oui
for persist in (False, True):
    sc.render.use_persistent_data = persist
    sc.render.resolution_x, sc.render.resolution_y = 1080, 860
    cy.samples = 4; cy.use_denoising = False; sc.use_nodes = True
    sc.render.filepath = os.path.join(OUT, f"anim_p{int(persist)}_####")
    t0 = t()
    bpy.ops.render.render(animation=True)
    journal[f"anim6_persistent_{persist}_s"] = round(t() - t0, 3)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "poc.blend"))
print("JOURNAL", json.dumps(journal))
