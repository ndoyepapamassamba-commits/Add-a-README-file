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
      body: JSON.stringify({ query: query.slice(0, 300), max_results: 6, search_depth: 'basic', include_images: true, include_image_descriptions: true, include_answer: false }),
    },
  };
}
export function parseTavilyImages(json: unknown, max = 12): { url: string; description: string }[] {
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
