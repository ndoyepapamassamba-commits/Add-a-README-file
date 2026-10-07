// OMNIPOTENT V4.1 — PROPORTIONAL EFFORT (fast lane) and CONTEXT CEILINGS (§6, §29-30, §43, §93).
// A budget is a CEILING, never a target. A simple request must cost a few seconds and a few hundred tokens: no ceremony,
// no verification loop, no tools it will not use. Verification depth follows risk and mutation, not availability.
import type { Reclass } from './reclassify';

export type Lane = 'trivial' | 'simple' | 'standard' | 'complex' | 'critical';
export type Verification = 'none' | 'light' | 'standard' | 'strong' | 'adversarial';
export interface LanePolicy {
  lane: Lane;
  /** Max loop steps (null = the user's setting). */
  maxSteps: number | null;
  /** Max delivery-gate passes that may trigger a paid re-ask (null = default). */
  gates: number | null;
  /** Tools exposed to the model before it asks for more: none / only a minimal set / the JEV pack. */
  tools: 'none' | 'minimal' | 'pack';
  /** Doctrine, strategy, packet and memory boilerplate are left out of the system prompt. */
  minimalPrompt: boolean;
  /** Context ceiling in tokens: above it the history is compacted (a ceiling, never a target). */
  contextCeiling: number;
  /** Max tokens the model may write in one call. */
  outputCeiling: number;
  verification: Verification;
  /** The paid re-ask for « figures without evidence » is allowed. */
  evidenceReask: boolean;
  reasons: string[];
}

export function laneOf(o: {
  text: string;
  attachments: number;
  reclass: Reclass;
  difficulty: number;
  critical: boolean;
  mission: boolean;
  needsTools: boolean;
  historyTokens: number;
}): LanePolicy {
  const reasons: string[] = [];
  const len = o.text.trim().length;
  // Cues that the request acts on files, plugins or the web: never a « trivial » (tool-less) question.
  const toolCue = /(fichier|dossier|\blis\b|\bouvre\b|cr[ée]e|g[ée]n[èe]re|fais (?:un|une|moi)|maquette|\b3d\b|taux|m[ée]t[ée]o|cherche|recherche|navigue|https?:|excel|xlsx|word|pdf|export|calcule|tableau|analyse|corrige|r[ée]pare|install|d[ée]ploie|\.\w{2,5}\b)/i.test(o.text);
  let lane: Lane;
  if (o.critical) {
    lane = 'critical';
    reasons.push('enjeu critique (gouvernance, réglementation, argent)');
  } else if (o.mission || o.difficulty >= 0.55 || o.attachments > 2 || (o.reclass.mutationRequired && o.reclass.verificationRequired && o.difficulty >= 0.5)) {
    lane = 'complex';
    reasons.push(o.mission ? 'mission autonome' : o.reclass.mutationRequired ? 'modification d’un artefact à vérifier' : 'difficulté élevée');
  } else if (o.reclass.mutationRequired || o.attachments > 0 || o.difficulty >= 0.3 || len > 600) {
    lane = o.difficulty < 0.4 && !o.reclass.mutationRequired && o.attachments <= 1 && len <= 600 ? 'simple' : 'standard';
    reasons.push(lane === 'simple' ? 'demande courte avec peu de matière' : 'travail ordinaire sur un artefact');
  } else if (len <= 240 && !o.needsTools && !toolCue && o.difficulty < 0.3) {
    lane = 'trivial';
    reasons.push('question courte, sans fichier ni outil nécessaire');
  } else {
    lane = 'simple';
    reasons.push('demande simple');
  }
  switch (lane) {
    case 'trivial':
      return { lane, maxSteps: 3, gates: 0, tools: 'none', minimalPrompt: true, contextCeiling: 6_000, outputCeiling: 1_500, verification: 'none', evidenceReask: false, reasons };
    case 'simple':
      return { lane, maxSteps: 8, gates: 1, tools: 'pack', minimalPrompt: true, contextCeiling: 12_000, outputCeiling: 4_000, verification: 'light', evidenceReask: false, reasons };
    case 'standard':
      return { lane, maxSteps: null, gates: 1, tools: 'pack', minimalPrompt: false, contextCeiling: 30_000, outputCeiling: 8_000, verification: 'standard', evidenceReask: true, reasons };
    case 'complex':
      return { lane, maxSteps: null, gates: 2, tools: 'pack', minimalPrompt: false, contextCeiling: 40_000, outputCeiling: 12_000, verification: 'strong', evidenceReask: true, reasons };
    default:
      return { lane, maxSteps: null, gates: 2, tools: 'pack', minimalPrompt: false, contextCeiling: 50_000, outputCeiling: 16_000, verification: 'adversarial', evidenceReask: true, reasons };
  }
}

/** §93: 20K → reduce semantically · 30K → aggressively · 40K → firewall review · 50K → stop and recompile. */
export function contextPressure(tokens: number): { level: 'ok' | 'reduce' | 'aggressive' | 'review' | 'recompile'; note: string } {
  if (tokens >= 50_000) return { level: 'recompile', note: '≥ 50K : arrêt et recompilation du contexte' };
  if (tokens >= 40_000) return { level: 'review', note: '≥ 40K : revue du pare-feu' };
  if (tokens >= 30_000) return { level: 'aggressive', note: '≥ 30K : réduction agressive' };
  if (tokens >= 20_000) return { level: 'reduce', note: '≥ 20K : réduction sémantique' };
  return { level: 'ok', note: 'contexte dans le plafond' };
}
