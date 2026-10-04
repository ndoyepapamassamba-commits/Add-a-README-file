import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { diffLines } from 'diff';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { Check, Copy } from 'lucide-react';
import type { ChartData } from '@shared/types';
import { cx } from '../lib/format';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

// ── code blocks & markdown ─────────────────────────────────────────────
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative my-2 overflow-hidden rounded-lg border border-line bg-code">
      <div className="flex h-7 items-center justify-between border-b border-line px-3 text-[11px] text-faint">
        <span>{lang || 'texte'}</span>
        <button
          className="flex items-center gap-1 hover:text-fg"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-[1.55]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cx('md', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            const child = Array.isArray(children) ? children[0] : children;
            const props = (child as { props?: { className?: string; children?: ReactNode } })?.props ?? {};
            const lang = /language-([\w-]+)/.exec(props.className ?? '')?.[1];
            return <CodeBlock code={String(props.children ?? '').replace(/\n$/, '')} lang={lang} />;
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

// ── diff ───────────────────────────────────────────────────────────────
interface DiffLine {
  type: 'add' | 'del' | 'ctx' | 'gap';
  text: string;
  a?: number;
  b?: number;
}

export function computeDiff(before: string, after: string, context = 3): DiffLine[] {
  const raw: DiffLine[] = [];
  let a = 1;
  let b = 1;
  for (const part of diffLines(before, after)) {
    const lines = part.value.replace(/\n$/, '').split('\n');
    for (const l of lines) {
      if (part.added) raw.push({ type: 'add', text: l, b: b++ });
      else if (part.removed) raw.push({ type: 'del', text: l, a: a++ });
      else raw.push({ type: 'ctx', text: l, a: a++, b: b++ });
    }
  }
  const keep = new Set<number>();
  raw.forEach((l, i) => {
    if (l.type !== 'ctx') for (let k = i - context; k <= i + context; k++) keep.add(k);
  });
  const out: DiffLine[] = [];
  let gap = false;
  raw.forEach((l, i) => {
    if (keep.has(i)) {
      out.push(l);
      gap = false;
    } else if (!gap) {
      out.push({ type: 'gap', text: '' });
      gap = true;
    }
  });
  return out;
}

export function DiffView({
  before,
  after,
  maxLines = 400,
}: {
  before: string;
  after: string;
  maxLines?: number;
}) {
  const lines = useMemo(() => computeDiff(before, after), [before, after]);
  const shown = lines.slice(0, maxLines);
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-code font-mono text-[12px] leading-[1.6]">
      {shown.map((l, i) =>
        l.type === 'gap' ? (
          <div key={i} className="bg-hover/60 px-3 text-[11px] text-faint">
            ⋯
          </div>
        ) : (
          <div
            key={i}
            className={cx(
              'flex whitespace-pre',
              l.type === 'add' && 'bg-ok/12',
              l.type === 'del' && 'bg-err/12',
            )}
          >
            <span className="w-10 shrink-0 select-none pr-2 text-right text-faint">{l.a ?? ''}</span>
            <span className="w-10 shrink-0 select-none pr-2 text-right text-faint">{l.b ?? ''}</span>
            <span
              className={cx(
                'w-4 shrink-0 select-none',
                l.type === 'add' ? 'text-ok' : l.type === 'del' ? 'text-err' : 'text-faint',
              )}
            >
              {l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}
            </span>
            <span className="pr-3">{l.text || ' '}</span>
          </div>
        ),
      )}
      {lines.length > maxLines && (
        <div className="px-3 py-1 text-[11px] text-faint">… {lines.length - maxLines} lignes de plus</div>
      )}
      {lines.length === 0 && <div className="px-3 py-1 text-faint">Aucune différence</div>}
    </div>
  );
}

// ── charts ─────────────────────────────────────────────────────────────
const PALETTE = [
  '#d97757',
  '#6ba4e7',
  '#73c27a',
  '#e3b552',
  '#b48ead',
  '#5fb3b3',
  '#ee6b5f',
  '#9aa0a6',
  '#c792ea',
  '#f0a35e',
  '#4fb3d9',
  '#a3be8c',
];

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function chartOption(data: ChartData): echarts.EChartsCoreOption {
  const fg = cssVar('--muted');
  const line = cssVar('--line');
  const axis = {
    axisLine: { lineStyle: { color: line } },
    axisLabel: { color: fg },
    splitLine: { lineStyle: { color: line } },
  };
  const base = {
    color: PALETTE,
    textStyle: { fontFamily: 'Inter Variable, system-ui', color: fg },
    animationDuration: 300,
    grid: { left: 56, right: 18, top: 28, bottom: 40, containLabel: true },
  };
  const t = data.spec.type;
  if (t === 'pie') {
    return {
      ...base,
      tooltip: { trigger: 'item', valueFormatter: (v: number) => v?.toLocaleString('fr-FR') },
      legend: { type: 'scroll', bottom: 0, textStyle: { color: fg } },
      series: [
        {
          type: 'pie',
          radius: ['38%', '68%'],
          itemStyle: { borderColor: cssVar('--elev'), borderWidth: 2 },
          data: data.categories.map((c, i) => ({ name: String(c), value: data.series[0]?.data[i] ?? 0 })),
        },
      ],
    };
  }
  if (t === 'scatter') {
    return {
      ...base,
      tooltip: { trigger: 'item' },
      xAxis: { type: 'value', name: data.spec.x?.column, ...axis },
      yAxis: { type: 'value', name: data.spec.y?.[0]?.column, ...axis },
      series: [{ type: 'scatter', symbolSize: 6, data: data.points ?? [] }],
    };
  }
  if (t === 'heatmap' && data.matrix) {
    const vals = data.matrix.values.map((v) => v[2]);
    return {
      ...base,
      tooltip: { position: 'top' },
      grid: { ...base.grid, bottom: 70 },
      xAxis: { type: 'category', data: data.matrix.xLabels, ...axis },
      yAxis: { type: 'category', data: data.matrix.yLabels, ...axis },
      visualMap: {
        min: Math.min(...vals, 0),
        max: Math.max(...vals, 1),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        inRange: { color: ['#2b3a4a', '#6ba4e7', '#e3b552', '#d97757'] },
        textStyle: { color: fg },
      },
      series: [
        {
          type: 'heatmap',
          data: data.matrix.values,
          label: { show: data.matrix.values.length < 150, color: '#fff', fontSize: 10 },
        },
      ],
    };
  }
  const many = data.categories.length > 25;
  return {
    ...base,
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number) => (v === null || v === undefined ? '—' : v.toLocaleString('fr-FR')),
    },
    legend: data.series.length > 1 ? { type: 'scroll', top: 0, textStyle: { color: fg } } : undefined,
    dataZoom: many ? [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 4 }] : undefined,
    xAxis: {
      type: 'category',
      data: data.categories,
      ...axis,
      axisLabel: { color: fg, rotate: data.categories.length > 12 ? 35 : 0, hideOverlap: true },
    },
    yAxis: { type: 'value', ...axis },
    series: data.series.map((s) => ({
      name: s.name,
      type: t === 'line' || t === 'area' ? 'line' : 'bar',
      data: s.data,
      smooth: t === 'line' || t === 'area' ? 0.25 : undefined,
      areaStyle: t === 'area' ? { opacity: 0.18 } : undefined,
      barMaxWidth: 42,
      itemStyle: t === 'bar' || t === 'histogram' ? { borderRadius: [4, 4, 0, 0] } : undefined,
      showSymbol: data.categories.length < 40,
    })),
  };
}

/** Current `data-theme` of the document (re-renders charts when it changes). */
function useDocTheme(): string {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'dark');
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(document.documentElement.dataset.theme ?? 'dark'));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

export function ChartView({ data, height = 300 }: { data: ChartData; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useDocTheme();
  useEffect(() => {
    if (!ref.current || data.spec.type === 'kpi' || data.spec.type === 'table') return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chart.setOption(chartOption(data));
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [data, theme]);

  if (data.spec.type === 'kpi') {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(data.kpis ?? []).map((k) => (
          <div key={k.label} className="rounded-lg border border-line bg-panel p-3">
            <div className="truncate text-[11.5px] text-muted">{k.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {k.value === null ? '—' : k.value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (data.spec.type === 'table') return <DataTable rows={data.rows ?? []} />;
  return <div ref={ref} style={{ height }} className="w-full" />;
}

export function DataTable({
  rows,
  columns,
  maxHeight = 360,
}: {
  rows: Record<string, unknown>[];
  columns?: string[];
  maxHeight?: number;
}) {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  return (
    <div className="overflow-auto rounded-lg border border-line" style={{ maxHeight }}>
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 bg-hover">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap border-b border-line px-2.5 py-1.5 text-left font-semibold"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-panel/40 hover:bg-hover/60">
              {cols.map((c) => (
                <td
                  key={c}
                  className="max-w-[280px] truncate whitespace-nowrap border-b border-line/60 px-2.5 py-1 tabular-nums"
                >
                  {r[c] === null || r[c] === undefined ? <span className="text-faint">—</span> : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── authenticated media ────────────────────────────────────────────────
