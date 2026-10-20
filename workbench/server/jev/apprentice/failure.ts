// FAILURE LEARNING: every failure gets a signature and a named, targeted correction; an apprentice failure that a premium
// model then solves becomes a skill candidate (FAILURE → PREMIUM SUCCESS → PATTERN → CORRECTION → SKILL CANDIDATE).
import type { QaFailure } from '../qa';
import type { JevLogEntry } from '../metrics';
import type { FailureLearning } from './types';

export type FailureSignature =
  | 'STRUCTURED_OUTPUT_INVALID'
  | 'MISSING_TABLE_RECONCILIATION'
  | 'TOOL_SELECTION_ERROR'
  | 'NUMERIC_REASONING_ERROR'
  | 'CONTEXT_OVERFLOW'
  | 'LANGUAGE_MISMATCH'
  | 'INCOMPLETE_ANSWER'
  | 'SECURITY_VIOLATION'
  | 'GENERIC_QUALITY_GAP';

export interface Correction {
  /** Named correction (reusable, versioned). */
  name: string;
  instruction: string;
}
export const CORRECTIONS: Record<FailureSignature, Correction> = {
  STRUCTURED_OUTPUT_INVALID: {
    name: 'FORMAT_REPAIR_V2',
    instruction:
      'Return ONLY the requested structure, strictly valid (no prose around it, no trailing commas, quote every key), then stop.',
  },
  MISSING_TABLE_RECONCILIATION: {
    name: 'TABLE_RECONCILIATION_V1',
    instruction:
      'Rebuild the table with every requested row and a reconciliation line (total of the parts = stated total); show the check.',
  },
  TOOL_SELECTION_ERROR: {
    name: 'TOOL_REPICK_V1',
    instruction:
      'A tool call failed or was the wrong tool: re-read the tool list, pick the right tool with exact arguments, and verify its result before answering.',
  },
  NUMERIC_REASONING_ERROR: {
    name: 'NUMERIC_RECHECK_V1',
    instruction:
      'Recompute every figure from the data with a tool (data.query / code.run); cite only numbers present in tool results, otherwise mark them as estimates.',
  },
  CONTEXT_OVERFLOW: {
    name: 'CONTEXT_TRIM_V1',
    instruction:
      'Work on the minimum necessary part of the data (filter / aggregate first), then answer from the reduced result.',
  },
  LANGUAGE_MISMATCH: {
    name: 'LANGUAGE_FIX_V1',
    instruction: 'Answer entirely in the language of the request.',
  },
  INCOMPLETE_ANSWER: {
    name: 'COMPLETENESS_V1',
    instruction: 'Cover every element of the request, one by one, before concluding.',
  },
  SECURITY_VIOLATION: {
    name: 'SECRET_REDACTION_V1',
    instruction: 'Remove any secret, key or credential from the answer.',
  },
  GENERIC_QUALITY_GAP: {
    name: 'TARGETED_FIX_V1',
    instruction: 'Fix exactly the listed problems, then give the final answer again.',
  },
};

/** Failure signature from the QA failures of an answer (and, optionally, a provider error message). */
export function failureSignatureOf(
  failures: Pick<QaFailure, 'kind' | 'what' | 'dimension'>[],
  errorText = '',
): FailureSignature {
  if (/context|token limit|maximum context|too long|overflow/i.test(errorText)) return 'CONTEXT_OVERFLOW';
  const has = (k: QaFailure['kind']) => failures.some((f) => f.kind === k);
  if (has('safety')) return 'SECURITY_VIOLATION';
  if (
    failures.some((f) => f.kind === 'format' && /json|tableau|liste|invalide/i.test(f.what)) &&
    !failures.some((f) => /tableau demandé/.test(f.what))
  )
    return 'STRUCTURED_OUTPUT_INVALID';
  if (failures.some((f) => /tableau demandé|réconcil|total/i.test(f.what)))
    return 'MISSING_TABLE_RECONCILIATION';
  if (has('tool')) return 'TOOL_SELECTION_ERROR';
  if (has('factual') || has('consistency')) return 'NUMERIC_REASONING_ERROR';
  if (has('language')) return 'LANGUAGE_MISMATCH';
  if (has('missing') || has('length')) return 'INCOMPLETE_ANSWER';
  if (has('format')) return 'STRUCTURED_OUTPUT_INVALID';
  return 'GENERIC_QUALITY_GAP';
}

export const correctionFor = (sig: FailureSignature): Correction => CORRECTIONS[sig];

/** The full correction message sent back to the model: named correction + the precise failures. */
export function correctionMessage(
  sig: FailureSignature,
  failures: { what: string; fix?: string }[],
  score: number,
  threshold: number,
): string {
  const c = CORRECTIONS[sig];
  const list = failures.map((f) => `- ${f.what}${f.fix ? ` → ${f.fix}` : ''}`).join('\n');
  return `[QUALITY GATE · ${sig} · ${c.name}] Your answer scored ${score}/100, below the ${Math.round(threshold * 100)} required.\n${c.instruction}\n${list || '- completeness and instruction following'}\nThen give the final answer again.`;
}

/** What a mission taught: signature, correction, who retried, who finally succeeded. */
export function learningOf(o: {
  signature: FailureSignature;
  path: string[];
  success: boolean | null;
  teacher: string | null;
}): FailureLearning {
  const last = o.path.at(-1) ?? null;
  const free = (m: string) => /:free$/.test(m);
  return {
    signature: o.signature,
    correction: CORRECTIONS[o.signature].name,
    retryModel: o.path.length ? o.path[0]! : null,
    fallbackModel: o.path.length > 1 ? last : null,
    teacher: o.teacher,
    outcome:
      o.success === false || o.success === null
        ? 'unresolved'
        : last && !free(last) && o.path.length > 1
          ? 'escalated'
          : 'recovered',
  };
}

export interface FailureStat {
  signature: string;
  family: string;
  model: string;
  count: number;
  recovered: number;
  escalated: number;
  unresolved: number;
  corrections: string[];
}
/** Failure library of the apprentice: by (model, family, signature) with how each was resolved. */
export function failureStats(log: JevLogEntry[]): FailureStat[] {
  const m = new Map<string, FailureStat>();
  for (const e of log) {
    const f = e.apprentice?.failure;
    if (!f) continue;
    const key = `${e.model}|${e.apprentice!.family}|${f.signature}`;
    const cur = m.get(key) ?? {
      signature: f.signature,
      family: e.apprentice!.family,
      model: e.model,
      count: 0,
      recovered: 0,
      escalated: 0,
      unresolved: 0,
      corrections: [],
    };
    cur.count++;
    cur[f.outcome]++;
    if (!cur.corrections.includes(f.correction)) cur.corrections.push(f.correction);
    m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}
