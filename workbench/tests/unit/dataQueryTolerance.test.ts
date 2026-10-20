import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { DataCore, QuerySpecSchema, coerceQuery, resolveQueryColumns } from '../../server/services/dataCore';

// A two-sheet workbook shaped like the owner's Provisions.xlsx (first sheet small, the portfolio in the 2nd one).
function workbook(): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Client', 'Total Douteux'], ['A', 10], ['B', 20]]), 'Provisions');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Stage IFRS9 Model', 'Classification', 'Total In Local Currency'],
      ['Stage 1', 'I', 100],
      ['Stage 1', 'IA', 50],
      ['Stage 3', 'III', 7],
    ]),
    'PORTEFEUILLE',
  );
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}
const data = new DataCore();

describe('v48 — data.query on Provisions.xlsx (dozens of failures in a row)', () => {
  it('the sheet name is forgiven (« Portefeuille »); an unknown sheet is an ERROR listing the real ones', () => {
    const ds = data.parseBytes('p.xlsx', workbook(), 'Portefeuille');
    expect(ds.sheet).toBe('PORTEFEUILLE');
    expect(() => data.parseBytes('p.xlsx', workbook(), 'Portfolio')).toThrow(/Feuilles du fichier : « Provisions », « PORTEFEUILLE »/);
  });
  it('column names are forgiven; count without a column; « ne » accepted', () => {
    const ds = data.parseBytes('p.xlsx', workbook(), 'PORTEFEUILLE');
    const raw = coerceQuery({
      groupBy: ['stage ifrs9 model'],
      aggregations: [{ fn: 'count' }, { column: ['total in local currency'], fn: 'SUM' }],
      filters: [{ column: 'classification', op: 'ne', value: 'III' }],
    }) as Record<string, unknown>;
    const { query, missing } = resolveQueryColumns(raw, ds.columns);
    expect(missing).toEqual([]);
    const r = data.query(ds, QuerySpecSchema.parse(query));
    expect(r.rows).toEqual([{ 'Stage IFRS9 Model': 'Stage 1', count_: 2, 'sum_Total In Local Currency': 150 }].map((x) => ({ 'Stage IFRS9 Model': x['Stage IFRS9 Model'], 'count_*': 2, 'sum_Total In Local Currency': 150 })));
  });
  it('a column of ANOTHER sheet is reported as missing (the tool then switches sheet or names it)', () => {
    const first = data.parseBytes('p.xlsx', workbook(), null);
    expect(first.sheet).toBe('Provisions');
    expect(resolveQueryColumns({ groupBy: [{ column: 'Classification' }] }, first.columns).missing).toEqual(['Classification']);
    expect(first.sheets).toEqual(['Provisions', 'PORTEFEUILLE']);
  });
});
