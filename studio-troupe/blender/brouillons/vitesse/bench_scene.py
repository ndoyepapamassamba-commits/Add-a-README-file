# Banc d'essai vitesse (scratchpad, jamais versionné).
# Usage : blender -b --factory-startup --python bench_scene.py -- key=value ...
#   engine=WB|EE|CY  res=1080x864  frames=12  out=DIR  mode=anim|exact  bg=plate|none
#   aa=8 (WB render_aa / EE taa samples / CY samples)  mb=0|1  threads=0  shadows=1
import bpy, sys, time, math, resource, os, json
import numpy as np

args = dict(a.split('=', 1) for a in sys.argv[sys.argv.index('--') + 1:])
ENGINE = args.get('engine', 'WB')
W, H = map(int, args.get('res', '1080x864').split('x'))
NF = int(args.get('frames', '12'))
OUT = args.get('out', '/tmp/out_')
MODE = args.get('mode', 'anim')
BG = args.get('bg', 'none')
AA = int(args.get('aa', '8'))
MB = args.get('mb', '0') == '1'
THREADS = int(args.get('threads', '0'))
SHADOWS = args.get('shadows', '1') == '1'
TEX = args.get('tex', '/home/user/Add-a-README-file/studio-troupe/sorties/cache/personnages/modou/modou.texture.png')
PLATE = args.get('plate', '')
ALPHA_MODE = args.get('alpha', 'STRAIGHT')
FMT = args.get('fmt', 'PNG')
PX = 100.0  # pixels per Blender unit

t_setup = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
sc.render.fps = 30
sc.frame_start, sc.frame_end = 1, NF
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
sc.view_settings.exposure = 0.0
sc.view_settings.gamma = 1.0
sc.display_settings.display_device = 'sRGB'
sc.sequencer_colorspace_settings.name = 'sRGB'
sc.render.dither_intensity = 0.0
sc.render.film_transparent = (BG == 'none')
sc.render.use_compositing = False
sc.render.use_sequencer = False
sc.render.image_settings.file_format = FMT
sc.render.image_settings.color_mode = 'RGBA'
if FMT == 'PNG':
    sc.render.image_settings.compression = 0
if THREADS:
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = THREADS

cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = max(W, H) / PX
cam = bpy.data.objects.new('cam', cam_data)
cam.location = (0, 0, 10)
sc.collection.objects.link(cam)
sc.camera = cam


def load_img(path, alpha_mode=ALPHA_MODE):
    im = bpy.data.images.load(path)
    im.alpha_mode = alpha_mode
    im.colorspace_settings.name = 'sRGB'
    return im


def flat_material(name, img, blend=True, interp='Linear'):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = interp
    tex.extension = 'CLIP' if blend else 'EXTEND'
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(tex.outputs['Color'], em.inputs['Color'])
    if blend:
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(tex.outputs['Alpha'], mix.inputs[0])
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
        m.surface_render_method = 'BLENDED'
        m.use_transparency_overlap = False
    else:
        nt.links.new(em.outputs[0], out.inputs['Surface'])
    nt.nodes.active = tex  # Workbench lit l'image du noeud actif
    return m


def quad_mesh(name, w_bu, h_bu, nx, ny, keep=None, z=0.0):
    """Grille nx*ny quads ; keep(i,j)->bool filtre les quads (maillage construit depuis l'alpha)."""
    verts, faces, uvs = [], [], []
    vid = {}

    def v(i, j):
        if (i, j) not in vid:
            vid[(i, j)] = len(verts)
            verts.append(((i / nx - 0.5) * w_bu, (j / ny) * h_bu, z))
        return vid[(i, j)]

    for j in range(ny):
        for i in range(nx):
            if keep is not None and not keep(i, j):
                continue
            faces.append((v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1)))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name='UVMap')
    co = np.array(verts)
    uv_v = np.stack([co[:, 0] / w_bu + 0.5, co[:, 1] / h_bu], 1)
    loops = np.zeros(len(me.loops), dtype=np.int64)
    me.loops.foreach_get('vertex_index', loops)
    uvl.data.foreach_set('uv', uv_v[loops].ravel())
    me.update()
    return me


def make_character(name, img, x_px, foot_y_px, height_px, phase):
    tw, th = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(th, tw, 4)[..., 3]
    step = 16
    nx, ny = math.ceil(tw / step), math.ceil(th / step)

    def keep(i, j):
        blk = a[j * step:(j + 1) * step + 1, i * step:(i + 1) * step + 1]
        return blk.size and blk.max() > 0.0

    h_bu = height_px / PX
    w_bu = h_bu * tw / th
    me = quad_mesh(name, w_bu * (nx * step / tw), h_bu * (ny * step / th), nx, ny, keep)
    ob = bpy.data.objects.new(name, me)
    ob.location = ((x_px - W / 2) / PX, (H / 2 - foot_y_px) / PX, 1.0 + phase * 0.01)
    sc.collection.objects.link(ob)
    me.materials.append(flat_material(name + '_mat', img))
    # Armature : 4 colonnes x 5 os = 20 os, chaînés par colonne.
    arm_d = bpy.data.armatures.new(name + '_arm')
    arm = bpy.data.objects.new(name + '_rig', arm_d)
    arm.location = ob.location
    sc.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    heads = []
    for c in range(4):
        prev = None
        xb = (c + 0.5) / 4 * w_bu - w_bu / 2
        for r in range(5):
            b = arm_d.edit_bones.new(f'b{c}{r}')
            b.head = (xb, r / 5 * h_bu, 0)
            b.tail = (xb, (r + 1) / 5 * h_bu, 0)
            if prev:
                b.parent = prev
                b.use_connect = True
            prev = b
            heads.append((b.name, np.array([xb, (r + 0.5) / 5 * h_bu])))
    bpy.ops.object.mode_set(mode='OBJECT')
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)[:, :2]
    groups = {n: ob.vertex_groups.new(name=n) for n, _ in heads}
    d = np.stack([np.linalg.norm(co - p, axis=1) for _, p in heads], 1)
    idx = np.argsort(d, 1)[:, :4]
    sig = 0.25 * h_bu
    for vi in range(len(co)):
        ws = np.exp(-(d[vi, idx[vi]] / sig) ** 2)
        ws /= ws.sum()
        for i, wv in zip(idx[vi], ws):
            groups[heads[i][0]].add([vi], float(wv), 'REPLACE')
    mod = ob.modifiers.new('arm', 'ARMATURE')
    mod.object = arm
    for f in range(1, NF + 1):
        for k, pb in enumerate(arm.pose.bones):
            pb.rotation_mode = 'XYZ'
            pb.rotation_euler = (0, 0, math.radians(3) * math.sin(f * 0.35 + k * 0.7 + phase))
            pb.keyframe_insert('rotation_euler', frame=f)
        arm.location.x = ob.location.x + 0.4 * math.sin(f * 0.2 + phase)
        arm.keyframe_insert('location', frame=f)
    ob.parent = None
    return ob, arm, len(me.vertices)


nverts = []
if MODE == 'exact':
    # Mire de couleurs plates 1:1 (texel = pixel) : vérifie la chaîne de couleur.
    p = args.get('mire', '/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/vitesse/tests/out/mire_src.png')
    img = load_img(p)
    me = quad_mesh('mire', 256 / PX, 256 / PX, 1, 1)
    ob = bpy.data.objects.new('mire', me)
    ob.location = (0, -128 / PX, 0)
    sc.collection.objects.link(ob)
    me.materials.append(flat_material('mire_mat', img, blend=True))
else:
    img = load_img(TEX)
    for k, (xp, ph) in enumerate([(W * 0.33, 0.0), (W * 0.68, 1.3)]):
        ob, arm, nv = make_character(f'perso{k}', img, xp, H * 0.95, H * 0.8, ph)
        nverts.append(nv)
    if SHADOWS:
        g = np.linspace(-1, 1, 128)
        r = np.sqrt(g[None, :] ** 2 + (g[:, None]) ** 2)
        sa = np.clip(1 - r, 0, 1) ** 1.5 * 0.55
        sh = np.zeros((128, 128, 4), np.float32)
        sh[..., 3] = sa
        simg = bpy.data.images.new('ombre', 128, 128, alpha=True)
        simg.pixels[:] = sh.ravel()
        simg.alpha_mode = 'STRAIGHT'
        for k, xp in enumerate([W * 0.33, W * 0.68]):
            me = quad_mesh(f'ombre{k}', 3.2, 0.7, 1, 1)
            ob = bpy.data.objects.new(f'ombre{k}', me)
            ob.location = ((xp - W / 2) / PX, (H / 2 - H * 0.95) / PX - 0.35, 0.5)
            sc.collection.objects.link(ob)
            me.materials.append(flat_material(f'ombre{k}_mat', simg))
    if BG == 'plate':
        pimg = load_img(PLATE)
        me = quad_mesh('fond', W / PX, H / PX, 1, 1)
        ob = bpy.data.objects.new('fond', me)
        ob.location = (0, -H / 2 / PX, 0)
        sc.collection.objects.link(ob)
        me.materials.append(flat_material('fond_mat', pimg, blend=False))

# Moteurs
if ENGINE == 'WB':
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'FLAT'
    sh.color_type = 'TEXTURE'
    sh.show_shadows = False
    sh.show_cavity = False
    sh.show_object_outline = False
    sh.show_specular_highlight = False
    sh.show_xray = False
    sc.display.render_aa = {0: 'OFF', 1: 'FXAA', 5: '5', 8: '8', 11: '11', 16: '16', 32: '32'}[AA]
    for o in sc.objects:
        if o.name.startswith('ombre'):
            o.hide_render = True  # Workbench : l'alpha de texture n'est qu'un seuil (0,1)
elif ENGINE == 'EE':
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    e = sc.eevee
    e.taa_render_samples = AA
    e.use_shadows = False
    e.use_raytracing = False
    e.use_gtao = False
    e.use_bokeh_jittered = False
    e.use_overscan = False
    e.use_volumetric_shadows = False
    sc.render.use_motion_blur = MB
    sc.render.motion_blur_shutter = 0.5
    e.motion_blur_steps = 1
    sc.render.filter_size = float(args.get('filter', '1.5'))
    sc.world = None
elif ENGINE == 'CY':
    sc.render.engine = 'CYCLES'
    c = sc.cycles
    c.device = 'CPU'
    c.samples = AA
    c.use_adaptive_sampling = False
    c.use_denoising = False
    c.max_bounces = 0
    c.diffuse_bounces = c.glossy_bounces = c.transmission_bounces = c.volume_bounces = 0
    c.transparent_max_bounces = 8
    c.caustics_reflective = c.caustics_refractive = False
    c.use_light_tree = False
    c.filter_width = float(args.get('filter', '1.5'))
    c.seed = 0
    c.use_animated_seed = False
    sc.render.use_persistent_data = True
    sc.render.use_motion_blur = MB
    sc.render.motion_blur_shutter = 0.5
    sc.world = None

setup_s = time.time() - t_setup
print(f'SETUP {setup_s:.2f}s verts={nverts}', flush=True)


def cpu():
    r = resource.getrusage(resource.RUSAGE_SELF)
    return r.ru_utime + r.ru_stime


rows = []
frames = [1] if MODE == 'exact' else range(1, NF + 1)
for f in frames:
    sc.frame_set(f)
    sc.render.filepath = OUT + f'{f:04d}'
    t0, c0 = time.time(), cpu()
    bpy.ops.render.render(write_still=True)
    rows.append((f, time.time() - t0, cpu() - c0))
    print(f'FRAME {f} wall={rows[-1][1]:.3f} cpu={rows[-1][2]:.3f}', flush=True)

if len(rows) > 3:
    st = rows[2:]
    print('STEADY wall/frame=%.3f cpu/frame=%.3f (frames %d..%d) first=%.3f' % (
        sum(r[1] for r in st) / len(st), sum(r[2] for r in st) / len(st), st[0][0], st[-1][0], rows[0][1]))
