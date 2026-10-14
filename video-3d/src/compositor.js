// Moteur de rendu de la vidéo « Ivrogne » en HTML/WebGL (Three.js).
//
// Principe « zéro régression » :
//  - Mode ORIGINAL : chaque pixel de la sortie est lu avec texelFetch() dans la frame source,
//    sans filtrage ni gestion de couleur => rendu identique, pixel pour pixel, à la vidéo.
//  - Mode 3D : la partie nette de la vidéo (plan paysage, puis l'emoji) devient un maillage
//    déformé par une carte de profondeur (Depth Anything V2) calculée pour chaque frame.
//    Les sommets se déplacent le long du rayon de la caméra par défaut : caméra au repos,
//    l'image reste identique ; dès que la caméra bouge, la parallaxe révèle le relief.
//
// Le même code sert à l'aperçu (balise <video>), à l'export MP4 dans le navigateur
// (Mediabunny / WebCodecs) et à l'export en ligne de commande (Playwright + FFmpeg).
import * as THREE from '../vendor/three.module.js';

export const W = 1080;
export const H = 1920;
export const FPS = 30;
export const FRAMES = 369;           // 12,3 s
export const DURATION = FRAMES / FPS;

// Dialogues (transcription Whisper, horodatage en secondes).
export const SUBTITLES = [
  { start: 0.0, end: 2.1, who: 'femme', text: "Ivrogne, c'est comme ça\nque tu passes ton temps ?" },
  { start: 2.18, end: 4.3, who: 'homme', text: 'Tais-toi, je suis déjà\nénervé contre moi-même.' },
  { start: 4.42, end: 5.62, who: 'femme', text: 'Et cela pourquoi donc ?' },
  { start: 5.72, end: 7.52, who: 'homme', text: "J'ai bu toute la journée\npour t'oublier," },
  { start: 7.58, end: 9.1, who: 'homme', text: 'et maintenant je te vois\nen double.' },
];

export const CAMERAS = {
  fixe: () => ({ yaw: 0, pitch: 0, zoom: 1 }),
  travelling: (t) => ({
    yaw: 0.06 * Math.sin((2 * Math.PI * t) / 9),
    pitch: 0.025 * Math.sin((2 * Math.PI * t) / 7),
    zoom: 0.95 - 0.08 * smooth(Math.min(t / 10, 1)),
  }),
  orbite: (t) => ({
    yaw: 0.12 * Math.sin((2 * Math.PI * t) / 6),
    pitch: 0.04 * Math.cos((2 * Math.PI * t) / 6),
    zoom: 0.9,
  }),
};

function smooth(x) { return x * x * (3 - 2 * x); }

THREE.ColorManagement.enabled = false;

const FOV = 30;
const EYE_DIST = H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const BG_DEPTH = 700; // recul du fond flou en mode 3D (compensé par l'échelle)

const COMMON = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D uSrc;
uniform float uTopAtZero; // 1 si la ligne 0 de la texture est le haut de l'image (données brutes)
vec2 srcUV(vec2 img) {
  vec2 t = img / vec2(${W}.0, ${H}.0);
  return vec2(t.x, uTopAtZero > 0.5 ? t.y : 1.0 - t.y);
}
vec3 srcFetch(ivec2 px) {
  px = clamp(px, ivec2(0), ivec2(${W - 1}, ${H - 1}));
  if (uTopAtZero < 0.5) px.y = ${H - 1} - px.y;
  return texelFetch(uSrc, px, 0).rgb;
}
`;

// Le plan de fond déborde du cadre (×BG_OVERSCAN) : en mode 3D, quand la caméra tourne, les bords
// révélés répètent les pixels de bord (flous) au lieu de montrer du noir. La zone visible au repos
// garde exactement les mêmes coordonnées (1,5 est exact en binaire).
const BG_OVERSCAN = 1.5;
const BG_VERT = /* glsl */ `
in vec3 position; in vec2 uv;
uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
out vec2 vUv;
void main() { vUv = (uv - 0.5) * ${BG_OVERSCAN.toFixed(1)} + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const BG_FRAG = /* glsl */ `
${COMMON}
uniform float uHole;      // 1 en mode 3D : la zone de la plaque est remplacée (évite le doublon)
uniform float uHoleBlack; // 1 : remplissage noir (écran emoji), 0 : flou
uniform vec4 uRect;       // x, y, largeur, hauteur en pixels image (origine en haut à gauche)
in vec2 vUv; out vec4 outColor;
void main() {
  ivec2 px = ivec2(floor(vec2(vUv.x * ${W}.0, (1.0 - vUv.y) * ${H}.0)));
  vec3 c = srcFetch(px);
  vec2 p = vec2(px);
  if (uHole > 0.5 && p.x >= uRect.x && p.x < uRect.x + uRect.z && p.y >= uRect.y && p.y < uRect.y + uRect.w) {
    if (uHoleBlack > 0.5) {
      c = vec3(0.0);
    } else {
      vec3 acc = vec3(0.0);
      for (int j = -3; j <= 3; j++) for (int i = -3; i <= 3; i++)
        acc += texture(uSrc, srcUV(p + vec2(float(i), float(j)) * 22.0)).rgb;
      c = acc / 49.0 * 0.82;
    }
  }
  outColor = vec4(c, 1.0);
}
`;

const PLATE_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec2 uv;
uniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
uniform sampler2D uDepth;
uniform vec2 uTile;      // colonne, ligne de la tuile dans l'atlas
uniform vec2 uTileSize;  // taille d'une tuile (px)
uniform vec2 uAtlasSize; // taille de l'atlas (px)
uniform float uRelief;   // fraction du chemin vers l'œil parcourue par les points les plus proches
uniform vec3 uEye;       // position de la caméra au repos
out vec2 vUv;
void main() {
  vUv = uv;
  vec2 tp = vec2(uv.x * (uTileSize.x - 1.0) + 0.5, (1.0 - uv.y) * (uTileSize.y - 1.0) + 0.5);
  // Dilatation (max 5×5) : les silhouettes avancent d'un cran, l'étirement aux bords de
  // profondeur tombe donc dans le décor plutôt que sur les personnages.
  float d = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 q = clamp(tp + vec2(float(i), float(j)), vec2(0.5), uTileSize - 0.5);
    d = max(d, texture(uDepth, (uTile * uTileSize + q) / uAtlasSize).r);
  }
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.xyz += (uEye - wp.xyz) * (d * uRelief);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PLATE_FRAG = /* glsl */ `
${COMMON}
uniform vec4 uRect;
in vec2 vUv; out vec4 outColor;
void main() {
  vec2 img = uRect.xy + vec2(vUv.x, 1.0 - vUv.y) * uRect.zw;
  outColor = vec4(texture(uSrc, srcUV(img)).rgb, 1.0);
}
`;

const OVERLAY_VERT = /* glsl */ `
in vec3 position; in vec2 uv;
uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
out vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const OVERLAY_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
in vec2 vUv; out vec4 outColor;
void main() { outColor = texture(uMap, vUv); }
`;

export function makeVideoTexture(video) {
  const tex = new THREE.VideoTexture(video);
  return configureSourceTexture(tex, false);
}

export function makeCanvasTexture(canvas) {
  return configureSourceTexture(new THREE.CanvasTexture(canvas), false);
}

// Texture alimentée par des pixels RGBA bruts (ligne 0 = haut de l'image).
export function makeDataTexture() {
  const tex = new THREE.DataTexture(new Uint8Array(W * H * 4), W, H, THREE.RGBAFormat);
  tex.flipY = false;
  return configureSourceTexture(tex, true);
}

function configureSourceTexture(tex, topAtZero) {
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.userData.topAtZero = topAtZero;
  return tex;
}

export class Compositor {
  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas
   * @param {object|null} o.depthMeta  contenu de assets/depth-meta.json
   * @param {CanvasImageSource|null} o.depthImage  assets/depth-atlas.png
   */
  constructor({ canvas, depthMeta = null, depthImage = null }) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 1);

    this.meta = depthMeta;
    this.cutFrame = depthMeta?.cutFrame ?? 301;
    this.has3D = !!(depthMeta && depthImage);

    this.scene = new THREE.Scene();
    this.ortho = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 10000);
    this.ortho.position.set(0, 0, 5000);
    this.persp = new THREE.PerspectiveCamera(FOV, W / H, 10, 40000);
    this.eye = new THREE.Vector3(0, 0, EYE_DIST);

    const sourceUniforms = () => ({ uSrc: { value: null }, uTopAtZero: { value: 0 } });
    this.bgMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BG_VERT, fragmentShader: BG_FRAG, depthTest: false, depthWrite: false,
      uniforms: { ...sourceUniforms(), uHole: { value: 0 }, uHoleBlack: { value: 0 }, uRect: { value: new THREE.Vector4() } },
    });
    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(W * BG_OVERSCAN, H * BG_OVERSCAN), this.bgMat);
    this.bg.renderOrder = 0;
    this.scene.add(this.bg);

    this.layers = [];
    if (this.has3D) {
      const m = depthMeta;
      this.depthTex = new THREE.Texture(depthImage);
      this.depthTex.flipY = false;
      this.depthTex.colorSpace = THREE.NoColorSpace;
      this.depthTex.minFilter = THREE.NearestFilter;
      this.depthTex.magFilter = THREE.NearestFilter;
      this.depthTex.generateMipmaps = false;
      this.depthTex.needsUpdate = true;
      const atlasSize = new THREE.Vector2(m.cols * m.tileW, m.rows * m.tileH);
      const makeLayer = (rect) => {
        const [x, y, w, h] = rect;
        const mat = new THREE.RawShaderMaterial({
          glslVersion: THREE.GLSL3, vertexShader: PLATE_VERT, fragmentShader: PLATE_FRAG,
          uniforms: {
            ...sourceUniforms(),
            uDepth: { value: this.depthTex }, uTile: { value: new THREE.Vector2() },
            uTileSize: { value: new THREE.Vector2(m.tileW, m.tileH) }, uAtlasSize: { value: atlasSize },
            uRelief: { value: 0.15 }, uEye: { value: this.eye }, uRect: { value: new THREE.Vector4(x, y, w, h) },
          },
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, m.tileW - 1, m.tileH - 1), mat);
        mesh.position.set(x + w / 2 - W / 2, H / 2 - (y + h / 2), 0);
        mesh.renderOrder = 1;
        mesh.visible = false;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        return { mesh, mat, rect };
      };
      this.layers = [makeLayer(m.sceneRect), makeLayer(m.emojiRect)];
    }

    // Calque sous-titres (écran, au-dessus de tout).
    this.subCanvas = document.createElement('canvas');
    this.subCanvas.width = W;
    this.subCanvas.height = H;
    this.subTex = new THREE.CanvasTexture(this.subCanvas);
    this.subTex.colorSpace = THREE.NoColorSpace;
    this.subTex.generateMipmaps = false;
    this.subTex.minFilter = THREE.LinearFilter;
    this.overlayScene = new THREE.Scene();
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: OVERLAY_VERT, fragmentShader: OVERLAY_FRAG,
      uniforms: { uMap: { value: this.subTex } }, transparent: true, depthTest: false, depthWrite: false,
    }));
    this.overlayScene.add(this.overlay);
    this.currentSub = undefined;
  }

  setSource(texture) {
    this.source = texture;
    const top = texture.userData.topAtZero ? 1 : 0;
    for (const mat of [this.bgMat, ...this.layers.map((l) => l.mat)]) {
      mat.uniforms.uSrc.value = texture;
      mat.uniforms.uTopAtZero.value = top;
    }
  }

  /**
   * Dessine une frame.
   * @param {object} s
   * @param {number} s.frame  index de frame source (0..368)
   * @param {'original'|'3d'} s.mode
   * @param {string} [s.camera]  clé de CAMERAS
   * @param {number} [s.relief]
   * @param {{yaw:number,pitch:number,zoom:number}} [s.user]  décalage interactif
   * @param {boolean} [s.subtitles]
   */
  render(s) {
    const frame = Math.max(0, Math.min(FRAMES - 1, Math.round(s.frame)));
    const t = frame / FPS;
    const is3D = s.mode === '3d' && this.has3D;
    const isEmoji = frame >= this.cutFrame;

    let camera = this.ortho;
    this.bg.position.set(0, 0, 0);
    this.bg.scale.set(1, 1, 1);
    this.bgMat.uniforms.uHole.value = 0;
    for (const l of this.layers) l.mesh.visible = false;

    if (is3D) {
      const layer = this.layers[isEmoji ? 1 : 0];
      const m = this.meta;
      layer.mesh.visible = true;
      layer.mat.uniforms.uTile.value.set(frame % m.cols, Math.floor(frame / m.cols));
      layer.mat.uniforms.uRelief.value = s.relief ?? 0.15;
      const [x, y, w, h] = layer.rect;
      this.bgMat.uniforms.uHole.value = 1;
      this.bgMat.uniforms.uHoleBlack.value = isEmoji ? 1 : 0;
      this.bgMat.uniforms.uRect.value.set(x, y, w, h);
      // Fond reculé puis agrandi : identique au repos, parallaxe quand la caméra bouge.
      const k = (EYE_DIST + BG_DEPTH) / EYE_DIST;
      this.bg.position.set(0, 0, -BG_DEPTH);
      this.bg.scale.set(k, k, 1);

      const base = (CAMERAS[s.camera] || CAMERAS.fixe)(t);
      const u = s.user || { yaw: 0, pitch: 0, zoom: 1 };
      const yaw = base.yaw + u.yaw;
      const pitch = base.pitch + u.pitch;
      const dist = EYE_DIST * base.zoom * u.zoom;
      camera = this.persp;
      camera.position.set(
        dist * Math.sin(yaw) * Math.cos(pitch),
        dist * Math.sin(pitch),
        dist * Math.cos(yaw) * Math.cos(pitch),
      );
      camera.lookAt(0, 0, 0);
    }

    this.renderer.clear();
    this.renderer.render(this.scene, camera);

    const sub = s.subtitles ? SUBTITLES.find((x) => t >= x.start && t < x.end) || null : null;
    if (sub !== this.currentSub) this.drawSubtitle(sub);
    if (sub) this.renderer.render(this.overlayScene, this.ortho);
  }

  drawSubtitle(sub) {
    this.currentSub = sub;
    const ctx = this.subCanvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    if (sub) {
      const lines = sub.text.split('\n');
      const size = 62;
      ctx.font = `900 ${size}px "Arial Black", "Montserrat", "Helvetica Neue", Arial, "DejaVu Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const top = 1560 - ((lines.length - 1) * size * 1.18) / 2;
      lines.forEach((line, i) => {
        const y = top + i * size * 1.18;
        ctx.lineWidth = 14;
        ctx.strokeStyle = '#000';
        ctx.strokeText(line, W / 2, y);
        ctx.fillStyle = sub.who === 'femme' ? '#ffd6ea' : '#d9ecff';
        ctx.fillText(line, W / 2, y);
      });
    }
    this.subTex.needsUpdate = true;
  }

  readPixels(out) {
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }
}

export async function loadDepth(base = './assets/') {
  try {
    const embedded = globalThis.__ASSETS; // fichier HTML autonome : données intégrées à la page
    const meta = embedded?.depthMeta ?? await (await fetch(base + 'depth-meta.json')).json();
    const img = new Image();
    img.src = embedded?.depthImage ?? base + 'depth-atlas.png';
    await img.decode();
    return { meta, image: img };
  } catch (err) {
    console.warn('Profondeur indisponible, mode 3D désactivé :', err);
    return { meta: null, image: null };
  }
}
