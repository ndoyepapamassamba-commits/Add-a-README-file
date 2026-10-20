// Brave Search for the browser edition: raw results go straight to the model (no LLM synthesis call → the cheapest
// web search possible: Brave's free tier, ~300–900 tokens of snippets).
export interface BraveHit {
  title: string;
  url: string;
  snippet: string;
  age?: string;
}
const strip = (s: string) =>
  s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
export function parseBrave(json: unknown, max = 8): BraveHit[] {
  const r =
    (json as { web?: { results?: { title?: string; url?: string; description?: string; age?: string; extra_snippets?: string[] }[] } })?.web
      ?.results ?? [];
  return r
    .filter((x) => x.url && x.title)
    .slice(0, max)
    .map((x) => ({
      title: strip(x.title!),
      url: x.url!,
      snippet: strip([x.description ?? '', ...(x.extra_snippets ?? []).slice(0, 1)].join(' ')).slice(0, 420),
      age: x.age,
    }));
}
export function braveText(query: string, hits: BraveHit[]): string {
  if (!hits.length) return `No web result for «${query}».`;
  return [
    `Web results (Brave Search) for «${query}» — cite the URLs you use; open a page with browser.open only if a snippet is not enough:`,
    ...hits.map((h, i) => `${i + 1}. ${h.title}${h.age ? ` (${h.age})` : ''}\n   ${h.url}\n   ${h.snippet}`),
  ].join('\n');
}
export function braveUrl(base: string, query: string, count: number): string {
  const u = new URL(base.replace(/\/$/, ''));
  u.searchParams.set('q', query.slice(0, 400));
  u.searchParams.set('count', String(Math.min(10, Math.max(1, count))));
  u.searchParams.set('extra_snippets', 'true');
  return u.toString();
}
export const BRAVE_DIRECT = 'https://api.search.brave.com/res/v1/web/search';
