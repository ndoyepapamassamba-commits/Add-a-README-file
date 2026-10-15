#!/usr/bin/env node
// SERVEUR MCP « MASSAMBA » (v63, lot C — « rendre l'app en LLM avec des outils puissants »). L'app devient elle-même un
// serveur MCP : Claude Desktop, Claude Code ou tout client MCP utilisent ses outils, SUR L'ORDINATEUR de l'utilisateur,
// sans clé ni compte :
//   • la recherche et la lecture Internet gratuites de JEV (Exa, Parallel, Tavily, Firecrawl sans clé ; Jina Reader) ;
//   • la bibliothèque mondiale de JEV (19 sources publiques) ; les taux BCE + F CFA ; les fiches Wikidata ; SSRN / arXiv ;
//   • l'analyse LOCALE d'un fichier Excel / CSV (brief : KPI, concentration, impayés, qualité des données) et le dossier
//     comité Excel + Word + PowerPoint au design maison — les données ne quittent pas l'ordinateur.
// Transport stdio. Un proxy d'entreprise est suivi (HTTPS_PROXY). Licence du code : celle de l'app ; dépendances MIT.
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { EXA_MCP, PARALLEL_MCP, firecrawlSearchRequest, mcpRpc, parseExa, parseFirecrawl, parseMcpBody, parseParallel, parseTavily, parallelQueries, tavilyRequest } from '../jev/web/search';
import { ecbRates, ecbText, entitiesText, frankfurterUrl, jinaReaderUrl, keepPreprints, pagesText, parseExaFetch, parseJinaReader, parseParallelFetch, parseWikidata, preprintQueries, readableUrls, wikidataQuery, wikidataUrl, type PreprintSource, type ReadPage } from '../jev/web/freeTools';
import { DOMAINS, LIBRARY, libraryText, pickSources, type LibDomain, type LibHit } from '../jev/library';
import type { BraveHit } from '../jev/web/brave';
import { DataCore } from '../services/dataCore';
import { buildBrief } from '../services/reportBrief';
import { dossierFromBrief } from '../services/dossier/dossierCompose';
import { corpusFor, researchSubject } from '../services/dossier/sourceCorpus';
import { dossierXlsx } from '../services/dossier/dossierXlsx';
import { dossierDocx } from '../services/dossier/dossierDocx';
import { dossierPptx } from '../services/dossier/dossierPptx';

const VERSION = '63.0.0';
async function useEnvProxy() {
  if (!(process.env.HTTPS_PROXY || process.env.https_proxy)) return;
  try {
    const u = await import('undici');
    u.setGlobalDispatcher(new u.EnvHttpProxyAgent());
  } catch {
    /* no proxy support available: direct connections */
  }
}

const H = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' };
const timeout = (ms: number) => AbortSignal.timeout(ms);
async function mcpCall(url: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
  const init = await fetch(url, { method: 'POST', headers: H, body: mcpRpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'massamba-mcp', version: VERSION } }), signal: timeout(15_000) });
  if (!init.ok) throw new Error(`${new URL(url).host} HTTP ${init.status}`);
  const sid = init.headers.get('mcp-session-id');
  await init.text();
  const h = { ...H, ...(sid ? { 'Mcp-Session-Id': sid } : {}) };
  await fetch(url, { method: 'POST', headers: h, body: mcpRpc(null, 'notifications/initialized'), signal: timeout(10_000) }).then((r) => r.text()).catch(() => '');
  const r = await fetch(url, { method: 'POST', headers: h, body: mcpRpc(2, 'tools/call', { name: tool, arguments: args }), signal: timeout(30_000) });
  if (!r.ok) throw new Error(`${new URL(url).host} HTTP ${r.status}`);
  return parseMcpBody(await r.text());
}
const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true });
const hitsText = (hits: BraveHit[]) => hits.map((h) => `- ${h.title}${h.age ? ` (${h.age})` : ''} — ${h.url}${h.snippet ? `\n  ${h.snippet}` : ''}`).join('\n');

/** Free web search, first engine with results wins (each has its own anonymous quota). */
export async function webSearch(q: string, n = 6): Promise<{ hits: BraveHit[]; via: string; errors: string[] }> {
  const errors: string[] = [];
  const engines: [string, () => Promise<BraveHit[]>][] = [
    ['Exa', async () => parseExa(await mcpCall(EXA_MCP, 'web_search_exa', { query: q, numResults: Math.min(10, n) }), n)],
    ['Parallel', async () => parseParallel(await mcpCall(PARALLEL_MCP, 'web_search', { objective: q.slice(0, 200), search_queries: parallelQueries(q) }), n)],
    [
      'Tavily',
      async () => {
        const rq = tavilyRequest(null, q, n);
        const r = await fetch(rq.url, { ...rq.init, signal: timeout(15_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return parseTavily(await r.json(), n);
      },
    ],
    [
      'Firecrawl',
      async () => {
        const rq = firecrawlSearchRequest(null, q, n, ['web']);
        const r = await fetch(rq.url, { ...rq.init, signal: timeout(15_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return parseFirecrawl(await r.json(), n);
      },
    ],
  ];
  for (const [name, run] of engines) {
    try {
      const hits = await run();
      if (hits.length) return { hits, via: name, errors };
      errors.push(`${name} : 0 résultat`);
    } catch (e) {
      errors.push(`${name} : ${(e as Error).message}`);
    }
  }
  return { hits: [], via: '', errors };
}

export async function readPages(urls: string[], focus = ''): Promise<{ pages: ReadPage[]; via: string; errors: string[] }> {
  const errors: string[] = [];
  const readers: [string, () => Promise<ReadPage[]>][] = [
    ['Exa', async () => parseExaFetch(await mcpCall(EXA_MCP, 'web_fetch_exa', { urls, maxCharacters: 8000 }), 8000)],
    ['Parallel', async () => parseParallelFetch(await mcpCall(PARALLEL_MCP, 'web_fetch', { urls, ...(focus ? { objective: focus.slice(0, 200) } : {}) }), 8000)],
    [
      'Jina Reader',
      async () =>
        (await Promise.all(urls.map(async (u) => parseJinaReader(await (await fetch(jinaReaderUrl(u), { headers: { Accept: 'text/plain' }, signal: timeout(20_000) })).text(), u, 8000)))).filter(
          (p): p is ReadPage => Boolean(p),
        ),
    ],
  ];
  for (const [name, run] of readers) {
    try {
      const pages = (await run()).filter((p) => p.text.length > 80);
      if (pages.length) return { pages, via: name, errors };
      errors.push(`${name} : page vide`);
    } catch (e) {
      errors.push(`${name} : ${(e as Error).message}`);
    }
  }
  return { pages: [], via: '', errors };
}

export async function library(q: string, domains?: LibDomain[], n = 4): Promise<string> {
  const lang: 'fr' | 'en' = /\b(the|of|and|what|how)\b/i.test(q) ? 'en' : 'fr';
  const groups = await Promise.all(
    pickSources(q, { domains, lang }).map(async (source) => {
      try {
        const r = await fetch(source.url(q, n, lang), { headers: { Accept: 'application/json', 'User-Agent': `massamba-mcp/${VERSION}` }, signal: timeout(8000) });
        if (!r.ok) return { source, hits: [] as LibHit[], error: `HTTP ${r.status}` };
        return { source, hits: source.parse(await r.json(), n) };
      } catch (e) {
        return { source, hits: [] as LibHit[], error: (e as Error).name === 'TimeoutError' ? 'délai dépassé' : (e as Error).message };
      }
    }),
  );
  return libraryText(q, groups);
}

/** A data file read LOCALLY (Excel, CSV, JSON): the deterministic brief the app computes before any model. */
export function analyseFile(file: string, sheet?: string): string {
  const abs = path.resolve(file);
  const bytes = new Uint8Array(fs.readFileSync(abs));
  const ds = new DataCore().parseBytes(abs, bytes, sheet ?? null);
  if (!ds.rows.length) return `Aucune ligne lisible dans ${abs}${ds.sheets.length ? ` (feuilles : ${ds.sheets.join(', ')})` : ''}.`;
  const brief = buildBrief(ds.columns, ds.rows as Record<string, unknown>[], { title: path.basename(abs), source: `${path.basename(abs)}${ds.sheet ? ` [${ds.sheet}]` : ''}` });
  return `Analyse locale de ${path.basename(abs)}${ds.sheet ? ` — feuille « ${ds.sheet} »` : ''} : ${ds.rows.length} ligne(s), ${ds.columns.length} colonne(s). Calculé sur cet ordinateur, aucune donnée envoyée.\n\n${JSON.stringify(brief, null, 1).slice(0, 60_000)}`;
}

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'massamba', version: VERSION },
    {
      instructions:
        "Outils de JEV, le cerveau de MASSAMBA Workbench : recherche et lecture Internet gratuites, bibliothèque mondiale (19 sources), taux BCE + franc CFA, fiches d'entreprises (Wikidata), prépublications SSRN/arXiv, et analyse LOCALE de fichiers Excel/CSV (les données ne quittent pas l'ordinateur). Citer les sources renvoyées ; ne jamais inventer un chiffre.",
    },
  );
  server.registerTool(
    'jev_recherche_web',
    { title: 'Recherche web gratuite (JEV)', description: 'Recherche sur Internet sans clé (Exa, Parallel, Tavily, Firecrawl en relais). Renvoie titres, liens, extraits datés.', inputSchema: { query: z.string().min(2), max_results: z.number().int().min(1).max(10).optional() }, annotations: { readOnlyHint: true, openWorldHint: true } },
    async ({ query, max_results }) => {
      const r = await webSearch(query, max_results ?? 6);
      return r.hits.length ? text(`Résultats (${r.via}) :\n${hitsText(r.hits)}`) : fail(`Aucun moteur gratuit n'a répondu : ${r.errors.join(' ; ')}`);
    },
  );
  server.registerTool(
    'jev_lire_page',
    { title: 'Lire une page entière (JEV)', description: 'Lit 1 à 5 pages web ou PDF EN ENTIER (Markdown propre, titre, date). focus = ce que l’on cherche.', inputSchema: { urls: z.array(z.string()).min(1).max(5), focus: z.string().optional() }, annotations: { readOnlyHint: true, openWorldHint: true } },
    async ({ urls, focus }) => {
      const list = readableUrls(urls);
      if (!list.length) return fail('Aucune adresse http(s) valide.');
      const r = await readPages(list, focus ?? '');
      return r.pages.length ? text(pagesText(r.pages, r.via)) : fail(`Lecture impossible : ${r.errors.join(' ; ')}`);
    },
  );
  server.registerTool(
    'jev_bibliotheque',
    { title: 'Bibliothèque mondiale JEV', description: `19 sources publiques gratuites (savoirs, sciences, santé, finance & droit, livres, code, nature, alimentation, culture, spiritualité). Domaines : ${DOMAINS.join(', ')}. Sources : ${LIBRARY.map((s) => s.id).join(', ')}.`, inputSchema: { query: z.string().min(2), domains: z.array(z.enum(DOMAINS as [LibDomain, ...LibDomain[]])).max(2).optional(), max_results: z.number().int().min(1).max(8).optional() }, annotations: { readOnlyHint: true, openWorldHint: true } },
    async ({ query, domains, max_results }) => text(await library(query, domains, max_results ?? 4)),
  );
  server.registerTool(
    'jev_taux_bce',
    { title: 'Taux de référence BCE + F CFA', description: 'Taux officiels de la BCE (Frankfurter) ; XOF/XAF par la parité fixe 1 EUR = 655,957. date « AAAA-MM-JJ » facultative.', inputSchema: { base: z.string().min(3).max(3), symbols: z.array(z.string()).optional(), date: z.string().optional() }, annotations: { readOnlyHint: true, openWorldHint: true } },
    async ({ base, symbols, date }) => {
      const r = await fetch(frankfurterUrl(base, { date, symbols }), { signal: timeout(10_000) });
      if (!r.ok) return fail(`BCE : HTTP ${r.status}`);
      const e = ecbRates(await r.json(), base, symbols ?? []);
      return e ? text(ecbText(e)) : fail(`Devise ${base} absente des taux BCE.`);
    },
  );
  server.registerTool(
    'jev_fiche_entite',
    { title: 'Fiche d’entité (Wikidata)', description: 'Pays, siège, maison mère, secteur, création, effectif, cotation, ISIN, site d’une banque, d’un groupe, d’une entreprise.', inputSchema: { name: z.string().min(2) }, annotations: { readOnlyHint: true, openWorldHint: true } },
    async ({ name }) => {
      const r = await fetch(wikidataUrl(wikidataQuery(name, 'fr')), { headers: { Accept: 'application/sparql-results+json', 'User-Agent': `massamba-mcp/${VERSION}` }, signal: timeout(25_000) });
      return r.ok ? text(entitiesText(parseWikidata(await r.json()), name)) : fail(`Wikidata : HTTP ${r.status}`);
    },
  );
  server.registerTool(
    'jev_prepublications',
    { title: 'Prépublications SSRN / arXiv', description: 'Working papers récents (finance, banque, économie sur SSRN ; finance quantitative, statistique, IA sur arXiv).', inputSchema: { query: z.string().min(2), source: z.enum(['ssrn', 'arxiv', 'both']).optional() }, annotations: { readOnlyHint: true, openWorldHint: true } },
    async ({ query, source }) => {
      const src = (source ?? 'both') as PreprintSource;
      const all = (await Promise.all(preprintQueries(query, src).map((q) => mcpCall(EXA_MCP, 'web_search_exa', { query: q, numResults: 8 }).then((r) => parseExa(r, 8)).catch(() => [] as BraveHit[])))).flat();
      const hits = keepPreprints(all, src).slice(0, 8);
      return hits.length ? text(hitsText(hits)) : fail('Aucune prépublication trouvée.');
    },
  );
  server.registerTool(
    'jev_analyse_fichier',
    { title: 'Analyse locale d’un fichier Excel / CSV', description: 'Lit un fichier de données SUR CET ORDINATEUR et renvoie le brief déterministe de l’app (mesures, KPI, concentration, impayés, qualité des données). Aucune donnée envoyée sur Internet.', inputSchema: { path: z.string().min(1), sheet: z.string().optional() }, annotations: { readOnlyHint: true, openWorldHint: false } },
    async ({ path: p, sheet }) => {
      try {
        return text(analyseFile(p, sheet));
      } catch (e) {
        return fail(`Lecture impossible : ${(e as Error).message}`);
      }
    },
  );
  server.registerTool(
    'jev_dossier_comite',
    { title: 'Dossier comité Excel + Word + PowerPoint (local)', description: 'À partir d’un fichier Excel/CSV de l’ordinateur, écrit À CÔTÉ du fichier le classeur, le rapport et le deck « comité » au design maison de l’app (chapitres, KPI, graphiques natifs, sources réglementaires). Tout est calculé localement.', inputSchema: { path: z.string().min(1), sheet: z.string().optional(), focus: z.string().optional() }, annotations: { readOnlyHint: false, openWorldHint: false } },
    async ({ path: p, sheet, focus }) => {
      try {
        return text(committeePack(p, sheet, focus));
      } catch (e) {
        return fail(`Dossier impossible : ${(e as Error).message}`);
      }
    },
  );
  return server;
}

/** The committee pack written next to the data file (same engine as the app's « dossier.export »). */
export function committeePack(file: string, sheet?: string, focus?: string): string {
  const abs = path.resolve(file);
  const ds = new DataCore().parseBytes(abs, new Uint8Array(fs.readFileSync(abs)), sheet ?? null);
  if (!ds.rows.length) throw new Error('aucune ligne lisible');
  const title = focus?.trim() || path.basename(abs).replace(/\.[^.]+$/, '');
  const rows = ds.rows as Record<string, unknown>[];
  const brief = buildBrief(ds.columns, rows, { title, source: `${path.basename(abs)}${ds.sheet ? ` [${ds.sheet}]` : ''}` });
  const research = corpusFor(researchSubject(title, ['risque de crédit']), 'credit');
  const d = dossierFromBrief({ focus: title, brief, research, notes: '' });
  const dir = path.join(path.dirname(abs), `${title} — dossier comité`);
  fs.mkdirSync(dir, { recursive: true });
  const data = { columns: ds.columns, rows, measure: brief.measure, measureLabel: brief.measureLabel, entity: brief.entity };
  const out = { xlsx: path.join(dir, `${title} — classeur.xlsx`), docx: path.join(dir, `${title} — rapport.docx`), pptx: path.join(dir, `${title} — deck.pptx`) };
  fs.writeFileSync(out.xlsx, dossierXlsx(d, { data }));
  fs.writeFileSync(out.docx, dossierDocx(d));
  fs.writeFileSync(out.pptx, dossierPptx(d));
  return `Dossier comité écrit sur cet ordinateur (aucune donnée envoyée) :\n- ${out.xlsx}\n- ${out.docx}\n- ${out.pptx}\n\n${d.chapters.length} chapitre(s) : ${d.chapters.map((c) => c.title).join(' · ')}`;
}

export async function main(): Promise<void> {
  await useEnvProxy();
  await buildServer().connect(new StdioServerTransport());
}
