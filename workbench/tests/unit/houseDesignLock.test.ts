import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import {
  DESIGN,
  DESIGN_LOCK,
  DESIGN_RULES,
  designCheck,
  designSignature,
} from '../../server/services/houseDesign';
import { HOUSE, HOUSE_RULES, houseMailHtml, houseXlsx } from '../../server/services/houseStyle';
import { housePptx, slidesFromMarkdown } from '../../server/services/housePptx';
import { markdownToDocx, printableHtml } from '../../server/services/officeCore';

// Values read from the reference workbook « Impayés 30-90j plan d'actions » (not from this code).
const REFERENCE = {
  navy: '001B4D',
  blue: '003DA5',
  gold: 'C8A951',
  cyan: '06B6D4',
  ice: 'EAF1F5',
  panel: 'F5F9FF',
  line: 'DBE6F7',
  input: 'FFF4CC',
  text: '0F172A',
  text2: '334155',
  subtle: 'DDEEF5',
};
const sheet = (b: Uint8Array) => strFromU8(unzipSync(b)['xl/worksheets/sheet1.xml']!);
const styles = (b: Uint8Array) => strFromU8(unzipSync(b)['xl/styles.xml']!);
const rows = Array.from({ length: 8 }, (_, i) => ({
  Client: `C${i}`,
  Stage: ['Stage 1', 'Stage 2', 'Stage 3'][i % 3],
  'Montant XOF': 1_000_000 * (i + 1),
  Jours: 30 + i,
}));

describe('design lock — GOD 3D · BLUE ECOBANK', () => {
  it('palette and typography equal the reference workbook', () => {
    for (const [k, v] of Object.entries(REFERENCE))
      expect(DESIGN.color[k as keyof typeof DESIGN.color], k).toBe(v);
    expect(DESIGN.font).toEqual({ ui: 'Segoe UI', mono: 'Consolas' });
    expect(DESIGN.xlsx.rowHeight).toMatchObject({ title: 40, subtitle: 18, kpiLabel: 24, kpiValue: 50 });
    expect([
      DESIGN.xlsx.titleSize,
      DESIGN.xlsx.subtitleSize,
      DESIGN.xlsx.kpiLabelSize,
      DESIGN.xlsx.kpiValueSize,
    ]).toEqual([20, 9.5, 8.5, 16]);
    expect(DESIGN.xlsx.zoom).toBe(90);
    expect(DESIGN.xlsx.gridlines).toBe(false);
    expect(DESIGN.xlsx.tabColor).toMatchObject({
      summary: 'C8A951',
      data: '06B6D4',
      consolidation: '001B4D',
      detail: '003DA5',
    });
    expect(DESIGN.status['Stage 2']).toEqual({ fill: 'F59E0B', text: 'FFFFFF' });
  });
  it('the design is frozen: nothing can overwrite it, the signature matches the lock', () => {
    expect(() => {
      (DESIGN.color as { navy: string }).navy = 'FF0000';
    }).toThrow();
    expect(() => {
      (HOUSE as { navy: string }).navy = 'FF0000';
    }).toThrow();
    const c = designCheck();
    expect(c.frozen).toBe(true);
    expect(c.intact).toBe(true);
    expect(designSignature()).toBe(DESIGN_LOCK);
  });
  it('any change to the charter changes the signature (drift is detected)', () => {
    const tampered = JSON.parse(JSON.stringify(DESIGN));
    tampered.color.navy = '000000';
    expect(designSignature(tampered)).not.toBe(DESIGN_LOCK);
    const fonts = JSON.parse(JSON.stringify(DESIGN));
    fonts.font.ui = 'Calibri';
    expect(designSignature(fonts)).not.toBe(DESIGN_LOCK);
  });
  it('agents are told the house design is the DEFAULT and that another theme is used only on request', () => {
    expect(HOUSE_RULES).toBe(DESIGN_RULES);
    expect(HOUSE_RULES).toContain('THE DEFAULT');
    expect(HOUSE_RULES).toContain('#001B4D');
    expect(HOUSE_RULES).toContain("another theme only on the user's request");
  });
});

describe('design lock — Excel export reproduces the reference layout', () => {
  // Plain table layout (charts switched off): exactly the reference rows.
  const x = houseXlsx(Object.keys(rows[0]!), rows, { title: 'IMPAYÉS', subtitle: 'Arrêté 04/10/2026', chart: 'none' });
  it('sheet view: no gridlines, zoom 90, frozen header, cyan tab, autofilter on the header', () => {
    const s = sheet(x);
    expect(s).toContain('showGridLines="0"');
    expect(s).toContain('zoomScale="90"');
    expect(s).toContain('state="frozen"');
    expect(s).toContain('ySplit="6"');
    expect(s).toContain('<tabColor rgb="FF06B6D4"/>');
    expect(s).toMatch(/<autoFilter ref="A6:D14"/);
  });
  it('row heights: 40 / 18 / 24 / 50 / 8 / 24', () => {
    const s = sheet(x);
    for (const [r, h] of [
      [1, 40],
      [2, 18],
      [3, 24],
      [4, 50],
      [5, 8],
      [6, 24],
    ] as const)
      expect(s).toMatch(new RegExp(`<row r="${r}"[^>]*ht="${h}"`));
  });
  it('KPI cards are live SUBTOTAL formulas with cached values', () => {
    const s = sheet(x);
    expect(s).toContain('SUBTOTAL(103,A7:A14)');
    expect(s).toContain('SUBTOTAL(109,C7:C14)');
    expect(s).toContain('IFERROR(SUBTOTAL(101,C7:C14),0)');
    expect(s).toContain('SUBTOTAL(104,C7:C14)');
    expect(s).toContain('<v>36000000</v>');
  });
  it('styles carry the reference colours, fonts and number formats', () => {
    const st = styles(x);
    for (const c of [
      REFERENCE.navy,
      REFERENCE.blue,
      REFERENCE.panel,
      REFERENCE.ice,
      REFERENCE.line,
      REFERENCE.subtle,
      REFERENCE.gold,
    ])
      expect(st.toUpperCase(), c).toContain(c);
    expect(st).toContain('Segoe UI');
    expect(st).toContain('Consolas');
    expect(st).toContain('#,##0');
    expect(st).toContain('Md');
    expect(st).not.toMatch(/FF000000"?\/>.*fgColor/); // no black fills
    // status colours of the reference (Stage 1 gold, Stage 2 amber, Stage 3 orange)
    for (const c of ['C8A951', 'F59E0B', 'F97316']) expect(st.toUpperCase()).toContain(c);
  });
  it('no old palette survives anywhere in the exports', () => {
    const old = /00415E|005C83|8CC63F|A6D867|1A86B3|EEF4F7|F6FAFC|CFE0E7|12333F|3E5C6B/i;
    const docx = unzipSync(markdownToDocx('# T\n\n| A | B |\n|---|---|\n| 1 | 2 |\n', 'Rapport'));
    const all = [
      styles(x),
      sheet(x),
      strFromU8(docx['word/document.xml']!),
      strFromU8(docx['word/styles.xml']!),
      printableHtml('R', '<h2>x</h2><table><tr><th>A</th></tr></table>'),
      houseMailHtml('R', '<h2>x</h2><table><tr><th>A</th></tr><tr><td>1</td></tr></table>'),
      ...Object.values(unzipSync(housePptx('# T\n\n## S\n\n- a\n'))).map((b) => strFromU8(b)),
    ].join('\n');
    expect(all).not.toMatch(old);
  });
});

describe('design lock — Word, PowerPoint, PDF/HTML and mail', () => {
  it('Word: navy title band + gold filet, blue table header, Segoe UI', () => {
    const f = unzipSync(markdownToDocx('# Titre\n\n| A | B |\n|---|---|\n| 1 | 2 |\n', 'Rapport'));
    const doc = strFromU8(f['word/document.xml']!);
    const st = strFromU8(f['word/styles.xml']!);
    expect(doc).toContain('w:fill="003DA5"');
    expect(st).toContain('w:fill="001B4D"');
    expect(st).toContain('w:color="C8A951"');
    expect(st).toContain('Segoe UI');
  });
  it('PDF/HTML and mail: navy band, gold 3 px filet, blue/ice tokens', () => {
    const h = printableHtml('Rapport', '<h2>x</h2>');
    expect(h).toContain('#001B4D');
    expect(h).toContain('3px solid #C8A951');
    const m = houseMailHtml('Rapport', '<h2>x</h2><table><tr><th>A</th></tr><tr><td>1</td></tr></table>');
    expect(m).toContain('background:#001B4D');
    expect(m).toContain('3px solid #C8A951');
    expect(m).toContain('background:#003DA5');
  });
  it('PowerPoint: title slide navy + gold filet, header band + filet + blue table header + ice footer', () => {
    const md =
      '# Synthèse\n\n## Constats\n\n1. Premier\n- Deuxième\n\n## Détail\n\n| Segment | Montant |\n|---|---|\n| A | 1 000 |\n';
    const { title, slides } = slidesFromMarkdown(md);
    expect(title).toBe('Synthèse');
    expect(slides.map((s) => s.title)).toEqual(['Constats', 'Détail']);
    const f = unzipSync(housePptx(md));
    const names = Object.keys(f);
    expect(names).toEqual(
      expect.arrayContaining(['ppt/presentation.xml', 'ppt/slides/slide1.xml', 'ppt/slides/slide3.xml']),
    );
    const s1 = strFromU8(f['ppt/slides/slide1.xml']!);
    expect(s1).toContain('001B4D');
    expect(s1).toContain('C8A951');
    const s3 = strFromU8(f['ppt/slides/slide3.xml']!);
    expect(s3).toContain('003DA5'); // table header
    expect(s3).toContain('EAF1F5'); // footer
    expect(s3).toContain('Consolas'); // numbers
    expect(s3).toContain('Segoe UI');
  });
  it('long slides continue instead of overflowing', () => {
    const md = `## Liste\n\n${Array.from({ length: 25 }, (_, i) => `- point ${i}`).join('\n')}\n`;
    expect(slidesFromMarkdown(md).slides.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Maison 2.0 — KPIs and native 3D charts BEFORE the table header', () => {
  const x = houseXlsx(Object.keys(rows[0]!), rows, { title: 'IMPAYÉS', subtitle: 'Arrêté 04/10/2026' });
  const f = unzipSync(x);
  it('title, KPI cards, a 16-row chart zone, then the header (row 23) with its autofilter; nothing frozen', () => {
    const s = sheet(x);
    for (const [r, h] of [[1, 40], [2, 18], [3, 24], [4, 50], [5, 8], [6, 15], [21, 15], [22, 8], [23, 24]] as const)
      expect(s, `row ${r}`).toMatch(new RegExp(`<row r="${r}"[^>]*ht="${h}"`));
    expect(s).toMatch(/<autoFilter ref="A23:D31"/);
    expect(s).not.toContain('state="frozen"');
    expect(s).toContain('SUBTOTAL(109,C24:C31)'); // Σ of the MONEY column (Montant XOF), not Jours
  });
  it('three native 3D charts (3D columns, 3D pie, top bars) in the house palette, absolutely placed above the header', () => {
    const charts = Object.keys(f).filter((k) => /^xl\/charts\/chart\d+\.xml$/.test(k)).sort();
    expect(charts.length).toBeGreaterThanOrEqual(2);
    const c1 = strFromU8(f['xl/charts/chart1.xml']!);
    const c2 = strFromU8(f['xl/charts/chart2.xml']!);
    expect(c1).toContain('<c:bar3DChart>');
    expect(c1).toContain('<c:view3D>');
    expect(c1).toContain('<a:gradFill'); // lit faces
    expect(c1).toContain('003DA5');
    expect(c1).toContain('Consolas'); // value labels like the reference
    expect(c2).toContain('<c:pie3DChart>');
    const drawing = strFromU8(f['xl/drawings/drawing1.xml']!);
    expect(drawing.match(/<xdr:absoluteAnchor>/g)!.length).toBe(charts.length);
    expect(Object.keys(f).some((k) => k.startsWith('xl/media/'))).toBe(false); // native charts, no images
  });
  it('the charts read an « Agrégats » sheet of live SUMIF formulas over the table', () => {
    const wb = strFromU8(f['xl/workbook.xml']!);
    expect(wb).toContain('name="Agrégats"');
    const agg = strFromU8(f['xl/worksheets/sheet2.xml']!).replace(/&apos;/g, "'");
    expect(agg).toMatch(/SUMIF\('Données'!\$[A-D]\$24:\$[A-D]\$31,A2,'Données'!\$C\$24:\$C\$31\)/);
    expect(strFromU8(f['xl/charts/chart1.xml']!)).toContain("'Agrégats'!$B$2");
  });
});

describe('design lock — native Excel charts (no matplotlib, no image)', () => {
  const data = Array.from({ length: 6 }, (_, i) => ({
    Agence: `A${i}`,
    Encours: 1_000_000 * (i + 1),
    Impayés: 1000 * (i + 1),
  }));
  it('bar / line / pie asked → that kind first, as a native chart part in the house palette and fonts', () => {
    for (const kind of ['bar', 'line', 'pie'] as const) {
      const f = unzipSync(houseXlsx(Object.keys(data[0]!), data, { title: 'T', chart: kind }));
      expect(Object.keys(f)).toEqual(
        expect.arrayContaining(['xl/charts/chart1.xml', 'xl/drawings/drawing1.xml']),
      );
      expect(Object.keys(f).some((k) => k.startsWith('xl/media/'))).toBe(false);
      const c = strFromU8(f['xl/charts/chart1.xml']!);
      expect(c).toContain(
        kind === 'bar' ? '<c:bar3DChart>' : kind === 'line' ? '<c:lineChart>' : '<c:pie3DChart>',
      );
      expect(c).toContain('003DA5'); // first series = Ecobank blue
      expect(c).toContain('Segoe UI');
      expect(c).toContain(DESIGN.color.line);
      expect(c).not.toMatch(/00415E|8CC63F|1A86B3/i);
      expect(strFromU8(f['xl/worksheets/sheet1.xml']!)).toContain('<drawing r:id="rId1"/>');
      expect(strFromU8(f['[Content_Types].xml']!)).toContain('drawingml.chart+xml');
    }
  });
  it('charts are automatic; « none » gives the plain table', () => {
    expect(Object.keys(unzipSync(houseXlsx(Object.keys(data[0]!), data, { title: 'T' }))).some((k) => k.includes('chart'))).toBe(true);
    expect(Object.keys(unzipSync(houseXlsx(Object.keys(data[0]!), data, { title: 'T', chart: 'none' }))).some((k) => k.includes('chart'))).toBe(false);
  });
  it('no chart when there is nothing to group (numbers only)', () => {
    const nums = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
    expect(Object.keys(unzipSync(houseXlsx(['a', 'b'], nums, { title: 'T' }))).some((k) => k.includes('chart'))).toBe(false);
  });
});

import { buildTheme, setActiveTheme, themeOf, withTheme, activeDesign, THEMES } from '../../server/services/houseDesign';
describe('export themes (not frozen any more, house charter intact)', () => {
  it('house stays the default and the lock still matches', () => {
    expect(buildTheme(undefined)).toBe(DESIGN);
    expect(themeOf({})).toBe('house');
    expect(designSignature()).toBe(DESIGN_LOCK);
  });
  it('a named theme and a custom theme change the active colours only for the export', () => {
    expect(withTheme('minimal', () => activeDesign().color.navy)).toBe(THEMES.minimal.color.navy);
    expect(activeDesign()).toBe(DESIGN);
    const prev = setActiveTheme(themeOf({ colors: { primary: '#7c3aed', accent: '#f59e0b', font: 'Inter' } }));
    expect(activeDesign().color.blue).toBe('7C3AED');
    expect(activeDesign().font.ui).toBe('Inter');
    expect((HOUSE as { blue: string }).blue).toBe('7C3AED');
    setActiveTheme(prev);
    expect((HOUSE as { blue: string }).blue).toBe(DESIGN.color.blue);
  });
  it('invalid colours are ignored, never injected', () => {
    expect(buildTheme({ primary: 'red;}<script>' }).color.blue).toBe(DESIGN.color.blue);
  });
});
