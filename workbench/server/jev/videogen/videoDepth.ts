// VIDÉO → SCÈNE 3D (idée de l'utilisateur, 14/10/2026) : une scène Three.js/WebGL bâtie sur les PIXELS D'ORIGINE d'une
// vidéo (TikTok, téléphone…) avec UNE CARTE DE PROFONDEUR PAR IMAGE. Architecture retenue après veille :
//  · profondeur par image : Depth Anything V2 Small (Apache-2.0) dans le navigateur, sur des IMAGES CLÉS seulement
//    (le budget de calcul est mesuré puis tenu) ; amélioration notée : Video Depth Anything Small (Apache-2.0, cohérente
//    dans le temps) côté serveur — les variantes Base/Large sont CC-BY-NC, donc exclues ;
//  · entre deux images clés, la profondeur SUIT le mouvement : flot optique par blocs (SAD, recherche locale) puis
//    déformation arrière de la carte précédente — la propagation par flot des travaux « consistent video depth » ;
//  · la sortie d'un modèle monoculaire est relative (à une échelle et un décalage près) : chaque nouvelle carte est
//    RECALÉE (moindres carrés échelle + décalage) sur la carte propagée, puis fusionnée (filtre temporel), sauf là où
//    l'image a vraiment changé (occultation, nouvel objet) → plus de scintillement ;
//  · rendu : maillage dont chaque sommet est un pixel déplacé le long de SON rayon de caméra (à la caméra de repos,
//    l'image est identique pixel pour pixel), coupure des triangles étirés aux bords de profondeur, couche de fond floue
//    derrière (bouche-trous) — l'idée des « 3D photos » ; format d'échange RGBD « couleur | profondeur » côte à côte
//    dans UN seul MP4 (comme le « combined per pixel » de Depthkit) pour la page HTML autonome.
// Tout ici travaille sur des tableaux (testé en Node) ; le GPU n'applique que ce que ces fonctions décident.
import { suggestFromPrompt, type CameraPreset } from './imageMotion';

export const SCENE_STYLES = {
  relief: 'Relief 3D (pixels d’origine)',
  nuage: 'Nuage de points',
  holo: 'Hologramme',
} as const;
export type SceneStyle = keyof typeof SCENE_STYLES;

export interface SceneEffects {
  fog: boolean;
  dust: boolean;
  snow: boolean;
  rain: boolean;
  relight: boolean;
  grain: boolean;
  vignette: boolean;
  letterbox: boolean;
}
export const DEFAULT_SCENE_EFFECTS: SceneEffects = { fog: false, dust: false, snow: false, rain: false, relight: false, grain: false, vignette: true, letterbox: false };

export interface VideoSceneSpec {
  style: SceneStyle;
  preset: CameraPreset;
  /** 0..1 — amplitude of the camera move. */
  intensity: number;
  /** 0..1 — how deep the relief is. */
  relief: number;
  /** Depth jump (0..1) above which a triangle is torn (silhouettes stay sharp). */
  cut: number;
  effects: SceneEffects;
  /** Longest side of the output video (pixels); the source size is never exceeded. */
  quality: 720 | 1080 | 1920;
  audio: boolean;
  title?: { text: string; start: number; duration: number };
}
export const DEFAULT_SCENE: VideoSceneSpec = { style: 'relief', preset: 'orbite', intensity: 0.6, relief: 0.5, cut: 0.12, effects: { ...DEFAULT_SCENE_EFFECTS }, quality: 1080, audio: true };

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** Prompt → style, camera and effects (no model needed). */
export function sceneFromPrompt(text: string, base: VideoSceneSpec = DEFAULT_SCENE): VideoSceneSpec {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const s = suggestFromPrompt(text);
  const style: SceneStyle = /holo/.test(t) ? 'holo' : /nuage de points|points?\b|particul/.test(t) ? 'nuage' : base.style;
  const fx: SceneEffects = { ...base.effects };
  if (/neige|snow/.test(t)) fx.snow = true;
  if (/pluie|rain|orage/.test(t)) fx.rain = true;
  if (/poussiere|dust|poudre/.test(t)) fx.dust = true;
  if (/brume|brouillard|fog|mystere/.test(t)) fx.fog = true;
  if (/lumiere|eclair|relight|projecteur|soleil couchant/.test(t)) fx.relight = true;
  if (/grain|pellicule|vintage|retro/.test(t)) fx.grain = true;
  if (/cinema|bandes?|scope/.test(t)) fx.letterbox = true;
  const relief = /profond|forte? 3d|gros relief|spectacul/.test(t) ? 0.8 : /leger|subtil|doux/.test(t) ? 0.3 : base.relief;
  return { ...base, style, preset: s.preset, intensity: s.intensity, relief, effects: fx };
}

/** Rec. 601 luma of an RGBA buffer. */
export function toLuma(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (rgba[j]! * 77 + rgba[j + 1]! * 150 + rgba[j + 2]! * 29) >> 8;
  return out;
}

export interface BlockFlow {
  /** Per block: the frame-to-frame offset d such that cur(p) ≈ prev(p + d). */
  dx: Float32Array;
  dy: Float32Array;
  bw: number;
  bh: number;
  block: number;
}
/** Block-matching optical flow (sum of absolute differences, local search, small bias toward no motion). */
export function blockFlow(prev: Uint8Array, cur: Uint8Array, w: number, h: number, block = 8, radius = 6): BlockFlow {
  const bw = Math.ceil(w / block);
  const bh = Math.ceil(h / block);
  const dx = new Float32Array(bw * bh);
  const dy = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const x0 = bx * block;
      const y0 = by * block;
      const x1 = Math.min(w, x0 + block);
      const y1 = Math.min(h, y0 + block);
      let best = Infinity;
      let bdx = 0;
      let bdy = 0;
      for (let oy = -radius; oy <= radius; oy++) {
        for (let ox = -radius; ox <= radius; ox++) {
          let sad = 0;
          let n = 0;
          for (let y = y0; y < y1; y += 2) {
            const py = Math.min(h - 1, Math.max(0, y + oy)) * w;
            const cy = y * w;
            for (let x = x0; x < x1; x += 2) {
              const px = Math.min(w - 1, Math.max(0, x + ox));
              sad += Math.abs(cur[cy + x]! - prev[py + px]!);
              n++;
            }
          }
          const cost = sad / Math.max(1, n) + 0.35 * (Math.abs(ox) + Math.abs(oy));
          if (cost < best) {
            best = cost;
            bdx = ox;
            bdy = oy;
          }
        }
      }
      dx[by * bw + bx] = bdx;
      dy[by * bw + bx] = bdy;
    }
  }
  return { dx: median3(dx, bw, bh), dy: median3(dy, bw, bh), bw, bh, block };
}
function median3(a: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(a.length);
  const win: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      win.length = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) win.push(a[Math.min(h - 1, Math.max(0, y + j)) * w + Math.min(w - 1, Math.max(0, x + i))]!);
      win.sort((p, q) => p - q);
      out[y * w + x] = win[4]!;
    }
  return out;
}
/** Offset of the flow at pixel (x, y), bilinear between block centres. */
function flowAt(f: BlockFlow, x: number, y: number): [number, number] {
  const fx = clamp((x + 0.5) / f.block - 0.5, 0, f.bw - 1);
  const fy = clamp((y + 0.5) / f.block - 0.5, 0, f.bh - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(f.bw - 1, x0 + 1);
  const y1 = Math.min(f.bh - 1, y0 + 1);
  const ax = fx - x0;
  const ay = fy - y0;
  const s = (a: Float32Array) => (a[y0 * f.bw + x0]! * (1 - ax) + a[y0 * f.bw + x1]! * ax) * (1 - ay) + (a[y1 * f.bw + x0]! * (1 - ax) + a[y1 * f.bw + x1]! * ax) * ay;
  return [s(f.dx), s(f.dy)];
}
function bilinear(a: Float32Array | Uint8Array, w: number, h: number, x: number, y: number): number {
  const cx = clamp(x, 0, w - 1);
  const cy = clamp(y, 0, h - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const ax = cx - x0;
  const ay = cy - y0;
  return (a[y0 * w + x0]! * (1 - ax) + a[y0 * w + x1]! * ax) * (1 - ay) + (a[y1 * w + x0]! * (1 - ax) + a[y1 * w + x1]! * ax) * ay;
}
/** Backward warp: the previous depth carried along the flow onto the current frame (no holes). */
export function warpByFlow(src: Float32Array, w: number, h: number, f: BlockFlow): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [ox, oy] = flowAt(f, x, y);
      out[y * w + x] = bilinear(src, w, h, x + ox, y + oy);
    }
  return out;
}
/** Least-squares scale and shift so that s·cur + t ≈ ref (relative depth is only known up to these two numbers). */
export function alignScaleShift(ref: Float32Array, cur: Float32Array, step = 3): { s: number; t: number } {
  let n = 0, sr = 0, sc = 0, scc = 0, scr = 0;
  for (let i = 0; i < cur.length; i += step) {
    const c = cur[i]!;
    const r = ref[i]!;
    n++;
    sr += r;
    sc += c;
    scc += c * c;
    scr += c * r;
  }
  if (!n) return { s: 1, t: 0 };
  const mc = sc / n;
  const mr = sr / n;
  const v = scc / n - mc * mc;
  if (v < 1e-6) return { s: 1, t: mr - mc };
  const s = clamp((scr / n - mc * mr) / v, 0.25, 4);
  return { s, t: mr - s * mc };
}

export interface TrackerOptions {
  /** Weight of a fresh (aligned) model depth at a key frame, where the picture did not change. */
  alpha?: number;
  /** Luma residual (after motion compensation) above which a pixel is new content: the fresh depth wins. */
  change?: number;
  block?: number;
  radius?: number;
}
/** Depth through time: propagated by the flow between key frames, aligned and fused at key frames, gently renormalised. */
export class DepthTracker {
  private prevLuma: Uint8Array | null = null;
  private state: Float32Array | null = null;
  private lo = 0;
  private hi = 1;
  readonly w: number;
  readonly h: number;
  private o: Required<TrackerOptions>;
  constructor(w: number, h: number, o: TrackerOptions = {}) {
    this.w = w;
    this.h = h;
    this.o = { alpha: o.alpha ?? 0.6, change: o.change ?? 26, block: o.block ?? 8, radius: o.radius ?? 6 };
  }
  /** Next frame: its luma, and the model's depth when this is a key frame (1 = near). Returns the depth to use. */
  push(luma: Uint8Array, fresh?: Float32Array | null): Float32Array {
    const { w, h } = this;
    let out: Float32Array;
    if (!this.state || !this.prevLuma) {
      out = fresh ? Float32Array.from(fresh) : new Float32Array(w * h).fill(0.5);
      const [a, b] = percentiles(out);
      this.lo = a;
      this.hi = b;
    } else {
      const flow = blockFlow(this.prevLuma, luma, w, h, this.o.block, this.o.radius);
      const prop = warpByFlow(this.state, w, h, flow);
      if (fresh) {
        const { s, t } = alignScaleShift(prop, fresh);
        const prevF = Float32Array.from(this.prevLuma);
        const seen = warpByFlow(prevF, w, h, flow);
        out = new Float32Array(w * h);
        for (let i = 0; i < out.length; i++) {
          const a = Math.abs(luma[i]! - seen[i]!) > this.o.change ? 1 : this.o.alpha;
          out[i] = a * (s * fresh[i]! + t) + (1 - a) * prop[i]!;
        }
      } else out = prop;
    }
    // Speckles from the flow (low-texture areas) are removed by a 3×3 median, which keeps the real edges sharp.
    out = median3(out, w, h);
    // Slow renormalisation (bounds follow the 2nd / 98th percentiles with inertia) → no pumping of the range.
    const [p2, p98] = percentiles(out);
    this.lo += (p2 - this.lo) * 0.25;
    this.hi += (p98 - this.hi) * 0.25;
    const span = Math.max(1e-3, this.hi - this.lo);
    for (let i = 0; i < out.length; i++) out[i] = clamp((out[i]! - this.lo) / span);
    this.state = out;
    this.prevLuma = luma;
    return out;
  }
}
function percentiles(a: Float32Array): [number, number] {
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(a.length / 4000));
  for (let i = 0; i < a.length; i += step) sample.push(a[i]!);
  sample.sort((p, q) => p - q);
  return [sample[Math.floor(sample.length * 0.02)] ?? 0, sample[Math.floor(sample.length * 0.98)] ?? 1];
}

/** Every how many frames the depth model runs so that the whole analysis fits the time budget (measured cost). */
export function keyframeStride(frames: number, msPerKey: number, budgetMs: number, maxStride = 12): number {
  if (frames <= 1 || msPerKey <= 0) return 1;
  return Math.max(1, Math.min(maxStride, Math.ceil((frames * msPerKey) / Math.max(1, budgetMs))));
}

export function quantize(d: Float32Array): Uint8Array {
  const out = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = Math.round(clamp(d[i]!) * 255);
  return out;
}

export interface DepthTrack {
  frames: Uint8Array[];
  w: number;
  h: number;
  /** Frames per second of the depth track (may be lower than the output). */
  fps: number;
  source: string;
  keyframes: number;
  stride: number;
  ms: number;
}
/** Depth at time t (s), blended between the two nearest depth frames. */
export function depthAt(track: DepthTrack, t: number, out?: Uint8Array): Uint8Array {
  const n = track.frames.length;
  const r = out ?? new Uint8Array(track.w * track.h);
  if (!n) return r.fill(128);
  const f = clamp(t * track.fps, 0, n - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(n - 1, i0 + 1);
  const k = f - i0;
  const a = track.frames[i0]!;
  const b = track.frames[i1]!;
  if (k < 1e-3 || i0 === i1) {
    r.set(a);
    return r;
  }
  for (let i = 0; i < r.length; i++) r[i] = Math.round(a[i]! * (1 - k) + b[i]! * k);
  return r;
}

/** Size of the depth track for a source of w × h (longest side `long`, multiples of 2). */
export function trackSize(w: number, h: number, long = 288): [number, number] {
  const k = long / Math.max(w, h);
  return [Math.max(2, Math.round((w * k) / 2) * 2), Math.max(2, Math.round((h * k) / 2) * 2)];
}
/** Output size: the source aspect, longest side ≤ quality and ≤ the source (original pixels are never upscaled). */
export function outputSizeFor(w: number, h: number, quality: number): [number, number] {
  const k = Math.min(1, quality / Math.max(w, h));
  return [Math.max(2, Math.round((w * k) / 2) * 2), Math.max(2, Math.round((h * k) / 2) * 2)];
}
