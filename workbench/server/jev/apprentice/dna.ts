// Task DNA and FREE_MODEL_ELIGIBILITY — deterministic, no model call.
import type { JevLogEntry } from '../metrics';
import { dimsOf, type Dimension } from '../fabric/learning';
import { ambiguityOf } from '../fabric/council';
import type { DataClass } from '../fabric/types';
import { checkProvider, unknownPolicy, type ProviderPolicy } from '../fabric/security';
import type { ApprenticeSettings, Eligibility, FreeCaps, Risk, TaskDNA } from './types';
import { DEFAULT_APPRENTICE } from './types';
import { contractOfText } from './strata';

export interface DnaInput {
  text: string;
  taskType: string;
  /** 0–1. */
  difficulty: number;
  criticality: Risk;
  attachments?: string[];
  tools?: string[];
  outputs?: string[];
  contextTokens?: number;
  /** Cost mode of JEV: eco → zero-cost constraint. */
  mode?: string;
}

const PRIMARY: Dimension[] = [
  'IFRS9',
  'CREDIT_RISK',
  'EXCEL',
  'FINANCE',
  'DATA_ANALYSIS',
  'CODING',
  'DOCUMENTS',
  'RESEARCH',
  'MATHEMATICS',
  'REASONING',
];
/** The dominant domain of a task (most specific dimension first). */
export function domainOf(text: string, taskType: string): string {
  const d = dimsOf({
    mission: text,
    task: taskType,
    toolsUsed: [],
    contextBefore: 0,
  } as unknown as JevLogEntry);
  return PRIMARY.find((p) => d.includes(p))?.toLowerCase() ?? taskType;
}

const gateOf = (risk: Risk, difficulty: number, s: ApprenticeSettings) =>
  risk === 'critical'
    ? s.gates.critical
    : risk === 'high' || difficulty >= 0.7
      ? s.gates.high
      : difficulty >= 0.35
        ? s.gates.normal
        : s.gates.low;

export function taskDnaOf(i: DnaInput, s: ApprenticeSettings = DEFAULT_APPRENTICE): TaskDNA {
  const t = i.text;
  const fr = (t.match(/\b(le|la|les|des|une|est|pour|avec|dans|sont|quel|quelle|combien)\b/gi) ?? []).length;
  const en = (t.match(/\b(the|and|with|for|this|that|is|are|what|how)\b/gi) ?? []).length;
  const structured = /\b(json|csv|tableau|table|xlsx?|liste|format|colonnes?)\b/i.test(t);
  const reasoning =
    i.difficulty >= 0.5 || /\b(pourquoi|explique|raisonne|démontre|compare|analyse|d[ée]cide)\b/i.test(t);
  const domain = domainOf(t, i.taskType);
  return {
    task_type: i.taskType,
    task_family: `${i.taskType}:${domain}`,
    difficulty: Math.round(i.difficulty * 100) / 100,
    risk: i.criticality,
    ambiguity: Math.round(ambiguityOf(t) * 100) / 100,
    language: fr + en < 2 ? 'other' : fr >= en ? 'fr' : 'en',
    domain,
    expected_output: (i.outputs ?? []).join(', ') || (structured ? 'données structurées' : 'texte'),
    success_criteria: [
      'répond exactement à la demande',
      ...(structured ? ['format demandé respecté'] : []),
      ...(/\d/.test(t) ? ['chiffres justifiés par les données'] : []),
      ...(i.criticality === 'critical' || i.criticality === 'high'
        ? ['aucune affirmation non vérifiée']
        : []),
    ],
    tool_requirements: i.tools ?? [],
    context_size: i.contextTokens ?? Math.ceil(t.length / 4),
    reasoning_requirement: reasoning,
    structured_output_requirement: structured,
    output_contract: contractOfText(t, structured),
    freshness_requirement:
      /\b(aujourd.?hui|actuel(le)?s?|derni[èe]res?|actualit[ée]s?|en temps r[ée]el|cours (du|de la)|taux du jour|breaking|latest|today|current price)\b/i.test(
        t,
      ),
    latency_requirement: i.taskType === 'chat' && i.difficulty < 0.3 ? 'low' : 'normal',
    cost_constraint: i.mode === 'eco' ? 'zero' : 'low',
    quality_threshold: gateOf(i.criticality, i.difficulty, s),
  };
}

/**
 * FREE_MODEL_ELIGIBILITY: can this free model serve this task at all (capabilities, context, data policy)?
 * The data policy of a free provider is "unknown" unless the user declared it — unknown is never read as safe.
 */
export function freeEligibility(
  dna: TaskDNA,
  m: FreeCaps,
  o: { classification?: DataClass; policy?: ProviderPolicy; hasImages?: boolean; needsTools?: boolean } = {},
): Eligibility {
  const reasons: string[] = [];
  let met = 0;
  let total = 0;
  const need = (ok: boolean, yes: string, no: string) => {
    total++;
    if (ok) met++;
    reasons.push(ok ? yes : no);
    return ok;
  };
  const level = o.classification ?? 'PUBLIC';
  const sec = checkProvider(level, o.policy ?? unknownPolicy(m.provider), { free: true });
  if (sec.action !== 'allow' && level !== 'PUBLIC')
    return { eligible: false, score: 0, reasons: [`sécurité : ${sec.reason}`], blockedBy: 'security' };
  const needsTools = o.needsTools ?? dna.tool_requirements.length > 0;
  if (!need(!needsTools || m.tools, 'outils pris en charge', 'le modèle ne gère pas les outils requis'))
    return { eligible: false, score: met / total, reasons, blockedBy: 'capability' };
  if (!need(!o.hasImages || m.vision, 'vision OK', 'image jointe mais modèle sans vision'))
    return { eligible: false, score: met / total, reasons, blockedBy: 'capability' };
  if (
    !need(
      m.contextLength >= dna.context_size * 2 + 2000,
      'contexte suffisant',
      `contexte ${m.contextLength} insuffisant`,
    )
  )
    return { eligible: false, score: met / total, reasons, blockedBy: 'context' };
  need(
    !dna.structured_output_requirement || m.structuredOutputs,
    'sortie structurée OK',
    'sortie structurée non garantie (JSON validé par JEV)',
  );
  need(
    !dna.reasoning_requirement || m.reasoning,
    'raisonnement OK',
    'pas de mode raisonnement : JEV compense par le plan',
  );
  return { eligible: true, score: total ? met / total : 1, reasons };
}
