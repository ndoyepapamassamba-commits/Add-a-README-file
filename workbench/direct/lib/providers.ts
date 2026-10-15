// Browser side of the universal router: the encrypted key vault, the direct-provider calls (with key rotation), the
// direct models offered in the model pickers, and the telemetry of EVERY call (OpenRouter included).
import type { ModelInfo } from '@shared/types';
import { KeyVault } from '../../server/llm/keyVault';
import { Telemetry, type CallRecord } from '../../server/llm/telemetry';
import {
  PROVIDERS,
  listProviderModels,
  noKeyNeeded,
  parseRoute,
  priceFromCatalog,
  universalChat,
  type ProviderId,
} from '../../server/llm/universal';
import { isFreeQuota, restMsFor } from '../../server/llm/freeRoute';
import { compactRequest } from '../../server/llm/browserPrompt';
import { browserChat, browserModelInfo } from './localModel';
import { LLMError, type ChatRequest, type ChatResult, type StreamHandlers } from '../../server/llm/types';

const ls = typeof localStorage !== 'undefined' ? localStorage : null;
export const vault = new KeyVault(
  ls ?? { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
);
export const telemetry = new Telemetry(ls);

const MODELS_KEY = 'wbd.directModels.v1';
const CATALOG_KEY = 'wbd.catalog';
export function directModelIds(): Partial<Record<ProviderId, string[]>> {
  try {
    return JSON.parse(ls?.getItem(MODELS_KEY) ?? '{}') as Partial<Record<ProviderId, string[]>>;
  } catch {
    return {};
  }
}
function catalog(): { id: string; inputPrice: number | null; outputPrice: number | null }[] {
  try {
    return (JSON.parse(ls?.getItem(CATALOG_KEY) ?? 'null') as { models?: ModelInfo[] } | null)?.models ?? [];
  } catch {
    return [];
  }
}
/** Loads (and remembers) the model list of a provider with one of its keys. */
export async function refreshProviderModels(provider: ProviderId): Promise<string[]> {
  const k = noKeyNeeded(provider) ? null : vault.pick(provider);
  if (!noKeyNeeded(provider) && !k)
    throw new Error(`Aucune clé ${PROVIDERS[provider].label} utilisable dans le coffre.`);
  const base = k?.base ?? localBase(provider);
  const ids = await listProviderModels(provider, {
    key: k ? vault.secret(k.id) : '',
    base,
    fetch: (u, i) => fetch(u, i),
  });
  const all = directModelIds();
  all[provider] = ids;
  ls?.setItem(MODELS_KEY, JSON.stringify(all));
  return ids;
}
const LOCAL_BASE = 'wbd.localBase.v1';
export function localBase(p: ProviderId): string | undefined {
  try {
    return (JSON.parse(ls?.getItem(LOCAL_BASE) ?? '{}') as Record<string, string>)[p] || undefined;
  } catch {
    return undefined;
  }
}
export function setLocalBase(p: ProviderId, base: string): void {
  const all = (() => {
    try {
      return JSON.parse(ls?.getItem(LOCAL_BASE) ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  })();
  all[p] = base.trim();
  ls?.setItem(LOCAL_BASE, JSON.stringify(all));
}
/** The direct models as catalogue entries (« provider:model »), priced from the public catalogue when known. */
export function directModelInfos(): ModelInfo[] {
  const out: ModelInfo[] = [];
  const cat = catalog();
  // The free providers (no key) and the in-browser model are always offered, without « Charger les modèles ».
  const lists = { ...directModelIds() } as Partial<Record<ProviderId, string[]>>;
  for (const p of Object.keys(PROVIDERS) as ProviderId[])
    if ((PROVIDERS[p].keyless || PROVIDERS[p].kind === 'browser') && PROVIDERS[p].defaultModels)
      lists[p] = [...new Set([...(PROVIDERS[p].defaultModels ?? []), ...(lists[p] ?? [])])];
  for (const [p, ids] of Object.entries(lists) as [ProviderId, string[]][]) {
    for (const id of ids ?? []) {
      if (p === 'browser') {
        out.push(browserModelInfo(id));
        continue;
      }
      const price = priceFromCatalog(p, id, cat);
      out.push({
        id: `${p}:${id}`,
        name: `${id} — ${PROVIDERS[p].label} (direct)`,
        provider: PROVIDERS[p].label,
        created: 0,
        contextLength: 128_000,
        maxCompletionTokens: null,
        inputPrice: price?.input ?? null,
        outputPrice: price?.output ?? null,
        capabilities: { tools: true, reasoning: false, vision: p !== 'deepseek' && !PROVIDERS[p].keyless, structuredOutputs: false },
        efforts: [],
        defaultEffort: null,
        description: PROVIDERS[p].keyless
          ? 'Gratuit, sans clé ni compte (quota anonyme du service) — jamais pour des données confidentielles sans votre accord'
          : price
            ? price.source
            : 'prix non publié dans le catalogue public : coût affiché « inconnu »',
      });
    }
  }
  return out;
}
export const isDirect = (model: string) => parseRoute(model) !== null;

// A free provider that answered « quota » / « payment required » rests a few minutes (skipped by the free chain).
const COOL_KEY = 'wbd.freeCooled.v1';
export function freeCooled(): Record<string, number> {
  try {
    return JSON.parse(ls?.getItem(COOL_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function coolFree(p: ProviderId, ms: number) {
  const all = freeCooled();
  all[p] = Date.now() + ms;
  try {
    ls?.setItem(COOL_KEY, JSON.stringify(all));
  } catch {
    /* private mode */
  }
}

/**
 * A chat call on a direct provider: the key comes from the vault (rotation); a rate-limited or refused key is set
 * aside and the call retried once per remaining key. Cost: public price when known, else unknown (never 0 $).
 */
export async function directChat(
  req: ChatRequest,
  h: StreamHandlers = {},
  purpose = 'chat',
): Promise<ChatResult & { cost: number; costKnown: boolean }> {
  const route = parseRoute(req.model);
  if (!route) throw new Error(`Modèle non routé : ${req.model}`);
  const spec = PROVIDERS[route.provider];
  // THE IN-BROWSER MODEL: nothing leaves the computer, no key, no network once downloaded.
  if (spec.kind === 'browser') {
    const t0 = Date.now();
    try {
      const r = await browserChat(route.model, req, h);
      telemetry.record({
        at: Date.now(),
        provider: route.provider,
        model: route.model,
        purpose,
        ok: true,
        tokensIn: r.usage.promptTokens,
        tokensOut: r.usage.completionTokens,
        costUsd: 0,
        costSource: 'local',
        ttftMs: r.metrics.ttftMs,
        tokensPerS: r.metrics.tokensPerS,
        totalMs: r.metrics.totalMs,
      });
      return { ...r, usage: { ...r.usage, cost: 0 }, cost: 0, costKnown: true };
    } catch (err) {
      telemetry.record({ at: Date.now(), provider: route.provider, model: route.model, purpose, ok: false, tokensIn: 0, tokensOut: 0, costUsd: 0, costSource: 'local', ttftMs: null, tokensPerS: null, totalMs: Date.now() - t0, error: ((err as Error).message ?? '').slice(0, 160) });
      throw err;
    }
  }
  if (!noKeyNeeded(route.provider) && !vault.unlocked)
    throw new LLMError(
      'Coffre de clés verrouillé : ouvrez Fournisseurs et saisissez le mot de passe maître.',
      401,
      false,
    );
  const tried = new Set<string>();
  let last: unknown = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const k = noKeyNeeded(route.provider) ? null : vault.pick(route.provider);
    if (!noKeyNeeded(route.provider) && (!k || tried.has(k.id))) break;
    if (k) tried.add(k.id);
    // FREE ONLINE SERVICES count tokens per IP and per day: JEV compacts the request (its blocks first), and a
    // reasoning model gets enough room to write its answer after thinking (gpt-oss answered empty under 60 tokens).
    const sent: ChatRequest = spec.keyless
      ? (() => {
          const c = compactRequest(req.messages, req.tools ?? []);
          return { ...req, messages: c.messages, tools: req.tools?.length ? c.tools : req.tools, maxTokens: req.maxTokens ? Math.max(req.maxTokens, 1200) : req.maxTokens };
        })()
      : req;
    try {
      const r = await universalChat(
        route,
        sent,
        {
          key: k ? vault.secret(k.id) : '',
          base: k?.base ?? localBase(route.provider),
          fetch: (u, i) => fetch(u, i),
        },
        h,
      );
      const price = priceFromCatalog(route.provider, route.model, catalog());
      const cost = price
        ? (r.usage.promptTokens * price.input + r.usage.completionTokens * price.output) / 1e6
        : null;
      if (k)
        vault.record(k.id, {
          tokensIn: r.usage.promptTokens,
          tokensOut: r.usage.completionTokens,
          costUsd: cost,
          remainingRequests: r.metrics.remainingRequests,
          remainingTokens: r.metrics.remainingTokens,
        });
      telemetry.record({
        at: Date.now(),
        provider: route.provider,
        model: route.model,
        purpose,
        ok: true,
        tokensIn: r.usage.promptTokens,
        tokensOut: r.usage.completionTokens,
        costUsd: cost,
        costSource: noKeyNeeded(route.provider) ? 'local' : cost === null ? 'unknown' : 'calculated',
        ttftMs: r.metrics.ttftMs,
        tokensPerS: r.metrics.tokensPerS,
        totalMs: r.metrics.totalMs,
      });
      return { ...r, usage: { ...r.usage, cost }, cost: cost ?? 0, costKnown: cost !== null };
    } catch (err) {
      last = err;
      const e = err as LLMError & { retryAfterS?: number | null };
      if (k) vault.fail(k.id, e.status ?? 0, e.message ?? String(err), e.retryAfterS);
      telemetry.record({
        at: Date.now(),
        provider: route.provider,
        model: route.model,
        purpose,
        ok: false,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        costSource: 'measured',
        ttftMs: null,
        tokensPerS: null,
        totalMs: 0,
        error: (e.message ?? '').slice(0, 160),
      });
      if (spec.keyless && isFreeQuota(e.status)) coolFree(route.provider, restMsFor(e.retryAfterS, e.message ?? ''));
      // Another key may work for a quota / refused key; anything else is not a key problem.
      if (e.code === 'cancelled' || req.signal?.aborted || noKeyNeeded(route.provider) || ![401, 403, 429].includes(e.status))
        throw err;
    }
  }
  throw last instanceof Error
    ? last
    : new LLMError(`Aucune clé ${spec.label} utilisable (toutes au repos ou refusées).`, 429, true);
}

/** Telemetry of an OpenRouter call (the cost there is measured by OpenRouter when it reports it). */
export function recordOpenRouter(c: Omit<CallRecord, 'provider' | 'at'>): void {
  telemetry.record({ ...c, provider: 'openrouter', at: Date.now() });
}
