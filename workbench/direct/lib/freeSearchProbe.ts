// TEST DE DISPONIBILITÉ DE LA RECHERCHE GRATUITE (v62 — « teste la disponibilité des alternatives Tavily avant de
// livrer »). Chaque service sans clé est appelé DEPUIS LE NAVIGATEUR de l'app (origine file:// ou http://localhost), comme
// le fera l'analyste : statut HTTP, latence, nombre de résultats utiles, et la raison d'un échec (quota, CORS, réseau).
// Rien n'est inventé : une ligne « disponible » est un appel qui vient de répondre avec des résultats.
import { ecbRates, frankfurterUrl, jinaReaderUrl, parseExaFetch, parseJinaReader, parseParallelFetch, parseWikidata, wikidataQuery, wikidataUrl } from '../../server/jev/web/freeTools';
import { crossrefUrl, ddgUrl, EXA_MCP, firecrawlSearchRequest, mcpRpc, PARALLEL_MCP, parseExa, parallelQueries, parseCrossref, parseDdg, parseFirecrawl, parseFirecrawlImages, parseMcpBody, parseParallel, parseTavily, parseTavilyImages, parseWiki, tavilyImagesRequest, tavilyRequest, wikiUrl } from '../../server/jev/web/search';

export interface ProbeRow {
  id: string;
  label: string;
  ok: boolean;
  status: number | null;
  ms: number;
  hits: number;
  note: string;
}

const why = (status: number | null, e?: unknown): string => {
  if (status === 429 || status === 432 || status === 433) return 'quota ou limite de débit atteint (réessayer plus tard)';
  if (status === 401 || status === 403) return 'refusé (clé ou accès)';
  if (status && status >= 500) return 'service indisponible';
  if (status) return `réponse HTTP ${status}`;
  const m = String((e as Error)?.message ?? e ?? '');
  if (/abort/i.test(m)) return 'délai dépassé (12 s)';
  // fetch() hides the CORS refusal behind a generic TypeError.
  return /failed to fetch|networkerror|load failed/i.test(m) ? 'bloqué (CORS) ou réseau coupé' : m.slice(0, 120);
};

async function one(id: ProbeRow['id'], label: string, url: string, init: RequestInit | ((s: AbortSignal) => Promise<RequestInit>), count: (j: unknown) => number, outer?: AbortSignal, raw = false): Promise<ProbeRow> {
  const ac = new AbortController();
  const stop = () => ac.abort();
  outer?.addEventListener('abort', stop);
  const t = setTimeout(stop, 12_000);
  const t0 = performance.now();
  try {
    const r = await fetch(url, { ...(typeof init === 'function' ? await init(ac.signal) : init), signal: ac.signal });
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) return { id, label, ok: false, status: r.status, ms, hits: 0, note: why(r.status) };
    // DuckDuckGo answers « 202 » with an EMPTY body when it suspects a robot: available on paper, useless in practice.
    const body = await r.text();
    if (!body.trim()) return { id, label, ok: false, status: r.status, ms, hits: 0, note: `réponse vide (HTTP ${r.status}, limite anti-robot)` };
    const hits = count(raw ? body : JSON.parse(body));
    return { id, label, ok: hits > 0, status: r.status, ms, hits, note: hits ? 'disponible' : 'répond, mais 0 résultat pour cette requête' };
  } catch (e) {
    return { id, label, ok: false, status: null, ms: Math.round(performance.now() - t0), hits: 0, note: why(null, e) };
  } finally {
    clearTimeout(t);
    outer?.removeEventListener('abort', stop);
  }
}

/** Calls every free search service in parallel from this page; one row per service. */
export async function probeFreeSearch(query = 'risque de concentration bancaire', signal?: AbortSignal): Promise<ProbeRow[]> {
  const ts = tavilyRequest(null, query, 5);
  const ti = tavilyImagesRequest(null, 'dashboard design award');
  const fs = firecrawlSearchRequest(null, query, 5, ['web']);
  const fi = firecrawlSearchRequest(null, 'finance dashboard design dribbble', 10, ['images']);
  // Parallel speaks MCP: the session is opened inside the timed call, then web_search is called.
  const H = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' };
  const mcpInit = (url: string, tool: string, args: Record<string, unknown>) => async (s: AbortSignal): Promise<RequestInit> => {
    const r = await fetch(url, { method: 'POST', headers: H, body: mcpRpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'massamba-probe', version: '62' } }), signal: s });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const sid = r.headers.get('mcp-session-id');
    await r.text();
    const h = { ...H, ...(sid ? { 'Mcp-Session-Id': sid } : {}) };
    await fetch(url, { method: 'POST', headers: h, body: mcpRpc(null, 'notifications/initialized'), signal: s }).then((x) => x.text());
    return { method: 'POST', headers: h, body: mcpRpc(2, 'tools/call', { name: tool, arguments: args }) };
  };
  return Promise.all([
    one('tavily', 'Tavily sans clé — recherche', ts.url, ts.init, (j) => parseTavily(j, 5).length, signal),
    one('tavily-images', 'Tavily sans clé — images', ti.url, ti.init, (j) => parseTavilyImages(j, 20).length, signal),
    one('parallel', 'Parallel Search sans clé (MCP)', PARALLEL_MCP, mcpInit(PARALLEL_MCP, 'web_search', { objective: query, search_queries: parallelQueries(query) }), (t) => parseParallel(parseMcpBody(String(t)), 8).length, signal, true),
    one('exa', 'Exa sans clé (MCP)', EXA_MCP, mcpInit(EXA_MCP, 'web_search_exa', { query: `Analyse fiable sur : ${query}`, numResults: 5 }), (t) => parseExa(parseMcpBody(String(t)), 8).length, signal, true),
    one('firecrawl', 'Firecrawl sans clé — recherche', fs.url, fs.init, (j) => parseFirecrawl(j, 5).length, signal),
    one('firecrawl-images', 'Firecrawl sans clé — images (avec taille)', fi.url, fi.init, (j) => parseFirecrawlImages(j, 10).length, signal),
    one('duckduckgo', 'DuckDuckGo (réponse instantanée)', ddgUrl('IFRS 9'), {}, (j) => parseDdg(j, 5).length, signal),
    one('wikipedia', 'Wikipédia (fr)', wikiUrl(query, 'fr', 4), {}, (j) => parseWiki(j, 'fr', 4).length, signal),
    one('crossref', 'Crossref (articles scientifiques)', crossrefUrl(query, 4), {}, (j) => parseCrossref(j, 4).length, signal),
  ]);
}

const PAGE = 'https://www.bis.org/bcbs/publ/d595.htm';
const llm = (base: string, path: string, model: string): [string, RequestInit] => [
  `${base}${path}`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: 'user', content: 'Réponds en une phrase : que mesure le ratio de créances en souffrance ?' }] }) },
];
/** v63: the new free services (page reading, ECB, Wikidata, keyless LLMs), called from this page like the app does. */
export async function probeFreeTools(signal?: AbortSignal): Promise<ProbeRow[]> {
  const H = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' };
  const mcpInit = (url: string, tool: string, args: Record<string, unknown>) => async (s: AbortSignal): Promise<RequestInit> => {
    const r = await fetch(url, { method: 'POST', headers: H, body: mcpRpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'massamba-probe', version: '63' } }), signal: s });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const sid = r.headers.get('mcp-session-id');
    await r.text();
    const h = { ...H, ...(sid ? { 'Mcp-Session-Id': sid } : {}) };
    await fetch(url, { method: 'POST', headers: h, body: mcpRpc(null, 'notifications/initialized'), signal: s }).then((x) => x.text());
    return { method: 'POST', headers: h, body: mcpRpc(2, 'tools/call', { name: tool, arguments: args }) };
  };
  const answered = (j: unknown) => ((j as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content?.trim() ? 1 : 0);
  const [l7u, l7i] = llm('https://api.llm7.io/v1', '/chat/completions', 'gpt-oss:20b');
  const [pou, poi] = llm('https://text.pollinations.ai', '/openai', 'openai');
  return Promise.all([
    one('exa-read', 'Lecture de page — Exa (web_fetch_exa)', EXA_MCP, mcpInit(EXA_MCP, 'web_fetch_exa', { urls: [PAGE], maxCharacters: 2000 }), (t) => parseExaFetch(parseMcpBody(String(t))).length, signal, true),
    one('parallel-read', 'Lecture de page — Parallel (web_fetch)', PARALLEL_MCP, mcpInit(PARALLEL_MCP, 'web_fetch', { urls: [PAGE], objective: 'principes de gestion du risque de crédit' }), (t) => parseParallelFetch(parseMcpBody(String(t))).length, signal, true),
    one('jina-read', 'Lecture de page — Jina Reader', jinaReaderUrl(PAGE), { headers: { Accept: 'text/plain' } }, (t) => (parseJinaReader(String(t), PAGE) ? 1 : 0), signal, true),
    one('ecb', 'Taux de référence BCE (Frankfurter)', frankfurterUrl('EUR', { symbols: ['USD'] }), {}, (j) => (ecbRates(j, 'EUR', ['USD', 'XOF'])?.rates.USD ? 2 : 0), signal),
    one('wikidata', 'Fiche d’entité (Wikidata)', wikidataUrl(wikidataQuery('Ecobank', 'fr', 1)), { headers: { Accept: 'application/sparql-results+json' } }, (j) => parseWikidata(j).length, signal),
    one('llm7', 'Modèle gratuit sans clé — LLM7 (gpt-oss 20B)', l7u, l7i, answered, signal),
    one('pollinations', 'Modèle gratuit sans clé — Pollinations', pou, poi, answered, signal),
  ]);
}

/** One line for the chat or the settings: how many services answered. */
export const probeSummary = (rows: ProbeRow[]) => `${rows.filter((r) => r.ok).length}/${rows.length} service(s) gratuit(s) disponible(s) : ${rows.filter((r) => r.ok).map((r) => r.label).join(', ') || 'aucun'}`;
