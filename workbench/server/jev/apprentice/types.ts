// JEV APPRENTICE — shared types. "JEV-ADAPTED" means INFERENCE-TIME ADAPTATION (Task DNA, skill capsule,
// validated examples, failure rules, minimal tools, output contract). It never means modified weights.
import type { DataClass } from '../fabric/types';

export type Risk = 'low' | 'normal' | 'high' | 'critical';
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
/** FREE: seen only without adaptation · ADAPTED: runs with adaptation · SPECIALIST: proven on a task family · VALIDATED: profile version benchmarked. */
export type JevStatus = 'FREE' | 'ADAPTED' | 'SPECIALIST' | 'VALIDATED';

export interface TaskDNA {
  task_type: string;
  task_family: string;
  difficulty: number;
  risk: Risk;
  ambiguity: number;
  language: 'fr' | 'en' | 'other';
  domain: string;
  expected_output: string;
  success_criteria: string[];
  tool_requirements: string[];
  context_size: number;
  reasoning_requirement: boolean;
  structured_output_requirement: boolean;
  latency_requirement: 'low' | 'normal' | 'relaxed';
  cost_constraint: 'zero' | 'low' | 'normal';
  /** 0–1: the quality gate this task must clear. */
  quality_threshold: number;
}

export interface FreeCaps {
  id: string;
  provider: string;
  tools: boolean;
  vision: boolean;
  structuredOutputs: boolean;
  reasoning: boolean;
  contextLength: number;
}

export interface Eligibility {
  eligible: boolean;
  /** 0–1 share of the requirements the model meets. */
  score: number;
  reasons: string[];
  blockedBy?: 'security' | 'capability' | 'critical' | 'context';
}

/** What the runtime records on a JEV_LOG entry for an apprentice-routed mission. */
export interface ApprenticeTag {
  /** Free-first was active for this mission. */
  active: boolean;
  /** Inference-time adaptation applied (capsule injected). */
  adapted: boolean;
  family: string;
  /** Models tried in order (apprentice first, then fallbacks actually used). */
  path: string[];
  threshold: number;
  /** Final gate score 0–1 (null = not measured). */
  gateScore: number | null;
  accepted: boolean;
  adaptationMs: number;
  tokensAdded: number;
  skills: string[];
  experiences: number;
  toolsExposed: number;
  /** 0–1: share of the uncompressed capsule removed. */
  contextReduction: number | null;
  predictedSuccess: number | null;
  confidence: Confidence;
  profileVersion?: string;
  teacher?: string;
  teacherCost?: number;
  fallbackFrom?: string;
  rateLimited?: boolean;
  classification?: DataClass;
  /** Demo / benchmark arm. */
  arm?: ApprenticeArm;
  why: string[];
}

export type ApprenticeArm = 'free' | 'free_jev' | 'free_skill' | 'free_skill_exp' | 'paid';
export const APPRENTICE_ARMS: ApprenticeArm[] = ['free', 'free_jev', 'free_skill', 'free_skill_exp', 'paid'];
export const ARM_NAME: Record<ApprenticeArm, string> = {
  free: 'A · Free model baseline',
  free_jev: 'B · Free + JEV',
  free_skill: 'C · Free + JEV Skill',
  free_skill_exp: 'D · Free + JEV Skill + Experience',
  paid: 'E · Best paid model (reference)',
};

export interface ApprenticeSettings {
  /** Master switch. Off → the V5 router decides exactly as before. */
  enabled: boolean;
  /** Quality gate (0–1) by risk class. */
  gates: Record<Risk, number>;
  /** ApprenticeScore weights (sum normalised at use). */
  weights: ApprenticeWeights;
  /** Capsule budget in tokens. */
  capsuleBudget: number;
  /** Minimum predicted success to use a free model on a CRITICAL task (else premium directly). */
  criticalConfidence: number;
  /** Provider for free models are never trusted with data above this class unless the user declared a policy. */
  maxFreeAttempts: number;
  /** Highest tolerated failure risk (1 − predicted success) to try a free model, by task risk. */
  maxFailureRisk: Record<Risk, number>;
  /** Teacher activation: allow proactive teacher sessions (learning), always gated by the governor. */
  teacher: boolean;
  /** $ value of one quality point (policy parameter, not a measurement). */
  valuePerPoint: number;
}
export interface ApprenticeWeights {
  success: number;
  quality: number;
  expertise: number;
  tool: number;
  structured: number;
  reliability: number;
  latency: number;
  cost: number;
}
export const DEFAULT_WEIGHTS: ApprenticeWeights = {
  success: 0.3,
  quality: 0.2,
  expertise: 0.15,
  tool: 0.1,
  structured: 0.1,
  reliability: 0.05,
  latency: 0.05,
  cost: 0.05,
};
export const DEFAULT_APPRENTICE: ApprenticeSettings = {
  enabled: false,
  gates: { low: 0.85, normal: 0.9, high: 0.93, critical: 0.97 },
  weights: DEFAULT_WEIGHTS,
  capsuleBudget: 700,
  criticalConfidence: 0.85,
  maxFailureRisk: { low: 0.6, normal: 0.55, high: 0.4, critical: 0.15 },
  maxFreeAttempts: 3,
  teacher: true,
  valuePerPoint: 0.002,
};
