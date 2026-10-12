// Client of vision.worker.ts: the scene picture is read in the background thread; when workers cannot start (old
// browser, blocked blob: URL) the same code runs on the page thread — same result, less fluid.
import VisionWorker from './vision.worker.ts?worker&inline';
import { readScene, type SceneReading } from './bodyDetect';
import { inpaintLocal } from './inpaintLocal';
import type { PuppetCharacter } from '../../../server/jev/studio/puppet';

export interface FreeReading {
  reading: SceneReading;
  /** The picture without the characters (RGBA, reading.w × reading.h), null when MI-GAN could not run. */
  plate: Uint8ClampedArray | null;
}
let worker: Worker | null | undefined;
let seq = 0;
const waiting = new Map<number, (v: FreeReading | null | 'fail') => void>();
function get(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new VisionWorker();
    worker.onmessage = (
      e: MessageEvent<{
        id: number;
        r?: SceneReading | null;
        rgba?: Uint8ClampedArray | null;
        error?: string;
      }>,
    ) => {
      const done = waiting.get(e.data.id);
      if (!done) return;
      waiting.delete(e.data.id);
      if (e.data.error !== undefined) done('fail');
      else done(e.data.r ? { reading: e.data.r, plate: e.data.rgba ?? null } : null);
    };
    worker.onerror = () => {
      worker = null;
      for (const [k, done] of waiting) {
        waiting.delete(k);
        done('fail');
      }
    };
  } catch {
    worker = null;
  }
  return worker;
}
async function onPage(
  bmp: ImageBitmap,
  known: PuppetCharacter[],
  plate: boolean,
): Promise<FreeReading | null> {
  const r = await readScene(bmp, known);
  if (!r) return null;
  const holes = r.masks.filter((m): m is Float32Array => !!m);
  let rgba: Uint8ClampedArray | null = null;
  if (plate && holes.length) {
    const c = new OffscreenCanvas(r.w, r.h);
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0, r.w, r.h);
    rgba = await inpaintLocal(g.getImageData(0, 0, r.w, r.h).data, r.w, r.h, holes);
  }
  return { reading: r, plate: rgba };
}
/** Reads a scene picture for the CORPS ENTIER engine (0 $, in this browser). */
export async function readSceneFree(
  blob: Blob,
  known: PuppetCharacter[],
  plate: boolean,
): Promise<FreeReading | null> {
  const w = typeof Worker !== 'undefined' ? get() : null;
  if (w) {
    const bmp = await createImageBitmap(blob);
    const r = await new Promise<FreeReading | null | 'fail'>((done) => {
      const id = ++seq;
      waiting.set(id, done);
      try {
        w.postMessage({ id, bitmap: bmp, known, plate }, [bmp]);
      } catch {
        waiting.delete(id);
        done('fail');
      }
    });
    if (r !== 'fail') return r;
  }
  const bmp = await createImageBitmap(blob);
  try {
    return await onPage(bmp, known, plate);
  } finally {
    bmp.close();
  }
}
