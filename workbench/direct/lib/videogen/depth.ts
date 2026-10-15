// PROFONDEUR D'UNE IMAGE — Depth Anything V2 Small (Apache-2.0, onnx-community) exécuté DANS le navigateur par
// transformers.js (Apache-2.0, chargé à la demande depuis jsDelivr ; WebGPU si disponible, sinon WebAssembly). Hors
// ligne ou en cas d'échec : profondeur heuristique (server/jev/videogen/imageMotion.ts), annoncée comme telle.
import { heuristicDepth } from '../../../server/jev/videogen/imageMotion';

export interface DepthMap {
  data: Float32Array; // 1 = near, 0 = far
  w: number;
  h: number;
  source: 'Depth Anything V2 (local)' | 'heuristique' | 'carte du projet (Depth Anything V2)';
  ms: number;
}
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/+esm';
const MODEL = 'onnx-community/depth-anything-v2-small';
type DepthPipe = (img: unknown) => Promise<{ depth: { data: Uint8Array | Uint8ClampedArray; width: number; height: number } }>;
let pipe: Promise<DepthPipe> | null = null;

async function loadPipe(onStatus?: (s: string) => void): Promise<DepthPipe> {
  pipe ??= (async () => {
    onStatus?.('chargement de Depth Anything V2 (une seule fois, ≈ 25 Mo, mis en cache)');
    const tf = (await import(/* @vite-ignore */ TRANSFORMERS)) as { pipeline: (task: string, model: string, o: Record<string, unknown>) => Promise<DepthPipe> };
    const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
    try {
      return await tf.pipeline('depth-estimation', MODEL, { device: webgpu ? 'webgpu' : 'wasm', dtype: webgpu ? 'fp16' : 'q8' });
    } catch {
      return await tf.pipeline('depth-estimation', MODEL, { device: 'wasm', dtype: 'q8' });
    }
  })();
  try {
    return await pipe;
  } catch (e) {
    pipe = null;
    throw e;
  }
}

let modelDown = false;
async function runModel(canvas: HTMLCanvasElement, o: { onStatus?: (s: string) => void; timeoutMs?: number }): Promise<{ data: Float32Array; w: number; h: number; inferMs: number }> {
  const p = await Promise.race([loadPipe(o.onStatus), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('délai')), o.timeoutMs ?? 120_000))]);
  const t1 = performance.now();
  const url = canvas.toDataURL('image/jpeg', 0.92);
  const r = await p(url);
  const d = r.depth;
  const out = new Float32Array(d.width * d.height);
  let mn = 255, mx = 0;
  for (let i = 0; i < out.length; i++) {
    const v = d.data[i]!;
    mn = Math.min(mn, v);
    mx = Math.max(mx, v);
  }
  for (let i = 0; i < out.length; i++) out[i] = (d.data[i]! - mn) / Math.max(1, mx - mn);
  return { data: out, w: d.width, h: d.height, inferMs: Math.round(performance.now() - t1) };
}

/** Depth of a picture (canvas), measured by the model when possible, else estimated. */
export async function estimateDepth(canvas: HTMLCanvasElement, o: { onStatus?: (s: string) => void; timeoutMs?: number; allowModel?: boolean } = {}): Promise<DepthMap> {
  const t0 = performance.now();
  if (o.allowModel !== false) {
    try {
      o.onStatus?.('mesure de la profondeur');
      const r = await runModel(canvas, o);
      return { data: r.data, w: r.w, h: r.h, source: 'Depth Anything V2 (local)', ms: Math.round(performance.now() - t0) };
    } catch (e) {
      o.onStatus?.(`modèle de profondeur indisponible (${(e as Error).message}) : profondeur estimée`);
    }
  }
  const w = 384;
  const h = Math.max(2, Math.round((canvas.height / canvas.width) * w));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const g = small.getContext('2d')!;
  g.drawImage(canvas, 0, 0, w, h);
  return { data: heuristicDepth(g.getImageData(0, 0, w, h).data, w, h), w, h, source: 'heuristique', ms: Math.round(performance.now() - t0) };
}

/** Depth of one video frame at w × h (1 = near): the model on `model` (a larger picture of the same frame) when it is
 *  reachable — after one failure it is not retried for the rest of the video — else the heuristic on `small`.
 *  `ms` is the inference time alone (the one-time download and start of the model is not counted). */
export async function frameDepth(model: HTMLCanvasElement, small: HTMLCanvasElement, w: number, h: number, o: { allowModel?: boolean; onStatus?: (s: string) => void } = {}): Promise<{ data: Float32Array; source: DepthMap['source']; ms: number }> {
  const t0 = performance.now();
  if (o.allowModel !== false && !modelDown) {
    try {
      const r = await runModel(model, { onStatus: o.onStatus, timeoutMs: 90_000 });
      return { data: resample(r.data, r.w, r.h, w, h), source: 'Depth Anything V2 (local)', ms: r.inferMs };
    } catch (e) {
      modelDown = true;
      o.onStatus?.(`modèle de profondeur indisponible (${(e as Error).message}) : profondeur estimée`);
    }
  }
  const g = small.getContext('2d', { willReadFrequently: true })!;
  return { data: heuristicDepth(g.getImageData(0, 0, w, h).data, w, h), source: 'heuristique', ms: Math.round(performance.now() - t0) };
}
function resample(a: Float32Array, sw: number, sh: number, w: number, h: number): Float32Array {
  if (sw === w && sh === h) return a;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, ((y + 0.5) * sh) / h - 0.5);
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const ay = Math.max(0, fy - y0);
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, ((x + 0.5) * sw) / w - 0.5);
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const ax = Math.max(0, fx - x0);
      out[y * w + x] = (a[y0 * sw + x0]! * (1 - ax) + a[y0 * sw + x1]! * ax) * (1 - ay) + (a[y1 * sw + x0]! * (1 - ax) + a[y1 * sw + x1]! * ax) * ay;
    }
  }
  return out;
}
