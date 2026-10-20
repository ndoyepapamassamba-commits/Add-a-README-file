// runChampionChallengerExperiment: a controlled experiment on a MATCHED task set. The champion and the challenger run the
// SAME tasks (paired by groupId); the pairs are then analysed by the non-inferiority engine. Execution is injected, so the
// engine stays pure: the runtime passes a runner that really calls the models, the tests pass deterministic ones.
import type { JevLogEntry } from '../metrics';
import { DEFAULT_APPRENTICE, type ApprenticeSettings, type Risk } from './types';
import { armStats } from './stats';
import { matchedTaskSet, type Strata } from './strata';
import {
  evaluateNonInferiority,
  experimentPairs,
  shouldPromoteChallenger,
  type Evaluation,
  type PromotionDecision,
} from './lab';

export interface ExperimentTask {
  id: string;
  text: string;
  category?: string;
}
export interface ExperimentInput<T extends ExperimentTask = ExperimentTask> {
  champion: string;
  challenger: string;
  tasks: T[];
  risk: Risk;
  strataOfTask: (t: T) => Strata;
  /** Runs one task on one model in one arm and returns the logged (measured) entry, or null when it did not run. */
  runArm: (
    model: string,
    task: T,
    arm: 'validated' | 'challenger',
    groupId: string,
  ) => Promise<JevLogEntry | null>;
  settings?: ApprenticeSettings;
  /** Security gate: a challenger that may not receive this data is never run. */
  securityOk?: boolean;
  groupPrefix?: string;
}
export interface ExperimentResult {
  status: 'NON_COMPARABLE' | 'BLOCKED' | 'COMPLETED';
  reasons: string[];
  evaluation: Evaluation | null;
  decision: PromotionDecision | null;
  entries: JevLogEntry[];
}

export async function runChampionChallengerExperiment<T extends ExperimentTask>(
  i: ExperimentInput<T>,
): Promise<ExperimentResult> {
  const lab = (i.settings ?? DEFAULT_APPRENTICE).lab;
  const matched = matchedTaskSet(i.tasks, i.strataOfTask);
  if (matched.status === 'NON_COMPARABLE')
    return {
      status: 'NON_COMPARABLE',
      reasons: matched.reasons,
      evaluation: null,
      decision: null,
      entries: [],
    };
  if (i.securityOk === false)
    return {
      status: 'BLOCKED',
      reasons: ['politique de sécurité : ce challenger ne peut pas recevoir ces données'],
      evaluation: null,
      decision: null,
      entries: [],
    };
  const prefix = i.groupPrefix ?? `exp-${i.champion}-${i.challenger}`;
  const entries: JevLogEntry[] = [];
  for (const [k, task] of matched.tasks.entries()) {
    const g = `${prefix}-${k}-${task.id}`;
    const a = await i.runArm(i.champion, task, 'validated', g);
    const b = await i.runArm(i.challenger, task, 'challenger', g);
    if (a) entries.push(a);
    if (b) entries.push(b);
  }
  const pairs = experimentPairs(entries, i.champion, i.challenger);
  const ca = pairs.map((p) => p.a);
  const cb = pairs.map((p) => p.b);
  const evaluation = evaluateNonInferiority(ca, cb, { risk: i.risk, lab, pairs });
  const decision = shouldPromoteChallenger({
    risk: i.risk,
    lab,
    evaluation,
    challenger: {
      stats: armStats(cb, { conf: lab.confidence }),
      degraded: false,
      securityOk: true,
      capabilitiesOk: true,
    },
    champion: { stats: armStats(ca, { conf: lab.confidence }), degraded: false },
  });
  return { status: 'COMPLETED', reasons: [], evaluation, decision, entries };
}
