// OpenRouter media calls (discovery, images, speech, video jobs, music probe). The API key is read ONLY here, at the
// instant the Authorization header is built; the header is never stored, logged or returned.
import { getKey } from '../llm';
import { StudioError, classifyError, withRetry } from '../../../server/jev/studio/errors';
import { buildRegistry, type MediaModel, type Registry } from '../../../server/jev/studio/capabilities';
import type { ImagePrice } from '../../../server/jev/studio/capabilities';
import { redactSecrets } from '../../../server/jev/studio/secrets';

export const BASE = 'https://openrouter.ai/api/v1';
const authHeader = (): Record<string, string> => ({ Authorization: `Bearer ${getKey()}` });
export const hasKey = () => Boolean(getKey());

async function http(
  url: string,
  init: RequestInit & { timeoutMs?: number; auth?: boolean } = {},
): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), init.timeoutMs ?? 60_000);
  try {
    const { auth, timeoutMs: _t, ...rest } = init;
    void _t;
    const res = await fetch(url, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? authHeader() : {}),
        ...(rest.headers as Record<string, string>),
      },
      signal: ctl.signal,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = (await res.clone().json()) as { error?: { message?: string } | string };
        msg = typeof j.error === 'string' ? j.error : (j.error?.message ?? msg);
      } catch {
        /* not JSON */
      }
      const c = classifyError({ status: res.status, message: redactSecrets(msg) });
      throw new StudioError(c.cls, c.message, res.status, c.transient);
    }
    return res;
  } catch (e) {
    if (e instanceof StudioError) throw e;
    const c = classifyError({ message: (e as Error).message, name: (e as Error).name });
    throw new StudioError(c.cls, c.message, 0, c.transient);
  } finally {
    clearTimeout(t);
  }
}

// ───────── discovery (public endpoints, no key) ─────────
const ENDPOINTS: [string, string][] = [
  ['images', '/images/models'],
  ['videos', '/videos/models'],
  ['speech', '/models?output_modalities=speech'],
  ['audio', '/models?output_modalities=audio'],
];
export async function discover(prev: Registry | null): Promise<Registry> {
  const out: Record<string, unknown> = {};
  const sources: Registry['sources'] = [];
  await Promise.all(
    ENDPOINTS.map(async ([k, p]) => {
      try {
        const { value } = await withRetry(
          () => http(`${BASE}${p}`, { timeoutMs: 30_000 }).then((r) => r.json()),
          { retries: 1, baseMs: 600 },
        );
        out[k] = value;
        const d = (value as { data?: unknown[] }).data;
        sources.push({ endpoint: k, ok: true, count: Array.isArray(d) ? d.length : 0 });
      } catch (e) {
        sources.push({ endpoint: k, ok: false, count: 0, error: (e as Error).message });
      }
    }),
  );
  return buildRegistry({ ...out, sources }, prev);
}
/** Prices of an image model live on its endpoints sub-resource: loaded lazily, for the candidates only. */
export async function loadImagePrices(m: MediaModel): Promise<MediaModel> {
  if (m.pricing.imageLoaded) return m;
  try {
    const j = (await (
      await http(`${BASE}/images/models/${m.id}/endpoints`, { timeoutMs: 20_000 })
    ).json()) as {
      endpoints?: { pricing?: { billable: string; unit: string; cost_usd: number; variant?: string }[] }[];
    };
    const prices: ImagePrice[] = (j.endpoints ?? []).flatMap((e) =>
      (e.pricing ?? []).map((p) => ({
        billable: p.billable,
        unit: p.unit,
        usd: p.cost_usd,
        variant: p.variant,
      })),
    );
    return { ...m, pricing: { ...m.pricing, image: prices, imageLoaded: true } };
  } catch {
    return m;
  }
}

// ───────── images ─────────
export interface ImageCall {
  model: string;
  prompt: string;
  aspect_ratio?: string;
  resolution?: string;
  n?: number;
  /** Data URLs (base64) of reference images. */
  references?: string[];
  seed?: number;
}
export interface ImageResult {
  images: { b64: string; mime: string }[];
  cost: number | null;
  latencyMs: number;
  raw: { seed?: number };
}
export async function generateImage(c: ImageCall): Promise<ImageResult> {
  const t0 = performance.now();
  const body: Record<string, unknown> = { model: c.model, prompt: c.prompt };
  if (c.aspect_ratio) body.aspect_ratio = c.aspect_ratio;
  if (c.resolution) body.resolution = c.resolution;
  if (c.n) body.n = c.n;
  if (c.seed !== undefined) body.seed = c.seed;
  if (c.references?.length)
    body.input_references = c.references.map((u) => ({ type: 'image_url', image_url: { url: u } }));
  const res = await http(`${BASE}/images`, {
    method: 'POST',
    body: JSON.stringify(body),
    auth: true,
    timeoutMs: 180_000,
  });
  const j = (await res.json()) as {
    data?: { b64_json?: string; url?: string }[];
    usage?: { cost?: number };
    seed?: number;
  };
  const images: ImageResult['images'] = [];
  for (const d of j.data ?? []) {
    if (d.b64_json) images.push({ b64: d.b64_json, mime: 'image/png' });
    else if (d.url) {
      const r = await http(d.url, { timeoutMs: 60_000 });
      const b = await r.blob();
      images.push({
        b64: await new Promise<string>((ok) => {
          const fr = new FileReader();
          fr.onload = () => ok(String(fr.result).split(',')[1] ?? '');
          fr.readAsDataURL(b);
        }),
        mime: b.type || 'image/png',
      });
    }
  }
  if (!images.length) throw new StudioError('UNKNOWN', 'réponse sans image', 200, false, true);
  return {
    images,
    cost: typeof j.usage?.cost === 'number' ? j.usage.cost : null,
    latencyMs: performance.now() - t0,
    raw: { seed: j.seed },
  };
}

// ───────── speech ─────────
export interface SpeechCall {
  model: string;
  input: string;
  voice?: string;
  speed?: number;
  format?: 'mp3' | 'pcm';
}
/** The response is a stream of audio bytes, not JSON. Cost is not returned for this endpoint: it stays "non mesuré". */
export async function speak(c: SpeechCall): Promise<{ blob: Blob; latencyMs: number }> {
  const t0 = performance.now();
  const body: Record<string, unknown> = {
    model: c.model,
    input: c.input,
    response_format: c.format ?? 'mp3',
  };
  if (c.voice) body.voice = c.voice;
  if (c.speed) body.speed = c.speed;
  const res = await http(`${BASE}/audio/speech`, {
    method: 'POST',
    body: JSON.stringify(body),
    auth: true,
    timeoutMs: 120_000,
  });
  const blob = await res.blob();
  if (!blob.size) throw new StudioError('UNKNOWN', 'audio vide', 200, false, true);
  return {
    blob: blob.type ? blob : new Blob([blob], { type: c.format === 'pcm' ? 'audio/pcm' : 'audio/mpeg' }),
    latencyMs: performance.now() - t0,
  };
}

// ───────── video jobs ─────────
export interface VideoCall {
  model: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  aspect_ratio?: string;
  size?: string;
  frame_images?: { url: string; frame_type: 'first_frame' | 'last_frame' }[];
  generate_audio?: boolean;
  seed?: number;
}
export async function submitVideo(c: VideoCall): Promise<{ id: string; pollingUrl: string }> {
  const body: Record<string, unknown> = { model: c.model, prompt: c.prompt };
  for (const k of ['duration', 'resolution', 'aspect_ratio', 'size', 'generate_audio', 'seed'] as const)
    if (c[k] !== undefined) body[k] = c[k];
  if (c.frame_images?.length)
    body.frame_images = c.frame_images.map((f) => ({
      type: 'image_url',
      image_url: { url: f.url },
      frame_type: f.frame_type,
    }));
  const j = (await (
    await http(`${BASE}/videos`, {
      method: 'POST',
      body: JSON.stringify(body),
      auth: true,
      timeoutMs: 60_000,
    })
  ).json()) as {
    id?: string;
    polling_url?: string;
  };
  if (!j.id) throw new StudioError('UNKNOWN', 'soumission sans identifiant', 200, false, true);
  return { id: j.id, pollingUrl: j.polling_url ?? `${BASE}/videos/${j.id}` };
}
export interface VideoStatus {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  urls: string[];
  cost: number | null;
  error?: string;
}
export async function pollVideo(pollingUrl: string): Promise<VideoStatus> {
  const j = (await (await http(pollingUrl, { auth: true, timeoutMs: 30_000 })).json()) as {
    status?: string;
    unsigned_urls?: string[];
    usage?: { cost?: number };
    error?: string | { message?: string };
  };
  const st =
    (['pending', 'in_progress', 'completed', 'failed'] as const).find((s) => s === j.status) ?? 'in_progress';
  return {
    status: st,
    urls: j.unsigned_urls ?? [],
    cost: typeof j.usage?.cost === 'number' ? j.usage.cost : null,
    error: typeof j.error === 'string' ? j.error : j.error?.message,
  };
}
export async function downloadVideo(id: string, url?: string): Promise<Blob> {
  const res = await http(url ?? `${BASE}/videos/${id}/content?index=0`, { auth: true, timeoutMs: 180_000 });
  return res.blob();
}
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ───────── music probe (output format undocumented) ─────────
/** One explicit, owner-authorised test call. Returns what the model actually answered, so the format can be learnt. */
export async function probeMusic(model: string): Promise<{ ok: boolean; shape: string; audio?: Blob }> {
  const j = (await (
    await http(`${BASE}/chat/completions`, {
      method: 'POST',
      auth: true,
      timeoutMs: 120_000,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'A 6-second balafon loop, cheerful, instrumental.' }],
        modalities: ['text', 'audio'],
      }),
    })
  ).json()) as {
    choices?: { message?: { content?: unknown; audio?: { data?: string; format?: string } } }[];
  };
  const msg = j.choices?.[0]?.message;
  if (msg?.audio?.data) {
    const bin = atob(msg.audio.data);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return {
      ok: true,
      shape: `message.audio (${msg.audio.format ?? '?'})`,
      audio: new Blob([u], { type: `audio/${msg.audio.format ?? 'mpeg'}` }),
    };
  }
  return { ok: false, shape: JSON.stringify(Object.keys(msg ?? {})) };
}
