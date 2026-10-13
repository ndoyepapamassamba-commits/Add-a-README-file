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
export async function bridgeHealth(
  o: { fetchFn?: FetchFn; url?: string; timeoutMs?: number } = {},
): Promise<BridgeHealth | null> {
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
  o: {
    fetchFn?: FetchFn;
    url?: string;
    onProgress?: (frames: number, total: number, status: string) => void;
    pollMs?: number;
    maxWaitMs?: number;
  } = {},
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
  const start = await f(`${url}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify(body),
  });
  if (!start.ok) throw new Error(`pont Blender : ${start.status} ${(await start.text()).slice(0, 200)}`);
  const { id } = (await start.json()) as { id: string };
  const t0 = Date.now();
  const pollMs = o.pollMs ?? 1500;
  const maxWait = o.maxWaitMs ?? 3_600_000;
  for (;;) {
    const r = await f(`${url}/jobs/${id}`, { headers: headers() });
    if (!r.ok) throw new Error(`pont Blender : tâche ${id} introuvable (${r.status})`);
    const j = (await r.json()) as {
      status: string;
      frames: number;
      total: number;
      report?: RenderReport;
      error?: string;
      log?: string;
    };
    o.onProgress?.(j.frames, j.total, j.status);
    if (j.status === 'done' && j.report) {
      const get = async (part: string) => {
        const x = await f(`${url}/jobs/${id}/${part}`, { headers: headers() });
        return x.ok ? new Uint8Array(await x.arrayBuffer()) : null;
      };
      return {
        id,
        report: j.report,
        video: j.report.frames ? await get('video') : null,
        verify: await get('verify'),
      };
    }
    if (j.status === 'error')
      throw new Error(`rendu Blender en erreur : ${j.error ?? ''}\n${(j.log ?? '').slice(-600)}`);
    if (Date.now() - t0 > maxWait) throw new Error('rendu Blender : délai dépassé');
    await new Promise((res) => setTimeout(res, pollMs));
  }
}

export interface FilmGate {
  passed: boolean;
  failed: string[];
}
/** The mandatory 3D conformity check of the scene (scripts/blenderfilm/preflight.py), run before the render. */
export interface FilmPreflight {
  /** Share of the quality objectives reached (%), and whether the scene was right at the first generation. */
  taux_objectifs?: number;
  conforme_des_la_generation?: boolean;
  /** Ten measured dimensions (0–100, null = not applicable). */
  dimensions?: Record<string, number | null>;
  score: number;
  verdict: string;
  passed: boolean;
  issues: number;
  fixes: number;
  critiques: string[];
  categories: Record<string, { ok: boolean; n: number }>;
}
export interface FilmReport {
  frames_expected: number;
  frames_encoded: number;
  video_s: number;
  audio_s: number;
  av_gap_ms: number;
  loudness_lufs?: number | null;
  shots: number;
  gate?: FilmGate;
  preflight?: FilmPreflight;
}
export interface FilmResult {
  id: string;
  report: FilmReport;
  video: Uint8Array | null;
  cover: Uint8Array | null;
  srt: string | null;
  post: string | null;
  /** HTML report of the 3D conformity check. */
  preflightHtml: string | null;
}
/**
 * A WHOLE FILM shot by Blender on the user's machine (scripts/blenderfilm/film.py through the bridge): voices, living
 * set, acting, cameras, grade, sound, quality gate — then the creator's kit (cover, captions, post text) is fetched.
 */
export async function bridgeFilm(
  story: Record<string, unknown>,
  o: {
    fetchFn?: FetchFn;
    url?: string;
    onProgress?: (frames: number, total: number, status: string) => void;
    pollMs?: number;
    maxWaitMs?: number;
    samples?: number;
  } = {},
): Promise<FilmResult> {
  const url = o.url ?? bridgeUrl();
  const f = o.fetchFn ?? fetch;
  const start = await f(`${url}/film`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify({ story, samples: o.samples ?? 10 }),
  });
  if (!start.ok) throw new Error(`pont Blender : ${start.status} ${(await start.text()).slice(0, 200)}`);
  const { id } = (await start.json()) as { id: string };
  const t0 = Date.now();
  for (;;) {
    const r = await f(`${url}/jobs/${id}`, { headers: headers() });
    if (!r.ok) throw new Error(`pont Blender : film ${id} introuvable (${r.status})`);
    const j = (await r.json()) as {
      status: string;
      frames: number;
      total: number;
      report?: FilmReport;
      error?: string;
      log?: string;
    };
    o.onProgress?.(j.frames, j.total, j.status);
    if (j.status === 'done' && j.report) {
      const bin = async (part: string) => {
        const x = await f(`${url}/jobs/${id}/${part}`, { headers: headers() });
        return x.ok ? new Uint8Array(await x.arrayBuffer()) : null;
      };
      const txt = async (part: string) => {
        const x = await f(`${url}/jobs/${id}/${part}`, { headers: headers() });
        return x.ok ? await x.text() : null;
      };
      return {
        id,
        report: j.report,
        video: await bin('video'),
        cover: await bin('cover'),
        srt: await txt('srt'),
        post: await txt('post'),
        preflightHtml: await txt('preflight'),
      };
    }
    if (j.status === 'error')
      throw new Error(`film Blender en erreur : ${j.error ?? ''}\n${(j.log ?? '').slice(-600)}`);
    if (Date.now() - t0 > (o.maxWaitMs ?? 6 * 3_600_000)) throw new Error('film Blender : délai dépassé');
    await new Promise((res) => setTimeout(res, o.pollMs ?? 3000));
  }
}

/** The one-line help shown when no bridge answers. */
export const BRIDGE_HELP =
  'Aucun pont Blender local ne répond. Sur votre machine : `python3 scripts/blender-bridge.py --blender <chemin de blender>` (ou sans --blender avec `pip install bpy`), puis Réglages → « Pont Blender local » = http://127.0.0.1:8765.';
