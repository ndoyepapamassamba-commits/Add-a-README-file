/* eslint-disable @typescript-eslint/no-explicit-any */
// SCÈNE 3D À PARTIR D'UNE VIDÉO — three.js (MIT). Chaque image de la vidéo d'origine est posée sur un maillage dont
// chaque sommet est un pixel déplacé LE LONG DE SON RAYON de caméra selon la profondeur de cette image : à la caméra de
// repos, l'écran montre exactement les pixels d'origine ; dès que la caméra bouge, la parallaxe est réelle (3D).
// Aux sauts de profondeur, l'écart est peint avec ce qui est DERRIÈRE (couleur cherchée du côté lointain), comme les
// méthodes « photo 3D » ; une couche de fond floue, alignée, couvre les bords du cadre quand la caméra s'en écarte.
// Styles : relief (maillage), nuage de points, hologramme ; effets 3D (neige, pluie, poussières dans le volume, brume
// selon la profondeur, re-éclairage par les normales de la profondeur).
// La MÊME fonction sert dans l'app (aperçu + MP4 image par image) et dans la page HTML autonome exportée : elle ne
// dépend que de ses paramètres (pas d'import ni d'aide extérieure), d'où son style.
export interface SceneCam {
  ox: number;
  oy: number;
  zoom: number;
  dolly?: number;
  focus: number;
  roll: number;
}
export interface SceneLook {
  style: 'original' | 'relief' | 'nuage' | 'holo';
  relief: number;
  cut: number;
  fog: boolean;
  relight: boolean;
  dust: boolean;
  snow: boolean;
  rain: boolean;
}
export interface SceneInit {
  width: number;
  height: number;
  /** Source aspect (width / height). */
  aspect: number;
  /** Depth track resolution. */
  dw: number;
  dh: number;
  /** One texture holding colour | depth side by side (RGBD video), instead of colour + separate depth bytes. */
  packed?: boolean;
}

export function sceneRuntime(THREE: any, canvas: HTMLCanvasElement, init: SceneInit): any {
  const W = init.width;
  const H = init.height;
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const FOV = 30;
  const D = 0.5 / Math.tan((FOV * Math.PI) / 360);
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.01, 50);
  // The plane is one unit high; when the output is wider than the source, it is scaled to cover.
  const cover = Math.max(1, W / H / init.aspect);

  // Textures: the colour (video / canvas, raw sRGB values → written back untouched = original pixels) and the depth.
  // A <video> needs a VideoTexture (three.js sizes plain textures from width/height, which are 0 on a video element).
  let colorTex: any = null;
  let depthTex: any = null;
  let depthBytes: Uint8Array | null = null;
  if (!init.packed) {
    depthBytes = new Uint8Array(init.dw * init.dh).fill(128);
    depthTex = new THREE.DataTexture(depthBytes, init.dw, init.dh, THREE.RedFormat, THREE.UnsignedByteType);
    depthTex.minFilter = THREE.LinearFilter;
    depthTex.magFilter = THREE.LinearFilter;
    depthTex.unpackAlignment = 1; // rows of any width (162 bytes is not a multiple of 4)
    depthTex.needsUpdate = true;
  }
  function colorFor(src: any) {
    if (colorTex && colorTex.image === src) return colorTex;
    if (colorTex) colorTex.dispose();
    colorTex = typeof HTMLVideoElement !== 'undefined' && src instanceof HTMLVideoElement ? new THREE.VideoTexture(src) : new THREE.Texture(src);
    colorTex.colorSpace = THREE.NoColorSpace;
    colorTex.minFilter = THREE.LinearFilter;
    colorTex.magFilter = THREE.LinearFilter;
    colorTex.generateMipmaps = false;
    uniforms.uColor.value = colorTex;
    if (init.packed) uniforms.uDepth.value = colorTex;
    return colorTex;
  }
  // uv → texture rectangles (offset.xy, scale.zw). Depth bytes are stored top row first: flip.
  const colorRect = init.packed ? new THREE.Vector4(0, 0, 0.5, 1) : new THREE.Vector4(0, 0, 1, 1);
  const depthRect = init.packed ? new THREE.Vector4(0.5, 0, 0.5, 1) : new THREE.Vector4(0, 1, 1, -1);

  const uniforms = {
    uColor: { value: null as any },
    uDepth: { value: depthTex },
    uColorRect: { value: colorRect },
    uDepthRect: { value: depthRect },
    uRelief: { value: 0.25 },
    uFocus: { value: 0.5 },
    uD: { value: D },
    uTexel: { value: new THREE.Vector2(1 / init.dw, 1 / init.dh) },
    uCut: { value: 0.12 },
    uFog: { value: 0 },
    uFogColor: { value: new THREE.Color(0.72, 0.76, 0.82) },
    uRelight: { value: 0 },
    uLight: { value: new THREE.Vector3(0.5, 0.6, 0.8) },
    uTime: { value: 0 },
    uPoints: { value: 0 },
    uHolo: { value: 0 },
    uPointSize: { value: 2 },
    // Source texels per output pixel at rest (to tell a stretched gap from an ordinary triangle).
    uDensRest: { value: 1 },
    uSrc: { value: new THREE.Vector2(1, 1) },
  };
  const vertex = [
    'uniform sampler2D uDepth; uniform vec4 uDepthRect; uniform float uRelief, uFocus, uD, uPointSize; uniform vec2 uTexel;',
    'varying vec2 vUv; varying float vD; varying float vEdge; varying vec3 vN;',
    'float dep(vec2 uv){ return texture2D(uDepth, uDepthRect.xy + clamp(uv, 0.0, 1.0) * uDepthRect.zw).r; }',
    'void main(){',
    '  vUv = uv; float d = dep(uv); vD = d;',
    '  float dl = dep(uv - vec2(uTexel.x, 0.0)), dr = dep(uv + vec2(uTexel.x, 0.0));',
    '  float dd = dep(uv - vec2(0.0, uTexel.y)), du = dep(uv + vec2(0.0, uTexel.y));',
    '  vEdge = max(abs(dr - dl), abs(du - dd));',
    '  vN = normalize(vec3((dl - dr) * 6.0, (dd - du) * 6.0, 1.0));',
    '  float z = (d - uFocus) * uRelief;',
    '  vec3 p = vec3(position.xy * (uD - z) / uD, z);',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  gl_PointSize = uPointSize * uD / max(0.05, -mv.z);',
    '}',
  ].join('\n');
  const fragment = [
    'uniform sampler2D uColor, uDepth; uniform vec4 uColorRect, uDepthRect; uniform vec2 uTexel;',
    'uniform float uCut, uFog, uRelight, uTime, uPoints, uHolo, uDensRest; uniform vec3 uFogColor, uLight; uniform vec2 uSrc;',
    'varying vec2 vUv; varying float vD; varying float vEdge; varying vec3 vN;',
    'float depF(vec2 uv){ return texture2D(uDepth, uDepthRect.xy + clamp(uv, 0.0, 1.0) * uDepthRect.zw).r; }',
    'void main(){',
    '  vec2 uv = vUv; float fill = 0.0; vec2 uvFar = vUv;',
    '  if (uPoints > 0.5) { vec2 q = gl_PointCoord - 0.5; if (dot(q, q) > 0.25) discard; }',
    '  else if (vEdge > uCut) {',
    // Only a triangle really STRETCHED on screen (camera moved: few source texels per screen pixel) is a gap; it is
    // painted with what is BEHIND (colour searched on the far side), the way « 3D photo » methods fill disocclusions.
    // At rest nothing is stretched, so the original pixels are untouched.
    '    vec2 dd = fwidth(vUv) * uSrc; float ratio = min(dd.x, dd.y) / max(1e-4, uDensRest);',
    '    fill = smoothstep(0.6, 0.35, ratio);',
    '    if (fill > 0.0) {',
    '      vec2 g = vec2(depF(vUv + vec2(uTexel.x, 0.0)) - depF(vUv - vec2(uTexel.x, 0.0)), depF(vUv + vec2(0.0, uTexel.y)) - depF(vUv - vec2(0.0, uTexel.y)));',
    '      vec2 dir = -g / max(1e-4, length(g));',
    '      float d0 = depF(vUv);',
    '      for (int i = 1; i <= 8; i++) { vec2 q = vUv + dir * uTexel * float(i) * 1.5; uvFar = q; if (depF(q) < d0 - 0.5 * uCut) break; }',
    '    }',
    '  }',
    '  vec3 c = texture2D(uColor, uColorRect.xy + clamp(uv, 0.0, 1.0) * uColorRect.zw).rgb;',
    '  if (fill > 0.0) c = mix(c, texture2D(uColor, uColorRect.xy + clamp(uvFar, 0.0, 1.0) * uColorRect.zw).rgb, fill);',
    '  if (uRelight > 0.0) { float l = max(dot(normalize(vN), normalize(uLight)), 0.0); c *= mix(1.0, 0.55 + 0.85 * l, uRelight); }',
    '  c = mix(c, uFogColor, uFog * pow(1.0 - vD, 1.6));',
    '  if (uHolo > 0.5) { float gr = dot(c, vec3(0.3, 0.59, 0.11)); float scan = 0.72 + 0.28 * sin(gl_FragCoord.y * 1.4 + uTime * 9.0);',
    '    c = vec3(0.25, 0.85, 1.0) * (0.25 + gr * 1.5) * scan; }',
    '  gl_FragColor = vec4(c, 1.0);',
    '}',
  ].join('\n');

  // Twice the depth density (depth sampled bilinearly): smoother silhouettes, and a dense point cloud.
  const pw = Math.min(720, init.dw * 2);
  const ph = Math.min(1280, init.dh * 2);
  const pgeo = new THREE.PlaneGeometry(init.aspect * cover, cover, pw - 1, ph - 1);
  const plane = pgeo;
  const meshMat = new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: vertex, fragmentShader: fragment });
  const mesh = new THREE.Mesh(plane, meshMat);
  scene.add(mesh);
  const pointMat = new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: vertex, fragmentShader: fragment, transparent: false });
  const points = new THREE.Points(pgeo, pointMat);
  points.visible = false;
  scene.add(points);

  // Background layer (fills the torn edges): the same frame, small and blurred, behind the relief.
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = Math.max(8, Math.round(96 * Math.min(1, init.aspect)));
  bgCanvas.height = Math.max(8, Math.round(96 / Math.max(1, init.aspect)));
  const bgCtx = bgCanvas.getContext('2d') as CanvasRenderingContext2D;
  const bgTex = new THREE.CanvasTexture(bgCanvas);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  // Unit plane, scaled at each frame so that, seen from the rest camera, it covers exactly the picture (no ghost).
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(init.aspect * cover, cover), new THREE.MeshBasicMaterial({ map: bgTex, depthWrite: false }));
  bg.renderOrder = -1;
  scene.add(bg);

  // Particles living IN the volume (real parallax with the scene): snow, rain, dust.
  const N = 1800;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  let s = 7;
  const rnd = function () {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rnd() - 0.5) * init.aspect * cover * 1.4;
    pos[i * 3 + 1] = rnd();
    pos[i * 3 + 2] = -0.3 + rnd() * (D * 0.75);
    seed[i] = rnd();
  }
  const fxGeo = new THREE.BufferGeometry();
  fxGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  fxGeo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const fxUniforms = { uTime: { value: 0 }, uKind: { value: 0 }, uSize: { value: H / 180 }, uD: { value: D } };
  const fxMat = new THREE.ShaderMaterial({
    uniforms: fxUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: [
      'attribute float seed; uniform float uTime, uKind, uSize, uD; varying float vA;',
      'void main(){',
      '  vec3 p = position; float sp = uKind > 1.5 ? 1.6 : (uKind > 0.5 ? 0.12 : 0.04);',
      '  p.y = 0.75 - fract(p.y + uTime * sp * (0.6 + seed)) * 1.5;',
      '  p.x += uKind < 0.5 ? sin(uTime * 0.7 + seed * 40.0) * 0.03 : (uKind < 1.5 ? sin(uTime * 1.3 + seed * 20.0) * 0.02 : 0.0);',
      '  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = uSize * (uKind > 1.5 ? 0.7 : (uKind > 0.5 ? 1.6 : 0.9)) * (0.5 + seed) * uD / max(0.05, -mv.z);',
      '  vA = uKind < 0.5 ? 0.35 + 0.4 * sin(uTime * 2.0 + seed * 30.0) : 0.8;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform float uKind; varying float vA;',
      'void main(){ vec2 q = gl_PointCoord - 0.5;',
      '  float a = uKind > 1.5 ? (1.0 - smoothstep(0.02, 0.08, abs(q.x))) * (1.0 - smoothstep(0.3, 0.5, abs(q.y))) : 1.0 - smoothstep(0.15, 0.5, length(q));',
      '  vec3 c = uKind < 0.5 ? vec3(1.0, 0.86, 0.6) : vec3(0.92, 0.95, 1.0);',
      '  gl_FragColor = vec4(c * a * vA * (uKind > 1.5 ? 0.55 : 1.0), a * vA); }',
    ].join('\n'),
  });
  const fx = new THREE.Points(fxGeo, fxMat);
  fx.frustumCulled = false;
  fx.visible = false;
  scene.add(fx);

  const target = new THREE.Vector3();
  function setCamera(cam: SceneCam, relief: number) {
    const r = relief;
    const zoom = Math.max(0.5, cam.zoom) * 1.02;
    camera.fov = FOV / zoom;
    const dz = D * (1 - 0.42 * (cam.dolly || 0));
    camera.position.set(cam.ox * init.aspect * 5.5, -cam.oy * 5.5, dz);
    target.set(0, 0, (cam.focus - 0.5) * r * 0.6);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.rotateZ(cam.roll || 0);
    camera.updateProjectionMatrix();
  }

  /** Renders one frame: `color` is the source picture (video, canvas or packed RGBD), `depth` the bytes (unpacked mode). */
  function render(color: any, depth: Uint8Array | null, cam: SceneCam, look: SceneLook, t: number) {
    const tex = colorFor(color);
    if (tex.isVideoTexture || tex.version === 0 || !(typeof HTMLImageElement !== 'undefined' && color instanceof HTMLImageElement)) tex.needsUpdate = true;
    if (depth && depthBytes) {
      depthBytes.set(depth);
      depthTex.needsUpdate = true;
    }
    // Background: the colour part of the frame, small and blurred.
    const cw = (color && (color.videoWidth || color.width)) || 2;
    const ch = (color && (color.videoHeight || color.height)) || 2;
    uniforms.uSrc.value.set(cw * colorRect.z, ch * colorRect.w);
    uniforms.uDensRest.value = (ch * colorRect.w) / (H * cover);
    bgCtx.filter = 'blur(3px)';
    bgCtx.drawImage(color, 0, 0, init.packed ? cw / 2 : cw, ch, 0, 0, bgCanvas.width, bgCanvas.height);
    bgTex.needsUpdate = true;
    // « Original »: flat, camera exactly at rest, nothing added — the frame shows the source pixels.
    const orig = look.style === 'original';
    const relief = orig ? 0 : 0.06 + look.relief * 0.5;
    uniforms.uRelief.value = relief;
    uniforms.uCut.value = look.cut;
    uniforms.uFog.value = look.fog && !orig ? 0.55 : 0;
    uniforms.uRelight.value = look.relight && !orig ? 0.85 : 0;
    uniforms.uLight.value.set(Math.sin(t * 0.6) * 0.8, 0.55, 0.75);
    uniforms.uTime.value = t;
    uniforms.uHolo.value = look.style === 'holo' ? 1 : 0;
    const pts = look.style === 'nuage' || look.style === 'holo';
    uniforms.uPoints.value = pts ? 1 : 0;
    uniforms.uPointSize.value = (H / (pts ? init.dh * 2 : init.dh)) * (look.style === 'holo' ? 1.15 : 1.7) / cover;
    mesh.visible = !pts;
    points.visible = pts;
    bg.visible = !pts && !orig;
    const zb = -0.5 * relief - 0.02;
    bg.position.z = zb;
    bg.scale.setScalar(((D - zb) / D) * 1.04);
    scene.background.setRGB(look.style === 'holo' ? 0.01 : 0, look.style === 'holo' ? 0.03 : 0, look.style === 'holo' ? 0.06 : 0);
    fx.visible = !orig && (look.snow || look.rain || look.dust);
    fxUniforms.uKind.value = look.rain ? 2 : look.snow ? 1 : 0;
    fxUniforms.uTime.value = t;
    if (orig) {
      camera.fov = FOV;
      camera.position.set(0, 0, D);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    } else setCamera(cam, relief);
    renderer.render(scene, camera);
    return canvas;
  }
  function dispose() {
    pgeo.dispose();
    fxGeo.dispose();
    meshMat.dispose();
    pointMat.dispose();
    fxMat.dispose();
    if (colorTex) colorTex.dispose();
    if (depthTex) depthTex.dispose();
    bgTex.dispose();
    renderer.dispose();
  }
  return { render: render, dispose: dispose, canvas: canvas, width: W, height: H };
}

/** 2D finish on top of the WebGL frame: title, vignette, grain, letterbox. */
export function finishFrame(out: HTMLCanvasElement, gl: HTMLCanvasElement, o: { title?: { text: string; start: number; duration: number }; vignette?: boolean; grain?: boolean; letterbox?: boolean }, t: number, frame: number): HTMLCanvasElement {
  if (out.width !== gl.width || out.height !== gl.height) {
    out.width = gl.width;
    out.height = gl.height;
  }
  const g = out.getContext('2d')!;
  const W = out.width;
  const H = out.height;
  g.drawImage(gl, 0, 0);
  if (o.vignette) {
    const r = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = r;
    g.fillRect(0, 0, W, H);
  }
  if (o.grain) {
    const n = noise();
    const pat = g.createPattern(n, 'repeat');
    if (pat) {
      g.save();
      g.globalAlpha = 0.07;
      g.globalCompositeOperation = 'overlay';
      g.translate((frame * 37) % 128, (frame * 71) % 128);
      g.fillStyle = pat;
      g.fillRect(-128, -128, W + 256, H + 256);
      g.restore();
    }
  }
  if (o.letterbox) {
    const bar = Math.round(W > H ? H * 0.1 : H * 0.08);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, bar);
    g.fillRect(0, H - bar, W, bar);
  }
  const ti = o.title;
  if (ti?.text && t >= ti.start && t <= ti.start + ti.duration) {
    const k = Math.max(0, Math.min(1, (t - ti.start) / 0.6, (ti.start + ti.duration - t) / 0.6));
    const size = Math.round(H * (W > H ? 0.075 : 0.045));
    g.save();
    g.globalAlpha = k;
    g.font = `800 ${size}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = size * 0.4;
    g.fillStyle = '#fff';
    const words = ti.text.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const tt = cur ? `${cur} ${w}` : w;
      if (g.measureText(tt).width > W * 0.84 && cur) {
        lines.push(cur);
        cur = w;
      } else cur = tt;
    }
    if (cur) lines.push(cur);
    lines.slice(0, 3).forEach((l, i, a) => g.fillText(l, W / 2, H * 0.22 + (i - (a.length - 1) / 2) * size * 1.2 - (1 - k) * size * 0.3));
    g.restore();
  }
  return out;
}
let noiseCanvas: HTMLCanvasElement | null = null;
function noise(): HTMLCanvasElement {
  if (noiseCanvas) return noiseCanvas;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const d = g.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  noiseCanvas = c;
  return c;
}
