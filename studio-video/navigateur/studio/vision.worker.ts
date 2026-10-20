// BACKGROUND THREAD of the free full-body engine: reading a scene (people, skeletons, cut-outs — MediaPipe) and
// rebuilding the background behind the characters (MI-GAN) take seconds of computation; here the page keeps rendering.
// A classic worker (MediaPipe loads its WebAssembly with importScripts).
import { readScene } from './bodyDetect';
import { inpaintLocal } from './inpaintLocal';
import type { PuppetCharacter } from '../../coeur/studio/puppet';

self.onmessage = async (
  e: MessageEvent<{ id: number; bitmap: ImageBitmap; known: PuppetCharacter[]; plate: boolean }>,
) => {
  const { id, bitmap, known, plate } = e.data;
  const post = (m: unknown, t: Transferable[] = []) => (self as unknown as Worker).postMessage(m, t);
  try {
    const r = await readScene(bitmap, known);
    if (!r) return post({ id, r: null });
    let rgba: Uint8ClampedArray | null = null;
    const holes = r.masks.filter((m): m is Float32Array => !!m);
    if (plate && holes.length) {
      const c = new OffscreenCanvas(r.w, r.h);
      const g = c.getContext('2d')!;
      g.drawImage(bitmap, 0, 0, r.w, r.h);
      rgba = await inpaintLocal(g.getImageData(0, 0, r.w, r.h).data, r.w, r.h, holes);
    }
    bitmap.close();
    const t: Transferable[] = r.masks
      .filter((m): m is Float32Array => !!m)
      .map((m) => m.buffer as ArrayBuffer);
    if (rgba) t.push(rgba.buffer as ArrayBuffer);
    post({ id, r, rgba }, t);
  } catch (err) {
    post({ id, error: (err as Error).message ?? String(err) });
  }
};
