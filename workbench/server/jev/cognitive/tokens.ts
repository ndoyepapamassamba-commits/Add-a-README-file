// JEV COGNITIVE OS — TOKEN INTELLIGENCE ENGINE.
// Goal: the MINIMUM SUFFICIENT context instead of the maximum available one. Everything here is measured on the real
// text that would be sent (estimated tokens = ceil(chars / 3.8), always labelled as an estimate).
import { estTokens, scoreItems, type ContextItem } from '../context';
import type { CognitiveDiagnosis } from './diagnosis';

export type PartKind = 'system' | 'instruction' | 'history' | 'tool' | 'memory' | 'context' | 'user';
export interface Part {
  id: string;
  kind: PartKind;
  text: string;
  /** Turn index for history parts (0 = oldest). */
  turn?: number;
}
export interface TokenReport {
  total: number;
  byKind: Record<PartKind, number>;
  /** Tokens of sentences that already appeared earlier in the context. */
  repeated: number;
  /** Old history turns that do not relate to the goal. */
  obsolete: number;
  /** Tool definitions never needed by the goal. */
  unusedTools: number;
  waste: number;
  repeatedContextRatio: number;
  /** unique words / total words (0-1). */
  informationDensity: number;
  /** 1 − waste / total. */
  usefulTokenRatio: number;
  findings: string[];
}
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const sentences = (t: string) =>
  t
    .split(/(?<=[.!?\n])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 25);

export function analyzeTokens(
  goal: string,
  parts: Part[],
  o: { usedTools?: string[]; keepTurns?: number } = {},
): TokenReport {
  const byKind = { system: 0, instruction: 0, history: 0, tool: 0, memory: 0, context: 0, user: 0 } as Record<
    PartKind,
    number
  >;
  let total = 0;
  const seen = new Set<string>();
  let repeated = 0;
  const findings: string[] = [];
  const words: string[] = [];
  for (const p of parts) {
    const t = estTokens(p.text);
    byKind[p.kind] += t;
    total += t;
    for (const w of norm(p.text).split(' ')) if (w) words.push(w);
    for (const s of sentences(p.text)) {
      const k = norm(s);
      if (seen.has(k)) repeated += estTokens(s);
      else seen.add(k);
    }
  }
  const history = parts.filter((p) => p.kind === 'history');
  const maxTurn = Math.max(0, ...history.map((h) => h.turn ?? 0));
  const keep = o.keepTurns ?? 4;
  const scored = scoreItems(
    goal,
    history.map((h) => ({ id: h.id, kind: 'history', text: h.text, recency: 0.5 }) as ContextItem),
  );
  let obsolete = 0;
  for (const h of history) {
    const old = (h.turn ?? 0) < maxTurn - keep;
    const s = scored.find((x) => x.id === h.id);
    if (old && s && s.score < 0.25) obsolete += estTokens(h.text);
  }
  let unusedTools = 0;
  if (o.usedTools) {
    const used = new Set(o.usedTools);
    for (const p of parts.filter((x) => x.kind === 'tool'))
      if (!used.has(p.id)) unusedTools += estTokens(p.text);
  }
  const waste = repeated + obsolete + unusedTools;
  if (repeated) findings.push(`${repeated} tokens répétés (phrases déjà présentes plus haut)`);
  if (obsolete) findings.push(`${obsolete} tokens d’historique ancien sans rapport avec la demande`);
  if (unusedTools) findings.push(`${unusedTools} tokens de définitions d’outils inutiles pour cette demande`);
  return {
    total,
    byKind,
    repeated,
    obsolete,
    unusedTools,
    waste,
    repeatedContextRatio: total ? repeated / total : 0,
    informationDensity: words.length ? new Set(words).size / words.length : 0,
    usefulTokenRatio: total ? Math.max(0, 1 - waste / total) : 1,
    findings,
  };
}

export interface TokenBudget {
  maxInput: number;
  maxOutput: number;
  reasoning: number;
  correctionReserve: number;
  expectedTokens: number;
  rationale: string[];
}
const OUT_BASE: Record<string, number> = {
  converse: 500,
  recall: 700,
  compute: 700,
  extract: 1200,
  verify: 1500,
  analyze: 2500,
  plan: 2500,
  create: 3000,
  code: 5000,
};
/** Token Budget Planner: a MAXIMUM per call derived from the diagnosis (a ceiling, never a target to fill). */
export function planTokenBudget(
  d: CognitiveDiagnosis,
  o: { contextTokens: number; modelContext?: number },
): TokenBudget {
  const rationale: string[] = [];
  const out = Math.round((OUT_BASE[d.cognitiveType] ?? 1500) * (d.difficulty >= 0.6 ? 1.4 : 1));
  rationale.push(`sortie plafonnée à ${out} tokens pour une tâche « ${d.cognitiveType} »`);
  const sufficient = Math.round(
    Math.max(800, Math.min(o.contextTokens, 2500 + d.difficulty * 9000 + (d.memoryNeed ? 1500 : 0))),
  );
  rationale.push(
    `entrée : contexte minimal suffisant ≈ ${sufficient} tokens (disponible : ${o.contextTokens})`,
  );
  const reasoning = d.trivial ? 0 : Math.round(150 + d.reasoningNeed * 600);
  const reserve =
    d.risk === 'high' ? Math.round(out * 0.35) : d.risk === 'normal' ? Math.round(out * 0.15) : 0;
  if (reserve) rationale.push(`réserve de correction ${reserve} tokens (risque ${d.risk})`);
  const maxInput = Math.min(sufficient, o.modelContext ?? Infinity);
  return {
    maxInput,
    maxOutput: out,
    reasoning,
    correctionReserve: reserve,
    expectedTokens: Math.min(o.contextTokens, maxInput) + Math.round(out * 0.6) + reasoning,
    rationale,
  };
}

/** Cost of a budget at given prices ($ per token); null prices → null (never guessed). */
export const budgetCost = (b: TokenBudget, price: { in: number; out: number } | null): number | null =>
  price
    ? (b.expectedTokens - Math.round(b.maxOutput * 0.6)) * price.in +
      Math.round(b.maxOutput * 0.6) * price.out
    : null;

/** Compression ratios of a before/after pair (measured). */
export function compressionRatio(before: number, after: number) {
  return {
    before,
    after,
    ratio: before ? after / before : 1,
    saved: Math.max(0, before - after),
    reduction: before ? 1 - after / before : 0,
  };
}
