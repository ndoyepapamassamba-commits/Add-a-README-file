// JEV APPRENTICE — runtime (free-first). "JEV-ADAPTED" = INFERENCE-TIME ADAPTATION: a compact capsule (Task DNA,
// validated skills, validated examples, failure rules, minimal tools, output contract) is compiled in milliseconds and
// injected in the prompt. NO model weights are modified. Everything here makes real decisions from the JEV_LOG; with the
// switch off, the V5 router decides exactly as before.
import { useStore } from './store';
import {
  DEFAULT_APPRENTICE,
  DEFAULT_WEIGHTS,
  type ApprenticeArm,
  type ApprenticeSettings,
  type ApprenticeTag,
  type Risk,
  type TaskDNA,
} from '../../server/jev/apprentice/types';
import { taskDnaOf } from '../../server/jev/apprentice/dna';
import {
  buildApprenticeRegistry,
  familyOf,
  type ApprenticeProfile,
} from '../../server/jev/apprentice/registry';
import {
  FallbackController,
  ladderFor,
  qualityGate,
  routeFreeFirst,
  type Attempt,
  type FreePlan,
  type GateVerdict,
} from '../../server/jev/apprentice/router';
import { compileCapsule, type Capsule } from '../../server/jev/apprentice/capsule';
import {
  activeVersion,
  applyDecision,
  benchmarkOf,
  decideVersion,
  newProfileVersion,
  profileKey,
  type ProfileVersion,
} from '../../server/jev/apprentice/versions';
import {
  teacherAllowance,
  teacherGate,
  teacherValue,
  selectTeacher,
  type TeacherGate,
} from '../../server/jev/apprentice/teacher';
import { failureLibrary } from '../../server/jev/fabric/memory';
import { classifyData } from '../../server/jev/fabric/security';
import { freePool } from '../../server/jev/fabric/council';
import { distillSkills } from '../../server/jev/fabric/distill';
import type { DataClass } from '../../server/jev/fabric/types';
import type { JevLogEntry } from '../../server/jev/metrics';
import { addDistilled } from './fabric';
import { jevSettings } from './jev';

export const apprenticeSettings = (): ApprenticeSettings => {
  const s = useStore.getState().settings.apprentice ?? {};
  return {
    ...DEFAULT_APPRENTICE,
    ...s,
    gates: { ...DEFAULT_APPRENTICE.gates, ...s.gates },
    weights: { ...DEFAULT_WEIGHTS, ...s.weights },
    maxFailureRisk: { ...DEFAULT_APPRENTICE.maxFailureRisk, ...s.maxFailureRisk },
  };
};

/** Benchmark arm → what is injected (ablation): A none · B JEV capsule · C + skills · D + skills + experience · E none. */
const ARM_USE: Record<ApprenticeArm, { capsule: boolean; skills: boolean; experience: boolean }> = {
  free: { capsule: false, skills: false, experience: false },
  free_jev: { capsule: true, skills: false, experience: false },
  free_skill: { capsule: true, skills: true, experience: false },
  free_skill_exp: { capsule: true, skills: true, experience: true },
  paid: { capsule: false, skills: false, experience: false },
};

export interface ApprenticeRunOpts {
  /** Benchmark arm: the model is pinned by the runner; no automatic fallback (each arm is measured on its own). */
  arm?: ApprenticeArm;
}

export interface ApprenticePrep {
  plan: FreePlan;
  dna: TaskDNA;
  capsule: Capsule | null;
  classification: DataClass;
  arm?: ApprenticeArm;
  /** A benchmark arm: the model is imposed and the fallback chain is off. */
  forced: boolean;
  profileVersion?: string;
  controller: FallbackController | null;
  ladder: string[];
  why: string[];
  /** The model the V5 router chose (the apprentice's last resort). */
  v5Model: string;
  /** Models tried so far (apprentice first). */
  path: string[];
  gateScores: number[];
  teacher?: { id: string; gate: TeacherGate };
}

export interface PrepareInput {
  text: string;
  attachments: string[];
  taskType: string;
  difficulty: number;
  criticality: Risk;
  /** Tool names the mission would expose (the capsule lists the allowed ones only). */
  tools: string[];
  hasImages: boolean;
  /** Models V5 lessons say to avoid. */
  avoid: string[];
  v5Model: string;
  v5Ladder: string[];
  /** The user pinned the model: the apprentice never overrides it. */
  userPinned: boolean;
  run?: ApprenticeRunOpts;
}

/** Task DNA → eligibility → free-first routing → micro-adaptation (capsule). Returns null when it takes no part. */
export function prepareApprentice(i: PrepareInput): ApprenticePrep | null {
  const st = useStore.getState();
  const s = apprenticeSettings();
  const arm = i.run?.arm;
  const forced = Boolean(arm);
  if (!forced && (!s.enabled || i.userPinned)) return null;
  const needsTools = !['chat', 'writing'].includes(i.taskType);
  const dna = taskDnaOf(
    {
      text: i.text,
      taskType: i.taskType,
      difficulty: i.difficulty,
      criticality: i.criticality,
      attachments: i.attachments,
      tools: needsTools ? ['tools'] : [],
      mode: jevSettings().mode,
    },
    s,
  );
  const classification = classifyData(i.text, i.attachments).level;
  const log = st.jevLog;
  const pool = freePool(st.models);
  const versions = st.fabric.profileVersions;
  const validated = new Set(versions.filter((v) => v.status === 'production').map(profileKey));
  const profiles = buildApprenticeRegistry(log, pool, { validated });
  const policyOf = (provider: string) => st.fabric.providerPolicies.find((p) => p.provider === provider);
  const plan: FreePlan = forced
    ? {
        use: true,
        reason: `bras de benchmark ${arm} : modèle imposé, sans repli automatique`,
        chosen: null,
        second: null,
        candidates: [],
        confidence: 'MEDIUM',
        predictedSuccess: null,
        threshold: dna.quality_threshold,
        attempts: [{ n: 1, kind: 'free_jev', model: null, label: 'modèle imposé' }],
        why: [],
      }
    : routeFreeFirst({
        dna,
        settings: s,
        profiles,
        pool,
        classification,
        policyOf,
        hasImages: i.hasImages,
        avoid: i.avoid,
        text: i.text,
      });
  if (!forced && !plan.use)
    return {
      plan,
      dna,
      capsule: null,
      classification,
      forced,
      controller: null,
      ladder: [],
      why: [plan.reason],
      v5Model: i.v5Model,
      path: [],
      gateScores: [],
    };
  const use = forced ? ARM_USE[arm!] : { capsule: true, skills: true, experience: true };
  // Versioning: a profile rolled back to its previous version only injects that version's skills.
  const model = plan.chosen?.id ?? '';
  const family = dna.task_family;
  let allowedSkills = st.fabric.skills;
  const ver = !forced && model ? activeVersion(versions, model, family) : null;
  const latest =
    !forced && model
      ? [...versions].filter((v) => v.model === model && v.family === family).sort((a, b) => b.n - a.n)[0]
      : undefined;
  if (ver && latest?.status === 'rolled_back') {
    const names = new Set(ver.skills.map((x) => x.split('@')[0]));
    allowedSkills = allowedSkills.filter((x) => names.has(x.name));
  }
  const capsule = use.capsule
    ? compileCapsule({
        log: log.filter((e) => e.fabric?.kind !== 'apprentice'),
        skills: allowedSkills,
        strategies: failureLibrary(log).strategies,
        dna,
        text: i.text,
        tools: i.tools,
        use: { skills: use.skills, experience: use.experience },
        budgetTokens: s.capsuleBudget,
      })
    : null;
  let profileVersion: string | undefined;
  if (!forced && model && capsule) {
    const sig = capsule.skills.slice().sort().join(',');
    const same = versions.find(
      (v) => v.model === model && v.family === family && v.skills.slice().sort().join(',') === sig,
    );
    if (same) profileVersion = same.id;
    else {
      const nv = newProfileVersion(versions, model, family, capsule.skills, s.capsuleBudget);
      st.setFabric({ profileVersions: [...versions, nv] });
      profileVersion = nv.id;
    }
  }
  const controller = forced ? null : new FallbackController(plan);
  return {
    plan,
    dna,
    capsule,
    classification,
    arm,
    forced,
    profileVersion,
    controller,
    ladder: forced ? [] : ladderFor(plan, i.v5Ladder),
    why: plan.why,
    v5Model: i.v5Model,
    path: model ? [model] : [],
    gateScores: [],
  };
}

/** The capsule as a prompt section (empty when no adaptation applies). */
export const capsuleText = (p: ApprenticePrep | null): string => p?.capsule?.text ?? '';

export interface GateOutcome {
  verdict: GateVerdict;
  /** What to do next: accept, correct on the same model, switch to another free model, or hand over to V5. */
  next: Attempt;
  switchTo: string | null;
  /** The V5 hand-over already happened: no further attempt, the answer stands. */
  final: boolean;
  message: string;
}
/** QUALITY GATE after an answer: ACCEPT, or CORRECT → the fallback controller picks the next attempt. */
export function applyGate(p: ApprenticePrep, score100: number | null, blocking = 0): GateOutcome {
  // A blocking failure (invalid format, wrong language, secret…) fails the gate whatever the weighted score says.
  const raw = score100 === null ? null : score100 / 100;
  const score = raw !== null && blocking > 0 ? Math.min(raw, p.dna.quality_threshold - 0.01) : raw;
  const verdict = qualityGate(score, p.dna.quality_threshold);
  if (score !== null) p.gateScores.push(score);
  if (!p.controller)
    return { verdict, next: p.plan.attempts[0]!, switchTo: null, final: true, message: `gate ${verdict}` };
  const prev = p.controller.current;
  const final = prev?.kind === 'v5';
  const next = p.controller.next(verdict, score);
  const switched =
    next.kind === 'free_other' && next.model && next.model !== prev?.model
      ? next.model
      : next.kind === 'v5' && verdict === 'CORRECT'
        ? p.v5Model
        : null;
  if (switched && !final) p.path.push(switched);
  return {
    verdict,
    next,
    switchTo: final ? null : switched,
    final,
    message: `QUALITY GATE ${score === null ? 'non jugé' : `${Math.round(score * 100)} % / seuil ${Math.round(p.dna.quality_threshold * 100)} %`} → ${verdict}${verdict === 'CORRECT' ? ` → ${next.label}` : ''}`,
  };
}

/** Teacher gate when the free route fails and V5 takes over: EXECUTE or SKIP (the answer is still delivered by V5). */
export function decideTeacher(p: ApprenticePrep, estCost: number): TeacherGate | null {
  const s = apprenticeSettings();
  if (!s.teacher) return null;
  const st = useStore.getState();
  const log = st.jevLog;
  const fam = p.dna.task_family;
  const choice = selectTeacher(fam, log, [{ id: p.v5Model, estCost }]);
  if (!choice) return null;
  const prof = buildApprenticeRegistry(log, freePool(st.models)).find((x) => x.model === p.plan.chosen?.id);
  const f = prof?.families.find((x) => x.family === fam);
  const tv = teacherValue(log).find((x) => x.teacher === choice.id);
  const gate = teacherGate({
    family: fam,
    teacher: choice,
    apprenticeSuccess: p.plan.predictedSuccess ?? 0.5,
    apprenticeQuality: f?.quality ?? null,
    apprenticeN: f?.n ?? 0,
    mode: jevSettings().mode as 'eco' | 'balanced' | 'performance' | 'max',
    valuePerPoint: s.valuePerPoint,
    risk: p.dna.risk === 'critical' ? 0.9 : p.dna.risk === 'high' ? 0.6 : 0.2,
    allowed: teacherAllowance(tv).allowed,
  });
  p.teacher = { id: choice.id, gate };
  return gate;
}

export interface RunFacts {
  /** Models actually used, in order. */
  models: string[];
  /** 0–100 quality measured after the fact (null = not measured). */
  quality: number | null;
  success: boolean | null;
  corrections: number;
  teacherCost: number;
  failureNote?: string;
}
/** The record stored on the JEV_LOG entry. Only measured values; null where nothing was measured. */
export function buildTag(p: ApprenticePrep, f: RunFacts): ApprenticeTag {
  const score = f.quality === null ? null : f.quality / 100;
  const escalated = f.models.length > 1 && !/:free$/.test(f.models.at(-1)!);
  const teacher = escalated && p.teacher?.gate.execute ? p.teacher.id : undefined;
  return {
    active: p.plan.use || p.forced,
    adapted: Boolean(p.capsule),
    family: p.dna.task_family,
    path: f.models.length ? f.models : p.path,
    threshold: p.dna.quality_threshold,
    gateScore: score,
    accepted: score !== null && score >= p.dna.quality_threshold && f.success !== false,
    adaptationMs: p.capsule?.adaptationMs ?? 0,
    tokensAdded: p.capsule?.tokensAdded ?? 0,
    skills: p.capsule?.skills.map((x) => x.split('@')[0]!) ?? [],
    experiences: p.capsule?.experiences ?? 0,
    toolsExposed: p.capsule?.toolsExposed ?? 0,
    contextReduction: p.capsule?.contextReduction ?? null,
    predictedSuccess: p.plan.predictedSuccess,
    confidence: p.plan.confidence,
    profileVersion: p.profileVersion,
    teacher,
    teacherCost: teacher ? f.teacherCost : undefined,
    fallbackFrom: f.models.length > 1 ? f.models[0] : undefined,
    rateLimited: Boolean(f.failureNote && /429|rate.?limit|quota|too many/i.test(f.failureNote)),
    classification: p.classification,
    arm: p.arm,
    why: p.why.slice(0, 4),
  };
}

let since = 0;
/** After a mission: benchmark profile versions (promote / ROLLBACK), distil teacher successes into skills. */
export function afterApprenticeRun(entry?: JevLogEntry): void {
  const st = useStore.getState();
  if (entry?.apprentice?.teacher && entry.success) {
    const r = distillSkills(st.jevLog, st.fabric.skills, entry.apprentice.teacher);
    if (r.candidates.length) addDistilled(r.candidates);
  }
  if (++since < 5) return;
  since = 0;
  refreshProfileVersions();
}
export function refreshProfileVersions(): { promoted: number; rolledBack: number } {
  const st = useStore.getState();
  const vs = st.fabric.profileVersions;
  let promoted = 0;
  let rolledBack = 0;
  const next: ProfileVersion[] = vs.map((v) => {
    if (v.status !== 'candidate') return v;
    const bm = benchmarkOf(st.jevLog, v);
    const cur = { ...v, benchmark: bm };
    const prev =
      [...vs]
        .filter((x) => x.model === v.model && x.family === v.family && x.n < v.n && x.status === 'production')
        .sort((a, b) => b.n - a.n)[0] ?? null;
    const d = decideVersion(prev, cur);
    if (d.action === 'promote') promoted++;
    if (d.action === 'rollback') rolledBack++;
    return applyDecision(cur, d);
  });
  if (promoted || rolledBack || next.some((v, i) => v.benchmark !== vs[i]!.benchmark))
    st.setFabric({ profileVersions: next });
  return { promoted, rolledBack };
}

export type { ApprenticeProfile };
export { familyOf };
