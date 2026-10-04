import type { CreditsInfo, ModelInfo, ReasoningEffort } from '@shared/types';
import { httpFetch } from './http';
import {
  LLMError,
  type ChatRequest,
  type ChatResult,
  type KeyStatus,
  type LLMProvider,
  type StreamHandlers,
  type ToolCall,
} from './types';

export interface OpenRouterOptions {
  baseUrl: string;
  appUrl: string;
  appName: string;
  /** Read lazily so a key saved at runtime is picked up without restart. */
  getApiKey: () => string | undefined;
  idleTimeoutMs?: number;
}

interface RawModel {
  id: string;
  name?: string;
  created?: number;
  description?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[] };
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { context_length?: number; max_completion_tokens?: number | null };
  supported_parameters?: string[];
  reasoning?: { mandatory?: boolean; supported_efforts?: string[]; default_effort?: string } | null;
}

const EFFORTS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const asEffort = (v: string | undefined): ReasoningEffort | null => (v && (EFFORTS as string[]).includes(v) ? (v as ReasoningEffort) : null);

/** Picks the supported effort closest to the requested one. */
export function resolveEffort(requested: ReasoningEffort, supported: ReasoningEffort[]): ReasoningEffort | null {
  if (!supported.length) return null;
  if (supported.includes(requested)) return requested;
  const target = EFFORTS.indexOf(requested);
  let best: ReasoningEffort | null = null;
  let bestDist = Infinity;
  for (const e of supported) {
    const d = Math.abs(EFFORTS.indexOf(e) - target);
    if (d < bestDist || (d === bestDist && EFFORTS.indexOf(e) < EFFORTS.indexOf(best ?? 'max'))) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

const perMillion = (v: string | undefined): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null; // OpenRouter uses -1 for "variable" (routers)
  return Math.round(n * 1_000_000 * 1_000_000) / 1_000_000;
};

export function normalizeModel(m: RawModel): ModelInfo {
  const params = new Set(m.supported_parameters ?? []);
  const inputs = m.architecture?.input_modalities ?? [];
  return {
    id: m.id,
    name: m.name ?? m.id,
    provider: m.id.replace(/^~/, '').split('/')[0] ?? 'unknown',
    created: m.created ?? 0,
    contextLength: m.top_provider?.context_length ?? m.context_length ?? 0,
    maxCompletionTokens: m.top_provider?.max_completion_tokens ?? null,
    inputPrice: perMillion(m.pricing?.prompt),
    outputPrice: perMillion(m.pricing?.completion),
    capabilities: {
      tools: params.has('tools'),
      reasoning: params.has('reasoning') || params.has('include_reasoning'),
      vision: inputs.includes('image'),
      structuredOutputs: params.has('structured_outputs') || params.has('response_format'),
    },
    efforts: (m.reasoning?.supported_efforts ?? []).map((e) => asEffort(e)).filter((e): e is ReasoningEffort => e !== null),
    defaultEffort: asEffort(m.reasoning?.default_effort),
    description: (m.description ?? '').slice(0, 600),
  };
}

/** Incremental SSE parser for `data:` lines. */
export class SSEParser {
  private buffer = '';
  push(chunk: string): string[] {
    this.buffer += chunk;
    const out: string[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, '');
      this.buffer = this.buffer.slice(idx + 1);
      if (line.startsWith('data:')) out.push(line.slice(5).trimStart());
    }
    return out;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export class OpenRouterProvider implements LLMProvider {
  readonly name = 'openrouter';
  constructor(private readonly opts: OpenRouterOptions) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': this.opts.appUrl,
      'X-Title': this.opts.appName,
    };
    const key = this.opts.getApiKey();
    if (key) h.Authorization = `Bearer ${key}`;
    return h;
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await httpFetch(`${this.opts.baseUrl}/models`, { headers: this.headers() });
    if (!res.ok) throw new LLMError(`Model list failed (${res.status})`, res.status, isRetryableStatus(res.status));
    const body = (await res.json()) as { data?: RawModel[] };
    return (body.data ?? []).map(normalizeModel);
  }

  async keyStatus(): Promise<KeyStatus> {
    const configured = Boolean(this.opts.getApiKey());
    try {
      const res = await httpFetch(`${this.opts.baseUrl}/key`, { headers: this.headers() });
      if (!res.ok) {
        return { configured, connected: false, error: res.status === 401 ? 'Clé absente ou invalide (401)' : `HTTP ${res.status}` };
      }
      const body = (await res.json()) as { data?: { label?: string; limit?: number | null; limit_remaining?: number | null; usage?: number; is_free_tier?: boolean } };
      const d = body.data ?? {};
      return {
        configured,
        connected: true,
        label: d.label,
        limit: d.limit ?? null,
        limitRemaining: d.limit_remaining ?? null,
        usage: d.usage,
        isFreeTier: d.is_free_tier,
      };
    } catch (err) {
      return { configured, connected: false, error: (err as Error).message };
    }
  }

  async credits(): Promise<CreditsInfo> {
    const status = await this.keyStatus();
    try {
      const res = await httpFetch(`${this.opts.baseUrl}/credits`, { headers: this.headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data?: { total_credits?: number; total_usage?: number } };
      const total = body.data?.total_credits ?? null;
      const used = body.data?.total_usage ?? null;
      return {
        available: true,
        totalCredits: total,
        totalUsage: used,
        remaining: total !== null && used !== null ? Math.max(0, total - used) : null,
        keyLimit: status.limit ?? null,
        keyLimitRemaining: status.limitRemaining ?? null,
      };
    } catch (err) {
      return {
        available: false,
        totalCredits: null,
        totalUsage: null,
        remaining: null,
        keyLimit: status.limit ?? null,
        keyLimitRemaining: status.limitRemaining ?? null,
        error: status.error ?? (err as Error).message,
      };
    }
  }

  async chat(req: ChatRequest, handlers: StreamHandlers = {}): Promise<ChatResult> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      stream: true,
      usage: { include: true },
    };
    if (req.tools?.length) {
      body.tools = req.tools;
      body.tool_choice = req.toolChoice ?? 'auto';
    }
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
    if (req.plugins) body.plugins = req.plugins;
    if (req.responseFormat) body.response_format = req.responseFormat;
    if (req.reasoningEffort) body.reasoning = { effort: req.reasoningEffort, exclude: false };

    const idleMs = this.opts.idleTimeoutMs ?? 180_000;
    const controller = new AbortController();
    const onAbort = () => controller.abort(req.signal?.reason);
    req.signal?.addEventListener('abort', onAbort, { once: true });
    let idleTimer: NodeJS.Timeout | undefined;
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(new Error('LLM stream idle timeout')), idleMs);
    };

    try {
      resetIdle();
      let res;
      try {
        res = await httpFetch(`${this.opts.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        if (req.signal?.aborted) throw err;
        throw new LLMError(`Network error: ${(err as Error).message}`, 0, true);
      }
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        let message = text.slice(0, 500);
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string; metadata?: { raw?: string } } };
          message = parsed.error?.message ?? message;
          if (parsed.error?.metadata?.raw) message += ` — ${String(parsed.error.metadata.raw).slice(0, 300)}`;
        } catch {
          /* keep raw text */
        }
        throw new LLMError(message || `HTTP ${res.status}`, res.status, isRetryableStatus(res.status));
      }

      const parser = new SSEParser();
      const decoder = new TextDecoder();
      let content = '';
      let finishReason = '';
      let model = req.model;
      const toolCalls: ToolCall[] = [];
      const reasoningDetails: unknown[] = [];
      let annotations: unknown[] | undefined;
      let usage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: null as number | null };
      let reasoningSignalled = false;

      for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
        resetIdle();
        for (const data of parser.push(decoder.decode(chunk, { stream: true }))) {
          if (data === '[DONE]') continue;
          let json: {
            model?: string;
            error?: { message?: string; code?: number | string };
            choices?: {
              delta?: {
                content?: string | null;
                reasoning?: string | null;
                reasoning_details?: unknown[];
                tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
                annotations?: unknown[];
              };
              finish_reason?: string | null;
              error?: { message?: string; code?: number };
            }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } };
          };
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }
          if (json.error) {
            const code = Number(json.error.code) || 500;
            throw new LLMError(json.error.message ?? 'Provider error', code, isRetryableStatus(code));
          }
          if (json.model) model = json.model;
          const choice = json.choices?.[0];
          if (choice?.error) {
            const code = Number(choice.error.code) || 500;
            throw new LLMError(choice.error.message ?? 'Provider error', code, isRetryableStatus(code));
          }
          const delta = choice?.delta;
          if (delta?.content) {
            content += delta.content;
            handlers.onText?.(delta.content);
          }
          if ((delta?.reasoning || delta?.reasoning_details?.length) && !reasoningSignalled) {
            reasoningSignalled = true;
            handlers.onReasoning?.();
          }
          if (delta?.reasoning_details?.length) reasoningDetails.push(...delta.reasoning_details);
          if (delta?.annotations?.length) annotations = [...(annotations ?? []), ...delta.annotations];
          for (const tc of delta?.tool_calls ?? []) {
            const existing = toolCalls[tc.index];
            if (!existing) {
              toolCalls[tc.index] = {
                id: tc.id ?? `call_${tc.index}_${Date.now()}`,
                type: 'function',
                function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '' },
              };
              if (tc.function?.name) handlers.onToolCallStart?.(tc.function.name);
            } else {
              if (tc.id && !existing.id.startsWith('call_')) existing.id = tc.id;
              if (tc.function?.name) existing.function.name += tc.function.name;
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
            }
          }
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          if (json.usage) {
            usage = {
              promptTokens: json.usage.prompt_tokens ?? 0,
              completionTokens: json.usage.completion_tokens ?? 0,
              cachedTokens: json.usage.prompt_tokens_details?.cached_tokens ?? 0,
              cost: typeof json.usage.cost === 'number' ? json.usage.cost : null,
            };
          }
        }
      }
      return {
        content,
        toolCalls: toolCalls.filter(Boolean),
        finishReason,
        usage,
        model,
        reasoningDetails: reasoningDetails.length ? reasoningDetails : undefined,
        annotations,
      };
    } catch (err) {
      if (err instanceof LLMError) throw err;
      if (req.signal?.aborted) throw new LLMError('Cancelled', 499, false, 'cancelled');
      if (controller.signal.aborted) throw new LLMError((controller.signal.reason as Error)?.message ?? 'Aborted', 504, true);
      throw new LLMError(`Stream error: ${(err as Error).message}`, 0, true);
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      req.signal?.removeEventListener('abort', onAbort);
    }
  }
}
