import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { emlFromHtml, fmtXof, houseMailHtml, houseXlsx, HOUSE } from '../../server/services/houseStyle';
import { markdownToDocx, printableHtml } from '../../server/services/officeCore';
import {
  apexGuide,
  assembleApp,
  lintApp,
  referencePart,
  type HouseKit,
} from '../../server/services/apexCore';

const KIT: HouseKit = {
  skill: '---\nname: x\n---\n# Charte',
  domain: { 'credit-risk': 'BCEAO' },
  shell:
    '<html><head><script>/*@@VXLSX@@*/</script></head><body id="app"><script>const LOGO_B64=\'/*@@LOGO@@*/\';/*@@KIT@@*/\n/*@@APP@@*/</script></body></html>',
  kitJs: 'function g3Bars(o){return o}\nasync function docxBuild(b,m,f){}\nconst X3={};',
  logoB64: 'AAAA\n',
  vendor: { xlsx: 'var XLSX={};', chart: '', zip: '' },
  example: 'x'.repeat(40_000),
  source: 'test-kit',
};

describe('house style', () => {
  it('formats XOF amounts with plain spaces', () => {
    expect(fmtXof(2359078494)).toBe('2 359 078 494');
  });
  it('Word, printable HTML and mail carry the charte', () => {
    const files = unzipSync(markdownToDocx('# Titre\n\n| A | B |\n|---|---|\n| 1 | 2 |\n', 'Rapport'));
    const doc = strFromU8(files['word/document.xml']!);
    const styles = strFromU8(files['word/styles.xml']!);
    expect(doc).toContain(`w:fill="${HOUSE.navy}"`); // table header
    expect(doc).toContain(HOUSE.lime);
    expect(styles).toContain('Segoe UI');
    expect(doc).toMatch(/Édité le \d{2}\/\d{2}\/\d{4}/);
    const html = printableHtml('Rapport', '<table><tr><th>A</th></tr></table>');
    expect(html).toContain(`#${HOUSE.navy}`);
    expect(html).toContain(`3px solid #${HOUSE.lime}`);
    const mail = houseMailHtml(
      'Point du jour',
      '<h2>KPI</h2><table><tr><th>A</th></tr><tr><td>1</td></tr></table><img src="data:image/png;base64,iVBORw0KGgo=">',
    );
    expect(mail).toContain('width="680"');
    expect(mail).toContain(`background:#${HOUSE.navy}`);
    const eml = emlFromHtml('Point du jour', mail);
    expect(eml).toContain('multipart/related');
    expect(eml).toContain('Content-ID: <img1@massamba>');
    expect(eml).toContain('X-Unsent: 1');
  });
  it('the Excel export is a valid workbook', () => {
    const files = unzipSync(houseXlsx(['A', 'B'], [{ A: 'x', B: 1200 }], { title: 'T' }));
    expect(Object.keys(files)).toContain('xl/worksheets/sheet1.xml');
    expect(strFromU8(files['xl/styles.xml']!)).toContain(HOUSE.navy);
  });
});

describe('APEX core', () => {
  it('assembles the offline app and escapes </script> in the app code', () => {
    const html = assembleApp(KIT, "const KIT={};function toast(){}\nconst s='</script>';");
    expect(html).not.toMatch(/\/\*@@[A-Z]+@@\*\//);
    expect(html).toContain('var XLSX={};');
    expect(html).toContain("LOGO_B64='AAAA'");
    expect(html).toContain("'<\\/script>'");
  });
  it('lints missing KIT / toast / CDN', () => {
    expect(lintApp('const KIT={};function toast(){}')).toEqual([]);
    const issues = lintApp('fetch("https://cdn.example.com/x.js")');
    expect(issues.join(' ')).toMatch(/KIT is not defined/);
    expect(issues.join(' ')).toMatch(/toast/);
    expect(issues.join(' ')).toMatch(/offline/);
  });
  it('guide lists the kit API and the reference is paginated', () => {
    const g = apexGuide(KIT);
    expect(g).toContain('APEX METHOD');
    expect(g).toContain('g3Bars(o)');
    expect(g).toContain('docxBuild(b,m,f)');
    expect(g).toContain('credit-risk');
    expect(apexGuide(null)).toContain('NOT installed');
    expect(referencePart(KIT, 1).parts).toBe(3);
    expect(referencePart(KIT, 9).text.length).toBeGreaterThan(0);
  });
});
