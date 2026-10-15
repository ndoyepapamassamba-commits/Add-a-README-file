// UNIVERS « RUE AFRICAINE ANIMÉE » DU MOTEUR DE SCÈNE (v64, prompt du 15/10/2026 : « une rue africaine extrêmement
// vivante dans une grande ville moderne… circulation dense, piétons, marchés, feux, câbles, nids-de-poule… caméra
// aérienne qui descend dans la rue puis remonte »). Même contrat que sceneMain (sérialisée telle quelle, n'utilise que
// ses paramètres et le navigateur). Une vraie petite simulation : feux tricolores en phases, véhicules qui se suivent
// (distance de sécurité) et s'arrêtent au rouge — d'où les embouteillages —, motos qui remontent les files, bus qui
// marque l'arrêt, piétons qui marchent (jambes en opposition), vendeurs, enfants, chiens, linge et bâches au vent.
// Enseignes : noms fictifs (aucune marque réelle).
import type * as T from 'three';
import type { OrbitControls as OC } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SceneSpec } from './sceneKit';
import type { ScenePost } from './sceneRuntime';

export function sceneStreet(THREE: typeof T, OrbitControls: typeof OC, S: SceneSpec, PP?: ScenePost): void {
  const tStart = performance.now();
  const made = new Set<string>(['shops', 'traffic', 'taxis', 'buses', 'motos', 'pedestrians', 'vendors', 'market_stalls', 'traffic_lights', 'street_trees', 'signs', 'skyline', 'cables', 'bus_stop', 'sun', 'children', 'dogs', 'birds', 'clouds']);
  let seed = S.seed >>> 0 || 1;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rr = (a: number, b: number) => a + (b - a) * rnd();
  const pick = <X>(a: X[]) => a[Math.floor(rnd() * a.length)]!;
  const C = (h: string) => new THREE.Color(h);

  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  let PR = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(PR);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const late = S.time !== 'day';
  scene.fog = new THREE.FogExp2(C(late ? '#f0c79a' : '#cfd9e6'), 0.00075);
  const camera = new THREE.PerspectiveCamera(46, window.innerWidth / Math.max(1, window.innerHeight), 0.3, 5000);

  // ── ciel de fin d'après-midi, soleil bas dans l'axe de la rue (longues ombres) ───────────────────────────────
  const sunDir = new THREE.Vector3(-0.85, late ? 0.22 : 0.6, 0.3).normalize();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { zen: { value: C(late ? '#3d6fb0' : '#3f7fd6') }, hor: { value: C(late ? '#ffc890' : '#d6e6f6') }, sunDir: { value: sunDir } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform vec3 zen; uniform vec3 hor; uniform vec3 sunDir; varying vec3 vDir;',
        'void main(){ vec3 d = normalize(vDir); float h = d.y; vec3 c = mix(hor, zen, pow(smoothstep(-0.02, 0.6, h), 0.6));',
        '  float s = max(dot(d, sunDir), 0.0); c += vec3(1.0, 0.8, 0.5) * (pow(s, 12.0) * 0.5 + pow(s, 400.0) * 4.0);',
        '  gl_FragColor = vec4(c, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}',
      ].join('\n'),
    }),
  );
  scene.add(sky);
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const sk = new THREE.Scene();
    sk.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), sky.material as T.Material));
    scene.environment = pm.fromScene(sk, 0.02).texture;
    scene.environmentIntensity = 0.45;
  }
  const key = new THREE.DirectionalLight(C(late ? '#ffc58a' : '#fff4e2'), late ? 3.0 : 2.8);
  key.position.copy(sunDir).multiplyScalar(500);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -220, right: 220, top: 220, bottom: -220, near: 10, far: 1400 });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.5;
  scene.add(key);
  scene.add(new THREE.HemisphereLight(C('#9fc0ff'), C('#6a5240'), 0.75));

  // ── outils ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const dummy = new THREE.Object3D();
  const inst = (g: T.BufferGeometry, m: T.Material, n: number, shadow = true) => {
    const im = new THREE.InstancedMesh(g, m, Math.max(1, n));
    im.count = 0;
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.frustumCulled = false;
    scene.add(im);
    return im;
  };
  const put = (m: T.InstancedMesh, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, col?: T.Color) => {
    // jamais au-delà de la capacité réservée (la carte graphique lirait hors du tampon : image noire)
    if (m.count >= m.instanceMatrix.count) return -1;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    m.setMatrixAt(m.count, dummy.matrix);
    if (col) m.setColorAt(m.count, col);
    m.count++;
    return m.count - 1;
  };
  const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const done = () => {
    for (const o of scene.children) {
      const m = o as T.InstancedMesh;
      if (m.isInstancedMesh) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  };

  // ── texture des façades, calculée par la carte graphique (aucun fichier) ──────────────────────────────────────
  // enduit (grain, coulures sous les fenêtres, salissures au pied), bandeaux d'étage, fenêtres encadrées, persiennes ;
  // pour les tours : mur-rideau de verre (meneaux, panneaux qui reflètent le ciel).
  const facade = (mat: T.MeshStandardMaterial, kind: 'plaster' | 'glass', ground = 4) => {
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader =
        'varying vec3 vW; varying vec3 vN; flat varying float vId;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvN = normal; vId = float(gl_InstanceID);\nvec4 wq = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nwq = instanceMatrix * wq;\n#endif\nvW = (modelMatrix * wq).xyz;',
        );
      sh.fragmentShader =
        'varying vec3 vW; varying vec3 vN; flat varying float vId;\n' +
        'float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
        'float nn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }\n' +
        sh.fragmentShader.replace(
          '#include <color_fragment>',
          [
            '#include <color_fragment>',
            'if (abs(vN.y) < 0.5) {',
            '  float u = abs(vN.x) > 0.5 ? vW.z : vW.x;',
            '  float v = vW.y;',
            kind === 'plaster'
              ? [
                  // enduit : grain fin + taches larges ; salissure au pied du mur
                  '  float grain = nn(vec2(u, v) * 3.1) * 0.5 + nn(vec2(u, v) * 0.35) * 0.5;',
                  '  diffuseColor.rgb *= 0.84 + 0.26 * grain;',
                  '  diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 1.6, v));',
                  '  float floorH = 3.4; float cell = 2.6;',
                  '  vec2 c = vec2(u / cell, v / floorH); vec2 f = fract(c); vec2 id = floor(c);',
                  '  float upper = step(' + ground.toFixed(1) + ', v);',
                  // bandeau d'étage (corniche claire)
                  '  float band = smoothstep(0.0, 0.03, f.y) * (1.0 - smoothstep(0.03, 0.07, f.y));',
                  '  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.18 + 0.05, band * upper);',
                  // fenêtre : encadrement clair, vitre sombre qui reflète un peu le ciel, persiennes sur certaines
                  '  float wx = step(0.24, f.x) * step(f.x, 0.76); float wy = step(0.3, f.y) * step(f.y, 0.82);',
                  '  float fx = step(0.2, f.x) * step(f.x, 0.8) * step(0.26, f.y) * step(f.y, 0.86);',
                  '  float r = hh(id + vId * 3.7);',
                  '  vec3 glassC = mix(vec3(0.10, 0.12, 0.15), vec3(0.42, 0.5, 0.6), smoothstep(0.3, 0.82, f.y) * 0.5);',
                  '  vec3 shut = r > 0.7 ? vec3(0.15, 0.45, 0.35) : vec3(0.55, 0.3, 0.18);',
                  '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.9, 0.85), (fx - wx * wy) * upper * 0.9);',
                  '  diffuseColor.rgb = mix(diffuseColor.rgb, r > 0.55 ? shut * (0.8 + 0.2 * step(0.5, fract(f.y * 14.0))) : glassC, wx * wy * upper);',
                  // coulures sous les fenêtres
                  '  float drip = (1.0 - smoothstep(0.0, 0.25, f.y)) * step(0.3, f.x) * step(f.x, 0.7) * (0.6 + 0.4 * nn(vec2(u * 9.0, v)));',
                  '  diffuseColor.rgb *= 1.0 - drip * 0.16 * upper;',
                ].join('\n')
              : [
                  // mur-rideau : panneaux de verre (reflets variables), meneaux, allèges opaques
                  '  vec2 c = vec2(u / 3.0, v / 3.8); vec2 f = fract(c); vec2 id = floor(c);',
                  '  float mull = max(1.0 - smoothstep(0.0, 0.05, f.x), 1.0 - smoothstep(0.0, 0.06, f.y));',
                  '  float r = hh(id + vId * 1.3);',
                  '  vec3 sky = mix(vec3(0.55, 0.65, 0.78), vec3(0.95, 0.75, 0.55), smoothstep(0.0, 1.0, nn(vec2(u, v) * 0.02 + vId)));',
                  '  diffuseColor.rgb = mix(sky * (0.75 + 0.35 * r), vec3(0.2, 0.22, 0.25), step(0.82, f.y));',
                  '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.76, 0.78), mull);',
                ].join('\n'),
            '}',
          ].join('\n'),
        );
    };
    return mat;
  };

  // ── plan : une rue principale (axe x), trois carrefours, trottoirs, rues transversales (axe z) ───────────────────
  const L = 280; // demi-longueur de la rue
  const ROAD = 15; // largeur de chaussée (2 × 2 voies)
  const WALK = 6; // trottoirs
  const CROSS = [-130, 0, 130];
  const LANES = [-5.4, -1.9, 1.9, 5.4]; // z des voies (négatif = sens +x)
  // sol : asphalte avec marquages et nids-de-poule, trottoirs en dalles
  const asphalt = tex(1024, 128, (g) => {
    g.fillStyle = '#3b3a3c';
    g.fillRect(0, 0, 1024, 128);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + rnd() * 0.05})`;
      g.fillRect(rnd() * 1024, rnd() * 128, 2, 2);
    }
    g.fillStyle = '#e8e0c8';
    for (let x = 0; x < 1024; x += 48) g.fillRect(x, 62, 26, 3); // ligne médiane
    for (let k = 0; k < 14; k++) {
      // nids-de-poule
      g.fillStyle = 'rgba(20,18,16,.85)';
      g.beginPath();
      g.ellipse(rnd() * 1024, 10 + rnd() * 108, 4 + rnd() * 6, 2 + rnd() * 3, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  asphalt.wrapS = THREE.RepeatWrapping;
  asphalt.repeat.set(3, 1);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(L * 2 + 200, ROAD), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  scene.add(road);
  for (const cx of CROSS) {
    const cr = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, 520), new THREE.MeshStandardMaterial({ color: C('#3a393b'), roughness: 0.9 }));
    cr.rotation.x = -Math.PI / 2;
    cr.position.set(cx, 0.01, 0);
    cr.receiveShadow = true;
    scene.add(cr);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: C('#8a7a66'), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);
  const walkMat = new THREE.MeshStandardMaterial({ color: C('#b8ab98'), roughness: 0.95 });
  for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(box(L * 2 + 200, 0.18, WALK), walkMat);
    w.position.set(0, 0.09, sz * (ROAD / 2 + WALK / 2));
    w.receiveShadow = true;
    scene.add(w);
  }
  // passages piétons
  const zebra = inst(box(0.6, 0.02, 3.2), new THREE.MeshStandardMaterial({ color: C('#efeee6'), roughness: 0.8 }), 200, false);
  for (const cx of CROSS)
    for (const side of [-1, 1])
      for (let k = -6; k <= 6; k++) put(zebra, cx + side * (ROAD / 2 + 2.2), 0.02, k * 1.15, 1, 1, 1, Math.PI / 2);

  // ── façades : commerces au rez-de-chaussée, étages, climatiseurs, antennes, enseignes ─────────────────────────
  const facadeCols = ['#e8b04a', '#3fb6a8', '#e57a5a', '#f2e6c8', '#8fbf5a', '#e86f9a', '#5a8fd6', '#f0d070', '#d9d2c4', '#c96a3a'].map(C);
  const shopNames = ['ALIMENTATION KONAN', 'BOUTIQUE ÉLÉGANCE', 'TÉLÉPHONIE PLUS', 'SALON BEAUTÉ AFRO', 'MAQUIS CHEZ TANTIE', 'CAFÉ DU PLATEAU', 'FRUITS FRAIS', 'QUINCAILLERIE MODERNE', 'PRESSE & KIOSQUE', 'PHARMACIE DE LA PAIX', 'COUTURE WAX', 'GARBA EXPRESS', 'CORDONNERIE', 'TRANSFERT D’ARGENT', 'BOULANGERIE DU MATIN', 'ÉLECTRO SERVICE'];
  const shopSign = shopNames.map((n, i) =>
    tex(512, 96, (g) => {
      const bg = ['#c0392b', '#1f6f8b', '#2e8b57', '#8e44ad', '#d35400', '#2c3e50', '#b8860b', '#16a085'][i % 8]!;
      g.fillStyle = bg;
      g.fillRect(0, 0, 512, 96);
      g.fillStyle = '#ffffff';
      g.font = `800 ${n.length > 16 ? 34 : 44}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(n, 256, 50);
      g.strokeStyle = 'rgba(255,255,255,.7)';
      g.lineWidth = 4;
      g.strokeRect(6, 6, 500, 84);
    }),
  );
  const wall = inst(box(1, 1, 1).translate(0, 0.5, 0), facade(new THREE.MeshStandardMaterial({ roughness: 0.85 }), 'plaster'), 200);
  const winMat = new THREE.MeshStandardMaterial({ color: C('#2a3542'), roughness: 0.2, metalness: 0.5 });
  const wins = inst(box(1.2, 1.4, 0.12), winMat, 3000, false);
  const acs = inst(box(0.9, 0.55, 0.45), new THREE.MeshStandardMaterial({ color: C('#e8e6e0'), roughness: 0.6 }), 600);
  const antennas = inst(new THREE.CylinderGeometry(0.03, 0.03, 3, 4).translate(0, 1.5, 0), new THREE.MeshStandardMaterial({ color: C('#888') }), 300, false);
  const dishes = inst(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: C('#d8d8d8'), side: THREE.DoubleSide }), 200, false);
  const awnings = inst(box(1, 0.08, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 200);
  const shutters = inst(box(1, 1, 0.08), new THREE.MeshStandardMaterial({ color: C('#7d858c'), roughness: 0.5, metalness: 0.5 }), 200);
  const interiors = inst(box(1, 1, 0.05), new THREE.MeshStandardMaterial({ color: C('#1b1612'), emissive: C('#ffcf8a'), emissiveIntensity: 0.25 }), 200, false);
  const doors: { mesh: T.Mesh; ph: number }[] = [];
  const shops: { x: number; side: number; w: number }[] = [];
  for (const side of [-1, 1]) {
    let x = -L;
    while (x < L) {
      const w = rr(6, 12);
      const nearCross = CROSS.some((c) => Math.abs(x + w / 2 - c) < ROAD / 2 + w / 2 + 1);
      if (nearCross) {
        x += 4;
        continue;
      }
      const floors = 2 + Math.floor(rnd() * 4);
      const fh = 3.4;
      const h = floors * fh + 0.6;
      const zf = side * (ROAD / 2 + WALK);
      const cx = x + w / 2;
      const col = pick(facadeCols);
      put(wall, cx, 0, zf + side * 6, w - 0.3, h, 12, 0, col);
      // vitrine / intérieur sombre éclairé, rideau métallique à moitié levé, auvent coloré, enseigne
      put(interiors, cx, 1.6, zf + side * 0.01 - side * 0.02, w * 0.8, 2.6, 1);
      put(shutters, cx, 2.6 + rr(0, 0.6), zf - side * 0.06, w * 0.82, rr(0.6, 1.1), 1);
      put(awnings, cx, 3.25, zf - side * 1.2, w * 0.92, 1, 2.4, 0, pick(facadeCols).clone().offsetHSL(0, 0.15, -0.08));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, w * 0.85 * 0.19), new THREE.MeshStandardMaterial({ map: pick(shopSign), emissive: C('#ffffff'), emissiveIntensity: late ? 0.25 : 0.08, roughness: 0.6 }));
      sign.position.set(cx, 3.9, zf - side * 0.08);
      sign.rotation.y = side > 0 ? Math.PI : 0;
      scene.add(sign);
      // porte qui s'ouvre et se referme
      if (rnd() < 0.5) {
        const door = new THREE.Mesh(box(1.1, 2.3, 0.06).translate(0.55, 1.15, 0), new THREE.MeshStandardMaterial({ color: C('#6a4a32'), roughness: 0.7 }));
        door.position.set(cx + w * 0.3, 0.18, zf - side * 0.04);
        scene.add(door);
        doors.push({ mesh: door, ph: rnd() * 20 });
      }
      for (let f = 1; f < floors; f++) {
        const nw = Math.max(1, Math.floor(w / 2.6));
        for (let k = 0; k < nw; k++) {
          const wx = x + (k + 0.5) * (w / nw);
          put(wins, wx, f * fh + 1.7, zf - side * 0.02);
          if (rnd() < 0.3) put(acs, wx + 0.9, f * fh + 0.9, zf - side * 0.3);
        }
      }
      if (rnd() < 0.6) put(antennas, cx + rr(-w / 3, w / 3), h, zf + side * rr(2, 8));
      if (rnd() < 0.45) put(dishes, cx + rr(-w / 3, w / 3), h + 0.3, zf + side * rr(3, 9), 1, 1, 1, rr(0, 6));
      shops.push({ x: cx, side, w });
      x += w;
    }
  }
  // immeubles de bureaux au carrefour central (d'où sortent les travailleurs)
  const office = new THREE.Mesh(box(26, 48, 18).translate(0, 24, 0), new THREE.MeshStandardMaterial({ color: C('#9fb4c8'), roughness: 0.1, metalness: 0.8, envMapIntensity: 1.2 }));
  {
    // l'immeuble de bureaux en mur-rideau aussi (un seul exemplaire : on passe par une instance)
    const oi = inst(box(1, 1, 1).translate(0, 0.5, 0), facade(new THREE.MeshStandardMaterial({ color: C('#ffffff'), roughness: 0.15, metalness: 0.4 }), 'glass'), 1, true);
    put(oi, 32, 0, -(ROAD / 2 + WALK + 9), 26, 48, 18);
    office.visible = false;
  }
  office.position.set(32, 0, -(ROAD / 2 + WALK + 9));
  office.castShadow = true;
  scene.add(office);
  made.add('shops');

  // ── les quartiers autour de la rue (îlots, toits-terrasses, citernes) ──────────────────────────────────────────
  const blocks = inst(box(1, 1, 1).translate(0, 0.5, 0), facade(new THREE.MeshStandardMaterial({ roughness: 0.85 }), 'plaster', 1.5), 3200);
  const tanks = inst(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 10).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ color: C("#2f3a46"), roughness: 0.5 }), 1200, false);
  for (let x = -L + 4; x < L + 80; x += rr(9, 15))
    for (const side of [-1, 1])
      for (let z = ROAD / 2 + WALK + 15; z < 420; z += rr(11, 18)) {
        if (CROSS.some((c) => Math.abs(x - c) < ROAD / 2 + 3)) continue;
        // près de la rue : petits immeubles ; les plus hauts seulement dans les îlots du fond
        const h = rr(5, 16) * (rnd() < 0.08 && z > 70 ? 2.5 : 1) * (z < 45 ? 0.75 : 1);
        put(blocks, x, 0, side * z, rr(7, 13), h, rr(8, 14), 0, pick(facadeCols).clone().offsetHSL(0, -0.15, rr(-0.06, 0.04)));
        if (rnd() < 0.3) put(tanks, x + rr(-2, 2), h, side * z + rr(-2, 2));
      }
  // ── au bout de la rue : la lagune, un pont à haubans et la skyline des tours (contre-jour du couchant) ───────────
  const lagoonX = -L - 70;
  const lagoon = new THREE.Mesh(new THREE.PlaneGeometry(900, 2600), new THREE.MeshStandardMaterial({ color: C('#6a7e8e'), roughness: 0.08, metalness: 0.6 }));
  lagoon.rotation.x = -Math.PI / 2;
  lagoon.position.set(lagoonX - 450, 0.05, 0);
  scene.add(lagoon);
  const bridgeMat = new THREE.MeshStandardMaterial({ color: C('#d8d4cc'), roughness: 0.5, metalness: 0.3 });
  const deck = new THREE.Mesh(box(14, 1.2, 1400), bridgeMat);
  deck.position.set(lagoonX - 380, 14, 0);
  scene.add(deck);
  const pylon = new THREE.Mesh(box(4, 110, 4).translate(0, 55, 0), bridgeMat);
  pylon.position.set(lagoonX - 380, 0, 120);
  pylon.rotation.x = -0.18;
  scene.add(pylon);
  const stays: number[] = [];
  for (let k = 1; k <= 12; k++) for (const sgn of [-1, 1]) stays.push(lagoonX - 380, 100 - k * 2, 120 - 10, lagoonX - 380, 14.6, 120 + sgn * k * 24);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(stays, 3));
  scene.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: C('#efe8dc') })));
  const towers = inst(box(1, 1, 1).translate(0, 0.5, 0), facade(new THREE.MeshStandardMaterial({ color: C('#ffffff'), roughness: 0.18, metalness: 0.35 }), 'glass'), 220, false);
  for (let k = 0; k < 220; k++) {
    // la skyline se masse derrière la lagoon, dans le contre-jour, et s'étire sur les côtés
    const x = lagoonX - rr(520, 1100);
    const z = rr(-700, 700) * (rnd() < 0.6 ? 0.45 : 1);
    put(towers, x, 0, z, rr(18, 42), rr(45, 210) * (Math.abs(z) < 250 ? 1.25 : 0.8), rr(18, 42), rr(0, 3));
  }

  // ── mobilier urbain : lampadaires, poteaux et câbles, arbres, parasols, chaises, étals, caisses, poubelles, bornes ─
  const poleMat = new THREE.MeshStandardMaterial({ color: C('#4a4a48'), roughness: 0.6, metalness: 0.4 });
  const lamps = inst(new THREE.CylinderGeometry(0.09, 0.12, 8, 6).translate(0, 4, 0), poleMat, 80);
  const lampHeads = inst(box(1.2, 0.2, 0.4), new THREE.MeshStandardMaterial({ color: C('#d8d4c8'), emissive: C('#ffd38a'), emissiveIntensity: late ? 0.5 : 0 }), 80, false);
  const poles = inst(new THREE.CylinderGeometry(0.13, 0.16, 9, 6).translate(0, 4.5, 0), new THREE.MeshStandardMaterial({ color: C('#6b5a46'), roughness: 0.9 }), 60);
  const polePts: { x: number; z: number }[] = [];
  for (let x = -L; x <= L; x += 22) {
    for (const side of [-1, 1]) {
      const z = side * (ROAD / 2 + 0.6);
      put(lamps, x + side * 5, 0.18, z);
      put(lampHeads, x + side * 5, 8.1, z - side * 0.5);
    }
    const pz = ROAD / 2 + WALK - 0.6;
    put(poles, x + 9, 0.18, pz);
    polePts.push({ x: x + 9, z: pz });
  }
  // câbles électriques aériens : chaînettes entre poteaux, et quelques traversées de rue
  const cablePts: number[] = [];
  const catenary = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number) => {
    const n = 14;
    for (let i = 0; i < n; i++) {
      for (const k of [i / n, (i + 1) / n]) cablePts.push(ax + (bx - ax) * k, ay + (by - ay) * k - sag * 4 * k * (1 - k), az + (bz - az) * k);
    }
  };
  for (let i = 0; i < polePts.length - 1; i++)
    for (const dy of [8.6, 8.1, 7.6]) catenary(polePts[i]!.x, dy, polePts[i]!.z, polePts[i + 1]!.x, dy, polePts[i + 1]!.z, 0.9);
  for (let i = 0; i < polePts.length; i += 3) catenary(polePts[i]!.x, 8.4, polePts[i]!.z, polePts[i]!.x + 6, 7.5, -(ROAD / 2 + WALK - 1), 1.6);
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
  scene.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: C('#1c1c1c') })));
  // arbres urbains (le vent fait bouger les houppiers)
  const timeU = { value: 0 };
  const leafMat = new THREE.MeshStandardMaterial({ color: C('#4f7d36'), roughness: 0.9 });
  leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = timeU;
    sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);\ntransformed.x += sin(uT * 1.6 + ip.x * 0.2) * 0.08 * (position.y + 1.0);\ntransformed.z += cos(uT * 1.3 + ip.z * 0.2) * 0.05 * (position.y + 1.0);');
  };
  // palmiers le long des trottoirs (palmes qui bougent au vent) et quelques arbres d'ombre
  const palmTrunks = inst(new THREE.CylinderGeometry(0.16, 0.26, 9, 7).translate(0, 4.5, 0), new THREE.MeshStandardMaterial({ color: C('#7a6448'), roughness: 0.95 }), 120);
  const frondG = new THREE.ConeGeometry(0.5, 4.2, 4, 1);
  frondG.translate(0, 2.1, 0);
  frondG.rotateX(Math.PI / 2 - 0.45);
  frondG.scale(1, 0.25, 1);
  const fronds = inst(frondG, leafMat, 120 * 9);
  const trunks = inst(new THREE.CylinderGeometry(0.18, 0.28, 4, 6).translate(0, 2, 0), new THREE.MeshStandardMaterial({ color: C('#5a4632') }), 30);
  const crowns = inst(new THREE.IcosahedronGeometry(1, 1), leafMat, 60);
  for (let x = -L + 8; x < L + 40; x += rr(11, 18)) {
    if (CROSS.some((c) => Math.abs(x - c) < 11)) continue;
    for (const side of [-1, 1]) {
      if (rnd() < 0.12) continue;
      const z = side * (ROAD / 2 + WALK * 0.5);
      if (rnd() < 0.08) {
        put(trunks, x, 0.18, z);
        put(crowns, x, 5.6, z, 3.2, 2.4, 3.2, 0, C('#4f7d36').offsetHSL(0, 0, rr(-0.06, 0.06)));
        continue;
      }
      const lean = rr(-0.08, 0.08);
      dummy.position.set(x, 0.18, z);
      dummy.rotation.set(0, 0, lean);
      dummy.scale.set(1, rr(0.9, 1.25), 1);
      dummy.updateMatrix();
      palmTrunks.setMatrixAt(palmTrunks.count++, dummy.matrix);
      const top = 0.18 + 9 * dummy.scale.y;
      for (let f = 0; f < 9; f++) {
        dummy.position.set(x + Math.sin(-lean) * 0.2, top, z);
        dummy.rotation.set(0, (f / 9) * Math.PI * 2 + rr(-0.2, 0.2), 0);
        dummy.scale.set(1, 1, rr(0.85, 1.15));
        dummy.updateMatrix();
        fronds.setMatrixAt(fronds.count, dummy.matrix);
        fronds.setColorAt(fronds.count++, C('#4e8a3a').offsetHSL(0, 0, rr(-0.05, 0.05)));
      }
    }
  }
  // marché de rue : parasols, chaises en plastique, étals de fruits, caisses, bâches au vent
  const market = { x0: -L + 20, x1: -150 };
  const parasolMat = new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide });
  const parasols = inst(new THREE.ConeGeometry(1.8, 0.7, 10, 1, true), parasolMat, 60);
  const sticks = inst(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 4).translate(0, 1.2, 0), poleMat, 60, false);
  const chairs = inst(box(0.45, 0.45, 0.45).translate(0, 0.45, 0), new THREE.MeshStandardMaterial({ roughness: 0.5 }), 200);
  const tables = inst(box(1.8, 0.9, 1).translate(0, 0.45, 0), new THREE.MeshStandardMaterial({ color: C('#8a6a48'), roughness: 0.8 }), 60);
  const fruits = inst(new THREE.SphereGeometry(0.11, 6, 4), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 4000, false);
  const crates = inst(box(0.6, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: C('#b88a52'), roughness: 0.9 }), 300);
  const bins = inst(new THREE.CylinderGeometry(0.35, 0.3, 0.9, 10).translate(0, 0.45, 0), new THREE.MeshStandardMaterial({ color: C('#2f6b3a'), roughness: 0.6 }), 40);
  const bollards = inst(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 8).translate(0, 0.45, 0), poleMat, 120, false);
  const fruitCols = ['#e8a23a', '#e05a2a', '#f2d24a', '#5aa33a', '#c8322a', '#8a3a7a'].map(C);
  const umbrellaCols = ['#e23b3b', '#f2b33a', '#2f8bd6', '#3fae5a', '#e86fb0', '#f2f2f2'].map(C);
  const tarps: { g: T.BufferGeometry; base: Float32Array; ph: number }[] = [];
  for (let x = market.x0; x < market.x1; x += rr(5, 8)) {
    for (const side of [-1, 1]) {
      const z = side * (ROAD / 2 + WALK * 0.62);
      put(sticks, x, 0.18, z);
      put(parasols, x, 2.6, z, 1, 1, 1, 0, pick(umbrellaCols));
      put(tables, x + 0.6, 0.18, z - side * 0.6);
      for (let f = 0; f < 26; f++) put(fruits, x + 0.6 + rr(-0.75, 0.75), 1.15 + rr(0, 0.12), z - side * 0.6 + rr(-0.4, 0.4), 1, 1, 1, 0, pick(fruitCols));
      for (let c = 0; c < 3; c++) put(crates, x - 1 + rr(-0.3, 0.3), 0.38 + c * 0.4, z + side * 0.4, 1, 1, 1, rr(-0.2, 0.2));
      for (let c = 0; c < 2; c++) put(chairs, x + rr(-1.6, 1.6), 0.18, z + side * rr(0.6, 1.6), 1, 1, 1, rr(0, 6), pick([C('#e23b3b'), C('#2f8bd6'), C('#f2f2f2'), C('#3fae5a')]));
      if (rnd() < 0.35) {
        // bâche tendue qui ondule
        const g = new THREE.PlaneGeometry(4, 3, 8, 6);
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: pick(umbrellaCols), side: THREE.DoubleSide, roughness: 0.8 }));
        m.rotation.x = -Math.PI / 2 + 0.15 * side;
        m.position.set(x + 2, 3.0, z);
        scene.add(m);
        tarps.push({ g, base: Float32Array.from(g.attributes.position!.array as Float32Array), ph: rnd() * 6 });
      }
    }
  }
  for (let x = -L + 15; x < L; x += rr(18, 30)) put(bins, x, 0.18, (rnd() < 0.5 ? -1 : 1) * (ROAD / 2 + WALK - 0.8));
  for (const cx of CROSS)
    for (const side of [-1, 1]) for (let k = -3; k <= 3; k++) put(bollards, cx + k * 1.4, 0.18, side * (ROAD / 2 + 0.35));
  // linge et vêtements suspendus devant les boutiques (au vent)
  const clothes: { g: T.BufferGeometry; base: Float32Array; ph: number }[] = [];
  for (const sh of shops.filter(() => rnd() < 0.25)) {
    for (let k = 0; k < 3; k++) {
      const g = new THREE.PlaneGeometry(0.8, 1.1, 4, 4);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: pick(umbrellaCols), side: THREE.DoubleSide, roughness: 0.9 }));
      m.position.set(sh.x - 1.5 + k * 1.1, 2.6, sh.side * (ROAD / 2 + WALK - 1.4));
      scene.add(m);
      clothes.push({ g, base: Float32Array.from(g.attributes.position!.array as Float32Array), ph: rnd() * 6 });
    }
  }
  // panneau directionnel au-dessus de la chaussée (quartiers ou directions génériques)
  const abidjan = /abidjan/i.test(S.light + S.view + S.elements.map((e) => e.detail).join(' '));
  const signTex = tex(512, 256, (g) => {
    g.fillStyle = '#1f6b46';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    g.strokeRect(8, 8, 496, 240);
    g.fillStyle = '#ffffff';
    g.font = '700 38px system-ui, sans-serif';
    (abidjan ? ['↑ PLATEAU', '↑ MARCORY', '← COCODY', '→ RIVIERA'] : ['↑ CENTRE-VILLE', '↑ PORT', '← GARE', '→ AÉROPORT']).forEach((l, i) => g.fillText(l, 40, 62 + i * 52));
  });
  const gantry = new THREE.Group();
  const gp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 7, 8).translate(0, 3.5, 0), poleMat);
  gp.position.set(0, 0.18, ROAD / 2 + 0.8);
  const arm = new THREE.Mesh(box(0.2, 0.2, 9), poleMat);
  arm.position.set(0, 7, ROAD / 2 - 3.5);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.6), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5 }));
  panel.position.set(0.12, 6.2, ROAD / 2 - 6);
  panel.rotation.y = Math.PI / 2;
  gantry.add(gp, arm, panel);
  gantry.position.x = CROSS[2]! + 16;
  scene.add(gantry);
  // abribus
  const stopX = 70;
  const shelter = new THREE.Group();
  const roof = new THREE.Mesh(box(6, 0.15, 2.2), new THREE.MeshStandardMaterial({ color: C('#2f6fa8'), roughness: 0.4 }));
  roof.position.y = 2.8;
  const back = new THREE.Mesh(box(6, 2.6, 0.08), new THREE.MeshStandardMaterial({ color: C('#bcd8ee'), transparent: true, opacity: 0.45 }));
  back.position.set(0, 1.4, 1.05);
  const bench = new THREE.Mesh(box(4, 0.1, 0.5), poleMat);
  bench.position.set(0, 0.5, 0.7);
  shelter.add(roof, back, bench);
  shelter.position.set(stopX, 0.18, -(ROAD / 2 + 2.2));
  scene.add(shelter);

  // ── feux tricolores : phases alternées axe principal / rues transversales ────────────────────────────────────
  const CYCLE = 30; // vert 13 s, orange 3 s, rouge 14 s pour l'axe principal
  const mainState = (t: number) => {
    const u = t % CYCLE;
    return u < 13 ? 'green' : u < 16 ? 'orange' : 'red';
  };
  const crossState = (t: number) => {
    const u = t % CYCLE;
    return u >= 16 && u < 27 ? 'green' : u >= 27 && u < 30 ? 'orange' : 'red';
  };
  const lightMats: { mat: T.MeshStandardMaterial; axis: 'main' | 'cross'; color: 'red' | 'orange' | 'green' }[] = [];
  for (const cx of CROSS)
    for (const [dx, dz, axis] of [[-1, -1, 'main'], [1, 1, 'main'], [1, -1, 'cross'], [-1, 1, 'cross']] as const) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6).translate(0, 2.1, 0), poleMat);
      const head = new THREE.Mesh(box(0.4, 1.2, 0.35), new THREE.MeshStandardMaterial({ color: C('#1a1a1a') }));
      head.position.y = 4.6;
      g.add(pole, head);
      (['red', 'orange', 'green'] as const).forEach((c, i) => {
        const mat = new THREE.MeshStandardMaterial({ color: C('#111'), emissive: C(c === 'red' ? '#ff2a1a' : c === 'orange' ? '#ffaa1a' : '#2aff6a'), emissiveIntensity: 0 });
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), mat);
        l.position.set(0, 4.95 - i * 0.36, 0.18);
        g.add(l);
        lightMats.push({ mat, axis, color: c });
      });
      g.position.set(cx + dx * (ROAD / 2 + 1), 0.18, dz * (ROAD / 2 + 1));
      g.rotation.y = axis === 'main' ? (dx < 0 ? -Math.PI / 2 : Math.PI / 2) : dz < 0 ? Math.PI : 0;
      scene.add(g);
    }

  // ── véhicules : taxis jaunes, voitures, bus, motos, tricycles, camions de livraison ───────────────────────────
  type VT = 'taxi' | 'car' | 'bus' | 'moto' | 'tri' | 'truck';
  const SPEC: Record<VT, { len: number; w: number; h: number; v: number; cols: string[] }> = {
    taxi: { len: 4.4, w: 1.8, h: 1.5, v: 11, cols: ['#f6c514'] },
    car: { len: 4.5, w: 1.85, h: 1.5, v: 12, cols: ['#e8e8e8', '#2a2a2a', '#8a1c1c', '#1c3a8a', '#7a7a7a', '#c0c0c0'] },
    bus: { len: 12, w: 2.5, h: 3.1, v: 9, cols: ['#1f6fb2'] },
    moto: { len: 2, w: 0.7, h: 1.4, v: 14, cols: ['#c0392b', '#2c3e50', '#16a085'] },
    tri: { len: 2.9, w: 1.3, h: 1.8, v: 8.5, cols: ['#2e8b57', '#e67e22'] },
    truck: { len: 7, w: 2.3, h: 3, v: 8, cols: ['#e8e2d6'] },
  };
  const bodyMats: Record<VT, T.InstancedMesh> = {} as Record<VT, T.InstancedMesh>;
  const cabMats: Record<VT, T.InstancedMesh> = {} as Record<VT, T.InstancedMesh>;
  const glass = new THREE.MeshStandardMaterial({ color: C('#28323c'), roughness: 0.1, metalness: 0.7 });
  const NV: Record<VT, number> = { taxi: 34, car: 40, bus: 4, moto: 30, tri: 10, truck: 6 };
  for (const k of Object.keys(SPEC) as VT[]) {
    const sp = SPEC[k];
    bodyMats[k] = inst(box(sp.w, sp.h * 0.55, sp.len).translate(0, sp.h * 0.42, 0), new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.25, envMapIntensity: 1.2 }), NV[k] + 20);
    cabMats[k] = inst(box(sp.w * 0.92, sp.h * 0.42, k === 'bus' || k === 'truck' ? sp.len * 0.96 : sp.len * 0.5).translate(0, sp.h * 0.88, k === 'truck' ? sp.len * 0.3 : -sp.len * 0.05), k === 'truck' ? new THREE.MeshStandardMaterial({ color: C('#d8d2c4') }) : glass, NV[k] + 20);
  }
  const riders = inst(new THREE.CapsuleGeometry(0.25, 0.6, 3, 6), new THREE.MeshStandardMaterial({ color: C('#3a2a20') }), 60);
  // feux avant (blancs) et arrière (rouges) : lisibles à contre-jour
  const headL = inst(box(1, 0.18, 0.05), new THREE.MeshBasicMaterial({ color: C('#fff4d8'), toneMapped: false }), 200, false);
  const tailL = inst(box(1, 0.18, 0.05), new THREE.MeshBasicMaterial({ color: C('#ff2a2a'), toneMapped: false }), 200, false);
  type Veh = { type: VT; lane: number; axis: 'main' | 'cross'; dir: 1 | -1; s: number; v: number; vmax: number; stopUntil: number; parked: boolean; bi: number; col: T.Color; pos: number };
  const vehs: Veh[] = [];
  const addVeh = (type: VT, axis: 'main' | 'cross', lane: number, s: number, parked = false) => {
    const sp = SPEC[type];
    vehs.push({ type, axis, lane, dir: (axis === 'main' ? (lane < 0 ? 1 : -1) : lane < 0 ? 1 : -1) as 1 | -1, s, v: parked ? 0 : sp.v * 0.6, vmax: sp.v * rr(0.85, 1.15), stopUntil: 0, parked, bi: 0, col: C(pick(sp.cols)), pos: 0 });
  };
  const types = (Object.keys(NV) as VT[]).flatMap((k) => Array<VT>(NV[k]).fill(k));
  for (const ty of types) addVeh(ty, rnd() < 0.82 ? 'main' : 'cross', pick(LANES), rr(-L, L));
  // véhicules stationnés le long du trottoir
  for (let k = 0; k < 14; k++) addVeh(pick(['car', 'taxi', 'truck'] as VT[]), 'main', rnd() < 0.5 ? -7.0 : 7.0, rr(-L + 20, L - 20), true);
  // espacement initial : pas deux véhicules l'un dans l'autre
  for (const v of vehs) {
    const same = vehs.filter((o) => o !== v && o.axis === v.axis && Math.abs(o.lane - v.lane) < 0.5 && Math.abs(o.s - v.s) < 8);
    if (same.length) v.s += 9 * same.length;
  }
  made.add('traffic');

  // ── piétons : foule qui marche (jambes en opposition), commerçants qui discutent, vendeurs, enfants, étudiants ─
  const NP = 900;
  const skin = ['#5a3a26', '#6b4430', '#4a2e1e', '#7a5038', '#3a2416'].map(C);
  const cloth = ['#e23b3b', '#f2b33a', '#2f8bd6', '#3fae5a', '#e86fb0', '#f2f2f2', '#7a3fae', '#1f3a5a', '#d9682a', '#2a2a2a'].map(C);
  // tissus wax : motifs dessinés (cercles, losanges, rayures) teintés par personne
  const wax = tex(128, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 32)
      for (let x = 0; x < 128; x += 32) {
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.beginPath();
        g.arc(x + 16, y + 16, 11, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.beginPath();
        g.arc(x + 16, y + 16, 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.fillRect(x, y + 30, 32, 2);
        g.beginPath();
        g.moveTo(x + 16, y + 2);
        g.lineTo(x + 22, y + 8);
        g.lineTo(x + 16, y + 14);
        g.lineTo(x + 10, y + 8);
        g.fill();
      }
  });
  wax.wrapS = wax.wrapT = THREE.RepeatWrapping;
  wax.repeat.set(2, 2);
  const torsos = inst(new THREE.CapsuleGeometry(0.22, 0.55, 3, 8), new THREE.MeshStandardMaterial({ map: wax, roughness: 0.85 }), NP, true);
  const heads = inst(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.7 }), NP, false);
  const legs = inst(box(0.13, 0.8, 0.14).translate(0, -0.4, 0), new THREE.MeshStandardMaterial({ color: C('#2a2a34'), roughness: 0.9 }), NP * 2, false);
  type Ped = { x: number; z: number; dir: number; v: number; ph: number; mode: 'walk' | 'chat' | 'vendor' | 'kid' | 'cross'; home: { x: number; z: number }; h: number };
  const peds: Ped[] = [];
  for (let k = 0; k < NP; k++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const r = rnd();
    const mode: Ped['mode'] = r < 0.62 ? 'walk' : r < 0.8 ? 'chat' : r < 0.88 ? 'vendor' : 'kid';
    const x = rr(-L, L);
    const z = mode === 'vendor' ? pick(LANES) * 0.95 : side * (ROAD / 2 + rr(0.8, WALK - 1.2));
    peds.push({ x, z, dir: rnd() < 0.5 ? 1 : -1, v: mode === 'walk' ? rr(1.1, 1.6) : mode === 'kid' ? rr(1.6, 2.6) : 0.4, ph: rnd(), mode, home: { x: mode === 'kid' ? rr(-20, 20) + 70 : x, z: mode === 'kid' ? -(ROAD / 2 + WALK + 3) : z }, h: mode === 'kid' ? rr(0.62, 0.78) : rr(0.92, 1.08) });
    torsos.setColorAt(k, pick(cloth));
    heads.setColorAt(k, pick(skin));
  }
  torsos.count = heads.count = NP;
  legs.count = NP * 2;
  made.add('pedestrians');
  // chiens errants qui traversent
  const dogMat = new THREE.MeshStandardMaterial({ color: C('#a8865a'), roughness: 0.9 });
  const dogs: { g: T.Group; legs: T.Mesh[]; x: number; z: number; v: number; ph: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(box(0.35, 0.35, 0.9), dogMat);
    body.position.y = 0.55;
    const head = new THREE.Mesh(box(0.25, 0.25, 0.32), dogMat);
    head.position.set(0, 0.75, 0.55);
    g.add(body, head);
    const lg: T.Mesh[] = [];
    for (const [lx, lz] of [[-0.12, 0.3], [0.12, 0.3], [-0.12, -0.3], [0.12, -0.3]] as const) {
      const l = new THREE.Mesh(box(0.08, 0.4, 0.08).translate(0, -0.2, 0), dogMat);
      l.position.set(lx, 0.42, lz);
      g.add(l);
      lg.push(l);
    }
    scene.add(g);
    dogs.push({ g, legs: lg, x: rr(-L, L), z: rr(-14, 14), v: rr(1.2, 2.2) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6 });
  }
  // oiseaux et nuages
  const birdG = new THREE.BufferGeometry();
  birdG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, 0, 0, -0.3, 1, 0.05, -0.05, 0, 0, 0.25, 0, 0, -0.3, -1, 0.05, -0.05], 3));
  const birds = inst(birdG, new THREE.MeshBasicMaterial({ color: C('#2b211b'), side: THREE.DoubleSide }), 30, false);
  birds.count = 30;
  const cloudTex = tex(256, 128, (g) => {
    for (let i = 0; i < 22; i++) {
      const x = 40 + rnd() * 176;
      const y = 50 + rnd() * 40;
      const r = 18 + rnd() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,.75)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  const clouds: T.Sprite[] = [];
  for (let k = 0; k < 10; k++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: C(late ? '#ffd2b0' : '#ffffff'), transparent: true, depthWrite: false, fog: false }));
    sp.position.set(rr(-1500, 1500), rr(260, 420), rr(-1500, 1500));
    sp.scale.set(rr(300, 600), rr(120, 220), 1);
    scene.add(sp);
    clouds.push(sp);
  }
  done();

  // ── caméra : vue aérienne → descente dans la rue → suit la circulation → traverse le marché → remonte ───────────
  const path = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(L + 30, 10, 2),
      new THREE.Vector3(L - 40, 26, 30),
      new THREE.Vector3(170, 90, 120),
      new THREE.Vector3(150, 60, 50),
      new THREE.Vector3(110, 8, 3.8),
      new THREE.Vector3(30, 3.4, 3.8),
      new THREE.Vector3(-60, 3.4, 3.8),
      new THREE.Vector3(-150, 3.2, 1.0),
      new THREE.Vector3(-230, 4.5, 4.5),
      new THREE.Vector3(-260, 40, 30),
      new THREE.Vector3(-160, 120, 140),
      new THREE.Vector3(60, 170, 220),
    ],
    false,
    'catmullrom',
    0.35,
  );
  const DUR = 72;
  const camAt = (t: number) => {
    const u = Math.min(1, (t % (DUR + 8)) / DUR);
    const k = u * u * (3 - 2 * u);
    const p = path.getPointAt(k);
    const ahead = path.getPointAt(Math.min(1, k + 0.03));
    const low = p.y < 12;
    // plan d'ouverture : dans l'axe de la rue, vers le soleil couchant et la skyline au bout
    const tgt = k < 0.04 ? new THREE.Vector3(-L, 6, 0) : low ? new THREE.Vector3(ahead.x - 12, 2.6, ahead.z * 0.3) : new THREE.Vector3(0, 6, 0).lerp(ahead, 0.25);
    return { p, tgt };
  };
  const c0 = camAt(0);
  camera.position.copy(c0.p);
  camera.lookAt(c0.tgt);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(c0.tgt);
  controls.enableDamping = true;
  let auto = true;
  controls.addEventListener('start', () => (auto = false));

  let composer: InstanceType<ScenePost['EffectComposer']> | null = null;
  if (PP) {
    try {
      composer = new PP.EffectComposer(renderer);
      composer.addPass(new PP.RenderPass(scene, camera));
      composer.addPass(new PP.UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.22, 0.6, 0.88));
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
  if (cap) cap.textContent = `✨ JEV · scène instantanée — rue animée : ${vehs.length} véhicules, ${NP} piétons, ${shops.length} commerces, feux en phases — glisser pour reprendre la main`;

  // ── boucle : feux, circulation (suivi + arrêt au rouge), piétons, chiens, vent, oiseaux ─────────────────────────
  const t0 = performance.now();
  const buildMs = Math.round(t0 - tStart);
  let firstFrameMs = 0;
  let frames = 0;
  let last = t0;
  const STOP = ROAD / 2 + 3.5; // ligne d'arrêt avant le carrefour
  const frame = () => {
    const now = performance.now();
    const t = (now - t0) / 1000;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    timeU.value = t;
    const ms = mainState(t);
    const cs = crossState(t);
    for (const l of lightMats) l.mat.emissiveIntensity = (l.axis === 'main' ? ms : cs) === l.color ? 3.2 : 0.05;
    // circulation : chaque véhicule suit celui de devant (distance de sécurité) et respecte le feu
    const byLane = new Map<string, Veh[]>();
    for (const v of vehs) {
      const k = `${v.axis}:${v.lane}`;
      const arr = byLane.get(k);
      if (arr) arr.push(v);
      else byLane.set(k, [v]);
    }
    for (const arr of byLane.values()) {
      arr.sort((a, b) => a.dir * (b.s - a.s));
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i]!;
        if (v.parked) continue;
        const lead = arr[i - 1];
        const sp = SPEC[v.type];
        let target = v.vmax;
        if (lead) {
          const gap = v.dir * (lead.s - v.s) - (SPEC[lead.type].len + sp.len) / 2;
          target = Math.min(target, Math.max(0, (gap - 2) / 1.2));
        }
        // feu : s'arrêter avant le carrefour si rouge / orange et assez loin
        const state = v.axis === 'main' ? ms : cs;
        if (state !== 'green') {
          for (const c of v.axis === 'main' ? CROSS : [0]) {
            const dist = v.dir * (c - v.s) - STOP - sp.len / 2;
            if (dist > -0.5 && dist < 30 && !(state === 'orange' && dist < 4)) target = Math.min(target, Math.max(0, dist / 1.6));
          }
        }
        // le bus marque l'arrêt à l'abribus
        if (v.type === 'bus' && v.axis === 'main' && v.dir < 0 && Math.abs(v.s - stopX) < 1.5 && v.stopUntil < t - 20) v.stopUntil = t + 7;
        if (v.stopUntil > t) target = 0;
        // les motos remontent les files : changent de voie quand elles sont bloquées
        if (v.type === 'moto' && target < 2 && rnd() < 0.02) v.lane = v.lane < 0 ? (v.lane === -5.4 ? -1.9 : -5.4) : v.lane === 5.4 ? 1.9 : 5.4;
        v.v += Math.max(-6 * dt, Math.min(2.6 * dt, target - v.v));
        v.s += v.dir * v.v * dt;
        const lim = v.axis === 'main' ? L + 60 : 250;
        if (v.s > lim) v.s = -lim;
        if (v.s < -lim) v.s = lim;
      }
    }
    for (const k of Object.keys(bodyMats) as VT[]) {
      bodyMats[k].count = 0;
      cabMats[k].count = 0;
    }
    riders.count = 0;
    headL.count = 0;
    tailL.count = 0;
    for (const v of vehs) {
      v.pos += v.v * dt;
      const x = v.axis === 'main' ? v.s : CROSS[1]! + v.lane;
      const z = v.axis === 'main' ? v.lane : v.s;
      const ry = v.axis === 'main' ? (v.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : v.dir > 0 ? 0 : Math.PI;
      const bob = Math.sin(v.pos * 2.1) * 0.015;
      put(bodyMats[v.type], x, bob, z, 1, 1, 1, ry, v.col);
      put(cabMats[v.type], x, bob, z, 1, 1, 1, ry);
      if (v.type === 'moto' || v.type === 'tri') put(riders, x, 1.25, z, 1, 1, 1, ry);
      const sp = SPEC[v.type];
      const fx = Math.sin(ry) * sp.len * 0.5;
      const fz = Math.cos(ry) * sp.len * 0.5;
      put(headL, x + fx, 0.75, z + fz, sp.w * 0.85, 1, 1, ry);
      put(tailL, x - fx, 0.8, z - fz, sp.w * 0.85, 1, 1, ry);
    }
    headL.instanceMatrix.needsUpdate = tailL.instanceMatrix.needsUpdate = true;
    for (const k of Object.keys(bodyMats) as VT[]) {
      bodyMats[k].instanceMatrix.needsUpdate = cabMats[k].instanceMatrix.needsUpdate = true;
      if (bodyMats[k].instanceColor) bodyMats[k].instanceColor!.needsUpdate = true;
    }
    riders.instanceMatrix.needsUpdate = true;
    // piétons : marche (balancement vertical deux fois par foulée, jambes en opposition), discussions, enfants qui jouent
    for (let k = 0; k < peds.length; k++) {
      const p = peds[k]!;
      let swing = 0;
      if (p.mode === 'walk') {
        p.x += p.dir * p.v * dt;
        if (p.x > L) p.x = -L;
        if (p.x < -L) p.x = L;
        p.ph = (p.ph + (p.v / 1.4) * dt) % 1;
        swing = Math.sin(p.ph * Math.PI * 2) * 0.45;
      } else if (p.mode === 'kid') {
        const a = t * p.v * 0.5 + k;
        p.x = p.home.x + Math.cos(a) * 4;
        p.z = p.home.z + Math.sin(a * 1.3) * 2.5;
        p.ph = (p.ph + 2.2 * dt) % 1;
        swing = Math.sin(p.ph * Math.PI * 2) * 0.6;
      } else if (p.mode === 'vendor') {
        // les vendeurs ambulants circulent entre les véhicules arrêtés (feu rouge)
        if (ms !== 'green') p.x += Math.sin(t * 0.3 + k) * 0.6 * dt;
        p.ph = (p.ph + 0.5 * dt) % 1;
        swing = ms !== 'green' ? Math.sin(p.ph * Math.PI * 2) * 0.3 : 0;
      }
      const bobY = p.mode === 'chat' ? 0 : Math.abs(Math.sin(p.ph * Math.PI * 2)) * 0.04;
      const hgt = p.h;
      const ry = p.mode === 'walk' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : p.mode === 'chat' ? Math.sin(t * 0.5 + k) * 0.8 : t + k;
      const yBase = 0.18 + 0.8 * hgt;
      dummy.position.set(p.x, yBase + 0.45 * hgt + bobY, p.z);
      dummy.rotation.set(0, ry, p.mode === 'chat' ? Math.sin(t * 2 + k) * 0.05 : 0);
      dummy.scale.set(hgt, hgt, hgt);
      dummy.updateMatrix();
      torsos.setMatrixAt(k, dummy.matrix);
      dummy.position.y = yBase + 0.95 * hgt + bobY;
      dummy.rotation.set(p.mode === 'chat' ? Math.sin(t * 3 + k) * 0.12 : 0, ry + (p.mode === 'chat' ? Math.sin(t * 1.3 + k) * 0.4 : 0), 0);
      dummy.updateMatrix();
      heads.setMatrixAt(k, dummy.matrix);
      for (const [i, s] of [[0, 1], [1, -1]] as const) {
        dummy.position.set(p.x + Math.cos(ry) * 0.1 * s, yBase + bobY, p.z - Math.sin(ry) * 0.1 * s);
        dummy.rotation.set(swing * s, ry, 0, 'YXZ');
        dummy.scale.set(hgt, hgt, hgt);
        dummy.updateMatrix();
        legs.setMatrixAt(k * 2 + i, dummy.matrix);
      }
    }
    torsos.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = legs.instanceMatrix.needsUpdate = true;
    for (const d of dogs) {
      d.z += d.v * dt * 0.6;
      d.x += d.v * dt * 0.3;
      if (Math.abs(d.z) > 14) d.v = -d.v;
      d.g.position.set(d.x, 0.18, d.z);
      d.g.rotation.y = Math.atan2(d.v * 0.3, d.v * 0.6);
      d.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 9 + d.ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5));
    }
    for (const tp of tarps) {
      const a = tp.g.attributes.position as T.BufferAttribute;
      for (let i = 0; i < a.count; i++) a.setZ(i, Math.sin(tp.base[i * 3]! * 1.3 + t * 2.4 + tp.ph) * 0.12);
      a.needsUpdate = true;
    }
    for (const c of clothes) {
      const a = c.g.attributes.position as T.BufferAttribute;
      for (let i = 0; i < a.count; i++) a.setZ(i, Math.sin(t * 3 + c.ph + c.base[i * 3 + 1]! * 2) * 0.08 * (0.55 - c.base[i * 3 + 1]!));
      a.needsUpdate = true;
    }
    for (const d of doors) d.mesh.rotation.y = -Math.max(0, Math.sin((t + d.ph) * 0.4)) * 1.2;
    for (let k = 0; k < 30; k++) {
      const a = t * 0.12 + k * 0.4;
      dummy.position.set(Math.cos(a) * (80 + k * 4), 45 + (k % 5) * 6 + Math.sin(t + k) * 2, Math.sin(a) * (60 + k * 3));
      dummy.rotation.set(0, -a, Math.sin(t * 7 + k) * 0.6);
      dummy.scale.setScalar(1.4);
      dummy.updateMatrix();
      birds.setMatrixAt(k, dummy.matrix);
    }
    birds.instanceMatrix.needsUpdate = true;
    for (const c of clouds) c.position.x += dt * 4;
    if (auto) {
      const c = camAt(t);
      camera.position.copy(c.p);
      camera.lookAt(c.tgt);
      controls.target.copy(c.tgt);
    } else controls.update();
    sky.position.copy(camera.position);
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
  (window as unknown as { REALIZE_STATS: Record<string, number> }).REALIZE_STATS = { véhicules: vehs.length, piétons: NP, commerces: shops.length };
  (window as unknown as { REALIZE_ELEMENTS: string[] }).REALIZE_ELEMENTS = S.elements.filter((e) => made.has(e.comp)).map((e) => e.name);
  (window as unknown as { __scene: unknown }).__scene = { renderer, scene, camera, composer, made: [...made], buildMs, firstFrameMs: () => firstFrameMs, frames: () => frames };
}
