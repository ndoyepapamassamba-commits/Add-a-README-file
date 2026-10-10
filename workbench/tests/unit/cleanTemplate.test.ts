import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { designVisionCandidates, visionCandidates } from '../../server/jev/vision/bridge';
import { cleanTemplate } from '../../server/services/cleanTemplate';
import { addNativeClone } from '../../server/services/cloneXlsx';
import { attachTexts, type DashSpec } from '../../server/services/dashClone';
import { cloneData, renderCloneSvg } from '../../server/services/dashRender';
import { houseXlsx } from '../../server/services/houseStyle';
import { restyleWorkbook } from '../../server/services/officeRestyle';
import { SPEC } from '../fixtures/dashSpec';
import type { ModelInfo } from '@shared/types';

/** Dark page with a vertical gradient, one white card holding a title, 4 bars and a thin dark text-like stroke. */
function image(w = 400, h = 300) {
  const px = new Uint8ClampedArray(w * h * 4);
  const set = (x: number, y: number, c: number[]) => px.set([...c, 255], (y * w + x) * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, [10, 40 + Math.round((y / h) * 30), 60]);
  for (let y = 60; y < 260; y++) for (let x = 40; x < 360; x++) set(x, y, [250, 250, 250]);
  // title glyph strokes (thin, dark) inside the card
  for (let k = 0; k < 6; k++) for (let y = 72; y < 84; y++) for (let x = 60 + k * 9; x < 62 + k * 9; x++) set(x, y, [20, 30, 50]);
  // bars (chart marks)
  [0, 1, 2, 3].forEach((i) => {
    for (let y = 250 - (i + 2) * 30; y < 250; y++) for (let x = 80 + i * 60; x < 110 + i * 60; x++) set(x, y, [0, 120, 200]);
  });
  return { px, w, h };
}
const at = (px: ArrayLike<number>, w: number, x: number, y: number) => [px[(y * w + x) * 4]!, px[(y * w + x) * 4 + 1]!, px[(y * w + x) * 4 + 2]!];

describe('CLEAN TEMPLATE — the image’s design without its content', () => {
  const { px, w, h } = image();
  const t = cleanTemplate(px, w, h, [{ x0: 40, y0: 60, x1: 360, y1: 260 }]);
  it('chart marks and text strokes inside the card are erased to the card background', () => {
    expect(at(t.bg, w, 95, 240)).toEqual([250, 250, 250]); // was a bar
    expect(at(t.bg, w, 61, 78).every((v, i) => Math.abs(v - [250, 250, 250][i]!) < 6)).toBe(true); // was a stroke
  });
  it('the page gradient and the card are kept pixel for pixel', () => {
    expect(at(t.bg, w, 5, 5)).toEqual(at(px, w, 5, 5));
    expect(at(t.bg, w, 5, 290)).toEqual(at(px, w, 5, 290));
    expect(at(t.bg, w, 200, 65)).toEqual([250, 250, 250]);
  });
  it('the panel box snaps to the card edges; the text line is found with its colour', () => {
    expect(t.snapped[0]).toEqual({ x0: 40, y0: 60, x1: 360, y1: 260 });
    const line = t.texts.find((x) => x.box.y0 >= 68 && x.box.y1 <= 90);
    expect(line).toBeTruthy();
    expect(line!.color).toBe('#141E32');
  });
});

describe('texts placed where the image had them', () => {
  it('panel title, KPI figure, main title, menu slots', () => {
    const spec: DashSpec = { ...SPEC, background: 'data:image/png;base64,AA', title: null };
    const W = 1000;
    const H = 1000 / SPEC.aspect;
    const box = (x: number, y: number, ww: number, hh: number) => ({ x0: x * W, y0: y * H, x1: (x + ww) * W, y1: (y + hh) * H });
    const out = attachTexts(
      { ...spec, panels: spec.panels.map((p, i) => (i === 6 ? { ...p, kind: 'filter' } : p)) },
      [
        { box: box(0.05, 0.02, 0.4, 0.05), color: '#0F172A', size: 0.05 * H }, // main title
        { box: box(0.06, 0.3, 0.12, 0.025), color: '#334155', size: 0.025 * H }, // bar panel title
        { box: box(0.36, 0.66, 0.1, 0.02), color: '#111111', size: 0.02 * H }, // hbar panel title
        { box: box(0.05, 0.13, 0.05, 0.02), color: '#FFFFFF', size: 0.02 * H }, // KPI label
        { box: box(0.05, 0.17, 0.12, 0.05), color: '#FFFFFF', size: 0.05 * H }, // KPI figure
        { box: box(0.05, 0.915, 0.1, 0.02), color: '#AABBCC', size: 0.02 * H }, // menu item
      ],
      W,
      H,
    );
    expect(out.title?.box.y).toBeCloseTo(0.02, 2);
    expect(out.panels[1]!.titleBox?.x).toBeCloseTo(0.06, 2);
    expect(out.panels[1]!.titleColor).toBe('#334155');
    expect(out.panels[0]!.valueBox?.h).toBeCloseTo(0.05, 2);
    expect(out.panels[6]!.slots?.length).toBe(1);
    const svg = renderCloneSvg(out, cloneData('Mon tableau', ['Agence', 'Montant'], [{ Agence: 'Dakar', Montant: 3 }, { Agence: 'Thiès', Montant: 2 }]), 1000);
    expect(svg).toContain('<image href="data:image/png;base64,AA"');
    expect(svg).toContain('Mon tableau');
    expect(svg).not.toContain(`fill="${SPEC.page}"`); // no flat page drawn over the design
  });
});

describe('Excel on the image’s design', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ Client: `C${i % 4}`, Segment: ['A', 'B'][i % 2]!, Montant: 1000 * (i + 1) }));
  const d = cloneData('Tableau', ['Client', 'Segment', 'Montant'], rows);
  it('the design picture is the backdrop; charts are native, transparent, titled by a text shape', () => {
    const spec = attachTexts({ ...SPEC, background: 'data:image/png;base64,iVBORw0KGgo=' }, [{ box: { x0: 40, y0: 160, x1: 160, y1: 175 }, color: '#334155', size: 15 }], 1000, 1000 / SPEC.aspect);
    const r = addNativeClone(houseXlsx(['Client', 'Segment', 'Montant'], rows, { title: 'T', chart: 'none' }), spec, d)!;
    const z = unzipSync(r.bytes);
    expect(z['xl/media/massamba-design.png']).toBeTruthy();
    const dr = strFromU8(z['xl/drawings/drawing-dash.xml']!);
    expect(dr.indexOf('name="Design')).toBeLessThan(dr.indexOf('<xdr:graphicFrame'));
    expect(dr).not.toContain('name="Page"'); // no flat page over the design
    expect(r.charts).toBeGreaterThanOrEqual(4);
  });
  it('the other sheets: Maison 2.0 in the image colours (header, zebra, title band, tab, no gridlines)', () => {
    const base = houseXlsx(['Client', 'Segment', 'Montant'], rows, { title: 'Analyse', chart: 'none' });
    const r = restyleWorkbook(base, { dark: '#0B2E35', primary: '#138A80', accent: '#2CC4B4', font: 'Poppins' })!;
    expect(r.sheets).toEqual(['Données']);
    const z = unzipSync(r.bytes);
    const st = strFromU8(z['xl/styles.xml']!);
    expect(st).toContain('FF138A80');
    expect(st).toContain('FF0B2E35');
    expect(st).toContain('Poppins');
    const sh = strFromU8(z['xl/worksheets/sheet1.xml']!);
    expect(sh).toContain('<tabColor rgb="FF138A80"/>');
    expect(sh).toContain('showGridLines="0"');
  });
});

describe('the design is read by the best box-locating vision model of the catalogue', () => {
  const m = (id: string, price: number, vision = true): ModelInfo => ({ id, name: id, provider: id.split('/')[0]!, contextLength: 128000, inputPrice: price, outputPrice: price, capabilities: { vision, tools: true, reasoning: false, json: true }, tags: [], free: price === 0 }) as unknown as ModelInfo;
  const models = [m('meta/llama-free-vision:free', 0), m('openai/gpt-6-luna', 0.000002), m('anthropic/claude-haiku-5.5', 0.000001), m('google/gemini-3-flash', 0.0000005), m('qwen/qwen3.8-omni-flash', 0.0000001, false)];
  it('Gemini first, then Claude, then GPT — paid models, never a free one first', () => {
    expect(designVisionCandidates(models)).toEqual(['google/gemini-3-flash', 'anthropic/claude-haiku-5.5', 'openai/gpt-6-luna']);
    expect(visionCandidates(models, null, new Set(), 'design')[0]).toBe('google/gemini-3-flash');
  });
  it('a model that refused is skipped', () => {
    expect(designVisionCandidates(models, new Set(['google/gemini-3-flash']))[0]).toBe('anthropic/claude-haiku-5.5');
  });
});
