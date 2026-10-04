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
  limit: z.number().int().min(1).max(100_000).optional(),
  offset: z.number().int().min(0).optional(),
});
export type QuerySpec = z.infer<typeof QuerySpecSchema>;

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
    case 'in':
      return (
        Array.isArray(f.value) &&
        f.value.map(String).includes(v instanceof Date ? v.toISOString().slice(0, 10) : String(v))
      );
    default: {
      const a = toNumber(v);
      const b = toNumber(f.value as Cell);
      const da = toDate(v);
      const db = toDate(f.value as Cell);
      let cmp: number;
      if (a !== null && b !== null) cmp = a - b;
      else if (da && db) cmp = da.getTime() - db.getTime();
      else cmp = String(v ?? '').localeCompare(String(f.value ?? ''));
      if (f.op === 'eq')
        return a !== null && b !== null ? a === b : String(v ?? '') === String(f.value ?? '');
      if (f.op === 'neq')
        return a !== null && b !== null ? a !== b : String(v ?? '') !== String(f.value ?? '');
      if (f.op === 'gt') return cmp > 0;
      if (f.op === 'gte') return cmp >= 0;
      if (f.op === 'lt') return cmp < 0;
      return cmp <= 0;
    }
  }
}

const display = (v: Cell): string | number | boolean | null =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v;

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
      const wb = XLSX.read(bytes, { type: 'array', cellDates: true, dense: true });
      const name = sheet && wb.SheetNames.includes(sheet) ? sheet : wb.SheetNames[0];
      if (!name) return { path: absPath, sheet: null, sheets: [], columns: [], rows: [] };
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
      return { path: absPath, sheet: name, sheets: wb.SheetNames, columns, rows };
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
          } else keys[g.column] = display(v ?? null);
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
    meta: { title?: string; subtitle?: string } = {},
  ): Uint8Array {
    const enc = new TextEncoder();
    if (format === 'json') return enc.encode(JSON.stringify(rows, null, 2));
    if (format === 'csv')
      return enc.encode(
        `\uFEFF${Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? '')) })}`,
      );
    // House style: navy title band, lime filet, navy header, zebra, XOF formats.
    return houseXlsx(columns, rows, { title: meta.title, subtitle: meta.subtitle });
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
