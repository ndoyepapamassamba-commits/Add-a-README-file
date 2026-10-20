// JEV COGNITIVE OS — STRATEGY LIBRARY, MICRO-EXPERTS, SKILL TRANSFER, MODEL REHABILITATION, PROTECTION AGAINST LEARNING ILLUSION.
// A strategy is a task type + model + protocol + context method + skills + budget + gate, WITH its evidence. Success of one mission
// is an observation, never a lesson: promotion needs several successes, several formulations, a quality threshold and a regression check.
import type { JevLogEntry } from '../metrics';
import type { CognitiveTag } from './types';
import { qualityOfEntry } from '../fabric/memory';
import { mean, meanCI } from '../apprentice/intervals';
import { welchDiff, wilson } from '../apprentice/stats';

export type StrategyStatus = 'observed' | 'candidate' | 'validated' | 'degraded';
export interface Strategy {
  id: string;
  taskDNA: string;
  model: string;
  protocol: string;
  behavior: string;
  contextMethod: string;
  skills: string[];
  version: number;
  n: number;
  successRate: number | null;
  quality: number | null;
  avgCost: number | null;
  avgTokens: number | null;
  formulations: number;
  lastTested: number;
  status: StrategyStatus;
  /** Why it has this status (the promotion rule it met / missed). */
  why: string;
}
export const PROMOTION = { minRuns: 8, minFormulations: 3, minQuality: 75, minSuccess: 0.8 };
export interface CognitiveEntry extends JevLogEntry {
  cognitive?: CognitiveTag;
}
const cost = (e: JevLogEntry) => e.acct?.totalCost ?? e.cost + e.jevCost;
const tokens = (e: JevLogEntry) => e.acct?.totalTokens ?? e.tokensIn + e.tokensOut;
const hash = (s: string) => {
  let h = 5381;
  for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
};

/** Strategies observed in the log, grouped by (task DNA, model, protocol, behaviour, context method, skills). */
export function strategyLibrary(log: CognitiveEntry[], opts: { regressionOk?: boolean } = {}): Strategy[] {
  const groups = new Map<string, CognitiveEntry[]>();
  for (const e of log) {
    const c = e.cognitive;
    if (!c || e.studio) continue;
    const key = [
      c.taskDNA,
      e.model,
      c.protocol,
      c.behavior,
      c.jcb.match(/CTX=(\S+)/)?.[1] ?? '',
      (e.skillsUsed ?? []).join('+'),
    ].join('|');
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const out: Strategy[] = [];
  for (const [key, es] of groups) {
    const c0 = es[0]!.cognitive!;
    const judged = es.filter((e) => e.success !== null);
    const ok = judged.filter((e) => e.success).length;
    const q = es.map(qualityOfEntry).filter((x): x is number => x !== null);
    const forms = new Set(
      es.map((e) => hash((e.mission ?? '').toLowerCase().replace(/\d+/g, '#').slice(0, 60))),
    ).size;
    const successRate = judged.length ? ok / judged.length : null;
    const qm = mean(q);
    const ci = successRate !== null ? wilson(ok, judged.length) : null;
    let status: StrategyStatus = 'observed';
    let why = `${es.length} exécution(s) : encore une observation`;
    if (es.length >= 3) {
      status = 'candidate';
      why = 'plusieurs exécutions, pas encore assez de preuves';
    }
    const gates = [
      es.length >= PROMOTION.minRuns,
      forms >= PROMOTION.minFormulations,
      qm !== null && qm >= PROMOTION.minQuality,
      ci !== null && ci.lo >= PROMOTION.minSuccess - 0.15,
      opts.regressionOk === true,
    ];
    if (gates.every(Boolean)) {
      status = 'validated';
      why = `validée : ${es.length} exécutions, ${forms} formulations, qualité ${qm!.toFixed(0)}, succès ≥ ${(ci!.lo * 100).toFixed(0)} % (borne basse), régression OK`;
    } else if (es.length >= 3) {
      const miss: string[] = [];
      if (es.length < PROMOTION.minRuns) miss.push(`n ${es.length}/${PROMOTION.minRuns}`);
      if (forms < PROMOTION.minFormulations) miss.push(`formulations ${forms}/${PROMOTION.minFormulations}`);
      if (qm === null || qm < PROMOTION.minQuality)
        miss.push(`qualité ${qm === null ? 'non mesurée' : qm.toFixed(0)}/${PROMOTION.minQuality}`);
      if (!(ci && ci.lo >= PROMOTION.minSuccess - 0.15)) miss.push('borne basse du succès insuffisante');
      if (opts.regressionOk !== true) miss.push('test de régression non passé');
      why = `non promue : ${miss.join(' ; ')}`;
    }
    if (status === 'validated' && successRate !== null && successRate < 0.6) status = 'degraded';
    out.push({
      id: hash(key),
      taskDNA: c0.taskDNA,
      model: es[0]!.model,
      protocol: c0.protocol,
      behavior: c0.behavior,
      contextMethod: c0.jcb.match(/CTX=(\S+)/)?.[1] ?? '',
      skills: es[0]!.skillsUsed ?? [],
      version: c0.version,
      n: es.length,
      successRate,
      quality: qm,
      avgCost: mean(es.map(cost)),
      avgTokens: mean(es.map(tokens)),
      formulations: forms,
      lastTested: Math.max(...es.map((e) => e.at)),
      status,
      why,
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

// ───────── micro-experts ─────────
export interface MicroExpert {
  id: string;
  domain: string;
  model: string;
  skills: string[];
  memory: string[];
  protocol: string;
  policy: string;
  qualityGate: number;
  createdAt: number;
  /** Ends with the mission unless every skill it uses is validated. */
  persistent: boolean;
  note: string;
}
/** MODEL + SKILL + MEMORY + PROTOCOL + POLICY + QUALITY GATE for one mission. It is NOT a new model. */
export function buildMicroExpert(o: {
  domain: string;
  model: string;
  skills: { id: string; status: string }[];
  memory: string[];
  protocol: string;
  policy: string;
  qualityGate: number;
  now?: number;
}): MicroExpert {
  const validated = o.skills.length > 0 && o.skills.every((s) => s.status === 'validated');
  return {
    id: `me-${hash(`${o.domain}|${o.model}|${o.skills.map((s) => s.id).join('+')}`)}`,
    domain: o.domain,
    model: o.model,
    skills: o.skills.map((s) => s.id),
    memory: o.memory,
    protocol: o.protocol,
    policy: o.policy,
    qualityGate: o.qualityGate,
    createdAt: o.now ?? Date.now(),
    persistent: validated,
    note: validated
      ? 'toutes ses compétences sont validées : conservé'
      : 'expire à la fin de la mission (compétences non validées)',
  };
}

// ───────── skill transfer ─────────
export interface TransferResult {
  model: string;
  /** Quality scores of runs WITH the skill, and of the same tasks WITHOUT it (real runs). */
  withSkill: number[];
  without: number[];
}
export interface TransferVerdict {
  status: 'GENERALIZED' | 'MODEL-SPECIFIC' | 'INSUFFICIENT DATA';
  models: { model: string; n: number; delta: number | null; helps: boolean | null }[];
  why: string;
}
/** A skill found on model A is GENERALIZED only if it helps (CI above 0) on at least two OTHER models. */
export function evaluateTransfer(results: TransferResult[], origin: string): TransferVerdict {
  const rows = results.map((r) => {
    if (r.withSkill.length < 5 || r.without.length < 5)
      return { model: r.model, n: Math.min(r.withSkill.length, r.without.length), delta: null, helps: null };
    const d = welchDiff(r.without, r.withSkill);
    return {
      model: r.model,
      n: Math.min(r.withSkill.length, r.without.length),
      delta: d ? d.value : null,
      helps: d ? d.lo > 0 : null,
    };
  });
  const others = rows.filter((r) => r.model !== origin);
  const measured = others.filter((r) => r.helps !== null);
  if (measured.length < 2)
    return {
      status: 'INSUFFICIENT DATA',
      models: rows,
      why: `${measured.length} autre(s) modèle(s) testé(s) avec assez d’exécutions (minimum 2, 5 exécutions de chaque côté)`,
    };
  const helps = measured.filter((r) => r.helps).length;
  return helps >= 2
    ? {
        status: 'GENERALIZED',
        models: rows,
        why: `la compétence améliore la qualité (IC > 0) sur ${helps} autres modèles`,
      }
    : {
        status: 'MODEL-SPECIFIC',
        models: rows,
        why: `elle n’aide significativement que ${helps} autre(s) modèle(s) : reste spécifique`,
      };
}

// ───────── model rehabilitation ─────────
export type RehabArm = 'alone' | 'skill' | 'protocol' | 'memory' | 'protocol+skill';
export interface RehabInput {
  model: string;
  arms: Partial<Record<RehabArm, number[]>>;
  /** Quality (mean) a model must reach to be usable on this task type. */
  threshold: number;
}
export interface RehabReport {
  model: string;
  rows: {
    arm: RehabArm;
    n: number;
    mean: number | null;
    ciLo: number | null;
    deltaVsAlone: number | null;
    significant: boolean | null;
  }[];
  verdict: 'REHABILITATED' | 'STILL WEAK' | 'INSUFFICIENT DATA';
  best: RehabArm | null;
  why: string;
}
export function rehabilitation(i: RehabInput): RehabReport {
  const alone = i.arms.alone ?? [];
  const rows = (['alone', 'skill', 'protocol', 'memory', 'protocol+skill'] as RehabArm[]).map((arm) => {
    const xs = i.arms[arm] ?? [];
    const ci = meanCI(xs);
    const d = arm !== 'alone' && xs.length >= 5 && alone.length >= 5 ? welchDiff(alone, xs) : null;
    return {
      arm,
      n: xs.length,
      mean: mean(xs),
      ciLo: ci?.lo ?? null,
      deltaVsAlone: d ? d.value : null,
      significant: d ? d.lo > 0 : null,
    };
  });
  const usable = rows.filter((r) => r.n >= 5 && r.mean !== null);
  if (usable.length < 2 || !usable.some((r) => r.arm === 'alone'))
    return {
      model: i.model,
      rows,
      verdict: 'INSUFFICIENT DATA',
      best: null,
      why: 'il faut au moins « seul » et un autre bras avec 5 exécutions chacun',
    };
  const best = [...usable].sort((a, b) => b.mean! - a.mean!)[0]!;
  const rehab =
    best.arm !== 'alone' &&
    best.mean! >= i.threshold &&
    best.significant === true &&
    (usable.find((r) => r.arm === 'alone')!.mean ?? 0) < i.threshold;
  return {
    model: i.model,
    rows,
    verdict: rehab ? 'REHABILITATED' : 'STILL WEAK',
    best: best.arm,
    why: rehab
      ? `seul : ${usable.find((r) => r.arm === 'alone')!.mean!.toFixed(0)} < seuil ${i.threshold} ; avec « ${best.arm} » : ${best.mean!.toFixed(0)} (écart significatif)`
      : `aucun bras ne franchit le seuil ${i.threshold} avec un gain significatif`,
  };
}
