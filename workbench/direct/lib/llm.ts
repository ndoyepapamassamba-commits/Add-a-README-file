// OpenRouter access straight from the browser (same client code as the server).
import type { CreditsInfo, ModelInfo, ReasoningEffort } from '@shared/types';
import { OpenRouterProvider, resolveEffort, type FetchLike } from '../../server/llm/openrouterCore';
import { applyPromptCaching } from '../../server/llm/service';
import { LLMError, type ChatRequest, type ChatResult } from '../../server/llm/types';

const BASE = 'https://openrouter.ai/api/v1';
const KEY_NAME = 'wbd.openrouter-key';

// ── API key: kept only in this browser (never in the HTML file) ──────────
export function getKey(): string {
  try {
    return sessionStorage.getItem(KEY_NAME) || localStorage.getItem(KEY_NAME) || '';
  } catch {
    return '';
  }
}
export function setKey(key: string, remember: boolean): void {
  clearKey();
  (remember ? localStorage : sessionStorage).setItem(KEY_NAME, key.trim());
}
export function clearKey(): void {
  localStorage.removeItem(KEY_NAME);
  sessionStorage.removeItem(KEY_NAME);
}
export function maskKey(key: string): string {
  return key ? `${key.slice(0, 8)}…${key.slice(-4)}` : '';
}

const browserFetch: FetchLike = (url, init) => fetch(url, init) as ReturnType<FetchLike>;

export const provider = new OpenRouterProvider({
  baseUrl: BASE,
  appUrl: 'https://openrouter-workbench.local',
  appName: 'MASSAMBA Workbench (direct)',
  getApiKey: () => getKey() || undefined,
  fetch: browserFetch,
  idleTimeoutMs: 180_000,
});

// ── live model catalog (public endpoint, cached 1 h) ─────────────────────
const CATALOG_KEY = 'wbd.catalog';
export async function loadCatalog(force = false): Promise<ModelInfo[]> {
  try {
    const cached = JSON.parse(localStorage.getItem(CATALOG_KEY) ?? 'null') as {
      at: number;
      models: ModelInfo[];
    } | null;
    if (!force && cached && Date.now() - cached.at < 3_600_000 && cached.models.length) return cached.models;
  } catch {
    /* ignore */
  }
  const models = await provider.listModels();
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify({ at: Date.now(), models }));
  } catch {
    /* quota: keep in memory only */
  }
  return models;
}

export function credits(): Promise<CreditsInfo> {
  return provider.credits();
}

export function estimateCost(m: ModelInfo | undefined, tokensIn: number, tokensOut: number): number {
  if (!m || m.inputPrice === null || m.outputPrice === null) return 0;
  return (tokensIn * m.inputPrice + tokensOut * m.outputPrice) / 1_000_000;
}

export interface CompleteOptions {
  models: ModelInfo[];
  fallbacks: string[];
  effort: ReasoningEffort | 'auto';
  maxRetries?: number;
  onText?: (d: string) => void;
  onReset?: () => void;
  onStatus?: (s: string) => void;
  onFallback?: (from: string, to: string, reason: string) => void;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new LLMError('Cancelled', 499, false, 'cancelled'));
    });
  });

/** Streaming completion with retries, effort mapping, prompt caching and a fallback chain. */
export async function complete(
  req: ChatRequest,
  o: CompleteOptions,
): Promise<ChatResult & { cost: number; model: string }> {
  if (!getKey())
    throw new LLMError('Clé OpenRouter manquante : ouvrez Réglages et collez votre clé.', 401, false);
  const chain = [...new Set([req.model, ...o.fallbacks].filter((m) => m && m !== 'auto'))];
  const maxRetries = o.maxRetries ?? 2;
  let last: unknown = null;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i]!;
    if (i > 0) o.onFallback?.(chain[i - 1]!, model, (last as Error)?.message ?? 'échec');
    const info = o.models.find((m) => m.id === model);
    const effort = o.effort !== 'auto' && info ? resolveEffort(o.effort, info.efforts) : null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let streamed = false;
      try {
        const r = await provider.chat(
          {
            ...req,
            model,
            messages: applyPromptCaching(model, req.messages),
            reasoningEffort: effort ?? undefined,
            maxTokens:
              req.maxTokens && info?.maxCompletionTokens
                ? Math.min(req.maxTokens, info.maxCompletionTokens)
                : req.maxTokens,
          },
          {
            onText: (d) => {
              streamed = true;
              o.onText?.(d);
            },
            onReasoning: () => o.onStatus?.('Réflexion…'),
          },
        );
        const cost = r.usage.cost ?? estimateCost(info, r.usage.promptTokens, r.usage.completionTokens);
        return { ...r, cost, model: r.model || model };
      } catch (err) {
        last = err;
        if (streamed) o.onReset?.();
        const e = err instanceof LLMError ? err : new LLMError((err as Error).message, 0, true);
        if (e.code === 'cancelled' || req.signal?.aborted)
          throw new LLMError('Cancelled', 499, false, 'cancelled');
        if (e.retryable && attempt < maxRetries) {
          o.onStatus?.(`Nouvelle tentative ${attempt + 1} (${model}) : ${e.message.slice(0, 120)}`);
          await sleep(Math.min(8000, 1000 * 2 ** attempt), req.signal);
          continue;
        }
        const modelProblem =
          e.status === 404 || /model|provider|unavailable|not found|no endpoints/i.test(e.message);
        if (!e.retryable && !modelProblem) throw e;
        break;
      }
    }
  }
  throw last instanceof Error ? last : new Error('Tous les modèles ont échoué');
}

export function friendlyError(err: unknown): string {
  const e = err as LLMError;
  if (e?.status === 401) return 'OpenRouter refuse la clé (401). Vérifiez-la dans Réglages.';
  if (e?.status === 402) return `Crédits OpenRouter insuffisants : ${e.message}`;
  if (e?.status === 0 || /Failed to fetch|NetworkError/i.test(e?.message ?? ''))
    return 'Impossible de joindre openrouter.ai (connexion internet, pare-feu ou proxy de l’entreprise ?).';
  return e?.message ?? String(err);
}
