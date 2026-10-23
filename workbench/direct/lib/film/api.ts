// OpenRouter calls of the film circuit, straight from the browser with the key saved on the Workbench's home screen
// (CORS open on /api/v1/videos, checked on 23/10/2026: Access-Control-Allow-Origin: *). Request and response shapes
// follow @openrouter/sdk 1.5.6 (models/imagegenerationrequest.js, models/frameimage.js,
// models/videogenerationresponse.d.ts: statuses pending, in_progress, completed, failed, cancelled, expired).
import { getKey } from '../llm';
import { toVideoModel, type VideoModel } from './circuit';

export const OR_BASE = 'https://openrouter.ai/api/v1';

export class FilmApiError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
  ) {
    super(message);
  }
}

function headers(): Record<string, string> {
  const key = getKey();
  if (!key)
    throw new FilmApiError(
      'Clé OpenRouter absente : enregistrez-la sur l’écran d’accueil de la Workbench.',
      401,
    );
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://openrouter-workbench.local',
    'X-Title': 'MASSAMBA Workbench - Circuit video',
  };
}

function explain(status: number, msg: string): string {
  if (status === 401) return 'Clé OpenRouter refusée (401) : vérifiez-la sur l’écran d’accueil.';
  if (status === 402) return 'Crédit OpenRouter insuffisant (402) : rechargez votre compte OpenRouter.';
  if (status === 429) return 'OpenRouter demande de patienter (429, trop de demandes).';
  return `OpenRouter ${status} : ${msg}`.slice(0, 400);
}

async function call(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(url, { ...init, signal });
  if (res.ok) return res;
  let msg: string;
  try {
    const j = (await res.json()) as { error?: { message?: string } | string };
    msg = typeof j.error === 'string' ? j.error : (j.error?.message ?? JSON.stringify(j));
  } catch {
    msg = res.statusText;
  }
  throw new FilmApiError(explain(res.status, msg), res.status);
}

const costOf = (j: { usage?: { cost?: unknown } } | null | undefined) =>
  typeof j?.usage?.cost === 'number' && Number.isFinite(j.usage.cost) ? j.usage.cost : null;

/** Live list of video models (public endpoint, no key needed). */
export async function listVideoModels(signal?: AbortSignal): Promise<VideoModel[]> {
  const res = await call(`${OR_BASE}/videos/models`, { method: 'GET' }, signal);
  const j = (await res.json()) as { data?: Parameters<typeof toVideoModel>[0][] };
  return (j.data ?? []).map(toVideoModel).filter((m) => m.id);
}

/** Script written by a vision model that LOOKS at the scene image; the first model that answers is kept. */
export async function writeScript(
  models: string[],
  system: string,
  user: string,
  imageDataUrl: string | null,
  signal?: AbortSignal,
): Promise<{ text: string; model: string; cost: number | null }> {
  let last: unknown = new FilmApiError('Aucun modèle de texte disponible.');
  for (const model of models) {
    try {
      const content: unknown[] = [{ type: 'text', text: user }];
      if (imageDataUrl) content.push({ type: 'image_url', image_url: { url: imageDataUrl } });
      const res = await call(
        `${OR_BASE}/chat/completions`,
        {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            model,
            temperature: 0.8,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content },
            ],
          }),
        },
        signal,
      );
      const j = (await res.json()) as {
        choices?: { message?: { content?: unknown } }[];
        usage?: { cost?: unknown };
      };
      const text = j.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) throw new FilmApiError(`${model} : réponse vide.`);
      return { text, model, cost: costOf(j) };
    } catch (e) {
      if (signal?.aborted) throw e;
      if (e instanceof FilmApiError && (e.status === 401 || e.status === 402)) throw e;
      last = e;
    }
  }
  throw last;
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('lecture impossible'));
    r.readAsDataURL(b);
  });

/** Plan image: the scene image (and any other reference) guides an image model, output in the film's ratio. */
export async function makeImage(
  o: { model: string; prompt: string; references: string[]; aspect: string },
  signal?: AbortSignal,
): Promise<{ dataUrl: string; cost: number | null }> {
  const res = await call(
    `${OR_BASE}/images`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        model: o.model,
        prompt: o.prompt,
        aspect_ratio: o.aspect,
        resolution: '1K',
        input_references: o.references.map((url) => ({ type: 'image_url', image_url: { url } })),
      }),
    },
    signal,
  );
  const j = (await res.json()) as {
    data?: { b64_json?: string; url?: string; media_type?: string }[];
    usage?: { cost?: unknown };
  };
  const d = j.data?.[0];
  if (d?.b64_json)
    return { dataUrl: `data:${d.media_type || 'image/png'};base64,${d.b64_json}`, cost: costOf(j) };
  if (d?.url)
    return { dataUrl: await blobToDataUrl(await (await fetch(d.url, { signal })).blob()), cost: costOf(j) };
  throw new FilmApiError('Le modèle d’image n’a renvoyé aucune image.');
}

export interface ClipRequest {
  model: string;
  prompt: string;
  duration: number;
  resolution?: string;
  aspect?: string;
  firstFrame?: string;
  /** undefined: let the model decide (Grok Imagine speaks by default). */
  audio?: boolean;
}
export async function submitClip(c: ClipRequest, signal?: AbortSignal): Promise<{ id: string }> {
  const body: Record<string, unknown> = { model: c.model, prompt: c.prompt, duration: c.duration };
  if (c.resolution) body.resolution = c.resolution;
  if (c.aspect) body.aspect_ratio = c.aspect;
  if (c.audio !== undefined) body.generate_audio = c.audio;
  if (c.firstFrame)
    body.frame_images = [{ type: 'image_url', image_url: { url: c.firstFrame }, frame_type: 'first_frame' }];
  const res = await call(
    `${OR_BASE}/videos`,
    { method: 'POST', headers: headers(), body: JSON.stringify(body) },
    signal,
  );
  const j = (await res.json()) as { id?: string };
  if (!j.id) throw new FilmApiError('OpenRouter n’a pas renvoyé d’identifiant de tâche.');
  return { id: j.id };
}

export type ClipStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired';
export async function pollClip(
  id: string,
  signal?: AbortSignal,
): Promise<{ status: ClipStatus; cost: number | null; error?: string }> {
  const res = await call(
    `${OR_BASE}/videos/${encodeURIComponent(id)}`,
    { method: 'GET', headers: headers() },
    signal,
  );
  const j = (await res.json()) as {
    status?: string;
    usage?: { cost?: unknown };
    error?: string | { message?: string };
  };
  const all: ClipStatus[] = ['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'expired'];
  return {
    status: all.find((s) => s === j.status) ?? 'in_progress',
    cost: costOf(j),
    error: typeof j.error === 'string' ? j.error : j.error?.message,
  };
}

export async function downloadClip(id: string, signal?: AbortSignal): Promise<Blob> {
  const res = await call(
    `${OR_BASE}/videos/${encodeURIComponent(id)}/content?index=0`,
    { method: 'GET', headers: headers() },
    signal,
  );
  return res.blob();
}
