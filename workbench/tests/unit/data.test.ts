import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataEngine, toNumber, toDate } from '../../server/services/dataEngine';
import { computeChart } from '../../server/services/vizEngine';

let dir: string;
const engine = new DataEngine();

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-data-'));
  const rows = ['date,agence,encours,impayes,statut'];
  for (let i = 0; i < 60; i++) {
    const month = String((i % 3) + 1).padStart(2, '0');
    rows.push(
      `2026-${month}-${String((i % 27) + 1).padStart(2, '0')},${['Dakar', 'Thiès', 'Pikine'][i % 3]},${1000 + i * 10},${i % 10 === 0 ? '' : i},${i % 2 ? 'sain' : 'douteux'}`,
    );
  }
  rows.push('2026-03-01,Dakar,999999,5,sain'); // outlier
  rows.push(rows[1]!); // duplicate
  fs.writeFileSync(path.join(dir, 'p.csv'), rows.join('\n'));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Rapport 2026'],
      ['Client', 'Montant', 'Date'],
      ['A', 10, new Date(Date.UTC(2026, 0, 5))],
      ['B', 20, new Date(Date.UTC(2026, 1, 5))],
    ]),
    'Synthese',
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], [1]]), 'Autre');
  fs.writeFileSync(path.join(dir, 'r.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
  fs.writeFileSync(
    path.join(dir, 'd.json'),
    JSON.stringify({
      meta: { n: 2 },
      items: [
        { id: 1, info: { city: 'Dakar' } },
        { id: 2, info: { city: 'Thiès' }, extra: true },
      ],
    }),
  );
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('value parsing', () => {
  it('parses numbers in FR/EN formats', () => {
    expect(toNumber('1 234,5')).toBe(1234.5);
    expect(toNumber('1.234,5')).toBe(1234.5);
    expect(toNumber('1,234.5')).toBe(1234.5);
    expect(toNumber('12 %')).toBe(12);
    expect(toNumber('abc')).toBeNull();
  });
  it('parses ISO and dd/mm/yyyy dates', () => {
    expect(toDate('2026-03-04')?.toISOString().slice(0, 10)).toBe('2026-03-04');
    expect(toDate('04/03/2026')?.toISOString().slice(0, 10)).toBe('2026-03-04');
  });
});

describe('data engine', () => {
  it('profiles a CSV: types, missing values, outliers, duplicates', async () => {
    const ds = await engine.load(path.join(dir, 'p.csv'));
    const p = engine.profile(ds);
    expect(p.rowCount).toBe(62);
    const byName = Object.fromEntries(p.columns.map((c) => [c.name, c]));
    expect(byName.date!.type).toBe('date');
    expect(byName.encours!.type).toBe('integer');
    expect(byName.agence!.type).toBe('categorical');
    expect(byName.impayes!.missing).toBeGreaterThan(0);
    expect(byName.encours!.numeric!.outliers).toBeGreaterThanOrEqual(1);
    expect(p.duplicateRows).toBe(1);
    expect(p.anomalies.join(' ')).toMatch(/double/);
  });
  it('queries with filters, monthly buckets, aggregations and sort', async () => {
    const ds = await engine.load(path.join(dir, 'p.csv'));
    const r = engine.query(ds, {
      filters: [{ column: 'statut', op: 'eq', value: 'sain' }],
      groupBy: [{ column: 'date', bucket: 'month' }],
      aggregations: [
        { column: 'encours', fn: 'sum', as: 'total' },
        { column: '*', fn: 'count', as: 'n' },
      ],
      sort: [{ column: 'date', dir: 'asc' }],
    });
    expect(r.columns).toEqual(['date', 'total', 'n']);
    expect(r.rows.map((x) => x.date)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(r.rows.reduce((a, x) => a + Number(x.n), 0)).toBe(31);
  });
  it('reads Excel sheets and detects the header row', async () => {
    const file = path.join(dir, 'r.xlsx');
    expect(await engine.sheetNames(file)).toEqual(['Synthese', 'Autre']);
    const ds = await engine.load(file, 'Synthese');
    expect(ds.columns).toEqual(['Client', 'Montant', 'Date']);
    expect(ds.rows).toHaveLength(2);
    expect(engine.profile(ds).columns.find((c) => c.name === 'Date')!.type).toBe('date');
  });
  it('flattens nested JSON arrays', async () => {
    const ds = await engine.load(path.join(dir, 'd.json'));
    expect(ds.columns).toEqual(expect.arrayContaining(['id', 'info.city', 'extra']));
    expect(ds.rows[0]!['info.city']).toBe('Dakar');
  });
  it('exports csv / xlsx / json', async () => {
    const ds = await engine.load(path.join(dir, 'p.csv'));
    const q = engine.query(ds, { limit: 5 });
    expect(engine.exportRows(q.columns, q.rows, 'csv').toString('utf8')).toContain('agence');
    expect(XLSX.read(engine.exportRows(q.columns, q.rows, 'xlsx')).SheetNames).toEqual(['Data']);
    expect(JSON.parse(engine.exportRows(q.columns, q.rows, 'json').toString())).toHaveLength(5);
  });
});

describe('visualisation engine', () => {
  it('computes bar/line, pie, histogram, heatmap, scatter and KPIs', async () => {
    const ds = await engine.load(path.join(dir, 'p.csv'));
    const src = { path: 'p.csv' };
    const line = computeChart(ds, {
      type: 'line',
      title: 't',
      source: src,
      x: { column: 'date', bucket: 'month' },
      y: [{ column: 'encours', agg: 'sum' }],
    });
    expect(line.categories).toEqual(['2026-01', '2026-02', '2026-03']);
    const pie = computeChart(ds, { type: 'pie', title: 't', source: src, x: { column: 'agence' } });
    expect(pie.series[0]!.data.reduce((a, b) => a! + b!, 0)).toBe(62);
    const hist = computeChart(ds, {
      type: 'histogram',
      title: 't',
      source: src,
      x: { column: 'encours' },
      bins: 5,
    });
    expect(hist.series[0]!.data).toHaveLength(5);
    const heat = computeChart(ds, {
      type: 'heatmap',
      title: 't',
      source: src,
      x: { column: 'agence' },
      series: 'statut',
      y: [{ column: '*', agg: 'count' }],
    });
    expect(heat.matrix!.xLabels).toHaveLength(3);
    const sc = computeChart(ds, {
      type: 'scatter',
      title: 't',
      source: src,
      x: { column: 'encours' },
      y: [{ column: 'impayes', agg: 'sum' }],
    });
    expect(sc.points!.length).toBeGreaterThan(40);
    const kpi = computeChart(ds, {
      type: 'kpi',
      title: 't',
      source: src,
      y: [{ column: 'encours', agg: 'max' }],
    });
    expect(kpi.kpis![0]!.value).toBe(999999);
    const split = computeChart(ds, {
      type: 'bar',
      title: 't',
      source: src,
      x: { column: 'agence' },
      y: [{ column: 'encours', agg: 'sum' }],
      series: 'statut',
    });
    expect(split.series.map((s) => s.name).sort()).toEqual(['douteux', 'sain']);
  });
  it('rejects unknown columns with a helpful message', async () => {
    const ds = await engine.load(path.join(dir, 'p.csv'));
    expect(() =>
      computeChart(ds, { type: 'bar', title: 't', source: { path: 'p.csv' }, x: { column: 'nope' } }),
    ).toThrow(/Available/);
  });
});
