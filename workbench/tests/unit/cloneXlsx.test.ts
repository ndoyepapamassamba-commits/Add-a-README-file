import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addNativeClone, removeSheets, REPRO_SHEETS } from '../../server/services/cloneXlsx';
import { addImageSheet } from '../../server/services/officeLogo';
import { cloneData } from '../../server/services/dashRender';
import { houseXlsx } from '../../server/services/houseStyle';
import { isTotalRow, pickTable, withoutTotals } from '../../server/services/tablePick';
import { SPEC } from '../fixtures/dashSpec';

const rows = Array.from({ length: 40 }, (_, i) => ({ Client: ['ALPHA SA', 'BETA SARL', 'GAMMA', 'DELTA'][i % 4]!, Segment: ['CORPORATE', 'CONSUMER'][i % 2]!, Date: new Date(Date.UTC(2025, i % 6, 5)), Montant: 1_000_000 * (i + 1) }));

describe('the attached workbook: the DETAIL table, never the summary sheet nor TOTAL rows', () => {
  it('TOTAL / sous-total rows are recognised (a client named « TOTAL SENEGAL » is not)', () => {
    expect(isTotalRow({ a: 'TOTAL', b: 5 })).toBe(true);
    expect(isTotalRow({ a: null, b: 'Sous-total top 10', c: 9 })).toBe(true);
    expect(isTotalRow({ a: 'Total général' })).toBe(true);
    expect(isTotalRow({ a: 'TOTAL SENEGAL SA', b: 3, c: 'L0001' })).toBe(false);
    expect(isTotalRow({ a: 'TOTAL SENEGAL SA', b: 3, c: '100364529001' })).toBe(false);
    expect(isTotalRow({ a: 'Total (610 lignes)', b: 9 })).toBe(true);
    expect(isTotalRow({ a: 'TOTAL / MOYENNE', b: null, c: 4529967553 })).toBe(true); // the user's Provisions sheet
    expect(withoutTotals([{ a: 'x' }, { a: 'TOTAL' }])).toHaveLength(1);
  });
  it('a summary « Dashboard » with blocks side by side loses to the detail sheet', () => {
    const dash = { sheet: 'Dashboard', columns: ['col_1', 'Tranche', 'Douteux', 'col_5', 'Bande', 'Douteux_2'], rows: Array.from({ length: 21 }, (_, i) => ({ col_1: null, Tranche: `T${i}`, Douteux: i, col_5: null, Bande: 'b', Douteux_2: i })) };
    const det = { sheet: 'Provisions', columns: ['Client', 'Total douteux', 'Provisions'], rows: [...Array.from({ length: 15 }, (_, i) => ({ Client: `C${i}`, 'Total douteux': i, Provisions: i })), { Client: 'TOTAL', 'Total douteux': 99, Provisions: 9 }] };
    const p = pickTable([dash, det])!;
    expect(p.sheet).toBe('Provisions');
    expect(p.rows).toHaveLength(15);
  });
});

describe('NATIVE reproduction of the chosen image in Excel', () => {
  const base = houseXlsx(['Client', 'Segment', 'Date', 'Montant'], rows, { title: 'X', chart: 'none' });
  const d = cloneData('Provisions — tableau de bord', ['Client', 'Segment', 'Date', 'Montant'], rows);
  const r = addNativeClone(base, SPEC, d, { png: new Uint8Array([137, 80, 78, 71]), width: 1400, height: 788 })!;
  const z = unzipSync(r.bytes);
  const wb = strFromU8(z['xl/workbook.xml']!);
  const dr = strFromU8(z['xl/drawings/drawing-dash.xml']!);
  it('first sheet « Tableau de bord » (selected, opens on it), data sheet last, original sheets kept', () => {
    expect(wb).toMatch(/<sheets><sheet name="Tableau de bord"/);
    expect(wb).toMatch(/<sheet name="Données du tableau de bord"[^>]*\/><\/sheets>/);
    expect(wb).toContain('name="Données"');
    expect(strFromU8(z['xl/worksheets/sheet-dash.xml']!)).toContain('tabSelected="1"');
    expect(strFromU8(z['xl/worksheets/sheet1.xml']!)).not.toContain('tabSelected="1"');
  });
  it('every chart panel is a NATIVE chart of its kind, in the panel colours, fed by the data sheet', () => {
    expect(r.charts).toBe(4);
    const kinds = [1, 2, 3, 4].map((k) => strFromU8(z[`xl/charts/chart-dash-${k}.xml`]!));
    expect(kinds[0]).toContain('<c:barDir val="col"/>');
    expect(kinds[1]).toContain('<c:doughnutChart>');
    expect(kinds[2]).toContain('<c:lineChart>');
    expect(kinds[3]).toContain('<c:barDir val="bar"/>');
    expect(kinds[1]).toContain('7C3AED');
    expect(kinds[0]).toContain("'Données du tableau de bord'!$A$2");
    expect(kinds.every((k) => k.includes('Poppins'))).toBe(true);
    const data = strFromU8(z['xl/worksheets/sheet-dash-data.xml']!);
    expect(data).toContain('ALPHA SA');
  });
  it('frame, page, cards and the 4 KPI tiles (their own fills) are shapes; the table panel is the crop of the picture', () => {
    expect(dr).toContain('name="Cadre"');
    expect(dr).toContain('name="Page"');
    expect((dr.match(/name="Indicateur 1\.\d"/g) ?? []).length).toBe(4);
    for (const c of ['7C3AED', '22D3EE', 'F59E0B', '10B981']) expect(dr).toContain(`val="${c}"`);
    expect(dr).toContain('<a:srcRect');
    expect(r.crops).toBe(2); // table + text panels
    expect(dr).toContain('Provisions — tableau de bord');
  });
  it('idempotent: a workbook that already has the reproduction is left alone', () => {
    expect(addNativeClone(r.bytes, SPEC, d)).toBeNull();
  });
});

describe('the model re-saved the workbook with openpyxl (shapes and pictures lost): the reproduction comes back intact', () => {
  // Built by the app, then opened and saved by openpyxl with a sheet « Scénarios » added — as the model does.
  const resaved = new Uint8Array(readFileSync(new URL('../fixtures/resaved-by-openpyxl.xlsx', import.meta.url)));
  const names = (b: Uint8Array) => [...strFromU8(unzipSync(b)['xl/workbook.xml']!).matchAll(/<sheet\b[^>]*name="([^"]*)"/g)].map((m) => m[1]);
  it('the degraded copy has lost the dashboard drawing (what the user saw: « vide, 1×1 + graphiques flottants »)', () => {
    expect(unzipSync(resaved)['xl/drawings/drawing-dash.xml']).toBeUndefined();
  });
  const stripped = removeSheets(resaved, REPRO_SHEETS)!;
  it('the app’s three sheets are removed with their drawings, charts and pictures; the model’s sheets stay', () => {
    expect(names(stripped)).toEqual(['Données', 'Scénarios']);
    const z = unzipSync(stripped);
    const parts = Object.keys(z);
    expect(parts.filter((p) => /^xl\/(drawings|charts|media)\//.test(p))).toEqual([]);
    const ct = strFromU8(z['[Content_Types].xml']!);
    for (const m of ct.matchAll(/PartName="\/([^"]+)"/g)) expect(parts).toContain(m[1]);
    const rels = strFromU8(z['xl/_rels/workbook.xml.rels']!);
    expect(rels).not.toMatch(/sheet[0-9]+\.xml"[^>]*\/>[\s\S]*sheet[0-9]+\.xml"[^>]*\/>[\s\S]*sheet[0-9]+\.xml"[^>]*\/>[\s\S]*sheet[0-9]+\.xml"/); // 2 sheets left
  });
  it('applied again: dashboard first and intact, the model’s « Scénarios » kept, data sheet last', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ Client: `C${i % 3}`, Montant: 10 * (i + 1) }));
    const pic = { png: new Uint8Array([137, 80, 78, 71]), width: 1400, height: 788 };
    const again = addNativeClone(addImageSheet(stripped, pic, 'Tableau de bord (image)')!, SPEC, cloneData('T', ['Client', 'Montant'], rows), pic)!;
    expect(names(again.bytes)).toEqual(['Tableau de bord', 'Tableau de bord (image)', 'Données', 'Scénarios', 'Données du tableau de bord']);
    expect(unzipSync(again.bytes)['xl/drawings/drawing-dash.xml']).toBeTruthy();
    expect(removeSheets(houseXlsx(['a'], [{ a: 1 }], { title: 'x', chart: 'none' }), REPRO_SHEETS)).toBeNull(); // nothing of ours: untouched
  });
});
