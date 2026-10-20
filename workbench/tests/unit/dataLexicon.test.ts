import { describe, expect, it } from 'vitest';
import { DataCore, QuerySpecSchema, coerceQuery } from '../../server/services/dataCore';
import { codeLabel, dictionaryFrom, missingText, resolveColumnSmart, resolveQuery, schemaPacket, shapeSignature } from '../../server/services/dataLexicon';

// ACTE 7 headers (documented in the apex-credit-risk skill) — the shape of the owner's portfolio extracts.
const ACTE7 = [
  'Contracts/Accounts', 'Country Code', 'Code Client', 'Relationship', 'GRelationship', 'Group Code', 'Group Name', 'ORR', 'Sic Code',
  'Segment Code', 'Product Code', 'Initial Product Code for Restructured loan', 'Credit Program', 'Security Code', 'Security Currency',
  'Collateral value In Local Currency', 'FRR', 'Classification', 'Stage IFRS9 Model', 'Ftotal In Local Currency',
  'Ototal Including PDO In Local Currency', 'Accrual In Local Currency', 'Interest In Suspense In Local Currency', 'Ototal Net In Local Currency',
  'Cprovisions IFRS9 In Local Currency', 'Net Exposure In Local Currency', 'PDO Amount In Local Currency', 'Date In PDO', 'Status (P/NP)',
  'Date in NP', 'Facility Currency', 'Domicile of the Repayment Source', 'Account Officer', 'CProvisions Per Local Regulatory In Local Currency',
  'Loan Interest Rate', 'Booking Date', 'Maturity Date', 'Reporting Date',
];
const col = (n: string) => resolveColumnSmart(ACTE7, n);

describe('v62 — the column a model or the owner MEANT (ESN chat: « expo », « Statut », « Provision »…)', () => {
  it('business words find the one real column', () => {
    expect(col('expo').column).toBe('Net Exposure In Local Currency');
    expect(col('expo_net').column).toBe('Net Exposure In Local Currency');
    expect(col('Statut').column).toBe('Status (P/NP)');
    expect(col('statut P/NP').column).toBe('Status (P/NP)');
    expect(col('segment').column).toBe('Segment Code');
    expect(col('client').column).toBe('Code Client');
    expect(col('nom client').column).toBe('Relationship');
    expect(col('encours').column).toBe('Ototal Including PDO In Local Currency');
    expect(col('stage').column).toBe('Stage IFRS9 Model');
    expect(col('provision IFRS9').column).toBe('Cprovisions IFRS9 In Local Currency');
    expect(col('provision réglementaire').column).toBe('CProvisions Per Local Regulatory In Local Currency');
    expect(col('gestionnaire').column).toBe('Account Officer');
    expect(col('impayés').column).toBe('PDO Amount In Local Currency');
    expect(col('secteur').column).toBe('Sic Code');
  });
  it('two real columns fit → AMBIGUOUS with the short list, never a silent pick', () => {
    const r = col('Provision');
    expect(r.column).toBeNull();
    expect(r.ambiguous).toBe(true);
    expect(r.candidates).toEqual(expect.arrayContaining(['Cprovisions IFRS9 In Local Currency', 'CProvisions Per Local Regulatory In Local Currency']));
    expect(r.candidates.length).toBeLessThanOrEqual(5);
  });
  it('a word with no column is NOT mapped to a neighbour (« Région » ≠ country), « ne » is too short', () => {
    expect(col('Région').column).toBeNull();
    expect(col('ne').column).toBeNull();
    expect(col('Région').ambiguous).toBeFalsy();
  });
  it('a learned alias and the file dictionary are used', () => {
    expect(resolveColumnSmart(ACTE7, 'Provision', { aliases: { provision: 'Cprovisions IFRS9 In Local Currency' } }).column).toBe('Cprovisions IFRS9 In Local Currency');
    const dict = dictionaryFrom(
      { columns: ['Column', 'Description'], rows: [
        { Column: 'Domicile of the Repayment Source', Description: 'Pays / région de domiciliation des flux de remboursement' },
        { Column: 'Country Code', Description: 'Code de la filiale' },
        { Column: 'ORR', Description: 'Obligor risk rating' },
        { Column: 'FRR', Description: 'Facility risk rating' },
      ] },
      ACTE7,
    );
    expect(dict?.['ORR']).toMatch(/Obligor/);
    expect(resolveColumnSmart(ACTE7, 'région', { dict: dict! })).toMatchObject({ column: 'Domicile of the Repayment Source', via: 'dictionary' });
  });
});

describe('v62 — every query shape seen in the ESN chat runs', () => {
  const rows = [
    { 'Segment Code': 8200, Relationship: 'A', 'Net Exposure In Local Currency': 300, 'Status (P/NP)': 'P', 'Cprovisions IFRS9 In Local Currency': 3 },
    { 'Segment Code': '8200', Relationship: 'B', 'Net Exposure In Local Currency': 900, 'Status (P/NP)': 'NP', 'Cprovisions IFRS9 In Local Currency': 400 },
    { 'Segment Code': 8100, Relationship: 'C', 'Net Exposure In Local Currency': 50, 'Status (P/NP)': 'P', 'Cprovisions IFRS9 In Local Currency': 0 },
    { 'Segment Code': 8200, Relationship: 'A', 'Net Exposure In Local Currency': 100, 'Status (P/NP)': 'P', 'Cprovisions IFRS9 In Local Currency': 1 },
  ];
  const ds = { path: 'p.csv', sheet: null, sheets: [], columns: Object.keys(rows[0]!), rows };
  const run = (raw: unknown) => {
    const r = resolveQuery(coerceQuery(raw) as Record<string, unknown>, ds.columns);
    expect(r.missing).toEqual([]);
    return new DataCore().query(ds, QuerySpecSchema.parse(r.query));
  };
  it('top 20 of segment 8200 by exposure, written five different ways', () => {
    const want = [{ Relationship: 'B', expo_net: 900 }, { Relationship: 'A', expo_net: 400 }];
    expect(run({ filters: [{ column: 'Segment Code', op: '==', value: 8200 }], groupBy: '[{"column": "Relationship"}]', aggregations: [{ column: 'Net Exposure In Local Currency', fn: 'sum', as: 'expo_net' }], sort: [{ column: 'expo_net', dir: 'desc' }], limit: '20' }).rows).toEqual(want);
    expect(run({ where: { segment: 8200 }, group_by: ['Relationship'], aggregations: ['sum(expo) as expo_net'], order_by: 'expo_net desc', top: 20 }).rows).toEqual(want);
    expect(run({ filters: { 'Segment Code': [8200] }, groupBy: 'Relationship', aggregations: { expo_net: { column: 'expo', fn: 'total' } }, sort: { expo_net: 'DESC' } }).rows).toEqual(want);
    const s = run({ filters: [{ field: 'segment', operator: 'in', value: 8200 }], groupBy: ['Relationship'], aggregations: [{ sum: 'Net Exposure In Local Currency' }], sort: [{ column: 'sum_Net Exposure In Local Currency', dir: 'desc' }] });
    expect(s.rows[0]).toEqual({ Relationship: 'B', 'sum_Net Exposure In Local Currency': 900 });
    const t = run({ filters: [{ column: 'Segment Code', value: 8200 }], groupBy: ['Relationship'], aggregations: [{ 'Net Exposure In Local Currency': 'sum' }], sort: [{ column: 'Net Exposure In Local Currency', ascending: false }] });
    expect(t.rows[0]).toEqual({ Relationship: 'B', 'sum_Net Exposure In Local Currency': 900 });
  });
  it('filters: not in, between, != and like', () => {
    expect(run({ filters: [{ column: 'segment', op: 'not in', value: [8100] }], aggregations: [{ fn: 'count' }] }).rows).toEqual([{ 'count_*': 3 }]);
    expect(run({ filters: [{ column: 'expo', op: 'between', value: [100, 300] }], aggregations: 'count(*)' }).rows).toEqual([{ 'count_*': 2 }]);
    expect(run({ filters: [{ column: 'Statut', op: '!=', value: 'P' }], select: 'Relationship' }).rows).toEqual([{ Relationship: 'B' }]);
    expect(run({ filters: [{ column: 'Relationship', op: 'like', value: 'b' }], select: ['Relationship'] }).rows).toEqual([{ Relationship: 'B' }]);
  });
  it('the ambiguous / unknown message is short and actionable', () => {
    const r = resolveQuery(coerceQuery({ groupBy: ['Région'], aggregations: [{ column: 'Provision', fn: 'sum' }] }) as Record<string, unknown>, ACTE7);
    expect(missingText(r.missing)).toMatch(/« Région » introuvable/);
    expect(missingText(r.missing)).toMatch(/« Provision » est ambigu → choisir parmi : .*Cprovisions IFRS9/);
  });
  it('interpretations are reported (said to the model and the user)', () => {
    const r = resolveQuery(coerceQuery({ groupBy: ['statut'], aggregations: [{ column: 'expo', fn: 'sum' }] }) as Record<string, unknown>, ds.columns);
    expect(r.mapped).toEqual(expect.arrayContaining([{ from: 'statut', to: 'Status (P/NP)', via: 'lexicon' }, { from: 'expo', to: 'Net Exposure In Local Currency', via: 'lexicon' }]));
  });
});

describe('v62 — the portfolio card (what the agent knows before its first query)', () => {
  it('segment codes get their labels from the APEX codification; the shape signature is stable', () => {
    expect(codeLabel('Segment Code', 8200)).toBe('Entreprises locales');
    expect(codeLabel('Segment Code', '8800')).toMatch(/Etat Central/);
    expect(codeLabel('Relationship', 'X')).toBeNull();
    const card = schemaPacket({ path: 'uploads/p.xlsb', sheet: 'Mainreport', sheets: ['Mainreport', 'ColumnDescription'], rowCount: 4, columns: [{ name: 'Segment Code', type: 'integer', unique: 2, missing: 0, codes: [{ value: '8200', count: 3 }, { value: '8100', count: 1 }] }, { name: 'Net Exposure In Local Currency', type: 'number', unique: 400, missing: 0 }], dict: { 'Segment Code': 'Segment technique' }, dictSheet: 'ColumnDescription', aliases: { provision: 'Cprovisions IFRS9 In Local Currency' } });
    expect(card).toMatch(/8200 = Entreprises locales \(3\)/);
    expect(card).toMatch(/« Segment technique »/);
    expect(card).toMatch(/Measures \(sum \/ avg\): Net Exposure/);
    expect(card).toMatch(/« provision » = Cprovisions IFRS9/);
    expect(shapeSignature(['B', 'a'])).toBe(shapeSignature(['A', 'b']));
  });
});
