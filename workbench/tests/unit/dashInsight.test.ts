import { describe, expect, it } from 'vitest';
import { eta2, filterDims, human, profileColumns, viewTitle } from '../../server/services/dashInsight';
import { cloneData, fmt } from '../../server/services/dashRender';

// Synthetic portfolio: the amounts depend on the sector, not on the status code nor on the currency.
const SECT = ['Énergie', 'Banques', 'État', 'Commerce', 'Télécoms'];
const rows = Array.from({ length: 400 }, (_, i) => ({
  Relationship: `CLIENT ${String(i % 120).padStart(3, '0')} SA`,
  Secteur: SECT[i % 5]!,
  'Status (P/NP)': i % 9 === 0 ? 'NP' : 'P',
  'Security Currency': i % 50 === 0 ? 'EUR' : 'XOF',
  Date: `202${i % 6}-0${(i % 9) + 1}-15`,
  'Ftotal In Local Currency': (1 + (i % 5) * 4) * 1_000_000 + (i % 7) * 10_000,
  'PDO Amount In Local Currency': i % 9 === 0 ? 50_000 : 0,
}));
const cols = Object.keys(rows[0]!);

describe('ANALYSTE du tableau de bord : ce qui mérite d’être montré', () => {
  it('η² measures how much a column explains the amounts', () => {
    expect(eta2(rows, 'Secteur', 'Ftotal In Local Currency')).toBeGreaterThan(0.9);
    expect(eta2(rows, 'Security Currency', 'Ftotal In Local Currency')).toBeLessThan(0.05);
  });
  it('codes (« NP »), currencies and identifiers are never segments; the explanatory axis is', () => {
    const p = profileColumns(rows, ['Relationship', 'Secteur', 'Status (P/NP)', 'Security Currency'], 'Ftotal In Local Currency');
    expect(p[0]!.col).toBe('Secteur');
    expect(p.find((x) => x.col === 'Status (P/NP)')!.reasons.join()).toMatch(/codes/);
    expect(p.find((x) => x.col === 'Security Currency')!.reasons.join()).toMatch(/devise/);
    expect(filterDims(p)).toEqual(['Secteur']);
  });
  it('clear names: no raw English column name in a title', () => {
    expect(human('Ftotal In Local Currency')).toBe('Total (devise locale)');
    expect(human('PDO Amount In Local Currency')).toBe('Montant PDO (devise locale)');
    expect(human('CProvisions Per Local Regulatory In Local Currency')).toBe('Provisions réglementaires');
    expect(human('GRelationship')).toBe('Relation client');
    expect(human('Security Currency')).toBe('Devise du titre');
    expect(human('Taux de couverture')).toBe('Taux de couverture');
  });
  it('titles carry the measured highlight', () => {
    expect(viewTitle({ measure: 'montant', by: 'region', categories: ['A', 'B', 'C', 'D', 'E'], values: [50, 20, 10, 10, 10] })).toEqual({ title: 'Montant par région', insight: 'top 3 = 80 % du total' });
    const t = viewTitle({ measure: 'montant', month: true, categories: [], values: [10, 10, 10, 10, 20, 20, 20, 20] });
    expect(t.insight).toBe('+100 % sur 4 mois vs 4 mois précédents');
  });
  it('the dashboard: KPIs in plain words, a ranking of the clients, segments = period + sector + amount band', () => {
    const d = cloneData('Portefeuille', cols, rows);
    expect(d.kpis[0]!.label).toBe('Total (devise locale)');
    expect(d.views.some((v) => /^Classement — relation client/.test(v.title))).toBe(true);
    const seg = d.filters!.map((f) => f.col);
    expect(seg).toEqual(['Année', 'Secteur', 'Tranche de montant']);
    expect(seg).not.toContain('Status (P/NP)');
    expect(seg).not.toContain('Security Currency');
    // Années: the last 5 one by one, the older ones together
    expect(d.filters![0]!.values.length).toBeLessThanOrEqual(6);
    // the copies of a measure are dropped, nothing invented: the total is the rows' own
    const total = rows.reduce((a, r) => a + r['Ftotal In Local Currency'], 0);
    expect(d.kpis[0]!.value).toBe(fmt(total));
  });
});
