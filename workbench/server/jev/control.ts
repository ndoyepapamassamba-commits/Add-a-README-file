// JEV modes, budget controller, execution monitor, escalation levels and the
// marginal-quality-gain rule. Everything here is deterministic (JEV-0).
import type { QualityTier } from '../llm/routing';
import type { JevMode } from './tools';

export const MODE_LABEL: Record<JevMode, string> = {
  eco: 'ECO',
  balanced: 'BALANCED',
  performance: 'PERFORMANCE',
  max: 'MAX',
};
export const MODE_HELP: Record<JevMode, string> = {
  eco: 'coût minimum : palier abaissé (sauf mission critique), outils réduits au strict nécessaire, corrections limitées aux erreurs bloquantes',
  balanced: 'meilleur rapport coût / qualité (défaut)',
  performance: 'qualité et vitesse : JEV-1 plus souvent, palier conservé, contexte plus large',
  max: 'raisonnement maximal sous contrôle des coûts : palier relevé, tous les outils, 2 corrections possibles, JEV-2 autorisé',
};

export const TIERS: QualityTier[] = ['cheap', 'balanced', 'quality', 'maximum'];

/** Tier adjustment of a mode (never below QUALITY when the task is critical). */
export function modeTier(t: QualityTier, mode: JevMode, critical: boolean): QualityTier {
  const i = TIERS.indexOf(t);
  const j = mode === 'eco' ? i - 1 : mode === 'max' ? i + 1 : i;
  const floor = critical ? TIERS.indexOf('quality') : 0;
  return TIERS[Math.max(floor, Math.min(TIERS.length - 1, j))]!;
}

/** Escalation levels: 0 deterministic → 5 multi-agent cross-validation. */
export const LEVELS = [
  'L0 déterministe (sans LLM)',
  'L1 modèle rapide / économique',
  'L2 modèle équilibré',
  'L3 modèle puissant',
  'L4 raisonnement avancé',
  'L5 multi-agent / validation croisée',
] as const;
export function levelOf(
  tier: QualityTier | 'none',
  o: { multiAgent?: boolean; effortHigh?: boolean } = {},
): number {
  if (tier === 'none') return 0;
  if (o.multiAgent) return 5;
  if (o.effortHigh && tier === 'maximum') return 4;
  return TIERS.indexOf(tier) + 1;
}

export interface Budgets {
  tokens: number;
  costUsd: number | null;
  timeMs: number;
  steps: number;
  retries: number;
  corrections: number;
}

export function budgetsFor(o: {
  mode: JevMode;
  difficulty: number;
  mission: boolean;
  perTaskUsd: number;
  maxSteps: number;
}): Budgets {
  const base = { eco: 30_000, balanced: 80_000, performance: 150_000, max: 400_000 }[o.mode];
  const tokens = Math.round(base * (1 + o.difficulty) * (o.mission ? 6 : 1));
  const costUsd = o.perTaskUsd > 0 ? o.perTaskUsd * (o.mode === 'eco' ? 0.25 : 1) : null;
  const steps = Math.max(4, Math.round(o.maxSteps * (o.mode === 'eco' ? 0.5 : o.mode === 'max' ? 1.25 : 1)));
  return {
    tokens,
    costUsd,
    timeMs: (o.mission ? 20 : 4) * 60_000 * (o.mode === 'max' ? 2 : 1),
    steps,
    retries: o.mode === 'eco' ? 1 : 2,
    corrections: o.mode === 'max' ? 2 : 1,
  };
}

export type MonitorAction =
  | 'CONTINUE'
  | 'STOP'
  | 'COMPRESS'
  | 'RETRY'
  | 'SWITCH_MODEL'
  | 'SWITCH_STRATEGY'
  | 'ADD_TOOL'
  | 'REMOVE_TOOL'
  | 'ASK_USER'
  | 'ESCALATE';
export interface MonitorDecision {
  action: MonitorAction;
  reason: string;
  tool?: string;
}

/** Watches the run between model calls (decisions, not tokens). */
export class ExecutionMonitor {
  tokens = 0;
  cost = 0;
  steps = 0;
  private failures = new Map<string, number>();
  private lastCalls: string[] = [];
  private consecutiveErrors = 0;
  readonly started = Date.now();
  readonly decisions: MonitorDecision[] = [];
  constructor(readonly budgets: Budgets) {}

  /** After each model call. */
  step(o: {
    tokensIn: number;
    tokensOut: number;
    cost: number;
    contextTokens: number;
    contextLimit: number;
  }): MonitorDecision {
    this.steps++;
    this.tokens += o.tokensIn + o.tokensOut;
    this.cost += o.cost;
    let d: MonitorDecision = { action: 'CONTINUE', reason: 'dans les budgets' };
    if (this.budgets.costUsd !== null && this.cost >= this.budgets.costUsd)
      d = {
        action: 'STOP',
        reason: `budget coût atteint ($${this.cost.toFixed(4)} / $${this.budgets.costUsd})`,
      };
    else if (this.tokens >= this.budgets.tokens * 2)
      d = {
        action: 'STOP',
        reason: `budget tokens dépassé deux fois (${this.tokens} / ${this.budgets.tokens})`,
      };
    else if (Date.now() - this.started > this.budgets.timeMs)
      d = { action: 'STOP', reason: `budget temps atteint (${Math.round(this.budgets.timeMs / 60000)} min)` };
    else if (o.contextTokens > o.contextLimit * 0.7 || this.tokens >= this.budgets.tokens)
      d = { action: 'COMPRESS', reason: 'contexte proche de la limite : compression' };
    if (d.action !== 'CONTINUE') this.decisions.push(d);
    return d;
  }

  /** After each tool call. */
  tool(name: string, args: string, ok: boolean): MonitorDecision {
    const sig = `${name}:${args.slice(0, 200)}`;
    this.lastCalls = [...this.lastCalls.slice(-5), sig];
    let d: MonitorDecision = { action: 'CONTINUE', reason: 'ok' };
    if (!ok) {
      const n = (this.failures.get(name) ?? 0) + 1;
      this.failures.set(name, n);
      this.consecutiveErrors++;
      if (n >= 3)
        d = {
          action: 'REMOVE_TOOL',
          tool: name,
          reason: `${name} a échoué ${n} fois : retiré, utilisez une alternative`,
        };
      else if (this.consecutiveErrors >= 3)
        d = { action: 'SWITCH_STRATEGY', reason: '3 erreurs d’outils consécutives : changez d’approche' };
    } else this.consecutiveErrors = 0;
    if (d.action === 'CONTINUE' && this.lastCalls.filter((c) => c === sig).length >= 3)
      d = {
        action: 'SWITCH_STRATEGY',
        reason: `appel répété 3 fois à l’identique (${name}) : boucle évitée`,
      };
    if (d.action !== 'CONTINUE') this.decisions.push(d);
    return d;
  }
}

/**
 * Marginal quality gain: escalating to a dearer model is worth it only when the
 * expected quality gain per dollar beats the threshold. Above 95 % quality,
 * never re-run a premium model to gain 2 %.
 */
export function marginalGain(o: {
  qa: number;
  target: number;
  currentCost: number;
  nextCost: number;
  nextSuccess: number;
}): {
  worth: boolean;
  gain: number;
  perDollar: number;
  reason: string;
} {
  if (o.qa >= 95)
    return {
      worth: false,
      gain: 0,
      perDollar: 0,
      reason: `qualité ${o.qa} % ≥ 95 % : aucun modèle premium relancé pour quelques points`,
    };
  const gain = Math.max(0, (o.target - o.qa) * o.nextSuccess);
  const extra = Math.max(1e-6, o.nextCost);
  const perDollar = gain / extra;
  const worth = gain >= 5 && perDollar >= 50;
  return {
    worth,
    gain,
    perDollar,
    reason: worth
      ? `gain attendu +${gain.toFixed(0)} points pour ~$${extra.toFixed(4)} : escalade rentable`
      : `gain attendu +${gain.toFixed(0)} points pour ~$${extra.toFixed(4)} : trop faible, arrêt`,
  };
}
