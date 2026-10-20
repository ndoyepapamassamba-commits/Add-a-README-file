// UNIVERS « MÉGAPOLE FUTURISTE » DU MOTEUR DE SCÈNE (v64, prompt du 15/10/2026 : « une immense mégapole futuriste…
// caméra volante traversant la ville comme dans l'introduction d'un blockbuster »). Même contrat que sceneMain : la
// fonction est sérialisée telle quelle dans la page du bac à sable et n'utilise QUE ses paramètres et le navigateur.
// Tout est animé en WebGL : fenêtres et néons calculés par la carte graphique (aucune texture), écrans holographiques
// (shader animé), véhicules volants sur quatre niveaux avec traînées lumineuses, monorails suspendus, pluie, vapeur,
// avenues miroirs (Reflector), caméra volante sur une trajectoire de cinéma.
import type * as T from 'three';
import type { OrbitControls as OC } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Reflector as RF } from 'three/examples/jsm/objects/Reflector.js';
import type { SceneSpec } from './sceneKit';
import type { ScenePost } from './sceneRuntime';

export function sceneScifi(THREE: typeof T, OrbitControls: typeof OC, S: SceneSpec, PP?: ScenePost & { Reflector?: typeof RF }): void {
  const tStart = performance.now();
  const has = (c: string) => (S.comps as string[]).includes(c);
  const boost = (c: string) => (S.boost as Record<string, number | undefined>)[c] ?? 1;
  const made = new Set<string>();
  let seed = S.seed >>> 0 || 1;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rr = (a: number, b: number) => a + (b - a) * rnd();
  const C = (h: string) => new THREE.Color(h);
  const day = S.time === 'day';

  // ── rendu ────────────────────────────────────────────────────────────────────────────────────────────────────
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  let PR = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(PR);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = day ? 1.0 : 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const LOOK = day
    ? { zen: '#4a78b8', hor: '#c9d6e6', fog: '#aab8cc', fogD: 0.0006, hemiS: '#cfe0ff', hemiG: '#404858', hemiI: 1.1, win: 0.35 }
    : { zen: '#05060f', hor: '#3a1a4a', fog: '#2a1638', fogD: 0.00095, hemiS: '#3a3f7a', hemiG: '#120a18', hemiI: 0.45, win: 1.0 };
  scene.fog = new THREE.FogExp2(C(LOOK.fog), LOOK.fogD * (0.75 + S.fog * 0.5));
  scene.background = C(LOOK.fog);
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / Math.max(1, window.innerHeight), 0.5, 6000);

  // ciel : nuit urbaine, halo magenta-orangé de la ville sur l'horizon
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(4000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { zen: { value: C(LOOK.zen) }, hor: { value: C(LOOK.hor) }, glow: { value: C(day ? '#ffffff' : '#ff5a8a') } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform vec3 zen; uniform vec3 hor; uniform vec3 glow; varying vec3 vDir;',
        'void main(){ float h = normalize(vDir).y;',
        '  vec3 c = mix(hor, zen, pow(smoothstep(-0.02, 0.5, h), 0.7));',
        '  c += glow * exp(-abs(h) * 14.0) * 0.35;',
        '  gl_FragColor = vec4(c, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}',
      ].join('\n'),
    }),
  );
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(C(LOOK.hemiS), C(LOOK.hemiG), LOOK.hemiI));
  const moon = new THREE.DirectionalLight(C(day ? '#fff4e0' : '#8fa0ff'), day ? 2.2 : 0.35);
  moon.position.set(-400, 900, -300);
  scene.add(moon);

  // ── la ville : grille d'avenues, quartiers (financier au centre, résidentiel, industriel en périphérie) ─────────
  const BLOCK = 64;
  const AVE = 26;
  const EXT = 1500;
  const nBuild = Math.round(Math.min(5200, S.counts.houses * Math.min(1.6, boost('skyscrapers'))));
  const unit = new THREE.BoxGeometry(1, 1, 1);
  unit.translate(0, 0.5, 0);
  const prism8 = new THREE.CylinderGeometry(0.42, 0.5, 1, 8);
  prism8.translate(0, 0.5, 0);
  // Fenêtres, bandes de néon et feux d'obstacle calculés dans le shader (aucune texture) : le hasard vient de l'instance.
  const facade = (mat: T.MeshStandardMaterial) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = timeU;
      sh.uniforms.uWin = { value: LOOK.win };
      sh.vertexShader =
        'varying vec3 vW; varying vec3 vObj; varying vec3 vN; flat varying float vId;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvObj = position; vN = normal; vId = float(gl_InstanceID);\nvec4 wq = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nwq = instanceMatrix * wq;\n#endif\nvW = (modelMatrix * wq).xyz;',
        );
      sh.fragmentShader =
        'uniform float uTime; uniform float uWin; varying vec3 vW; varying vec3 vObj; varying vec3 vN; flat varying float vId;\n' +
        'float h11(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          [
            '#include <emissivemap_fragment>',
            'if (abs(vN.y) < 0.5) {',
            '  float u = abs(vN.x) > 0.5 ? vW.z : vW.x;',
            '  vec2 cell = floor(vec2(u / 3.1, vW.y / 3.9));',
            '  vec2 f = fract(vec2(u / 3.1, vW.y / 3.9));',
            '  float m = step(0.16, f.x) * step(f.x, 0.84) * step(0.22, f.y) * step(f.y, 0.78);',
            '  float r = h11(cell + vId * 7.13);',
            '  float lit = step(0.6, r) * step(4.0, vW.y);',
            '  vec3 wc = r > 0.9 ? vec3(1.0, 0.75, 0.45) : r > 0.75 ? vec3(0.55, 0.85, 1.0) : vec3(0.85, 0.9, 1.0);',
            '  float flick = 0.85 + 0.15 * sin(uTime * 3.0 + r * 40.0);',
            '  totalEmissiveRadiance += wc * m * lit * uWin * 0.62 * flick;',
            // bandes de néon sur les arêtes d'un immeuble sur trois
            '  float kind = h11(vec2(vId, 3.7));',
            // l'arête d'une face = le bord de SA coordonnée horizontale (z pour une face ±x, x pour une face ±z)
            '  float ex = abs(vN.x) > 0.5 ? abs(vObj.z) : abs(vObj.x);',
            '  float edge = smoothstep(0.475, 0.5, ex);',
            '  vec3 neon = kind > 0.5 ? vec3(0.1, 0.8, 1.0) : vec3(1.0, 0.15, 0.85);',
            '  totalEmissiveRadiance += neon * edge * step(0.66, kind) * 1.6 * uWin;',
            '  float band = step(0.94, fract(vW.y / 38.0 + kind));',
            '  totalEmissiveRadiance += neon * band * step(0.8, kind) * 1.4 * uWin;',
            '} else if (vN.y > 0.5) {',
            '  float blink = step(0.5, fract(uTime * 0.6 + h11(vec2(vId, 1.0))));',
            '  totalEmissiveRadiance += vec3(1.0, 0.1, 0.05) * blink * step(length(fract(vObj.xz * 3.0) - 0.5), 0.08) * 3.0;',
            '}',
          ].join('\n'),
        );
    };
    return mat;
  };
  const timeU = { value: 0 };
  const bMat = facade(new THREE.MeshStandardMaterial({ color: C(day ? '#9aa6b8' : '#1a1d28'), roughness: 0.28, metalness: 0.75, emissive: C('#000000') }));
  const boxes = new THREE.InstancedMesh(unit, bMat, nBuild);
  const prisms = new THREE.InstancedMesh(prism8, facade(new THREE.MeshStandardMaterial({ color: C(day ? '#8e9bb0' : '#151826'), roughness: 0.25, metalness: 0.8 })), Math.ceil(nBuild * 0.2));
  boxes.count = 0;
  prisms.count = 0;
  boxes.frustumCulled = prisms.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const put = (m: T.InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, col?: T.Color) => {
    // jamais au-delà de la capacité réservée (la carte graphique lirait hors du tampon : image noire)
    if (m.count >= m.instanceMatrix.count) return -1;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    m.setMatrixAt(m.count, dummy.matrix);
    if (col) m.setColorAt(m.count, col);
    m.count++;
  };
  const tops: { x: number; z: number; h: number; w: number }[] = [];
  const vents: { x: number; z: number }[] = [];
  const tint = new THREE.Color();
  const pitch = BLOCK + AVE;
  const nb = Math.floor(EXT / pitch);
  outer: for (let bi = -nb; bi <= nb; bi++)
    for (let bj = -nb; bj <= nb; bj++) {
      const cx = bi * pitch;
      const cz = bj * pitch;
      const r = Math.hypot(cx, cz);
      if (r < 70) continue; // la place de la tour iconique
      const zone = r < 420 ? 'fin' : r < 900 ? 'res' : 'ind';
      const lots = zone === 'fin' ? (rnd() < 0.5 ? 1 : 2) : zone === 'res' ? 4 : rnd() < 0.5 ? 1 : 2;
      const n = Math.sqrt(lots);
      const lw = BLOCK / n;
      for (let a = 0; a < n; a++)
        for (let b = 0; b < n; b++) {
          if (boxes.count + prisms.count >= nBuild) break outer;
          const x = cx - BLOCK / 2 + lw * (a + 0.5);
          const z = cz - BLOCK / 2 + lw * (b + 0.5);
          const fall = Math.exp(-r / 520);
          const h =
            zone === 'fin'
              ? rr(110, 360) * (0.7 + 0.6 * fall) * (rnd() < 0.08 ? 1.5 : 1)
              : zone === 'res'
                ? rr(35, 140) * (rnd() < 0.06 ? 2.2 : 1)
                : rr(14, 38);
          const w = lw * rr(0.62, 0.86);
          const d = lw * rr(0.62, 0.86);
          tint.setHSL(0.6 + rnd() * 0.08, 0.15, zone === 'ind' ? 0.32 : 0.24 + rnd() * 0.1);
          if (zone !== 'ind' && rnd() < 0.18 && prisms.count < prisms.instanceMatrix.count) put(prisms, x, 0, z, w, h, d, rnd() * 3, tint);
          else put(boxes, x, 0, z, w, h, d, 0, tint);
          // couronnements : étages en retrait sur les plus hautes
          if (h > 160 && boxes.count < nBuild) put(boxes, x, h, z, w * 0.62, h * 0.12, d * 0.62, 0, tint);
          tops.push({ x, z, h, w });
          if (zone === 'ind' && rnd() < 0.35) vents.push({ x: x + w * 0.3, z: z + d * 0.3 });
        }
      if (rnd() < 0.12) vents.push({ x: cx + BLOCK / 2 + AVE / 2, z: cz + rr(-20, 20) });
    }
  for (const m of [boxes, prisms]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    scene.add(m);
  }
  made.add('skyscrapers');
  made.add('districts');
  made.add('neon');

  // ── sol : asphalte mouillé + flaques miroirs (Reflector) ─────────────────────────────────────────────────────
  const noiseTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const x = i % 256;
      const y = Math.floor(i / 256);
      const v = 0.5 + 0.25 * Math.sin(x * 0.07 + Math.sin(y * 0.05) * 2) + 0.25 * Math.sin(y * 0.09 + Math.cos(x * 0.04) * 3);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(255, v * 255));
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(40, 40);
    return t;
  })();
  let mirror: T.Object3D | null = null;
  if (PP?.Reflector && (has('rain') || has('avenues'))) {
    try {
      const m = new PP.Reflector(new THREE.PlaneGeometry(EXT * 2.2, EXT * 2.2), {
        textureWidth: Math.round(window.innerWidth * PR * 0.5),
        textureHeight: Math.round(window.innerHeight * PR * 0.5),
        color: new THREE.Color(day ? '#8a95a8' : '#7d87a0'),
      });
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.02;
      scene.add(m);
      mirror = m;
    } catch {
      mirror = null;
    }
  }
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(EXT * 2.2, EXT * 2.2),
    new THREE.MeshStandardMaterial({
      color: C(day ? '#3a3f48' : '#0c0d12'),
      roughness: 0.22,
      metalness: 0.3,
      transparent: Boolean(mirror),
      opacity: mirror ? 0.72 : 1,
      alphaMap: mirror ? noiseTex : null,
      roughnessMap: noiseTex,
    }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = 0.06;
  scene.add(asphalt);
  made.add('avenues');

  // ── la tour iconique : fuseau effilé, anneaux de néon bleus et violets, flèche lumineuse ───────────────────────
  const iconH = 560 * Math.min(1.4, Math.sqrt(boost('icon_tower')));
  {
    const segs = 9;
    for (let k = 0; k < segs; k++) {
      const h0 = (k / segs) * iconH;
      const h1 = ((k + 1) / segs) * iconH;
      const r0 = 46 * (1 - (k / segs) * 0.86);
      const r1 = 46 * (1 - ((k + 1) / segs) * 0.86);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h1 - h0, 6, 1), facade(new THREE.MeshStandardMaterial({ color: C('#11131f'), roughness: 0.2, metalness: 0.9 })));
      seg.position.y = (h0 + h1) / 2;
      seg.rotation.y = k * 0.18;
      scene.add(seg);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r1 + 1.6, 2.2, 8, 48), new THREE.MeshBasicMaterial({ color: C(k % 2 ? '#8a4cff' : '#3fb8ff').multiplyScalar(2.2), toneMapped: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = h1;
      scene.add(ring);
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 3.2, 120, 6), new THREE.MeshBasicMaterial({ color: C('#b9a6ff'), toneMapped: false }));
    spire.position.y = iconH + 60;
    scene.add(spire);
    const beaconMat = new THREE.SpriteMaterial({ color: C('#9f7bff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTexture() });
    const beacon = new THREE.Sprite(beaconMat);
    beacon.position.y = iconH + 122;
    beacon.scale.setScalar(80);
    scene.add(beacon);
    made.add('icon_tower');
  }
  function glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const glowTex = glowTexture();

  // ── écrans holographiques géants (shader animé : défilement, lignes de balayage, scintillement, texte) ─────────
  const holos: T.ShaderMaterial[] = [];
  if (has('holograms') || has('neon')) {
    const words = ['NÉO', 'JEV', 'MASSAMBA', 'AÉRO', 'ORBITA', 'HOLO', '2099', 'NOVA', 'LUMEN', 'ZÉNITH'];
    const textTex = words.map((w, i) => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const g = c.getContext('2d')!;
      g.fillStyle = '#000';
      g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#fff';
      g.font = `900 ${w.length > 6 ? 92 : 132}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(w, 256, 118);
      g.font = '600 30px system-ui, sans-serif';
      g.fillText(['ville sans sommeil', 'vol de nuit', 'au-delà du ciel', 'énergie pure', 'le futur, maintenant'][i % 5]!, 256, 214);
      return new THREE.CanvasTexture(c);
    });
    const palettes: [string, string][] = [['#ff2bd6', '#2be6ff'], ['#2be6ff', '#7a3cff'], ['#ffb02b', '#ff2b6b'], ['#5bff8a', '#2bb6ff'], ['#ff5a2b', '#ffd12b']];
    const n = Math.round(150 * Math.min(1.6, boost('holograms')));
    const tall = tops.filter((t) => t.h > 70).sort(() => rnd() - 0.5);
    for (let k = 0; k < Math.min(n, tall.length); k++) {
      const b = tall[k]!;
      const [c1, c2] = palettes[k % palettes.length]!;
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: true,
        uniforms: {
          ...THREE.UniformsLib.fog,
          uTime: timeU,
          c1: { value: C(c1) },
          c2: { value: C(c2) },
          tx: { value: textTex[k % textTex.length] },
          seed: { value: rnd() * 10 },
          mode: { value: k % 3 },
        },
        vertexShader: [
          '#include <fog_pars_vertex>',
          'varying vec2 vUv;',
          'void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;',
          '#include <fog_vertex>',
          '}',
        ].join('\n'),
        fragmentShader: [
          '#include <fog_pars_fragment>',
          'uniform float uTime; uniform vec3 c1; uniform vec3 c2; uniform sampler2D tx; uniform float seed; uniform float mode; varying vec2 vUv;',
          'void main(){',
          '  float t = uTime + seed;',
          '  vec3 col = mix(c1, c2, 0.5 + 0.5 * sin(vUv.y * 3.0 + t * 0.7));',
          '  float scan = 0.75 + 0.25 * sin(vUv.y * 220.0 + t * 8.0);',
          '  float glitch = step(0.985, fract(sin(floor(t * 6.0) * 12.9898) * 43758.5453)) * 0.08;',
          '  vec2 uv = vec2(fract(vUv.x + glitch), vUv.y);',
          '  float txt = texture2D(tx, uv).r;',
          '  float bars = step(0.5, fract(vUv.x * 6.0 - t * 0.4)) * 0.25;',
          '  float shape = mode < 0.5 ? txt : mode < 1.5 ? max(txt * 0.9, bars) : max(txt, 0.35 * step(0.5, fract((vUv.x + vUv.y) * 8.0 + t)));',
          '  float edge = 1.0 - smoothstep(0.42, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));',
          '  float flick = 0.88 + 0.12 * sin(t * 23.0);',
          '  gl_FragColor = vec4(col * (0.35 + shape * 2.6) * scan * flick, (0.45 + 0.55 * shape) * edge);',
          '  #include <fog_fragment>',
          '}',
        ].join('\n'),
      });
      holos.push(mat);
      const w = rr(34, 90) * Math.min(1.4, boost('holograms'));
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, w * rr(0.45, 1.1)), mat);
      const side = rnd() < 0.6 ? (rnd() < 0.5 ? 0 : 1) : Math.floor(rnd() * 4);
      const off = b.w * 0.42 + 1.5;
      const dx = side === 0 ? off : side === 1 ? -off : 0;
      const dz = side === 2 ? off : side === 3 ? -off : 0;
      plane.position.set(b.x + dx, rr(0.35, 0.85) * b.h, b.z + dz);
      plane.rotation.y = side === 0 ? Math.PI / 2 : side === 1 ? -Math.PI / 2 : side === 2 ? 0 : Math.PI;
      scene.add(plane);
    }
    made.add('holograms');
  }

  // ── véhicules volants : quatre niveaux de circulation, phares blancs devant, feux rouges et traînées derrière ──
  type Car = { lane: number; axis: 0 | 1; dir: 1 | -1; s: number; v: number; y: number };
  const cars: Car[] = [];
  const nCars = Math.round((has('flyers') ? 520 : 140) * Math.min(1.6, boost('flyers')));
  const carBody = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 1.0, 4.6), new THREE.MeshStandardMaterial({ color: C('#2a2f3c'), roughness: 0.3, metalness: 0.9 }), nCars);
  const trailGeo = new THREE.PlaneGeometry(1, 1);
  trailGeo.translate(0, -0.5, 0);
  trailGeo.rotateX(-Math.PI / 2);
  const headMat = new THREE.MeshBasicMaterial({ color: C('#e9f4ff'), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const tailMat = new THREE.MeshBasicMaterial({ color: C('#ff2448'), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const heads = new THREE.InstancedMesh(trailGeo, headMat, nCars);
  const tails = new THREE.InstancedMesh(trailGeo, tailMat, nCars);
  for (const m of [carBody, heads, tails]) {
    m.frustumCulled = false;
    scene.add(m);
  }
  const LEVELS = [38, 64, 98, 142];
  for (let k = 0; k < nCars; k++) {
    const axis = (k % 2) as 0 | 1;
    cars.push({
      lane: Math.round(rr(-nb, nb)) * pitch + BLOCK / 2 + AVE / 2 + (rnd() < 0.5 ? -5 : 5),
      axis,
      dir: rnd() < 0.5 ? 1 : -1,
      s: rr(-EXT, EXT),
      v: rr(28, 70),
      y: LEVELS[Math.floor(rnd() * LEVELS.length)]! + rr(-3, 3),
    });
  }
  if (has('flyers')) made.add('flyers');

  // ── monorails suspendus : poutre sur pylônes, rames éclairées qui traversent les quartiers ─────────────────────
  type Train = { line: number; axis: 0 | 1; s: number; v: number; cars: T.Mesh[] };
  const trains: Train[] = [];
  const RAIL_Y = 30;
  if (has('monorail')) {
    const lines = [
      { axis: 0 as const, c: pitch * 2 + BLOCK / 2 + AVE / 2 },
      { axis: 1 as const, c: -pitch * 3 + BLOCK / 2 + AVE / 2 },
      { axis: 0 as const, c: -pitch * 6 + BLOCK / 2 + AVE / 2 },
    ];
    const beamMat = new THREE.MeshStandardMaterial({ color: C('#3a3f4e'), roughness: 0.5, metalness: 0.7 });
    const carMat = new THREE.MeshStandardMaterial({ color: C('#d9dde6'), roughness: 0.3, metalness: 0.6, emissive: C('#7fd4ff'), emissiveIntensity: 0.35 });
    lines.forEach((ln, li) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(ln.axis === 0 ? EXT * 2 : 3, 2.2, ln.axis === 0 ? 3 : EXT * 2), beamMat);
      beam.position.set(ln.axis === 0 ? 0 : ln.c, RAIL_Y, ln.axis === 0 ? ln.c : 0);
      scene.add(beam);
      for (let s = -EXT; s <= EXT; s += 60) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, RAIL_Y, 2.2), beamMat);
        p.position.set(ln.axis === 0 ? s : ln.c, RAIL_Y / 2, ln.axis === 0 ? ln.c : s);
        scene.add(p);
      }
      for (let k = 0; k < 2; k++) {
        const carsM: T.Mesh[] = [];
        for (let c = 0; c < 4; c++) {
          const m = new THREE.Mesh(new THREE.CapsuleGeometry(2.1, 17, 4, 10), carMat);
          m.rotation.set(ln.axis === 0 ? 0 : Math.PI / 2, 0, ln.axis === 0 ? Math.PI / 2 : 0);
          scene.add(m);
          carsM.push(m);
        }
        trains.push({ line: ln.c, axis: ln.axis, s: rr(-EXT, EXT), v: (k ? -1 : 1) * rr(26, 34), cars: carsM });
      }
      void li;
    });
    made.add('monorail');
  }

  // ── pluie (traits qui suivent la caméra) et vapeur des bouches d'aération ─────────────────────────────────────
  const RAIN_N = has('rain') ? 9000 : 0;
  let rain: T.LineSegments | null = null;
  const rainBox = 140;
  if (RAIN_N) {
    const pos = new Float32Array(RAIN_N * 6);
    for (let i = 0; i < RAIN_N; i++) {
      const x = rr(-rainBox, rainBox);
      const y = rr(0, rainBox * 1.4);
      const z = rr(-rainBox, rainBox);
      pos.set([x, y, z, x + 0.12, y - 1.5, z + 0.06], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: C('#a8c4ff'), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
    rain.frustumCulled = false;
    scene.add(rain);
    made.add('rain');
  }
  const puffs: { sp: T.Sprite; v: { x: number; z: number }; age: number; life: number }[] = [];
  if (has('steam')) {
    const sm = (o: number) => new THREE.SpriteMaterial({ map: glowTex, color: C(day ? '#e8ecf2' : '#b9a6c9'), transparent: true, opacity: o, depthWrite: false });
    for (const v of vents.slice(0, 90))
      for (let k = 0; k < 6; k++) {
        const sp = new THREE.Sprite(sm(0.25));
        sp.position.set(v.x, 0, v.z);
        scene.add(sp);
        puffs.push({ sp, v, age: rr(0, 6), life: rr(4.5, 7.5) });
      }
    made.add('steam');
  }

  // ── caméra volante : trajectoire de cinéma au-dessus des avenues, vers la tour iconique ─────────────────────────
  const ave = BLOCK / 2 + AVE / 2;
  const path = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-1900, 360, ave + pitch * 2),
      new THREE.Vector3(-1250, 230, ave + pitch),
      new THREE.Vector3(-760, 120, ave + pitch),
      new THREE.Vector3(-420, 78, ave + pitch * 0.6),
      new THREE.Vector3(-200, 96, ave),
      new THREE.Vector3(-30, 180, -220),
      new THREE.Vector3(230, 300, -260),
      new THREE.Vector3(420, 260, 120),
      new THREE.Vector3(260, 200, 480),
      new THREE.Vector3(-160, 160, 520),
      new THREE.Vector3(-620, 190, 380),
      new THREE.Vector3(-1300, 300, 560),
    ],
    true,
    'catmullrom',
    0.4,
  );
  const look = new THREE.Vector3(0, iconH * 0.45, 0);
  const DURATION = 110; // s pour un tour complet
  const camAt = (t: number) => {
    const u = ((t / DURATION) % 1 + 1) % 1;
    const p = path.getPointAt(u);
    const ahead = path.getPointAt((u + 0.015) % 1);
    // regarde devant soi, attiré par la tour iconique (point focal du plan)
    const tgt = ahead.clone().lerp(look, 0.55);
    return { p, tgt };
  };
  const c0 = camAt(0);
  camera.position.copy(c0.p);
  camera.lookAt(c0.tgt);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(c0.tgt);
  controls.enableDamping = true;
  controls.maxDistance = 3000;
  let auto = true;
  controls.addEventListener('start', () => (auto = false));

  // ── post-production : halo des néons, étalonnage froid, vignettage ─────────────────────────────────────────────
  let composer: InstanceType<ScenePost['EffectComposer']> | null = null;
  if (PP) {
    try {
      composer = new PP.EffectComposer(renderer, new THREE.WebGLRenderTarget(window.innerWidth * PR, window.innerHeight * PR, { samples: 4, type: THREE.HalfFloatType }));
      composer.addPass(new PP.RenderPass(scene, camera));
      if (PP.GTAOPass) {
        // occlusion ambiante : ombres de contact (pieds des façades, sous les véhicules, entre les objets)
        const ao = new PP.GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
        ao.blendIntensity = 0.6;
        composer.addPass(ao);
      }
      composer.addPass(new PP.UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), day ? 0.22 : 0.55, 0.5, day ? 0.88 : 0.62));
      composer.addPass(
        new PP.ShaderPass({
          uniforms: { tDiffuse: { value: null } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader:
            'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; c.rgb *= 1.0 - dot(d, d) * 0.9; c.rgb *= vec3(0.96, 0.98, 1.06); gl_FragColor = c; }',
        }),
      );
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
  if (cap) cap.textContent = `✨ JEV · scène instantanée — ${(boxes.count + prisms.count).toLocaleString('fr-FR')} gratte-ciel · ${holos.length} écrans holographiques · ${nCars} véhicules volants — glisser pour reprendre la main`;

  const t0 = performance.now();
  const buildMs = Math.round(t0 - tStart);
  let firstFrameMs = 0;
  let frames = 0;
  let last = t0;
  const vtmp = new THREE.Vector3();
  const frame = () => {
    const now = performance.now();
    const t = (now - t0) / 1000;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    timeU.value = t;
    if (auto) {
      const c = camAt(t);
      camera.position.copy(c.p);
      camera.lookAt(c.tgt);
      controls.target.copy(c.tgt);
    } else controls.update();
    sky.position.copy(camera.position);
    // véhicules volants
    for (let k = 0; k < cars.length; k++) {
      const c = cars[k]!;
      c.s += c.v * c.dir * dt;
      if (c.s > EXT) c.s -= EXT * 2;
      if (c.s < -EXT) c.s += EXT * 2;
      const x = c.axis === 0 ? c.s : c.lane;
      const z = c.axis === 0 ? c.lane : c.s;
      const ry = c.axis === 0 ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : c.dir > 0 ? 0 : Math.PI;
      const bob = Math.sin(t * 1.3 + k) * 0.4;
      dummy.position.set(x, c.y + bob, z);
      dummy.rotation.set(0, ry, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      carBody.setMatrixAt(k, dummy.matrix);
      // traînée rouge derrière (longueur ∝ vitesse), phares devant
      dummy.scale.set(2.6, 1, c.v * 0.9);
      dummy.updateMatrix();
      tails.setMatrixAt(k, dummy.matrix);
      dummy.rotation.set(0, ry + Math.PI, 0);
      dummy.scale.set(2.4, 1, 14);
      dummy.updateMatrix();
      heads.setMatrixAt(k, dummy.matrix);
    }
    carBody.instanceMatrix.needsUpdate = tails.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
    for (const tr of trains) {
      tr.s += tr.v * dt;
      if (tr.s > EXT) tr.s -= EXT * 2;
      if (tr.s < -EXT) tr.s += EXT * 2;
      tr.cars.forEach((m, i) => {
        const s = tr.s - Math.sign(tr.v) * i * 22;
        m.position.set(tr.axis === 0 ? s : tr.line, RAIL_Y - 4.2, tr.axis === 0 ? tr.line : s);
      });
    }
    if (rain) {
      rain.position.set(camera.position.x, camera.position.y - rainBox * 0.7, camera.position.z);
      const p = rain.geometry.attributes.position as T.BufferAttribute;
      const a = p.array as Float32Array;
      for (let i = 0; i < RAIN_N; i++) {
        const o = i * 6;
        const fall = (32 + (i % 7) * 2) * dt;
        a[o + 1]! -= fall;
        a[o + 4]! -= fall;
        if (a[o + 1]! < 0) {
          a[o + 1]! += rainBox * 1.4;
          a[o + 4]! += rainBox * 1.4;
        }
      }
      p.needsUpdate = true;
    }
    for (const f of puffs) {
      f.age += dt;
      if (f.age > f.life) f.age -= f.life;
      const k = f.age / f.life;
      f.sp.position.set(f.v.x + Math.sin(f.age * 0.8) * 2, 1 + k * 34, f.v.z + k * 6);
      f.sp.scale.setScalar(4 + k * 26);
      (f.sp.material as T.SpriteMaterial).opacity = 0.32 * Math.sin(Math.PI * k);
    }
    vtmp.copy(camera.position);
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
  (window as unknown as { REALIZE_STATS: Record<string, number> }).REALIZE_STATS = { 'gratte-ciel': boxes.count + prisms.count, écrans: holos.length, véhicules: nCars };
  (window as unknown as { REALIZE_ELEMENTS: string[] }).REALIZE_ELEMENTS = S.elements.filter((e) => made.has(e.comp)).map((e) => e.name);
  (window as unknown as { __scene: unknown }).__scene = { renderer, scene, camera, made: [...made], buildMs, firstFrameMs: () => firstFrameMs, frames: () => frames };
}
