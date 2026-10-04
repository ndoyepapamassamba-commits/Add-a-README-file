// Agent tools available in the standalone (serverless) workbench.
import type { ChartData, ChartSpec } from '@shared/types';
import {
  DataCore,
  isDataFile,
  profileToText,
  rowsToText,
  QuerySpecSchema,
  type Dataset,
} from '../../server/services/dataCore';
import { ChartSpecSchema, computeChart } from '../../server/services/vizEngine';
import { isImage } from '../../server/services/documentsCore';
import { pickFromTier } from '../../server/llm/router';
import { DEFAULT_AUTO_TIERS } from '../../server/services/settings';
import type { ModelInfo } from '@shared/types';
import { complete } from './llm';
import { callTool, type McpToolInfo } from './mcp';
import { runCode } from './sandbox';
import { uid, useStore } from './store';
import type { ArtifactDef, PlanStep } from './types';
import { bytesOf, dataUrl, files, getFile, isTextPath, normPath, readAsText, tree, writeText } from './vfs';

export type Risk = 'read' | 'write' | 'delete' | 'execute' | 'external';

export interface ToolCtx {
  sessionId: string;
  signal: AbortSignal;
  depth: number;
  models: ModelInfo[];
  vision: boolean;
  pendingImages: { dataUrl: string; caption: string }[];
  setPlan: (steps: PlanStep[]) => void;
  proposePlan: (summary: string, steps: string[]) => void;
  delegate?: (role: string, task: string) => Promise<{ ok: boolean; summary: string }>;
}

export interface ToolOut {
  ok: boolean;
  summary: string;
  forModel: string;
  output?: string;
  chart?: ChartData;
  artifact?: string;
}

export interface DirectTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  risk: Risk;
  readOnly: boolean;
  label: (a: Record<string, unknown>) => string;
  preview?: (
    a: Record<string, unknown>,
  ) => Promise<{ text: string; diff?: { path: string; before: string; after: string } }>;
  run: (a: Record<string, unknown>, ctx: ToolCtx) => Promise<ToolOut>;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string) => ({ type: 'string', description });
const S = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
const ok = (summary: string, forModel: string, extra: Partial<ToolOut> = {}): ToolOut => ({
  ok: true,
  summary,
  forModel,
  ...extra,
});
const clip = (s: string, n = 60_000) =>
  s.length > n ? `${s.slice(0, n)}\n…[${s.length - n} caractères tronqués]` : s;

const data = new DataCore();
function loadDataset(path: string, sheet?: string): Dataset {
  const f = getFile(path);
  if (!f) throw new Error(`Fichier introuvable : ${path}`);
  if (!isDataFile(f.path))
    throw new Error(`${f.path} n'est pas un fichier de données (csv, tsv, xlsx, xls, json, jsonl)`);
  return data.parseBytes(f.path, bytesOf(f), sheet ?? null);
}

function saveArtifact(
  sessionId: string,
  a: Omit<ArtifactDef, 'id' | 'createdAt' | 'sessionId'>,
): ArtifactDef {
  const art: ArtifactDef = { ...a, id: uid(), createdAt: Date.now(), sessionId };
  useStore.getState().addArtifact(art);
  return art;
}

function replaceExact(content: string, oldS: string, newS: string, all: boolean, path: string): string {
  if (!oldS) throw new Error('old_string est vide');
  const count = content.split(oldS).length - 1;
  if (count === 0)
    throw new Error(
      `old_string introuvable dans ${path}. Relisez le fichier (filesystem.read) et copiez le texte exact.`,
    );
  if (count > 1 && !all)
    throw new Error(
      `old_string apparaît ${count} fois dans ${path} : ajoutez du contexte ou replace_all=true.`,
    );
  return all ? content.split(oldS).join(newS) : content.replace(oldS, () => newS);
}

export const TOOLS: DirectTool[] = [
  {
    name: 'filesystem.list',
    description: 'List the files of the workspace (uploaded or created files), with sizes.',
    parameters: obj({ prefix: str('Optional folder prefix, e.g. "uploads/"') }),
    risk: 'read',
    readOnly: true,
    label: (a) => `Lister ${S(a.prefix) || "l'espace de travail"}`,
    async run(a) {
      const prefix = S(a.prefix);
      const list = tree()
        .split('\n')
        .filter((l) => !prefix || l.startsWith(prefix));
      return ok(`${list.length} élément(s)`, list.join('\n') || '(aucun fichier)');
    },
  },
  {
    name: 'filesystem.read',
    description:
      'Read a workspace file. Text files are returned with line numbers; PDF, Word, PowerPoint, ODT and RTF are converted to text; images are shown to you if the model has vision.',
    parameters: obj(
      {
        path: str('File path'),
        offset: { type: 'integer', description: 'First line (1-based)' },
        limit: { type: 'integer', description: 'Max lines (default 2000)' },
      },
      ['path'],
    ),
    risk: 'read',
    readOnly: true,
    label: (a) => `Lire ${S(a.path)}`,
    async run(a, ctx) {
      const f = getFile(S(a.path));
      if (!f) throw new Error(`Fichier introuvable : ${S(a.path)}. Utilisez filesystem.list.`);
      if (isImage(f.path)) {
        if (ctx.vision) ctx.pendingImages.push({ dataUrl: dataUrl(f), caption: `Image ${f.path}` });
        return ok(
          'image',
          ctx.vision
            ? `[image ${f.path} — attached to your next message]`
            : `[image ${f.path} — this model cannot see images]`,
        );
      }
      if (isDataFile(f.path) && f.binary) {
        const ds = loadDataset(f.path);
        return ok(
          `${ds.rows.length} lignes`,
          `${profileToText(data.profile(ds))}\n\nFirst rows:\n${rowsToText(ds.columns, ds.rows.slice(0, 30))}`,
        );
      }
      const { text, kind } = await readAsText(f.path);
      const lines = text.split('\n');
      const start = Math.max(1, Number(a.offset) || 1);
      const limit = Math.min(5000, Number(a.limit) || 2000);
      const slice = lines.slice(start - 1, start - 1 + limit);
      const body =
        kind === 'text'
          ? slice.map((l, i) => `${String(start + i).padStart(5)}\t${l}`).join('\n')
          : slice.join('\n');
      const more =
        start - 1 + limit < lines.length
          ? `\n… ${lines.length - (start - 1 + limit)} more lines (use offset)`
          : '';
      return ok(`${lines.length} lignes${kind !== 'text' ? ` (${kind})` : ''}`, clip(body + more));
    },
  },
  {
    name: 'filesystem.search',
    description: 'Search text (or a JavaScript regular expression) in all text files of the workspace.',
    parameters: obj(
      { query: str('Text or regex'), regex: { type: 'boolean' }, prefix: str('Optional folder prefix') },
      ['query'],
    ),
    risk: 'read',
    readOnly: true,
    label: (a) => `Rechercher « ${S(a.query)} »`,
    async run(a) {
      const q = S(a.query);
      const re = a.regex ? new RegExp(q, 'i') : null;
      const hits: string[] = [];
      for (const f of Object.values(files())) {
        if (f.binary || (a.prefix && !f.path.startsWith(S(a.prefix)))) continue;
        f.data.split('\n').forEach((line, i) => {
          if (hits.length < 300 && (re ? re.test(line) : line.toLowerCase().includes(q.toLowerCase())))
            hits.push(`${f.path}:${i + 1}: ${line.slice(0, 220)}`);
        });
      }
      return ok(`${hits.length} résultat(s)`, hits.join('\n') || 'No match.');
    },
  },
  {
    name: 'filesystem.write',
    description:
      'Create or overwrite a text file in the workspace (code, Markdown, HTML, CSV, JSON…). Write complete content.',
    parameters: obj(
      { path: str('File path, e.g. "rapport.md" or "site/index.html"'), content: str('Full file content') },
      ['path', 'content'],
    ),
    risk: 'write',
    readOnly: false,
    label: (a) => `Écrire ${S(a.path)}`,
    async preview(a) {
      const f = getFile(S(a.path));
      return {
        text: `${f ? 'Remplacer' : 'Créer'} ${normPath(S(a.path))}`,
        diff: { path: normPath(S(a.path)), before: f && !f.binary ? f.data : '', after: S(a.content) },
      };
    },
    async run(a) {
      const existed = Boolean(getFile(S(a.path)));
      const f = writeText(S(a.path), S(a.content));
      return ok(
        `${existed ? 'modifié' : 'créé'} · ${f.size} o`,
        `${existed ? 'Updated' : 'Created'} ${f.path} (${f.size} bytes).`,
      );
    },
  },
  {
    name: 'filesystem.edit',
    description:
      'Replace an exact text fragment in a file (read it first). Use replace_all to change every occurrence.',
    parameters: obj(
      {
        path: str('File path'),
        old_string: str('Exact text to replace'),
        new_string: str('Replacement'),
        replace_all: { type: 'boolean' },
      },
      ['path', 'old_string', 'new_string'],
    ),
    risk: 'write',
    readOnly: false,
    label: (a) => `Modifier ${S(a.path)}`,
    async preview(a) {
      const f = getFile(S(a.path));
      if (!f || f.binary) return { text: `Fichier introuvable : ${S(a.path)}` };
      return {
        text: `Modifier ${f.path}`,
        diff: {
          path: f.path,
          before: f.data,
          after: replaceExact(f.data, S(a.old_string), S(a.new_string), Boolean(a.replace_all), f.path),
        },
      };
    },
    async run(a) {
      const f = getFile(S(a.path));
      if (!f || f.binary) throw new Error(`Fichier texte introuvable : ${S(a.path)}`);
      writeText(
        f.path,
        replaceExact(f.data, S(a.old_string), S(a.new_string), Boolean(a.replace_all), f.path),
      );
      return ok('modifié', `Edited ${f.path}.`);
    },
  },
  {
    name: 'filesystem.delete',
    description: 'Delete a file or folder of the workspace.',
    parameters: obj({ path: str('File or folder path') }, ['path']),
    risk: 'delete',
    readOnly: false,
    label: (a) => `Supprimer ${S(a.path)}`,
    async preview(a) {
      return { text: `Supprimer ${normPath(S(a.path))} (définitivement)` };
    },
    async run(a) {
      const p = normPath(S(a.path));
      const n = Object.keys(files()).filter((k) => k === p || k.startsWith(`${p}/`)).length;
      if (!n) throw new Error(`Introuvable : ${p}`);
      useStore.getState().deleteFile(p);
      return ok(`${n} fichier(s) supprimé(s)`, `Deleted ${p} (${n} file(s)).`);
    },
  },
  {
    name: 'data.inspect',
    description:
      'Profile a CSV / TSV / Excel / JSON file: columns, types, missing values, statistics, anomalies, sample rows. Always start a data analysis with this.',
    parameters: obj({ path: str('Data file path'), sheet: str('Excel sheet (optional)') }, ['path']),
    risk: 'read',
    readOnly: true,
    label: (a) => `Analyser ${S(a.path)}`,
    async run(a) {
      const ds = loadDataset(S(a.path), S(a.sheet) || undefined);
      const p = data.profile(ds);
      return ok(
        `${p.rowCount} lignes · ${p.columnCount} colonnes`,
        `${profileToText(p)}\n\nSample rows:\n${rowsToText(ds.columns, ds.rows.slice(0, 15))}`,
      );
    },
  },
  {
    name: 'data.query',
    description:
      'Exact computations on a data file: filters, group by (with date buckets day/week/month/quarter/year), aggregations (sum, avg, count, min, max, median, count_distinct), sort, limit.',
    parameters: obj(
      {
        path: str('Data file path'),
        sheet: str('Excel sheet (optional)'),
        filters: {
          type: 'array',
          items: obj(
            {
              column: { type: 'string' },
              op: {
                type: 'string',
                enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'is_null', 'not_null'],
              },
              value: {},
            },
            ['column', 'op'],
          ),
        },
        groupBy: {
          type: 'array',
          items: obj(
            {
              column: { type: 'string' },
              bucket: { type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'] },
            },
            ['column'],
          ),
        },
        aggregations: {
          type: 'array',
          items: obj(
            {
              column: { type: 'string', description: 'Column or "*" for count' },
              fn: { type: 'string', enum: ['sum', 'avg', 'count', 'min', 'max', 'median', 'count_distinct'] },
              as: { type: 'string' },
            },
            ['column', 'fn'],
          ),
        },
        select: { type: 'array', items: { type: 'string' } },
        sort: {
          type: 'array',
          items: obj({ column: { type: 'string' }, dir: { type: 'string', enum: ['asc', 'desc'] } }, [
            'column',
          ]),
        },
        limit: { type: 'integer' },
      },
      ['path'],
    ),
    risk: 'read',
    readOnly: true,
    label: (a) => `Requête sur ${S(a.path)}`,
    async run(a) {
      const { path, sheet, ...spec } = a;
      const ds = loadDataset(S(path), S(sheet) || undefined);
      const r = data.query(ds, QuerySpecSchema.parse(spec));
      return ok(
        `${r.rowCount} ligne(s)`,
        `${r.rowCount} result rows${r.rowCount > r.rows.length ? ` (showing ${r.rows.length})` : ''}\n${rowsToText(r.columns, r.rows, 200)}`,
      );
    },
  },
  {
    name: 'data.chart',
    description:
      'Create an interactive chart from a data file (bar, line, area, scatter, pie, histogram, heatmap, table, kpi). It is displayed to the user and saved as an artifact.',
    parameters: obj(
      {
        type: {
          type: 'string',
          enum: ['bar', 'line', 'area', 'scatter', 'pie', 'histogram', 'heatmap', 'table', 'kpi'],
        },
        title: { type: 'string' },
        source: obj({ path: { type: 'string' }, sheet: { type: 'string' } }, ['path']),
        x: obj(
          {
            column: { type: 'string' },
            bucket: { type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'] },
          },
          ['column'],
        ),
        y: {
          type: 'array',
          items: obj(
            {
              column: { type: 'string' },
              agg: {
                type: 'string',
                enum: ['sum', 'avg', 'count', 'min', 'max', 'median', 'count_distinct'],
              },
            },
            ['column', 'agg'],
          ),
        },
        series: { type: 'string', description: 'Column used to split series' },
        bins: { type: 'integer' },
        limit: { type: 'integer' },
        sort: { type: 'string', enum: ['x', 'y_desc', 'y_asc'] },
      },
      ['type', 'title', 'source'],
    ),
    risk: 'read',
    readOnly: false,
    label: (a) => `Graphique « ${S(a.title)} »`,
    async run(a, ctx) {
      const spec = ChartSpecSchema.parse(a) as ChartSpec;
      const chart = computeChart(loadDataset(spec.source.path, spec.source.sheet), spec);
      const art = saveArtifact(ctx.sessionId, {
        name: spec.title,
        type: 'chart',
        content: JSON.stringify(chart),
        chart,
      });
      const preview = chart.kpis
        ? chart.kpis.map((k) => `${k.label}: ${k.value}`).join('\n')
        : chart.series
            .map(
              (s) =>
                `${s.name}: ${chart.categories
                  .slice(0, 40)
                  .map((c, i) => `${c}=${s.data[i]}`)
                  .join(', ')}`,
            )
            .join('\n');
      return ok(
        `graphique ${spec.type}`,
        `Chart displayed to the user (artifact ${art.id}).\n${clip(preview, 4000)}`,
        { chart, artifact: art.id },
      );
    },
  },
  {
    name: 'code.run',
    description:
      'Run JavaScript or Python in an isolated sandbox (no access to the page). JS: async code, use console.log; readFile(path) reads a workspace text file; writeFile(path, text) saves a file. Python (Pyodide, numpy/pandas available): workspace text files are mounted at their path; files written in outputs/ are saved back.',
    parameters: obj(
      {
        language: { type: 'string', enum: ['javascript', 'python'] },
        code: str('Code to run'),
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Workspace text files to make available',
        },
      },
      ['language', 'code'],
    ),
    risk: 'execute',
    readOnly: false,
    label: (a) => `Exécuter du ${S(a.language) === 'python' ? 'Python' : 'JavaScript'}`,
    async preview(a) {
      return { text: S(a.code) };
    },
    async run(a, ctx) {
      const wanted = Array.isArray(a.files) ? a.files.map(S) : Object.keys(files());
      const input: Record<string, string> = {};
      for (const p of wanted) {
        const f = getFile(p);
        if (f && !f.binary && f.data.length < 5_000_000) input[f.path] = f.data;
      }
      const r = await runCode(
        S(a.language) === 'python' ? 'python' : 'javascript',
        S(a.code),
        input,
        120_000,
        ctx.signal,
      );
      const saved: string[] = [];
      for (const [p, t] of Object.entries(r.files ?? {})) {
        try {
          writeText(p, t);
          saved.push(normPath(p));
        } catch {
          /* invalid path */
        }
      }
      const text = [
        r.logs.join('\n'),
        r.result !== undefined ? `→ ${r.result}` : '',
        r.error ? `Error: ${r.error}` : '',
        saved.length ? `Saved files: ${saved.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      return {
        ok: r.ok,
        summary: r.ok ? `terminé${saved.length ? ` · ${saved.length} fichier(s)` : ''}` : 'erreur',
        forModel: clip(text || '(no output)', 30_000),
        output: clip(text, 20_000),
      };
    },
  },
  {
    name: 'web.search',
    description:
      'Search the web (current information, documentation, news). Returns a synthesis with source links.',
    parameters: obj(
      { query: str('Search query'), max_results: { type: 'integer', description: '1-10 (default 5)' } },
      ['query'],
    ),
    risk: 'read',
    readOnly: true,
    label: (a) => `Recherche web « ${S(a.query)} »`,
    async run(a, ctx) {
      const model = pickFromTier(ctx.models, DEFAULT_AUTO_TIERS.fast, {})?.id ?? 'openai/gpt-4o-mini';
      const r = await complete(
        {
          model,
          messages: [
            {
              role: 'user',
              content: `Search the web and answer factually, in the language of the query, with markdown source links.\n\nQuery: ${S(a.query)}`,
            },
          ],
          plugins: [{ id: 'web', max_results: Math.min(10, Number(a.max_results) || 5) }],
          maxTokens: 1500,
          signal: ctx.signal,
        },
        { models: ctx.models, fallbacks: [], effort: 'auto', maxRetries: 1 },
      );
      useStore.getState().addSpend(r.cost);
      const sources = (
        (r.annotations ?? []) as { type?: string; url_citation?: { url: string; title?: string } }[]
      )
        .filter((x) => x.type === 'url_citation' && x.url_citation)
        .map((x) => `- [${x.url_citation!.title ?? x.url_citation!.url}](${x.url_citation!.url})`);
      const text = `${r.content}${sources.length ? `\n\nSources:\n${[...new Set(sources)].join('\n')}` : ''}`;
      return ok(`${sources.length} source(s) · $${r.cost.toFixed(4)}`, text, { output: text });
    },
  },
  {
    name: 'artifact.create',
    description:
      'Create a deliverable shown to the user with preview and download: html (page / mini-app / slides), markdown (report), svg, json, csv or text. Also saved in the workspace under artifacts/.',
    parameters: obj(
      {
        name: str('File name with extension, e.g. "rapport.md" or "dashboard.html"'),
        type: { type: 'string', enum: ['html', 'markdown', 'svg', 'json', 'csv', 'text'] },
        content: str('Full content'),
      },
      ['name', 'type', 'content'],
    ),
    risk: 'read',
    readOnly: false,
    label: (a) => `Artefact ${S(a.name)}`,
    async run(a, ctx) {
      const name = S(a.name).split('/').pop() || 'artefact.txt';
      const art = saveArtifact(ctx.sessionId, {
        name,
        type: S(a.type) as ArtifactDef['type'],
        content: S(a.content),
      });
      writeText(`artifacts/${name}`, S(a.content));
      return ok('artefact créé', `Artifact "${name}" shown to the user and saved as artifacts/${name}.`, {
        artifact: art.id,
      });
    },
  },
  {
    name: 'plan.update',
    description:
      'Show / update your task checklist (use for multi-step work; keep exactly one step in_progress).',
    parameters: obj(
      {
        steps: {
          type: 'array',
          items: obj(
            {
              title: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
            },
            ['title', 'status'],
          ),
        },
      },
      ['steps'],
    ),
    risk: 'read',
    readOnly: true,
    label: () => 'Mettre à jour le plan',
    async run(a, ctx) {
      const steps = (Array.isArray(a.steps) ? a.steps : []) as PlanStep[];
      ctx.setPlan(steps);
      return ok(`${steps.filter((s) => s.status === 'done').length}/${steps.length}`, 'Checklist updated.');
    },
  },
  {
    name: 'plan.propose',
    description: 'PLAN MODE ONLY: submit your plan (summary + ordered steps) for user approval.',
    parameters: obj(
      { summary: str('What you will do and why'), steps: { type: 'array', items: { type: 'string' } } },
      ['summary', 'steps'],
    ),
    risk: 'read',
    readOnly: true,
    label: () => 'Proposer un plan',
    async run(a, ctx) {
      ctx.proposePlan(S(a.summary), (Array.isArray(a.steps) ? a.steps : []).map(S));
      return ok('plan proposé', 'Plan submitted; waiting for the user.');
    },
  },
  {
    name: 'skill.use',
    description: 'Load the full instructions of a skill from the catalog. Follow them strictly.',
    parameters: obj({ name: str('Skill name') }, ['name']),
    risk: 'read',
    readOnly: true,
    label: (a) => `Skill ${S(a.name)}`,
    async run(a) {
      const sk = useStore.getState().skills.find((s) => s.name === S(a.name));
      if (!sk) throw new Error(`Skill inconnu : ${S(a.name)}`);
      const fl = Object.keys(sk.files);
      return ok(
        'chargé',
        `# Skill ${sk.name} — MANDATORY instructions\n\n${sk.body}${fl.length ? `\n\nBundled files (skill.read): ${fl.join(', ')}` : ''}`,
      );
    },
  },
  {
    name: 'skill.read',
    description: 'Read a file bundled with a skill (references, templates, scripts).',
    parameters: obj({ name: str('Skill name'), path: str('File path inside the skill') }, ['name', 'path']),
    risk: 'read',
    readOnly: true,
    label: (a) => `Skill ${S(a.name)} › ${S(a.path)}`,
    async run(a) {
      const sk = useStore.getState().skills.find((s) => s.name === S(a.name));
      const t = sk?.files[S(a.path)];
      if (t === undefined) throw new Error(`Fichier introuvable dans le skill : ${S(a.path)}`);
      return ok(`${t.length} caractères`, clip(t));
    },
  },
  {
    name: 'agent.delegate',
    description:
      'Delegate a self-contained sub-task to a specialist agent (coder, researcher, data_analyst, writer, reviewer, or a custom agent id). It works with its own context and returns a summary.',
    parameters: obj({ agent: str('Agent id'), task: str('Complete, self-contained task description') }, [
      'agent',
      'task',
    ]),
    risk: 'read',
    readOnly: false,
    label: (a) => `Déléguer à ${S(a.agent)}`,
    async run(a, ctx) {
      if (!ctx.delegate) throw new Error('Délégation indisponible à ce niveau');
      const r = await ctx.delegate(S(a.agent), S(a.task));
      return { ok: r.ok, summary: r.ok ? 'terminé' : 'échec', forModel: r.summary };
    },
  },
];

export const toolByName = (n: string) => TOOLS.find((t) => t.name === n);

/** Wraps a remote MCP tool. */
export function mcpTool(t: McpToolInfo, autoApprove: boolean): DirectTool {
  const name = `mcp.${t.server.replace(/[^\w-]/g, '_')}.${t.name.replace(/[^\w-]/g, '_')}`.slice(0, 64);
  return {
    name,
    description: `[Plugin ${t.server}] ${t.description || t.name}`.slice(0, 1024),
    parameters: t.inputSchema,
    risk: autoApprove || t.readOnly ? 'read' : 'external',
    readOnly: false,
    label: (a) => `${t.server} › ${t.name} ${S(Object.values(a)[0]).slice(0, 50)}`,
    async preview(a) {
      return { text: `Plugin ${t.server} › ${t.name}\n${JSON.stringify(a, null, 2).slice(0, 3000)}` };
    },
    async run(a, ctx) {
      const r = (await callTool(t.server, t.name, a, ctx.signal)) as {
        content?: { type: string; text?: string; data?: string; mimeType?: string }[];
        isError?: boolean;
        structuredContent?: unknown;
      };
      const parts: string[] = [];
      for (const c of r.content ?? []) {
        if (c.type === 'text' && c.text) parts.push(c.text);
        else if (c.type === 'image' && c.data) {
          if (ctx.vision)
            ctx.pendingImages.push({
              dataUrl: `data:${c.mimeType ?? 'image/png'};base64,${c.data}`,
              caption: `Image from ${t.server}.${t.name}`,
            });
          parts.push('[image]');
        } else parts.push(`[${c.type}]`);
      }
      if (!parts.length && r.structuredContent !== undefined)
        parts.push(JSON.stringify(r.structuredContent, null, 2));
      const text = parts.join('\n\n') || '(empty result)';
      return {
        ok: !r.isError,
        summary: r.isError ? 'erreur du plugin' : `${text.length} caractères`,
        forModel: clip(text),
        output: clip(text, 8000),
      };
    },
  };
}

export const llmName = (n: string) => n.replace(/\./g, '__');
export function toolDefs(list: DirectTool[]) {
  return list.map((t) => ({
    type: 'function' as const,
    function: { name: llmName(t.name), description: t.description, parameters: t.parameters },
  }));
}

export { isTextPath };
