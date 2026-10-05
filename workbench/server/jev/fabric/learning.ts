// MASSAMBA_MODEL_EXPERTISE_MATRIX, JEV POLICY STORE (+ exploration), ECONOMIC GOVERNOR,
// JEV HEALTH SCORE. All values come from real runs of the JEV_LOG; a cell without samples
// is null ("NON MESURÉ"), never a default score.
import type { JevLogEntry } from '../metrics';
import { hashText } from '../science';
import { qualityOfEntry } from './memory';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const costOf = (e: JevLogEntry) => e.acct?.totalCost ?? e.cost + e.jevCost;
const rate = (es: JevLogEntry[]) => {
  const j = es.filter((e) => e.success !== null);
  return j.length ? j.filter((e) => e.success).length / j.length : null;
};

/** Shrinkage confidence: n / (n + k). Calculated, not measured. */
export const confidenceOf = (n: number, k = 10) => Math.round((n / (n + k)) * 100) / 100;

// ───────────────────────── expertise matrix ─────────────────────────

export const DIMENSIONS = [
  'CODING',
  'REASONING',
  'MATHEMATICS',
  'DATA_ANALYSIS',
  'EXCEL',
  'DOCUMENTS',
  'RESEARCH',
  'WEB',
  'BROWSER',
  'VISION',
  'LONG_CONTEXT',
  'FRENCH',
  'MULTILINGUAL',
  'FINANCE',
  'IFRS9',
  'CREDIT_RISK',
  'UEMOA',
  'SENEGAL',
  'STRUCTURED_OUTPUT',
  'TOOL_USE',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

const frWords = /\b(le|la|les|des|une|est|pour|avec|dans|sont|quel|quelle|combien)\b/gi;
const enWords = /\b(the|and|with|for|this|that|is|are|what|how)\b/gi;

/** Dimensions a run exercised (deterministic, from its task type, wording, tools and context). */
export function dimsOf(e: JevLogEntry): Dimension[] {
  const t = `${e.instruction ?? e.mission}`;
  const d = new Set<Dimension>();
  switch (e.task) {
    case 'code':
    case 'review':
      d.add('CODING');
      break;
    case 'data':
      d.add('DATA_ANALYSIS');
      break;
    case 'research':
      d.add('RESEARCH');
      break;
    case 'browser':
      d.add('BROWSER');
      break;
    case 'document':
      d.add('DOCUMENTS');
      break;
    case 'vision':
      d.add('VISION');
      break;
  }
  if ((e.experiment?.difficulty ?? 0) >= 0.5 && (e.task === 'chat' || e.task === 'data')) d.add('REASONING');
  if (e.bench === 'reasoning' || e.bench === 'highrisk' || e.fabric?.category === 'reasoning')
    d.add('REASONING');
  if (/\b(excel|xlsx?|classeur|csv|tableur)\b/i.test(t)) d.add('EXCEL');
  if (/\b(calcul|pourcent|%|racine|somme|moyenne|équation|[0-9]\s*[x×*/+-]\s*[0-9])/i.test(t))
    d.add('MATHEMATICS');
  if (
    /\b(web|internet|actualit|sources?)\b/i.test(t) ||
    (e.toolsUsed ?? []).some((x) => /^(web|wikipedia|papers)\./.test(x))
  )
    d.add('WEB');
  if (/\b(cr[ée]dit|provision|taux|bilan|banque|ifrs|portefeuille|xof|fcfa|prêt|int[ée]r[êe]t)\b/i.test(t))
    d.add('FINANCE');
  if (/\b(ifrs ?9|ecl|stage ?[123]|provision)\b/i.test(t)) d.add('IFRS9');
  if (/\b(risque de cr[ée]dit|npl|pdo|impay|d[ée]faut|notation|frr)\b/i.test(t)) d.add('CREDIT_RISK');
  if (/\b(uemoa|bceao|xof|fcfa|zone franc)\b/i.test(t)) d.add('UEMOA');
  if (/\b(s[ée]n[ée]gal|dakar|thi[èe]s|kaolack|saint-louis)\b/i.test(t)) d.add('SENEGAL');
  if (/\b(json|tableau|csv|liste|format)\b/i.test(t) && e.qualityVector) d.add('STRUCTURED_OUTPUT');
  if ((e.toolsUsed ?? []).length >= 2) d.add('TOOL_USE');
  if (
    e.bench === 'longctx' ||
    e.fabric?.category === 'long_context' ||
    e.contextBefore > 30_000 ||
    t.length > 8000
  )
    d.add('LONG_CONTEXT');
  const fr = (t.match(frWords) ?? []).length;
  const en = (t.match(enWords) ?? []).length;
  if (fr + en >= 3) {
    if (fr > en * 1.5) d.add('FRENCH');
    else if (en > fr * 1.5) d.add('MULTILINGUAL');
    else {
      d.add('FRENCH');
      d.add('MULTILINGUAL');
    }
  }
  return [...d];
}

export interface ExpertiseCell {
  n: number;
  successRate: number | null;
  quality: number | null;
  cost: number | null;
  latencyMs: number | null;
  /** 1 − (retry + escalation rate), 0..1. */
  robustness: number | null;
  retryRate: number | null;
  /** Mean tool_accuracy dimension of the quality vector (0..1), when tools were used. */
  toolAccuracy: number | null;
  /** Success on runs whose context was large (≥ 30k tokens before compression). */
  contextPerformance: number | null;
  /** n / (n + 10). */
  confidence: number;
}
export type ExpertiseMatrix = Record<string, Partial<Record<Dimension, ExpertiseCell>>>;

function cellOf(es: JevLogEntry[]): ExpertiseCell {
  const big = es.filter((e) => e.contextBefore > 30_000);
  const ta = es.map((e) => e.qualityVector?.tool_accuracy).filter((x): x is number => typeof x === 'number');
  const retry = es.filter((e) => e.retries > 0).length / es.length;
  const esc = es.filter((e) => e.escalations > 0).length / es.length;
  return {
    n: es.length,
    successRate: rate(es),
    quality: mean(es.map(qualityOfEntry).filter((x): x is number => x !== null)),
    cost: mean(es.map(costOf)),
    latencyMs: mean(es.map((e) => e.latencyMs)),
    robustness: Math.max(0, 1 - retry - esc),
    retryRate: retry,
    toolAccuracy: mean(ta),
    contextPerformance: big.length ? rate(big) : null,
    confidence: confidenceOf(es.length),
  };
}

/** Built progressively from the JEV_LOG: each real run adds one observation per dimension it exercised. */
export function MASSAMBA_MODEL_EXPERTISE_MATRIX(log: JevLogEntry[]): ExpertiseMatrix {
  const by = new Map<string, Map<Dimension, JevLogEntry[]>>();
  for (const e of log) {
    if (!e.model || e.model === 'JEV-0') continue;
    const dm = by.get(e.model) ?? new Map<Dimension, JevLogEntry[]>();
    for (const d of dimsOf(e)) dm.set(d, [...(dm.get(d) ?? []), e]);
    by.set(e.model, dm);
  }
  const out: ExpertiseMatrix = {};
  for (const [m, dm] of by) {
    out[m] = {};
    for (const [d, es] of dm) out[m]![d] = cellOf(es);
  }
  return out;
}

export interface RankRow {
  rank: number;
  model: string;
  cell: ExpertiseCell;
  /** (success × quality / 100) per dollar, when all three are measured. */
  valuePerDollar: number | null;
}
/** Ranking inside a dimension: success, then quality, then cost (lexicographic, visible). Needs ≥ minN runs. */
export function rankByDimension(m: ExpertiseMatrix, dim: Dimension, minN = 3): RankRow[] {
  const rows = Object.entries(m)
    .flatMap(([model, cells]) =>
      cells[dim] && cells[dim]!.n >= minN && cells[dim]!.successRate !== null
        ? [{ model, cell: cells[dim]! }]
        : [],
    )
    .sort(
      (a, b) =>
        Math.round((b.cell.successRate ?? 0) * 100) - Math.round((a.cell.successRate ?? 0) * 100) ||
        (b.cell.quality ?? 0) - (a.cell.quality ?? 0) ||
        (a.cell.cost ?? 9) - (b.cell.cost ?? 9),
    );
  return rows.map((r, i) => ({
    rank: i + 1,
    model: r.model,
    cell: r.cell,
    valuePerDollar:
      r.cell.successRate !== null && r.cell.quality !== null && r.cell.cost && r.cell.cost > 0
        ? (r.cell.successRate * r.cell.quality) / 100 / r.cell.cost
        : null,
  }));
}

/** Models usable for a task type, best-known first (used by the router once the Fabric is on). */
export function preferredModels(
  log: JevLogEntry[],
  taskType: string,
  minN = 5,
): { model: string; n: number; successRate: number; quality: number | null; cost: number | null }[] {
  const by = new Map<string, JevLogEntry[]>();
  for (const e of log)
    if (e.task === taskType && e.model && e.model !== 'JEV-0')
      by.set(e.model, [...(by.get(e.model) ?? []), e]);
  const rows = [...by]
    .filter(([, es]) => es.length >= minN && rate(es) !== null)
    .map(([model, es]) => ({
      model,
      n: es.length,
      successRate: rate(es)!,
      quality: mean(es.map(qualityOfEntry).filter((x): x is number => x !== null)),
      cost: mean(es.map(costOf)),
    }));
  const best = Math.max(0, ...rows.map((r) => r.successRate));
  // Among the models within 5 points of the best success rate, the cheapest first.
  return rows
    .filter((r) => r.successRate >= best - 0.05)
    .sort((a, b) => (a.cost ?? 9) - (b.cost ?? 9))
    .concat(rows.filter((r) => r.successRate < best - 0.05).sort((a, b) => b.successRate - a.successRate));
}

// ───────────────────────── policy store ─────────────────────────

export type PolicyKind =
  | 'model_preference'
  | 'tool_useless'
  | 'skill_effect'
  | 'skill_rework'
  | 'jev1_value'
  | 'model_weakness'
  | 'council_gate';
export type PolicyStatus = 'proposed' | 'active' | 'rolled_back' | 'stale';
export interface Policy {
  id: string;
  kind: PolicyKind;
  scope: string;
  /** Plain statement of the rule. */
  policy: string;
  /** Machine-readable parameters used by the router (model names, tool names…). */
  params: Record<string, string | number | boolean | string[]>;
  evidence: Record<string, number | string | null>;
  confidence: number;
  sampleSize: number;
  lastValidated: number;
  /** What applying the policy is expected to change (from the measured difference). */
  effect: string;
  status: PolicyStatus;
  rollback: { previous: PolicyStatus | null; at: number | null; reason: string | null };
}

export const POLICY_MIN_N = 5;

const mk = (
  kind: PolicyKind,
  scope: string,
  subject: string,
  p: Omit<Policy, 'id' | 'kind' | 'scope' | 'status' | 'rollback' | 'lastValidated'>,
  now: number,
): Policy => ({
  id: `pol-${hashText(`${kind}|${scope}|${subject}`)}`,
  kind,
  scope,
  status: 'proposed',
  rollback: { previous: null, at: null, reason: null },
  lastValidated: now,
  ...p,
});

export interface LearnInput {
  log: JevLogEntry[];
  now?: number;
  minN?: number;
}

/** Learns candidate policies from real runs. Each one carries its evidence, sample size and confidence. */
export function learnPolicies(i: LearnInput): Policy[] {
  const now = i.now ?? Date.now();
  const n0 = i.minN ?? POLICY_MIN_N;
  const out: Policy[] = [];
  const log = i.log.filter((e) => !e.fabric || e.fabric.kind !== 'distill');

  // 1 — model A is better than model B for a task type
  const types = [...new Set(log.map((e) => e.task))];
  for (const t of types) {
    const byModel = new Map<string, JevLogEntry[]>();
    for (const e of log)
      if (e.task === t && e.model && e.model !== 'JEV-0')
        byModel.set(e.model, [...(byModel.get(e.model) ?? []), e]);
    const ms = [...byModel].filter(([, es]) => es.length >= n0 && rate(es) !== null);
    for (const [a, ea] of ms)
      for (const [b, eb] of ms) {
        if (a >= b) continue;
        const sa = rate(ea)!;
        const sb = rate(eb)!;
        const ca = mean(ea.map(costOf)) ?? 0;
        const cb = mean(eb.map(costOf)) ?? 0;
        const qa = mean(ea.map(qualityOfEntry).filter((x): x is number => x !== null));
        const qb = mean(eb.map(qualityOfEntry).filter((x): x is number => x !== null));
        let win: string | null = null;
        let lose = '';
        let why = '';
        if (Math.abs(sa - sb) >= 0.15) {
          win = sa > sb ? a : b;
          lose = sa > sb ? b : a;
          why = `réussite ${(Math.max(sa, sb) * 100).toFixed(0)} % vs ${(Math.min(sa, sb) * 100).toFixed(0)} %`;
        } else if (
          Math.abs(sa - sb) < 0.05 &&
          Math.min(ca, cb) > 0 &&
          Math.max(ca, cb) / Math.min(ca, cb) >= 2 &&
          (qa === null || qb === null || Math.abs(qa - qb) < 3)
        ) {
          win = ca < cb ? a : b;
          lose = ca < cb ? b : a;
          why = `même réussite, coût ${(Math.max(ca, cb) / Math.min(ca, cb)).toFixed(1)}× plus bas`;
        }
        if (!win) continue;
        const nEff = Math.min(ea.length, eb.length);
        out.push(
          mk(
            'model_preference',
            t,
            `${win}>${lose}`,
            {
              policy: `Pour les tâches « ${t} », ${win} est meilleur que ${lose} (${why}).`,
              params: { prefer: win, over: lose, taskType: t },
              evidence: {
                nPreferred: byModel.get(win)!.length,
                nOther: byModel.get(lose)!.length,
                successPreferred: rate(byModel.get(win)!),
                successOther: rate(byModel.get(lose)!),
                costPreferred: mean(byModel.get(win)!.map(costOf)),
                costOther: mean(byModel.get(lose)!.map(costOf)),
              },
              confidence: confidenceOf(nEff),
              sampleSize: ea.length + eb.length,
              effect: why,
            },
            now,
          ),
        );
      }
  }

  // 2 — a capability is useless for a task type (offered often, used rarely)
  for (const t of types) {
    const es = log.filter((e) => e.task === t && (e.config?.capabilities?.length ?? 0) > 0);
    if (es.length < n0 * 2) continue;
    const offered = new Map<string, number>();
    const used = new Map<string, number>();
    for (const e of es) {
      for (const c of new Set(e.config!.capabilities)) offered.set(c, (offered.get(c) ?? 0) + 1);
      for (const c of new Set(e.toolsUsed ?? [])) used.set(c, (used.get(c) ?? 0) + 1);
    }
    for (const [cap, nOff] of offered) {
      if (nOff < n0 * 2 || /^(tools\.request|agent\.|mission\.|skill\.)/.test(cap)) continue;
      const nUse = used.get(cap) ?? 0;
      const useRate = nUse / nOff;
      if (useRate <= 0.2)
        out.push(
          mk(
            'tool_useless',
            t,
            cap,
            {
              policy: `Pour « ${t} », ${cap} est inutile dans ${Math.round((1 - useRate) * 100)} % des cas (utilisé ${nUse} fois sur ${nOff}).`,
              params: { tool: cap, taskType: t },
              evidence: { offered: nOff, used: nUse, useRate },
              confidence: confidenceOf(nOff, 10),
              sampleSize: nOff,
              effect:
                'retirer sa définition du contexte (tokens économisés à chaque appel, mesurés ailleurs)',
            },
            now,
          ),
        );
    }
  }

  // 3 / 4 — skill effect and skill-induced rework (same task type, with vs without the skill)
  const skills = new Set(log.flatMap((e) => e.skillsUsed ?? []));
  for (const sk of skills)
    for (const t of types) {
      const w = log.filter((e) => e.task === t && (e.skillsUsed ?? []).includes(sk));
      const wo = log.filter((e) => e.task === t && !(e.skillsUsed ?? []).includes(sk));
      if (w.length < n0 || wo.length < n0) continue;
      const dq =
        (mean(w.map(qualityOfEntry).filter((x): x is number => x !== null)) ?? NaN) -
        (mean(wo.map(qualityOfEntry).filter((x): x is number => x !== null)) ?? NaN);
      const ds = (rate(w) ?? NaN) - (rate(wo) ?? NaN);
      if (Number.isFinite(dq) && dq >= 3)
        out.push(
          mk(
            'skill_effect',
            t,
            sk,
            {
              policy: `Pour « ${t} », la skill ${sk} augmente la qualité de ${dq.toFixed(1)} points.`,
              params: { skill: sk, taskType: t },
              evidence: {
                withSkill: w.length,
                without: wo.length,
                deltaQuality: dq,
                deltaSuccess: Number.isFinite(ds) ? ds : null,
              },
              confidence: confidenceOf(Math.min(w.length, wo.length)),
              sampleSize: w.length + wo.length,
              effect: `+${dq.toFixed(1)} points de qualité (observationnel : comparer par test apparié avant de promouvoir)`,
            },
            now,
          ),
        );
      const rw = (es: JevLogEntry[]) =>
        es.filter((e) => e.retries + e.escalations + e.corrections > 0).length / es.length;
      if (rw(w) - rw(wo) >= 0.15)
        out.push(
          mk(
            'skill_rework',
            t,
            sk,
            {
              policy: `Pour « ${t} », la skill ${sk} augmente les retouches (${(rw(w) * 100).toFixed(0)} % vs ${(rw(wo) * 100).toFixed(0)} %).`,
              params: { skill: sk, taskType: t },
              evidence: { reworkWith: rw(w), reworkWithout: rw(wo) },
              confidence: confidenceOf(Math.min(w.length, wo.length)),
              sampleSize: w.length + wo.length,
              effect: 'ne pas injecter cette skill sur ce type de tâche',
            },
            now,
          ),
        );
    }

  // 5 — JEV-1 (paid routing call) costs more than it brings, per task type
  for (const t of types) {
    const paid = log.filter((e) => e.task === t && e.jev && (e.acct?.jevCost ?? e.jevCost) > 0);
    const free = log.filter((e) => e.task === t && e.jev && (e.acct?.jevCost ?? e.jevCost) === 0);
    if (paid.length < n0 || free.length < n0) continue;
    const dS = (rate(paid) ?? 0) - (rate(free) ?? 0);
    const dC = (mean(paid.map(costOf)) ?? 0) - (mean(free.map(costOf)) ?? 0);
    if (dS <= 0.02 && dC > 0)
      out.push(
        mk(
          'jev1_value',
          t,
          'jev1',
          {
            policy: `Pour « ${t} », les missions avec appel JEV-1 coûtent ${dC.toFixed(5)} $ de plus sans gain de réussite (${(dS * 100).toFixed(0)} pts).`,
            params: { taskType: t, skipJev1: true },
            evidence: { paid: paid.length, free: free.length, deltaSuccess: dS, deltaCost: dC },
            confidence: confidenceOf(Math.min(paid.length, free.length)),
            sampleSize: paid.length + free.length,
            effect: 'ne pas appeler JEV-1 pour ce type de tâche (observationnel)',
          },
          now,
        ),
      );
  }

  // 6 — a model is weak in a dimension although good overall
  const mx = MASSAMBA_MODEL_EXPERTISE_MATRIX(log);
  for (const [model, cells] of Object.entries(mx)) {
    const all = log.filter((e) => e.model === model);
    const overall = rate(all);
    if (all.length < n0 * 2 || overall === null || overall < 0.8) continue;
    for (const [dim, c] of Object.entries(cells) as [Dimension, ExpertiseCell][]) {
      if (c.n >= n0 && c.successRate !== null && c.successRate <= 0.5)
        out.push(
          mk(
            'model_weakness',
            dim,
            model,
            {
              policy: `${model} est correct globalement (${(overall * 100).toFixed(0)} %) mais faible en ${dim} (${(c.successRate * 100).toFixed(0)} % sur ${c.n}).${c.latencyMs !== null && c.latencyMs < 8000 ? ` Il est rapide (${Math.round(c.latencyMs)} ms).` : ''}`,
              params: { model, dimension: dim },
              evidence: { overall, dimension: c.successRate, n: c.n, latencyMs: c.latencyMs },
              confidence: confidenceOf(c.n),
              sampleSize: c.n,
              effect: `éviter ${model} pour ${dim}`,
            },
            now,
          ),
        );
    }
  }

  // 7 — second model only when ambiguity exceeds X (needs real council runs with an ambiguity record)
  const council = log.filter((e) => e.fabric?.kind === 'council' && e.config);
  if (council.length >= n0 * 2) {
    const multi = council.filter((e) => (e.config!.councilSize ?? 1) >= 2);
    const single = council.filter((e) => (e.config!.councilSize ?? 1) < 2);
    if (multi.length >= n0 && single.length >= n0) {
      const dq =
        (mean(multi.map(qualityOfEntry).filter((x): x is number => x !== null)) ?? NaN) -
        (mean(single.map(qualityOfEntry).filter((x): x is number => x !== null)) ?? NaN);
      if (Number.isFinite(dq))
        out.push(
          mk(
            'council_gate',
            'council',
            'gain',
            {
              policy: `Le conseil de modèles change la qualité de ${dq >= 0 ? '+' : ''}${dq.toFixed(1)} points (${multi.length} conseils, ${single.length} modèles seuls).`,
              params: { gain: dq },
              evidence: { multi: multi.length, single: single.length, deltaQuality: dq },
              confidence: confidenceOf(Math.min(multi.length, single.length)),
              sampleSize: council.length,
              effect: 'sert d’estimation du gain attendu dans le gouverneur économique',
            },
            now,
          ),
        );
    }
  }
  return out;
}

/** Keeps user decisions (status, rollback) across a re-learning pass; stale when the evidence vanished. */
export function mergePolicies(existing: Policy[], learned: Policy[], now = Date.now()): Policy[] {
  const byId = new Map(existing.map((p) => [p.id, p]));
  const out: Policy[] = [];
  const seen = new Set<string>();
  for (const l of learned) {
    const e = byId.get(l.id);
    seen.add(l.id);
    out.push(
      e
        ? {
            ...l,
            status: e.status === 'stale' ? 'proposed' : e.status,
            rollback: e.rollback,
            lastValidated: now,
          }
        : l,
    );
  }
  for (const e of existing)
    if (!seen.has(e.id))
      out.push({ ...e, status: e.status === 'active' || e.status === 'proposed' ? 'stale' : e.status });
  return out;
}

export const activate = (p: Policy): Policy => ({ ...p, status: 'active' });
export function rollbackPolicy(p: Policy, reason: string, now = Date.now()): Policy {
  return { ...p, status: 'rolled_back', rollback: { previous: p.status, at: now, reason } };
}

export interface PolicyEffects {
  /** Models to prefer (in order) for the task type. */
  prefer: string[];
  avoid: string[];
  excludedTools: Set<string>;
  skipSkills: Set<string>;
  skipJev1: boolean;
  councilGain: number | null;
  applied: string[];
}
/** What the ACTIVE policies change for a mission of this type. */
export function applyPolicies(policies: Policy[], ctx: { taskType: string; dims?: string[] }): PolicyEffects {
  const act = policies.filter((p) => p.status === 'active');
  const fx: PolicyEffects = {
    prefer: [],
    avoid: [],
    excludedTools: new Set(),
    skipSkills: new Set(),
    skipJev1: false,
    councilGain: null,
    applied: [],
  };
  for (const p of act) {
    const pr = p.params;
    if (p.kind === 'model_preference' && pr.taskType === ctx.taskType) {
      fx.prefer.push(String(pr.prefer));
      fx.avoid.push(String(pr.over));
      fx.applied.push(p.policy);
    } else if (p.kind === 'tool_useless' && pr.taskType === ctx.taskType) {
      fx.excludedTools.add(String(pr.tool));
      fx.applied.push(p.policy);
    } else if (p.kind === 'skill_rework' && pr.taskType === ctx.taskType) {
      fx.skipSkills.add(String(pr.skill));
      fx.applied.push(p.policy);
    } else if (p.kind === 'jev1_value' && pr.taskType === ctx.taskType) {
      fx.skipJev1 = true;
      fx.applied.push(p.policy);
    } else if (p.kind === 'model_weakness' && (ctx.dims ?? []).includes(String(pr.dimension))) {
      fx.avoid.push(String(pr.model));
      fx.applied.push(p.policy);
    } else if (p.kind === 'council_gate') {
      fx.councilGain = Number(pr.gain);
    }
  }
  fx.prefer = [...new Set(fx.prefer)];
  fx.avoid = [...new Set(fx.avoid)];
  return fx;
}

// ───────────────────────── exploration vs exploitation ─────────────────────────

export interface ExploreInput {
  /** Candidates, best known first. */
  candidates: { model: string; cost: number | null }[];
  /** Exploration share (0.1 = 10 %). */
  epsilon: number;
  critical: boolean;
  /** 0..1: how much the mission matters (risk / difficulty). */
  importance: number;
  budgetLeft: number | null;
  estCost: number;
  rand: () => number;
}
export interface ExploreChoice {
  model: string;
  explored: boolean;
  reason: string;
}
/**
 * ε-greedy exploration, bounded by risk, budget, cost and importance: never on a critical or very
 * important mission, never when the budget is tight, never toward a model far dearer than the best.
 */
export function chooseWithExploration(i: ExploreInput): ExploreChoice {
  const [best, ...rest] = i.candidates;
  if (!best) return { model: '', explored: false, reason: 'aucun candidat' };
  if (i.critical)
    return { model: best.model, explored: false, reason: 'mission critique : exploitation seule' };
  if (i.importance >= 0.7)
    return {
      model: best.model,
      explored: false,
      reason: `importance ${i.importance.toFixed(2)} ≥ 0,7 : exploitation seule`,
    };
  if (i.budgetLeft !== null && i.estCost * 2 > i.budgetLeft)
    return { model: best.model, explored: false, reason: 'budget serré : exploitation seule' };
  const pool = rest.filter((c) => best.cost === null || c.cost === null || c.cost <= best.cost * 1.5);
  if (!pool.length)
    return {
      model: best.model,
      explored: false,
      reason: 'aucune alternative à coût comparable : exploitation',
    };
  const eps = i.epsilon * (1 - i.importance);
  if (i.rand() >= eps)
    return { model: best.model, explored: false, reason: `exploitation (${Math.round((1 - eps) * 100)} %)` };
  const pick = pool[Math.min(pool.length - 1, Math.floor(i.rand() * pool.length))]!;
  return {
    model: pick.model,
    explored: true,
    reason: `exploration contrôlée (ε = ${(eps * 100).toFixed(1)} %) : ${pick.model} au lieu de ${best.model}`,
  };
}

// ───────────────────────── economic governor ─────────────────────────

export type GovMode = 'eco' | 'balanced' | 'performance' | 'max';
/** Expected gain ÷ expected cost required to spend more, per mode. MAX = « tout ce que sa valeur justifie ». */
export const GOVERNOR_RATIO: Record<GovMode, number> = { eco: 2, balanced: 1.25, performance: 1, max: 1 };
/** Value multiplier of a quality point per mode (MAX values quality more, ECO less). */
export const GOVERNOR_VALUE_FACTOR: Record<GovMode, number> = {
  eco: 0.5,
  balanced: 1,
  performance: 1.5,
  max: 3,
};

export interface GovernorInput {
  action: string;
  mode: GovMode;
  /** Expected quality gain in points (0–100). */
  expectedQualityGain: number;
  /** Where the gain estimate comes from: measured history, or a prior (labelled PROJECTED). */
  gainSource: 'MEASURED' | 'PROJECTED';
  expectedCost: number;
  extraLatencyMs?: number;
  maxExtraLatencyMs?: number;
  risk: number;
  /** USD value of one quality point: a POLICY PARAMETER (adjustable), not a measurement. */
  valuePerPoint: number;
}
export interface GovernorDecision {
  use: boolean;
  expectedBenefit: number;
  expectedCost: number;
  ratio: number | null;
  required: number;
  gainSource: 'MEASURED' | 'PROJECTED';
  reason: string;
}
export function economicGovernor(i: GovernorInput): GovernorDecision {
  const value = i.valuePerPoint * GOVERNOR_VALUE_FACTOR[i.mode] * (1 + i.risk);
  const benefit = Math.max(0, i.expectedQualityGain) * value;
  const required = GOVERNOR_RATIO[i.mode];
  const ratio = i.expectedCost > 0 ? benefit / i.expectedCost : null;
  if (i.maxExtraLatencyMs !== undefined && (i.extraLatencyMs ?? 0) > i.maxExtraLatencyMs)
    return {
      use: false,
      expectedBenefit: benefit,
      expectedCost: i.expectedCost,
      ratio,
      required,
      gainSource: i.gainSource,
      reason: `${i.action} : latence supplémentaire ${Math.round(i.extraLatencyMs ?? 0)} ms > ${i.maxExtraLatencyMs} ms tolérés`,
    };
  const use = ratio === null ? benefit > 0 : ratio >= required;
  return {
    use,
    expectedBenefit: benefit,
    expectedCost: i.expectedCost,
    ratio,
    required,
    gainSource: i.gainSource,
    reason: use
      ? `${i.action} : bénéfice attendu ${benefit.toFixed(5)} $ ≥ ${required}× le coût ${i.expectedCost.toFixed(5)} $ (${i.gainSource === 'MEASURED' ? 'gain tiré de mesures' : 'gain projeté, a priori'}) → USE`
      : `Je pourrais faire « ${i.action} », mais cela ne vaut pas économiquement la peine : bénéfice attendu ${benefit.toFixed(5)} $ < ${required}× le coût ${i.expectedCost.toFixed(5)} $ (${i.gainSource === 'MEASURED' ? 'mesuré' : 'projeté'}) → SKIP`,
  };
}

// ───────────────────────── JEV health score ─────────────────────────

export interface HealthPart {
  key: string;
  label: string;
  /** 0..100, or null when there is not enough data. */
  score: number | null;
  formula: string;
  detail: string;
  samples: number;
}
export interface Health {
  parts: HealthPart[];
  /** Mean of the available parts (never padded with defaults). */
  overall: number | null;
  formula: string;
}

export interface HealthInput {
  log: JevLogEntry[];
  skills: { status: string }[];
  policies: Policy[];
  failureSignatures: number;
  /** Count of failing runs. */
  minN?: number;
}

export function jevHealth(h: HealthInput): Health {
  const n0 = h.minN ?? 5;
  const log = h.log;
  const judged = log.filter((e) => e.success !== null);
  const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);
  const parts: HealthPart[] = [];

  const clean = judged.filter(
    (e) => e.success && e.retries === 0 && e.escalations === 0 && e.corrections === 0,
  ).length;
  parts.push({
    key: 'routing',
    label: 'Routing Health',
    score: judged.length >= n0 ? pct(clean / judged.length) : null,
    formula: 'missions réussies sans bascule, escalade ni correction ÷ missions jugées',
    detail: `${clean}/${judged.length}`,
    samples: judged.length,
  });

  const sk = h.skills.filter((s) => s.status !== 'candidate');
  const good = sk.filter((s) => s.status === 'validated').length;
  parts.push({
    key: 'skill',
    label: 'Skill Health',
    score: sk.length >= 1 ? pct(good / sk.length) : null,
    formula: 'skills validées ÷ skills testées (hors candidates)',
    detail: `${good}/${sk.length}`,
    samples: sk.length,
  });

  const byModel = new Map<string, JevLogEntry[]>();
  for (const e of judged)
    if (e.model && e.model !== 'JEV-0') byModel.set(e.model, [...(byModel.get(e.model) ?? []), e]);
  const ms = [...byModel].filter(([, es]) => es.length >= 3);
  const w = ms.reduce((a, [, es]) => a + es.length, 0);
  parts.push({
    key: 'model',
    label: 'Model Health',
    score: ms.length ? pct(ms.reduce((a, [, es]) => a + (rate(es) ?? 0) * es.length, 0) / w) : null,
    formula: 'réussite moyenne pondérée des modèles ayant ≥ 3 missions jugées',
    detail: `${ms.length} modèle(s)`,
    samples: w,
  });

  const withTools = log.filter((e) => (e.toolCallCount ?? 0) > 0);
  const calls = withTools.reduce((a, e) => a + (e.toolCallCount ?? 0), 0);
  const errs = withTools.reduce((a, e) => a + (e.toolErrorCount ?? 0), 0);
  parts.push({
    key: 'tool',
    label: 'Tool Health',
    score: calls >= 10 ? pct(1 - errs / calls) : null,
    formula: '1 − appels d’outils en erreur ÷ appels d’outils',
    detail: `${errs} erreur(s) / ${calls}`,
    samples: calls,
  });

  const structured = log.filter((e) => e.config).length;
  const failing = log.filter((e) => e.success === false).length;
  parts.push({
    key: 'memory',
    label: 'Memory Health',
    score:
      log.length >= n0
        ? pct(
            0.5 * (structured / log.length) +
              0.5 * (failing ? Math.min(1, h.failureSignatures / failing) : 1),
          )
        : null,
    formula: '½ × missions avec configuration enregistrée + ½ × échecs couverts par une signature',
    detail: `${structured}/${log.length} structurées, ${h.failureSignatures} signature(s)`,
    samples: log.length,
  });

  const under = log.filter((e) => (e.acct?.unmeasuredCostShare ?? 0) < 0.05).length;
  const ovh = log.filter((e) => e.acct && e.acct.totalCost > 0);
  const ovhOk = ovh.filter((e) => e.acct!.jevCost / e.acct!.totalCost <= 0.1).length;
  parts.push({
    key: 'cost',
    label: 'Cost Health',
    score: ovh.length >= n0 ? pct(0.5 * (ovhOk / ovh.length) + 0.5 * (under / log.length)) : null,
    formula: '½ × missions où JEV ≤ 10 % du coût + ½ × missions dont le coût est mesuré (≥ 95 %)',
    detail: `${ovhOk}/${ovh.length}`,
    samples: ovh.length,
  });

  const active = h.policies.filter((p) => p.status === 'active');
  const recent = judged.slice(-20);
  const prev = judged.slice(-40, -20);
  const trend = recent.length >= 10 && prev.length >= 10 ? (rate(recent) ?? 0) - (rate(prev) ?? 0) : null;
  parts.push({
    key: 'learning',
    label: 'Learning Health',
    score: trend === null ? null : pct(0.5 + trend),
    formula: '50 + variation de la réussite (20 dernières vs 20 précédentes missions) en points',
    detail:
      trend === null
        ? `${active.length} politique(s) active(s) ; tendance non mesurable`
        : `${active.length} politique(s) active(s) ; tendance ${(trend * 100).toFixed(0)} pts`,
    samples: judged.length,
  });

  const av = parts.filter((p) => p.score !== null).map((p) => p.score!);
  return {
    parts,
    overall: av.length ? Math.round(av.reduce((a, b) => a + b, 0) / av.length) : null,
    formula:
      'moyenne des composantes disponibles (une composante non mesurable est exclue, jamais remplacée par une valeur par défaut)',
  };
}
