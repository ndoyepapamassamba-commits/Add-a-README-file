// Small presentational helpers shared by the Cognitive Fabric screens.
import type { ReactNode } from 'react';
import { Badge } from '../../web/components/ui';
import { cx } from '../../web/lib/format';

export const th = 'px-2 py-1 text-left text-[11.5px] font-medium text-faint whitespace-nowrap';
export const td = 'px-2 py-1 align-top';
export const NM = 'NON MESURÉ';

export const fmt = {
  pct: (x: number | null | undefined) => (x === null || x === undefined ? NM : `${Math.round(x * 100)} %`),
  num: (x: number | null | undefined, d = 1) => (x === null || x === undefined ? NM : x.toFixed(d)),
  usd: (x: number | null | undefined, d = 5) => (x === null || x === undefined ? NM : `${x.toFixed(d)} $`),
  ms: (x: number | null | undefined) =>
    x === null || x === undefined ? NM : x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${Math.round(x)} ms`,
};

export function Section({
  title,
  hint,
  children,
  testId,
}: {
  title: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="rounded-xl border border-line p-3" data-testid={testId}>
      <div className="mb-1 text-[13px] font-medium">{title}</div>
      {hint && <div className="mb-2 text-[12px] text-muted">{hint}</div>}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line p-2 text-[12.5px] text-muted">{children}</div>
  );
}

export function Table({
  head,
  rows,
  testId,
  className,
}: {
  head: ReactNode[];
  rows: ReactNode[][];
  testId?: string;
  className?: string;
}) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full text-[12px]" data-testid={testId}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => (
                <td key={j} className={td}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const STATUS_TONE: Record<string, 'ok' | 'warn' | 'err' | 'neutral' | 'info'> = {
  AVAILABLE: 'ok',
  PARTIAL: 'warn',
  UNAVAILABLE: 'err',
  SIMULATED_TEST_ONLY: 'info',
  validated: 'ok',
  candidate: 'info',
  deprecated: 'neutral',
  failed: 'err',
  active: 'ok',
  proposed: 'info',
  rolled_back: 'warn',
  stale: 'neutral',
  PASS: 'ok',
  WARN: 'warn',
  FAIL: 'err',
};
export const StatusBadge = ({ s }: { s: string }) => <Badge tone={STATUS_TONE[s] ?? 'neutral'}>{s}</Badge>;
