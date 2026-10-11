import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { cloneData } from '../../server/services/dashRender';
import { houseXlsx } from '../../server/services/houseStyle';
import { addLiveDashboard } from '../../server/services/liveDash';
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
});
