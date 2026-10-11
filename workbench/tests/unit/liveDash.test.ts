import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { cloneData } from '../../server/services/dashRender';
import { houseXlsx } from '../../server/services/houseStyle';
import { addLiveDashboard, shortLabel, snapBoxes } from '../../server/services/liveDash';
import { SPEC } from '../fixtures/dashSpec';

const rows = Array.from({ length: 48 }, (_, i) => ({ Client: ['ALPHA SA', 'BETA SARL', 'GAMMA', 'DELTA'][i % 4]!, Segment: ['CORPORATE', 'CONSUMER', 'COMMERCIAL'][i % 3]!, Date: new Date(Date.UTC(2025, i % 12, 5)), Montant: 1_000_000 * (i + 1) }));
const cols = ['Client', 'Segment', 'Date', 'Montant'];

describe('LIVE dashboard on the image design: formulas, filters, real cells — no fixed picture', () => {
  const r = addLiveDashboard(houseXlsx(cols, rows, { title: 'X', chart: 'none' }), SPEC, cloneData('Ventes', cols, rows))!;
  const z = unzipSync(r.bytes);
  const dash = strFromU8(z['xl/worksheets/sheet-live-dash.xml']!);
  const data = strFromU8(z['xl/worksheets/sheet-live-data.xml']!);
  const drawing = strFromU8(z['xl/drawings/drawing-live-dash.xml']!);
  it('no picture anywhere; dashboard first, its data last', () => {
    expect(Object.keys(z).some((p) => p.startsWith('xl/media/'))).toBe(false);
    const wb = strFromU8(z['xl/workbook.xml']!);
    expect(wb).toMatch(/<sheets><sheet name="Tableau de bord"/);
    expect(wb).toMatch(/<sheet name="Données du tableau de bord"[^>]*\/><\/sheets>/);
    expect(wb).toContain('fullCalcOnLoad="1"');
  });
  it('a filter drop-down on a category (never an identifier), every figure following it', () => {
    expect(r.filters[0]).toBe('Segment');
    expect(dash).toContain('<dataValidation type="list"');
    expect(data).toContain('(Tous)');
    expect(data).toMatch(/SUMPRODUCT\(/);
  });
  it('KPI tiles display their formula cell live; charts are native; the table is real cells', () => {
    expect(r.kpis).toBeGreaterThan(0);
    expect(drawing).toMatch(/textlink="'Données du tableau de bord'!\$[A-Z]+\$\d+"/);
    expect(drawing).toContain('type="TxLink"');
    expect(r.charts).toBeGreaterThanOrEqual(4);
    expect(r.tables).toBe(1);
    expect(dash).toMatch(/<f>'Données du tableau de bord'!/);
    expect(data).toMatch(/LARGE\(/);
  });
  it('the cached figures are the chat’s own (no invented number)', () => {
    const total = rows.reduce((a, x) => a + x.Montant, 0);
    expect(data).toContain(`<v>${total}</v>`);
  });
  it('Excel-safe max: never N(+range) (Excel keeps only the first row: the max came out below the average)', () => {
    expect(data).not.toContain('N(+');
    expect(data).toMatch(/SUMPRODUCT\(MAX\(/);
  });
  it('measure columns hold numbers only (a text « - » would turn every SUMPRODUCT into #VALUE!)', () => {
    const withText = rows.map((x, i) => ({ ...x, Montant: i === 3 ? ('-' as unknown as number) : x.Montant }));
    const r2 = addLiveDashboard(houseXlsx(cols, withText, { title: 'X', chart: 'none' }), SPEC, cloneData('Ventes', cols, withText))!;
    const d2 = strFromU8(unzipSync(r2.bytes)['xl/worksheets/sheet-live-data.xml']!);
    expect(d2).not.toMatch(/<is><t>-<\/t><\/is>/);
  });
  it('filter labels keep the panel fill; chart categories use short labels, horizontal', () => {
    expect(shortLabel('KAPPA DISTRIBUTION SENEGAL')).toBe('KAPPA DISTRIBUT…');
    expect(shortLabel('LAMBDA HOLDING')).toBe('LAMBDA HOLDING');
    expect(shortLabel('ABCDEFGHIJKLMNOPQRSTUV').length).toBe(16);
    const chart = strFromU8(z['xl/charts/chart-live-1.xml']!);
    expect(chart).toMatch(/<c:catAx>.*<a:bodyPr rot="0" vert="horz"\/>|<c:lineChart>|<c:areaChart>|<c:pieChart>|<c:doughnutChart>/s);
  });
});

describe('dashboard framing: cards of one row aligned, no partial overlap', () => {
  it('snaps near edges together and clips overlaps with a gutter', () => {
    const b = snapBoxes([
      { c0: 2, r0: 4, c1: 20, r1: 12 },
      { c0: 22, r0: 5, c1: 40, r1: 13 },
      { c0: 39, r0: 4, c1: 60, r1: 12 },
    ]);
    expect(b[1]!.r0).toBe(b[0]!.r0);
    expect(b[1]!.r1).toBe(b[0]!.r1);
    expect(b[1]!.c1).toBeLessThan(b[2]!.c0);
  });
});

describe('NEVER a picture instead of the live dashboard', () => {
  it('a sheet the model already called « Tableau de bord » is kept; ours goes first as « Tableau de bord vivant »', () => {
    const base = houseXlsx(cols, rows, { title: 'Tableau de bord', chart: 'none' });
    const z0 = unzipSync(base);
    const wb0 = strFromU8(z0['xl/workbook.xml']!).replace(/<sheet name="[^"]*"/, '<sheet name="Tableau de bord"');
    const named = zipSync({ ...z0, 'xl/workbook.xml': strToU8(wb0) });
    const r2 = addLiveDashboard(named, SPEC, cloneData('Ventes', cols, rows))!;
    const wb = strFromU8(unzipSync(r2.bytes)['xl/workbook.xml']!);
    expect(wb).toMatch(/<sheets><sheet name="Tableau de bord vivant"/);
    expect(wb).toContain('name="Tableau de bord"');
    expect(Object.keys(unzipSync(r2.bytes)).some((k) => k.startsWith('xl/media/'))).toBe(false);
  });
  it('no text category: a number with few values (rate, stage) becomes the drop-down filter', () => {
    const rr = Array.from({ length: 30 }, (_, i) => ({ Client: `C${i}`, Taux: [0.25, 0.5, 1][i % 3]!, Encours: 1000 * (i + 1) }));
    const c2 = ['Client', 'Taux', 'Encours'];
    const r3 = addLiveDashboard(houseXlsx(c2, rr, { title: 'X', chart: 'none' }), SPEC, cloneData('Provisions', c2, rr))!;
    expect(r3.filters).toEqual(['Taux']);
  });
});
