import { z } from 'zod';
import { httpFetch } from '../llm/http';
import { redactSecrets } from '../security/redact';
import { defineTool, ok, ToolError, type AnyTool } from './types';

function htmlToText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
  return { title, text };
}

export const webTools: AnyTool[] = [
  defineTool({
    name: 'web.search',
    description:
      'Search the web for information (returns titles, URLs, snippets and a short sourced answer). Use browser.* only when you need to interact with a site.',
    schema: z.object({
      query: z.string().min(2).max(400),
      max_results: z.number().int().min(1).max(10).default(5),
    }),
    readOnly: true,
    assess: () => ({ risk: 'network' }),
    label: (a) => `Search web: ${a.query}`,
    async execute(a, ctx) {
      const res = await ctx.services.search.search(a.query, {
        maxResults: a.max_results,
        runId: ctx.runId,
        sessionId: ctx.sessionId,
        signal: ctx.signal,
      });
      const lines = res.results.map(
        (r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet.replace(/\s+/g, ' ').slice(0, 300)}`,
      );
      return ok(
        `${res.results.length} results (${res.provider})`,
        { provider: res.provider, results: res.results, cost: res.cost },
        {
          forModel: `${res.answer ? `Answer: ${res.answer}\n\n` : ''}Sources:\n${lines.join('\n') || '(no results)'}`,
        },
      );
    },
  }),
  defineTool({
    name: 'web.fetch',
    description:
      'Fetch a URL over HTTP and return its readable text (fast, no JavaScript). For dynamic pages use browser.open.',
    schema: z.object({
      url: z.string().url(),
      max_chars: z.number().int().min(500).max(100_000).default(20_000),
    }),
    readOnly: true,
    assess: () => ({ risk: 'network' }),
    label: (a) => `Fetch ${a.url}`,
    async execute(a, ctx) {
      const u = new URL(a.url);
      if (!['http:', 'https:'].includes(u.protocol)) throw new ToolError('Only http(s) URLs');
      if (
        ['127.0.0.1', 'localhost', '[::1]', '0.0.0.0'].includes(u.hostname) &&
        Number(u.port || 80) === ctx.services.config.port
      )
        throw new ToolError('Fetching the workbench API is blocked');
      const res = await httpFetch(a.url, {
        signal: ctx.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (MASSAMBA Workbench)',
          Accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.5',
        },
        redirect: 'follow',
      });
      const type = res.headers.get('content-type') ?? '';
      const raw = await res.text();
      let title = '';
      let text = raw;
      if (/html/i.test(type)) ({ title, text } = htmlToText(raw));
      text = redactSecrets(text);
      const truncated = text.length > a.max_chars;
      return ok(
        `HTTP ${res.status} · ${text.length} chars`,
        { status: res.status, contentType: type, title },
        {
          forModel: `HTTP ${res.status} ${type}\n${title ? `Title: ${title}\n` : ''}\n${text.slice(0, a.max_chars)}${truncated ? '\n…[truncated]' : ''}`,
        },
      );
    },
  }),
];
