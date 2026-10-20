// JEV COGNITIVE OS — STOP INTELLIGENCE, MARGINAL COGNITIVE GAIN, COGNITIVE ROI.
// A large part of the cost is calls that bring nothing. JEV decides when to stop from MEASURED quantities only.
export type StopReason =
  | 'TASK_SOLVED'
  | 'QUALITY_TARGET_REACHED'
  | 'NO_INFORMATION_GAIN'
  | 'MARGINAL_GAIN_TOO_LOW'
  | 'COST_EXCEEDS_VALUE'
  | 'REDUNDANT_CALL'
  | 'CONFIDENCE_SUFFICIENT'
  | 'CONTINUE';
export interface StopInput {
  /** Latest measured quality 0-100 (null = not measured → never stops on quality). */
  quality: number | null;
  previousQuality: number | null;
  target: number;
  /** Cost of the NEXT call (estimate, $), and what the work is worth (budget left or per-task value), if known. */
  nextCost: number | null;
  valueLeft: number | null;
  /** The next call would repeat an already-answered question (same normalised prompt). */
  redundant: boolean;
  /** The new answer adds no new fact/number vs the previous (measured by caller). */
  newFacts: number | null;
  taskSolved: boolean;
  confidence: number | null;
  /** Cost already spent on this task ($). */
  costSoFar?: number | null;
  /** A further call is not worth it when the last gain was ≤ this (points)… */
  minGain?: number;
  /** …and the next call costs at least this share of what was already spent. */
  costShare?: number;
  verifiedRequired?: boolean;
  verified?: boolean;
}
export interface StopDecision {
  stop: boolean;
  reason: StopReason;
  detail: string;
  marginalGain: number | null;
}
/** Marginal Cognitive Gain = quality(now) − quality(previous). */
export const marginalGain = (q: number | null, prev: number | null): number | null =>
  q === null || prev === null ? null : q - prev;

export function shouldStop(i: StopInput): StopDecision {
  const mg = marginalGain(i.quality, i.previousQuality);
  const done = (reason: StopReason, detail: string): StopDecision => ({
    stop: true,
    reason,
    detail,
    marginalGain: mg,
  });
  if (i.redundant)
    return done(
      'REDUNDANT_CALL',
      'la question a déjà reçu une réponse : un nouvel appel ne ferait que la répéter',
    );
  if (i.verifiedRequired && !i.verified)
    return { stop: false, reason: 'CONTINUE', detail: 'contrôle exigé et pas encore fait', marginalGain: mg };
  if (i.taskSolved) return done('TASK_SOLVED', 'la demande est traitée');
  if (i.quality !== null && i.quality >= i.target)
    return done('QUALITY_TARGET_REACHED', `qualité ${i.quality} ≥ cible ${i.target}`);
  if (i.newFacts === 0)
    return done('NO_INFORMATION_GAIN', 'la dernière passe n’a apporté aucun fait nouveau');
  // Example: +0.5 point for a call costing +40 % of the work so far → stop.
  if (
    mg !== null &&
    mg <= (i.minGain ?? 1) &&
    i.nextCost !== null &&
    i.costSoFar &&
    i.costSoFar > 0 &&
    i.nextCost / i.costSoFar >= (i.costShare ?? 0.4) - 1e-9
  )
    return done(
      'MARGINAL_GAIN_TOO_LOW',
      `gain marginal ${mg.toFixed(1)} pt pour un appel à +${((i.nextCost / i.costSoFar) * 100).toFixed(0)} % du coût déjà engagé`,
    );
  if (i.nextCost !== null && i.valueLeft !== null && i.nextCost > i.valueLeft)
    return done(
      'COST_EXCEEDS_VALUE',
      `coût ${i.nextCost.toFixed(5)} $ > valeur restante ${i.valueLeft.toFixed(5)} $`,
    );
  if (i.confidence !== null && i.confidence >= 0.95 && i.quality === null)
    return done('CONFIDENCE_SUFFICIENT', `confiance ${(i.confidence * 100).toFixed(0)} %`);
  return {
    stop: false,
    reason: 'CONTINUE',
    detail: 'un nouvel appel peut encore apporter de la valeur',
    marginalGain: mg,
  };
}

/** Cognitive ROI = expected quality gain / expected total cost (points per $). Null when either is unknown. */
export function cognitiveRoi(expectedGain: number | null, expectedCost: number | null): number | null {
  if (expectedGain === null || expectedCost === null) return null;
  return expectedCost <= 0 ? (expectedGain > 0 ? Infinity : 0) : expectedGain / expectedCost;
}
/** Ranks options by Cognitive ROI; options with unknown gain are kept last and flagged (never ranked on a guess). */
export function rankByRoi<T extends { gain: number | null; cost: number | null }>(
  opts: T[],
): (T & { roi: number | null })[] {
  return opts
    .map((o) => ({ ...o, roi: cognitiveRoi(o.gain, o.cost) }))
    .sort((a, b) => (b.roi ?? -1) - (a.roi ?? -1) || (a.cost ?? Infinity) - (b.cost ?? Infinity));
}
/** JEV SCORE = quality × reliability × task fit × information gain / (cost × token cost × latency penalty × risk). Unitless, comparative only. */
export function jevScore(x: {
  quality: number;
  reliability: number;
  taskFit: number;
  infoGain: number;
  cost: number;
  tokenCost: number;
  latencyPenalty: number;
  risk: number;
}): number {
  const den = Math.max(1e-9, x.cost * x.tokenCost * x.latencyPenalty * x.risk);
  return (x.quality * x.reliability * x.taskFit * x.infoGain) / den;
}
