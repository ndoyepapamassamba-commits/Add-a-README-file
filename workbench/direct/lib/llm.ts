// OpenRouter access straight from the browser (same client code as the server).
import type { CreditsInfo, ModelInfo, ReasoningEffort } from '@shared/types';
import { OpenRouterProvider, resolveEffort, type FetchLike } from '../../server/llm/openrouterCore';
import { applyPromptCaching } from '../../server/llm/service';
import { LLMError, type ChatRequest, type ChatResult } from '../../server/llm/types';
import { directChat, directModelInfos, freeCooled, isDirect, recordOpenRouter } from './providers';
import { carriesImages, carriesPrivateData, freeCanTakeOver, freePlan, type FreePlan } from '../../server/llm/freeRoute';
import { langOfRequest, lastUserText, streamWatch, type Intervention } from '../../server/jev/brain';
import { freeOptions } from './freeMode';

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
const BATCH = /(:batch\b|\(batch\))/i;
export async function loadCatalog(force = false): Promise<ModelInfo[]> {
  try {
    const cached = JSON.parse(localStorage.getItem(CATALOG_KEY) ?? 'null') as {
      at: number;
      models: ModelInfo[];
    } | null;
    if (!force && cached && Date.now() - cached.at < 3_600_000 && cached.models.length)
      return [...cached.models.filter((m) => !BATCH.test(m.id)), ...directModelInfos()];
  } catch {
    /* ignore */
  }
  // Batch-only variants cannot answer through chat/completions: they are never offered anywhere in the app.
  const models = (await provider.listModels()).filter((m) => !BATCH.test(m.id));
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify({ at: Date.now(), models }));
  } catch {
    /* quota: keep in memory only */
  }
  // The models of the direct providers (Anthropic, OpenAI, Gemini, Mistral, Groq, DeepSeek, Ollama, LM Studio).
  return [...models, ...directModelInfos()];
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
  /** What the call serves (telemetry: chat, 3D generation, auto-correction…). */
  purpose?: string;
  /** false = JEV's brain does not touch this call (its own learning calls). */
  jev?: boolean;
}

type Completion = ChatResult & { cost: number; model: string; costSource: 'measured' | 'calculated' };
/**
 * THE JEV BRAIN on every model call of the app (v63): before — focus frame, learned techniques, lessons, cached answer,
 * the model JEV prefers (free first for light tasks); after — local QA, cache, learning. Registered by jevBrain.ts.
 */
export interface BrainHooks {
  before(req: ChatRequest, o: CompleteOptions): Promise<{ req: ChatRequest; cached?: Completion; prefer?: string[] }>;
  after(req: ChatRequest, o: CompleteOptions, res: Completion, info: { preferred: boolean }): Promise<{ accept: boolean }>;
  /** JEV intervened DURING the request (loop, language drift). */
  onIntervene?(kind: string): void;
  /** The stream is watched during the request. */
  watching?(): boolean;
}
let brain: BrainHooks | null = null;
export const setBrainHooks = (h: BrainHooks | null) => {
  brain = h;
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new LLMError('Cancelled', 499, false, 'cancelled'));
    });
  });

/** The free chain for this request (keyless services, then the in-browser model; private data → in-browser only). */
export function freeChainFor(req: ChatRequest): FreePlan {
  const fo = freeOptions();
  return freePlan({
    privateData: carriesPrivateData(req.messages),
    allowCloudOnPrivate: fo.allowCloudOnPrivate,
    browser: fo.browser,
    cooled: freeCooled(),
    now: Date.now(),
  });
}

/**
 * Streaming completion with retries, effort mapping, prompt caching and a fallback chain, fed and checked by JEV.
 * FREE WITHOUT A KEY (v63): with no OpenRouter key the free chain answers; with a key, it takes over when every model
 * failed for a key, credit, quota or network reason.
 */
export async function complete(req: ChatRequest, o: CompleteOptions): Promise<Completion> {
  if (!brain || o.jev === false) return completeCore(req, o);
  const pre: Awaited<ReturnType<BrainHooks['before']>> | null = await brain.before(req, o).catch(() => null);
  if (pre?.cached) return pre.cached;
  const fed = pre?.req ?? req;
  // JEV TAKES THE MODEL IN HAND: a light task tries the free models first; its QA hands over to the asked model.
  if (pre?.prefer?.length && !req.signal?.aborted) {
    try {
      const r = await watched(fed, { ...o, fallbacks: [] }, pre.prefer);
      const v = await brain.after(fed, o, r, { preferred: true }).catch(() => ({ accept: true }));
      if (v.accept) return r;
      o.onReset?.();
      o.onFallback?.(r.model, req.model, 'JEV QA : réponse gratuite insuffisante → modèle demandé');
    } catch (err) {
      if (req.signal?.aborted) throw err;
      o.onReset?.();
    }
  }
  const r = await watched(fed, o);
  await brain.after(fed, o, r, { preferred: false }).catch(() => undefined);
  return r;
}

/**
 * JEV DURING THE REQUEST: the streamed text is watched; a repetition loop or a language drift stops the call at once
 * (tokens no longer paid) and the same request is sent again ONCE with the corrective instruction.
 */
async function watched(req: ChatRequest, o: CompleteOptions, override?: string[]): Promise<Completion> {
  if (!o.onText || !brain?.watching?.()) return completeCore(req, o, override);
  const ws = { text: '', lang: langOfRequest(lastUserText(req.messages)) };
  const inner = new AbortController();
  const outer = req.signal;
  const stop = () => inner.abort();
  outer?.addEventListener('abort', stop);
  const seen: { hit: Intervention | null } = { hit: null };
  const retry = (hit: Intervention) => {
    brain?.onIntervene?.(hit.kind);
    o.onReset?.();
    o.onStatus?.(`JEV intervient pendant la requête : ${hit.why} → relance corrigée`);
    return completeCore({ ...req, messages: [...req.messages, { role: 'user', content: hit.fix }] }, o, override);
  };
  try {
    const r = await completeCore(
      { ...req, signal: inner.signal },
      {
        ...o,
        onText: (d) => {
          ws.text += d;
          o.onText?.(d);
          if (!seen.hit && (seen.hit = streamWatch(ws))) inner.abort();
        },
      },
      override,
    );
    // The stream may have ended before the cut took effect: a detected loop / drift is never accepted.
    return seen.hit && !outer?.aborted ? await retry(seen.hit) : r;
  } catch (err) {
    const hit = seen.hit;
    if (!hit || outer?.aborted) throw err;
    return retry(hit);
  } finally {
    outer?.removeEventListener('abort', stop);
  }
}

async function completeCore(req: ChatRequest, o: CompleteOptions, override?: string[]): Promise<Completion> {
  let chain = override ?? [...new Set([req.model, ...o.fallbacks].filter((m) => m && m !== 'auto'))];
  let freeUsed = false;
  if (!getKey() && !chain.every(isDirect)) {
    const p = freeChainFor(req);
    chain = [...new Set([...chain.filter(isDirect), ...p.chain])];
    freeUsed = true;
    if (!chain.length) throw new LLMError(`Aucune clé et aucun modèle gratuit utilisable : ${p.note}.`, 401, false);
    o.onStatus?.(`Sans clé — ${p.note}`);
  }
  try {
    return await runChain(req, o, chain);
  } catch (err) {
    if (freeUsed || req.signal?.aborted || carriesImages(req.messages) || !freeCanTakeOver(err)) throw err;
    const p = freeChainFor(req);
    const rest = p.chain.filter((m) => !chain.includes(m));
    if (!rest.length) throw err;
    o.onFallback?.(chain[chain.length - 1] ?? req.model, rest[0]!, `${String((err as Error).message ?? err).slice(0, 120)} → ${p.note}`);
    return runChain(req, o, rest);
  }
}

async function runChain(req: ChatRequest, o: CompleteOptions, chain: string[]): Promise<Completion> {
  const maxRetries = o.maxRetries ?? 2;
  let last: unknown = null;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i]!;
    if (i > 0) o.onFallback?.(chain[i - 1]!, model, (last as Error)?.message ?? 'échec');
    const info = o.models.find((m) => m.id === model);
    const effort = o.effort !== 'auto' && info ? resolveEffort(o.effort, info.efforts) : null;
    // DIRECT PROVIDER (« anthropic:… », « ollama:… »): the universal router, keys from the encrypted vault.
    if (isDirect(model)) {
      try {
        const r = await directChat(
          { ...req, model },
          { onText: (d) => o.onText?.(d), onReasoning: () => o.onStatus?.('Réflexion…') },
          o.purpose ?? 'chat',
        );
        // Cost from the public price when the model is listed there (0 + « inconnu » in the telemetry otherwise).
        return { ...r, cost: r.cost, costSource: 'calculated', model };
      } catch (err) {
        last = err;
        if ((err as LLMError).code === 'cancelled' || req.signal?.aborted)
          throw new LLMError('Cancelled', 499, false, 'cancelled');
        o.onReset?.();
        continue;
      }
    }
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let streamed = false;
      const t0 = performance.now();
      let first: number | null = null;
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
              first ??= performance.now();
              o.onText?.(d);
            },
            onReasoning: () => o.onStatus?.('Réflexion…'),
            onToolCallStart: () => {
              first ??= performance.now();
            },
          },
        );
        const cost = r.usage.cost ?? estimateCost(info, r.usage.promptTokens, r.usage.completionTokens);
        const t1 = performance.now();
        const gen = first !== null ? (t1 - first) / 1000 : 0;
        recordOpenRouter({
          model: r.model || model,
          purpose: o.purpose ?? 'chat',
          ok: true,
          tokensIn: r.usage.promptTokens,
          tokensOut: r.usage.completionTokens,
          costUsd: r.usage.cost ?? (info?.inputPrice != null ? cost : null),
          costSource: r.usage.cost != null ? 'measured' : info?.inputPrice != null ? 'calculated' : 'unknown',
          ttftMs: first !== null ? Math.round(first - t0) : null,
          tokensPerS:
            first !== null && gen > 0.05 ? Math.round((r.usage.completionTokens / gen) * 10) / 10 : null,
          totalMs: Math.round(t1 - t0),
        });
        return {
          ...r,
          cost,
          costSource: r.usage.cost != null ? 'measured' : 'calculated',
          model: r.model || model,
        };
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
  if (e?.status === 401) return 'OpenRouter refuse la clé (401). Vérifiez-la dans Paramètres.';
  if (e?.status === 402) return `Crédits OpenRouter insuffisants : ${e.message}`;
  if (e?.status === 0 || /Failed to fetch|NetworkError/i.test(e?.message ?? ''))
    return 'Impossible de joindre openrouter.ai (connexion internet, pare-feu ou proxy de l’entreprise ?).';
  return e?.message ?? String(err);
}
