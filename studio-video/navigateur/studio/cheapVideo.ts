// ANIMATION VIDÉO À (PRESQUE) 0 $ — two engines found and checked for this app (calls straight from the browser, CORS
// allowed), both turning the scene's image into a short MP4 clip:
//  - Pollinations « alibaba/wan-2.2-fast » (image → vidéo) : 0,01 pollen / s (≈ 0,05 $ for a 5 s shot) with the
//    user's own Pollinations key (kept in this browser, never in a prompt or a file);
//  - Hugging Face Space « Wan 2.2 14B Fast » (ZeroGPU): free within the GPU quota of the user's Hugging Face account
//    (optional token). Anonymous calls from servers are refused by ZeroGPU: it is labelled « selon votre quota ».
import { priorQuality } from '../../coeur/studio/director';
import { reglages } from '../reglages';
import { animerSurGpuDistant } from '../../coeur/videogen/gpuDistant';

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
  // Veille du 16/10/2026 (catalogue Pollinations lu en direct, prix en pollen/s) : modèles qui animent un personnage AVEC
  // le son de la scène (dialogue, bruitages). Qualité = a priori de famille (director.priorQuality), à mesurer sur nos plans.
  { id: 'pollinations:x-ai/grok-imagine-video-1.5', model: 'x-ai/grok-imagine-video-1.5', name: 'Grok Imagine Video 1.5 avec son (≈ 0,15 $/s)', usdPerS: 0.15, quality: priorQuality('video', 'x-ai/grok-imagine-video-1.5') },
  { id: 'pollinations:alibaba/wan-3.0', model: 'alibaba/wan-3.0', name: 'Wan 3.0 — image, voix ou vidéo → vidéo avec son (≈ 0,068 $/s)', usdPerS: 0.068, quality: priorQuality('video', 'alibaba/wan-3.0') },
  { id: 'pollinations:kandinskylab/kandinsky-6.0-lite', model: 'kandinskylab/kandinsky-6.0-lite', name: 'Kandinsky 6.0 Lite avec son (≈ 0,032 $/s)', usdPerS: 0.032, quality: priorQuality('video', 'kandinskylab/kandinsky-6.0-lite') },
  { id: POLLINATIONS_VIDEO, model: 'alibaba/wan-2.2-fast', name: 'Wan 2.2 Fast (≈ 0,01 $/s)', usdPerS: 0.01, quality: 7.2 },
];
/** Price per second of the cheapest engine. */
export const POLLINATIONS_USD_PER_S = 0.01;
export const pollinationsModel = (id: string | undefined | null) => POLLINATIONS_MODELS.find((m) => m.id === id);

export const isCheapVideo = (id: string | undefined | null) => Boolean(pollinationsModel(id)) || id === HF_VIDEO;

/** The user's Pollinations key (kept in this browser), or a clear error. */
export function pollinationsKey(): string {
  const key = reglages().pollinationsKey?.trim();
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

/**
 * Hugging Face Space « Wan 2.2 14B Fast » : same code path as « Animer mon image » (coeur/videogen/gpuDistant.ts —
 * Gradio queue protocol on one connection, progress, quota errors in French, the user's token when present).
 */
export async function hfSpaceVideo(img: Blob, prompt: string, seconds: number, signal?: AbortSignal): Promise<{ blob: Blob; usd: number }> {
  const jeton = reglages().hfToken?.trim() || undefined;
  const blob = await animerSurGpuDistant(img, prompt.slice(0, 600), { jeton, dureeS: Math.max(2, Math.min(5, seconds)), signal });
  return { blob, usd: 0 };
}
