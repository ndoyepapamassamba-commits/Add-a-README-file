import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { designQA, qaDocx, qaHtml, qaPptx, qaXlsx, shownLength, withRunColor } from '../../server/services/designQA';

const CT = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';
function xlsx(sheet: string, styles: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8(CT),
    'xl/workbook.xml': strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Analyse" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/styles.xml': strToU8(styles),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  });
}
// Style 1: white text on a light-yellow fill (unreadable). Style 2: integer « #,##0 ».
const STYLES =
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4CC"/></patternFill></fill></fills><borders count="1"><border/></borders><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFill="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';

describe('CONTRÔLE DESIGN AVANT LIVRAISON — Excel', () => {
  const cols = Array.from({ length: 14 }, (_, i) => `<c r="${String.fromCharCode(67 + i)}1"><v>${i}</v></c>`).join('');
  const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="2" width="6" customWidth="1"/><col min="3" max="16" width="9" customWidth="1"/></cols><sheetData><row r="1"><c r="A1" s="1" t="inlineStr"><is><t>Titre</t></is></c><c r="B1" s="2"><v>2359078494</v></c>${cols}</row></sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  const r = qaXlsx(xlsx(sheet, STYLES))!;
  const z = unzipSync(r.bytes);
  const out = strFromU8(z['xl/worksheets/sheet1.xml']!);
  const st = strFromU8(z['xl/styles.xml']!);
  it('unreadable text on its fill gets a readable colour (new style, the others untouched)', () => {
    expect(r.fixes.join(' ')).toMatch(/cellule.*contraste/);
    expect(out).toMatch(/<c r="A1" s="3"/);
    expect(st).toContain('<cellXfs count="4">');
    expect(st).toMatch(/<font><b\/><sz val="11"\/><color rgb="FF111827"\/><name val="Calibri"\/><\/font>/);
  });
  it('a number shown as ##### widens its column', () => {
    expect(shownLength(2359078494, '#,##0')).toBe(13);
    expect(out).toMatch(/<col min="2" max="2" width="1[4-9]/);
    expect(r.fixes.join(' ')).toMatch(/colonne/);
  });
  it('a wide sheet prints on one page width (landscape, fit to width), in schema order', () => {
    expect(out).toMatch(/<sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr><cols>/);
    expect(out).toMatch(/<pageMargins[^>]*\/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"\/><\/worksheet>/);
  });
  it('a footer that sums a column of percentages is emptied (the style stays), a sum of amounts is kept', () => {
    const stylesPct = STYLES.replace('<cellXfs count="3">', '<cellXfs count="4">').replace('</cellXfs>', '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs>');
    const sh = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="2"><c r="A2" s="2"><v>100</v></c><c r="B2" s="3"><v>0.4</v></c></row><row r="3"><c r="A3" s="2"><v>150</v></c><c r="B3" s="3"><v>0.6</v></c></row><row r="4"><c r="A4" s="2"><f>SUBTOTAL(109,A2:A3)</f><v>250</v></c><c r="B4" s="3"><f>SUBTOTAL(109,B2:B3)</f><v>1</v></c></row></sheetData></worksheet>`;
    const q = qaXlsx(xlsx(sh, stylesPct))!;
    const o = strFromU8(unzipSync(q.bytes)['xl/worksheets/sheet1.xml']!);
    expect(o).toContain('<c r="B4" s="3"/>');
    expect(o).toContain('<c r="A4" s="2"><f>SUBTOTAL(109,A2:A3)</f><v>250</v></c>');
    expect(q.fixes.join(' ')).toMatch(/pourcentages/);
  });
  it('a clean workbook is left alone; N(+range) is reported', () => {
    const ok = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>SUMPRODUCT(MAX((A2:A9>0)*N(+B2:B9)))</f><v>1</v></c></row></sheetData></worksheet>`;
    const q = qaXlsx(xlsx(ok, STYLES))!;
    expect(q.fixes).toEqual([]);
    expect(q.warnings[0]).toMatch(/N\(\+plage\)/);
  });
});

describe('CONTRÔLE DESIGN — Word', () => {
  const doc = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblPr><w:tblW w:w="16000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="8000"/><w:gridCol w:w="8000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="8000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="0B2545"/></w:tcPr><w:p><w:r><w:t>Agence</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="8000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="0B2545"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>Encours</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  const r = qaDocx(zipSync({ 'word/document.xml': strToU8(doc) }))!;
  const out = strFromU8(unzipSync(r.bytes)['word/document.xml']!);
  it('dark table header: the text turns white (colour at its schema place, after <w:b/> and before <w:sz/>)', () => {
    expect(out).toContain('<w:r><w:rPr><w:color w:val="FFFFFF"/></w:rPr><w:t>Agence</w:t>');
    expect(out).toContain('<w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="20"/></w:rPr>');
    expect(withRunColor('<w:rPr/>', 'AA0000')).toBe('<w:rPr><w:color w:val="AA0000"/></w:rPr>');
  });
  it('a table wider than the page takes the text width, columns scaled', () => {
    expect(out).toContain('<w:tblW w:w="5000" w:type="pct"/>');
    expect(out).toContain('<w:gridCol w:w="4819"/>');
    expect(r.fixes.join(' ')).toMatch(/tableau/);
  });
});

describe('CONTRÔLE DESIGN — PowerPoint', () => {
  const slide = `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="0B1220"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="11000000" y="100000"/><a:ext cx="3000000" cy="800000"/></a:xfrm><a:noFill/></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="fr-FR" sz="1400"><a:solidFill><a:srgbClr val="1E293B"/></a:solidFill></a:rPr><a:t>${'Synthèse très longue du portefeuille. '.repeat(12)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  const pres = '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="12192000" cy="6858000"/></p:presentation>';
  const r = qaPptx(zipSync({ 'ppt/presentation.xml': strToU8(pres), 'ppt/slides/slide1.xml': strToU8(slide) }))!;
  const out = strFromU8(unzipSync(r.bytes)['ppt/slides/slide1.xml']!);
  it('a shape off the slide comes back inside', () => {
    expect(out).toContain('<a:off x="9192000" y="100000"/>');
  });
  it('overflowing text shrinks to fit; dark text on the dark slide turns white', () => {
    expect(out).toMatch(/<a:bodyPr><a:normAutofit fontScale="\d+" lnSpcReduction="10000"\/><\/a:bodyPr>/);
    expect(out).toContain('<a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr>');
    expect(r.fixes).toHaveLength(3);
  });
});

describe('CONTRÔLE DESIGN — layers (no false alarm)', () => {
  it('a white title on its coloured band (light slide) is left white; the band is what lies under it', () => {
    const slide = `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F5F0EB"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="700000"/></a:xfrm><a:solidFill><a:srgbClr val="3B2A5E"/></a:solidFill></p:spPr></p:sp><p:sp><p:spPr><a:xfrm><a:off x="400000" y="100000"/><a:ext cx="8000000" cy="500000"/></a:xfrm><a:noFill/></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="fr-FR" sz="2400" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Synthèse</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
    const pres = '<p:presentation xmlns:p="p"><p:sldSz cx="12192000" cy="6858000"/></p:presentation>';
    expect(qaPptx(zipSync({ 'ppt/presentation.xml': strToU8(pres), 'ppt/slides/slide1.xml': strToU8(slide) }))).toBeNull();
  });
});

describe('CONTRÔLE DESIGN — HTML / PDF', () => {
  it('print and responsive framing rules, unreadable inline colours fixed, once', () => {
    const r = qaHtml('<html><head><title>x</title></head><body><td style="background:#0b2545;color:#1e293b">A</td></body></html>');
    expect(r.html).toContain('data-design-qa');
    expect(r.html).toContain('name="viewport"');
    expect(r.html).toContain('color:#FFFFFF');
    expect(qaHtml(r.html).fixes).toEqual([]);
    expect(designQA('a.txt', 'x')).toBeNull();
  });
});
