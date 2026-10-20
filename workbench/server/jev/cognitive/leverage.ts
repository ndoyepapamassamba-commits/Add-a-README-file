// JEV COGNITIVE OS — COGNITIVE / TOKEN / COST LEVERAGE and ZERO-WASTE ledger, from PAIRED real runs (same task, same
// controlled variables, with and without JEV). No pair → INSUFFICIENT DATA. Projections are never mixed with measurements.
import type { JevLogEntry } from '../metrics';
import { pairUp, type Pair } from '../science';
import { qualityOfEntry } from '../fabric/memory';
import { pairedDiff, confidenceOf } from '../apprentice/stats';

export interface Leverage {
  pairs: number;
  confidence: ReturnType<typeof confidenceOf>;
  /** Quality with / without (ratio of means). */
  cognitive: number | null;
  /** Tokens without / with. */
  token: number | null;
  /** Cost without / with. */
  cost: number | null;
  qualityPerDollar: { without: number | null; with: number | null };
  qualityPer1kTokens: { without: number | null; with: number | null };
  qualityDelta: { mean: number; lo: number; hi: number } | null;
  /** Value created: money and tokens really saved on the pairs (negative = JEV cost more). */
  valueCreated: { dollars: number; tokens: number };
  variant: string;
  note: string;
}
const tok = (e: JevLogEntry) => e.acct?.totalTokens ?? e.tokensIn + e.tokensOut;
const cost = (e: JevLogEntry) => e.acct?.totalCost ?? e.cost + e.jevCost;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function leverage(log: JevLogEntry[], variant: 'full' | 'live' | 'pre' = 'full'): Leverage {
  const paired = pairUp(log).pairs.filter((p: Pair) => p.variant === variant);
  const judged = paired.filter((p) => qualityOfEntry(p.off) !== null && qualityOfEntry(p.v) !== null);
  const n = paired.length;
  const empty = (note: string): Leverage => ({
    pairs: n,
    confidence: confidenceOf(n),
    cognitive: null,
    token: null,
    cost: null,
    qualityPerDollar: { without: null, with: null },
    qualityPer1kTokens: { without: null, with: null },
    qualityDelta: null,
    valueCreated: { dollars: 0, tokens: 0 },
    variant,
    note,
  });
  if (!n) return empty('INSUFFICIENT DATA : aucune paire sans JEV / avec JEV. Lancez un benchmark apparié.');
  const qOff = sum(judged.map((p) => qualityOfEntry(p.off)!));
  const qOn = sum(judged.map((p) => qualityOfEntry(p.v)!));
  const tOff = sum(paired.map((p) => tok(p.off)));
  const tOn = sum(paired.map((p) => tok(p.v)));
  const cOff = sum(paired.map((p) => cost(p.off)));
  const cOn = sum(paired.map((p) => cost(p.v)));
  const d =
    judged.length >= 3
      ? pairedDiff(judged.map((p) => ({ a: qualityOfEntry(p.v)!, b: qualityOfEntry(p.off)! })))
      : null;
  return {
    pairs: n,
    confidence: confidenceOf(n),
    cognitive: judged.length && qOff ? qOn / qOff : null,
    token: tOn ? tOff / tOn : null,
    cost: cOn ? cOff / cOn : cOff === 0 ? null : Infinity,
    qualityPerDollar: {
      without: judged.length && cOff ? qOff / judged.length / cOff : null,
      with: judged.length && cOn ? qOn / judged.length / cOn : null,
    },
    qualityPer1kTokens: {
      without: judged.length && tOff ? (qOff / judged.length / tOff) * 1000 : null,
      with: judged.length && tOn ? (qOn / judged.length / tOn) * 1000 : null,
    },
    qualityDelta: d ? { mean: d.value, lo: d.lo, hi: d.hi } : null,
    valueCreated: { dollars: cOff - cOn, tokens: tOff - tOn },
    variant,
    note:
      judged.length < n
        ? `${n - judged.length} paire(s) sans qualité mesurée : exclues des ratios de qualité`
        : `${n} paire(s) mesurée(s)`,
  };
}

export interface ZeroWaste {
  runs: number;
  tokensSaved: number;
  callsAvoided: number;
  premiumCallsAvoided: number;
  contextCompressedTokens: number;
  retriesAvoided: number;
  costAvoided: number;
  qualityGained: number | null;
  /** Everything above is read from the log entries; this lists what each figure is made of. */
  sources: string[];
}
/** Savings that the log actually recorded (live control, tool packs, context compiler, cache hits, free-first). */
export function zeroWaste(log: JevLogEntry[]): ZeroWaste {
  const es = log.filter((e) => !e.studio);
  const tokensSaved =
    sum(es.map((e) => e.liveSavedTokens ?? 0)) +
    sum(es.map((e) => Math.max(0, e.toolTokensBaseline - e.toolTokens) * e.calls));
  const ctx = sum(es.map((e) => Math.max(0, e.contextBefore - e.contextAfter)));
  const cacheHits = sum(es.map((e) => e.cacheHits));
  const free = es.filter(
    (e) => e.apprentice?.active && e.apprentice.accepted && (e.apprentice.path.length ?? 0) <= 1,
  );
  const wasted = sum(es.map((e) => e.wasted ?? 0));
  const { pairs } = pairUp(log);
  const gains = pairs
    .map((p) => (qualityOfEntry(p.v) ?? NaN) - (qualityOfEntry(p.off) ?? NaN))
    .filter(Number.isFinite);
  return {
    runs: es.length,
    tokensSaved,
    callsAvoided: cacheHits + es.filter((e) => e.decisionBy === 'direct').length,
    premiumCallsAvoided: free.length,
    contextCompressedTokens: ctx,
    retriesAvoided: 0,
    costAvoided: sum(pairs.filter((p) => p.variant === 'full').map((p) => cost(p.off) - cost(p.v))),
    qualityGained: gains.length ? sum(gains) / gains.length : null,
    sources: [
      `live control + tool packs : ${tokensSaved} tokens (journal)`,
      `context compiler : ${ctx} tokens (journal)`,
      `cache hits + réponses locales JEV-0 : ${cacheHits + es.filter((e) => e.decisionBy === 'direct').length} appel(s)`,
      `free-first accepté sans escalade : ${free.length} mission(s)`,
      `gaspillage mesuré restant : ${wasted} tokens`,
    ],
  };
}
