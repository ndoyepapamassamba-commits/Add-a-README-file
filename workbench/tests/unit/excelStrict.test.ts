import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { excelStrict, validMerges } from '../../server/services/excelStrict';
import { designQA } from '../../server/services/designQA';
import { houseXlsx } from '../../server/services/houseStyle';
import { addLiveDashboard } from '../../server/services/liveDash';
import { cloneData } from '../../server/services/dashRender';
import { generatedModels, modelSpec, modelsFor } from '../../server/services/designModels';

// A synthetic book of provisions (no real data): long English column names, codes, currencies, a date per row.
const COLS = [
  'Ftotal In Local Currency',
  'Relationship',
  'Group Name',
  'PDO Amount In Local Currency',
  'CProvisions Per Local Regulatory In Local Currency',
  'Status (P/NP)',
  'Security Currency',
  'Date',
];
const ROWS = Array.from({ length: 400 }, (_, i) => ({
  'Ftotal In Local Currency': ((i * 7919) % 9973) * 1000 + 500,
  Relationship: `CLIENT ${String.fromCharCode(65 + (i % 26))}${i % 37}`,
  'Group Name': ['GROUPE NORD', 'GROUPE SUD', 'GROUPE EST', 'GROUPE OUEST', 'AUTRES'][i % 5],
  'PDO Amount In Local Currency': i % 4 ? 0 : ((i * 31) % 97) * 1000,
  'CProvisions Per Local Regulatory In Local Currency': ((i * 13) % 50) * 2000,
  'Status (P/NP)': i % 3 ? 'P' : 'NP',
  'Security Currency': ['XOF', 'EUR', 'USD'][i % 3],
  Date: `${2019 + (i % 8)}-${String((i % 12) + 1).padStart(2, '0')}-15`,
}));

describe('RÈGLES STRICTES D’EXCEL (ce que le validateur Open XML ne voit pas)', () => {
  it('keeps only merges Excel accepts', () => {
    expect(validMerges(['A1:B2', 'AT11:AS12', 'C3:C3', 'B2:D4', 'E1:E2', 'bad'])).toEqual(['A1:B2', 'E1:E2']);
  });
  const broken = () => {
    const z = unzipSync(houseXlsx(['A', 'B'], [{ A: 'x', B: 1 }], { title: 'T', chart: 'none' }));
    const sheet = Object.keys(z).find((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k))!;
    let x = strFromU8(z[sheet]!);
    x = /<mergeCells/.test(x)
      ? x.replace(/<mergeCells\b[^>]*>/, '<mergeCells count="99"><mergeCell ref="D10:C11"/>')
      : x.replace(
          '</sheetData>',
          '</sheetData><mergeCells count="1"><mergeCell ref="D10:C11"/></mergeCells>',
        );
    x = x.replace(/<c r="A1"([^>]*?)(\/?)>/, '<c r="A1" s="9999"$2>');
    z[sheet] = strToU8(x);
    z['xl/drawings/d.xml'] = strToU8(
      '<xdr:wsDr xmlns:xdr="x"><xdr:twoCellAnchor><xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>9</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to></xdr:twoCellAnchor></xdr:wsDr>',
    );
    return { z, sheet };
  };
  it('repairs a workbook Excel would refuse (reversed merge, unknown style, inverted drawing anchor)', () => {
    const { z, sheet } = broken();
    const r = excelStrict(z);
    expect(r.fixes.join(' ')).toMatch(/fusion/);
    expect(r.fixes.join(' ')).toMatch(/style inexistant/);
    expect(r.fixes.join(' ')).toMatch(/ancrage/);
    expect(strFromU8(z[sheet]!)).not.toContain('D10:C11');
    expect(strFromU8(z['xl/drawings/d.xml']!)).toContain(
      '<xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row>',
    );
    // The delivery check runs these rules on every workbook.
    const qa = designQA('t.xlsx', zipSync(broken().z))!;
    expect(qa.fixes.join(' ')).toMatch(/fusion/);
    expect(excelStrict(unzipSync(qa.data as Uint8Array)).fixes).toEqual([]);
    expect(qa.fixes.length + qa.warnings.length).toBeGreaterThan(0);
  });
  it('reports duplicate sheet names (case-insensitive, as Excel compares them)', () => {
    const z = unzipSync(houseXlsx(['A'], [{ A: 1 }], { title: 'T', chart: 'none' }));
    z['xl/workbook.xml'] = strToU8(
      strFromU8(z['xl/workbook.xml']!).replace(
        '</sheets>',
        '<sheet name="DONNÉES" sheetId="9" r:id="rId99"/></sheets>',
      ),
    );
    expect(excelStrict(z).warnings.join(' ')).toMatch(/même nom/);
  });
  it('every Excel catalogue model gives a live dashboard Excel opens without repair', () => {
    const models = [
      ...modelsFor('excel'),
      ...generatedModels('excel', 0),
      ...generatedModels('excel', 1),
      ...generatedModels('excel', 2),
    ];
    expect(models.length).toBeGreaterThanOrEqual(60);
    const base = houseXlsx(COLS, ROWS, { title: 'Provisions', chart: 'none' });
    const failures: string[] = [];
    for (const m of models) {
      const r = addLiveDashboard(
        base,
        modelSpec(m.palette, m.layout),
        cloneData('Tableau de bord', COLS, ROWS),
      );
      if (!r) continue;
      const res = excelStrict(unzipSync(r.bytes));
      if (res.fixes.length || res.warnings.length)
        failures.push(`${m.id} (${m.layout}): ${[...res.fixes, ...res.warnings].join(' ; ')}`);
    }
    expect(failures).toEqual([]);
  });
  it('a sheet already called « TABLEAU DE BORD » is not duplicated', () => {
    const z0 = unzipSync(houseXlsx(COLS, ROWS, { title: 'X', chart: 'none' }));
    z0['xl/workbook.xml'] = strToU8(
      strFromU8(z0['xl/workbook.xml']!).replace(/<sheet name="[^"]*"/, '<sheet name="TABLEAU DE BORD"'),
    );
    const r = addLiveDashboard(
      zipSync(z0),
      modelSpec(modelsFor('excel')[0]!.palette, modelsFor('excel')[0]!.layout),
      cloneData('Tableau de bord', COLS, ROWS),
    )!;
    const wb = strFromU8(unzipSync(r.bytes)['xl/workbook.xml']!);
    expect(wb).toContain('name="Tableau de bord vivant"');
    expect(excelStrict(unzipSync(r.bytes)).warnings).toEqual([]);
  });
});
