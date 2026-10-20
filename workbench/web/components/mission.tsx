// Mission UI shared by both editions: live pipeline, verdict card, model line.
import { CheckCircle2, CircleDashed, ShieldCheck, Sparkles, TriangleAlert, XCircle } from 'lucide-react';
import type { MissionReportPayload } from '@shared/types';
import { cx, fmtCost, shortModel } from '../lib/format';
import { Markdown } from './rich';

export const PIPELINE = [
  'analyse',
  'plan',
  'execution',
  'test',
  'review',
  'correction',
  'validation',
  'delivery',
] as const;
const LABEL: Record<string, string> = {
  analyse: 'Analyse',
  plan: 'Plan',
  execution: 'Exécution',
  test: 'Test',
  review: 'Review',
  correction: 'Correction',
  validation: 'Validation',
  delivery: 'Livraison',
};

export function PipelineBar({ current, done }: { current: string; done: string[] }) {
  return (
    <div className="wb-in my-2 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-panel px-2 py-1.5 text-[11.5px]">
      {PIPELINE.map((s, i) => {
        const state = s === current ? 'current' : done.includes(s) ? 'done' : 'todo';
        return (
          <span key={s} className="flex items-center gap-1">
            {i > 0 && <span className="text-faint">→</span>}
            <span
              className={cx(
                'rounded-md px-1.5 py-0.5 font-medium',
                state === 'current' && 'bg-accent text-accent-fg',
                state === 'done' && 'bg-ok/15 text-ok',
                state === 'todo' && 'text-faint',
              )}
            >
              {LABEL[s]}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function VerdictBadge({
  status,
  className,
}: {
  status: MissionReportPayload['status'];
  className?: string;
}) {
  const tone =
    status === 'PASSED'
      ? 'bg-ok/15 text-ok border-ok/40'
      : status === 'PARTIAL'
        ? 'bg-warn/15 text-warn border-warn/40'
        : 'bg-err/15 text-err border-err/40';
  const Icon = status === 'PASSED' ? CheckCircle2 : status === 'PARTIAL' ? TriangleAlert : XCircle;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold',
        tone,
        className,
      )}
    >
      <Icon size={12} /> {status}
    </span>
  );
}

export function VerdictCard({
  report,
  round,
  review,
}: {
  report: MissionReportPayload;
  round: number;
  review?: { approved: boolean; summary: string };
}) {
  const border =
    report.status === 'PASSED'
      ? 'border-ok/50'
      : report.status === 'PARTIAL'
        ? 'border-warn/50'
        : 'border-err/50';
  return (
    <div className={cx('wb-in my-3 rounded-xl border bg-panel p-3', border)}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
        Rapport de mission <VerdictBadge status={report.status} />
        <span className="font-normal text-faint">cycle {round}</span>
        {review && (
          <span
            className={cx(
              'ml-auto inline-flex items-center gap-1 text-[12px] font-medium',
              review.approved ? 'text-ok' : 'text-warn',
            )}
          >
            <ShieldCheck size={13} /> Revue finale : {review.approved ? 'approuvée' : 'corrections demandées'}
          </span>
        )}
      </div>
      <div className="text-[13px]">
        <Markdown text={report.summary} />
      </div>
      {report.checks.length > 0 && (
        <div className="mt-2 grid gap-0.5 text-[12.5px]">
          {report.checks.map((c, i) => (
            <div key={i} className="flex items-start gap-1.5">
              {c.status === 'pass' ? (
                <CheckCircle2 size={13} className="mt-0.5 text-ok" />
              ) : c.status === 'fail' ? (
                <XCircle size={13} className="mt-0.5 text-err" />
              ) : (
                <CircleDashed size={13} className="mt-0.5 text-faint" />
              )}
              <span>
                {c.name}
                {c.details && <span className="text-faint"> — {c.details}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      {report.issues.length > 0 && (
        <div className="mt-2 text-[12.5px] text-warn">Problèmes restants : {report.issues.join(' · ')}</div>
      )}
      {report.deliverables.length > 0 && (
        <div className="mt-1 text-[12.5px] text-muted">Livrables : {report.deliverables.join(', ')}</div>
      )}
      {review && !review.approved && (
        <details className="mt-2 text-[12px]">
          <summary className="cursor-pointer text-faint">Avis du relecteur final</summary>
          <Markdown text={review.summary} />
        </details>
      )}
    </div>
  );
}

export function ModelLine({
  model,
  reason,
  auto,
  tier,
  fallbacks,
  estimate,
}: {
  model: string;
  reason: string;
  auto: boolean;
  tier?: string;
  fallbacks?: string[];
  estimate?: { low: number; high: number } | null;
}) {
  return (
    <div className="my-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-faint">
      <Sparkles size={11} className="text-accent" />
      <span className="font-medium text-muted">{shortModel(model)}</span>
      {tier && <span className="rounded bg-hover px-1 font-semibold uppercase tracking-wide">{tier}</span>}
      {auto && <span>· AUTO : {reason}</span>}
      {!!fallbacks?.length && <span>· secours : {fallbacks.map(shortModel).join(', ')}</span>}
      {estimate && (
        <span>
          · estimation {fmtCost(estimate.low)} – {fmtCost(estimate.high)}
        </span>
      )}
    </div>
  );
}
