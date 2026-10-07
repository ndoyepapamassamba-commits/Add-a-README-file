// JEV COGNITIVE OS — MODEL CONDITIONING, BEHAVIOUR POLICY, OUTPUT CONTRACT, PREEMPTIVE CORRECTION.
// The model is the engine; JEV prepares its cognitive environment: role, frame, protocol, relevant skills / memory / known
// failures, output contract, stop condition, token budget. Minimal and targeted — never a giant prompt. No weights are touched.
import type { CognitiveDiagnosis } from './diagnosis';
import type { Protocol } from './protocols';
import type { TokenBudget } from './tokens';

export type BehaviorMode =
  | 'FAST'
  | 'PRECISE'
  | 'ANALYTICAL'
  | 'CREATIVE'
  | 'CRITICAL'
  | 'SCIENTIFIC'
  | 'ENGINEERING'
  | 'AUDITOR'
  | 'TEACHER'
  | 'RESEARCHER'
  | 'EDITOR'
  | 'ARCHITECT'
  | 'STRATEGIST'
  | 'RED-TEAM'
  | 'OPTIMIZER';
export interface BehaviorPolicy {
  mode: BehaviorMode;
  line: string;
  /** Sampling hint for the caller (lower = more deterministic). */
  temperature: number;
}
const BEHAVIORS: Record<BehaviorMode, BehaviorPolicy> = {
  FAST: { mode: 'FAST', line: 'Réponds vite et court, sans préambule.', temperature: 0.4 },
  PRECISE: { mode: 'PRECISE', line: 'Sois exact ; cite chaque chiffre et sa provenance.', temperature: 0.1 },
  ANALYTICAL: {
    mode: 'ANALYTICAL',
    line: 'Analyse par critères ; sépare faits, interprétations et recommandations.',
    temperature: 0.3,
  },
  CREATIVE: {
    mode: 'CREATIVE',
    line: 'Propose plusieurs pistes originales, puis recommande la meilleure.',
    temperature: 0.9,
  },
  CRITICAL: {
    mode: 'CRITICAL',
    line: 'Cherche activement ce qui est faux ou manquant avant de valider.',
    temperature: 0.2,
  },
  SCIENTIFIC: {
    mode: 'SCIENTIFIC',
    line: 'Formule, teste, conclus selon les preuves ; indique le niveau de confiance.',
    temperature: 0.2,
  },
  ENGINEERING: {
    mode: 'ENGINEERING',
    line: 'Livre une solution exécutable, testée, dans le style existant.',
    temperature: 0.2,
  },
  AUDITOR: {
    mode: 'AUDITOR',
    line: 'Contrôle comme un auditeur : écart, preuve, gravité.',
    temperature: 0.1,
  },
  TEACHER: {
    mode: 'TEACHER',
    line: 'Explique la cause et la règle à retenir en peu de lignes.',
    temperature: 0.4,
  },
  RESEARCHER: {
    mode: 'RESEARCHER',
    line: 'Croise plusieurs sources datées ; signale les désaccords.',
    temperature: 0.3,
  },
  EDITOR: { mode: 'EDITOR', line: 'Corrige et clarifie sans changer le sens ni allonger.', temperature: 0.3 },
  ARCHITECT: {
    mode: 'ARCHITECT',
    line: 'Décide la structure et les interfaces avant le détail.',
    temperature: 0.3,
  },
  STRATEGIST: {
    mode: 'STRATEGIST',
    line: 'Compare les options par impact, coût et risque, puis recommande.',
    temperature: 0.5,
  },
  'RED-TEAM': {
    mode: 'RED-TEAM',
    line: 'Attaque la solution : failles, abus, cas limites réels.',
    temperature: 0.5,
  },
  OPTIMIZER: {
    mode: 'OPTIMIZER',
    line: 'Réduis le coût ou le temps sans perdre en qualité ; mesure l’écart.',
    temperature: 0.2,
  },
};
export const BEHAVIOR_MODES = Object.keys(BEHAVIORS) as BehaviorMode[];
export function behaviorFor(d: CognitiveDiagnosis, text = ''): BehaviorPolicy {
  if (d.trivial) return BEHAVIORS.FAST;
  if (/\b(s[ée]curit[ée]|vuln[ée]rab|attaque|injection)\b/i.test(text)) return BEHAVIORS['RED-TEAM'];
  if (d.cognitiveType === 'code') return BEHAVIORS.ENGINEERING;
  if (d.cognitiveType === 'verify') return d.risk === 'high' ? BEHAVIORS.AUDITOR : BEHAVIORS.CRITICAL;
  if (d.cognitiveType === 'create') return BEHAVIORS.CREATIVE;
  if (d.cognitiveType === 'plan') return d.taskType === 'code' ? BEHAVIORS.ARCHITECT : BEHAVIORS.STRATEGIST;
  if (d.precisionNeed >= 0.7) return BEHAVIORS.PRECISE;
  if (d.taskType === 'research') return BEHAVIORS.RESEARCHER;
  if (d.cognitiveType === 'analyze') return BEHAVIORS.ANALYTICAL;
  return BEHAVIORS.ANALYTICAL;
}

export interface OutputContract {
  type: string;
  length: string;
  language: string;
  required: string[];
  stop: string;
  line: string;
}
/** Minimal Output Contract: the model must not produce more than needed. */
export function outputContract(
  d: CognitiveDiagnosis,
  o: { language?: string; maxOutput: number; required?: string[] },
): OutputContract {
  const type =
    d.cognitiveType === 'code'
      ? 'code + résumé court'
      : d.cognitiveType === 'extract'
        ? 'liste structurée'
        : d.cognitiveType === 'compute'
          ? 'résultat + méthode en une ligne'
          : d.cognitiveType === 'create'
            ? 'proposition(s) structurée(s)'
            : d.trivial
              ? 'réponse courte'
              : 'réponse structurée';
  const length = d.trivial
    ? '≤ 3 phrases'
    : d.cognitiveType === 'code'
      ? 'le code nécessaire, sans explication superflue'
      : `≤ ${Math.round(o.maxOutput * 0.75)} tokens`;
  const stop =
    d.risk === 'high'
      ? 'arrête-toi dès que la demande est traitée et vérifiée'
      : 'arrête-toi dès que la demande est traitée';
  const line = `Format : ${type} ; longueur : ${length} ; langue : ${o.language ?? 'celle de l’utilisateur'}${o.required?.length ? ` ; champs requis : ${o.required.join(', ')}` : ''} ; ${stop}.`;
  return { type, length, language: o.language ?? '', required: o.required ?? [], stop, line };
}

// ───────── failure prediction & preemptive correction ─────────
export type FailureMode =
  | 'hallucination'
  | 'incomplete'
  | 'wrong-format'
  | 'tool-misuse'
  | 'overlong'
  | 'missing-constraint'
  | 'calculation-error'
  | 'unsupported-claim'
  | 'bad-code'
  | 'visual-inconsistency'
  | 'wrong-capability';
export interface FailurePrediction {
  mode: FailureMode;
  /** Why this failure is plausible for THIS request. */
  because: string;
  /** Measured evidence for the chosen model (null = none: the prediction rests on the request only). */
  evidence: { n: number; rate: number } | null;
  guard: string;
}
const GUARDS: Record<FailureMode, string> = {
  hallucination: 'N’invente aucune donnée : dis « inconnu » quand elle manque.',
  incomplete: 'Traite tous les points de la demande avant de conclure.',
  'wrong-format': 'Respecte exactement le format demandé ; JSON valide si JSON.',
  'tool-misuse': 'Utilise les outils avec leurs paramètres exacts ; lis l’erreur avant de réessayer.',
  overlong: 'Reste dans la longueur demandée ; supprime tout préambule.',
  'missing-constraint': 'Relis les contraintes avant de répondre ; vérifie chacune.',
  'calculation-error': 'Calcule avec un outil et recoupe les totaux.',
  'unsupported-claim': 'Aucune affirmation sans source, calcul ou donnée fournie.',
  'bad-code': 'Exécute ou teste le code avant de le présenter.',
  'visual-inconsistency': 'Garde les mêmes traits, tenue et proportions que la référence.',
  'wrong-capability': 'Si la tâche dépasse ce que tu peux faire ici, dis-le au lieu de simuler.',
};
/** Modes a request makes plausible. */
export function predictFailures(
  d: CognitiveDiagnosis,
  o: { text: string; wantsJson?: boolean },
): { mode: FailureMode; because: string }[] {
  const out: { mode: FailureMode; because: string }[] = [];
  const add = (mode: FailureMode, because: string) => out.push({ mode, because });
  if (d.calcNeed && d.precisionNeed >= 0.5) add('calculation-error', 'chiffres sensibles');
  if (d.cognitiveType === 'code') add('bad-code', 'tâche de code');
  if (o.wantsJson || /\bjson\b/i.test(o.text)) add('wrong-format', 'sortie structurée demandée');
  if (d.toolNeed) add('tool-misuse', 'outils nécessaires');
  if (d.risk === 'high' || d.freshness)
    add('unsupported-claim', d.freshness ? 'information récente' : 'enjeu élevé');
  if (
    /\b(\d+|plusieurs|chaque|tous|toutes)\b.*\b(et|puis|ensuite)\b/i.test(o.text) ||
    o.text.split(/[,;]\s|\bet\b/).length > 5
  )
    add('incomplete', 'demande en plusieurs parties');
  if (d.ambiguity >= 0.45) add('missing-constraint', 'demande ambiguë');
  if (d.trivial) add('overlong', 'demande courte : réponse longue inutile');
  if (d.visionNeed) add('visual-inconsistency', 'image impliquée');
  return out;
}
export interface FailureProfile {
  /** Per model and failure mode: observations and failures from REAL runs. */
  [model: string]: Partial<Record<FailureMode, { n: number; failed: number }>>;
}
/**
 * Guards to add. A guard is added when (a) the request makes the failure plausible AND (b) either the model's measured failure
 * rate on that mode is ≥ 20 % with n ≥ 5, or no measurement exists AND the failure is high-impact (calculation, unsupported claim, code).
 * Otherwise nothing is added: no over-prompting.
 */
export function preemptiveGuards(
  preds: { mode: FailureMode; because: string }[],
  model: string,
  profile: FailureProfile,
): FailurePrediction[] {
  const high = new Set<FailureMode>(['calculation-error', 'unsupported-claim', 'bad-code']);
  const out: FailurePrediction[] = [];
  for (const p of preds) {
    const row = profile[model]?.[p.mode];
    const evidence = row && row.n >= 5 ? { n: row.n, rate: row.failed / row.n } : null;
    if (evidence ? evidence.rate >= 0.2 : high.has(p.mode))
      out.push({ mode: p.mode, because: p.because, evidence, guard: GUARDS[p.mode] });
  }
  return out;
}

export interface Conditioning {
  system: string;
  tokens: number;
  sections: { key: string; tokens: number }[];
  /** The kept sections with their text, so the caller can inject only the engines that are ACTIVE. */
  parts: { key: string; text: string }[];
}
const est = (s: string) => Math.ceil(s.length / 3.8);
/** Assembles the conditioning; sections are dropped (lowest priority first) to respect `maxTokens`. */
export function conditionModel(o: {
  behavior: BehaviorPolicy;
  protocol: Protocol;
  contract: OutputContract;
  guards: FailurePrediction[];
  skills?: string[];
  memory?: string[];
  budget: TokenBudget;
  maxTokens: number;
}): Conditioning {
  const secs: { key: string; text: string; priority: number }[] = [
    { key: 'CONTRACT', text: o.contract.line, priority: 0 },
    { key: 'BEHAVIOR', text: o.behavior.line, priority: 1 },
    { key: 'PROTOCOL', text: o.protocol.text, priority: 2 },
    { key: 'GUARDS', text: o.guards.map((g) => g.guard).join(' '), priority: 3 },
    { key: 'SKILLS', text: (o.skills ?? []).join(' '), priority: 4 },
    { key: 'MEMORY', text: (o.memory ?? []).join(' '), priority: 5 },
    { key: 'BUDGET', text: `Budget : ${o.budget.maxOutput} tokens de sortie au maximum.`, priority: 6 },
  ].filter((s) => s.text.trim());
  const kept = [...secs];
  let total = kept.reduce((a, s) => a + est(s.text), 0);
  while (total > o.maxTokens && kept.length > 1) {
    const drop = kept.reduce((m, s) => (s.priority > m.priority ? s : m));
    kept.splice(kept.indexOf(drop), 1);
    total = kept.reduce((a, s) => a + est(s.text), 0);
  }
  return {
    system: kept.map((s) => s.text).join('\n'),
    tokens: total,
    sections: kept.map((s) => ({ key: s.key, tokens: est(s.text) })),
    parts: kept.map((s) => ({ key: s.key, text: s.text })),
  };
}
/** Conditioning Efficiency Score: quality points gained per 100 added tokens, from PAIRED real runs; null without data. */
export function conditioningEfficiency(
  pairs: { qualityWith: number; qualityWithout: number; addedTokens: number }[],
): number | null {
  const p = pairs.filter((x) => Number.isFinite(x.qualityWith) && Number.isFinite(x.qualityWithout));
  if (p.length < 5) return null;
  const gain = p.reduce((a, x) => a + (x.qualityWith - x.qualityWithout), 0) / p.length;
  const added = p.reduce((a, x) => a + x.addedTokens, 0) / p.length;
  return added > 0 ? (gain / added) * 100 : null;
}
