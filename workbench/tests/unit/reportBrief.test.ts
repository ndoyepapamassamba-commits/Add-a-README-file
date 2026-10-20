import { describe, expect, it } from 'vitest';
import { briefToMarkdown, buildBrief, checkNarrative, extractNumbers } from '../../server/services/reportBrief';
import { domainOf, hintsLocal, leadOf } from '../../server/services/reportHints';

// A synthetic book of arrears (no real data): 120 rows, 4 branches, 3 segments, a date per row.
const COLS = ['Client', 'Agence', 'Segment', 'Encours XOF', 'Impayés XOF', 'Taux de couverture', 'Date'];
const ROWS = Array.from({ length: 120 }, (_, i) => ({
  Client: `CLIENT ${i + 1}`,
  Agence: ['DAKAR', 'THIES', 'SAINT-LOUIS', 'KAOLACK'][i % 4],
  Segment: ['PME', 'GRANDE ENTREPRISE', 'PARTICULIER'][i % 3],
  'Encours XOF': (i % 4 === 0 ? 50_000_000 : 1_000_000) + i * 10_000,
  'Impayés XOF': i % 5 ? 0 : 200_000 + i * 1_000,
  'Taux de couverture': i % 7 === 0 ? 1.2 : 0.42,
  Date: `2026-${String((i % 6) + 1).padStart(2, '0')}-15`,
}));

describe('BRIEF D’ANALYSE — faits calculés localement, chaque chiffre avec sa méthode', () => {
  const b = buildBrief(COLS, ROWS, { title: 'Impayés', source: 'uploads/impayes.xlsx' });
  it('finds the main measure, the entity and the useful dimensions', () => {
    expect(b.measure).toBe('Encours XOF');
    expect(b.entity).toBe('Client');
    expect(b.dims.map((d) => d.dim)).toEqual(expect.arrayContaining(['Agence', 'Segment', 'Client']));
    const total = ROWS.reduce((a, r) => a + r['Encours XOF'], 0);
    expect(b.kpis.find((k) => k.id === 'total')!.value).toBe(total);
    expect(b.kpis.find((k) => k.id === 'rows')!.value).toBe(120);
  });
  it('measures the concentration of each dimension (shares, HHI, n50 / n80)', () => {
    const ag = b.dims.find((d) => d.dim === 'Agence')!;
    expect(ag.categories).toBe(4);
    expect(ag.top[0]!.key).toBe('DAKAR'); // the big tickets are every 4th row → DAKAR
    expect(ag.top.reduce((a, t) => a + t.share, 0)).toBeCloseTo(1, 2);
    expect(ag.n50).toBeGreaterThanOrEqual(1);
    expect(ag.hhi).toBeGreaterThan(0.25);
  });
  it('builds the trend by month, the bands, the rates and the anomalies', () => {
    expect(b.trend?.by).toBe('month');
    expect(b.trend?.points.length).toBe(6);
    expect(b.bands.length).toBe(5);
    expect(b.bands.reduce((a, x) => a + x.count, 0)).toBe(120);
    expect(b.rates.find((r) => r.col === 'Taux de couverture')!.outOfRange).toBeGreaterThan(0);
    expect(b.anomalies.join(' ')).toMatch(/taux hors bornes/);
  });
  it('renders a French Markdown brief with tables and the no-other-figure rule', () => {
    const md = briefToMarkdown(b);
    expect(md).toMatch(/^# Brief d'analyse — Impayés/);
    expect(md).toContain('| Indicateur | Valeur | Méthode |');
    expect(md).toContain('## Agence —');
    expect(md).toMatch(/ne doit en citer aucun autre/);
  });
  it('the narrative check accepts the brief’s figures in French forms and flags a figure that is not in the brief', () => {
    const total = b.kpis.find((k) => k.id === 'total')!.value;
    const md = (total / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    const dakar = b.dims.find((d) => d.dim === 'Agence')!.top[0]!;
    const text = `L'encours total atteint ${md} Md XOF sur 120 lignes. DAKAR en porte ${(dakar.share * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %. Trois constats, 2026. Mais 999 999 dossiers et 77,7 % seraient inventés.`;
    const r = checkNarrative(text, b);
    expect(r.unknown).toEqual(expect.arrayContaining(['999 999', '77,7 %']));
    expect(r.unknown).not.toContain(`${md} Md`);
    expect(r.checked).toBeGreaterThanOrEqual(3);
  });
  it('reads numbers in French and English forms with their units', () => {
    const n = extractNumbers('4 529 967 553 XOF, soit 4,5 Md ; 42.7% ; 1,234,567 ; 12,3 k');
    expect(n.map((x) => x.values[0])).toEqual(expect.arrayContaining([4529967553, 4.5e9, 0.427, 1234567, 12300]));
  });
  it('proposes a reading adapted to the data and the request (domain, audience, opening fact)', () => {
    expect(domainOf(COLS)).toBe('risque');
    // The last month of the fixture carries no big ticket: the month-on-month drop is the fact to open with.
    expect(leadOf(b)).toBe('tendance');
    expect(leadOf({ ...b, trend: null })).toBe('concentration');
    const h = hintsLocal(b, COLS, 'note pour le comité des risques');
    expect(h.audience).toBe('comite');
    expect(h.sections.length).toBeGreaterThanOrEqual(4);
  });
});
