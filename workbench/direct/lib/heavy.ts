// Client of the background thread (heavy.worker.ts). Falls back to the page thread when workers are unavailable
// (old browser, blocked blob: URL): the result is the same, only the fluidity differs.
import HeavyWorker from './heavy.worker.ts?worker&inline';
import { houseXlsx } from '../../server/services/houseStyle';
import { activeDesign } from '../../server/services/houseDesign';
import { addLiveDashboard } from '../../server/services/liveDash';
import { restyleWorkbook } from '../../server/services/officeRestyle';
import { maisonBand } from '../../server/services/maisonBand';
import { designQA } from '../../server/services/designQA';
import { addImageSheet } from '../../server/services/officeLogo';

type Fns = { houseXlsx: typeof houseXlsx; addLiveDashboard: typeof addLiveDashboard; restyleWorkbook: typeof restyleWorkbook; maisonBand: typeof maisonBand; designQA: typeof designQA; addImageSheet: typeof addImageSheet };
const LOCAL: Fns = { houseXlsx, addLiveDashboard, restyleWorkbook, maisonBand, designQA, addImageSheet };

let worker: Worker | null | undefined;
let seq = 0;
const waiting = new Map<number, { ok: (v: unknown) => void; ko: (e: Error) => void }>();
function get(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new HeavyWorker();
    worker.onmessage = (e: MessageEvent<{ id: number; r?: unknown; error?: string }>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.error !== undefined) w.ko(new Error(e.data.error));
      else w.ok(e.data.r);
    };
    worker.onerror = () => {
      // A worker that cannot start: every pending call and the next ones run on the page thread.
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}
/** Runs a heavy pure function in the background (the arguments are copied, the result's bytes transferred). */
export function heavy<K extends keyof Fns>(fn: K, ...args: Parameters<Fns[K]>): Promise<ReturnType<Fns[K]>> {
  const w = typeof Worker !== 'undefined' ? get() : null;
  if (!w) return Promise.resolve((LOCAL[fn] as (...a: unknown[]) => ReturnType<Fns[K]>)(...args));
  const id = ++seq;
  return new Promise<ReturnType<Fns[K]>>((ok, ko) => {
    waiting.set(id, { ok: ok as (v: unknown) => void, ko });
    try {
      w.postMessage({ id, fn, args, theme: activeDesign() });
    } catch {
      // arguments that cannot be copied (should not happen: pure data) → on the page thread
      waiting.delete(id);
      ok((LOCAL[fn] as (...a: unknown[]) => ReturnType<Fns[K]>)(...args));
    }
  });
}
