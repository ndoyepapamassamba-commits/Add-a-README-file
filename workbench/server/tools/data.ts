import { z } from 'zod';
import type { ChartSpec } from '@shared/types';
import { QuerySpecSchema, isDataFile, profileToText, rowsToText } from '../services/dataEngine';
import { ChartSpecSchema, buildChart } from '../services/vizEngine';
import { defineTool, ok, ToolError, type AnyTool, type ToolContext } from './types';

function abs(ctx: ToolContext, rel: string): string {
  if (!isDataFile(rel))
    throw new ToolError(`${rel} is not a supported data file (csv, tsv, xlsx, xls, xlsm, ods, json, jsonl)`);
  return ctx.services.workspace.resolve(ctx.projectId, rel);
}

export { profileToText };

export const dataTools: AnyTool[] = [
  defineTool({
    name: 'data.inspect',
    description:
      'Profile a data file (CSV/TSV/XLSX/XLS/XLSM/ODS/JSON): sheets, columns, inferred types, missing values, statistics, top values, anomalies, sample rows.',
    schema: z.object({ path: z.string().min(1), sheet: z.string().optional() }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Inspect ${a.path}${a.sheet ? ` [${a.sheet}]` : ''}`,
    async execute(a, ctx) {
      const ds = await ctx.services.data.load(abs(ctx, a.path), a.sheet);
      const profile = ctx.services.data.profile(ds);
      const sample = ctx.services.data.query(ds, { limit: 8 });
      return ok(
        `${profile.rowCount} rows × ${profile.columnCount} cols${profile.anomalies.length ? ` · ${profile.anomalies.length} anomalies` : ''}`,
        { profile: { ...profile, path: a.path } },
        {
          forModel: `${profileToText({ ...profile, path: a.path })}\n\nSample rows:\n${rowsToText(sample.columns, sample.rows)}`,
        },
      );
    },
  }),
  defineTool({
    name: 'data.query',
    description:
      'Query a data file: filters (eq, neq, gt, gte, lt, lte, contains, in, is_null, not_null), groupBy (with date bucket day/week/month/quarter/year), aggregations (sum, avg, count, min, max, median, count_distinct; column "*" for row count), select, sort, limit.',
    schema: z.object({ path: z.string().min(1), sheet: z.string().optional(), query: QuerySpecSchema }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Query ${a.path}`,
    async execute(a, ctx) {
      const ds = await ctx.services.data.load(abs(ctx, a.path), a.sheet);
      const res = ctx.services.data.query(ds, { limit: 200, ...a.query });
      return ok(
        `${res.rowCount} rows`,
        { columns: res.columns, rows: res.rows.slice(0, 200), rowCount: res.rowCount },
        { forModel: `${res.rowCount} rows\n${rowsToText(res.columns, res.rows, 100)}` },
      );
    },
  }),
  defineTool({
    name: 'data.transform',
    description:
      'Run a query (filter/group/aggregate/select/sort) and write the result to a new file (csv, xlsx or json) in the project.',
    schema: z.object({
      path: z.string().min(1),
      sheet: z.string().optional(),
      query: QuerySpecSchema,
      output_path: z.string().min(1),
      format: z.enum(['csv', 'xlsx', 'json']).default('csv'),
    }),
    readOnly: false,
    assess: () => ({ risk: 'write' }),
    label: (a) => `Transform ${a.path} → ${a.output_path}`,
    grantKey: () => 'filesystem.write',
    async execute(a, ctx) {
      const ds = await ctx.services.data.load(abs(ctx, a.path), a.sheet);
      const res = ctx.services.data.query(ds, { ...a.query, limit: a.query.limit ?? 100_000 });
      const buf = ctx.services.data.exportRows(res.columns, res.rows, a.format);
      const rel = await ctx.services.workspace.writeBinary(ctx.projectId, a.output_path, buf);
      return ok(`Wrote ${res.rows.length} rows → ${rel}`, { path: rel, rows: res.rows.length });
    },
  }),
  defineTool({
    name: 'visualization.create',
    description:
      'Create an interactive chart from a data file and show it to the user. type: bar | line | area | scatter | pie | histogram | heatmap | table | kpi. x={column, bucket?}; y=[{column, agg}] (column "*" with agg count = number of rows); series=column to split by (heatmap: y-axis column).',
    schema: z.object({ spec: ChartSpecSchema }),
    readOnly: false,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Chart: ${a.spec.title}`,
    async execute(a, ctx) {
      const spec = a.spec as ChartSpec;
      const chart = await buildChart(ctx.services.data, abs(ctx, spec.source.path), spec);
      const art = await ctx.services.artifacts.create({
        projectId: ctx.projectId,
        sessionId: ctx.sessionId,
        runId: ctx.runId,
        name: spec.title,
        type: 'chart',
        content: JSON.stringify(chart),
        meta: { chartType: spec.type, source: spec.source.path },
      });
      const preview = chart.kpis
        ? chart.kpis.map((k) => `${k.label}: ${k.value}`).join('\n')
        : chart.categories.length
          ? chart.categories
              .slice(0, 30)
              .map((c, i) => `${c}: ${chart.series.map((s) => `${s.name}=${s.data[i]}`).join(', ')}`)
              .join('\n')
          : chart.points
            ? `${chart.points.length} points`
            : chart.matrix
              ? `${chart.matrix.values.length} cells`
              : `${chart.rows?.length ?? 0} rows`;
      return ok(
        `${spec.type} · ${chart.rowCount} rows`,
        { artifactId: art.id },
        {
          attachments: [{ kind: 'chart', artifactId: art.id, name: spec.title }],
          forModel: `Chart "${spec.title}" displayed to the user (artifact ${art.id}). Data used (${chart.rowCount} rows after filters):\n${preview}`,
        },
      );
    },
  }),
];
