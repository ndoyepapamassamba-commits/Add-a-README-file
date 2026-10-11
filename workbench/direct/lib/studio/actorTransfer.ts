// TRANSFERT DE MOUVEMENT — the virtual 3D actor plays the scene (full skeleton: stands up, walks, turns, points…), then a
// pose-driven video model re-renders that performance AS the character of the scene image (identity, style, clothes
// kept; body motion from the skeleton). Engine: Wan2.2-Animate (open model, Alibaba; « move » = the character performs
// the driving motion) through fal.ai with the user's key (kept in this browser). Price on fal: 0.04 $/s (480p) to
// 0.08 $/s (720p), billed at 16 frames per second.
import { useStore } from '../store';

export const FAL_ANIMATE = 'fal-ai/wan/v2.2-14b/animate/move';
export const FAL_USD_PER_S: Record<'480p' | '580p' | '720p', number> = { '480p': 0.04, '580p': 0.06, '720p': 0.08 };
const toDataUrl = (b: Blob) =>
  new Promise<string>((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => ko(new Error('lecture du fichier'));
    r.readAsDataURL(b);
  });

/**
 * Character image + driving performance video → the character performing it. Files go inline (data URIs, accepted by
 * fal for file inputs). Polls the fal queue until the video is ready.
 */
export async function animateCharacter(
  image: Blob,
  driving: Blob,
  seconds: number,
  o: { resolution?: '480p' | '580p' | '720p'; signal?: AbortSignal; onStatus?: (s: string) => void } = {},
): Promise<{ blob: Blob; usd: number }> {
  const key = useStore.getState().settings.falKey?.trim();
  if (!key) throw new Error('Clé fal.ai absente : Réglages → Animation vidéo économique → Clé fal.ai.');
  const resolution = o.resolution ?? '480p';
  const headers = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
  const body = { image_url: await toDataUrl(image), video_url: await toDataUrl(driving), resolution, video_quality: 'high' };
  const sub = await fetch(`https://queue.fal.run/${FAL_ANIMATE}`, { method: 'POST', headers, body: JSON.stringify(body), signal: o.signal });
  if (!sub.ok) throw new Error(`fal.ai (envoi) : HTTP ${sub.status} ${(await sub.text().catch(() => '')).slice(0, 200)}`);
  const job = (await sub.json()) as { status_url: string; response_url: string };
  for (let i = 0; i < 400; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    if (o.signal?.aborted) throw new Error('annulé');
    const st = await fetch(job.status_url, { headers, signal: o.signal });
    const s = (await st.json().catch(() => ({}))) as { status?: string };
    o.onStatus?.(s.status ?? '…');
    if (s.status === 'COMPLETED') break;
    if (s.status === 'FAILED' || s.status === 'ERROR') throw new Error('fal.ai : la génération a échoué');
  }
  const res = await fetch(job.response_url, { headers, signal: o.signal });
  const out = (await res.json()) as { video?: { url?: string } };
  if (!out.video?.url) throw new Error('fal.ai : vidéo non renvoyée');
  const v = await fetch(out.video.url, { signal: o.signal });
  return { blob: await v.blob(), usd: Math.round(seconds * FAL_USD_PER_S[resolution] * 1000) / 1000 };
}
