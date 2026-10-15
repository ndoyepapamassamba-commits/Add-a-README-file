// LES MOTEURS DE RECHERCHE GRATUITS, SANS CLÉ NI COMPTE (v62 — « que des services gratuits, j'ai peur que Tavily ne
// suffise pas », « Exa aussi »). Quatre moteurs web complets, chacun avec SON quota, appelés depuis la page de l'app
// (CORS ouverts, mesurés le 15/10/2026) :
//   • Tavily sans clé    — en-tête « X-Tavily-Access-Mode: keyless » ;
//   • Parallel Search    — serveur MCP public anonyme (objectif + requêtes courtes, extraits longs et datés) ;
//   • Exa                — serveur MCP public sans clé (description de la page idéale, PDF officiels compris) ;
//   • Firecrawl sans clé — API REST sans autorisation (web, actualités, images avec leur taille).
// Chaque recherche est d'abord AFFINÉE selon le cas du chat (searchPlan : intention, zone, langue, forme propre à chaque
// moteur), puis confiée aux moteurs les plus forts pour ce cas, en alternance ; un moteur qui répond « quota » est mis au
// repos 15 minutes. AUCUN quota n'est supprimé : ils s'additionnent, et le compteur ci-dessous les rend visibles.
import {
  COOL_MS,
  EXA_MCP,
  firecrawlSearchRequest,
  isQuota,
  KEYLESS_ENGINES,
  keylessOrder,
  mcpRpc,
  PARALLEL_MCP,
  parseExa,
  parseFirecrawl,
  parseFirecrawlImages,
  parseMcpBody,
  parseParallel,
  parseTavily,
  PROVIDER_LABEL,
  tavilyRequest,
  type KeylessEngine,
  type WebImage,
} from '../../server/jev/web/search';
import { exaQuery, planLabel, rankForPlan, searchPlan, type SearchPlan } from '../../server/jev/web/searchPlan';
import type { BraveHit } from '../../server/jev/web/brave';

const STATE_KEY = 'massamba.keyless';
interface EngineState {
  turn: number;
  cooled: Partial<Record<KeylessEngine, number>>;
  /** Searches per engine and month (« 2026-10 »), successful or not — what the free quotas count. */
  used: Partial<Record<KeylessEngine, Record<string, number>>>;
  /** Last time the engine answered « quota » (402/429/432/433). */
  lastQuota: Partial<Record<KeylessEngine, number>>;
}
const state: EngineState = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as Partial<EngineState>;
    return { turn: s.turn ?? 0, cooled: s.cooled ?? {}, used: s.used ?? {}, lastQuota: s.lastQuota ?? {} };
  } catch {
    return { turn: 0, cooled: {}, used: {}, lastQuota: {} };
  }
})();
const save = () => {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* private mode: the rotation and the counters simply restart */
  }
};
const month = () => new Date().toISOString().slice(0, 7);
function count(e: KeylessEngine) {
  const m = month();
  const u = (state.used[e] ??= {});
  u[m] = (u[m] ?? 0) + 1;
  save();
}
function rest(e: KeylessEngine) {
  state.cooled[e] = Date.now() + COOL_MS;
  state.lastQuota[e] = Date.now();
  save();
}

export const ENGINE_LABEL: Record<KeylessEngine, string> = { tavily: PROVIDER_LABEL.keyless, parallel: PROVIDER_LABEL.parallel, exa: PROVIDER_LABEL.exa, firecrawl: PROVIDER_LABEL.firecrawl };
/** What each free engine has served this month, and whether it is resting — shown in the settings. */
export function keylessUsage(): { engine: KeylessEngine; label: string; month: number; resting: boolean; lastQuota: number | null }[] {
  const m = month();
  const now = Date.now();
  return KEYLESS_ENGINES.map((e) => ({ engine: e, label: ENGINE_LABEL[e], month: state.used[e]?.[m] ?? 0, resting: (state.cooled[e] ?? 0) > now, lastQuota: state.lastQuota[e] ?? null }));
}

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

async function timed<T>(ms: number, outer: AbortSignal | undefined, f: (s: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController();
  const stop = () => ac.abort();
  outer?.addEventListener('abort', stop);
  const t = setTimeout(stop, ms);
  try {
    return await f(ac.signal);
  } finally {
    clearTimeout(t);
    outer?.removeEventListener('abort', stop);
  }
}

// ── MCP (Streamable HTTP) for Parallel and Exa: initialize once, keep the session ~10 minutes, then tools/call ────────
const MCP_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' };
const sessions = new Map<string, { id: string | null; at: number }>();
const mcpPost = (url: string, body: string, signal: AbortSignal, session: string | null) =>
  fetch(url, { method: 'POST', headers: { ...MCP_HEADERS, ...(session ? { 'Mcp-Session-Id': session } : {}) }, body, signal });
async function mcpOpen(url: string, signal: AbortSignal): Promise<string | null> {
  const s = sessions.get(url);
  if (s && Date.now() - s.at < 10 * 60_000) return s.id;
  const r = await mcpPost(url, mcpRpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'massamba-workbench', version: '62' } }), signal, null);
  if (!r.ok) throw new EngineError(`HTTP ${r.status}`, r.status);
  const id = r.headers.get('mcp-session-id');
  await r.text();
  await mcpPost(url, mcpRpc(null, 'notifications/initialized'), signal, id)
    .then((x) => x.text())
    .catch(() => '');
  sessions.set(url, { id, at: Date.now() });
  return id;
}
/** Calls one tool of a public MCP server; the raw JSON-RPC answer. */
export async function mcpTool(url: string, tool: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const call = async () => mcpPost(url, mcpRpc(2, 'tools/call', { name: tool, arguments: args }), signal, await mcpOpen(url, signal));
  let r = await call();
  if (r.status === 404 || r.status === 400) {
    // Expired session: open a new one once.
    sessions.delete(url);
    r = await call();
  }
  if (!r.ok) throw new EngineError(`HTTP ${r.status}`, r.status);
  return parseMcpBody(await r.text());
}

// ── the four engines, each fed the form of the plan it reads best ──────────────────────────────────────────────────
type Engine = (p: SearchPlan, n: number, s: AbortSignal) => Promise<BraveHit[]>;
const RUN: Record<KeylessEngine, Engine> = {
  async tavily(p, n, signal) {
    const rq = tavilyRequest(null, p.keywords, n);
    const r = await fetch(rq.url, { ...rq.init, signal });
    if (!r.ok) throw new EngineError(`HTTP ${r.status}`, r.status);
    return parseTavily(await r.json(), n);
  },
  async firecrawl(p, n, signal) {
    const rq = firecrawlSearchRequest(null, p.keywords, n, p.firecrawlSources);
    const r = await fetch(rq.url, { ...rq.init, signal });
    if (!r.ok) throw new EngineError(`HTTP ${r.status}`, r.status);
    return parseFirecrawl(await r.json(), n);
  },
  async parallel(p, n, signal) {
    return parseParallel(await mcpTool(PARALLEL_MCP, 'web_search', { objective: p.objective, search_queries: p.queries }, signal), n);
  },
  async exa(p, n, signal) {
    return parseExa(await mcpTool(EXA_MCP, 'web_search_exa', { query: exaQuery(p), numResults: Math.min(10, Math.max(3, n)) }, signal), n);
  },
};

/**
 * One web search on the free engines, refined for the case of the chat (`chat` = the user's request / the session's
 * subject). The first engine that gives results wins; its results are re-ranked for the case (official sources first
 * for rules and data, dated items first for news).
 */
export async function keylessSearch(query: string, n: number, signal?: AbortSignal, chat = ''): Promise<{ hits: BraveHit[]; via: string; errors: string[]; plan: SearchPlan }> {
  const plan = searchPlan(query, chat);
  const errors: string[] = [];
  const order = keylessOrder(state.turn++, state.cooled, Date.now(), plan.intent === 'general' ? undefined : plan.prefer);
  save();
  for (const e of order) {
    if (signal?.aborted) break;
    count(e);
    try {
      const hits = await timed(15_000, signal, (s) => RUN[e](plan, n, s));
      if (hits.length) return { hits: rankForPlan(hits, plan).slice(0, n), via: `${ENGINE_LABEL[e]} · ${planLabel(plan)}`, errors, plan };
      errors.push(`${ENGINE_LABEL[e]} : 0 résultat`);
    } catch (err) {
      const status = (err as EngineError).status ?? null;
      if (status && isQuota(status)) rest(e);
      errors.push(`${ENGINE_LABEL[e]} : ${(err as Error).name === 'AbortError' ? 'délai dépassé' : (err as Error).message}`);
    }
  }
  return { hits: [], via: '', errors, plan };
}

/** Design images with their size (Firecrawl « images », free) — complements Tavily's images in the gallery. */
export async function keylessImages(query: string, n = 10, signal?: AbortSignal): Promise<WebImage[]> {
  if ((state.cooled.firecrawl ?? 0) > Date.now()) return [];
  count('firecrawl');
  return timed(15_000, signal, async (s) => {
    const rq = firecrawlSearchRequest(null, query, n, ['images']);
    const r = await fetch(rq.url, { ...rq.init, signal: s });
    if (!r.ok) {
      if (isQuota(r.status)) rest('firecrawl');
      throw new EngineError(`HTTP ${r.status}`, r.status);
    }
    return parseFirecrawlImages(await r.json(), n);
  });
}
