// JEV COGNITIVE SUPER BENCHMARK runner. REAL model calls through the real agent runtime; it only runs when the user starts it from
// the UI. The success of a run comes from the task's computed ground truth; costs and tokens come from the provider usage.
import { expId, runOne, snapshot, type RunControl, type TaskRun } from './fabricRun';
import { useStore } from './store';
import type { JevVariant, FabricRunOpts } from './agent';
import type { CfTask } from '../../server/jev/fabric/cfbench';
import { superBenchTasks, SB_ARMS, type SbArm, type SbTask } from '../../server/jev/cognitive/superbench';
import type { CognitiveRunOpts } from './cognitive';

const ARM_CFG: Record<SbArm, { variant: JevVariant; fabric: FabricRunOpts; cognitive: CognitiveRunOpts }> = {
  alone: { variant: 'off', fabric: { on: false }, cognitive: { enabled: false } },
  jev: { variant: 'full', fabric: { on: false }, cognitive: { enabled: false } },
  'jev+protocol': {
    variant: 'full',
    fabric: { on: false },
    cognitive: { enabled: true, engines: { diagnosis: 'active', protocols: 'active', conditioning: 'active', guards: 'active', tokens: 'shadow', capsule: 'shadow', bytecode: 'shadow', stop: 'shadow', disagreement: 'shadow', cache: 'shadow' } },
  },
  'jev+fabric': { variant: 'full', fabric: { on: true }, cognitive: { enabled: false } },
  full: {
    variant: 'full',
    fabric: { on: true },
    cognitive: { enabled: true, engines: { diagnosis: 'active', protocols: 'active', conditioning: 'active', guards: 'active', tokens: 'shadow', capsule: 'shadow', bytecode: 'shadow', stop: 'shadow', disagreement: 'shadow', cache: 'shadow' } },
  },
};
const asCf = (t: SbTask): CfTask =>
  ({ key: t.key, category: t.category as never, domain: t.category, text: t.text, expect: { test: (s: string) => t.check(s) } as unknown as RegExp });
const shuffle = <T>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};
/** Makes sure every run of the benchmark carries its arm, even when the Cognitive OS was off for that arm. */
function tagArm(session: string, arm: SbArm) {
  const st = useStore.getState();
  const log = st.jevLog;
  const idx = log.map((e) => e.session).lastIndexOf(session);
  if (idx < 0) return;
  const e = log[idx]!;
  const base = e.cognitive ?? { jcb: 'OFF', taskDNA: '', protocol: 'none', protocolStatus: 'none', behavior: 'none', budget: { maxInput: 0, maxOutput: 0, expected: 0 }, conditioningTokens: 0, guards: [], applied: [], version: 1 };
  const next = [...log];
  next[idx] = { ...e, cognitive: { ...base, arm } };
  st.setJevLog(next);
}
export interface SuperBenchOptions {
  /** Subset of the tasks (default: all 200). */
  tasks?: SbTask[];
  reps: number;
  model: string;
  arms?: SbArm[];
}
export async function runSuperBench(o: SuperBenchOptions, progress: (m: string) => void, ctl: RunControl): Promise<TaskRun[]> {
  const tasks = o.tasks ?? superBenchTasks();
  const arms = o.arms ?? SB_ARMS.map((a) => a.id);
  const experimentId = expId('SB');
  const baseline = snapshot();
  const out: TaskRun[] = [];
  for (let rep = 1; rep <= o.reps; rep++)
    for (const [ti, task] of tasks.entries()) {
      const groupId = `${experimentId}:${task.key}:${rep}`;
      for (const [order, arm] of shuffle(arms).entries()) {
        if (ctl.stop) return out;
        progress(`${task.key} — ${arm} (répétition ${rep}/${o.reps})…`);
        const r = await runOne({
          task: asCf(task),
          model: o.model,
          variant: ARM_CFG[arm].variant,
          fabric: ARM_CFG[arm].fabric,
          cognitive: { ...ARM_CFG[arm].cognitive, arm },
          tag: { kind: 'cfbench', arm, groupId, taskKey: task.key, category: task.category, models: [o.model] },
          experimentId,
          groupId,
          rep,
          order,
          taskIndex: ti,
          baseline,
          label: `sb ${arm}`,
        });
        tagArm(r.session, arm);
        out.push(r);
      }
    }
  return out;
}
