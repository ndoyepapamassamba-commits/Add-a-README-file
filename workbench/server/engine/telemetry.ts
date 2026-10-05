// Mission telemetry → cost optimizer. Measures what matters: the total cost of
// a SUCCESSFUL mission (retries, escalations, sub-agents and QA rounds
// included), not the price of one request. Savings are estimated against the
// premium model at the same token counts — an estimate, labelled as such.
import type { ModelInfo } from '@shared/types';
import type { LedgerEntry } from '../agent/intelligence';

export interface MetricRow {
  key: string;
  missions: number;
  successes: number;
  successRate: number;
  cost: number;
  costPerSuccess: number | null;
  avgQa: number | null;
  /** $ per QA point (lower is better). */
  costPerQuality: number | null;
  /** QA points per $ (higher is better). */
  qualityPerDollar: number | null;
  tokensPerSuccess: number | null;
  timePerSuccessMs: number | null;
  escalations: number;
  corrections: number;
}

const won = (e: LedgerEntry) => e.verdict === 'PASSED' && !e.humanCorrection;
const qaOf = (e: LedgerEntry) =>
  e.qa ?? (e.verdict === 'PASSED' ? 85 : e.verdict === 'PARTIAL' ? 55 : e.verdict === 'FAILED' ? 25 : 0);

export function metrics(entries: LedgerEntry[], by: 'model' | 'agent' | 'type' | 'tier'): MetricRow[] {
  const groups = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const k =
      by === 'model'
        ? e.model
        : by === 'agent'
          ? (e.agent ?? 'general')
          : by === 'type'
            ? e.dna.type
            : e.tier;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.entries()]
    .map(([key, es]) => {
      const ok = es.filter(won);
      const cost = es.reduce((s, e) => s + e.cost, 0);
      const qas = es.map(qaOf);
      const avgQa = qas.length ? qas.reduce((a, b) => a + b, 0) / qas.length : null;
      const tokens = es.reduce((s, e) => s + (e.tokensIn ?? 0) + (e.tokensOut ?? 0), 0);
      const time = es.reduce((s, e) => s + e.durationMs, 0);
      return {
        key,
        missions: es.length,
        successes: ok.length,
        successRate: es.length ? ok.length / es.length : 0,
        cost,
        costPerSuccess: ok.length ? cost / ok.length : null,
        avgQa,
        costPerQuality: avgQa ? cost / es.length / avgQa : null,
        qualityPerDollar: cost > 0 && avgQa ? (avgQa * es.length) / cost : null,
        tokensPerSuccess: ok.length && tokens ? tokens / ok.length : null,
        timePerSuccessMs: ok.length ? time / ok.length : null,
        escalations: es.reduce((s, e) => s + (e.escalations ?? 0), 0),
        corrections: es.filter((e) => e.humanCorrection).length,
      };
    })
    .sort((a, b) => b.missions - a.missions);
}

export interface Savings {
  missions: number;
  actual: number;
  premiumEquivalent: number;
  saved: number;
  premium: string | null;
  note: string;
}
/** What the same missions would have cost with the premium model (same tokens). */
export function savings(entries: LedgerEntry[], models: ModelInfo[], premiumId: string | null): Savings {
  const p = models.find((m) => m.id === premiumId);
  const withTokens = entries.filter((e) => (e.tokensIn ?? 0) + (e.tokensOut ?? 0) > 0);
  const actual = withTokens.reduce((s, e) => s + e.cost, 0);
  const premiumEquivalent =
    p && p.inputPrice !== null && p.outputPrice !== null
      ? withTokens.reduce(
          (s, e) => s + ((e.tokensIn ?? 0) * p.inputPrice! + (e.tokensOut ?? 0) * p.outputPrice!) / 1e6,
          0,
        )
      : 0;
  return {
    missions: withTokens.length,
    actual,
    premiumEquivalent,
    saved: Math.max(0, premiumEquivalent - actual),
    premium: p?.id ?? null,
    note: p
      ? `Estimation : mêmes tokens facturés au prix de ${p.name} (sans tenir compte des tours ou escalades qu’il aurait évités).`
      : 'Modèle premium inconnu : économie non calculable.',
  };
}

/** Did the user correct the previous answer? (feeds the "human correction" telemetry). */
export const HUMAN_CORRECTION =
  /^\s*(non\b|faux|c'est faux|incorrect|erreur|tu t'es tromp|ce n'est pas (ça|correct|juste)|corrige|refais|recommence|pas bon|wrong|that's wrong|no,)/i;
export const isHumanCorrection = (text: string) => HUMAN_CORRECTION.test(text);
