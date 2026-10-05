// JEV Output QA: a deterministic QUALITY VECTOR on every answer (format,
// language, required items, unsupported figures, code / JSON syntax, leaked
// secrets, tool errors, efficiency) and a TARGETED correction plan — fix
// exactly what failed, never "redo everything".
import { unsupportedNumbers } from '../agent/intelligence';
import type { OutputSpec } from './style';

export interface QualityVector {
  correctness: number;
  completeness: number;
  instruction_following: number;
  style: number;
  safety: number;
  tool_accuracy: number;
  code_quality: number;
  factuality: number;
  efficiency: number;
  consistency: number;
}
/** ERROR LOCALIZATION: where a failure comes from (so the fix targets the right layer). */
export type ErrorLocus =
  | 'intent'
  | 'context'
  | 'model'
  | 'tool'
  | 'skill'
  | 'reasoning'
  | 'instruction'
  | 'data'
  | 'format'
  | 'code'
  | 'memory'
  | 'routing';
export interface QaFailure {
  dimension: keyof QualityVector;
  what: string;
  /** Precise instruction for a targeted correction. */
  fix: string;
  blocking: boolean;
  kind: 'format' | 'missing' | 'code' | 'factual' | 'safety' | 'language' | 'length' | 'consistency' | 'tool';
  locus?: ErrorLocus;
}
export interface QaResult {
  vector: QualityVector;
  score: number;
  failures: QaFailure[];
  /** QA performed without any model call. */
  local: true;
  /** QA levels actually run: L0 rules (format, syntax, safety), L1 evidence & consistency. L2 (execution) / L3 (cross-model) are run by the runtime when worth it. */
  levels: ('L0' | 'L1' | 'L2' | 'L3')[];
  /** FAILURE VECTOR: failures per locus. */
  failureVector: Partial<Record<ErrorLocus, number>>;
}

const W: Record<keyof QualityVector, number> = {
  consistency: 0.04,
  correctness: 0.18,
  completeness: 0.14,
  instruction_following: 0.16,
  style: 0.06,
  safety: 0.12,
  tool_accuracy: 0.08,
  code_quality: 0.08,
  factuality: 0.1,
  efficiency: 0.04,
};
const SECRET =
  /\b(sk-or-v1-[a-z0-9]{16,}|sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/;

function detectLang(t: string): 'fr' | 'en' | null {
  const fr = (t.match(/\b(le|la|les|des|une|est|pour|avec|dans|sont)\b/gi) ?? []).length;
  const en = (t.match(/\b(the|and|with|for|this|that|is|are|of)\b/gi) ?? []).length;
  if (fr + en < 6) return null;
  return fr > en ? 'fr' : 'en';
}

function codeBlocks(t: string): { lang: string; code: string }[] {
  return [...t.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1]!.toLowerCase(), code: m[2]! }));
}

/** Weighted score (0–100) of a quality vector — one formula for every variant. */
export function qualityScore(v: QualityVector): number {
  return Math.round((Object.keys(W) as (keyof QualityVector)[]).reduce((s, k) => s + W[k] * v[k], 0) * 100);
}

export function qualityCheck(o: {
  answer: string;
  spec: OutputSpec;
  /** Tool outputs + user inputs (the evidence the figures must come from). */
  evidence: string[];
  usedTools: boolean;
  toolErrors: number;
  toolCalls: number;
  tokens: number;
  tokenBudget: number;
  /** Mission QA (0–100) when a mission report exists. */
  missionQa?: number;
}): QaResult {
  const f: QaFailure[] = [];
  const a = o.answer.trim();
  // Format contract
  if (o.spec.format === 'json') {
    const raw = codeBlocks(a).find((b) => b.lang === 'json')?.code ?? a;
    try {
      JSON.parse(raw);
    } catch {
      f.push({
        dimension: 'instruction_following',
        what: 'JSON demandé mais invalide',
        fix: 'Return only valid JSON (no prose), same content.',
        blocking: true,
        kind: 'format',
      });
    }
  }
  if (o.spec.format === 'table' && !/\|[^\n]+\|\n\s*\|?\s*:?-{3,}/.test(a))
    f.push({
      dimension: 'instruction_following',
      what: 'tableau demandé mais absent',
      fix: 'Present the result as a Markdown table, keep the same figures.',
      blocking: true,
      kind: 'format',
    });
  if (o.spec.format === 'code' && !codeBlocks(a).length)
    f.push({
      dimension: 'instruction_following',
      what: 'code demandé mais aucun bloc de code',
      fix: 'Give the code in a fenced code block.',
      blocking: true,
      kind: 'format',
    });
  if (o.spec.format === 'list' && !/^\s*([-*•]|\d+[.)])\s/m.test(a))
    f.push({
      dimension: 'instruction_following',
      what: 'liste demandée mais absente',
      fix: 'Format the answer as a list.',
      blocking: false,
      kind: 'format',
    });
  // Language
  const lang = detectLang(a);
  if (o.spec.language && lang && lang !== o.spec.language)
    f.push({
      dimension: 'style',
      what: `langue ${lang} au lieu de ${o.spec.language}`,
      fix: `Answer in ${o.spec.language === 'fr' ? 'French' : 'English'}.`,
      blocking: true,
      kind: 'language',
    });
  // Length
  if (o.spec.maxWords) {
    const words = a.split(/\s+/).filter(Boolean).length;
    if (words > o.spec.maxWords * 1.15)
      f.push({
        dimension: 'instruction_following',
        what: `${words} mots pour ${o.spec.maxWords} demandés`,
        fix: `Shorten to at most ${o.spec.maxWords} words, keep the key facts.`,
        blocking: true,
        kind: 'length',
      });
  }
  // Completeness: required columns / fields
  const missing = o.spec.mustMention.filter((m) => !a.toLowerCase().includes(m.toLowerCase()));
  if (missing.length)
    f.push({
      dimension: 'completeness',
      what: `élément(s) demandé(s) absent(s) : ${missing.join(', ')}`,
      fix: `Add the missing item(s): ${missing.join(', ')}. Change nothing else.`,
      blocking: true,
      kind: 'missing',
    });
  // Figures without evidence (only meaningful when the answer is based on tools)
  const unsupported = o.usedTools ? unsupportedNumbers(a, o.evidence) : [];
  if (unsupported.length)
    f.push({
      dimension: 'factuality',
      what: `chiffre(s) sans preuve : ${unsupported.slice(0, 5).join(', ')}`,
      fix: `Verify these figures with tools or remove them: ${unsupported.slice(0, 5).join(', ')}.`,
      blocking: unsupported.length >= 2,
      kind: 'factual',
    });
  // Code / JSON blocks must parse
  for (const b of codeBlocks(a)) {
    if (b.lang === 'json')
      try {
        JSON.parse(b.code);
      } catch {
        f.push({
          dimension: 'code_quality',
          what: 'bloc JSON invalide',
          fix: 'Fix the JSON syntax of the code block.',
          blocking: true,
          kind: 'code',
        });
      }
    if (b.lang === 'js' || b.lang === 'javascript')
      try {
        new Function(b.code.replace(/^\s*(import|export)\b.*$/gm, ''));
      } catch (e) {
        f.push({
          dimension: 'code_quality',
          what: `erreur de syntaxe JavaScript : ${(e as Error).message}`,
          fix: `Fix the JavaScript syntax error (${(e as Error).message}) with a minimal patch.`,
          blocking: true,
          kind: 'code',
        });
      }
  }
  // Safety: never leak a key
  if (SECRET.test(a))
    f.push({
      dimension: 'safety',
      what: 'secret / clé dans la réponse',
      fix: 'Remove the secret from the answer (replace it with ***).',
      blocking: true,
      kind: 'safety',
    });
  // Consistency (L1): the same label given two different figures in one answer.
  const seen = new Map<string, string>();
  const clash: string[] = [];
  for (const m of a.matchAll(
    /(?:^|\n|\|)\s*\**([A-Za-zÀ-ÿ][\wÀ-ÿ' ]{2,30}?)\**\s*[:=|]\s*\**(-?\d[\d\s.,]*\d|\d)\s*(%|€|\$|FCFA|XOF)?/g,
  )) {
    const k = m[1]!.trim().toLowerCase();
    const val = m[2]!.replace(/\s/g, '') + (m[3] ?? '');
    if (seen.has(k) && seen.get(k) !== val && !clash.includes(k)) clash.push(k);
    else seen.set(k, val);
  }
  if (clash.length)
    f.push({
      dimension: 'consistency',
      what: `valeurs contradictoires pour : ${clash.slice(0, 4).join(', ')}`,
      fix: `Each of these labels has two different values in your answer: ${clash.join(', ')}. Keep the correct one (from the tool results) and remove the other.`,
      blocking: false,
      kind: 'consistency',
    });
  if (o.toolCalls && o.toolErrors / o.toolCalls >= 0.5)
    f.push({
      dimension: 'tool_accuracy',
      what: `${o.toolErrors}/${o.toolCalls} appels d’outils en erreur`,
      fix: 'Several tool calls failed: check that your answer does not rely on a failed call.',
      blocking: false,
      kind: 'tool',
    });
  for (const x of f) x.locus ??= LOCUS[x.kind];
  const pen = (d: keyof QualityVector) =>
    f.filter((x) => x.dimension === d).reduce((s, x) => s + (x.blocking ? 0.5 : 0.25), 0);
  const v: QualityVector = {
    correctness:
      o.missionQa !== undefined
        ? o.missionQa / 100
        : Math.max(0, 1 - pen('factuality') - pen('code_quality') * 0.5),
    completeness: Math.max(0, 1 - pen('completeness')),
    instruction_following: Math.max(0, 1 - pen('instruction_following')),
    style: Math.max(0, 1 - pen('style')),
    safety: f.some((x) => x.kind === 'safety') ? 0 : 1,
    tool_accuracy: o.toolCalls ? Math.max(0, 1 - o.toolErrors / o.toolCalls) : 1,
    code_quality: Math.max(0, 1 - pen('code_quality')),
    factuality: Math.max(0, 1 - pen('factuality')),
    efficiency: o.tokenBudget ? Math.max(0, Math.min(1, 1.2 - o.tokens / o.tokenBudget)) : 1,
    consistency: Math.max(0, 1 - pen('consistency')),
  };
  const score = qualityScore(v);
  const failureVector: Partial<Record<ErrorLocus, number>> = {};
  for (const x of f) failureVector[x.locus!] = (failureVector[x.locus!] ?? 0) + 1;
  return { vector: v, score, failures: f, local: true, levels: ['L0', 'L1'], failureVector };
}

const LOCUS: Record<QaFailure['kind'], ErrorLocus> = {
  format: 'format',
  missing: 'instruction',
  code: 'code',
  factual: 'data',
  safety: 'instruction',
  language: 'instruction',
  length: 'instruction',
  consistency: 'reasoning',
  tool: 'tool',
};

/** Targeted correction prompt: only what failed, nothing else. */
export function correctionPrompt(failures: QaFailure[]): string {
  return `JEV QA found precise problems in your last answer. Fix ONLY these, keep everything else identical, and return the corrected answer:\n${failures
    .map((x) => `- ${x.what} → ${x.fix}`)
    .join('\n')}`;
}

/** Correct only when it pays: blocking failure, budget left, and not already corrected. */
export function shouldCorrect(
  q: QaResult,
  o: {
    mode: 'eco' | 'balanced' | 'performance' | 'max';
    corrections: number;
    budgetLeft: number | null;
    estCost: number;
  },
): { yes: boolean; why: string } {
  const blocking = q.failures.filter((x) => x.blocking);
  if (!blocking.length)
    return {
      yes: false,
      why: q.failures.length
        ? 'défauts mineurs : pas de correction (gain marginal trop faible)'
        : 'aucun défaut détecté',
    };
  if (o.corrections >= (o.mode === 'max' ? 2 : 1))
    return { yes: false, why: 'correction déjà faite : arrêt (pas de boucle)' };
  if (o.budgetLeft !== null && o.estCost > o.budgetLeft)
    return { yes: false, why: 'budget insuffisant pour corriger' };
  if (
    o.mode === 'eco' &&
    !blocking.some((b) => b.kind === 'format' || b.kind === 'safety' || b.kind === 'missing')
  )
    return {
      yes: false,
      why: 'mode ECO : seules les erreurs de format, d’oubli ou de sécurité sont corrigées',
    };
  return { yes: true, why: `correction ciblée : ${blocking.map((b) => b.kind).join(', ')}` };
}
