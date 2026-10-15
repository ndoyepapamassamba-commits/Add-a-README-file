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
  normName,
  queryColumns,
  type Dataset,
  type QuerySpec,
} from '../../server/services/dataCore';
import { DICT_SHEET, dictionaryFrom, missingText, resolveColumnSmart, resolveQuery, schemaPacket, shapeSignature, type LexiconCtx } from '../../server/services/dataLexicon';
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
import { imageSize as pngSize } from '../../server/services/officeCore';
import { emlFromHtml } from '../../server/services/houseStyle';
import { allRecos, checkDepth, normalizeDossier, todayFr, type Dossier } from '../../server/services/dossier/dossier';
import { dossierFromMarkdown } from '../../server/services/dossier/dossierFromMarkdown';
import { dossierDocx } from '../../server/services/dossier/dossierDocx';
import { dossierPptx } from '../../server/services/dossier/dossierPptx';
import type { DossierData } from '../../server/services/dossier/dossierXlsx';
import { dossierHtml, dossierMailHtml } from '../../server/services/dossier/dossierHtml';
import {
  composeSystemPrompt,
  composeUserPrompt,
  deepenPrompt,
  dossierFromBrief,
  dossierSummaryMarkdown,
  parseDossierJson,
  verifyAgainstBrief,
  type ComposeInput,
  type ResearchNote,
} from '../../server/services/dossier/dossierCompose';
import { applyJudgments, chaptersFromPlan, dossierQuestions, dossierState, planQuestions, planState } from '../../server/services/dossier/dossierJudge';
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
import { THEME_PARAMS, activeDesign } from '../../server/services/houseDesign';
import { briefToMarkdown, buildBrief, checkNarrative, type Brief } from '../../server/services/reportBrief';
import { hintQuestions, hintsFromAnswers, hintsLocal, hintsText } from '../../server/services/reportHints';
import { callJevQuestions } from '../../server/jev/provider';
import { getJevKey, jevSettings } from './jev';
import { chart3dSvg, paletteOf, synthesisSvg } from '../../server/services/chart3d';
import { dashboardData, renderLayoutHtml, type DesignLayout } from '../../server/services/layoutClone';
import { BRAVE_DIRECT, braveText, braveUrl, parseBrave } from '../../server/jev/web/brave';
import { errorSignature, guidance, jsSyntaxError } from '../../server/jev/code/errorHints';
import {
  recall as recallKnowledge,
  remember as rememberKnowledge,
  sourcesOf,
  touch as touchKnowledge,
  type KnowledgeDomain,
} from '../../server/jev/knowledge/learned';
import {
  PROVIDER_LABEL,
  parseSerper,
  parseTavily,
  serperRequest,
  tavilyRequest,
} from '../../server/jev/web/search';
import { diagnose, formatDiagnosis } from '../../server/tools/diagnose';

/** Result of a browser action for the model: new downloads, errors, then the page. */
function browserAct(r: { snap: BrowserSnapshot; downloads: { path: string; size: number }[] }): string {
  const errors = browser.state.console.filter((c) => c.startsWith('error')).slice(-5);
  return `${r.downloads.length ? `Downloaded: ${r.downloads.map((d) => `${d.path} (${d.size} bytes)`).join(', ')}\n` : ''}${errors.length ? `Recent page errors: ${errors.join(' | ')}\n` : ''}${snapshotText(r.snap, 5000)}`;
}
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

/** Natural size of an image (data URL) — for the logo in the 3D board. */
function imageSize(href: string): Promise<{ href: string; width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ href, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(undefined);
    img.src = href;
  });
}
/** Workspace images referenced as ![alt](path) in Markdown. */
import { DEFAULT_AUTO_TIERS } from '../../server/services/settings';
import type { ModelInfo } from '@shared/types';
import { complete } from './llm';
import type { ChatMessage } from '../../server/llm/types';
import { callTool, type McpToolInfo } from './mcp';
import { runInWorkspace } from './run';
import { uid, useStore } from './store';
import { frontendDesignLint, isHtmlDocument, lintReport, lintSummary } from '../../server/services/frontendDesignLint';
import { diffReport, pixelDiff } from '../../server/services/visualDiff';
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

/** Consecutive identical execution errors per chat (blind retries are called out). */
const lastErr = new Map<string, { sig: string; n: number }>();
function noteError(sid: string | undefined, error: string | null): number {
  const k = sid ?? '_';
  if (!error) {
    lastErr.delete(k);
    return 0;
  }
  const sig = errorSignature(error);
  const prev = lastErr.get(k);
  const n = prev && prev.sig === sig ? prev.n + 1 : 1;
  lastErr.set(k, { sig, n });
  return n;
}

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
/**
 * FRONTEND DESIGN CHECK (skill `frontend-design`): every HTML page the agent writes is checked for the tells of a
 * generated page and the quality floor (mobile, keyboard focus, reduced motion). Runs while the skill is enabled in the
 * library; turning the skill off turns the check off. Advice for the model, appended to the tool result — never a refusal.
 */
function designCheck(path: string, content: string): { summary: string; forModel: string } | null {
  if (!isHtmlDocument(path, content)) return null;
  if (!useStore.getState().skills.some((s) => s.name === 'frontend-design' && s.enabled)) return null;
  const findings = frontendDesignLint(content);
  return { summary: lintSummary(findings), forModel: lintReport(findings) };
}
const clip = (s: string, n = 60_000) =>
  s.length > n ? `${s.slice(0, n)}\n…[${s.length - n} caractères tronqués]` : s;

const data = new DataCore();
import type { DashSpec } from '../../server/services/dashClone';
import { cloneData, dashFit, renderCloneHtml } from '../../server/services/dashRender';
import { heavy } from './heavy';
import { rasterise } from './designClone';
// Parsed datasets are KEPT (v48: a 4,4 Mo workbook was re-read for each of ~150 queries). Key = file + version + sheet.
const dsCache = new Map<string, Dataset>();
let lastDataPath = '';
/** Sandbox logs without the Python package-loading messages (kept: everything the code printed). */
export function cleanSandboxLogs(logs: string[]): string {
  return logs
    .join('\n')
    .split('\n')
    .filter((l) => !/^(\[stderr\] )?(\S+ already loaded from \S+|No new packages to load|Loading \S+(, \S+)*$|Loaded \S+(, \S+)*$|Didn't find package \S+)/.test(l.trim()))
    .join('\n')
    .trim();
}
function loadDataset(path: string, sheet?: string): Dataset {
  // A forgotten path re-uses the last data file of the session (v48: « Chemin vide » ×10).
  const p = path.trim() || lastDataPath;
  if (!p) throw new Error('Chemin du fichier de données manquant (paramètre « path », ex. « uploads/Provisions.xlsx »).');
  const f = getFile(p);
  if (!f) throw new Error(`Fichier introuvable : ${p}`);
  if (!isDataFile(f.path))
    throw new Error(`${f.path} n'est pas un fichier de données (csv, tsv, xlsx, xls, json, jsonl)`);
  lastDataPath = f.path;
  const key = `${f.path}|${f.size}|${f.updatedAt}|${sheet ?? ''}`;
  const hit = dsCache.get(key);
  if (hit) return hit;
  const ds = data.parseBytes(f.path, bytesOf(f), sheet ?? null);
  if (dsCache.size >= 8) dsCache.delete(dsCache.keys().next().value!);
  dsCache.set(key, ds);
  return ds;
}
/** The file's own dictionary sheet (« ColumnDescription »…: column → description), looked for once per file version. */
const dictCache = new Map<string, { dict: Record<string, string> | null; sheet: string | null }>();
export function dictionaryOfFile(ds: Dataset): { dict: Record<string, string> | null; sheet: string | null } {
  const f = getFile(ds.path);
  if (!f || ds.sheets.length < 2) return { dict: null, sheet: null };
  const key = `${f.path}|${f.size}|${f.updatedAt}|${ds.sheet ?? ''}`;
  const hit = dictCache.get(key);
  if (hit) return hit;
  let out: { dict: Record<string, string> | null; sheet: string | null } = { dict: null, sheet: null };
  for (const s of ds.sheets.filter((x) => x !== ds.sheet && DICT_SHEET.test(x)).slice(0, 3))
    try {
      const d = loadDataset(ds.path, s);
      const dict = d.rows.length <= 2000 ? dictionaryFrom(d, ds.columns) : null;
      if (dict) {
        out = { dict, sheet: s };
        break;
      }
    } catch {
      /* an unreadable sheet is not a dictionary */
    }
  dictCache.set(key, out);
  return out;
}
/** What the app knows of this file SHAPE: its dictionary and the aliases learned on it (kept in this browser only). */
function lexiconOf(ds: Dataset): LexiconCtx & { sig: string } {
  const sig = shapeSignature(ds.columns);
  return { sig, dict: dictionaryOfFile(ds).dict ?? undefined, aliases: useStore.getState().settings.columnAliases?.[sig] };
}
/** Asks that were ambiguous, per file shape: the column the next successful query uses among the candidates is LEARNED. */
const pendingAsks = new Map<string, { name: string; candidates: string[] }[]>();
function learnAliases(sig: string, query: Record<string, unknown>) {
  const used = new Set(queryColumns(query));
  // USAGE MEMORY: the columns the analyses of this file shape really use (shown first on the portfolio card next time).
  if (used.size) {
    const st = useStore.getState();
    const all = { ...(st.settings.columnUsage ?? {}) };
    const cur = { ...(all[sig] ?? {}) };
    for (const c of used) cur[c] = (cur[c] ?? 0) + 1;
    all[sig] = cur;
    // Bounded: the 40 most recent file shapes.
    const keys = Object.keys(all);
    if (keys.length > 40) delete all[keys[0]!];
    st.patchSettings({ columnUsage: all });
  }
  const pend = pendingAsks.get(sig);
  if (!pend?.length) return;
  const learned: Record<string, string> = {};
  for (const p of pend) {
    const hit = p.candidates.filter((c) => used.has(c));
    if (hit.length === 1) learned[normName(p.name)] = hit[0]!;
  }
  pendingAsks.set(sig, pend.filter((p) => !learned[normName(p.name)]));
  if (!Object.keys(learned).length) return;
  const st = useStore.getState();
  const all = { ...(st.settings.columnAliases ?? {}) };
  all[sig] = { ...(all[sig] ?? {}), ...learned };
  st.patchSettings({ columnAliases: all });
}
/**
 * The dataset and the VALID query a model meant (v62 — ESN chat: a dozen failed data.query in a row): the query shape
 * is forgiven (coerceQuery), column names are resolved by the lexicon (business words, the file's dictionary sheet,
 * aliases learned on this file shape), a sort on an aggregation output works; when no sheet was given and the columns
 * live in ANOTHER sheet, that sheet is used (and said). What cannot be resolved is an error naming, per column, the
 * short list to choose from — the model fixes its query in one step instead of looping.
 */
class AmbiguousColumns extends Error {
  constructor(
    message: string,
    readonly ds: Dataset,
    readonly items: { name: string; candidates: string[] }[],
  ) {
    super(message);
  }
}
function prepareQuery(path: string, sheet: string | undefined, raw: unknown, defaults: Record<string, unknown> = {}, extra: Record<string, string> = {}): { ds: Dataset; spec: QuerySpec; note: string } {
  const spec = { ...defaults, ...((coerceQuery(raw) as Record<string, unknown>) ?? {}) };
  const ds = loadDataset(path, sheet);
  const attempt = (d: Dataset) => {
    const lx = lexiconOf(d);
    if (Object.keys(extra).length) lx.aliases = { ...(lx.aliases ?? {}), ...extra };
    return { d, lx, r: resolveQuery(spec, d.columns, lx) };
  };
  let a = attempt(ds);
  let note = '';
  if (a.r.missing.length && !sheet)
    for (const other of ds.sheets.filter((x) => x !== ds.sheet && !DICT_SHEET.test(x))) {
      const b = attempt(loadDataset(path, other));
      if (!b.r.missing.length) {
        a = b;
        note = `(feuille « ${other} » utilisée : les colonnes demandées s'y trouvent)\n`;
        break;
      }
    }
  if (a.r.missing.length) {
    const amb = a.r.missing.filter((m) => m.ambiguous);
    if (amb.length) pendingAsks.set(a.lx.sig, [...(pendingAsks.get(a.lx.sig) ?? []).filter((p) => !amb.some((m) => m.name === p.name)), ...amb.map((m) => ({ name: m.name, candidates: m.candidates }))]);
    const where = a.d.sheets.length > 1 ? ` (feuille « ${a.d.sheet} »)` : '';
    const msg = `Colonne(s) à préciser${where} : ${missingText(a.r.missing)}. Colonnes disponibles : ${a.d.columns.slice(0, 60).join(' | ')}${a.d.columns.length > 60 ? ' …' : ''}`;
    if (a.r.missing.every((m) => m.ambiguous)) throw new AmbiguousColumns(msg, a.d, a.r.missing.map((m) => ({ name: m.name, candidates: m.candidates })));
    throw new Error(msg);
  }
  const parsed = QuerySpecSchema.safeParse(a.r.query);
  if (!parsed.success)
    throw new Error(
      `Requête invalide : ${parsed.error.issues.map((i) => `${i.path.join('.')} — ${i.message}`).join(' ; ')}. Exemple valide : {"path":"${a.d.path}","sheet":"${a.d.sheet ?? ''}","filters":[{"column":"${a.d.columns[0] ?? 'Colonne'}","op":"eq","value":"…"}],"groupBy":[{"column":"${a.d.columns[0] ?? 'Colonne'}"}],"aggregations":[{"column":"*","fn":"count","as":"n"},{"column":"${a.d.columns[1] ?? 'Montant'}","fn":"sum","as":"total"}],"sort":[{"column":"total","dir":"desc"}],"limit":20}`,
    );
  learnAliases(a.lx.sig, a.r.query);
  if (a.r.mapped.length) note += `(colonnes interprétées : ${a.r.mapped.map((m) => `${m.from} → ${m.to}`).join(' ; ')})\n`;
  return { ds: a.d, spec: parsed.data, note };
}
/**
 * JEV ARBITER (v62, « aller vite ») — an AMBIGUOUS column (« Provision » = IFRS 9 or regulatory?) is settled by one JEV
 * System One judgment (a few hundred ms, ≈ 0 $) reading the user's request, instead of a full model round trip. Only a
 * confident pick (p ≥ 0.85, never « none ») is applied, and it is said; otherwise the short list goes back to the model.
 */
async function prepareQueryFast(ctx: ToolCtx, path: string, sheet: string | undefined, raw: unknown, defaults: Record<string, unknown> = {}): Promise<{ ds: Dataset; spec: QuerySpec; note: string }> {
  try {
    return prepareQuery(path, sheet, raw, defaults);
  } catch (e) {
    if (!(e instanceof AmbiguousColumns)) throw e;
    const cfg = jevSettings();
    const key = getJevKey();
    if (!key || !cfg.enabled) throw e;
    const sess = useStore.getState().sessions.find((x) => x.id === ctx.sessionId);
    const request = [...(sess?.items ?? [])].reverse().find((i) => i.kind === 'user') as { text?: string } | undefined;
    const { dict } = dictionaryOfFile(e.ds);
    const state = {
      request: String(request?.text ?? '').slice(0, 1500),
      file: e.ds.path.split('/').pop(),
      asks: e.items.map((it) => ({ asked: it.name, candidates: it.candidates.map((c) => ({ column: c, description: dict?.[c] ?? '' })) })),
    };
    const questions: Record<string, { type: 'choice'; instructions: string; criteria: Record<string, string> }> = {};
    e.items.forEach((it, i) => {
      const criteria: Record<string, string> = {};
      it.candidates.forEach((c, k) => (criteria[`c${k}`] = `the column « ${c} »${dict?.[c] ? ` — ${dict[c]}` : ''}`));
      criteria.none = 'none of these columns: the request does not say which one is meant';
      questions[`ask_${i}`] = { type: 'choice', instructions: `In \`asks[${i}]\`, the analyst wrote « ${it.name} » in a query on the data file, while working on the user's \`request\`. Which real column of the file did they mean?`, criteria };
    });
    const picks: Record<string, string> = {};
    let ms: number;
    try {
      const t0 = Date.now();
      const ans = await callJevQuestions(cfg, key, state, questions, (url, init) => fetch(url, init));
      ms = Date.now() - t0;
      acct.add(ctx.sessionId, { kind: 'jev1', step: 0, model: ans.model, tokensIn: ans.inputTokens, tokensOut: 0, cost: ans.costUsd, costSource: 'calculated', ms });
      e.items.forEach((it, i) => {
        const a = ans.answers[`ask_${i}`] as { choice?: string; confidence?: number; probabilities?: Record<string, number> } | undefined;
        const choice = a?.choice ?? '';
        const p = a?.probabilities?.[choice] ?? a?.confidence ?? 0;
        const k = /^c(\d+)$/.exec(choice);
        if (k && p >= 0.85 && it.candidates[Number(k[1])]) picks[normName(it.name)] = it.candidates[Number(k[1])]!;
      });
    } catch {
      throw e;
    }
    if (Object.keys(picks).length < e.items.length) throw e;
    const r = prepareQuery(path, sheet, raw, defaults, picks);
    return { ...r, note: `${r.note}(colonne ambiguë tranchée par JEV en ${ms} ms d'après la demande : ${e.items.map((it) => `${it.name} → ${picks[normName(it.name)]}`).join(' ; ')})\n` };
  }
}
/** One column name of a chart / brief resolved like a query column (business words, dictionary, learned aliases). */
function columnOf(ds: Dataset, name: string): string {
  const r = resolveColumnSmart(ds.columns, name, lexiconOf(ds));
  if (r.column) return r.column;
  throw new Error(`Colonne à préciser : ${missingText([{ name, candidates: r.candidates, ambiguous: !!r.ambiguous }])}. Colonnes disponibles : ${ds.columns.slice(0, 60).join(' | ')}`);
}
/** The PORTFOLIO CARD of a data file (columns, codes with their labels, dictionary, learned aliases), read locally. */
export function portfolioCard(ds: Dataset): string {
  const prof = data.profile(ds);
  const { dict, sheet } = dictionaryOfFile(ds);
  const lx = lexiconOf(ds);
  const cols = prof.columns.map((c) => {
    let codes: { value: string; count: number }[] | undefined;
    if ((c.type === 'integer' || c.type === 'number') && c.unique <= 40) {
      const m = new Map<string, number>();
      for (const r of ds.rows) {
        const v = r[c.name];
        if (v === null || v === undefined || v === '') continue;
        const k = String(v).trim();
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      codes = [...m.entries()].sort((x, y) => y[1] - x[1]).map(([value, count]) => ({ value, count }));
    }
    return { name: c.name, type: c.type, unique: c.unique, missing: c.missing, top: c.top, codes, sum: c.numeric?.sum };
  });
  const card = schemaPacket({ path: ds.path, sheet: ds.sheet, sheets: ds.sheets, rowCount: prof.rowCount, columns: cols, dict, dictSheet: sheet, aliases: lx.aliases, usage: useStore.getState().settings.columnUsage?.[lx.sig] });
  const num = prof.columns.filter((c) => c.numeric && c.unique > 40).map((c) => `${c.name}: sum ${Math.round(c.numeric!.sum).toLocaleString('fr-FR')} · min ${c.numeric!.min} · max ${c.numeric!.max}`);
  return `${card}${num.length ? `\nTotals (whole file — check every figure you write against a query): ${num.slice(0, 12).join(' ; ')}` : ''}${prof.anomalies.length ? `\nAnomalies: ${prof.anomalies.slice(0, 6).join(' ; ')}` : ''}`;
}

/** The data file a brief was computed on (path, sheet, measure, entity, the explanatory dimensions as selectors). */
function briefDataRef(b: Brief): Dossier['data'] {
  const m = /^(.*?)(?:\s\[(.+?)\])?(?:\s\(filtré\))?$/.exec(b.source.trim());
  const selectors = b.dims.filter((x) => x.dim !== b.entity && x.categories >= 2 && x.categories <= 80).map((x) => x.dim).slice(0, 4);
  return { path: (m?.[1] ?? b.source).trim(), sheet: m?.[2] || undefined, measure: b.measure ?? undefined, entity: b.entity ?? undefined, selectors };
}
/** The rows behind a dossier, for the workbook's selectors, live indicators and top 10 (null when unreadable). */
function dossierData(ref: Dossier['data']): DossierData | null {
  if (!ref?.path) return null;
  try {
    const ds = loadDataset(ref.path, ref.sheet);
    let { measure, entity, selectors } = ref;
    if (!measure || !selectors?.length) {
      const b = buildBrief(ds.columns, ds.rows as Record<string, unknown>[], { title: ref.path, source: ref.path, measure });
      measure = measure || b.measure || undefined;
      entity = entity || b.entity || undefined;
      selectors = selectors?.length ? selectors : briefDataRef(b)?.selectors;
    }
    return { columns: ds.columns, rows: ds.rows as Record<string, unknown>[], measure, entity, selectors, source: `${ds.path}${ds.sheet ? ` [${ds.sheet}]` : ''}` };
  } catch {
    return null;
  }
}
/** Depth issues of a dossier in one French line (the rules are code: no issue, no line). */
function depthNote(d: Dossier): string {
  const issues = checkDepth(d);
  return issues.length
    ? ` Profondeur : ${issues.length} point(s) sous la règle (${issues
        .slice(0, 4)
        .map((x) => `${x.where} : ${x.issue}`)
        .join(' ; ')}).`
    : ' Profondeur : règles tenues.';
}
/** Files written by the committee engine this session: already in the chosen design, the old post-processors skip them. */
export const HOUSE_FILES = new Set<string>();
/**
 * DOSSIER → FILES: the same structured dossier rendered in every format asked, in the ACTIVE theme (set around the
 * tool by the agent from the gallery choice, the settings or the `theme` parameter): workbook, deck, report, page, mail.
 */
async function renderDossier(
  d: Dossier,
  base: string,
  formats: string[],
  logo: { png: Uint8Array; width: number; height: number } | null,
  sessionId: string,
): Promise<{ out: string[]; html?: string }> {
  const out: string[] = [];
  const brand = [d.org, d.unit].filter(Boolean).join(' · ') || undefined;
  for (const f of [...new Set(formats)]) {
    const path = uniquePath(`${base}.${f}`);
    if (f === 'docx') writeBytes(path, dossierDocx(d, { logo, brand }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    else if (f === 'pptx') writeBytes(path, dossierPptx(d, { logo, brand }), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    // The workbook is built in the BACKGROUND thread (in the active theme): the page stays fluid on big files.
    else if (f === 'xlsx') writeBytes(path, await heavy('dossierXlsx', d, { data: dossierData(d.data), logo }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    else if (f === 'html') writeText(path, dossierHtml(d, { brand }));
    else if (f === 'eml') {
      // Colour mail in the theme: .eml draft (Outlook) + the same mail as .html.
      const mail = dossierMailHtml(d, { brand });
      writeText(path, emlFromHtml(d.title, mail));
      const mh = uniquePath(`${base}.mail.html`);
      writeText(mh, mail);
      out.push(mh);
    } else if (f === 'md') writeText(path, dossierSummaryMarkdown(d));
    else continue;
    out.push(path);
  }
  const html = out.find((p) => p.endsWith('.html') && !p.endsWith('.mail.html'));
  if (html) saveArtifact(sessionId, { name: html.split('/').pop()!, type: 'html', content: getFile(html)!.data });
  out.forEach((p) => HOUSE_FILES.add(p));
  return { out, html };
}
/** A brief .json written by report.analyse, or an error naming the path. */
function loadBrief(path: string, focus = ''): Brief {
  const bf = getFile(path);
  if (!bf) throw new Error(`Brief introuvable : ${path}`);
  // A DATA FILE given as the brief (v62: « Unexpected token 'P', "PK…" is not valid JSON » on an .xlsx): the brief is
  // computed from it, locally, like report.analyse would.
  if (isDataFile(bf.path) && !/\.json$/i.test(bf.path)) {
    const ds = loadDataset(bf.path);
    return buildBrief(ds.columns, ds.rows as Record<string, unknown>[], { title: focus || bf.path.split('/').pop() || 'Analyse', source: `${ds.path}${ds.sheet ? ` [${ds.sheet}]` : ''}` });
  }
  let brief: Brief | null;
  try {
    brief = JSON.parse(new TextDecoder().decode(bytesOf(bf))) as Brief;
  } catch {
    throw new Error(`Brief illisible : ${path} n'est pas un brief .json (report.analyse l'écrit) ni un fichier de données.`);
  }
  if (!brief?.numbers) throw new Error(`Brief illisible : ${path} (attendu : le .json écrit par report.analyse, ou le fichier de données lui-même).`);
  return brief;
}
/**
 * The dashboard of a design chosen on the Internet (image) or in the catalogue, rebuilt LIVE as the first sheet of a
 * committee workbook: shapes in the design, figures as formulas, filters, native charts — premium Excel, never an HTML
 * page nor a pasted picture. Only when the rows deserve a dashboard (dashFit). Returns a note for the model.
 */
async function addCloneSheet(path: string, spec: DashSpec, title: string, columns: string[], rows: Record<string, unknown>[]): Promise<string> {
  const f = getFile(path);
  if (!f || typeof document === 'undefined') return '';
  const cd = cloneData(title, columns, rows);
  const fit = dashFit(cd);
  if (!fit.ok) return ` (pas de tableau de bord vivant ajouté : ${fit.why})`;
  const live = await heavy('addLiveDashboard', bytesOf(f), spec, cd);
  if (!live) return '';
  writeBytes(path, live.bytes, f.mime);
  return ` + 1re feuille « Tableau de bord » VIVANTE au design choisi (${live.kpis} indicateurs en formules, ${live.charts} graphiques Excel, filtres ${live.filters.map((x) => `« ${x} »`).join(', ') || '—'})`;
}
/** The user's logo chosen in the gallery (PNG bytes + size), when the tool received one. */
function logoOf(a: Record<string, unknown>): { png: Uint8Array; width: number; height: number } | null {
  const lg = typeof a.logoPath === 'string' ? getFile(a.logoPath) : undefined;
  const bytes = lg?.binary ? bytesOf(lg) : null;
  const size = bytes ? pngSize(bytes) : null;
  return bytes && size ? { png: bytes, ...size } : null;
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
      const d = designCheck(f.path, S(a.content));
      return ok(
        `${existed ? 'modifié' : 'créé'} · ${f.size} o${d ? ` · ${d.summary}` : ''}`,
        `${existed ? 'Updated' : 'Created'} ${f.path} (${f.size} bytes).${d ? `\n\n${d.forModel}` : ''}`,
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
      const after = replaceExact(f.data, S(a.old_string), S(a.new_string), Boolean(a.replace_all), f.path);
      writeText(f.path, after);
      const d = designCheck(f.path, after);
      return ok(`modifié${d ? ` · ${d.summary}` : ''}`, `Edited ${f.path}.${d ? `\n\n${d.forModel}` : ''}`);
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
      // Every sheet of the workbook, so that the model targets the right one from the start.
      const sheets =
        ds.sheets.length > 1
          ? `Workbook sheets (use "sheet" in data.query): ${ds.sheets
              .map((x) => {
                const o = x === ds.sheet ? ds : loadDataset(ds.path, x);
                return `« ${x} » (${o.rows.length} rows × ${o.columns.length} cols${x === ds.sheet ? ', shown below' : ''})`;
              })
              .join(', ')}\n\n`
          : '';
      return ok(
        `${p.rowCount} lignes · ${p.columnCount} colonnes${ds.sheets.length > 1 ? ` · feuille « ${ds.sheet} » (${ds.sheets.length} feuilles)` : ''}`,
        `${sheets}${profileToText(p)}\n\nSample rows:\n${rowsToText(ds.columns, ds.rows.slice(0, 15))}`,
      );
    },
  },
  {
    name: 'data.query',
    description:
      'Exact computations on a data file: filters, group by (with date buckets day/week/month/quarter/year), aggregations (sum, avg, count, min, max, median, count_distinct), sort, limit. Use the exact column names of the PORTFOLIO CARD (business words like « expo », « statut », « encours » are also resolved). A « top N of a segment » is ONE call: filters + groupBy + aggregations with "as" + sort on that alias + limit N.',
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
    async run(a, ctx) {
      const { path, sheet, ...spec } = a;
      // A whole query given as one « query » / « spec » object (or a JSON string) is read the same way.
      const raw = spec.query ?? spec.spec ?? spec;
      const { ds, spec: q, note } = await prepareQueryFast(ctx, S(path), S(sheet) || undefined, raw);
      const r = data.query(ds, q);
      return ok(
        `${r.rowCount} ligne(s)${note ? ` · feuille « ${ds.sheet} »` : ''}`,
        // At most 60 rows go back to the model (tokens): aggregate, or page with limit / offset for more.
        `${note}${r.rowCount} result rows${r.rowCount > 60 ? ` (showing 60 — aggregate with groupBy/aggregations, or page with "limit"/"offset")` : ''}\n${rowsToText(r.columns, r.rows, 60)}`,
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
        style: {
          type: 'string',
          enum: ['3d', 'flat'],
          description:
            'PNG saved for reports: 3d (default, house 3D cards for bar / line / area / pie with one series) or flat',
        },
      },
      ['type', 'title', 'source'],
    ),
    risk: 'read',
    readOnly: false,
    label: (a) => `Graphique « ${S(a.title)} »`,
    async run(a, ctx) {
      const spec = ChartSpecSchema.parse(a) as ChartSpec;
      const cds = loadDataset(spec.source.path, spec.source.sheet);
      // Column names read like data.query's (business words, the file's dictionary, learned aliases).
      if (spec.x) spec.x = { ...spec.x, column: columnOf(cds, spec.x.column) };
      if (spec.y) spec.y = spec.y.map((y) => ({ ...y, column: y.column === '*' ? y.column : columnOf(cds, y.column) }));
      if (spec.series) spec.series = columnOf(cds, spec.series);
      if (spec.filters?.length) spec.filters = prepareQuery(spec.source.path, spec.source.sheet, { filters: spec.filters }).spec.filters ?? spec.filters;
      const chart = computeChart(cds, spec);
      const art = saveArtifact(ctx.sessionId, {
        name: spec.title,
        type: 'chart',
        content: JSON.stringify(chart),
        chart,
      });
      let png: Uint8Array | null = null;
      const s0 = chart.series?.[0];
      const svg3d =
        a.style !== 'flat' && chart.series?.length === 1 && s0
          ? chart3dSvg(
              spec.type,
              spec.title,
              chart.categories.map(String),
              s0.data.map((v) => Number(v) || 0),
              paletteOf(activeDesign()),
            )
          : null;
      if (svg3d) {
        try {
          png = (await rasterise(svg3d, 1520, Number(/viewBox="0 0 \d+ (\d+)/.exec(svg3d)?.[1] ?? 760))).png;
        } catch {
          png = null;
        }
      }
      png ??= chartPng(chart);
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
      'For calculations only — never to build an Office deliverable (report, structured file, workbook, deck): use dossier.export (data = the file) for those. Run JavaScript or Python in an isolated sandbox (no access to the page). Every workspace file is available, binaries included. JS: async code, use console.log; readFile(path) → string for text files, Uint8Array for binaries (PDF, xlsx, docx, images); readBytes(path) → Uint8Array; await readText(path) → extracted text of a PDF / Word / PowerPoint; writeFile(path, string | Uint8Array) saves a file. Python (Pyodide; numpy, pandas, openpyxl, xlrd, pypdf): workspace files are mounted at their path (pd.read_excel works); await read_text(path) gives the text of a PDF / Word file; files written in outputs/ are saved back. If Python is unavailable (blocked network, no offline pack), use JavaScript: it reads the same files.',
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
      const lang = S(a.language) === 'python' ? 'python' : 'javascript';
      // JavaScript syntax checked BEFORE running: nothing half-written, and the exact fix comes back at once.
      const syn = lang === 'javascript' ? jsSyntaxError(S(a.code)) : null;
      if (syn) {
        const msg = `Error: SyntaxError: ${syn} (vérifié avant exécution : rien n'a été lancé)${guidance('javascript', `SyntaxError: ${syn}`, noteError(ctx.sessionId, `SyntaxError: ${syn}`))}`;
        return { ok: false, summary: 'erreur de syntaxe (avant exécution)', forModel: msg, output: msg };
      }
      const r = await runInWorkspace(
        S(a.language) === 'python' ? 'python' : 'javascript',
        S(a.code),
        wanted,
        ctx.signal,
      );
      const saved = r.saved;
      // Pyodide's package-loading chatter is NOT output (v48: « openpyxl already loaded… No new packages to load »
      // filled the top of every failure, the real traceback came last and the model kept guessing).
      const logs = cleanSandboxLogs(r.logs);
      const text = [
        // A failure starts with its error, then the logs.
        r.error ? `Error: ${r.error}` : '',
        logs,
        r.result !== undefined ? `→ ${r.result}` : '',
        saved.length ? `Saved files: ${saved.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      // Errors come back with their exact fix; the same error twice in a row = change approach.
      const fix = r.ok
        ? (noteError(ctx.sessionId, null), '')
        : guidance(lang, r.error ?? text, noteError(ctx.sessionId, r.error ?? text));
      return {
        ok: r.ok,
        summary: r.ok
          ? `terminé${saved.length ? ` · ${saved.length} fichier(s)` : ''}`
          : `erreur${fix ? ' · correctif indiqué' : ''}`,
        forModel: clip(text || '(no output)', 30_000) + fix,
        output: clip(text, 20_000),
      };
    },
  },
  {
    name: 'three.run',
    description:
      'Run three.js code in the isolated 3D sandbox (Studio 3D Pro) and get the REAL result: JS exceptions with their line, console.error, WebGL GLSL compiler logs, physics errors, plus stats (meshes, triangles, draw calls, bodies). No import: THREE (r186 + OrbitControls, GLTFExporter, GLTFLoader, DRACOLoader), CANNON (cannon-es), scene (lit), camera, renderer, controls are given; animate with onFrame((dt, t) => …); physics.ground(y), physics.add(mesh, {mass, kinematic, restitution}), physics.path(body, points, speed); helpers.shaderPreview(vertex, fragment, shape). On error the answer includes the faulty lines and the matching documentation: fix and call again. save_glb: path of a .glb to write when the scene runs (draco: true compresses it).',
    parameters: obj(
      {
        code: str('JavaScript body (async allowed)'),
        save_glb: str('Optional workspace path of the .glb to save, e.g. outputs/scene.glb'),
        draco: { type: 'boolean', description: 'Draco-compress the saved .glb (KHR_draco_mesh_compression)' },
      },
      ['code'],
    ),
    risk: 'execute',
    readOnly: false,
    label: (a) => `Exécuter du three.js${a.save_glb ? ` → ${S(a.save_glb)}` : ''}`,
    async preview(a) {
      return { text: S(a.code) };
    },
    async run(a) {
      const { backgroundLab } = await import('./lab3d/runner');
      const { feedbackFor } = await import('../../server/jev/lab3d/selfCorrect');
      const lab = backgroundLab();
      const r = await lab.run(S(a.code));
      const st = `${r.stats.meshes} mesh · ${r.stats.triangles} triangles · ${r.stats.drawCalls} draw calls · ${r.stats.bodies} corps physiques · ${r.ms} ms`;
      if (!r.ok || r.stats.meshes === 0) {
        const fb = feedbackFor(S(a.code), r);
        return {
          ok: false,
          summary: `${r.errors.length} erreur(s) au rendu`,
          forModel: clip(fb, 20_000),
          output: clip(fb, 8000),
        };
      }
      let saved = '';
      if (S(a.save_glb)) {
        const g = await lab.exportGlb(a.draco === true);
        if ('error' in g) saved = `\nExport GLB impossible : ${g.error}`;
        else {
          const path = uniquePath(S(a.save_glb).endsWith('.glb') ? S(a.save_glb) : `${S(a.save_glb)}.glb`);
          writeBytes(path, g.bytes, 'model/gltf-binary');
          saved = `\nGLB enregistré : ${path} (${(g.bytes.byteLength / 1024).toFixed(1)} Ko${a.draco ? (g.draco ? `, Draco : ${(g.before / 1024).toFixed(1)} Ko avant` : ', Draco indisponible : non compressé') : ''})`;
        }
      }
      const text = `Rendu sans erreur : ${st}${r.warnings.length ? `\nAvertissements : ${r.warnings.slice(0, 3).join(' | ')}` : ''}${saved}`;
      return { ok: true, summary: 'scène 3D valide', forModel: text, output: text };
    },
  },
  {
    name: 'web.search',
    description:
      'Search the web (current information, documentation, news). Returns a synthesis with source links.',
    parameters: obj(
      {
        query: str('Search query'),
        max_results: { type: 'integer', description: '1-10 (default 5)' },
        fresh: {
          type: 'boolean',
          description:
            'true = ignore what the app already learned and search again (only for news / current figures)',
        },
      },
      ['query'],
    ),
    risk: 'read',
    readOnly: true,
    label: (a) => `Recherche web « ${S(a.query)} »`,
    async run(a, ctx) {
      // LEARNED FIRST: a question already searched (or a rule the app learned) costs no search at all.
      const kb = useStore.getState().knowledge;
      const hit = a.fresh === true ? null : recallKnowledge(kb, S(a.query));
      if (hit) {
        useStore.getState().setKnowledge(touchKnowledge(kb, hit.entry.id));
        const e = hit.entry;
        const text = `${e.text}${e.sources.length && !e.text.includes(e.sources[0]!.url) ? `\n\nSources :\n${e.sources.map((x) => `- ${x.title ? `[${x.title}](${x.url})` : x.url}`).join('\n')}` : ''}\n\n(Compétence apprise le ${new Date(e.createdAt).toLocaleDateString('fr-FR')} pour « ${e.query} » — aucune recherche refaite ; fresh: true pour forcer une nouvelle recherche.)`;
        return ok(`compétence apprise · 0 recherche · ${e.domain}`, text, { output: text });
      }
      const learn = (text: string) =>
        useStore
          .getState()
          .setKnowledge(
            rememberKnowledge(useStore.getState().knowledge, {
              query: S(a.query),
              text,
              sources: sourcesOf(text),
              origin: 'search',
            }),
          );
      // FREE SEARCH first (Tavily, then Serper: callable straight from the browser), then Brave (needs a relay):
      // raw results, no LLM synthesis call. The paid OpenRouter search is only the last resort.
      const ws = useStore.getState().settings;
      const n0 = Math.min(10, Number(a.max_results) || 6);
      const errs: string[] = [];
      for (const [p, key] of [
        ['tavily', ws.tavilyKey],
        ['serper', ws.serperKey],
      ] as const) {
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
          learn(text);
          return ok(`${PROVIDER_LABEL[p]} · ${hits.length} résultat(s) · 0 $ LLM`, text, { output: text });
        } catch (e) {
          errs.push(`${PROVIDER_LABEL[p]} : ${(e as Error).message}`);
        }
      }
      if (errs.length && !ws.braveKey && ws.braveFallback === false)
        throw new Error(`Recherche web indisponible (${errs.join(' ; ')}). Vérifiez la clé dans Paramètres.`);
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
            learn(text);
            return ok(`Brave · ${hits.length} résultat(s) · 0 $ LLM`, text, { output: text });
          } catch (e) {
            lastErr = (e as Error).message;
          }
        }
        if (ws.braveFallback === false)
          throw new Error(
            `Brave Search indisponible (${lastErr}). Vérifiez la clé / le relais dans Paramètres.`,
          );
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
      learn(text);
      return ok(`${sources.length} source(s) · $${r.cost.toFixed(4)}`, text, { output: text });
    },
  },
  {
    name: 'vault.open',
    description:
      "Open an entry of the user's EXPERIENCE VAULT (past deliverables they validated): returns its text and copies its files into this chat under vault/. Use the id given in <EXPERIENCE>.",
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
    name: 'report.analyse',
    description:
      'ANALYSE POUSSÉE ET RAPIDE (local, exact, 0 token): the BRIEF of a data file — main measure, what explains it (η²), top categories and concentration (top 3, HHI, n50 / n80) per dimension, trend by period, distribution bands, rates, anomalies, data quality — each figure with its method, written to outputs/<name>-brief.md and .json. ADAPT it to the situation: measure, dims, filters (same as data.query), top, focus (what the request asks); call it again with other cuts when the question needs them. The narrative is then written FROM THE BRIEF ONLY, then report.export with brief = the .json path (every figure absent from the brief is flagged) and data.export for the workbook. The agent LEARNS: the measure and dimensions that served a file are re-applied to the next similar file.',
    parameters: obj(
      {
        path: str('Data file path'),
        sheet: str('Excel sheet (optional)'),
        name: str('Output base name, e.g. "impayes-septembre" (default: the file name)'),
        title: str('Title of the analysis'),
        focus: str('What the request asks, in one sentence (audience, question, decision) — drives the reading'),
        measure: str('Main numeric column (default: the money-like column with the largest total)'),
        dims: { type: 'array', items: { type: 'string' }, description: 'Text columns to cut by (default: the most explanatory, 2–60 values)' },
        filters: { type: 'array', items: obj({ column: { type: 'string' }, op: { type: 'string', enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'is_null', 'not_null'] }, value: {} }, ['column', 'op']), description: 'Sub-population to brief (same filters as data.query)' },
        top: { type: 'number', description: 'Categories listed per dimension (3–15, default 8)' },
      },
      ['path'],
    ),
    risk: 'read',
    readOnly: false,
    label: (a) => `Brief d'analyse ${S(a.path)}${S(a.focus) ? ` — ${S(a.focus).slice(0, 40)}` : ''}`,
    async run(a, ctx) {
      const filters = a.filters !== undefined && a.filters !== null && !(Array.isArray(a.filters) && !a.filters.length) ? a.filters : null;
      // Filters are read like data.query's (business words, « == », « not in »…) and may move to the sheet that has them.
      const pq = filters ? await prepareQueryFast(ctx, S(a.path), S(a.sheet) || undefined, { filters }, { limit: 5_000_000 }) : null;
      const ds = pq?.ds ?? loadDataset(S(a.path), S(a.sheet) || undefined);
      const r = pq ? data.query(ds, pq.spec) : { columns: ds.columns, rows: ds.rows as Record<string, unknown>[], rowCount: ds.rows.length };
      // WHAT WAS LEARNED on a file of the same shape (same columns): its measure and dimensions, unless asked otherwise.
      const sig = [...ds.columns].sort().join('|').slice(0, 400);
      const st0 = useStore.getState();
      const lesson = st0.settings.reportLessons?.[sig];
      // « expo », « provision IFRS9 », « segment »: the real columns (an unknown name is left to the brief, which says so).
      const soft = (n: string) => (n ? resolveColumnSmart(ds.columns, n, lexiconOf(ds)).column ?? n : n);
      const measure = soft(S(a.measure)) || lesson?.measure;
      const dims = Array.isArray(a.dims) && a.dims.length ? a.dims.map((x) => soft(S(x))) : lesson?.dims;
      const title = S(a.title) || S(a.focus) || ds.path.split('/').pop() || 'Analyse';
      const brief = buildBrief(r.columns, r.rows, { title, source: `${ds.path}${ds.sheet ? ` [${ds.sheet}]` : ''}${pq ? ' (filtré)' : ''}`, measure, dims, top: Number(a.top) || undefined });
      const md = briefToMarkdown(brief);
      const base = `outputs/${(S(a.name) || ds.path.split('/').pop()?.replace(/\.[^.]+$/, '') || 'analyse').replace(/[^\w.-]+/g, '-')}-brief`;
      const mdPath = uniquePath(`${base}.md`);
      writeText(mdPath, md);
      const jsonPath = uniquePath(`${base}.json`);
      writeText(jsonPath, JSON.stringify(brief));
      // THE READING: JEV's typed judgments when a key is there (a few hundred tokens, a second), local rules otherwise.
      let hints = hintsLocal(brief, r.columns, S(a.focus));
      const cfg = jevSettings();
      const key = getJevKey();
      if (key && cfg.enabled) {
        try {
          const ans = await callJevQuestions(cfg, key, { request: S(a.focus) || title, columns: r.columns.slice(0, 60), facts: { rows: brief.rows, measure: brief.measureLabel, dims: brief.dims.slice(0, 3).map((d) => ({ dim: d.label, top3Share: d.top3Share, categories: d.categories })), trendDelta: brief.trend?.delta ?? null, anomalies: brief.anomalies.length, worstMissing: Math.max(0, ...brief.quality.map((q) => q.missingPct)) } }, hintQuestions(), (url, init) => fetch(url, init));
          hints = hintsFromAnswers(ans.answers, hints);
        } catch {
          /* JEV unreachable: the local reading stands */
        }
      }
      // The lesson is refined on every run (uses, measure, dimensions, focus).
      useStore.getState().patchSettings({ reportLessons: { ...(st0.settings.reportLessons ?? {}), [sig]: { measure: brief.measure ?? undefined, dims: brief.dims.filter((d) => d.dim !== brief.entity).map((d) => d.dim), focus: S(a.focus) || lesson?.focus, theme: lesson?.theme, uses: (lesson?.uses ?? 0) + 1, flagged: lesson?.flagged ?? 0, at: Date.now() } } });
      return ok(
        `brief : ${brief.kpis.length} indicateurs, ${brief.dims.length} dimension(s), ${brief.anomalies.length} anomalie(s) → ${mdPath}`,
        `${md}\n\n---\n${hintsText(hints)}${lesson ? `\nAppris d'une analyse précédente de ce type de fichier (${lesson.uses}×) : mesure « ${lesson.measure ?? '—'} », dimensions ${lesson.dims?.join(', ') ?? '—'}.` : ''}\n\nFichiers : ${mdPath}, ${jsonPath}.\nÉCRIVEZ LE RÉCIT avec ces chiffres seulement (constats chiffrés → analyse → recommandations datées), puis report.export avec brief: "${jsonPath}" (un chiffre absent du brief est signalé et doit venir d'un data.query, jamais d'une estimation) et data.export pour le classeur (Maison 2, thème choisi).`,
      );
    },
  },
  {
    name: 'report.export',
    description:
      'Export a Markdown report to committee-grade deliverables in outputs/, in the chosen theme (house by default): docx (Word report with cover, native TOC, chapters, native charts, recommendations, annexes), pptx (deck with timed notes), html (printable — the user prints it to PDF), eml (colour mail), md. The Markdown is read as a structured dossier (headings → chapters; sections constats / analyse / cadre / cas / recommandations; tables with responsable and échéance columns → action plan; sections décisions / hypothèses / glossaire / sources); the brief adds its indicators and figures. Deeper and adaptive: dossier.compose writes the full dossier, dossier.export renders it (xlsx included).',
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
        brief: str('Path of the brief .json written by report.analyse: every figure of the content absent from it is flagged (the technique is enforced: too many unknown figures and the export is refused until they are verified with data.query); its indicators and figures join the deliverables'),
        subtitle: str('Sub-title on the cover / title slide: audience, period or source (e.g. "Comité de crédit · T3 2025")'),
        org: str('Organisation (cover and footer)'),
        unit: str('Unit / department'),
        author: str('Issuer (name, function)'),
        audience: str('Recipients (e.g. "Comité Watchlist")'),
        as_of: str('Closing date jj/mm/aaaa'),
        confidentiality: str('e.g. "CONFIDENTIEL — usage interne"'),
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
      // THE TECHNIQUE IMPOSED ON THE MODEL: a report written from a brief cites the brief's figures. Unknown figures are
      // named; beyond a quarter of them (three at least) the export waits for their verification.
      let briefNote = '';
      let briefObj: Brief | null = null;
      if (S(a.brief)) {
        const brief = loadBrief(S(a.brief));
        briefObj = brief;
        const chk = checkNarrative(md, brief);
        if (chk.unknown.length) {
          const sig = Object.keys(useStore.getState().settings.reportLessons ?? {}).find((k) => useStore.getState().settings.reportLessons![k]!.measure === brief.measure);
          if (sig) useStore.getState().patchSettings({ reportLessons: { ...useStore.getState().settings.reportLessons, [sig]: { ...useStore.getState().settings.reportLessons![sig]!, flagged: (useStore.getState().settings.reportLessons![sig]!.flagged ?? 0) + chk.unknown.length } } });
          const tooMany = chk.unknown.length >= 3 && chk.unknown.length / Math.max(1, chk.checked) > 0.25;
          const list = chk.unknown.slice(0, 12).join(' ; ');
          if (tooMany) throw new Error(`Export refusé : ${chk.unknown.length} chiffre(s) sur ${chk.checked} ne sont pas dans le brief (${list}). Vérifiez-les avec data.query (et citez-les tels quels) ou retirez-les, puis relancez.`);
          briefNote = ` ⚠ ${chk.unknown.length} chiffre(s) absent(s) du brief à vérifier : ${list}.`;
        } else briefNote = ` ✔ ${chk.checked} chiffre(s) vérifié(s) contre le brief.`;
      }
      const base = `outputs/${
        S(a.name)
          .replace(/[^\w.-]+/g, '-')
          .replace(/\.(md|docx|pptx|pdf|html)$/i, '') || 'rapport'
      }`;
      const title = S(a.title) || S(a.name);
      const formats = (
        Array.isArray(a.formats) && a.formats.length ? a.formats.map(S) : ['docx', 'html']
      ).map((f) => (f === 'pdf' ? 'html' : f));
      // THE DOSSIER: the Markdown becomes one structured dossier (thesis, indicators, chapters, recommendations,
      // decisions, hypotheses, sources) rendered identically in every format, in the active theme, with the user's logo.
      const d = dossierFromMarkdown(md, {
        title,
        subtitle: S(a.subtitle) || undefined,
        brief: briefObj,
        org: S(a.org) || undefined,
        unit: S(a.unit) || undefined,
        author: S(a.author) || undefined,
        audience: S(a.audience) || undefined,
        asOf: S(a.as_of) || undefined,
        confidentiality: S(a.confidentiality) || undefined,
      });
      if (briefObj) d.data = briefDataRef(briefObj);
      const { out, html } = await renderDossier(d, base, formats.filter((f) => f !== 'md'), logoOf(a), ctx.sessionId);
      if (formats.includes('md')) {
        const mp = uniquePath(`${base}.md`);
        writeText(mp, md);
        out.push(mp);
      }
      // The dossier itself is kept: dossier.export renders it again (other formats, other theme) without rewriting.
      const dj = uniquePath(`${base}.dossier.json`);
      writeText(dj, JSON.stringify(d));
      return ok(
        out.join(', '),
        `Exported: ${out.join(', ')} (dossier : ${dj})${html ? ' (open the HTML and use "Print → Save as PDF" for a PDF)' : ''}${briefNote}${depthNote(d)}`,
      );
    },
  },
  {
    name: 'dossier.export',
    description:
      'Render a structured dossier (.dossier.json written by dossier.compose or report.export) into committee-grade deliverables in outputs/, all in the chosen theme (house by default) on every sheet / page / slide: xlsx (workbook: cockpit with live indicators, one sheet per chapter with native 3D charts and written analysis, action plan with status cells, decisions, hypotheses, parameters, data quality, sources, glossary, data sheet), pptx (deck with « Lecture — » band on each slide, recommendation cards, decisions, timed notes), docx (report with cover, native TOC, chapters, figures, annexes A–E), html (printable page), eml (colour mail), md (summary). Same figures everywhere.',
    parameters: obj(
      {
        from: str('Path of the .dossier.json (written by dossier.compose or report.export). Optional when `data` is given'),
        data: str('Data file behind the dossier (e.g. "uploads/Provisions.xlsx"): the workbook gets selectors, live indicators, top 10 and a DONNÉES table on it. Alone (no `from`), the dossier is built from the file by the rules (fast, no model call)'),
        sheet: str('Sheet of the data file'),
        focus: str('What the deliverable must answer (title / thesis when built from the data alone)'),
        measure: str('Numeric column to measure (default: detected)'),
        selectors: { type: 'array', items: { type: 'string' }, description: 'Up to 4 columns offered as selectors (default: the most explanatory dimensions)' },
        name: str('Base file name without extension (default: the dossier file name)'),
        formats: { type: 'array', items: { type: 'string', enum: ['xlsx', 'pptx', 'docx', 'html', 'pdf', 'eml', 'md'] } },
        ...THEME_PARAMS,
      },
      [],
    ),
    risk: 'read',
    readOnly: false,
    label: (a) => `Livrables du dossier ${(S(a.from) || S(a.data)).split('/').pop() ?? ''}`,
    async run(a, ctx) {
      let d: Dossier;
      if (S(a.from)) {
        const f = getFile(S(a.from));
        if (!f) throw new Error(`Dossier introuvable : ${S(a.from)} (écrit par dossier.compose ou report.export).`);
        let raw: unknown;
        try {
          raw = JSON.parse(new TextDecoder().decode(bytesOf(f)));
        } catch {
          throw new Error(`Dossier illisible (JSON attendu) : ${S(a.from)}`);
        }
        d = normalizeDossier(raw);
      } else if (S(a.data)) {
        // From the file alone: the brief (local, exact) and the rules write the dossier — no model call, seconds.
        const ds = loadDataset(S(a.data), S(a.sheet) || undefined);
        const brief = buildBrief(ds.columns, ds.rows as Record<string, unknown>[], { title: S(a.focus) || ds.path.split('/').pop() || 'Analyse', source: `${ds.path}${ds.sheet ? ` [${ds.sheet}]` : ''}`, measure: S(a.measure) || undefined, dims: Array.isArray(a.selectors) && a.selectors.length ? a.selectors.map(S) : undefined });
        d = dossierFromBrief({ focus: S(a.focus) || `Analyse de ${ds.path.split('/').pop()}`, brief });
        d.data = briefDataRef(brief);
      } else throw new Error('Donnez `from` (un .dossier.json) ou `data` (le fichier de données).');
      if (S(a.data)) d.data = { ...(d.data ?? { path: S(a.data) }), path: S(a.data), sheet: S(a.sheet) || d.data?.sheet, measure: S(a.measure) || d.data?.measure, selectors: Array.isArray(a.selectors) && a.selectors.length ? a.selectors.map(S).slice(0, 4) : d.data?.selectors };
      const stem = S(a.from) ? S(a.from).split('/').pop()!.replace(/(\.dossier)?\.json$/i, '') : (S(a.data).split('/').pop() ?? 'dossier').replace(/\.[^.]+$/, '');
      const base = `outputs/${(S(a.name) || stem).replace(/[^\w.-]+/g, '-') || 'dossier'}`;
      const formats = (Array.isArray(a.formats) && a.formats.length ? a.formats.map(S) : ['xlsx', 'pptx', 'docx', 'html']).map((x) => (x === 'pdf' ? 'html' : x));
      const { out, html } = await renderDossier(d, base, formats, logoOf(a), ctx.sessionId);
      if (!out.length) throw new Error('Aucun format reconnu (xlsx, pptx, docx, html, eml, md).');
      // A dashboard design chosen on the Internet or in the catalogue: the committee files carry its colours, and its
      // dashboard is rebuilt LIVE as the first sheet of the committee workbook (premium Excel, never an HTML page).
      let dashNote = '';
      const xl = out.find((p) => p.endsWith('.xlsx'));
      if (xl && a.clone && typeof a.clone === 'object') {
        const rows = dossierData(d.data);
        if (rows?.rows.length) dashNote = await addCloneSheet(xl, a.clone as DashSpec, d.title, rows.columns, rows.rows);
      }
      return ok(
        out.join(', '),
        `Exported: ${out.join(', ')}${dashNote}${html ? ' (open the HTML and use "Print → Save as PDF" for a PDF)' : ''} — ${d.kpis.length} indicateurs, ${d.chapters.length} chapitres, ${allRecos(d).length} recommandations, ${d.decisions.length} décisions, mêmes chiffres partout.${depthNote(d)}`,
      );
    },
  },
  {
    name: 'dossier.compose',
    description:
      'Write a complete committee dossier from a brief (report.analyse), notes and web sources: thesis, indicators (K01…), key messages, method, chapters adapted to the case (findings, analysis, regulatory frame and research, cases, native figures, tables, recommendations with owner / deadline / closing indicator), decisions to vote, hypotheses, data quality, glossary, sources. Always deep: the depth rules are enforced by code and a second pass deepens what is thin; every figure must come from the brief or the notes (unknown ones are named). JEV judges the plan (which dimensions become chapters), the tone of each indicator, the priority of each recommendation, the chart of each figure and the readiness. Writes outputs/<name>.dossier.json + .dossier.md; then dossier.export renders it in the chosen theme.',
    parameters: obj(
      {
        focus: str('What the dossier must answer: the question, the decision at stake, the audience'),
        name: str('Base file name, e.g. "comite-watchlist-T3"'),
        title: str('Title (default: written by the model)'),
        audience: str('Recipients, e.g. "Comité Watchlist"'),
        org: str('Organisation'),
        unit: str('Unit / department'),
        author: str('Issuer (name, function)'),
        as_of: str('Closing date jj/mm/aaaa'),
        confidentiality: str('e.g. "CONFIDENTIEL — usage interne"'),
        brief: str('Path of the brief .json written by report.analyse (with the notes, the only source of figures)'),
        notes: str('Markdown notes already established (findings, figures from data.query, cases), or the path of a workspace file'),
        research: {
          type: 'array',
          description: 'Web sources found (web.search / web.fetch) with what each one teaches; cited as [Rx-nn]',
          items: obj(
            {
              title: str('Title'),
              url: str('URL'),
              author: str('Author / institution'),
              date: str('Date'),
              lesson: str('What the source teaches'),
              axis: str('R1 regulation, R2 accounting standards, R3 supervision, R4 academic research, R5 security law, R6 market, R7 macro, R8 data, R9 other'),
            },
            ['title'],
          ),
        },
        minutes: { type: 'number', description: 'Deck duration in minutes (default 30)' },
      },
      ['focus', 'name'],
    ),
    risk: 'read',
    readOnly: false,
    label: (a) => `Composer le dossier ${S(a.name)}`,
    async run(a, ctx) {
      const brief = S(a.brief) ? loadBrief(S(a.brief), S(a.focus)) : null;
      let notes = S(a.notes);
      if (notes && !/\n/.test(notes) && notes.length < 240 && getFile(notes)) notes = (await readAsText(notes)).text;
      const research: ResearchNote[] = Array.isArray(a.research)
        ? (a.research as Record<string, unknown>[])
            .filter((r) => r && typeof r === 'object' && S(r.title))
            .map((r) => ({ title: S(r.title), url: S(r.url) || undefined, author: S(r.author) || undefined, date: S(r.date) || undefined, lesson: S(r.lesson) || undefined, axis: S(r.axis) || undefined }))
        : [];
      const input: ComposeInput = {
        focus: S(a.focus),
        title: S(a.title) || undefined,
        audience: S(a.audience) || undefined,
        org: S(a.org) || undefined,
        unit: S(a.unit) || undefined,
        author: S(a.author) || undefined,
        asOf: S(a.as_of) || undefined,
        confidentiality: S(a.confidentiality) || undefined,
        brief,
        notes: notes || undefined,
        research,
        minutes: Number(a.minutes) > 0 ? Number(a.minutes) : undefined,
      };
      const cfg = jevSettings();
      const key = getJevKey();
      const jev = Boolean(key && cfg.enabled);
      let jevCost = 0;
      let jevMs = 0;
      const jevCall = async (state: Record<string, unknown>, questions: Record<string, ReturnType<typeof planQuestions>[string]>) => {
        const t0 = Date.now();
        const ans = await callJevQuestions(cfg, key, state, questions, (url, init) => fetch(url, init));
        jevCost += ans.costUsd;
        jevMs += ans.ms;
        acct.add(ctx.sessionId, { kind: 'jev1', step: 0, model: ans.model, tokensIn: ans.inputTokens, tokensOut: 0, cost: ans.costUsd, costSource: 'calculated', ms: Date.now() - t0 });
        return ans.answers;
      };
      // 1. THE PLAN — JEV decides which dimensions of the brief deserve a chapter and what opens the dossier (rules otherwise).
      let planNote = '';
      if (brief) {
        let answers: Awaited<ReturnType<typeof jevCall>> | null = null;
        if (jev) {
          try {
            answers = await jevCall(planState(brief, input.focus), planQuestions(brief));
          } catch {
            /* JEV unreachable: the rules plan */
          }
        }
        const kept = chaptersFromPlan(brief, answers);
        input.plan = { chapters: kept.map((i) => brief.dims[i]!.label), lead: answers?.lead?.choice };
        planNote = ` Plan (${answers ? 'JEV' : 'règles'}) : ${kept.length} chapitre(s) — ${input.plan.chapters.join(', ') || 'aucune dimension retenue'}${input.plan.lead ? ` ; ouverture : ${input.plan.lead}` : ''}.`;
      }
      // 2. THE WRITING — the model, in the closed grammar; the rules check the depth and ask for one deeper pass.
      const model = pickFromTier(ctx.models, DEFAULT_AUTO_TIERS.balanced, {})?.id ?? pickFromTier(ctx.models, DEFAULT_AUTO_TIERS.fast, {})?.id ?? 'openai/gpt-4o-mini';
      const base: Partial<Dossier> = {
        title: input.title,
        audience: input.audience,
        org: input.org,
        unit: input.unit,
        author: input.author,
        asOf: input.asOf,
        confidentiality: input.confidentiality,
        date: todayFr(),
        minutes: input.minutes,
      };
      const messages: ChatMessage[] = [
        { role: 'system', content: composeSystemPrompt() },
        { role: 'user', content: composeUserPrompt(input) },
      ];
      let cost = 0;
      let used = model;
      let passes = 0;
      let source = 'calculated';
      const call = async (msgs: ChatMessage[]) => {
        const t0 = Date.now();
        const r = await complete(
          { model, messages: msgs, maxTokens: 14000, temperature: 0.3, signal: ctx.signal },
          { models: ctx.models, fallbacks: [], effort: 'auto', maxRetries: 1, purpose: 'dossier' },
        );
        useStore.getState().addSpend(r.cost);
        // Scientific accounting: an LLM call made INSIDE a tool is the tool's cost, not the mission model's.
        acct.add(ctx.sessionId, { kind: 'tool', step: 0, model: r.model, tokensIn: r.usage.promptTokens, tokensOut: r.usage.completionTokens, cost: r.cost, costSource: r.costSource, ms: Date.now() - t0 });
        cost += r.cost;
        used = r.model;
        source = r.costSource;
        passes++;
        return r.content ?? '';
      };
      let d: Dossier | null = null;
      let modelNote = '';
      try {
        const text = await call(messages);
        const raw = parseDossierJson(text);
        if (raw) d = normalizeDossier(raw, base);
        else modelNote = ' Le modèle n\'a pas renvoyé un JSON lisible : ';
        if (d) {
          const issues = checkDepth(d);
          if (issues.length) {
            const text2 = await call([...messages, { role: 'assistant', content: text }, { role: 'user', content: deepenPrompt(d, issues) }]);
            const raw2 = parseDossierJson(text2);
            const d2 = raw2 ? normalizeDossier(raw2, base) : null;
            // The second pass stands only if it is not thinner than the first.
            if (d2 && checkDepth(d2).length <= issues.length) d = d2;
          }
        }
      } catch (e) {
        modelNote = ` Modèle indisponible (${(e as Error).message.slice(0, 140)}) : `;
      }
      // An EMPTY dossier (v62: « 0 indicateurs, 0 chapitres » twice) is not a dossier: the rules build it from the brief.
      if (d && !d.chapters.length && !d.kpis.length) {
        modelNote += ' Le modèle a renvoyé un dossier vide (ni indicateur ni chapitre) : ';
        d = null;
      }
      if (!d && !brief && notes) {
        // Notes only: the markdown adapter keeps their chapters and figures (the rules alone would leave them out).
        const md = dossierFromMarkdown(notes, { title: input.title, org: input.org, unit: input.unit, author: input.author, audience: input.audience, asOf: input.asOf, confidentiality: input.confidentiality });
        if (md.chapters.length || md.kpis.length) {
          d = md;
          modelNote += 'dossier repris des notes (leurs chapitres et leurs chiffres).';
        }
      }
      if (!d) {
        d = dossierFromBrief(input);
        modelNote += brief || notes ? 'dossier construit par les règles à partir du brief / des notes.' : 'dossier construit par les règles seules (donner `brief` = le fichier de données pour un dossier chiffré).';
      }
      // 3. THE FIGURES — every number must come from the brief; the unknown ones are named for verification, never kept blindly.
      let verifNote = '';
      if (brief) {
        const v = verifyAgainstBrief(d, brief);
        verifNote = v.unknown.length
          ? ` ⚠ ${v.unknown.length} chiffre(s) absent(s) du brief à vérifier avec data.query : ${v.unknown.slice(0, 12).join(' ; ')}.`
          : ` ✔ ${v.checked} chiffre(s) vérifié(s) contre le brief.`;
      }
      // 4. THE JUDGMENTS — JEV sets the tone of each indicator, the priority of each recommendation, the chart of each figure,
      // and says whether the dossier is ready for the committee (confident answers only; the rules guard each change).
      let judgeNote = ' JEV non configuré : tons, priorités et figures tels qu\'écrits.';
      if (jev) {
        try {
          const rep = applyJudgments(d, await jevCall(dossierState(d), dossierQuestions(d)));
          judgeNote = ` JEV : ${rep.tones} ton(s), ${rep.priorities} priorité(s), ${rep.figures} figure(s) ajustés${rep.ready ? ` · prêt pour le comité : ${rep.ready.label} (${rep.ready.score.toFixed(1)}/4, confiance ${Math.round(rep.ready.confidence * 100)} %)` : ''}${rep.thesisDecisional != null ? ` · thèse décisionnelle : ${Math.round(rep.thesisDecisional * 100)} %` : ''}.`;
        } catch {
          judgeNote = ' JEV injoignable : tons, priorités et figures tels qu\'écrits.';
        }
      }
      if (brief) d.data = briefDataRef(brief);
      const name = (S(a.name) || 'dossier').replace(/[^\w.-]+/g, '-').replace(/\.(dossier\.)?(json|md)$/i, '');
      const jp = uniquePath(`outputs/${name}.dossier.json`);
      writeText(jp, JSON.stringify(d, null, 1));
      const summary = dossierSummaryMarkdown(d);
      const mp = uniquePath(`outputs/${name}.dossier.md`);
      writeText(mp, summary);
      return ok(
        `dossier : ${d.kpis.length} indicateurs, ${d.chapters.length} chapitres, ${allRecos(d).length} recommandations, ${d.decisions.length} décisions → ${jp}`,
        `${summary}\n\n---\nÉcrit : ${jp} (résumé ${mp}). ${passes} passe(s) de ${used} · ${cost.toFixed(4)} $ (${source})${jevCost ? ` · JEV ${jevCost.toFixed(4)} $ en ${jevMs} ms` : ''}.${modelNote}${planNote}${verifNote}${judgeNote}${depthNote(d)}\nProchaine étape : dossier.export avec from="${jp}" (formats xlsx, pptx, docx, html, eml) — le thème choisi s'applique à toutes les feuilles, pages et diapositives.`,
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
            'The xlsx is the COMMITTEE workbook automatically (cockpit with live indicators, one analysis sheet per dimension with native charts, action plan, decisions, hypotheses, data quality, sources, DONNÉES), in the chosen theme. Omit it. none = plain house table only.',
        },
        visuals: {
          type: 'boolean',
          description: 'false = no « Synthèse 3D » board sheet (native charts stay)',
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
    async run(a, ctx) {
      // The query is read like data.query's (top N of a segment in ONE call: filters + groupBy + sort + limit).
      const pq = a.query ? await prepareQueryFast(ctx, S(a.path), S(a.sheet) || undefined, a.query, { limit: 5_000_000 }) : null;
      const ds = pq?.ds ?? loadDataset(S(a.path), S(a.sheet) || undefined);
      const r = pq ? data.query(ds, pq.spec) : { columns: ds.columns, rows: ds.rows as Record<string, unknown>[], rowCount: ds.rows.length };
      const fmt = (S(a.format) || 'xlsx') as 'xlsx' | 'csv' | 'json';
      const path = uniquePath(`outputs/${S(a.name).replace(/[^\w.-]+/g, '-') || 'export'}.${fmt}`);
      const meta = {
        title: S(a.title) || S(a.name) || 'Export',
        subtitle: `Source : ${S(a.path)}${a.query ? ' (filtré)' : ''}`,
        // Maison 2.0: KPIs + native 3D charts above the header unless « none » is asked; a kind given goes first.
        chart: (['bar', 'line', 'pie', 'none'].includes(S(a.chart)) ? S(a.chart) : undefined) as
          'bar' | 'line' | 'pie' | 'none' | undefined,
      };
      // THE NEW STYLE EVERYWHERE (consigne du 15/10/2026): an Excel export is the COMMITTEE workbook (cockpit, one sheet
      // per dimension, action plan, decisions, hypotheses, data quality, sources, DONNÉES) built from THESE rows — the
      // query's filters are kept — in the active theme (a design chosen on the Internet gives its colours). Its dashboard
      // becomes the live first sheet (premium Excel, no HTML page). Chart « none » asks for the plain house table.
      const committee = fmt === 'xlsx' && a.chart !== 'none';
      if (committee && r.rows.length) {
        const src = `${S(a.path)}${S(a.sheet) ? ` [${S(a.sheet)}]` : ''}${a.query ? ' (filtré)' : ''}`;
        const brief = buildBrief(r.columns, r.rows, { title: meta.title, source: src });
        const d = dossierFromBrief({ focus: meta.title, brief });
        const ref = briefDataRef(brief);
        d.data = ref;
        writeBytes(
          path,
          await heavy('dossierXlsx', d, { data: { columns: r.columns, rows: r.rows, measure: ref?.measure ?? null, entity: ref?.entity ?? null, selectors: ref?.selectors ?? [], source: src }, logo: logoOf(a) }),
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        HOUSE_FILES.add(path);
        const dashNote = a.clone && typeof a.clone === 'object' ? await addCloneSheet(path, a.clone as DashSpec, meta.title, r.columns, r.rows) : '';
        return ok(
          `${r.rowCount} lignes → ${path} (classeur comité${dashNote ? ' + tableau de bord vivant' : ''})`,
          `Saved ${r.rowCount} rows to ${path} as the committee workbook in the chosen theme: cockpit with live indicators, ${d.chapters.length} analysis sheet(s) with native charts, action plan, decisions, hypotheses, data quality, sources and the DONNÉES table (${r.rowCount} rows${a.query ? ', filtered' : ''})${dashNote}.${depthNote(d)}`,
        );
      }
      // The workbook is built in the BACKGROUND thread (the page stays fluid, other chats keep streaming).
      writeBytes(
        path,
        fmt === 'xlsx'
          ? await heavy('houseXlsx', r.columns, r.rows, meta)
          : data.exportRows(r.columns, r.rows, fmt, meta),
      );
      // A dashboard image CLONED photo-faithfully: the reproduction with these exact figures, as an HTML page and as a
      // first « Tableau de bord » sheet (picture) in the workbook.
      if (a.clone && typeof a.clone === 'object') {
        const spec = a.clone as DashSpec;
        const cd = cloneData(S(a.title) || S(a.name) || 'Tableau de bord', r.columns, r.rows);
        const dash = uniquePath(
          `outputs/${S(a.name).replace(/[^\w.-]+/g, '-') || 'export'}-tableau-de-bord.html`,
        );
        writeText(dash, renderCloneHtml(spec, cd, S(a.layoutSource) || undefined));
        let sheet = '';
        if (fmt === 'xlsx' && typeof document !== 'undefined') {
          try {
            const f = getFile(path);
            // LIVE dashboard first (no fixed picture): the image's design as shapes, figures as formulas, filters,
            // native charts on formula ranges. The older native + picture build only when the rows are missing.
            // Never a pasted picture instead: without a live dashboard the workbook stays as exported.
            // Only when the rows deserve a dashboard (dashFit — never for a handful of rows or no additive measure).
            const live = f && dashFit(cd).ok ? await heavy('addLiveDashboard', bytesOf(f), spec, cd) : null;
            const nat = null as { charts: number } | null;
            let out = live?.bytes ?? null;
            // The data sheet of the reproduction in Maison 2.0 with the image's colours (the house sheets already are).
            const rs =
              out && (nat || live)
                ? await heavy(
                    'restyleWorkbook',
                    out,
                    {
                      dark: spec.palette.dark,
                      primary: spec.palette.primary,
                      accent: spec.palette.accent,
                      font: spec.font,
                    },
                    new Set([
                      'Tableau de bord',
                      'Tableau de bord vivant',
                      'Tableau de bord (image)',
                      'Données',
                      'Agrégats',
                      'Synthèse 3D',
                      'Sommaire',
                    ]),
                  )
                : null;
            if (rs) out = rs.bytes;
            if (out) {
              writeBytes(path, out, f!.mime);
              sheet = live
                ? ` (1re feuille « Tableau de bord » VIVANTE au design de l'image : ${live.kpis} indicateurs en formules, ${live.charts} graphiques Excel, filtres ${live.filters.map((x) => `« ${x} »`).join(', ') || '—'}, données dans « Données du tableau de bord »)`
                : nat
                  ? ` (1re feuille « Tableau de bord » : l'image reconstruite en Excel natif, ${nat.charts} graphiques modifiables ; 2e feuille : la reproduction photo)`
                  : ' (feuille « Tableau de bord » en tête du classeur)';
            }
          } catch {
            /* the HTML reproduction is still there */
          }
        }
        return ok(
          `${r.rowCount} lignes → ${path}${sheet} + ${dash}`,
          `Saved ${r.rowCount} rows to ${path}${sheet} and the photo-faithful reproduction of the chosen dashboard to ${dash}.`,
        );
      }
      // A design copied from the Internet: its layout is rebuilt with these exact figures as an HTML dashboard.
      if (a.layout && typeof a.layout === 'object') {
        const l = a.layout as DesignLayout;
        const dash = uniquePath(
          `outputs/${S(a.name).replace(/[^\w.-]+/g, '-') || 'export'}-tableau-de-bord.html`,
        );
        writeText(
          dash,
          renderLayoutHtml(
            l,
            {
              ...dashboardData(
                S(a.title) || S(a.name) || 'Tableau de bord',
                r.columns,
                r.rows,
                l.kpis.count || 4,
              ),
              subtitle: `Source : ${S(a.path)}`,
            },
            S(a.layoutSource) || undefined,
          ),
        );
        return ok(
          `${r.rowCount} lignes → ${path} + ${dash}`,
          `Saved ${r.rowCount} rows to ${path} and the dashboard reproducing the chosen design to ${dash}.`,
        );
      }
      // « SYNTHÈSE 3D » board (3D columns, donut, top-10 bars, trend, Pareto, counts + reading card) as the first sheet,
      // in the active palette, with the chosen logo. Computed from these rows only.
      let board = '';
      if (fmt === 'xlsx' && a.chart !== 'none' && a.visuals !== false && typeof document !== 'undefined') {
        try {
          const lg = typeof a.logoPath === 'string' ? getFile(a.logoPath) : undefined;
          const logo =
            lg && lg.binary && lg.mime.startsWith('image/') ? await imageSize(dataUrl(lg)) : undefined;
          const syn = synthesisSvg(
            {
              title: S(a.title) || S(a.name) || 'Synthèse',
              subtitle: `Source : ${S(a.path)}${a.query ? ' (filtré)' : ''} · ${r.rowCount} lignes · édité le ${new Date().toLocaleDateString('fr-FR')}`,
              columns: r.columns,
              rows: r.rows,
              logo,
            },
            paletteOf(activeDesign()),
          );
          const f = getFile(path);
          if (syn && f) {
            const img = await rasterise(syn.svg, syn.width, syn.height);
            const withSheet = await heavy(
              'addImageSheet',
              bytesOf(f),
              { png: img.png, width: syn.width, height: syn.height },
              'Synthèse 3D',
              1200,
            );
            if (withSheet) {
              writeBytes(path, withSheet, f.mime);
              board = ` + feuille « Synthèse 3D » en tête (${syn.charts} graphiques 3D, KPI, lecture)`;
            }
          }
        } catch {
          /* the workbook (with its native 3D charts) is still there */
        }
      }
      return ok(
        `${r.rowCount} lignes → ${path}${board}`,
        `Saved ${r.rowCount} rows to ${path}${board ? `${board}; the data sheet also carries KPI cards and native Excel 3D charts above the table header` : ''}.`,
      );
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
    name: 'visual.compare',
    description:
      'Visual regression (visual-regression / frontend-visual-qa skills): compare two images of the workspace (PNG, JPEG, WebP — screenshots, exports, renders) and report the share of changed pixels, a verdict (identique / stable / changé), the changed zones and a diff image written next to the "after" file.',
    parameters: obj(
      {
        before: str('Path of the reference image (baseline)'),
        after: str('Path of the new image'),
        tolerance: { type: 'number', description: 'Per-channel difference under which a pixel is the same (0–255, default 24)' },
        max_ratio: { type: 'number', description: 'Share of changed pixels under which the result is still "stable" (default 0.002)' },
      },
      ['before', 'after'],
    ),
    risk: 'write',
    readOnly: false,
    label: (a) => `Comparer ${S(a.before)} → ${S(a.after)}`,
    async run(a) {
      const load = async (p: string) => {
        const f = getFile(p);
        if (!f || !f.binary) throw new Error(`Image introuvable : ${p}`);
        const bmp = await createImageBitmap(new Blob([bytesOf(f) as BlobPart], { type: f.mime }));
        const cv = new OffscreenCanvas(bmp.width, bmp.height);
        const g = cv.getContext('2d')!;
        g.drawImage(bmp, 0, 0);
        const id = g.getImageData(0, 0, bmp.width, bmp.height);
        return { width: id.width, height: id.height, data: id.data };
      };
      const [b, c] = await Promise.all([load(S(a.before)), load(S(a.after))]);
      const r = pixelDiff(b, c, { tolerance: typeof a.tolerance === 'number' ? a.tolerance : undefined, maxRatio: typeof a.max_ratio === 'number' ? a.max_ratio : undefined });
      const w = Math.min(b.width, c.width);
      const h = Math.min(b.height, c.height);
      const cv = new OffscreenCanvas(w, h);
      cv.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.diff) as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
      const png = new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer());
      const diffPath = uniquePath(normPath(S(a.after)).replace(/\.[a-z0-9]+$/i, '') + '.diff.png');
      writeBytes(diffPath, png, 'image/png');
      return ok(`${r.verdict} · ${(r.changed * 100).toFixed(2)} %`, `${diffReport(r, { before: S(a.before), after: S(a.after) })}\nDiff image: ${diffPath}`);
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
    name: 'knowledge.save',
    description:
      'File what you just LEARNED (a regulation grid, a procedure, a code fix recipe, a method) as a permanent skill of the app, so it is never searched or worked out again. Write the distilled rule itself (figures, steps, thresholds), not a summary of your work. Cite the sources.',
    parameters: obj(
      {
        title: str(
          'Short title of the skill, e.g. « BCEAO — grille de dépréciation des créances en souffrance »',
        ),
        text: str('The rule / procedure / recipe itself, self-contained (max ~1500 words)'),
        sources: { type: 'array', items: { type: 'string' }, description: 'Source URLs or document names' },
        domain: {
          type: 'string',
          enum: [
            'Réglementation bancaire',
            'Finance & comptabilité',
            'Code & outils',
            'Procédure',
            'Création & studio',
            'Général',
          ],
          description: 'Domain (guessed from the title when omitted)',
        },
      },
      ['title', 'text'],
    ),
    risk: 'read',
    readOnly: true,
    label: (a) => `Compétence apprise « ${S(a.title)} »`,
    async run(a) {
      const srcs = (Array.isArray(a.sources) ? a.sources : [])
        .map((x) => String(x))
        .filter(Boolean)
        .map((u) => ({ url: u }));
      const domain = typeof a.domain === 'string' ? (a.domain as KnowledgeDomain) : undefined;
      useStore
        .getState()
        .setKnowledge(
          rememberKnowledge(useStore.getState().knowledge, {
            query: S(a.title),
            text: S(a.text),
            sources: srcs,
            origin: 'learned',
            domain,
          }),
        );
      return ok(
        'compétence enregistrée',
        `Skill filed: « ${S(a.title)} ». It will be recalled automatically in every chat; no new search is needed for it.`,
      );
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
