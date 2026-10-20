// JEV COGNITIVE OS — shared types.
export type EngineId =
  | 'diagnosis'
  | 'protocols'
  | 'tokens'
  | 'capsule'
  | 'conditioning'
  | 'guards'
  | 'bytecode'
  | 'stop'
  | 'disagreement'
  | 'cache';
export type EngineMode = 'off' | 'shadow' | 'active';
export interface CognitiveSettings {
  /** Master switch. OFF = the Workbench behaves exactly like before (V17). */
  enabled: boolean;
  /** off: not run · shadow: computed and logged, never sent to the model · active: applied. */
  engines: Record<EngineId, EngineMode>;
  economy: 'normal' | 'economy' | 'max';
  /** Ceiling of tokens the conditioning may add to a call. */
  conditioningMaxTokens: number;
}
export const DEFAULT_COGNITIVE: CognitiveSettings = {
  enabled: false,
  engines: {
    diagnosis: 'shadow',
    protocols: 'shadow',
    tokens: 'shadow',
    capsule: 'shadow',
    conditioning: 'shadow',
    guards: 'shadow',
    bytecode: 'shadow',
    stop: 'shadow',
    disagreement: 'shadow',
    cache: 'shadow',
  },
  economy: 'normal',
  conditioningMaxTokens: 220,
};
/** What a run records about the cognitive layer (additive field of the JEV_LOG entry). */
export interface CognitiveTag {
  jcb: string;
  taskDNA: string;
  protocol: string;
  protocolStatus: string;
  behavior: string;
  budget: { maxInput: number; maxOutput: number; expected: number };
  conditioningTokens: number;
  guards: string[];
  capsule?: { raw: number; after: number; lost: number; recovered: boolean };
  tokenReport?: { total: number; waste: number; usefulRatio: number };
  /** Engines that really changed the call (mode active). */
  applied: EngineId[];
  /** What the stop engine WOULD have done (shadow) or did. */
  stop?: { decision: string; reason: string };
  strategySwitches?: number;
  /** Super-benchmark arm of the run (absent on normal missions). */
  arm?: string;
  version: number;
}
export const COGNITIVE_VERSION = 1;
