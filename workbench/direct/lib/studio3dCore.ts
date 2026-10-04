// 3D Studio (pure): one scene description → (1) a three.js scene script for the
// interactive preview and the .glb export, (2) a Blender Python (bpy) script
// that rebuilds the same scene in Blender. Coordinates: three.js is Y-up,
// Blender is Z-up — (x, y, z)three → (x, −z, y)blender.

export type Shape =
  'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane' | 'capsule' | 'roundedbox' | 'icosphere';
export interface SceneObject {
  name?: string;
  type: Shape;
  position?: [number, number, number];
  /** Degrees. */
  rotation?: [number, number, number];
  scale?: [number, number, number];
  /** Main dimension (edge, radius…), default 1. */
  size?: number;
  color?: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  opacity?: number;
  /** Degrees per second around each axis. */
  spin?: [number, number, number];
  /** Vertical bounce amplitude. */
  bounce?: number;
}
export interface SceneLight {
  type: 'point' | 'sun' | 'spot' | 'ambient';
  position?: [number, number, number];
  color?: string;
  intensity?: number;
}
export interface SceneSpec {
  title?: string;
  background?: string;
  ground?: boolean;
  objects: SceneObject[];
  lights?: SceneLight[];
  camera?: { position?: [number, number, number]; target?: [number, number, number]; fov?: number };
}

const SHAPES: Shape[] = [
  'cube',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'plane',
  'capsule',
  'roundedbox',
  'icosphere',
];
const hex = (c: string | undefined, d: string) =>
  c && /^#?[0-9a-f]{6}$/i.test(c) ? `#${c.replace('#', '')}` : d;
const vec = (v: unknown, d: [number, number, number]): [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x))
    ? (v as [number, number, number])
    : d;
const num = (v: unknown, d: number, lo = -1e6, hi = 1e6) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

/** Validates and normalises a scene (unknown fields dropped, defaults filled). */
export function normalizeScene(raw: unknown): SceneSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  const objs = Array.isArray(r.objects) ? r.objects : [];
  if (!objs.length) throw new Error('La scène doit contenir au moins un objet (objects).');
  if (objs.length > 400) throw new Error('400 objets maximum.');
  const objects = objs.map((o, i) => {
    const x = (o ?? {}) as Record<string, unknown>;
    const type = SHAPES.includes(x.type as Shape) ? (x.type as Shape) : null;
    if (!type) throw new Error(`Objet ${i + 1} : type inconnu « ${String(x.type)} » (${SHAPES.join(', ')}).`);
    return {
      name: typeof x.name === 'string' && x.name ? x.name.slice(0, 60) : `${type}_${i + 1}`,
      type,
      position: vec(x.position, [0, 0, 0]),
      rotation: vec(x.rotation, [0, 0, 0]),
      scale: vec(x.scale, [1, 1, 1]),
      size: num(x.size, 1, 0.001, 1000),
      color: hex(x.color as string, '#1A86B3'),
      metalness: num(x.metalness, 0.1, 0, 1),
      roughness: num(x.roughness, 0.5, 0, 1),
      emissive: x.emissive ? hex(x.emissive as string, '#000000') : undefined,
      opacity: num(x.opacity, 1, 0.05, 1),
      spin: x.spin ? vec(x.spin, [0, 0, 0]) : undefined,
      bounce: x.bounce ? num(x.bounce, 0, 0, 100) : undefined,
    } satisfies SceneObject;
  });
  const lights = (
    Array.isArray(r.lights) && r.lights.length
      ? r.lights
      : [
          { type: 'ambient', intensity: 0.6 },
          { type: 'sun', position: [5, 10, 7], intensity: 2.2 },
        ]
  ).map((l) => {
    const x = (l ?? {}) as Record<string, unknown>;
    const type = ['point', 'sun', 'spot', 'ambient'].includes(x.type as string)
      ? (x.type as SceneLight['type'])
      : 'point';
    return {
      type,
      position: vec(x.position, [4, 6, 4]),
      color: hex(x.color as string, '#ffffff'),
      intensity: num(x.intensity, 1, 0, 1000),
    };
  });
  const c = (r.camera ?? {}) as Record<string, unknown>;
  return {
    title: typeof r.title === 'string' ? r.title.slice(0, 120) : 'Scène 3D',
    background: hex(r.background as string, '#EEF4F7'),
    ground: r.ground !== false,
    objects,
    lights,
    camera: {
      position: vec(c.position, [6, 4.5, 8]),
      target: vec(c.target, [0, 0.5, 0]),
      fov: num(c.fov, 45, 10, 120),
    },
  };
}

const rad = (d: number) => ((d * Math.PI) / 180).toFixed(6);

/** three.js code that builds the scene into `scene` (expects THREE in scope). */
export function threeSceneCode(s: SceneSpec): string {
  const geo = (o: SceneObject) => {
    const z = o.size ?? 1;
    switch (o.type) {
      case 'cube':
        return `new THREE.BoxGeometry(${z},${z},${z})`;
      case 'roundedbox':
        return `new THREE.RoundedBoxGeometry(${z},${z},${z},4,${(z * 0.12).toFixed(3)})`;
      case 'sphere':
        return `new THREE.SphereGeometry(${z / 2},48,32)`;
      case 'icosphere':
        return `new THREE.IcosahedronGeometry(${z / 2},2)`;
      case 'cylinder':
        return `new THREE.CylinderGeometry(${z / 2},${z / 2},${z},48)`;
      case 'cone':
        return `new THREE.ConeGeometry(${z / 2},${z},48)`;
      case 'torus':
        return `new THREE.TorusGeometry(${z / 2},${z / 6},24,64)`;
      case 'capsule':
        return `new THREE.CapsuleGeometry(${z / 4},${z / 2},8,24)`;
      case 'plane':
        return `new THREE.PlaneGeometry(${z},${z})`;
    }
  };
  const lines = [
    `scene.background=new THREE.Color('${s.background}');`,
    'const anim=[];',
    ...s.objects.map((o, i) => {
      const m = `new THREE.MeshStandardMaterial({color:'${o.color}',metalness:${o.metalness},roughness:${o.roughness}${o.emissive ? `,emissive:'${o.emissive}'` : ''}${o.opacity! < 1 ? `,transparent:true,opacity:${o.opacity}` : ''}${o.type === 'plane' ? ',side:THREE.DoubleSide' : ''}})`;
      return `{const m=new THREE.Mesh(${geo(o)},${m});m.name=${JSON.stringify(o.name)};m.position.set(${o.position!.join(',')});m.rotation.set(${o.rotation!.map(rad).join(',')});m.scale.set(${o.scale!.join(',')});m.castShadow=true;m.receiveShadow=true;scene.add(m);${o.spin || o.bounce ? `anim.push({m,spin:[${(o.spin ?? [0, 0, 0]).map(rad).join(',')}],bounce:${o.bounce ?? 0},y:${o.position![1]},k:${i}});` : ''}}`;
    }),
    ...s.lights!.map((l) =>
      l.type === 'ambient'
        ? `scene.add(new THREE.AmbientLight('${l.color}',${l.intensity}));`
        : l.type === 'sun'
          ? `{const d=new THREE.DirectionalLight('${l.color}',${l.intensity});d.position.set(${l.position!.join(',')});d.castShadow=true;d.shadow.mapSize.set(2048,2048);Object.assign(d.shadow.camera,{left:-15,right:15,top:15,bottom:-15});scene.add(d);}`
          : l.type === 'spot'
            ? `{const d=new THREE.SpotLight('${l.color}',${l.intensity! * 40},0,Math.PI/5,0.3);d.position.set(${l.position!.join(',')});d.castShadow=true;scene.add(d);}`
            : `{const d=new THREE.PointLight('${l.color}',${l.intensity! * 40});d.position.set(${l.position!.join(',')});d.castShadow=true;scene.add(d);}`,
    ),
    s.ground
      ? `{const g=new THREE.Mesh(new THREE.CircleGeometry(30,64),new THREE.MeshStandardMaterial({color:'#dfe8ee',roughness:0.95}));g.name='Sol';g.rotation.x=-Math.PI/2;g.position.y=-0.001;g.receiveShadow=true;scene.add(g);}`
      : '',
  ];
  return lines.join('\n');
}

/** Interactive, offline preview (orbit, animation, PNG / .glb export). */
export function previewHtml(s: SceneSpec, threeCode: string): string {
  const c = s.camera!;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${(s.title ?? '').replace(/</g, '&lt;')}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;font:13px 'Segoe UI',system-ui,sans-serif}#bar{position:fixed;top:10px;left:10px;display:flex;gap:6px;align-items:center;background:#00415Ee6;color:#fff;padding:6px 10px;border-radius:10px;border-bottom:3px solid #8CC63F}#bar button{background:#fff;color:#00415E;border:0;border-radius:6px;padding:5px 9px;font-weight:600;cursor:pointer}canvas{display:block}</style></head>
<body><div id="bar"><b>${(s.title ?? '').replace(/</g, '&lt;')}</b><button id="anim">Pause</button><button id="png">PNG</button><button id="glb">.glb (Blender)</button></div>
<script>${threeCode}</script><script>
const scene=new THREE.Scene();
${threeSceneCode(s)}
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.appendChild(renderer.domElement);
const camera=new THREE.PerspectiveCamera(${c.fov},1,0.05,500);camera.position.set(${c.position!.join(',')});
const ctl=new THREE.OrbitControls(camera,renderer.domElement);ctl.target.set(${c.target!.join(',')});ctl.enableDamping=true;ctl.update();
function size(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',size);size();
let run=true,t0=performance.now();document.getElementById('anim').onclick=e=>{run=!run;e.target.textContent=run?'Pause':'Lecture';};
function dl(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),1000);}
document.getElementById('png').onclick=()=>{renderer.render(scene,camera);renderer.domElement.toBlob(b=>dl(b,'scene.png'));};
document.getElementById('glb').onclick=()=>new THREE.GLTFExporter().parse(scene,r=>dl(new Blob([r],{type:'model/gltf-binary'}),'scene.glb'),e=>console.error(e),{binary:true});
(function loop(t){requestAnimationFrame(loop);const dt=(t-t0)/1000;t0=t;if(run)for(const a of anim){a.m.rotation.x+=a.spin[0]*dt;a.m.rotation.y+=a.spin[1]*dt;a.m.rotation.z+=a.spin[2]*dt;if(a.bounce)a.m.position.y=a.y+Math.abs(Math.sin(t/500+a.k))*a.bounce;}ctl.update();renderer.render(scene,camera);})(performance.now());
</script></body></html>`;
}

/** Page used to export the .glb without showing anything (posts the bytes to the parent). */
export function glbExportHtml(s: SceneSpec, threeCode: string, token: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><script>${threeCode}</script><script>
try{const scene=new THREE.Scene();${threeSceneCode(s)}
new THREE.GLTFExporter().parse(scene,r=>parent.postMessage({glb:'${token}',bytes:r},'*',[r]),e=>parent.postMessage({glb:'${token}',error:String(e)},'*'),{binary:true});}
catch(e){parent.postMessage({glb:'${token}',error:String(e&&e.message||e)},'*');}
</script></body></html>`;
}

const bv = (p: [number, number, number]) => `(${p[0]}, ${-p[2]}, ${p[1]})`;
const rgba = (h: string, a = 1) => {
  const n = parseInt(h.replace('#', ''), 16);
  // sRGB → linear, as Blender expects for Base Color.
  const lin = (c: number) => {
    const v = c / 255;
    return (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).toFixed(4);
  };
  return `(${lin((n >> 16) & 255)}, ${lin((n >> 8) & 255)}, ${lin(n & 255)}, ${a})`;
};

/** Blender script (Scripting → Open → Run Script, or `blender --python file.py`). */
export function blenderScript(s: SceneSpec): string {
  const prim = (o: SceneObject) => {
    const z = o.size ?? 1;
    switch (o.type) {
      case 'cube':
        return `bpy.ops.mesh.primitive_cube_add(size=${z})`;
      case 'roundedbox':
        return `bpy.ops.mesh.primitive_cube_add(size=${z})\nob = bpy.context.active_object\nbv = ob.modifiers.new("Bevel", "BEVEL"); bv.width = ${(z * 0.12).toFixed(3)}; bv.segments = 4`;
      case 'sphere':
        return `bpy.ops.mesh.primitive_uv_sphere_add(radius=${z / 2}, segments=48, ring_count=32)\nbpy.ops.object.shade_smooth()`;
      case 'icosphere':
        return `bpy.ops.mesh.primitive_ico_sphere_add(radius=${z / 2}, subdivisions=2)`;
      case 'cylinder':
        return `bpy.ops.mesh.primitive_cylinder_add(radius=${z / 2}, depth=${z}, vertices=48)\nbpy.ops.object.shade_smooth()`;
      case 'cone':
        return `bpy.ops.mesh.primitive_cone_add(radius1=${z / 2}, depth=${z}, vertices=48)`;
      case 'torus':
        return `bpy.ops.mesh.primitive_torus_add(major_radius=${z / 2}, minor_radius=${(z / 6).toFixed(4)})\nbpy.ops.object.shade_smooth()`;
      case 'capsule':
        return `bpy.ops.mesh.primitive_uv_sphere_add(radius=${z / 4})\nbpy.ops.object.shade_smooth()\nbpy.context.active_object.scale = (1, 1, 2)`;
      case 'plane':
        return `bpy.ops.mesh.primitive_plane_add(size=${z})\nbpy.context.active_object.rotation_euler = (math.radians(90), 0, 0)`;
    }
  };
  const objs = s.objects.map((o) => {
    const r = o.rotation!;
    return `
# ${o.name}
${prim(o)}
ob = bpy.context.active_object
ob.name = ${JSON.stringify(o.name)}
ob.location = ${bv(o.position!)}
ob.rotation_euler = (ob.rotation_euler[0] + math.radians(${r[0]}), ob.rotation_euler[1] + math.radians(${-r[2]}), ob.rotation_euler[2] + math.radians(${r[1]}))
ob.scale = (ob.scale[0] * ${o.scale![0]}, ob.scale[1] * ${o.scale![2]}, ob.scale[2] * ${o.scale![1]})
ob.data.materials.append(material(${JSON.stringify(o.name)}, ${rgba(o.color!, o.opacity)}, ${o.metalness}, ${o.roughness}${o.emissive ? `, ${rgba(o.emissive)}` : ''}))${
      o.spin
        ? `
for f, k in ((1, 0), (FPS * 10, 10)):
    ob.rotation_euler = (math.radians(${r[0]} + ${o.spin[0]} * k), math.radians(${-r[2]} - ${o.spin[2]} * k), math.radians(${r[1]} + ${o.spin[1]} * k))
    ob.keyframe_insert("rotation_euler", frame=f)`
        : ''
    }`;
  });
  const lights = s.lights!.map((l, i) =>
    l.type === 'ambient'
      ? `bpy.context.scene.world.node_tree.nodes["Background"].inputs[1].default_value = ${Math.min(2, l.intensity! * 1.2).toFixed(2)}`
      : `bpy.ops.object.light_add(type=${JSON.stringify(l.type === 'sun' ? 'SUN' : l.type === 'spot' ? 'SPOT' : 'POINT')}, location=${bv(l.position!)})
li = bpy.context.active_object
li.name = "Lumiere_${i + 1}"
li.data.color = ${rgba(l.color!).replace(/, 1\)$/, ')')}
li.data.energy = ${l.type === 'sun' ? (l.intensity! * 2).toFixed(2) : (l.intensity! * 600).toFixed(1)}
direction = mathutils.Vector((0, 0, 0)) - li.location
li.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()`,
  );
  const c = s.camera!;
  return `# ${s.title} — généré par MASSAMBA Workbench (Studio 3D)
# Blender : onglet Scripting → Ouvrir ce fichier → Exécuter (▶), ou : blender --python ce_fichier.py
import bpy, math, mathutils

FPS = 24
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
scene = bpy.context.scene
scene.render.fps = FPS
scene.frame_end = FPS * 10
if scene.world is None:
    scene.world = bpy.data.worlds.new("Monde")
if hasattr(scene.world, "use_nodes"):
    scene.world.use_nodes = True
# Constant-speed animations, whatever the Blender version (layered actions in 5.x).
bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
scene.world.node_tree.nodes["Background"].inputs[0].default_value = ${rgba(s.background!)}

def material(name, color, metal, rough, emissive=None):
    m = bpy.data.materials.new(name + "_mat")
    if hasattr(m, "use_nodes"):
        m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = color
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    if color[3] < 1:
        p.inputs["Alpha"].default_value = color[3]
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "BLENDED"
        elif hasattr(m, "blend_method"):
            m.blend_method = "BLEND"
    if emissive:
        key = "Emission Color" if "Emission Color" in p.inputs else "Emission"
        p.inputs[key].default_value = emissive
        if "Emission Strength" in p.inputs:
            p.inputs["Emission Strength"].default_value = 2.0
    return m
${objs.join('\n')}
${s.ground ? `\n# Sol\nbpy.ops.mesh.primitive_circle_add(radius=30, fill_type="NGON", vertices=64)\nbpy.context.active_object.name = "Sol"\nbpy.context.active_object.data.materials.append(material("Sol", ${rgba('#dfe8ee')}, 0.0, 0.95))\n` : ''}
${lights.join('\n')}

# Caméra
bpy.ops.object.camera_add(location=${bv(c.position!)})
cam = bpy.context.active_object
cam.data.angle = math.radians(${c.fov})
direction = mathutils.Vector(${bv(c.target!)}) - cam.location
cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items} else "BLENDER_EEVEE"
print("Scène « ${(s.title ?? '').replace(/"/g, "'")} » construite : ${s.objects.length} objet(s).")
`;
}
