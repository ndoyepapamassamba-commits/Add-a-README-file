/* eslint-disable @typescript-eslint/no-explicit-any */
// LE RÉALISATEUR HTML — rend un plan de scène en three.js (MIT), image par image, à l'instant exact de chaque image :
// ciel physique (Sky) qui éclaire les matériaux PBR, ombres douces, brouillard, occlusion ambiante (GTAO), profondeur
// de champ (Bokeh), bloom, sortie ACES ; puis titres, bandes cinéma et grain sur un canevas 2D. La MÊME fonction sert
// dans l'app (MP4 image par image) et dans la page HTML exportée (lecteur autonome) : elle ne dépend que de ses
// paramètres (THREE, compléments, données, canevas) — d'où son style sans import ni aide extérieure.
export function directorRuntime(THREE: any, X: any, data: any, opts: { width: number; height: number; quality: 'draft' | 'final' }): any {
  const W = opts.width;
  const H = opts.height;
  const plan = data.plan;
  const spec = data.scene;
  const bake = data.bake;
  const rigs = data.rigs;
  const final = opts.quality === 'final';
  const glCanvas = document.createElement('canvas');
  glCanvas.width = W;
  glCanvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: !final, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = plan.style.timeOfDay === 'night' ? 1.25 : 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const col = function (h: string) {
    return new THREE.Color(h);
  };
  scene.background = col(spec.sky);
  if (spec.fog > 0) scene.fog = new THREE.FogExp2(col(spec.sky), spec.fog);
  else if (!spec.interior) scene.fog = new THREE.Fog(col(spec.sky), 60, 230);

  // Physical sky (outdoors): sun from the plan's time of day; it also lights the PBR materials (environment map).
  const sunLight = spec.lights[0];
  const sunDir = new THREE.Vector3(sunLight.pos[0], sunLight.pos[1], sunLight.pos[2]).normalize();
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (!spec.interior && plan.environment.preset !== 'space' && X.Sky) {
    const sky = new X.Sky();
    sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    const tod = plan.style.timeOfDay;
    u.turbidity.value = tod === 'day' ? 6 : 10;
    u.rayleigh.value = tod === 'night' ? 0.2 : tod === 'day' ? 1.6 : 3;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(sunDir);
    scene.add(sky);
    const envScene = new THREE.Scene();
    const sky2 = new X.Sky();
    sky2.scale.setScalar(4000);
    for (const k in u) if (sky2.material.uniforms[k]) sky2.material.uniforms[k].value = u[k].value;
    envScene.add(sky2);
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    scene.background = null;
  } else if (X.RoomEnvironment) {
    scene.environment = pmrem.fromScene(new X.RoomEnvironment(), 0.04).texture;
  }
  scene.add(new THREE.HemisphereLight(col(spec.sky), col(plan.environment.ground), spec.interior ? 0.6 : 0.35));
  for (let li = 0; li < spec.lights.length; li++) {
    const L = spec.lights[li];
    let light;
    if (L.kind === 'sun') {
      light = new THREE.DirectionalLight(col(L.color), 3.2 * L.power);
      light.position.set(L.pos[0], L.pos[1], L.pos[2]);
      light.castShadow = true;
      light.shadow.mapSize.set(final ? 4096 : 2048, final ? 4096 : 2048);
      const sc = light.shadow.camera;
      sc.left = -30;
      sc.right = 30;
      sc.top = 30;
      sc.bottom = -30;
      sc.near = 1;
      sc.far = 120;
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.02;
    } else {
      light = new THREE.SpotLight(col(L.color), 60 * L.power * (spec.interior ? 1.5 : 1), 40, 0.7, 0.6, 1.6);
      light.position.set(L.pos[0], L.pos[1], L.pos[2]);
      light.target.position.set(L.target[0], L.target[1], L.target[2]);
      scene.add(light.target);
    }
    scene.add(light);
  }

  const mats: Record<string, any> = {};
  const matOf = function (m: any) {
    const key = m.color + '|' + m.rough + '|' + m.metal + '|' + m.emit;
    if (mats[key]) return mats[key];
    const clay = plan.style.look === 'clay';
    const o: any = { color: col(m.color), roughness: clay ? 0.92 : m.rough, metalness: clay ? 0 : m.metal, flatShading: plan.style.look === 'lowpoly' };
    if (m.emit > 0) {
      o.emissive = col(m.color);
      o.emissiveIntensity = m.emit * 0.6;
    }
    mats[key] = plan.style.look === 'cartoon' ? new THREE.MeshToonMaterial({ color: col(m.color), emissive: m.emit > 0 ? col(m.color) : col('#000000') }) : new THREE.MeshStandardMaterial(o);
    return mats[key];
  };
  const geos: Record<string, any> = {};
  const geoOf = function (shape: string, seg: number) {
    const low = plan.style.look === 'lowpoly' || (seg && seg < 10);
    const key = shape + (low ? 'L' : '');
    if (geos[key]) return geos[key];
    let g;
    if (shape === 'box') g = new THREE.BoxGeometry(1, 1, 1);
    else if (shape === 'sphere') g = low ? new THREE.IcosahedronGeometry(0.5, 1) : new THREE.SphereGeometry(0.5, 32, 16);
    else if (shape === 'cyl') g = new THREE.CylinderGeometry(0.5, 0.5, 1, low ? 8 : 24);
    else if (shape === 'cone') g = new THREE.ConeGeometry(0.5, 1, low ? 8 : 24);
    else {
      g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
    }
    geos[key] = g;
    return g;
  };
  const place = function (p: any, parent: any) {
    const m = new THREE.Mesh(geoOf(p.shape, p.seg), p.face ? matOf(p.mat).clone() : matOf(p.mat));
    m.position.set(p.pos[0], p.pos[1], p.pos[2]);
    if (p.quat) m.quaternion.set(p.quat[1], p.quat[2], p.quat[3], p.quat[0]);
    if (p.shape === 'plane') m.scale.set(p.size[0], 1, p.size[2]);
    else m.scale.set(Math.max(p.size[0], 1e-4), Math.max(p.size[1], 1e-4), Math.max(p.size[2], 1e-4));
    m.castShadow = p.cast !== false;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  for (let wi = 0; wi < spec.world.length; wi++) place(spec.world[wi], scene);

  // Cast: joint hierarchy (same rig as Blender), parts hung on the joints, face parts kept for the expressions.
  const cast: Record<string, any> = {};
  for (let ci = 0; ci < spec.cast.length; ci++) {
    const c = spec.cast[ci];
    const rig = rigs[c.kind === 'animal' ? 'animal' : 'human'];
    const root = new THREE.Group();
    scene.add(root);
    const joints: Record<string, any> = {};
    for (let ji = 0; ji < rig.length; ji++) {
      const jd = rig[ji];
      const j = new THREE.Group();
      j.position.set(jd.offset[0] * c.height, jd.offset[1] * c.height, jd.offset[2] * c.height);
      (jd.parent ? joints[jd.parent] : root).add(j);
      joints[jd.name] = j;
    }
    const face: Record<string, any> = {};
    for (let pi = 0; pi < c.parts.length; pi++) {
      const part = c.parts[pi];
      const mesh = place(part, joints[part.joint]);
      if (part.face) face[part.face] = { mesh: mesh, s0: mesh.scale.clone(), p0: mesh.position.clone() };
    }
    cast[c.id] = { root: root, joints: joints, face: face, height: c.height };
  }

  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 5000);
  const vfov = function (lens: number) {
    const aspect = W / H;
    const half = aspect >= 1 ? 18 / aspect : 18;
    return (2 * Math.atan(half / lens) * 180) / Math.PI;
  };
  let composer: any = null;
  let bokeh: any = null;
  if (X.EffectComposer) {
    composer = new X.EffectComposer(renderer);
    composer.setSize(W, H);
    composer.addPass(new X.RenderPass(scene, camera));
    if (X.GTAOPass && final) composer.addPass(new X.GTAOPass(scene, camera, W, H));
    if (X.BokehPass && plan.style.look === 'cinematic') {
      bokeh = new X.BokehPass(scene, camera, { focus: 6, aperture: final ? 0.0022 : 0.0015, maxblur: 0.008 });
      composer.addPass(bokeh);
    }
    if (X.UnrealBloomPass && (plan.style.timeOfDay === 'night' || plan.style.timeOfDay === 'dusk' || plan.style.look === 'neon')) composer.addPass(new X.UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.6, 0.85));
    if (X.OutputPass) composer.addPass(new X.OutputPass());
  }

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const g2 = out.getContext('2d') as CanvasRenderingContext2D;
  const letterbox = plan.style.look === 'cinematic' && W > H;
  const wrap = function (text: string, max: number) {
    const words: any[] = String(text).split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const t = cur ? cur + ' ' + words[i] : words[i];
      if (g2.measureText(t).width > max && cur) {
        lines.push(cur);
        cur = words[i];
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  };

  function render(f: number) {
    const fi = Math.max(0, Math.min(bake.frames - 1, f));
    for (const id in cast) {
      const cc = cast[id];
      const st = bake.chars[id][fi];
      cc.root.position.set(st.pos[0], st.pos[1], st.pos[2]);
      cc.root.rotation.set(0, st.yaw, 0);
      for (const name in st.joints) {
        const q = st.joints[name];
        const jj = cc.joints[name];
        if (jj) jj.quaternion.set(q[1], q[2], q[3], q[0]);
      }
      const fm = cc.face.mouth;
      if (fm) fm.mesh.scale.set(fm.s0.x * (1 + 0.35 * st.mouth[1]), fm.s0.y * (1 + 4 * st.mouth[0]), fm.s0.z);
      for (let k2 = 0; k2 < 2; k2++) {
        const b = cc.face[k2 ? 'brow_r' : 'brow_l'];
        if (!b) continue;
        b.mesh.rotation.set(0, 0, 0.17 * st.brows * (k2 ? 1 : -1));
        b.mesh.position.set(b.p0.x, b.p0.y + 0.012 * cc.height * Math.abs(st.brows), b.p0.z);
      }
    }
    const cm = bake.cams[fi];
    camera.position.set(cm.pos[0], cm.pos[1], cm.pos[2]);
    camera.lookAt(cm.target[0], cm.target[1], cm.target[2]);
    camera.fov = vfov(cm.lens);
    camera.updateProjectionMatrix();
    if (bokeh) bokeh.uniforms.focus.value = camera.position.distanceTo(new THREE.Vector3(cm.target[0], cm.target[1], cm.target[2]));
    if (composer) composer.render();
    else renderer.render(scene, camera);
    g2.drawImage(glCanvas, 0, 0);
    // Titles (fade in / out), letterbox, grain.
    for (let ti = 0; ti < bake.titles.length; ti++) {
      const T = bake.titles[ti];
      if (fi < T.f0 || fi > T.f1) continue;
      const a = Math.min(1, (fi - T.f0) / (bake.fps * 0.5), (T.f1 - fi) / (bake.fps * 0.5));
      const size = Math.round(H * (T.position === 'center' ? (W > H ? 0.085 : 0.055) : 0.042));
      g2.save();
      g2.globalAlpha = Math.max(0, a);
      g2.font = (T.position === 'center' ? '800 ' : '600 ') + size + 'px Inter, system-ui, sans-serif';
      g2.textAlign = 'center';
      g2.textBaseline = 'middle';
      g2.shadowColor = 'rgba(0,0,0,0.6)';
      g2.shadowBlur = size * 0.35;
      g2.fillStyle = '#ffffff';
      const lines = wrap(T.text, W * 0.84);
      const y0 = T.position === 'center' ? H * 0.5 : T.position === 'top' ? H * 0.12 : H * 0.86;
      for (let lx = 0; lx < lines.length; lx++) g2.fillText(String(lines[lx]), W / 2, y0 + (lx - (lines.length - 1) / 2) * size * 1.2 + (1 - a) * size * 0.25);
      g2.restore();
    }
    if (letterbox) {
      const bar = Math.round((H - W / 2.39) / 2);
      if (bar > 0) {
        g2.fillStyle = '#000';
        g2.fillRect(0, 0, W, bar);
        g2.fillRect(0, H - bar, W, bar);
      }
    }
    return out;
  }
  function dispose() {
    renderer.dispose();
    pmrem.dispose();
    for (const key in geos) geos[key].dispose();
    for (const key2 in mats) mats[key2].dispose();
  }
  return { render: render, frames: bake.frames, fps: bake.fps, width: W, height: H, canvas: out, dispose: dispose };
}
