"""POC 2 : personnage en pièces (bras, jambes, tronc) -> une grille dense par pièce -> poids par chaleur RESTREINTS aux
os de la pièce (méthode COA Tools : use_deform coupé sur les autres os) -> ordre z par décalage y -> poses dans le plan.
Puis variantes de rendu Cycles CPU pour mesurer ce qui coûte.

Usage : blender -b --factory-startup --python poc_pieces.py -- <pieces_dir> <kp.json> <fond.png> <sortie_dir>
Code écrit ici.
"""
import bpy, json, math, sys, time, os
import numpy as np
from mathutils import Vector, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:]
PIECES, KP, FOND, OUT = argv[:4]
os.makedirs(OUT, exist_ok=True)
PAS = 5
J = {}
t = time.perf_counter
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def grille(nom, chemin, y):
    img = bpy.data.images.load(chemin); img.alpha_mode = 'STRAIGHT'
    W, H = img.size
    px = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(px)
    alpha = px.reshape(H, W, 4)[::-1, :, 3]
    S = 2.0 / H
    nu, nv = W // PAS, H // PAS
    a = alpha[:nv * PAS, :nu * PAS].reshape(nv, PAS, nu, PAS).max(axis=(1, 3)) > 0.05
    k = a.copy()
    for dv in (-1, 0, 1):
        for du in (-1, 0, 1):
            k |= np.roll(np.roll(a, dv, 0), du, 1)
    idx, verts, uvs, faces = {}, [], [], []
    def vid(i, j):
        if (i, j) not in idx:
            u, v = j * PAS, i * PAS
            idx[(i, j)] = len(verts)
            verts.append(((u - W / 2) * S, y, (H - v) * S)); uvs.append((u / W, 1 - v / H))
        return idx[(i, j)]
    for i, j in np.argwhere(k):
        faces.append((vid(i, j), vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1)))
    me = bpy.data.meshes.new(nom); me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name="UV")
    loops_v = np.empty(len(me.loops), np.int32); me.loops.foreach_get("vertex_index", loops_v)
    uv_arr = np.asarray(uvs, np.float32)[loops_v].ravel(); uvl.data.foreach_set("uv", uv_arr)
    ob = bpy.data.objects.new(nom, me); sc.collection.objects.link(ob)
    mat = bpy.data.materials.new(nom); mat.use_nodes = True; nt = mat.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.interpolation = 'Linear'
    emi = nt.nodes.new("ShaderNodeEmission"); tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader"); o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tex.outputs["Color"], emi.inputs["Color"]); nt.links.new(tex.outputs["Alpha"], mix.inputs["Fac"])
    nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(emi.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], o.inputs["Surface"]); me.materials.append(mat)
    return ob, W, H, S

t0 = t()
# ordre z (caméra en -y) : bras devant (y<0), jambes derrière le tronc (y>0)
plan = {"tronc": 0.0, "bras_G": -0.004, "bras_D": -0.004, "jambe_G": 0.003, "jambe_D": 0.003}
objs = {}
for nom, y in plan.items():
    ob, W, H, S = grille(nom, os.path.join(PIECES, f"piece_{nom}.png"), y)
    objs[nom] = ob
J["maillages_s"] = round(t() - t0, 3)
J["sommets"] = {n: len(o.data.vertices) for n, o in objs.items()}

kp = json.load(open(KP))
def P(n):
    u, v = kp[n]; return Vector(((u - W / 2) * S, 0.0, (H - v) * S))
mid = lambda a, b: (P(a) + P(b)) / 2
hip_c, sho_c, nose = mid("lhip", "rhip"), mid("lsho", "rsho"), P("nose")
top = Vector((nose.x, 0, (H - 71) * S))
arm = bpy.data.armatures.new("rig"); rig = bpy.data.objects.new("rig", arm); sc.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT'); eb = arm.edit_bones
def bone(n, h, tl, par=None, con=False):
    b = eb.new(n); b.head, b.tail = h, tl
    if par: b.parent = eb[par]; b.use_connect = con
bone("hips", hip_c, hip_c + Vector((0, 0, -0.06)))
sm = hip_c.lerp(sho_c, 0.5); bone("spine", hip_c, sm, "hips"); bone("chest", sm, sho_c, "spine", True)
nt_ = sho_c.lerp(nose, 0.55); bone("neck", sho_c, nt_, "chest", True); bone("head", nt_, top, "neck", True)
for s_, sd in (("l", "L"), ("r", "R")):
    bone(f"upper_arm.{sd}", P(f"{s_}sho"), P(f"{s_}elb"), "chest")
    bone(f"forearm.{sd}", P(f"{s_}elb"), P(f"{s_}wri"), f"upper_arm.{sd}", True)
    bone(f"hand.{sd}", P(f"{s_}wri"), P(f"{s_}mid"), f"forearm.{sd}", True)
    bone(f"thigh.{sd}", P(f"{s_}hip"), P(f"{s_}kne"), "hips")
    bone(f"shin.{sd}", P(f"{s_}kne"), P(f"{s_}ank"), f"thigh.{sd}", True)
    bone(f"foot.{sd}", P(f"{s_}ank"), P(f"{s_}bigtoe"), f"shin.{sd}", True)
bpy.ops.object.mode_set(mode='OBJECT')

os_piece = {
    "tronc": ["hips", "spine", "chest", "neck", "head"],
    "bras_G": ["upper_arm.L", "forearm.L", "hand.L"],
    "bras_D": ["upper_arm.R", "forearm.R", "hand.R"],
    "jambe_G": ["thigh.L", "shin.L", "foot.L"],
    "jambe_D": ["thigh.R", "shin.R", "foot.R"],
}
t0 = t()
sans = {}
for nom, ob in objs.items():
    for b in arm.bones:
        b.use_deform = b.name in os_piece[nom]
    y0 = ob.location.y; ob.location.y = 1e-5 - plan[nom]     # pièce ramenée dans le plan des os pendant le calcul
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    ob.location.y = y0
    sans[nom] = sum(1 for v in ob.data.vertices if not any(g.weight > 1e-4 for g in v.groups))
for b in arm.bones:
    b.use_deform = True
J["poids_s"] = round(t() - t0, 3); J["sommets_sans_poids"] = sans

def rot_plan(pb, deg):
    q = pb.bone.matrix_local.to_quaternion(); pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = q.inverted() @ Quaternion((0, 1, 0), math.radians(deg)) @ q
pb = rig.pose.bones
sc.frame_start, sc.frame_end = 1, 6
cles = {"upper_arm.R": 110, "forearm.R": 25, "upper_arm.L": -25, "forearm.L": 95, "head": -10, "chest": 5,
        "thigh.L": -12, "shin.L": 15, "hips": 3}
for f in range(1, 7):
    ph = (f - 1) / 5
    for n, d in cles.items():
        rot_plan(pb[n], d * ph); pb[n].keyframe_insert("rotation_quaternion", frame=f)

bpy.ops.mesh.primitive_plane_add(size=1, location=(0.35, 0.6, (H - 981) * S))
sol = bpy.context.active_object; sol.scale = (2.4, 1.6, 1); sol.is_shadow_catcher = True
sun = bpy.data.lights.new("soleil", 'SUN'); sun.energy = 3.0; sun.angle = 0.0
so = bpy.data.objects.new("soleil", sun); sc.collection.objects.link(so)
so.rotation_euler = (math.radians(35), math.radians(-25), 0)
cam = bpy.data.cameras.new("cam"); cam.lens = 35
co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co)
co.location = (0.0, -5.2, 1.25); co.rotation_euler = (math.radians(86), 0, 0); sc.camera = co
sc.render.engine = 'CYCLES'; cy = sc.cycles; cy.device = 'CPU'
cy.max_bounces = 0; cy.transparent_max_bounces = 4; cy.use_adaptive_sampling = False; cy.use_denoising = False
cy.caustics_reflective = cy.caustics_refractive = False
sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.use_nodes = True; ct = sc.node_tree
for n in list(ct.nodes): ct.nodes.remove(n)
rl = ct.nodes.new("CompositorNodeRLayers"); fo = ct.nodes.new("CompositorNodeImage"); fo.image = bpy.data.images.load(FOND)
sca = ct.nodes.new("CompositorNodeScale"); sca.space = 'RENDER_SIZE'; sca.frame_method = 'CROP'
ao = ct.nodes.new("CompositorNodeAlphaOver"); cp = ct.nodes.new("CompositorNodeComposite")
ct.links.new(fo.outputs[0], sca.inputs[0]); ct.links.new(sca.outputs[0], ao.inputs[1])
ct.links.new(rl.outputs["Image"], ao.inputs[2]); ct.links.new(ao.outputs[0], cp.inputs[0])
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1080, 860, 100

def rendre(nom, spp, threads=3, frame=6, border=None):
    cy.samples = spp; sc.render.threads_mode = 'FIXED'; sc.render.threads = threads
    sc.render.use_border = border is not None; sc.render.use_crop_to_border = False
    if border:
        sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = border
    sc.frame_set(frame); sc.render.filepath = os.path.join(OUT, nom)
    t0 = t(); bpy.ops.render.render(write_still=True); return round(t() - t0, 3)
R = {}
R["spp4_t3"] = rendre("p_s4.png", 4)
R["spp2_t3"] = rendre("p_s2.png", 2)
R["spp4_t4"] = rendre("p_s4_t4.png", 4, threads=4)
R["spp4_t3_cadre"] = rendre("p_s4_border.png", 4, border=(0.35, 0.65, 0.2, 0.95))
R["spp4_f1"] = rendre("p_f1.png", 4, frame=1)
J["rendu_s"] = R
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "poc_pieces.blend"))
print("JOURNAL", json.dumps(J))
