// DÉCOR SANS LES PERSONNAGES, GRATUIT ET LOCAL — when a character walks, jumps or falls, the place it leaves must show
// the background. MI-GAN (Picsart AI Research, ICCV 2023, MIT licence) fills that hole in the browser with
// onnxruntime-web (WebAssembly: any PC, no graphics card needed): the official pre-converted pipeline takes the picture
// and a mask (255 = keep, 0 = fill), crops around the hole, inpaints at 512 px and blends back.
// One character at a time (smaller holes inpaint better, as the authors advise). Any failure → null (the caller keeps
// its classical push-pull fill).
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const MIGAN = 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';

interface Ort {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: string, data: Uint8Array, dims: number[]) => unknown;
  InferenceSession: { create(url: string, o: unknown): Promise<Session> };
}
interface Session {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Uint8Array; dims: number[] }>>;
}
let loading: Promise<{ ort: Ort; s: Session } | null> | null = null;
function migan(): Promise<{ ort: Ort; s: Session } | null> {
  loading ??= (async () => {
    try {
      const ort = (await import(/* @vite-ignore */ `${ORT}ort.wasm.min.mjs`)) as unknown as Ort;
      ort.env.wasm.wasmPaths = ORT;
      // One thread: works without cross-origin isolation (no SharedArrayBuffer needed).
      ort.env.wasm.numThreads = 1;
      const s = await ort.InferenceSession.create(MIGAN, { executionProviders: ['wasm'] });
      return { ort, s };
    } catch {
      loading = null;
      return null;
    }
  })();
  return loading;
}

/** Grows a hole by r pixels (the soft edge of a cut-out must be filled too, or a halo stays). */
export function growHole(m: Float32Array, w: number, h: number, r: number, at = 0.08): Uint8Array {
  const out = new Uint8Array(w * h);
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let d = -r; d <= r && !on; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < w && m[y * w + xx]! > at) on = 1;
      }
      tmp[y * w + x] = on;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let d = -r; d <= r && !on; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < h && tmp[yy * w + x]) on = 1;
      }
      out[y * w + x] = on;
    }
  return out;
}

/**
 * The picture (RGBA) with each hole filled by MI-GAN, holes one after the other. Returns null when the model cannot run.
 */
export async function inpaintLocal(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  holes: Float32Array[],
): Promise<Uint8ClampedArray | null> {
  const m = await migan();
  if (!m) return null;
  try {
    const n = w * h;
    const planar = new Uint8Array(3 * n);
    for (let i = 0; i < n; i++) {
      planar[i] = rgba[i * 4]!;
      planar[n + i] = rgba[i * 4 + 1]!;
      planar[2 * n + i] = rgba[i * 4 + 2]!;
    }
    for (const hole of holes) {
      const grown = growHole(hole, w, h, Math.max(3, Math.round(w / 160)));
      const mask = new Uint8Array(n);
      let any = false;
      for (let i = 0; i < n; i++) {
        mask[i] = grown[i] ? 0 : 255;
        if (grown[i]) any = true;
      }
      if (!any) continue;
      const feeds: Record<string, unknown> = {
        [m.s.inputNames[0]!]: new m.ort.Tensor('uint8', planar, [1, 3, h, w]),
        [m.s.inputNames[1]!]: new m.ort.Tensor('uint8', mask, [1, 1, h, w]),
      };
      const out = (await m.s.run(feeds))[m.s.outputNames[0]!]!;
      if (out.data.length !== 3 * n) return null;
      planar.set(out.data);
    }
    const res = new Uint8ClampedArray(4 * n);
    for (let i = 0; i < n; i++) {
      res[i * 4] = planar[i]!;
      res[i * 4 + 1] = planar[n + i]!;
      res[i * 4 + 2] = planar[2 * n + i]!;
      res[i * 4 + 3] = 255;
    }
    return res;
  } catch {
    return null;
  }
}
