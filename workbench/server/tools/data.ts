import { z } from 'zod';
import type { ChartSpec } from '@shared/types';
import { QuerySpecSchema, isDataFile, profileToText, rowsToText } from '../services/dataEngine';
import { FilterSchema, coerceQuery } from '../services/dataCore';
import { briefToMarkdown, buildBrief } from '../services/reportBrief';
import { hintsLocal, hintsText } from '../services/reportHints';
import { uniqueOutput } from './mission';

/** Query spec accepting the usual variants written by models (single objects, "col" strings…). */
const TolerantQuery = z.preprocess(coerceQuery, QuerySpecSchema);
import { ChartSpecSchema, buildChart } from '../services/vizEngine';
import { defineTool, ok, ToolError, type AnyTool, type ToolContext } from './types';

function abs(ctx: ToolContext, rel: string): string {
  if (!isDataFile(rel))
    throw new ToolError(
      `${rel} is not a supported data file (csv, tsv, xlsx, xls, xlsm, xlsb, ods, json, jsonl)`,
    );
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
    schema: z.object({ path: z.string().min(1), sheet: z.string().optional(), query: TolerantQuery }),
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
    name: 'report.analyse',
    description:
      'ANALYSE POUSSÉE ET RAPIDE (local, exact, 0 token): the BRIEF of a data file — main measure, what explains it, top categories and concentration per dimension, trend by period, distribution bands, rates, anomalies, data quality — each figure with its method, written to outputs/<name>-brief.md and .json. Adapt it: measure, dims, filters (as data.query), top, focus; call it again for other cuts. Write the narrative FROM THE BRIEF ONLY, then report.export with brief = the .json path.',
    schema: z.object({
      path: z.string().min(1),
      sheet: z.string().optional(),
      name: z.string().max(100).optional(),
      title: z.string().max(200).optional(),
      focus: z.string().max(500).optional(),
      measure: z.string().optional(),
      dims: z.array(z.string()).optional(),
      filters: z.array(FilterSchema).optional(),
      top: z.number().int().min(3).max(15).optional(),
    }),
    readOnly: false,
    assess: () => ({ risk: 'write_internal' }),
    label: (a) => `Brief d'analyse ${a.path}`,
    async execute(a, ctx) {
      const ds = await ctx.services.data.load(abs(ctx, a.path), a.sheet);
      const r = a.filters?.length ? ctx.services.data.query(ds, { limit: 1_000_000, filters: a.filters }) : { columns: ds.columns, rows: ds.rows as Record<string, unknown>[], rowCount: ds.rows.length };
      const title = a.title ?? a.focus ?? a.path.split('/').pop() ?? 'Analyse';
      const brief = buildBrief(r.columns, r.rows, { title, source: `${a.path}${a.sheet ? ` [${a.sheet}]` : ''}${a.filters?.length ? ' (filtré)' : ''}`, measure: a.measure, dims: a.dims, top: a.top });
      const md = briefToMarkdown(brief);
      const base = `outputs/${(a.name ?? a.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'analyse').replace(/[^\w.-]+/g, '-')}-brief`;
      const ws = ctx.services.workspace;
      const mdPath = await uniqueOutput(ctx, `${base}.md`);
      await ws.writeFile(ctx.projectId, mdPath, md, { sessionId: ctx.sessionId, runId: ctx.runId });
      const jsonPath = await uniqueOutput(ctx, `${base}.json`);
      await ws.writeFile(ctx.projectId, jsonPath, JSON.stringify(brief), { sessionId: ctx.sessionId, runId: ctx.runId });
      const hints = hintsLocal(brief, r.columns, a.focus ?? '');
      return ok(
        `brief : ${brief.kpis.length} indicateurs, ${brief.dims.length} dimension(s), ${brief.anomalies.length} anomalie(s) → ${mdPath}`,
        { md: mdPath, json: jsonPath, kpis: brief.kpis, dims: brief.dims.length, anomalies: brief.anomalies.length },
        { forModel: `${md}\n\n---\n${hintsText(hints)}\n\nFichiers : ${mdPath}, ${jsonPath}. Écrivez le récit avec ces chiffres seulement, puis report.export avec brief: "${jsonPath}".` },
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
      query: TolerantQuery,
      output_path: z.string().min(1),
      format: z.enum(['csv', 'xlsx', 'json']).default('csv'),
      title: z.string().optional().describe('Title of the house-style Excel band'),
      chart: z
        .enum(['none', 'bar', 'line', 'pie'])
        .default('none')
        .describe('Optional NATIVE Excel chart in the locked house palette (xlsx only)'),
    }),
    readOnly: false,
    assess: () => ({ risk: 'write' }),
    label: (a) => `Transform ${a.path} → ${a.output_path}`,
    grantKey: () => 'filesystem.write',
    async execute(a, ctx) {
      const ds = await ctx.services.data.load(abs(ctx, a.path), a.sheet);
      const res = ctx.services.data.query(ds, { ...a.query, limit: a.query.limit ?? 100_000 });
      const buf = ctx.services.data.exportRows(res.columns, res.rows, a.format, {
        title:
          a.title ??
          a.output_path
            .split('/')
            .pop()!
            .replace(/\.[^.]+$/, ''),
        subtitle: `Source : ${a.path}`,
        chart: a.chart,
      });
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
