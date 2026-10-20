import { describe, expect, it } from 'vitest';
import { analyse3d, bar3dSvg, chart3dSvg, donut3dSvg, fmtShort, hbar3dSvg, insightFacts, niceAxis, paletteOf, synthesisSvg } from '../../server/services/chart3d';
import { buildTheme, DESIGN } from '../../server/services/houseDesign';

// Debtors like the reference workbook (« Impayés 30-90 j »): one row per contract.
const clients = ['IPRES', 'SOCABEG SA', 'JAH OIL SARL', 'SECOTRAS', 'SAGA AFRICA', 'DANGOTE', 'MARIAMA DIENG', 'AGRO ALIMENTAIRE', 'SEREX', 'PETOWAL', 'SUCRIERE', 'SENELEC', 'SONATEL', 'CBAO', 'TOTAL SN', 'ORYX'];
const rows = clients.flatMap((c, i) => [0, 1].map((k) => ({
  'Code Client': String(100000016 + i * 7 + k),
  Client: c,
  Classe: ['IA', 'I', 'II', 'III'][(i + k) % 4],
  Segment: ['CORPORATE', 'COMMERCIAL', 'CONSUMER'][i % 3],
  Échéance: new Date(Date.UTC(2026, 4 + ((i + k) % 5), 10)),
  Jours: 30 + i * 3 + k,
  Stade: 1 + ((i + k) % 3),
  'Montant XOF': (16 - i) * 10_000_000 + k * 1_000_000,
})));
const total = rows.reduce((a, r) => a + r['Montant XOF'], 0);
const p = paletteOf(DESIGN);

describe('GOD 3D — what the board shows comes from the rows only', () => {
  const a = analyse3d(Object.keys(rows[0]!), rows);
  it('the measure is the MONEY column (not Jours / Stade / codes)', () => {
    expect(a.measure).toBe('Montant XOF');
    expect(a.total).toBe(total);
  });
  it('groupings are sums per category; top 10 is by NAME (Client), never by code', () => {
    const cl = a.groups.find((g) => g.col === 'Classe')!;
    expect(cl.values.reduce((x, y) => x + y, 0)).toBe(total);
    expect(cl.values).toEqual([...cl.values].sort((x, y) => y - x));
    expect(a.top!.col).toBe('Client');
    expect(a.top!.categories[0]).toBe('IPRES');
    expect(a.top!.values[0]).toBe(160_000_000 + 161_000_000);
    expect(a.top!.categories).toHaveLength(10);
  });
  it('monthly trend from the date column; counts per category', () => {
    expect(a.trend!.ordered).toBe(true);
    expect(a.trend!.values.reduce((x, y) => x + y, 0)).toBe(total);
    expect(a.counts!.values.reduce((x, y) => x + y, 0)).toBe(rows.length);
  });
  it('KPIs: lines, Σ, mean, share of the top 10', () => {
    expect(a.kpis.map((k) => k.label)).toEqual(['Lignes', 'Σ Montant XOF', 'Moyenne Montant XOF', 'Part du top 10']);
    expect(a.kpis[0]!.value).toBe('32');
    expect(a.kpis[1]!.value).toBe(fmtShort(total));
  });
  it('the reading card states computed facts only (no invented advice)', () => {
    const f = insightFacts({ rows: rows.length, measure: a.measure, total: a.total, main: a.groups[0]!, mainCol: a.groups[0]!.col!, top: a.top, topCol: 'Client', trend: a.trend });
    const text = f.flatMap((s) => s.lines).join(' ');
    expect(text).toContain(fmtShort(total));
    expect(text).toContain('IPRES');
    expect(f.map((s) => s.label)).toEqual(['Constats', 'Points d’attention']);
    expect(text).not.toMatch(/recommand|il faut|devrait/i);
  });
});

describe('GOD 3D — visuals', () => {
  it('the board: band, 4 KPI tiles, 6 charts in 3D, reading card; in the active palette', () => {
    const s = synthesisSvg({ title: 'Impayés', subtitle: 'Source : test', columns: Object.keys(rows[0]!), rows }, p)!;
    expect(s.charts).toBe(6);
    expect(s.width).toBe(1800);
    expect(s.svg).toContain('SYNTHÈSE 3D');
    expect(s.svg).toContain('Pareto');
    expect(s.svg).toContain('Lecture — Impayés');
    expect(s.svg).toContain(p.navy);
    const lime = synthesisSvg({ title: 'X', columns: Object.keys(rows[0]!), rows }, paletteOf(buildTheme('house-lime')))!;
    expect(lime.svg).toContain('#8CC63F');
    expect(lime.svg).not.toContain('#C8A951');
  });
  it('the logo goes in the band', () => {
    const s = synthesisSvg({ title: 'X', columns: Object.keys(rows[0]!), rows, logo: { href: 'data:image/png;base64,AAAA', width: 400, height: 100 } }, p)!;
    expect(s.svg).toContain('<image href="data:image/png;base64,AAAA"');
  });
  it('nothing to chart → no board', () => {
    expect(synthesisSvg({ title: 'X', columns: ['a', 'b'], rows: [{ a: 1, b: 2 }] }, p)).toBeNull();
  });
  it('3D faces: front gradient, lighter top, darker side; values in mono', () => {
    const b = bar3dSvg({ title: 'T', categories: ['A', 'B'], values: [3e9, 1e9] }, p);
    expect(b.match(/<polygon/g)!.length).toBe(4); // top + side per column
    expect(b).toContain('linearGradient');
    expect(b).toContain('3 Mds');
    expect(b).toContain('Consolas');
    expect(hbar3dSvg({ title: 'T', categories: ['A'], values: [5] }, p)).toContain('<polygon');
    expect(donut3dSvg({ title: 'T', categories: ['A', 'B'], values: [1, 3] }, p)).toContain('75 %');
  });
  it('data.chart PNG forms: bar / pie / line in 3D, others flat', () => {
    expect(chart3dSvg('bar', 'T', ['a', 'b'], [1, 2], p)).toContain('<svg');
    expect(chart3dSvg('pie', 'T', ['a', 'b'], [1, 2], p)).toContain('<svg');
    expect(chart3dSvg('line', 'T', ['a', 'b'], [1, 2], p)).toContain('<svg');
    expect(chart3dSvg('scatter', 'T', ['a', 'b'], [1, 2], p)).toBeNull();
  });
  it('round axes', () => {
    expect(niceAxis(626)).toEqual({ top: 800, step: 200 });
    expect(niceAxis(2.2e9)).toEqual({ top: 3e9, step: 1e9 });
  });
});
