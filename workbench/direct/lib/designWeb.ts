// Designs found on the Internet (thumbnails before validation): image search (Tavily — key or keyless — and Firecrawl
// keyless, ranked by quality), then a small
// vision model reads the chosen image and returns its palette and font → a custom premium theme.
import { useStore } from './store';
import { complete } from './llm';
import { designQueries, parseTavilyImages, rankDesignImages, tavilyImagesRequest, type DesignStyle, type WebImage } from '../../server/jev/web/search';
import { keylessImages } from './freeEngines';
import { PALETTE_PROMPT, parsePalette, type DeliverableKind } from '../../server/services/premiumDesigns';
import { withVisionModel } from './visionGuard';
import { paletteFromPixels } from '../../server/services/imagePalette';
import type { CustomTheme } from '../../server/services/houseDesign';
import { LAYOUT_PROMPT, parseLayout, type DesignLayout } from '../../server/services/layoutClone';
import { extractSiteTokens, siteLayout, stylesheetUrls, type SiteTokens } from '../../server/services/siteStyle';

/**
 * One page of the Internet gallery: 4 searches in parallel (different subjects for the category × the chosen style),
 * merged and de-duplicated — typically 25-60 thumbnails per page; « Plus de designs » loads the next page.
 */
export async function searchDesigns(
  kind: DeliverableKind,
  opts: { page?: number; style?: DesignStyle; extra?: string; seen?: Set<string> } = {},
): Promise<WebImage[]> {
  // The user's key when there is one; otherwise — or when its monthly credits are used up — Tavily's FREE KEYLESS
  // access (same results, no account; v62). Firecrawl's free keyless image search runs alongside on the first two
  // queries: it gives each image's SIZE, so thumbnails are dropped and the full-size shots rise to the top.
  const key = useStore.getState().settings.tavilyKey || null;
  const queries = designQueries(kind, opts.page ?? 0, opts.style ?? 'Tous', opts.extra ?? '');
  const tavily = queries.map(async (q) => {
    let rq = tavilyImagesRequest(key, q);
    let res = await fetch(rq.url, rq.init);
    if (!res.ok && key && [401, 403, 429, 432, 433].includes(res.status)) {
      rq = tavilyImagesRequest(null, q);
      res = await fetch(rq.url, rq.init);
    }
    if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
    return parseTavilyImages(await res.json()) as WebImage[];
  });
  const firecrawl = queries.slice(0, 2).map((q) => keylessImages(q, 10));
  const settled = await Promise.allSettled([...tavily, ...firecrawl]);
  const ok = settled.filter((r): r is PromiseFulfilledResult<WebImage[]> => r.status === 'fulfilled');
  if (!ok.some((r) => r.value.length) && settled.some((r) => r.status === 'rejected')) throw (settled.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason;
  const seen = opts.seen ?? new Set<string>();
  // Interleave the sources before ranking, so equal scores keep a mix of both engines.
  const lists = ok.map((r) => r.value);
  const mixed: WebImage[] = [];
  for (let i = 0; lists.some((l) => l.length > i); i++) for (const l of lists) if (l[i]) mixed.push(l[i]!);
  const out: WebImage[] = [];
  for (const img of rankDesignImages(mixed, 80)) {
    const k = img.url.split('?')[0]!;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(img);
  }
  return out;
}

/**
 * The image as data for the vision model: fetched through a CORS image proxy (wsrv.nl) and re-encoded, so a site that
 * forbids hot-linking cannot make the read fail; the original URL is used when the proxy cannot get it.
 */
const PROXY = (url: string, w = 1280) => `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${w}&we&output=jpg&q=85`;
export async function imageBlob(url: string, w?: number): Promise<Blob | null> {
  if (url.startsWith('data:')) return (await fetch(url)).blob();
  try {
    const res = await fetch(PROXY(url, w));
    if (!res.ok || !/^image\//.test(res.headers.get('content-type') ?? '')) return null;
    return await res.blob();
  } catch {
    return null;
  }
}
async function imageForVision(url: string): Promise<string> {
  const b = await imageBlob(url);
  if (!b) return url;
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${b.type || 'image/jpeg'};base64,${btoa(bin)}`;
}
/** Ask a vision model about an image — candidates tried in turn, refusing models remembered and skipped. */
export async function askVision(prompt: string, url: string, maxTokens: number, mode: 'reliable' | 'design' = 'reliable'): Promise<{ content: string; model: string; cost: number }> {
  const st = useStore.getState();
  const image = await imageForVision(url);
  return withVisionModel(async (model) => {
    const r = await complete(
      { model, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }] }], maxTokens, temperature: 0 },
      { models: st.models, fallbacks: [], effort: 'auto', maxRetries: 0 },
    );
    if (!r.content?.trim()) throw new Error(`${model} : réponse vide`);
    return { content: r.content, model: r.model, cost: r.cost };
  }, mode);
}

export async function paletteFromImage(url: string): Promise<{ theme: CustomTheme; model: string; cost: number }> {
  const r = await askVision(PALETTE_PROMPT, url, 200);
  const theme = parsePalette(r.content);
  if (!theme) throw new Error('Le style de cette image n’a pas pu être lu ; choisissez-en une autre.');
  return { theme, model: r.model, cost: r.cost };
}

/** The full LAYOUT of a design image (structure + palette + font), read once by a small vision model. */
export async function layoutFromImage(url: string): Promise<{ layout: DesignLayout; model: string; cost: number }> {
  const r = await askVision(LAYOUT_PROMPT, url, 700);
  const layout = parseLayout(r.content);
  if (!layout) throw new Error('La mise en page de cette image n’a pas pu être lue ; choisissez-en une autre.');
  return { layout, model: r.model, cost: r.cost };
}

/** Last resort without any model: the image's colours computed from its pixels in the browser (free). */
export async function localPalette(url: string): Promise<CustomTheme> {
  const b = await imageBlob(url, 320);
  if (!b) throw new Error('Image inaccessible.');
  const bmp = await createImageBitmap(b);
  const k = Math.min(1, 320 / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, w, h);
  const t = paletteFromPixels(g.getImageData(0, 0, w, h).data, w, h);
  if (!t) throw new Error('Aucune couleur exploitable dans cette image.');
  return t;
}

// ── A REAL WEBSITE, reproduced from its own code ─────────────────────────────────────────────────────────────────────
const READER = 'https://r.jina.ai/';
async function reader(url: string, format: 'html' | 'text', signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${READER}${url}`, { headers: { 'X-Return-Format': format }, signal });
  if (!res.ok) throw new Error(res.status === 429 ? 'Lecteur web saturé (20 lectures / minute) : réessayez dans une minute.' : `Lecture du site impossible (HTTP ${res.status}).`);
  return res.text();
}
async function screenshotUrl(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`${READER}${url}`, { headers: { 'X-Return-Format': 'screenshot', Accept: 'application/json' }, signal });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { screenshotUrl?: string } };
    return j.data?.screenshotUrl ?? null;
  } catch {
    return null;
  }
}
export function normalizeSiteUrl(input: string): string {
  const s = input.trim();
  const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error('Adresse de site invalide.');
  return u.href;
}
/**
 * Reproduce a real website: its HTML and stylesheets give the EXACT colours, fonts, radius and shadows; a screenshot
 * read by a vision model gives its structure. ≈ 6 reader calls (free, 20 / minute) + 1 small vision call.
 */
export async function siteDesign(
  input: string,
  onStep: (s: string) => void = () => {},
): Promise<{ layout: DesignLayout; tokens: SiteTokens; screenshot: string | null; url: string; cost: number }> {
  const url = normalizeSiteUrl(input);
  onStep('lecture du code du site…');
  const html = await reader(url, 'html');
  const sheets = stylesheetUrls(html, url);
  onStep(`lecture de ${sheets.length} feuille(s) de style et capture d’écran…`);
  const [css, shot] = await Promise.all([
    Promise.allSettled(sheets.map((s) => reader(s, 'text'))).then((r) => r.flatMap((x) => (x.status === 'fulfilled' ? [x.value.slice(0, 800_000)] : []))),
    screenshotUrl(url),
  ]);
  const tokens = extractSiteTokens(html, css);
  if (tokens.evidence.colors < 2) throw new Error('Ce site ne laisse pas lire son style (page vide ou protégée). Essayez une autre adresse.');
  let vision: DesignLayout | null = null;
  let cost = 0;
  if (shot) {
    onStep('lecture de la mise en page sur la capture…');
    try {
      const r = await layoutFromImage(shot);
      vision = r.layout;
      cost = r.cost;
    } catch {
      /* the structure falls back to a sober default; the design system stays exact */
    }
  }
  return { layout: siteLayout(tokens, vision), tokens, screenshot: shot, url, cost };
}
