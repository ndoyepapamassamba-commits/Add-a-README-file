import { z } from 'zod';
import type { ChartData, ChartSpec } from '@shared/types';
import {
  AggFn,
  BucketSchema,
  FilterSchema,
  aggregate,
  matchFilter,
  toNumber,
  toDate,
  excelSerialToDate,
  type Cell,
  type DataEngine,
  type Dataset,
} from './dataEngine';

export const ChartSpecSchema = z.object({
  type: z.enum(['bar', 'line', 'area', 'scatter', 'pie', 'histogram', 'heatmap', 'table', 'kpi']),
  title: z.string().min(1).max(200),
  source: z.object({ path: z.string().min(1), sheet: z.string().optional() }),
  x: z.object({ column: z.string(), bucket: BucketSchema.optional() }).optional(),
  y: z.array(z.object({ column: z.string(), agg: AggFn })).optional(),
  series: z.string().optional(),
  filters: z.array(FilterSchema).optional(),
  bins: z.number().int().min(2).max(200).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
  sort: z.enum(['x', 'y_desc', 'y_asc']).optional(),
});

const MAX_SERIES = 12;

function key(v: Cell | undefined, bucket?: z.infer<typeof BucketSchema>): string {
  if (bucket) {
    const d = toDate(v ?? null) ?? (typeof v === 'number' ? excelSerialToDate(v) : null);
    if (!d) return '(vide)';
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    if (bucket === 'year') return String(y);
    if (bucket === 'quarter') return `${y}-T${Math.floor(d.getUTCMonth() / 3) + 1}`;
    if (bucket === 'month') return `${y}-${m}`;
    return `${y}-${m}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  if (v === null || v === undefined || v === '') return '(vide)';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

const round = (n: number | null) => (n === null ? null : Math.round(n * 1000) / 1000);

/** Turns a declarative chart spec into ready-to-render data (server-side). */
export function computeChart(ds: Dataset, spec: ChartSpec): ChartData {
  const check = (c: string | undefined) => {
    if (c && !ds.columns.includes(c))
      throw new Error(`Unknown column "${c}". Available: ${ds.columns.slice(0, 40).join(', ')}`);
  };
  check(spec.x?.column);
  check(spec.series);
  spec.y?.forEach((y) => check(y.column === '*' ? undefined : y.column));
  spec.filters?.forEach((f) => check(f.column));

  const rows = ds.rows.filter((r) => (spec.filters ?? []).every((f) => matchFilter(r, f)));
  const base: ChartData = { spec, categories: [], series: [], rowCount: rows.length };
  const ys = spec.y?.length ? spec.y : [{ column: '*', agg: 'count' as const }];
  const valuesOf = (rs: typeof rows, col: string): Cell[] =>
    col === '*' ? rs.map(() => 1) : rs.map((r) => r[col] ?? null);

  switch (spec.type) {
    case 'kpi':
      return {
        ...base,
        kpis: ys.map((y) => ({
          label: `${y.agg}(${y.column})`,
          value: round(aggregate(valuesOf(rows, y.column), y.agg)),
        })),
      };

    case 'table': {
      const limit = spec.limit ?? 200;
      return {
        ...base,
        rows: rows
          .slice(0, limit)
          .map((r) =>
            Object.fromEntries(
              ds.columns.map((c) => [
                c,
                r[c] instanceof Date ? (r[c] as Date).toISOString().slice(0, 10) : r[c],
              ]),
            ),
          ),
      };
    }

    case 'scatter': {
      if (!spec.x || !spec.y?.[0]) throw new Error('scatter needs x.column and y[0].column');
      const points: [number, number][] = [];
      for (const r of rows) {
        const a = toNumber(r[spec.x.column] ?? null);
        const b = toNumber(r[spec.y[0].column] ?? null);
        if (a !== null && b !== null) points.push([a, b]);
        if (points.length >= 5000) break;
      }
      return { ...base, points };
    }

    case 'histogram': {
      const col = spec.x?.column ?? spec.y?.[0]?.column;
      if (!col) throw new Error('histogram needs x.column');
      const nums = rows.map((r) => toNumber(r[col] ?? null)).filter((n): n is number => n !== null);
      if (!nums.length) return base;
      const bins = spec.bins ?? 20;
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const width = (max - min) / bins || 1;
      const counts = new Array<number>(bins).fill(0);
      for (const n of nums) counts[Math.min(bins - 1, Math.floor((n - min) / width))]!++;
      const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toFixed(0) : n.toFixed(2));
      return {
        ...base,
        categories: counts.map((_, i) => `${fmt(min + i * width)}–${fmt(min + (i + 1) * width)}`),
        series: [{ name: col, data: counts }],
      };
    }

    case 'heatmap': {
      if (!spec.x || !spec.series) throw new Error('heatmap needs x.column and series (y axis column)');
      const agg = ys[0]!;
      const cells = new Map<string, Cell[]>();
      const xs = new Set<string>();
      const yl = new Set<string>();
      for (const r of rows) {
        const kx = key(r[spec.x.column], spec.x.bucket);
        const ky = key(r[spec.series]);
        xs.add(kx);
        yl.add(ky);
        const k = `${kx}\u0000${ky}`;
        const arr = cells.get(k) ?? [];
        arr.push(agg.column === '*' ? 1 : (r[agg.column] ?? null));
        cells.set(k, arr);
      }
      const xLabels = [...xs].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })).slice(0, 60);
      const yLabels = [...yl].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })).slice(0, 60);
      const values: [number, number, number][] = [];
      xLabels.forEach((x, i) =>
        yLabels.forEach((y, j) => {
          const v = cells.get(`${x}\u0000${y}`);
          if (v) values.push([i, j, round(aggregate(v, agg.agg)) ?? 0]);
        }),
      );
      return { ...base, matrix: { xLabels, yLabels, values } };
    }

    default: {
      // bar / line / area / pie: group by x (optionally pivot by series)
      if (!spec.x) throw new Error(`${spec.type} needs x.column`);
      const groups = new Map<string, typeof rows>();
      for (const r of rows) {
        const k = key(r[spec.x.column], spec.x.bucket);
        const g = groups.get(k);
        if (g) g.push(r);
        else groups.set(k, [r]);
      }
      let cats = [...groups.keys()];
      const firstAgg = ys[0]!;
      const totals = new Map(
        cats.map((c) => [c, aggregate(valuesOf(groups.get(c)!, firstAgg.column), firstAgg.agg) ?? 0]),
      );
      const sort =
        spec.sort ?? (spec.x.bucket || spec.type === 'line' || spec.type === 'area' ? 'x' : 'y_desc');
      if (sort === 'x') cats.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
      else
        cats.sort((a, b) =>
          sort === 'y_desc' ? totals.get(b)! - totals.get(a)! : totals.get(a)! - totals.get(b)!,
        );
      const limit = spec.limit ?? (spec.type === 'pie' ? 12 : 60);
      if (spec.type === 'pie' && cats.length > limit) {
        const kept = cats.slice(0, limit - 1);
        const rest = cats.slice(limit - 1);
        const otherRows = rest.flatMap((c) => groups.get(c)!);
        groups.set('Autres', otherRows);
        cats = [...kept, 'Autres'];
      } else cats = cats.slice(0, limit);

      if (spec.series) {
        const seriesCounts = new Map<string, number>();
        for (const r of rows) {
          const s = key(r[spec.series]);
          seriesCounts.set(s, (seriesCounts.get(s) ?? 0) + 1);
        }
        const seriesNames = [...seriesCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_SERIES)
          .map(([s]) => s);
        return {
          ...base,
          categories: cats,
          series: seriesNames.map((s) => ({
            name: s,
            data: cats.map((c) =>
              round(
                aggregate(
                  valuesOf(
                    groups.get(c)!.filter((r) => key(r[spec.series!]) === s),
                    firstAgg.column,
                  ),
                  firstAgg.agg,
                ),
              ),
            ),
          })),
        };
      }
      return {
        ...base,
        categories: cats,
        series: ys.map((y) => ({
          name: y.column === '*' ? 'Nombre' : `${y.agg}(${y.column})`,
          data: cats.map((c) => round(aggregate(valuesOf(groups.get(c)!, y.column), y.agg))),
        })),
      };
    }
  }
}

export async function buildChart(engine: DataEngine, absPath: string, spec: ChartSpec): Promise<ChartData> {
  const ds = await engine.load(absPath, spec.source.sheet ?? null);
  return computeChart(ds, spec);
}
