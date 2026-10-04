import { httpFetch } from '../llm/http';
import type { LLMService } from '../llm/service';
import { pickFromTier } from '../llm/router';
import type { SettingsService } from './settings';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  provider: 'brave' | 'openrouter';
  query: string;
  results: SearchResult[];
  answer?: string;
  cost: number;
}

/**
 * web.search = information retrieval (distinct from the controllable browser).
 * Uses the Brave Search API when BRAVE_API_KEY is set, otherwise OpenRouter's
 * web plugin (same OpenRouter key, billed per result by OpenRouter).
 */
export class WebSearchService {
  constructor(
    private readonly llm: LLMService,
    private readonly settings: SettingsService,
    private readonly braveKey: string | undefined,
  ) {}

  get provider(): 'brave' | 'openrouter' {
    const pref = this.settings.get().webSearchProvider;
    if (pref === 'brave' && this.braveKey) return 'brave';
    if (pref === 'openrouter') return 'openrouter';
    return this.braveKey ? 'brave' : 'openrouter';
  }

  async search(query: string, opts: { maxResults?: number; runId?: string | null; sessionId?: string | null; signal?: AbortSignal } = {}): Promise<SearchResponse> {
    const n = Math.min(Math.max(opts.maxResults ?? 5, 1), 10);
    if (this.provider === 'brave') {
      const res = await httpFetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}`, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': this.braveKey! },
        signal: opts.signal,
      });
      if (!res.ok) throw new Error(`Brave search failed: HTTP ${res.status}`);
      const body = (await res.json()) as { web?: { results?: { title: string; url: string; description?: string }[] } };
      return {
        provider: 'brave',
        query,
        cost: 0,
        results: (body.web?.results ?? []).slice(0, n).map((r) => ({ title: r.title, url: r.url, snippet: (r.description ?? '').replace(/<[^>]+>/g, '') })),
      };
    }
    const s = this.settings.get();
    const models = await this.llm.catalog.list().catch(() => []);
    const model = s.webSearchModel || pickFromTier(models, s.autoTiers.fast)?.id || 'openai/gpt-4o-mini';
    const result = await this.llm.complete(
      {
        model,
        messages: [
          {
            role: 'user',
            content: `Search the web for: ${query}\n\nAnswer concisely with the key facts found, citing sources. Today's date: ${new Date().toISOString().slice(0, 10)}.`,
          },
        ],
        plugins: [{ id: 'web', max_results: n }],
        maxTokens: 1200,
        temperature: 0,
        signal: opts.signal,
      },
      { runId: opts.runId ?? null, sessionId: opts.sessionId ?? null },
    );
    const citations = (result.annotations ?? [])
      .map((a) => (a as { type?: string; url_citation?: { url: string; title?: string; content?: string } }).url_citation)
      .filter((c): c is { url: string; title?: string; content?: string } => Boolean(c?.url));
    const seen = new Set<string>();
    const results = citations
      .filter((c) => !seen.has(c.url) && seen.add(c.url))
      .map((c) => ({ title: c.title ?? c.url, url: c.url, snippet: (c.content ?? '').slice(0, 500) }));
    return { provider: 'openrouter', query, results, answer: result.content, cost: result.cost };
  }
}
