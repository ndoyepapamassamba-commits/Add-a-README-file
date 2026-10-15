// ANIMATION VIDÉO À (PRESQUE) 0 $ — two engines found and checked for this app (calls straight from the browser, CORS
// allowed), both turning the scene's image into a short MP4 clip:
//  - Pollinations « alibaba/wan-2.2-fast » (image → vidéo) : 0,01 pollen / s (≈ 0,05 $ for a 5 s shot) with the
//    user's own Pollinations key (kept in this browser, never in a prompt or a file);
//  - Hugging Face Space « Wan 2.2 14B Fast » (ZeroGPU): free within the GPU quota of the user's Hugging Face account
//    (optional token). Anonymous calls from servers are refused by ZeroGPU: it is labelled « selon votre quota ».
import { useStore } from '../store';

export const POLLINATIONS_VIDEO = 'pollinations:alibaba/wan-2.2-fast';
export const HF_VIDEO = 'hf:wan-2.2-14b-fast';
/**
 * Image → video models reachable through Pollinations (start frame = the scene image), price per second (pollen ≈ USD)
 * from the provider's model list. Grok Imagine is the engine behind the reference « 041701 » clip.
 */
export const POLLINATIONS_MODELS: { id: string; model: string; name: string; usdPerS: number; quality: number }[] = [
  { id: 'pollinations:x-ai/grok-imagine-video-1.5-lite', model: 'x-ai/grok-imagine-video-1.5-lite', name: 'Grok Imagine Video 1.5 Lite (qualité Grok, ≈ 0,03 $/s)', usdPerS: 0.03, quality: 8.6 },
  { id: 'pollinations:x-ai/grok-imagine-video', model: 'x-ai/grok-imagine-video', name: 'Grok Imagine Video (≈ 0,07 $/s)', usdPerS: 0.07, quality: 8.9 },
  { id: 'pollinations:bytedance/seedance-2.0-fast', model: 'bytedance/seedance-2.0-fast', name: 'Seedance 2.0 Fast (≈ 0,07 $/s)', usdPerS: 0.07, quality: 8.7 },
  { id: POLLINATIONS_VIDEO, model: 'alibaba/wan-2.2-fast', name: 'Wan 2.2 Fast (≈ 0,01 $/s)', usdPerS: 0.01, quality: 7.2 },
];
/** Price per second of the cheapest engine. */
export const POLLINATIONS_USD_PER_S = 0.01;
export const pollinationsModel = (id: string | undefined | null) => POLLINATIONS_MODELS.find((m) => m.id === id);
const HF_BASE = 'https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space';

export const isCheapVideo = (id: string | undefined | null) => Boolean(pollinationsModel(id)) || id === HF_VIDEO;

/** The user's Pollinations key (kept in this browser), or a clear error. */
export function pollinationsKey(): string {
  const key = useStore.getState().settings.pollinationsKey?.trim();
  if (!key) throw new Error('Clé Pollinations absente : Réglages → Animation vidéo économique (compte sur enter.pollinations.ai, quelques pollens suffisent).');
  return key;
}
/** Uploads an image to Pollinations' media store; returns its public URL (start frame or reference image). */
export async function pollinationsUpload(img: Blob, key: string, signal?: AbortSignal): Promise<string> {
  const fd = new FormData();
  fd.append('file', img, 'scene.png');
  const up = await fetch('https://media.pollinations.ai/upload', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd, signal });
  if (!up.ok) throw new Error(`Pollinations (envoi de l'image) : HTTP ${up.status}`);
  const upj = (await up.json().catch(() => ({}))) as { url?: string; id?: string };
  const url = upj.url ?? (upj.id ? `https://media.pollinations.ai/${upj.id}` : '');
  if (!url) throw new Error('Pollinations : URL de l’image non renvoyée');
  return url;
}

/** Pollinations: upload the frame to its media store, then ask the video for that start frame. */
export async function pollinationsVideo(img: Blob, prompt: string, seconds: number, aspect: string, signal?: AbortSignal, engine: string = POLLINATIONS_VIDEO): Promise<{ blob: Blob; usd: number }> {
  const pm = pollinationsModel(engine) ?? POLLINATIONS_MODELS.at(-1)!;
  const key = pollinationsKey();
  const auth = { Authorization: `Bearer ${key}` };
  const url = await pollinationsUpload(img, key, signal);
  const dur = Math.max(2, Math.min(10, Math.round(seconds)));
  const q = new URLSearchParams({ model: pm.model, image: url, duration: String(dur), aspectRatio: aspect });
  const r = await fetch(`https://gen.pollinations.ai/video/${encodeURIComponent(prompt.slice(0, 900))}?${q}`, { headers: auth, signal });
  if (!r.ok) throw new Error(`Pollinations (vidéo) : HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`);
  const blob = await r.blob();
  if (!/video|octet/.test(blob.type) && blob.size < 10_000) throw new Error('Pollinations : la réponse n’est pas une vidéo');
  return { blob, usd: Math.round(dur * pm.usdPerS * 1000) / 1000 };
}

/** Hugging Face Space (Gradio API): upload, queue the job, read the event stream, download the MP4. */
export async function hfSpaceVideo(img: Blob, prompt: string, seconds: number, signal?: AbortSignal): Promise<{ blob: Blob; usd: number }> {
  const token = useStore.getState().settings.hfToken?.trim();
  const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const fd = new FormData();
  fd.append('files', img, 'scene.png');
  const up = await fetch(`${HF_BASE}/gradio_api/upload`, { method: 'POST', headers: auth, body: fd, signal });
  if (!up.ok) throw new Error(`Hugging Face (envoi de l'image) : HTTP ${up.status}`);
  const path = ((await up.json()) as string[])[0];
  const body = { data: [{ path, meta: { _type: 'gradio.FileData' } }, prompt.slice(0, 600), 6, '', Math.max(2, Math.min(5, seconds)), 1, 1, 42, true] };
  const call = await fetch(`${HF_BASE}/gradio_api/call/generate_video`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!call.ok) throw new Error(`Hugging Face : HTTP ${call.status}`);
  const { event_id } = (await call.json()) as { event_id: string };
  const ev = await fetch(`${HF_BASE}/gradio_api/call/generate_video/${event_id}`, { headers: auth, signal });
  const text = await ev.text();
  const done = /event: complete\s*\ndata: (.*)/.exec(text);
  if (!done) throw new Error(`Hugging Face : le Space a refusé (quota GPU gratuit épuisé ou compte requis${token ? '' : ' — ajoutez un jeton Hugging Face dans Réglages'}).`);
  const out = JSON.parse(done[1]!) as [{ video?: { url?: string; path?: string }; url?: string }, number];
  const v = out[0];
  const vurl = v.video?.url ?? v.url ?? (v.video?.path ? `${HF_BASE}/gradio_api/file=${v.video.path}` : '');
  if (!vurl) throw new Error('Hugging Face : vidéo non renvoyée');
  const r = await fetch(vurl, { headers: auth, signal });
  if (!r.ok) throw new Error(`Hugging Face (téléchargement) : HTTP ${r.status}`);
  return { blob: await r.blob(), usd: 0 };
}
