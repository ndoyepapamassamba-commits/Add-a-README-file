// JEV TEACHER ENGINE: the Teacher is never called automatically. The Cost Governor decides EXECUTE / SKIP, the
// result is distilled into skills (observable decisions only, never private reasoning), and the Teacher's value is
// measured so that useless teaching is called less often.
import type { JevLogEntry } from '../metrics';
import { economicGovernor, type GovMode, type GovernorDecision } from '../fabric/learning';
import { qualityOfEntry } from '../fabric/memory';
import { mineCandidates, type FabricSkill, type MineReport } from '../fabric/skills';
import { isFreeId, familyOf, freeOutcome } from './registry';

export interface TeacherCandidate {
  id: string;
  /** Estimated cost of one teacher run (USD). */
  estCost: number;
  /** Specialist of the domain (declared by the V5 router), if known. */
  specialist?: boolean;
}
export interface TeacherChoice {
  id: string;
  reason: string;
  basis: 'MEASURED' | 'PROJECTED';
  estCost: number;
  /** Teacher quality on this family (0–100) when measured. */
  quality: number | null;
}

/** Best historical model for the family (n ≥ 2 judged runs), else a domain specialist, else the first candidate. */
export function selectTeacher(
  family: string,
  log: JevLogEntry[],
  candidates: TeacherCandidate[],
): TeacherChoice | null {
  if (!candidates.length) return null;
  const byModel = new Map<string, JevLogEntry[]>();
  for (const e of log)
    if (!isFreeId(e.model) && e.model !== 'JEV-0' && familyOf(e) === family && e.success !== null)
      byModel.set(e.model, [...(byModel.get(e.model) ?? []), e]);
  const stat = (m: string) => {
    const es = byModel.get(m) ?? [];
    const q = es.map(qualityOfEntry).filter((x): x is number => x !== null);
    return {
      n: es.length,
      success: es.length ? es.filter((e) => e.success).length / es.length : null,
      quality: q.length ? q.reduce((a, b) => a + b, 0) / q.length : null,
    };
  };
  const ranked = candidates
    .map((c) => ({ c, s: stat(c.id) }))
    .filter((x) => x.s.n >= 2)
    .sort((a, b) => (b.s.success ?? 0) - (a.s.success ?? 0) || (b.s.quality ?? 0) - (a.s.quality ?? 0));
  if (ranked[0])
    return {
      id: ranked[0].c.id,
      reason: `meilleur modèle historique sur « ${family} » (${ranked[0].s.n} missions, réussite ${Math.round((ranked[0].s.success ?? 0) * 100)} %)`,
      basis: 'MEASURED',
      estCost: ranked[0].c.estCost,
      quality: ranked[0].s.quality,
    };
  const sp = candidates.find((c) => c.specialist);
  const pick = sp ?? candidates[0]!;
  return {
    id: pick.id,
    reason: sp
      ? 'spécialiste du domaine selon le routeur V5 (aucun historique sur cette famille)'
      : 'premier candidat du routeur V5 (aucun historique sur cette famille)',
    basis: 'PROJECTED',
    estCost: pick.estCost,
    quality: null,
  };
}

export interface TeacherGateInput {
  family: string;
  teacher: TeacherChoice;
  /** Predicted success of the apprentice (0–1) and its measured quality (0–100) when known. */
  apprenticeSuccess: number;
  apprenticeQuality: number | null;
  /** Number of runs behind the apprentice figures. */
  apprenticeN: number;
  mode: GovMode;
  valuePerPoint: number;
  risk: number;
  extraLatencyMs?: number;
  maxExtraLatencyMs?: number;
  /** Allowed by the Teacher-efficiency policy (see teacherAllowance). */
  allowed?: boolean;
}
export interface TeacherGate {
  execute: boolean;
  decision: GovernorDecision;
  inputs: {
    expected_quality_gain: number;
    expected_success_gain: number;
    teacher_cost: number;
    latency_cost: number;
    information_value: number;
  };
  reason: string;
}
/** EXECUTE TEACHER or SKIP TEACHER: expected quality + information gain vs. the full cost of the Teacher. */
export function teacherGate(i: TeacherGateInput): TeacherGate {
  const teacherQ = i.teacher.quality ?? 90;
  const appQ = i.apprenticeQuality ?? i.apprenticeSuccess * 100;
  const qGain = Math.max(0, teacherQ - appQ);
  const sGain = Math.max(0, (i.teacher.basis === 'MEASURED' ? 0.9 : 0.85) - i.apprenticeSuccess);
  // Information value: a family the apprentice has barely seen is worth teaching (policy prior, labelled PROJECTED).
  const info = i.apprenticeN < 5 ? 5 : 0;
  const dec = economicGovernor({
    action: `faire enseigner ${i.family} par ${i.teacher.id}`,
    mode: i.mode,
    expectedQualityGain: qGain + info,
    gainSource: i.teacher.basis === 'MEASURED' && i.apprenticeN >= 5 ? 'MEASURED' : 'PROJECTED',
    expectedCost: i.teacher.estCost,
    extraLatencyMs: i.extraLatencyMs,
    maxExtraLatencyMs: i.maxExtraLatencyMs,
    risk: i.risk,
    valuePerPoint: i.valuePerPoint,
  });
  const allowed = i.allowed !== false;
  return {
    execute: dec.use && allowed,
    decision: dec,
    inputs: {
      expected_quality_gain: qGain,
      expected_success_gain: sGain,
      teacher_cost: i.teacher.estCost,
      latency_cost: i.extraLatencyMs ?? 0,
      information_value: info,
    },
    reason: !allowed
      ? 'SKIP TEACHER : la valeur mesurée des appels précédents est trop faible (fréquence réduite)'
      : dec.use
        ? `EXECUTE TEACHER : ${dec.reason}`
        : `SKIP TEACHER : ${dec.reason}`,
  };
}

// ───────────────────────── teacher value ─────────────────────────

export interface TeacherValue {
  teacher: string;
  calls: number;
  /** Mean change of the apprentice's success rate on the taught families, after vs before (null = not measurable). */
  value: number | null;
  families: string[];
}
/** TeacherValueScore: did the apprentice get better on the families the teacher taught? */
export function teacherValue(log: JevLogEntry[]): TeacherValue[] {
  const taught = log.filter((e) => e.apprentice?.teacher);
  const by = new Map<string, JevLogEntry[]>();
  for (const e of taught) by.set(e.apprentice!.teacher!, [...(by.get(e.apprentice!.teacher!) ?? []), e]);
  return [...by].map(([teacher, es]) => {
    const deltas: number[] = [];
    for (const fam of new Set(es.map((e) => e.apprentice!.family))) {
      const t0 = Math.min(...es.filter((e) => e.apprentice!.family === fam).map((e) => e.at));
      const app = log
        .filter(
          (e) => e.apprentice?.active && !e.apprentice.teacher && isFreeId(e.model) && familyOf(e) === fam,
        )
        .map(freeOutcome)
        .filter((e) => e.success !== null);
      const before = app.filter((e) => e.at < t0);
      const after = app.filter((e) => e.at > t0);
      if (before.length >= 2 && after.length >= 2) {
        const r = (a: JevLogEntry[]) => a.filter((e) => e.success).length / a.length;
        deltas.push(r(after) - r(before));
      }
    }
    return {
      teacher,
      calls: es.length,
      value: deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null,
      families: [...new Set(es.map((e) => e.apprentice!.family))],
    };
  });
}
/** Teacher efficiency policy: many calls with no measurable gain → the Teacher is consulted less often. */
export function teacherAllowance(
  v: TeacherValue | undefined,
  minValue = 0.05,
): { allowed: boolean; ratio: number; reason: string } {
  if (!v || v.calls < 3 || v.value === null)
    return { allowed: true, ratio: 1, reason: 'historique insuffisant pour juger la valeur du Teacher' };
  if (v.value >= minValue)
    return {
      allowed: true,
      ratio: 1,
      reason: `valeur mesurée +${(v.value * 100).toFixed(0)} pts de réussite`,
    };
  const allowed = v.calls % 4 === 0;
  return {
    allowed,
    ratio: 0.25,
    reason: `valeur mesurée ${(v.value * 100).toFixed(0)} pts après ${v.calls} appels : fréquence réduite à 1 appel sur 4`,
  };
}

// ───────────────────────── transfer & skill stages ─────────────────────────

export interface Transfer {
  skill: string;
  teacher: string;
  apprentices: string[];
  successes: number;
  message: string;
}
/** Skills mined from a Teacher that a free Apprentice then used successfully. */
export function skillTransfers(log: JevLogEntry[], skills: FabricSkill[]): Transfer[] {
  const out: Transfer[] = [];
  for (const s of skills) {
    const teacher = s.versions.find((v) => v.provenance.teacher)?.provenance.teacher;
    if (!teacher) continue;
    const runs = log.filter((e) => isFreeId(e.model) && e.success && (e.skillsUsed ?? []).includes(s.name));
    if (!runs.length) continue;
    out.push({
      skill: s.name,
      teacher,
      apprentices: [...new Set(runs.map((e) => e.model))],
      successes: runs.length,
      message: `Cette compétence a été transférée d’un Teacher (${teacher}) vers ${[...new Set(runs.map((e) => e.model))].join(', ')}.`,
    });
  }
  return out;
}

export type SkillStage = 'CANDIDATE' | 'VALIDATED' | 'PRODUCTION';
/** CANDIDATE → VALIDATED (rules + test lab) → PRODUCTION (a WITH/WITHOUT benchmark shows no regression, n ≥ 5). */
export function skillStage(s: FabricSkill): SkillStage {
  if (s.activeVersion === null || s.status === 'deprecated' || s.status === 'failed') return 'CANDIDATE';
  const v = s.versions.find((x) => x.version === s.activeVersion);
  const b = v?.benchmark;
  return b && b.n >= 5 && (b.deltaSuccess ?? -1) >= 0 && (b.deltaQuality ?? -1) >= 0
    ? 'PRODUCTION'
    : 'VALIDATED';
}

/**
 * FAILURE → PREMIUM SUCCESS → PATTERN → CORRECTION PATTERN → SKILL CANDIDATE. One observed pair is enough to create a
 * CANDIDATE (never a validated skill): it is then injected under test for the apprentice, benchmarked, and only promoted
 * by the usual rules.
 */
export function skillFromFailure(
  log: JevLogEntry[],
  existing: FabricSkill[],
  entry: JevLogEntry,
  now?: number,
): MineReport {
  const teacher = entry.apprentice?.teacher ?? entry.model;
  const fam = familyOf(entry);
  const runs = log.filter((e) => e.model === teacher && e.success && familyOf(e) === fam);
  return mineCandidates({
    log: runs.length ? runs : [entry],
    existing,
    teacher,
    now,
    rules: { minRepeats: 1, minMissions: 1 },
  });
}
