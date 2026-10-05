// JEV Cognitive Companion — browser runtime (control plane of the direct edition).
// jev.pre / route / context / execute / observe / qa / correct / escalate / learn /
// metrics / explain. JEV-0 is local and deterministic; JEV-1 (TypeSafe Jev) is
// called only through the ROI gate; JEV-2 (a cheap LLM arbitration) only on a
// real conflict. Any failure falls back to JEV-0: JEV never blocks the Workbench.
import { JevCache } from '../../server/jev/cache';
import { budgetsFor, marginalGain, type ExecutionMonitor } from '../../server/jev/control';
import { compileContext, estTokens, type ContextItem } from '../../server/jev/context';
import {
  directAnswer,
  explain as explainPre,
  jevPre,
  type PreInput,
  type PreResult,
} from '../../server/jev/packet';
import {
  DEFAULT_JEV_API,
  jevErrorText,
  JEV_DIRECT_URL,
  JEV_RELAY_URL,
  callJev1,
  callJev3,
  jev1Cost,
  maskSecret,
  redact,
  roiGate,
  type Jev1Answer,
  type JevApiConfig,
} from '../../server/jev/provider';
import { correctionPrompt, qualityCheck, shouldCorrect, type QaResult } from '../../server/jev/qa';
import { kpi, modelProfiles, type Checkpoint, type JevLogEntry } from '../../server/jev/metrics';
import type { JevMode } from '../../server/jev/tools';
import type { TaskType } from '../../server/llm/routing';
import { classificationConfidence } from '../../server/llm/routing';
import { useStore } from './store';

export interface JevSettings extends JevApiConfig {
  enabled: boolean;
  mode: JevMode;
  /** Allow JEV-2 (cheap LLM arbitration on conflicts). */
  jev2: boolean;
  /** Stop a run automatically when its token / time budget is exhausted (off by default; the cost budget of Settings always applies). */
  budgetStop: boolean;
}
export const DEFAULT_JEV: JevSettings = {
  ...DEFAULT_JEV_API,
  enabled: true,
  mode: 'balanced',
  jev2: true,
  budgetStop: false,
};

export const jevSettings = (): JevSettings => {
  const s = { ...DEFAULT_JEV, ...useStore.getState().settings.jev };
  // A browser can never reach TypeSafe directly (CORS): an old saved direct URL means the relay.
  return s.endpoint === JEV_DIRECT_URL ? { ...s, endpoint: JEV_RELAY_URL } : s;
};

// ── JEV API key: kept in this browser only, never in the HTML, the DOM or a log ──
const KEY = 'wbd.jev-key';
export function getJevKey(): string {
  try {
    return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}
export function setJevKey(k: string, remember: boolean): void {
  clearJevKey();
  if (k.trim()) (remember ? localStorage : sessionStorage).setItem(KEY, k.trim());
}
export function clearJevKey(): void {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}
export const jevKeyMasked = () => maskSecret(getJevKey());

export const cache = new JevCache();

export interface JevStatus {
  provider: 'JEV-0 local' | 'JEV-1 API' | 'hybride';
  apiOk: boolean | null;
  lastError: string | null;
  lastCallMs: number | null;
  calls: number;
  fallbacks: number;
}
const status: JevStatus = {
  provider: 'hybride',
  apiOk: null,
  lastError: null,
  lastCallMs: null,
  calls: 0,
  fallbacks: 0,
};
export const jevStatus = () => ({ ...status, provider: providerLabel() });
function providerLabel(): JevStatus['provider'] {
  const s = jevSettings();
  return s.provider === 'local' ? 'JEV-0 local' : s.provider === 'api' ? 'JEV-1 API' : 'hybride';
}

const today = () => new Date().toISOString().slice(0, 10);
function addJevSpend(usd: number) {
  const st = useStore.getState();
  st.setJevSpend({ ...st.jevSpend, [today()]: (st.jevSpend[today()] ?? 0) + usd });
}

/** JEV-1: TypeSafe typed judgments on the request (through the ROI gate). */
async function jev1(
  text: string,
  attachments: string[],
  previous: string | undefined,
  missionCost: number,
  mode: JevMode,
  trace: Checkpoint[],
): Promise<Jev1Answer | null> {
  const s = jevSettings();
  if (s.provider === 'local') return null;
  if (!getJevKey()) {
    trace.push({
      name: 'JEV_PRE',
      ms: 0,
      tokens: 0,
      cost: 0,
      decision: 'JEV-1 non appelé : aucune clé JEV enregistrée → JEV-0 seul',
    });
    return null;
  }
  const conf = classificationConfidence(text, attachments);
  const cost = jev1Cost(text);
  const gate = roiGate({
    jev0Confidence: s.provider === 'api' ? 0 : conf,
    missionCostEstimate: missionCost,
    callCost: cost,
    mode,
    spentToday: useStore.getState().jevSpend[today()] ?? 0,
    budgetDaily: s.budgetDaily,
  });
  if (!gate.call) {
    trace.push({ name: 'JEV_PRE', ms: 0, tokens: 0, cost: 0, decision: `ROI gate : ${gate.reason}` });
    return null;
  }
  const key = `${text.slice(0, 2000)}|${attachments.join(',')}`;
  const cached = cache.get<Jev1Answer>('jev1', key);
  if (cached) {
    trace.push({ name: 'JEV_PRE', ms: 0, tokens: 0, cost: 0, decision: 'JEV-1 depuis le cache' });
    return cached;
  }
  const t0 = performance.now();
  try {
    status.calls++;
    const r = await callJev1(
      s,
      getJevKey() || null,
      { request: text, attachments, previous },
      (url, init) => fetch(url, init) as never,
    );
    status.apiOk = true;
    status.lastError = null;
    status.lastCallMs = r.ms;
    addJevSpend(r.costUsd);
    trace.push({
      name: 'JEV_PRE',
      ms: performance.now() - t0,
      tokens: r.inputTokens,
      cost: r.costUsd,
      decision: `JEV-1 (${r.model}) : ${r.type} ${Math.round(r.typeConfidence * 100)} %, difficulté ${Math.round(r.difficulty * 100)} %, risque ${Math.round(r.risk * 100)} %`,
    });
    return cache.set('jev1', key, r);
  } catch (e) {
    status.apiOk = false;
    status.fallbacks++;
    status.lastError = jevErrorText(e, s.timeoutMs);
    trace.push({
      name: 'JEV_PRE',
      ms: performance.now() - t0,
      tokens: 0,
      cost: 0,
      decision: `JEV-1 indisponible (${status.lastError}) → JEV-0`,
    });
    return null;
  }
}

/** JEV-2: cheap LLM arbitration, only when JEV-0 and JEV-1 disagree with confidence, or the request is ambiguous and risky. */
async function jev2(
  text: string,
  a: TaskType,
  b: TaskType,
  models: PreInput['models'],
  trace: Checkpoint[],
): Promise<TaskType | null> {
  const cheap = models
    .filter(
      (m) =>
        m.capabilities.tools &&
        m.inputPrice !== null &&
        m.inputPrice > 0 &&
        !/:(free|batch)$|-contributor/.test(m.id),
    )
    .sort((x, y) => x.inputPrice! - y.inputPrice!)[0];
  if (!cheap) return null;
  const t0 = performance.now();
  try {
    const { complete } = await import('./llm');
    const r = await complete(
      {
        model: cheap.id,
        messages: [
          {
            role: 'user',
            content: `Classify this request as exactly one word among: ${a}, ${b}.\nRequest: ${text.slice(0, 3000)}\nAnswer with the single word.`,
          },
        ],
        maxTokens: 5,
      },
      { models, fallbacks: [], effort: 'auto', maxRetries: 0 },
    );
    useStore.getState().addSpend(r.cost);
    addJevSpend(r.cost);
    const w = r.content.trim().toLowerCase();
    const pick = w.includes(b) ? b : w.includes(a) ? a : null;
    trace.push({
      name: 'JEV_ROUTE',
      ms: performance.now() - t0,
      tokens: r.usage.promptTokens + r.usage.completionTokens,
      cost: r.cost,
      decision: `JEV-2 (${cheap.id}) arbitre ${a} / ${b} → ${pick ?? 'indécis'}`,
    });
    return pick;
  } catch {
    return null;
  }
}

export interface PreCall extends Omit<PreInput, 'jev1' | 'cache' | 'mode'> {
  previousUserText?: string;
}

/** jev.pre: JEV-0 (+ JEV-1 / JEV-2 when worth it) → Execution Packet. */
export async function pre(input: PreCall): Promise<{ pre: PreResult; trace: Checkpoint[]; jevCost: number }> {
  const s = jevSettings();
  const trace: Checkpoint[] = [];
  cache.setVersion(
    `${input.models.length}|${s.mode}|${useStore.getState().settings.engine ? JSON.stringify(useStore.getState().settings.engine) : ''}`,
  );
  const t0 = performance.now();
  // Rough mission cost (for the ROI gate): a first JEV-0 pass gives it for free.
  const first = jevPre({ ...input, mode: s.mode, cache, jev1: null });
  const est = first.decision.chosen?.estimate;
  const missionCost = est ? (est.low + est.high) / 2 : 0.01;
  const j1 = await jev1(input.text, input.attachments, input.previousUserText, missionCost, s.mode, trace);
  let result = j1 ? jevPre({ ...input, mode: s.mode, cache, jev1: j1 }) : first;
  if (
    j1 &&
    s.jev2 &&
    (s.mode === 'performance' || s.mode === 'max' || result.dna.criticality === 'critical')
  ) {
    const conf0 = classificationConfidence(input.text, input.attachments);
    if (j1.typeConfidence >= 0.7 && conf0 >= 0.7 && j1.type !== first.profile.type) {
      const pick = await jev2(input.text, first.profile.type, j1.type, input.models, trace);
      if (pick && pick !== result.profile.type)
        result = jevPre({ ...input, mode: s.mode, cache, jev1: { ...j1, type: pick, typeConfidence: 1 } });
      if (pick) result.packet.decided_by = 'JEV-2';
    } else
      trace.push({
        name: 'JEV_ROUTE',
        ms: 0,
        tokens: 0,
        cost: 0,
        decision: `JEV-2 non utilisé : ${j1.type === first.profile.type ? 'JEV-0 et JEV-1 sont d’accord' : 'désaccord sans confiance suffisante des deux côtés'}`,
      });
  } else
    trace.push({
      name: 'JEV_ROUTE',
      ms: 0,
      tokens: 0,
      cost: 0,
      decision: `JEV-2 non utilisé : ${!j1 ? 'pas de jugement JEV-1 à arbitrer' : !s.jev2 ? 'désactivé' : 'réservé aux modes PERFORMANCE / MAX et aux tâches critiques'}`,
    });
  trace.unshift({
    name: 'JEV_PRE',
    ms: performance.now() - t0,
    tokens: 0,
    cost: 0,
    decision: `${result.packet.decided_by} · ${result.packet.task_type} · ${result.packet.agent_strategy}`,
  });
  trace.push({
    name: 'JEV_ROUTE',
    ms: result.ms,
    tokens: 0,
    cost: 0,
    decision: `${result.packet.selected_model ?? 'défaut'} (L${result.packet.level})`,
  });
  trace.push({
    name: 'JEV_CONTEXT',
    ms: 0,
    tokens: result.files.tokensAfter + result.memory.tokensAfter,
    cost: 0,
    decision: `${result.files.kept.length} fichier(s), ${result.memory.kept.length} mémoire(s), ${result.files.dropped.length} écarté(s)`,
  });
  trace.push({
    name: 'JEV_TOOLS',
    ms: 0,
    tokens: 0,
    cost: 0,
    decision: `${result.toolPack.names.length}/${result.toolPack.baseline} outils · skills ${result.packet.skills_required.join(', ') || '—'}`,
  });
  const jevCost = trace.reduce((a, c) => a + c.cost, 0);
  return { pre: result, trace, jevCost };
}

/**
 * JEV-3 deep control: remote typed judgment on the live mission state.
 * Only for critical / multi-agent runs (the caller checks the level), only with
 * a key and a non-local provider, within the daily JEV budget. Never blocks.
 */
export async function liveJudge(
  goal: string,
  answer: string,
  state: import('../../server/jev/live').MissionState,
): Promise<{ done: number; onTrack: number; tokens: number; costUsd: number; ms: number } | null> {
  const s = jevSettings();
  if (s.provider === 'local' || !getJevKey()) return null;
  if ((useStore.getState().jevSpend[today()] ?? 0) >= s.budgetDaily) return null;
  try {
    status.calls++;
    const r = await callJev3(
      s,
      getJevKey(),
      {
        goal,
        latest_answer: answer,
        mission: {
          step: state.step,
          progress: state.progress,
          facts: state.facts,
          failures: state.failures.slice(-4),
        },
      },
      (url, init) => fetch(url, init) as never,
    );
    status.apiOk = true;
    addJevSpend(r.costUsd);
    return r;
  } catch (e) {
    status.apiOk = false;
    status.fallbacks++;
    status.lastError = jevErrorText(e, s.timeoutMs);
    return null;
  }
}

/** jev.context: compiles the conversation history (relevant turns only) under a token budget. */
export function context<T extends { role: string; content: unknown }>(
  goal: string,
  history: T[],
  budgetTokens: number,
): { history: T[]; before: number; after: number } {
  const text = (m: T) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''));
  const before = history.reduce((s, m) => s + estTokens(text(m)), 0);
  if (before <= budgetTokens || history.length < 8) return { history, before, after: before };
  // Keep turns as whole exchanges: user message + its assistant / tool follow-ups.
  const groups: T[][] = [];
  for (const m of history) {
    if (m.role === 'user' || !groups.length) groups.push([m]);
    else groups[groups.length - 1]!.push(m);
  }
  const items: ContextItem[] = groups.map((g, i) => ({
    id: String(i),
    kind: 'history',
    text: g.map(text).join('\n'),
    recency: groups.length > 1 ? i / (groups.length - 1) : 1,
    importance: 0.3,
    pinned: i >= groups.length - 2,
  }));
  const pack = compileContext(goal, items, budgetTokens);
  const keep = new Set(pack.kept.map((k) => Number(k.id)));
  const out = groups.filter((_, i) => keep.has(i)).flat();
  return { history: out, before, after: out.reduce((s, m) => s + estTokens(text(m)), 0) };
}

/** jev.qa + jev.correct: quality vector and the targeted correction (if it pays). */
export function qa(
  o: Parameters<typeof qualityCheck>[0] & {
    mode: JevMode;
    corrections: number;
    budgetLeft: number | null;
    estCost: number;
  },
): { result: QaResult; correct: string | null; why: string } {
  const result = qualityCheck(o);
  const d = shouldCorrect(result, {
    mode: o.mode,
    corrections: o.corrections,
    budgetLeft: o.budgetLeft,
    estCost: o.estCost,
  });
  return {
    result,
    correct: d.yes ? correctionPrompt(result.failures.filter((f) => f.blocking)) : null,
    why: d.why,
  };
}

/** jev.escalate: cascade step guarded by the marginal-quality-gain rule. */
export function escalateWorth(
  qaScore: number,
  target: number,
  currentCost: number,
  next: { estimate: { low: number; high: number } | null; pSuccess: number } | undefined,
) {
  if (!next) return { worth: false, reason: 'aucun palier supérieur' };
  const nextCost = next.estimate ? (next.estimate.low + next.estimate.high) / 2 : currentCost * 4;
  return marginalGain({ qa: qaScore, target, currentCost, nextCost, nextSuccess: next.pSuccess });
}

const FEEDBACK_GOOD =
  /^\s*(parfait|excellent|super|top|g[ée]nial|merci,? c['’]est (bon|parfait)|perfect|great|👍)\b/i;
const FEEDBACK_BAD =
  /^\s*(c['’]est (mauvais|faux|nul)|mauvais|faux|ce n['’]est pas (bon|[çc]a)|wrong|bad|👎)\b/i;
/** « parfait » / « c'est mauvais » at the start of a message = feedback on the previous answer. */
export const feedbackOf = (text: string): 'good' | 'bad' | null =>
  FEEDBACK_GOOD.test(text) ? 'good' : FEEDBACK_BAD.test(text) ? 'bad' : null;

/**
 * USER FEEDBACK LOOP: marks the last run of the session (JEV_LOG) and updates the
 * model leaderboard used by routing (success pattern / failure memory).
 */
export function feedback(sessionId: string, verdict: 'good' | 'bad'): boolean {
  const st = useStore.getState();
  const log = st.jevLog;
  const i = log.map((e) => e.session).lastIndexOf(sessionId);
  if (i < 0) return false;
  const e = log[i]!;
  if (e.feedback === verdict) return true;
  st.setJevLog(log.map((x, j) => (j === i ? { ...x, feedback: verdict, success: verdict === 'good' } : x)));
  if (e.model && e.model !== 'JEV-0') st.recordOutcome(e.model, verdict === 'good', e.task as TaskType);
  return true;
}

/** SUCCESS PATTERN LIBRARY + FAILURE MEMORY, learnt from real runs (JEV_LOG). */
export interface LearnedPattern {
  task: string;
  best: {
    model: string;
    runs: number;
    successRate: number;
    costPerSuccess: number;
    avgTokens: number;
  } | null;
  avoid: { model: string; failures: number }[];
}
export function patterns(log = useStore.getState().jevLog): LearnedPattern[] {
  const by = new Map<string, JevLogEntry[]>();
  for (const e of log) if (e.model && e.model !== 'JEV-0') by.set(e.task, [...(by.get(e.task) ?? []), e]);
  return [...by].map(([task, es]) => {
    const per = new Map<string, JevLogEntry[]>();
    for (const e of es) per.set(e.model, [...(per.get(e.model) ?? []), e]);
    const stats = [...per].map(([model, xs]) => {
      const ok = xs.filter((x) => x.success === true);
      const cost = xs.reduce((a, x) => a + x.cost + x.jevCost, 0);
      return {
        model,
        runs: xs.length,
        successRate: xs.filter((x) => x.success !== null).length
          ? ok.length / xs.filter((x) => x.success !== null).length
          : 0,
        costPerSuccess: ok.length ? cost / ok.length : Infinity,
        avgTokens: Math.round(xs.reduce((a, x) => a + x.tokensIn + x.tokensOut, 0) / xs.length),
        failures: xs.filter((x) => x.success === false).length,
      };
    });
    const best =
      stats
        .filter((x) => x.successRate >= 0.8 && x.runs >= 2)
        .sort((a, b) => a.costPerSuccess - b.costPerSuccess)[0] ?? null;
    return {
      task,
      best: best && {
        model: best.model,
        runs: best.runs,
        successRate: best.successRate,
        costPerSuccess: best.costPerSuccess,
        avgTokens: best.avgTokens,
      },
      avoid: stats
        .filter((x) => x.failures >= 2 && x.successRate < 0.5)
        .map((x) => ({ model: x.model, failures: x.failures })),
    };
  });
}

/** jev.learn: one JEV_LOG entry per run (redacted), feeds the model profiles. */
export function learn(e: JevLogEntry): void {
  const st = useStore.getState();
  st.addJevLog({ ...e, mission: redact(e.mission), reason: redact(e.reason) });
}

export function metrics() {
  const log = useStore.getState().jevLog;
  return {
    with: kpi(log.filter((e) => e.jev)),
    without: kpi(log.filter((e) => !e.jev)),
    profiles: modelProfiles(log),
    cacheHitRate: cache.hitRate(),
    cacheStats: cache.stats,
    status: jevStatus(),
    spentToday: useStore.getState().jevSpend[today()] ?? 0,
  };
}

export const explain = explainPre;
export { directAnswer, budgetsFor };
export type { ExecutionMonitor };

/** The jev.* API of the specification, in one object. */
export const jev = {
  pre,
  route: (r: PreResult) => r.decision,
  context,
  execute: (r: PreResult) => r.packet,
  observe: (m: ExecutionMonitor, ev: Parameters<ExecutionMonitor['step']>[0]) => m.step(ev),
  qa,
  correct: (r: QaResult) => correctionPrompt(r.failures.filter((f) => f.blocking)),
  escalate: escalateWorth,
  learn,
  metrics,
  explain,
};
