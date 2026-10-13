/**
 * CLIENT of the local Blender bridge (scripts/blender-bridge.py): the app sends a bpy script or a GLB to the user's own
 * machine, which renders it with Blender (GPU, EEVEE) and returns a verification still and an MP4 — free, no cloud.
 * Fetch is injectable so the client is unit-tested without a server; every call carries a short timeout.
 */
import { useStore } from './store';

export const DEFAULT_BRIDGE = 'http://127.0.0.1:8765';

export interface BridgeHealth {
  ok: boolean;
  url: string;
  mode?: 'blender' | 'bpy';
  blender?: string;
  jobs?: number;
}
export interface RenderRequest {
  script?: string;
  glb?: Uint8Array;
  name?: string;
  seconds?: number;
  fps?: number;
  width?: number;
  height?: number;
  engine?: 'EEVEE' | 'WORKBENCH' | 'CYCLES';
  orbit?: boolean;
  stillOnly?: boolean;
}
export interface RenderReport {
  blender: string;
  engine: string;
  resolution: [number, number];
  fps: number;
  frames: number;
  seconds: number;
  objects: number;
  render_time_s: number;
}
export interface RenderResult {
  id: string;
  report: RenderReport;
  video: Uint8Array | null;
  verify: Uint8Array | null;
}
type FetchFn = typeof fetch;

/** The bridge URL from the settings (empty → default local port). */
export function bridgeUrl(): string {
  const u = useStore.getState().settings.blenderBridgeUrl?.trim();
  return (u || DEFAULT_BRIDGE).replace(/\/+$/, '');
}
function headers(): Record<string, string> {
  const t = useStore.getState().settings.blenderBridgeToken?.trim();
  return t ? { 'X-Bridge-Token': t } : {};
}
const withTimeout = (ms: number) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
};

/** Is a bridge running? null when unreachable (the app then says how to start it). */
export async function bridgeHealth(o: { fetchFn?: FetchFn; url?: string; timeoutMs?: number } = {}): Promise<BridgeHealth | null> {
  const url = o.url ?? bridgeUrl();
  const f = o.fetchFn ?? fetch;
  const t = withTimeout(o.timeoutMs ?? 2500);
  try {
    const r = await f(`${url}/health`, { signal: t.signal, headers: headers() });
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<BridgeHealth>;
    return j.ok ? { ok: true, url, mode: j.mode, blender: j.blender, jobs: j.jobs } : null;
  } catch {
    return null;
  } finally {
    t.done();
  }
}

const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Renders through the bridge and waits for the result (polling), reporting progress as frames land. */
export async function bridgeRender(
  req: RenderRequest,
  o: { fetchFn?: FetchFn; url?: string; onProgress?: (frames: number, total: number, status: string) => void; pollMs?: number; maxWaitMs?: number } = {},
): Promise<RenderResult> {
  const url = o.url ?? bridgeUrl();
  const f = o.fetchFn ?? fetch;
  if (!req.script && !req.glb) throw new Error('script bpy ou GLB requis');
  const body = {
    script: req.script,
    glb_base64: req.glb ? b64(req.glb) : undefined,
    name: req.name ?? 'scene',
    seconds: req.seconds ?? 4,
    fps: req.fps ?? 24,
    width: req.width ?? 720,
    height: req.height ?? 1280,
    engine: req.engine ?? 'EEVEE',
    orbit: Boolean(req.orbit),
    still_only: Boolean(req.stillOnly),
  };
  const start = await f(`${url}/render`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(body) });
  if (!start.ok) throw new Error(`pont Blender : ${start.status} ${(await start.text()).slice(0, 200)}`);
  const { id } = (await start.json()) as { id: string };
  const t0 = Date.now();
  const pollMs = o.pollMs ?? 1500;
  const maxWait = o.maxWaitMs ?? 3_600_000;
  for (;;) {
    const r = await f(`${url}/jobs/${id}`, { headers: headers() });
    if (!r.ok) throw new Error(`pont Blender : tâche ${id} introuvable (${r.status})`);
    const j = (await r.json()) as { status: string; frames: number; total: number; report?: RenderReport; error?: string; log?: string };
    o.onProgress?.(j.frames, j.total, j.status);
    if (j.status === 'done' && j.report) {
      const get = async (part: string) => {
        const x = await f(`${url}/jobs/${id}/${part}`, { headers: headers() });
        return x.ok ? new Uint8Array(await x.arrayBuffer()) : null;
      };
      return { id, report: j.report, video: j.report.frames ? await get('video') : null, verify: await get('verify') };
    }
    if (j.status === 'error') throw new Error(`rendu Blender en erreur : ${j.error ?? ''}\n${(j.log ?? '').slice(-600)}`);
    if (Date.now() - t0 > maxWait) throw new Error('rendu Blender : délai dépassé');
    await new Promise((res) => setTimeout(res, pollMs));
  }
}

/** The one-line help shown when no bridge answers. */
export const BRIDGE_HELP =
  'Aucun pont Blender local ne répond. Sur votre machine : `python3 scripts/blender-bridge.py --blender <chemin de blender>` (ou sans --blender avec `pip install bpy`), puis Réglages → « Pont Blender local » = http://127.0.0.1:8765.';
