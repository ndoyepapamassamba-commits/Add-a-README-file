// The user's logo: recoloured HARMONIOUSLY to the chosen palette, then placed in every Office / HTML deliverable.
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { analyzeLogo, contrast, hexToRgb, planColors, recolorLogo } from '../../server/services/logoHarmony';
import { addLogoToHtml, addLogoToOffice } from '../../server/services/officeLogo';
import { DataCore } from '../../server/services/dataCore';
import { markdownToDocx } from '../../server/services/officeCore';
import { housePptx } from '../../server/services/housePptx';

/** A banner logo like the Ecobank one: blue background, white wordmark, thin lime filet. */
function bankLogo(w = 200, h = 100) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      let c = [0, 92, 131];
      if (y >= 20 && y < 50 && x >= 20 && x < 180 && x % 12 < 7) c = [255, 255, 255]; // letters
      if (y >= 62 && y < 64 && x >= 20 && x < 180) c = [140, 198, 63]; // lime filet (few pixels)
      if (y === 50 && x >= 20 && x < 180 && x % 12 < 7) c = [128, 174, 193]; // anti-aliased edge (blend blue/white)
      px.set([...c, 255], o);
    }
  return { px, w, h };
}
const RED_YELLOW = { primary: '#C8102E', accent: '#FFC72C', dark: '#1A1A1A', series: ['#FFC72C', '#F97316'] };
const at = (px: Uint8ClampedArray, w: number, x: number, y: number) => [...px.slice((y * w + x) * 4, (y * w + x) * 4 + 4)];

describe('logo harmony', () => {
  it('finds the roles: background, white text, the small lime filet (kept), not the anti-aliasing blend', () => {
    const { px, w, h } = bankLogo();
    const f = analyzeLogo(px, w, h);
    expect(f.map((x) => x.role).sort()).toEqual(['background', 'brand', 'light']);
  });
  it('red & yellow design: background → red, white stays white (readable), lime → yellow', () => {
    const { px, w, h } = bankLogo();
    const plan = planColors(analyzeLogo(px, w, h), RED_YELLOW);
    const by = (r: string) => plan.find((x) => x.role === r)!.target;
    expect(by('background')).toEqual(hexToRgb('#C8102E'));
    expect(by('light')).toEqual([255, 255, 255]);
    expect(by('brand')).toEqual(hexToRgb('#FFC72C'));
    const out = recolorLogo(px, w, h, RED_YELLOW);
    expect(at(out, w, 2, 2)).toEqual([200, 16, 46, 255]);
    expect(at(out, w, 24, 25)).toEqual([255, 255, 255, 255]);
    expect(at(out, w, 30, 62)).toEqual([255, 199, 44, 255]);
    // the anti-aliased edge becomes the same blend between the NEW colours (no blue halo)
    const edge = at(out, w, 24, 50);
    expect(edge[2]!).toBeLessThan(200);
    expect(edge[0]!).toBeGreaterThan(200);
  });
  it('a light palette keeps the text readable: white text becomes dark on a pale primary', () => {
    const { px, w, h } = bankLogo();
    const pale = { primary: '#F5E6A3', accent: '#B45309', dark: '#1F2937' };
    const plan = planColors(analyzeLogo(px, w, h), pale);
    const bg = plan.find((x) => x.role === 'background')!.target;
    const text = plan.find((x) => x.role === 'light')!.target;
    expect(contrast(bg, text)).toBeGreaterThanOrEqual(2.6);
  });
  it('variants: transparent (background removed, white → primary), white mark, original untouched', () => {
    const { px, w, h } = bankLogo();
    const tr = recolorLogo(px, w, h, RED_YELLOW, 'transparent');
    expect(at(tr, w, 2, 2)[3]).toBe(0);
    expect(at(tr, w, 24, 25)).toEqual([200, 16, 46, 255]);
    const wh = recolorLogo(px, w, h, RED_YELLOW, 'white');
    expect(at(wh, w, 2, 2)[3]).toBe(0);
    expect(at(wh, w, 24, 25)).toEqual([255, 255, 255, 255]);
    expect(recolorLogo(px, w, h, RED_YELLOW, 'original')).toEqual(px);
  });
});

describe('logo fidelity: the drawing is never altered, only its colours', () => {
  it('a thin swoosh and its anti-aliased edges keep exactly their coverage (no halo, no lost stroke)', () => {
    const w = 120;
    const h = 60;
    const px = new Uint8ClampedArray(w * h * 4);
    const bg = [0, 92, 131];
    const lime = [140, 198, 63];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        // a 1-2 px curved swoosh « stretched backwards », drawn with soft edges, plus a lime filet
        const yc = 10 + ((x - 60) / 60) ** 2 * 12;
        const cov = Math.max(0, Math.min(1, 1.6 - Math.abs(y - yc)));
        const c = y >= 50 && y < 52 ? lime : bg.map((b) => Math.round(b + (255 - b) * cov));
        px.set([...c, 255], (y * w + x) * 4);
      }
    const out = recolorLogo(px, w, h, RED_YELLOW);
    for (let x = 0; x < w; x += 7) {
      for (let y = 0; y < 45; y++) {
        const o = (y * w + x) * 4;
        const covIn = (px[o]! - bg[0]!) / (255 - bg[0]!);
        const covOut = (out[o + 2]! - 46) / (255 - 46);
        expect(Math.abs(covIn - covOut)).toBeLessThan(0.06);
        // never tinted by the filet's colour on the swoosh edges
        expect(Math.abs(out[o + 1]! - (16 + (255 - 16) * covIn))).toBeLessThan(18);
      }
    }
  });
});

describe('logo placed in every deliverable', () => {
  const logo = { png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]), width: 200, height: 100 };
  const rows = [{ agence: 'Dakar', montant: 1250 }, { agence: 'Thies', montant: 430 }];
  const d = new DataCore();
  it('Excel (with and without a chart): a picture on the first sheet, charts kept; idempotent', () => {
    for (const chart of ['bar', 'none'] as const) {
      const x = d.exportRows(['agence', 'montant'], rows, 'xlsx', { title: 'Ventes', chart }) as Uint8Array;
      const out = addLogoToOffice('a.xlsx', x, logo)!;
      const z = unzipSync(out);
      expect(z['xl/media/massamba-logo.png']).toBeTruthy();
      const drawings = Object.keys(z).filter((k) => /^xl\/drawings\/[^/]+\.xml$/.test(k)).map((k) => strFromU8(z[k]!)).join('');
      expect(drawings).toContain('name="Logo"');
      if (chart === 'bar') expect(drawings).toContain('graphicFrame');
      expect(strFromU8(z['[Content_Types].xml']!)).toContain('Extension="png"');
      expect(addLogoToOffice('a.xlsx', out, logo)).toBeNull();
    }
  });
  it('Word: in the page header; PowerPoint: on every slide', () => {
    const w = unzipSync(addLogoToOffice('r.docx', markdownToDocx('# R\n\nTexte', 'R'), logo)!);
    expect(strFromU8(w['word/document.xml']!)).toMatch(/<w:headerReference w:type="default"/);
    expect(Object.keys(w).some((k) => /^word\/header[^/]*\.xml$/.test(k) && strFromU8(w[k]!).includes('massamba-logo.png'))).toBe(true);
    const p = unzipSync(addLogoToOffice('d.pptx', housePptx('# D\n\n## A\n\n- a\n\n## B\n\n- b', 'D'), logo)!);
    const slides = Object.keys(p).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
    expect(slides.length).toBeGreaterThan(1);
    for (const s of slides) expect(strFromU8(p[s]!)).toContain('name="Logo"');
  });
  it('HTML: inside the header band when there is one, else at the top; once', () => {
    const a = addLogoToHtml('<html><body><header class="band"><h1>T</h1></header></body></html>', 'data:image/png;base64,AA');
    expect(a).toMatch(/<header class="band"><img data-brand-logo/);
    expect(addLogoToHtml(a, 'data:x')).toBe(a);
    expect(addLogoToHtml('<html><body><p>x</p></body></html>', 'data:image/png;base64,AA')).toMatch(/<body><div data-brand-logo-wrap/);
  });
});
