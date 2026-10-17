// ANIMER UNE IMAGE — la partie pure du moteur « image fixe → vidéo », bâtie sur l'architecture des meilleurs outils
// étudiés (veille du 14/10/2026) :
//  · parallaxe 2.5D façon Depthflow / « 3D Ken Burns » : une carte de profondeur, une caméra virtuelle qui se déplace,
//    chaque pixel décalé selon sa profondeur (le moteur GL fait la recherche de surface pour gérer les occultations) ;
//  · champs de mouvement eulériens (Holynski et al., CVPR 2021) : UN champ de vitesse constant dans le temps décrit
//    l'eau, les nuages, la fumée ; chaque image est la superposition d'un déplacement vers l'avant et d'un déplacement
//    vers l'arrière pondérés par t/T (version « échantillonnage » du splatting symétrique) → boucle sans couture ;
//  · pinceau de mouvement (motion brush) : l'utilisateur trace des flèches, le champ suit ses gestes, des ancres figent.
// Tout ici travaille sur des tableaux (testé en Node) ; le GPU (WebGL2) n'applique que ce que ces fonctions décident.

export const CAMERA_PRESETS = {
  travelling_avant: 'Travelling avant (on entre dans l’image)',
  travelling_arriere: 'Travelling arrière (révélation)',
  orbite: 'Orbite (tour autour du sujet)',
  panoramique: 'Panoramique gauche → droite',
  grue: 'Grue (montée verticale)',
  vertigo: 'Effet vertigo (zoom compensé)',
  flottant: 'Caméra flottante (respiration)',
  fixe_vivant: 'Plan fixe vivant (seuls les éléments bougent)',
} as const;
export type CameraPreset = keyof typeof CAMERA_PRESETS;

export interface Effects {
  clouds: boolean;
  water: boolean;
  rain: boolean;
  snow: boolean;
  dust: boolean;
  fog: boolean;
  rays: boolean;
  grain: boolean;
  vignette: boolean;
  letterbox: boolean;
}
export interface ImageMotionSpec {
  seconds: number;
  fps: number;
  format: '16:9' | '9:16' | '1:1' | 'image';
  preset: CameraPreset;
  /** 0..1 — amplitude of the camera move (parallax strength). */
  intensity: number;
  effects: Effects;
  /** Length of the seamless loop of the fluid motions (s). */
  loop: number;
  title?: { text: string; start: number; duration: number };
}
export const DEFAULT_EFFECTS: Effects = { clouds: true, water: true, rain: false, snow: false, dust: false, fog: false, rays: false, grain: true, vignette: true, letterbox: false };

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface CamState {
  /** Parallax offset of the virtual camera (fraction of the image width / height). */
  ox: number;
  oy: number;
  /** Lens zoom (all depths alike). */
  zoom: number;
  /** Dolly: the camera physically moves in (> 0) or out (< 0) — near depths grow more than far ones. */
  dolly?: number;
  /** Depth that does not move (0 = far, 1 = near). */
  focus: number;
  roll: number;
}
/** The virtual camera of a preset at progress k ∈ [0, 1] (eased), scaled by the intensity. */
export function cameraState(p: CameraPreset, k: number, intensity = 0.6): CamState {
  const a = clamp(intensity, 0, 1);
  const e = ease(k);
  const s = Math.sin;
  switch (p) {
    case 'travelling_avant':
      return { ox: 0.004 * s(k * 6.28) * a, oy: -0.008 * e * a, zoom: lerp(1.03, 1.03 + 0.08 * a, e), dolly: 0.45 * a * e, focus: 0.2, roll: 0 };
    case 'travelling_arriere':
      return { ox: 0, oy: 0.008 * e * a, zoom: lerp(1.03 + 0.08 * a, 1.03, e), dolly: 0.45 * a * (1 - e), focus: 0.2, roll: 0 };
    case 'orbite':
      return { ox: 0.045 * a * s(lerp(-1.2, 1.2, e)), oy: 0.01 * a * Math.cos(lerp(-1.2, 1.2, e)), zoom: 1.08 + 0.04 * a, focus: 0.55, roll: 0.01 * a * s(lerp(-1.2, 1.2, e)) };
    case 'panoramique':
      return { ox: lerp(-0.05, 0.05, e) * a, oy: 0, zoom: 1.12, focus: 0.3, roll: 0 };
    case 'grue':
      return { ox: 0, oy: lerp(0.04, -0.04, e) * a, zoom: 1.12, focus: 0.3, roll: 0 };
    case 'vertigo':
      // Dolly zoom: the camera moves back while the lens zooms in — the subject keeps its size, the background breathes.
      return { ox: 0, oy: 0, zoom: lerp(1.03, 1.03 + 0.35 * a, e), dolly: -0.4 * a * e, focus: 0.85, roll: 0 };
    case 'flottant':
      return { ox: 0.012 * a * s(k * 6.28 * 1.3), oy: 0.008 * a * s(k * 6.28 * 0.9 + 1), zoom: 1.06 + 0.02 * a * s(k * 6.28 * 0.5), focus: 0.45, roll: 0.004 * a * s(k * 6.28 * 0.7) };
    case 'fixe_vivant':
    default:
      return { ox: 0, oy: 0, zoom: 1.02, focus: 0.5, roll: 0 };
  }
}

/** What a sentence asks of the image (preset + effects + intensity) — used when no model is available. */
export function suggestFromPrompt(text: string): { preset: CameraPreset; effects: Partial<Effects>; intensity: number } {
  const t = text.toLowerCase();
  const preset: CameraPreset = /orbite|tourne autour|360/.test(t)
    ? 'orbite'
    : /recul|r[ée]v[ée]l|arri[eè]re/.test(t)
      ? 'travelling_arriere'
      : /panoram|balay|gauche|droite/.test(t)
        ? 'panoramique'
        : /grue|monte|s.[ée]l[eè]ve|vertical/.test(t)
          ? 'grue'
          : /vertigo|hitchcock|dolly zoom/.test(t)
            ? 'vertigo'
            : /fixe|cin[ée]magraph|statique/.test(t)
              ? 'fixe_vivant'
              : /flott|r[eê]ve|doux|calme/.test(t)
                ? 'flottant'
                : 'travelling_avant';
  const effects: Partial<Effects> = {};
  if (/pluie|pleut|orage/.test(t)) effects.rain = true;
  if (/neige|hiver/.test(t)) effects.snow = true;
  if (/poussi[eè]re|particule|paillette|magique|lucioles/.test(t)) effects.dust = true;
  if (/brume|brouillard|myst[eè]re/.test(t)) effects.fog = true;
  if (/rayons|lumi[eè]re divine|soleil/.test(t)) effects.rays = true;
  if (/cin[ée]ma|film|[ée]pique/.test(t)) effects.letterbox = true;
  if (/sans nuage|ciel fixe/.test(t)) effects.clouds = false;
  const intensity = /l[ée]ger|subtil|doux/.test(t) ? 0.35 : /fort|dynamique|spectaculaire|[ée]pique/.test(t) ? 0.9 : 0.6;
  return { preset, effects, intensity };
}

/** Separable box blur of a single-channel field (in place, `passes` times ≈ gaussian). */
export function blur(f: Float32Array, w: number, h: number, r: number, passes = 2): Float32Array {
  const tmp = new Float32Array(f.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) acc += f[row + clamp(x, 0, w - 1)]!;
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / (2 * r + 1);
        acc += f[row + clamp(x + r + 1, 0, w - 1)]! - f[row + clamp(x - r, 0, w - 1)]!;
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x]!;
      for (let y = 0; y < h; y++) {
        f[y * w + x] = acc / (2 * r + 1);
        acc += tmp[clamp(y + r + 1, 0, h - 1) * w + x]! - tmp[clamp(y - r, 0, h - 1) * w + x]!;
      }
    }
  }
  return f;
}

/**
 * Depth WITHOUT a model (offline fallback): lower in the frame = nearer, textured / saturated = nearer, bright and
 * smooth top (sky) = far. 1 = near, 0 = far. Rough, but it gives a believable parallax on landscapes and street scenes.
 */
export function heuristicDepth(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const lum = new Float32Array(w * h);
  const sat = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4]!, g = rgba[i * 4 + 1]!, b = rgba[i * 4 + 2]!;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    lum[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    sat[i] = mx ? (mx - mn) / mx : 0;
  }
  // Local texture: |lum − blurred lum|.
  const bl = blur(Float32Array.from(lum), w, h, Math.max(1, Math.round(w / 80)));
  const tex = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) tex[i] = Math.min(1, Math.abs(lum[i]! - bl[i]!) * 8);
  blur(tex, w, h, Math.max(1, Math.round(w / 40)));
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = y / (h - 1);
      const skyish = v < 0.45 && tex[i]! < 0.08 && lum[i]! > 0.45 ? 1 : 0;
      d[i] = clamp(0.15 + 0.62 * v ** 1.3 + 0.18 * tex[i]! + 0.08 * sat[i]! - 0.25 * skyish);
    }
  return blur(d, w, h, Math.max(2, Math.round(w / 50)), 3);
}

/** Sky and water regions (0/1 per pixel) from colour, position, smoothness and depth. */
export function regionMasks(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, depth: Float32Array): { sky: Uint8Array; water: Uint8Array; skyShare: number; waterShare: number } {
  const sky = new Uint8Array(w * h);
  const water = new Uint8Array(w * h);
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!) / 255;
  const bl = blur(Float32Array.from(lum), w, h, Math.max(1, Math.round(w / 100)));
  let ns = 0, nw = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = rgba[i * 4]!, g = rgba[i * 4 + 1]!, b = rgba[i * 4 + 2]!;
      const v = y / (h - 1);
      const smooth = Math.abs(lum[i]! - bl[i]!) < 0.04;
      const blueish = b > r * 1.05 && b > 90;
      const greyBright = lum[i]! > 0.6 && Math.abs(r - b) < 40 && Math.abs(g - b) < 40;
      if (v < 0.6 && depth[i]! < 0.35 && smooth && (blueish || greyBright)) {
        sky[i] = 1;
        ns++;
      } else if (v > 0.45 && blueish && g > r && depth[i]! < 0.85 && lum[i]! > 0.18) {
        water[i] = 1;
        nw++;
      }
    }
  return { sky, water, skyShare: ns / (w * h), waterShare: nw / (w * h) };
}

/** A stroke of the motion brush, in image fractions (0..1), with its strength. */
export interface Stroke {
  points: [number, number][];
  strength: number;
}
/**
 * The Eulerian motion field (uv units per second, 2 values per pixel): clouds drift, water ripples and flows, the
 * user's strokes guide the rest; anchors (and everything else) stay still. Smoothed so the warp never tears.
 */
export function motionField(w: number, h: number, o: { sky?: Uint8Array; water?: Uint8Array; strokes?: Stroke[]; anchors?: Uint8Array; clouds?: boolean; waterOn?: boolean; wind?: number }): Float32Array {
  const fx = new Float32Array(w * h);
  const fy = new Float32Array(w * h);
  const wind = o.wind ?? 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (o.clouds !== false && o.sky?.[i]) {
        fx[i] = 0.012 * wind * (1.2 - y / h);
        fy[i] = 0.0015 * Math.sin(x * 0.05);
      } else if (o.waterOn !== false && o.water?.[i]) {
        // Ripples toward the viewer, a little sideways: a slow, readable flow.
        fx[i] = 0.004 * wind * Math.sin(y * 0.15 + x * 0.02);
        fy[i] = 0.007 * wind * (0.6 + 0.4 * Math.sin(x * 0.07));
      }
    }
  for (const s of o.strokes ?? []) {
    for (let k = 1; k < s.points.length; k++) {
      const [ax, ay] = s.points[k - 1]!;
      const [bx, by] = s.points[k]!;
      const len = Math.hypot(bx - ax, by - ay) || 1e-6;
      const dx = ((bx - ax) / len) * 0.03 * s.strength;
      const dy = ((by - ay) / len) * 0.03 * s.strength;
      const rad = 0.06;
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - rad) * w)), x1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + rad) * w));
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - rad) * h)), y1 = Math.min(h - 1, Math.ceil((Math.max(ay, by) + rad) * h));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = x / w, py = y / h;
          const t = clamp(((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / (len * len));
          const dd = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
          const wgt = Math.exp(-((dd / rad) ** 2) * 3);
          fx[y * w + x] = fx[y * w + x]! + dx * wgt;
          fy[y * w + x] = fy[y * w + x]! + dy * wgt;
        }
    }
  }
  if (o.anchors) for (let i = 0; i < w * h; i++) if (o.anchors[i]) fx[i] = fy[i] = 0;
  const r = Math.max(1, Math.round(w / 120));
  blur(fx, w, h, r);
  blur(fy, w, h, r);
  const out = new Float32Array(w * h * 2);
  for (let i = 0; i < w * h; i++) {
    out[i * 2] = fx[i]!;
    out[i * 2 + 1] = fy[i]!;
  }
  return out;
}

/**
 * The Eulerian sampling of one pixel at time t of a loop of length T: the colour comes from upstream (x − v·t) and
 * from downstream (x + v·(T − t)), blended by t/T — at t = 0 and t = T it is the original picture: a seamless loop.
 */
export function eulerianSample(x: number, y: number, v: [number, number], t: number, T: number): { a: [number, number]; b: [number, number]; mix: number } {
  const tt = ((t % T) + T) % T;
  return { a: [x - v[0] * tt, y - v[1] * tt], b: [x + v[0] * (T - tt), y + v[1] * (T - tt)], mix: tt / T };
}

/** Output size of a format for a picture (the « image » format keeps the picture's ratio, long side 1920, even sizes). */
export function outputSize(format: ImageMotionSpec['format'], iw: number, ih: number): [number, number] {
  if (format === '16:9') return [1920, 1080];
  if (format === '9:16') return [1080, 1920];
  if (format === '1:1') return [1080, 1080];
  const s = 1920 / Math.max(iw, ih);
  return [Math.round((iw * s) / 2) * 2, Math.round((ih * s) / 2) * 2];
}
