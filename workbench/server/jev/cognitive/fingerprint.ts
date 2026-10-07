// JEV COGNITIVE OS — BEHAVIORAL FINGERPRINT and FAILURE PROFILE of a model, from REAL log entries only.
// Nothing is guessed: a dimension without enough observations says INSUFFICIENT DATA.
import type { JevLogEntry } from '../metrics';
import { qualityOfEntry } from '../fabric/memory';
import { confidenceOf, type ConfidenceLabel } from '../apprentice/stats';
import { mean, meanCI, stdDev } from '../apprentice/intervals';
import type { FailureMode, FailureProfile } from './conditioning';

const MIN = 5;
/** Real runs of a model (studio media jobs are excluded: they are not text missions). */
const textRuns = (log: JevLogEntry[]) => log.filter((e) => !e.studio && e.model);

export interface TaskStrength {
  task: string;
  n: number;
  quality: number | null;
  label: 'excellent' | 'weak' | 'average' | 'INSUFFICIENT DATA';
}
export interface Fingerprint {
  model: string;
  n: number;
  confidence: ConfidenceLabel;
  /** Mean output tokens, and output / input ratio (verbosity). */
  outputTokens: number | null;
  verbosity: number | null;
  /** 1 − tool errors / tool calls (null = no tool call observed). */
  toolDiscipline: number | null;
  /** Share of runs WITHOUT a structured-output error (proxy: tool/format errors mentioning json/schema/parse). */
  formatReliability: number | null;
  /** Quality standard deviation (lower = more consistent). */
  consistency: number | null;
  /** Success rate of runs that needed a correction (how well it reacts to one). */
  correctionResponse: number | null;
  latencyMs: number | null;
  /** Quality points per 1 000 tokens. */
  tokenEfficiency: number | null;
  quality: number | null;
  strengths: TaskStrength[];
  note: string;
}
const FORMAT_RX = /json|schema|parse|format|invalid (response|output)|unexpected token/i;

export function fingerprints(log: JevLogEntry[]): Fingerprint[] {
  const runs = textRuns(log);
  const byModel = new Map<string, JevLogEntry[]>();
  for (const e of runs) byModel.set(e.model, [...(byModel.get(e.model) ?? []), e]);
  const allQ = runs.map(qualityOfEntry).filter((x): x is number => x !== null);
  const globalQ = mean(allQ);
  const out: Fingerprint[] = [];
  for (const [model, es] of byModel) {
    const n = es.length;
    const q = es.map(qualityOfEntry).filter((x): x is number => x !== null);
    const calls = es.reduce((a, e) => a + (e.toolCallCount ?? 0), 0);
    const errs = es.reduce((a, e) => a + (e.toolErrorCount ?? 0), 0);
    const fmtBad = es.filter((e) =>
      [...(e.toolErrors ?? []), e.failureNote ?? ''].some((t) => FORMAT_RX.test(t)),
    ).length;
    const corrected = es.filter((e) => e.corrections > 0);
    const tokensOut = es.map((e) => e.tokensOut);
    const tokensIn = es.map((e) => e.tokensIn);
    const tot = es.map((e) => e.tokensIn + e.tokensOut);
    const types = new Map<string, number[]>();
    for (const e of es) {
      const v = qualityOfEntry(e);
      if (v !== null) types.set(e.task, [...(types.get(e.task) ?? []), v]);
    }
    const strengths: TaskStrength[] = [...types].map(([task, xs]) => {
      if (xs.length < MIN || globalQ === null)
        return { task, n: xs.length, quality: mean(xs), label: 'INSUFFICIENT DATA' as const };
      const ci = meanCI(xs);
      const m = mean(xs)!;
      return {
        task,
        n: xs.length,
        quality: m,
        label:
          ci && ci.lo > globalQ + 5
            ? ('excellent' as const)
            : ci && ci.hi < globalQ - 5
              ? ('weak' as const)
              : ('average' as const),
      };
    });
    const qm = mean(q);
    out.push({
      model,
      n,
      confidence: confidenceOf(n),
      outputTokens: mean(tokensOut),
      verbosity: mean(tokensIn) ? (mean(tokensOut) ?? 0) / mean(tokensIn)! : null,
      toolDiscipline: n >= MIN && calls > 0 ? 1 - errs / calls : null,
      formatReliability: n >= MIN ? 1 - fmtBad / n : null,
      consistency: q.length >= MIN ? stdDev(q) : null,
      correctionResponse:
        corrected.length >= MIN
          ? corrected.filter((e) => e.success === true).length / corrected.length
          : null,
      latencyMs: mean(es.map((e) => e.latencyMs)),
      tokenEfficiency: qm !== null && mean(tot) ? (qm / mean(tot)!) * 1000 : null,
      quality: qm,
      strengths,
      note:
        n < MIN
          ? `INSUFFICIENT DATA : ${n} mission(s) observée(s) (minimum ${MIN})`
          : `${n} mission(s) réelles`,
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** Per model and failure mode: observations and failures — only classes the log can really show. */
export function failureProfile(log: JevLogEntry[]): FailureProfile {
  const prof: FailureProfile = {};
  const row = (m: string) => (prof[m] ??= {});
  for (const e of textRuns(log)) {
    const r = row(e.model);
    const bump = (mode: FailureMode, failed: boolean) => {
      const x = (r[mode] ??= { n: 0, failed: 0 });
      x.n++;
      if (failed) x.failed++;
    };
    const texts = [...(e.toolErrors ?? []), e.failureNote ?? ''];
    bump(
      'wrong-format',
      texts.some((t) => FORMAT_RX.test(t)),
    );
    if ((e.toolCallCount ?? 0) > 0)
      bump('tool-misuse', (e.toolErrorCount ?? 0) / (e.toolCallCount ?? 1) > 0.3);
    bump('incomplete', e.success === false || e.escalations > 0);
    bump('overlong', e.tokensOut > 6000 && e.success !== true);
    const q = qualityOfEntry(e);
    bump('unsupported-claim', q !== null && q < 60 && (e.corrections ?? 0) > 0);
  }
  return prof;
}
