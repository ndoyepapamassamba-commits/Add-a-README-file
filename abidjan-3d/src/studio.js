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
uniform vec4 uSub;  // sous-rectangle de l'image couvert par ce maillage (x, y depuis le bas, l, h)
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
  vT = uSub.xy + ((uv - 0.5) * uOverscan + 0.5) * uSub.zw;
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
uniform sampler2D uAmbM; uniform float uAnim; uniform float uTime; uniform float uLoop;
in vec2 vT; out vec4 outColor;
void main() {
  vec2 t = clamp(vT, 0.0, 1.0);
  vec2 px = uRect.xy + vec2(t.x, 1.0 - t.y) * uRect.zw;
  // Sous le bandeau (calque fixe), on étale la ligne du dessus : pas de doublon qui dépasse.
  if (uCap.z > 0.0 && px.x <= uCap.x + uCap.z + 3.0 && px.y >= uCap.y - 3.0 && px.y <= uCap.y + uCap.w + 1.0) px.y = uCap.y - 4.0;
  vec2 lo = uRect.xy + 0.5, hi = uRect.xy + uRect.zw - 0.5;
  px = clamp(px, lo, hi);
  if (uAnim < 0.5) { outColor = vec4(texture(uSrc, px / uSrcSize).rgb, 1.0); return; }
  // Univers animé, en boucle parfaite de uLoop secondes : vent, nuages, vagues, reflets.
  float w = 6.2831853 / uLoop;
  vec3 amb = texture(uAmbM, px / uSrcSize).rgb;
  float ty = 1.0 - (px.y - uRect.y) / uRect.w;
  float wind = amb.g * ty * (sin(uTime * w * 2.0 + ty * 9.0 + px.x * 0.02) * 0.011 + sin(uTime * w * 4.0 + ty * 21.0) * 0.003) * uRect.z;
  float wave = amb.b * sin(uTime * w * 3.0 + px.x * 0.25 + px.y * 0.12) * 0.004 * uRect.w;
  vec3 col = texture(uSrc, clamp(px + vec2(wind, wave), lo, hi) / uSrcSize).rgb;
  vec2 sp = clamp(px - vec2(sin(uTime * w) * 0.02 * uRect.z, 0.0), lo, hi);
  col = mix(col, texture(uSrc, sp / uSrcSize).rgb, amb.r * texture(uAmbM, sp / uSrcSize).r);
  col += amb.b * pow(max(0.0, sin(uTime * w * 4.0 + px.x * 0.55 + sin(px.y * 0.35 + uTime * w) * 2.0)), 24.0) * 0.2;
  outColor = vec4(col, 1.0);
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
// Univers animé : uAmb porte les masques ciel (R), arbres (G) et eau (B) de la vignette.
const PLATE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex; uniform float uAlpha;
uniform sampler2D uAmb; uniform float uAnim; uniform float uTime;
in vec2 vT; out vec4 outColor;
void main() {
  vec2 p = clamp(vT, 0.0, 1.0);
  if (uAnim < 0.5) { outColor = vec4(texture(uTex, p).rgb, uAlpha); return; }
  vec3 amb = texture(uAmb, p).rgb;
  // vent : les feuillages ondulent, davantage en hauteur
  float wind = amb.g * p.y * (sin(uTime * 1.6 + p.y * 9.0 + p.x * 3.0) * 0.005 + sin(uTime * 2.9 + p.y * 21.0) * 0.0015);
  // eau : petites vagues
  float wave = amb.b * sin(uTime * 2.0 + p.x * 70.0 + p.y * 30.0) * 0.0018;
  vec3 col = texture(uTex, p + vec2(wind, wave)).rgb;
  // nuages : le ciel dérive lentement
  vec2 sp = p - vec2(uTime * 0.008, 0.0);
  col = mix(col, texture(uTex, sp).rgb, amb.r * texture(uAmb, sp).r);
  // reflets du soleil sur l'eau
  col += amb.b * pow(max(0.0, sin(uTime * 3.0 + p.x * 140.0 + sin(p.y * 90.0 + uTime) * 2.0)), 24.0) * 0.2;
  outColor = vec4(col, uAlpha);
}
`;

// Découpe (personnage, véhicule) : panneau placé en 3D, ancré à son pied, légèrement pivoté.
const SPRITE_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec2 uv;
uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
uniform vec3 uFoot; uniform vec2 uSize; uniform vec2 uPivot; uniform float uRot;
uniform float uDepth; uniform float uRelief; uniform vec3 uEye;
uniform float uBend;   // le haut du corps se penche (courbure), la base reste en place
uniform float uBreath; // respiration : le buste s'allonge un peu
uniform float uWave;   // main levée : seul le sommet s'agite
out vec2 vUv;
void main() {
  vUv = uv;
  vec2 local = (uv - uPivot) * uSize;
  float hy = max(0.0, uv.y - uPivot.y) / max(1e-3, 1.0 - uPivot.y);
  local.x += (uBend * hy * hy + uWave * pow(hy, 6.0)) * uSize.y;
  local.y *= 1.0 + uBreath * hy;
  float c = cos(uRot), s = sin(uRot);
  vec3 wp = uFoot + vec3(c * local.x - s * local.y, s * local.x + c * local.y, 0.0);
  wp += (uEye - wp) * (uDepth * uRelief); // le long du rayon de la caméra au repos, comme la plaque
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
const SPRITE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uAtlas; uniform vec4 uAtlasRect; uniform float uAlpha;
in vec2 vUv; out vec4 outColor;
void main() {
  vec2 a = vec2(uAtlasRect.x + vUv.x * uAtlasRect.z, uAtlasRect.y + (1.0 - vUv.y) * uAtlasRect.w);
  vec4 c = texture(uAtlas, vec2(a.x, 1.0 - a.y));
  if (c.a < 0.02) discard;
  outColor = vec4(c.rgb, c.a * uAlpha);
}
`;
const SHADOW_FRAG = /* glsl */ `
precision highp float;
uniform float uAlpha;
in vec2 vUv; out vec4 outColor;
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float d = dot(q, q);
  if (d > 1.0) discard;
  outColor = vec4(0.0, 0.0, 0.0, (1.0 - d) * (1.0 - d) * uAlpha);
}
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
  constructor({ canvas, meta, sourceImage, depthImage, loadTile, animData = null, loadAnim = null }) {
    this.meta = meta;
    this.loadTile = loadTile;
    this.animData = animData;   // assets/anim.json : découpes et trajectoires par vignette
    this.loadAnim = loadAnim;   // (i) => Promise<{fond, decoupes, ambiance}>
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
      uCapT: { value: new THREE.Vector4() }, uSub: { value: new THREE.Vector4(0, 0, 1, 1) },
    });
    this.tileMat = raw(MESH_VERT, TILE_FRAG, {
      ...meshUniforms(), uSrc: { value: this.src }, uSrcSize: { value: this.srcSize },
      uRect: { value: new THREE.Vector4() }, uCap: { value: new THREE.Vector4() },
      uAmbM: { value: null }, uAnim: { value: 0 }, uTime: { value: 0 }, uLoop: { value: MOSAIC_LOOP },
    }, { depthTest: true, depthWrite: true });
    this.mosaicAnim = null; // textures de la planche animée (fond reconstruit, ambiance, découpes)
    this.tileMat.uniforms.uOverscan.value = OVERSCAN;
    this.tileMesh = this.mesh(new THREE.PlaneGeometry(OVERSCAN, OVERSCAN, 95, 63), this.tileMat);

    this.capsMat = raw(FULLSCREEN_VERT, EXACT_FRAG, this.exactMat.uniforms);
    this.capsMesh = this.mesh(this.captionGeometry(), this.capsMat);

    // Montage (plans) : fond flou, plaque 3D, calque texte.
    this.blurMat = raw(FULLSCREEN_VERT, BLUR_FRAG, {
      uTex: { value: null }, uAspect: { value: 1.5 }, uScreenAspect: { value: 9 / 16 }, uZoom: { value: 1 }, uAlpha: { value: 1 },
    }, { transparent: true });
    this.blurMesh = this.mesh(fullscreen, this.blurMat);
    const plateUniforms = () => ({
      ...meshUniforms(), uTex: { value: null }, uAlpha: { value: 1 }, uDepthMode: { value: 0 },
      uAmb: { value: null }, uAnim: { value: 0 }, uTime: { value: 0 },
    });
    this.plateMat = raw(MESH_VERT, PLATE_FRAG, plateUniforms(), { depthTest: true, depthWrite: true, transparent: true });
    this.plateMesh = this.mesh(new THREE.PlaneGeometry(1, 1, 159, 105), this.plateMat);
    // Univers animé : découpes, ombres, bandeau redessiné par-dessus.
    const spriteUniforms = () => ({
      uFoot: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector2() }, uPivot: { value: new THREE.Vector2() },
      uRot: { value: 0 }, uDepth: { value: 0 }, uRelief: { value: 0.15 }, uEye: { value: new THREE.Vector3() }, uAlpha: { value: 1 },
      uBend: { value: 0 }, uBreath: { value: 0 }, uWave: { value: 0 },
    });
    this.spriteMat = raw(SPRITE_VERT, SPRITE_FRAG, { ...spriteUniforms(), uAtlas: { value: null }, uAtlasRect: { value: new THREE.Vector4() } }, { transparent: true });
    this.spriteMesh = this.mesh(new THREE.PlaneGeometry(1, 1, 6, 16), this.spriteMat); // subdivisé : le corps peut se courber
    this.shadowMat = raw(SPRITE_VERT, SHADOW_FRAG, spriteUniforms(), { transparent: true });
    this.shadowMesh = this.mesh(new THREE.PlaneGeometry(1, 1), this.shadowMat);
    this.capMat = raw(MESH_VERT, PLATE_FRAG, plateUniforms(), { transparent: true });
    this.capMesh = this.mesh(new THREE.PlaneGeometry(1, 1, 8, 4), this.capMat);
    this.animTextures = new Map();
    this.animLoading = new Map();
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
    if (j > 0 && F > 0 && local < F) layers.push({ seg: segs[j - 1], u: u(j - 1), tau: t - segs[j - 1].start, alpha: 1 });
    layers.push({ seg: segs[j], u: u(j), tau: local, alpha: j > 0 && F > 0 ? ease(local / F) : 1 });
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
    const animIds = ids.map((id) => this.imageInfo(id)).filter((info) => info && this.animOn(s, info)).map((info) => info.tile.i);
    await Promise.all(animIds.slice(0, layers.length).map((i) => this.animTexturesFor(i)));
    if (animIds[layers.length] != null) this.animTexturesFor(animIds[layers.length]);
  }

  /** Planche animée : décor reconstruit, masques d'ambiance et découpes à l'échelle de la planche. */
  setMosaicAnim({ fond, ambiance, decoupes }) {
    const mk = (img, flipY) => {
      const t = new THREE.Texture(img);
      Object.assign(t, { flipY, colorSpace: THREE.NoColorSpace, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
      t.needsUpdate = true;
      return t;
    };
    this.mosaicAnim = { fond: mk(fond, false), ambiance: mk(ambiance, false), decoupes: mk(decoupes, true) };
  }

  /** L'univers de cette vignette est-il animé (personnages, véhicules, vent, eau) ? */
  animOn(s, info) {
    return s.mode === '3d' && s.plan?.animate !== false && info?.kind === 'tile' && !!this.animData?.tiles?.[info.tile.i] && !!this.loadAnim;
  }

  animTexturesFor(i) {
    if (this.animTextures.has(i)) return Promise.resolve(this.animTextures.get(i));
    if (!this.animLoading.has(i)) {
      this.animLoading.set(i, this.loadAnim(i).then(({ fond, decoupes, ambiance }) => {
        const mk = (img, mip) => {
          const t = new THREE.Texture(img);
          Object.assign(t, { colorSpace: THREE.NoColorSpace, magFilter: THREE.LinearFilter, generateMipmaps: mip,
            minFilter: mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter });
          t.needsUpdate = true;
          return t;
        };
        const set = { fond: mk(fond, true), decoupes: mk(decoupes, false), ambiance: mk(ambiance, false) };
        this.animTextures.set(i, set);
        this.animLoading.delete(i);
        while (this.animTextures.size > 4) {
          const [k, old] = this.animTextures.entries().next().value;
          Object.values(old).forEach((t) => t.dispose());
          this.animTextures.delete(k);
        }
        return set;
      }));
    }
    return this.animLoading.get(i);
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
    for (const m of [this.bgMesh, this.tileMesh, this.capsMesh, this.blurMesh, this.plateMesh, this.overlayMesh, this.spriteMesh, this.shadowMesh, this.capMesh]) m.visible = false;
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
    const animM = s.animate !== false && this.mosaicAnim && this.animData?.planche;
    u.uSrc.value = animM ? this.mosaicAnim.fond : this.src;
    u.uAmbM.value = animM ? this.mosaicAnim.ambiance : null;
    u.uAnim.value = animM ? 1 : 0;
    u.uTime.value = t;
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
      const list = animM && this.animData.planche.parVignette[tile.i];
      if (list?.length) {
        const cx = x + tw / 2, cy = y + th / 2;
        this.drawSprites(list, {
          vp: this.animData.tiles[tile.i].fuitePlanche, atlas: this.mosaicAnim.decoupes, atlasSize: this.animData.planche.atlas,
          toWorld: (px, py, vec) => vec.set(px - cx, cy - py, 0), unitX: 1, unitY: 1, bounds: [x, y, x + tw, y + th],
          tau: t, loop: MOSAIC_LOOP, relief: u.uRelief.value, dist, alpha: 1,
        });
      }
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, this.mosaicSize.w, H);
    this.draw(this.capsMesh);
  }

  renderPlan(s, t) {
    const { w: W, h: H } = this.size;
    const plan = s.plan;
    const still = s.mode !== '3d';
    for (const { seg, u: progress, tau, alpha } of this.layersAt(s, t)) {
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
        const cover = plan.fit === 'cover';
        const pw = cover ? Math.max(W, H * info.aspect) : Math.min(W, H * info.aspect); // « cover » ou « contain »
        const ph = pw / info.aspect;
        const span = cover ? Math.max(0, (pw - W) / 2 - 2) / pw : 0; // marge de panoramique (fraction de largeur)
        const pu = this.plateMat.uniforms;
        const dist = H / 2 / TAN;
        const anim = this.animOn(s, info) ? this.animTextures.get(info.tile.i) : null;
        if (this.animOn(s, info) && !anim) this.animTexturesFor(info.tile.i);
        pu.uTex.value = anim ? anim.fond : tex;
        pu.uAnim.value = anim ? 1 : 0;
        pu.uAmb.value = anim ? anim.ambiance : null;
        pu.uTime.value = tau;
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
          let a = m.from[key] ?? neutral, b = m.to[key] ?? neutral;
          if (key === 'panX' && span > 0 && seg.shot.move.startsWith('travelling')) { // plein écran : parcourt toute l'image
            a = Math.sign(a) * span;
            b = Math.sign(b) * span;
            return a + (b - a) * e;
          }
          return neutral + (a + (b - a) * e - neutral) * k;
        };
        const user = s.user || { yaw: 0, pitch: 0, zoom: 1 };
        this.placeCamera(this.camera, W / H, dist,
          still ? 0 : at('yaw', 0) + user.yaw, still ? 0 : at('pitch', 0) + user.pitch, still ? 1 : at('zoom', 1) * user.zoom,
          still ? 0 : at('panX', 0) * pw, still ? 0 : at('panY', 0) * pw);
        this.renderer.clearDepth();
        this.draw(this.plateMesh, this.camera);
        if (anim) {
          const data = this.animData.tiles[info.tile.i];
          const [iw, ih] = data.taille;
          this.drawSprites(data.decoupesListe, {
            vp: data.fuite, atlas: anim.decoupes, atlasSize: data.atlas,
            toWorld: (px, py, vec) => vec.set((px / iw - 0.5) * pw, (0.5 - py / ih) * ph, 0), unitX: pw / iw, unitY: ph / ih,
            bounds: [0, 0, iw, ih], tau, relief: pu.uRelief.value, dist, alpha,
          });
          this.drawCaption(info.tile, anim.fond, pu, { pw, ph, alpha });
        }
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

  // Personnages et véhicules : chaque découpe suit sa trajectoire, du plus loin au plus proche.
  // loop > 0 : boucle parfaite (en fin de boucle, la découpe se fond et réapparaît à son point de départ).
  drawSprites(list, { vp, atlas, atlasSize, toWorld, unitX, unitY, bounds, tau, loop = 0, relief, dist, alpha }) {
    const [vx, vy] = vp;
    const [AW, AH] = atlasSize;
    const [bx0, by0, bx1, by1] = bounds;
    const at = (e, time, a0) => {
      const [x0, y0, w, h] = e.rect;
      const [fx, fy] = e.pied;
      const m = e.mouvement;
      let px = fx, py = fy, sc = 1, rot = 0, bob = 0, bend = 0, breath = 0, wave = 0;
      // en boucle, les fréquences sont des multiples de 2π/loop : le mouvement revient exactement au départ
      const f = (hz) => (loop > 0 ? Math.max(1, Math.round((hz * loop) / (2 * Math.PI))) * (2 * Math.PI) / loop : hz);
      if (m.type === 'vie') { // intérieur : la personne reste à sa place
        const A = m.amp || 1;
        breath = Math.sin(time * f(1.7) + m.phase) * 0.012 * A;
        bend = (Math.sin(time * f(0.9) + m.phase) * 0.035 + Math.sin(time * f(2.3) + m.phase * 1.7) * 0.012) * A;
        if (m.posture === 'debout') {
          px = fx + Math.sin(time * f(0.5) + m.phase) * h * 0.015; // léger transfert d'appui
          bob = Math.abs(Math.sin(time * f(1.0) + m.phase)) * h * 0.005;
          bend *= 0.7;
          wave = Math.sin(time * f(1.3) + m.phase) * 0.03;          // geste lent du bras levé
        }
        if (m.leve) wave = Math.sin(time * f(5.5) + m.phase) * 0.06;
      } else if (m.type === 'route') { // vers le point de fuite (s'éloigne) ou vers le spectateur (approche)
        const k = (m.sens === 'eloigne' ? 1 : -1) * m.vitesse * time;
        px = fx + (vx - fx) * k;
        py = fy + (vy - fy) * k;
        sc = Math.max(0.25, Math.min(2.2, (py - vy) / Math.max(1e-3, fy - vy)));
        bob = Math.sin(time * 11 + x0) * h * 0.002; // vibration du moteur
      } else if (m.type === 'marche') {
        px = fx + m.dir * m.vitesse * h * time;
        bob = Math.abs(Math.sin(time * 5.6 + m.phase)) * h * 0.018; // rebond des pas
        rot = Math.sin(time * 2.8 + m.phase) * 0.025;               // balancement
      } else {
        rot = Math.sin(time * 1.3 + m.phase) * 0.035;
        bob = Math.sin(time * 1.3 + m.phase) * h * 0.01;
      }
      // fondu quand la découpe sort du cadre (par rapport à sa position de départ : une découpe qui
      // touchait déjà le bord au repos reste entière)
      const edgeAt = (x, y, k) => Math.min(x - (w * k) / 2 - bx0, bx1 - (x + (w * k) / 2), by1 - y + h * k * 0.15) / Math.max(1e-3, (w * k) * 0.3);
      const edge = m.type === 'vie' ? 1 : edgeAt(px, py, sc) - Math.min(0, edgeAt(fx, fy, 1));
      const a = a0 * Math.max(0, Math.min(1, edge + 1));
      return { e, x0, y0, w, h, fx, fy, px, py, sc, rot, bob, bend, breath, wave, a, depth: Math.max(0, Math.min(1, e.profondeur + (sc - 1) * 0.35)) };
    };
    const items = [];
    for (const e of list) {
      if (loop > 0 && (e.mouvement.type === 'vie' || e.mouvement.type === 'tangage')) {
        items.push(at(e, ((tau % loop) + loop) % loop, alpha)); // déjà périodique : pas de fondu de boucle
      } else if (loop > 0) {
        const tl = ((tau % loop) + loop) % loop, F = 0.8;
        const fade = tl > loop - F ? (loop - tl) / F : 1;
        items.push(at(e, tl, alpha * fade));
        if (fade < 1) items.push(at(e, 0, alpha * (1 - fade)));
      } else items.push(at(e, tau, alpha));
    }
    const visible = items.filter((it) => it.a > 0.01).sort((p, q) => p.py - q.py);

    for (const mat of [this.shadowMat, this.spriteMat]) {
      mat.uniforms.uEye.value.set(0, 0, dist);
      mat.uniforms.uRelief.value = relief;
    }
    this.spriteMat.uniforms.uAtlas.value = atlas;
    for (const it of visible) {
      const su = this.shadowMat.uniforms;
      toWorld(it.px, it.py, su.uFoot.value);
      su.uSize.value.set(it.w * it.sc * 0.85 * unitX, Math.max(it.h * 0.05, it.w * 0.11) * it.sc * unitY);
      su.uPivot.value.set(0.5, 0.5);
      su.uRot.value = 0;
      su.uBend.value = 0;
      su.uBreath.value = 0;
      su.uWave.value = 0;
      su.uDepth.value = it.depth;
      su.uAlpha.value = it.a * (it.e.mouvement.type === 'vie' ? (it.e.mouvement.posture === 'debout' ? 0.22 : 0.1) : it.e.genre === 'pieton' ? 0.3 : 0.4);
      this.draw(this.shadowMesh, this.camera);

      const u = this.spriteMat.uniforms;
      toWorld(it.px, it.py - it.bob, u.uFoot.value);
      u.uSize.value.set(it.w * it.sc * unitX, it.h * it.sc * unitY);
      u.uPivot.value.set((it.fx - it.x0) / it.w, (it.y0 + it.h - it.fy) / it.h);
      u.uRot.value = it.rot;
      u.uBend.value = it.bend;
      u.uBreath.value = it.breath;
      u.uWave.value = it.wave;
      u.uDepth.value = it.depth;
      u.uAlpha.value = it.a;
      const [ax, ay, aw, ah] = it.e.atlas;
      u.uAtlasRect.value.set(ax / AW, ay / AH, aw / AW, ah / AH);
      this.draw(this.spriteMesh, this.camera);
    }
  }

  // Bandeau de légende redessiné par-dessus les découpes (même place 3D que sur la plaque).
  drawCaption(tile, texFond, pu, { pw, ph, alpha }) {
    const c = tile.caption;
    if (!c) return;
    const [rw, rh] = [tile.rect[2], tile.rect[3]];
    const u = this.capMat.uniforms;
    u.uDepth.value = pu.uDepth.value; // même texture de profondeur (référence, pas de copie)
    u.uTileSize.value = pu.uTileSize.value;
    u.uAtlasSize.value = pu.uAtlasSize.value;
    u.uRelief.value = pu.uRelief.value;
    u.uDepthMode.value = pu.uDepthMode.value;
    u.uTile.value.copy(pu.uTile.value);
    u.uEye.value.copy(pu.uEye.value);
    u.uCapT.value.copy(pu.uCapT.value);
    u.uOverscan.value = 1;
    u.uTex.value = texFond;
    u.uAnim.value = 0;
    u.uAlpha.value = alpha;
    u.uSub.value.set(c[0] / rw, 1 - (c[1] + c[3]) / rh, c[2] / rw, c[3] / rh);
    this.capMesh.position.set(((c[0] + c[2] / 2) / rw - 0.5) * pw, (0.5 - (c[1] + c[3] / 2) / rh) * ph, 0);
    this.capMesh.scale.set((c[2] / rw) * pw, (c[3] / rh) * ph, 1);
    this.draw(this.capMesh, this.camera);
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
