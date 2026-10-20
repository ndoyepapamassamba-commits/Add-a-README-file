// JEV COGNITIVE OS — COGNITIVE COMPILER and JCB (JEV Cognitive Bytecode).
// USER INTENT → EXECUTABLE COGNITIVE PLAN. The JCB is a compact INTERNAL representation (it is never sent to the model);
// it lets caches, strategies and logs refer to a plan without rebuilding the instructions every time.
import type { CognitiveDiagnosis } from './diagnosis';
import { selectProtocol, type Protocol } from './protocols';
import { planTokenBudget, type TokenBudget } from './tokens';
import { behaviorFor, outputContract, type BehaviorPolicy, type OutputContract } from './conditioning';

export type Tier =
  | 'L0-deterministic'
  | 'L1-free-validated'
  | 'L2-free-specialist'
  | 'L3-free-adapted'
  | 'L5-premium'
  | 'L6-council';
export interface CognitivePlan {
  diagnosis: CognitiveDiagnosis;
  protocol: Protocol;
  protocolWhy: string[];
  behavior: BehaviorPolicy;
  budget: TokenBudget;
  contract: OutputContract;
  contextMethod: 'none' | 'minimal' | 'capsule';
  skills: string[];
  /** Cheapest sufficient tier, with the reason. */
  tier: Tier;
  tierWhy: string;
  qualityGate: number;
  stop: string;
  fallback: string;
  jcb: string;
}

/** key=value lines, stable order, no secret and no free text longer than a token name. */
export function encodeJcb(f: Record<string, string | number | boolean>): string {
  return Object.entries(f)
    .map(([k, v]) => `${k.toUpperCase()}=${String(v).replace(/[\s=]+/g, '_')}`)
    .join(' ');
}
export function decodeJcb(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([A-Z_]+)=(\S+)/g)) out[m[1]!] = m[2]!;
  return out;
}

/** Cheapest tier able to meet the target, given what the history can PROVE. */
export function chooseTier(
  d: CognitiveDiagnosis,
  o: { economy?: 'normal' | 'economy' | 'max'; deterministic?: boolean; freeProven?: boolean },
): { tier: Tier; why: string } {
  if (o.deterministic) return { tier: 'L0-deterministic', why: 'réponse calculable sans modèle' };
  if (o.economy === 'max' && d.risk !== 'low')
    return {
      tier: d.councilWorthy ? 'L6-council' : 'L5-premium',
      why: 'mode COGNITIVE MAX : qualité d’abord, dépense justifiée par l’enjeu',
    };
  if (d.trivial) return { tier: 'L1-free-validated', why: 'demande simple : le plus petit modèle suffisant' };
  if (d.risk === 'high' && d.difficulty >= 0.7 && !o.freeProven)
    return {
      tier: d.councilWorthy ? 'L6-council' : 'L5-premium',
      why: 'enjeu élevé et aucun modèle gratuit prouvé sur ce type de tâche',
    };
  if (d.risk === 'high' && !o.freeProven)
    return {
      tier: 'L3-free-adapted',
      why: 'enjeu élevé : modèle gratuit conditionné + contrôle ciblé, escalade si le contrôle échoue',
    };
  return {
    tier: o.freeProven ? 'L2-free-specialist' : 'L1-free-validated',
    why: o.freeProven
      ? 'un modèle gratuit a une qualité mesurée suffisante sur ce type de tâche'
      : 'cheapest-first ; l’escalade se décide sur le contrôle qualité',
  };
}

export function compileCognitivePlan(
  d: CognitiveDiagnosis,
  o: {
    text: string;
    contextTokens: number;
    language?: string;
    skills?: string[];
    economy?: 'normal' | 'economy' | 'max';
    freeProven?: boolean;
    deterministic?: boolean;
    modelContext?: number;
  },
): CognitivePlan {
  const choice = selectProtocol(d);
  const budget = planTokenBudget(d, { contextTokens: o.contextTokens, modelContext: o.modelContext });
  const behavior = behaviorFor(d, o.text);
  const contract = outputContract(d, { language: o.language, maxOutput: budget.maxOutput });
  const tier = chooseTier(d, {
    economy: o.economy,
    deterministic: o.deterministic,
    freeProven: o.freeProven,
  });
  const contextMethod: CognitivePlan['contextMethod'] =
    d.trivial || o.contextTokens < 1500
      ? 'none'
      : o.contextTokens > budget.maxInput * 1.3
        ? 'capsule'
        : 'minimal';
  const stop =
    d.risk === 'high' ? 'QUALITY>=target AND verified' : 'QUALITY>=target OR marginal-gain<threshold';
  const fallback =
    tier.tier === 'L5-premium' || tier.tier === 'L6-council'
      ? 'cheaper-validated'
      : 'escalate-one-tier-on-gate-failure';
  const jcb = encodeJcb({
    task: d.cognitiveType,
    dna: d.taskDNA,
    risk: d.risk,
    mode: behavior.mode,
    proto: choice.protocol.id,
    skill: (o.skills ?? []).length ? `n${(o.skills ?? []).length}` : 'none',
    ctx: contextMethod,
    model: tier.tier,
    budget: budget.maxOutput,
    qa: d.qualityTarget,
    stop: d.risk === 'high' ? 'verified' : 'gain',
  });
  return {
    diagnosis: d,
    protocol: choice.protocol,
    protocolWhy: choice.why,
    behavior,
    budget,
    contract,
    contextMethod,
    skills: o.skills ?? [],
    tier: tier.tier,
    tierWhy: tier.why,
    qualityGate: d.qualityTarget,
    stop,
    fallback,
    jcb,
  };
}
