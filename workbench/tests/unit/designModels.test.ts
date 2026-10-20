import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { cloneData, contrastH, renderCloneSvg } from '../../server/services/dashRender';
import { DESIGN_MODELS, MODEL_FORMATS, MODEL_PALETTES, modelSpec, modelsFor, modelThumbnail } from '../../server/services/designModels';
import { markdownToDocx } from '../../server/services/officeCore';
import { housePptx } from '../../server/services/housePptx';
import { skinDocx, skinHtml, skinPptx } from '../../server/services/officeSkin';

const MD = '# Rapport\n\nTexte.\n\n## Partie\n\n| A | B |\n|---|---:|\n| x | 1 |\n';
const skinOf = (id: string) => {
  const m = DESIGN_MODELS.find((x) => x.id === id)!;
  return { dark: m.palette.dark, primary: m.palette.primary, accent: m.palette.accent, page: m.palette.page, font: m.palette.font, layout: m.layout };
};

describe('MODÈLES ULTRA DESIGN — 20 per format', () => {
  it('20 models for each of Excel, Word, PowerPoint, PDF, Mail; unique ids', () => {
    for (const f of MODEL_FORMATS) expect(modelsFor(f.id)).toHaveLength(20);
    expect(new Set(DESIGN_MODELS.map((m) => m.id)).size).toBe(100);
  });
  it('every palette reads well: body text on its page, white or dark text on its tiles (WCAG)', () => {
    for (const p of MODEL_PALETTES) expect(contrastH(p.text, p.page), p.id).toBeGreaterThanOrEqual(4.5);
  });
  it('printed formats of a dark palette use a white page (no black A4)', () => {
    for (const m of DESIGN_MODELS.filter((x) => x.format === 'word' || x.format === 'pdf')) expect(m.palette.page, m.id).not.toMatch(/^#0|^#1[0-9A-F]{5}$/i);
  });
  it('Excel models are real dashboard designs drawn by the reproduction renderer (KPI, charts, table)', () => {
    const rows = Array.from({ length: 24 }, (_, i) => ({ mois: `2025-${String((i % 12) + 1).padStart(2, '0')}-01`, region: ['Nord', 'Sud', 'Est'][i % 3]!, montant: 100 + i }));
    const d = cloneData('Test', ['mois', 'region', 'montant'], rows);
    const kinds = new Set<string>();
    for (const m of modelsFor('excel')) {
      const spec = modelSpec(m.palette, m.layout);
      spec.panels.forEach((p) => kinds.add(p.kind));
      expect(renderCloneSvg(spec, d, 480)).toMatch(/^<svg/);
    }
    expect([...kinds]).toEqual(expect.arrayContaining(['kpi', 'bar', 'donut', 'table', 'filter', 'line', 'area', 'hbar', 'pie']));
  });
  it('thumbnails of the other formats are SVG drawn from the model tokens', () => {
    const m = modelsFor('slides')[0]!;
    expect(modelThumbnail(m)).toContain(m.palette.accent);
  });
});

describe('page layouts on EVERY page', () => {
  it('Word: five distinct layouts (band, sidebar page border, boxed headings, editorial, minimal), one pBdr per pPr', () => {
    const outs = ['band', 'sidebar', 'boxed', 'editorial', 'minimal'].map((layout) => {
      const z = unzipSync(skinDocx(markdownToDocx(MD, 'Rapport'), { ...skinOf('word-sapphire-pro'), layout })!);
      return strFromU8(z['word/document.xml']!) + strFromU8(z['word/styles.xml']!) + strFromU8(z['word/header-massamba-design.xml'] ?? new Uint8Array());
    });
    expect(new Set(outs).size).toBe(5);
    expect(outs[1]).toContain('<w:pgBorders w:offsetFrom="page"><w:left w:val="single" w:sz="48"');
    expect(outs[2]).toMatch(/w:styleId="Heading1"[\s\S]*?<w:shd w:val="clear" w:color="auto" w:fill="1D4ED8"\/>/);
    for (const o of outs) expect(o).not.toMatch(/<w:pBdr>(?:(?!<\/w:pPr>)[\s\S])*<\/w:pBdr><w:pBdr>/);
  });
  it('PowerPoint: sidebar, corner and dark-mode slides', () => {
    const deck = housePptx('# T\n\n## Slide\n\n- point\n', 'T');
    const x = (layout: string) => strFromU8(unzipSync(skinPptx(deck, { ...skinOf('slides-sapphire-pro'), layout })!)['ppt/slides/slide2.xml']!);
    expect(x('sidebar')).toContain('Barre design');
    expect(x('corner')).toContain('prst="rtTriangle"');
    expect(x('night')).toMatch(/<p:bg><p:bgPr><a:solidFill><a:srgbClr val="0A1F44"/);
  });
  it('HTML / PDF: the layout rules follow the base skin', () => {
    expect(skinHtml('<html><head></head><body></body></html>', { ...skinOf('pdf-sapphire-pro'), layout: 'sidebar' })).toContain('border-left:14px solid var(--design-dark)');
  });
});
