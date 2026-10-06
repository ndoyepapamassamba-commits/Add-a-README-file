// JEV COGNITIVE FABRIC — experiment runners. Every function here makes REAL calls through the real
// agent runtime and runs ONLY when the user starts it from the UI. Results are read back from the
// JEV_LOG (provider usage); success and the correctness dimension come from the task's ground truth.
import { runAgent, type FabricRunOpts, type JevVariant } from './agent';
import { useStore } from './store';
import { writeText } from './vfs';
import { qualityScore } from '../../server/jev/qa';
import type { QualityVector } from '../../server/jev/qa';
import type { CfTask } from '../../server/jev/fabric/cfbench';
import type { FabricSkill, SkillVersion } from '../../server/jev/fabric/skills';
import type { FabricTag } from '../../server/jev/fabric/types';
import { championFor, type ApprenticeRunOpts } from './apprentice';
import type { ApprenticeArm } from '../../server/jev/apprentice/types';
import {
  runChampionChallengerExperiment,
  type ExperimentResult,
} from '../../server/jev/apprentice/experiment';
import { strataOfDna } from '../../server/jev/apprentice/strata';
import { taskDnaOf } from '../../server/jev/apprentice/dna';
import { classifyData } from '../../server/jev/fabric/security';
import { analyzeTask } from '../../server/llm/routing';
import { apprenticeSettings } from './apprentice';

export interface RunControl {
  stop: boolean;
}
type Progress = (msg: string) => void;

const shuffle = <T>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

export interface TaskRun {
  key: string;
  ok: boolean;
  session: string;
  groupId: string;
  arm: string;
}

/** Same starting workspace for every run: remove what earlier runs created, rewrite the task's files. */
function resetWorkspace(t: CfTask, baseline: Set<string>): void {
  const st = useStore.getState();
  for (const p of Object.keys(st.files)) if (!baseline.has(p) && !p.startsWith('.ai/')) st.deleteFile(p);
  for (const p of t.outputs ?? []) if (useStore.getState().files[p]) useStore.getState().deleteFile(p);
  for (const [p, c] of Object.entries(t.files ?? {})) writeText(p, c);
}

export interface OneRun {
  /** JEV Apprentice benchmark arm (ablation of the free-first adaptation). */
  apprentice?: ApprenticeRunOpts;
  task: CfTask;
  model: string;
  variant: JevVariant;
  fabric: FabricRunOpts;
  tag: FabricTag;
  experimentId: string;
  groupId: string;
  rep: number;
  order: number;
  taskIndex: number;
  baseline: Set<string>;
  label: string;
}

/** One pinned-model run of a task; patches the log with the ground truth. */
export async function runOne(o: OneRun): Promise<TaskRun> {
  resetWorkspace(o.task, o.baseline);
  const st = useStore.getState();
  const s = st.newSession(false);
  st.patchSession(s.id, { title: `[fabric ${o.label}] ${o.task.key}`, mode: 'auto', model: o.model });
  await runAgent(s.id, o.task.text, [], {
    mode: 'chat',
    jev: o.variant,
    bench: o.task.key,
    rep: o.rep,
    fabric: { ...o.fabric, tag: o.tag, capture: true },
    apprentice: o.apprentice,
    experiment: {
      experimentId: o.experimentId,
      groupId: o.groupId,
      taskId: `TASK_${String(o.taskIndex + 1).padStart(3, '0')}:${o.task.key}`,
      category: o.task.category,
      protocol: 'fixed-model',
      rep: o.rep,
      order: o.order,
    },
  });
  const sess = useStore.getState().sessions.find((x) => x.id === s.id);
  const answer = [...(sess?.items ?? [])].reverse().find((i) => i.kind === 'assistant' && i.text.trim());
  const ok = Boolean(answer && answer.kind === 'assistant' && o.task.expect.test(answer.text));
  const log = useStore.getState().jevLog;
  const idx = log.map((e) => e.session).lastIndexOf(s.id);
  if (idx >= 0) {
    const e = log[idx]!;
    const vec = e.qualityVector as unknown as QualityVector | undefined;
    const withTruth = vec ? { ...vec, correctness: ok ? 1 : 0 } : null;
    const q = withTruth ? qualityScore(withTruth) : ok ? (e.qualityMeasured ?? null) : 0;
    const next = [...log];
    next[idx] = {
      ...e,
      success: ok,
      bench: o.task.key,
      qualityVector: withTruth ?? e.qualityVector,
      qualityMeasured: q,
      qualitySource: 'local-qa+ground-truth',
      apprentice: e.apprentice
        ? {
            ...e.apprentice,
            gateScore: q === null ? null : q / 100,
            accepted: ok && q !== null && q / 100 >= e.apprentice.threshold,
          }
        : undefined,
    };
    useStore.getState().setJevLog(next);
  }
  return { key: o.task.key, ok, session: s.id, groupId: o.groupId, arm: o.tag.arm ?? '' };
}

export const snapshot = () => new Set(Object.keys(useStore.getState().files));
export const expId = (p: string) => `${p}-${Date.now().toString(36)}`;

// ───────────────────────── cognitive fabric benchmark: baseline / v5 / fabric ─────────────────────────

export interface CfOptions {
  tasks: CfTask[];
  reps: number;
  /** The same model for the three arms (isolates the effect of the Fabric). */
  model: string;
}
const ARM_RUN: Record<'baseline' | 'v5' | 'fabric', { variant: JevVariant; fabric: FabricRunOpts }> = {
  baseline: { variant: 'off', fabric: { arm: 'baseline', on: false } },
  v5: { variant: 'full', fabric: { arm: 'v5', on: false } },
  fabric: { variant: 'full', fabric: { arm: 'fabric', on: true } },
};
export async function runCfBench(o: CfOptions, progress: Progress, ctl: RunControl): Promise<TaskRun[]> {
  const experimentId = expId('CF');
  const baseline = snapshot();
  const out: TaskRun[] = [];
  for (let rep = 1; rep <= o.reps; rep++)
    for (const [ti, task] of o.tasks.entries()) {
      const groupId = `${experimentId}:${task.key}:${rep}`;
      for (const [order, arm] of shuffle(['baseline', 'v5', 'fabric'] as const).entries()) {
        if (ctl.stop) return out;
        progress(`${task.key} — ${arm} (répétition ${rep}/${o.reps})…`);
        out.push(
          await runOne({
            task,
            model: o.model,
            variant: ARM_RUN[arm].variant,
            fabric: ARM_RUN[arm].fabric,
            tag: {
              kind: 'cfbench',
              arm,
              groupId,
              taskKey: task.key,
              category: task.category,
              models: [o.model],
            },
            experimentId,
            groupId,
            rep,
            order,
            taskIndex: ti,
            baseline,
            label: `cf ${arm}`,
          }),
        );
      }
    }
  return out;
}

// ───────────────────────── tournament / free model benchmark ─────────────────────────

export interface TournamentOptions {
  tasks: CfTask[];
  models: string[];
  reps: number;
  kind: 'tournament' | 'freebench';
}
/** Same task, same context, same criteria for every model; JEV and the Fabric are OFF so that only the model varies. */
export async function runTournament(
  o: TournamentOptions,
  progress: Progress,
  ctl: RunControl,
): Promise<TaskRun[]> {
  const experimentId = expId(o.kind === 'freebench' ? 'FREE' : 'TOUR');
  const baseline = snapshot();
  const out: TaskRun[] = [];
  for (let rep = 1; rep <= o.reps; rep++)
    for (const [ti, task] of o.tasks.entries()) {
      const groupId = `${experimentId}:${task.key}:${rep}`;
      for (const [order, model] of shuffle(o.models).entries()) {
        if (ctl.stop) return out;
        progress(`${task.key} — ${model} (répétition ${rep}/${o.reps})…`);
        out.push(
          await runOne({
            task,
            model,
            variant: 'off',
            fabric: { on: false },
            tag: {
              kind: o.kind,
              arm: model,
              groupId,
              taskKey: task.key,
              category: task.category,
              models: o.models,
            },
            experimentId,
            groupId,
            rep,
            order,
            taskIndex: ti,
            baseline,
            label: o.kind === 'freebench' ? 'free' : 'tournoi',
          }),
        );
      }
    }
  return out;
}

// ───────────────────────── skill test lab: WITH vs WITHOUT ─────────────────────────

export interface SkillTestOptions {
  skill: FabricSkill;
  version: SkillVersion;
  tasks: CfTask[];
  reps: number;
  model: string;
}
/** The tested skill is injected in the WITH arm only; JEV level and model are identical in both arms. */
export async function runSkillTest(
  o: SkillTestOptions,
  progress: Progress,
  ctl: RunControl,
): Promise<TaskRun[]> {
  const experimentId = expId('SKILL');
  const baseline = snapshot();
  const out: TaskRun[] = [];
  for (let rep = 1; rep <= o.reps; rep++)
    for (const [ti, task] of o.tasks.entries()) {
      const groupId = `${experimentId}:${task.key}:${rep}`;
      for (const [order, arm] of shuffle(['with_skill', 'without_skill'] as const).entries()) {
        if (ctl.stop) return out;
        progress(
          `${task.key} — ${arm === 'with_skill' ? 'AVEC' : 'SANS'} skill (répétition ${rep}/${o.reps})…`,
        );
        out.push(
          await runOne({
            task,
            model: o.model,
            variant: 'pre',
            fabric: { on: false, ...(arm === 'with_skill' ? { skills: [o.version] } : {}) },
            tag: {
              kind: 'skilltest',
              arm,
              groupId,
              taskKey: task.key,
              category: task.category,
              skillId: o.skill.id,
              skillVersion: o.version.version,
            },
            experimentId,
            groupId,
            rep,
            order,
            taskIndex: ti,
            baseline,
            label: `skill ${arm === 'with_skill' ? 'avec' : 'sans'}`,
          }),
        );
      }
    }
  return out;
}

// ───────────────────────── JEV apprentice demo: free / free+JEV / +skill / +experience / premium ─────────────────────────

export interface ApprenticeDemoOptions {
  tasks: CfTask[];
  reps: number;
  freeModel: string;
  paidModel: string;
}
const DEMO_ARMS: { arm: ApprenticeArm; variant: JevVariant }[] = [
  { arm: 'free', variant: 'off' },
  { arm: 'free_jev', variant: 'full' },
  { arm: 'free_skill', variant: 'full' },
  { arm: 'free_skill_exp', variant: 'full' },
  { arm: 'validated', variant: 'full' },
  { arm: 'paid', variant: 'off' },
];
/** Same task, same workspace, shuffled order: free model alone, +JEV capsule, +skills, +experience, premium reference. */
export async function runApprenticeDemo(
  o: ApprenticeDemoOptions,
  progress: Progress,
  ctl: RunControl,
): Promise<TaskRun[]> {
  const experimentId = expId('APPR');
  const baseline = snapshot();
  const out: TaskRun[] = [];
  for (let rep = 1; rep <= o.reps; rep++)
    for (const [ti, task] of o.tasks.entries()) {
      const groupId = `${experimentId}:${task.key}:${rep}`;
      // The VALIDATED arm exists only when a validated champion exists for the task's family (never invented).
      const champ = championFor(task.text);
      const arms = [
        ...DEMO_ARMS.filter((x) => x.arm !== 'validated'),
        ...(champ ? [{ arm: 'validated' as ApprenticeArm, variant: 'full' as JevVariant }] : []),
      ];
      for (const [order, a] of shuffle(arms).entries()) {
        if (ctl.stop) return out;
        const model = a.arm === 'paid' ? o.paidModel : a.arm === 'validated' ? champ!.model : o.freeModel;
        progress(`${task.key} — ${a.arm} · ${model} (répétition ${rep}/${o.reps})…`);
        out.push(
          await runOne({
            task,
            model,
            variant: a.variant,
            fabric: { on: false },
            apprentice: { arm: a.arm },
            tag: {
              kind: 'apprentice',
              arm: a.arm,
              groupId,
              taskKey: task.key,
              category: task.category,
              models: [o.freeModel, o.paidModel],
            },
            experimentId,
            groupId,
            rep,
            order,
            taskIndex: ti,
            baseline,
            label: `apprenti ${a.arm}`,
          }),
        );
      }
    }
  return out;
}

// ───────────────────────── Champion ↔ Challenger controlled experiment ─────────────────────────

export interface ChampionExperimentOptions {
  tasks: CfTask[];
  champion: string;
  challenger: string;
}
/**
 * runChampionChallengerExperiment on REAL calls: the same tasks, the same workspace, champion arm vs challenger arm, paired
 * by group. Tasks whose Task DNA strata differ are NON-COMPARABLE and nothing is run. A challenger that may not receive the
 * data (security) is never called. The result never promotes by itself: the lab decides, with sample gates.
 */
export async function runChampionExperiment(
  o: ChampionExperimentOptions,
  progress: Progress,
  ctl: RunControl,
): Promise<ExperimentResult> {
  const st = useStore.getState();
  const s = apprenticeSettings();
  const experimentId = expId('CHAMP');
  const baseline = snapshot();
  const dnaOf = (text: string) => {
    const p = analyzeTask({ text });
    return taskDnaOf(
      {
        text,
        taskType: p.type,
        difficulty: p.difficulty,
        criticality: 'normal',
        tools: p.type === 'chat' ? [] : ['tools'],
      },
      s,
    );
  };
  const strataOfTask = (t: CfTask) => strataOfDna(dnaOf(t.text), [], t.text);
  const risk = strataOfTask(o.tasks[0] ?? ({ text: '' } as CfTask)).risk;
  const sensitive = o.tasks.some((t) => classifyData(t.text, []).level !== 'PUBLIC');
  const scope = st.fabric.discovered?.[o.challenger]?.securityScope ?? 'PUBLIC_ONLY';
  const securityOk = !sensitive || scope !== 'PUBLIC_ONLY';
  const byId = new Map(o.tasks.map((t, i) => [`${i}`, t]));
  return runChampionChallengerExperiment({
    champion: o.champion,
    challenger: o.challenger,
    risk,
    securityOk,
    settings: s,
    groupPrefix: experimentId,
    tasks: o.tasks.map((t, i) => ({ id: `${i}`, text: t.text, category: t.category, key: t.key })),
    strataOfTask: (t) => strataOfTask(byId.get(t.id)!),
    runArm: async (model, task, arm, groupId) => {
      if (ctl.stop) return null;
      const cf = byId.get(task.id)!;
      progress(`${cf.key} — ${arm} · ${model}…`);
      const r = await runOne({
        task: cf,
        model,
        variant: 'full',
        fabric: { on: false },
        apprentice: { arm },
        tag: {
          kind: 'apprentice',
          arm,
          groupId,
          taskKey: cf.key,
          category: cf.category,
          models: [o.champion, o.challenger],
        },
        experimentId,
        groupId,
        rep: 1,
        order: arm === 'validated' ? 0 : 1,
        taskIndex: Number(task.id),
        baseline,
        label: `champion/challenger ${arm}`,
      });
      const log = useStore.getState().jevLog;
      const e = log.find((x) => x.session === r.session);
      if (e?.apprentice) {
        const next = log.map((x) =>
          x.id === e.id
            ? {
                ...x,
                apprentice: {
                  ...x.apprentice!,
                  experiment: {
                    role: arm === 'challenger' ? ('challenger' as const) : ('champion' as const),
                    champion: o.champion,
                    challenger: o.challenger,
                  },
                },
              }
            : x,
        );
        useStore.getState().setJevLog(next);
        return next.find((x) => x.id === e.id) ?? null;
      }
      return e ?? null;
    },
  });
}
