// CHAMPION / CHALLENGER LAB. For every task family (× risk × output contract) the lab keeps a CHAMPION, its CHALLENGERS and
// the measured PREMIUM REFERENCE, compares them on MATCHED tasks with real confidence intervals, and decides: PROMOTE,
// KEEP CHAMPION, REJECT CHALLENGER, COLLECT MORE DATA or ROLLBACK. A challenger never replaces a champion because of a
// score, a date, a price or a vendor claim, and one mission is never enough: promotion needs sample gates, a statistical
// verdict and a cooldown. Non-inferior means "within the configured margin", never "equivalent".
import type { JevLogEntry } from '../metrics';
import { qualityOfEntry } from '../fabric/memory';
import type { FreeModel } from '../fabric/council';
import { freeOutcome, isFreeId } from './registry';
import {
  familyRecord,
  isApprenticeEvidence,
  isCriticalError,
  premiumReference,
  validateRecord,
  type FamilyRecord,
  type PremiumRef,
  type Validation,
} from './supremacy';
import {
  armStats,
  cohenD,
  confidenceOf,
  effectLabel,
  gatesFor,
  mean,
  newcombeDiff,
  pairedDiff,
  welchDiff,
  wilson,
  type ArmStats,
  type ConfidenceLabel,
  type Interval,
} from './stats';
import { matchStrata, strataOf } from './strata';
import {
  DEFAULT_APPRENTICE,
  type ApprenticeSettings,
  type LabSettings,
  type Risk,
  type ValidationRules,
} from './types';

export type Decision = 'PROMOTE' | 'KEEP_CHAMPION' | 'REJECT_CHALLENGER' | 'COLLECT_MORE_DATA' | 'ROLLBACK';
export type Verdict = 'SUPERIOR' | 'NON_INFERIOR' | 'INFERIOR' | 'INCONCLUSIVE' | 'NON_COMPARABLE';
export const SIMULATED_FLAG = 'SIMULATED TEST ONLY';
/** Real data only: synthetic / demo records are never admitted into production statistics. */
export const isReal = (e: JevLogEntry): boolean =>
  e.reason !== SIMULATED_FLAG && !String(e.id).startsWith('demo') && !String(e.id).startsWith('sim');

// ───────────────────────── evidence ─────────────────────────

export interface Evaluation {
  verdict: Verdict;
  reason: string;
  evidence: 'CONTROLLED' | 'OBSERVATIONAL' | 'NONE';
  nChampion: number;
  nChallenger: number;
  pairs: number;
  deltaQuality: Interval | null;
  deltaSuccess: Interval | null;
  deltaCost: number | null;
  deltaLatency: number | null;
  effectSize: number | null;
  effectLabel: string;
  margin: number;
  successMargin: number;
  confidence: ConfidenceLabel;
  /** Human wording that never claims equivalence. */
  phrase: string;
}

const num = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x);
const totalOf = (e: JevLogEntry) => e.acct?.totalCost ?? e.cost + e.jevCost;

/** Pairs of the controlled experiments: same group, champion arm vs challenger arm. */
export function experimentPairs(
  log: JevLogEntry[],
  champion: string,
  challenger: string,
): { a: JevLogEntry; b: JevLogEntry }[] {
  const by = new Map<string, { a?: JevLogEntry; b?: JevLogEntry }>();
  for (const e of log) {
    if (e.fabric?.kind !== 'apprentice' || !e.apprentice?.arm) continue;
    const g = by.get(e.fabric.groupId) ?? {};
    if (e.apprentice.arm === 'validated' && e.model === champion) g.a = e;
    if (e.apprentice.arm === 'challenger' && e.model === challenger) g.b = e;
    by.set(e.fabric.groupId, g);
  }
  return [...by.values()].filter((g): g is { a: JevLogEntry; b: JevLogEntry } => Boolean(g.a && g.b));
}

/**
 * evaluateNonInferiority(champion, challenger): SUPERIOR / NON_INFERIOR / INFERIOR / INCONCLUSIVE (or NON_COMPARABLE).
 * Differences are challenger − champion. Controlled pairs are analysed as pairs, observational data only inside common strata.
 */
export function evaluateNonInferiority(
  champion: JevLogEntry[],
  challenger: JevLogEntry[],
  o: { risk?: Risk; lab?: LabSettings; pairs?: { a: JevLogEntry; b: JevLogEntry }[] } = {},
): Evaluation {
  const lab = o.lab ?? DEFAULT_APPRENTICE.lab;
  const risk = o.risk ?? 'normal';
  const minN = lab.minN[risk];
  const gates = gatesFor(risk);
  const base = {
    margin: lab.margin,
    successMargin: lab.successMargin,
    deltaQuality: null,
    deltaSuccess: null,
    deltaCost: null,
    deltaLatency: null,
    effectSize: null,
    effectLabel: 'N/A' as string,
  };
  const mk = (
    verdict: Verdict,
    reason: string,
    phrase: string,
    extra: Partial<Evaluation> = {},
  ): Evaluation => ({
    verdict,
    reason,
    evidence: 'NONE',
    nChampion: champion.length,
    nChallenger: challenger.length,
    pairs: 0,
    confidence: 'INSUFFICIENT_SAMPLE',
    phrase,
    ...base,
    ...extra,
  });
  const controlled = (o.pairs?.length ?? 0) > 0;
  let A: JevLogEntry[];
  let B: JevLogEntry[];
  if (controlled) {
    A = o.pairs!.map((p) => p.a);
    B = o.pairs!.map((p) => p.b);
  } else {
    const m = matchStrata(champion, challenger);
    if (m.status === 'NON_COMPARABLE')
      return mk(
        'NON_COMPARABLE',
        `NON_COMPARABLE : ${m.reasons.join(' ; ')}`,
        'NON-COMPARABLE — aucune conclusion de supériorité n’est produite.',
      );
    A = m.a;
    B = m.b;
  }
  const n = Math.min(A.length, B.length);
  const evidence: Evaluation['evidence'] = controlled ? 'CONTROLLED' : 'OBSERVATIONAL';
  const adjA = A.map(freeOutcome);
  const adjB = B.map(freeOutcome);
  const qa = adjA.map(qualityOfEntry);
  const qb = adjB.map(qualityOfEntry);
  const sa = adjA.map((e) => (e.success === null ? null : e.success ? 1 : 0));
  const sb = adjB.map((e) => (e.success === null ? null : e.success ? 1 : 0));
  let dq: Interval | null;
  let ds: Interval | null;
  if (controlled) {
    dq = pairedDiff(
      qa.flatMap((x, i) => (num(x) && num(qb[i]) ? [{ a: x, b: qb[i] as number }] : [])),
      lab.confidence,
    );
    ds = pairedDiff(
      sa.flatMap((x, i) => (num(x) && num(sb[i]) ? [{ a: x, b: sb[i] as number }] : [])),
      lab.confidence,
    );
  } else {
    dq = welchDiff(qa.filter(num), qb.filter(num), lab.confidence);
    const ka = sa.filter((x) => x === 1).length;
    const kb = sb.filter((x) => x === 1).length;
    ds = newcombeDiff(
      ka,
      sa.filter((x) => x !== null).length,
      kb,
      sb.filter((x) => x !== null).length,
      lab.confidence,
    );
  }
  const effect = cohenD(qa.filter(num), qb.filter(num));
  const dCost =
    mean(B.map(totalOf)) !== null && mean(A.map(totalOf)) !== null
      ? mean(B.map(totalOf))! - mean(A.map(totalOf))!
      : null;
  const dLat =
    mean(B.map((e) => e.latencyMs)) !== null && mean(A.map((e) => e.latencyMs)) !== null
      ? mean(B.map((e) => e.latencyMs))! - mean(A.map((e) => e.latencyMs))!
      : null;
  const ex: Partial<Evaluation> = {
    evidence,
    pairs: n,
    deltaQuality: dq,
    deltaSuccess: ds,
    deltaCost: dCost,
    deltaLatency: dLat,
    effectSize: effect,
    effectLabel: effectLabel(effect),
    confidence: confidenceOf(n, gates),
    nChampion: champion.length,
    nChallenger: challenger.length,
  };
  if (n < minN || !dq || !ds)
    return mk(
      'INCONCLUSIVE',
      `INSUFFICIENT_SAMPLE : ${n} paire(s) < ${minN} requises pour une tâche ${risk}`,
      `INCONCLUSIVE — échantillon insuffisant (${n} < ${minN}) : aucune conclusion.`,
      { ...ex, confidence: 'INSUFFICIENT_SAMPLE' },
    );
  const q = dq;
  const s = ds;
  let verdict: Verdict = 'INCONCLUSIVE';
  if (q.hi < -lab.margin || s.hi < -lab.successMargin) verdict = 'INFERIOR';
  else if (q.lo > 0 && s.lo > -lab.successMargin) verdict = 'SUPERIOR';
  else if (q.lo > -lab.margin && s.lo > -lab.successMargin) verdict = 'NON_INFERIOR';
  const pct = (lab.confidence * 100).toFixed(0);
  const phrase =
    verdict === 'SUPERIOR'
      ? `SUPÉRIEUR — borne basse de l’IC ${pct} % de Δqualité = ${q.lo.toFixed(1)} > 0 (n = ${n}).`
      : verdict === 'NON_INFERIOR'
        ? `NON-INFÉRIEUR selon la marge configurée (−${lab.margin} pt de qualité, −${(lab.successMargin * 100).toFixed(0)} pt de réussite) : IC ${pct} % de Δqualité [${q.lo.toFixed(1)} ; ${q.hi.toFixed(1)}]. Ce n’est pas une preuve d’équivalence.`
        : verdict === 'INFERIOR'
          ? `INFÉRIEUR — IC ${pct} % de Δqualité [${q.lo.toFixed(1)} ; ${q.hi.toFixed(1)}] sous la marge.`
          : `INCONCLUSIVE — IC ${pct} % de Δqualité [${q.lo.toFixed(1)} ; ${q.hi.toFixed(1)}] chevauche la marge.`;
  return mk(verdict, phrase, phrase, ex);
}

// ───────────────────────── promotion decision ─────────────────────────

export interface PromoteCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  /** Hard: a failure rejects the challenger; soft: it only keeps the champion. */
  hard: boolean;
}
export interface PromotionDecision {
  action: Decision;
  reasons: string[];
  checks: PromoteCheck[];
}
export interface PromoteInput {
  risk: Risk;
  lab?: LabSettings;
  evaluation: Evaluation;
  challenger: { stats: ArmStats; degraded: boolean; securityOk: boolean; capabilitiesOk: boolean };
  champion: { stats: ArmStats | null; degraded: boolean } | null;
  /** New missions since the last champion change of this family. */
  sinceChange?: number;
}
/** shouldPromoteChallenger: explainable PROMOTE / KEEP CHAMPION / REJECT CHALLENGER / COLLECT MORE DATA. */
export function shouldPromoteChallenger(i: PromoteInput): PromotionDecision {
  const lab = i.lab ?? DEFAULT_APPRENTICE.lab;
  const ev = i.evaluation;
  const cs = i.challenger.stats;
  const ch = i.champion?.stats ?? null;
  const strict = i.risk === 'high' || i.risk === 'critical';
  const checks: PromoteCheck[] = [
    {
      key: 'sample',
      label: 'échantillon suffisant',
      ok: ev.pairs >= lab.minN[i.risk],
      detail: `${ev.pairs} paires / ${lab.minN[i.risk]}`,
      hard: false,
    },
    {
      key: 'comparable',
      label: 'comparaison exploitable',
      ok: ev.verdict !== 'NON_COMPARABLE' && ev.verdict !== 'INCONCLUSIVE',
      detail: ev.verdict,
      hard: false,
    },
    {
      key: 'critical',
      label: strict ? 'zéro erreur critique' : 'erreurs critiques',
      ok: !strict || (cs.criticalErrorRate ?? 0) === 0,
      detail: `${((cs.criticalErrorRate ?? 0) * 100).toFixed(1)} %`,
      hard: strict,
    },
    {
      key: 'reliability',
      label: 'fiabilité suffisante',
      ok: (cs.fallbackRate ?? 0) <= (ch?.fallbackRate ?? 0) + 0.1,
      detail: `repli ${((cs.fallbackRate ?? 0) * 100).toFixed(0)} %`,
      hard: false,
    },
    {
      key: 'security',
      label: 'sécurité compatible',
      ok: i.challenger.securityOk,
      detail: i.challenger.securityOk ? 'compatible' : 'politique incompatible',
      hard: true,
    },
    {
      key: 'capabilities',
      label: 'capacités suffisantes',
      ok: i.challenger.capabilitiesOk,
      detail: i.challenger.capabilitiesOk ? 'suffisantes' : 'insuffisantes',
      hard: true,
    },
    {
      key: 'cost',
      label: 'coût raisonnable',
      ok:
        ch?.totalMissionCost == null ||
        cs.totalMissionCost == null ||
        cs.totalMissionCost <= Math.max(ch.totalMissionCost * lab.costTolerance, 1e-6),
      detail: `${cs.totalMissionCost?.toFixed(5) ?? 'N/A'} $ vs ${ch?.totalMissionCost?.toFixed(5) ?? 'N/A'} $`,
      hard: false,
    },
    {
      key: 'latency',
      label: 'latence acceptable',
      ok:
        ch?.latencyMean == null ||
        cs.latencyMean == null ||
        cs.latencyMean <= ch.latencyMean * lab.latencyTolerance,
      detail: `${cs.latencyMean?.toFixed(0) ?? 'N/A'} ms vs ${ch?.latencyMean?.toFixed(0) ?? 'N/A'} ms`,
      hard: false,
    },
    {
      key: 'degradation',
      label: 'aucune dégradation récente',
      ok: !i.challenger.degraded,
      detail: i.challenger.degraded ? 'dégradé' : 'stable',
      hard: true,
    },
    {
      key: 'cooldown',
      label: 'délai entre deux changements',
      ok: (i.sinceChange ?? Infinity) >= lab.cooldown,
      detail: `${i.sinceChange ?? '∞'} mission(s) / ${lab.cooldown}`,
      hard: false,
    },
  ];
  const failedHard = checks.filter((c) => c.hard && !c.ok);
  if (ev.verdict === 'NON_COMPARABLE' || ev.verdict === 'INCONCLUSIVE' || ev.pairs < lab.minN[i.risk])
    return { action: 'COLLECT_MORE_DATA', reasons: [ev.reason], checks };
  if (ev.verdict === 'INFERIOR') return { action: 'REJECT_CHALLENGER', reasons: [ev.phrase], checks };
  if (failedHard.length)
    return {
      action: 'REJECT_CHALLENGER',
      reasons: failedHard.map((c) => `${c.label} : ${c.detail}`),
      checks,
    };
  if (!checks.find((c) => c.key === 'cooldown')!.ok)
    return {
      action: 'COLLECT_MORE_DATA',
      reasons: [
        `délai : ${checks.find((c) => c.key === 'cooldown')!.detail} — une seule mission ne change jamais un champion`,
      ],
      checks,
    };
  const soft = checks.filter((c) => !c.hard && !c.ok && c.key !== 'sample' && c.key !== 'comparable');
  if (ev.verdict === 'SUPERIOR' && !soft.length) return { action: 'PROMOTE', reasons: [ev.phrase], checks };
  if (ev.verdict === 'NON_INFERIOR' && !soft.length) {
    const cheaper =
      ch?.totalMissionCost != null &&
      cs.totalMissionCost != null &&
      cs.totalMissionCost <= ch.totalMissionCost * 0.9;
    const faster =
      ch?.latencyMean != null && cs.latencyMean != null && cs.latencyMean <= ch.latencyMean * 0.9;
    if (!i.champion || i.champion.degraded || cheaper || faster)
      return {
        action: 'PROMOTE',
        reasons: [
          ev.phrase,
          ...(cheaper ? ['coût total inférieur d’au moins 10 %'] : []),
          ...(faster ? ['latence inférieure d’au moins 10 %'] : []),
        ],
        checks,
      };
    return {
      action: 'KEEP_CHAMPION',
      reasons: [ev.phrase, 'non-inférieur sans avantage de coût ni de latence : le champion est conservé'],
      checks,
    };
  }
  return {
    action: 'KEEP_CHAMPION',
    reasons: soft.length ? soft.map((c) => `${c.label} : ${c.detail}`) : [ev.phrase],
    checks,
  };
}

// ───────────────────────── degradation ─────────────────────────

export interface Degradation {
  degraded: boolean;
  signals: string[];
  recent: {
    n: number;
    quality: number | null;
    success: number | null;
    latency: number | null;
    errorRate: number | null;
    fallbackRate: number | null;
  };
  historical: {
    n: number;
    quality: number | null;
    success: number | null;
    latency: number | null;
    errorRate: number | null;
    fallbackRate: number | null;
  };
}
const RL = /429|rate.?limit|quota|too many|surcharg/i;
/** Rolling-window degradation: the recent window is compared with the history BEFORE it (no waiting for 20 failures). */
export function detectChampionDegradation(
  runsRaw: JevLogEntry[],
  lab: LabSettings = DEFAULT_APPRENTICE.lab,
): Degradation {
  const runs = [...runsRaw].sort((a, b) => a.at - b.at);
  const w = Math.min(lab.window, Math.floor(runs.length / 2));
  const empty = { n: 0, quality: null, success: null, latency: null, errorRate: null, fallbackRate: null };
  if (w < 3 || runs.length - w < 5) return { degraded: false, signals: [], recent: empty, historical: empty };
  const recent = runs.slice(-w);
  const hist = runs.slice(0, -w);
  const sum = (xs: JevLogEntry[]) => {
    const adj = xs.map(freeOutcome);
    const j = adj.filter((e) => e.success !== null);
    return {
      n: xs.length,
      quality: mean(adj.map(qualityOfEntry).filter(num)),
      success: j.length ? j.filter((e) => e.success).length / j.length : null,
      latency: mean(xs.map((e) => e.latencyMs)),
      errorRate: xs.filter((e) => e.failureNote).length / xs.length,
      fallbackRate: xs.filter((e) => (e.apprentice?.path.length ?? 1) > 1).length / xs.length,
    };
  };
  const r = sum(recent);
  const h = sum(hist);
  const signals: string[] = [];
  if (r.quality !== null && h.quality !== null && h.quality - r.quality >= lab.degradeDrop)
    signals.push(
      `qualité glissante ${r.quality.toFixed(1)} vs historique ${h.quality.toFixed(1)} (−${(h.quality - r.quality).toFixed(1)} pts)`,
    );
  if (r.success !== null && h.success !== null && h.success - r.success >= 0.2)
    signals.push(`réussite glissante ${(r.success * 100).toFixed(0)} % vs ${(h.success * 100).toFixed(0)} %`);
  if (r.errorRate !== null && h.errorRate !== null && r.errorRate >= 0.3 && r.errorRate - h.errorRate >= 0.2)
    signals.push(`taux d’erreur ${(r.errorRate * 100).toFixed(0)} %`);
  if (r.latency !== null && h.latency !== null && h.latency > 0 && r.latency >= h.latency * 2)
    signals.push(`latence ×${(r.latency / h.latency).toFixed(1)}`);
  if (r.fallbackRate !== null && h.fallbackRate !== null && r.fallbackRate - h.fallbackRate >= 0.3)
    signals.push(`repli ${(r.fallbackRate * 100).toFixed(0)} %`);
  const rl = recent.filter((e) => e.failureNote && RL.test(e.failureNote)).length / recent.length;
  if (rl >= 0.3) signals.push(`limites de débit ${(rl * 100).toFixed(0)} %`);
  return { degraded: signals.length > 0, signals, recent: r, historical: h };
}

// ───────────────────────── lab state ─────────────────────────

export interface ChampionSlot {
  model: string;
  since: number;
  /** Runs of the key at the moment it became champion (the cooldown counts from here). */
  sinceN: number;
  degraded: boolean;
}
export interface LabEvent {
  at: number;
  kind:
    | 'CROWNED'
    | 'PROMOTED'
    | 'ROLLBACK'
    | 'DEGRADED'
    | 'RESTORED'
    | 'CHALLENGER'
    | 'REJECTED'
    | 'COLLECT_MORE_DATA'
    | 'KEPT'
    | 'EXPERIMENT'
    | 'FAILURE_PATTERN'
    | 'TEACHER'
    | 'DISCOVERED';
  key: string;
  family: string;
  risk: Risk;
  model: string;
  from?: string | null;
  to?: string | null;
  reason: string;
  /** REAL for production data; SIMULATED only inside the demonstration (never persisted). */
  source: 'REAL' | 'SIMULATED';
  verdict?: Verdict;
}
export interface ExperimentRecord {
  at: number;
  champion: string;
  challenger: string;
  premium: string | null;
  verdict: Verdict;
  pairs: number;
  deltaQuality: number | null;
  evidence: Evaluation['evidence'];
  decision: Decision;
  source: 'REAL' | 'SIMULATED';
}
export interface LabFamily {
  key: string;
  family: string;
  risk: Risk;
  contract: string | null;
  champion: ChampionSlot | null;
  previousChampion: ChampionSlot | null;
  rolledBack: string[];
  challengers: string[];
  premiumReference: PremiumRef | null;
  experiments: ExperimentRecord[];
  statisticalEvidence: { champion: string; challenger: string; evaluation: Evaluation } | null;
  currentDecision: {
    action: Decision | 'CROWN' | 'NONE';
    model: string | null;
    reason: string;
    at: number;
  } | null;
}
export interface LabState {
  version: 1;
  families: Record<string, LabFamily>;
  championHistory: LabEvent[];
  challengerHistory: LabEvent[];
  promotionHistory: LabEvent[];
  rollbackHistory: LabEvent[];
  benchmarkHistory: LabEvent[];
  failureHistory: LabEvent[];
  teacherHistory: LabEvent[];
  updatedAt: number;
}
export const EMPTY_LAB: LabState = {
  version: 1,
  families: {},
  championHistory: [],
  challengerHistory: [],
  promotionHistory: [],
  rollbackHistory: [],
  benchmarkHistory: [],
  failureHistory: [],
  teacherHistory: [],
  updatedAt: 0,
};
export const labKey = (family: string, risk: Risk, contract?: string | null): string =>
  `${family}|${risk}${contract ? `|${contract}` : ''}`;
const CAP = 500;
const push = (a: LabEvent[], e: LabEvent) => [...a, e].slice(-CAP);

export interface LabInput {
  log: JevLogEntry[];
  pool: FreeModel[];
  settings?: ApprenticeSettings;
  now?: number;
  source?: 'REAL' | 'SIMULATED';
  /** Models whose stage is a security / capability rejection (never challengers). */
  excluded?: Set<string>;
}
export interface LabStep {
  name: 'STATISTICAL_EVALUATION' | 'CHAMPION_DECISION' | 'MEMORY_UPDATE';
  ms: number;
  decision: string;
}

const scopeRuns = (runs: JevLogEntry[], family: string, risk: Risk, contract: string | null) =>
  runs.filter((e) => {
    const s = strataOf(e);
    return s.family === family && s.risk === risk && (contract === null || s.contract === contract);
  });

/** One deterministic pass of the lab over the REAL log. Idempotent: the same log yields no new event. */
export function runLab(
  prev: LabState,
  i: LabInput,
): { state: LabState; events: LabEvent[]; steps: LabStep[] } {
  const t0 = Date.now();
  const s = i.settings ?? DEFAULT_APPRENTICE;
  const lab = s.lab;
  const rules: ValidationRules = s.validation;
  const now = i.now ?? Date.now();
  const source = i.source ?? 'REAL';
  const real = source === 'REAL';
  const evidence = i.log.filter(
    (e) => (real ? isReal(e) : true) && e.model && isFreeId(e.model) && isApprenticeEvidence(e),
  );
  let state: LabState = { ...prev, families: { ...prev.families } };
  const events: LabEvent[] = [];
  const log = (
    e: Omit<LabEvent, 'at' | 'source'>,
    target: keyof Pick<
      LabState,
      | 'championHistory'
      | 'challengerHistory'
      | 'promotionHistory'
      | 'rollbackHistory'
      | 'benchmarkHistory'
      | 'failureHistory'
      | 'teacherHistory'
    >,
  ) => {
    const ev: LabEvent = { ...e, at: now, source };
    // A challenger that is already registered (or already rejected for the same reason) is not re-announced.
    if (target === 'challengerHistory') {
      const prevEv = [...state.challengerHistory]
        .reverse()
        .find(
          (x) => x.key === e.key && x.model === e.model && (x.kind === 'CHALLENGER' || x.kind === 'REJECTED'),
        );
      if (prevEv && prevEv.kind === e.kind && (e.kind === 'CHALLENGER' || prevEv.reason === e.reason)) return;
    }
    events.push(ev);
    state = { ...state, [target]: push(state[target], ev) };
  };
  // Keys: (family, risk) of every run, plus (family, risk, contract) when a contract has enough runs by itself.
  const keys = new Map<string, { family: string; risk: Risk; contract: string | null }>();
  for (const e of evidence) {
    const st = strataOf(e);
    keys.set(labKey(st.family, st.risk), { family: st.family, risk: st.risk, contract: null });
  }
  for (const [k, v] of [...keys]) {
    const byContract = new Map<string, number>();
    for (const e of scopeRuns(evidence, v.family, v.risk, null))
      byContract.set(strataOf(e).contract, (byContract.get(strataOf(e).contract) ?? 0) + 1);
    for (const [c, n] of byContract)
      if (n >= rules.minMissions && byContract.size > 1)
        keys.set(labKey(v.family, v.risk, c), { ...v, contract: c });
    void k;
  }
  for (const [key, k] of keys) {
    const runs = scopeRuns(evidence, k.family, k.risk, k.contract);
    const byModel = new Map<string, JevLogEntry[]>();
    for (const e of runs) byModel.set(e.model, [...(byModel.get(e.model) ?? []), e]);
    const totalN = runs.length;
    const prevSlot: LabFamily = state.families[key] ?? {
      key,
      family: k.family,
      risk: k.risk,
      contract: k.contract,
      champion: null,
      previousChampion: null,
      rolledBack: [],
      challengers: [],
      premiumReference: null,
      experiments: [],
      statisticalEvidence: null,
      currentDecision: null,
    };
    let slot: LabFamily = { ...prevSlot };
    const rec = (m: string): FamilyRecord => familyRecord(byModel.get(m) ?? [], m, k.family, rules, now);
    const val = (m: string): Validation => validateRecord(rec(m), k.risk, rules);
    const degOf = (m: string) => detectChampionDegradation(byModel.get(m) ?? [], lab);
    const finish = (decision: LabFamily['currentDecision']) => {
      slot = { ...slot, currentDecision: decision };
    };
    const crownMin =
      k.risk === 'high' || k.risk === 'critical'
        ? Math.max(rules.minMissions, lab.minN[k.risk])
        : rules.minMissions;

    // A. champion health: rolling-window degradation → ROLLBACK to the previous champion (immediate, no cooldown).
    if (slot.champion) {
      const d = degOf(slot.champion.model);
      if (d.degraded && !slot.champion.degraded) {
        const prevC = slot.previousChampion;
        const prevOk =
          prevC &&
          byModel.has(prevC.model) &&
          !degOf(prevC.model).degraded &&
          val(prevC.model).status !== 'DEGRADED';
        if (prevOk) {
          log(
            {
              kind: 'ROLLBACK',
              key,
              family: k.family,
              risk: k.risk,
              model: slot.champion.model,
              from: slot.champion.model,
              to: prevC!.model,
              reason: `rollback : ${d.signals.join(' ; ')} → champion précédent ${prevC!.model} restauré`,
            },
            'rollbackHistory',
          );
          state = {
            ...state,
            championHistory: push(state.championHistory, { ...events.at(-1)!, kind: 'ROLLBACK' }),
          };
          slot = {
            ...slot,
            rolledBack: [...new Set([...slot.rolledBack, slot.champion.model])],
            champion: { model: prevC!.model, since: now, sinceN: totalN, degraded: false },
            previousChampion: null,
          };
          finish({
            action: 'ROLLBACK',
            model: prevC!.model,
            reason: `rollback vers ${prevC!.model} (${d.signals[0]})`,
            at: now,
          });
        } else {
          log(
            {
              kind: 'DEGRADED',
              key,
              family: k.family,
              risk: k.risk,
              model: slot.champion.model,
              reason: `champion dégradé : ${d.signals.join(' ; ')}`,
            },
            'championHistory',
          );
          slot = { ...slot, champion: { ...slot.champion, degraded: true } };
          finish({
            action: 'COLLECT_MORE_DATA',
            model: slot.champion!.model,
            reason: `champion dégradé, aucun précédent exploitable : ${d.signals[0]}`,
            at: now,
          });
        }
      } else if (!d.degraded && slot.champion.degraded) {
        log(
          {
            kind: 'RESTORED',
            key,
            family: k.family,
            risk: k.risk,
            model: slot.champion.model,
            reason: 'performances glissantes rétablies : statut CHAMPION restauré',
          },
          'championHistory',
        );
        slot = { ...slot, champion: { ...slot.champion, degraded: false } };
        finish({
          action: 'KEEP_CHAMPION',
          model: slot.champion!.model,
          reason: 'champion rétabli après amélioration mesurée',
          at: now,
        });
      }
    }

    // B. no champion: crown the best VALIDATED model (validation thresholds + sample gate; never on one mission).
    if (!slot.champion) {
      const valid = [...byModel.keys()]
        .filter(
          (m) =>
            !slot.rolledBack.includes(m) &&
            val(m).status === 'VALIDATED' &&
            rec(m).n >= crownMin &&
            !degOf(m).degraded &&
            !i.excluded?.has(m),
        )
        .sort((a, b) => (rec(b).weightedQuality ?? 0) - (rec(a).weightedQuality ?? 0));
      const best = valid[0];
      if (best) {
        log(
          {
            kind: 'CROWNED',
            key,
            family: k.family,
            risk: k.risk,
            model: best,
            to: best,
            reason: `validé (${rec(best).n} missions, qualité ${rec(best).quality?.toFixed(1)}, réussite ${((rec(best).success ?? 0) * 100).toFixed(0)} %) → CHAMPION`,
          },
          'championHistory',
        );
        slot = { ...slot, champion: { model: best, since: now, sinceN: totalN, degraded: false } };
        finish({
          action: 'CROWN',
          model: best,
          reason: 'premier champion : critères de validation remplis',
          at: now,
        });
      } else
        finish({
          action: 'NONE',
          model: null,
          reason: [...byModel.keys()].length ? 'aucun modèle validé : pas de champion' : 'aucune donnée',
          at: now,
        });
    }

    // C. challengers: every other model with measured adapted runs is evaluated against the champion.
    const champion = slot.champion?.model ?? null;
    const challengers = [...byModel.keys()].filter((m) => m !== champion && !i.excluded?.has(m));
    for (const m of challengers)
      if (!slot.challengers.includes(m))
        log(
          {
            kind: 'CHALLENGER',
            key,
            family: k.family,
            risk: k.risk,
            model: m,
            reason: 'candidat à la succession (jamais champion directement)',
          },
          'challengerHistory',
        );
    slot = { ...slot, challengers };
    if (champion) {
      const cRuns = byModel.get(champion) ?? [];
      const degraded = slot.champion!.degraded;
      // A degraded champion is compared through its history BEFORE the recent window (what it used to be).
      const baseline = degraded
        ? [...cRuns]
            .sort((a, b) => a.at - b.at)
            .slice(0, Math.max(0, cRuns.length - Math.min(lab.window, Math.floor(cRuns.length / 2))))
        : cRuns;
      let bestPromote: { m: string; ev: Evaluation; dec: PromotionDecision; dq: number } | null = null;
      for (const m of challengers) {
        // Only the most recent controlled pairs count: a challenger that improved is judged on its recent behaviour.
        const pairs = experimentPairs(
          i.log.filter((e) => (real ? isReal(e) : true)),
          champion,
          m,
        )
          .sort((x, y) => x.b.at - y.b.at)
          .slice(-lab.pairWindow);
        const ev = evaluateNonInferiority(baseline, byModel.get(m) ?? [], { risk: k.risk, lab, pairs });
        const dec = shouldPromoteChallenger({
          risk: k.risk,
          lab,
          evaluation: ev,
          challenger: {
            stats: armStats(byModel.get(m) ?? [], { conf: lab.confidence }),
            degraded: degOf(m).degraded,
            securityOk: !i.excluded?.has(m),
            capabilitiesOk: true,
          },
          champion: { stats: armStats(baseline, { conf: lab.confidence }), degraded },
          sinceChange: totalN - slot.champion!.sinceN,
        });
        slot = {
          ...slot,
          statisticalEvidence:
            slot.statisticalEvidence &&
            slot.statisticalEvidence.challenger !== m &&
            slot.statisticalEvidence.evaluation.pairs >= ev.pairs
              ? slot.statisticalEvidence
              : { champion, challenger: m, evaluation: ev },
        };
        const sig = `${m}|${dec.action}|${ev.verdict}|${ev.pairs}`;
        const last = slot.experiments.at(-1);
        if (
          ev.pairs > 0 &&
          (!last || `${last.challenger}|${last.decision}|${last.verdict}|${last.pairs}` !== sig)
        ) {
          slot = {
            ...slot,
            experiments: [
              ...slot.experiments,
              {
                at: now,
                champion,
                challenger: m,
                premium: premiumReference(i.log, k.family)?.model ?? null,
                verdict: ev.verdict,
                pairs: ev.pairs,
                deltaQuality: ev.deltaQuality?.value ?? null,
                evidence: ev.evidence,
                decision: dec.action,
                source,
              },
            ].slice(-100),
          };
          log(
            {
              kind: 'EXPERIMENT',
              key,
              family: k.family,
              risk: k.risk,
              model: m,
              from: champion,
              reason: `${dec.action} : ${dec.reasons[0] ?? ''}`,
              verdict: ev.verdict,
            },
            'benchmarkHistory',
          );
        }
        if (dec.action === 'PROMOTE' && (!bestPromote || (ev.deltaQuality?.value ?? 0) > bestPromote.dq))
          bestPromote = { m, ev, dec, dq: ev.deltaQuality?.value ?? 0 };
        else if (dec.action === 'REJECT_CHALLENGER' && slot.currentDecision?.model !== m)
          log(
            {
              kind: 'REJECTED',
              key,
              family: k.family,
              risk: k.risk,
              model: m,
              from: champion,
              reason: dec.reasons[0] ?? 'rejeté',
              verdict: ev.verdict,
            },
            'challengerHistory',
          );
      }
      if (bestPromote) {
        log(
          {
            kind: 'PROMOTED',
            key,
            family: k.family,
            risk: k.risk,
            model: bestPromote.m,
            from: champion,
            to: bestPromote.m,
            reason: bestPromote.dec.reasons.join(' ; '),
            verdict: bestPromote.ev.verdict,
          },
          'promotionHistory',
        );
        state = { ...state, championHistory: push(state.championHistory, { ...events.at(-1)! }) };
        slot = {
          ...slot,
          previousChampion: slot.champion,
          champion: { model: bestPromote.m, since: now, sinceN: totalN, degraded: false },
          challengers: [...challengers.filter((x) => x !== bestPromote!.m), champion],
          rolledBack: slot.rolledBack.filter((x) => x !== bestPromote!.m),
        };
        finish({
          action: 'PROMOTE',
          model: bestPromote.m,
          reason: bestPromote.dec.reasons[0] ?? 'promu',
          at: now,
        });
      } else if (
        !slot.currentDecision ||
        slot.currentDecision.action === 'CROWN' ||
        slot.currentDecision.action === 'NONE'
      ) {
        finish({ action: 'KEEP_CHAMPION', model: champion, reason: 'champion conservé', at: now });
      }
    }
    slot = {
      ...slot,
      premiumReference: premiumReference(
        i.log.filter((e) => (real ? isReal(e) : true)),
        k.family,
      ),
    };
    state.families[key] = slot;
  }
  state = { ...state, updatedAt: events.length ? now : state.updatedAt };
  const ms = Date.now() - t0;
  return {
    state:
      events.length || Object.keys(state.families).some((k) => state.families[k] !== prev.families[k])
        ? state
        : prev,
    events,
    steps: [
      {
        name: 'STATISTICAL_EVALUATION',
        ms,
        decision: `${Object.keys(state.families).length} famille(s) évaluée(s) sur ${evidence.length} mission(s) réelles`,
      },
      {
        name: 'CHAMPION_DECISION',
        ms: 0,
        decision: events.length
          ? events.map((e) => `${e.kind} ${e.model}`).join(' ; ')
          : 'aucun changement de champion',
      },
      {
        name: 'MEMORY_UPDATE',
        ms: 0,
        decision: `${state.championHistory.length} événement(s) de champion · ${state.promotionHistory.length} promotion(s) · ${state.rollbackHistory.length} rollback(s)`,
      },
    ],
  };
}

/** The champion to prefer for a mission: most specific key first (family+risk+contract, then family+risk). */
export function lookupChampion(
  state: LabState | undefined,
  family: string,
  risk: Risk,
  contract?: string | null,
): { slot: LabFamily; champion: ChampionSlot; scope: 'family+risk+contract' | 'family+risk' } | null {
  if (!state) return null;
  const a = contract ? state.families[labKey(family, risk, contract)] : undefined;
  if (a?.champion) return { slot: a, champion: a.champion, scope: 'family+risk+contract' };
  const b = state.families[labKey(family, risk)];
  return b?.champion ? { slot: b, champion: b.champion, scope: 'family+risk' } : null;
}

export { wilson };
export { isCriticalError };
