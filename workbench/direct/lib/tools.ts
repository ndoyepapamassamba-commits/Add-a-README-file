// Agent tools available in the standalone (serverless) workbench.
import { acct } from './acct';
import type { ChartData, ChartSpec } from '@shared/types';
import {
  DataCore,
  isDataFile,
  profileToText,
  rowsToText,
  QuerySpecSchema,
  coerceQuery,
  type Dataset,
} from '../../server/services/dataCore';
import { ChartSpecSchema, computeChart } from '../../server/services/vizEngine';
import { isImage } from '../../server/services/documentsCore';
import { pickFromTier } from '../../server/llm/router';
import {
  AI_DOCS,
  MISSION_REPORT_SCHEMA,
  MISSION_STAGES,
  aiDocPath,
  aiDocTemplate,
  normalizeReport,
  type AiDoc,
  type MissionReport,
} from '../../server/agent/mission';
import { markdownToDocx, printableHtml } from '../../server/services/officeCore';
import { housePptx } from '../../server/services/housePptx';
import { emlFromHtml, houseMailHtml } from '../../server/services/houseStyle';
import { apexGuide, assembleApp, lintApp, referencePart } from '../../server/services/apexCore';
import { getHouseKit, qaInFrame, syntaxError } from './apex';
import { browser, snapshotText, type BrowserSnapshot } from './browser';
import { agentShell } from './shell';
import {
  buildGraph,
  buildTwin,
  impactOf,
  queryGraph,
  rankInformation,
  regressionSuite,
  simulateDecision,
  twinSummary,
  type DecisionInput,
  type InfoItem,
  type ManualKind,
} from '../../server/agent/intelligence';
import { diffCheckpoint, listCheckpoints, restoreCheckpoint } from './timemachine';

/** Digital twin of the current workspace (text files only). */
function workspaceTwin() {
  return buildTwin(
    Object.values(files())
      .filter((f) => !f.binary && f.data.length < 2_000_000)
      .map((f) => ({ path: f.path, text: f.data })),
  );
}
import { shellRisk } from './shellCore';
import { THEME_PARAMS } from '../../server/services/houseDesign';
import { dashboardData, renderLayoutHtml, type DesignLayout } from '../../server/services/layoutClone';
import { BRAVE_DIRECT, braveText, braveUrl, parseBrave } from '../../server/jev/web/brave';
import { PROVIDER_LABEL, parseSerper, parseTavily, serperRequest, tavilyRequest } from '../../server/jev/web/search';
import { diagnose, formatDiagnosis } from '../../server/tools/diagnose';

/** Result of a browser action for the model: new downloads, errors, then the page. */
function browserAct(r: { snap: BrowserSnapshot; downloads: { path: string; size: number }[] }): string {
  const errors = browser.state.console.filter((c) => c.startsWith('error')).slice(-5);
  return `${r.downloads.length ? `Downloaded: ${r.downloads.map((d) => `${d.path} (${d.size} bytes)`).join(', ')}\n` : ''}${errors.length ? `Recent page errors: ${errors.join(' | ')}\n` : ''}${snapshotText(r.snap, 5000)}`;
}
import { marked } from 'marked';
import * as echarts from 'echarts/core';
import { chartOption } from '../../web/components/rich';

/** Renders a chart to PNG offscreen (for Word / HTML reports). */
function chartPng(chart: ChartData): Uint8Array | null {
  if (chart.spec.type === 'kpi' || chart.spec.type === 'table') return null;
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;left:-10000px;top:0;width:960px;height:520px';
  document.body.appendChild(div);
  try {
    const c = echarts.init(div, undefined, { renderer: 'canvas', width: 960, height: 520 });
    c.setOption({ ...chartOption(chart), animation: false, backgroundColor: '#ffffff' });
    const url = c.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
    c.dispose();
    const bin = atob(url.split(',')[1]!);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  } finally {
    div.remove();
  }
}

/** Workspace images referenced as ![alt](path) in Markdown. */
function resolveImage(src: string): { data: Uint8Array; type: 'png' | 'jpeg' } | null {
  const f = getFile(src.replace(/^\.\//, ''));
  if (!f || !f.binary || !/^image\/(png|jpeg)/.test(f.mime)) return null;
  return { data: bytesOf(f), type: f.mime.includes('jpeg') ? 'jpeg' : 'png' };
}
function inlineImages(md: string): string {
  return md.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt: string, src: string) => {
    const f = getFile(src.replace(/^\.\//, ''));
    return f && f.binary && f.mime.startsWith('image/') ? `![${alt}](${dataUrl(f)})` : m;
  });
}
import { DEFAULT_AUTO_TIERS } from '../../server/services/settings';
import type { ModelInfo } from '@shared/types';
import { complete } from './llm';
import { callTool, type McpToolInfo } from './mcp';
import { runInWorkspace } from './run';
import { uid, useStore } from './store';
import type { ArtifactDef, PlanStep } from './types';
import {
  bytesOf,
  dataUrl,
  files,
  getFile,
  isTextPath,
  normPath,
  readAsText,
  removeFile,
  tree,
  uniquePath,
  writeBytes,
  writeText,
} from './vfs';

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
  mission?: { stage: (s: string, note?: string) => void; report: (r: MissionReport) => void };
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
  /** Risk of this particular call (e.g. a terminal command), when it depends on the arguments. */
  assess?: (a: Record<string, unknown>) => Risk;
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
import type { DashSpec } from '../../server/services/dashClone';
import { cloneData, renderCloneHtml, renderCloneSvg } from '../../server/services/dashRender';
import { addImageSheet } from '../../server/services/officeLogo';
import { rasterise } from './designClone';
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
      const n = removeFile(p);
      if (!n) throw new Error(`Introuvable : ${p}`);
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
      const r = data.query(ds, QuerySpecSchema.parse(coerceQuery(spec)));
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
      const png = chartPng(chart);
      const slug =
        spec.title
          .replace(/[^\w\u00C0-\u017F-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60) || 'graphique';
      const pngPath = png ? uniquePath(`outputs/charts/${slug}.png`) : null;
      if (png && pngPath) writeBytes(pngPath, png, 'image/png');
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
        `graphique ${spec.type}${pngPath ? ` · ${pngPath}` : ''}`,
        `Chart displayed to the user (artifact ${art.id}).${pngPath ? ` PNG saved as ${pngPath} — embed it in reports with ![${spec.title}](${pngPath}).` : ''}\n${clip(preview, 4000)}`,
        { chart, artifact: art.id },
      );
    },
  },
  {
    name: 'code.run',
    description:
      'Run JavaScript or Python in an isolated sandbox (no access to the page). Every workspace file is available, binaries included. JS: async code, use console.log; readFile(path) → string for text files, Uint8Array for binaries (PDF, xlsx, docx, images); readBytes(path) → Uint8Array; await readText(path) → extracted text of a PDF / Word / PowerPoint; writeFile(path, string | Uint8Array) saves a file. Python (Pyodide; numpy, pandas, openpyxl, xlrd, pypdf): workspace files are mounted at their path (pd.read_excel works); await read_text(path) gives the text of a PDF / Word file; files written in outputs/ are saved back. If Python is unavailable (blocked network, no offline pack), use JavaScript: it reads the same files.',
    parameters: obj(
      {
        language: { type: 'string', enum: ['javascript', 'python'] },
        code: str('Code to run'),
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Workspace files to make available (default: all)',
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
      const wanted = Array.isArray(a.files) && a.files.length ? a.files.map(S) : undefined;
      const r = await runInWorkspace(
        S(a.language) === 'python' ? 'python' : 'javascript',
        S(a.code),
        wanted,
        ctx.signal,
      );
      const saved = r.saved;
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
      // FREE SEARCH first (Tavily, then Serper: callable straight from the browser), then Brave (needs a relay):
      // raw results, no LLM synthesis call. The paid OpenRouter search is only the last resort.
      const ws = useStore.getState().settings;
      const n0 = Math.min(10, Number(a.max_results) || 6);
      const errs: string[] = [];
      for (const [p, key] of [['tavily', ws.tavilyKey], ['serper', ws.serperKey]] as const) {
        if (!key) continue;
        try {
          const rq = p === 'tavily' ? tavilyRequest(key, S(a.query), n0) : serperRequest(key, S(a.query), n0);
          const res = await fetch(rq.url, { ...rq.init, signal: ctx.signal });
          if (!res.ok) {
            errs.push(`${PROVIDER_LABEL[p]} HTTP ${res.status}`);
            continue;
          }
          const j = await res.json();
          const hits = p === 'tavily' ? parseTavily(j, n0) : parseSerper(j, n0);
          const text = braveText(S(a.query), hits).replace('(Brave Search)', `(${PROVIDER_LABEL[p]})`);
          return ok(`${PROVIDER_LABEL[p]} · ${hits.length} résultat(s) · 0 $ LLM`, text, { output: text });
        } catch (e) {
          errs.push(`${PROVIDER_LABEL[p]} : ${(e as Error).message}`);
        }
      }
      if (errs.length && !ws.braveKey && ws.braveFallback === false)
        throw new Error(`Recherche web indisponible (${errs.join(' ; ')}). Vérifiez la clé dans Réglages.`);
      if (ws.braveKey) {
        const n = Math.min(10, Number(a.max_results) || 6);
        const bases = [ws.braveRelay, BRAVE_DIRECT].filter((x): x is string => Boolean(x));
        let lastErr = '';
        for (const base of bases) {
          try {
            const res = await fetch(braveUrl(base, S(a.query), n), {
              headers: { Accept: 'application/json', 'X-Subscription-Token': ws.braveKey },
              signal: ctx.signal,
            });
            if (!res.ok) {
              lastErr = `HTTP ${res.status}`;
              continue;
            }
            const hits = parseBrave(await res.json(), n);
            const text = braveText(S(a.query), hits);
            return ok(`Brave · ${hits.length} résultat(s) · 0 $ LLM`, text, { output: text });
          } catch (e) {
            lastErr = (e as Error).message;
          }
        }
        if (ws.braveFallback === false) throw new Error(`Brave Search indisponible (${lastErr}). Vérifiez la clé / le relais dans Réglages.`);
      }
      const model = pickFromTier(ctx.models, DEFAULT_AUTO_TIERS.fast, {})?.id ?? 'openai/gpt-4o-mini';
      const t0 = Date.now();
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
      // Scientific accounting: an LLM call made INSIDE a tool is the tool's cost, not the mission model's.
      acct.add(ctx.sessionId, {
        kind: 'tool',
        step: 0,
        model: r.model,
        tokensIn: r.usage.promptTokens,
        tokensOut: r.usage.completionTokens,
        cost: r.cost,
        costSource: r.costSource,
        ms: Date.now() - t0,
      });
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
    name: 'vault.open',
    description:
      'Open an entry of the user\'s EXPERIENCE VAULT (past deliverables they validated): returns its text and copies its files into this chat under vault/. Use the id given in <EXPERIENCE>.',
    parameters: obj({ id: str('Vault entry id') }, ['id']),
    risk: 'read',
    readOnly: false,
    label: (a) => `Coffre d’expérience ${S(a.id)}`,
    async run(a) {
      const e = useStore.getState().vault.find((v) => v.id === S(a.id));
      if (!e) throw new Error(`Entrée de coffre introuvable : ${S(a.id)}`);
      const copied: string[] = [];
      for (const f of e.files) {
        const p = uniquePath(`vault/${f.path.split('/').pop()}`);
        if (f.binary) {
          const bin = atob(f.data);
          const b = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
          writeBytes(p, b, f.mime);
        } else writeText(p, f.data);
        copied.push(p);
      }
      const text = `Vault entry « ${e.title} » (${new Date(e.at).toISOString().slice(0, 10)})\nRequest: ${e.request.slice(0, 600)}\nFiles copied: ${copied.join(', ') || 'none'}\n\n${e.text.slice(0, 12_000)}`;
      return ok(`${copied.length} fichier(s) copié(s)`, text);
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
  {
    name: 'mission.stage',
    description:
      'MISSION MODE: announce the current pipeline stage (analyse, plan, execution, test, review, correction, validation, delivery).',
    parameters: obj({ stage: { type: 'string', enum: [...MISSION_STAGES] }, note: { type: 'string' } }, [
      'stage',
    ]),
    risk: 'read',
    readOnly: true,
    label: (a) => `Étape : ${S(a.stage)}`,
    async run(a, ctx) {
      ctx.mission?.stage(S(a.stage), S(a.note) || undefined);
      return ok(S(a.stage), `Stage: ${S(a.stage)}`);
    },
  },
  {
    name: 'mission.report',
    description:
      'MISSION MODE: final report with an honest verdict (PASSED / PARTIAL / FAILED), the checks you actually ran, remaining issues and deliverables. Required to finish a mission.',
    parameters: MISSION_REPORT_SCHEMA,
    risk: 'read',
    readOnly: false,
    label: (a) => `Rapport de mission : ${S(a.status)}`,
    async run(a, ctx) {
      if (!ctx.mission) throw new Error('mission.report is only available in mission mode');
      const r = normalizeReport(a);
      ctx.mission.report(r);
      return ok(r.status, `Report recorded (${r.status}).`);
    },
  },
  {
    name: 'memory.doc',
    description: `Update a project memory document in .ai/ (${AI_DOCS.join(', ')}). mode "replace" rewrites it, "append" adds at the end. Keep it concise and factual.`,
    parameters: obj(
      {
        doc: { type: 'string', enum: [...AI_DOCS] },
        mode: { type: 'string', enum: ['replace', 'append'] },
        content: str('Markdown content'),
      },
      ['doc', 'content'],
    ),
    risk: 'read',
    readOnly: false,
    label: (a) => `Mémoire .ai/${S(a.doc)}.md`,
    async run(a) {
      const doc = S(a.doc) as AiDoc;
      if (!AI_DOCS.includes(doc)) throw new Error(`Document inconnu : ${doc}`);
      const path = aiDocPath(doc);
      const before = getFile(path)?.data ?? aiDocTemplate(doc, 'Espace de travail');
      writeText(
        path,
        S(a.mode) === 'replace' ? S(a.content) : `${before.trimEnd()}\n\n${S(a.content).trim()}\n`,
      );
      return ok('mis à jour', `Updated ${path}.`);
    },
  },
  {
    name: 'report.export',
    description:
      'Export a Markdown report to deliverables in outputs/, in the house style by default (or the theme the user asks for): docx (Word), pptx (PowerPoint), html (printable — the user prints it to PDF), eml (colour mail draft for Outlook + .mail.html), md. Charts saved by data.chart (outputs/charts/*.png) are embedded when referenced as ![title](outputs/charts/x.png). Give markdown content or a markdown file path. Never overwrites existing files.',
    parameters: obj(
      {
        name: str('Base file name without extension, e.g. "rapport-ventes"'),
        title: str('Document title'),
        content: str('Markdown content (or use from_path)'),
        from_path: str('Markdown file in the workspace'),
        formats: {
          type: 'array',
          items: { type: 'string', enum: ['docx', 'pptx', 'html', 'pdf', 'md', 'eml'] },
        },
        ...THEME_PARAMS,
      },
      ['name'],
    ),
    risk: 'read',
    readOnly: false,
    label: (a) => `Exporter ${S(a.name)}`,
    async run(a, ctx) {
      const md = S(a.content) || (a.from_path ? (await readAsText(S(a.from_path))).text : '');
      if (!md) throw new Error('Provide content or from_path');
      const base = `outputs/${
        S(a.name)
          .replace(/[^\w.-]+/g, '-')
          .replace(/\.(md|docx|pptx|pdf|html)$/i, '') || 'rapport'
      }`;
      const title = S(a.title) || S(a.name);
      const formats = (
        Array.isArray(a.formats) && a.formats.length ? a.formats.map(S) : ['docx', 'html']
      ).map((f) => (f === 'pdf' ? 'html' : f));
      const out: string[] = [];
      for (const f of [...new Set(formats)]) {
        const path = uniquePath(`${base}.${f}`);
        if (f === 'docx')
          writeBytes(
            path,
            markdownToDocx(md, S(a.title) || undefined, resolveImage),
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          );
        else if (f === 'pptx')
          writeBytes(
            path,
            housePptx(md, S(a.title) || undefined),
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          );
        else if (f === 'html')
          writeText(path, printableHtml(title, marked.parse(inlineImages(md), { async: false }) as string));
        else if (f === 'eml') {
          // Colour mail in the house style: .eml draft (Outlook) + the same mail as .html.
          const mail = houseMailHtml(title, marked.parse(inlineImages(md), { async: false }) as string);
          writeText(path, emlFromHtml(title, mail));
          const mh = uniquePath(`${base}.mail.html`);
          writeText(mh, mail);
          out.push(mh);
        } else writeText(path, md);
        out.push(path);
      }
      const html = out.find((p) => p.endsWith('.html'));
      if (html)
        saveArtifact(ctx.sessionId, {
          name: html.split('/').pop()!,
          type: 'html',
          content: getFile(html)!.data,
        });
      return ok(
        out.join(', '),
        `Exported: ${out.join(', ')}${html ? ' (open the HTML and use "Print → Save as PDF" for a PDF)' : ''}`,
      );
    },
  },
  {
    name: 'data.export',
    description:
      'Run a data query (same spec as data.query) or take a whole data file, and save the result as a NEW file in outputs/ (xlsx, csv or json). Never modifies the source file.',
    parameters: obj(
      {
        path: str('Source data file'),
        sheet: str('Excel sheet (optional)'),
        name: str('Output base name, e.g. "synthese-agences"'),
        title: str('Title shown in the house-style band of the Excel file'),
        chart: {
          type: 'string',
          enum: ['none', 'bar', 'line', 'pie'],
          description:
            'Optional NATIVE Excel chart (no image, no matplotlib) in the theme palette: first text column = categories, numeric columns = series (pie: first numeric column, max 30 rows plotted)',
        },
        format: { type: 'string', enum: ['xlsx', 'csv', 'json'] },
        query: {
          type: 'object',
          description: 'Optional data.query spec: filters, groupBy, aggregations, select, sort, limit',
        },
        ...THEME_PARAMS,
      },
      ['path', 'name'],
    ),
    risk: 'read',
    readOnly: false,
    label: (a) => `Exporter ${S(a.name)}.${S(a.format) || 'xlsx'}`,
    async run(a) {
      const ds = loadDataset(S(a.path), S(a.sheet) || undefined);
      const r = a.query
        ? data.query(ds, QuerySpecSchema.parse(coerceQuery({ limit: 100_000, ...(a.query as object) })))
        : { columns: ds.columns, rows: ds.rows as Record<string, unknown>[], rowCount: ds.rows.length };
      const fmt = (S(a.format) || 'xlsx') as 'xlsx' | 'csv' | 'json';
      const path = uniquePath(`outputs/${S(a.name).replace(/[^\w.-]+/g, '-') || 'export'}.${fmt}`);
      writeBytes(
        path,
        data.exportRows(r.columns, r.rows, fmt, {
          title: S(a.title) || S(a.name) || 'Export',
          subtitle: `Source : ${S(a.path)}${a.query ? ' (filtré)' : ''}`,
          chart: (['bar', 'line', 'pie'].includes(S(a.chart)) ? S(a.chart) : 'none') as
            'bar' | 'line' | 'pie' | 'none',
        }),
      );
      // A dashboard image CLONED photo-faithfully: the reproduction with these exact figures, as an HTML page and as a
      // first « Tableau de bord » sheet (picture) in the workbook.
      if (a.clone && typeof a.clone === 'object') {
        const spec = a.clone as DashSpec;
        const cd = cloneData(S(a.title) || S(a.name) || 'Tableau de bord', r.columns, r.rows);
        const dash = uniquePath(`outputs/${S(a.name).replace(/[^\w.-]+/g, '-') || 'export'}-tableau-de-bord.html`);
        writeText(dash, renderCloneHtml(spec, cd, S(a.layoutSource) || undefined));
        let sheet = '';
        if (fmt === 'xlsx' && typeof document !== 'undefined') {
          try {
            const W = 1400;
            const H = Math.round(W / spec.aspect);
            const img = await rasterise(renderCloneSvg(spec, cd, W), W, H);
            const f = getFile(path);
            const withSheet = f ? addImageSheet(bytesOf(f), { png: img.png, width: W, height: H }) : null;
            if (withSheet) {
              writeBytes(path, withSheet, f!.mime);
              sheet = ' (feuille « Tableau de bord » en tête du classeur)';
            }
          } catch {
            /* the HTML reproduction is still there */
          }
        }
        return ok(`${r.rowCount} lignes → ${path}${sheet} + ${dash}`, `Saved ${r.rowCount} rows to ${path}${sheet} and the photo-faithful reproduction of the chosen dashboard to ${dash}.`);
      }
      // A design copied from the Internet: its layout is rebuilt with these exact figures as an HTML dashboard.
      if (a.layout && typeof a.layout === 'object') {
        const l = a.layout as DesignLayout;
        const dash = uniquePath(`outputs/${S(a.name).replace(/[^\w.-]+/g, '-') || 'export'}-tableau-de-bord.html`);
        writeText(dash, renderLayoutHtml(l, { ...dashboardData(S(a.title) || S(a.name) || 'Tableau de bord', r.columns, r.rows, l.kpis.count || 4), subtitle: `Source : ${S(a.path)}` }, S(a.layoutSource) || undefined));
        return ok(`${r.rowCount} lignes → ${path} + ${dash}`, `Saved ${r.rowCount} rows to ${path} and the dashboard reproducing the chosen design to ${dash}.`);
      }
      return ok(`${r.rowCount} lignes → ${path}`, `Saved ${r.rowCount} rows to ${path}.`);
    },
  },
  // ── MASSAMBA Intelligence Engine tools ───────────────────────────────────
  {
    name: 'decision.simulate',
    description:
      'Decision simulator + counterfactuals: compare options with an outcome formula under scenarios (optimistic / central / stress / failure by default, or yours with variable shocks and probabilities). Returns the table, expected value, worst case, critical variables and the change that would flip the decision.',
    parameters: obj(
      {
        formula: str('Outcome formula over the variables, e.g. "volume*marge - cout - perte*exposition"'),
        goal: { type: 'string', enum: ['max', 'min'] },
        options: {
          type: 'array',
          items: obj(
            { name: { type: 'string' }, vars: { type: 'object', additionalProperties: { type: 'number' } } },
            ['name', 'vars'],
          ),
        },
        scenarios: {
          type: 'array',
          items: obj(
            {
              name: { type: 'string' },
              shocks: {
                type: 'object',
                additionalProperties: { type: 'number' },
                description: 'variable → multiplier',
              },
              probability: { type: 'number' },
            },
            ['name', 'shocks'],
          ),
        },
      },
      ['formula', 'options'],
    ),
    risk: 'read',
    readOnly: true,
    label: () => 'Simulation de décision',
    async run(a) {
      const out = simulateDecision(a as unknown as DecisionInput);
      return ok('simulation', out, { output: out });
    },
  },
  {
    name: 'info.value',
    description:
      'Information value engine: rank the missing pieces of information by expected value (impact on the decision × current uncertainty) per unit of cost, to obtain the most valuable first.',
    parameters: obj(
      {
        items: {
          type: 'array',
          items: obj(
            {
              question: { type: 'string' },
              impact: { type: 'number' },
              uncertainty: { type: 'number' },
              cost: { type: 'number' },
            },
            ['question', 'impact', 'uncertainty', 'cost'],
          ),
        },
      },
      ['items'],
    ),
    risk: 'read',
    readOnly: true,
    label: () => 'Valeur de l’information',
    async run(a) {
      return ok('classement', rankInformation((a.items as InfoItem[]) ?? []));
    },
  },
  {
    name: 'knowledge.query',
    description:
      'Personal knowledge graph: what is known about a file, decision, model, agent or subject — which missions read / wrote it, with which model, outcome, and the recorded decisions (why).',
    parameters: obj({ query: str('Subject, file name, decision…') }, ['query']),
    risk: 'read',
    readOnly: true,
    label: (a) => `Graphe de connaissances : ${S(a.query)}`,
    async run(a) {
      const st = useStore.getState();
      const g = buildGraph(st.ledger, getFile('.ai/DECISIONS.md')?.data ?? '', Object.keys(files()));
      return ok(`${g.nodes.size} nœuds`, queryGraph(g, S(a.query)));
    },
  },
  {
    name: 'project.twin',
    description:
      'Digital twin of the workspace: components by kind, dependencies between files (imports, scripts, data used), most depended-on files.',
    parameters: obj({}),
    risk: 'read',
    readOnly: true,
    label: () => 'Jumeau numérique du projet',
    async run() {
      return ok('jumeau numérique', twinSummary(workspaceTwin()));
    },
  },
  {
    name: 'project.impact',
    description:
      'Before modifying a file: simulate the impact — files that depend on it (transitively), missions that produced or used it, regression checks that protect it.',
    parameters: obj({ path: str('Workspace path') }, ['path']),
    risk: 'read',
    readOnly: true,
    label: (a) => `Impact de ${S(a.path)}`,
    async run(a) {
      const p = normPath(S(a.path));
      const t = workspaceTwin();
      const imp = impactOf(t, p);
      const st = useStore.getState();
      const missions = st.ledger.entries
        .filter((e) => e.files.written.includes(p) || e.files.read.includes(p))
        .slice(-6);
      const checks = regressionSuite(st.ledger).filter((c) => c.files.includes(p));
      return ok(
        `${imp.length} dépendant(s)`,
        `Impact of changing ${p}:\nDependents (re-test): ${imp.join(', ') || 'none'}\nUses: ${(t.deps[p] ?? []).join(', ') || 'none'}\nMissions: ${missions.map((m) => `${m.verdict} — ${m.goal.slice(0, 80)}`).join(' | ') || 'none'}\nRegression checks: ${checks.map((c) => `${c.name} ($ ${c.command})`).join(' | ') || 'none'}`,
      );
    },
  },
  {
    name: 'regression.run',
    description:
      'Living regression suite: re-run the checks that previous successful missions recorded (terminal commands with expected output), optionally only those protecting given files.',
    parameters: obj({ paths: { type: 'array', items: { type: 'string' } } }),
    risk: 'execute',
    readOnly: false,
    label: () => 'Suite de non-régression',
    async run(a) {
      const want = Array.isArray(a.paths) ? a.paths.map((x) => normPath(S(x))) : [];
      const suite = regressionSuite(useStore.getState().ledger).filter(
        (c) => !want.length || c.files.some((f) => want.includes(f)),
      );
      if (!suite.length) return ok('aucun contrôle', 'No stored regression check for these files yet.');
      const lines: string[] = [];
      let fails = 0;
      for (const c of suite.slice(0, 25)) {
        const r = await agentShell.exec(c.command);
        const pass = r.code === 0 && (!c.expect || r.out.includes(c.expect));
        if (!pass) fails++;
        lines.push(
          `${pass ? 'PASS' : 'FAIL'} — ${c.name} ($ ${c.command})${pass ? '' : ` → ${r.out.slice(0, 200)}`}`,
        );
      }
      return {
        ok: fails === 0,
        summary: `${suite.length - fails}/${suite.length} OK`,
        forModel: lines.join('\n'),
      };
    },
  },
  {
    name: 'manual.add',
    description:
      "Add a rule to the user's Personal Operating Manual (applied to every future task): standard, preference, method, forbidden, favorite. Only for durable rules the user stated or clearly validated.",
    parameters: obj(
      {
        kind: { type: 'string', enum: ['standard', 'preference', 'method', 'forbidden', 'favorite'] },
        rule: str('The rule'),
      },
      ['kind', 'rule'],
    ),
    risk: 'read',
    readOnly: false,
    label: (a) => `Manuel : ${S(a.rule).slice(0, 60)}`,
    async run(a) {
      const st = useStore.getState();
      if (st.manual.some((m) => m.rule === S(a.rule)))
        return ok('déjà présent', 'Rule already in the manual.');
      st.setManual([
        ...st.manual,
        {
          id: uid(),
          kind: S(a.kind) as ManualKind,
          rule: S(a.rule).slice(0, 400),
          at: Date.now(),
          source: 'agent',
        },
      ]);
      return ok('règle ajoutée', 'Rule added to the Personal Operating Manual.');
    },
  },
  {
    name: 'timemachine.list',
    description: 'Time Machine: restorable states saved automatically before each task that modified files.',
    parameters: obj({}),
    risk: 'read',
    readOnly: true,
    label: () => 'Time Machine',
    async run() {
      const l = await listCheckpoints();
      return ok(
        `${l.length} point(s)`,
        l
          .map(
            (c) =>
              `${c.id} — ${new Date(c.at).toLocaleString('fr-FR')} — « ${c.goal.slice(0, 80)} » — ${Object.keys(c.before).length} fichier(s)`,
          )
          .join('\n') || 'No checkpoint yet.',
      );
    },
  },
  {
    name: 'timemachine.diff',
    description:
      'Functional diff between the state before a task (checkpoint id) and now: files, functions added / removed, impacted components, tests to run.',
    parameters: obj({ id: str('Checkpoint id') }, ['id']),
    risk: 'read',
    readOnly: true,
    label: (a) => `Différences depuis ${S(a.id)}`,
    async run(a) {
      return ok('différences', await diffCheckpoint(S(a.id)));
    },
  },
  {
    name: 'timemachine.restore',
    description:
      'Restore every file touched by a task to its state before that task (files it created are removed).',
    parameters: obj({ id: str('Checkpoint id') }, ['id']),
    risk: 'delete',
    readOnly: false,
    label: (a) => `Restaurer ${S(a.id)}`,
    async run(a) {
      const r = await restoreCheckpoint(S(a.id));
      return ok(`${r.length} fichier(s) restauré(s)`, `Restored: ${r.join(', ')}`);
    },
  },
  // ── Embedded terminal and browser ────────────────────────────────────────
  {
    name: 'terminal.execute',
    description:
      'Run a command in the embedded terminal over the workspace: ls, cd, cat, head/tail, grep -rn, find, wc, sort | uniq -c, cut, sed s///g, echo > file, cp/mv/rm, mkdir, tree, node FILE | node -e CODE (fs reads text AND binary files, Buffer, await readText(path) = text of a PDF/Word), python FILE | python -c CODE (sandbox: pandas, openpyxl, pypdf; offline when the Python pack is imported), doctor (what is available: node, Python, network), curl URL [-o file], data FILE (profile a spreadsheet), open FILE (embedded browser). Pipes, redirections, && || ; and globs work. No real OS: npm/git/pip are not available in this edition.',
    parameters: obj({ command: str('Command line') }, ['command']),
    risk: 'execute',
    assess: (a: Record<string, unknown>) => shellRisk(S(a.command)),
    readOnly: false,
    label: (a) => `$ ${S(a.command).slice(0, 80)}`,
    async preview(a) {
      return { text: S(a.command) };
    },
    async run(a) {
      const r = await agentShell.exec(S(a.command));
      const d = diagnose(r.out, r.code);
      const text = `${r.out || '(no output)'}\n[exit ${r.code} · cwd /${r.cwd}]${d && r.code !== 127 ? formatDiagnosis(d) : ''}`;
      return {
        ok: r.code === 0,
        summary: `exit ${r.code}`,
        forModel: clip(text, 40_000),
        error: r.code ? `exit ${r.code}` : undefined,
      };
    },
  },
  {
    name: 'browser.open',
    description:
      'Open a page in the embedded browser: a workspace HTML file (e.g. apps/x.html — fully interactive, isolated) or an http(s) URL (read-only reader mode). Returns a snapshot: interactive elements with refs + page text.',
    parameters: obj({ target: str('Workspace path or URL') }, ['target']),
    risk: 'read',
    readOnly: true,
    label: (a) => `Ouvrir ${S(a.target)}`,
    async run(a) {
      const snap = await browser.open(S(a.target));
      return ok(snap.title || S(a.target), snapshotText(snap));
    },
  },
  {
    name: 'browser.snapshot',
    description: 'Current page of the embedded browser: interactive elements (with refs) and visible text.',
    parameters: obj({}),
    risk: 'read',
    readOnly: true,
    label: () => 'Lire la page',
    async run() {
      const snap = await browser.snapshot();
      return ok(snap.title, snapshotText(snap));
    },
  },
  {
    name: 'browser.click',
    description:
      'Click an element by ref (from the last snapshot). Downloads triggered by the click are saved to downloads/.',
    parameters: obj({ ref: str('Element ref, e.g. e12') }, ['ref']),
    risk: 'read',
    readOnly: false,
    label: (a) => `Cliquer ${S(a.ref)}`,
    async run(a) {
      const r = await browser.click(S(a.ref));
      return ok(r.downloads.length ? `${r.downloads.length} téléchargement(s)` : 'clic', browserAct(r));
    },
  },
  {
    name: 'browser.type',
    description: 'Type text into an input / textarea by ref (submit=true presses Enter / submits the form).',
    parameters: obj({ ref: str('Element ref'), text: str('Text'), submit: { type: 'boolean' } }, [
      'ref',
      'text',
    ]),
    risk: 'read',
    readOnly: false,
    label: (a) => `Saisir dans ${S(a.ref)}`,
    async run(a) {
      return ok('saisie', browserAct(await browser.type(S(a.ref), S(a.text), Boolean(a.submit))));
    },
  },
  {
    name: 'browser.select',
    description: 'Choose an option of a <select> by ref.',
    parameters: obj({ ref: str('Element ref'), value: str('Option value') }, ['ref', 'value']),
    risk: 'read',
    readOnly: false,
    label: (a) => `Choisir ${S(a.value)}`,
    async run(a) {
      return ok('sélection', browserAct(await browser.select(S(a.ref), S(a.value))));
    },
  },
  {
    name: 'browser.upload',
    description:
      "Put a workspace file into an <input type=file> of the page (ref) — e.g. load the user's Excel into a generated app to test it.",
    parameters: obj({ ref: str('Ref of the file input'), path: str('Workspace file') }, ['ref', 'path']),
    risk: 'read',
    readOnly: false,
    label: (a) => `Charger ${S(a.path)}`,
    async run(a) {
      return ok('fichier chargé', browserAct(await browser.upload(S(a.ref), S(a.path))));
    },
  },
  {
    name: 'browser.scroll',
    description: 'Scroll the page (dy pixels, default 600).',
    parameters: obj({ dy: { type: 'number' } }),
    risk: 'read',
    readOnly: false,
    label: () => 'Défiler',
    async run(a) {
      return ok('défilement', browserAct(await browser.scroll(Number(a.dy) || 600)));
    },
  },
  {
    name: 'browser.back',
    description: 'Go back to the previous page.',
    parameters: obj({}),
    risk: 'read',
    readOnly: true,
    label: () => 'Page précédente',
    async run() {
      const snap = await browser.back();
      return ok(snap.title, snapshotText(snap));
    },
  },
  {
    name: 'browser.console',
    description:
      'Console messages and page errors of the embedded browser, plus the files downloaded so far.',
    parameters: obj({}),
    risk: 'read',
    readOnly: true,
    label: () => 'Console du navigateur',
    async run() {
      const st = browser.state;
      return ok(
        `${st.console.length} message(s)`,
        `Console (last 80):\n${st.console.slice(-80).join('\n') || '(empty)'}\n\nDownloads:\n${st.downloads.map((d) => `${d.path} (${d.size} bytes)`).join('\n') || '(none)'}`,
      );
    },
  },
  // ── APEX Studio: offline business apps in the house method ──────────────
  {
    name: 'apex.guide',
    description:
      'APEX method + house export style + the house kit API (shell ids, 3D visuals, Excel/Word/PowerPoint/mail functions). Read it FIRST before building any business application, dashboard or reporting app.',
    parameters: obj({}),
    risk: 'read',
    readOnly: true,
    label: () => 'Guide APEX',
    async run() {
      const g = apexGuide(getHouseKit());
      return ok(getHouseKit() ? 'méthode + kit maison' : 'méthode (kit maison absent)', g);
    },
  },
  {
    name: 'apex.reference',
    description:
      'Read the complete reference application of the house method (part 1..N), or a domain reference document (doc: e.g. "credit-risk", "classification-bceao-ifrs9").',
    parameters: obj({
      part: { type: 'number', description: 'Part number, from 1' },
      doc: str('Domain document name'),
    }),
    risk: 'read',
    readOnly: true,
    label: (a) => (a.doc ? `Référence ${S(a.doc)}` : `Application de référence, partie ${S(a.part) || 1}`),
    async run(a) {
      const kit = getHouseKit();
      if (!kit) throw new Error('Kit maison absent de cette version de MASSAMBA (voir apex.guide).');
      if (a.doc) {
        const d = kit.domain[S(a.doc)];
        if (!d) throw new Error(`Document inconnu. Disponibles : ${Object.keys(kit.domain).join(', ')}`);
        return ok(`référence ${S(a.doc)}`, d);
      }
      const r = referencePart(kit, Number(a.part) || 1);
      return ok(
        `partie ${Number(a.part) || 1}/${r.parts}`,
        `[part ${Number(a.part) || 1} of ${r.parts}]\n${r.text}`,
      );
    },
  },
  {
    name: 'apex.build_app',
    description:
      'Assemble a single-file OFFLINE application in the house method: house shell + vendor libraries (xlsx-js-style, Chart.js, JSZip, PptxGenJS) + logo + 3D export kit + YOUR application script. Give the script (app_js, or from_path to a .js file you wrote). Writes apps/<name>.html, checks the syntax and opens a preview. Then run apex.qa.',
    parameters: obj(
      {
        name: str('File base name, e.g. "suivi-impayes"'),
        app_js: str(
          'The application script (replaces /*@@APP@@*/): const KIT={...}; toast(); views; exports',
        ),
        from_path: str('Or: path of a .js file in the workspace containing the script'),
      },
      ['name'],
    ),
    risk: 'write',
    readOnly: false,
    label: (a) => `Assembler l’application ${S(a.name)}.html`,
    async run(a, ctx) {
      const kit = getHouseKit();
      if (!kit) throw new Error('Kit maison absent de cette version de MASSAMBA (voir apex.guide).');
      const js = a.from_path ? (await readAsText(S(a.from_path))).text : S(a.app_js);
      if (!js.trim()) throw new Error('app_js (ou from_path) est vide.');
      const issues = lintApp(js);
      const syn = syntaxError(js);
      if (syn) issues.unshift(`Erreur de syntaxe : ${syn}`);
      if (issues.length) throw new Error(`Application refusée :\n- ${issues.join('\n- ')}`);
      const base =
        S(a.name)
          .replace(/[^\w.-]+/g, '-')
          .replace(/\.html?$/i, '') || 'application';
      if (!a.from_path) writeText(`apps/${base}.app.js`, js);
      const html = assembleApp(kit, js);
      const path = `apps/${base}.html`;
      writeText(path, html);
      const art = saveArtifact(ctx.sessionId, { name: `${base}.html`, type: 'html', content: html });
      return ok(
        `${path} (${Math.round(html.length / 1024)} Ko)`,
        `Built ${path} (${html.length} bytes, fully offline). Script saved as apps/${base}.app.js. Now call apex.qa {path:"${path}"} and fix any error before delivering.`,
        { artifact: art.id },
      );
    },
  },
  {
    name: 'apex.qa',
    description:
      'Run a generated HTML application in an isolated frame for a few seconds and report page errors and which kit libraries are loaded. Use after apex.build_app (or on any .html app).',
    parameters: obj({ path: str('apps/<name>.html') }, ['path']),
    risk: 'read',
    readOnly: true,
    label: (a) => `Contrôle qualité de ${S(a.path)}`,
    async run(a) {
      const html = (await readAsText(S(a.path))).text;
      const r = await qaInFrame(html);
      const missing = Object.entries(r.globals)
        .filter(([, t]) => t === 'undefined')
        .map(([k]) => k);
      const verdict = r.errors.length ? 'FAILED' : missing.length ? 'PARTIAL' : 'PASSED';
      return ok(
        `${verdict} — ${r.errors.length} erreur(s)`,
        `QA ${verdict} for ${S(a.path)} — title "${r.title}"\nPage errors: ${r.errors.length ? r.errors.join(' | ') : 'none'}\nGlobals: ${JSON.stringify(r.globals)}${missing.length ? `\nMissing: ${missing.join(', ')}` : ''}\nNot verified automatically: loading a real file and clicking each export (ask the user to try them in the preview).`,
      );
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
