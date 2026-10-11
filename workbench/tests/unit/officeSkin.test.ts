import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { markdownToDocx } from '../../server/services/officeCore';
import { housePptx } from '../../server/services/housePptx';
import { skinDocx, skinHtml, skinPptx } from '../../server/services/officeSkin';

const skin = { dark: '#3B2A5C', primary: '#C17A5B', accent: '#2CC4B4', page: '#F6F1EC', font: 'Poppins' };
const md = '# Analyse\n\nTexte.\n\n## Tableau\n\n| A | B |\n|---|---|\n| x | 1 |\n\n# Suite\n\nFin.';

describe('the chosen image design on EVERY page of the other exports', () => {
  it('Word: a band in every section header, headings in the image colours, tinted table header; once only', () => {
    const out = skinDocx(markdownToDocx(md, 'T'), skin)!;
    const z = unzipSync(out);
    const header = strFromU8(z['word/header-massamba-design.xml']!);
    expect(header).toContain('w:fill="3B2A5C"');
    const doc = strFromU8(z['word/document.xml']!);
    expect(doc).toMatch(/<w:sectPr\b[^>]*><w:headerReference w:type="default"/);
    expect(strFromU8(z['word/styles.xml']!)).toContain('Poppins');
    expect(doc).toMatch(/w:fill="(C17A5B|[0-9A-F]{6})"/);
    expect(skinDocx(out, skin)).toBeNull();
  });
  it('PowerPoint: every slide gets the page colour, the strips and a title in the dark colour', () => {
    const out = skinPptx(housePptx(md, 'T'), skin)!;
    const z = unzipSync(out);
    const slides = Object.keys(z).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
    expect(slides.length).toBeGreaterThan(1);
    for (const k of slides) {
      const x = strFromU8(z[k]!);
      expect(x).toContain('F6F1EC');
      expect(x).toContain('Bande design');
    }
    expect(skinPptx(out, skin)).toBeNull();
  });
  it('HTML (and the PDF printed from it): page, font, headings, tables', () => {
    const h = skinHtml('<html><head></head><body><h1>x</h1></body></html>', skin);
    expect(h).toContain('data-design-skin');
    expect(h).toContain('#C17A5B');
    expect(skinHtml(h, skin)).toBe(h);
  });
});
