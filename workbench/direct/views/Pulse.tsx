// COCKPIT — the last 24 hours, hour by hour (mockup: « Requêtes / Latence / Coûts »). Every point is read from the
// usage log of this browser: an hour without call stays at zero, nothing is interpolated or estimated.
import { useMemo } from 'react';
import { cx, fmtCost, fmtDuration } from '../../web/lib/format';
import { hourlySeries, type HourPoint } from '../lib/cockpit';
import { useStore } from '../lib/store';

type Kind = 'area' | 'line' | 'bars';
const W = 300;
const HGT = 112;
const L = 30;
const B = 16;
const T = 6;

function Chart({ points, pick, kind, color, fmt }: { points: HourPoint[]; pick: (p: HourPoint) => number; kind: Kind; color: string; fmt: (v: number) => string }) {
  const vals = points.map(pick);
  const max = Math.max(...vals, 0);
  const top = max > 0 ? max : 1;
  const n = points.length;
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - 6);
  const y = (v: number) => T + (1 - v / top) * (HGT - T - B);
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const id = `g${color.replace(/[^a-z0-9]/gi, '')}`;
  const bw = ((W - L - 6) / n) * 0.62;
  return (
    <svg viewBox={`0 0 ${W} ${HGT}`} className="h-[120px] w-full" role="img" aria-label={`max ${fmt(max)}`}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - 4} y1={y(top * f)} y2={y(top * f)} stroke="var(--line)" strokeDasharray={f ? '2 3' : undefined} />
          <text x={L - 4} y={y(top * f) + 3} textAnchor="end" fontSize="8.5" fill="var(--faint)">
            {max > 0 ? fmt(top * f) : f ? '' : '0'}
          </text>
        </g>
      ))}
      {points.map((p, i) =>
        i % 4 === 0 ? (
          <text key={p.ts} x={x(i)} y={HGT - 3} textAnchor="middle" fontSize="8.5" fill="var(--faint)">
            {String(new Date(p.ts).getHours()).padStart(2, '0')}h
          </text>
        ) : null,
      )}
      {kind === 'bars' &&
        vals.map((v, i) => (v > 0 ? <rect key={i} x={x(i) - bw / 2} y={y(v)} width={bw} height={Math.max(0.5, y(0) - y(v))} rx="1.5" fill={color} opacity="0.9" /> : null))}
      {kind !== 'bars' && max > 0 && (
        <>
          {kind === 'area' && <path d={`${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${id})`} />}
          <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

function Card({ title, value, children, empty }: { title: string; value: string; children: React.ReactNode; empty: boolean }) {
  return (
    <section className="relative rounded-xl border border-line bg-panel px-3 pb-2 pt-2.5">
      <header className="mb-1 flex items-baseline gap-2">
        <span className="text-[12.5px] font-semibold">{title}</span>
        <span className="ml-auto text-[11px] text-faint">Dernières 24 h</span>
      </header>
      <div className="text-[11.5px] tabular-nums text-muted">{value}</div>
      {children}
      {empty && <div className="pointer-events-none absolute inset-x-0 bottom-9 text-center text-[11.5px] text-faint">Aucun appel sur les dernières 24 h</div>}
    </section>
  );
}

export function CockpitPulse({ className }: { className?: string }) {
  const usage = useStore((s) => s.usage);
  const points = useMemo(() => hourlySeries(usage, 24), [usage]);
  const calls = points.reduce((a, p) => a + p.calls, 0);
  const cost = points.reduce((a, p) => a + p.cost, 0);
  const busiest = points.reduce((a, p) => (p.calls > a.calls ? p : a), points[0]!);
  const lat = points.filter((p) => p.calls).map((p) => p.p50);
  const empty = calls === 0;
  return (
    <div className={cx('grid gap-3 md:grid-cols-3', className)} data-testid="cockpit-pulse">
      <Card title="Requêtes / heure" value={`${calls} appel(s) · pic ${busiest.calls} à ${String(new Date(busiest.ts).getHours()).padStart(2, '0')}h`} empty={empty}>
        <Chart points={points} pick={(p) => p.calls} kind="area" color="var(--accent)" fmt={(v) => String(Math.round(v))} />
      </Card>
      <Card title="Latence médiane" value={lat.length ? `de ${fmtDuration(Math.min(...lat))} à ${fmtDuration(Math.max(...lat))} selon l’heure` : '—'} empty={empty}>
        <Chart points={points} pick={(p) => p.p50 / 1000} kind="line" color="var(--ok)" fmt={(v) => `${v.toFixed(v < 10 ? 1 : 0)} s`} />
      </Card>
      <Card title="Coûts" value={`${fmtCost(cost)} sur 24 h`} empty={empty}>
        <Chart points={points} pick={(p) => p.cost} kind="bars" color="var(--accent)" fmt={(v) => (v < 0.01 ? v.toFixed(3) : v.toFixed(2))} />
      </Card>
    </div>
  );
}
