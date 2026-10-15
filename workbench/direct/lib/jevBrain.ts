// LE CERVEAU JEV DANS L'APP (v63). Branché sur CHAQUE appel de modèle (llm.ts → setBrainHooks) et sur le chat :
//   AVANT   — cadre d'objectif, techniques apprises, leçons ; réponse identique resservie du cache ; pour une tâche
//             légère, JEV prend le modèle en main (gratuit d'abord) ;
//   PENDANT — surveillance du flux : boucle de répétition ou changement de langue → coupure et relance corrigée ;
//   APRÈS   — contrôle qualité local (0 appel) ; une réponse gratuite insuffisante passe la main au modèle demandé ;
//             échec → veille ciblée (auto-perfectionnement) ;
//   EN FOND — veille Internet sur ce que JEV ne sait pas, et MISE À JOUR PERPÉTUELLE des techniques utilisées ;
//   RÉFLEXES — taux BCE, conversions F CFA, fiches d'entité, définitions : réponse sans modèle ; calculs : JEV fait
//             écrire le programme par un modèle gratuit, l'EXÉCUTE dans le bac à sable et interprète le résultat.
// Plafond DUR de recherches automatiques par jour (RESEARCH_PER_DAY, appliqué par mayResearch) ; aucune donnée de
// l'utilisateur ne part en veille (brainTopic retire chiffres, noms propres, adresses).
import { useStore } from './store';
import { kv } from './db';
import { complete, setBrainHooks, freeChainFor, type CompleteOptions } from './llm';
import { keylessRead, keylessSearch } from './freeEngines';
import { runLibrary } from './library';
import { runCode } from './sandbox';
import { jevSettings } from './jev';
import {
  acceptTechnique,
  brainTopic,
  cacheable,
  cacheKey,
  codeMessages,
  computeAnswer,
  computeIntent,
  countResearch,
  distillMessages,
  EMPTY_BRAIN,
  extractJs,
  feedRequest,
  lastUserText,
  mayResearch,
  needsResearch,
  refreshQueue,
  RESEARCH_PER_DAY,
  type BrainStats,
} from '../../server/jev/brain';
import { parseReflex, fxAnswer } from '../../server/jev/reflex';
import { ecbRates, entitiesText, frankfurterUrl, parseWikidata, wikidataQuery, wikidataUrl } from '../../server/jev/web/freeTools';
import { LIBRARY } from '../../server/jev/library';
import { carriesImages } from '../../server/llm/freeRoute';
import { remember as rememberKnowledge, touch as touchKnowledge, tokens as knowTokens } from '../../server/jev/knowledge/learned';
import { recall as recallMemory } from '../../server/jev/memory/semantic';
import { qualityCheck } from '../../server/jev/qa';
import { outputSpec } from '../../server/jev/style';
import type { ChatRequest } from '../../server/llm/types';

// ── options & compteurs (ce navigateur) ──────────────────────────────────────────────────────────────────────────────
export interface BrainOptions {
  /** JEV feeds every context (focus frame, techniques, lessons) and serves identical answers from its cache. */
  feed: boolean;
  /** JEV takes the model in hand: light tasks go to the free models first, QA hands over when needed. */
  pilot: boolean;
  /** Internet watch: learn what is missing + perpetual update of the techniques used. */
  learn: boolean;
  /** Reflexes: answers without any model (ECB rates, entity cards, definitions) and computations by executed code. */
  reflexes: boolean;
  /** Watch the stream during the request (loops, language drift). */
  watch: boolean;
}
const OPT_KEY = 'wbd.brain.v1';
const STATS_KEY = 'wbd.brainStats.v1';
const DEFAULT_OPTS: BrainOptions = { feed: true, pilot: true, learn: true, reflexes: true, watch: true };
const read = <T>(k: string, d: T): T => {
  try {
    return { ...d, ...(JSON.parse(localStorage.getItem(k) ?? '{}') as Partial<T>) };
  } catch {
    return { ...d };
  }
};
export const brainOptions = (): BrainOptions => read(OPT_KEY, DEFAULT_OPTS);
export function setBrainOptions(p: Partial<BrainOptions>): BrainOptions {
  const next = { ...brainOptions(), ...p };
  try {
    localStorage.setItem(OPT_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  changed();
  return next;
}
export interface FullStats extends BrainStats {
  refreshed: number;
  interventions: number;
  reflexes: number;
  computed: number;
  pilotFree: number;
  pilotEscalated: number;
}
let stats: FullStats = read<FullStats>(STATS_KEY, { ...EMPTY_BRAIN, refreshed: 0, interventions: 0, reflexes: 0, computed: 0, pilotFree: 0, pilotEscalated: 0 });
const subs = new Set<() => void>();
const changed = () => subs.forEach((f) => f());
export const onBrainChange = (f: () => void) => (subs.add(f), () => void subs.delete(f));
export const brainStats = () => stats;
function bump(p: Partial<FullStats> | ((s: FullStats) => FullStats)) {
  stats = typeof p === 'function' ? p(stats) : { ...stats, ...p };
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    /* private mode */
  }
  changed();
}
const on = () => jevSettings().enabled;

// ── cache des réponses identiques (24 h, 200 entrées, IndexedDB) ─────────────────────────────────────────────────────
type Completion = Awaited<ReturnType<typeof complete>>;
const TTL = 24 * 3_600_000;
let cache: Record<string, { at: number; v: Completion }> = {};
let cacheLoaded = false;
async function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    cache = (await kv.get<typeof cache>('jevResultCache')) ?? {};
  } catch {
    cache = {};
  }
}
let saveT: ReturnType<typeof setTimeout> | null = null;
function saveCache() {
  if (saveT) return;
  saveT = setTimeout(() => {
    saveT = null;
    const now = Date.now();
    const keep = Object.entries(cache)
      .filter(([, e]) => now - e.at < TTL)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 200);
    cache = Object.fromEntries(keep);
    void kv.set('jevResultCache', cache).catch(() => undefined);
  }, 1500);
}

// ── tâches légères que JEV confie d'abord aux modèles gratuits ───────────────────────────────────────────────────────
const LIGHT = /^(prompt-improve|stage-directions|id[ée]es|titre|title|r[ée]sum[ée]|summary|reformul|traduction|translate|jev-)/i;

const hooks = {
  async before(req: ChatRequest, o: CompleteOptions) {
    const opts = brainOptions();
    const purpose = o.purpose ?? 'chat';
    if (!on()) return { req };
    await loadCache();
    // 1. a deterministic, tool-less call already answered: served again (0 $, ~0 ms).
    if (opts.feed && cacheable(req, purpose)) {
      const k = cacheKey(req, purpose);
      const hit = cache[k];
      if (hit && Date.now() - hit.at < TTL) {
        bump((s) => ({ ...s, cacheHits: s.cacheHits + 1, cacheSavedUsd: Math.round((s.cacheSavedUsd + (hit.v.cost ?? 0)) * 1e6) / 1e6 }));
        o.onText?.(hit.v.content);
        return { req, cached: { ...hit.v, cost: 0 } };
      }
    }
    // 2. fed: focus frame + techniques + lessons (the chat agent compiles its own JEV packet).
    let fed = req;
    if (opts.feed && purpose !== 'chat') {
      const st = useStore.getState();
      const ask = lastUserText(req.messages);
      const lessons = recallMemory(st.lessons ?? [], ask, { k: 4 }).map((r) => r.fact.text);
      const f = feedRequest(req.messages, { knowledge: st.knowledge, lessons, purpose });
      if (f.added.length) {
        fed = { ...req, messages: f.messages };
        bump((s) => ({ ...s, fed: s.fed + 1, charsAdded: s.charsAdded + f.charsAdded }));
        if (f.knowledgeIds.length) {
          let k = st.knowledge;
          for (const id of f.knowledgeIds) k = touchKnowledge(k, id);
          st.setKnowledge(k);
        }
      }
    }
    // 3. what JEV does not know yet: learned in the background.
    if (opts.learn) scheduleGrowth(lastUserText(req.messages));
    // 4. JEV takes the model in hand for a light task: free models first (its QA hands over when needed).
    const prefer = opts.pilot && LIGHT.test(purpose) && !req.tools?.length && !carriesImages(fed.messages) ? freeChainFor(fed).chain : undefined;
    return { req: fed, prefer: prefer?.length ? prefer : undefined };
  },
  async after(req: ChatRequest, o: CompleteOptions, res: Completion, info: { preferred: boolean }) {
    const purpose = o.purpose ?? 'chat';
    if (!on()) return { accept: true };
    let accept = true;
    if (purpose !== 'chat' && !res.toolCalls?.length) {
      const ask = lastUserText(req.messages);
      const q = qualityCheck({ answer: res.content, spec: outputSpec(ask), evidence: [ask], usedTools: false, toolErrors: 0, toolCalls: 0, tokens: res.usage.completionTokens, tokenBudget: req.maxTokens ?? 8000 });
      const blocking = q.failures.filter((f) => f.blocking);
      bump((s) => ({ ...s, qaChecked: s.qaChecked + 1, qaFlagged: s.qaFlagged + (blocking.length ? 1 : 0) }));
      if (blocking.length) {
        accept = !info.preferred;
        // Auto-perfection by error: the technique behind the request is researched again.
        if (brainOptions().learn) scheduleGrowth(ask, true);
      }
    }
    if (info.preferred) bump((s) => (accept ? { ...s, pilotFree: s.pilotFree + 1 } : { ...s, pilotEscalated: s.pilotEscalated + 1 }));
    if (accept && brainOptions().feed && cacheable(req, purpose) && res.content.trim()) {
      cache[cacheKey(req, purpose)] = { at: Date.now(), v: res };
      saveCache();
    }
    return { accept };
  },
  onIntervene(kind: string) {
    bump((s) => ({ ...s, interventions: s.interventions + 1 }));
    void kind;
  },
  watching: () => on() && brainOptions().watch,
};

// ── veille : apprendre ce qui manque, perfectionner après un échec ────────────────────────────────────────────────────
const seen = new Map<string, number>();
const busyTopics = new Set<string>();
function scheduleGrowth(text: string, force = false) {
  const topic = brainTopic(text);
  if (!topic || busyTopics.has(topic)) return;
  const last = seen.get(topic) ?? 0;
  if (Date.now() - last < 3_600_000) return;
  if (!force && !needsResearch(useStore.getState().knowledge, text)) return;
  seen.set(topic, Date.now());
  setTimeout(() => void research(topic, force ? 'erreur' : 'manque').catch(() => undefined), 1500);
}

/** One research round: library + free web search → the best pages read in full → a sourced technique card. */
export async function research(topic: string, reason: 'manque' | 'erreur' | 'mise à jour', replaceId?: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (!mayResearch(stats) || busyTopics.has(topic)) return false;
  busyTopics.add(topic);
  bump((s) => ({ ...s, ...countResearch(s) }));
  try {
    const [lib, web] = await Promise.all([runLibrary(topic, { max: 3, n: 3 }).catch(() => null), keylessSearch(topic, 5).catch(() => null)]);
    const urls = [
      ...(web?.hits ?? []).slice(0, 2).map((h) => h.url),
      ...(lib?.groups ?? []).flatMap((g) => g.hits.slice(0, 1).map((h) => h.url)).slice(0, 2),
    ].filter((u, i, a) => /^https?:\/\//.test(u) && a.indexOf(u) === i);
    if (!urls.length) return false;
    const read = await keylessRead(urls.slice(0, 3), topic);
    if (!read.pages.length) return false;
    const r = await complete(
      { model: 'llm7:gpt-oss:20b', messages: distillMessages(topic, read.pages), maxTokens: 900, temperature: 0.2 },
      { models: [], fallbacks: ['llm7:nemotron-3-nano:30b', 'pollinations:openai'], effort: 'auto', maxRetries: 0, purpose: 'jev-veille', jev: false },
    );
    const card = acceptTechnique(r.content);
    if (!card) return false;
    const st = useStore.getState();
    const base = replaceId ? st.knowledge.filter((e) => e.id !== replaceId) : st.knowledge;
    st.setKnowledge(
      rememberKnowledge(base, {
        query: topic,
        text: `${card}\n\n(Technique apprise par la veille JEV le ${new Date().toLocaleDateString('fr-FR')} — ${reason}.)`,
        sources: read.pages.map((p) => ({ url: p.url, title: p.title })),
        origin: 'learned',
      }),
    );
    bump((s) => (reason === 'mise à jour' ? { ...s, refreshed: s.refreshed + 1 } : { ...s, learned: s.learned + 1 }));
    return true;
  } finally {
    busyTopics.delete(topic);
  }
}

// ── mise à jour perpétuelle ──────────────────────────────────────────────────────────────────────────────────────────
async function refreshTick() {
  if (!on() || !brainOptions().learn || !mayResearch(stats)) return;
  for (const e of refreshQueue(useStore.getState().knowledge, Date.now(), 2)) {
    const topic = brainTopic(e.query) ?? knowTokens(e.query).slice(0, 8).join(' ');
    if (topic.split(' ').length >= 2) await research(topic, 'mise à jour', e.id).catch(() => false);
  }
}

// ── réflexes et calcul par le code ───────────────────────────────────────────────────────────────────────────────────
const withTimeout = async <T>(ms: number, signal: AbortSignal | undefined, f: (s: AbortSignal) => Promise<T>): Promise<T> => {
  const ac = new AbortController();
  const stop = () => ac.abort();
  signal?.addEventListener('abort', stop);
  const t = setTimeout(stop, ms);
  try {
    return await f(ac.signal);
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', stop);
  }
};
/** A chat message JEV answers ITSELF (no model): null = the model answers. */
export async function reflexAnswer(text: string, signal?: AbortSignal): Promise<string | null> {
  if (!on() || !brainOptions().reflexes) return null;
  const r = parseReflex(text);
  try {
    if (r?.kind === 'fx') {
      const j = await withTimeout(8000, signal, (s) => fetch(frankfurterUrl(r.from, { symbols: [r.to] }), { signal: s }).then((x) => (x.ok ? x.json() : null)));
      const e = j && ecbRates(j, r.from, [r.to]);
      const rate = e?.rates[r.to];
      if (!e || !rate) return null;
      bump((s) => ({ ...s, reflexes: s.reflexes + 1 }));
      return fxAnswer({ from: r.from, to: r.to, amount: r.amount, rate, date: e.date, derived: e.derived.length > 0 || r.from === 'XOF' || r.from === 'XAF' });
    }
    if (r?.kind === 'entity') {
      const j = await withTimeout(8000, signal, (s) => fetch(wikidataUrl(wikidataQuery(r.name, 'fr', 1)), { headers: { Accept: 'application/sparql-results+json' }, signal: s }).then((x) => (x.ok ? x.json() : null)));
      const list = j ? parseWikidata(j) : [];
      const e = list[0];
      if (!e) return null;
      const facet = r.facet === 'siège' ? e.facts['Siège'] : r.facet === 'maison mère' ? e.facts['Maison mère'] : r.facet === 'création' ? e.facts['Création'] : null;
      if (r.facet !== 'fiche' && !facet?.length) return null;
      bump((s) => ({ ...s, reflexes: s.reflexes + 1 }));
      const head = facet?.length ? `**${r.facet === 'siège' ? 'Siège' : r.facet === 'maison mère' ? 'Maison mère' : 'Création'} de ${e.label} : ${facet.join(', ')}**\n\n` : '';
      return `${head}${entitiesText([e], r.name)}\n\n_Réponse directe de JEV : aucun modèle appelé, 0 $._`;
    }
    if (r?.kind === 'definition') {
      const src = LIBRARY.find((s) => s.id === 'wikipedia-fr')!;
      const j = await withTimeout(8000, signal, (s) => fetch(src.url(r.term, 1, 'fr'), { signal: s }).then((x) => (x.ok ? x.json() : null)));
      const hit = j ? src.parse(j, 1)[0] : undefined;
      const want = knowTokens(r.term);
      if (!hit || !hit.snippet || !knowTokens(hit.title).some((w) => want.includes(w))) return null;
      bump((s) => ({ ...s, reflexes: s.reflexes + 1 }));
      return `**${hit.title}** — ${hit.snippet}\n\nSource : ${hit.url}\n\n_Réponse directe de JEV (Wikipédia, CC BY-SA) : aucun modèle appelé, 0 $._`;
    }
    if (!r && computeIntent(text)) return await computeByCode(text, signal);
  } catch {
    return null;
  }
  return null;
}
/** JEV codes and interprets: a free coder writes the program, the sandbox runs it, JEV reads the result. */
export async function computeByCode(question: string, signal?: AbortSignal): Promise<string | null> {
  const r = await complete(
    { model: 'llm7:codestral-latest', messages: codeMessages(question), maxTokens: 900, temperature: 0, signal },
    { models: [], fallbacks: ['llm7:gpt-oss:20b', 'pollinations:openai'], effort: 'auto', maxRetries: 0, purpose: 'jev-code', jev: false },
  );
  const code = extractJs(r.content);
  if (!code) return null;
  const run = await runCode('javascript', code, {}, 15_000, signal);
  if (!run.ok || run.result === undefined) return null;
  const ans = computeAnswer(run.result, code, r.model);
  if (ans) bump((s) => ({ ...s, computed: s.computed + 1 }));
  return ans;
}

let started = false;
/** Registers the brain on every model call and starts the perpetual update (first round after 1 min, then every 20 min). */
export function startBrain(): void {
  if (started) return;
  started = true;
  setBrainHooks(hooks);
  setTimeout(() => void refreshTick(), 60_000);
  setInterval(() => void refreshTick(), 20 * 60_000);
}
export const RESEARCH_CAP = RESEARCH_PER_DAY;
