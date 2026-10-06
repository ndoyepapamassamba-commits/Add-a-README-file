// FAILURE → LEARNING. A failure signature (errorType × family × model × skill × tool × contract × risk × correction × outcome);
// the same error on the same model and family ≥ 3 times becomes a FAILURE PATTERN, which proposes a SKILL candidate, tested
// WITH / WITHOUT before promotion, after which the champion is recomputed.
import type { JevLogEntry } from '../metrics';
import { safeText } from '../fabric/memory';
import { keywordsOf } from './kw';
import { hashText } from '../science';
import type { FabricSkill, SkillVersion } from '../fabric/skills';
import { CORRECTIONS, type FailureSignature } from './failure';
import { strataOf } from './strata';
import type { Risk } from './types';

export interface FailureSignatureRecord {
  errorType: string;
  taskFamily: string;
  model: string;
  skill: string | null;
  tool: string | null;
  outputContract: string;
  risk: Risk;
  correction: string;
  outcome: 'recovered' | 'escalated' | 'unresolved';
  at: number;
  entryId: string;
}
export function signatureRecords(log: JevLogEntry[]): FailureSignatureRecord[] {
  return log.flatMap((e) => {
    const f = e.apprentice?.failure;
    if (!f) return [];
    const st = strataOf(e);
    return [
      {
        errorType: f.signature,
        taskFamily: st.family,
        model: e.model,
        skill: e.skillsUsed?.[0] ?? null,
        tool: e.toolsUsed?.[0] ?? null,
        outputContract: st.contract,
        risk: st.risk,
        correction: f.correction,
        outcome: f.outcome,
        at: e.at,
        entryId: e.id,
      },
    ];
  });
}

export interface FailurePattern {
  id: string;
  model: string;
  family: string;
  errorType: string;
  count: number;
  contracts: string[];
  tools: string[];
  corrections: string[];
  /** Redacted examples of the failing missions. */
  examples: string[];
  lastAt: number;
  status: 'detected' | 'skill_candidate';
  skillId?: string;
}
/** Same model + same family + same error, at least `min` occurrences. */
export function detectFailurePatterns(
  log: JevLogEntry[],
  existingSkills: FabricSkill[] = [],
  min = 3,
): FailurePattern[] {
  const by = new Map<string, FailureSignatureRecord[]>();
  for (const r of signatureRecords(log))
    by.set(`${r.model}|${r.taskFamily}|${r.errorType}`, [
      ...(by.get(`${r.model}|${r.taskFamily}|${r.errorType}`) ?? []),
      r,
    ]);
  return [...by]
    .filter(([, rs]) => rs.length >= min)
    .map(([k, rs]) => {
      const id = `fp-${hashText(k)}`;
      const sk = existingSkills.find((s) => s.groupKey === `failure:${id}`);
      return {
        id,
        model: rs[0]!.model,
        family: rs[0]!.taskFamily,
        errorType: rs[0]!.errorType,
        count: rs.length,
        contracts: [...new Set(rs.map((r) => r.outputContract))],
        tools: [...new Set(rs.map((r) => r.tool).filter((t): t is string => Boolean(t)))],
        corrections: [...new Set(rs.map((r) => r.correction))],
        examples: rs
          .slice(-3)
          .map((r) =>
            safeText(log.find((e) => e.id === r.entryId) ?? ({ mission: '' } as JevLogEntry)).slice(0, 120),
          ),
        lastAt: Math.max(...rs.map((r) => r.at)),
        status: sk ? ('skill_candidate' as const) : ('detected' as const),
        skillId: sk?.id,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/** A SKILL candidate that carries the named correction as a procedure (never validated by itself). */
export function skillFromPattern(p: FailurePattern, log: JevLogEntry[], now = Date.now()): FabricSkill {
  const fails = signatureRecords(log).filter(
    (r) => r.model === p.model && r.taskFamily === p.family && r.errorType === p.errorType,
  );
  const texts = fails.map((r) =>
    safeText(log.find((e) => e.id === r.entryId) ?? ({ mission: '' } as JevLogEntry)),
  );
  const kw = new Map<string, number>();
  for (const t of texts) for (const w of keywordsOf(t)) kw.set(w, (kw.get(w) ?? 0) + 1);
  const triggers = [...kw]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
  const sig = p.errorType as FailureSignature;
  const c = CORRECTIONS[sig] ?? CORRECTIONS.GENERIC_QUALITY_GAP;
  const task = p.family.split(':')[0] ?? 'chat';
  const name = `fix_${p.errorType.toLowerCase()}_${p.family.split(':')[1] ?? 'general'}`;
  const v: SkillVersion = {
    version: '1.0',
    name,
    domain: task,
    taskTypes: [task],
    triggerConditions: triggers.length ? triggers : keywordsOf(p.family.replace(':', ' ')),
    prerequisites: [],
    procedure: [`1. ${c.instruction}`, '2. Vérifier le résultat contre les critères avant de répondre'],
    promptTemplate: `[Skill ${name}] ${c.instruction}`,
    toolRequirements: p.tools,
    expectedOutput: 'réponse conforme au contrat de sortie',
    evaluationCriteria: ['contrat de sortie respecté', 'aucune répétition de l’erreur'],
    examples: [],
    counterExamples: p.examples.map((e) => ({ instruction: e, problem: p.errorType })),
    provenance: {
      experiences: fails.map((f) => f.entryId).slice(0, 20),
      models: [p.model],
      note: `pattern d’échec ${p.errorType} ×${p.count} sur ${p.family}`,
    },
    confidence: 0,
    successRate: null,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
    reason: 'proposée par un pattern d’échec (≥ 3 occurrences) ; à tester WITH / WITHOUT',
    benchmark: null,
    regressions: [],
    status: 'candidate',
  };
  return {
    id: `skill-${hashText(`failure:${p.id}`)}`,
    name,
    domain: task,
    currentVersion: '1.0',
    activeVersion: null,
    versions: [v],
    status: 'candidate',
    groupKey: `failure:${p.id}`,
    createdAt: now,
    updatedAt: now,
  };
}
