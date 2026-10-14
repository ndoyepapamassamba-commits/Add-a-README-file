// BLENDER, MOTEUR CENTRAL — le plan devient UN script bpy autonome qui instancie la SCÈNE COMMUNE (assets.ts : mêmes
// primitives, mêmes couleurs, même placement que l'aperçu HTML/WebGL) et applique les poses calculées image par image
// (animate.ts) : rig hiérarchique en quaternions, visage (bouche, sourcils), caméra image par image (coupes franches),
// titres attachés à la caméra ; puis exports d'échange USD / glTF / .blend (Unreal Engine 5, Omniverse, autres DCC).
// S'exécute avec scripts/blender-render.py (pont local ou conteneur) ou dans Blender (Scripting → Exécuter).
import { HUMAN_RIG, ANIMAL_RIG, bake, type Baked } from './animate';
import { sceneSpec, type SceneSpec } from './assets';
import type { ScenePlan } from './plan';

const PY_RUNTIME = String.raw`
import bpy, math, json, os
from mathutils import Vector, Quaternion, Euler

DATA = json.loads(DATA_JSON)
PLAN, BAKE, SPEC, RIGS, OPT = DATA['plan'], DATA['bake'], DATA['scene'], DATA['rigs'], DATA['opt']
LOOK = PLAN['style']['look']
OUT = os.path.dirname(os.path.abspath(globals().get('__file__', os.path.join(os.getcwd(), 'scene.py'))))

def B(p):
    # plan (x right, y up, z toward the camera) -> Blender (x right, y away, z up)
    return Vector((p[0], -p[2], p[1]))

def BQ(q):
    return Quaternion((q[0], q[1], -q[3], q[2]))

def BS(s):
    return Vector((max(s[0], 1e-4), max(s[2], 1e-4), max(s[1], 1e-4)))

def lin(h, k=1.0):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    c = [(x / 12.92) if x <= 0.04045 else (((x + 0.055) / 1.055) ** 2.4) for x in c]
    return (c[0] * k, c[1] * k, c[2] * k, 1.0)

MATS = {}
def mat(m):
    key = (m['color'], m['rough'], m['metal'], m['emit'])
    if key in MATS:
        return MATS[key]
    rough, metal = (0.92, 0.0) if LOOK == 'clay' else (m['rough'], m['metal'])
    mm = bpy.data.materials.new('m_%s_%d' % (m['color'].lstrip('#'), len(MATS)))
    try:
        mm.use_nodes = True
    except Exception:
        pass
    mm.diffuse_color = lin(m['color'])
    bsdf = mm.node_tree.nodes.get('Principled BSDF') if mm.node_tree else None
    if bsdf:
        bsdf.inputs['Base Color'].default_value = lin(m['color'])
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        if m['emit'] > 0:
            for n in ('Emission Color', 'Emission'):
                if n in bsdf.inputs:
                    bsdf.inputs[n].default_value = lin(m['color'])
                    break
            if 'Emission Strength' in bsdf.inputs:
                bsdf.inputs['Emission Strength'].default_value = m['emit']
    MATS[key] = mm
    return mm

COLL = None
MESHES = {}
def base_mesh(shape, seg):
    lowpoly = LOOK == 'lowpoly'
    key = (shape, seg or 0, lowpoly)
    if key in MESHES:
        return MESHES[key]
    if shape == 'box':
        bpy.ops.mesh.primitive_cube_add(size=1)
    elif shape == 'sphere':
        if lowpoly or (seg and seg < 10):
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1 if lowpoly else 2, radius=0.5)
        else:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.5)
    elif shape == 'cyl':
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg or (8 if lowpoly else 20), radius=0.5, depth=1)
    elif shape == 'cone':
        bpy.ops.mesh.primitive_cone_add(vertices=seg or (8 if lowpoly else 20), radius1=0.5, radius2=0, depth=1)
    else:
        bpy.ops.mesh.primitive_plane_add(size=1)
    ob = bpy.context.active_object
    me = ob.data
    if shape in ('sphere', 'cyl', 'cone') and not lowpoly:
        for poly in me.polygons:
            poly.use_smooth = True
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    bpy.data.objects.remove(ob, do_unlink=True)
    MESHES[key] = me
    return me

def place(p, parent=None, name='p'):
    ob = bpy.data.objects.new(name, base_mesh(p['shape'], p.get('seg')).copy() if p.get('face') else base_mesh(p['shape'], p.get('seg')))
    COLL.objects.link(ob)
    if ob.data.materials:
        ob.material_slots[0].link = 'OBJECT'
        ob.material_slots[0].material = mat(p['mat'])
    else:
        ob.data.materials.append(None)
        ob.material_slots[0].link = 'OBJECT'
        ob.material_slots[0].material = mat(p['mat'])
    ob.location = B(p['pos'])
    ob.rotation_mode = 'QUATERNION'
    if p.get('quat'):
        ob.rotation_quaternion = BQ(p['quat'])
    ob.scale = BS(p['size']) if p['shape'] != 'plane' else Vector((p['size'][0], p['size'][2], 1))
    if parent is not None:
        ob.parent = parent
    if p.get('cast') is False:
        try:
            ob.visible_shadow = False
        except Exception:
            pass
    return ob

def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.05
    COLL.objects.link(e)
    e.location = Vector(loc)
    e.rotation_mode = 'QUATERNION'
    if parent is not None:
        e.parent = parent
    return e

def setup_world():
    w = bpy.data.worlds.new('Monde')
    bpy.context.scene.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = w.node_tree.nodes.get('Background') if w.node_tree else None
    if bg:
        bg.inputs['Color'].default_value = lin(SPEC['sky'])
        bg.inputs['Strength'].default_value = SPEC['skyStrength']
    w.color = lin(SPEC['sky'])[:3]
    for i, L in enumerate(SPEC['lights']):
        if L['kind'] == 'sun':
            ld = bpy.data.lights.new('Soleil', 'SUN')
            ld.energy = 4.5 * L['power']
            ld.angle = math.radians(3)
        else:
            ld = bpy.data.lights.new('Lumiere%d' % i, 'AREA')
            ld.energy = 900 * L['power'] * (1.6 if SPEC['interior'] else 1.0)
            ld.size = 3
        ld.color = lin(L['color'])[:3]
        lo = bpy.data.objects.new(ld.name, ld)
        COLL.objects.link(lo)
        lo.location = B(L['pos'])
        d = B(L['target']) - lo.location
        lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    try:
        v = bpy.context.scene.view_settings
        for vt in ('AgX', 'Filmic'):
            try:
                v.view_transform = vt
                break
            except Exception:
                continue
    except Exception:
        pass

JOINTS, FACE = {}, {}
def build_cast():
    for c in SPEC['cast']:
        h = c['height']
        rig = RIGS['animal' if c['kind'] == 'animal' else 'human']
        root = empty('ROOT_' + c['id'])
        root.rotation_mode = 'XYZ'
        js = {}
        for jd in rig:
            o = jd['offset']
            js[jd['name']] = empty(c['id'] + '_' + jd['name'], B((o[0] * h, o[1] * h, o[2] * h)), root if jd['parent'] is None else js[jd['parent']])
        face = {}
        for k, p in enumerate(c['parts']):
            ob = place(p, js[p['joint']], '%s_%s_%d' % (c['id'], p['joint'], k))
            if p.get('face'):
                face[p['face']] = (ob, Vector(ob.scale), Vector(ob.location))
        JOINTS[c['id']] = (root, js)
        FACE[c['id']] = face

def animate_cast():
    step = max(1, OPT.get('step', 2))
    n = BAKE['frames']
    frames = list(range(0, n, step)) + ([n - 1] if (n - 1) % step else [])
    for c in SPEC['cast']:
        root, js = JOINTS[c['id']]
        face = FACE[c['id']]
        fr = BAKE['chars'][c['id']]
        for f in frames:
            st = fr[f]
            root.location = B(st['pos'])
            root.rotation_euler = Euler((0, 0, st['yaw']))
            root.keyframe_insert('location', frame=f + 1)
            root.keyframe_insert('rotation_euler', frame=f + 1)
            for name, q in st['joints'].items():
                j = js.get(name)
                if j is not None:
                    j.rotation_quaternion = BQ(q)
                    j.keyframe_insert('rotation_quaternion', frame=f + 1)
            if 'mouth' in face:
                ob, s0, _ = face['mouth']
                op, sm = st['mouth']
                ob.scale = Vector((s0.x * (1 + 0.35 * sm), s0.y, s0.z * (1 + 4.0 * op)))
                ob.keyframe_insert('scale', frame=f + 1)
            for k, side in enumerate(('brow_l', 'brow_r')):
                if side in face:
                    ob, _, l0 = face[side]
                    ob.rotation_quaternion = BQ([math.cos(0.17 * st['brows'] * (1 if k else -1)), 0, 0, math.sin(0.17 * st['brows'] * (1 if k else -1))])
                    ob.location = l0 + Vector((0, 0, 0.012 * c['height'] * abs(st['brows'])))
                    ob.keyframe_insert('rotation_quaternion', frame=f + 1)
                    ob.keyframe_insert('location', frame=f + 1)

def setup_camera():
    cd = bpy.data.cameras.new('Camera')
    cam = bpy.data.objects.new('Camera', cd)
    COLL.objects.link(cam)
    tgt = empty('Cible')
    tr = cam.constraints.new('TRACK_TO')
    tr.target = tgt
    tr.track_axis = 'TRACK_NEGATIVE_Z'
    tr.up_axis = 'UP_Y'
    cd.sensor_width = 36
    if LOOK == 'cinematic':
        cd.dof.use_dof = True
        cd.dof.focus_object = tgt
        cd.dof.aperture_fstop = 4.0
    bpy.context.scene.camera = cam
    for f, c in enumerate(BAKE['cams']):
        cam.location = B(c['pos'])
        tgt.location = B(c['target'])
        cd.lens = c['lens']
        cam.keyframe_insert('location', frame=f + 1)
        tgt.keyframe_insert('location', frame=f + 1)
        cd.keyframe_insert('lens', frame=f + 1)
    return cam

def setup_titles(cam):
    white = mat({'color': '#ffffff', 'rough': 0.3, 'metal': 0.0, 'emit': 4.0})
    for i, t in enumerate(BAKE['titles']):
        cu = bpy.data.curves.new('Titre%d' % i, 'FONT')
        cu.body = t['text']
        cu.align_x, cu.align_y = 'CENTER', 'CENTER'
        cu.size = 0.16 if t['position'] == 'center' else 0.075
        ob = bpy.data.objects.new('Titre%d' % i, cu)
        COLL.objects.link(ob)
        ob.data.materials.append(white)
        ob.parent = cam
        ob.location = Vector((0, {'center': 0.0, 'bottom': -0.33, 'top': 0.33}[t['position']], -2.0))
        for f, hide in ((1, True), (t['f0'] + 1, False), (t['f1'] + 1, True)):
            ob.hide_render = hide
            ob.keyframe_insert('hide_render', frame=max(1, f))
            ob.hide_viewport = hide
            ob.keyframe_insert('hide_viewport', frame=max(1, f))

def main():
    global COLL
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    except Exception:
        for ob in list(bpy.data.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
    sc = bpy.context.scene
    COLL = bpy.data.collections.new('MASSAMBA')
    sc.collection.children.link(COLL)
    sc.render.fps = BAKE['fps']
    sc.frame_start, sc.frame_end = 1, BAKE['frames']
    setup_world()
    for k, p in enumerate(SPEC['world']):
        place(p, None, 'decor_%d' % k)
    build_cast()
    animate_cast()
    cam = setup_camera()
    setup_titles(cam)
    try:
        sc.display.shading.color_type = 'MATERIAL'
        sc.cycles.use_denoising = True
    except Exception:
        pass
    if SPEC['fog'] > 0:
        try:
            sc.world.mist_settings.use_mist = True
        except Exception:
            pass
    if LOOK == 'cartoon':
        try:
            sc.render.use_freestyle = True
            sc.render.line_thickness = 1.2
        except Exception:
            pass
    sc.frame_set(1)
    for fmt in OPT.get('exports') or []:
        try:
            if fmt == 'usd':
                bpy.ops.wm.usd_export(filepath=os.path.join(OUT, 'scene.usdc'), export_animation=True)
            elif fmt == 'glb':
                bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'scene.glb'), export_format='GLB', export_animations=True)
            elif fmt == 'blend':
                bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'scene.blend'), copy=True)
        except Exception as e:
            print('export', fmt, 'impossible :', e)
    print('MASSAMBA scene ready:', len(bpy.data.objects), 'objects,', BAKE['frames'], 'frames')

main()
`;

export interface BpyOptions {
  fps?: number;
  /** Keyframe every `step` frames for the characters (camera: every frame). */
  step?: number;
  exports?: ('usd' | 'glb' | 'blend')[];
}

/** The complete, standalone bpy script of a plan (data + runtime). */
export function planToBpy(plan: ScenePlan, o: BpyOptions = {}, baked?: Baked, spec?: SceneSpec): string {
  const fps = o.fps ?? 24;
  const b = baked ?? bake(plan, fps);
  const data = { plan, bake: b, scene: spec ?? sceneSpec(plan), rigs: { human: HUMAN_RIG, animal: ANIMAL_RIG }, opt: { step: o.step ?? 2, exports: o.exports ?? [] } };
  return [
    '# MASSAMBA CINEMA ENGINE — scène générée automatiquement (plan → Blender), identique à l’aperçu HTML/WebGL.',
    `# « ${plan.title.replace(/\n/g, ' ')} » · ${plan.seconds} s · ${plan.format} · ${b.frames} images à ${fps} i/s`,
    '# Rendu : python3 scripts/blender-render.py scene.py --out sortie --seconds S --fps F --width W --height H --engine CYCLES',
    '#     ou : blender -b --python scripts/blender-render.py -- scene.py --out sortie …   (ou ouvrir dans Blender → Scripting → Exécuter)',
    `DATA_JSON = ${JSON.stringify(JSON.stringify(data))}`,
    PY_RUNTIME,
  ].join('\n');
}
