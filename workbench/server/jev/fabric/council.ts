// JEV MODEL COUNCIL, MODEL TOURNAMENT and FREE MODEL LAB (pure parts).
// Never a blind vote: JEV decides how many models are needed (1 simple, 2 ambiguous, 3+ critical),
// each extra model must pass the economic governor, the evaluator is deterministic first, and a
// paid LLM judge only looks at the DISPUTED point.
import type { ModelInfo } from '../../../shared/types';
import type { JevLogEntry } from '../metrics';
import { similarity } from '../live';
import { qualityCheck, type QaResult } from '../qa';
import { outputSpec } from '../style';
import { economicGovernor, type GovMode, type GovernorDecision } from './learning';
import { qualityOfEntry } from './memory';

// ───────────────────────── council planning ─────────────────────────

export interface CouncilCandidate {
  id: string;
  provider: string;
  /** Estimated cost of one answer, USD (null = unknown). */
  estCost: number | null;
  /** Expertise rank for the task (1 = best), when measured. */
  rank?: number;
  free?: boolean;
}
export interface CouncilPlanInput {
  difficulty: number;
  ambiguity: number;
  risk: number;
  critical: boolean;
  mode: GovMode;
  candidates: CouncilCandidate[];
  budgetLeft: number | null;
  /** Measured mean quality gain of a council vs a single model (points), when there are real council runs. */
  measuredGain: number | null;
  valuePerPoint: number;
}
export interface CouncilPlan {
  wanted: number;
  size: number;
  members: CouncilCandidate[];
  decisions: GovernorDecision[];
  evaluator: 'local' | 'local+judge';
  reason: string;
}

/** How many models a task would deserve, before the economics. */
export function wantedSize(
  i: Pick<CouncilPlanInput, 'difficulty' | 'ambiguity' | 'risk' | 'critical' | 'mode'>,
): number {
  let n = 1;
  if (i.ambiguity >= 0.5 || i.difficulty >= 0.6) n = 2;
  if (i.critical || i.risk >= 0.7) n = 3;
  const cap = { eco: 2, balanced: 3, performance: 3, max: 4 }[i.mode];
  if (i.mode === 'max' && (i.critical || i.risk >= 0.85)) n = Math.max(n, 4);
  return Math.min(n, cap);
}

/** Models from different providers first (diversity), best measured rank first, then cheapest. */
export function pickMembers(c: CouncilCandidate[], n: number): CouncilCandidate[] {
  const sorted = [...c].sort(
    (a, b) => (a.rank ?? 99) - (b.rank ?? 99) || (a.estCost ?? 9) - (b.estCost ?? 9),
  );
  const out: CouncilCandidate[] = [];
  const seen = new Set<string>();
  for (const m of sorted)
    if (!seen.has(m.provider) && out.length < n) {
      out.push(m);
      seen.add(m.provider);
    }
  for (const m of sorted) if (out.length < n && !out.includes(m)) out.push(m);
  return out;
}

export function planCouncil(i: CouncilPlanInput): CouncilPlan {
  const wanted = wantedSize(i);
  if (wanted <= 1 || i.candidates.length < 2)
    return {
      wanted,
      size: 1,
      members: i.candidates.slice(0, 1),
      decisions: [],
      evaluator: 'local',
      reason:
        wanted <= 1
          ? 'tâche simple et non ambiguë : un seul modèle'
          : 'moins de deux modèles utilisables : un seul modèle',
    };
  const members = pickMembers(i.candidates, wanted);
  const accepted: CouncilCandidate[] = [members[0]!];
  const decisions: GovernorDecision[] = [];
  // Each extra member must pass the economic governor (EVI). Gain: measured when real council runs exist, else a projected prior.
  for (const m of members.slice(1)) {
    const prior = Math.min(8, 2 + 6 * i.ambiguity + 4 * i.risk);
    const gain = i.measuredGain !== null ? Math.max(0, i.measuredGain / Math.max(1, wanted - 1)) : prior;
    const d = economicGovernor({
      action: `ajouter ${m.id} au conseil`,
      mode: i.mode,
      expectedQualityGain: gain,
      gainSource: i.measuredGain !== null ? 'MEASURED' : 'PROJECTED',
      expectedCost: m.estCost ?? 0.01,
      risk: i.risk,
      valuePerPoint: i.valuePerPoint,
    });
    const fits = i.budgetLeft === null || (m.estCost ?? 0) * (accepted.length + 1) <= i.budgetLeft;
    decisions.push(fits ? d : { ...d, use: false, reason: `${d.reason} — budget restant insuffisant` });
    if (decisions.at(-1)!.use) accepted.push(m);
    else break;
  }
  return {
    wanted,
    size: accepted.length,
    members: accepted,
    decisions,
    evaluator: accepted.length >= 3 || i.critical ? 'local+judge' : 'local',
    reason:
      accepted.length < wanted
        ? `${wanted} modèles auraient été souhaités, ${accepted.length} retenu(s) après évaluation économique`
        : `${accepted.length} modèles : ${i.critical ? 'tâche critique' : i.ambiguity >= 0.5 ? 'tâche ambiguë' : 'tâche difficile'}`,
  };
}

/** Heuristic ambiguity (0..1) when JEV-1 did not provide one: short, vague, no constraint, many questions. */
export function ambiguityOf(text: string): number {
  const t = text.trim();
  let a = 0;
  if (t.length < 40) a += 0.25;
  if (/\b(ça|cela|ceci|ce truc|le truc|comme avant|pareil)\b/i.test(t)) a += 0.3;
  if ((t.match(/\?/g) ?? []).length >= 2) a += 0.15;
  if (!/\d|"|«|\.(csv|xlsx|json|md|txt)\b/.test(t)) a += 0.15;
  if (/\b(ou bien|peut-être|je ne sais pas|au choix)\b/i.test(t)) a += 0.2;
  return Math.min(1, a);
}

// ───────────────────────── evaluation of the answers ─────────────────────────

export interface MemberAnswer {
  model: string;
  answer: string;
  ok: boolean;
  error?: string;
  tokens: number;
  cost: number;
  ms: number;
}
export interface ScoredMember extends MemberAnswer {
  qa: QaResult | null;
  /** The benchmark's ground-truth check, when the task has one. */
  expected: boolean | null;
  score: number;
}
export interface Evaluation {
  members: ScoredMember[];
  winner: ScoredMember | null;
  /** All the (usable) answers agree: no judge call is useful. */
  consensus: boolean;
  /** Points on which the answers differ (numbers or key terms). */
  disputes: string[];
  why: string;
}

const numbersOf = (t: string): string[] =>
  [...t.matchAll(/-?\d[\d\s.,]*\d|\d/g)].map((m) => m[0].replace(/[\s.,]/g, '')).filter((x) => x.length > 0);
const norm = (xs: string[]) => [...new Set(xs)].sort();

/** Deterministic evaluator: local quality vector, optional ground truth, agreement analysis. */
export function evaluateAnswers(
  task: string,
  answers: MemberAnswer[],
  o: { expect?: RegExp } = {},
): Evaluation {
  const spec = outputSpec(task);
  const members: ScoredMember[] = answers.map((a) => {
    if (!a.ok || !a.answer.trim()) return { ...a, qa: null, expected: null, score: -1 };
    const qa = qualityCheck({
      answer: a.answer,
      spec,
      evidence: [task],
      usedTools: false,
      toolErrors: 0,
      toolCalls: 0,
      tokens: a.tokens,
      tokenBudget: 60_000,
    });
    const expected = o.expect ? o.expect.test(a.answer) : null;
    return {
      ...a,
      qa,
      expected,
      score: qa.score + (expected === true ? 100 : expected === false ? -100 : 0),
    };
  });
  const usable = members.filter((m) => m.score >= -50 && m.ok);
  if (!usable.length)
    return { members, winner: null, consensus: false, disputes: [], why: 'aucune réponse exploitable' };
  const given = new Set(numbersOf(task));
  const own = (t: string) => norm(numbersOf(t).filter((x) => !given.has(x)));
  const nums = usable.map((m) => own(m.answer));
  const sameNums = nums.every((n) => JSON.stringify(n) === JSON.stringify(nums[0]));
  const sims = usable.flatMap((a, i) => usable.slice(i + 1).map((b) => similarity(a.answer, b.answer)));
  const consensus = usable.length === 1 || (sameNums && (nums[0]!.length > 0 || sims.every((s) => s >= 0.5)));
  const disputes: string[] = [];
  if (!sameNums) {
    const all = new Set(nums.flat());
    const common = [...all].filter((x) => nums.every((n) => n.includes(x)));
    const diff = [...all].filter((x) => !common.includes(x)).slice(0, 6);
    if (diff.length) disputes.push(`valeurs différentes : ${diff.join(', ')}`);
  }
  // winner: ground truth, then local score, then majority numbers, then cheapest
  const maj = (m: ScoredMember) =>
    sameNums ? 1 : nums.filter((n) => JSON.stringify(n) === JSON.stringify(own(m.answer))).length;
  const winner = [...usable].sort((a, b) => b.score - a.score || maj(b) - maj(a) || a.cost - b.cost)[0]!;
  const truth = o.expect ? 'contrôle de réussite de la tâche' : 'score local de qualité';
  return {
    members,
    winner,
    consensus,
    disputes,
    why: consensus
      ? `réponses concordantes : ${winner.model} retenu (${truth}, puis coût le plus bas)`
      : `désaccord : ${winner.model} retenu sur le ${truth}${disputes.length ? ` (${disputes[0]})` : ''}`,
  };
}

/** The judge sees ONLY the disputed point, not the whole answers (cost control). */
export function judgePrompt(task: string, ev: Evaluation): string {
  const lines = ev.members
    .filter((m) => m.ok)
    .map((m, i) => `Réponse ${String.fromCharCode(65 + i)} : ${m.answer.replace(/\s+/g, ' ').slice(0, 400)}`);
  return `Tâche : ${task.slice(0, 600)}\nPoint en désaccord : ${ev.disputes.join(' ; ') || 'la conclusion'}\n${lines.join('\n')}\nRéponds uniquement par la lettre de la réponse la plus exacte sur ce point.`;
}
export function parseJudge(text: string, n: number): number | null {
  const m = /\b([A-D])\b/.exec(text.toUpperCase());
  if (!m) return null;
  const i = m[1]!.charCodeAt(0) - 65;
  return i < n ? i : null;
}

// ───────────────────────── free model lab ─────────────────────────

export interface FreeModel {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  tools: boolean;
  vision: boolean;
  structuredOutputs: boolean;
  reasoning: boolean;
}
/** $0 inference price — NOT unlimited availability. Only the price is read from the catalog. */
export const isFree = (m: ModelInfo) => m.id.endsWith(':free') || (m.inputPrice === 0 && m.outputPrice === 0);
export function freePool(models: ModelInfo[]): FreeModel[] {
  return models
    .filter(isFree)
    .map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      contextLength: m.contextLength,
      tools: m.capabilities.tools,
      vision: m.capabilities.vision,
      structuredOutputs: m.capabilities.structuredOutputs,
      reasoning: m.capabilities.reasoning,
    }))
    .sort((a, b) => b.contextLength - a.contextLength);
}
export const FREE_LIMITATIONS = [
  'Un prix d’inférence de 0 $ ne signifie pas une disponibilité illimitée : le fournisseur peut imposer des quotas, des limites de débit (HTTP 429) et retirer le modèle.',
  'La politique de données des fournisseurs de modèles gratuits n’est pas exposée par le catalogue : elle est traitée comme NON RENSEIGNÉE (jamais comme sûre). Les données CONFIDENTIAL et plus n’y sont pas envoyées par le Fabric.',
  'Le support des outils, de la vision et des sorties structurées dépend du modèle et du fournisseur ; il est vérifié par des essais réels, pas supposé.',
  'Un modèle gratuit n’est pas équivalent à un modèle premium : le laboratoire mesure sur quelles tâches il atteint une performance opérationnelle comparable, avec JEV.',
];

export interface FreeStat {
  model: string;
  runs: number;
  successRate: number | null;
  quality: number | null;
  latencyMs: number | null;
  /** Runs whose failure looks like a rate limit / quota. */
  rateLimited: number;
  errors: number;
  availability: number | null;
}
export function freeStats(log: JevLogEntry[], pool: FreeModel[]): FreeStat[] {
  const ids = new Set(pool.map((p) => p.id));
  const by = new Map<string, JevLogEntry[]>();
  for (const e of log)
    if (ids.has(e.model) || (e.fabric?.models ?? []).some((m) => ids.has(m)))
      by.set(e.model, [...(by.get(e.model) ?? []), e]);
  return [...by].map(([model, es]) => {
    const j = es.filter((e) => e.success !== null);
    const errs = es.filter((e) => e.failureNote);
    const q = es.map(qualityOfEntry).filter((x): x is number => x !== null);
    return {
      model,
      runs: es.length,
      successRate: j.length ? j.filter((e) => e.success).length / j.length : null,
      quality: q.length ? q.reduce((a, b) => a + b, 0) / q.length : null,
      latencyMs: es.length ? es.reduce((a, e) => a + e.latencyMs, 0) / es.length : null,
      rateLimited: errs.filter((e) => /429|rate.?limit|quota|too many/i.test(e.failureNote!)).length,
      errors: errs.length,
      availability: es.length ? 1 - errs.length / es.length : null,
    };
  });
}

// ───────────────────────── tournament ─────────────────────────

export interface TournamentRow {
  model: string;
  runs: number;
  successRate: number | null;
  quality: number | null;
  cost: number | null;
  latencyMs: number | null;
  /** 1 − retry / escalation rate. */
  robustness: number | null;
  rank: number;
}
/** Ranking inside a domain (category) from tournament runs only: success, quality, then cost. */
export function tournament(log: JevLogEntry[], category?: string): Record<string, TournamentRow[]> {
  const es = log.filter((e) => e.fabric?.kind === 'tournament' || e.fabric?.kind === 'freebench');
  const cats = [...new Set(es.map((e) => e.fabric!.category ?? e.task))];
  const out: Record<string, TournamentRow[]> = {};
  for (const c of cats) {
    if (category && c !== category) continue;
    const m = new Map<string, JevLogEntry[]>();
    for (const e of es.filter((x) => (x.fabric!.category ?? x.task) === c))
      m.set(e.model, [...(m.get(e.model) ?? []), e]);
    const rows = [...m].map(([model, xs]) => {
      const j = xs.filter((e) => e.success !== null);
      const q = xs.map(qualityOfEntry).filter((x): x is number => x !== null);
      return {
        model,
        runs: xs.length,
        successRate: j.length ? j.filter((e) => e.success).length / j.length : null,
        quality: q.length ? q.reduce((a, b) => a + b, 0) / q.length : null,
        cost: xs.reduce((a, e) => a + (e.acct?.totalCost ?? e.cost + e.jevCost), 0) / xs.length,
        latencyMs: xs.reduce((a, e) => a + e.latencyMs, 0) / xs.length,
        robustness: Math.max(0, 1 - xs.filter((e) => e.retries > 0 || e.escalations > 0).length / xs.length),
      };
    });
    rows.sort(
      (a, b) =>
        Math.round((b.successRate ?? 0) * 100) - Math.round((a.successRate ?? 0) * 100) ||
        (b.quality ?? 0) - (a.quality ?? 0) ||
        (a.cost ?? 9) - (b.cost ?? 9),
    );
    out[c] = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }
  return out;
}

/** A model can be #1 in coding and #4 in reasoning: the ranks per domain, from the tournament. */
export function ranksOf(t: Record<string, TournamentRow[]>, model: string): Record<string, number> {
  return Object.fromEntries(
    Object.entries(t).flatMap(([c, rows]) =>
      rows.find((r) => r.model === model) ? [[c, rows.find((r) => r.model === model)!.rank]] : [],
    ),
  );
}
