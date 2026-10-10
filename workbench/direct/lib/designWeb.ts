// Designs found on the Internet (thumbnails before validation): image search through the user's Tavily key, then a small
// vision model reads the chosen image and returns its palette and font → a custom premium theme.
import { useStore } from './store';
import { complete } from './llm';
import { designQueries, parseTavilyImages, tavilyImagesRequest, type DesignStyle } from '../../server/jev/web/search';
import { PALETTE_PROMPT, parsePalette, type DeliverableKind } from '../../server/services/premiumDesigns';
import { pickVisionModel } from '../../server/jev/vision/bridge';
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
): Promise<{ url: string; description: string }[]> {
  const key = useStore.getState().settings.tavilyKey;
  if (!key) throw new Error('Ajoutez une clé Tavily dans Réglages pour voir des designs sur Internet.');
  const queries = designQueries(kind, opts.page ?? 0, opts.style ?? 'Tous', opts.extra ?? '');
  const settled = await Promise.allSettled(
    queries.map(async (q) => {
      const rq = tavilyImagesRequest(key, q);
      const res = await fetch(rq.url, rq.init);
      if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
      return parseTavilyImages(await res.json());
    }),
  );
  const ok = settled.filter((r): r is PromiseFulfilledResult<{ url: string; description: string }[]> => r.status === 'fulfilled');
  if (!ok.length) throw (settled[0] as PromiseRejectedResult).reason;
  const seen = opts.seen ?? new Set<string>();
  const out: { url: string; description: string }[] = [];
  for (const r of ok)
    for (const img of r.value) {
      const k = img.url.split('?')[0]!;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(img);
    }
  return out;
}

export async function paletteFromImage(url: string): Promise<{ theme: CustomTheme; model: string; cost: number }> {
  const st = useStore.getState();
  const pick = pickVisionModel(st.models, st.settings.visionModel);
  if (!pick) throw new Error('Aucun modèle vision disponible pour lire ce design.');
  const r = await complete(
    {
      model: pick.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: PALETTE_PROMPT }, { type: 'image_url', image_url: { url } }] }],
      maxTokens: 200,
      temperature: 0,
    },
    { models: st.models, fallbacks: pick.fallbacks, effort: 'auto', maxRetries: 1 },
  );
  const theme = parsePalette(r.content);
  if (!theme) throw new Error('Le style de cette image n’a pas pu être lu ; choisissez-en une autre.');
  return { theme, model: r.model, cost: r.cost };
}

/** The full LAYOUT of a design image (structure + palette + font), read once by a small vision model. */
export async function layoutFromImage(url: string): Promise<{ layout: DesignLayout; model: string; cost: number }> {
  const st = useStore.getState();
  const pick = pickVisionModel(st.models, st.settings.visionModel);
  if (!pick) throw new Error('Aucun modèle vision disponible pour lire ce design.');
  const r = await complete(
    {
      model: pick.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: LAYOUT_PROMPT }, { type: 'image_url', image_url: { url } }] }],
      maxTokens: 700,
      temperature: 0,
    },
    { models: st.models, fallbacks: pick.fallbacks, effort: 'auto', maxRetries: 1 },
  );
  const layout = parseLayout(r.content);
  if (!layout) throw new Error('La mise en page de cette image n’a pas pu être lue ; choisissez-en une autre.');
  return { layout, model: r.model, cost: r.cost };
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
