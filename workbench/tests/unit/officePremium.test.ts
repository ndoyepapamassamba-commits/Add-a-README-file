import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { markdownToDocx } from '../../server/services/officeCore';
import { housePptx, slidesFromMarkdown } from '../../server/services/housePptx';
import { literalChartXml, shortFormat } from '../../server/services/officeChart';
import { buildBrief } from '../../server/services/reportBrief';
import { addLogoToOffice } from '../../server/services/officeLogo';

const rows = Array.from({ length: 60 }, (_, i) => ({
  agence: ['Dakar', 'Thiès', 'Kaolack', 'Pikine'][i % 4]!,
  montant: 1000 * (i + 1) * (i % 4 === 0 ? 3 : 1),
  date: `2025-${String(1 + (i % 6)).padStart(2, '0')}-10`,
}));
const brief = buildBrief(['agence', 'montant', 'date'], rows, { title: 'Impayés', source: 'uploads/impayes.csv' });
// A 1×1 transparent PNG (67 bytes) stands for the user's logo.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const logo = { png: PNG, width: 240, height: 80 };
const MD = '# Impayés\n\n# Constats\n\n## Concentration\n\nDakar porte le total.\n\n- a\n- b\n\n# Recommandations\n\n## Actions\n\n1. Plan.\n';

describe('premium Word (report.export)', () => {
  const z = unzipSync(markdownToDocx(MD, 'Impayés', undefined, { premium: true, brief, subtitle: 'Comité de crédit', logo }));
  const doc = strFromU8(z['word/document.xml']!);
  it('cover with the logo, sommaire (TOC field), « L’essentiel en chiffres », a page per chapter, method note', () => {
    expect(doc).toContain('Comité de crédit');
    expect(doc).toContain('Sommaire');
    expect(doc).toContain('TOC \\o "1-2"');
    expect(doc).toContain('L’essentiel en chiffres');
    expect(doc).toContain('Note méthodologique');
    expect(doc.match(/<w:pageBreakBefore\/>/g)?.length).toBe(1); // 2 chapters → the second opens a page
    expect(doc).not.toMatch(/<w:pStyle w:val="Heading1"\/>[^]*?Impayés<\/w:t>/); // the duplicate title heading is dropped
    expect(doc).toContain('r:embed="rIdLogo"');
  });
  it('header + footer parts with page numbers, titlePg, native chart parts, logo media (officeLogo-compatible name)', () => {
    expect(doc).toContain('<w:headerReference w:type="default" r:id="rIdHdr"/>');
    expect(doc).toContain('<w:titlePg/>');
    expect(strFromU8(z['word/footer1.xml']!)).toContain('NUMPAGES');
    expect(strFromU8(z['word/header1.xml']!)).toContain('rIdLogo');
    expect(z['word/media/massamba-logo.png']).toBeTruthy();
    const charts = Object.keys(z).filter((k) => k.startsWith('word/charts/'));
    expect(charts.length).toBeGreaterThanOrEqual(2); // dimension bars + monthly line
    expect(strFromU8(z[charts[0]!]!)).toContain('<c:strLit>');
    expect(strFromU8(z['[Content_Types].xml']!)).toContain('drawingml.chart+xml');
    // The post-pass that places the logo sees it already there and adds nothing.
    expect(addLogoToOffice('r.docx', markdownToDocx(MD, 'Impayés', undefined, { premium: true, logo }), logo)).toBeNull();
  });
  it('non-premium output is unchanged (no header, no cover)', () => {
    const plain = unzipSync(markdownToDocx(MD, 'Impayés'));
    expect(Object.keys(plain)).not.toContain('word/header1.xml');
    expect(strFromU8(plain['word/document.xml']!)).not.toContain('Sommaire');
  });
});

describe('premium PowerPoint (report.export)', () => {
  const z = unzipSync(housePptx(MD, 'Impayés', { premium: true, brief, subtitle: 'Comité de crédit', logo }));
  const slides = Object.keys(z).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const xml = slides.map((s) => strFromU8(z[s]!));
  it('title + sommaire + essentiel + chart + trend + 2 sections + content slides, each with notes and the logo', () => {
    expect(xml[0]).toContain('Comité de crédit');
    expect(xml[1]).toContain('Sommaire');
    expect(xml[2]).toContain('essentiel en chiffres');
    expect(xml[2]).toContain('Carte KPI');
    expect(xml.some((x) => x.includes('r:id="rIdChart"'))).toBe(true);
    expect(xml.filter((x) => x.includes('name="Numéro"') && x.includes('>01<')).length).toBeGreaterThanOrEqual(1); // section 01
    for (const x of xml) expect(x).toContain('name="Logo"');
    expect(Object.keys(z).filter((k) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(k)).length).toBe(slides.length);
    expect(z['ppt/notesMasters/notesMaster1.xml']).toBeTruthy();
    expect(strFromU8(z['ppt/presentation.xml']!)).toContain('<p:notesMasterIdLst>');
    expect(strFromU8(z['ppt/notesSlides/notesSlide3.xml']!)).toContain('Méthodes');
  });
  it('charts carry literal caches in the palette; level is kept by slidesFromMarkdown', () => {
    const charts = Object.keys(z).filter((k) => k.startsWith('ppt/charts/'));
    expect(charts.length).toBe(2);
    const c = strFromU8(z[charts[0]!]!);
    expect(c).toContain('<c:numLit>');
    expect(c).toContain('003DA5');
    expect(slidesFromMarkdown(MD).slides.map((s) => s.level)).toEqual([1, 2, 1, 2]);
    expect(addLogoToOffice('d.pptx', housePptx(MD, 'Impayés', { premium: true, logo }), logo)).toBeNull();
  });
  it('non-premium deck: title + content slides only, no notes', () => {
    const plain = unzipSync(housePptx(MD, 'Impayés'));
    expect(Object.keys(plain).some((k) => k.startsWith('ppt/notesSlides/'))).toBe(false);
    expect(strFromU8(plain['ppt/slides/slide2.xml']!)).not.toContain('Sommaire');
  });
});

describe('literal charts', () => {
  it('formats follow the magnitude; doughnut has no axis, line has markers', () => {
    expect(shortFormat(2.5e9)).toContain('Mds');
    expect(shortFormat(3e6)).toContain('M');
    expect(shortFormat(50)).toBe('0.0');
    const d = literalChartXml({ kind: 'doughnut', title: 'T', categories: ['a', 'b'], values: [1, 2] });
    expect(d).toContain('<c:doughnutChart>');
    expect(d).not.toContain('<c:catAx>');
    const l = literalChartXml({ kind: 'line', title: 'T', categories: ['a', 'b', 'c'], values: [1, 2, 3] });
    expect(l).toContain('<c:marker><c:symbol val="circle"/>');
    expect(l).toContain('<c:valAx>');
  });
});
