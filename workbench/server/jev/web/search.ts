// Free web search providers that a browser page (even file://) can call DIRECTLY (CORS verified on 2026-10-10):
// Tavily (free monthly credits, no card) and Serper (free queries on signup). Raw results go to the model: no LLM
// synthesis call. Brave needs a relay (it rejects browser calls).
import type { BraveHit } from './brave';

export type SearchProvider = 'tavily' | 'serper';
export interface SearchRequest {
  url: string;
  init: { method: 'POST'; headers: Record<string, string>; body: string };
}
export function tavilyRequest(key: string, query: string, n: number): SearchRequest {
  return {
    url: 'https://api.tavily.com/search',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
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
export const PROVIDER_LABEL: Record<SearchProvider | 'brave', string> = { tavily: 'Tavily', serper: 'Serper (Google)', brave: 'Brave' };

/** Tavily image search (design inspiration): image URLs returned with the results. */
export function tavilyImagesRequest(key: string, query: string): SearchRequest {
  return {
    url: 'https://api.tavily.com/search',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
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
const SOURCES = ['', 'dribbble', 'behance', 'pinterest', 'figma community', 'awwwards', 'envato', 'freepik', 'uplabs', 'muzli'];
const SECTORS = ['', 'banking', 'microfinance', 'insurance', 'telecom', 'energy', 'healthcare', 'retail', 'logistics', 'agriculture', 'education', 'government', 'real estate', 'hr', 'marketing', 'ecommerce', 'crypto', 'manufacturing'];
const COLORS = ['', 'navy and gold', 'emerald green', 'purple neon', 'teal and coral', 'black and white', 'blue gradient', 'orange accent', 'pastel', 'dark blue', 'red and black', 'earth tones', 'cyan glow', 'warm beige'];
const TWISTS = ['premium', 'modern', 'award winning', 'inspiration', 'template', 'ui kit', 'concept', 'redesign', 'clean', 'creative', '2026', 'professional'];
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
