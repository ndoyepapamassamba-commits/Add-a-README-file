// ROUTEUR D'API UNIVERSEL — one call shape for every provider, straight from the browser:
//  - Anthropic (Claude), native Messages API (streaming events, tool_use / tool_result);
//  - OpenAI-compatible chat/completions: OpenAI, Google Gemini (its OpenAI endpoint), Mistral AI, Groq, DeepSeek, and
//    the local servers Ollama and LM Studio.
// A model id « provider:model » (e.g. « anthropic:claude-sonnet-4-5 », « ollama:llama3.2 ») selects the route.
// Every call measures its Time To First Token and its generation speed (tokens / second).
// Pure: the fetch and the key are injected (tested in Node with a mocked stream).
import {
  LLMError,
  type ChatMessage,
  type ChatRequest,
  type ChatResult,
  type StreamHandlers,
  type ToolCall,
} from './types';

export type ProviderId =
  'anthropic' | 'openai' | 'gemini' | 'mistral' | 'groq' | 'deepseek' | 'ollama' | 'lmstudio';
export interface ProviderSpec {
  id: ProviderId;
  label: string;
  kind: 'anthropic' | 'openai';
  base: string;
  /** Local server: no key needed. */
  local?: boolean;
  /** The stream reports token usage when asked (stream_options.include_usage). */
  usageInStream: boolean;
  /** Prefix of the same models in the OpenRouter public catalogue (prices), null = no reliable match. */
  catalogPrefix: string | null;
  keyHint: string;
}
export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    kind: 'anthropic',
    base: 'https://api.anthropic.com/v1',
    usageInStream: true,
    catalogPrefix: 'anthropic/',
    keyHint: 'sk-ant-…',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    base: 'https://api.openai.com/v1',
    usageInStream: true,
    catalogPrefix: 'openai/',
    keyHint: 'sk-…',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'openai',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    usageInStream: true,
    catalogPrefix: 'google/',
    keyHint: 'AIza…',
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    kind: 'openai',
    base: 'https://api.mistral.ai/v1',
    usageInStream: false,
    catalogPrefix: 'mistralai/',
    keyHint: 'clé Mistral',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    kind: 'openai',
    base: 'https://api.groq.com/openai/v1',
    usageInStream: true,
    catalogPrefix: null,
    keyHint: 'gsk_…',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai',
    base: 'https://api.deepseek.com/v1',
    usageInStream: true,
    catalogPrefix: 'deepseek/',
    keyHint: 'sk-…',
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    kind: 'openai',
    base: 'http://localhost:11434/v1',
    local: true,
    usageInStream: true,
    catalogPrefix: null,
    keyHint: 'aucune clé',
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    kind: 'openai',
    base: 'http://localhost:1234/v1',
    local: true,
    usageInStream: true,
    catalogPrefix: null,
    keyHint: 'aucune clé',
  },
};
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
const ROUTE = new RegExp(`^(${PROVIDER_IDS.join('|')}):(.+)$`);
/** « anthropic:claude-x » → { provider, model }; null for OpenRouter ids (« anthropic/claude-x »). */
export function parseRoute(id: string): { provider: ProviderId; model: string } | null {
  const m = ROUTE.exec(id);
  return m ? { provider: m[1] as ProviderId, model: m[2]! } : null;
}

export interface CallMetrics {
  provider: ProviderId;
  model: string;
  /** Request sent → first token (text or tool call), ms; null when nothing streamed. */
  ttftMs: number | null;
  totalMs: number;
  tokensPerS: number | null;
  /** Usage reported by the provider (true) or estimated from the characters (false). */
  usageReported: boolean;
  /** Rate-limit headers when the provider sends them (remaining requests / tokens). */
  remainingRequests: number | null;
  remainingTokens: number | null;
  retryAfterS: number | null;
}
type FetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<Response>;
export interface UniversalOptions {
  fetch: FetchFn;
  /** The key for this provider ('' for local servers). */
  key: string;
  /** Override of the base URL (custom Ollama / LM Studio port, proxy). */
  base?: string;
  now?: () => number;
}

// ── message conversion ─────────────────────────────────────────────────────────────────────────────────────────────
const textOf = (c: ChatMessage['content']): string =>
  typeof c === 'string' ? c : (c ?? []).map((p) => (p.type === 'text' ? p.text : '')).join('');
/** OpenAI messages → Anthropic { system, messages } (tool calls → tool_use, tool results → tool_result, merged turns). */
export function toAnthropic(messages: ChatMessage[]): {
  system: string;
  messages: { role: 'user' | 'assistant'; content: unknown[] }[];
} {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => textOf(m.content))
    .join('\n\n');
  const out: { role: 'user' | 'assistant'; content: unknown[] }[] = [];
  const push = (role: 'user' | 'assistant', blocks: unknown[]) => {
    if (!blocks.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      push('user', [
        { type: 'tool_result', tool_use_id: m.tool_call_id, content: textOf(m.content) || '(vide)' },
      ]);
      continue;
    }
    const blocks: unknown[] = [];
    if (typeof m.content === 'string') {
      if (m.content) blocks.push({ type: 'text', text: m.content });
    } else
      for (const p of m.content ?? []) {
        if (p.type === 'text' && p.text) blocks.push({ type: 'text', text: p.text });
        else if (p.type === 'image_url') {
          const d = /^data:([^;]+);base64,(.*)$/.exec(p.image_url.url);
          blocks.push(
            d
              ? { type: 'image', source: { type: 'base64', media_type: d[1], data: d[2] } }
              : { type: 'image', source: { type: 'url', url: p.image_url.url } },
          );
        }
      }
    for (const t of m.tool_calls ?? []) {
      let input: unknown;
      try {
        input = JSON.parse(t.function.arguments || '{}');
      } catch {
        input = {};
      }
      blocks.push({ type: 'tool_use', id: t.id, name: t.function.name, input });
    }
    push(m.role === 'assistant' ? 'assistant' : 'user', blocks);
  }
  // Anthropic requires the conversation to start with the user.
  if (out[0]?.role === 'assistant')
    out.unshift({ role: 'user', content: [{ type: 'text', text: '(début)' }] });
  return { system, messages: out };
}

// ── streaming (Server-Sent Events) ─────────────────────────────────────────────────────────────────────────────────
async function* sse(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<{ event: string | null; data: string }> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let event: string | null = null;
  while (true) {
    if (signal?.aborted) throw new LLMError('Cancelled', 499, false, 'cancelled');
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (!line) {
        event = null;
        continue;
      }
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) yield { event, data: line.slice(5).trim() };
    }
  }
}
const num = (h: Headers, ...names: string[]) => {
  for (const n of names) {
    const v = h.get(n);
    if (v !== null && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
};

/** One chat call on a direct provider: streaming, tool calls, usage, TTFT and tokens / second. */
export async function universalChat(
  route: { provider: ProviderId; model: string },
  req: ChatRequest,
  o: UniversalOptions,
  h: StreamHandlers = {},
): Promise<ChatResult & { metrics: CallMetrics }> {
  const spec = PROVIDERS[route.provider];
  const now = o.now ?? (() => performance.now());
  const base = (o.base ?? spec.base).replace(/\/$/, '');
  if (!spec.local && !o.key)
    throw new LLMError(
      `Clé ${spec.label} absente : ajoutez-la dans le coffre de clés (Fournisseurs).`,
      401,
      false,
    );
  const t0 = now();
  let first: number | null = null;
  const mark = () => {
    if (first === null) first = now();
  };
  let res: Response;
  if (spec.kind === 'anthropic') {
    const { system, messages } = toAnthropic(req.messages);
    const body: Record<string, unknown> = {
      model: route.model,
      max_tokens: req.maxTokens ?? 8192,
      messages,
      stream: true,
    };
    if (system) body.system = system;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
      if (req.toolChoice === 'required') body.tool_choice = { type: 'any' };
      else if (req.toolChoice === 'none') body.tool_choice = { type: 'none' };
    }
    res = await o.fetch(`${base}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': o.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } else {
    const body: Record<string, unknown> = {
      model: route.model,
      messages: req.messages.map((m) => ({ ...m, reasoning_details: undefined })),
      stream: true,
    };
    if (spec.usageInStream) body.stream_options = { include_usage: true };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.maxTokens) body.max_tokens = req.maxTokens;
    if (req.tools?.length) {
      body.tools = req.tools;
      if (req.toolChoice) body.tool_choice = req.toolChoice;
    }
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (o.key) headers.authorization = `Bearer ${o.key}`;
    res = await o.fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: req.signal,
    });
  }
  const rl = {
    remainingRequests: num(
      res.headers,
      'x-ratelimit-remaining-requests',
      'anthropic-ratelimit-requests-remaining',
    ),
    remainingTokens: num(res.headers, 'x-ratelimit-remaining-tokens', 'anthropic-ratelimit-tokens-remaining'),
    retryAfterS: num(res.headers, 'retry-after'),
  };
  if (!res.ok) {
    const txt = (await res.text().catch(() => '')).slice(0, 300);
    const err = new LLMError(
      `${spec.label} : HTTP ${res.status} ${txt}`,
      res.status,
      res.status === 429 || res.status >= 500,
    );
    (err as LLMError & { retryAfterS?: number | null }).retryAfterS = rl.retryAfterS;
    throw err;
  }
  let content = '';
  let finish = 'stop';
  let pin: number | null = null;
  let pout: number | null = null;
  let cached = 0;
  const calls: ToolCall[] = [];
  if (spec.kind === 'anthropic') {
    const blocks = new Map<number, { id: string; name: string; json: string }>();
    for await (const { data } of sse(res, req.signal)) {
      if (!data || data === '[DONE]') continue;
      const e = JSON.parse(data) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (e.type === 'message_start') {
        pin =
          (e.message?.usage?.input_tokens ?? 0) +
          (e.message?.usage?.cache_read_input_tokens ?? 0) +
          (e.message?.usage?.cache_creation_input_tokens ?? 0);
        cached = e.message?.usage?.cache_read_input_tokens ?? 0;
      } else if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
        mark();
        blocks.set(e.index, { id: e.content_block.id, name: e.content_block.name, json: '' });
        h.onToolCallStart?.(e.content_block.name);
      } else if (e.type === 'content_block_delta') {
        if (e.delta?.type === 'text_delta') {
          mark();
          content += e.delta.text;
          h.onText?.(e.delta.text);
        } else if (e.delta?.type === 'input_json_delta')
          blocks.get(e.index)!.json += e.delta.partial_json ?? '';
        else if (e.delta?.type === 'thinking_delta') h.onReasoning?.();
      } else if (e.type === 'message_delta') {
        if (e.delta?.stop_reason)
          finish =
            e.delta.stop_reason === 'tool_use'
              ? 'tool_calls'
              : e.delta.stop_reason === 'max_tokens'
                ? 'length'
                : 'stop';
        if (e.usage?.output_tokens !== undefined) pout = e.usage.output_tokens;
      } else if (e.type === 'error')
        throw new LLMError(`${spec.label} : ${e.error?.message ?? 'erreur'}`, 500, true);
    }
    for (const b of [...blocks.entries()].sort((a, c) => a[0] - c[0]).map((x) => x[1]))
      calls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: b.json || '{}' } });
  } else {
    const parts = new Map<number, { id: string; name: string; args: string }>();
    for await (const { data } of sse(res, req.signal)) {
      if (!data || data === '[DONE]') continue;
      const e = JSON.parse(data) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (e.error) throw new LLMError(`${spec.label} : ${e.error.message ?? 'erreur'}`, 500, true);
      const ch = e.choices?.[0];
      const d = ch?.delta;
      if (d?.content) {
        mark();
        content += d.content;
        h.onText?.(d.content);
      }
      if (d?.reasoning_content || d?.reasoning) h.onReasoning?.();
      for (const tc of d?.tool_calls ?? []) {
        mark();
        const k = tc.index ?? 0;
        const p = parts.get(k) ?? { id: '', name: '', args: '' };
        if (tc.id) p.id = tc.id;
        if (tc.function?.name) {
          if (!p.name) h.onToolCallStart?.(tc.function.name);
          p.name += tc.function.name;
        }
        if (tc.function?.arguments) p.args += tc.function.arguments;
        parts.set(k, p);
      }
      if (ch?.finish_reason) finish = ch.finish_reason;
      if (e.usage) {
        pin = e.usage.prompt_tokens ?? pin;
        pout = e.usage.completion_tokens ?? pout;
        cached = e.usage.prompt_tokens_details?.cached_tokens ?? cached;
      }
    }
    for (const [k, p] of [...parts.entries()].sort((a, c) => a[0] - c[0]))
      calls.push({
        id: p.id || `call_${k}`,
        type: 'function',
        function: { name: p.name, arguments: p.args || '{}' },
      });
  }
  const t1 = now();
  const reported = pin !== null && pout !== null;
  // Without reported usage: ≈ 4 characters per token (marked as estimated, never shown as measured).
  const promptTokens = pin ?? Math.ceil(JSON.stringify(req.messages).length / 4);
  const completionTokens =
    pout ?? Math.ceil((content.length + calls.reduce((a, c) => a + c.function.arguments.length, 0)) / 4);
  const genS = first !== null ? (t1 - first) / 1000 : 0;
  return {
    content,
    toolCalls: calls,
    finishReason: finish,
    usage: { promptTokens, completionTokens, cachedTokens: cached, cost: null },
    model: `${route.provider}:${route.model}`,
    metrics: {
      provider: route.provider,
      model: route.model,
      ttftMs: first !== null ? Math.round(first - t0) : null,
      totalMs: Math.round(t1 - t0),
      tokensPerS: first !== null && genS > 0.05 ? Math.round((completionTokens / genS) * 10) / 10 : null,
      usageReported: reported,
      ...rl,
    },
  };
}

/** The provider's model list (OpenAI-compatible /models, Anthropic /v1/models). */
export async function listProviderModels(provider: ProviderId, o: UniversalOptions): Promise<string[]> {
  const spec = PROVIDERS[provider];
  const base = (o.base ?? spec.base).replace(/\/$/, '');
  const headers: Record<string, string> =
    spec.kind === 'anthropic'
      ? {
          'x-api-key': o.key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        }
      : o.key
        ? { authorization: `Bearer ${o.key}` }
        : {};
  const res = await o.fetch(`${base}/models`, { method: 'GET', headers });
  if (!res.ok)
    throw new LLMError(`${spec.label} : liste des modèles HTTP ${res.status}`, res.status, res.status >= 500);
  const j = (await res.json()) as { data?: { id: string }[]; models?: { name?: string; id?: string }[] };
  const ids = (j.data ?? [])
    .map((m) => m.id)
    .concat((j.models ?? []).map((m) => m.id ?? m.name ?? ''))
    .filter(Boolean);
  // Gemini's OpenAI endpoint lists « models/gemini-… »: the chat endpoint takes the bare name.
  return [...new Set(ids.map((id) => id.replace(/^models\//, '')))].sort();
}

/** Public price (USD / 1M tokens) of a direct model, from the OpenRouter catalogue when the same model is listed there. */
export function priceFromCatalog(
  provider: ProviderId,
  model: string,
  catalog: { id: string; inputPrice: number | null; outputPrice: number | null }[],
): { input: number; output: number; source: string } | null {
  const spec = PROVIDERS[provider];
  if (spec.local) return { input: 0, output: 0, source: 'local (gratuit)' };
  if (!spec.catalogPrefix) return null;
  const want = `${spec.catalogPrefix}${model}`.toLowerCase();
  // Exact id, or the catalogue id without its date / version suffix (claude-sonnet-4-5-20250929 → claude-sonnet-4.5).
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/-\d{8}$/, '')
      .replace(/(\d)-(\d)/g, '$1.$2');
  const hit =
    catalog.find((m) => m.id.toLowerCase() === want) ?? catalog.find((m) => norm(m.id) === norm(want));
  if (!hit || hit.inputPrice === null || hit.outputPrice === null) return null;
  return {
    input: hit.inputPrice,
    output: hit.outputPrice,
    source: `prix public ${hit.id} (catalogue OpenRouter)`,
  };
}
