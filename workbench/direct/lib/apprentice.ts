// JEV APPRENTICE — runtime (free-first). "JEV-ADAPTED" = INFERENCE-TIME ADAPTATION: a compact capsule (Task DNA,
// validated skills, validated examples, failure rules, minimal tools, output contract) is compiled in milliseconds and
// injected in the prompt. NO model weights are modified. Everything here makes real decisions from the JEV_LOG; with the
// switch off, the V5 router decides exactly as before.
import { useStore } from './store';
import {
  DEFAULT_APPRENTICE,
  DEFAULT_WEIGHTS,
  DEFAULT_SUPREMACY,
  DEFAULT_VALIDATION,
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
  qualityGate,
  type Attempt,
  type FreePlan,
  type GateVerdict,
} from '../../server/jev/apprentice/router';
import { routeApprentice, type SupremacyPlan } from '../../server/jev/apprentice/ladder';
import { champions as championsOf, type Champion } from '../../server/jev/apprentice/supremacy';
import { CapsuleCache } from '../../server/jev/apprentice/cache';
import { compileCached, type Capsule } from '../../server/jev/apprentice/capsule';
import {
  correctionFor,
  correctionMessage,
  failureSignatureOf,
  learningOf,
  type FailureSignature,
} from '../../server/jev/apprentice/failure';
import { futureReuseValue, teacherROI, type TeacherROI } from '../../server/jev/apprentice/payback';
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
  skillFromFailure,
  type TeacherGate,
} from '../../server/jev/apprentice/teacher';
import { failureLibrary } from '../../server/jev/fabric/memory';
import { classifyData } from '../../server/jev/fabric/security';
import { analyzeTask } from '../../server/llm/routing';
import { getValidatedApprentice } from '../../server/jev/apprentice/supremacy';
import { freePool } from '../../server/jev/fabric/council';
import type { QaFailure } from '../../server/jev/qa';
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
    validation: {
      ...DEFAULT_VALIDATION,
      ...s.validation,
      high: { ...DEFAULT_VALIDATION.high, ...s.validation?.high },
      critical: { ...DEFAULT_VALIDATION.critical, ...s.validation?.critical },
    },
    supremacy: { ...DEFAULT_SUPREMACY, ...s.supremacy },
  };
};

/** Benchmark arm → what is injected (ablation): A none · B JEV capsule · C + skills · D + skills + experience · E none. */
const ARM_USE: Record<ApprenticeArm, { capsule: boolean; skills: boolean; experience: boolean }> = {
  free: { capsule: false, skills: false, experience: false },
  free_jev: { capsule: true, skills: false, experience: false },
  free_skill: { capsule: true, skills: true, experience: false },
  free_skill_exp: { capsule: true, skills: true, experience: true },
  validated: { capsule: true, skills: true, experience: true },
  paid: { capsule: false, skills: false, experience: false },
};

export interface ApprenticeRunOpts {
  /** Benchmark arm: the model is pinned by the runner; no automatic fallback (each arm is measured on its own). */
  arm?: ApprenticeArm;
}

export interface ApprenticePrep {
  plan: SupremacyPlan | FreePlan;
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
  teacher?: { id: string; gate: TeacherGate; roi: TeacherROI | null };
  /** Failures met during the run (signature + named correction), for failure learning. */
  failures: { signature: FailureSignature; model: string }[];
}

/** Shared capsule cache: family × model × profileVersion × skillHash × contextHash × toolHash. */
export const capsuleCache = new CapsuleCache<Capsule>();

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
  const rolledBack = new Set(versions.filter((v) => v.status === 'rolled_back').map(profileKey));
  const policyOf = (provider: string) => st.fabric.providerPolicies.find((p) => p.provider === provider);
  const profiles = buildApprenticeRegistry(log, pool);
  const forcedPlan: FreePlan = {
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
  };
  // LEVEL 0 is JEV-0 (handled before this function). L1 validated apprentice → L2 specialist → L3 adaptation → V5.
  const plan: SupremacyPlan | FreePlan = forced
    ? forcedPlan
    : routeApprentice({
        dna,
        settings: s,
        profiles,
        pool,
        classification,
        policyOf,
        hasImages: i.hasImages,
        avoid: i.avoid,
        text: i.text,
        log,
        rolledBack,
      });
  const base = {
    plan,
    dna,
    classification,
    forced,
    v5Model: i.v5Model,
    gateScores: [] as number[],
    failures: [] as ApprenticePrep['failures'],
  };
  if (!forced && !plan.use)
    return {
      ...base,
      capsule: null,
      controller: null,
      ladder: [],
      why: (plan as SupremacyPlan).explain ?? [plan.reason],
      path: [],
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
  // Skills learned from a Teacher after an apprentice failure are injected UNDER TEST (still candidates).
  const underTest = new Set(
    allowedSkills
      .filter(
        (x) =>
          x.activeVersion === null &&
          x.status === 'candidate' &&
          x.versions.some((v) => v.provenance.teacher && v.taskTypes.includes(dna.task_type)),
      )
      .map((x) => x.id),
  );
  const capsule = use.capsule
    ? compileCached(
        {
          log: log.filter((e) => e.fabric?.kind !== 'apprentice'),
          skills: allowedSkills,
          strategies: failureLibrary(log).strategies,
          dna,
          text: i.text,
          tools: i.tools,
          use: { skills: use.skills, experience: use.experience },
          budgetTokens: s.capsuleBudget,
          allowCandidate: underTest,
        },
        {
          cache: capsuleCache,
          model: model || 'pinned',
          profileVersion: latest?.id ?? 'v0',
          cacheable: !forced,
        },
      )
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
    ...base,
    capsule,
    arm,
    profileVersion,
    controller,
    ladder: forced
      ? []
      : (plan.attempts.map((a) => a.model).filter((m): m is string => Boolean(m)) as string[]),
    why: (plan as SupremacyPlan).explain ?? plan.why,
    path: model ? [model] : [],
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
  // The ladder never repeats an attempt: same model = targeted correction, another model = switch, v5 = hand-over.
  const switched =
    next.kind === 'v5'
      ? verdict === 'CORRECT'
        ? p.v5Model
        : null
      : next.model && next.model !== prev?.model && verdict === 'CORRECT'
        ? next.model
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
  // TEACHER AS AN INVESTMENT: immediate gain + future reuse value (from MEASURED family frequency × measured premium cost).
  const fut = futureReuseValue(log, fam, s.horizonDays);
  const roi = teacherROI({
    family: fam,
    immediateGain: gate.decision.expectedBenefit,
    teacherCost: estCost,
    futureReuseValue: fut.value,
  });
  const execute = gate.execute || (roi.teach && fut.value !== null && teacherAllowance(tv).allowed);
  const merged: TeacherGate = {
    ...gate,
    execute,
    reason: execute
      ? `EXECUTE TEACHER : ${gate.decision.use ? gate.decision.reason : roi.reason}`
      : `SKIP TEACHER : ${gate.decision.reason} — ${roi.reason}`,
  };
  p.teacher = { id: choice.id, gate: merged, roi };
  return merged;
}

/** Failure signature + named correction for a failed gate (also remembered for failure learning). */
export function recordFailure(
  p: ApprenticePrep,
  failures: QaFailure[],
  score: number,
  model: string,
): { signature: FailureSignature; message: string; correction: string } {
  const signature = failureSignatureOf(failures);
  p.failures.push({ signature, model });
  const c = correctionFor(signature);
  return {
    signature,
    correction: c.name,
    message: correctionMessage(
      signature,
      failures.map((f) => ({ what: f.what, fix: f.fix })),
      score,
      p.dna.quality_threshold,
    ),
  };
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
    level: (p.plan as SupremacyPlan).level,
    champion: (p.plan as SupremacyPlan).route === 'validated' && f.models.length <= 1,
    supremacy: (p.plan as SupremacyPlan).champion?.score ?? null,
    cache: p.capsule
      ? {
          hit: Boolean(p.capsule.cacheHit),
          retrievalMs: p.capsule.retrievalMs,
          compilationMs: p.capsule.compilationMs,
          contextBefore: p.capsule.contextBefore,
          contextAfter: p.capsule.contextAfter,
        }
      : undefined,
    failure: p.failures[0]
      ? learningOf({
          signature: p.failures[0].signature,
          path: f.models.length ? f.models : p.path,
          success: f.success,
          teacher: teacher ?? null,
        })
      : undefined,
    rateLimited: Boolean(f.failureNote && /429|rate.?limit|quota|too many/i.test(f.failureNote)),
    classification: p.classification,
    arm: p.arm,
    why: p.why.slice(0, 6),
  };
}

let since = 0;
/** After a mission: benchmark profile versions (promote / ROLLBACK), distil teacher successes into skills. */
export function afterApprenticeRun(entry?: JevLogEntry): void {
  const st = useStore.getState();
  if (entry?.apprentice?.teacher && entry.success) {
    const r = distillSkills(st.jevLog, st.fabric.skills, entry.apprentice.teacher);
    if (r.candidates.length) addDistilled(r.candidates);
    // FAILURE → PREMIUM SUCCESS → PATTERN → SKILL CANDIDATE: one observed pair already creates a candidate (tested before use).
    const f = skillFromFailure(st.jevLog, useStore.getState().fabric.skills, entry);
    if (f.candidates.length) addDistilled(f.candidates);
  }
  updateRoutingMemory();
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

/** MODEL ROUTING MEMORY: per task family, the current champion, its fallback and the premium reference (persistent). */
export function updateRoutingMemory(): void {
  const st = useStore.getState();
  const s = apprenticeSettings();
  const ch = championsOf(st.jevLog, freePool(st.models), {
    settings: s,
    versions: st.fabric.profileVersions,
  });
  const mem: Record<string, RoutingMemoryEntry> = { ...(st.fabric.routingMemory ?? {}) };
  for (const c of ch)
    mem[c.family] = {
      champion: c.model,
      status: c.status,
      fallback: c.fallback,
      premium: c.premium?.model ?? null,
      quality: c.quality,
      success: c.success,
      n: c.n,
      updatedAt: Date.now(),
    };
  if (
    JSON.stringify(Object.keys(mem).map((k) => [k, mem[k]!.champion, mem[k]!.status, mem[k]!.n])) !==
    JSON.stringify(
      Object.keys(st.fabric.routingMemory ?? {}).map((k) => [
        k,
        st.fabric.routingMemory![k]!.champion,
        st.fabric.routingMemory![k]!.status,
        st.fabric.routingMemory![k]!.n,
      ]),
    )
  )
    st.setFabric({ routingMemory: mem });
}
export interface RoutingMemoryEntry {
  champion: string;
  status: string;
  fallback: string | null;
  premium: string | null;
  quality: number | null;
  success: number | null;
  n: number;
  updatedAt: number;
}
export type { Champion };

/** The VALIDATED champion (if any) for the family of this task text — used by the benchmark's VALIDATED arm. */
export function championFor(text: string): { model: string; family: string } | null {
  const st = useStore.getState();
  const s = apprenticeSettings();
  const prof = analyzeTask({ text });
  const dna = taskDnaOf(
    {
      text,
      taskType: prof.type,
      difficulty: prof.difficulty,
      criticality: 'normal',
      tools: prof.type === 'chat' ? [] : ['tools'],
    },
    s,
  );
  const rb = new Set(st.fabric.profileVersions.filter((v) => v.status === 'rolled_back').map(profileKey));
  const r = getValidatedApprentice({
    dna,
    settings: s,
    log: st.jevLog,
    pool: freePool(st.models),
    rolledBack: rb,
  });
  return r.champion ? { model: r.champion.model, family: dna.task_family } : null;
}
