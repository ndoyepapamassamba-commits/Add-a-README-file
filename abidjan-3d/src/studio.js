// Moteur de rendu « Abidjan 3D » (Three.js / WebGL2).
//
// Deux formats :
//  - MOSAÏQUE : la planche entière, à sa résolution d'origine. En mode Original, chaque pixel est lu
//    avec texelFetch() dans l'image : rendu identique au pixel près. En mode Relief 3D, chaque vignette
//    devient un maillage déformé par sa carte de profondeur, filmé par sa propre caméra (viewport +
//    scissor) ; les séparateurs blancs et les bandeaux de légende restent des pixels d'origine, fixes.
//  - DIAPORAMA 9:16 : chaque vignette agrandie ×4 (Real-ESRGAN) en plein cadre vertical, sur fond
//    flou, avec un mouvement de caméra 3D et un fondu enchaîné ; le bandeau reste un calque fixe.
import * as THREE from '../vendor/three.module.js';
import { FORMATS, MOVES } from './prompt.js';

THREE.ColorManagement.enabled = false;

export const FPS = 30;
export const MOSAIC_LOOP = 8;         // secondes, boucle parfaite
export const FADE = 0.5;              // secondes de fondu entre deux plans

const FOV = 30;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const OVERSCAN = 1.3;                 // le maillage d'une vignette déborde (bords étirés, coupés par le scissor)
const TAU = Math.PI * 2;

const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

// Caméras de la mosaïque : (t, vignette, pointeur) → { yaw, pitch, zoom }. Fréquences multiples de
// 1/MOSAIC_LOOP : l'animation boucle sans saut.
export const MOSAIC_CAMERAS = {
  respiration: (t, tile) => {
    const p = tile.i * 2.39996;
    const w = (TAU * t) / MOSAIC_LOOP;
    return { yaw: 0.1 * Math.sin(w + p), pitch: 0.05 * Math.sin(2 * w + 1.7 * p), zoom: 0.97 + 0.03 * Math.cos(w + p) };
  },
  vague: (t, tile, _ptr, grid) => {
    const c = tile.i % grid.cols, r = Math.floor(tile.i / grid.cols);
    const w = (TAU * t) / MOSAIC_LOOP - (c + r) * 0.55;
    return { yaw: 0.11 * Math.sin(w), pitch: 0.05 * Math.cos(w), zoom: 0.97 };
  },
  souris: (_t, _tile, ptr) => ({ yaw: -0.13 * ptr.x, pitch: 0.08 * ptr.y, zoom: 0.98 }),
};

// ------------------------------------------------------------------------------------- shaders
const FULLSCREEN_VERT = /* glsl */ `
in vec3 position; in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Copie exacte de l'image source (fond de la mosaïque et bandeaux).
const EXACT_FRAG = /* glsl */ `
precision highp float; precision highp int;
uniform sampler2D uSrc; uniform vec2 uSrcSize; uniform float uCanvasH;
out vec4 outColor;
void main() {
  int x = int(gl_FragCoord.x);
  int y = min(int(uCanvasH) - 1 - int(gl_FragCoord.y), int(uSrcSize.y) - 1);
  outColor = vec4(texelFetch(uSrc, ivec2(x, y), 0).rgb, 1.0);
}
`;

const MESH_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec2 uv;
uniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
uniform sampler2D uDepth;
uniform vec2 uTile; uniform vec2 uTileSize; uniform vec2 uAtlasSize;
uniform float uRelief; uniform float uOverscan; uniform vec3 uEye;
uniform vec4 uCapT; // bandeau en fraction de la vignette (x, y depuis le haut, l, h) ; l = 0 : aucun
uniform float uDepthMode; // 0 : carte de profondeur ; 1 : image importée, sol proche en bas, loin en haut
out vec2 vT;
float depthAt(vec2 t) {
  if (uDepthMode > 0.5) return pow(clamp(1.0 - t.y, 0.0, 1.0), 1.5) * 0.9;
  vec2 tp = vec2(t.x * (uTileSize.x - 1.0) + 0.5, (1.0 - t.y) * (uTileSize.y - 1.0) + 0.5);
  vec2 p = vec2(t.x, 1.0 - t.y);
  if (uCapT.z > 0.0 && p.x <= uCapT.x + uCapT.z + 0.01 && p.y >= uCapT.y - 0.02)
    return texture(uDepth, (uTile * uTileSize + tp) / uAtlasSize).r; // bandeau : reste plat
  float d = 0.0; // dilatation 5×5 : l'étirement aux bords tombe dans le décor, pas sur les sujets
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 q = clamp(tp + vec2(float(i), float(j)), vec2(0.5), uTileSize - 0.5);
    d = max(d, texture(uDepth, (uTile * uTileSize + q) / uAtlasSize).r);
  }
  return d;
}
void main() {
  vT = (uv - 0.5) * uOverscan + 0.5;
  float d = depthAt(clamp(vT, 0.0, 1.0));
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.xyz += (uEye - wp.xyz) * (d * uRelief); // le long du rayon de la caméra au repos
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// Vignette de la mosaïque : échantillonne l'image source dans le rectangle de la vignette.
const TILE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSrc; uniform vec2 uSrcSize;
uniform vec4 uRect;  // vignette, pixels image (x, y, l, h)
uniform vec4 uCap;   // bandeau, pixels image (l = 0 : aucun)
in vec2 vT; out vec4 outColor;
void main() {
  vec2 t = clamp(vT, 0.0, 1.0);
  vec2 px = uRect.xy + vec2(t.x, 1.0 - t.y) * uRect.zw;
  // Sous le bandeau (calque fixe), on étale la ligne du dessus : pas de doublon qui dépasse.
  if (uCap.z > 0.0 && px.x <= uCap.x + uCap.z + 3.0 && px.y >= uCap.y - 3.0 && px.y <= uCap.y + uCap.w + 1.0) px.y = uCap.y - 4.0;
  px = clamp(px, uRect.xy + 0.5, uRect.xy + uRect.zw - 0.5);
  outColor = vec4(texture(uSrc, px / uSrcSize).rgb, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex; uniform float uAspect; uniform float uScreenAspect; uniform float uZoom; uniform float uAlpha;
in vec2 vUv; out vec4 outColor;
void main() {
  vec2 c = vUv - 0.5;
  vec2 t = uScreenAspect < uAspect ? vec2(c.x * uScreenAspect / uAspect, c.y) : vec2(c.x, c.y * uAspect / uScreenAspect); // « cover »
  t = t / uZoom + 0.5;
  outColor = vec4(textureLod(uTex, t, 5.2).rgb * 0.62, uAlpha);
}
`;

// Plaque du diaporama : la légende fait partie de la plaque (profondeur plate, donc jamais déformée).
const PLATE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex; uniform float uAlpha;
in vec2 vT; out vec4 outColor;
void main() { outColor = vec4(texture(uTex, clamp(vT, 0.0, 1.0)).rgb, uAlpha); }
`;

const OVERLAY_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex; uniform float uAlpha;
in vec2 vUv; out vec4 outColor;
void main() { vec4 c = texture(uTex, vUv); outColor = vec4(c.rgb, c.a * uAlpha); }
`;

const raw = (vertexShader, fragmentShader, uniforms, extra = {}) => new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3, vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false, ...extra,
});

// ------------------------------------------------------------------------------------- Studio
export class Studio {
  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas
   * @param {object} o.meta            assets/meta.json
   * @param {CanvasImageSource} o.sourceImage   la planche d'origine
   * @param {CanvasImageSource} o.depthImage    assets/depth-atlas.png
   * @param {(i:number) => Promise<CanvasImageSource>} o.loadTile  vignette agrandie i
   */
  constructor({ canvas, meta, sourceImage, depthImage, loadTile }) {
    this.meta = meta;
    this.loadTile = loadTile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 1);

    const { w: sw, h: sh } = meta.source;
    this.srcSize = new THREE.Vector2(sw, sh);
    this.mosaicSize = { w: sw + (sw % 2), h: sh + (sh % 2) }; // dimensions paires pour l'encodage H.264

    this.src = new THREE.Texture(sourceImage);
    Object.assign(this.src, { flipY: false, colorSpace: THREE.NoColorSpace, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.src.needsUpdate = true;
    this.depth = new THREE.Texture(depthImage);
    Object.assign(this.depth, { flipY: false, colorSpace: THREE.NoColorSpace, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    this.depth.needsUpdate = true;
    const d = meta.depth;
    this.atlasSize = new THREE.Vector2(d.cols * d.tileW, d.rows * d.tileH);
    this.tileSize = new THREE.Vector2(d.tileW, d.tileH);

    this.scene = new THREE.Scene();
    this.dummyCam = new THREE.Camera();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 100000);
    const fullscreen = new THREE.PlaneGeometry(2, 2);

    // Mosaïque : fond exact, maillage de vignette (réutilisé pour les 30), bandeaux exacts.
    this.exactMat = raw(FULLSCREEN_VERT, EXACT_FRAG, { uSrc: { value: this.src }, uSrcSize: { value: this.srcSize }, uCanvasH: { value: this.mosaicSize.h } });
    this.bgMesh = this.mesh(fullscreen, this.exactMat);

    const meshUniforms = () => ({
      uDepth: { value: this.depth }, uTile: { value: new THREE.Vector2() }, uTileSize: { value: this.tileSize },
      uAtlasSize: { value: this.atlasSize }, uRelief: { value: 0.2 }, uOverscan: { value: 1 }, uEye: { value: new THREE.Vector3() },
      uCapT: { value: new THREE.Vector4() },
    });
    this.tileMat = raw(MESH_VERT, TILE_FRAG, {
      ...meshUniforms(), uSrc: { value: this.src }, uSrcSize: { value: this.srcSize },
      uRect: { value: new THREE.Vector4() }, uCap: { value: new THREE.Vector4() },
    }, { depthTest: true, depthWrite: true });
    this.tileMat.uniforms.uOverscan.value = OVERSCAN;
    this.tileMesh = this.mesh(new THREE.PlaneGeometry(OVERSCAN, OVERSCAN, 95, 63), this.tileMat);

    this.capsMat = raw(FULLSCREEN_VERT, EXACT_FRAG, this.exactMat.uniforms);
    this.capsMesh = this.mesh(this.captionGeometry(), this.capsMat);

    // Montage (plans) : fond flou, plaque 3D, calque texte.
    this.blurMat = raw(FULLSCREEN_VERT, BLUR_FRAG, {
      uTex: { value: null }, uAspect: { value: 1.5 }, uScreenAspect: { value: 9 / 16 }, uZoom: { value: 1 }, uAlpha: { value: 1 },
    }, { transparent: true });
    this.blurMesh = this.mesh(fullscreen, this.blurMat);
    this.plateMat = raw(MESH_VERT, PLATE_FRAG, {
      ...meshUniforms(), uTex: { value: null }, uAlpha: { value: 1 }, uDepthMode: { value: 0 },
    }, { depthTest: true, depthWrite: true, transparent: true });
    this.plateMesh = this.mesh(new THREE.PlaneGeometry(1, 1, 159, 105), this.plateMat);
    this.tileMat.uniforms.uDepthMode = { value: 0 };
    this.overlayMat = raw(FULLSCREEN_VERT, OVERLAY_FRAG, { uTex: { value: null }, uAlpha: { value: 1 } }, { transparent: true });
    this.overlayMesh = this.mesh(fullscreen, this.overlayMat);

    this.textures = new Map(); // images chargées, par identifiant « tile:i » (cache LRU)
    this.loading = new Map();
    this.uploads = [];         // images importées par l'utilisateur
    this.texts = new Map();    // calques texte déjà dessinés
    this.sizeKey = null;
    this.resize({ format: 'mosaic' });
  }

  mesh(geometry, material) {
    const m = new THREE.Mesh(geometry, material);
    m.frustumCulled = false;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  // Les 30 bandeaux en un seul maillage de quads (coordonnées écran exactes, +1 px de marge).
  captionGeometry() {
    const { w: W, h: H } = this.mosaicSize;
    const pos = [];
    for (const t of this.meta.tiles) {
      if (!t.caption) continue;
      const x0 = t.rect[0] + t.caption[0] - 1, y0 = t.rect[1] + t.caption[1] - 1;
      const x1 = Math.min(t.rect[0] + t.rect[2], x0 + t.caption[2] + 2), y1 = Math.min(t.rect[1] + t.rect[3], y0 + t.caption[3] + 2);
      const [a, b, c, e] = [x0 / W * 2 - 1, 1 - y0 / H * 2, x1 / W * 2 - 1, 1 - y1 / H * 2];
      pos.push(a, b, 0, a, e, 0, c, e, 0, a, b, 0, c, e, 0, c, b, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    return g;
  }

  get tiles() { return this.meta.tiles; }

  /** Taille du cadre pour un état : mosaïque native, ou format du plan (9:16, 16:9, 1:1). */
  sizeFor(s) {
    if (s.format === 'mosaic') return this.mosaicSize;
    const f = FORMATS[s.plan?.format] || FORMATS['9:16'];
    return { w: f.w, h: f.h };
  }

  get size() { return this.current; }

  resize(s) {
    const size = this.sizeFor(s);
    const key = `${size.w}x${size.h}`;
    if (key === this.sizeKey) return;
    this.sizeKey = key;
    this.current = size;
    this.renderer.setSize(size.w, size.h, false);
  }

  /** Ajoute une image importée ; renvoie son identifiant « upload:k ». */
  addUpload(img, name) {
    const tex = new THREE.Texture(img);
    Object.assign(tex, { colorSpace: THREE.NoColorSpace, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, anisotropy: 4 });
    tex.needsUpdate = true;
    this.uploads.push({ name, tex, aspect: (img.naturalWidth || img.width) / (img.naturalHeight || img.height) });
    return `upload:${this.uploads.length - 1}`;
  }

  imageInfo(id) {
    const [kind, n] = String(id).split(':');
    if (kind === 'upload') {
      const u = this.uploads[+n];
      return u ? { kind, aspect: u.aspect } : null;
    }
    const tile = this.tiles[+n];
    return tile ? { kind: 'tile', tile, aspect: tile.up.w / tile.up.h } : null;
  }

  // ---------------------------------------------------------------- montage
  segments(plan) {
    const F = plan.transition === 'fondu' ? FADE : 0;
    const segs = [];
    let t = 0;
    const push = (seg, dur) => { segs.push({ ...seg, start: t, dur }); t += dur; };
    if (plan.title) push({ kind: 'card', text: plan.title.text, image: plan.shots[0]?.image }, plan.title.duration);
    plan.shots.forEach((shot, k) => push({ kind: 'shot', shot, image: shot.image, index: k }, shot.duration));
    if (plan.end) push({ kind: 'card', text: plan.end.text, image: plan.shots.at(-1)?.image }, plan.end.duration);
    return { segs, total: t, F };
  }

  /** Plans visibles à l'instant t (pendant un fondu, le précédent reste dessous). */
  layersAt(s, t) {
    const { segs, F } = this.segments(s.plan);
    if (!segs.length) return [];
    let j = 0;
    while (j < segs.length - 1 && segs[j + 1].start <= t) j++;
    const local = t - segs[j].start;
    const u = (k) => Math.min(1, Math.max(0, (t - segs[k].start) / (segs[k].dur + F)));
    const layers = [];
    if (j > 0 && F > 0 && local < F) layers.push({ seg: segs[j - 1], u: u(j - 1), alpha: 1 });
    layers.push({ seg: segs[j], u: u(j), alpha: j > 0 && F > 0 ? ease(local / F) : 1 });
    return layers;
  }

  frameCount(s) {
    if (s.format === 'mosaic') return MOSAIC_LOOP * FPS;
    return Math.max(1, Math.round(this.segments(s.plan).total * FPS));
  }

  /** Frame utilisée pour une image fixe : au milieu du premier plan. */
  stillFrame(s) {
    if (s.format === 'mosaic') return Math.round(MOSAIC_LOOP * FPS * 0.15);
    const seg = this.segments(s.plan).segs.find((x) => x.kind === 'shot');
    return seg ? Math.round((seg.start + seg.dur * 0.6) * FPS) : 0;
  }

  /** Charge les images nécessaires à une frame et précharge le plan suivant. */
  async prepare(s, frame) {
    if (s.format === 'mosaic') return;
    const t = frame / FPS;
    const { segs } = this.segments(s.plan);
    const layers = this.layersAt(s, t);
    const lastIdx = segs.indexOf(layers.at(-1)?.seg);
    const ids = [...layers.map((l) => l.seg.image), segs[lastIdx + 1]?.image].filter(Boolean);
    await Promise.all(ids.slice(0, layers.length).map((id) => this.texture(id)));
    if (ids[layers.length]) this.texture(ids[layers.length]);
  }

  texture(id) {
    const [kind, n] = String(id).split(':');
    if (kind === 'upload') return Promise.resolve(this.uploads[+n]?.tex || null);
    if (this.textures.has(id)) {
      const tex = this.textures.get(id);
      this.textures.delete(id);
      this.textures.set(id, tex); // LRU : remis en fin de file
      return Promise.resolve(tex);
    }
    if (!this.loading.has(id)) {
      this.loading.set(id, this.loadTile(+n).then((img) => {
        const tex = new THREE.Texture(img);
        Object.assign(tex, { colorSpace: THREE.NoColorSpace, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, anisotropy: 4 });
        tex.needsUpdate = true;
        this.textures.set(id, tex);
        this.loading.delete(id);
        while (this.textures.size > 6) {
          const [old, oldTex] = this.textures.entries().next().value;
          oldTex.dispose();
          this.textures.delete(old);
        }
        return tex;
      }));
    }
    return this.loading.get(id);
  }

  textureNow(id) {
    const [kind, n] = String(id).split(':');
    return kind === 'upload' ? this.uploads[+n]?.tex : this.textures.get(id);
  }

  /**
   * @param {object} s  état : format ('mosaic'|'plan'), plan, mode ('original'|'3d'), camera, relief, user, pointer
   * @param {number} frame
   */
  render(s, frame) {
    this.resize(s);
    const r = this.renderer;
    const { w, h } = this.size;
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    r.clear();
    for (const m of [this.bgMesh, this.tileMesh, this.capsMesh, this.blurMesh, this.plateMesh, this.overlayMesh]) m.visible = false;
    if (s.format === 'mosaic') this.renderMosaic(s, frame / FPS);
    else this.renderPlan(s, frame / FPS);
  }

  draw(meshObj, camera = this.dummyCam) {
    meshObj.visible = true;
    this.renderer.render(this.scene, camera);
    meshObj.visible = false;
  }

  renderMosaic(s, t) {
    const r = this.renderer;
    const H = this.mosaicSize.h;
    this.draw(this.bgMesh);
    if (s.mode !== '3d') return; // mode Original : copie exacte, rien d'autre

    const u = this.tileMat.uniforms;
    const cam = this.camera;
    const camFn = MOSAIC_CAMERAS[s.camera] || MOSAIC_CAMERAS.respiration;
    const ptr = s.camera === 'souris' && s.autoPointer
      ? { x: 0.8 * Math.cos((TAU * t) / MOSAIC_LOOP), y: 0.6 * Math.sin((TAU * t) / MOSAIC_LOOP) }
      : (s.pointer || { x: 0, y: 0 });
    u.uRelief.value = s.relief ?? 0.2;
    r.setScissorTest(true);
    for (const tile of this.tiles) {
      const [x, y, tw, th] = tile.rect;
      r.setViewport(x, H - y - th, tw, th);
      r.setScissor(x, H - y - th, tw, th);
      r.clearDepth();
      const dist = th / 2 / TAN;
      u.uEye.value.set(0, 0, dist);
      u.uTile.value.set(tile.i % this.meta.depth.cols, Math.floor(tile.i / this.meta.depth.cols));
      u.uRect.value.set(x, y, tw, th);
      const c = tile.caption;
      u.uCap.value.set(c ? x + c[0] : 0, c ? y + c[1] : 0, c ? c[2] : 0, c ? c[3] : 0);
      u.uCapT.value.set(c ? c[0] / tw : 0, c ? c[1] / th : 0, c ? c[2] / tw : 0, c ? c[3] / th : 0);
      this.tileMesh.scale.set(tw, th, 1);
      const v = camFn(t, tile, ptr, this.meta.grid);
      this.placeCamera(cam, tw / th, dist, v.yaw + (s.user?.yaw || 0), v.pitch + (s.user?.pitch || 0), v.zoom * (s.user?.zoom || 1));
      this.draw(this.tileMesh, cam);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, this.mosaicSize.w, H);
    this.draw(this.capsMesh);
  }

  renderPlan(s, t) {
    const { w: W, h: H } = this.size;
    const plan = s.plan;
    const still = s.mode !== '3d';
    for (const { seg, u: progress, alpha } of this.layersAt(s, t)) {
      const info = seg.image && this.imageInfo(seg.image);
      const tex = seg.image && this.textureNow(seg.image);
      if (seg.image && !tex) { this.texture(seg.image); continue; }

      if (tex) {
        this.blurMat.uniforms.uTex.value = tex;
        this.blurMat.uniforms.uAspect.value = info.aspect;
        this.blurMat.uniforms.uScreenAspect.value = W / H;
        this.blurMat.uniforms.uZoom.value = 1 + 0.06 * progress;
        this.blurMat.uniforms.uAlpha.value = alpha;
        this.draw(this.blurMesh);
      }

      if (seg.kind === 'shot' && tex) {
        const pw = Math.min(W, H * info.aspect), ph = pw / info.aspect; // « contain »
        const pu = this.plateMat.uniforms;
        const dist = H / 2 / TAN;
        pu.uTex.value = tex;
        pu.uAlpha.value = alpha;
        pu.uRelief.value = still ? 0 : plan.relief;
        pu.uEye.value.set(0, 0, dist);
        pu.uDepthMode.value = info.kind === 'upload' ? 1 : 0;
        if (info.kind === 'tile') {
          const { tile } = info;
          pu.uTile.value.set(tile.i % this.meta.depth.cols, Math.floor(tile.i / this.meta.depth.cols));
          const c = tile.caption, [rw, rh] = [tile.rect[2], tile.rect[3]];
          pu.uCapT.value.set(c ? c[0] / rw : 0, c ? c[1] / rh : 0, c ? c[2] / rw : 0, c ? c[3] / rh : 0);
        } else pu.uCapT.value.set(0, 0, 0, 0);
        this.plateMesh.scale.set(pw, ph, 1);
        const m = MOVES[seg.shot.move] || MOVES.fixe;
        const e = ease(progress), k = plan.intensity;
        const at = (key, neutral) => {
          const a = m.from[key] ?? neutral, b = m.to[key] ?? neutral;
          return neutral + (a + (b - a) * e - neutral) * k;
        };
        const user = s.user || { yaw: 0, pitch: 0, zoom: 1 };
        this.placeCamera(this.camera, W / H, dist,
          still ? 0 : at('yaw', 0) + user.yaw, still ? 0 : at('pitch', 0) + user.pitch, still ? 1 : at('zoom', 1) * user.zoom,
          still ? 0 : at('panX', 0) * pw, still ? 0 : at('panY', 0) * pw);
        this.renderer.clearDepth();
        this.draw(this.plateMesh, this.camera);
        if (seg.shot.text) this.drawText(seg.shot.text, 'shot', alpha, { ph });
      }

      if (seg.kind === 'card') {
        if (!tex) {
          this.renderer.setClearColor(0x13284f, 1);
          this.renderer.clear();
          this.renderer.setClearColor(0x000000, 1);
        }
        this.drawText(seg.text, 'card', alpha * Math.min(1, progress * 6), { progress });
      }
    }
  }

  // Calque texte dessiné en 2D (titre de carton ou texte de plan), mis en cache par contenu.
  drawText(text, style, alpha, { ph = 0 } = {}) {
    const { w: W, h: H } = this.size;
    const key = `${style}|${W}x${H}|${ph | 0}|${text}`;
    let tex = this.texts.get(key);
    if (!tex) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      const font = (px) => `800 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, "DejaVu Sans", sans-serif`;
      const size = Math.round(Math.min(W, H) * (style === 'card' ? 0.085 : 0.08));
      ctx.font = font(size);
      const lines = wrap(ctx, text, W * 0.84);
      const lh = size * 1.18;
      const y0 = style === 'card' ? H / 2 - ((lines.length - 1) * lh) / 2 : Math.max(size * 1.4, ((H - ph) / 2) * 0.5) - ((lines.length - 1) * lh) / 2;
      if (style === 'shot' && (H - ph) / 2 < size * 2.2) { // texte posé sur l'image : dégradé sombre derrière
        const bottom = y0 + (lines.length - 1) * lh + size * 1.6;
        const g = ctx.createLinearGradient(0, 0, 0, bottom);
        g.addColorStop(0, 'rgba(0,0,0,0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, bottom);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      lines.forEach((line, i) => {
        const y = y0 + i * lh;
        ctx.lineWidth = Math.max(6, size * 0.16);
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(line, W / 2, y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line, W / 2, y);
      });
      if (style === 'card') { // filet orange sous le titre
        const bw = Math.min(W * 0.3, size * 3);
        ctx.fillStyle = '#f28c28';
        ctx.fillRect(W / 2 - bw / 2, y0 + (lines.length - 1) * lh + size * 0.85, bw, Math.max(4, size * 0.09));
      }
      tex = new THREE.CanvasTexture(c);
      Object.assign(tex, { colorSpace: THREE.NoColorSpace, generateMipmaps: false, minFilter: THREE.LinearFilter });
      this.texts.set(key, tex);
      while (this.texts.size > 16) {
        const [old, oldTex] = this.texts.entries().next().value;
        oldTex.dispose();
        this.texts.delete(old);
      }
    }
    this.overlayMat.uniforms.uTex.value = tex;
    this.overlayMat.uniforms.uAlpha.value = alpha;
    this.draw(this.overlayMesh);
  }

  placeCamera(cam, aspect, dist, yaw, pitch, zoom, panX = 0, panY = 0) {
    cam.aspect = aspect;
    cam.near = dist * 0.05;
    cam.far = dist * 4;
    cam.updateProjectionMatrix();
    const dd = dist * zoom;
    cam.position.set(panX + dd * Math.sin(yaw) * Math.cos(pitch), panY + dd * Math.sin(pitch), dd * Math.cos(yaw) * Math.cos(pitch));
    cam.lookAt(panX, panY, 0);
  }

  readPixels(out) {
    const gl = this.renderer.getContext();
    const { w, h } = this.size;
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}
