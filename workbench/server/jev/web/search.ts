// Free web search providers that a browser page (even file://) can call DIRECTLY (CORS verified on 2026-10-10):
// Tavily (free monthly credits, no card — and, since 2026, a FREE KEYLESS access) and Serper (free queries on signup);
// with no key at all: Tavily keyless, then DuckDuckGo + Wikipédia (+ Crossref for scholarly asks). Raw results go to the
// model: no LLM synthesis call. Brave needs a relay (it rejects browser calls).
import type { BraveHit } from './brave';

export type SearchProvider = 'tavily' | 'serper';
export interface SearchRequest {
  url: string;
  init: { method: 'POST'; headers: Record<string, string>; body: string };
}
/** Tavily auth: the user's key, else the FREE KEYLESS access (v62 — header X-Tavily-Access-Mode: keyless, no account,
 *  same results and schema, rate-limited; verified from this app's origin on 15/10/2026: 200 in 1,5 s, CORS open). */
const tavilyAuth = (key: string | null | undefined): Record<string, string> => (key ? { Authorization: `Bearer ${key}` } : { 'X-Tavily-Access-Mode': 'keyless' });
export function tavilyRequest(key: string | null, query: string, n: number): SearchRequest {
  return {
    url: 'https://api.tavily.com/search',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...tavilyAuth(key) },
      body: JSON.stringify({ query: query.slice(0, 400), max_results: Math.min(10, Math.max(1, n)), search_depth: 'basic', include_answer: false }),
    },
  };
}
export function serperRequest(key: string, query: string, n: number): SearchRequest {
  return {
    url: 'https://google.serper.dev/search',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
      body: JSON.stringify({ q: query.slice(0, 400), num: Math.min(10, Math.max(1, n)), hl: 'fr' }),
    },
  };
}
const clip = (s: unknown, n = 420) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export function parseTavily(json: unknown, max = 8): BraveHit[] {
  const r = (json as { results?: { title?: string; url?: string; content?: string; published_date?: string }[] })?.results ?? [];
  return r.filter((x) => x.url && x.title).slice(0, max).map((x) => ({ title: clip(x.title, 200), url: x.url!, snippet: clip(x.content), age: x.published_date }));
}
export function parseSerper(json: unknown, max = 8): BraveHit[] {
  const r = (json as { organic?: { title?: string; link?: string; snippet?: string; date?: string }[] })?.organic ?? [];
  return r.filter((x) => x.link && x.title).slice(0, max).map((x) => ({ title: clip(x.title, 200), url: x.link!, snippet: clip(x.snippet), age: x.date }));
}
export const PROVIDER_LABEL: Record<SearchProvider | 'brave' | 'keyless' | 'free' | 'firecrawl' | 'parallel' | 'exa', string> = { tavily: 'Tavily', serper: 'Serper (Google)', brave: 'Brave', keyless: 'Tavily sans clé', firecrawl: 'Firecrawl sans clé', parallel: 'Parallel Search sans clé', exa: 'Exa sans clé', free: 'Wikipédia · Crossref · DuckDuckGo' };

// ── FREE, NO KEY, CORS OPEN (measured 15/10/2026 from the app's origin) — the last free step before any paid search ──
/** DuckDuckGo Instant Answer: an abstract (often Wikipedia) and related topics; no key. */
export const ddgUrl = (q: string) => `https://api.duckduckgo.com/?q=${encodeURIComponent(q.slice(0, 300))}&format=json&no_html=1&skip_disambig=1`;
export function parseDdg(json: unknown, max = 5): BraveHit[] {
  const j = (json ?? {}) as { Heading?: string; AbstractText?: string; AbstractURL?: string; AbstractSource?: string; RelatedTopics?: ({ Text?: string; FirstURL?: string; Topics?: { Text?: string; FirstURL?: string }[] })[] };
  const out: BraveHit[] = [];
  if (j.AbstractText && j.AbstractURL) out.push({ title: clip(`${j.Heading ?? ''} — ${j.AbstractSource ?? 'DuckDuckGo'}`, 200), url: j.AbstractURL, snippet: clip(j.AbstractText) });
  for (const t of (j.RelatedTopics ?? []).flatMap((x) => (x.Topics ? x.Topics : [x]))) {
    if (out.length >= max) break;
    if (t.Text && t.FirstURL) out.push({ title: clip(t.Text.split(' - ')[0], 200), url: t.FirstURL, snippet: clip(t.Text) });
  }
  return out;
}
/** Wikipedia full-text search (the browser sends its own User-Agent; origin=* opens CORS); no key. */
export const wikiUrl = (q: string, lang = 'fr', n = 4) => `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=${n}&srsearch=${encodeURIComponent(q.slice(0, 300))}`;
export function parseWiki(json: unknown, lang = 'fr', max = 4): BraveHit[] {
  const r = (json as { query?: { search?: { title: string; snippet: string }[] } })?.query?.search ?? [];
  return r.slice(0, max).map((h) => ({ title: clip(`${h.title} — Wikipédia`, 200), url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`, snippet: clip(h.snippet.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')) }));
}
/** Crossref: scholarly works (title, journal, year, DOI); no key. */
export const crossrefUrl = (q: string, n = 4) => `https://api.crossref.org/works?query=${encodeURIComponent(q.slice(0, 300))}&rows=${n}&select=title,author,container-title,issued,DOI,abstract`;
export function parseCrossref(json: unknown, max = 4): BraveHit[] {
  const items = (json as { message?: { items?: { title?: string[]; author?: { family?: string }[]; 'container-title'?: string[]; issued?: { 'date-parts'?: number[][] }; DOI?: string; abstract?: string }[] } })?.message?.items ?? [];
  return items
    .filter((x) => x.DOI && x.title?.[0])
    .slice(0, max)
    .map((x) => {
      const year = x.issued?.['date-parts']?.[0]?.[0];
      const who = (x.author ?? []).slice(0, 3).map((a) => a.family).filter(Boolean).join(', ');
      return { title: clip(x.title![0], 200), url: `https://doi.org/${x.DOI}`, snippet: clip(`${who ? `${who}${(x.author ?? []).length > 3 ? ' et al.' : ''} — ` : ''}${x['container-title']?.[0] ?? ''}${year ? ` (${year})` : ''}${x.abstract ? ` — ${x.abstract.replace(/<[^>]+>/g, '')}` : ''}`), age: year ? String(year) : undefined };
    });
}
/** Words that call for scholarly sources (Crossref is only asked then). */
// Bornes Unicode explicites : \b ne voit pas la frontière avant « é » (hors mode u).
export const ACADEMIC = /(?<!\p{L})(recherche|research|[ée]tude|study|article|th[ée]orie|mod[èe]le|acad[ée]mique|publication|revue|journal|scientifique|paper|litt[ée]rature)(?!\p{L})/iu;
/** Merges hits from several free sources: no duplicate URL, at most `max`. */
export function mergeHits(lists: BraveHit[][], max = 8): BraveHit[] {
  const seen = new Set<string>();
  const out: BraveHit[] = [];
  for (let i = 0; out.length < max && lists.some((l) => l.length > i); i++)
    for (const l of lists) {
      const h = l[i];
      if (h && !seen.has(h.url) && out.length < max) {
        seen.add(h.url);
        out.push(h);
      }
    }
  return out;
}

/** Tavily image search (design inspiration): image URLs returned with the results. */
export function tavilyImagesRequest(key: string | null, query: string): SearchRequest {
  return {
    url: 'https://api.tavily.com/search',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...tavilyAuth(key) },
      body: JSON.stringify({ query: query.slice(0, 300), max_results: 10, search_depth: 'basic', include_images: true, include_image_descriptions: true, include_answer: false }),
    },
  };
}
export function parseTavilyImages(json: unknown, max = 20): { url: string; description: string }[] {
  const imgs = (json as { images?: (string | { url?: string; description?: string })[] })?.images ?? [];
  return imgs
    .map((x) => (typeof x === 'string' ? { url: x, description: '' } : { url: x.url ?? '', description: x.description ?? '' }))
    .filter((x) => /^https:\/\//.test(x.url))
    .slice(0, max);
}
export const DESIGN_QUERY: Record<'excel' | 'document' | 'slides' | 'web', string> = {
  excel: 'premium excel dashboard design template KPI cards',
  document: 'premium corporate report design layout template',
  slides: 'premium presentation slide design template modern',
  web: 'premium web app dashboard UI design',
};
/** Style families offered as filters in the Internet gallery (same for every category). */
export const DESIGN_STYLES = ['Tous', 'Sombre', 'Minimal', 'Luxe', 'Corporate', 'Coloré', 'Finance', 'Afrique', 'Glass', 'Bento', 'Éditorial', 'Pastel'] as const;
export type DesignStyle = (typeof DESIGN_STYLES)[number];
const STYLE_WORDS: Record<Exclude<DesignStyle, 'Tous'>, string> = {
  Sombre: 'dark mode',
  Minimal: 'minimalist clean white',
  Luxe: 'luxury elegant gold black',
  Corporate: 'corporate professional blue',
  Coloré: 'colorful vibrant gradient',
  Finance: 'finance banking fintech',
  Afrique: 'african pattern warm colors',
  Glass: 'glassmorphism',
  Bento: 'bento grid',
  Éditorial: 'editorial magazine typography',
  Pastel: 'pastel soft colors',
};
const SUBJECTS: Record<'excel' | 'document' | 'slides' | 'web', string[]> = {
  excel: ['excel dashboard design', 'spreadsheet KPI dashboard template', 'financial report excel template', 'excel data visualization dashboard', 'power bi dashboard design', 'kpi scorecard dashboard design', 'sales dashboard excel template', 'risk dashboard design banking'],
  document: ['annual report design layout', 'corporate report template design', 'business proposal document design', 'executive summary report layout', 'white paper design template', 'financial report document design', 'brochure report layout indesign', 'one page report design'],
  slides: ['presentation slide design template', 'pitch deck design', 'keynote slide design inspiration', 'business presentation template', 'investor deck slide design', 'data presentation slide design', 'board meeting presentation design', 'consulting slide design'],
  web: ['web app dashboard UI design', 'saas landing page design', 'admin dashboard ui kit', 'analytics dashboard dribbble', 'mobile app ui design', 'fintech app ui design', 'website hero section design', 'dashboard ui behance'],
};
// The showcases where the best designers publish (v62 « creuse encore pour les ultra design ») before the stock sites.
const SOURCES = ['', 'dribbble shot', 'behance case study', 'figma community', 'awwwards', 'mobbin', 'land-book', 'refero', 'muzli', 'dribbble', 'behance', 'pinterest', 'uplabs'];
const SECTORS = ['', 'banking', 'microfinance', 'insurance', 'telecom', 'energy', 'healthcare', 'retail', 'logistics', 'agriculture', 'education', 'government', 'real estate', 'hr', 'marketing', 'ecommerce', 'crypto', 'manufacturing'];
const COLORS = ['', 'navy and gold', 'emerald green', 'purple neon', 'teal and coral', 'black and white', 'blue gradient', 'orange accent', 'pastel', 'dark blue', 'red and black', 'earth tones', 'cyan glow', 'warm beige'];
const TWISTS = ['premium', 'award winning', 'high fidelity', 'case study', 'modern', 'inspiration', 'ui kit', 'concept', 'redesign', 'clean', '2026', 'professional'];
/**
 * The queries of one page of the Internet gallery: 4 different queries per page, drawn from subject × source × sector ×
 * colour × twist (+ the chosen style and free text). Mixed-radix with coprime strides: millions of combinations, so
 * « Plus de designs » keeps finding new images page after page.
 */
export function designQueries(kind: 'excel' | 'document' | 'slides' | 'web', page: number, style: DesignStyle = 'Tous', extra = ''): string[] {
  const subjects = SUBJECTS[kind];
  const words = style === 'Tous' ? '' : STYLE_WORDS[style];
  const out: string[] = [];
  for (let i = 0; i < 4; i++) {
    const n = page * 4 + i;
    const pick = <T,>(a: T[], stride: number) => a[(n * stride + Math.floor(n / a.length)) % a.length]!;
    const q = [pick(subjects, 1), words, n < subjects.length ? 'premium' : pick(TWISTS, 5), n < subjects.length ? '' : pick(SECTORS, 7), n < subjects.length ? '' : pick(COLORS, 11), n < subjects.length ? '' : pick(SOURCES, 3), extra];
    out.push(q.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim());
  }
  return out;
}

// ── FIRECRAWL KEYLESS (lancé le 16/06/2026) : la recherche REST SANS en-tête Authorization — web, actualités et IMAGES
// AVEC LEUR TAILLE (mesuré le 15/10/2026 : 200 en 0,8 s, CORS « * »). ~1 000 crédits / mois par IP, 2 crédits / 10 résultats.
export function firecrawlSearchRequest(key: string | null, query: string, n: number, sources: ('web' | 'news' | 'images')[] = ['web']): SearchRequest {
  return {
    url: 'https://api.firecrawl.dev/v2/search',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ query: query.slice(0, 400), limit: Math.min(10, Math.max(1, n)), sources }),
    },
  };
}
/** Firecrawl web + news results → hits (news keep their date). */
export function parseFirecrawl(json: unknown, max = 8): BraveHit[] {
  const d = (json as { data?: { web?: { url?: string; title?: string; description?: string }[]; news?: { url?: string; title?: string; snippet?: string; date?: string }[] } })?.data ?? {};
  const web = (d.web ?? []).filter((x) => x.url && x.title).map((x) => ({ title: clip(x.title, 200), url: x.url!, snippet: clip(x.description) }));
  const news = (d.news ?? []).filter((x) => x.url && x.title).map((x) => ({ title: clip(x.title, 200), url: x.url!, snippet: clip(x.snippet), age: x.date }));
  return [...web, ...news].slice(0, max);
}
export interface WebImage {
  url: string;
  description: string;
  width?: number;
  height?: number;
  /** The page the image comes from (a Dribbble shot, a Behance case study…). */
  page?: string;
}
export function parseFirecrawlImages(json: unknown, max = 20): WebImage[] {
  const imgs = (json as { data?: { images?: { title?: string; imageUrl?: string; imageWidth?: number; imageHeight?: number; url?: string }[] } })?.data?.images ?? [];
  return imgs
    .filter((x) => /^https:\/\//.test(x.imageUrl ?? ''))
    .slice(0, max)
    .map((x) => ({ url: x.imageUrl!, description: clip(x.title, 200), width: x.imageWidth, height: x.imageHeight, page: x.url }));
}

// ── PARALLEL SEARCH (serveur MCP public, anonyme, sans clé ni compte) : recherche web avec EXTRAITS longs et datés
// (mesuré le 15/10/2026 : 0,9 s, CORS « * » avec Mcp-Session-Id exposé — appelable depuis la page de l'app).
export const PARALLEL_MCP = 'https://search.parallel.ai/mcp';
export const mcpRpc = (id: number | null, method: string, params?: unknown) => JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, ...(params ? { params } : {}) });
/** An MCP answer, sent as JSON or as Server-Sent Events (the last « data: » line). */
export function parseMcpBody(text: string): unknown {
  const t = text.trim();
  if (t.startsWith('{')) return JSON.parse(t);
  const data = t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
  return data.length ? JSON.parse(data[data.length - 1]!) : null;
}
/** Keyword queries for Parallel (3-6 words each): the head and the tail of the request, without duplicates. */
export function parallelQueries(q: string): string[] {
  const w = q.replace(/[«»"“”?!.,;:()]/g, ' ').split(/\s+/).filter((x) => x.length > 1);
  const out = [w.slice(0, 6).join(' '), w.length > 6 ? w.slice(-6).join(' ') : ''].filter(Boolean);
  return [...new Set(out)].slice(0, 3);
}
export function parseParallel(rpc: unknown, max = 8): BraveHit[] {
  const r = rpc as { result?: { isError?: boolean; content?: { type?: string; text?: string }[] } };
  if (!r?.result || r.result.isError) return [];
  const text = (r.result.content ?? []).map((c) => c.text ?? '').join('\n');
  let j: { results?: { url?: string; title?: string; publish_date?: string | null; excerpts?: string[] }[] };
  try {
    j = JSON.parse(text);
  } catch {
    return [];
  }
  return (j.results ?? [])
    .filter((x) => x.url && x.title)
    .slice(0, max)
    .map((x) => ({ title: clip(x.title, 200), url: x.url!, snippet: clip((x.excerpts ?? []).join(' … '), 700), age: x.publish_date ?? undefined }));
}

// ── EXA (serveur MCP public mcp.exa.ai, SANS CLÉ — l'API REST, elle, exige un paiement) : recherche « sémantique » qui
// trouve la page idéale décrite en phrase, PDF officiels compris (mesuré le 15/10/2026 : 1,2-1,3 s, CORS « * »).
export const EXA_MCP = 'https://mcp.exa.ai/mcp';
/** Exa's tool answers in text blocks « Title: … URL: … Published: … Author: … Highlights: … », one per result. */
export function parseExa(rpc: unknown, max = 8): BraveHit[] {
  const r = rpc as { result?: { isError?: boolean; content?: { text?: string }[] } };
  if (!r?.result || r.result.isError) return [];
  const text = (r.result.content ?? []).map((c) => c.text ?? '').join('\n');
  const out: BraveHit[] = [];
  for (const block of text.split(/\n(?=Title: )/)) {
    const title = /^Title: (.*)$/m.exec(block)?.[1]?.trim();
    const url = /^URL: (\S+)/m.exec(block)?.[1];
    if (!title || !url) continue;
    const date = /^Published: (.*)$/m.exec(block)?.[1]?.trim();
    const hl = block.split(/^Highlights:\s*$/m)[1] ?? block.split(/^Text:\s*$/m)[1] ?? '';
    out.push({ title: clip(title, 200), url, snippet: clip(hl, 700), age: date && date !== 'N/A' ? date.slice(0, 10) : undefined });
    if (out.length >= max) break;
  }
  return out;
}

// ── ROTATION DES MOTEURS GRATUITS : chaque moteur a son propre quota ; on commence par un moteur différent à chaque
// recherche (la charge se répartit, les quotas s'additionnent) et un moteur qui répond « quota » (402/429/432/433) est
// mis au repos 15 minutes — il reste tenté en dernier recours.
export const KEYLESS_ENGINES = ['tavily', 'parallel', 'exa', 'firecrawl'] as const;
export type KeylessEngine = (typeof KEYLESS_ENGINES)[number];
export const COOL_MS = 15 * 60_000;
export const isQuota = (status: number) => [402, 429, 432, 433].includes(status);
export function keylessOrder(turn: number, cooled: Partial<Record<KeylessEngine, number>>, now: number, prefer?: KeylessEngine[]): KeylessEngine[] {
  const n = KEYLESS_ENGINES.length;
  // A case-specific order (searchPlan): its two strongest engines alternate from one search to the next, so the best
  // engine for the case is used without exhausting it; the rest follow.
  const rot = prefer?.length
    ? [...(turn % 2 && prefer.length > 1 ? [prefer[1]!, prefer[0]!] : prefer.slice(0, 2)), ...prefer.slice(2), ...KEYLESS_ENGINES.filter((e) => !prefer.includes(e))]
    : KEYLESS_ENGINES.map((_, i) => KEYLESS_ENGINES[(((turn % n) + n) % n + i) % n]!);
  const resting = (e: KeylessEngine) => (cooled[e] ?? 0) > now;
  return [...rot.filter((e) => !resting(e)), ...rot.filter(resting)];
}

// ── IMAGES DE DESIGN « ULTRA » : on écarte vignettes, logos et pages de listes, on remonte les images pleine taille ──
const PREMIUM = /dribbble\.com\/shots|behance\.net\/gallery|figma\.com\/community|awwwards\.com|mobbin\.com|land-book\.com|lapa\.ninja|godly\.website|refero\.design|saaspo\.com|uxcel|muz\.li/i;
const LISTING = /dribbble\.com\/(tags|search)|behance\.net\/search|pinterest\.[a-z.]+\/(search|ideas)|\/tag\//i;
const JUNK = /logo|favicon|icon[-_.]|avatar|sprite|placeholder|badge|emoji|\.svg(\?|$)/i;
/** Dribbble / Behance thumbnails carry a resize parameter: without it the CDN serves the original. */
export function fullSize(url: string): string {
  if (/cdn\.dribbble\.com\/userupload\//.test(url)) return url.split('?')[0]!;
  // Behance: the small renditions (disp, 404, max_632, max_808) exist at max_1200 for every project.
  return url.replace(/(mir-s3-cdn-cf\.behance\.net\/project_modules\/)(?:disp|\d{3}|max_632|max_808)(\/)/, '$1max_1200$2');
}
/** Quality filter + ranking of Internet design images (no image is fetched: URL, size and source only). */
export function rankDesignImages(imgs: WebImage[], max = 60): WebImage[] {
  const seen = new Set<string>();
  const scored: { img: WebImage; score: number }[] = [];
  for (const raw of imgs) {
    const img = { ...raw, url: fullSize(raw.url) };
    const key = img.url.split('?')[0]!.toLowerCase();
    if (seen.has(key) || JUNK.test(img.url)) continue;
    seen.add(key);
    const upgraded = img.url !== raw.url;
    if (!upgraded && img.width && img.height && (img.width < 600 || img.height < 380)) continue;
    let score = 0;
    if (PREMIUM.test(img.page ?? '') || PREMIUM.test(img.url)) score += 3;
    if (LISTING.test(img.page ?? '')) score -= 1;
    if (upgraded) score += 1;
    const w = upgraded ? Math.max(1200, img.width ?? 0) : img.width ?? 0;
    if (w >= 1600) score += 2;
    else if (w >= 1000) score += 1;
    if (img.width && img.height) {
      const r = img.width / img.height;
      if (r >= 1.2 && r <= 2) score += 1;
    }
    if (/dashboard|report|slide|deck|ui|kpi|template|landing/i.test(img.description)) score += 1;
    scored.push({ img, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.img);
}
