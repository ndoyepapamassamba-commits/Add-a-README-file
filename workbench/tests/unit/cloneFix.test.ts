import { describe, expect, it } from 'vitest';
import { boxColors, colorPatches, emptyZones, panelFor, rankByScore, scoreTone } from '../../server/services/cloneFix';
import type { DashSpec, Panel } from '../../server/services/dashClone';

const W = 240;
const H = 160;
const img = (fill: [number, number, number]) => {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) px.set([...fill, 255], i * 4);
  return px;
};
const rect = (px: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.set([...c, 255], (y * W + x) * 4);
};
/** Bars of a chart: alternating coloured columns on white (texture the eye calls « content »). */
const bars = (px: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number) => {
  for (let x = x0; x < x1; x += 8) rect(px, x, y0 + ((x * 7) % (y1 - y0 - 4)), Math.min(x1, x + 4), y1, x % 16 ? [230, 30, 120] : [20, 180, 170]);
};
const panel = (box: Panel['box'], over: Partial<Panel> = {}): Panel => ({ ...panelFor(img([255, 255, 255]), W, H, box, 'bar'), colors: [], ramp: [], ...over });
const spec = (panels: Panel[]): DashSpec => ({ version: 1, aspect: W / H, outer: '#ffffff', frame: null, page: '#ffffff', pageBox: { x: 0, y: 0, w: 1, h: 1 }, title: null, panels, font: 'Segoe UI', palette: { primary: '#123456', accent: '#e61e78', dark: '#111111', series: ['#e61e78'] } });

describe('CONTRÔLEUR DE REPRODUCTION — espaces, couleurs, graphiques', () => {
  it('finds the space the reproduction left empty (content in the image, flat in the copy, outside every panel)', () => {
    const src = img([255, 255, 255]);
    bars(src, 10, 10, 110, 70); // covered by a panel
    bars(src, 130, 90, 230, 150); // NOT covered: the empty space of the screenshot
    const cur = img([255, 255, 255]);
    bars(cur, 10, 10, 110, 70);
    const z = emptyZones(src, cur, W, H, spec([panel({ x: 0, y: 0, w: 0.5, h: 0.5 })]));
    expect(z.length).toBeGreaterThanOrEqual(1);
    const b = z[0]!;
    expect(b.x).toBeGreaterThanOrEqual(0.5);
    expect(b.y).toBeGreaterThanOrEqual(0.5);
    expect(b.w * b.h).toBeGreaterThan(0.05);
  });
  it('a reproduction that is complete has no empty zone', () => {
    const src = img([255, 255, 255]);
    bars(src, 10, 10, 110, 70);
    expect(emptyZones(src, src, W, H, spec([]))).toEqual([]);
  });
  it('measures the fill and the series colours of a box (pink and teal bars on white)', () => {
    const src = img([255, 255, 255]);
    bars(src, 0, 0, W, H);
    const c = boxColors(src, W, H, { x: 0, y: 0, w: 1, h: 1 });
    expect(c.series.length).toBe(2);
    expect(c.series).toEqual(expect.arrayContaining(['#e61e78', '#14b4aa']));
  });
  it('a chart drawn without its colours gets colour patches measured on the image', () => {
    const src = img([255, 255, 255]);
    bars(src, 0, 0, 120, 80);
    const p = colorPatches(src, W, H, spec([panel({ x: 0, y: 0, w: 0.5, h: 0.5 })]));
    expect(p.length).toBe(1);
    expect(p[0]!.patch.colors!.length).toBe(2);
    expect(colorPatches(src, W, H, spec([panel({ x: 0, y: 0, w: 0.5, h: 0.5 }, { colors: ['#ff0000'] })]))).toEqual([]);
  });
  it('gallery: images reaching 95 % first, then by score, unscored last', () => {
    const items = [{ url: 'a' }, { url: 'b' }, { url: 'c' }, { url: 'd' }];
    expect(rankByScore(items, { a: 80, b: 97, d: 96 }).map((x) => x.url)).toEqual(['b', 'd', 'a', 'c']);
    expect(scoreTone(96, 95)).toBe('ok');
    expect(scoreTone(85, 95)).toBe('warn');
    expect(scoreTone(null, 95)).toBe('none');
  });
});

describe('LIGNES DE STRUCTURE (bordures, séparateurs) restaurées dans le fond', () => {
  it('copies back thin long card borders, never thick bars nor short marks', async () => {
    const { restoreLines } = await import('../../server/services/cloneFix');
    const src = img([252, 253, 254]);
    rect(src, 10, 20, 230, 23, [54, 89, 122]); // card border: 3 px, navy, long
    rect(src, 120, 30, 123, 150, [54, 89, 122]); // separator: vertical
    rect(src, 20, 100, 200, 112, [54, 89, 122]); // a bar of an hbar chart: 12 px thick → content
    rect(src, 20, 60, 30, 62, [54, 89, 122]); // a short mark → content
    const bg = img([252, 253, 254]);
    const n = restoreLines(src, bg, W, H, '#FCFDFE');
    const at = (x: number, y: number) => Array.from(bg.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
    expect(at(100, 21)).toEqual([54, 89, 122]);
    expect(at(121, 80)).toEqual([54, 89, 122]);
    expect(at(100, 106)).toEqual([252, 253, 254]);
    expect(at(25, 61)).toEqual([252, 253, 254]);
    expect(n).toBeGreaterThan(220 * 3);
    // A thin bar INSIDE a panel's data area is a chart mark: not restored.
    const src2 = img([252, 253, 254]);
    rect(src2, 40, 80, 200, 83, [54, 89, 122]);
    const bg2 = img([252, 253, 254]);
    restoreLines(src2, bg2, W, H, '#FCFDFE', { panels: [{ x: 0.1, y: 0.3, w: 0.8, h: 0.5 }] });
    expect(Array.from(bg2.slice((81 * W + 100) * 4, (81 * W + 100) * 4 + 3))).toEqual([252, 253, 254]);
  });
});
