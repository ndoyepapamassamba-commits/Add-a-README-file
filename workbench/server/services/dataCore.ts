// Pure data engine (no Node APIs): parsing, profiling, querying, exports.
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { houseXlsx } from './houseStyle';
import { z } from 'zod';
import type { DataFilter } from '@shared/types';

export type Cell = string | number | boolean | Date | null;
export type DataRow = Record<string, Cell>;

export interface Dataset {
  path: string;
  sheet: string | null;
  sheets: string[];
  columns: string[];
  rows: DataRow[];
}

export type ColumnType =
  'integer' | 'number' | 'date' | 'boolean' | 'categorical' | 'text' | 'empty' | 'mixed';

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  missing: number;
  missingPct: number;
  unique: number;
  sample: Cell[];
  numeric?: {
    min: number;
    max: number;
    mean: number;
    median: number;
    std: number;
    p25: number;
    p75: number;
    sum: number;
    outliers: number;
    negatives: number;
    zeros: number;
  };
  date?: { min: string; max: string };
  top?: { value: string; count: number }[];
}

export interface DatasetProfile {
  path: string;
  sheet: string | null;
  sheets: string[];
  rowCount: number;
  columnCount: number;
  duplicateRows: number;
  columns: ColumnProfile[];
  anomalies: string[];
}

export const DATA_EXTENSIONS = [
  '.csv',
  '.tsv',
  '.xlsx',
  '.xls',
  '.xlsm',
  '.xlsb',
  '.ods',
  '.json',
  '.jsonl',
  '.ndjson',
];

/** Name comparison that forgives case, accents, spaces, « _ » / « - » and a final dot (« Stage IFRS9 » = « stage_ifrs9 »). */
export const normName = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_\-./()]+/g, ' ')
    .trim();
/** The real column a model meant, or null. */
export function resolveColumn(columns: string[], name: string): string | null {
  if (columns.includes(name)) return name;
  const n = normName(name);
  return columns.find((c) => normName(c) === n) ?? null;
}
/** Every column a query mentions (filters, groupBy, aggregations, select, sort). */
export function queryColumns(q: Record<string, unknown>): string[] {
  const out: string[] = [];
  const col = (x: unknown) => (x && typeof x === 'object' ? (x as { column?: unknown }).column : x);
  for (const k of ['filters', 'groupBy', 'aggregations', 'select', 'sort']) for (const x of (Array.isArray(q[k]) ? q[k] : []) as unknown[]) {
    const c = col(x);
    if (typeof c === 'string' && c !== '*') out.push(c);
  }
  return [...new Set(out)];
}
/** Rewrites a query with the real column names (case / accents / spaces forgiven); returns the names not found. */
export function resolveQueryColumns(q: Record<string, unknown>, columns: string[]): { query: Record<string, unknown>; missing: string[] } {
  const missing: string[] = [];
  const fix = (c: unknown) => {
    if (typeof c !== 'string' || c === '*') return c;
    const r = resolveColumn(columns, c);
    if (!r) missing.push(c);
    return r ?? c;
  };
  const out: Record<string, unknown> = { ...q };
  for (const k of ['filters', 'groupBy', 'aggregations', 'sort'])
    if (Array.isArray(q[k])) out[k] = (q[k] as Record<string, unknown>[]).map((x) => (x && typeof x === 'object' ? { ...x, column: fix(x.column) } : x));
  if (Array.isArray(q.select)) out.select = (q.select as unknown[]).map(fix);
  return { query: out, missing: [...new Set(missing)] };
}

export const FilterSchema = z.object({
  column: z.string(),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'is_null', 'not_null']),
  value: z.unknown().optional(),
});
export const AggFn = z.enum(['sum', 'avg', 'count', 'min', 'max', 'median', 'count_distinct']);
export const BucketSchema = z.enum(['day', 'week', 'month', 'quarter', 'year']);

export const QuerySpecSchema = z.object({
  filters: z.array(FilterSchema).optional(),
  groupBy: z.array(z.object({ column: z.string(), bucket: BucketSchema.optional() })).optional(),
  aggregations: z.array(z.object({ column: z.string(), fn: AggFn, as: z.string().optional() })).optional(),
  select: z.array(z.string()).optional(),
  sort: z.array(z.object({ column: z.string(), dir: z.enum(['asc', 'desc']).default('asc') })).optional(),
  limit: z.number().int().min(1).max(5_000_000).optional(),
  offset: z.number().int().min(0).optional(),
});
export type QuerySpec = z.infer<typeof QuerySpecSchema>;

/**
 * Tolerant reading of a query written by a model (v62: the ESN chat lost minutes on « Invalid option » loops). Accepted:
 * single objects where a list is expected; JSON written as a string; SQL-ish / pandas-ish aliases at the top level
 * (where, group_by, by, aggs, metrics, order_by, top…); aggregations as "sum(X)", {sum:"X"}, {"X":"sum"}, a pandas
 * named-aggregation map, several columns for one function; filters with "==", ">=", "like", "not in", "between", a
 * {column: value} map, no op (= eq, list = in); sort as "-X", "X desc", {X:"desc"}, ascending / descending flags.
 */
const AGG_FN: Record<string, string> = {
  sum: 'sum', total: 'sum', somme: 'sum', add: 'sum',
  avg: 'avg', mean: 'avg', average: 'avg', moyenne: 'avg',
  count: 'count', nb: 'count', nombre: 'count', n: 'count', size: 'count', cnt: 'count', count_rows: 'count', rows: 'count',
  count_distinct: 'count_distinct', distinct_count: 'count_distinct', countdistinct: 'count_distinct', distinct: 'count_distinct',
  nunique: 'count_distinct', unique: 'count_distinct', dcount: 'count_distinct', count_unique: 'count_distinct',
  min: 'min', minimum: 'min', max: 'max', maximum: 'max', median: 'median', mediane: 'median', p50: 'median',
};
const FILTER_OP: Record<string, string> = {
  '=': 'eq', '==': 'eq', '===': 'eq', eq: 'eq', equals: 'eq', equal: 'eq', is: 'eq', egal: 'eq',
  '!=': 'neq', '!==': 'neq', '<>': 'neq', ne: 'neq', neq: 'neq', not_eq: 'neq', not_equal: 'neq', not_equals: 'neq', is_not: 'neq', different: 'neq',
  '>': 'gt', gt: 'gt', greater: 'gt', greater_than: 'gt', '>=': 'gte', gte: 'gte', ge: 'gte', greater_or_equal: 'gte',
  '<': 'lt', lt: 'lt', less: 'lt', less_than: 'lt', '<=': 'lte', lte: 'lte', le: 'lte', less_or_equal: 'lte',
  like: 'contains', ilike: 'contains', contains: 'contains', includes: 'contains', has: 'contains', contient: 'contains',
  in: 'in', isin: 'in', one_of: 'in', any_of: 'in',
  is_null: 'is_null', isnull: 'is_null', null: 'is_null', empty: 'is_null', is_empty: 'is_null', missing: 'is_null',
  not_null: 'not_null', notnull: 'not_null', is_not_null: 'not_null', exists: 'not_null', not_empty: 'not_null', present: 'not_null',
  not_in: 'not_in', nin: 'not_in', notin: 'not_in', between: 'between', range: 'between',
};
const BUCKET: Record<string, string> = {
  day: 'day', jour: 'day', daily: 'day', d: 'day', week: 'week', semaine: 'week', weekly: 'week', w: 'week',
  month: 'month', mois: 'month', monthly: 'month', m: 'month', quarter: 'quarter', trimestre: 'quarter', quarterly: 'quarter', q: 'quarter',
  year: 'year', annee: 'year', yearly: 'year', annual: 'year', y: 'year',
};
const TOP_ALIAS: Record<string, string> = {
  where: 'filters', filter: 'filters', conditions: 'filters',
  group_by: 'groupBy', groupby: 'groupBy', group: 'groupBy', by: 'groupBy', dimensions: 'groupBy', dims: 'groupBy',
  aggs: 'aggregations', aggregation: 'aggregations', aggregate: 'aggregations', agg: 'aggregations', metrics: 'aggregations', measures: 'aggregations',
  order_by: 'sort', orderby: 'sort', sort_by: 'sort', sortby: 'sort',
  columns: 'select', fields: 'select', top: 'limit', head: 'limit', n: 'limit', max_rows: 'limit', page_size: 'limit', skip: 'offset',
};
const key = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** JSON passed as a string ('[{"column":"Relationship"}]') is read as JSON. */
const unjson = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!/^[[{]/.test(t)) return v;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return v;
  }
};
const aggFn = (v: unknown) => (typeof v === 'string' ? AGG_FN[key(v)] ?? key(v) : v);
const colOf = (o: Record<string, unknown>) => o.column ?? o.col ?? o.field ?? o.key ?? o.of ?? o.on ?? o.target ?? o.measure ?? o.metric ?? o.column_name ?? o.colonne;
const COL_KEYS = new Set(['column', 'col', 'field', 'key', 'of', 'on', 'target', 'measure', 'metric', 'column_name', 'colonne', 'name']);
const FN_KEYS = ['fn', 'op', 'agg', 'function', 'func', 'operation', 'aggregate', 'aggregation', 'method', 'how', 'type'];

function coerceAggs(v: unknown): unknown[] | undefined {
  v = unjson(v);
  if (v === undefined || v === null) return undefined;
  // A map: {"X": "sum"}, {"X": ["sum","avg"]}, {"alias": {"column":"X","fn":"sum"}} (pandas named aggregation).
  if (isObj(v) && !Object.keys(v).some((k) => COL_KEYS.has(k) || FN_KEYS.includes(k) || k === 'as')) {
    const out: unknown[] = [];
    for (const [k, x] of Object.entries(v)) {
      if (AGG_FN[key(k)] && typeof x === 'string') out.push({ fn: AGG_FN[key(k)], column: x });
      else if (typeof x === 'string') out.push({ column: k, fn: x });
      else if (Array.isArray(x)) for (const f of x) out.push({ column: k, fn: f });
      else if (isObj(x)) out.push({ ...x, as: x.as ?? k });
    }
    v = out;
  }
  const list = Array.isArray(v) ? v : [v];
  const out: Record<string, unknown>[] = [];
  for (const raw of list) {
    let x = unjson(raw);
    if (typeof x === 'string') {
      // "sum(Net Exposure) as expo", "count(*)", "count".
      const m = /^\s*([a-z_]+)\s*\(\s*(.*?)\s*\)\s*(?:as\s+(.+?))?\s*$/i.exec(x);
      if (m && AGG_FN[key(m[1])]) x = { fn: m[1], column: m[2] || '*', ...(m[3] ? { as: m[3] } : {}) };
      else if (AGG_FN[key(x)]) x = { fn: x };
      else x = { column: x };
    }
    if (!isObj(x)) continue;
    const o: Record<string, unknown> = { ...x };
    // {sum: "X"} / {"X": "sum"} with one key.
    const keys = Object.keys(o);
    if (keys.length === 1 && !COL_KEYS.has(keys[0]!) && !FN_KEYS.includes(keys[0]!)) {
      const k = keys[0]!;
      const val = o[k];
      if (AGG_FN[key(k)]) out.push({ fn: AGG_FN[key(k)], column: val });
      else if (typeof val === 'string' && AGG_FN[key(val)]) out.push({ column: k, fn: AGG_FN[key(val)] });
      else out.push(o);
      continue;
    }
    o.column = colOf(o) ?? (o.as !== undefined || FN_KEYS.some((k) => o[k] !== undefined) ? o.name : undefined);
    if (o.name !== undefined && o.column !== o.name && o.as === undefined) o.as = o.name;
    o.as ??= o.alias ?? o.label ?? o.output;
    let fn: unknown;
    for (const k of FN_KEYS) if (o[k] !== undefined && typeof o[k] === 'string' && AGG_FN[key(o[k])]) { fn = o[k]; break; }
    fn ??= o.fn ?? o.op ?? o.agg ?? o.function;
    const clean: Record<string, unknown> = { fn: aggFn(fn) };
    if (o.as !== undefined && o.as !== null && o.as !== '') clean.as = String(o.as);
    const cols = Array.isArray(o.column) ? o.column : [o.column];
    for (const c of cols) {
      const col = c === undefined || c === null || c === '' ? (clean.fn === 'count' ? '*' : c) : c;
      out.push({ ...clean, column: col, ...(cols.length > 1 && clean.as ? { as: `${String(clean.as)}_${String(col)}` } : {}) });
    }
  }
  return out;
}

function coerceFilters(v: unknown): unknown[] | undefined {
  v = unjson(v);
  if (v === undefined || v === null) return undefined;
  // {column: value} map (value list = in, {">": 5} = an operator).
  if (isObj(v) && !Object.keys(v).some((k) => COL_KEYS.has(k) || k === 'op' || k === 'operator' || k === 'value')) {
    v = Object.entries(v).map(([column, x]) => {
      if (Array.isArray(x)) return { column, op: 'in', value: x };
      if (isObj(x) && Object.keys(x).length === 1) {
        const [op, value] = Object.entries(x)[0]!;
        return { column, op, value };
      }
      return { column, op: 'eq', value: x };
    });
  }
  const out: Record<string, unknown>[] = [];
  for (const raw of Array.isArray(v) ? v : [v]) {
    const x = unjson(raw);
    if (!isObj(x)) continue;
    const o: Record<string, unknown> = { ...x };
    o.column = colOf(o) ?? o.name;
    const value = o.value ?? o.val ?? o.values ?? o.valeur;
    const rawOp = o.op ?? o.operator ?? o.operation ?? o.cmp ?? o.condition ?? o.comparison;
    let op = rawOp === undefined ? (Array.isArray(value) ? 'in' : value === undefined ? 'not_null' : 'eq') : FILTER_OP[key(rawOp)] ?? key(rawOp);
    if (op === 'eq' && Array.isArray(value)) op = 'in';
    if (op === 'in' && !Array.isArray(value)) {
      out.push({ column: o.column, op: 'in', value: value === undefined ? [] : [value] });
      continue;
    }
    if (op === 'not_in') {
      // not in [a, b] = ≠ a AND ≠ b.
      for (const y of Array.isArray(value) ? value : [value]) out.push({ column: o.column, op: 'neq', value: y });
      continue;
    }
    if (op === 'between') {
      const [lo, hi] = Array.isArray(value) ? value : isObj(value) ? [value.min ?? value.from ?? value.low, value.max ?? value.to ?? value.high] : [value, undefined];
      if (lo !== undefined && lo !== null) out.push({ column: o.column, op: 'gte', value: lo });
      if (hi !== undefined && hi !== null) out.push({ column: o.column, op: 'lte', value: hi });
      continue;
    }
    out.push({ column: o.column, op, ...(value !== undefined ? { value } : {}) });
  }
  return out;
}

function coerceSort(v: unknown, dirDefault?: string): unknown[] | undefined {
  v = unjson(v);
  if (v === undefined || v === null) return undefined;
  if (isObj(v) && !Object.keys(v).some((k) => COL_KEYS.has(k) || ['dir', 'order', 'direction', 'ascending', 'descending', 'desc', 'asc', 'by'].includes(k)))
    v = Object.entries(v).map(([column, d]) => ({ column, dir: d }));
  const dirOf = (d: unknown) => (typeof d === 'string' && /^desc|^dec|^decroissant|^down/i.test(d.normalize('NFD').replace(/[̀-ͯ]/g, '')) ? 'desc' : 'asc');
  const out: Record<string, unknown>[] = [];
  for (const raw of Array.isArray(v) ? v : [v]) {
    const x = unjson(raw);
    if (typeof x === 'string') {
      const m = /^\s*(-)?(.*?)(?:[\s:]+(asc|desc|ascending|descending))?\s*$/i.exec(x)!;
      out.push({ column: m[2], dir: m[1] ? 'desc' : m[3] ? dirOf(m[3]) : dirDefault ?? 'asc' });
      continue;
    }
    if (!isObj(x)) continue;
    const o: Record<string, unknown> = { ...x };
    const column = colOf(o) ?? o.by ?? o.name;
    let dir: string = dirDefault ?? 'asc';
    const d = o.dir ?? o.order ?? o.direction ?? o.sort;
    if (typeof d === 'string') dir = dirOf(d);
    if (o.ascending === false || o.descending === true || o.desc === true || o.asc === false) dir = 'desc';
    if (o.ascending === true || o.asc === true || o.desc === false) dir = 'asc';
    out.push({ column, dir });
  }
  return out;
}

export function coerceQuery(raw: unknown): unknown {
  raw = unjson(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const q: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  for (const [k, v] of Object.entries(q)) {
    const target = TOP_ALIAS[key(k)] ?? TOP_ALIAS[k];
    if (target && target !== k && q[target] === undefined) {
      q[target] = v;
      delete q[k];
    }
  }
  // A top-level direction (« order: "desc" », « ascending: false ») applies to the sort keys that give none.
  const topDir = typeof q.order === 'string' && /^(asc|desc)/i.test(q.order) ? (/^desc/i.test(q.order) ? 'desc' : 'asc') : q.ascending === false || q.descending === true ? 'desc' : undefined;
  if (q.sort === undefined && typeof q.order === 'string' && !topDir) q.sort = q.order;
  for (const k of ['order', 'ascending', 'descending']) delete q[k];
  q.filters = coerceFilters(q.filters);
  q.aggregations = coerceAggs(q.aggregations);
  q.sort = coerceSort(q.sort, topDir);
  const gb = unjson(q.groupBy);
  if (gb !== undefined && gb !== null)
    q.groupBy = (Array.isArray(gb) ? gb : [gb]).map((g) => {
      const x = unjson(g);
      if (typeof x === 'string') return { column: x };
      if (!isObj(x)) return x;
      const b = x.bucket ?? x.granularity ?? x.period ?? x.freq ?? x.interval;
      return { column: colOf(x) ?? x.name, ...(b !== undefined && b !== null ? { bucket: BUCKET[key(b)] ?? key(b) } : {}) };
    });
  const sel = unjson(q.select);
  if (sel !== undefined && sel !== null) {
    const list = (Array.isArray(sel) ? sel : typeof sel === 'string' && sel.includes(',') && !sel.includes('"') ? sel.split(',').map((s) => s.trim()) : [sel])
      .map((s) => (isObj(s) ? colOf(s) ?? s.name : s))
      .filter((s) => s !== '*');
    q.select = list.length ? list : undefined;
  }
  for (const k of ['limit', 'offset']) {
    const n = typeof q[k] === 'string' ? Number(q[k]) : isObj(q[k]) ? Number((q[k] as Record<string, unknown>).n ?? (q[k] as Record<string, unknown>).limit) : q[k];
    q[k] = typeof n === 'number' && Number.isFinite(n) ? Math.min(5_000_000, Math.max(k === 'limit' ? 1 : 0, Math.round(n))) : undefined;
  }
  for (const k of Object.keys(q)) if (q[k] === undefined) delete q[k];
  return q;
}

// ── value helpers ──────────────────────────────────────────────────────
const isMissing = (v: Cell | undefined) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

export function toNumber(v: Cell | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const s = v
      .trim()
      .replace(/\s/g, '')
      .replace(/[€$£%]/g, '');
    if (!s) return null;
    // Accept "1,234.5", "1 234,5" and "1234,5"
    let norm: string;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) norm = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d+(,\d+)$/.test(s)) norm = s.replace(',', '.');
    else norm = s.replace(/,/g, '');
    const n = Number(norm);
    return Number.isFinite(n) && /^-?[\d.]+(e-?\d+)?$/i.test(norm) ? n : null;
  }
  return null;
}

export function toDate(v: Cell | undefined): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const s = v.trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (m) return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // dd/mm/yyyy (FR convention)
    if (m) return new Date(Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!));
  }
  return null;
}

function bucketKey(d: Date, bucket: z.infer<typeof BucketSchema>): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  switch (bucket) {
    case 'year':
      return String(y);
    case 'quarter':
      return `${y}-T${Math.floor(d.getUTCMonth() / 3) + 1}`;
    case 'month':
      return `${y}-${mo}`;
    case 'week': {
      const t = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
      const day = t.getUTCDay() || 7;
      t.setUTCDate(t.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return `${t.getUTCFullYear()}-S${String(week).padStart(2, '0')}`;
    }
    default:
      return `${y}-${mo}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function aggregate(values: Cell[], fn: z.infer<typeof AggFn>): number | null {
  if (fn === 'count') return values.filter((v) => !isMissing(v)).length;
  if (fn === 'count_distinct')
    return new Set(
      values.filter((v) => !isMissing(v)).map((v) => (v instanceof Date ? v.toISOString() : String(v))),
    ).size;
  const nums = values.map(toNumber).filter((n): n is number => n !== null);
  if (!nums.length) return null;
  switch (fn) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0);
    case 'avg':
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min':
      return Math.min(...nums);
    case 'max':
      return Math.max(...nums);
    case 'median':
      return quantile(
        [...nums].sort((a, b) => a - b),
        0.5,
      );
  }
}

/** Equality as a reader means it: numbers by value (8200 = « 8200 »), dates by day, text without case / accents / stray spaces. */
function sameValue(v: Cell | undefined, w: Cell | undefined): boolean {
  const a = toNumber(v ?? null);
  const b = toNumber(w ?? null);
  if (a !== null && b !== null) return a === b;
  const s = (x: Cell | undefined) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x ?? '').trim());
  const x = s(v);
  const y = s(w);
  return x === y || normName(x) === normName(y);
}

export function matchFilter(row: DataRow, f: DataFilter): boolean {
  const v = row[f.column];
  switch (f.op) {
    case 'is_null':
      return isMissing(v);
    case 'not_null':
      return !isMissing(v);
    case 'contains':
      return String(v ?? '')
        .toLowerCase()
        .includes(String(f.value ?? '').toLowerCase());
    case 'in': {
      // Same tolerance as « eq » (8200 = « 8200 », « np » = « NP », stray spaces) for each listed value.
      if (!Array.isArray(f.value)) return false;
      return f.value.some((x) => sameValue(v, x as Cell));
    }
    default: {
      const a = toNumber(v);
      const b = toNumber(f.value as Cell);
      const da = toDate(v);
      const db = toDate(f.value as Cell);
      let cmp: number;
      if (a !== null && b !== null) cmp = a - b;
      else if (da && db) cmp = da.getTime() - db.getTime();
      else cmp = String(v ?? '').localeCompare(String(f.value ?? ''));
      if (f.op === 'eq') return sameValue(v, f.value as Cell);
      if (f.op === 'neq') return !sameValue(v, f.value as Cell);
      if (f.op === 'gt') return cmp > 0;
      if (f.op === 'gte') return cmp >= 0;
      if (f.op === 'lt') return cmp < 0;
      return cmp <= 0;
    }
  }
}

const display = (v: Cell): string | number | boolean | null =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v;
/** Grouping value: the same code typed as a number in one row and as text in another (8200 / « 8200 », a frequent mix in
 *  bank extracts, .xlsb included), or a label with stray spaces, is ONE group. Codes with a leading zero stay text. */
const groupValue = (v: Cell): string | number | boolean | null => {
  const d = display(v);
  if (typeof d !== 'string') return d;
  const t = d.trim();
  return /^-?(0|[1-9]\d*)(\.\d+)?$/.test(t) ? Number(t) : t;
};

// ── engine ─────────────────────────────────────────────────────────────
export class DataCore {
  /** Parses CSV/TSV/Excel/JSON bytes (no I/O: shared by the server and the standalone client). */
  parseBytes(name: string, bytes: Uint8Array, sheet: string | null = null): Dataset {
    const absPath = name;
    const ext = extOf(name);
    const decode = () => new TextDecoder('utf-8').decode(bytes);
    if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
      const text = decode().replace(/^\uFEFF/, '');
      const parsed = Papa.parse<Record<string, unknown>>(text, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: 'greedy',
        delimiter: ext === '.tsv' ? '\t' : '',
        transformHeader: (h, i) => h.trim() || `col_${i + 1}`,
      });
      const columns = parsed.meta.fields ?? [];
      const rows = parsed.data.map((r) => {
        const row: DataRow = {};
        for (const c of columns) {
          const v = r[c];
          row[c] = v === undefined || v === '' ? null : (v as Cell);
        }
        return row;
      });
      return { path: absPath, sheet: null, sheets: [], columns, rows };
    }
    if (['.xlsx', '.xls', '.xlsm', '.xlsb', '.ods'].includes(ext)) {
      // Only the sheet asked is parsed (v62: a 3-sheet .xlsb was parsed whole for each sheet looked at).
      const names = XLSX.read(bytes, { type: 'array', bookSheets: true }).SheetNames;
      // Tolerant sheet name (« Portefeuille », « PORTEFEUILLE ») — an unknown sheet is an ERROR listing the real ones,
      // never a silent fallback to the first sheet (v48: every PORTEFEUILLE column became « unknown »).
      const wanted = sheet?.trim();
      const name = wanted ? (names.find((s) => s === wanted) ?? names.find((s) => normName(s) === normName(wanted))) : names[0];
      if (wanted && !name) throw new Error(`Feuille « ${wanted} » introuvable. Feuilles du fichier : ${names.map((s) => `« ${s} »`).join(', ')}`);
      if (!name) return { path: absPath, sheet: null, sheets: [], columns: [], rows: [] };
      let wb = XLSX.read(bytes, { type: 'array', cellDates: true, dense: true, sheets: name });
      if (!wb.Sheets[name]) wb = XLSX.read(bytes, { type: 'array', cellDates: true, dense: true });
      const ws = wb.Sheets[name]!;
      const matrix = XLSX.utils.sheet_to_json<Cell[]>(ws, {
        header: 1,
        defval: null,
        raw: true,
        blankrows: false,
      });
      // Header row = first row with at least half non-empty cells.
      let headerIdx = matrix.findIndex(
        (r) => r.filter((c) => !isMissing(c)).length >= Math.max(1, Math.ceil(r.length / 2)),
      );
      if (headerIdx < 0) headerIdx = 0;
      const header = (matrix[headerIdx] ?? []).map((h, i) =>
        isMissing(h) ? `col_${i + 1}` : String(display(h)).trim(),
      );
      const seen = new Map<string, number>();
      const columns = header.map((h) => {
        const n = seen.get(h) ?? 0;
        seen.set(h, n + 1);
        return n ? `${h}_${n + 1}` : h;
      });
      const rows = matrix.slice(headerIdx + 1).map((r) => {
        const row: DataRow = {};
        columns.forEach((c, i) => (row[c] = (r[i] ?? null) as Cell));
        return row;
      });
      return { path: absPath, sheet: name, sheets: names, columns, rows };
    }
    if (ext === '.json' || ext === '.jsonl' || ext === '.ndjson') {
      const raw = decode();
      let data: unknown;
      if (ext === '.json') data = JSON.parse(raw);
      else
        data = raw
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l) as unknown);
      const findArray = (v: unknown, depth = 0): unknown[] | null => {
        if (Array.isArray(v)) return v;
        if (v && typeof v === 'object' && depth < 3) {
          for (const val of Object.values(v)) {
            const arr = findArray(val, depth + 1);
            if (arr && arr.length) return arr;
          }
        }
        return null;
      };
      const arr = findArray(data) ?? [data];
      const flatten = (obj: unknown, prefix = '', out: DataRow = {}): DataRow => {
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          for (const [k, v] of Object.entries(obj)) {
            if (v && typeof v === 'object' && !Array.isArray(v) && prefix.split('.').length < 3)
              flatten(v, `${prefix}${k}.`, out);
            else out[`${prefix}${k}`] = Array.isArray(v) ? JSON.stringify(v) : (v as Cell);
          }
        } else out[prefix ? prefix.slice(0, -1) : 'value'] = obj as Cell;
        return out;
      };
      const rows = arr.map((r) => flatten(r));
      const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      for (const r of rows) for (const c of columns) if (!(c in r)) r[c] = null;
      return { path: absPath, sheet: null, sheets: [], columns, rows };
    }
    throw new Error(`Unsupported data format: ${ext}`);
  }

  profile(ds: Dataset): DatasetProfile {
    const anomalies: string[] = [];
    const columns = ds.columns.map((name): ColumnProfile => {
      const values = ds.rows.map((r) => r[name] ?? null);
      const present = values.filter((v) => !isMissing(v));
      const missing = values.length - present.length;
      const uniqueSet = new Set(present.map((v) => (v instanceof Date ? v.toISOString() : String(v))));
      const sample = present.slice(0, 5).map(display) as Cell[];
      const base = {
        name,
        missing,
        missingPct: values.length ? +((missing / values.length) * 100).toFixed(1) : 0,
        unique: uniqueSet.size,
        sample,
      };
      if (!present.length) return { ...base, type: 'empty' };

      const nums = present.map(toNumber);
      const numCount = nums.filter((n) => n !== null).length;
      const dates = present.map((v) => (typeof v === 'number' ? null : toDate(v)));
      const dateCount = dates.filter(Boolean).length;
      const boolCount = present.filter(
        (v) => typeof v === 'boolean' || /^(true|false|oui|non|yes|no)$/i.test(String(v)),
      ).length;

      if (numCount / present.length >= 0.9) {
        const arr = nums.filter((n): n is number => n !== null).sort((a, b) => a - b);
        const sum = arr.reduce((a, b) => a + b, 0);
        const mean = sum / arr.length;
        const std = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
        const p25 = quantile(arr, 0.25);
        const p75 = quantile(arr, 0.75);
        const iqr = p75 - p25;
        const outliers = iqr > 0 ? arr.filter((v) => v < p25 - 1.5 * iqr || v > p75 + 1.5 * iqr).length : 0;
        const negatives = arr.filter((v) => v < 0).length;
        if (numCount < present.length)
          anomalies.push(
            `« ${name} » : ${present.length - numCount} valeur(s) non numérique(s) dans une colonne numérique`,
          );
        if (outliers) anomalies.push(`« ${name} » : ${outliers} valeur(s) aberrante(s) (règle IQR 1,5×)`);
        if (negatives && negatives / arr.length < 0.05)
          anomalies.push(`« ${name} » : ${negatives} valeur(s) négative(s) inhabituelle(s)`);
        return {
          ...base,
          type: arr.every((v) => Number.isInteger(v)) ? 'integer' : 'number',
          numeric: {
            min: arr[0]!,
            max: arr[arr.length - 1]!,
            mean,
            median: quantile(arr, 0.5),
            std,
            p25,
            p75,
            sum,
            outliers,
            negatives,
            zeros: arr.filter((v) => v === 0).length,
          },
        };
      }
      if (dateCount / present.length >= 0.9) {
        const ts = dates
          .filter((d): d is Date => d !== null)
          .map((d) => d.getTime())
          .sort((a, b) => a - b);
        return {
          ...base,
          type: 'date',
          date: {
            min: new Date(ts[0]!).toISOString().slice(0, 10),
            max: new Date(ts[ts.length - 1]!).toISOString().slice(0, 10),
          },
        };
      }
      const counts = new Map<string, number>();
      for (const v of present) {
        const k = String(display(v));
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({ value, count }));
      if (boolCount === present.length) return { ...base, type: 'boolean', top };
      const mixed = numCount > present.length * 0.2 && numCount < present.length * 0.9;
      if (mixed) anomalies.push(`« ${name} » : types mélangés (nombres et texte)`);
      const categorical =
        uniqueSet.size <= Math.max(50, present.length * 0.05) && uniqueSet.size < present.length * 0.5;
      return { ...base, type: mixed ? 'mixed' : categorical ? 'categorical' : 'text', top };
    });
    for (const c of columns) {
      if (c.missingPct >= 20) anomalies.push(`« ${c.name} » : ${c.missingPct}% de valeurs manquantes`);
      if (c.unique === 1 && ds.rows.length > 1) anomalies.push(`« ${c.name} » : colonne constante`);
    }
    const seen = new Set<string>();
    let duplicateRows = 0;
    for (const r of ds.rows) {
      const k = JSON.stringify(ds.columns.map((c) => display(r[c] ?? null)));
      if (seen.has(k)) duplicateRows++;
      else seen.add(k);
    }
    if (duplicateRows) anomalies.unshift(`${duplicateRows} ligne(s) en double`);
    return {
      path: ds.path,
      sheet: ds.sheet,
      sheets: ds.sheets,
      rowCount: ds.rows.length,
      columnCount: ds.columns.length,
      duplicateRows,
      columns,
      anomalies,
    };
  }

  query(
    ds: Dataset,
    spec: QuerySpec,
  ): { columns: string[]; rows: Record<string, unknown>[]; rowCount: number } {
    for (const f of spec.filters ?? [])
      if (!ds.columns.includes(f.column)) throw new Error(`Unknown column in filter: ${f.column}`);
    const rows = ds.rows.filter((r) => (spec.filters ?? []).every((f) => matchFilter(r, f as DataFilter)));
    let columns: string[];
    let out: Record<string, unknown>[];

    if (spec.groupBy?.length || spec.aggregations?.length) {
      const groups = new Map<string, { keys: Record<string, unknown>; rows: DataRow[] }>();
      for (const g of spec.groupBy ?? [])
        if (!ds.columns.includes(g.column)) throw new Error(`Unknown groupBy column: ${g.column}`);
      for (const r of rows) {
        const keys: Record<string, unknown> = {};
        for (const g of spec.groupBy ?? []) {
          const v = r[g.column];
          if (g.bucket) {
            const d = toDate(v ?? null) ?? (typeof v === 'number' ? excelSerialToDate(v) : null);
            keys[g.column] = d ? bucketKey(d, g.bucket) : null;
          } else keys[g.column] = groupValue(v ?? null);
        }
        const k = JSON.stringify(keys);
        let grp = groups.get(k);
        if (!grp) groups.set(k, (grp = { keys, rows: [] }));
        grp.rows.push(r);
      }
      const aggs = spec.aggregations?.length
        ? spec.aggregations
        : [{ column: '*', fn: 'count' as const, as: 'count' }];
      out = [...groups.values()].map((g) => {
        const row: Record<string, unknown> = { ...g.keys };
        for (const a of aggs) {
          const name = a.as ?? `${a.fn}_${a.column}`;
          const values =
            a.column === '*' ? g.rows.map(() => 1 as Cell) : g.rows.map((r) => r[a.column] ?? null);
          const v = aggregate(values, a.fn);
          row[name] = v === null ? null : Math.round(v * 1e6) / 1e6;
        }
        return row;
      });
      columns = [
        ...(spec.groupBy ?? []).map((g) => g.column),
        ...aggs.map((a) => a.as ?? `${a.fn}_${a.column}`),
      ];
    } else {
      columns = spec.select?.length ? spec.select.filter((c) => ds.columns.includes(c)) : ds.columns;
      out = rows.map((r) => Object.fromEntries(columns.map((c) => [c, display(r[c] ?? null)])));
    }
    for (const s of [...(spec.sort ?? [])].reverse()) {
      out.sort((a, b) => {
        const va = a[s.column];
        const vb = b[s.column];
        const na = typeof va === 'number' ? va : toNumber(va as Cell);
        const nb = typeof vb === 'number' ? vb : toNumber(vb as Cell);
        const cmp =
          na !== null && nb !== null
            ? na - nb
            : String(va ?? '').localeCompare(String(vb ?? ''), 'fr', { numeric: true });
        return s.dir === 'desc' ? -cmp : cmp;
      });
    }
    const rowCount = out.length;
    const offset = spec.offset ?? 0;
    return { columns, rows: out.slice(offset, offset + (spec.limit ?? 500)), rowCount };
  }

  exportRows(
    columns: string[],
    rows: Record<string, unknown>[],
    format: 'csv' | 'xlsx' | 'json',
    meta: { title?: string; subtitle?: string; chart?: 'bar' | 'line' | 'pie' | 'none' } = {},
  ): Uint8Array {
    const enc = new TextEncoder();
    if (format === 'json') return enc.encode(JSON.stringify(rows, null, 2));
    if (format === 'csv')
      return enc.encode(
        `\uFEFF${Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? '')) })}`,
      );
    // House style: navy title band, lime filet, navy header, zebra, XOF formats.
    return houseXlsx(columns, rows, { title: meta.title, subtitle: meta.subtitle, chart: meta.chart });
  }

  sheetNamesOf(name: string, bytes: Uint8Array): string[] {
    if (!['.xlsx', '.xls', '.xlsm', '.xlsb', '.ods'].includes(extOf(name))) return [];
    return XLSX.read(bytes, { type: 'array', bookSheets: true }).SheetNames;
  }
}

/** Excel stores dates as serial numbers (days since 1899-12-30). */
export function excelSerialToDate(n: number): Date | null {
  if (n < 20000 || n > 80000) return null;
  return new Date(Date.UTC(1899, 11, 30) + n * 86400000);
}

export function isDataFile(p: string): boolean {
  return DATA_EXTENSIONS.includes(extOf(p));
}

export function extOf(p: string): string {
  const base = p.split(/[\\/]/).pop() ?? p;
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i).toLowerCase() : '';
}

function fmtNum(n: number): string {
  return Math.abs(n) >= 1e6 ? n.toExponential(3) : Number.isInteger(n) ? String(n) : n.toFixed(3);
}

export function profileToText(p: DatasetProfile): string {
  const lines = [
    `File: ${p.path.split(/[\\/]/).pop() ?? p.path}${p.sheet ? ` — sheet "${p.sheet}"` : ''}${p.sheets.length > 1 ? ` (sheets: ${p.sheets.join(', ')})` : ''}`,
    `Rows: ${p.rowCount} · Columns: ${p.columnCount} · Duplicate rows: ${p.duplicateRows}`,
    '',
    '| column | type | missing | unique | stats / top values |',
    '|---|---|---|---|---|',
  ];
  for (const c of p.columns) {
    let stats = '';
    if (c.numeric)
      stats = `min ${fmtNum(c.numeric.min)} · max ${fmtNum(c.numeric.max)} · mean ${fmtNum(c.numeric.mean)} · median ${fmtNum(c.numeric.median)} · sum ${fmtNum(c.numeric.sum)}`;
    else if (c.date) stats = `${c.date.min} → ${c.date.max}`;
    else if (c.top)
      stats = c.top
        .slice(0, 5)
        .map((t) => `${t.value.slice(0, 30)} (${t.count})`)
        .join(', ');
    lines.push(`| ${c.name} | ${c.type} | ${c.missing} (${c.missingPct}%) | ${c.unique} | ${stats} |`);
  }
  if (p.anomalies.length) lines.push('', 'Anomalies:', ...p.anomalies.map((a) => `- ${a}`));
  return lines.join('\n');
}

export function rowsToText(columns: string[], rows: Record<string, unknown>[], max = 60): string {
  const head = `| ${columns.join(' | ')} |\n|${columns.map(() => '---').join('|')}|`;
  const body = rows
    .slice(0, max)
    .map(
      (r) =>
        `| ${columns
          .map((c) =>
            String(r[c] ?? '')
              .replace(/\|/g, '\\|')
              .slice(0, 60),
          )
          .join(' | ')} |`,
    )
    .join('\n');
  return `${head}\n${body}${rows.length > max ? `\n… ${rows.length - max} more rows` : ''}`;
}
