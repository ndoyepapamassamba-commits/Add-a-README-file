// Independent intelligence scores used by AUTO routing (provider-neutral).
// Source: the Artificial Analysis indices that OpenRouter publishes on each
// model page (openrouter.ai/<model> → "Benchmarks"): Intelligence, Coding and
// Agentic index, per reasoning-effort variant. A snapshot ships with the app
// (intelSnapshot.json, `npm run sync:intel`); the server refreshes it live.
// Prices are never stored here: they always come from the live catalog.
import snapshot from './intelSnapshot.json';

export type IntelMetric = 'intelligence' | 'coding' | 'agentic';

export interface IntelEntry {
  /** Artificial Analysis name of the variant used as reference. */
  name: string;
  intelligence: number | null;
  coding: number | null;
  agentic: number | null;
  /** Effort of the reference variant (high when measured). */
  effort: string;
  /** Every measured variant: effort → intelligence index. */
  variants: Record<string, number>;
}

export interface IntelData {
  source: string;
  url: string;
  fetchedAt: string;
  /** OpenRouter permaslug (canonical_slug) → scores. */
  models: Record<string, IntelEntry>;
  /** OpenRouter model id → permaslug (from the catalog at sync time). */
  ids: Record<string, string>;
}

export const INTEL_ENDPOINT =
  'https://openrouter.ai/api/frontend/v1/private/artificial-analysis-benchmarks/all';

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/^~/, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-|-$/g, '');
}
const baseOf = (s: string) => slug(s.replace(/^~/, '').split('/').pop()!.replace(/:.*$/, ''));
/** Permaslugs carry a release date: openai/gpt-5.6-luna-20260709 → openai/gpt-5.6-luna. */
const undated = (permaslug: string) => permaslug.replace(/-\d{8}$/, '');

function buildIndex(d: IntelData): Map<string, IntelEntry> {
  const m = new Map<string, IntelEntry>();
  for (const [ps, e] of Object.entries(d.models)) {
    m.set(ps, e);
    if (!m.has(undated(ps))) m.set(undated(ps), e);
  }
  for (const [id, ps] of Object.entries(d.ids)) if (d.models[ps]) m.set(id, d.models[ps]);
  return m;
}

let data = snapshot as IntelData;
let byId = buildIndex(data);

/** Variant label → effort ("GPT-5.6 Luna (xhigh)" → xhigh, "(Non-reasoning)" → none). */
export function effortOf(aaName: string): string {
  const t = aaName.toLowerCase();
  if (/non-reasoning/.test(t)) return 'none';
  for (const e of ['xhigh', 'max', 'high', 'medium', 'low', 'minimal'])
    if (new RegExp(`\\b${e}\\b`).test(t)) return e;
  return 'default';
}
// Reference = the effort agents normally run at; then the closest ones.
const EFFORT_PRIORITY = ['high', 'default', 'xhigh', 'medium', 'max', 'low', 'minimal', 'none'];

interface RawAA {
  aa_name?: string;
  permaslug?: string;
  benchmark_data?: { model_type?: string; evaluations?: Record<string, number | null> };
}

/** Builds IntelData from the OpenRouter benchmark payload (+ the catalog for id ↔ slug). */
export function parseIntel(
  payload: { data?: RawAA[] },
  catalog: { id: string; canonical_slug?: string }[] = [],
  fetchedAt = new Date().toISOString(),
): IntelData {
  const groups = new Map<string, { effort: string; name: string; ev: Record<string, number | null> }[]>();
  for (const x of payload.data ?? []) {
    const ev = x.benchmark_data?.evaluations;
    if (x.benchmark_data?.model_type !== 'llm' || !ev || !x.permaslug) continue;
    const list = groups.get(x.permaslug) ?? [];
    list.push({ effort: effortOf(x.aa_name ?? ''), name: x.aa_name ?? x.permaslug, ev });
    groups.set(x.permaslug, list);
  }
  const pick = (list: { effort: string; name: string; ev: Record<string, number | null> }[], key: string) => {
    for (const e of EFFORT_PRIORITY) {
      const hit = list.find((v) => v.effort === e && typeof v.ev[key] === 'number');
      if (hit) return { value: hit.ev[key] as number, v: hit };
    }
    return null;
  };
  const models: Record<string, IntelEntry> = {};
  for (const [ps, list] of groups) {
    const i = pick(list, 'artificial_analysis_intelligence_index');
    const c = pick(list, 'artificial_analysis_coding_index');
    const a = pick(list, 'artificial_analysis_agentic_index');
    if (!i && !c && !a) continue;
    const variants: Record<string, number> = {};
    for (const v of list) {
      const s = v.ev.artificial_analysis_intelligence_index;
      if (typeof s === 'number') variants[v.effort] = Math.max(variants[v.effort] ?? 0, s);
    }
    models[ps] = {
      name: (i ?? c ?? a)!.v.name,
      intelligence: i?.value ?? null,
      coding: c?.value ?? null,
      agentic: a?.value ?? null,
      effort: (i ?? c ?? a)!.v.effort,
      variants,
    };
  }
  const ids: Record<string, string> = {};
  for (const m of catalog) if (m.canonical_slug && models[m.canonical_slug]) ids[m.id] = m.canonical_slug;
  return {
    source: 'Artificial Analysis via OpenRouter (pages modèles)',
    url: 'https://openrouter.ai/models',
    fetchedAt,
    models,
    ids,
  };
}

/** Replaces the scores (live refresh). Returns the number of scored models. */
export function setIntelData(d: IntelData): number {
  if (!d || !d.models || !Object.keys(d.models).length) return 0;
  data = d;
  byId = buildIndex(d);
  return Object.keys(d.models).length;
}
export const intelData = (): IntelData => data;

export interface IntelInfo {
  score: number;
  coding: number | null;
  agentic: number | null;
  estimated: boolean;
  /** AA variant used as reference. */
  name: string;
  effort: string;
}

function entryFor(id: string, permaslug?: string): { e: IntelEntry; estimated: boolean } | null {
  const direct =
    (permaslug && (byId.get(permaslug) ?? byId.get(undated(permaslug)))) ||
    byId.get(id) ||
    byId.get(id.replace(/^~/, '').replace(/:.*$/, ''));
  if (direct) return { e: direct, estimated: false };
  // Unknown (e.g. a model added after the snapshot): the closest known sibling of
  // the same provider by name prefix, flagged as an estimate and slightly penalised.
  const provider = id.replace(/^~/, '').split('/')[0];
  const base = baseOf(id);
  let best: { key: string; e: IntelEntry } | null = null;
  for (const [key, e] of byId) {
    if (!key.startsWith(`${provider}/`)) continue;
    const kb = baseOf(undated(key));
    if (
      kb.length >= 5 &&
      (base.startsWith(kb) || kb.startsWith(base)) &&
      (!best || kb.length > baseOf(undated(best.key)).length)
    )
      best = { key, e };
  }
  return best ? { e: best.e, estimated: true } : null;
}

/** Scores of a model, or null when nothing reliable is known. */
export function intelligenceInfo(id: string, permaslug?: string): IntelInfo | null {
  const hit = entryFor(id, permaslug);
  if (!hit || hit.e.intelligence === null) return null;
  const pen = hit.estimated ? 1.5 : 0;
  return {
    score: hit.e.intelligence - pen,
    coding: hit.e.coding === null ? null : hit.e.coding - pen,
    agentic: hit.e.agentic === null ? null : hit.e.agentic - pen,
    estimated: hit.estimated,
    name: hit.e.name,
    effort: hit.e.effort,
  };
}

export function intelligenceOf(id: string): number | null {
  return intelligenceInfo(id)?.score ?? null;
}

/** Best known value of a metric (thresholds are relative to it). */
export function intelMax(metric: IntelMetric = 'intelligence'): number {
  let max = 0;
  for (const e of Object.values(data.models)) max = Math.max(max, e[metric] ?? 0);
  return max || 1;
}

export const INTEL_SOURCE = {
  get name() {
    return data.source;
  },
  get date() {
    return data.fetchedAt.slice(0, 10);
  },
  url: 'https://openrouter.ai/models',
};
