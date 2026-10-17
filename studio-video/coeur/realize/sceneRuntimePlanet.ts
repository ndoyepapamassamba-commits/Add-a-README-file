// UNIVERS « PLANÈTE VUE DE L'ESPACE » DU MOTEUR DE SCÈNE (v64, prompt du 15/10/2026 : « une planète entière observée
// depuis l'espace… transition continue depuis l'orbite jusqu'au niveau du sol, qualité cinématographique NASA »).
// Même contrat que sceneMain (sérialisée telle quelle, n'utilise que ses paramètres). Tout est procédural et animé en
// WebGL : le relief et les biomes sont calculés par pixel (bruit 3D sur la sphère, plus de détail à mesure qu'on
// descend), nuages en cyclones qui tournent, atmosphère diffusante, aurores aux pôles, villes allumées côté nuit,
// reflet du soleil sur les océans ; la caméra descend en continu de l'orbite à basse altitude.
import type * as T from 'three';
import type { OrbitControls as OC } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SceneSpec } from './sceneKit';
import type { ScenePost } from './sceneRuntime';

export function scenePlanet(THREE: typeof T, OrbitControls: typeof OC, S: SceneSpec, PP?: ScenePost): void {
  const tStart = performance.now();
  const has = (c: string) => (S.comps as string[]).includes(c);
  const made = new Set<string>(['planet', 'continents', 'oceans', 'atmosphere', 'sun']);
  let seed = S.seed >>> 0 || 1;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const C = (h: string) => new THREE.Color(h);
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  let PR = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(PR);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / Math.max(1, window.innerHeight), 0.3, 40000);
  const R = 1000;
  const sunDir = new THREE.Vector3(1, 0.22, 0.55).normalize();
  const seedOff = new THREE.Vector3((S.seed % 97) * 0.37, (S.seed % 89) * 0.21, (S.seed % 83) * 0.29);
  const timeU = { value: 0 };

  // Bruit 3D (valeur, code maison) partagé par les shaders.
  const NOISE = [
    'float h3(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
    'float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),',
    '             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }',
    'float fbm(vec3 p, int oct){ float s = 0.0; float a = 0.5; for (int i = 0; i < 14; i++) { if (i >= oct) break; s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }',
  ].join('\n');

  // ── la planète : biomes et relief par pixel ────────────────────────────────────────────────────────────────────
  const planetMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: sunDir }, camPos: { value: new THREE.Vector3() }, seedOff: { value: seedOff }, uR: { value: R } },
    vertexShader: 'varying vec3 vP; varying vec3 vW; void main(){ vP = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: [
      'uniform vec3 sunDir; uniform vec3 camPos; uniform vec3 seedOff; uniform float uR; varying vec3 vP; varying vec3 vW;',
      NOISE,
      'float heightAt(vec3 p, int oct){ vec3 q = p * 1.9 + seedOff + 0.55 * vec3(fbm(p * 2.1 + 1.0, 4), fbm(p * 2.1 + 5.0, 4), fbm(p * 2.1 + 9.0, 4)); return fbm(q, oct) - 0.53; }',
      'void main(){',
      '  vec3 p = normalize(vP);',
      '  float dist = length(camPos - vW);',
      // plus de détail quand on descend (octaves en fonction de la distance)
      '  int oct = int(clamp(7.0 + log2(uR / max(dist, 1.0)) * 1.4, 7.0, 13.0));',
      '  float h = heightAt(p, oct);',
      '  float lat = abs(p.y);',
      '  float moist = fbm(p * 3.3 + seedOff * 1.7 + 20.0, 5);',
      '  vec3 col;',
      '  bool sea = h < 0.0;',
      '  if (sea) { col = mix(vec3(0.02, 0.07, 0.2), vec3(0.06, 0.32, 0.45), smoothstep(-0.14, 0.0, h)); }',
      '  else {',
      '    vec3 grass = vec3(0.33, 0.45, 0.2); vec3 forest = vec3(0.1, 0.25, 0.09); vec3 desert = vec3(0.78, 0.62, 0.38); vec3 rock = vec3(0.42, 0.36, 0.3); vec3 snow = vec3(0.93, 0.95, 0.98);',
      '    float dry = smoothstep(0.52, 0.4, moist) * smoothstep(0.62, 0.25, lat);',
      '    col = mix(grass, forest, smoothstep(0.5, 0.62, moist));',
      '    col = mix(col, desert, dry);',
      '    col = mix(col, rock, smoothstep(0.08, 0.16, h));',
      '    col = mix(col, snow, smoothstep(0.17, 0.22, h));',
      '    col = mix(col, vec3(0.86, 0.8, 0.62), smoothstep(0.012, 0.0, h) * 0.6);',
      '  }',
      '  col = mix(col, vec3(0.94, 0.96, 1.0), smoothstep(0.8, 0.86, lat + 0.05 * fbm(p * 8.0, 3)));',
      // relief : normale perturbée par le gradient de la hauteur (ombrage des montagnes)
      '  vec3 n = normalize(vW);',
      '  float e = 0.0025;',
      '  vec3 t1 = normalize(cross(n, vec3(0.0, 1.0, 0.0001))); vec3 t2 = cross(n, t1);',
      '  float hx = heightAt(normalize(p + t1 * e), min(oct, 9)) - heightAt(normalize(p - t1 * e), min(oct, 9));',
      '  float hy = heightAt(normalize(p + t2 * e), min(oct, 9)) - heightAt(normalize(p - t2 * e), min(oct, 9));',
      '  vec3 nb = sea ? n : normalize(n - (t1 * hx + t2 * hy) * 7.0);',
      '  float ndl = dot(nb, sunDir);',
      '  float day = smoothstep(-0.12, 0.2, dot(n, sunDir));',
      '  vec3 V = normalize(camPos - vW);',
      '  vec3 lit = col * (0.012 + 1.15 * max(ndl, 0.0));',
      // reflet du soleil sur les océans
      '  if (sea) { vec3 Rf = reflect(-sunDir, n); lit += vec3(1.0, 0.9, 0.7) * pow(max(dot(Rf, V), 0.0), 90.0) * 2.4 * day + vec3(0.3, 0.5, 0.7) * pow(max(dot(Rf, V), 0.0), 8.0) * 0.12 * day; }',
      // villes illuminées côté nuit (littoraux et plaines)
      '  float city = (sea ? 0.0 : 1.0) * smoothstep(0.1, 0.0, h) * smoothstep(0.62, 0.8, fbm(p * 14.0 + 3.0, 3)) * step(0.6, n3(p * 520.0)) * step(lat, 0.8);',
      '  lit += vec3(1.0, 0.68, 0.32) * city * (1.0 - day) * 2.2;',
      // diffusion atmosphérique : bleu au bord du disque, orange au terminateur
      '  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);',
      '  float term = exp(-abs(dot(n, sunDir)) * 9.0);',
      '  lit = mix(lit, vec3(0.3, 0.55, 1.0) * (0.12 + day * 0.8), rim * 0.42);',
      '  lit += vec3(0.9, 0.42, 0.18) * term * 0.08;',
      '  gl_FragColor = vec4(lit, 1.0);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), planetMat);
  scene.add(planet);
  if (has('mountains')) made.add('mountains');
  if (has('deserts')) made.add('deserts');
  if (has('forest')) made.add('forest');

  // ── nuages : cyclones qui tournent autour du globe ─────────────────────────────────────────────────────────────
  const cycl = [0, 1, 2, 3].map(() => new THREE.Vector3(rnd() * 2 - 1, (rnd() * 2 - 1) * 0.6, rnd() * 2 - 1).normalize());
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { sunDir: { value: sunDir }, uTime: timeU, c0: { value: cycl[0] }, c1: { value: cycl[1] }, c2: { value: cycl[2] }, c3: { value: cycl[3] }, seedOff: { value: seedOff }, camPos: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vP; varying vec3 vW; void main(){ vP = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: [
      'uniform vec3 sunDir; uniform float uTime; uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec3 seedOff; uniform vec3 camPos; varying vec3 vP; varying vec3 vW;',
      NOISE,
      'vec3 rot(vec3 p, vec3 ax, float a){ return p * cos(a) + cross(ax, p) * sin(a) + ax * dot(ax, p) * (1.0 - cos(a)); }',
      'vec3 swirl(vec3 p, vec3 c, float k){ float d = acos(clamp(dot(p, c), -1.0, 1.0)); return rot(p, c, k * exp(-d * 7.0)); }',
      'void main(){',
      '  vec3 p = normalize(vP);',
      '  p = rot(p, vec3(0.0, 1.0, 0.0), uTime * 0.006);',
      '  p = swirl(p, c0, 3.0 + 0.2 * uTime); p = swirl(p, c1, -2.6 - 0.15 * uTime); p = swirl(p, c2, 2.2); p = swirl(p, c3, -2.0);',
      '  float dist = length(camPos - vW);',
      '  int oct = int(clamp(6.0 + log2(1000.0 / max(dist, 1.0)) * 1.2, 6.0, 11.0));',
      '  float d = fbm(p * 3.2 + seedOff + vec3(0.0, uTime * 0.004, 0.0), oct);',
      '  float band = 0.08 * cos(asin(p.y) * 6.0);',
      '  float a = smoothstep(0.57, 0.8, d + band);',
      '  vec3 n = normalize(vW);',
      '  float ndl = dot(n, sunDir);',
      '  vec3 col = vec3(0.92) * (0.02 + 0.95 * max(ndl, 0.0)) + vec3(1.0, 0.55, 0.3) * exp(-abs(ndl) * 10.0) * 0.25;',
      '  gl_FragColor = vec4(col, a * 0.85);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.008, 192, 96), cloudMat);
  scene.add(clouds);
  made.add('clouds');

  // ── atmosphère : halo bleuté sur le limbe ─────────────────────────────────────────────────────────────────────
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.035, 128, 64),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: { sunDir: { value: sunDir }, camPos: { value: new THREE.Vector3() } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: [
        'uniform vec3 sunDir; uniform vec3 camPos; varying vec3 vW;',
        'void main(){ vec3 n = normalize(vW); vec3 V = normalize(camPos - vW);',
        '  float f = pow(1.0 - abs(dot(n, V)), 2.0);',
        '  float l = clamp(dot(n, sunDir) + 0.35, 0.0, 1.0);',
        '  vec3 c = mix(vec3(0.95, 0.45, 0.2), vec3(0.3, 0.58, 1.0), smoothstep(0.0, 0.5, l));',
        '  gl_FragColor = vec4(c * f * l * 0.75, f * l);',
        '}',
      ].join('\n'),
    }),
  );
  scene.add(atmo);

  // ── aurores aux pôles : rideaux animés ─────────────────────────────────────────────────────────────────────────
  {
    const auroraMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: timeU, sunDir: { value: sunDir } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: [
        'uniform float uTime; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vW;',
        NOISE,
        'void main(){',
        '  float u = vUv.x; float v = vUv.y;',
        '  float curtain = fbm(vec3(u * 40.0, uTime * 0.25, 1.0), 4);',
        '  float rays = 0.6 + 0.4 * sin(u * 900.0 + curtain * 30.0 + uTime * 1.5);',
        '  float fade = smoothstep(0.0, 0.15, v) * (1.0 - smoothstep(0.35, 1.0, v));',
        '  vec3 c = mix(vec3(0.15, 1.0, 0.45), vec3(0.75, 0.25, 1.0), smoothstep(0.35, 0.9, v));',
        '  float night = 1.0 - smoothstep(-0.2, 0.25, dot(normalize(vW), sunDir));',
        '  float a = fade * rays * smoothstep(0.35, 0.75, curtain) * (0.25 + 0.75 * night);',
        '  gl_FragColor = vec4(c * a * 2.0, a);',
        '}',
      ].join('\n'),
    });
    for (const pole of [1, -1]) {
      const lat = (72 * Math.PI) / 180;
      const seg = 256;
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i <= seg; i++) {
        const lon = (i / seg) * Math.PI * 2;
        const wob = 0.035 * Math.sin(lon * 5 + pole) + 0.02 * Math.sin(lon * 11);
        const la = lat + wob;
        for (const [k, rr] of [[0, R * 1.006], [1, R * 1.045]] as const) {
          pos.push(Math.cos(la) * Math.cos(lon) * rr, pole * Math.sin(la) * rr, Math.cos(la) * Math.sin(lon) * rr);
          uv.push(i / seg, k);
        }
        if (i < seg) {
          const a = i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      scene.add(new THREE.Mesh(g, auroraMat));
    }
    made.add('aurora');
  }
  made.add('cities');

  // ── étoiles et soleil ──────────────────────────────────────────────────────────────────────────────────────────
  {
    const n = 6000;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * r * 30000, u * 30000, Math.sin(th) * r * 30000], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: C('#dfe6ff'), size: 1.4, sizeAttenuation: false })));
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const gg = c.getContext('2d')!;
    const gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.12, 'rgba(255,245,220,.9)');
    gr.addColorStop(0.4, 'rgba(255,200,140,.18)');
    gr.addColorStop(1, 'rgba(255,180,120,0)');
    gg.fillStyle = gr;
    gg.fillRect(0, 0, 128, 128);
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sun.position.copy(sunDir).multiplyScalar(26000);
    sun.scale.setScalar(5200);
    scene.add(sun);
  }

  // ── descente continue : de l'orbite à basse altitude, vers le terminateur où les villes s'allument ─────────────
  const target = new THREE.Vector3().copy(sunDir).applyAxisAngle(new THREE.Vector3(0, 1, 0), -1.42).normalize();
  target.y = 0.32;
  target.normalize();
  const start = new THREE.Vector3().copy(sunDir).applyAxisAngle(new THREE.Vector3(0, 1, 0), -1.3).normalize();
  start.y = 0.18;
  start.normalize();
  const DESC = 46; // secondes de descente
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const camAt = (t: number) => {
    const u = Math.min(1, Math.max(0, t / DESC));
    const k = u * u * (3 - 2 * u);
    const alt = R * (2.6 * Math.exp(-u * 5.2) + 0.0035 + 0.02 * (1 - u));
    // la direction glisse sur un grand cercle (de l'orbite vers le point d'arrivée), puis survole lentement
    const after = Math.max(0, t - DESC) * 0.0009;
    tmpA.copy(start).lerp(target, k).normalize();
    if (after) tmpA.applyAxisAngle(tmpB.copy(start).cross(target).normalize(), after);
    const pos = tmpA.clone().multiplyScalar(R + alt);
    // regard : le centre du globe au début, l'horizon devant soi à la fin
    const fwd = tmpB.copy(start).cross(target).normalize().cross(tmpA).normalize().negate();
    const horizon = pos.clone().addScaledVector(fwd, R * 0.4).addScaledVector(tmpA, -R * 0.02);
    const look = new THREE.Vector3(0, 0, 0).lerp(horizon, Math.pow(k, 1.6));
    return { pos, look };
  };
  const c0 = camAt(0);
  camera.position.copy(c0.pos);
  camera.lookAt(c0.look);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 0);
  controls.minDistance = R * 1.004;
  controls.maxDistance = R * 8;
  let auto = true;
  controls.addEventListener('start', () => (auto = false));
  made.add('descent');

  let composer: InstanceType<ScenePost['EffectComposer']> | null = null;
  if (PP) {
    try {
      composer = new PP.EffectComposer(renderer);
      composer.addPass(new PP.RenderPass(scene, camera));
      composer.addPass(new PP.UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.32, 0.6, 0.86));
      composer.addPass(new PP.OutputPass());
    } catch {
      composer = null;
    }
  }
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer?.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  const cap = document.getElementById('cap');
  if (cap) cap.textContent = '✨ JEV · scène instantanée — planète procédurale, descente continue de l’orbite à basse altitude — glisser pour reprendre la main';
  const t0 = performance.now();
  const buildMs = Math.round(t0 - tStart);
  let firstFrameMs = 0;
  let frames = 0;
  let last = t0;
  const sky = new THREE.Color();
  const frame = () => {
    const now = performance.now();
    const t = (now - t0) / 1000;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    timeU.value = t;
    if (auto) {
      const c = camAt(t);
      camera.position.copy(c.pos);
      camera.lookAt(c.look);
    } else controls.update();
    for (const m of [planetMat, cloudMat, atmo.material as T.ShaderMaterial]) m.uniforms.camPos!.value.copy(camera.position);
    // dans l'atmosphère, le ciel bleuit côté jour
    const alt = camera.position.length() - R;
    const inAir = Math.max(0, 1 - alt / (R * 0.06)) * Math.max(0, camera.position.clone().normalize().dot(sunDir) + 0.2);
    sky.setRGB(0.18 * inAir, 0.38 * inAir, 0.75 * inAir);
    (scene.background as T.Color).copy(sky);
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
    if (!frames) firstFrameMs = Math.round(performance.now() - now);
    frames++;
    if (frames > 4 && frames < 40 && dt > 0.05 && PR > 0.8 && frames % 12 === 0) {
      PR = Math.max(0.75, PR * 0.8);
      renderer.setPixelRatio(PR);
      composer?.setPixelRatio(PR);
      resize();
      // redessiner tout de suite : un redimensionnement vide l'image (une capture ne doit jamais tomber sur du noir)
      if (composer) composer.render(0);
      else renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  };
  frame();
  const ld = document.getElementById('load');
  if (ld) {
    ld.style.opacity = '0';
    setTimeout(() => ld.remove(), 700);
  }
  (window as unknown as { REALIZE_ELEMENTS: string[] }).REALIZE_ELEMENTS = S.elements.filter((e) => made.has(e.comp)).map((e) => e.name);
  (window as unknown as { __scene: unknown }).__scene = { renderer, scene, camera, composer, made: [...made], buildMs, firstFrameMs: () => firstFrameMs, frames: () => frames };
}
