// JEV COGNITIVE OS — MICROKERNEL. Ten primitives (observe, classify, compress, select, condition, execute, verify, correct,
// stop, learn); every other capability is a MODULE plugged into one of them. The kernel plans and records — it never calls a
// model itself: `execute` and `verify` are supplied by the caller (the agent runtime), which keeps the kernel pure and testable.
import { cognitiveDiagnosis, type CognitiveDiagnosis } from './diagnosis';
import { compileCognitivePlan, type CognitivePlan } from './bytecode';
import { compileCognitiveCapsule, type CognitiveCapsule } from './capsule';
import {
  conditionModel,
  predictFailures,
  preemptiveGuards,
  type Conditioning,
  type FailureProfile,
} from './conditioning';
import { analyzeTokens, type Part, type TokenReport } from './tokens';
import { shouldStop, type StopDecision, type StopInput } from './stop';
import { localizeDisagreement } from './disagreement';
import {
  COGNITIVE_VERSION,
  DEFAULT_COGNITIVE,
  type CognitiveSettings,
  type CognitiveTag,
  type EngineId,
} from './types';

export interface Observation {
  text: string;
  attachments: string[];
  hasImages: boolean;
  mission: boolean;
  historyTokens: number;
  mode: 'eco' | 'balanced' | 'performance' | 'max';
  hasTools: boolean;
  /** Raw context to compress (history, notes). */
  rawContext: string;
  parts: Part[];
  language?: string;
  skills?: string[];
  memory?: string[];
  failureWarnings?: string[];
  model?: string;
  failureProfile?: FailureProfile;
  freeProven?: boolean;
  deterministic?: boolean;
}
export interface KernelRun {
  diagnosis: CognitiveDiagnosis;
  plan: CognitivePlan;
  tokens: TokenReport | null;
  capsule: CognitiveCapsule | null;
  conditioning: Conditioning;
  guards: ReturnType<typeof preemptiveGuards>;
  /** Trace of what each module did and how long it took. */
  trace: { module: string; ms: number; note: string }[];
}
export type KernelModule = (run: KernelRun, obs: Observation) => void;

export class CognitiveKernel {
  private modules: Record<string, KernelModule[]> = {};
  constructor(public settings: CognitiveSettings = DEFAULT_COGNITIVE) {}
  /** Registers an extension module on a primitive (« after:select », « after:condition »…). */
  use(hook: string, m: KernelModule) {
    (this.modules[hook] ??= []).push(m);
    return this;
  }
  private mode = (e: EngineId) => (this.settings.enabled ? this.settings.engines[e] : 'off');
  private time<T>(trace: KernelRun['trace'], module: string, f: () => T, note: (r: T) => string): T {
    const t0 = performance.now();
    const r = f();
    trace.push({ module, ms: Number((performance.now() - t0).toFixed(2)), note: note(r) });
    return r;
  }
  /** observe + classify + compress + select + condition, in one planning pass. */
  plan(o: Observation): KernelRun {
    const trace: KernelRun['trace'] = [];
    const diagnosis = this.time(
      trace,
      'classify',
      () =>
        cognitiveDiagnosis({
          text: o.text,
          attachments: o.attachments,
          hasImages: o.hasImages,
          mission: o.mission,
          historyTokens: o.historyTokens,
          mode: o.mode,
          hasTools: o.hasTools,
        }),
      (d) => `${d.taskDNA} difficulté ${d.difficulty}`,
    );
    const tokens =
      this.mode('tokens') === 'off'
        ? null
        : this.time(
            trace,
            'observe:tokens',
            () => analyzeTokens(o.text, o.parts),
            (t) => `${t.total} tokens, ${t.waste} de gaspillage`,
          );
    const plan = this.time(
      trace,
      'select',
      () =>
        compileCognitivePlan(diagnosis, {
          text: o.text,
          contextTokens: tokens?.total ?? o.historyTokens,
          language: o.language,
          skills: o.skills,
          economy: this.settings.economy,
          freeProven: o.freeProven,
          deterministic: o.deterministic,
        }),
      (p) => p.jcb,
    );
    const capsule =
      this.mode('capsule') === 'off' || plan.contextMethod !== 'capsule'
        ? null
        : this.time(
            trace,
            'compress',
            () =>
              compileCognitiveCapsule({
                goal: o.text,
                raw: o.rawContext,
                memory: o.memory,
                skills: o.skills,
                failureWarnings: o.failureWarnings,
                outputContract: plan.contract.line,
                budgetTokens: plan.budget.maxInput,
              }),
            (c) => `${c.rawTokens} → ${c.capsuleTokens} tokens${c.recovered ? ' (éléments récupérés)' : ''}`,
          );
    const guards =
      this.mode('guards') === 'off'
        ? []
        : preemptiveGuards(
            predictFailures(diagnosis, { text: o.text }),
            o.model ?? '',
            o.failureProfile ?? {},
          );
    const conditioning = this.time(
      trace,
      'condition',
      () =>
        conditionModel({
          behavior: plan.behavior,
          protocol:
            this.mode('protocols') === 'off' ? { ...plan.protocol, text: '', tokens: 0 } : plan.protocol,
          contract: plan.contract,
          guards,
          skills: o.skills,
          memory: o.memory,
          budget: plan.budget,
          maxTokens: this.settings.conditioningMaxTokens,
        }),
      (c) => `${c.tokens} tokens ajoutés (${c.sections.map((s) => s.key).join(', ') || 'rien'})`,
    );
    const run: KernelRun = { diagnosis, plan, tokens, capsule, conditioning, guards, trace };
    for (const m of this.modules['after:condition'] ?? []) m(run, o);
    return run;
  }
  stop(i: StopInput): StopDecision {
    return shouldStop(i);
  }
  /** correct(): a targeted correction prompt from two answers that disagree (never a full restart). */
  correct(a: string, b: string) {
    const r = localizeDisagreement(a, b);
    return { report: r, prompt: r.verifyPrompt };
  }
  /** learn(): the record kept with the mission (additive JEV_LOG field). */
  tag(
    run: KernelRun,
    extra: { applied: EngineId[]; stop?: { decision: string; reason: string }; strategySwitches?: number },
  ): CognitiveTag {
    return {
      jcb: run.plan.jcb,
      taskDNA: run.diagnosis.taskDNA,
      protocol: run.plan.protocol.id,
      protocolStatus: run.plan.protocol.status,
      behavior: run.plan.behavior.mode,
      budget: {
        maxInput: run.plan.budget.maxInput,
        maxOutput: run.plan.budget.maxOutput,
        expected: run.plan.budget.expectedTokens,
      },
      conditioningTokens: run.conditioning.tokens,
      guards: run.guards.map((g) => g.mode),
      capsule: run.capsule
        ? {
            raw: run.capsule.rawTokens,
            after: run.capsule.capsuleTokens,
            lost: run.capsule.lost.length,
            recovered: run.capsule.recovered,
          }
        : undefined,
      tokenReport: run.tokens
        ? { total: run.tokens.total, waste: run.tokens.waste, usefulRatio: run.tokens.usefulTokenRatio }
        : undefined,
      applied: extra.applied,
      stop: extra.stop,
      strategySwitches: extra.strategySwitches,
      version: COGNITIVE_VERSION,
    };
  }
}
